/**
 * TypeScript interfaces for the AI Training Platform
 */

// ── Enums ──────────────────────────────────────
export type ProjectRole = 'owner' | 'editor' | 'viewer';
export type RunStatus = 'queued' | 'scheduled' | 'running' | 'success' | 'failed' | 'stopped' | 'timeout';
export type ServerStatus = 'online' | 'offline' | 'maintenance';

// ── Auth ───────────────────────────────────────
export interface TokenResponse {
    access_token: string;
    token_type: string;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface RegisterRequest {
    username: string;
    email: string;
    password: string;
    full_name?: string;
}

// ── User ───────────────────────────────────────
export interface User {
    id: string;
    username: string;
    email: string;
    full_name?: string;
    is_active: boolean;
    is_superuser: boolean;
    notify_email: boolean;
    created_at: string;
}

// ── Project ────────────────────────────────────
export interface Project {
    id: string;
    name: string;
    description?: string;
    created_at: string;
    updated_at: string;
    members?: ProjectMember[];
}

export interface ProjectListItem {
    id: string;
    name: string;
    description?: string;
    created_at: string;
    member_count: number;
}

export interface ProjectMember {
    id: string;
    user_id: string;
    role: ProjectRole;
    joined_at: string;
    user?: User;
}

// ── Experiment ─────────────────────────────────
export interface Experiment {
    id: string;
    project_id: string;
    name: string;
    description?: string;
    docker_image: string;
    entrypoint?: string;
    default_params: Record<string, any>;
    default_env: Record<string, any>;
    version?: string;
    created_at: string;
    updated_at: string;
}

// ── Run ────────────────────────────────────────
export interface Run {
    id: string;
    project_id: string;
    experiment_id?: string;
    server_id?: string;
    created_by?: string;
    name?: string;
    status: RunStatus;
    params: Record<string, any>;
    docker_image?: string;
    command?: string;
    artifact_uri?: string;
    log_uri?: string;
    queued_at?: string;
    started_at?: string;
    finished_at?: string;
    retry_count: number;
    error_message?: string;
    created_at: string;
    updated_at: string;
}

export interface RunListItem {
    id: string;
    project_id: string;
    name?: string;
    status: RunStatus;
    docker_image?: string;
    created_by?: string;
    server_id?: string;
    queued_at?: string;
    started_at?: string;
    finished_at?: string;
    created_at: string;
}

// ── Server ─────────────────────────────────────
export interface Server {
    id: string;
    name: string;
    hostname: string;
    ip_address?: string;
    gpu_count: number;
    gpu_model?: string;
    status: ServerStatus;
    max_concurrent_runs: number;
    description?: string;
    ssh_host?: string;
    ssh_port: number;
    ssh_user?: string;
    created_at: string;
    updated_at: string;
}

export interface ServerDashboardCard {
    id: string;
    name: string;
    status: ServerStatus;
    gpu_count: number;
    gpu_model?: string;
    active_runs: number;
    queued_runs: number;
}

// ── GPU Info ───────────────────────────────────
export interface GpuInfo {
    index: number;
    name: string;
    temperature: string;
    gpu_util: string;
    memory_used: string;
    memory_total: string;
    memory_free: string;
    power_draw: string;
    power_limit: string;
    fan_speed: string;
}

export interface ServerGpuStatus {
    server_id: string;
    server_name: string;
    driver_version: string;
    cuda_version: string;
    gpus: GpuInfo[];
    cpu_usage: string;
    memory_used: string;
    memory_total: string;
    uptime: string;
    error?: string;
}


// ── Artifact ───────────────────────────────────
export interface Artifact {
    id: string;
    run_id: string;
    path: string;
    filename: string;
    size?: number;
    content_type?: string;
    storage_uri?: string;
    created_at: string;
}

// ── Project File ───────────────────────────────
export interface ProjectFile {
    key: string;
    name: string;
    relative_path: string;
    size: number;
    last_modified: string;
}

// ── Dashboard ──────────────────────────────────
export interface DashboardStats {
    total_servers: number;
    online_servers: number;
    total_runs: number;
    running_runs: number;
    queued_runs: number;
    success_runs: number;
    failed_runs: number;
}
