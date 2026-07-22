import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo.js';
import { CurrencySelect } from './CurrencySelect.js';
import { openFeedback } from '../lib/feedback.js';

type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** Top bar — logo + currency + light/dark toggle + MENU drawer (spec §3). */
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
        <Logo variant="full" size={28} />
      </Link>
      <div className="topbar-actions">
        <CurrencySelect />
        <button
          type="button"
          className="menu"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          aria-pressed={theme === 'dark'}
        >
          {theme === 'light' ? 'LIGHT' : 'DARK'}
        </button>
        <button type="button" className="theme-toggle" onClick={() => openFeedback()}>
          FEEDBACK +
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
                <Link to="/about" className="drawer-link" onClick={closeMenu}>
                  About Speccify
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
              <div className="drawer-section">
                <span className="drawer-label">Legal</span>
                <Link to="/legal/terms" className="drawer-link" onClick={closeMenu}>
                  Terms &amp; policies
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
              {/* Admin login is deliberately unlisted (product decision, 21 Jul 2026):
                  staff navigate to /admin/login directly. */}
            </nav>
          </aside>
        </div>
      )}
    </header>
  );
}
