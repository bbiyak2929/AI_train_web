"""
Project & ProjectMember models — 프로젝트 + RBAC
"""
import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class ProjectRole(str, enum.Enum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    experiments = relationship("Experiment", back_populates="project", cascade="all, delete-orphan")
    runs = relationship("Run", back_populates="project")


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_user"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(ProjectRole), default=ProjectRole.VIEWER, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="project_memberships")
