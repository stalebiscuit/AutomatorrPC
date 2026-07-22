import { Link } from 'react-router-dom';
import { Logo } from './Logo.js';

/**
 * Site-wide public footer (launch-polish P1) — brand line + legal links.
 * About/Feedback were removed from here by design (21 Jul 2026): About stays
 * reachable via the trust band + menu drawer, Feedback via the header pill.
 */
export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-foot-brand">
        <Logo variant="mark" size={18} />
        <span>© 2026 Speccify</span>
      </div>
      <nav className="site-foot-links" aria-label="Legal links">
        <Link to="/legal/terms">Terms</Link>
        <Link to="/legal/disclaimer">Disclaimer</Link>
        <Link to="/legal/disclosure">Disclosure</Link>
        <Link to="/legal/privacy">Privacy</Link>
      </nav>
    </footer>
  );
}
