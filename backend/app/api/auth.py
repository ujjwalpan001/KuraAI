"""
User authentication — sign up / log in with email + password stored in MongoDB.
Passwords are SHA-256 + salt hashed. Sessions use signed HMAC tokens (30-day validity).
No external auth libraries required.
"""
import hmac
import hashlib
import os
import time
from datetime import datetime

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.db.mongodb import get_db

router = APIRouter()

_SECRET = (settings.admin_password or "whatsagent-secret-key").encode()


# ── Password helpers ───────────────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    h = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return f"{salt}:{h}"


def _verify_password(password: str, hashed: str) -> bool:
    try:
        salt, h = hashed.split(":", 1)
        return hmac.compare_digest(
            hashlib.sha256(f"{salt}{password}".encode()).hexdigest(), h
        )
    except Exception:
        return False


# ── Token helpers ─────────────────────────────────────────────────────────────

def _make_token(user_id: str) -> str:
    issued = str(int(time.time()))
    payload = f"{issued}:{user_id}"
    sig = hmac.new(_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def verify_token(token: str) -> str | None:
    """Returns user_id if valid, None otherwise."""
    try:
        payload, sig = token.rsplit(".", 1)
        expected = hmac.new(_SECRET, payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        issued_str, user_id = payload.split(":", 1)
        if time.time() - int(issued_str) > 30 * 86400:  # 30-day validity
            return None
        return user_id
    except Exception:
        return None


def require_admin(authorization: str = Header(default="")):
    """FastAPI dependency — raises 401 unless a valid bearer token is present."""
    token = authorization.replace("Bearer ", "").strip()
    if not verify_token(token):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return True


# ── Request/Response models ───────────────────────────────────────────────────

class SignupIn(BaseModel):
    name: str
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/api/auth/signup")
async def signup(body: SignupIn):
    name = body.name.strip()
    email = body.email.strip().lower()
    password = body.password

    if not name or not email or len(password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Name, email, and a password of at least 6 characters are required"
        )

    db = get_db()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user_id = f"user_{int(time.time())}_{email.split('@')[0]}"

    await db.users.insert_one({
        "user_id": user_id,
        "name": name,
        "email": email,
        "password_hash": _hash_password(password),
        "created_at": datetime.utcnow(),
    })

    token = _make_token(user_id)
    return {"token": token, "name": name, "email": email}


@router.post("/api/auth/login")
async def login(body: LoginIn):
    db = get_db()
    email = body.email.strip().lower()

    user = await db.users.find_one({"email": email})
    if not user or not _verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = _make_token(user["user_id"])
    return {"token": token, "name": user["name"], "email": user["email"]}
