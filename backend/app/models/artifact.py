"""
Artifact model — Run 결과물 (모델, 로그, 이미지 등)
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, BigInteger, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Artifact(Base):
    __tablename__ = "artifacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    path = Column(String(1000), nullable=False)          # MinIO 내 경로
    filename = Column(String(255), nullable=False)
    size = Column(BigInteger, nullable=True)              # bytes
    content_type = Column(String(100), nullable=True)     # MIME type
    storage_uri = Column(String(1000), nullable=True)     # s3://bucket/path
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    run = relationship("Run", back_populates="artifacts")
