import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// Speccify hero glyph (circuit-trace "S") + the Automatorr "powered by" credit.
const SPECCIFY_GLYPH = '/speccify-hero-token-snapped.png';
// Theme-specific Automatorr credit: white wordmark on dark, brand blue on light.
const AUTOMATORR_CREDIT_DARK = '/automatorr-logo-dark.png';
const AUTOMATORR_CREDIT_LIGHT = '/automatorr-logo.png';

type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** Top bar — logo + light/dark toggle + MENU that opens the nav drawer (spec §3). */
export function TopBar() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('automatorr-theme', next);
    } catch {
      /* localStorage unavailable — theme still applies for this session */
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="topbar">
      <Link to="/" className="brand-lockup" aria-label="Speccify home">
        <img src={SPECCIFY_GLYPH} alt="" className="brand-glyph" />
        <span className="brand-text">
          <span className="brand-word">peccify</span>
          <span className="brand-kicker">
            <span className="brand-by">Powered by</span>
            <img
              src={theme === 'dark' ? AUTOMATORR_CREDIT_DARK : AUTOMATORR_CREDIT_LIGHT}
              alt="Automatorr"
              className="brand-auto"
            />
          </span>
        </span>
      </Link>
      <div className="topbar-actions">
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          aria-pressed={theme === 'dark'}
        >
          {theme === 'light' ? 'LIGHT' : 'DARK'}
        </button>
        <button
          type="button"
          className="menu"
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls="app-drawer"
          onClick={() => setMenuOpen(true)}
        >
          MENU +
        </button>
      </div>

      {menuOpen && (
        <div className="drawer-root">
          <div className="drawer-backdrop" onClick={closeMenu} aria-hidden="true" />
          <aside id="app-drawer" className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="drawer-head">
              <span className="drawer-title">Menu</span>
              <button ref={closeRef} type="button" className="drawer-close" aria-label="Close menu" onClick={closeMenu}>
                ×
              </button>
            </div>
            <nav className="drawer-nav">
              <div className="drawer-section">
                <span className="drawer-label">Browse</span>
                <Link to="/" className="drawer-link" onClick={closeMenu}>
                  Compare components
                  <span aria-hidden="true">→</span>
                </Link>
                <Link to="/pc-builder" className="drawer-link" onClick={closeMenu}>
                  PC builder
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
              <div className="drawer-section">
                <span className="drawer-label">Admin</span>
                <Link to="/admin/login" className="drawer-link" onClick={closeMenu}>
                  Admin login
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </nav>
          </aside>
        </div>
      )}
    </header>
  );
}
