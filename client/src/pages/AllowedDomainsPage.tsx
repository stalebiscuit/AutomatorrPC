import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiClientError, type AllowedDomainDTO } from '../lib/api.js';
import { TopBar } from '../components/TopBar.js';
import { AdminNav } from '../components/admin/AdminNav.js';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export function AllowedDomainsPage() {
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: ['allowed-domains'], queryFn: api.listDomains, retry: false });

  const [domain, setDomain] = useState('');
  const [note, setNote] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDomain, setEditDomain] = useState('');
  const [editNote, setEditNote] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['allowed-domains'] });

  const createM = useMutation({
    mutationFn: () => api.createDomain(domain.trim(), note.trim() || undefined),
    onSuccess: () => {
      setDomain('');
      setNote('');
      setFormErr(null);
      void invalidate();
    },
    onError: (e) =>
      setFormErr(
        e instanceof ApiClientError && e.code === 'DOMAIN_EXISTS'
          ? 'That domain is already allow-listed.'
          : 'Could not add domain.',
      ),
  });

  const updateM = useMutation({
    mutationFn: (d: AllowedDomainDTO) =>
      api.updateDomain(d.id, editDomain.trim(), editNote.trim() || undefined),
    onSuccess: () => {
      setEditingId(null);
      void invalidate();
    },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => api.deleteDomain(id),
    onSuccess: () => void invalidate(),
  });

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (domain.trim()) createM.mutate();
  };

  const startEdit = (d: AllowedDomainDTO) => {
    setEditingId(d.id);
    setEditDomain(d.domain);
    setEditNote(d.note);
  };

  const domains = listQ.data?.domains ?? [];

  return (
    <div className="wrap">
      <TopBar />
      <AdminNav />
      <div className="admin-head">
        <h1 className="admin-title">Allowed domains</h1>
      </div>
      <p className="admin-desc">
        Anyone with an email at an allow-listed domain can sign in as an admin. Manage exceptions and
        roles on the Users tab.
      </p>

      <form className="mgmt-add" onSubmit={onAdd}>
        <input
          aria-label="Domain"
          placeholder="example.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
        <input
          aria-label="Note (optional)"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="cta solid" disabled={createM.isPending || !domain.trim()}>
          {createM.isPending ? 'ADDING…' : 'ADD DOMAIN'}
        </button>
      </form>
      {formErr && (
        <p className="login-err" role="alert">
          {formErr}
        </p>
      )}

      {listQ.isLoading && <div className="state">Loading domains…</div>}
      {listQ.isError && (
        <div className="state error" role="alert">
          Could not load domains.
        </div>
      )}

      {listQ.data && (
        <div className="mgmt-table-wrap">
          <table className="mgmt-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Note</th>
                <th>Added by</th>
                <th>Added</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {domains.length === 0 && (
                <tr>
                  <td colSpan={5} className="mgmt-empty">
                    No domains allow-listed yet.
                  </td>
                </tr>
              )}
              {domains.map((d) =>
                editingId === d.id ? (
                  <tr key={d.id}>
                    <td>
                      <input value={editDomain} onChange={(e) => setEditDomain(e.target.value)} />
                    </td>
                    <td>
                      <input value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                    </td>
                    <td>{d.createdBy || '—'}</td>
                    <td>{fmtDate(d.createdAt)}</td>
                    <td className="col-actions">
                      <button
                        type="button"
                        className="admin-link"
                        onClick={() => updateM.mutate(d)}
                        disabled={updateM.isPending || !editDomain.trim()}
                      >
                        SAVE
                      </button>
                      <button
                        type="button"
                        className="admin-link muted"
                        onClick={() => setEditingId(null)}
                      >
                        CANCEL
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={d.id}>
                    <td className="mono">{d.domain}</td>
                    <td>{d.note || '—'}</td>
                    <td>{d.createdBy || '—'}</td>
                    <td>{fmtDate(d.createdAt)}</td>
                    <td className="col-actions">
                      <button type="button" className="admin-link" onClick={() => startEdit(d)}>
                        EDIT
                      </button>
                      <button
                        type="button"
                        className="admin-link danger"
                        onClick={() => {
                          if (window.confirm(`Remove ${d.domain} from the allow-list?`))
                            deleteM.mutate(d.id);
                        }}
                      >
                        REMOVE
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
