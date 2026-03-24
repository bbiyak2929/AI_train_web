/**
 * API Client — Axios instance with JWT auth interceptor
 */
import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach JWT token ────
api.interceptors.request.use((config: any) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// ── Response interceptor: handle 401 ─────────
api.interceptors.response.use(
    (response: any) => response,
    (error: any) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('access_token');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;

// ── Auth API ─────────────────────────────────
export const authAPI = {
    login: (username: string, password: string) =>
        api.post('/auth/login', { username, password }),
    register: (data: { username: string; email: string; password: string; full_name?: string }) =>
        api.post('/auth/register', data),
    verifyEmail: (email: string, code: string) =>
        api.post('/auth/verify-email', { email, code }),
    resendVerify: (email: string) =>
        api.post('/auth/resend-verify', { email }),
    me: () => api.get('/auth/me'),
    updateNotifications: (notify_email: boolean) =>
        api.patch('/auth/me/notifications', { notify_email }),
};

// ── Projects API ─────────────────────────────
export const projectsAPI = {
    list: (page = 1) => api.get(`/projects/?page=${page}`),
    get: (id: string) => api.get(`/projects/${id}`),
    create: (data: { name: string; description?: string }) =>
        api.post('/projects/', data),
    update: (id: string, data: { name?: string; description?: string }) =>
        api.patch(`/projects/${id}`, data),
    delete: (id: string) => api.delete(`/projects/${id}`),
    listMembers: (id: string) => api.get(`/projects/${id}/members`),
    addMember: (id: string, data: { user_id: string; role: string }) =>
        api.post(`/projects/${id}/members`, data),
};

// ── Experiments API ──────────────────────────
export const experimentsAPI = {
    list: (projectId: string) =>
        api.get(`/projects/${projectId}/experiments/`),
    get: (projectId: string, id: string) =>
        api.get(`/projects/${projectId}/experiments/${id}`),
    create: (projectId: string, data: any) =>
        api.post(`/projects/${projectId}/experiments/`, data),
    update: (projectId: string, id: string, data: any) =>
        api.patch(`/projects/${projectId}/experiments/${id}`, data),
    delete: (projectId: string, id: string) =>
        api.delete(`/projects/${projectId}/experiments/${id}`),
};

// ── Runs API ─────────────────────────────────
export const runsAPI = {
    list: (projectId: string, status?: string, page = 1) => {
        let url = `/projects/${projectId}/runs/?page=${page}`;
        if (status) url += `&status=${status}`;
        return api.get(url);
    },
    get: (projectId: string, id: string) =>
        api.get(`/projects/${projectId}/runs/${id}`),
    create: (projectId: string, data: any) =>
        api.post(`/projects/${projectId}/runs/`, data),
    stop: (projectId: string, id: string) =>
        api.post(`/projects/${projectId}/runs/${id}/stop`),
    retry: (projectId: string, id: string) =>
        api.post(`/projects/${projectId}/runs/${id}/retry`),
    delete: (projectId: string, id: string) =>
        api.delete(`/projects/${projectId}/runs/${id}`),
};

export const logsAPI = {
    history: (runId: string, limit = 1000) =>
        api.get(`/runs/${runId}/logs`, { params: { limit } }),
};

// ── Servers API ──────────────────────────────
export const serversAPI = {
    list: () => api.get('/servers/'),
    dashboard: () => api.get('/servers/dashboard'),
    get: (id: string) => api.get(`/servers/${id}`),
    create: (data: any) => api.post('/servers/', data),
    update: (id: string, data: any) => api.patch(`/servers/${id}`, data),
    delete: (id: string) => api.delete(`/servers/${id}`),
    gpuStatus: (id: string) => api.get(`/servers/${id}/gpu-status`),
    reboot: (id: string) => api.post(`/servers/${id}/reboot`),
};


// ── Artifacts API ────────────────────────────
export const artifactsAPI = {
    list: (runId: string) => api.get(`/runs/${runId}/artifacts/`),
    get: (runId: string, id: string) => api.get(`/runs/${runId}/artifacts/${id}`),
};

// ── Files API (프로젝트 파일 관리) ─────────────
export const filesAPI = {
    list: (projectId: string, path = '') =>
        api.get(`/projects/${projectId}/files/`, { params: { path } }),
    upload: (projectId: string, file: File, path = '') => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post(`/projects/${projectId}/files/upload`, formData, {
            params: { path },
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    uploadMultiple: (projectId: string, files: File[], path = '') => {
        const formData = new FormData();
        files.forEach((f) => formData.append('files', f));
        return api.post(`/projects/${projectId}/files/upload-multiple`, formData, {
            params: { path },
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    uploadFolder: (projectId: string, zipFile: File, path = '') => {
        const formData = new FormData();
        formData.append('file', zipFile);
        return api.post(`/projects/${projectId}/files/upload-folder`, formData, {
            params: { path },
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    uploadWithPaths: (projectId: string, files: File[], paths: string[]) => {
        const formData = new FormData();
        files.forEach((f) => formData.append('files', f));
        return api.post(`/projects/${projectId}/files/upload-with-path`, formData, {
            params: { paths: paths.join(',') },
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    rename: (projectId: string, key: string, newName: string) =>
        api.post(`/projects/${projectId}/files/rename`, null, { params: { key, new_name: newName } }),
    delete: (projectId: string, key: string) =>
        api.delete(`/projects/${projectId}/files/`, { params: { key } }),
    downloadUrl: (projectId: string, key: string) =>
        `/api/projects/${projectId}/files/download?key=${encodeURIComponent(key)}`,
};

// ── Dashboard API ────────────────────────────
export const dashboardAPI = {
    stats: () => api.get('/dashboard/stats'),
    recentRuns: (limit = 10) => api.get(`/dashboard/recent-runs?limit=${limit}`),
    failedRuns: (limit = 10) => api.get(`/dashboard/failed-runs?limit=${limit}`),
};
