from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import hashlib
import bcrypt
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB ──────────────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "voting.db")
conn = sqlite3.connect(DB_PATH, check_same_thread=False)
cursor = conn.cursor()

cursor.executescript("""
CREATE TABLE IF NOT EXISTS voters (
    voter_id   TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    has_voted  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS eligible_hashes (
    hash_token TEXT PRIMARY KEY,
    voter_id   TEXT NOT NULL,
    used       INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS candidates (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT,
    party TEXT,
    votes INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO candidates (id, name, party, votes) VALUES
  (1,'Arjun Sharma','Progressive Alliance',0),
  (2,'Priya Kapoor','National Unity Party',0),
  (3,'Rahul Verma','Democratic Front',0);
""")
conn.commit()

# ── Helpers ──────────────────────────────────────────────────────────────────
SECRET_KEY = "KB1234"
ADMIN_USER = "admin"
ADMIN_PASS = "admin@secure2024"

def make_eligibility_hash(voter_id: str, secret_key: str = SECRET_KEY) -> str:
    """SHA-256(voterId + secretKey) — same inputs always yield same hash."""
    raw = f"{voter_id}{secret_key}"
    return hashlib.sha256(raw.encode()).hexdigest()

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

# ── Models ───────────────────────────────────────────────────────────────────
class RegisterModel(BaseModel):
    voter_id: str
    name: str
    secret_key: str          # must be "KB1234"

class VoteModel(BaseModel):
    voter_id: str
    secret_key: str
    candidate_id: int

class DeleteAndRecreateModel(BaseModel):
    voter_id: str
    name: str
    new_secret_key: str      # must be "KB1234"

class AdminLogin(BaseModel):
    username: str
    password: str

# ── Public ───────────────────────────────────────────────────────────────────
@app.get("/eligible-hashes")
def get_eligible_hashes():
    """Publicly viewable eligibility tokens (no personal info)."""
    cursor.execute("SELECT hash_token, used FROM eligible_hashes")
    rows = cursor.fetchall()
    return [{"hash_token": r[0], "used": bool(r[1])} for r in rows]

@app.get("/results")
def results():
    cursor.execute("SELECT id, name, party, votes FROM candidates")
    rows = cursor.fetchall()
    return [{"id": r[0], "name": r[1], "party": r[2], "votes": r[3]} for r in rows]

@app.get("/candidates")
def candidates():
    cursor.execute("SELECT id, name, party FROM candidates")
    rows = cursor.fetchall()
    return [{"id": r[0], "name": r[1], "party": r[2]} for r in rows]

# ── Voter Registration ────────────────────────────────────────────────────────
@app.post("/register")
def register(data: RegisterModel):
    if data.secret_key != SECRET_KEY:
        raise HTTPException(status_code=400, detail="Invalid secret key. Contact election office.")

    # Check if voter_id already registered
    cursor.execute("SELECT has_voted FROM voters WHERE voter_id=?", (data.voter_id,))
    existing = cursor.fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="Voter ID already registered. Use re-register if you haven't voted.")

    # Hash the password (stored credential)
    pwd_hash = hash_password(data.voter_id + data.secret_key)

    # Create eligibility hash = SHA256(voterId + secretKey)
    elig_hash = make_eligibility_hash(data.voter_id)

    cursor.execute(
        "INSERT INTO voters (voter_id, name, password_hash, has_voted) VALUES (?,?,?,0)",
        (data.voter_id, data.name, pwd_hash)
    )
    cursor.execute(
        "INSERT OR REPLACE INTO eligible_hashes (hash_token, voter_id, used) VALUES (?,?,0)",
        (elig_hash, data.voter_id)
    )
    conn.commit()
    return {
        "message": "Registered successfully",
        "eligibility_hash": elig_hash,
        "note": "Your eligibility token is publicly stored. Keep your secret key safe."
    }

# ── Vote ──────────────────────────────────────────────────────────────────────
@app.post("/vote")
def vote(data: VoteModel):
    if data.secret_key != SECRET_KEY:
        raise HTTPException(status_code=400, detail="Invalid secret key.")

    cursor.execute("SELECT has_voted, password_hash FROM voters WHERE voter_id=?", (data.voter_id,))
    voter = cursor.fetchone()
    if not voter:
        raise HTTPException(status_code=404, detail="Voter ID not found.")

    # Verify credential: hash(voterId + secretKey) must match stored
    if not verify_password(data.voter_id + data.secret_key, voter[1]):
        raise HTTPException(status_code=401, detail="Authentication failed.")

    if voter[0] == 1:
        raise HTTPException(status_code=400, detail="You have already voted.")

    # Check eligible hash (same formula, so same result)
    elig_hash = make_eligibility_hash(data.voter_id)
    cursor.execute("SELECT used FROM eligible_hashes WHERE hash_token=?", (elig_hash,))
    elig = cursor.fetchone()
    if not elig:
        raise HTTPException(status_code=403, detail="Eligibility token not found.")
    if elig[0] == 1:
        raise HTTPException(status_code=400, detail="Eligibility token already consumed.")

    cursor.execute("SELECT id FROM candidates WHERE id=?", (data.candidate_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Candidate not found.")

    # Mark vote & update eligibility token
    cursor.execute("UPDATE candidates SET votes=votes+1 WHERE id=?", (data.candidate_id,))
    cursor.execute("UPDATE voters SET has_voted=1 WHERE voter_id=?", (data.voter_id,))
    cursor.execute("UPDATE eligible_hashes SET used=1 WHERE hash_token=?", (elig_hash,))
    conn.commit()

    return {"message": "Vote cast successfully! Thank you for participating."}

# ── Re-Register (delete + recreate if not voted) ─────────────────────────────
@app.post("/re-register")
def re_register(data: DeleteAndRecreateModel):
    if data.new_secret_key != SECRET_KEY:
        raise HTTPException(status_code=400, detail="Invalid secret key.")

    cursor.execute("SELECT has_voted FROM voters WHERE voter_id=?", (data.voter_id,))
    existing = cursor.fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Voter ID not found.")
    if existing[0] == 1:
        raise HTTPException(status_code=403, detail="Cannot re-register: you have already voted.")

    # Delete old records
    old_hash = make_eligibility_hash(data.voter_id)
    cursor.execute("DELETE FROM voters WHERE voter_id=?", (data.voter_id,))
    cursor.execute("DELETE FROM eligible_hashes WHERE voter_id=?", (data.voter_id,))

    # Create new
    pwd_hash = hash_password(data.voter_id + data.new_secret_key)
    new_hash = make_eligibility_hash(data.voter_id)
    cursor.execute(
        "INSERT INTO voters (voter_id, name, password_hash, has_voted) VALUES (?,?,?,0)",
        (data.voter_id, data.name, pwd_hash)
    )
    cursor.execute(
        "INSERT INTO eligible_hashes (hash_token, voter_id, used) VALUES (?,?,0)",
        (new_hash, data.voter_id)
    )
    conn.commit()
    return {"message": "Re-registered successfully.", "eligibility_hash": new_hash}

# ── Admin ─────────────────────────────────────────────────────────────────────
def admin_auth(token: str):
    if token != f"Basic {ADMIN_USER}:{ADMIN_PASS}":
        raise HTTPException(status_code=401, detail="Admin access denied.")

@app.post("/admin/login")
def admin_login(data: AdminLogin):
    if data.username == ADMIN_USER and data.password == ADMIN_PASS:
        return {"token": f"Basic {ADMIN_USER}:{ADMIN_PASS}", "message": "Welcome, Admin"}
    raise HTTPException(status_code=401, detail="Invalid admin credentials.")

@app.get("/admin/voters")
def admin_voters(authorization: str = Header(...)):
    admin_auth(authorization)
    cursor.execute("SELECT voter_id, name, has_voted FROM voters ORDER BY name")
    rows = cursor.fetchall()
    return [{"voter_id": r[0], "name": r[1], "has_voted": bool(r[2])} for r in rows]

@app.delete("/admin/voter/{voter_id}")
def admin_delete_voter(voter_id: str, authorization: str = Header(...)):
    admin_auth(authorization)
    cursor.execute("SELECT voter_id FROM voters WHERE voter_id=?", (voter_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Voter not found.")
    cursor.execute("DELETE FROM voters WHERE voter_id=?", (voter_id,))
    cursor.execute("DELETE FROM eligible_hashes WHERE voter_id=?", (voter_id,))
    conn.commit()
    return {"message": f"Voter {voter_id} deleted."}

@app.get("/admin/stats")
def admin_stats(authorization: str = Header(...)):
    admin_auth(authorization)
    cursor.execute("SELECT COUNT(*) FROM voters")
    total = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM voters WHERE has_voted=1")
    voted = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM eligible_hashes")
    tokens = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM eligible_hashes WHERE used=1")
    used_tokens = cursor.fetchone()[0]
    return {
        "total_voters": total,
        "voted_count": voted,
        "pending_count": total - voted,
        "total_tokens": tokens,
        "used_tokens": used_tokens
    }
