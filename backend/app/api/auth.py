"""
User authentication — sign up / log in with email + password stored in MongoDB.
Passwords are SHA-256 + salt hashed. Sessions use signed HMAC tokens (30-day validity).
No external auth libraries required.
"""
import hmac
import hashlib
import os
import time
import asyncio
import httpx
from datetime import datetime

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.db.mongodb import get_db

router = APIRouter()

_SECRET = (settings.admin_password or "whatsagent-secret-key").encode()


async def _wake_evolution():
    """Background task to silently ping Evolution Go so it wakes up from free-tier sleep."""
    url = settings.evolution_api_url.rstrip("/")
    if not url:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.get(f"{url}/")
    except Exception:
        pass  # We don't care about the result, just waking it up


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

class LoginIn(BaseModel):
    email: str
    password: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/api/auth/login")
async def login(body: LoginIn):
    db = get_db()
    email = body.email.strip().lower()

    user = await db.users.find_one({"email": email})
    if not user or not _verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Ping Evolution Go to wake it up
    asyncio.create_task(_wake_evolution())

    token = _make_token(user["user_id"])
    return {"token": token, "name": user["name"], "email": user["email"]}
