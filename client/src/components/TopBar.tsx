import { Link } from 'react-router-dom';

// Served from client/public/automatorr-logo.png (the real brand asset).
const LOGO_SRC = '/automatorr-logo.png';

/** Top bar — real Automatorr logo asset (not a wordmark) + MENU (spec §3). */
export function TopBar() {
  return (
    <header className="topbar">
      <Link to="/" className="logo-link" aria-label="Automatorr home">
        <img src={LOGO_SRC} alt="Automatorr" className="logo-img" />
      </Link>
      <button type="button" className="menu" aria-label="Menu">
        MENU +
      </button>
    </header>
  );
}
