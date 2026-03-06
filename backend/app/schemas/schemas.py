"""
Pydantic schemas — request/response models
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID
from enum import Enum


# ── Enums ─────────────────────────────────────────────────
class ProjectRoleEnum(str, Enum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class RunStatusEnum(str, Enum):
    QUEUED = "queued"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    STOPPED = "stopped"
    TIMEOUT = "timeout"


class ServerStatusEnum(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    MAINTENANCE = "maintenance"


# ── Auth ──────────────────────────────────────────────────
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    email: str
    password: str = Field(min_length=6)
    full_name: Optional[str] = None


# ── User ──────────────────────────────────────────────────
class UserOut(BaseModel):
    id: UUID
    username: str
    email: str
    full_name: Optional[str] = None
    is_active: bool
    is_superuser: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Project ───────────────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectMemberAdd(BaseModel):
    user_id: UUID
    role: ProjectRoleEnum = ProjectRoleEnum.VIEWER


class ProjectMemberOut(BaseModel):
    id: UUID
    user_id: UUID
    role: ProjectRoleEnum
    joined_at: datetime
    user: Optional[UserOut] = None

    class Config:
        from_attributes = True


class ProjectOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    members: List[ProjectMemberOut] = []

    class Config:
        from_attributes = True


class ProjectListOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    created_at: datetime
    member_count: Optional[int] = 0

    class Config:
        from_attributes = True


# ── Experiment ────────────────────────────────────────────
class ExperimentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    docker_image: str
    entrypoint: Optional[str] = None
    default_params: Dict[str, Any] = {}
    default_env: Dict[str, Any] = {}
    version: Optional[str] = None


class ExperimentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    docker_image: Optional[str] = None
    entrypoint: Optional[str] = None
    default_params: Optional[Dict[str, Any]] = None
    default_env: Optional[Dict[str, Any]] = None
    version: Optional[str] = None


class ExperimentOut(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    description: Optional[str] = None
    docker_image: str
    entrypoint: Optional[str] = None
    default_params: Dict[str, Any] = {}
    default_env: Dict[str, Any] = {}
    version: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Run ───────────────────────────────────────────────────
class RunCreate(BaseModel):
    experiment_id: UUID
    name: Optional[str] = None
    params: Dict[str, Any] = {}
    env_vars: Dict[str, Any] = {}
    server_id: Optional[UUID] = None    # None = 자동 선택


class RunOut(BaseModel):
    id: UUID
    project_id: UUID
    experiment_id: Optional[UUID] = None
    server_id: Optional[UUID] = None
    created_by: Optional[UUID] = None
    name: Optional[str] = None
    status: RunStatusEnum
    params: Dict[str, Any] = {}
    docker_image: Optional[str] = None
    command: Optional[str] = None
    artifact_uri: Optional[str] = None
    log_uri: Optional[str] = None
    queued_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    retry_count: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RunListOut(BaseModel):
    id: UUID
    project_id: UUID
    name: Optional[str] = None
    status: RunStatusEnum
    docker_image: Optional[str] = None
    created_by: Optional[UUID] = None
    server_id: Optional[UUID] = None
    queued_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Server ────────────────────────────────────────────────
class ServerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    hostname: str
    ip_address: Optional[str] = None
    gpu_count: int = 0
    gpu_model: Optional[str] = None
    max_concurrent_runs: int = 1
    description: Optional[str] = None
    ssh_host: Optional[str] = None
    ssh_port: int = 22
    ssh_user: Optional[str] = None
    ssh_password: Optional[str] = None


class ServerUpdate(BaseModel):
    name: Optional[str] = None
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    gpu_count: Optional[int] = None
    gpu_model: Optional[str] = None
    max_concurrent_runs: Optional[int] = None
    description: Optional[str] = None
    status: Optional[ServerStatusEnum] = None
    ssh_host: Optional[str] = None
    ssh_port: Optional[int] = None
    ssh_user: Optional[str] = None
    ssh_password: Optional[str] = None


class ServerOut(BaseModel):
    id: UUID
    name: str
    hostname: str
    ip_address: Optional[str] = None
    gpu_count: int
    gpu_model: Optional[str] = None
    status: ServerStatusEnum
    max_concurrent_runs: int
    description: Optional[str] = None
    ssh_host: Optional[str] = None
    ssh_port: int
    ssh_user: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Artifact ──────────────────────────────────────────────
class ArtifactOut(BaseModel):
    id: UUID
    run_id: UUID
    path: str
    filename: str
    size: Optional[int] = None
    content_type: Optional[str] = None
    storage_uri: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── AuditLog ──────────────────────────────────────────────
class AuditLogOut(BaseModel):
    id: UUID
    user_id: Optional[UUID] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Dashboard ─────────────────────────────────────────────
class DashboardStats(BaseModel):
    total_servers: int = 0
    online_servers: int = 0
    total_runs: int = 0
    running_runs: int = 0
    queued_runs: int = 0
    success_runs: int = 0
    failed_runs: int = 0


class ServerDashboardCard(BaseModel):
    id: UUID
    name: str
    status: ServerStatusEnum
    gpu_count: int
    gpu_model: Optional[str] = None
    active_runs: int = 0
    queued_runs: int = 0

    class Config:
        from_attributes = True


# ── Pagination ────────────────────────────────────────────
class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
    total_pages: int
