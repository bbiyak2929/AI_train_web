"""
Runs API — 학습 실행 생성/목록/상세/중지
"""
from uuid import UUID
from typing import List, Optional
from datetime import datetime
import re
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


def _enqueue_schedule_run(run_id: UUID):
    """Enqueue Celery schedule task; best-effort in dev mode."""
    try:
        from app.worker.tasks import schedule_run
        schedule_run.delay(str(run_id))
    except Exception:
        pass


def _extract_yolo_family(model_value: Optional[str]) -> Optional[str]:
    if not model_value:
        return None
    match = re.search(r"(yolo\d+)", str(model_value).lower())
    return match.group(1) if match else None


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

    # Guard against accidental YOLO family mismatch (e.g. yolo11 template + yolo26 model)
    base_model = (experiment.default_params or {}).get("model")
    selected_model = merged_params.get("model")
    base_family = _extract_yolo_family(base_model)
    selected_family = _extract_yolo_family(selected_model)
    if base_family and selected_family and base_family != selected_family:
        raise HTTPException(
            400,
            f"Model '{selected_model}' is incompatible with experiment template family '{base_family}'",
        )

    # Build command
    entrypoint = experiment.entrypoint or ""
    style = getattr(experiment, 'param_style', 'argparse') or 'argparse'
    
    # Force workers=1 for YOLO training to prevent shared memory issues
    if 'yolo' in experiment.entrypoint.lower() and 'workers' in merged_params:
        merged_params['workers'] = 1
    
    if style == 'equals':
        param_str = " ".join(f"{k}={v}" for k, v in merged_params.items())
    else:
        param_str = " ".join(f"--{k}={v}" for k, v in merged_params.items())
    command = f"{entrypoint} {param_str}".strip()

    # Deduplicate run name — append -2, -3, ... if name already exists
    base_name = body.name or f"{experiment.name}-run"
    run_name = base_name
    counter = 2
    while db.query(Run).filter(Run.project_id == project_id, Run.name == run_name).first():
        run_name = f"{base_name}-{counter}"
        counter += 1

    run = Run(
        project_id=project_id,
        experiment_id=body.experiment_id,
        created_by=current_user.id,
        name=run_name,
        status=RunStatus.QUEUED,
        params=merged_params,
        docker_image=experiment.docker_image,
        command=command,
        env_vars=merged_env,
        server_id=body.server_id,
        data_source_type=body.data_source_type,
        remote_data_path=body.remote_data_path,
        container_mount_path=body.container_mount_path,
        selected_files=body.selected_files,
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

    _enqueue_schedule_run(run.id)

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


@router.post("/{run_id}/retry", response_model=RunOut, status_code=201)
def retry_run(
    project_id: UUID,
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_run_access(db, project_id, current_user, min_role="editor")

    source_run = db.query(Run).filter(Run.id == run_id, Run.project_id == project_id).first()
    if not source_run:
        raise HTTPException(404, "Run not found")

    retryable_statuses = {RunStatus.FAILED, RunStatus.TIMEOUT, RunStatus.STOPPED}
    if source_run.status not in retryable_statuses:
        raise HTTPException(400, f"Cannot retry run with status '{source_run.status.value}'")

    # Deduplicate retry run name
    base_name = source_run.name or str(source_run.id)[:8]
    retry_base = f"{base_name}-retry"
    retry_name = retry_base
    counter = 2
    while db.query(Run).filter(Run.project_id == project_id, Run.name == retry_name).first():
        retry_name = f"{retry_base}-{counter}"
        counter += 1

    run = Run(
        project_id=source_run.project_id,
        experiment_id=source_run.experiment_id,
        created_by=current_user.id,
        name=retry_name,
        status=RunStatus.QUEUED,
        params=source_run.params or {},
        docker_image=source_run.docker_image,
        command=source_run.command,
        env_vars=source_run.env_vars or {},
        server_id=source_run.server_id,
        data_source_type=source_run.data_source_type,
        remote_data_path=source_run.remote_data_path,
        container_mount_path=source_run.container_mount_path,
        selected_files=source_run.selected_files,
        artifact_uri=None,
        log_uri=None,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    run.artifact_uri = f"s3://aitrain/runs/{run.id}/artifacts/"
    run.log_uri = f"s3://aitrain/runs/{run.id}/logs/"
    db.commit()
    db.refresh(run)

    _enqueue_schedule_run(run.id)
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


@router.delete("/{run_id}", status_code=204)
def delete_run(
    project_id: UUID,
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_run_access(db, project_id, current_user, min_role="editor")
    run = db.query(Run).filter(Run.id == run_id, Run.project_id == project_id).first()
    if not run:
        raise HTTPException(404, "Run not found")

    db.delete(run)
    db.commit()
