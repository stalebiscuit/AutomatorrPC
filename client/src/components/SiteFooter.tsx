import { Link } from 'react-router-dom';
import { Logo } from './Logo.js';
import { openFeedback } from '../lib/feedback.js';

/**
 * Site-wide public footer (launch-polish P1) — brand line + legal/about links
 * + feedback entry point. Replaces the bare "© 2026 Speccify" line.
 */
export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-foot-brand">
        <Logo variant="mark" size={18} />
        <span>© 2026 Speccify</span>
      </div>
      <nav className="site-foot-links" aria-label="Site links">
        <Link to="/about">About</Link>
        <button type="button" onClick={() => openFeedback()}>
          Feedback
        </button>
        <Link to="/legal/terms">Terms</Link>
        <Link to="/legal/disclaimer">Disclaimer</Link>
        <Link to="/legal/disclosure">Disclosure</Link>
        <Link to="/legal/privacy">Privacy</Link>
      </nav>
    </footer>
  );
}
