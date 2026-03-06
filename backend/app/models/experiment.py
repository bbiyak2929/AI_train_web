"""
Experiment model — 실험 템플릿 (이미지, entrypoint, 기본 파라미터)
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class Experiment(Base):
    __tablename__ = "experiments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    docker_image = Column(String(500), nullable=False)  # e.g. "pytorch/pytorch:2.1.0"
    entrypoint = Column(String(1000), nullable=True)     # e.g. "python train.py"
    default_params = Column(JSONB, default=dict)          # {"epochs": 100, "batch_size": 32, ...}
    default_env = Column(JSONB, default=dict)             # 환경변수 기본값
    version = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="experiments")
    runs = relationship("Run", back_populates="experiment")
