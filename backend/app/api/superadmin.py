import logging
from uuid import uuid4
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db.mongodb import get_db
from app.api.auth import require_super_admin, _hash_password

router = APIRouter(prefix="/api/superadmin", dependencies=[Depends(require_super_admin)])
logger = logging.getLogger(__name__)


# ── Clients (Users) ──────────────────────────────────────────────────────────

class ClientIn(BaseModel):
    name: str
    email: str
    password: str


@router.get("/metrics")
async def get_metrics():
    """Fetch enterprise metrics: token usage and document storage tracking."""
    db = get_db()
    
    # 1. Token Tracking (Mocked or Real from token_usage_log)
    # We will simulate the last 7 days for the beautiful bar chart if empty
    import random
    from datetime import timedelta
    
    today = datetime.utcnow()
    usage_data = []
    
    real_logs = await db.token_usage_log.find().sort("date", -1).limit(30).to_list(None)
    for log in real_logs:
        usage_data.append({
            "date": log.get("date", "Unknown"),
            "tokens": log.get("tokens_used", 0),
            "cost": log.get("cost", 0.0),
            "clients": log.get("active_clients", 0),
            "tenants": log.get("active_tenants", 0)
        })
        
    # 2. Client & Tenant details
    clients = await db.users.find({"role": "CLIENT"}, {"password_hash": 0, "_id": 0}).to_list(None)
    
    for client in clients:
        client_created_at = client.get("created_at", datetime.utcnow())
        client_expire_at = client_created_at + timedelta(days=365) # Yearly renewal for agency
        client["register_day"] = client_created_at.strftime("%b %d, %Y")
        client["expire_day"] = client_expire_at.strftime("%b %d, %Y")
        
        client_tenants = await db.tenants.find({"client_id": client["user_id"]}, {"_id": 0}).to_list(None)
        client["tenant_count"] = len(client_tenants)
        
        tenants_data = []
        total_docs = 0
        total_client_tokens = 0
        
        for t in client_tenants:
            t_docs = await db.knowledge_docs.count_documents({"tenant_id": t["tenant_id"]})
            t_tokens = 0 # No fake data: set to 0 until actual LLM usage hook is built
            
            created_at = t.get("created_at", datetime.utcnow())
            expire_at = created_at + timedelta(days=30)
            days_remaining = (expire_at - datetime.utcnow()).days
            
            tenants_data.append({
                "tenant_id": t["tenant_id"],
                "name": t.get("name", "Unknown Bot"),
                "doc_count": t_docs,
                "tokens_used": t_tokens,
                "register_day": created_at.strftime("%b %d, %Y"),
                "expire_day": expire_at.strftime("%b %d, %Y"),
                "days_remaining": days_remaining if days_remaining > 0 else 0,
                "bill": round(t_tokens * 0.0001 + 49.99, 2), # Base plan + usage
                "rate_limit_per_minute": t.get("rate_limit_per_minute", 25),
                "retention_hours": t.get("retention_hours", 72)
            })
            total_docs += t_docs
            total_client_tokens += t_tokens
            
        client["tenants"] = tenants_data
        client["doc_count"] = total_docs
        client["tokens_used"] = total_client_tokens

    return {
        "usage_data": usage_data,
        "clients": clients,
        "total_documents": await db.knowledge_docs.count_documents({})
    }


@router.get("/clients")
async def list_clients():
    """List all CLIENT users."""
    db = get_db()
    clients = await db.users.find({"role": "CLIENT"}, {"password_hash": 0, "_id": 0}).to_list(None)
    return {"clients": clients}


@router.post("/clients")
async def create_client(body: ClientIn):
    """Create a new CLIENT user."""
    db = get_db()
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email already exists")

    user_id = str(uuid4())
    doc = {
        "user_id": user_id,
        "name": body.name,
        "email": email,
        "password_hash": _hash_password(body.password),
        "role": "CLIENT",
        "status": "ACTIVE",
        "created_at": datetime.utcnow()
    }
    await db.users.insert_one(doc)
    return {"ok": True, "user_id": user_id}


@router.put("/clients/{user_id}/status")
async def update_client_status(user_id: str, status: str):
    """Suspend or activate a CLIENT."""
    if status not in ("ACTIVE", "SUSPENDED"):
        raise HTTPException(400, "Invalid status")
    db = get_db()
    res = await db.users.update_one({"user_id": user_id}, {"$set": {"status": status}})
    if res.modified_count == 0:
        raise HTTPException(404, "Client not found or status unchanged")
    return {"ok": True}


@router.delete("/clients/{user_id}")
async def delete_client(user_id: str):
    """Permanently delete a client and all associated tenants, sessions, and data."""
    db = get_db()
    
    # 1. Ensure user is a client
    client = await db.users.find_one({"user_id": user_id, "role": "CLIENT"})
    if not client:
        raise HTTPException(404, "Client not found")
        
    # 2. Find all their tenants
    tenants = await db.tenants.find({"client_id": user_id}).to_list(None)
    tenant_ids = [t["tenant_id"] for t in tenants]
    
    # 3. Cascading delete
    if tenant_ids:
        await db.chat_sessions.delete_many({"tenant_id": {"$in": tenant_ids}})
        await db.message_audit_log.delete_many({"tenant_id": {"$in": tenant_ids}})
        await db.knowledge_docs.delete_many({"tenant_id": {"$in": tenant_ids}})
        await db.catalog.delete_many({"tenant_id": {"$in": tenant_ids}})
        await db.media_library.delete_many({"tenant_id": {"$in": tenant_ids}})
        await db.tenants.delete_many({"client_id": user_id})
        
    # 4. Delete the client user
    await db.users.delete_one({"user_id": user_id})
    return {"ok": True}
class TenantLimitsIn(BaseModel):
    rate_limit_per_minute: int
    retention_hours: int
    orders_enabled: bool | None = None
    order_requirements: list[str] | None = None
    returns_enabled: bool | None = None
    cancellations_enabled: bool | None = None

@router.put("/tenants/{tenant_id}/limits")
async def update_tenant_limits(tenant_id: str, body: TenantLimitsIn):
    """Update global rate limit, message retention, and order flow features for a specific tenant."""
    db = get_db()
    
    update_data = {
        "rate_limit_per_minute": body.rate_limit_per_minute,
        "retention_hours": body.retention_hours
    }
    if body.orders_enabled is not None:
        update_data["orders_enabled"] = body.orders_enabled
    if body.order_requirements is not None:
        update_data["order_requirements"] = body.order_requirements
    if body.returns_enabled is not None:
        update_data["returns_enabled"] = body.returns_enabled
    if body.cancellations_enabled is not None:
        update_data["cancellations_enabled"] = body.cancellations_enabled
        
    res = await db.tenants.update_one(
        {"tenant_id": tenant_id},
        {"$set": update_data}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Tenant not found")
    return {"ok": True}


# ── Platform Settings ────────────────────────────────────────────────────────

class SettingsIn(BaseModel):
    hero_video_url: str
    demo_video_url: str | None = None


@router.get("/settings")
async def get_settings():
    db = get_db()
    settings = await db.platform_settings.find_one({"id": "global"}, {"_id": 0})
    return {"settings": settings or {}}


@router.put("/settings")
async def update_settings(body: SettingsIn):
    db = get_db()
    update_data = {"hero_video_url": body.hero_video_url, "updated_at": datetime.utcnow()}
    if body.demo_video_url is not None:
        update_data["demo_video_url"] = body.demo_video_url
        
    await db.platform_settings.update_one(
        {"id": "global"},
        {"$set": update_data},
        upsert=True
    )
    return {"ok": True}

@router.get("/messages")
async def get_messages():
    """Fetch all contact form messages."""
    db = get_db()
    messages = await db.contact_messages.find({}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(None)
    return {"messages": messages}

# ── Global Settings (CMS) ──────────────────────────────────────────────────────────

class GlobalSettingsIn(BaseModel):
    master_system_prompt: str

@router.get("/global_settings")
async def get_global_settings():
    db = get_db()
    settings = await db.global_settings.find_one({"_id": "main"})
    if not settings:
        return {"master_system_prompt": ""}
    settings.pop("_id", None)
    return settings

@router.put("/global_settings")
async def update_global_settings(req: GlobalSettingsIn):
    db = get_db()
    await db.global_settings.update_one(
        {"_id": "main"},
        {"$set": {"master_system_prompt": req.master_system_prompt}},
        upsert=True
    )
    return {"status": "ok"}
