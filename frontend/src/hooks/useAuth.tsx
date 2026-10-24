import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { api } from '../lib/api';
import type { UserInfo } from '../types/api';

interface AuthContextValue {
  user: UserInfo | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  csrfToken: string | null;
  getCsrfToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  // Inisialisasi CSRF token dari sessionStorage jika ada
  const [csrfToken, setCsrfToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('csrfToken') || null;
    }
    return null;
  });

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<{ data: UserInfo }>('/auth/me');
      setUser(res.data.data ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  // Ambil CSRF token dari backend setelah login/register
  const fetchCsrf = useCallback(async () => {
    try {
      const res = await api.get<{ token: string }>('/auth/csrf');
      const token = res.data.token;
      setCsrfToken(token);
      // Simpan ke sessionStorage agar tersedia untuk request lain
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('csrfToken', token);
      }
    } catch {
      setCsrfToken(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ data: UserInfo }>('/auth/me');
        if (!cancelled) setUser(res.data.data ?? null);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    fetchCsrf();
    return () => { cancelled = true; };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ data: UserInfo }>('/auth/login', { email, password });
    setUser(res.data.data ?? null);
    await fetchCsrf();
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await api.post<{ data: UserInfo }>('/auth/register', { name, email, password });
    setUser(res.data.data ?? null);
    await fetchCsrf();
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // tetap keluar
    }
    setUser(null);
    window.location.href = '/login';
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api.post('/auth/change-password', { currentPassword, newPassword });
    await refreshUser();
  };

  // Fungsi helper untuk mendapatkan CSRF token yang tersedia
  const getCsrfToken = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('csrfToken') || csrfToken || null;
  }, [csrfToken]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, changePassword, refreshUser, csrfToken, getCsrfToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth dipanggil di luar AuthProvider');
  return ctx;
}
