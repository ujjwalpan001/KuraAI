import asyncio
import base64
import json
import logging
import re
from datetime import datetime, timedelta
from uuid import uuid4

from app.agent.state import AgentState
from app.agent.tools import TOOLS
from app.config import settings
from app.db.mongodb import get_db
from app.rag.vector_client import search_knowledge_base, search_catalog
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

    tenant = state.get("tenant_config") or {}
    retention_hours = int(tenant.get("retention_hours") or 72)
    expires_at = datetime.utcnow() + timedelta(hours=retention_hours)
    
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
        "expires_at": expires_at,
    })

    # Update session status
    await db.chat_sessions.update_one(
        {"session_id": state["session_id"]},
        {"$set": {"status": "AGENT_RESPONDING", "last_message_at": datetime.utcnow(), "expires_at": expires_at}},
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
    
    # Global settings
    state["global_settings"] = await db.global_settings.find_one({"_id": "main"}) or {}
    
    # Context Vars (saved dynamically)
    session = await db.chat_sessions.find_one({"session_id": state["session_id"]})
    session_vars = session.get("context_vars", {}) if session else {}
    
    # Cross-session persistent customer profile
    customer = await db.customers.find_one({"tenant_id": state["tenant_id"], "customer_phone": state["customer_phone"]})
    profile_vars = customer.get("profile", {}) if customer else {}
    
    # Merge them (session vars override profile vars if conflict)
    state["context_vars"] = {**profile_vars, **session_vars}
    
    # Ensure any session-specific variables are synced back to the global customer profile
    if session_vars:
        await db.customers.update_one(
            {"tenant_id": state["tenant_id"], "customer_phone": state["customer_phone"]},
            {"$set": {"profile": state["context_vars"], "last_updated": datetime.utcnow()}},
            upsert=True
        )

    # Catalog inventory (names) so the bot is HONEST about what actually exists
    cat = await db.catalog_items.find(
        {"tenant_id": state["tenant_id"], "is_active": True}, {"name": 1}
    ).to_list(None)
    state["catalog_names"] = [c["name"] for c in cat]

    # Last 6 messages (oldest first) to save API tokens
    msgs = await db.message_audit_log.find(
        {"session_id": state["session_id"]}
    ).sort("timestamp", -1).limit(6).to_list(6)
    state["chat_history"] = list(reversed(msgs))

    # RAG chunks are now lazy-loaded ONLY if the LLM calls the search_knowledge tool.
    state["rag_chunks"] = []

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
            model=settings.groq_model,
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

def _build_system_prompt(tenant: dict, global_settings: dict, catalog_names: list | None = None, context_vars: dict = None) -> str:
    prompt = ""
    
    if context_vars:
        prompt += "--- DYNAMICALLY COLLECTED USER DETAILS ---\n"
        prompt += "These details have already been saved to the database. You do NOT need to ask for them again.\n"
        for k, v in context_vars.items():
            prompt += f"- {k}: {v}\n"
        prompt += "------------------------------------------\n\n"

    # Tell the LLM what's in the catalog so it's HONEST about what exists
    if catalog_names:
        shown = catalog_names[:20]
        prompt += "--- SAMPLE OF YOUR CATALOG ---\n"
        for n in shown:
            prompt += f"- {n}\n"
        if len(catalog_names) > len(shown):
            prompt += f"...and {len(catalog_names) - len(shown)} more products.\n"
        prompt += (
            "Use the search_catalog tool to find a specific product before describing or sending it. "
            "Never invent products you don't have; if you're unsure, search first or offer the full *catalog*.\n"
            "--- END CATALOG ---\n\n"
        )

    # Tell the LLM EXACTLY what media files exist
    media_lib = tenant.get("media_library", {})
    if media_lib:
        seen_urls = {}
        for keyword, url in media_lib.items():
            seen_urls.setdefault(url, []).append(keyword)
        prompt += "--- MEDIA YOU CAN SEND (via get_media tool) ---\n"
        for url, keywords in seen_urls.items():
            kind = "PDF document" if url.lower().endswith(".pdf") else "image"
            human_labels = [k.replace("_", " ").replace("-", " ") for k in keywords]
            prompt += f"- {kind}: labels = {human_labels} → call get_media with the most relevant label\n"
        prompt += (
            "IMPORTANT: When the user asks for any media using ANY synonym, related word, or rough description, "
            "pick the CLOSEST label from the list above and call get_media with it. "
            "Only call get_media when the customer actually wants to receive a file.\n"
            "DISAMBIGUATION RULE: If get_media returns status='ambiguous', do NOT send any file. "
            "Instead, list the candidate options as a friendly numbered list and ask the user to pick.\n"
            "--- END MEDIA LIST ---\n\n"
        )

    prompt += (
        "WHATSAPP FORMATTING RULES (STRICTLY ENFORCED):\n"
        "- NEVER use Markdown tables (`| Column |`). WhatsApp DOES NOT support them and they look terrible.\n"
        "- NEVER use Markdown headers (`#` or `##`).\n"
        "- Use ONLY basic WhatsApp formatting: *bold* for emphasis, and bullet points (`-`) for lists.\n"
        "- Keep responses clean, readable, and mobile-friendly.\n\n"
    )

    if not tenant.get("exclusive_prompt_mode"):
        master_prompt = global_settings.get("master_system_prompt", "").strip()
        if not master_prompt:
            # Fallback if superadmin hasn't configured it yet
            master_prompt = (
                "IMPORTANT: If the user uses frustrated language, complains, or exhibits a negative sentiment, "
                "you MUST immediately trigger the escalate_to_human tool so a live agent can take over.\n"
                "CRITICAL LANGUAGE RULE: If the user writes in Hindi or Nepali using English letters (e.g., Roman Hindi / Roman Nepali / Hinglish), "
                "you MUST reply in the exact same Roman script (Hinglish/Roman Nepali). Match their transliterated style exactly.\n"
            )
        prompt += f"{master_prompt}\n\n"

    if tenant.get("orders_enabled"):
        reqs = tenant.get("order_requirements") or []
        if reqs:
            prompt += "--- ORDER PROCESSING INSTRUCTIONS ---\n"
            prompt += "To place an order or booking for the customer, you MUST collect the following information from them first:\n"
            for r in reqs:
                prompt += f"- {r}\n"
            prompt += (
                "CRITICAL INSTRUCTION: First, check the 'DYNAMICALLY COLLECTED USER DETAILS' above. If the customer has ordered before, their details might already be saved!\n"
                "If some or all required details are missing, you MUST ask the customer for ALL the missing details AT ONCE in a single friendly message to save time.\n"
                "If the details are ALREADY present in the 'DYNAMICALLY COLLECTED USER DETAILS', do NOT ask them to type it again. Instead, show them the data you have and ask them to confirm if it is correct.\n"
                "Once you have confirmed or collected ALL this information, call the `place_order` tool.\n"
            )
            
            if tenant.get("returns_enabled"):
                prompt += f"IMPORTANT: This store has a strict {tenant.get('return_days', 7)}-day return policy from the date of delivery/purchase.\n"
            if tenant.get("cancellations_enabled"):
                prompt += f"IMPORTANT: Cancellations are only allowed within {tenant.get('cancellation_hours', 24)} hours of order placement, provided the order is not shipped.\n"
                
            prompt += "--- END ORDER PROCESSING ---\n\n"

    name = tenant.get("name", "this business")
    identity = (
        f"You are the official AI virtual assistant for '{name}'. "
        "You are NOT ChatGPT, you are NOT Gemini, and you do not work for OpenAI or Groq. "
        f"You are exclusively an assistant for {name}.\n"
    )

    # Select the base prompt based on mode
    if tenant.get("exclusive_prompt_mode"):
        base = (tenant.get("exclusive_prompt") or "").strip()
    else:
        base = (tenant.get("system_prompt") or "").strip()
        
    if not base:
        base = (
            "Be friendly, concise, and professional. "
            "Answer questions based on the knowledge base provided."
        )

    prompt += "--- ANTI-HALLUCINATION & RAG RULES ---\n"
    prompt += (
        "1. NEVER guess or invent prices, services, or facts. "
        "2. If the user asks about ANY products, services, pricing, or business details, you MUST call the `search_knowledge` or `search_catalog` tool first to verify the facts.\n"
        "3. Only answer from your general knowledge if the user is making casual small talk (like saying 'Hi').\n\n"
    )

    prompt += "--- FORMATTING RULES ---\n"
    prompt += "CRITICAL: Do NOT use markdown formatting like asterisks (*) for bold text. Your output must be plain text without any asterisks.\n\n"
    
    prompt += "--- CORE INSTRUCTIONS ---\n"
    prompt += "You MUST strictly follow these instructions above all else:\n"
    prompt += identity
    prompt += base
    
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
    system_prompt = _build_system_prompt(
        tenant, 
        state.get("global_settings", {}), 
        state.get("catalog_names"),
        state.get("context_vars", {})
    )

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

    # Filter available tools based on tenant config
    active_groq_tools = []
    for gt in _groq_tools:
        name = gt["function"]["name"]
        if name == "place_order" and not tenant.get("orders_enabled"):
            continue
        if name == "initiate_return" and not tenant.get("returns_enabled"):
            continue
        if name == "cancel_order" and not tenant.get("cancellations_enabled"):
            continue
        active_groq_tools.append(gt)

    try:
        resp = await _groq_create(
            groq,
            model=settings.groq_model,
            messages=messages,
            tools=active_groq_tools,
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
                logger.info(f"[TOOL] search_knowledge(query={q!r})")
                extra = search_knowledge_base(q, state["tenant_id"])
                existing = state.get("rag_chunks") or []
                state["rag_chunks"] = existing + [c for c in extra if c not in existing]
                result = {"results": extra[:3] if extra else "no additional info found"}

            elif name == "escalate_to_human":
                logger.info("[TOOL] escalate_to_human -> NEEDS_HUMAN")
                state["session_status"] = "NEEDS_HUMAN"
                
                owner_number = tenant.get("owner_number")
                if owner_number:
                    cust_phone = state.get("customer_phone", "")
                    alert_text = f"🚨 *Human Escalation Alert*\n\nCustomer *{cust_phone}* has requested human assistance. Please log into the dashboard or reply directly from this WhatsApp number to take over."
                    try:
                        instance_name = tenant.get("evolution_instance") or "default"
                        import app.whatsapp.client as local_wa
                        await local_wa.send_text_message(instance_name, owner_number, alert_text)
                    except Exception as e:
                        logger.error(f"Failed to send escalation alert to owner: {e}")

                result = {"status": "escalated"}

            elif name == "save_customer_detail":
                key = args.get("key") or ""
                val = args.get("value") or ""
                logger.info(f"[TOOL] save_customer_detail({key!r} = {val!r})")
                if key and val:
                    db = get_db()
                    await db.chat_sessions.update_one(
                        {"session_id": state["session_id"]},
                        {"$set": {f"context_vars.{key}": val}}
                    )
                    # Save permanently to customers collection for cross-session memory
                    await db.customers.update_one(
                        {"tenant_id": state["tenant_id"], "customer_phone": state["customer_phone"]},
                        {"$set": {f"profile.{key}": val, "last_updated": datetime.utcnow()}},
                        upsert=True
                    )
                    
                    # Also update our local state so the next LLM call knows it's saved
                    if "context_vars" not in state or not state["context_vars"]:
                        state["context_vars"] = {}
                    state["context_vars"][key] = val
                    result = {"status": "success", "message": f"Successfully saved {key} = {val}."}
                else:
                    result = {"status": "error", "message": "Key or value missing."}

            elif name == "place_order":
                product = args.get("product_name") or ""
                qty = args.get("quantity") or 1
                try:
                    info = json.loads(args.get("collected_info") or "{}")
                except Exception:
                    info = {"raw": args.get("collected_info")}
                
                # Merge dynamically saved details (from save_customer_detail) into the final order
                existing_keys = {str(k).lower().replace(" ", "").replace("_", "") for k in info.keys()}
                existing_values = {str(val).lower().strip() for val in info.values()}
                
                for k, v in state.get("context_vars", {}).items():
                    norm_k = str(k).lower().replace(" ", "").replace("_", "")
                    norm_v = str(v).lower().strip()
                    if norm_k not in existing_keys and norm_v not in existing_values:
                        info[k] = v
                        
                logger.info(f"[TOOL] place_order(product={product!r}, info={info})")
                
                order_id_str = f"ORD-{str(uuid4())[:6].upper()}"
                
                db = get_db()
                order_doc = {
                    "tenant_id": state["tenant_id"],
                    "session_id": state["session_id"],
                    "customer_phone": state["customer_phone"],
                    "order_id": order_id_str,
                    "product_name": product,
                    "quantity": qty,
                    "collected_info": info,
                    "status": "PENDING",
                    "created_at": datetime.utcnow()
                }
                await db.orders.insert_one(order_doc)
                
                # Send notification to admin
                try:
                    admin_numbers = tenant.get("personal_numbers") or []
                    if tenant.get("owner_number") and tenant.get("owner_number") not in admin_numbers:
                        admin_numbers.append(tenant.get("owner_number"))
                    if admin_numbers:
                        instance_name = (state.get("tenant_config") or {}).get("evolution_instance") or "default"
                        notif_msg = f"🛒 *NEW ORDER RECEIVED!*\n\n*ID:* {order_id_str}\n*Product:* {product} (x{qty})\n*Customer:* {state['customer_phone']}\n*Details:* {json.dumps(info, indent=2)}\n\n_Check your dashboard to manage this order._"
                        for number in admin_numbers:
                            import app.whatsapp.client as wa
                            await wa.send_text_message(instance_name, number, notif_msg)
                except Exception as e:
                    logger.warning(f"Failed to send admin order notification: {e}")
                    
                msg_suffix = ""
                if tenant.get("payment_details"):
                    msg_suffix = f"\n\nCRITICAL: The store has payment methods configured. You MUST now ask the customer if they want to pay for their order now (e.g. 'Would you like to pay now?'). If they say yes, give them these payment details: {tenant.get('payment_details')}. If the customer asks for a QR code, or if you want to proactively send a payment QR code, use the get_media tool with the exact keyword 'payment_qr'."

                result = {"status": "success", "message": f"Order saved successfully. The order ID is {order_id_str}. Please generate a friendly confirmation reply and give the customer their Order ID.{msg_suffix}"}

            elif name == "submit_payment_proof":
                txn_id = args.get("transaction_id") or ""
                logger.info(f"[TOOL] submit_payment_proof(txn={txn_id!r})")
                
                # Hard validation to prevent LLM from hallucinating a proof when user just says "okay"
                has_image = state.get("inbound_media_type") in ("image", "document") or state.get("inbound_image_description")
                inbound_text = state.get("inbound_text") or ""
                import re
                has_txn_number = bool(re.search(r'[A-Za-z0-9]{6,}', inbound_text))
                
                if not has_image and not has_txn_number:
                    result = {
                        "status": "error",
                        "message": "Payment proof rejected. The customer DID NOT attach a screenshot and DID NOT provide a valid transaction ID number in their text. You MUST reply to the customer asking them to explicitly upload a screenshot of the payment or type the exact transaction ID."
                    }
                else:
                    db = get_db()
                
                # Find the most recent PENDING order for this customer
                recent_order = await db.orders.find_one(
                    {"tenant_id": state["tenant_id"], "customer_phone": state["customer_phone"], "status": "PENDING"},
                    sort=[("created_at", -1)]
                )
                
                if recent_order:
                    await db.orders.update_one(
                        {"_id": recent_order["_id"]},
                        {"$set": {
                            "payment_status": "VERIFICATION_PENDING",
                            "payment_proof": txn_id
                        }}
                    )
                    
                    # Notify admin
                    try:
                        admin_numbers = tenant.get("personal_numbers") or []
                        if tenant.get("owner_number") and tenant.get("owner_number") not in admin_numbers:
                            admin_numbers.append(tenant.get("owner_number"))
                        if admin_numbers:
                            instance_name = (state.get("tenant_config") or {}).get("evolution_instance") or "default"
                            notif_msg = f"💳 *PAYMENT PROOF SUBMITTED!*\n\n*Customer:* {state['customer_phone']}\n*Order:* {recent_order.get('product_name')}\n*Proof:* {txn_id}\n\n_Please check your dashboard to verify this payment._"
                            for number in admin_numbers:
                                import app.whatsapp.client as wa
                                await wa.send_text_message(instance_name, number, notif_msg)
                    except Exception as e:
                        logger.warning(f"Failed to send admin payment notification: {e}")
                        
                    result = {"status": "success", "message": "Payment proof attached to order. Tell the customer it's sent to finance for verification."}
                else:
                    result = {"status": "error", "message": "No pending orders found for this customer."}

            elif name == "initiate_return":
                target_order_id = args.get("order_id") or ""
                reason = args.get("reason") or ""
                logger.info(f"[TOOL] initiate_return(order_id={target_order_id!r}, reason={reason!r})")
                
                db = get_db()
                order = await db.orders.find_one({"tenant_id": state["tenant_id"], "order_id": target_order_id.strip()})
                
                if not order:
                    result = {"status": "error", "message": "Order not found. Ask the customer to verify the Order ID."}
                else:
                    days_since_purchase = (datetime.utcnow() - order.get("created_at", datetime.utcnow())).days
                    return_days = tenant.get("return_days", 7)
                    if days_since_purchase > return_days:
                        result = {"status": "error", "message": f"Return rejected. Order was placed {days_since_purchase} days ago (exceeds {return_days}-day return policy)."}
                    else:
                        await db.orders.update_one(
                            {"_id": order["_id"]},
                            {"$set": {"status": "RETURN_REQUESTED", "return_reason": reason}}
                        )
                        # Notify admin
                        try:
                            admin_numbers = tenant.get("personal_numbers") or []
                            if tenant.get("owner_number") and tenant.get("owner_number") not in admin_numbers:
                                admin_numbers.append(tenant.get("owner_number"))
                            if admin_numbers:
                                instance_name = (state.get("tenant_config") or {}).get("evolution_instance") or "default"
                                notif_msg = f"⚠️ *RETURN REQUESTED!*\n\n*Order ID:* {target_order_id}\n*Customer:* {state['customer_phone']}\n*Reason:* {reason}\n\n_Please check your dashboard to process the return._"
                                for number in admin_numbers:
                                    import app.whatsapp.client as wa
                                    await wa.send_text_message(instance_name, number, notif_msg)
                        except Exception as e:
                            logger.warning(f"Failed to send admin return notification: {e}")
                            
                        result = {"status": "success", "message": "Return request initiated successfully. Inform the customer."}

            elif name == "check_order_status":
                target_order_id = args.get("order_id") or ""
                db = get_db()
                if target_order_id:
                    order = await db.orders.find_one({"tenant_id": state["tenant_id"], "order_id": target_order_id.strip()})
                else:
                    # Find the most recent order for this customer
                    order = await db.orders.find_one(
                        {"tenant_id": state["tenant_id"], "customer_phone": state["customer_phone"]},
                        sort=[("created_at", -1)]
                    )
                
                if not order:
                    result = {"status": "error", "message": "No order found. Ask the customer if they have an Order ID."}
                else:
                    result = {
                        "status": "success",
                        "order_id": order.get("order_id"),
                        "product_name": order.get("product_name"),
                        "current_status": order.get("status"),
                        "payment_status": order.get("payment_status")
                    }

            elif name == "cancel_order":
                target_order_id = args.get("order_id") or ""
                db = get_db()
                order = await db.orders.find_one({"tenant_id": state["tenant_id"], "order_id": target_order_id.strip()})
                
                if not order:
                    result = {"status": "error", "message": "Order not found. Ask the customer to verify the Order ID."}
                else:
                    # Check status
                    if order.get("status") not in ["PENDING", "PROCESSING"]:
                        result = {"status": "error", "message": f"Order cannot be cancelled because its status is {order.get('status')}. Cancellations are only allowed for PENDING or PROCESSING orders."}
                    else:
                        # Check time limit
                        hours_since_purchase = (datetime.utcnow() - order.get("created_at", datetime.utcnow())).total_seconds() / 3600
                        cancellation_hours = tenant.get("cancellation_hours", 24)
                        if hours_since_purchase > cancellation_hours:
                            result = {"status": "error", "message": f"Cancellation rejected. Order was placed {int(hours_since_purchase)} hours ago (exceeds {cancellation_hours}-hour cancellation policy)."}
                        else:
                            await db.orders.update_one(
                                {"_id": order["_id"]},
                                {"$set": {"status": "CANCELLED"}}
                            )
                            # Notify admin
                            try:
                                admin_numbers = tenant.get("personal_numbers") or []
                                if tenant.get("owner_number") and tenant.get("owner_number") not in admin_numbers:
                                    admin_numbers.append(tenant.get("owner_number"))
                                if admin_numbers:
                                    instance_name = (state.get("tenant_config") or {}).get("evolution_instance") or "default"
                                    notif_msg = f"❌ *ORDER CANCELLED!*\n\n*Order ID:* {target_order_id}\n*Customer:* {state['customer_phone']}\n\n_The customer successfully cancelled this order._"
                                    for number in admin_numbers:
                                        import app.whatsapp.client as wa
                                        await wa.send_text_message(instance_name, number, notif_msg)
                            except Exception as e:
                                logger.warning(f"Failed to send admin cancel notification: {e}")
                            
                            result = {"status": "success", "message": "Order cancelled successfully. Inform the customer."}

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
            elif name in ("search_catalog", "search_knowledge", "escalate_to_human", "place_order", "submit_payment_proof", "initiate_return", "cancel_order", "check_order_status", "save_customer_detail"):
                needs_llm_call2 = True  # These always need natural language
        
        if needs_llm_call2:
            # Prevent Groq 400 error by explicitly allowing tools but instructing it not to use them
            messages.append({
                "role": "system", 
                "content": "Tool execution was successful. You MUST now reply to the user in natural language. DO NOT call any more tools. Just respond to the customer."
            })
            try:
                resp2 = await _groq_create(
                    groq, 
                    model=settings.groq_model, 
                    messages=messages, 
                    tools=active_groq_tools,
                    tool_choice="none",
                    temperature=0.5, 
                    max_tokens=400,
                )
                msg2 = resp2.choices[0].message
                if msg2.content:
                    final_reply = msg2.content
                    logger.info("[CALL2] LLM used for complex/ambiguous response")
                else:
                    logger.warning("[CALL2] LLM ignored instructions and called a tool again. Retaining previous reply or fallback.")
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

    tenant = state.get("tenant_config") or {}
    retention_hours = int(tenant.get("retention_hours") or 72)
    expires_at = datetime.utcnow() + timedelta(hours=retention_hours)

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
        "expires_at": expires_at,
    })

    # Update session
    await db.chat_sessions.update_one(
        {"session_id": state["session_id"]},
        {
            "$set": {"status": new_status, "last_message_at": datetime.utcnow(), "expires_at": expires_at},
            "$inc": {"message_count": 2},
        },
    )

    state["session_status"] = new_status
    return state
