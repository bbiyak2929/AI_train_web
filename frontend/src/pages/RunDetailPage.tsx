/**
 * RunDetailPage — Run 상세 (Summary / Logs / Artifacts 탭)
 */
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Card, CardContent, Tabs, Tab, Button, Grid,
    Table, TableBody, TableCell, TableRow, Chip, Paper,
    alpha, IconButton, Skeleton, List, ListItem, ListItemIcon,
    ListItemText, TextField, InputAdornment,
} from '@mui/material';
import {
    ArrowBack, Stop, Refresh, Download, Search,
    InsertDriveFile, Terminal,
} from '@mui/icons-material';
import { runsAPI, artifactsAPI } from '../api/client';
import RunStatusBadge from '../components/RunStatusBadge';
import type { Run, Artifact } from '../types';

export default function RunDetailPage() {
    const { projectId, runId } = useParams<{ projectId: string; runId: string }>();
    const navigate = useNavigate();
    const [run, setRun] = useState<Run | null>(null);
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [logs, setLogs] = useState<string[]>([]);
    const [tab, setTab] = useState(0);
    const [loading, setLoading] = useState(true);
    const [logFilter, setLogFilter] = useState('');
    const logEndRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const fetchData = async () => {
        if (!projectId || !runId) return;
        try {
            const [runRes, artRes] = await Promise.all([
                runsAPI.get(projectId, runId),
                artifactsAPI.list(runId).catch(() => ({ data: [] })),
            ]);
            setRun(runRes.data);
            setArtifacts(artRes.data);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (!runId) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs/${runId}`);
        wsRef.current = ws;
        ws.onmessage = (event) => {
            setLogs((prev) => [...prev, event.data]);
        };
        ws.onerror = () => { };
        ws.onclose = () => { };
        return () => { ws.close(); };
    }, [runId]);

    useEffect(() => { fetchData(); }, [projectId, runId]);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleStop = async () => {
        if (!projectId || !runId) return;
        try {
            await runsAPI.stop(projectId, runId);
            fetchData();
        } catch (err) { console.error(err); }
    };

    const formatTime = (t?: string) => {
        if (!t) return '-';
        return new Date(t).toLocaleString('ko-KR');
    };

    const getDuration = (start?: string, end?: string) => {
        if (!start) return '-';
        const s = new Date(start).getTime();
        const e = end ? new Date(end).getTime() : Date.now();
        const diff = Math.floor((e - s) / 1000);
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const sec = diff % 60;
        if (h > 0) return `${h}h ${m}m ${sec}s`;
        if (m > 0) return `${m}m ${sec}s`;
        return `${sec}s`;
    };

    const filteredLogs = logFilter
        ? logs.filter((l) => l.toLowerCase().includes(logFilter.toLowerCase()))
        : logs;

    const formatFileSize = (bytes?: number) => {
        if (!bytes) return '-';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    if (loading) {
        return <Box><Skeleton height={40} width={300} /><Skeleton height={400} sx={{ mt: 2 }} /></Box>;
    }

    if (!run) {
        return <Typography color="error">Run not found</Typography>;
    }

    const isActive = ['queued', 'scheduled', 'running'].includes(run.status);

    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <IconButton onClick={() => navigate(`/projects/${projectId}`)} sx={{ color: 'text.secondary' }}>
                    <ArrowBack />
                </IconButton>
                <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                            {run.name || `Run ${run.id.slice(0, 8)}`}
                        </Typography>
                        <RunStatusBadge status={run.status} size="medium" />
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                        ID: {run.id}
                    </Typography>
                </Box>
                {isActive && (
                    <Button variant="outlined" color="error" startIcon={<Stop />} onClick={handleStop}>
                        중지
                    </Button>
                )}
                <IconButton onClick={fetchData} sx={{ color: 'text.secondary' }}>
                    <Refresh />
                </IconButton>
            </Box>

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
                <Tab label="Summary" />
                <Tab label={`Logs (${logs.length})`} />
                <Tab label={`Artifacts (${artifacts.length})`} />
            </Tabs>

            {/* Summary Tab */}
            {tab === 0 && (
                <Grid container spacing={2.5}>
                    <Grid item xs={12} md={8}>
                        <Card>
                            <CardContent>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: 'text.secondary' }}>
                                    실행 정보
                                </Typography>
                                <Table size="small">
                                    <TableBody>
                                        {[
                                            ['상태', <RunStatusBadge status={run.status} />],
                                            ['Docker 이미지', <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{run.docker_image || '-'}</Typography>],
                                            ['커맨드', <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{run.command || '-'}</Typography>],
                                            ['대기 시작', formatTime(run.queued_at)],
                                            ['실행 시작', formatTime(run.started_at)],
                                            ['실행 종료', formatTime(run.finished_at)],
                                            ['소요 시간', getDuration(run.started_at, run.finished_at)],
                                            ['재시도', `${run.retry_count}회`],
                                        ].map(([label, value], i) => (
                                            <TableRow key={i}>
                                                <TableCell sx={{ width: 140, fontWeight: 600, color: 'text.secondary', border: 'none', py: 1 }}>
                                                    {label as string}
                                                </TableCell>
                                                <TableCell sx={{ border: 'none', py: 1 }}>
                                                    {typeof value === 'string' ? <Typography variant="body2">{value}</Typography> : value}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Card>
                            <CardContent>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: 'text.secondary' }}>
                                    파라미터
                                </Typography>
                                <Box sx={{
                                    p: 2, borderRadius: 2, backgroundColor: alpha('#000', 0.3),
                                    fontFamily: 'monospace', fontSize: '0.8rem', color: 'text.secondary',
                                    whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto',
                                }}>
                                    {JSON.stringify(run.params, null, 2)}
                                </Box>
                            </CardContent>
                        </Card>
                        {run.error_message && (
                            <Card sx={{ mt: 2, borderColor: alpha('#FF5252', 0.3) }}>
                                <CardContent>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#FF5252' }}>
                                        Error
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#FF8A80', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                        {run.error_message}
                                    </Typography>
                                </CardContent>
                            </Card>
                        )}
                    </Grid>
                </Grid>
            )}

            {/* Logs Tab */}
            {tab === 1 && (
                <Box>
                    <TextField
                        size="small" placeholder="로그 검색..." value={logFilter}
                        onChange={(e) => setLogFilter(e.target.value)}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
                        }}
                        sx={{ mb: 2, width: 300 }}
                    />
                    <Paper sx={{
                        p: 0, backgroundColor: '#0D1117',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 2, maxHeight: 600, overflow: 'auto',
                    }}>
                        <Box sx={{ p: 2, fontFamily: '"Fira Code", "Consolas", monospace', fontSize: '0.8rem' }}>
                            {filteredLogs.length === 0 ? (
                                <Box sx={{ textAlign: 'center', py: 4 }}>
                                    <Terminal sx={{ fontSize: 40, color: '#374151', mb: 1 }} />
                                    <Typography color="text.secondary" variant="body2">
                                        {isActive ? '로그를 기다리는 중...' : '로그가 없습니다'}
                                    </Typography>
                                </Box>
                            ) : (
                                filteredLogs.map((line, i) => (
                                    <Box key={i} sx={{
                                        py: 0.2, display: 'flex', gap: 1.5,
                                        '&:hover': { backgroundColor: alpha('#fff', 0.02) },
                                    }}>
                                        <Typography variant="caption" sx={{
                                            color: '#4B5563', fontFamily: 'inherit', userSelect: 'none',
                                            minWidth: 40, textAlign: 'right',
                                        }}>
                                            {i + 1}
                                        </Typography>
                                        <Typography variant="caption" sx={{
                                            color: line.includes('[ERROR]') || line.includes('error')
                                                ? '#FF5252'
                                                : line.includes('[WARN]') ? '#FFB74D'
                                                    : line.includes('[INFO]') ? '#00D9FF'
                                                        : '#C9D1D9',
                                            fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                        }}>
                                            {line}
                                        </Typography>
                                    </Box>
                                ))
                            )}
                            <div ref={logEndRef} />
                            {isActive && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                                    <Box sx={{
                                        width: 8, height: 8, borderRadius: '50%', backgroundColor: '#00E676',
                                        animation: 'blink 1s infinite',
                                        '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
                                    }} />
                                    <Typography variant="caption" sx={{ color: '#4B5563' }}>실시간 스트리밍 중...</Typography>
                                </Box>
                            )}
                        </Box>
                    </Paper>
                </Box>
            )}

            {/* Artifacts Tab */}
            {tab === 2 && (
                <Card>
                    <CardContent>
                        {artifacts.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 4 }}>
                                <InsertDriveFile sx={{ fontSize: 40, color: 'action.disabled', mb: 1 }} />
                                <Typography color="text.secondary">아티팩트가 없습니다</Typography>
                            </Box>
                        ) : (
                            <List>
                                {artifacts.map((art) => (
                                    <ListItem key={art.id} sx={{
                                        borderRadius: 1.5, mb: 0.5,
                                        '&:hover': { backgroundColor: alpha('#6C63FF', 0.05) },
                                    }}>
                                        <ListItemIcon>
                                            <InsertDriveFile sx={{ color: 'text.secondary' }} />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={art.filename}
                                            secondary={`${art.path} · ${formatFileSize(art.size)} · ${art.content_type || ''}`}
                                            primaryTypographyProps={{ fontWeight: 500 }}
                                            secondaryTypographyProps={{ fontSize: '0.75rem' }}
                                        />
                                        <IconButton size="small" sx={{ color: 'text.secondary' }}>
                                            <Download fontSize="small" />
                                        </IconButton>
                                    </ListItem>
                                ))}
                            </List>
                        )}
                    </CardContent>
                </Card>
            )}
        </Box>
    );
}
