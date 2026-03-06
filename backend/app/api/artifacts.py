"""
Artifacts API — 아티팩트 조회 / 다운로드
"""
from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.artifact import Artifact
from app.models.run import Run
from app.schemas.schemas import ArtifactOut
from app.utils.auth import get_current_user

router = APIRouter(prefix="/runs/{run_id}/artifacts", tags=["Artifacts"])


@router.get("/", response_model=List[ArtifactOut])
def list_artifacts(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")
    return db.query(Artifact).filter(Artifact.run_id == run_id).all()


@router.get("/{artifact_id}", response_model=ArtifactOut)
def get_artifact(
    run_id: UUID,
    artifact_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    artifact = db.query(Artifact).filter(
        Artifact.id == artifact_id,
        Artifact.run_id == run_id,
    ).first()
    if not artifact:
        raise HTTPException(404, "Artifact not found")
    return artifact
