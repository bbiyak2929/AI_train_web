"""
AuditLog model — 감사 로그
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False, index=True)   # e.g. "run.create", "run.stop"
    resource_type = Column(String(50), nullable=True)           # e.g. "run", "project"
    resource_id = Column(String(100), nullable=True)
    details = Column(JSONB, nullable=True)                      # 추가 정보
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    user = relationship("User", back_populates="audit_logs")
