from app.db.mongodb import get_db
from app.db.models import TenantModel
from app.config import settings
from datetime import datetime
import time
from app.api.auth import _hash_password


# Demo tenants removed for production.


async def ensure_indexes() -> None:
    """
    Create all indexes. Runs on EVERY startup (idempotent) — not just first seed,
    so an existing/production DB always has its constraints.
    """
    db = get_db()
    await db.tenants.create_index("tenant_id", unique=True)
    await db.tenants.create_index("evolution_instance")

    await db.chat_sessions.create_index(
        [("tenant_id", 1), ("customer_phone", 1)], unique=True
    )
    await db.chat_sessions.create_index("tenant_id")
    await db.chat_sessions.create_index("status")
    await db.chat_sessions.create_index([("last_message_at", -1)])

    await db.message_audit_log.create_index([("session_id", 1), ("timestamp", 1)])
    await db.message_audit_log.create_index("tenant_id")
    await db.message_audit_log.create_index([("timestamp", -1)])
    
    # TTL Indexes for Auto-Deletion
    await db.chat_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.message_audit_log.create_index("expires_at", expireAfterSeconds=0)

    await db.knowledge_docs.create_index("tenant_id")
    await db.knowledge_docs.create_index("doc_type")
    
    await db.users.create_index("email", unique=True)

    # Idempotency: unique index so a given inbound WhatsApp message is processed once.
    await db.processed_webhooks.create_index("whatsapp_message_id", unique=True)

    # Routing: one customer phone is assigned to exactly one tenant.
    await db.customer_routing.create_index("customer_phone", unique=True)
    print("Ensured all MongoDB indexes")


async def seed_tenants_if_empty() -> None:
    db = get_db()
    await ensure_indexes()
    # Demo tenants removed for production. No-op.
    pass


async def seed_admin_if_empty() -> None:
    db = get_db()
    users_to_seed = [
        {"email": "kuraai.admin@gmail.com", "pass": "Kuraai@9804", "name": "Kura Super Admin", "role": "SUPER_ADMIN"}
    ]
    for u in users_to_seed:
        existing = await db.users.find_one({"email": u["email"]})
        if not existing:
            user_id = f"user_{int(time.time())}_{u['email'].split('@')[0]}"
            await db.users.insert_one({
                "user_id": user_id,
                "name": u["name"],
                "email": u["email"],
                "password_hash": _hash_password(u["pass"]),
                "role": u.get("role", "CLIENT"),
                "created_at": datetime.utcnow(),
            })
            print(f"Seeded admin user: {u['email']}")

