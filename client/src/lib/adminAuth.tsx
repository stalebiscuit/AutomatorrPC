import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AuthUser } from './api.js';

type Status = 'loading' | 'authed' | 'anon';

interface AuthContextValue {
  user: AuthUser | null;
  status: Status;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Refresh comfortably before the 15-minute access token expires.
const REFRESH_MS = 13 * 60 * 1000;

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  // Establish session on mount.
  useEffect(() => {
    let alive = true;
    api
      .authMe()
      .then((r) => {
        if (!alive) return;
        setUserState(r.user ?? null);
        setStatus(r.authenticated ? 'authed' : 'anon');
      })
      .catch(() => {
        if (!alive) return;
        setUserState(null);
        setStatus('anon');
      });
    return () => {
      alive = false;
    };
  }, []);

  // Silent rotation while authed (also happens on-demand via the 401 retry).
  useEffect(() => {
    if (status !== 'authed') return;
    const id = window.setInterval(() => {
      void api.authRefresh().catch(() => undefined);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [status]);

  const setUser = (next: AuthUser | null) => {
    setUserState(next);
    setStatus(next ? 'authed' : 'anon');
  };

  const logout = async () => {
    await api.authLogout().catch(() => undefined);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, status, setUser, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAdminAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  return ctx;
}

/** Route guard — redirects to login when anonymous; optionally requires super-admin. */
export function AuthGate({
  children,
  requireSuperadmin = false,
}: {
  children: ReactNode;
  requireSuperadmin?: boolean;
}) {
  const { status, user } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'anon') navigate('/admin/login', { replace: true });
  }, [status, navigate]);

  if (status === 'loading') {
    return (
      <div className="wrap">
        <div className="state">Checking session…</div>
      </div>
    );
  }
  if (status === 'anon') return null;
  if (requireSuperadmin && user?.role !== 'superadmin') {
    return (
      <div className="wrap">
        <div className="state error" role="alert">
          Super-admin access is required for this page.
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
