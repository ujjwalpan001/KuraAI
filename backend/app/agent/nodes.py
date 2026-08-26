import asyncio
import base64
import json
import logging
import re
from datetime import datetime
from uuid import uuid4

from app.agent.state import AgentState
from app.agent.tools import TOOLS
from app.config import settings
from app.db.mongodb import get_db
from app.rag.qdrant_client import search_knowledge_base, search_catalog
from app.whatsapp import client as wa

logger = logging.getLogger(__name__)

# LLM clients are created LAZILY (on first use), never at import time
_groq_client = None
_groq_init_done = False


async def _groq_create(groq, **kwargs):
    """Groq chat completion with retry/backoff and model fallback."""
    last = None
    for attempt in range(4):
        try:
            return await asyncio.to_thread(groq.chat.completions.create, **kwargs)
        except Exception as e:
            last = e
            m = str(e).lower()
            
            # Removed hardcoded fallback per user request; strictly respect the environment variable.
                
            if any(w in m for w in ("rate", "429", "limit", "timeout", "temporar", "overload", "503")):
                wait = 2 * (attempt + 1)
                logger.warning(f"Groq throttled (attempt {attempt+1}): {str(e)[:120]} — retrying in {wait}s")
                await asyncio.sleep(wait)
                continue
                
            logger.error(f"Groq call failed (non-retryable): {str(e)[:200]}")
            raise
    raise last


def _get_groq():
    global _groq_client, _groq_init_done
    if not _groq_init_done:
        _groq_init_done = True
        if settings.groq_api_key:
            try:
                from groq import Groq
                _groq_client = Groq(api_key=settings.groq_api_key)
            except Exception as e:
                logger.warning(f"Groq client unavailable: {e}")
    return _groq_client

# Tools in OpenAI/Groq function-calling format
_groq_tools = [
    {"type": "function", "function": {
        "name": t["name"],
        "description": t["description"],
        "parameters": t["parameters"],
    }}
    for t in TOOLS
]


# ---------------------------------------------------------------------------
# Node 1: Acknowledge
# ---------------------------------------------------------------------------

async def acknowledge_node(state: AgentState) -> AgentState:
    """
    Fires read receipt + typing indicator immediately.
    Saves inbound message to MongoDB.
    """
    # Get the Evolution instance name from tenant config
    instance_name = (
        (state.get("tenant_config") or {}).get("evolution_instance")
        or settings.evolution_api_key and "default"
        or "default"
    )
    customer_phone = state["customer_phone"]
    remote_jid = f"{customer_phone}@s.whatsapp.net"

    try:
        await wa.send_read_receipt(instance_name, remote_jid, state["whatsapp_message_id"])
    except Exception as e:
        logger.warning(f"Read receipt failed: {e}")

    try:
        await wa.send_typing_indicator(instance_name, customer_phone)
    except Exception as e:
        logger.warning(f"Typing indicator failed: {e}")

    db = get_db()

    # Save inbound message
    await db.message_audit_log.insert_one({
        "message_id": str(uuid4()),
        "whatsapp_message_id": state["whatsapp_message_id"],
        "session_id": state["session_id"],
        "tenant_id": state["tenant_id"],
        "direction": "INBOUND",
        "sender": state["customer_phone"],
        "text_content": state["inbound_text"],
        "media_url": None,
        "media_type": state.get("inbound_media_type"),
        "agent_state": "TYPING",
        "is_read": True,
        "timestamp": datetime.utcnow(),
    })

    # Update session status
    await db.chat_sessions.update_one(
        {"session_id": state["session_id"]},
        {"$set": {"status": "AGENT_RESPONDING", "last_message_at": datetime.utcnow()}},
    )

    state["session_status"] = "AGENT_RESPONDING"
    return state


# ---------------------------------------------------------------------------
# Node 2: Context Retriever
# ---------------------------------------------------------------------------

async def context_retriever_node(state: AgentState) -> AgentState:
    """
    Fetches tenant config, last 5 messages, RAG chunks.
    Bonus B2: if user sent image, analyses with Gemini Vision.
    """
    db = get_db()

    # Tenant config
    tenant = await db.tenants.find_one({"tenant_id": state["tenant_id"]})
    if not tenant:
        state["error"] = f"Tenant {state['tenant_id']} not found"
        return state
    state["tenant_config"] = tenant

    # Catalog inventory (names) so the bot is HONEST about what actually exists
    cat = await db.catalog_items.find(
        {"tenant_id": state["tenant_id"], "is_active": True}, {"name": 1}
    ).to_list(None)
    state["catalog_names"] = [c["name"] for c in cat]

    # Last 5 messages (oldest first)
    msgs = await db.message_audit_log.find(
        {"session_id": state["session_id"]}
    ).sort("timestamp", -1).limit(5).to_list(5)
    state["chat_history"] = list(reversed(msgs))

    # RAG - Qdrant cloud is always ready
    state["rag_chunks"] = search_knowledge_base(
        query=state["inbound_text"],
        tenant_id=state["tenant_id"],
    )

    # --- Visible flow logging ---
    logger.info(f"[INBOUND] ({tenant['name']}) customer said: {state['inbound_text']!r}")
    logger.info(f"[MONGODB] loaded {len(state['chat_history'])} prior messages from history")
    if state["rag_chunks"]:
        logger.info(f"[RAG/Chroma] found {len(state['rag_chunks'])} relevant knowledge chunks:")
        for i, c in enumerate(state["rag_chunks"], 1):
            logger.info(f"    [{i}] {c[:110]}...")
    else:
        logger.info("[RAG/Chroma] no relevant knowledge found -> LLM answers from system prompt only")

    # Inbound media: download via Evolution API base64 endpoint
    if state.get("inbound_media_id"):
        try:
            instance_name = (
                (state.get("tenant_config") or {}).get("evolution_instance")
                or "default"
            )
            raw_msg = state.get("inbound_raw_message") or {}
            media_resp = await wa.get_media_base64(instance_name, raw_msg)
            b64_data = media_resp.get("base64", "")
            if b64_data:
                import base64
                media_bytes = base64.b64decode(b64_data)

                mime = (state.get("inbound_media_mime") or "").lower()
                fname = (state.get("inbound_media_filename") or "").lower()
                is_pdf = (
                    media_bytes[:5] == b"%PDF-"
                    or "pdf" in mime
                    or fname.endswith(".pdf")
                    or (state.get("inbound_media_type") == "document" and not mime.startswith("image/"))
                )

                if is_pdf:
                    await _handle_inbound_pdf(state, db, media_bytes)
                else:
                    await _handle_inbound_image(state, db, media_bytes)
        except Exception as e:
            logger.warning(f"Inbound media handling failed: {e}")

    return state


async def _handle_inbound_pdf(state: AgentState, db, pdf_bytes: bytes) -> None:
    """A customer sent a PDF. Persist it (dashboard view), chunk its text into the RAG
    knowledge base (so it's searchable on future turns), and stash the extracted text on
    the state so the bot can answer about it in THIS turn — no manual command, no restart."""
    from app.rag.pdf_extractor import ingest_text_pdf

    source_name = state.get("inbound_media_filename") or f"customer_{state['whatsapp_message_id']}.pdf"

    # Persist to GridFS so the dashboard shows the file the customer sent.
    # We use GridFS for PDFs instead of Cloudinary because Cloudinary restricts PDF delivery on new free accounts.
    try:
        from app.storage import gridfs
        file_id = await gridfs.upload_bytes(
            data=pdf_bytes,
            filename=source_name,
            content_type="application/pdf",
            metadata={"tenant_id": state['tenant_id'], "chat_id": state['whatsapp_message_id']}
        )
        stored_url = gridfs.public_url(file_id, source_name)
        await db.message_audit_log.update_one(
            {"whatsapp_message_id": state["whatsapp_message_id"], "direction": "INBOUND"},
            {"$set": {"media_url": stored_url, "media_type": "DOCUMENT"}},
        )
        logger.info(f"[INBOUND PDF] stored to GridFS -> {stored_url}")
    except Exception as e:
        logger.warning(f"Failed to persist inbound PDF: {e}")

    # Chunk + embed into the tenant's knowledge base (this is the RAG ingestion that
    # previously only ran via the dashboard / manual commands).
    try:
        summary = await ingest_text_pdf(
            state["tenant_id"], pdf_bytes, source_name, rebuild=True
        )
        logger.info(
            f"[INBOUND PDF] ingested {summary.get('text_chunks', 0)} chunks "
            f"from {summary.get('pages', 0)} pages of {source_name!r}"
        )
        preview = summary.get("preview") or ""
        if preview:
            state["inbound_doc_summary"] = (
                f"The customer sent a PDF named '{source_name}'. Its text contents are:\n{preview}"
            )
        elif summary.get("note"):
            state["inbound_doc_summary"] = (
                f"The customer sent a PDF named '{source_name}', but {summary['note']}"
            )
    except Exception as e:
        logger.warning(f"Inbound PDF ingestion failed: {e}")


async def _handle_inbound_image(state: AgentState, db, img_bytes: bytes) -> None:
    """A customer sent an image. Persist it and describe it with Gemini Vision (bonus B2)."""
    # Persist the customer-sent image to Cloudinary so the dashboard can show it.
    try:
        import cloudinary.uploader
        upload_result = cloudinary.uploader.upload(
            img_bytes, 
            folder=f"whatsagent/{state['tenant_id']}/chats", 
            resource_type="image"
        )
        stored_url = upload_result.get("secure_url")
        await db.message_audit_log.update_one(
            {"whatsapp_message_id": state["whatsapp_message_id"], "direction": "INBOUND"},
            {"$set": {"media_url": stored_url, "media_type": "IMAGE"}},
        )
        logger.info(f"[INBOUND IMAGE] stored to Cloudinary -> {stored_url}")
    except Exception as e:
        logger.warning(f"Failed to persist inbound image: {e}")

    # Groq Vision description (fed into the LLM context)
    groq = _get_groq()
    if not groq:
        logger.warning("Groq client not available — skipping vision description")
        return
        
    b64_img = base64.b64encode(img_bytes).decode('utf-8')
    
    try:
        vision_resp = await _groq_create(
            groq,
            model="llama-3.2-11b-vision-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text", 
                            "text": "Describe this image concisely for a customer service agent. Focus on: what product or item is shown, its appearance, condition, color, style, and any details relevant to helping the customer."
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{b64_img}",
                            },
                        },
                    ],
                }
            ],
            temperature=0.2,
            max_tokens=300
        )
        state["inbound_image_description"] = vision_resp.choices[0].message.content
        logger.info(f"[VISION] {(state['inbound_image_description'] or '')[:100]}")
    except Exception as e:
        logger.warning(f"Groq Vision failed: {e}")


# ---------------------------------------------------------------------------
# Node 3: LLM Reasoning
# ---------------------------------------------------------------------------

def _build_system_prompt(tenant: dict, rag_chunks: list, catalog_names: list | None = None) -> str:
    base = (tenant.get("system_prompt") or "").strip()
    if not base:
        # Fallback: if no system prompt is configured, use a generic one with the tenant name
        name = tenant.get("name", "this business")
        base = (
            f"You are a helpful AI assistant for {name}. "
            "Be friendly, concise, and professional. "
            "Answer questions based on the knowledge base provided. "
            "Never claim to be ChatGPT, Gemini, or any other AI product — you are a custom assistant."
        )
        logger.warning(f"[TENANT {tenant.get('tenant_id')}] No system_prompt configured — using fallback.")
    prompt = base

    # Tell the LLM what's in the catalog so it's HONEST about what exists — but CAP the
    # list so a big catalog doesn't bloat the prompt (which blows Groq's per-minute limit).
    if catalog_names:
        shown = catalog_names[:20]
        prompt += "\n\n--- SAMPLE OF YOUR CATALOG ---\n"
        for n in shown:
            prompt += f"- {n}\n"
        if len(catalog_names) > len(shown):
            prompt += f"...and {len(catalog_names) - len(shown)} more products.\n"
        prompt += (
            "Use the search_catalog tool to find a specific product before describing or sending it. "
            "Never invent products you don't have; if you're unsure, search first or offer the full *catalog*.\n"
            "--- END CATALOG ---\n"
        )

    # Tell the LLM EXACTLY what media files exist so it never promises
    # or re-sends something it doesn't have.
    media_lib = tenant.get("media_library", {})
    if media_lib:
        # Deduplicate by URL (e.g. 'catalog' and 'brochure' may share one file)
        seen_urls = {}
        for keyword, url in media_lib.items():
            seen_urls.setdefault(url, []).append(keyword)
        prompt += "\n\n--- MEDIA YOU CAN SEND (via get_media tool) ---\n"
        for url, keywords in seen_urls.items():
            kind = "PDF document" if url.lower().endswith(".pdf") else "image"
            # Show humanized labels AND all raw keywords so LLM can match loosely
            human_labels = [k.replace("_", " ").replace("-", " ") for k in keywords]
            prompt += f"- {kind}: labels = {human_labels} → call get_media with the most relevant label\n"
        prompt += (
            "IMPORTANT: When the user asks for any media using ANY synonym, related word, or rough description,"
            " pick the CLOSEST label from the list above and call get_media with it. "
            "For example: if labels include 'profile pic' and the user says 'send your photo', 'your pic', or 'image of you', "
            "call get_media with keyword='profile pic'. Do NOT say you don't have it if a close match exists.\n"
            "This is the COMPLETE list of files you have. You have exactly ONE file per item above.\n"
            "If a customer asks for 'more' images or something not in this list, do NOT re-send the same "
            "file. Instead, honestly say that's the piece you have on hand and offer the full *catalog* "
            "to see the complete range. Only call get_media when the customer actually wants to receive a file.\n"
            "DISAMBIGUATION RULE: If get_media returns status='ambiguous', do NOT send any file. "
            "Instead, list the candidate options as a friendly numbered list and ask the user to pick. "
            "Example: 'I have a few options — which one do you want?\n1️⃣ Food Menu\n2️⃣ Drinks Menu'. "
            "Wait for their reply, then call get_media again with the exact choice.\n"
            "--- END MEDIA LIST ---\n"
        )

    if rag_chunks:
        prompt += "\n\n--- RELEVANT KNOWLEDGE BASE ---\n"
        for i, chunk in enumerate(rag_chunks[:4], 1):     # cap count
            prompt += f"\n[{i}] {chunk[:500]}\n"          # and length, to limit tokens
        prompt += "\n--- END KNOWLEDGE BASE ---\n"
        prompt += (
            "\nBase your answer on the knowledge base above. "
            "Do not fabricate prices, specs, or policies not mentioned."
        )
        
    prompt += (
        "\n\nIMPORTANT: If the user uses frustrated language, complains, or exhibits a negative sentiment, "
        "you MUST immediately trigger the escalate_to_human tool so a live agent can take over.\n"
        "CRITICAL LANGUAGE RULE: If the user writes in Hindi or Nepali using English letters (e.g., Roman Hindi / Roman Nepali / Hinglish), "
        "you MUST reply in the exact same Roman script (Hinglish/Roman Nepali). Do NOT reply in Devanagari script or pure English. "
        "Match their transliterated style exactly."
    )
    return prompt


def _media_reply_template(key: str, media_type: str) -> str:
    """
    Single zero-token template with a dynamic label.
    Uses 'our' for business content (catalog, menu, services)
    and 'your' for customer-specific content (bill, invoice, ticket).
    """
    label = key.replace("_", " ").replace("-", " ").title()
    icon = "📄" if media_type == "DOCUMENT" else "📎"

    # Keywords that belong to the CUSTOMER personally → "your"
    personal_keywords = (
        "bill", "invoice", "receipt", "ticket", "booking", "order",
        "statement", "report", "estimate", "quote", "contract", "agreement",
        "subscription", "plan", "payment", "refund", "warranty", "certificate",
        "card", "id", "pass", "record"
    )
    k = key.lower().replace("_", " ").replace("-", " ")
    if any(w in k for w in personal_keywords):
        return f"Here is your {label} {icon} — let me know if you have any questions! 😊"

    # Everything else is business content → "our"
    return f"Here is our {label} {icon} — let me know if you have any questions or need anything else! 😊"


async def _media_kind(url: str) -> str:
    """
    Decide whether a media URL is a 'DOCUMENT' (PDF) or 'IMAGE'. Uses the file
    extension when present; for extension-less GridFS URLs (/files/<id>) it looks up
    the stored content_type — so PDFs uploaded via the dashboard are sent as documents,
    not as broken images.
    """
    low = (url or "").split("?")[0].lower()
    if low.endswith(".pdf"):
        return "DOCUMENT"
    if low.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
        return "IMAGE"
    if "/files/" in low:
        ref = url.split("?")[0].rstrip("/").split("/files/")[-1].split(".")[0]
        try:
            from bson import ObjectId
            doc = await get_db()["media.files"].find_one(
                {"_id": ObjectId(ref)}, {"metadata.content_type": 1, "filename": 1}
            )
            ct = ((doc or {}).get("metadata") or {}).get("content_type", "")
            fn = (doc or {}).get("filename", "")
            if "pdf" in ct.lower() or fn.lower().endswith(".pdf"):
                return "DOCUMENT"
        except Exception as e:
            logger.warning(f"_media_kind lookup failed for {url}: {e}")
    return "IMAGE"


async def llm_reasoning_node(state: AgentState) -> AgentState:
    """
    Primary reasoning via Groq (llama-3.3-70b) with tool calling.
    Tools: get_media, search_catalog, search_knowledge, escalate_to_human.
    """
    if state.get("error"):
        state["llm_reply"] = "Sorry, I'm having technical difficulties. Please try again shortly."
        return state

    tenant = state["tenant_config"]
    system_prompt = _build_system_prompt(tenant, state.get("rag_chunks") or [], state.get("catalog_names"))

    # Build OpenAI-style message list: system + last-5 history + current
    messages = [{"role": "system", "content": system_prompt}]
    for m in (state.get("chat_history") or [])[:-1]:
        role = "user" if m["direction"] == "INBOUND" else "assistant"
        if m.get("text_content"):
            messages.append({"role": role, "content": m["text_content"]})

    user_text = state["inbound_text"]
    if state.get("inbound_image_description"):
        user_text = f"[Customer sent an image: {state['inbound_image_description']}]\n{user_text}"
    if state.get("inbound_doc_summary"):
        user_text = f"[{state['inbound_doc_summary']}]\n{user_text}"
    messages.append({"role": "user", "content": user_text})

    groq = _get_groq()
    if not groq:
        state["llm_reply"] = "I'm here to help! Could you tell me a bit more about what you're looking for?"
        return state

    try:
        resp = await _groq_create(
            groq,
            model=settings.groq_model,
            messages=messages,
            tools=_groq_tools,
            tool_choice="auto",
            temperature=0.4,
            max_tokens=500,
        )
    except Exception as e:
        logger.error(f"Groq call failed after retries: {e}")
        # Don't blame the customer — be honest that we're momentarily busy.
        state["llm_reply"] = (
            "Sorry, I'm handling a lot of requests right now 🙏 Please give me a few "
            "seconds and ask again — I'll be right with you."
        )
        return state

    msg = resp.choices[0].message
    final_reply = msg.content
    media_url = media_type = media_filename = None

    if msg.tool_calls:
        # Files already sent earlier in this conversation (to avoid re-sending)
        already_sent = {
            m.get("media_url")
            for m in (state.get("chat_history") or [])
            if m.get("direction") == "OUTBOUND" and m.get("media_url")
        }

        # Record the assistant's tool-call turn, then a tool result per call
        messages.append({
            "role": "assistant", "content": msg.content or "",
            "tool_calls": [
                {"id": tc.id, "type": "function",
                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in msg.tool_calls
            ],
        })

        for tc in msg.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except Exception:
                args = {}
            result = {}

            if name == "get_media":
                raw_kw = (args.get("keyword") or "")
                # Normalize: strip underscores, dashes, extra spaces, lowercase
                norm = lambda s: " ".join(s.lower().replace("_", " ").replace("-", " ").split())
                keyword = norm(raw_kw)
                logger.info(f"[TOOL] get_media({keyword!r}) -> MongoDB media_library")

                # Build a normalized lookup map: normalized_key → (original_key, url)
                norm_map: dict[str, list[tuple[str, str]]] = {}
                for k, u in (tenant.get("media_library") or {}).items():
                    nk = norm(k)
                    norm_map.setdefault(nk, []).append((k, u))

                # Find all keys whose normalized form matches the query
                matches = norm_map.get(keyword, [])

                matched = None
                if len(matches) == 0:
                    logger.info(f"[MEDIA] no match for {keyword!r}")
                    result = {"status": "not_found", "note": "No such file; offer the catalog instead."}

                elif len(matches) == 1:
                    best_key, best_url = matches[0]
                    media_url, matched = best_url, best_key
                    media_type = await _media_kind(best_url)
                    if media_type == "DOCUMENT":
                        media_filename = f"{best_key.title().replace(' ', '_')}.pdf"
                    logger.info(f"[MEDIA] matched {best_key!r} -> {media_type}: {best_url}")
                    result = {"status": "sent", "item": matched, "type": media_type}

                else:
                    # Multiple keys share the same normalized name (e.g. 'food menu' and 'food_menu')
                    # → send the first one, they point to the same intent
                    best_key, best_url = matches[0]
                    media_url, matched = best_url, best_key
                    media_type = await _media_kind(best_url)
                    if media_type == "DOCUMENT":
                        media_filename = f"{best_key.title().replace(' ', '_')}.pdf"
                    logger.info(f"[MEDIA] matched (dedup) {best_key!r} -> {media_type}")
                    result = {"status": "sent", "item": matched, "type": media_type}


            elif name == "search_catalog":
                desc = args.get("description") or ""
                logger.info(f"[TOOL] search_catalog({desc!r}) -> Chroma catalog (data only)")
                item = search_catalog(desc, state["tenant_id"])
                if item:
                    logger.info(f"[CATALOG] matched {item['name']!r}")
                    result = {"found": True, "name": item["name"], "price": item["price"], "details": item["details"]}
                else:
                    logger.info("[CATALOG] no match")
                    result = {"found": False, "note": "No matching product; offer the full catalog or ask for detail."}

            elif name == "search_knowledge":
                q = args.get("query") or ""
                cat = args.get("category") or "all"
                logger.info(f"[TOOL] search_knowledge(query={q!r}, category={cat!r})")
                extra = search_knowledge_base(q, state["tenant_id"], category=cat)
                existing = state.get("rag_chunks") or []
                state["rag_chunks"] = existing + [c for c in extra if c not in existing]
                result = {"results": extra[:3] if extra else "no additional info found"}

            elif name == "escalate_to_human":
                logger.info("[TOOL] escalate_to_human -> NEEDS_HUMAN")
                state["session_status"] = "NEEDS_HUMAN"
                result = {"status": "escalated"}

            messages.append({
                "role": "tool", "tool_call_id": tc.id, "name": name,
                "content": json.dumps(result),
            })

        # -----------------------------------------------------------------------
        # CALL 2 — Smart template engine (zero tokens) for media sends.
        # Only fall back to LLM when genuinely needed.
        # -----------------------------------------------------------------------
        
        # Determine what kinds of tools were called
        tool_names_called = {tc.function.name for tc in msg.tool_calls}
        tool_results = {tc.function.name: json.loads(tc.function.arguments or "{}") for tc in msg.tool_calls}
        
        # Check if ALL tool results are "handled" by templates
        needs_llm_call2 = False
        ambiguous_candidates = []
        
        for tc in msg.tool_calls:
            name = tc.function.name
            # Parse result from messages list (last appended tool message per tool call)
            try:
                tool_result = json.loads(messages[-len(msg.tool_calls) + list(tool_names_called).index(name)]["content"])
            except Exception:
                tool_result = {}
            
            if name == "get_media":
                status = (tool_result.get("status") or "")
                if status == "not_found":
                    needs_llm_call2 = True  # LLM handles "I don't have that"
                # status == "sent" → template handles it ✅
            elif name in ("search_catalog", "search_knowledge", "escalate_to_human"):
                needs_llm_call2 = True  # These always need natural language
        
        if needs_llm_call2:
            # LLM Call 2 only when necessary
            try:
                resp2 = await _groq_create(
                    groq, model=settings.groq_model, messages=messages, temperature=0.5, max_tokens=400,
                )
                final_reply = resp2.choices[0].message.content or final_reply
                logger.info("[CALL2] LLM used for complex/ambiguous response")
            except Exception as e:
                logger.warning(f"Groq follow-up failed: {e}")
        
        pass  # template applied post-dedup below


    # DEDUP: must happen BEFORE template so template is never sent without the file.
    if media_url:
        recent_media = {
            m.get("media_url")
            for m in (state.get("chat_history") or [])
            if m.get("direction") == "OUTBOUND" and m.get("media_url")
        }
        if media_url in recent_media:
            logger.info(f"[DEDUP] {media_url} already sent recently -> clearing media")
            media_url = media_type = media_filename = matched = None

    # Apply zero-token template ONLY when media_url is confirmed valid after dedup
    if media_url and matched and not final_reply:
        final_reply = _media_reply_template(matched, media_type or "IMAGE")
        logger.info(f"[CALL2] Template used for {matched!r} (0 tokens)")

    # Fallbacks
    if not final_reply:
        if media_type == "DOCUMENT":
            final_reply = "Here you go! 📄 Let me know if anything catches your eye."
        elif media_type == "IMAGE":
            final_reply = "Here it is! 😊 Want to see more? I can share our full catalog."
        else:
            final_reply = "I'm here to help! Could you tell me a bit more about what you're looking for?"

    # HONESTY GUARD: never claim to have sent/attached a file when none is attached.
    if not media_url and re.search(
        r"(i'?ve sent|i have sent|just sent|sent you|i'?ve attached|attached is|"
        r"here'?s the (image|photo|picture|pdf|catalog|document|diagram|invoice|file)|"
        r"here is (our|your))",
        final_reply or "", re.I,
    ):
        final_reply = (
            "Hmm, I don't have that exact file on hand 😊 — but I can share our full "
            "*catalog* so you can browse everything. Would you like me to send it over?"
        )

    state["llm_reply"] = final_reply
    state["media_to_send"] = media_url
    state["media_type"] = media_type
    state["media_filename"] = media_filename

    logger.info(f"[REPLY] {final_reply[:150]!r}")
    if media_url:
        logger.info(f"[REPLY] + attaching {media_type}: {media_filename or media_url}")
    logger.info(f"[STATUS] session -> {state['session_status']}")
    return state


# ---------------------------------------------------------------------------
# Node 4: Dispatcher
# ---------------------------------------------------------------------------

async def dispatcher_node(state: AgentState) -> AgentState:
    """
    Sends WhatsApp reply (text + optional media) via Evolution API.
    Saves outbound message to MongoDB.
    Updates session status.
    """
    instance_name = (
        (state.get("tenant_config") or {}).get("evolution_instance")
        or "default"
    )
    to = state["customer_phone"]
    db = get_db()

    try:
        await wa.send_text_message(instance_name, to, state["llm_reply"])
    except Exception as e:
        logger.error(f"Failed to send text message: {e}")

    if state.get("media_to_send"):
        try:
            if state["media_type"] == "IMAGE":
                await wa.send_image_message(instance_name, to, state["media_to_send"])
            elif state["media_type"] == "DOCUMENT":
                await wa.send_document_message(
                    instance_name, to, state["media_to_send"], state["media_filename"]
                )
        except Exception as e:
            logger.error(f"Failed to send media: {e}")

    # Determine final status. After a normal reply the bot stays ON DUTY
    # (WAITING_FOR_BOT) — it is NOT "resolved". RESOLVED is a human action only.
    # If the turn escalated, keep NEEDS_HUMAN so auto-replies stay paused.
    new_status = "NEEDS_HUMAN" if state["session_status"] == "NEEDS_HUMAN" else "WAITING_FOR_BOT"

    # Save outbound message
    await db.message_audit_log.insert_one({
        "message_id": str(uuid4()),
        "session_id": state["session_id"],
        "tenant_id": state["tenant_id"],
        "direction": "OUTBOUND",
        "sender": "BOT",
        "text_content": state["llm_reply"],
        "media_url": state.get("media_to_send"),
        "media_type": state.get("media_type"),
        "media_filename": state.get("media_filename"),
        "agent_state": "SENT",
        "timestamp": datetime.utcnow(),
    })

    # Update session
    await db.chat_sessions.update_one(
        {"session_id": state["session_id"]},
        {
            "$set": {"status": new_status, "last_message_at": datetime.utcnow()},
            "$inc": {"message_count": 2},
        },
    )

    state["session_status"] = new_status
    return state
