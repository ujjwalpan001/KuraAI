from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends
from app.api.auth import require_user
from pydantic import BaseModel
from app.db.mongodb import get_db
from app.whatsapp.client import send_text_message
from app.config import settings

router = APIRouter()


@router.get("/api/tenants")
async def list_tenants(user: dict = Depends(require_user)):
    db = get_db()
    query = {}
    if user.get("role") != "SUPER_ADMIN":
        query["client_id"] = user["user_id"]
        
    tenants = await db.tenants.find(
        query, {"_id": 0}
    ).to_list(None)
    return {"tenants": tenants}


@router.get("/api/tenants/{tenant_id}/sessions")
async def list_sessions(tenant_id: str, user: dict = Depends(require_user)):
    db = get_db()
    
    if user.get("role") != "SUPER_ADMIN":
        tenant = await db.tenants.find_one({"tenant_id": tenant_id})
        if not tenant or tenant.get("client_id") != user["user_id"]:
            raise HTTPException(403, "Not authorized to access this tenant")
            
    sessions = await db.chat_sessions.find(
        {"tenant_id": tenant_id}, {"_id": 0}
    ).sort("last_message_at", -1).to_list(None)

    # Convert datetime to ISO string for JSON
    for s in sessions:
        for field in ("last_message_at", "created_at"):
            if s.get(field):
                s[field] = s[field].isoformat()

    return {"sessions": sessions}


@router.get("/api/sessions/{session_id}/messages")
async def list_messages(session_id: str, user: dict = Depends(require_user)):
    db = get_db()
    
    session = await db.chat_sessions.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(404, "Session not found")
        
    if user.get("role") != "SUPER_ADMIN":
        tenant = await db.tenants.find_one({"tenant_id": session["tenant_id"]})
        if not tenant or tenant.get("client_id") != user["user_id"]:
            raise HTTPException(403, "Not authorized to access this session")
            
    messages = await db.message_audit_log.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("timestamp", 1).to_list(None)

    for m in messages:
        if m.get("timestamp"):
            m["timestamp"] = m["timestamp"].isoformat()

    return {"messages": messages}


@router.get("/api/tenants/{tenant_id}/stats")
async def tenant_stats(tenant_id: str, user: dict = Depends(require_user)):
    db = get_db()
    
    if user.get("role") != "SUPER_ADMIN":
        tenant = await db.tenants.find_one({"tenant_id": tenant_id})
        if not tenant or tenant.get("client_id") != user["user_id"]:
            raise HTTPException(403, "Not authorized to access this tenant")
            
    total = await db.chat_sessions.count_documents({"tenant_id": tenant_id})
    resolved = await db.chat_sessions.count_documents({"tenant_id": tenant_id, "status": "RESOLVED"})
    needs_human = await db.chat_sessions.count_documents({"tenant_id": tenant_id, "status": "NEEDS_HUMAN"})
    active = await db.chat_sessions.count_documents({"tenant_id": tenant_id, "status": "AGENT_RESPONDING"})
    return {
        "total_sessions": total,
        "resolved": resolved,
        "needs_human": needs_human,
        "active": active,
    }


class StatusUpdate(BaseModel):
    status: str  # WAITING_FOR_BOT | AGENT_RESPONDING | RESOLVED | NEEDS_HUMAN


@router.post("/api/sessions/{session_id}/status")
async def set_session_status(session_id: str, body: StatusUpdate):
    """
    Let the business owner act on a conversation:
    - 'RESOLVED'        → mark handled (closes it)
    - 'NEEDS_HUMAN'     → take it over (bot halts)
    - 'WAITING_FOR_BOT' → hand back to the bot (bot resumes on next message)
    """
    valid = {"WAITING_FOR_BOT", "AGENT_RESPONDING", "RESOLVED", "NEEDS_HUMAN"}
    if body.status not in valid:
        raise HTTPException(status_code=400, detail="Invalid status")
    db = get_db()
    res = await db.chat_sessions.update_one(
        {"session_id": session_id}, {"$set": {"status": body.status}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True, "status": body.status}


@router.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """
    Delete a conversation: its session, message history, and any explicit routing
    for that customer. This fully resets the customer so the next message they send
    runs the fresh triage flow — handy for re-recording a demo with the same number.
    """
    db = get_db()
    session = await db.chat_sessions.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.message_audit_log.delete_many({"session_id": session_id})
    await db.chat_sessions.delete_one({"session_id": session_id})
    await db.customer_routing.delete_one({"customer_phone": session["customer_phone"]})
    return {"ok": True}


class ReplyIn(BaseModel):
    text: str


@router.post("/api/sessions/{session_id}/reply")
async def reply_to_session(session_id: str, body: ReplyIn):
    """
    Let a human agent send a message to the customer from the dashboard — essential
    when a chat is escalated (NEEDS_HUMAN) and the bot has stopped auto-replying.
    Logged as an OUTBOUND message from the AGENT (not the bot).
    """
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message text is required")
    db = get_db()
    session = await db.chat_sessions.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    tenant = await db.tenants.find_one({"tenant_id": session["tenant_id"]})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    instance_name = tenant.get("evolution_instance") or "default"
    await send_text_message(instance_name, session["customer_phone"], text)

    await db.message_audit_log.insert_one({
        "message_id": str(uuid4()),
        "session_id": session_id,
        "tenant_id": session["tenant_id"],
        "direction": "OUTBOUND",
        "sender": "AGENT",
        "text_content": text,
        "media_url": None, "media_type": None, "media_filename": None,
        "agent_state": "SENT",
        "timestamp": datetime.utcnow(),
    })
    await db.chat_sessions.update_one(
        {"session_id": session_id},
        {"$set": {"last_message_at": datetime.utcnow()}, "$inc": {"message_count": 1}},
    )
    return {"ok": True}


class BroadcastRequest(BaseModel):
    tenant_id: str
    phone_numbers: list[str]
    message: str


@router.post("/api/broadcast")
async def broadcast(req: BroadcastRequest):
    db = get_db()
    tenant = await db.tenants.find_one({"tenant_id": req.tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    results = {"sent": [], "failed": []}
    for phone in req.phone_numbers:
        try:
            instance_name = tenant.get("evolution_instance") or "default"
            await send_text_message(
                instance_name, phone, req.message
            )
            results["sent"].append(phone)
        except Exception as e:
            results["failed"].append({"phone": phone, "error": str(e)})

    return results
