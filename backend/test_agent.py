import asyncio
import logging
from app.db.mongodb import connect_mongodb, close_mongodb, get_db
from app.agent.graph import agent_graph

logging.basicConfig(level=logging.INFO)

async def test_agent():
    await connect_mongodb()
    db = get_db()
    
    # Get the last session that is stuck
    session = await db.chat_sessions.find_one({"status": "AGENT_RESPONDING"}, sort=[("last_message_at", -1)])
    if not session:
        print("No stuck session found!")
        await close_mongodb()
        return
        
    print(f"Testing session: {session['session_id']} for tenant {session['tenant_id']}")
    
    # Get the last inbound message for this session
    msg = await db.message_audit_log.find_one({"session_id": session["session_id"], "direction": "INBOUND"}, sort=[("timestamp", -1)])
    if not msg:
        print("No inbound message found for session!")
        await close_mongodb()
        return
        
    tenant = await db.tenants.find_one({"tenant_id": session["tenant_id"]})
    
    initial_state = {
        "tenant_id": session["tenant_id"],
        "customer_phone": session["customer_phone"],
        "session_id": session["session_id"],
        "whatsapp_message_id": msg["whatsapp_message_id"],
        "inbound_text": msg["text_content"],
        "inbound_media_id": None,
        "inbound_media_type": None,
        "inbound_media_filename": None,
        "inbound_media_mime": None,
        "inbound_raw_message": None,
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
    
    print("Invoking graph...")
    try:
        final_state = await agent_graph.ainvoke(initial_state)
        print("--- FINAL STATE ---")
        print(final_state)
    except Exception as e:
        print(f"FAILED TO INVOKE GRAPH: {e}")
        import traceback
        traceback.print_exc()
        
    await close_mongodb()

if __name__ == "__main__":
    asyncio.run(test_agent())
