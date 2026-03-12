"""
Experiments API — 실험 템플릿 CRUD
"""
from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.project import ProjectMember
from app.models.experiment import Experiment
from app.schemas.schemas import ExperimentCreate, ExperimentUpdate, ExperimentOut
from app.utils.auth import get_current_user

router = APIRouter(prefix="/projects/{project_id}/experiments", tags=["Experiments"])


def _check_experiment_access(db: Session, project_id: UUID, user: User, min_role: str = "viewer"):
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


@router.post("/", response_model=ExperimentOut, status_code=201)
def create_experiment(
    project_id: UUID,
    body: ExperimentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_experiment_access(db, project_id, current_user, min_role="editor")
    experiment = Experiment(
        project_id=project_id,
        name=body.name,
        description=body.description,
        docker_image=body.docker_image,
        entrypoint=body.entrypoint,
        default_params=body.default_params,
        default_env=body.default_env,
        param_style=body.param_style,
        version=body.version,
    )
    db.add(experiment)
    db.commit()
    db.refresh(experiment)
    return experiment


@router.get("/", response_model=List[ExperimentOut])
def list_experiments(
    project_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_experiment_access(db, project_id, current_user)
    experiments = (
        db.query(Experiment)
        .filter(Experiment.project_id == project_id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return experiments


@router.get("/{experiment_id}", response_model=ExperimentOut)
def get_experiment(
    project_id: UUID,
    experiment_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_experiment_access(db, project_id, current_user)
    experiment = (
        db.query(Experiment)
        .filter(Experiment.id == experiment_id, Experiment.project_id == project_id)
        .first()
    )
    if not experiment:
        raise HTTPException(404, "Experiment not found")
    return experiment


@router.patch("/{experiment_id}", response_model=ExperimentOut)
def update_experiment(
    project_id: UUID,
    experiment_id: UUID,
    body: ExperimentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_experiment_access(db, project_id, current_user, min_role="editor")
    experiment = (
        db.query(Experiment)
        .filter(Experiment.id == experiment_id, Experiment.project_id == project_id)
        .first()
    )
    if not experiment:
        raise HTTPException(404, "Experiment not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(experiment, field, value)
    db.commit()
    db.refresh(experiment)
    return experiment


@router.delete("/{experiment_id}", status_code=204)
def delete_experiment(
    project_id: UUID,
    experiment_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_experiment_access(db, project_id, current_user, min_role="owner")
    experiment = (
        db.query(Experiment)
        .filter(Experiment.id == experiment_id, Experiment.project_id == project_id)
        .first()
    )
    if not experiment:
        raise HTTPException(404, "Experiment not found")
    db.delete(experiment)
    db.commit()
