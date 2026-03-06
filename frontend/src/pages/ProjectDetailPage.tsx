/**
 * ProjectDetailPage — 프로젝트 상세 (실험 템플릿 + Run 목록)
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Grid, Card, CardContent, Button, Tabs, Tab,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Skeleton, Chip, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, alpha, IconButton, Tooltip,
} from '@mui/material';
import {
    Add, Science, PlayArrow, ArrowBack, Refresh,
} from '@mui/icons-material';
import { projectsAPI, experimentsAPI, runsAPI, serversAPI } from '../api/client';
import RunStatusBadge from '../components/RunStatusBadge';
import type { Project, Experiment, RunListItem, Server } from '../types';

export default function ProjectDetailPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const [project, setProject] = useState<Project | null>(null);
    const [experiments, setExperiments] = useState<Experiment[]>([]);
    const [runs, setRuns] = useState<RunListItem[]>([]);
    const [servers, setServers] = useState<Server[]>([]);
    const [tab, setTab] = useState(0);
    const [loading, setLoading] = useState(true);

    // Experiment create dialog
    const [expDialog, setExpDialog] = useState(false);
    const [expForm, setExpForm] = useState({ name: '', description: '', docker_image: '', entrypoint: '', version: '' });

    // Run create dialog
    const [runDialog, setRunDialog] = useState(false);
    const [selectedExp, setSelectedExp] = useState<string>('');
    const [runName, setRunName] = useState('');
    const [runParams, setRunParams] = useState('{}');
    const [selectedServer, setSelectedServer] = useState<string>('');

    const fetchData = async () => {
        if (!projectId) return;
        try {
            const [projRes, expRes, runsRes, srvRes] = await Promise.all([
                projectsAPI.get(projectId),
                experimentsAPI.list(projectId),
                runsAPI.list(projectId),
                serversAPI.list(),
            ]);
            setProject(projRes.data);
            setExperiments(expRes.data);
            setRuns(runsRes.data);
            setServers(srvRes.data);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [projectId]);

    const handleCreateExperiment = async () => {
        if (!projectId) return;
        try {
            await experimentsAPI.create(projectId, {
                ...expForm,
                default_params: {},
                default_env: {},
            });
            setExpDialog(false);
            setExpForm({ name: '', description: '', docker_image: '', entrypoint: '', version: '' });
            fetchData();
        } catch (err) { console.error(err); }
    };

    const handleCreateRun = async () => {
        if (!projectId || !selectedExp) return;
        try {
            let params = {};
            try { params = JSON.parse(runParams); } catch { }

            await runsAPI.create(projectId, {
                experiment_id: selectedExp,
                name: runName || undefined,
                params,
                server_id: selectedServer || undefined,
            });
            setRunDialog(false);
            setRunName('');
            setRunParams('{}');
            setSelectedExp('');
            setSelectedServer('');
            fetchData();
        } catch (err) { console.error(err); }
    };

    const openRunDialog = (expId?: string) => {
        if (expId) setSelectedExp(expId);
        setRunDialog(true);
    };

    const formatTime = (t?: string) => {
        if (!t) return '-';
        return new Date(t).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    if (loading) {
        return <Box><Skeleton height={40} width={200} /><Skeleton height={300} sx={{ mt: 2 }} /></Box>;
    }

    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
                <IconButton onClick={() => navigate('/projects')} sx={{ color: '#64748B' }}>
                    <ArrowBack />
                </IconButton>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: '#F1F5F9' }}>
                        {project?.name || 'Project'}
                    </Typography>
                    {project?.description && (
                        <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>
                            {project.description}
                        </Typography>
                    )}
                </Box>
                <Button variant="contained" startIcon={<PlayArrow />} onClick={() => openRunDialog()} disabled={experiments.length === 0}>
                    Run 실행
                </Button>
            </Box>

            {/* Tabs */}
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
                <Tab label={`실험 템플릿 (${experiments.length})`} />
                <Tab label={`실행 기록 (${runs.length})`} />
            </Tabs>

            {/* Experiments Tab */}
            {tab === 0 && (
                <>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                        <Button startIcon={<Add />} variant="outlined" size="small" onClick={() => setExpDialog(true)}>
                            새 실험 템플릿
                        </Button>
                    </Box>
                    <Grid container spacing={2}>
                        {experiments.length === 0 ? (
                            <Grid item xs={12}>
                                <Card sx={{ textAlign: 'center' }}>
                                    <CardContent sx={{ py: 5 }}>
                                        <Science sx={{ fontSize: 44, color: '#374151', mb: 1 }} />
                                        <Typography color="text.secondary">실험 템플릿이 없습니다</Typography>
                                        <Button startIcon={<Add />} sx={{ mt: 2 }} onClick={() => setExpDialog(true)}>
                                            만들기
                                        </Button>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ) : (
                            experiments.map((exp) => (
                                <Grid item xs={12} sm={6} md={4} key={exp.id}>
                                    <Card sx={{
                                        transition: 'all 0.3s',
                                        '&:hover': { transform: 'translateY(-2px)', borderColor: alpha('#00D9FF', 0.3) },
                                    }}>
                                        <CardContent sx={{ p: 2.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                                                <Box sx={{
                                                    width: 38, height: 38, borderRadius: 2,
                                                    background: alpha('#00D9FF', 0.1),
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <Science sx={{ color: '#00D9FF', fontSize: 20 }} />
                                                </Box>
                                                <Box>
                                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{exp.name}</Typography>
                                                    {exp.version && <Chip label={`v${exp.version}`} size="small" sx={{ height: 20, fontSize: '0.65rem' }} />}
                                                </Box>
                                            </Box>
                                            <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 1 }}>
                                                🐳 {exp.docker_image}
                                            </Typography>
                                            {exp.entrypoint && (
                                                <Typography variant="caption" sx={{ color: '#4B5563', display: 'block', mb: 1.5, fontFamily: 'monospace' }}>
                                                    $ {exp.entrypoint}
                                                </Typography>
                                            )}
                                            <Button size="small" variant="outlined" startIcon={<PlayArrow />}
                                                onClick={() => openRunDialog(exp.id)} fullWidth>
                                                이 템플릿으로 실행
                                            </Button>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))
                        )}
                    </Grid>
                </>
            )}

            {/* Runs Tab */}
            {tab === 1 && (
                <TableContainer component={Paper} sx={{ backgroundColor: alpha('#111827', 0.8) }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>이름</TableCell>
                                <TableCell>상태</TableCell>
                                <TableCell>이미지</TableCell>
                                <TableCell>시작</TableCell>
                                <TableCell>종료</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {runs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4 }}>
                                        <Typography color="text.secondary">실행 기록이 없습니다</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                runs.map((run) => (
                                    <TableRow key={run.id} hover sx={{ cursor: 'pointer' }}
                                        onClick={() => navigate(`/projects/${projectId}/runs/${run.id}`)}
                                    >
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                {run.name || run.id.slice(0, 8)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell><RunStatusBadge status={run.status} /></TableCell>
                                        <TableCell>
                                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#94A3B8' }}>
                                                {run.docker_image?.split('/').pop() || '-'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell><Typography variant="caption" sx={{ color: '#94A3B8' }}>{formatTime(run.started_at)}</Typography></TableCell>
                                        <TableCell><Typography variant="caption" sx={{ color: '#94A3B8' }}>{formatTime(run.finished_at)}</Typography></TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Experiment Create Dialog */}
            <Dialog open={expDialog} onClose={() => setExpDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>새 실험 템플릿</DialogTitle>
                <DialogContent>
                    <TextField fullWidth label="이름" value={expForm.name} onChange={(e) => setExpForm({ ...expForm, name: e.target.value })} sx={{ mt: 1, mb: 2 }} required />
                    <TextField fullWidth label="설명" value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} sx={{ mb: 2 }} multiline rows={2} />
                    <TextField fullWidth label="Docker 이미지" value={expForm.docker_image} onChange={(e) => setExpForm({ ...expForm, docker_image: e.target.value })} sx={{ mb: 2 }} required placeholder="pytorch/pytorch:2.1.0" />
                    <TextField fullWidth label="Entrypoint" value={expForm.entrypoint} onChange={(e) => setExpForm({ ...expForm, entrypoint: e.target.value })} sx={{ mb: 2 }} placeholder="python train.py" />
                    <TextField fullWidth label="버전" value={expForm.version} onChange={(e) => setExpForm({ ...expForm, version: e.target.value })} placeholder="1.0" />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setExpDialog(false)} color="inherit">취소</Button>
                    <Button variant="contained" onClick={handleCreateExperiment} disabled={!expForm.name || !expForm.docker_image}>생성</Button>
                </DialogActions>
            </Dialog>

            {/* Run Create Dialog */}
            <Dialog open={runDialog} onClose={() => setRunDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>🚀 Run 실행</DialogTitle>
                <DialogContent>
                    <TextField fullWidth label="Run 이름 (선택)" value={runName} onChange={(e) => setRunName(e.target.value)} sx={{ mt: 1, mb: 2 }} />
                    <TextField fullWidth label="실험 템플릿" select value={selectedExp} onChange={(e) => setSelectedExp(e.target.value)} sx={{ mb: 2 }} required
                        SelectProps={{ native: true }}
                    >
                        <option value="">선택하세요</option>
                        {experiments.map((exp) => <option key={exp.id} value={exp.id}>{exp.name}</option>)}
                    </TextField>
                    <TextField fullWidth label="서버 (선택, 비우면 자동)" select value={selectedServer} onChange={(e) => setSelectedServer(e.target.value)} sx={{ mb: 2 }}
                        SelectProps={{ native: true }}
                    >
                        <option value="">자동 선택</option>
                        {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </TextField>
                    <TextField fullWidth label="파라미터 (JSON)" value={runParams} onChange={(e) => setRunParams(e.target.value)} multiline rows={4}
                        placeholder='{"epochs": 100, "batch_size": 32, "lr": 0.001}'
                        sx={{ fontFamily: 'monospace' }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setRunDialog(false)} color="inherit">취소</Button>
                    <Button variant="contained" startIcon={<PlayArrow />} onClick={handleCreateRun} disabled={!selectedExp}>실행</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
