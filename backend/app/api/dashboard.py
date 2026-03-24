"""
Dashboard API — 전체 통계
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.user import User
from app.models.server import Server, ServerStatus
from app.models.run import Run, RunStatus
from app.schemas.schemas import DashboardStats, RunListOut
from app.utils.auth import get_current_user
from typing import List

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_servers = db.query(func.count(Server.id)).scalar()
    online_servers = db.query(func.count(Server.id)).filter(Server.status == ServerStatus.ONLINE).scalar()
    total_runs = db.query(func.count(Run.id)).scalar()
    running_runs = db.query(func.count(Run.id)).filter(Run.status == RunStatus.RUNNING).scalar()
    queued_runs = db.query(func.count(Run.id)).filter(Run.status == RunStatus.QUEUED).scalar()
    success_runs = db.query(func.count(Run.id)).filter(Run.status == RunStatus.SUCCESS).scalar()
    failed_runs = db.query(func.count(Run.id)).filter(Run.status == RunStatus.FAILED).scalar()

    return DashboardStats(
        total_servers=total_servers,
        online_servers=online_servers,
        total_runs=total_runs,
        running_runs=running_runs,
        queued_runs=queued_runs,
        success_runs=success_runs,
        failed_runs=failed_runs,
    )


@router.get("/recent-runs", response_model=List[RunListOut])
def recent_runs(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    runs = (
        db.query(Run)
        .order_by(Run.created_at.desc())
        .limit(limit)
        .all()
    )
    return runs


@router.get("/failed-runs", response_model=List[RunListOut])
def failed_runs(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    runs = (
        db.query(Run)
        .filter(Run.status == RunStatus.FAILED)
        .order_by(Run.created_at.desc())
        .limit(limit)
        .all()
    )
    return runs


@router.get("/runs-by-status", response_model=List[RunListOut])
def runs_by_status(
    status: str,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """상태별 Run 목록을 반환합니다. status는 쉼표로 여러 개 지정 가능."""
    statuses = [s.strip() for s in status.split(",") if s.strip()]
    valid = {e.value for e in RunStatus}
    filters = [RunStatus(s) for s in statuses if s in valid]
    if not filters:
        return []
    runs = (
        db.query(Run)
        .filter(Run.status.in_(filters))
        .order_by(Run.created_at.desc())
        .limit(limit)
        .all()
    )
    return runs
