import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiClientError, type AdminUserDTO } from '../lib/api.js';
import { TopBar } from '../components/TopBar.js';
import { AdminNav } from '../components/admin/AdminNav.js';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export function AdminUsersPage() {
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: ['admin-users'], queryFn: api.listUsers, retry: false });

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users'] });

  const createM = useMutation({
    mutationFn: () => api.createUser(email.trim(), displayName.trim() || undefined),
    onSuccess: () => {
      setEmail('');
      setDisplayName('');
      setFormErr(null);
      void invalidate();
    },
    onError: (e) =>
      setFormErr(
        e instanceof ApiClientError && e.code === 'USER_EXISTS'
          ? 'That email is already a user.'
          : 'Could not invite user.',
      ),
  });

  const statusM = useMutation({
    mutationFn: (v: { id: string; status: 'active' | 'disabled' }) =>
      api.updateUser(v.id, { status: v.status }),
    onSuccess: () => void invalidate(),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => void invalidate(),
  });

  const onInvite = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) createM.mutate();
  };

  const users = listQ.data?.users ?? [];

  return (
    <div className="wrap">
      <TopBar />
      <AdminNav />
      <div className="admin-head">
        <h1 className="admin-title">Users</h1>
      </div>
      <p className="admin-desc">
        Everyone with admin access. Invite a user by email — they sign in with an emailed code, no
        password — and invited users are always <strong>admin</strong>. Founders are super-admins
        and are protected from changes here.
      </p>

      <form className="mgmt-add" onSubmit={onInvite}>
        <input
          aria-label="Email"
          type="email"
          placeholder="person@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          aria-label="Display name (optional)"
          placeholder="Display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <button type="submit" className="cta solid" disabled={createM.isPending || !email.trim()}>
          {createM.isPending ? 'INVITING…' : 'INVITE USER'}
        </button>
      </form>
      {formErr && (
        <p className="login-err" role="alert">
          {formErr}
        </p>
      )}

      {listQ.isLoading && <div className="state">Loading users…</div>}
      {listQ.isError && (
        <div className="state error" role="alert">
          Could not load users.
        </div>
      )}

      {listQ.data && (
        <div className="mgmt-table-wrap">
          <table className="mgmt-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Source</th>
                <th>Last login</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="mgmt-empty">
                    No users yet.
                  </td>
                </tr>
              )}
              {users.map((u: AdminUserDTO) => {
                const superadmin = u.role === 'superadmin';
                const disabled = u.status === 'disabled';
                return (
                  <tr key={u.id} className={disabled ? 'row-disabled' : undefined}>
                    <td className="mono">{u.email}</td>
                    <td>{u.displayName || '—'}</td>
                    <td>
                      <span className={`role-badge role-${u.role}`}>{u.role}</span>
                    </td>
                    <td>{u.status}</td>
                    <td>{u.source}</td>
                    <td>{fmtDate(u.lastLoginAt)}</td>
                    <td className="col-actions">
                      {superadmin ? (
                        <span className="admin-link muted" title="Founders are protected.">
                          PROTECTED
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="admin-link"
                            onClick={() =>
                              statusM.mutate({ id: u.id, status: disabled ? 'active' : 'disabled' })
                            }
                            disabled={statusM.isPending}
                          >
                            {disabled ? 'ENABLE' : 'DISABLE'}
                          </button>
                          <button
                            type="button"
                            className="admin-link danger"
                            onClick={() => {
                              if (window.confirm(`Remove ${u.email}? They lose admin access.`))
                                deleteM.mutate(u.id);
                            }}
                          >
                            REMOVE
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
