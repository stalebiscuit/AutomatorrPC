import { useState } from 'react';
import { Link } from 'react-router-dom';

// Served from client/public/automatorr-logo.png (the real brand asset).
const LOGO_SRC = '/automatorr-logo.png';

type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** Top bar — real Automatorr logo asset + light/dark toggle + MENU (spec §3). */
export function TopBar() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <header className="topbar">
      <Link to="/" className="logo-link" aria-label="Automatorr home">
        <img src={LOGO_SRC} alt="Automatorr" className="logo-img" />
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
        <button type="button" className="menu" aria-label="Menu">
          MENU +
        </button>
      </div>
    </header>
  );
}
