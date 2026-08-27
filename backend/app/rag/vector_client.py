import asyncio
import logging
from upstash_vector import Index
from fastembed import TextEmbedding
from app.config import settings

logger = logging.getLogger(__name__)

_index = None
_embedding_model = None

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
    return _embedding_model

def get_upstash_index():
    global _index
    if _index is None:
        if settings.upstash_vector_rest_url and settings.upstash_vector_rest_token:
            try:
                _index = Index(
                    url=settings.upstash_vector_rest_url,
                    token=settings.upstash_vector_rest_token
                )
            except Exception as e:
                logger.warning(f"Failed to initialize Upstash Vector: {e}")
                _index = None
        else:
            logger.warning("Upstash Vector credentials missing. Vector DB will not work.")
    return _index

def catalog_doc_text(item: dict) -> str:
    """The searchable text for a catalog item."""
    attr_text = " ".join(f"{k}: {v}" for k, v in (item.get("attributes") or {}).items())
    return f"{item['name']}. {item.get('ai_description','')} {attr_text} Price: {item.get('price','')}"

async def index_upsert(rows: list[dict]) -> None:
    """Incrementally add/update vectors. rows: [{id, document, metadata}]."""
    if not rows:
        return
    index = get_upstash_index()
    if not index:
        return

    model = get_embedding_model()
    documents = [r["document"] for r in rows]
    
    # Run embedding in thread to avoid blocking event loop
    embeddings_generator = await asyncio.to_thread(list, model.embed(documents))
    
    points = []
    for r, emb in zip(rows, embeddings_generator):
        meta = r["metadata"].copy()
        meta["document_text"] = r["document"]
        points.append({
            "id": r["id"],
            "vector": emb.tolist(),
            "metadata": meta
        })

    await asyncio.to_thread(index.upsert, vectors=points)

async def index_remove(ids: list[str]) -> None:
    """Incrementally delete vectors by id."""
    index = get_upstash_index()
    if not index or not ids:
        return
    try:
        await asyncio.to_thread(index.delete, ids=ids)
    except Exception as e:
        logger.warning(f"Upstash index_remove failed: {e}")

def search_knowledge_base(query: str, tenant_id: str, n_results: int = 3) -> list[str]:
    """Semantic search over KNOWLEDGE docs, strictly tenant-scoped."""
    index = get_upstash_index()
    if not index:
        return []
    
    model = get_embedding_model()
    query_vector = list(model.embed([query]))[0].tolist()

    try:
        search_result = index.query(
            vector=query_vector,
            top_k=n_results,
            include_metadata=True,
            filter=f"tenant_id = '{tenant_id}' AND type = 'knowledge'"
        )
    
        chunks = []
        for hit in search_result:
            if hit.score > 0.5:
                doc_text = hit.metadata.get("document_text")
                if doc_text:
                    chunks.append(doc_text)
        return chunks
    except Exception as e:
        logger.warning(f"Upstash search failed (returning empty chunks): {e}")
        return []

def search_catalog(query: str, tenant_id: str) -> dict | None:
    """Semantic search over visual CATALOG items, tenant-scoped."""
    index = get_upstash_index()
    if not index:
        return None

    model = get_embedding_model()
    query_vector = list(model.embed([query]))[0].tolist()

    try:
        search_result = index.query(
            vector=query_vector,
            top_k=1,
            include_metadata=True,
            filter=f"tenant_id = '{tenant_id}' AND type = 'catalog'"
        )
    
        if not search_result:
            return None
            
        hit = search_result[0]
        if hit.score < 0.55:
            return None

        meta = hit.metadata or {}
        return {
            "name": meta.get("title", ""),
            "image_url": meta.get("image_url", ""),
            "price": meta.get("price", ""),
            "details": meta.get("document_text", ""), 
        }
    except Exception as e:
        logger.warning(f"Upstash catalog search failed: {e}")
        return None

async def build_chroma_index():
    pass
