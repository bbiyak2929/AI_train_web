/**
 * App.tsx — Root application with routing and auth
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, CircularProgress, Box } from '@mui/material';
import theme from './theme/theme';
import { useAuth } from './hooks/useAuth';

// Components
import Layout from './components/Layout';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import RunDetailPage from './pages/RunDetailPage';
import ServersPage from './pages/ServersPage';

function AppContent() {
    const { user, loading, login, logout } = useAuth();

    if (loading) {
        return (
            <Box sx={{
                minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#0A0E1A',
            }}>
                <CircularProgress sx={{ color: '#6C63FF' }} />
            </Box>
        );
    }

    if (!user) {
        return <LoginPage onLogin={login} />;
    }

    return (
        <Routes>
            <Route element={<Layout user={user} onLogout={logout} />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                <Route path="/projects/:projectId/runs/:runId" element={<RunDetailPage />} />
                <Route path="/servers" element={<ServersPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}

export default function App() {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <BrowserRouter>
                <AppContent />
            </BrowserRouter>
        </ThemeProvider>
    );
}
