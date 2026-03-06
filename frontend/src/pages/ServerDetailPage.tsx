/**
 * ServerDetailPage — GPU 모니터링 상세 페이지
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Grid, Card, CardContent, Button, Chip,
    LinearProgress, CircularProgress, alpha, IconButton, Tooltip, Alert, useTheme,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, Snackbar,
} from '@mui/material';
import {
    ArrowBack, Refresh, Memory as GpuIcon, Thermostat, Speed,
    Storage as StorageIcon, PowerSettingsNew, Air,
    Computer, Timer, Edit as EditIcon, RestartAlt as RebootIcon,
} from '@mui/icons-material';
import { serversAPI } from '../api/client';
import type { ServerGpuStatus, GpuInfo, Server } from '../types';

function parseNumeric(val: string): number {
    const n = parseFloat(val.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : n;
}

function getTempColor(temp: number): string {
    if (temp < 50) return '#00E676';
    if (temp < 70) return '#FFB74D';
    return '#FF5252';
}

function getUtilColor(util: number): string {
    if (util < 50) return '#00E676';
    if (util < 80) return '#FFB74D';
    return '#FF5252';
}

export default function ServerDetailPage() {
    const { serverId } = useParams<{ serverId: string }>();
    const navigate = useNavigate();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const [server, setServer] = useState<Server | null>(null);
    const [gpuStatus, setGpuStatus] = useState<ServerGpuStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // 이름 수정
    const [editDialog, setEditDialog] = useState(false);
    const [editName, setEditName] = useState('');

    // 재부팅
    const [rebootDialog, setRebootDialog] = useState(false);
    const [rebooting, setRebooting] = useState(false);

    // Snackbar
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

    const fetchData = useCallback(async () => {
        if (!serverId) return;
        try {
            const [srvRes, gpuRes] = await Promise.all([
                serversAPI.get(serverId),
                serversAPI.gpuStatus(serverId),
            ]);
            setServer(srvRes.data);
            setGpuStatus(gpuRes.data);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
        setRefreshing(false);
    }, [serverId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // 10초마다 자동 갱신
    useEffect(() => {
        const interval = setInterval(() => {
            fetchData();
        }, 10000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const handleEditName = async () => {
        if (!serverId || !editName.trim()) return;
        try {
            await serversAPI.update(serverId, { name: editName.trim() });
            setEditDialog(false);
            setSnackbar({ open: true, message: '서버 이름이 변경되었습니다.', severity: 'success' });
            fetchData();
        } catch (err: any) {
            const msg = err.response?.data?.detail || '이름 변경에 실패했습니다.';
            setSnackbar({ open: true, message: msg, severity: 'error' });
        }
    };

    const handleReboot = async () => {
        if (!serverId) return;
        setRebooting(true);
        try {
            await serversAPI.reboot(serverId);
            setRebootDialog(false);
            setSnackbar({ open: true, message: '재부팅 명령을 전송했습니다. 서버가 곧 오프라인됩니다.', severity: 'success' });
            fetchData();
        } catch (err: any) {
            const msg = err.response?.data?.detail || '재부팅 명령 전송에 실패했습니다.';
            setSnackbar({ open: true, message: msg, severity: 'error' });
        }
        setRebooting(false);
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <CircularProgress sx={{ color: '#6C63FF' }} />
            </Box>
        );
    }

    const vramPercent = (gpu: GpuInfo) => {
        const used = parseNumeric(gpu.memory_used);
        const total = parseNumeric(gpu.memory_total);
        return total > 0 ? Math.round((used / total) * 100) : 0;
    };

    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <IconButton onClick={() => navigate('/servers')} sx={{ color: 'text.secondary' }}>
                    <ArrowBack />
                </IconButton>
                <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h4" sx={{ fontWeight: 700 }}>
                            {server?.name || '서버'}
                        </Typography>
                        <Tooltip title="이름 수정">
                            <IconButton
                                size="small"
                                onClick={() => { setEditName(server?.name || ''); setEditDialog(true); }}
                                sx={{ color: 'text.secondary' }}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {server?.hostname} {server?.ip_address ? `(${server.ip_address})` : ''}
                    </Typography>
                </Box>
                <Chip
                    label={server?.status?.toUpperCase()}
                    size="small"
                    sx={{
                        fontWeight: 700,
                        backgroundColor: alpha(
                            server?.status === 'online' ? '#00E676' : server?.status === 'offline' ? '#FF5252' : '#FFB74D',
                            0.15
                        ),
                        color: server?.status === 'online' ? '#00E676' : server?.status === 'offline' ? '#FF5252' : '#FFB74D',
                    }}
                />
                <Button
                    variant="outlined"
                    color="error"
                    startIcon={<RebootIcon />}
                    onClick={() => setRebootDialog(true)}
                    size="small"
                >
                    재부팅
                </Button>
                <Button
                    variant="outlined"
                    startIcon={refreshing ? <CircularProgress size={16} /> : <Refresh />}
                    onClick={handleRefresh}
                    disabled={refreshing}
                    size="small"
                >
                    새로고침
                </Button>
            </Box>

            {/* Error */}
            {gpuStatus?.error && (
                <Alert severity="error" sx={{ mb: 3 }}>{gpuStatus.error}</Alert>
            )}

            {/* System Info */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                {[
                    { icon: <Computer />, label: 'Driver', value: gpuStatus?.driver_version || 'N/A' },
                    { icon: <GpuIcon />, label: 'CUDA', value: gpuStatus?.cuda_version || 'N/A' },
                    { icon: <Speed />, label: 'CPU 사용률', value: gpuStatus?.cpu_usage || 'N/A' },
                    { icon: <StorageIcon />, label: '시스템 RAM', value: `${gpuStatus?.memory_used || '?'} / ${gpuStatus?.memory_total || '?'}` },
                    { icon: <Timer />, label: 'Uptime', value: gpuStatus?.uptime || 'N/A' },
                ].map((item, i) => (
                    <Grid item xs={6} sm={4} md key={i}>
                        <Card>
                            <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                    <Box sx={{ color: '#6C63FF' }}>{item.icon}</Box>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                        {item.label}
                                    </Typography>
                                </Box>
                                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                                    {item.value}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* GPU Cards */}
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                🖥️ GPU 상태 ({gpuStatus?.gpus?.length || 0}개)
            </Typography>

            {(!gpuStatus?.gpus || gpuStatus.gpus.length === 0) && !gpuStatus?.error && (
                <Card>
                    <CardContent sx={{ textAlign: 'center', py: 5 }}>
                        <GpuIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                        <Typography color="text.secondary">GPU 정보를 가져올 수 없습니다</Typography>
                    </CardContent>
                </Card>
            )}

            <Grid container spacing={2.5}>
                {gpuStatus?.gpus?.map((gpu) => {
                    const temp = parseNumeric(gpu.temperature);
                    const util = parseNumeric(gpu.gpu_util);
                    const vram = vramPercent(gpu);
                    const power = parseNumeric(gpu.power_draw);
                    const powerLimit = parseNumeric(gpu.power_limit);
                    const powerPct = powerLimit > 0 ? Math.round((power / powerLimit) * 100) : 0;

                    return (
                        <Grid item xs={12} md={6} key={gpu.index}>
                            <Card sx={{
                                border: '1px solid',
                                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                            }}>
                                <CardContent sx={{ p: 3 }}>
                                    {/* GPU Header */}
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <Box sx={{
                                                width: 44, height: 44, borderRadius: 2,
                                                background: `linear-gradient(135deg, ${alpha('#6C63FF', 0.2)}, ${alpha('#00D9FF', 0.1)})`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <GpuIcon sx={{ color: '#6C63FF', fontSize: 24 }} />
                                            </Box>
                                            <Box>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                                    GPU {gpu.index}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                    {gpu.name}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Chip
                                            label={`${util}%`}
                                            size="small"
                                            sx={{
                                                fontWeight: 700,
                                                backgroundColor: alpha(getUtilColor(util), 0.15),
                                                color: getUtilColor(util),
                                            }}
                                        />
                                    </Box>

                                    {/* GPU Utilization */}
                                    <Box sx={{ mb: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <Speed sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>GPU 사용률</Typography>
                                            </Box>
                                            <Typography variant="caption" sx={{ fontWeight: 700 }}>{gpu.gpu_util}</Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={util}
                                            sx={{
                                                height: 8, borderRadius: 4,
                                                backgroundColor: isDark ? alpha('#6C63FF', 0.1) : alpha('#6C63FF', 0.08),
                                                '& .MuiLinearProgress-bar': {
                                                    borderRadius: 4,
                                                    background: `linear-gradient(90deg, ${getUtilColor(util)}, ${alpha(getUtilColor(util), 0.7)})`,
                                                },
                                            }}
                                        />
                                    </Box>

                                    {/* VRAM Usage */}
                                    <Box sx={{ mb: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <StorageIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>VRAM</Typography>
                                            </Box>
                                            <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                                {gpu.memory_used} / {gpu.memory_total}
                                            </Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={vram}
                                            sx={{
                                                height: 8, borderRadius: 4,
                                                backgroundColor: isDark ? alpha('#00D9FF', 0.1) : alpha('#00D9FF', 0.08),
                                                '& .MuiLinearProgress-bar': {
                                                    borderRadius: 4,
                                                    background: vram > 90
                                                        ? 'linear-gradient(90deg, #FF5252, #FF8A80)'
                                                        : 'linear-gradient(90deg, #00D9FF, #6C63FF)',
                                                },
                                            }}
                                        />
                                        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.3, display: 'block' }}>
                                            남은 VRAM: {gpu.memory_free}
                                        </Typography>
                                    </Box>

                                    {/* Power Usage */}
                                    <Box sx={{ mb: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <PowerSettingsNew sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>전력</Typography>
                                            </Box>
                                            <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                                {gpu.power_draw} / {gpu.power_limit}
                                            </Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={powerPct}
                                            sx={{
                                                height: 8, borderRadius: 4,
                                                backgroundColor: isDark ? alpha('#FFB74D', 0.1) : alpha('#FFB74D', 0.08),
                                                '& .MuiLinearProgress-bar': {
                                                    borderRadius: 4,
                                                    background: 'linear-gradient(90deg, #FFB74D, #FF9800)',
                                                },
                                            }}
                                        />
                                    </Box>

                                    {/* Stats Row */}
                                    <Box sx={{
                                        display: 'flex', gap: 1.5, mt: 2,
                                        pt: 2, borderTop: '1px solid',
                                        borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
                                    }}>
                                        <Tooltip title="온도">
                                            <Chip
                                                icon={<Thermostat sx={{ fontSize: 16 }} />}
                                                label={gpu.temperature}
                                                size="small"
                                                sx={{
                                                    fontWeight: 700, fontSize: '0.75rem',
                                                    backgroundColor: alpha(getTempColor(temp), 0.12),
                                                    color: getTempColor(temp),
                                                    '& .MuiChip-icon': { color: getTempColor(temp) },
                                                }}
                                            />
                                        </Tooltip>
                                        <Tooltip title="팬 속도">
                                            <Chip
                                                icon={<Air sx={{ fontSize: 16 }} />}
                                                label={gpu.fan_speed}
                                                size="small"
                                                sx={{
                                                    fontWeight: 700, fontSize: '0.75rem',
                                                    backgroundColor: isDark ? alpha('#94A3B8', 0.1) : alpha('#64748B', 0.1),
                                                    color: isDark ? '#94A3B8' : '#64748B',
                                                    '& .MuiChip-icon': { color: isDark ? '#94A3B8' : '#64748B' },
                                                }}
                                            />
                                        </Tooltip>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>

            {/* Auto-refresh notice */}
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', textAlign: 'center', mt: 3 }}>
                10초마다 자동 갱신됩니다
            </Typography>

            {/* Edit Name Dialog */}
            <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>서버 이름 수정</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="서버 이름"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        sx={{ mt: 1 }}
                        autoFocus
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setEditDialog(false)} color="inherit">취소</Button>
                    <Button variant="contained" onClick={handleEditName} disabled={!editName.trim()}>저장</Button>
                </DialogActions>
            </Dialog>

            {/* Reboot Confirmation Dialog */}
            <Dialog open={rebootDialog} onClose={() => setRebootDialog(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 700, color: '#FF5252' }}>서버 재부팅</DialogTitle>
                <DialogContent>
                    <Typography>
                        <strong>{server?.name}</strong> 서버를 정말 재부팅하시겠습니까?
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                        실행 중인 모든 작업이 중단됩니다. 서버가 다시 온라인될 때까지 시간이 걸릴 수 있습니다.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setRebootDialog(false)} color="inherit">취소</Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleReboot}
                        disabled={rebooting}
                        startIcon={rebooting ? <CircularProgress size={16} /> : <RebootIcon />}
                    >
                        재부팅
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={5000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                    severity={snackbar.severity}
                    variant="filled"
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
