"""
Evolution API webhook handler.

Evolution API sends webhooks in this format for inbound messages:
{
  "event": "messages.upsert",
  "instance": "my-instance-name",
  "data": {
    "key": {
      "remoteJid": "919876543210@s.whatsapp.net",
      "fromMe": false,
      "id": "BAE5xxxxxxxxxxxx"
    },
    "pushName": "Customer Name",
    "message": {
      "conversation": "Hello there",
      // OR for images:
      "imageMessage": { "caption": "...", "mimetype": "image/jpeg", ... },
      // OR for documents:
      "documentMessage": { "caption": "...", "fileName": "file.pdf", "mimetype": "...", ... }
    },
    "messageType": "conversation",
    "timestamp": 1724500000
  }
}
"""

import json
import logging
import re
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Header, Request
from fastapi.responses import Response
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.agent.graph import agent_graph
from app.agent.state import AgentState
from app.config import settings
from app.db.mongodb import get_db
from app.whatsapp.client import send_text_message

router = APIRouter()
logger = logging.getLogger(__name__)


def _extract_phone(remote_jid: str) -> str:
    """Convert '919876543210@s.whatsapp.net' → '919876543210'."""
    return remote_jid.split("@")[0]


def _extract_message(payload: dict) -> dict | None:
    """
    Parse Evolution API webhook payload.
    Supports both the classic Node.js API (messages.upsert) and the newer Evolution Go (Message).
    Returns None if it's not an inbound user message.
    """
    try:
        event = payload.get("event", "")
        # Only process new inbound messages
        if event not in ("messages.upsert", "Message"):
            return None

        instance_name = payload.get("instance") or payload.get("instanceName", "")
        data = payload.get("data", {})
        
        # Determine format: Node.js (key/message) vs Go (Info/Message)
        is_go = "Info" in data and "Message" in data
        
        if is_go:
            info = data.get("Info", {})
            message = data.get("Message", {})
            from_me = info.get("IsFromMe", True)
            remote_jid = info.get("Chat", "")
            message_id = info.get("ID", "")
            push_name = info.get("PushName", "")
            sender_alt_jid = info.get("SenderAlt", "")
            
            # Infer message_type for Go
            if "conversation" in message:
                message_type = "conversation"
            elif "extendedTextMessage" in message:
                message_type = "extendedTextMessage"
            elif "imageMessage" in message:
                message_type = "imageMessage"
            elif "documentMessage" in message:
                message_type = "documentMessage"
            else:
                message_type = "unknown"
        else:
            key = data.get("key", {})
            message = data.get("message", {})
            from_me = key.get("fromMe", True)
            remote_jid = key.get("remoteJid", "")
            message_id = key.get("id", "")
            push_name = data.get("pushName", "")
            message_type = data.get("messageType", "")
            sender_alt_jid = ""

        # Instead of ignoring messages sent BY the bot/us, we pass them through 
        # so they can be synced to the Live Chats dashboard as OUTBOUND messages.

        if not remote_jid or not message_id:
            return None

        # Ignore all group messages
        if "@g.us" in remote_jid:
            return None

        customer_phone = _extract_phone(remote_jid)

        text = ""
        media_id = None
        media_type_str = None
        media_filename = None
        media_mime = None

        if message_type == "conversation":
            text = message.get("conversation", "")
        elif message_type == "extendedTextMessage":
            text = (message.get("extendedTextMessage") or {}).get("text", "")
        elif message_type == "imageMessage":
            img = message.get("imageMessage", {})
            text = img.get("caption", "")
            media_id = message_id  # Evolution API uses message ID to fetch media
            media_type_str = "image"
            media_mime = img.get("mimetype", "image/jpeg")
        elif message_type == "documentMessage":
            doc = message.get("documentMessage", {})
            text = doc.get("caption", "")
            media_id = message_id
            media_type_str = "document"
            media_filename = doc.get("fileName", "document.pdf")
            media_mime = doc.get("mimetype", "application/pdf")
        else:
            # Unsupported type (audio, video, sticker, etc.) — skip
            logger.debug(f"Unsupported message type: {message_type}")
            return None

        return {
            "instance_name": instance_name,
            "customer_phone": customer_phone,
            "remote_jid": remote_jid,
            "message_id": message_id,
            "text": text,
            "media_id": media_id,
            "media_type": media_type_str,
            "media_filename": media_filename,
            "media_mime": media_mime,
            "timestamp": str(data.get("timestamp") or data.get("Info", {}).get("Timestamp", "")),
            "push_name": push_name,
            "from_me": from_me,
            "sender_alt_phone": _extract_phone(sender_alt_jid) if sender_alt_jid else None,
            "raw_message_payload": data,
        }
    except (KeyError, IndexError, TypeError) as e:
        logger.debug(f"Could not extract message from payload: {e}")
        return None


async def _resolve_tenant(db, instance_name: str, customer_phone: str, sender_alt_phone: str = None) -> str | None:
    """
    Simple 1:1 routing: each WhatsApp instance belongs to exactly one tenant.

    Priority:
      1. Direct instance -> tenant lookup (primary, fastest path)
      2. Existing session lookup (handles LID-swap: friend replies with real phone
         but session was created under the LID)
      3. LID session lookup via sender_alt_phone
    """
    # 1. Find the tenant that owns this WhatsApp instance
    tenant = await db.tenants.find_one({"evolution_instance": instance_name, "is_active": True})
    if tenant:
        return tenant["tenant_id"]

    # 2. Fall back to existing session (helps with LID scenario)
    existing = await db.chat_sessions.find_one(
        {"customer_phone": customer_phone}, sort=[("last_message_at", -1)]
    )
    if existing:
        return existing["tenant_id"]

    # 3. Check LID session
    if sender_alt_phone and sender_alt_phone != customer_phone:
        lid_session = await db.chat_sessions.find_one(
            {"customer_phone": sender_alt_phone}, sort=[("last_message_at", -1)]
        )
        if lid_session:
            return lid_session["tenant_id"]

    logger.warning(f"No tenant found for instance '{instance_name}' — ignoring message")
    return None






async def _get_or_create_session(tenant_id: str, customer_phone: str, initial_status: str = "WAITING_FOR_BOT") -> dict:
    """Atomic get-or-create to avoid race conditions on concurrent messages."""
    db = get_db()
    now = datetime.utcnow()
    session = await db.chat_sessions.find_one_and_update(
        {"tenant_id": tenant_id, "customer_phone": customer_phone},
        {
            "$setOnInsert": {
                "session_id": str(uuid4()),
                "tenant_id": tenant_id,
                "customer_phone": customer_phone,
                "status": initial_status,
                "context_vars": {},
                "message_count": 0,
                "created_at": now,
            },
            "$set": {"last_message_at": now},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return session


async def _run_agent(message_data: dict, tenant_id: str, session_id: str):
    """Background task: runs LangGraph pipeline."""
    try:
        db = get_db()
        tenant = await db.tenants.find_one({"tenant_id": tenant_id})

        initial_state: AgentState = {
            "tenant_id": tenant_id,
            "customer_phone": message_data["customer_phone"],
            "session_id": session_id,
            "whatsapp_message_id": message_data["message_id"],
            "inbound_text": message_data.get("text") or "",
            "inbound_media_id": message_data.get("media_id"),
            "inbound_media_type": message_data.get("media_type"),
            "inbound_media_filename": message_data.get("media_filename"),
            "inbound_media_mime": message_data.get("media_mime"),
            "inbound_raw_message": message_data.get("raw_message_payload"),
            "inbound_image_description": None,
            "inbound_doc_summary": None,
            "tenant_config": tenant,
            "chat_history": None,
            "rag_chunks": None,
            "llm_reply": None,
            "media_to_send": None,
            "media_type": None,
            "media_filename": None,
            "session_status": "AGENT_RESPONDING",
            "error": None,
        }

        await agent_graph.ainvoke(initial_state)
    except Exception as e:
        logger.error(f"Agent pipeline error: {e}", exc_info=True)


# ---------------------------------------------------------------------------
# POST — Receive Evolution API webhooks
# ---------------------------------------------------------------------------

@router.post("/api/webhooks/whatsapp")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Handles Evolution API webhook payloads (Evolution Go + Node.js).
    """
    payload_bytes = await request.body()
    payload = json.loads(payload_bytes) if payload_bytes else {}

    db = get_db()
    try:
        await db.raw_webhooks.insert_one({"received_at": datetime.utcnow(), "payload": payload})
    except Exception as e:
        logger.error(f"Failed to log raw webhook: {e}")

    message_data = _extract_message(payload)
    if not message_data:
        event = payload.get("event", "unknown")
        logger.debug(f"Webhook received (non-message event: {event}) — ignored")
        return Response(status_code=200)

    # IDEMPOTENCY: process each message_id exactly once.
    try:
        await db.processed_webhooks.insert_one({
            "whatsapp_message_id": message_data["message_id"],
            "received_at": datetime.utcnow(),
        })
    except DuplicateKeyError:
        logger.info(f"Duplicate webhook for {message_data['message_id']} — skipping")
        return Response(status_code=200)

    instance_name = message_data["instance_name"]
    from_me = message_data.get("from_me", False)
    customer_phone = message_data["customer_phone"]

    # -----------------------------------------------------------------------
    # RESOLVE TENANT — simple 1:1: instance → tenant
    # -----------------------------------------------------------------------
    tenant_id = await _resolve_tenant(
        db, instance_name, customer_phone,
        sender_alt_phone=message_data.get("sender_alt_phone"),
    )
    if not tenant_id:
        return Response(status_code=200)

    # -----------------------------------------------------------------------
    # PERSONAL NUMBERS (Do Not Disturb)
    # -----------------------------------------------------------------------
    tenant = await db.tenants.find_one({"tenant_id": tenant_id})
    if tenant and customer_phone in tenant.get("personal_numbers", []):
        logger.debug(f"Ignoring personal number: {customer_phone} for tenant {tenant_id}")
        return Response(status_code=200)


    # -----------------------------------------------------------------------
    # LID → REAL PHONE MERGING
    # When the business sends a message to a WhatsApp contact via a business link,
    # WhatsApp assigns a temporary LID. When the friend replies, Evolution Go
    # reveals the real phone in 'remote_jid' and puts the LID in 'SenderAlt'.
    # We merge the ghost LID session into the real phone session here.
    # -----------------------------------------------------------------------
    sender_alt = message_data.get("sender_alt_phone")
    if sender_alt and sender_alt != customer_phone:
        lid_session = await db.chat_sessions.find_one({"customer_phone": sender_alt, "tenant_id": tenant_id})
        if lid_session:
            logger.info(f"LID merge: {sender_alt} → {customer_phone} (session {lid_session['session_id']})")
            real_session = await db.chat_sessions.find_one({"customer_phone": customer_phone, "tenant_id": tenant_id})

            if real_session:
                # Move ALL messages from LID session into the real session
                await db.message_audit_log.update_many(
                    {"session_id": lid_session["session_id"]},
                    {"$set": {"session_id": real_session["session_id"]}}
                )
                # Transfer NEEDS_HUMAN status if the LID was in human mode
                if lid_session.get("status") == "NEEDS_HUMAN":
                    await db.chat_sessions.update_one(
                        {"_id": real_session["_id"]},
                        {"$set": {"status": "NEEDS_HUMAN"}}
                    )
                # Delete the ghost LID session
                await db.chat_sessions.delete_one({"_id": lid_session["_id"]})
                logger.info(f"LID merge: moved messages to real session {real_session['session_id']} and deleted ghost.")
            else:
                # No real session exists yet — just rename LID session to real phone
                await db.chat_sessions.update_one(
                    {"_id": lid_session["_id"]},
                    {"$set": {"customer_phone": customer_phone}}
                )
                logger.info(f"LID merge: renamed session to real phone {customer_phone}.")

    # -----------------------------------------------------------------------
    # GET / CREATE SESSION
    # -----------------------------------------------------------------------
    existing_session = await db.chat_sessions.find_one({"customer_phone": customer_phone, "tenant_id": tenant_id})
    session = await _get_or_create_session(tenant_id, customer_phone)

    # -----------------------------------------------------------------------
    # OUTBOUND (from_me): log to dashboard, set NEEDS_HUMAN on first contact
    # -----------------------------------------------------------------------
    if from_me:
        # --- CRITICAL: Lock this customer's phone to THIS tenant immediately ---
        # This ensures when the friend replies, they are always routed back to
        # the same tenant, preventing cross-tenant conflicts.
        await db.customer_routing.update_one(
            {"customer_phone": customer_phone},
            {"$set": {"customer_phone": customer_phone, "tenant_id": tenant_id}},
            upsert=True,
        )
        logger.info(f"Outbound: locked {customer_phone} → tenant '{tenant_id}' in routing table.")

        if not existing_session:
            # Business initiated — silence the bot for this person
            await db.chat_sessions.update_one(
                {"session_id": session["session_id"]},
                {"$set": {"status": "NEEDS_HUMAN"}}
            )
            session["status"] = "NEEDS_HUMAN"
            logger.info(f"Business initiated chat → NEEDS_HUMAN for session {session['session_id']}")

        await db.message_audit_log.insert_one({
            "message_id": message_data["message_id"],
            "session_id": session["session_id"],
            "tenant_id": tenant_id,
            "direction": "OUTBOUND",
            "sender": "PHONE",
            "text_content": message_data["text"],
            "media_url": None,
            "media_type": message_data["media_type"],
            "media_filename": message_data["media_filename"],
            "agent_state": "NONE",
            "is_read": True,
            "timestamp": datetime.utcnow(),
        })
        logger.info(f"Outbound phone message logged to session {session['session_id']}")
        return Response(status_code=200)

    # -----------------------------------------------------------------------
    # INBOUND: if NEEDS_HUMAN just log, else run AI agent
    # -----------------------------------------------------------------------
    if session["status"] == "NEEDS_HUMAN":
        # Log the inbound message to the dashboard so it's visible
        await db.message_audit_log.insert_one({
            "message_id": message_data["message_id"],
            "whatsapp_message_id": message_data["message_id"],
            "session_id": session["session_id"],
            "tenant_id": tenant_id,
            "direction": "INBOUND",
            "text_content": message_data["text"],
            "media_url": None,
            "media_type": message_data["media_type"],
            "media_filename": message_data["media_filename"],
            "timestamp": datetime.utcnow(),
        })
        logger.info(f"Session {session['session_id']} is NEEDS_HUMAN — logged message, skipping agent")
        return Response(status_code=200)

    # Run AI agent in background
    background_tasks.add_task(_run_agent, message_data, tenant_id, session["session_id"])
    return Response(status_code=200)
