/**
 * Layout — 사이드바 네비게이션 + AppBar
 */
import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
    AppBar, Box, CssBaseline, Drawer, IconButton, List, ListItem,
    ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography,
    Avatar, Divider, Chip, alpha, Tooltip,
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
} from '@mui/icons-material';
import type { User } from '../types';

const DRAWER_WIDTH = 260;

interface LayoutProps {
    user: User | null;
    onLogout: () => void;
}

const navItems = [
    { label: '대시보드', icon: <DashboardIcon />, path: '/' },
    { label: '프로젝트', icon: <FolderIcon />, path: '/projects' },
    { label: '서버 관리', icon: <ServerIcon />, path: '/servers' },
];

export default function Layout({ user, onLogout }: LayoutProps) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

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
                <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2, color: '#F1F5F9' }}>
                        AI Training
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748B', fontSize: '0.65rem' }}>
                        Management Platform
                    </Typography>
                </Box>
            </Box>

            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mx: 2 }} />

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
                                    color: active ? '#6C63FF' : '#64748B',
                                }}>
                                    {item.icon}
                                </ListItemIcon>
                                <ListItemText
                                    primary={item.label}
                                    primaryTypographyProps={{
                                        fontSize: '0.875rem',
                                        fontWeight: active ? 600 : 400,
                                        color: active ? '#F1F5F9' : '#94A3B8',
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
                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 2 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{
                        width: 36, height: 36,
                        background: 'linear-gradient(135deg, #6C63FF, #00D9FF)',
                        fontSize: '0.875rem', fontWeight: 600,
                    }}>
                        {user?.username?.[0]?.toUpperCase() || 'U'}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#F1F5F9' }} noWrap>
                            {user?.full_name || user?.username || 'User'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748B' }} noWrap>
                            {user?.email || ''}
                        </Typography>
                    </Box>
                    <Tooltip title="로그아웃">
                        <IconButton size="small" onClick={onLogout} sx={{ color: '#64748B' }}>
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
                    background: 'linear-gradient(180deg, #0A0E1A 0%, #111827 100%)',
                }}
            >
                <Outlet />
            </Box>
        </Box>
    );
}
