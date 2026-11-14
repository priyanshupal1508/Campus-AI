from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import CORS_ORIGINS, ensure_storage_ready, init_db
from .routes.auth import router as auth_router
from .routes.chat import router as chat_router
from .routes.documents import router as documents_router
from .services.auth_service import sync_initial_admin_account


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_storage_ready()
    init_db()
    sync_initial_admin_account()
    yield


app = FastAPI(
    title="CampusAI Document Processing & Chat API",
    description="CampusAI FastAPI backend for authentication, PDF document processing, and Gemini-powered chat.",
    version="0.4.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(chat_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
