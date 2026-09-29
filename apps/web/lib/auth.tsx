'use client';
// Auth context: session state, login/register/logout, token management.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken } from './api';
import { connectSocket, disconnectSocket } from './socket';
import type { User } from '@sigma-snap/shared';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  register: (b: { email: string; username: string; password: string; displayName: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try {
      const me = await api.me();
      setUser(me);
      connectSocket();
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const login = useCallback(async (emailOrUsername: string, password: string) => {
    const r = await api.login({ emailOrUsername, password });
    setToken(r.accessToken);
    setUser(r.user);
    connectSocket();
  }, []);

  const register = useCallback(async (b: { email: string; username: string; password: string; displayName: string }) => {
    const r = await api.register(b);
    setToken(r.accessToken);
    setUser(r.user);
    connectSocket();
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* noop */ }
    setToken(null);
    setUser(null);
    disconnectSocket();
  }, []);

  return <Ctx.Provider value={{ user, loading, login, register, logout, refreshUser }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
