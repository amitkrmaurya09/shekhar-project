# 🗳️ SecureVote — Cryptographic Electoral System

## Architecture Overview

### Security Model
```
Registration:  SHA-256(VoterID + "KB1234") → eligibility_hash  [stored publicly]
               bcrypt(VoterID + "KB1234")  → password_hash     [stored in DB, private]

Voting:        SHA-256(VoterID + "KB1234") → same hash → verified → marked USED
               bcrypt verify(VoterID + secretKey, stored_hash) → authenticated
```

The key insight: **same inputs always produce same SHA-256 hash**, so no secret is stored in the eligibility table — anyone can verify an election is legitimate without seeing any private data.

## Tables

| Table | Purpose | Public? |
|-------|---------|---------|
| `voters` | voter_id, name, password_hash, has_voted | Admin only (name+id, no secret) |
| `eligible_hashes` | hash_token, voter_id, used | **Fully public** |
| `candidates` | id, name, party, votes | Public |

## API Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | /register | None | Register voter (needs secret key KB1234) |
| POST | /vote | None (uses hash auth) | Cast vote |
| POST | /re-register | None | Delete + recreate if not yet voted |
| GET | /eligible-hashes | None | View all public tokens |
| GET | /results | None | Live vote counts |
| GET | /candidates | None | Candidate list |
| POST | /admin/login | Credentials | Admin authentication |
| GET | /admin/voters | Admin token | View name + voter_id only |
| DELETE | /admin/voter/{id} | Admin token | Delete voter record |
| GET | /admin/stats | Admin token | Dashboard statistics |

## Credentials

- **Election Secret Key**: `KB1234` (same for all — given to voters by election office)
- **Admin Username**: `admin`
- **Admin Password**: `admin@secure2024`

## Starting

```bash
chmod +x START.sh && ./START.sh
```

Or manually:
```bash
# Terminal 1 - Backend
cd voting-backend
pip install fastapi uvicorn "passlib[bcrypt]"
uvicorn main:app --reload

# Terminal 2 - Frontend
cd frontend
npm install
npm run dev
```

## Flow Diagram

```
User Registration:
  VoterID + KB1234 ──► SHA256 ──► eligibility_hash ──► eligible_hashes table (PUBLIC)
                   └──► bcrypt ──► password_hash ──► voters table (PRIVATE)

User Voting:
  VoterID + KB1234 ──► SHA256 ──► look up hash ──► mark used ──► vote recorded
                   └──► bcrypt verify ──► authenticate user

Forgot Key (pre-vote only):
  Delete old voter record + hash → re-register fresh on same VoterID
```
