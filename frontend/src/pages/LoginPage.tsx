/**
 * LoginPage — 로그인 / 회원가입 페이지
 */
import React, { useState } from 'react';
import {
    Box, Card, CardContent, TextField, Button, Typography,
    Tabs, Tab, Alert, CircularProgress, alpha, InputAdornment, IconButton,
    useTheme,
} from '@mui/material';
import {
    Person, Lock, Email, Visibility, VisibilityOff, Science,
    DarkMode as DarkModeIcon, LightMode as LightModeIcon,
} from '@mui/icons-material';
import { authAPI } from '../api/client';
import { useThemeMode } from '../theme/ThemeContext';

interface Props {
    onLogin: (username: string, password: string) => Promise<void>;
}

export default function LoginPage({ onLogin }: Props) {
    const theme = useTheme();
    const { mode, toggleTheme } = useThemeMode();
    const isDark = mode === 'dark';
    const [tab, setTab] = useState(0);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // 이메일 인증 상태
    const [verifyStep, setVerifyStep] = useState(false);
    const [verifyEmail, setVerifyEmail] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await onLogin(username, password);
        } catch (err: any) {
            const detail = extractError(err, '로그인에 실패했습니다.');
            if (detail === '이메일 인증이 필요합니다.') {
                setError('이메일 인증이 필요합니다. 회원가입 탭에서 인증을 완료해주세요.');
            } else {
                setError(detail);
            }
        }
        setLoading(false);
    };

    const extractError = (err: any, fallback: string): string => {
        const detail = err?.response?.data?.detail;
        if (!detail) return fallback;
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail)) {
            return detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
        }
        return fallback;
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);
        try {
            await authAPI.register({ username, email, password, full_name: fullName || undefined });
            setVerifyEmail(email);
            setVerifyStep(true);
            setSuccess('인증 코드가 이메일로 발송되었습니다. 확인해주세요.');
        } catch (err: any) {
            setError(extractError(err, '회원가입에 실패했습니다.'));
        }
        setLoading(false);
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);
        try {
            const res = await authAPI.verifyEmail(verifyEmail, verifyCode);
            setSuccess(res.data.message || '인증 완료! 로그인해주세요.');
            setVerifyStep(false);
            setVerifyCode('');
            setTab(0);
        } catch (err: any) {
            setError(extractError(err, '인증에 실패했습니다.'));
        }
        setLoading(false);
    };

    const handleResend = async () => {
        if (resendCooldown > 0) return;
        setError('');
        try {
            await authAPI.resendVerify(verifyEmail);
            setSuccess('인증 코드가 재발송되었습니다.');
            setResendCooldown(60);
            const timer = setInterval(() => {
                setResendCooldown((prev) => {
                    if (prev <= 1) { clearInterval(timer); return 0; }
                    return prev - 1;
                });
            }, 1000);
        } catch (err: any) {
            setError(extractError(err, '재발송에 실패했습니다.'));
        }
    };

    return (
        <Box sx={{
            minHeight: '100vh',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isDark
                ? 'radial-gradient(ellipse at top, #1a1f3a 0%, #0A0E1A 70%)'
                : 'radial-gradient(ellipse at top, #e8eaf6 0%, #f5f5f5 70%)',
            position: 'relative', overflow: 'hidden',
            transition: 'background 0.3s',
        }}>
            {/* Gradient orbs */}
            <Box sx={{
                position: 'absolute', width: 400, height: 400, borderRadius: '50%',
                background: isDark
                    ? 'radial-gradient(circle, rgba(108,99,255,0.15) 0%, transparent 70%)'
                    : 'radial-gradient(circle, rgba(108,99,255,0.08) 0%, transparent 70%)',
                top: -100, right: -100, filter: 'blur(60px)',
            }} />
            <Box sx={{
                position: 'absolute', width: 300, height: 300, borderRadius: '50%',
                background: isDark
                    ? 'radial-gradient(circle, rgba(0,217,255,0.1) 0%, transparent 70%)'
                    : 'radial-gradient(circle, rgba(0,217,255,0.06) 0%, transparent 70%)',
                bottom: -50, left: -50, filter: 'blur(60px)',
            }} />

            {/* Theme Toggle */}
            <IconButton
                onClick={toggleTheme}
                sx={{
                    position: 'absolute', top: 20, right: 20,
                    color: isDark ? '#FFB74D' : '#6C63FF',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                    '&:hover': { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' },
                }}
            >
                {isDark ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>

            <Card sx={{
                width: 420, maxWidth: '90vw',
                backgroundColor: isDark ? alpha('#111827', 0.9) : alpha('#ffffff', 0.95),
                backdropFilter: 'blur(40px)',
                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                boxShadow: isDark ? '0 25px 60px rgba(0,0,0,0.5)' : '0 25px 60px rgba(0,0,0,0.1)',
                transition: 'all 0.3s',
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
                        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                            AI Training Platform
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
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
                                InputProps={{ startAdornment: <InputAdornment position="start"><Person sx={{ color: 'text.disabled' }} /></InputAdornment> }}
                                sx={{ mb: 2 }} required
                            />
                            <TextField
                                fullWidth label="비밀번호" type={showPw ? 'text' : 'password'}
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><Lock sx={{ color: 'text.disabled' }} /></InputAdornment>,
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton size="small" onClick={() => setShowPw(!showPw)} sx={{ color: 'text.secondary' }}>
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
                    ) : verifyStep ? (
                        <form onSubmit={handleVerify}>
                            <Box sx={{ textAlign: 'center', mb: 3 }}>
                                <Email sx={{ fontSize: 48, color: '#00D9FF', mb: 1 }} />
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    <strong style={{ color: isDark ? '#F1F5F9' : '#1a1a2e' }}>{verifyEmail}</strong> 으로<br />
                                    인증 코드를 발송했습니다.
                                </Typography>
                            </Box>
                            <TextField
                                fullWidth label="인증 코드 (6자리)" value={verifyCode}
                                onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                                    setVerifyCode(v);
                                }}
                                inputProps={{ maxLength: 6, style: { textAlign: 'center', fontSize: '1.5rem', letterSpacing: '8px', fontFamily: 'monospace' } }}
                                sx={{ mb: 3 }} required placeholder="000000"
                            />
                            <Button fullWidth variant="contained" type="submit" size="large" disabled={loading || verifyCode.length !== 6}
                                sx={{ py: 1.3, fontSize: '1rem', mb: 1.5 }}
                            >
                                {loading ? <CircularProgress size={24} /> : '인증 완료'}
                            </Button>
                            <Button fullWidth variant="text" onClick={handleResend}
                                disabled={resendCooldown > 0}
                                sx={{ color: 'text.secondary', fontSize: '0.85rem' }}
                            >
                                {resendCooldown > 0 ? `재발송 (${resendCooldown}초)` : '인증 코드 재발송'}
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handleRegister}>
                            <TextField fullWidth label="사용자명" value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start"><Person sx={{ color: 'text.disabled' }} /></InputAdornment> }}
                                sx={{ mb: 2 }} required
                            />
                            <TextField fullWidth label="이메일" type="email" value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start"><Email sx={{ color: 'text.disabled' }} /></InputAdornment> }}
                                sx={{ mb: 2 }} required
                            />
                            <TextField fullWidth label="이름 (선택)" value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                sx={{ mb: 2 }}
                            />
                            <TextField fullWidth label="비밀번호" type={showPw ? 'text' : 'password'}
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><Lock sx={{ color: 'text.disabled' }} /></InputAdornment>,
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton size="small" onClick={() => setShowPw(!showPw)} sx={{ color: 'text.secondary' }}>
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
