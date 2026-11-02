import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setToken, setUnauthorizedHandler, tokenStore } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  businessName: string;
  whatsappApi: boolean;
  loading: boolean;
  login: (phone: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [meta, setMeta] = useState({ businessName: '', whatsappApi: false });
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    try {
      await api('/me/push-token', { method: 'PUT', body: { token: null } });
    } catch {}
    setToken(null);
    await tokenStore.clear();
    qc.clear();
    setUser(null);
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      tokenStore.clear();
      setUser(null);
    });
    (async () => {
      const t = await tokenStore.get();
      if (t) {
        setToken(t);
        try {
          const me = await api<{ user: User; businessName: string; whatsappApi: boolean }>('/me');
          setUser(me.user);
          setMeta({ businessName: me.businessName, whatsappApi: me.whatsappApi });
        } catch {
          // offline or expired: an expired token is cleared by the 401 handler
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (phone: string, pin: string) => {
    const r = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { phone, pin } });
    setToken(r.token);
    await tokenStore.set(r.token);
    const me = await api<{ user: User; businessName: string; whatsappApi: boolean }>('/me');
    setMeta({ businessName: me.businessName, whatsappApi: me.whatsappApi });
    setUser(r.user);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, ...meta }), [user, loading, login, logout, meta]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
