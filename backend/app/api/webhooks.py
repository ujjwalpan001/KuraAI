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
from collections import Counter
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

        # Instead of ignoring messages sent BY the bot/us, we pass them through 
        # so they can be synced to the Live Chats dashboard as OUTBOUND messages.

        if not remote_jid or not message_id:
            return None

        # Skip group messages (group JIDs contain @g.us)
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
        }
    except (KeyError, IndexError, TypeError) as e:
        logger.debug(f"Could not extract message from payload: {e}")
        return None


# Generic retail words that don't identify a specific brand.
_STOPWORDS = {
    "store", "stores", "services", "service", "care", "company", "shop", "the", "and",
    "for", "ltd", "inc", "llp", "pvt", "limited", "private", "solutions", "group",
    "world", "house", "hub", "center", "centre", "online", "official",
}


def _signals_from(*phrases) -> set[str]:
    """Turn keywords/names into routing signals."""
    out: set[str] = set()
    for p in phrases:
        p = (p or "").lower().strip()
        if len(p) >= 3:
            out.add(p)
        for w in re.split(r"[\s/_\-]+", p):
            if len(w) >= 3 and w not in _STOPWORDS:
                out.add(w)
    return {s for s in out if s not in _STOPWORDS}


async def _tenant_vocab(db, tenant: dict) -> set[str]:
    """Build vocabulary for a tenant for routing."""
    sig = _signals_from(*(tenant.get("media_library") or {}).keys())
    sig |= _signals_from(tenant.get("switch_code"), tenant["name"])
    items = await db.catalog_items.find(
        {"tenant_id": tenant["tenant_id"]}, {"_id": 0, "name": 1}
    ).to_list(None)
    sig |= _signals_from(*[it.get("name") for it in items])
    return sig


def _best_tenant(text: str, vocab_by_tenant: dict[str, set[str]]) -> str | None:
    """
    Confident auto-route: only discriminating signals count.
    """
    t = (text or "").lower()
    if not t.strip():
        return None
    counts = Counter(s for vocab in vocab_by_tenant.values() for s in vocab)
    scores: dict[str, int] = {}
    for tid, vocab in vocab_by_tenant.items():
        score = sum(
            1 for s in vocab
            if counts[s] == 1 and re.search(rf"\b{re.escape(s)}\b", t)
        )
        if score:
            scores[tid] = score
    if not scores:
        return None
    top = max(scores.values())
    leaders = [tid for tid, sc in scores.items() if sc == top]
    return leaders[0] if len(leaders) == 1 else None


async def _resolve_or_triage(db, customer_phone: str, instance_name: str, text: str):
    """
    Decide which tenant a customer belongs to. Returns (tenant_id, ask_reply).
    Priority:
      1. Explicit routing assignment (customer_routing)            → tenant_id
      2. Existing session (sticky to their current tenant)         → tenant_id
      3. A number that uniquely belongs to one tenant (production) → tenant_id
      4. Shared number + only one tenant exists                    → tenant_id
      5. Shared number, unassigned: auto-guess from media words    → tenant_id (confident)
         ...otherwise ask which business                          → ask_reply
    """
    route = await db.customer_routing.find_one({"customer_phone": customer_phone})
    if route:
        return route["tenant_id"], None

    existing = await db.chat_sessions.find_one(
        {"customer_phone": customer_phone}, sort=[("last_message_at", -1)]
    )
    if existing:
        return existing["tenant_id"], None

    owners = await db.tenants.find(
        {"evolution_instance": instance_name, "is_active": True}
    ).to_list(None)
    if len(owners) == 1:
        return owners[0]["tenant_id"], None

    candidates = owners or await db.tenants.find({"is_active": True}).to_list(None)
    if not candidates:
        return None, None
    if len(candidates) == 1:
        return candidates[0]["tenant_id"], None

    vocab_by_tenant = {c["tenant_id"]: await _tenant_vocab(db, c) for c in candidates}
    guess = _best_tenant(text, vocab_by_tenant)
    if guess:
        logger.info(f"[TRIAGE] auto-routed unassigned customer to {guess} from message keywords")
        return guess, None

    nudge = "or just tell me what you need (e.g. a *sofa* or an *oil change*)"
    if len(candidates) <= 6:
        options = "\n".join(f"• {c['name']}" for c in candidates)
        reply = (
            "Hi! 👋 Thanks for reaching out. Which business would you like to chat with today?\n\n"
            f"{options}\n\nReply with the name, {nudge}."
        )
    else:
        reply = (
            "Hi! 👋 Thanks for reaching out. Please reply with the *name* of the business "
            f"you'd like to reach, {nudge}, and I'll connect you."
        )
    return None, reply


async def _handle_switch_command(db, text: str, customer_phone: str, instance_name: str) -> bool:
    """
    Lets a customer switch which tenant they talk to:
      - '#code'           → switch by code
      - 'switch to Name'  → switch by name
      - 'switch'          → show picker
    Returns True if handled (skip agent).
    """
    stripped = (text or "").strip()
    low = stripped.lower()

    if stripped.startswith("#"):
        target = stripped[1:].strip().lower()
    elif re.match(r"^switch\b", low):
        target = re.sub(r"^switch(\s+to)?(\s+(?:a\s+)?(?:business|tenant|brand))?", "", low).strip()
    else:
        return False

    tenants = await db.tenants.find({"is_active": True}).to_list(None)

    def _code_of(t):
        return (t.get("switch_code") or t["tenant_id"]).lower()

    if not target or target in ("help", "tenants", "business", "list"):
        shown = tenants[:6]
        opts = "\n".join(f"• {t['name']} — reply *#{_code_of(t)}*" for t in shown)
        more = "" if len(tenants) <= 6 else f"\n…and {len(tenants) - 6} more."
        await send_text_message(instance_name, customer_phone,
            f"Which business would you like to chat with?\n{opts}{more}\n\nReply with its *#code*, or type *switch to <name>*.")
        return True

    def _matches(t):
        name = t["name"].lower()
        words = set(re.split(r"[\s/_\-]+", name))
        return (_code_of(t) == target or t["tenant_id"].lower() == target
                or target in name or target in words)

    matches = [t for t in tenants if _matches(t)]
    if len(matches) != 1:
        hint = "I couldn't tell which business you meant" if len(matches) > 1 else f"I don't recognise '{target}'"
        await send_text_message(instance_name, customer_phone,
            f"{hint}. Type *switch* to see the options.")
        return True
    match = matches[0]

    await db.customer_routing.update_one(
        {"customer_phone": customer_phone},
        {"$set": {"customer_phone": customer_phone, "tenant_id": match["tenant_id"]}},
        upsert=True,
    )
    await _get_or_create_session(match["tenant_id"], customer_phone)
    await send_text_message(instance_name, customer_phone,
        f"You're now chatting with *{match['name']}*. How can we help? 😊")
    return True


async def _get_or_create_session(tenant_id: str, customer_phone: str) -> dict:
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
                "status": "WAITING_FOR_BOT",
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
            "inbound_text": message_data["text"] or "(no text)",
            "inbound_media_id": message_data.get("media_id"),
            "inbound_media_type": message_data.get("media_type"),
            "inbound_media_filename": message_data.get("media_filename"),
            "inbound_media_mime": message_data.get("media_mime"),
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
    Handles Evolution API webhook payloads.
    Evolution API sends all events to this single endpoint.
    Authentication: Evolution API sends the apikey as a header — we validate it.
    """
    # Evolution Go does not send an apikey header in its webhook requests.
    # Therefore, we rely on the secrecy of the webhook URL endpoint itself.

    payload_bytes = await request.body()
    payload = json.loads(payload_bytes) if payload_bytes else {}

    # Log all raw webhooks for debugging
    db = get_db()
    try:
        await db.raw_webhooks.insert_one({"received_at": datetime.utcnow(), "payload": payload})
    except Exception as e:
        logger.error(f"Failed to log raw webhook: {e}")

    message_data = _extract_message(payload)
    if not message_data:
        # Status update, connection event, or unsupported type — acknowledge and ignore
        event = payload.get("event", "unknown")
        logger.debug(f"Webhook received (non-message event: {event}) — ignored")
        return Response(status_code=200)

    db = get_db()

    # IDEMPOTENCY: Evolution API may retry webhooks. Process each message_id exactly once.
    try:
        await db.processed_webhooks.insert_one({
            "whatsapp_message_id": message_data["message_id"],
            "received_at": datetime.utcnow(),
        })
    except DuplicateKeyError:
        logger.info(f"Duplicate webhook for {message_data['message_id']} — already processed, skipping")
        return Response(status_code=200)

    instance_name = message_data["instance_name"]

    # Optional: '#code' switches which tenant this customer talks to.
    if await _handle_switch_command(
        db, message_data["text"], message_data["customer_phone"], instance_name
    ):
        return Response(status_code=200)

    # Resolve which TENANT this customer belongs to (or ask them if we can't tell).
    tenant_id, ask_reply = await _resolve_or_triage(
        db, message_data["customer_phone"], instance_name, message_data["text"]
    )
    if ask_reply:
        await send_text_message(instance_name, message_data["customer_phone"], ask_reply)
        return Response(status_code=200)
    if not tenant_id:
        logger.warning("No tenant could be resolved — ignoring")
        return Response(status_code=200)

    # Get or create session
    session = await _get_or_create_session(tenant_id, message_data["customer_phone"])

    # If this message was sent manually by the business from their physical phone,
    # just log it to the dashboard and DO NOT run the AI agent!
    if message_data.get("from_me"):
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
        logger.info(f"Logged manual outbound message from phone to session {session['session_id']}")
        return Response(status_code=200)

    # If session needs human — log message but don't run agent
    if session["status"] == "NEEDS_HUMAN":
        logger.info(f"Session {session['session_id']} needs human — skipping agent")
        return Response(status_code=200)

    # RETURN 200 IMMEDIATELY — LangGraph runs in background
    background_tasks.add_task(
        _run_agent, message_data, tenant_id, session["session_id"]
    )
    return Response(status_code=200)
