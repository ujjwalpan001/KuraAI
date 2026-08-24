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


async def _resolve_or_triage(db, customer_phone: str, instance_name: str, text: str, from_me: bool = False):
    """
    Decide which tenant a customer belongs to.
    Returns (tenant_id_or_None, ask_reply_or_None, all_candidates_list).

    Priority:
      1. Explicit routing assignment (customer_routing)        → single tenant
      2. Existing session (sticky)                             → single tenant
      3. Instance uniquely owned by one tenant                 → single tenant
      4. Single active tenant                                  → single tenant
      5. Keyword auto-guess from catalog/media                 → single tenant
      6. from_me (business initiated)                          → first tenant silently
      7. Shared unresolved → return ALL candidates + ask_reply → show in ALL dashboards
    """
    route = await db.customer_routing.find_one({"customer_phone": customer_phone})
    if route:
        return route["tenant_id"], None, []

    existing = await db.chat_sessions.find_one(
        {"customer_phone": customer_phone}, sort=[("last_message_at", -1)]
    )
    if existing:
        return existing["tenant_id"], None, []

    owners = await db.tenants.find(
        {"evolution_instance": instance_name, "is_active": True}
    ).to_list(None)
    if len(owners) == 1:
        return owners[0]["tenant_id"], None, []

    candidates = owners or await db.tenants.find({"is_active": True}).to_list(None)
    if not candidates:
        return None, None, []
    if len(candidates) == 1:
        return candidates[0]["tenant_id"], None, []

    vocab_by_tenant = {c["tenant_id"]: await _tenant_vocab(db, c) for c in candidates}
    guess = _best_tenant(text, vocab_by_tenant)
    if guess:
        logger.info(f"[TRIAGE] auto-routed unassigned customer to {guess} from message keywords")
        return guess, None, []

    # Business initiated: assign to first tenant silently — no welcome menu
    if from_me:
        return candidates[0]["tenant_id"], None, []

    options = "\n".join(f"• {c['name']}" for c in candidates[:6])
    ask_reply = (
        "Hi! 👋 Thanks for reaching out. Which business would you like to chat with today?\n\n"
        f"{options}\n\nReply with the name and we'll connect you!"
    )
    # Return None as tenant_id + all candidates so the caller can create sessions in ALL dashboards
    return None, ask_reply, candidates


async def _handle_triage_reply(db, customer_phone: str, instance_name: str, text: str) -> bool:
    """
    If this customer has TRIAGE_PENDING sessions (from a shared-number welcome),
    try to match their reply text to a tenant name and route them.
    Returns True if handled.
    """
    pending_sessions = await db.chat_sessions.find(
        {"customer_phone": customer_phone, "status": "TRIAGE_PENDING"}
    ).to_list(None)
    if not pending_sessions:
        return False

    # Get all candidate tenants from the pending sessions
    pending_tenant_ids = [s["tenant_id"] for s in pending_sessions]
    candidates = await db.tenants.find(
        {"tenant_id": {"$in": pending_tenant_ids}, "is_active": True}
    ).to_list(None)

    # Try to match the customer's reply to one of the candidate tenant names
    t = (text or "").lower().strip()
    matched = None
    for candidate in candidates:
        name = candidate["name"].lower()
        code = (candidate.get("switch_code") or candidate["tenant_id"]).lower()
        words = set(re.split(r"[\s/_\-]+", name))
        if t == name or t == code or t in name or any(t == w for w in words if len(w) >= 3):
            matched = candidate
            break

    if not matched:
        # Still can't match — ask again politely
        options = "\n".join(f"• {c['name']}" for c in candidates)
        await send_text_message(
            instance_name, customer_phone,
            f"Sorry, I didn't catch that! Please reply with one of these:\n\n{options}"
        )
        return True

    chosen_tid = matched["tenant_id"]
    logger.info(f"[TRIAGE] Customer {customer_phone} chose tenant '{chosen_tid}'")

    # Save the routing so future messages go directly here
    await db.customer_routing.update_one(
        {"customer_phone": customer_phone},
        {"$set": {"customer_phone": customer_phone, "tenant_id": chosen_tid}},
        upsert=True,
    )

    # Activate the chosen session and delete all others
    for s in pending_sessions:
        if s["tenant_id"] == chosen_tid:
            # Activate chosen session
            await db.chat_sessions.update_one(
                {"_id": s["_id"]},
                {"$set": {"status": "WAITING_FOR_BOT"}}
            )
        else:
            # Delete ghost triage sessions from other tenant dashboards
            await db.message_audit_log.delete_many({"session_id": s["session_id"]})
            await db.chat_sessions.delete_one({"_id": s["_id"]})

    await send_text_message(
        instance_name, customer_phone,
        f"Great! Connecting you to *{matched['name']}* now. How can we help? 😊"
    )
    return True


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

    # '#code' / 'switch to X' command handling
    if not from_me and await _handle_switch_command(db, message_data["text"], customer_phone, instance_name):
        return Response(status_code=200)

    # Check if customer is in TRIAGE_PENDING (replying to shared-number welcome menu)
    if not from_me and await _handle_triage_reply(db, customer_phone, instance_name, message_data["text"]):
        return Response(status_code=200)

    # -----------------------------------------------------------------------
    # RESOLVE TENANT
    # -----------------------------------------------------------------------
    tenant_id, ask_reply, triage_candidates = await _resolve_or_triage(
        db, customer_phone, instance_name, message_data["text"], from_me
    )

    # Shared number, unresolved: show welcome in ALL tenant dashboards with TRIAGE_PENDING status
    if ask_reply and triage_candidates:
        ask_msg_id = message_data["message_id"]
        for i, candidate in enumerate(triage_candidates):
            tid = candidate["tenant_id"]
            # Create session as TRIAGE_PENDING so it only shows the welcome, not full chat
            session = await _get_or_create_session(tid, customer_phone, initial_status="TRIAGE_PENDING")
            # Log the customer's message in each tenant dashboard
            await db.message_audit_log.insert_one({
                "message_id": f"{ask_msg_id}-triage-inbound-{i}",
                "session_id": session["session_id"],
                "tenant_id": tid,
                "direction": "INBOUND",
                "text_content": message_data["text"],
                "timestamp": datetime.utcnow(),
            })
            # Log the triage welcome reply in each tenant dashboard
            await db.message_audit_log.insert_one({
                "message_id": f"triage-outbound-{uuid4()}",
                "session_id": session["session_id"],
                "tenant_id": tid,
                "direction": "OUTBOUND",
                "text_content": ask_reply,
                "timestamp": datetime.utcnow(),
                "status": "sent",
            })
        # Send the welcome message once on WhatsApp
        await send_text_message(instance_name, customer_phone, ask_reply)
        return Response(status_code=200)

    if not tenant_id:
        logger.warning("No tenant could be resolved — ignoring")
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
            "session_id": session["session_id"],
            "tenant_id": tenant_id,
            "direction": "INBOUND",
            "text_content": message_data["text"],
            "media_type": message_data["media_type"],
            "media_filename": message_data["media_filename"],
            "timestamp": datetime.utcnow(),
        })
        logger.info(f"Session {session['session_id']} is NEEDS_HUMAN — logged message, skipping agent")
        return Response(status_code=200)

    # Run AI agent in background
    background_tasks.add_task(_run_agent, message_data, tenant_id, session["session_id"])
    return Response(status_code=200)
