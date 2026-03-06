"""
AI Training Management Platform — FastAPI Application Entry Point
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base

# Import all models so they're registered with Base
from app.models.user import User
from app.models.project import Project, ProjectMember
from app.models.server import Server
from app.models.experiment import Experiment
from app.models.run import Run
from app.models.artifact import Artifact
from app.models.audit import AuditLog

# Import routers
from app.api.auth import router as auth_router
from app.api.projects import router as projects_router
from app.api.experiments import router as experiments_router
from app.api.runs import router as runs_router
from app.api.servers import router as servers_router
from app.api.artifacts import router as artifacts_router
from app.api.dashboard import router as dashboard_router
from app.api.logs import router as logs_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle."""
    # Create all tables on startup (dev mode)
    Base.metadata.create_all(bind=engine)
    yield
    # Cleanup on shutdown (if needed)


app = FastAPI(
    title="AI Training Management Platform",
    description="중앙 제어 서버 API — 학습 실행 관리, 서버 모니터링, 아티팩트 관리",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(experiments_router, prefix="/api")
app.include_router(runs_router, prefix="/api")
app.include_router(servers_router, prefix="/api")
app.include_router(artifacts_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(logs_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "ai-training-platform"}
