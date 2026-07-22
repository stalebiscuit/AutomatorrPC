import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAdminAuth } from '../../lib/adminAuth.js';

/** Shared top nav for the admin area — tabs + current user + sign out. */
export function AdminNav() {
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();
  const isSuper = user?.role === 'superadmin';

  // Open ("new") feedback count — visible from any admin page.
  const countQ = useQuery({
    queryKey: ['admin-feedback-count'],
    queryFn: () => api.listFeedback({ page: 1 }),
    staleTime: 30_000,
    retry: false,
    enabled: !!user,
  });
  const newCount = countQ.data?.counts.new ?? 0;

  const onLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : '');

  return (
    <nav className="admin-nav" aria-label="Admin sections">
      <div className="admin-nav-links">
        <NavLink to="/admin" end className={cls}>
          Analytics
        </NavLink>
        <NavLink to="/admin/feedback" className={cls}>
          Feedback
          {newCount > 0 && <span className="fb-badge">{newCount}</span>}
        </NavLink>
        {isSuper && (
          <NavLink to="/admin/domains" className={cls}>
            Allowed Domains
          </NavLink>
        )}
        {isSuper && (
          <NavLink to="/admin/users" className={cls}>
            Users
          </NavLink>
        )}
      </div>
      <div className="admin-nav-user">
        {user && (
          <span className="admin-who">
            {user.email}
            <span className={`role-badge role-${user.role}`}>{user.role}</span>
          </span>
        )}
        <button type="button" className="admin-link" onClick={() => void onLogout()}>
          SIGN OUT
        </button>
      </div>
    </nav>
  );
}
