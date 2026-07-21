import { useEffect, useRef, useState } from 'react';

/**
 * Display-currency selector (launch-polish P6) — a visual placeholder until
 * Speccify launches outside Australia. AUD is the only enabled option; the
 * control persists `sp_currency` so returning users already have a stored
 * preference the day international pricing ships. It has no effect on any
 * displayed price today.
 */
const CURRENCIES = [
  { code: 'AUD', label: 'Australian Dollar', enabled: true },
  { code: 'USD', label: 'US Dollar', enabled: false },
  { code: 'EUR', label: 'Euro', enabled: false },
  { code: 'GBP', label: 'British Pound', enabled: false },
] as const;

export function CurrencySelect() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Seed the preference key for the future international launch.
  useEffect(() => {
    try {
      if (!localStorage.getItem('sp_currency')) localStorage.setItem('sp_currency', 'AUD');
    } catch {
      /* localStorage unavailable — no preference to seed */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div className="currency" ref={rootRef}>
      <button
        type="button"
        className="menu currency-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Display currency: Australian Dollar"
        title="Display currency"
        onClick={() => setOpen((v) => !v)}
      >
        AUD $
      </button>
      {open && (
        <div className="currency-pop" role="listbox" aria-label="Display currency">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              type="button"
              role="option"
              aria-selected={c.code === 'AUD'}
              className={`currency-opt${c.code === 'AUD' ? ' on' : ''}`}
              disabled={!c.enabled}
              onClick={() => setOpen(false)}
            >
              <span className="currency-code">{c.code}</span>
              <span className="currency-name">{c.label}</span>
              {c.enabled ? (
                <span className="currency-tick" aria-hidden="true">
                  ✓
                </span>
              ) : (
                <span className="currency-soon">SOON</span>
              )}
            </button>
          ))}
          <p className="currency-note">International pricing arrives when Speccify launches outside Australia.</p>
        </div>
      )}
    </div>
  );
}
