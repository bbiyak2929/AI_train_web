/**
 * ServersPage — 서버 관리 (관리자)
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Grid, Card, CardContent, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Chip, Skeleton, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, alpha, Snackbar, Alert, IconButton,
} from '@mui/material';
import { Add, Dns, Refresh, Delete as DeleteIcon } from '@mui/icons-material';
import { serversAPI } from '../api/client';
import ServerCard from '../components/ServerCard';
import type { ServerDashboardCard } from '../types';

const statusColors: Record<string, string> = {
    idle: '#00E676',
    busy: '#6C63FF',
    offline: '#FF5252',
    error: '#FFB74D',
};

export default function ServersPage() {
    const navigate = useNavigate();
    const [servers, setServers] = useState<ServerDashboardCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialog, setDialog] = useState(false);
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; server: ServerDashboardCard | null }>({ open: false, server: null });
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
    const [form, setForm] = useState({
        name: '', hostname: '', ip_address: '',
        gpu_count: '0', gpu_model: '', max_concurrent_runs: '1', description: '',
        ssh_host: '', ssh_port: '22', ssh_user: '', ssh_password: ''
    });

    const fetchData = async () => {
        try {
            const srvRes = await serversAPI.dashboard();
            setServers(srvRes.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    const handleCreate = async () => {
        try {
            await serversAPI.create({
                name: form.name,
                hostname: form.hostname,
                ip_address: form.ip_address || undefined,
                gpu_count: parseInt(form.gpu_count) || 0,
                gpu_model: form.gpu_model || undefined,
                max_concurrent_runs: parseInt(form.max_concurrent_runs) || 1,
                description: form.description || undefined,
                ssh_host: form.ssh_host || undefined,
                ssh_port: parseInt(form.ssh_port) || 22,
                ssh_user: form.ssh_user || undefined,
                ssh_password: form.ssh_password || undefined,
            });
            setDialog(false);
            setForm({ name: '', hostname: '', ip_address: '', gpu_count: '0', gpu_model: '', max_concurrent_runs: '1', description: '', ssh_host: '', ssh_port: '22', ssh_user: '', ssh_password: '' });
            setSnackbar({ open: true, message: '서버가 성공적으로 추가되었습니다.', severity: 'success' });
            fetchData();
        } catch (err: any) {
            console.error(err);
            const detail = err.response?.data?.detail || '';
            let msg = '서버 추가에 실패했습니다.';
            if (detail.includes('SSH Connection failed')) {
                const reason = detail.replace('SSH Connection failed: ', '');
                msg = `SSH 연결 실패: ${reason}\n\nSSH 호스트, 포트, 사용자명, 비밀번호를 확인 후 다시 시도해주세요.`;
            } else if (detail.includes('already exists')) {
                msg = '이미 동일한 이름의 서버가 존재합니다. 다른 이름을 사용해주세요.';
            } else if (detail) {
                msg = `오류: ${detail}`;
            }
            setSnackbar({ open: true, message: msg, severity: 'error' });
        }
    };

    const handleDelete = async () => {
        if (!deleteDialog.server) return;
        try {
            await serversAPI.delete(deleteDialog.server.id);
            setDeleteDialog({ open: false, server: null });
            setSnackbar({ open: true, message: '서버가 삭제되었습니다.', severity: 'success' });
            fetchData();
        } catch (err: any) {
            console.error(err);
            const msg = err.response?.data?.detail || '서버 삭제에 실패했습니다.';
            setSnackbar({ open: true, message: msg, severity: 'error' });
            setDeleteDialog({ open: false, server: null });
        }
    };

    const formatTime = (t?: string) => {
        if (!t) return '-';
        return new Date(t).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: '#F1F5F9' }}>서버 관리</Typography>
                    <Typography variant="body2" sx={{ color: '#64748B' }}>학습 서버 및 Runner 상태를 관리합니다</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" startIcon={<Refresh />} onClick={fetchData} size="small">새로고침</Button>
                    <Button variant="contained" startIcon={<Add />} onClick={() => setDialog(true)}>서버 추가</Button>
                </Box>
            </Box>

            {/* Server Cards */}
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#F1F5F9', mb: 2 }}>🖥️ 서버 목록</Typography>
            <Grid container spacing={2.5} sx={{ mb: 4 }}>
                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <Grid item xs={12} sm={6} md={4} key={i}>
                            <Card><CardContent><Skeleton height={140} /></CardContent></Card>
                        </Grid>
                    ))
                ) : servers.length === 0 ? (
                    <Grid item xs={12}>
                        <Card sx={{ textAlign: 'center' }}>
                            <CardContent sx={{ py: 5 }}>
                                <Dns sx={{ fontSize: 48, color: '#374151', mb: 2 }} />
                                <Typography color="text.secondary">등록된 서버가 없습니다</Typography>
                                <Button startIcon={<Add />} sx={{ mt: 2 }} onClick={() => setDialog(true)}>서버 추가</Button>
                            </CardContent>
                        </Card>
                    </Grid>
                ) : (
                    servers.map((s) => (
                        <Grid item xs={12} sm={6} md={4} key={s.id}>
                            <Box sx={{ position: 'relative' }}>
                                <ServerCard server={s} onClick={() => navigate(`/servers/${s.id}`)} />
                                <IconButton
                                    size="small"
                                    onClick={() => setDeleteDialog({ open: true, server: s })}
                                    sx={{
                                        position: 'absolute',
                                        bottom: 12,
                                        right: 12,
                                        color: '#FF5252',
                                        backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.85),
                                        backdropFilter: 'blur(4px)',
                                        border: '1px solid',
                                        borderColor: alpha('#FF5252', 0.2),
                                        '&:hover': {
                                            backgroundColor: alpha('#FF5252', 0.15),
                                        },
                                    }}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        </Grid>
                    ))
                )}
            </Grid>



            {/* Create Server Dialog */}
            <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>서버 추가</DialogTitle>
                <DialogContent>
                    <TextField fullWidth label="서버 이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} required />

                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: '#94A3B8' }}>기본 정보</Typography>
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={6}>
                            <TextField fullWidth label="Hostname (예: server-01)" value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} required />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField fullWidth label="표시용 IP 주소" value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} />
                        </Grid>
                    </Grid>

                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: '#94A3B8' }}>SSH 접속 정보 (Agentless 실행용)</Typography>
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={8}>
                            <TextField fullWidth label="SSH Host (IP)" value={form.ssh_host} onChange={(e) => setForm({ ...form, ssh_host: e.target.value })} />
                        </Grid>
                        <Grid item xs={4}>
                            <TextField fullWidth label="SSH Port" type="number" value={form.ssh_port} onChange={(e) => setForm({ ...form, ssh_port: e.target.value })} />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField fullWidth label="SSH User" value={form.ssh_user} onChange={(e) => setForm({ ...form, ssh_user: e.target.value })} />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField fullWidth label="SSH Password" type="password" value={form.ssh_password} onChange={(e) => setForm({ ...form, ssh_password: e.target.value })} />
                        </Grid>
                    </Grid>

                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: '#94A3B8' }}>하드웨어 & 환경</Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <TextField fullWidth label="GPU 수" type="number" value={form.gpu_count} onChange={(e) => setForm({ ...form, gpu_count: e.target.value })} />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField fullWidth label="GPU 모델" value={form.gpu_model} onChange={(e) => setForm({ ...form, gpu_model: e.target.value })} placeholder="RTX 4090" />
                        </Grid>
                    </Grid>
                    <TextField fullWidth label="최대 동시 실행" type="number" value={form.max_concurrent_runs} onChange={(e) => setForm({ ...form, max_concurrent_runs: e.target.value })} sx={{ mt: 2, mb: 2 }} />
                    <TextField fullWidth label="설명" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} multiline rows={2} />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDialog(false)} color="inherit">취소</Button>
                    <Button variant="contained" onClick={handleCreate} disabled={!form.name || !form.hostname}>추가</Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, server: null })} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>서버 삭제</DialogTitle>
                <DialogContent>
                    <Typography>
                        <strong>{deleteDialog.server?.name}</strong> 서버를 정말 삭제하시겠습니까?
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                        이 작업은 되돌릴 수 없습니다.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDeleteDialog({ open: false, server: null })} color="inherit">취소</Button>
                    <Button variant="contained" color="error" onClick={handleDelete}>삭제</Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar for feedback */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                    severity={snackbar.severity}
                    variant="filled"
                    sx={{ width: '100%', whiteSpace: 'pre-line' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
