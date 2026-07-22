import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { acknowledgeLegal } from '../lib/legal.js';
import { Logo } from './Logo.js';

/**
 * Terms acknowledgement popup (launch-polish P1, revised 21 Jul 2026).
 *
 * Shown on EVERY page load of the site (product decision) — acceptance is not
 * persisted across visits; accepting only dismisses it for the current load.
 * Admin routes are excluded. Acceptance is an explicit act: the visitor ticks
 * the agreement checkbox, then continues. Esc / scrim-clicks do not dismiss
 * the card. Client-rendered after load, so it never gates content in the DOM.
 * (`acknowledgeLegal()` still records the acceptance version/timestamp in
 * localStorage for the record; it just no longer suppresses the popup.)
 */
export function ConsentModal() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const boxRef = useRef<HTMLInputElement>(null);

  const isAdmin = location.pathname.startsWith('/admin');

  useEffect(() => {
    if (!isAdmin) setOpen(true);
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
        {/* Full brand lockup — the bare S glyph read as an unbranded icon. */}
        <div className="consent-mark" aria-hidden="true">
          <Logo variant="full" size={30} />
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
            {/* Review fix 1.7: open in a new tab — same-tab navigation landed
                UNDERNEATH this non-dismissable overlay, so visitors couldn't
                actually read the documents they were agreeing to. */}
            I agree to the{' '}
            <a href="/legal/terms" target="_blank" rel="noreferrer">
              Terms of Use
            </a>{' '}
            and acknowledge the{' '}
            <a href="/legal/disclaimer" target="_blank" rel="noreferrer">
              Disclaimer
            </a>{' '}
            and{' '}
            <a href="/legal/privacy" target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            .
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
