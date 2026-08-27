"""
Seeds the catalog_items collection: visual products with image + structured data linked.
The ai_description is what RAG searches; the image_url + price + attributes are returned together.
"""
from app.db.mongodb import get_db
from app.config import settings
from datetime import datetime
from uuid import uuid4


def _u(path: str) -> str:
    return f"{settings.app_base_url}/static/{path}"


# Demo catalog removed for production.


async def seed_catalog_if_empty() -> None:
    db = get_db()
    # Demo catalog removed for production. No-op.
    pass
