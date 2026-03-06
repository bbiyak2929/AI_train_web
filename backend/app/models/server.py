"""
Server & Runner models — 학습 서버 + Runner Agent 메타
"""
import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class ServerStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    MAINTENANCE = "maintenance"


class Server(Base):
    __tablename__ = "servers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False, unique=True)
    hostname = Column(String(255), nullable=False)
    ip_address = Column(String(45), nullable=True)
    gpu_count = Column(Integer, default=0)
    gpu_model = Column(String(100), nullable=True)
    status = Column(Enum(ServerStatus), default=ServerStatus.OFFLINE)
    max_concurrent_runs = Column(Integer, default=1)
    description = Column(String(500), nullable=True)
    # SSH Connection Details
    ssh_host = Column(String(255), nullable=True)
    ssh_port = Column(Integer, default=22)
    ssh_user = Column(String(100), nullable=True)
    ssh_password = Column(String(255), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    runs = relationship("Run", back_populates="server")
