import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  api,
  type FeedbackDTO,
  type FeedbackStatus,
  type FeedbackType,
} from '../lib/api.js';
import { TopBar } from '../components/TopBar.js';
import { AdminNav } from '../components/admin/AdminNav.js';

/**
 * Admin feedback triage tab (launch-polish P4) — filter chips by status/type,
 * expandable messages, context links back to the exact page a report came
 * from, and inline status/note editing.
 */

const STATUSES: FeedbackStatus[] = ['new', 'reviewed', 'done', 'dismissed'];
const TYPES: Array<{ id: FeedbackType; label: string }> = [
  { id: 'idea', label: 'IDEA' },
  { id: 'bug', label: 'BUG' },
  { id: 'data', label: 'WRONG DATA' },
  { id: 'other', label: 'OTHER' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) +
        ' ' +
        d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

/** Rebuild a live link from captured context (compare pair, build, or path). */
function contextLink(f: FeedbackDTO): { to: string; label: string } | null {
  const c = f.context;
  if (c.category && c.slugs.length === 2) {
    return {
      to: `/compare/${c.category}/${c.slugs[0]}-vs-${c.slugs[1]}`,
      label: `${c.category}: ${c.slugs[0]} vs ${c.slugs[1]}`,
    };
  }
  if (c.buildShortId) return { to: `/pc-builder/${c.buildShortId}`, label: `build ${c.buildShortId}` };
  if (c.path) return { to: c.path, label: c.path };
  return null;
}

export function AdminFeedbackPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<FeedbackStatus | undefined>(undefined);
  const [type, setType] = useState<FeedbackType | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const listQ = useQuery({
    queryKey: ['admin-feedback', status ?? 'all', type ?? 'all', page],
    queryFn: () => api.listFeedback({ status, type, page }),
    retry: false,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-feedback'] });

  const updateM = useMutation({
    mutationFn: (input: { id: string; patch: { status?: FeedbackStatus; adminNote?: string } }) =>
      api.updateFeedback(input.id, input.patch),
    onSuccess: () => void invalidate(),
  });

  const rows = listQ.data?.feedback ?? [];
  const counts = listQ.data?.counts;
  const total = listQ.data?.total ?? 0;
  const pageSize = listQ.data?.pageSize ?? 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const pickStatus = (s: FeedbackStatus | undefined) => {
    setStatus(s);
    setPage(1);
  };
  const pickType = (t: FeedbackType | undefined) => {
    setType(t);
    setPage(1);
  };

  return (
    <div className="wrap">
      <TopBar />
      <AdminNav />
      <div className="admin-head">
        <h1 className="admin-title">Feedback</h1>
      </div>
      <p className="admin-desc">
        Everything visitors send via the feedback form. &ldquo;Wrong data&rdquo; reports link back
        to the exact comparison or build they came from.
      </p>

      <div className="fb-filters">
        <div className="fb-filter-row" role="group" aria-label="Filter by status">
          <button
            type="button"
            className={`fb-type${status === undefined ? ' on' : ''}`}
            onClick={() => pickStatus(undefined)}
          >
            ALL
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`fb-type${status === s ? ' on' : ''}`}
              onClick={() => pickStatus(s)}
            >
              {s.toUpperCase()}
              {counts ? ` (${counts[s]})` : ''}
            </button>
          ))}
        </div>
        <div className="fb-filter-row" role="group" aria-label="Filter by type">
          <button
            type="button"
            className={`fb-type${type === undefined ? ' on' : ''}`}
            onClick={() => pickType(undefined)}
          >
            ALL TYPES
          </button>
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`fb-type${type === t.id ? ' on' : ''}`}
              onClick={() => pickType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {listQ.isLoading && <div className="state">Loading feedback…</div>}
      {listQ.isError && (
        <div className="state error" role="alert">
          Could not load feedback.
        </div>
      )}

      {!listQ.isLoading && !listQ.isError && rows.length === 0 && (
        <div className="mgmt-empty">No feedback yet{status || type ? ' for this filter' : ''}.</div>
      )}

      {rows.length > 0 && (
        <div className="mgmt-table-wrap">
          <table className="mgmt-table fb-table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Type</th>
                <th>Message</th>
                <th>Context</th>
                <th>Email</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const link = contextLink(f);
                const isOpen = expanded === f.id;
                return (
                  <tr key={f.id}>
                    <td className="mono fb-when">{fmtDate(f.createdAt)}</td>
                    <td>
                      <span className={`fb-tag fb-tag-${f.type}`}>
                        {TYPES.find((t) => t.id === f.type)?.label ?? f.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="fb-msg-cell">
                      <button
                        type="button"
                        className={`fb-msg${isOpen ? ' open' : ''}`}
                        onClick={() => setExpanded(isOpen ? null : f.id)}
                        title={isOpen ? 'Collapse' : 'Expand'}
                      >
                        {f.message}
                      </button>
                      {isOpen && (
                        <div className="fb-note">
                          <input
                            aria-label="Admin note"
                            placeholder="Internal note…"
                            value={noteDraft[f.id] ?? f.adminNote}
                            onChange={(e) => setNoteDraft({ ...noteDraft, [f.id]: e.target.value })}
                          />
                          <button
                            type="button"
                            className="admin-link"
                            disabled={updateM.isPending}
                            onClick={() =>
                              updateM.mutate({
                                id: f.id,
                                patch: { adminNote: (noteDraft[f.id] ?? f.adminNote).trim() },
                              })
                            }
                          >
                            SAVE NOTE
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="fb-ctx">
                      {link ? (
                        <Link to={link.to} target="_blank" rel="noreferrer">
                          {link.label} ↗
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="mono">{f.email || '—'}</td>
                    <td>
                      <select
                        aria-label="Status"
                        value={f.status}
                        onChange={(e) =>
                          updateM.mutate({
                            id: f.id,
                            patch: { status: e.target.value as FeedbackStatus },
                          })
                        }
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="fb-pager">
          <button type="button" className="admin-link" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← PREV
          </button>
          <span className="mono">
            {page} / {pages}
          </span>
          <button
            type="button"
            className="admin-link"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            NEXT →
          </button>
        </div>
      )}
    </div>
  );
}
