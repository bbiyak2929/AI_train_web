/**
 * DashboardPage — 메인 대시보드
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Grid, Typography, Card, CardContent, Skeleton,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, alpha, Chip, Button, Dialog, DialogTitle, DialogContent,
    IconButton, CircularProgress, Tooltip,
} from '@mui/material';
import {
    Dns as ServerIcon, PlayArrow as RunIcon,
    CheckCircle as SuccessIcon, Error as ErrorIcon,
    HourglassEmpty as QueuedIcon, TrendingUp as TrendingIcon,
    Close as CloseIcon, OpenInNew as OpenIcon,
} from '@mui/icons-material';
import { dashboardAPI, serversAPI } from '../api/client';
import ServerCard from '../components/ServerCard';
import RunStatusBadge from '../components/RunStatusBadge';
import type { DashboardStats, ServerDashboardCard, RunListItem } from '../types';

export default function DashboardPage() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [servers, setServers] = useState<ServerDashboardCard[]>([]);
    const [recentRuns, setRecentRuns] = useState<RunListItem[]>([]);
    const [failedRuns, setFailedRuns] = useState<RunListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // Stat card dialog
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogTitle, setDialogTitle] = useState('');
    const [dialogRuns, setDialogRuns] = useState<RunListItem[]>([]);
    const [dialogLoading, setDialogLoading] = useState(false);

    useEffect(() => {
        const fetch = async () => {
            try {
                const [statsRes, serversRes, recentRes, failedRes] = await Promise.all([
                    dashboardAPI.stats(),
                    serversAPI.dashboard(),
                    dashboardAPI.recentRuns(5),
                    dashboardAPI.failedRuns(5),
                ]);
                setStats(statsRes.data);
                setServers(serversRes.data);
                setRecentRuns(recentRes.data);
                setFailedRuns(failedRes.data);
            } catch (err) {
                console.error('Dashboard fetch error:', err);
            }
            setLoading(false);
        };
        fetch();
    }, []);

    const openStatDialog = async (title: string, statusFilter: string) => {
        setDialogTitle(title);
        setDialogOpen(true);
        setDialogLoading(true);
        setDialogRuns([]);
        try {
            const res = await dashboardAPI.runsByStatus(statusFilter, 20);
            setDialogRuns(res.data);
        } catch (err) {
            console.error(err);
        }
        setDialogLoading(false);
    };

    const statCards = stats ? [
        { label: '전체 서버', value: stats.total_servers, icon: <ServerIcon />, color: '#6C63FF', sub: `${stats.online_servers} 온라인`, onClick: () => navigate('/servers') },
        { label: '실행 중', value: stats.running_runs, icon: <RunIcon />, color: '#00D9FF', sub: `${stats.queued_runs} 대기 중`, onClick: () => openStatDialog('실행 중 / 대기 중', 'running,queued,scheduled') },
        { label: '성공', value: stats.success_runs, icon: <SuccessIcon />, color: '#00E676', sub: `총 ${stats.total_runs} runs`, onClick: () => openStatDialog('성공한 실행', 'success') },
        { label: '실패', value: stats.failed_runs, icon: <ErrorIcon />, color: '#FF5252', sub: '주의 필요', onClick: () => openStatDialog('실패한 실행', 'failed,timeout,stopped') },
    ] : [];

    const formatTime = (t?: string) => {
        if (!t) return '-';
        return new Date(t).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <Box>
            <Box
                sx={{
                    position: 'relative',
                    mb: 4,
                    p: { xs: 2.5, md: 3.5 },
                    borderRadius: 4,
                    overflow: 'hidden',
                    border: `1px solid ${alpha('#6C63FF', 0.18)}`,
                    background: `linear-gradient(120deg, ${alpha('#6C63FF', 0.16)} 0%, ${alpha('#00D9FF', 0.12)} 45%, ${alpha('#10B981', 0.10)} 100%)`,
                    '@keyframes floatY': {
                        '0%': { transform: 'translateY(0px)' },
                        '50%': { transform: 'translateY(-16px)' },
                        '100%': { transform: 'translateY(0px)' },
                    },
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        width: 220,
                        height: 220,
                        right: -30,
                        top: -40,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, ${alpha('#00D9FF', 0.35)} 0%, transparent 70%)`,
                        animation: 'floatY 6s ease-in-out infinite',
                    },
                    '&::after': {
                        content: '""',
                        position: 'absolute',
                        width: 180,
                        height: 180,
                        left: -30,
                        bottom: -40,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, ${alpha('#6C63FF', 0.30)} 0%, transparent 70%)`,
                        animation: 'floatY 8s ease-in-out infinite reverse',
                    },
                }}
            >
                <Typography variant="overline" sx={{ letterSpacing: '0.14em', color: 'text.secondary', fontWeight: 700 }}>
                    HOME
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.8, position: 'relative', zIndex: 1 }}>
                    AI Training Control Center
                </Typography>
                <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
                    <Button variant="contained" onClick={() => navigate('/projects')}>프로젝트 바로가기</Button>
                    <Button variant="outlined" onClick={() => navigate('/servers')}>서버 보러가기</Button>
                    {stats && stats.running_runs > 0 && (
                        <Chip
                            icon={<Box sx={{
                                width: 8, height: 8, borderRadius: '50%', backgroundColor: '#00E676', ml: 1,
                                animation: 'blink 1s infinite',
                                '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
                            }} />}
                            label={`${stats.running_runs}개 실행 중`}
                            size="small"
                            onClick={() => openStatDialog('실행 중 / 대기 중', 'running,queued,scheduled')}
                            sx={{ height: 30, cursor: 'pointer', '&:hover': { backgroundColor: alpha('#00E676', 0.15) } }}
                        />
                    )}
                </Box>
            </Box>

            {/* Stats Cards */}
            <Grid container spacing={2.5} sx={{ mb: 4 }}>
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <Grid item xs={6} md={3} key={i}>
                            <Card><CardContent><Skeleton height={80} /></CardContent></Card>
                        </Grid>
                    ))
                ) : (
                    statCards.map((s, i) => (
                        <Grid item xs={6} md={3} key={i}>
                            <Card sx={{
                                position: 'relative', overflow: 'hidden', cursor: 'pointer',
                                transition: 'all 0.2s',
                                '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 8px 24px ${alpha(s.color, 0.2)}` },
                                '&::before': {
                                    content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                                    background: `linear-gradient(90deg, ${s.color}, ${alpha(s.color, 0.3)})`,
                                },
                            }} onClick={s.onClick}>
                                <CardContent sx={{ p: 2.5 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <Box>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                                {s.label}
                                            </Typography>
                                            <Typography variant="h3" sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.2, mt: 0.5 }}>
                                                {s.value}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                {s.sub}
                                            </Typography>
                                        </Box>
                                        <Box sx={{
                                            width: 44, height: 44, borderRadius: 2,
                                            background: alpha(s.color, 0.1),
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {React.cloneElement(s.icon, { sx: { color: s.color, fontSize: 24 } })}
                                        </Box>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))
                )}
            </Grid>

            {/* Server Cards */}
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', mb: 2 }}>
                🖥️ 서버 상태
            </Typography>
            <Grid container spacing={2.5} sx={{ mb: 4 }}>
                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <Grid item xs={12} sm={6} md={4} key={i}>
                            <Card><CardContent><Skeleton height={140} /></CardContent></Card>
                        </Grid>
                    ))
                ) : servers.length === 0 ? (
                    <Grid item xs={12}>
                        <Card><CardContent sx={{ textAlign: 'center', py: 4 }}>
                            <Typography color="text.secondary">등록된 서버가 없습니다</Typography>
                        </CardContent></Card>
                    </Grid>
                ) : (
                    <>
                        {servers.map((s) => (
                            <Grid item xs={12} sm={6} md={4} key={s.id}>
                                <ServerCard server={s} onClick={() => navigate(`/servers`)} />
                            </Grid>
                        ))}
                        <Grid item xs={12} sm={6} md={4}>
                            <Card
                                onClick={() => navigate('/servers')}
                                sx={{
                                    height: '100%', minHeight: 140, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: (theme) => `2px dashed ${alpha(theme.palette.divider, 0.3)}`,
                                    backgroundColor: 'transparent',
                                    transition: 'all 0.2s',
                                    '&:hover': {
                                        borderColor: '#6C63FF',
                                        backgroundColor: alpha('#6C63FF', 0.04),
                                    },
                                }}
                            >
                                <Box sx={{ textAlign: 'center' }}>
                                    <ServerIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }} />
                                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                        + 서버 추가
                                    </Typography>
                                </Box>
                            </Card>
                        </Grid>
                    </>
                )}
            </Grid>

            {/* Recent & Failed Runs */}
            <Grid container spacing={2.5} sx={{ alignItems: 'stretch' }}>
                <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', mb: 2 }}>
                        🚀 최근 실행
                    </Typography>
                    <Card sx={{ flex: 1 }}>
                        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                            {loading ? (
                                <Box sx={{ p: 2 }}>
                                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={44} sx={{ mb: 0.5 }} />)}
                                </Box>
                            ) : recentRuns.length === 0 ? (
                                <Box sx={{ textAlign: 'center', py: 6 }}>
                                    <RunIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                                    <Typography color="text.secondary" variant="body2">실행 기록이 없습니다</Typography>
                                </Box>
                            ) : (
                                recentRuns.map((run, i) => (
                                    <Box key={run.id}
                                        onClick={() => navigate(`/projects/${run.project_id}/runs/${run.id}`)}
                                        sx={{
                                            display: 'flex', alignItems: 'center', gap: 1.5,
                                            px: 2.5, py: 1.5, cursor: 'pointer',
                                            borderBottom: i < recentRuns.length - 1 ? (theme: any) => `1px solid ${alpha(theme.palette.divider, 0.06)}` : 'none',
                                            '&:hover': { backgroundColor: (theme: any) => alpha(theme.palette.primary.main, 0.04) },
                                            transition: 'background-color 0.15s',
                                        }}
                                    >
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                                                {run.name || run.id.slice(0, 8)}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                {formatTime(run.created_at)}
                                            </Typography>
                                        </Box>
                                        <RunStatusBadge status={run.status} />
                                    </Box>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Failed Runs */}
                <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', mb: 2 }}>
                        ⚠️ 실패한 실행
                    </Typography>
                    <Card sx={{ flex: 1 }}>
                        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                            {loading ? (
                                <Box sx={{ p: 2 }}>
                                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={44} sx={{ mb: 0.5 }} />)}
                                </Box>
                            ) : failedRuns.length === 0 ? (
                                <Box sx={{ textAlign: 'center', py: 6 }}>
                                    <SuccessIcon sx={{ fontSize: 40, color: '#00E676', mb: 1 }} />
                                    <Typography color="text.secondary" variant="body2">실패한 실행이 없습니다</Typography>
                                </Box>
                            ) : (
                                failedRuns.map((run, i) => (
                                    <Box key={run.id}
                                        onClick={() => navigate(`/projects/${run.project_id}/runs/${run.id}`)}
                                        sx={{
                                            display: 'flex', alignItems: 'center', gap: 1.5,
                                            px: 2.5, py: 1.5, cursor: 'pointer',
                                            borderBottom: i < failedRuns.length - 1 ? (theme: any) => `1px solid ${alpha(theme.palette.divider, 0.06)}` : 'none',
                                            '&:hover': { backgroundColor: alpha('#FF5252', 0.06) },
                                            transition: 'background-color 0.15s',
                                        }}
                                    >
                                        <ErrorIcon sx={{ color: '#FF5252', fontSize: 20 }} />
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                                                {run.name || run.id.slice(0, 8)}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                {formatTime(run.created_at)}
                                            </Typography>
                                        </Box>
                                        <RunStatusBadge status={run.status} />
                                    </Box>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Stat Card Detail Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: 4, backgroundImage: 'none',
                        border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                        boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
                    },
                }}
            >
                <DialogTitle sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    px: 3.5, pt: 3, pb: 1,
                }}>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>{dialogTitle}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {dialogLoading ? '불러오는 중...' : `${dialogRuns.length}개의 실행`}
                        </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => setDialogOpen(false)}
                        sx={{ color: 'text.secondary', '&:hover': { backgroundColor: alpha('#fff', 0.08) } }}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ px: 2.5, pb: 3, pt: 1.5 }}>
                    {dialogLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                            <CircularProgress sx={{ color: '#6C63FF' }} />
                        </Box>
                    ) : dialogRuns.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 8 }}>
                            <QueuedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5 }} />
                            <Typography color="text.secondary">해당하는 실행이 없습니다</Typography>
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {dialogRuns.map((run) => (
                                <Box key={run.id}
                                    onClick={() => { setDialogOpen(false); navigate(`/projects/${run.project_id}/runs/${run.id}`); }}
                                    sx={{
                                        display: 'flex', alignItems: 'center', gap: 2,
                                        px: 2.5, py: 2, borderRadius: 2.5, cursor: 'pointer',
                                        backgroundColor: (theme) => alpha(theme.palette.action.hover, 0.04),
                                        border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.06)}`,
                                        transition: 'all 0.2s ease',
                                        '&:hover': {
                                            backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
                                            borderColor: (theme) => alpha(theme.palette.primary.main, 0.2),
                                            transform: 'translateX(4px)',
                                        },
                                    }}
                                >
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.3 }} noWrap>
                                            {run.name || run.id.slice(0, 8)}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                            {formatTime(run.created_at)}
                                        </Typography>
                                    </Box>
                                    <RunStatusBadge status={run.status} />
                                    <Tooltip title="로그 보러가기" arrow>
                                        <IconButton size="small"
                                            sx={{
                                                color: 'text.secondary', ml: 0.5,
                                                '&:hover': { color: '#6C63FF', backgroundColor: alpha('#6C63FF', 0.1) },
                                            }}
                                        >
                                            <OpenIcon sx={{ fontSize: 18 }} />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            ))}
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
}
