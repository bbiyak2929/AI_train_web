"""
Runs API — 학습 실행 생성/목록/상세/중지
"""
from uuid import UUID
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.user import User
from app.models.project import ProjectMember
from app.models.experiment import Experiment
from app.models.run import Run, RunStatus
from app.schemas.schemas import RunCreate, RunOut, RunListOut, RunStatusEnum
from app.utils.auth import get_current_user

router = APIRouter(prefix="/projects/{project_id}/runs", tags=["Runs"])


def _check_run_access(db: Session, project_id: UUID, user: User, min_role: str = "viewer"):
    if user.is_superuser:
        return
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
        .first()
    )
    if not membership:
        raise HTTPException(403, "Access denied")
    role_hierarchy = {"viewer": 0, "editor": 1, "owner": 2}
    if role_hierarchy.get(membership.role.value, 0) < role_hierarchy.get(min_role, 0):
        raise HTTPException(403, f"Requires at least '{min_role}' role")


@router.post("/", response_model=RunOut, status_code=201)
def create_run(
    project_id: UUID,
    body: RunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_run_access(db, project_id, current_user, min_role="editor")

    # Validate experiment
    experiment = db.query(Experiment).filter(
        Experiment.id == body.experiment_id,
        Experiment.project_id == project_id,
    ).first()
    if not experiment:
        raise HTTPException(404, "Experiment not found in this project")

    # Merge params: experiment defaults + user overrides
    merged_params = {**experiment.default_params, **body.params}
    merged_env = {**experiment.default_env, **body.env_vars}

    # Build command
    entrypoint = experiment.entrypoint or ""
    style = getattr(experiment, 'param_style', 'argparse') or 'argparse'
    if style == 'equals':
        param_str = " ".join(f"{k}={v}" for k, v in merged_params.items())
    else:
        param_str = " ".join(f"--{k}={v}" for k, v in merged_params.items())
    command = f"{entrypoint} {param_str}".strip()

    run = Run(
        project_id=project_id,
        experiment_id=body.experiment_id,
        created_by=current_user.id,
        name=body.name or f"{experiment.name}-run",
        status=RunStatus.QUEUED,
        params=merged_params,
        docker_image=experiment.docker_image,
        command=command,
        env_vars=merged_env,
        server_id=body.server_id,
        artifact_uri=None,
        log_uri=None,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Set artifact/log URIs
    run.artifact_uri = f"s3://aitrain/runs/{run.id}/artifacts/"
    run.log_uri = f"s3://aitrain/runs/{run.id}/logs/"
    db.commit()
    db.refresh(run)

    # Enqueue Celery task (import here to avoid circular)
    try:
        from app.worker.tasks import schedule_run
        schedule_run.delay(str(run.id))
    except Exception:
        pass  # Worker may not be running in dev

    return run


@router.get("/", response_model=List[RunListOut])
def list_runs(
    project_id: UUID,
    status: Optional[RunStatusEnum] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_run_access(db, project_id, current_user)

    query = db.query(Run).filter(Run.project_id == project_id)
    if status:
        query = query.filter(Run.status == status.value)

    runs = (
        query
        .order_by(desc(Run.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return runs


@router.get("/{run_id}", response_model=RunOut)
def get_run(
    project_id: UUID,
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_run_access(db, project_id, current_user)
    run = db.query(Run).filter(Run.id == run_id, Run.project_id == project_id).first()
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@router.post("/{run_id}/stop", response_model=RunOut)
def stop_run(
    project_id: UUID,
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_run_access(db, project_id, current_user, min_role="editor")
    run = db.query(Run).filter(Run.id == run_id, Run.project_id == project_id).first()
    if not run:
        raise HTTPException(404, "Run not found")
    if run.status not in (RunStatus.QUEUED, RunStatus.SCHEDULED, RunStatus.RUNNING):
        raise HTTPException(400, f"Cannot stop run with status '{run.status.value}'")

    run.status = RunStatus.STOPPED
    run.finished_at = datetime.utcnow()
    db.commit()
    db.refresh(run)

    # Signal Celery to stop
    try:
        from app.worker.tasks import stop_run_task
        stop_run_task.delay(str(run.id))
    except Exception:
        pass

    return run
