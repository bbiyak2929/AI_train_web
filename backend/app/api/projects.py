"""
Projects API — CRUD + 멤버 관리
"""
from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.database import get_db
from app.models.user import User
from app.models.project import Project, ProjectMember, ProjectRole
from app.schemas.schemas import (
    ProjectCreate, ProjectUpdate, ProjectOut, ProjectListOut,
    ProjectMemberAdd, ProjectMemberOut,
)
from app.utils.auth import get_current_user

router = APIRouter(prefix="/projects", tags=["Projects"])


def _check_project_access(db: Session, project_id: UUID, user: User, min_role: str = "viewer"):
    """Check user has at least min_role in project."""
    if user.is_superuser:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(404, "Project not found")
        return project

    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
        .first()
    )
    if not membership:
        raise HTTPException(403, "Access denied to this project")

    role_hierarchy = {"viewer": 0, "editor": 1, "owner": 2}
    if role_hierarchy.get(membership.role.value, 0) < role_hierarchy.get(min_role, 0):
        raise HTTPException(403, f"Requires at least '{min_role}' role")

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.post("/", response_model=ProjectOut, status_code=201)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = Project(name=body.name, description=body.description)
    db.add(project)
    db.flush()

    # Creator becomes owner
    member = ProjectMember(project_id=project.id, user_id=current_user.id, role=ProjectRole.OWNER)
    db.add(member)
    db.commit()
    db.refresh(project)
    return project


@router.get("/", response_model=List[ProjectListOut])
def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Project)
    if not current_user.is_superuser:
        query = query.join(ProjectMember).filter(ProjectMember.user_id == current_user.id)

    projects = query.offset((page - 1) * page_size).limit(page_size).all()
    result = []
    for p in projects:
        count = db.query(func.count(ProjectMember.id)).filter(ProjectMember.project_id == p.id).scalar()
        result.append(ProjectListOut(
            id=p.id, name=p.name, description=p.description,
            created_at=p.created_at, member_count=count,
        ))
    return result


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _check_project_access(db, project_id, current_user)
    db.refresh(project)
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: UUID,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _check_project_access(db, project_id, current_user, min_role="editor")
    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _check_project_access(db, project_id, current_user, min_role="owner")
    db.delete(project)
    db.commit()


# ── Members ───────────────────────────────────────────────
@router.post("/{project_id}/members", response_model=ProjectMemberOut, status_code=201)
def add_member(
    project_id: UUID,
    body: ProjectMemberAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_project_access(db, project_id, current_user, min_role="owner")

    existing = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == body.user_id)
        .first()
    )
    if existing:
        raise HTTPException(400, "User is already a member")

    member = ProjectMember(
        project_id=project_id,
        user_id=body.user_id,
        role=ProjectRole(body.role.value),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.get("/{project_id}/members", response_model=List[ProjectMemberOut])
def list_members(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_project_access(db, project_id, current_user)
    members = (
        db.query(ProjectMember)
        .options(joinedload(ProjectMember.user))
        .filter(ProjectMember.project_id == project_id)
        .all()
    )
    return members


@router.delete("/{project_id}/members/{user_id}", status_code=204)
def remove_member(
    project_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_project_access(db, project_id, current_user, min_role="owner")
    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not member:
        raise HTTPException(404, "Member not found")
    db.delete(member)
    db.commit()
