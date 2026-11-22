import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .database import Base, engine
from .routers import auth, documents, interviews
from .services import stt

logging.basicConfig(level=logging.INFO)
settings = get_settings()

if settings.app_env == "production" and settings.secret_key == "change-me-in-production":
    raise RuntimeError("Set SECRET_KEY before running in production.")

Base.metadata.create_all(engine)
settings.storage_dir.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="AI Interview Simulator API",
    version="1.0.0",
    description="Resume and job description analysis, AI interview generation, answer evaluation and reports.",
)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(interviews.router)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}


@app.get("/api/config", tags=["meta"])
def public_config():
    return {
        "server_transcription": stt.server_stt_enabled(),
        "test_mode": settings.llm_provider == "fake",
        "max_upload_mb": settings.max_upload_mb,
    }


# Serve the built React app (frontend/dist) when it exists, so one process can run everything.
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (DIST / path).resolve()
        if path and DIST in f.parents and f.is_file():
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
