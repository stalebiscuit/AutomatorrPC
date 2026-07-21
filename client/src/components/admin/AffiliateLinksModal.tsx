import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AffiliateLinkConfig, AffiliateMode } from '@automatorr/shared';
import { api, ApiClientError, type AffiliateUpdateBody } from '../../lib/api.js';
import { previewAffiliateLink } from '../../lib/affiliate.js';
import '../../styles/builder.css';

const SAMPLE_URL = 'https://www.example.com/product/abc';
const MODES: AffiliateMode[] = ['off', 'tag', 'wrapper'];

interface Props {
  onClose: () => void;
}

/** Admin modal: edit per-store affiliate config (tag or wrapper) + live preview. */
export function AffiliateLinksModal({ onClose }: Props) {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['affiliates'],
    queryFn: () => api.getAffiliates(),
  });

  const [drafts, setDrafts] = useState<Record<string, AffiliateLinkConfig>>({});
  const [savedStore, setSavedStore] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  // Seed local drafts once the configs load.
  useEffect(() => {
    if (!data) return;
    setDrafts((prev) => {
      if (Object.keys(prev).length > 0) return prev; // seed once; never overwrite in-progress edits
      const next: Record<string, AffiliateLinkConfig> = {};
      for (const s of data.stores) next[s.store] = { ...s };
      return next;
    });
  }, [data]);

  // Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: ({ store, body }: { store: string; body: AffiliateUpdateBody }) =>
      api.putAffiliate(store, body),
    onSuccess: (_res, vars) => {
      setErrors((e) => {
        const next = { ...e };
        delete next[vars.store];
        return next;
      });
      setSavedStore(vars.store);
      void qc.invalidateQueries({ queryKey: ['affiliates'] });
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(
        () => setSavedStore((s) => (s === vars.store ? null : s)),
        1500,
      );
    },
    onError: (err, vars) => {
      const message = err instanceof ApiClientError ? err.message : 'Save failed';
      setErrors((e) => ({ ...e, [vars.store]: message }));
    },
  });

  const patch = (store: string, over: Partial<AffiliateLinkConfig>) =>
    setDrafts((d) => {
      const cur = d[store];
      if (!cur) return d;
      return { ...d, [store]: { ...cur, ...over } };
    });

  const toBody = (c: AffiliateLinkConfig): AffiliateUpdateBody => ({
    mode: c.mode,
    paramName: c.paramName,
    tag: c.tag,
    wrapperTemplate: c.wrapperTemplate,
  });

  const save = (store: string) => {
    const draft = drafts[store];
    if (!draft) return;
    mutation.mutate({ store, body: toBody(draft) });
  };

  const clear = (store: string) => {
    const cleared: AffiliateLinkConfig = { store, mode: 'off', paramName: 'tag', tag: '', wrapperTemplate: '' };
    setDrafts((d) => ({ ...d, [store]: cleared }));
    mutation.mutate({ store, body: toBody(cleared) });
  };

  return (
    <div className="picker-root" role="dialog" aria-modal="true" aria-label="Affiliate links">
      <div className="picker-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="picker-panel">
        <div className="picker-head">
          <h3>Affiliate links</h3>
          <button type="button" className="drawer-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="picker-list">
          {isLoading && <p className="muted">Loading…</p>}
          {isError && <p className="muted">Couldn’t load affiliate config.</p>}
          {data?.stores.map((s) => {
            const draft = drafts[s.store] ?? s;
            return (
              <div key={s.store} className="aff-row">
                <div className="aff-row-head">
                  <span className="aff-store">{s.store}</span>
                  <select
                    value={draft.mode}
                    aria-label={`${s.store} mode`}
                    onChange={(e) => patch(s.store, { mode: e.target.value as AffiliateMode })}
                  >
                    {MODES.map((m) => (
                      <option key={m} value={m}>
                        {m === 'off' ? 'Off' : m === 'tag' ? 'Affiliate tag' : 'Wrapper link'}
                      </option>
                    ))}
                  </select>
                </div>

                {draft.mode === 'tag' && (
                  <div className="aff-fields">
                    <input
                      type="text"
                      placeholder="Param name (default: tag)"
                      value={draft.paramName}
                      aria-label={`${s.store} param name`}
                      onChange={(e) => patch(s.store, { paramName: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="Affiliate ID (e.g. automatorr-22)"
                      value={draft.tag}
                      aria-label={`${s.store} affiliate id`}
                      onChange={(e) => patch(s.store, { tag: e.target.value })}
                    />
                  </div>
                )}

                {draft.mode === 'wrapper' && (
                  <div className="aff-fields">
                    <input
                      type="text"
                      placeholder="https://network.example/xxxx?url={url}"
                      value={draft.wrapperTemplate}
                      aria-label={`${s.store} wrapper template`}
                      onChange={(e) => patch(s.store, { wrapperTemplate: e.target.value })}
                    />
                  </div>
                )}

                {draft.mode !== 'off' && (
                  <div className="aff-preview muted" title="Example decorated link">
                    {previewAffiliateLink(SAMPLE_URL, draft)}
                  </div>
                )}

                <div className="aff-actions">
                  <button type="button" className="btn-add" disabled={mutation.isPending} onClick={() => save(s.store)}>
                    {savedStore === s.store ? 'Saved ✓' : 'Save'}
                  </button>
                  <button type="button" className="admin-link" disabled={mutation.isPending} onClick={() => clear(s.store)}>
                    Clear
                  </button>
                </div>
                {errors[s.store] && (
                  <div className="aff-error" role="alert">
                    {errors[s.store]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
