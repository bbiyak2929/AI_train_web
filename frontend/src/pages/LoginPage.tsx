/**
 * LoginPage — 로그인 / 회원가입 페이지
 */
import React, { useState } from 'react';
import {
    Box, Card, CardContent, TextField, Button, Typography,
    Tabs, Tab, Alert, CircularProgress, alpha, InputAdornment, IconButton,
} from '@mui/material';
import {
    Person, Lock, Email, Visibility, VisibilityOff, Science,
} from '@mui/icons-material';
import { authAPI } from '../api/client';

interface Props {
    onLogin: (username: string, password: string) => Promise<void>;
}

export default function LoginPage({ onLogin }: Props) {
    const [tab, setTab] = useState(0);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await onLogin(username, password);
        } catch (err: any) {
            setError(err?.response?.data?.detail || '로그인에 실패했습니다.');
        }
        setLoading(false);
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);
        try {
            await authAPI.register({ username, email, password, full_name: fullName || undefined });
            setSuccess('회원가입 성공! 로그인해주세요.');
            setTab(0);
        } catch (err: any) {
            setError(err?.response?.data?.detail || '회원가입에 실패했습니다.');
        }
        setLoading(false);
    };

    return (
        <Box sx={{
            minHeight: '100vh',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(ellipse at top, #1a1f3a 0%, #0A0E1A 70%)',
            position: 'relative', overflow: 'hidden',
        }}>
            {/* Gradient orbs */}
            <Box sx={{
                position: 'absolute', width: 400, height: 400, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(108,99,255,0.15) 0%, transparent 70%)',
                top: -100, right: -100, filter: 'blur(60px)',
            }} />
            <Box sx={{
                position: 'absolute', width: 300, height: 300, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(0,217,255,0.1) 0%, transparent 70%)',
                bottom: -50, left: -50, filter: 'blur(60px)',
            }} />

            <Card sx={{
                width: 420, maxWidth: '90vw',
                backgroundColor: alpha('#111827', 0.9),
                backdropFilter: 'blur(40px)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            }}>
                <CardContent sx={{ p: 4 }}>
                    {/* Logo */}
                    <Box sx={{ textAlign: 'center', mb: 3 }}>
                        <Box sx={{
                            width: 56, height: 56, borderRadius: 3, mx: 'auto', mb: 2,
                            background: 'linear-gradient(135deg, #6C63FF, #00D9FF)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 8px 24px rgba(108,99,255,0.3)',
                        }}>
                            <Science sx={{ color: '#fff', fontSize: 32 }} />
                        </Box>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: '#F1F5F9' }}>
                            AI Training Platform
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>
                            학습 실행 관리 시스템
                        </Typography>
                    </Box>

                    {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
                    {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

                    <Tabs
                        value={tab} onChange={(_, v) => { setTab(v); setError(''); setSuccess(''); }}
                        variant="fullWidth" sx={{ mb: 3 }}
                    >
                        <Tab label="로그인" />
                        <Tab label="회원가입" />
                    </Tabs>

                    {tab === 0 ? (
                        <form onSubmit={handleLogin}>
                            <TextField
                                fullWidth label="사용자명" value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start"><Person sx={{ color: '#64748B' }} /></InputAdornment> }}
                                sx={{ mb: 2 }} required
                            />
                            <TextField
                                fullWidth label="비밀번호" type={showPw ? 'text' : 'password'}
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><Lock sx={{ color: '#64748B' }} /></InputAdornment>,
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton size="small" onClick={() => setShowPw(!showPw)}>
                                                {showPw ? <VisibilityOff sx={{ fontSize: 20 }} /> : <Visibility sx={{ fontSize: 20 }} />}
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                                sx={{ mb: 3 }} required
                            />
                            <Button fullWidth variant="contained" type="submit" size="large" disabled={loading}
                                sx={{ py: 1.3, fontSize: '1rem' }}
                            >
                                {loading ? <CircularProgress size={24} /> : '로그인'}
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handleRegister}>
                            <TextField fullWidth label="사용자명" value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start"><Person sx={{ color: '#64748B' }} /></InputAdornment> }}
                                sx={{ mb: 2 }} required
                            />
                            <TextField fullWidth label="이메일" type="email" value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start"><Email sx={{ color: '#64748B' }} /></InputAdornment> }}
                                sx={{ mb: 2 }} required
                            />
                            <TextField fullWidth label="이름 (선택)" value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                sx={{ mb: 2 }}
                            />
                            <TextField fullWidth label="비밀번호" type={showPw ? 'text' : 'password'}
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><Lock sx={{ color: '#64748B' }} /></InputAdornment>,
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton size="small" onClick={() => setShowPw(!showPw)}>
                                                {showPw ? <VisibilityOff sx={{ fontSize: 20 }} /> : <Visibility sx={{ fontSize: 20 }} />}
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                                sx={{ mb: 3 }} required
                            />
                            <Button fullWidth variant="contained" type="submit" size="large" disabled={loading}
                                sx={{ py: 1.3, fontSize: '1rem' }}
                            >
                                {loading ? <CircularProgress size={24} /> : '회원가입'}
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
}
