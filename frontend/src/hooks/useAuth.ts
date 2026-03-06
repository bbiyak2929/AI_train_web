/**
 * useAuth hook — authentication state management
 */
import { useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api/client';
import type { User } from '../types';

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchUser = useCallback(async () => {
        const token = localStorage.getItem('access_token');
        if (!token) {
            setUser(null);
            setLoading(false);
            return;
        }
        try {
            const res = await authAPI.me();
            setUser(res.data);
        } catch {
            localStorage.removeItem('access_token');
            setUser(null);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    const login = async (username: string, password: string) => {
        const res = await authAPI.login(username, password);
        localStorage.setItem('access_token', res.data.access_token);
        await fetchUser();
    };

    const logout = () => {
        localStorage.removeItem('access_token');
        setUser(null);
    };

    return { user, loading, login, logout, refetch: fetchUser };
}
