/**
 * DashboardPage — 메인 대시보드
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Grid, Typography, Card, CardContent, Skeleton,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, alpha, Chip,
} from '@mui/material';
import {
    Dns as ServerIcon, PlayArrow as RunIcon,
    CheckCircle as SuccessIcon, Error as ErrorIcon,
    HourglassEmpty as QueuedIcon, TrendingUp as TrendingIcon,
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

    const statCards = stats ? [
        { label: '전체 서버', value: stats.total_servers, icon: <ServerIcon />, color: '#6C63FF', sub: `${stats.online_servers} 온라인` },
        { label: '실행 중', value: stats.running_runs, icon: <RunIcon />, color: '#00D9FF', sub: `${stats.queued_runs} 대기 중` },
        { label: '성공', value: stats.success_runs, icon: <SuccessIcon />, color: '#00E676', sub: `총 ${stats.total_runs} runs` },
        { label: '실패', value: stats.failed_runs, icon: <ErrorIcon />, color: '#FF5252', sub: '주의 필요' },
    ] : [];

    const formatTime = (t?: string) => {
        if (!t) return '-';
        return new Date(t).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <Box>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                    대시보드
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    AI 학습 서버 및 실행 상태 개요
                </Typography>
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
                                position: 'relative', overflow: 'hidden',
                                '&::before': {
                                    content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                                    background: `linear-gradient(90deg, ${s.color}, ${alpha(s.color, 0.3)})`,
                                },
                            }}>
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
                    servers.map((s) => (
                        <Grid item xs={12} sm={6} md={4} key={s.id}>
                            <ServerCard server={s} onClick={() => navigate(`/servers`)} />
                        </Grid>
                    ))
                )}
            </Grid>

            {/* Recent Runs Table */}
            <Grid container spacing={2.5}>
                <Grid item xs={12} md={7}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', mb: 2 }}>
                        🚀 최근 실행
                    </Typography>
                    <TableContainer component={Paper} sx={{ backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.8), backdropFilter: 'blur(20px)' }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>이름</TableCell>
                                    <TableCell>상태</TableCell>
                                    <TableCell>시간</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 3 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton width={120} /></TableCell>
                                            <TableCell><Skeleton width={80} /></TableCell>
                                            <TableCell><Skeleton width={100} /></TableCell>
                                        </TableRow>
                                    ))
                                ) : recentRuns.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} sx={{ textAlign: 'center', py: 3 }}>
                                            <Typography color="text.secondary" variant="body2">실행 기록이 없습니다</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    recentRuns.map((run) => (
                                        <TableRow key={run.id} hover sx={{ cursor: 'pointer' }}
                                            onClick={() => navigate(`/projects/${run.project_id}/runs/${run.id}`)}
                                        >
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    {run.name || run.id.slice(0, 8)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <RunStatusBadge status={run.status} />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                    {formatTime(run.created_at)}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>

                {/* Failed Runs */}
                <Grid item xs={12} md={5}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', mb: 2 }}>
                        ⚠️ 실패한 실행
                    </Typography>
                    <Card>
                        <CardContent>
                            {loading ? (
                                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={40} sx={{ mb: 1 }} />)
                            ) : failedRuns.length === 0 ? (
                                <Box sx={{ textAlign: 'center', py: 3 }}>
                                    <SuccessIcon sx={{ fontSize: 40, color: '#00E676', mb: 1 }} />
                                    <Typography color="text.secondary" variant="body2">실패한 실행이 없습니다 🎉</Typography>
                                </Box>
                            ) : (
                                failedRuns.map((run) => (
                                    <Box key={run.id}
                                        onClick={() => navigate(`/projects/${run.project_id}/runs/${run.id}`)}
                                        sx={{
                                            display: 'flex', alignItems: 'center', gap: 1.5,
                                            p: 1.5, mb: 1, borderRadius: 2, cursor: 'pointer',
                                            backgroundColor: alpha('#FF5252', 0.05),
                                            border: `1px solid ${alpha('#FF5252', 0.1)}`,
                                            '&:hover': { backgroundColor: alpha('#FF5252', 0.1) },
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        <ErrorIcon sx={{ color: '#FF5252', fontSize: 20 }} />
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                {run.name || run.id.slice(0, 8)}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                {formatTime(run.created_at)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}
