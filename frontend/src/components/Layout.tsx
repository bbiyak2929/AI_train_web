/**
 * Layout — 사이드바 네비게이션 + AppBar
 */
import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
    AppBar, Box, CssBaseline, Drawer, IconButton, List, ListItem,
    ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography,
    Avatar, Divider, Chip, alpha, Tooltip, useTheme, Snackbar, Alert,
} from '@mui/material';
import {
    Menu as MenuIcon,
    Dashboard as DashboardIcon,
    Folder as FolderIcon,
    PlayArrow as RunIcon,
    Storage as ServerIcon,
    Logout as LogoutIcon,
    Science as ScienceIcon,
    Person as PersonIcon,
    DarkMode as DarkModeIcon,
    LightMode as LightModeIcon,
    NotificationsActive as NotifOnIcon,
    NotificationsOff as NotifOffIcon,
} from '@mui/icons-material';
import { useThemeMode } from '../theme/ThemeContext';
import { authAPI } from '../api/client';
import type { User } from '../types';

const DRAWER_WIDTH = 260;

interface LayoutProps {
    user: User | null;
    onLogout: () => void;
    onUserUpdate?: (user: User) => void;
}

const navItems = [
    { label: '대시보드', icon: <DashboardIcon />, path: '/' },
    { label: '프로젝트', icon: <FolderIcon />, path: '/projects' },
    { label: '서버 관리', icon: <ServerIcon />, path: '/servers' },
];

export default function Layout({ user, onLogout, onUserUpdate }: LayoutProps) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [notifSnack, setNotifSnack] = useState<{ open: boolean; message: string } | null>(null);
    const navigate = useNavigate();
    const location = useLocation();
    const { mode, toggleTheme } = useThemeMode();
    const isDark = mode === 'dark';

    const handleToggleNotify = async () => {
        if (!user) return;
        try {
            const res = await authAPI.updateNotifications(!user.notify_email);
            if (onUserUpdate) onUserUpdate(res.data);
            setNotifSnack({
                open: true,
                message: res.data.notify_email
                    ? '이메일 알림이 켜졌습니다 📬'
                    : '이메일 알림이 꺼졌습니다',
            });
        } catch {
            setNotifSnack({ open: true, message: '알림 설정 변경 실패' });
        }
    };

    const drawer = (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Logo */}
            <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                    sx={{
                        width: 40, height: 40, borderRadius: 2,
                        background: 'linear-gradient(135deg, #6C63FF, #00D9FF)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    <ScienceIcon sx={{ color: '#fff', fontSize: 24 }} />
                </Box>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2, color: isDark ? '#F1F5F9' : '#1E293B' }}>
                        AI Training
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                        Management Platform
                    </Typography>
                </Box>
                <Tooltip title={isDark ? '라이트 모드' : '다크 모드'}>
                    <IconButton onClick={toggleTheme} size="small" sx={{ color: isDark ? '#FFB74D' : '#6C63FF' }}>
                        {isDark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
                    </IconButton>
                </Tooltip>
            </Box>

            <Divider sx={{ borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)', mx: 2 }} />

            {/* Navigation */}
            <List sx={{ flex: 1, px: 1.5, pt: 2 }}>
                {navItems.map((item) => {
                    const active = item.path === '/'
                        ? location.pathname === '/'
                        : location.pathname.startsWith(item.path);
                    return (
                        <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
                            <ListItemButton
                                onClick={() => { navigate(item.path); setMobileOpen(false); }}
                                sx={{
                                    borderRadius: 2, py: 1.2,
                                    backgroundColor: active ? alpha('#6C63FF', 0.15) : 'transparent',
                                    '&:hover': { backgroundColor: alpha('#6C63FF', 0.1) },
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                <ListItemIcon sx={{
                                    minWidth: 40,
                                    color: active ? '#6C63FF' : 'text.secondary',
                                }}>
                                    {item.icon}
                                </ListItemIcon>
                                <ListItemText
                                    primary={item.label}
                                    primaryTypographyProps={{
                                        fontSize: '0.875rem',
                                        fontWeight: active ? 600 : 400,
                                        color: active
                                            ? (isDark ? '#F1F5F9' : '#1E293B')
                                            : (isDark ? '#94A3B8' : '#64748B'),
                                    }}
                                />
                                {active && (
                                    <Box sx={{
                                        width: 4, height: 20, borderRadius: 2,
                                        background: 'linear-gradient(180deg, #6C63FF, #00D9FF)',
                                    }} />
                                )}
                            </ListItemButton>
                        </ListItem>
                    );
                })}
            </List>

            {/* User Info */}
            <Box sx={{ p: 2 }}>
                <Divider sx={{ borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)', mb: 2 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{
                        width: 36, height: 36,
                        background: 'linear-gradient(135deg, #6C63FF, #00D9FF)',
                        fontSize: '0.875rem', fontWeight: 600,
                    }}>
                        {user?.username?.[0]?.toUpperCase() || 'U'}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: isDark ? '#F1F5F9' : '#1E293B' }} noWrap>
                            {user?.full_name || user?.username || 'User'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                            {user?.email || ''}
                        </Typography>
                    </Box>
                    <Tooltip title={user?.notify_email ? '이메일 알림 끄기' : '이메일 알림 켜기'}>
                        <IconButton size="small" onClick={handleToggleNotify}
                            sx={{ color: user?.notify_email ? '#10B981' : 'text.secondary' }}>
                            {user?.notify_email ? <NotifOnIcon fontSize="small" /> : <NotifOffIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="로그아웃">
                        <IconButton size="small" onClick={onLogout} sx={{ color: 'text.secondary' }}>
                            <LogoutIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            <CssBaseline />

            {/* AppBar (Mobile) */}
            <AppBar position="fixed" sx={{ display: { md: 'none' }, zIndex: (t) => t.zIndex.drawer + 1 }}>
                <Toolbar>
                    <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)}>
                        <MenuIcon />
                    </IconButton>
                    <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>
                        AI Training
                    </Typography>
                </Toolbar>
            </AppBar>

            {/* Sidebar */}
            <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
                <Drawer
                    variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)}
                    ModalProps={{ keepMounted: true }}
                    sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
                >
                    {drawer}
                </Drawer>
                <Drawer
                    variant="permanent"
                    sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
                    open
                >
                    {drawer}
                </Drawer>
            </Box>

            {/* Main Content */}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: { xs: 2, md: 3.5 },
                    pt: { xs: 10, md: 3.5 },
                    width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
                    minHeight: '100vh',
                    background: isDark
                        ? 'linear-gradient(180deg, #0A0E1A 0%, #111827 100%)'
                        : 'linear-gradient(180deg, #F5F7FA 0%, #E8ECF1 100%)',
                }}
            >
                <Outlet />
            </Box>

            {/* Notification Snackbar */}
            {notifSnack && (
                <Snackbar open={notifSnack.open} autoHideDuration={3000}
                    onClose={() => setNotifSnack(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                >
                    <Alert severity="success" variant="filled" onClose={() => setNotifSnack(null)}>
                        {notifSnack.message}
                    </Alert>
                </Snackbar>
            )}
        </Box>
    );
}
