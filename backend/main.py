from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, field_validator
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import hashlib
import bcrypt
import os
import time
import secrets

# ── App Setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="SecureVote API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.getenv("DB_PATH", "securevote.db")

# Admin credentials (in production, move to env vars / hashed storage)
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin@secure2024")

# In-memory admin session tokens  {token: issued_at}
admin_sessions: dict[str, float] = {}
SESSION_TTL = 3600  # 1 hour

# ── Database ──────────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS voters (
            voter_id    TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            key_hash    TEXT NOT NULL,          -- bcrypt hash of secret_key
            has_voted   INTEGER NOT NULL DEFAULT 0,
            created_at  REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS eligibility_hashes (
            hash_token  TEXT PRIMARY KEY,        -- SHA-256(voter_id + secret_key)
            voter_id    TEXT NOT NULL,
            used        INTEGER NOT NULL DEFAULT 0,
            created_at  REAL NOT NULL,
            FOREIGN KEY (voter_id) REFERENCES voters(voter_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS candidates (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            name    TEXT NOT NULL,
            party   TEXT NOT NULL,
            symbol  TEXT NOT NULL DEFAULT '',
            votes   INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            action    TEXT NOT NULL,
            voter_id  TEXT,
            details   TEXT,
            ts        REAL NOT NULL
        );
        """)
        # Seed candidates if table is empty
        row = conn.execute("SELECT COUNT(*) as n FROM candidates").fetchone()
        if row["n"] == 0:
            conn.executemany(
                "INSERT INTO candidates (name, party, symbol) VALUES (?,?,?)",
                [
                    ("Aarav Sharma",   "Progressive Alliance",  "🌿"),
                    ("Priya Mehta",    "Democratic Front",      "🌊"),
                    ("Rohan Verma",    "National Unity Party",  "⚡"),
                    ("Sunita Patel",   "Green Future",          "🌱"),
                ],
            )


init_db()

# ── Helpers ───────────────────────────────────────────────────────────────────

def compute_hash(voter_id: str, secret_key: str) -> str:
    return hashlib.sha256(f"{voter_id}{secret_key}".encode()).hexdigest()


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def log_event(action: str, voter_id: str | None, details: str | None):
    with get_db() as conn:
        conn.execute(
            "INSERT INTO audit_log (action, voter_id, details, ts) VALUES (?,?,?,?)",
            (action, voter_id, details, time.time()),
        )


def require_admin(authorization: str | None) -> None:
    if not authorization or authorization not in admin_sessions:
        raise HTTPException(status_code=401, detail="Unauthorized")
    issued = admin_sessions[authorization]
    if time.time() - issued > SESSION_TTL:
        del admin_sessions[authorization]
        raise HTTPException(status_code=401, detail="Session expired")


# ── Pydantic Models ───────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    voter_id: str
    name: str
    secret_key: str

    @field_validator("voter_id")
    @classmethod
    def voter_id_clean(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("voter_id cannot be empty")
        return v

    @field_validator("name")
    @classmethod
    def name_clean(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name cannot be empty")
        return v

    @field_validator("secret_key")
    @classmethod
    def key_min_length(cls, v: str) -> str:
        if len(v) < 4:
            raise ValueError("secret_key must be at least 4 characters")
        return v


class VoteRequest(BaseModel):
    voter_id: str
    secret_key: str
    candidate_id: int


class ReRegisterRequest(BaseModel):
    voter_id: str
    name: str
    new_secret_key: str

    @field_validator("new_secret_key")
    @classmethod
    def key_min_length(cls, v: str) -> str:
        if len(v) < 4:
            raise ValueError("new_secret_key must be at least 4 characters")
        return v


class AdminLoginRequest(BaseModel):
    username: str
    password: str


# ── Public Endpoints ──────────────────────────────────────────────────────────

@app.get("/candidates")
def list_candidates():
    with get_db() as conn:
        rows = conn.execute("SELECT id, name, party, symbol, votes FROM candidates ORDER BY id").fetchall()
    return [dict(r) for r in rows]


@app.get("/results")
def get_results():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name, party, symbol, votes FROM candidates ORDER BY votes DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/eligible-hashes")
def eligible_hashes():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT hash_token, used, created_at FROM eligibility_hashes ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/audit/verify/{token}")
def verify_token(token: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT used FROM eligibility_hashes WHERE hash_token = ?", (token,)
        ).fetchone()
    if row is None:
        return {"found": False, "used": False}
    return {"found": True, "used": bool(row["used"])}


# ── Voter Endpoints ───────────────────────────────────────────────────────────

@app.post("/register")
def register(req: RegisterRequest):
    token = compute_hash(req.voter_id, req.secret_key)
    key_hash = hash_password(req.secret_key)
    now = time.time()

    with get_db() as conn:
        # Check duplicate voter_id
        existing = conn.execute(
            "SELECT voter_id FROM voters WHERE voter_id = ?", (req.voter_id,)
        ).fetchone()
        if existing:
            log_event("REGISTER_FAIL", req.voter_id, "Voter ID already registered")
            raise HTTPException(status_code=409, detail="Voter ID already registered")

        conn.execute(
            "INSERT INTO voters (voter_id, name, key_hash, has_voted, created_at) VALUES (?,?,?,0,?)",
            (req.voter_id, req.name, key_hash, now),
        )
        conn.execute(
            "INSERT INTO eligibility_hashes (hash_token, voter_id, used, created_at) VALUES (?,?,0,?)",
            (token, req.voter_id, now),
        )

    log_event("REGISTER_OK", req.voter_id, f"Name: {req.name}")
    return {"eligibility_hash": token, "voter_id": req.voter_id}


@app.post("/vote")
def cast_vote(req: VoteRequest):
    with get_db() as conn:
        voter = conn.execute(
            "SELECT key_hash, has_voted FROM voters WHERE voter_id = ?", (req.voter_id,)
        ).fetchone()

        if voter is None:
            log_event("VOTE_FAIL", req.voter_id, "Voter not found")
            raise HTTPException(status_code=404, detail="Voter not registered")

        if not verify_password(req.secret_key, voter["key_hash"]):
            log_event("VOTE_FAIL", req.voter_id, "Invalid secret key")
            raise HTTPException(status_code=403, detail="Invalid secret key")

        if voter["has_voted"]:
            log_event("VOTE_FAIL", req.voter_id, "Already voted")
            raise HTTPException(status_code=409, detail="You have already voted")

        candidate = conn.execute(
            "SELECT id, name FROM candidates WHERE id = ?", (req.candidate_id,)
        ).fetchone()
        if candidate is None:
            raise HTTPException(status_code=404, detail="Candidate not found")

        token = compute_hash(req.voter_id, req.secret_key)
        hash_row = conn.execute(
            "SELECT used FROM eligibility_hashes WHERE hash_token = ?", (token,)
        ).fetchone()
        if hash_row is None or hash_row["used"]:
            log_event("VOTE_FAIL", req.voter_id, "Token already used or missing")
            raise HTTPException(status_code=409, detail="Eligibility token already used or not found")

        # Record the vote atomically
        conn.execute("UPDATE candidates SET votes = votes + 1 WHERE id = ?", (req.candidate_id,))
        conn.execute("UPDATE voters SET has_voted = 1 WHERE voter_id = ?", (req.voter_id,))
        conn.execute(
            "UPDATE eligibility_hashes SET used = 1 WHERE hash_token = ?", (token,)
        )

    log_event("VOTE_OK", req.voter_id, f"Voted for candidate_id={req.candidate_id} ({candidate['name']})")
    return {"message": "Vote cast successfully"}


@app.post("/re-register")
def re_register(req: ReRegisterRequest):
    with get_db() as conn:
        voter = conn.execute(
            "SELECT name, has_voted FROM voters WHERE voter_id = ?", (req.voter_id,)
        ).fetchone()

        if voter is None:
            raise HTTPException(status_code=404, detail="Voter not found")

        if voter["name"].strip().lower() != req.name.strip().lower():
            log_event("REREG_FAIL", req.voter_id, "Name mismatch")
            raise HTTPException(status_code=403, detail="Name does not match records")

        if voter["has_voted"]:
            log_event("REREG_FAIL", req.voter_id, "Already voted — re-register blocked")
            raise HTTPException(status_code=409, detail="Cannot re-register after voting")

        new_token = compute_hash(req.voter_id, req.new_secret_key)
        new_key_hash = hash_password(req.new_secret_key)
        now = time.time()

        # Invalidate old token, insert new one, update key hash
        conn.execute(
            "DELETE FROM eligibility_hashes WHERE voter_id = ?", (req.voter_id,)
        )
        conn.execute(
            "UPDATE voters SET key_hash = ? WHERE voter_id = ?", (new_key_hash, req.voter_id)
        )
        conn.execute(
            "INSERT INTO eligibility_hashes (hash_token, voter_id, used, created_at) VALUES (?,?,0,?)",
            (new_token, req.voter_id, now),
        )

    log_event("REREG_OK", req.voter_id, "Re-registration successful")
    return {"eligibility_hash": new_token, "voter_id": req.voter_id}


# ── Admin Endpoints ───────────────────────────────────────────────────────────

@app.post("/admin/login")
def admin_login(req: AdminLoginRequest):
    if req.username != ADMIN_USERNAME or req.password != ADMIN_PASSWORD:
        log_event("ADMIN_LOGIN_FAIL", None, f"username={req.username}")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = secrets.token_hex(32)
    admin_sessions[token] = time.time()
    log_event("ADMIN_LOGIN_OK", None, f"username={req.username}")
    return {"token": token}


@app.get("/admin/voters")
def admin_voters(authorization: str | None = Header(default=None)):
    require_admin(authorization)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT voter_id, name, has_voted, created_at FROM voters ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/admin/stats")
def admin_stats(authorization: str | None = Header(default=None)):
    require_admin(authorization)
    with get_db() as conn:
        total_voters = conn.execute("SELECT COUNT(*) as n FROM voters").fetchone()["n"]
        voted_count  = conn.execute("SELECT COUNT(*) as n FROM voters WHERE has_voted=1").fetchone()["n"]
        total_tokens = conn.execute("SELECT COUNT(*) as n FROM eligibility_hashes").fetchone()["n"]
        used_tokens  = conn.execute("SELECT COUNT(*) as n FROM eligibility_hashes WHERE used=1").fetchone()["n"]

    pending_count = total_voters - voted_count
    turnout_pct = round(voted_count / total_voters * 100, 1) if total_voters else 0.0

    return {
        "total_voters": total_voters,
        "voted_count": voted_count,
        "pending_count": pending_count,
        "turnout_pct": turnout_pct,
        "total_tokens": total_tokens,
        "used_tokens": used_tokens,
    }


@app.get("/admin/audit-log")
def audit_log(authorization: str | None = Header(default=None)):
    require_admin(authorization)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT action, voter_id, details, ts FROM audit_log ORDER BY ts DESC LIMIT 100"
        ).fetchall()
    return [dict(r) for r in rows]


@app.delete("/admin/voter/{voter_id}")
def delete_voter(voter_id: str, authorization: str | None = Header(default=None)):
    require_admin(authorization)
    with get_db() as conn:
        row = conn.execute("SELECT voter_id FROM voters WHERE voter_id = ?", (voter_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Voter not found")
        # CASCADE will also delete their eligibility hash
        conn.execute("DELETE FROM voters WHERE voter_id = ?", (voter_id,))

    log_event("ADMIN_DELETE_VOTER", voter_id, "Deleted by admin")
    return {"message": f"Voter {voter_id} deleted"}


@app.post("/admin/reset-election")
def reset_election(authorization: str | None = Header(default=None)):
    require_admin(authorization)
    with get_db() as conn:
        conn.execute("UPDATE candidates SET votes = 0")
        conn.execute("UPDATE voters SET has_voted = 0")
        conn.execute("UPDATE eligibility_hashes SET used = 0")

    log_event("ADMIN_RESET_ELECTION", None, "All votes cleared, all tokens reactivated")
    return {"message": "Election reset successfully"}