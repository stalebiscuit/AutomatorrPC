import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { acknowledgeLegal, hasAcknowledgedLegal } from '../lib/legal.js';
import { Logo } from './Logo.js';

/**
 * First-visit terms acknowledgement (launch-polish P1, revised).
 *
 * Compact centred card shown once per browser per LEGAL_VERSION, on any public
 * route (including deep links). Admin routes are excluded. Acceptance is an
 * explicit act: the visitor ticks the agreement checkbox, then continues.
 * Esc / scrim-clicks do not dismiss the card. Client-rendered after load, so
 * it never gates content in the DOM or hurts indexing.
 */
export function ConsentModal() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const boxRef = useRef<HTMLInputElement>(null);

  const isAdmin = location.pathname.startsWith('/admin');

  useEffect(() => {
    if (!isAdmin && !hasAcknowledgedLegal()) setOpen(true);
  }, [isAdmin]);

  useEffect(() => {
    if (open) boxRef.current?.focus();
  }, [open]);

  const accept = () => {
    if (!agreed) return;
    acknowledgeLegal();
    setOpen(false);
  };

  if (!open || isAdmin) return null;

  return (
    <div className="consent-root" role="presentation">
      <div className="consent-backdrop" aria-hidden="true" />
      <div
        className="consent-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
      >
        <div className="consent-mark" aria-hidden="true">
          <Logo variant="mark" size={30} />
        </div>
        <span className="eyebrow" id="consent-title">
          BEFORE YOU DIVE IN
          <span className="cursor" aria-hidden="true" />
        </span>
        <p>
          Speccify is a free, independent comparison and PC-building tool. Specs and prices are
          collected from manufacturer data and Australian retailers and{' '}
          <strong>refreshed daily</strong>, but we can&rsquo;t guarantee they&rsquo;re always
          complete or error-free, so always confirm details with the retailer before you buy.{' '}
          <strong>Purchases happen entirely between you and the retailer.</strong> Speccify
          isn&rsquo;t a store and isn&rsquo;t a party to any sale. Some outbound links are affiliate
          links; if you buy through them we may earn a commission at no extra cost to you. This
          never affects scores, rankings or verdicts.
        </p>
        <label className="consent-check">
          <input
            ref={boxRef}
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            I agree to the <Link to="/legal/terms">Terms of Use</Link> and acknowledge the{' '}
            <Link to="/legal/disclaimer">Disclaimer</Link> and{' '}
            <Link to="/legal/privacy">Privacy Policy</Link>.
          </span>
        </label>
        <button
          type="button"
          className="cta solid consent-accept"
          disabled={!agreed}
          onClick={accept}
        >
          GOT IT, LET&rsquo;S BUILD
        </button>
      </div>
    </div>
  );
}
