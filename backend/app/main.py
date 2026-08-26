import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.dashboard import router as dashboard_router
from app.api.webhooks import router as webhook_router
from app.api.files import router as files_router
from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.contact import router as contact_router
from app.db.mongodb import connect_mongodb, close_mongodb
from app.db.seed import seed_tenants_if_empty, seed_admin_if_empty
from app.db.seed_catalog import seed_catalog_if_empty
from app.rag.seed_knowledge import seed_knowledge_if_empty

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — keep this FAST so the port binds and /health responds immediately.
    logger.info("Starting up...")
    await connect_mongodb()
    await seed_admin_if_empty()
    await seed_tenants_if_empty()
    await seed_knowledge_if_empty()
    await seed_catalog_if_empty()
    logger.info("Core ready; using persistent Qdrant cloud.")
    yield
    # Shutdown
    await close_mongodb()
    logger.info("Shutdown complete.")


app = FastAPI(title="Multi-Tenant WhatsApp Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files (PDFs, images for tenant media library)
app.mount("/static", StaticFiles(directory="static"), name="static")

from fastapi import Depends
from app.api.auth import require_user

app.include_router(webhook_router)
app.include_router(files_router)
app.include_router(auth_router)
app.include_router(contact_router)

# Secured routes (Require login)
app.include_router(dashboard_router, dependencies=[Depends(require_user)])
app.include_router(admin_router, dependencies=[Depends(require_user)])

from app.api.superadmin import router as superadmin_router
app.include_router(superadmin_router)


@app.get("/health")
@app.head("/health")
async def health():
    try:
        # Ping Qdrant to keep the free tier cluster awake 24/7
        from app.rag.qdrant_client import get_qdrant_client
        import asyncio
        client = get_qdrant_client()
        if client:
            await asyncio.to_thread(client.get_collections)
    except Exception as e:
        logger.warning(f"Qdrant keepalive ping failed: {e}")
    return Response(status_code=200)


@app.get("/")
@app.head("/")
async def root():
    return Response(status_code=200)

@app.get("/api/public/settings")
async def get_public_settings():
    from app.db.mongodb import get_db
    db = get_db()
    settings = await db.platform_settings.find_one({"id": "global"}, {"_id": 0})
    return {"settings": settings or {}}
