from app.db.mongodb import get_db
from datetime import datetime
from uuid import uuid4

# Demo knowledge docs removed for production.


async def seed_knowledge_if_empty() -> None:
    db = get_db()
    # Demo knowledge docs removed for production. No-op.
    pass
