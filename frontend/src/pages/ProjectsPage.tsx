/**
 * ProjectsPage — 프로젝트 목록 + 생성
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Grid, Card, CardContent, CardActionArea, Button,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    Skeleton, Chip, alpha, IconButton, Tooltip,
} from '@mui/material';
import { Add, Folder, People, CalendarToday } from '@mui/icons-material';
import { projectsAPI } from '../api/client';
import type { ProjectListItem } from '../types';

export default function ProjectsPage() {
    const [projects, setProjects] = useState<ProjectListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [creating, setCreating] = useState(false);
    const navigate = useNavigate();

    const fetchProjects = async () => {
        try {
            const res = await projectsAPI.list();
            setProjects(res.data);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    useEffect(() => { fetchProjects(); }, []);

    const handleCreate = async () => {
        setCreating(true);
        try {
            const res = await projectsAPI.create({ name, description: description || undefined });
            setDialogOpen(false);
            setName('');
            setDescription('');
            navigate(`/projects/${res.data.id}`);
        } catch (err) {
            console.error(err);
        }
        setCreating(false);
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString('ko-KR');

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary' }}>프로젝트</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>학습 프로젝트를 관리합니다</Typography>
                </Box>
                <Button
                    variant="contained" startIcon={<Add />}
                    onClick={() => setDialogOpen(true)}
                    sx={{ px: 3 }}
                >
                    새 프로젝트
                </Button>
            </Box>

            <Grid container spacing={2.5}>
                {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <Grid item xs={12} sm={6} md={4} key={i}>
                            <Card><CardContent><Skeleton height={100} /></CardContent></Card>
                        </Grid>
                    ))
                ) : projects.length === 0 ? (
                    <Grid item xs={12}>
                        <Card sx={{ textAlign: 'center' }}>
                            <CardContent sx={{ py: 6 }}>
                                <Folder sx={{ fontSize: 48, color: 'action.disabled', mb: 2 }} />
                                <Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>프로젝트가 없습니다</Typography>
                                <Typography variant="body2" sx={{ color: 'text.disabled', mb: 3 }}>
                                    새 프로젝트를 만들어 학습과 실험을 시작하세요
                                </Typography>
                                <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)}>
                                    프로젝트 만들기
                                </Button>
                            </CardContent>
                        </Card>
                    </Grid>
                ) : (
                    projects.map((p) => (
                        <Grid item xs={12} sm={6} md={4} key={p.id}>
                            <Card sx={{
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                    transform: 'translateY(-4px)',
                                    borderColor: alpha('#6C63FF', 0.3),
                                    boxShadow: `0 12px 40px ${alpha('#6C63FF', 0.1)}`,
                                },
                            }}>
                                <CardActionArea onClick={() => navigate(`/projects/${p.id}`)}>
                                    <CardContent sx={{ p: 2.5 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                                            <Box sx={{
                                                width: 42, height: 42, borderRadius: 2,
                                                background: 'linear-gradient(135deg, rgba(108,99,255,0.2), rgba(0,217,255,0.1))',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Folder sx={{ color: '#6C63FF', fontSize: 22 }} />
                                            </Box>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                {p.name}
                                            </Typography>
                                        </Box>

                                        {p.description && (
                                            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, lineHeight: 1.6 }}
                                                noWrap
                                            >
                                                {p.description}
                                            </Typography>
                                        )}

                                        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                                            <Chip
                                                icon={<People sx={{ fontSize: 14 }} />}
                                                label={`${p.member_count}명`}
                                                size="small"
                                                sx={{ fontSize: '0.7rem', backgroundColor: alpha('#6C63FF', 0.1), color: 'primary.light' }}
                                            />
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <CalendarToday sx={{ fontSize: 12, color: 'text.disabled' }} />
                                                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                                    {formatDate(p.created_at)}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </CardActionArea>
                            </Card>
                        </Grid>
                    ))
                )}
            </Grid>

            {/* Create Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>새 프로젝트 만들기</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus fullWidth label="프로젝트명" value={name}
                        onChange={(e) => setName(e.target.value)}
                        sx={{ mt: 1, mb: 2 }} required
                    />
                    <TextField
                        fullWidth label="설명 (선택)" value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        multiline rows={3}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2.5 }}>
                    <Button onClick={() => setDialogOpen(false)} color="inherit">취소</Button>
                    <Button variant="contained" onClick={handleCreate} disabled={!name || creating}>
                        {creating ? '생성 중...' : '생성'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
