from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import hashlib
import bcrypt
import os

# ═══════════════════════════════════════════════════════════════════════════════
# APP
# ═══════════════════════════════════════════════════════════════════════════════

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # React/Vite frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ═══════════════════════════════════════════════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════════════════════════════════════════════

DB_PATH = os.path.join(os.path.dirname(__file__), "voting.db")


def get_connection():
    return sqlite3.connect(DB_PATH, check_same_thread=False)


# Create tables
conn = get_connection()
init_cursor = conn.cursor()

init_cursor.executescript("""
CREATE TABLE IF NOT EXISTS voters (
    voter_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    has_voted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS eligible_hashes (
    hash_token TEXT PRIMARY KEY,
    voter_id TEXT NOT NULL,
    used INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    party TEXT,
    votes INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO candidates (id, name, party, votes) VALUES
(1, 'Arjun Sharma', 'Progressive Alliance', 0),
(2, 'Priya Kapoor', 'National Unity Party', 0),
(3, 'Rahul Verma', 'Democratic Front', 0);
""")

conn.commit()
conn.close()

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════════════


ADMIN_USER = "admin"
ADMIN_PASS = "admin@secure2024"

# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════


def make_eligibility_hash(voter_id: str, secret_key: str) -> str:
    raw = f"{voter_id}{secret_key}"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode(),
        bcrypt.gensalt()
    ).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(
        plain.encode(),
        hashed.encode()
    )


def admin_auth(token: str):
    expected = f"Basic {ADMIN_USER}:{ADMIN_PASS}"

    if token != expected:
        raise HTTPException(
            status_code=401,
            detail="Admin access denied."
        )


# ═══════════════════════════════════════════════════════════════════════════════
# MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class RegisterModel(BaseModel):
    voter_id: str
    name: str
    secret_key: str


class VoteModel(BaseModel):
    voter_id: str
    secret_key: str
    candidate_id: int


class ReRegisterModel(BaseModel):
    voter_id: str
    name: str
    new_secret_key: str


class AdminLogin(BaseModel):
    username: str
    password: str


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/")
def home():
    return {
        "message": "SecureVote API Running 🚀"
    }


@app.get("/candidates")
def get_candidates():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, name, party
        FROM candidates
    """)

    rows = cur.fetchall()

    conn.close()

    return [
        {
            "id": r[0],
            "name": r[1],
            "party": r[2]
        }
        for r in rows
    ]


@app.get("/results")
def get_results():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, name, party, votes
        FROM candidates
    """)

    rows = cur.fetchall()

    conn.close()

    return [
        {
            "id": r[0],
            "name": r[1],
            "party": r[2],
            "votes": r[3]
        }
        for r in rows
    ]


@app.get("/eligible-hashes")
def get_hashes():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT hash_token, used
        FROM eligible_hashes
    """)

    rows = cur.fetchall()

    conn.close()

    return [
        {
            "hash_token": r[0],
            "used": bool(r[1])
        }
        for r in rows
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# REGISTER
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/register")
def register(data: RegisterModel):

   

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT voter_id
        FROM voters
        WHERE voter_id = ?
    """, (data.voter_id,))

    existing = cur.fetchone()

    if existing:
        conn.close()

        raise HTTPException(
            status_code=409,
            detail="Voter already registered."
        )

    password_hash = hash_password(
        data.voter_id + data.secret_key
    )

    eligibility_hash = make_eligibility_hash(
    data.voter_id,
    data.secret_key
)

    cur.execute("""
        INSERT INTO voters (
            voter_id,
            name,
            password_hash,
            has_voted
        )
        VALUES (?, ?, ?, 0)
    """, (
        data.voter_id,
        data.name,
        password_hash
    ))

    cur.execute("""
        INSERT INTO eligible_hashes (
            hash_token,
            voter_id,
            used
        )
        VALUES (?, ?, 0)
    """, (
        eligibility_hash,
        data.voter_id
    ))

    conn.commit()
    conn.close()

    return {
        "message": "Registered successfully",
        "eligibility_hash": eligibility_hash
    }


# ═══════════════════════════════════════════════════════════════════════════════
# VOTE
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/vote")
def vote(data: VoteModel):

    

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT has_voted, password_hash
        FROM voters
        WHERE voter_id = ?
    """, (data.voter_id,))

    voter = cur.fetchone()

    if not voter:
        conn.close()

        raise HTTPException(
            status_code=404,
            detail="Voter not found."
        )

    if not verify_password(
        data.voter_id + data.secret_key,
        voter[1]
    ):
        conn.close()

        raise HTTPException(
            status_code=401,
            detail="Authentication failed."
        )

    if voter[0] == 1:
        conn.close()

        raise HTTPException(
            status_code=400,
            detail="You already voted."
        )

    eligibility_hash = make_eligibility_hash(
    data.voter_id,
    data.secret_key
)

    cur.execute("""
        SELECT used
        FROM eligible_hashes
        WHERE hash_token = ?
    """, (eligibility_hash,))

    token = cur.fetchone()

    if not token:
        conn.close()

        raise HTTPException(
            status_code=404,
            detail="Eligibility token not found."
        )

    if token[0] == 1:
        conn.close()

        raise HTTPException(
            status_code=400,
            detail="Token already used."
        )

    cur.execute("""
        SELECT id
        FROM candidates
        WHERE id = ?
    """, (data.candidate_id,))

    candidate = cur.fetchone()

    if not candidate:
        conn.close()

        raise HTTPException(
            status_code=404,
            detail="Candidate not found."
        )

    cur.execute("""
        UPDATE candidates
        SET votes = votes + 1
        WHERE id = ?
    """, (data.candidate_id,))

    cur.execute("""
        UPDATE voters
        SET has_voted = 1
        WHERE voter_id = ?
    """, (data.voter_id,))

    cur.execute("""
        UPDATE eligible_hashes
        SET used = 1
        WHERE hash_token = ?
    """, (eligibility_hash,))

    conn.commit()
    conn.close()

    return {
        "message": "Vote cast successfully 🗳️"
    }


# ═══════════════════════════════════════════════════════════════════════════════
# RE-REGISTER
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/re-register")
def re_register(data: ReRegisterModel):



    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT has_voted
        FROM voters
        WHERE voter_id = ?
    """, (data.voter_id,))

    existing = cur.fetchone()

    if not existing:
        conn.close()

        raise HTTPException(
            status_code=404,
            detail="Voter not found."
        )

    if existing[0] == 1:
        conn.close()

        raise HTTPException(
            status_code=403,
            detail="Already voted."
        )

    cur.execute("""
        DELETE FROM voters
        WHERE voter_id = ?
    """, (data.voter_id,))

    cur.execute("""
        DELETE FROM eligible_hashes
        WHERE voter_id = ?
    """, (data.voter_id,))

    new_password_hash = hash_password(
        data.voter_id + data.new_secret_key
    )

    new_hash = make_eligibility_hash(
    data.voter_id,
    data.new_secret_key
)

    cur.execute("""
        INSERT INTO voters (
            voter_id,
            name,
            password_hash,
            has_voted
        )
        VALUES (?, ?, ?, 0)
    """, (
        data.voter_id,
        data.name,
        new_password_hash
    ))

    cur.execute("""
        INSERT INTO eligible_hashes (
            hash_token,
            voter_id,
            used
        )
        VALUES (?, ?, 0)
    """, (
        new_hash,
        data.voter_id
    ))

    conn.commit()
    conn.close()

    return {
        "message": "Re-registered successfully",
        "eligibility_hash": new_hash
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/admin/login")
def admin_login(data: AdminLogin):

    if (
        data.username == ADMIN_USER
        and
        data.password == ADMIN_PASS
    ):
        return {
            "token": f"Basic {ADMIN_USER}:{ADMIN_PASS}",
            "message": "Admin authenticated"
        }

    raise HTTPException(
        status_code=401,
        detail="Invalid credentials."
    )


@app.get("/admin/voters")
def admin_voters(
    authorization: str = Header(...)
):
    admin_auth(authorization)

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT voter_id, name, has_voted
        FROM voters
        ORDER BY name
    """)

    rows = cur.fetchall()

    conn.close()

    return [
        {
            "voter_id": r[0],
            "name": r[1],
            "has_voted": bool(r[2])
        }
        for r in rows
    ]


@app.delete("/admin/voter/{voter_id}")
def delete_voter(
    voter_id: str,
    authorization: str = Header(...)
):
    admin_auth(authorization)

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT voter_id
        FROM voters
        WHERE voter_id = ?
    """, (voter_id,))

    existing = cur.fetchone()

    if not existing:
        conn.close()

        raise HTTPException(
            status_code=404,
            detail="Voter not found."
        )

    cur.execute("""
        DELETE FROM voters
        WHERE voter_id = ?
    """, (voter_id,))

    cur.execute("""
        DELETE FROM eligible_hashes
        WHERE voter_id = ?
    """, (voter_id,))

    conn.commit()
    conn.close()

    return {
        "message": f"{voter_id} deleted"
    }


@app.get("/admin/stats")
def admin_stats(
    authorization: str = Header(...)
):
    admin_auth(authorization)

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM voters")
    total_voters = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*)
        FROM voters
        WHERE has_voted = 1
    """)
    voted_count = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*)
        FROM eligible_hashes
    """)
    total_tokens = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*)
        FROM eligible_hashes
        WHERE used = 1
    """)
    used_tokens = cur.fetchone()[0]

    conn.close()

    return {
        "total_voters": total_voters,
        "voted_count": voted_count,
        "pending_count": total_voters - voted_count,
        "total_tokens": total_tokens,
        "used_tokens": used_tokens
    }


# ═══════════════════════════════════════════════════════════════════════════════
# RUN
# ═══════════════════════════════════════════════════════════════════════════════

# Run:
# uvicorn main:app --reload