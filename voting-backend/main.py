from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import sqlite3

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow all (for development)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# DB connection
conn = sqlite3.connect("voting.db", check_same_thread=False)
cursor = conn.cursor()

# Create tables
cursor.execute("""
CREATE TABLE IF NOT EXISTS voters (
    name TEXT PRIMARY KEY,
    age INTEGER,
    secret_code TEXT,
    has_voted INTEGER DEFAULT 0
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    votes INTEGER DEFAULT 0
)
""")

# Insert default candidates
cursor.execute("INSERT OR IGNORE INTO candidates (id, name, votes) VALUES (1,'A',0)")
cursor.execute("INSERT OR IGNORE INTO candidates (id, name, votes) VALUES (2,'B',0)")
conn.commit()


# Models
class Register(BaseModel):
    name: str
    age: int
    secret_code: str

class Vote(BaseModel):
    name: str
    secret_code: str
    candidate_id: int


# Register voter
@app.post("/register")
def register(data: Register):
    try:
        cursor.execute(
            "INSERT INTO voters (name, age, secret_code) VALUES (?, ?, ?)",
            (data.name, data.age, data.secret_code)
        )
        conn.commit()
        return {"message": "Registered successfully"}
    except:
        raise HTTPException(status_code=400, detail="User already exists")


# Vote
@app.post("/vote")
def vote(data: Vote):
    cursor.execute("SELECT * FROM voters WHERE name=?", (data.name,))
    voter = cursor.fetchone()

    if not voter:
        raise HTTPException(status_code=404, detail="User not found")

    if voter[2] != data.secret_code:
        raise HTTPException(status_code=401, detail="Invalid secret code")

    if voter[3] == 1:
        raise HTTPException(status_code=400, detail="Already voted")

    # Update vote
    cursor.execute("UPDATE candidates SET votes = votes + 1 WHERE id=?", (data.candidate_id,))
    cursor.execute("UPDATE voters SET has_voted = 1 WHERE name=?", (data.name,))
    conn.commit()

    return {"message": "Vote casted successfully"}


# Results
@app.get("/results")
def results():
    cursor.execute("SELECT name, votes FROM candidates")
    data = cursor.fetchall()
    return [{"name": d[0], "votes": d[1]} for d in data]