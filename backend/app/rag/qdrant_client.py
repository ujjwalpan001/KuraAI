import asyncio
import logging
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from app.config import settings
from app.db.mongodb import get_db

logger = logging.getLogger(__name__)

_client = None
_collection_name = "whatsagent_knowledge"

def get_qdrant_client():
    global _client
    if _client is None:
        if settings.qdrant_url and settings.qdrant_api_key:
            try:
                _client = QdrantClient(
                    url=settings.qdrant_url,
                    api_key=settings.qdrant_api_key,
                )
                # Ensure collection exists
                if not _client.collection_exists(_collection_name):
                    _client.create_collection(
                        collection_name=_collection_name,
                        vectors_config=_client.get_fastembed_vector_params()
                    )
            except Exception as e:
                logger.warning(f"Failed to initialize Qdrant client (database might be sleeping): {e}")
                _client = None
        else:
            logger.warning("Qdrant credentials missing. Vector DB will not work.")
    return _client

def catalog_doc_text(item: dict) -> str:
    """The searchable text for a catalog item."""
    attr_text = " ".join(f"{k}: {v}" for k, v in (item.get("attributes") or {}).items())
    return f"{item['name']}. {item.get('ai_description','')} {attr_text} Price: {item.get('price','')}"

async def index_upsert(rows: list[dict]) -> None:
    """Incrementally add/update vectors. rows: [{id, document, metadata}]."""
    if not rows:
        return
    client = get_qdrant_client()
    if not client:
        return

    documents = [r["document"] for r in rows]
    metadata = [r["metadata"] for r in rows]
    ids = [r["id"] for r in rows]

    await asyncio.to_thread(
        client.add,
        collection_name=_collection_name,
        documents=documents,
        metadata=metadata,
        ids=ids
    )

async def index_remove(ids: list[str]) -> None:
    """Incrementally delete vectors by id."""
    client = get_qdrant_client()
    if not client or not ids:
        return
    try:
        await asyncio.to_thread(
            client.delete,
            collection_name=_collection_name,
            points_selector=ids
        )
    except Exception as e:
        logger.warning(f"Qdrant index_remove failed: {e}")

def search_knowledge_base(query: str, tenant_id: str, n_results: int = 3, category: str = "all") -> list[str]:
    """Semantic search over KNOWLEDGE docs, strictly tenant-scoped."""
    client = get_qdrant_client()
    if not client:
        return []

    must_conditions = [
        FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
        FieldCondition(key="type", match=MatchValue(value="knowledge"))
    ]
    
    if category and category != "all":
        must_conditions.append(FieldCondition(key="doc_type", match=MatchValue(value=category)))

    try:
        search_result = client.query(
            collection_name=_collection_name,
            query_text=query,
            query_filter=Filter(must=must_conditions),
            limit=n_results
        )
    
        chunks = []
        for hit in search_result:
            if hit.score > 0.5:  # lowered threshold to catch valid semantic matches
                chunks.append(hit.document)
        return chunks
    except Exception as e:
        logger.warning(f"Qdrant search failed (returning empty chunks): {e}")
        return []

def search_catalog(query: str, tenant_id: str) -> dict | None:
    """Semantic search over visual CATALOG items, tenant-scoped."""
    client = get_qdrant_client()
    if not client:
        return None

    try:
        search_result = client.query(
            collection_name=_collection_name,
            query_text=query,
            query_filter=Filter(must=[
                FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                FieldCondition(key="type", match=MatchValue(value="catalog"))
            ]),
            limit=1
        )
    
        if not search_result:
            return None
    except Exception as e:
        logger.warning(f"Qdrant catalog search failed: {e}")
        return None

    hit = search_result[0]
    # In Qdrant FastEmbed, score is cosine similarity (0 to 1 generally for normalized)
    if hit.score < 0.55: # tune this
        return None

    meta = hit.metadata
    return {
        "name": meta.get("title", ""),
        "image_url": meta.get("image_url", ""),
        "price": meta.get("price", ""),
        "details": hit.document, 
    }

async def build_chroma_index():
    # Deprecated: Qdrant doesn't need in-memory full rebuilds!
    pass
