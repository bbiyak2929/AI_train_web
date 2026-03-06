"""
Run model — 학습 실행 레코드
"""
import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class RunStatus(str, enum.Enum):
    QUEUED = "queued"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    STOPPED = "stopped"
    TIMEOUT = "timeout"


class Run(Base):
    __tablename__ = "runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    experiment_id = Column(UUID(as_uuid=True), ForeignKey("experiments.id", ondelete="SET NULL"), nullable=True)
    server_id = Column(UUID(as_uuid=True), ForeignKey("servers.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    name = Column(String(200), nullable=True)
    status = Column(Enum(RunStatus), default=RunStatus.QUEUED, nullable=False, index=True)
    params = Column(JSONB, default=dict)                  # 사용자 입력 파라미터
    docker_image = Column(String(500), nullable=True)     # 실행 시 확정된 이미지
    command = Column(Text, nullable=True)                  # 실행 시 확정된 커맨드
    env_vars = Column(JSONB, default=dict)                 # 환경변수

    # Artifact / Log URIs
    artifact_uri = Column(String(1000), nullable=True)    # s3://aitrain/runs/{run_id}/artifacts/
    log_uri = Column(String(1000), nullable=True)         # s3://aitrain/runs/{run_id}/logs/

    # Timing
    queued_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    # Retry / Error
    retry_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="runs")
    experiment = relationship("Experiment", back_populates="runs")
    server = relationship("Server", back_populates="runs")
    created_by_user = relationship("User", back_populates="runs")
    artifacts = relationship("Artifact", back_populates="run", cascade="all, delete-orphan")
