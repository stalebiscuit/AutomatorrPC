import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '../lib/api.js';
import { TopBar } from '../components/TopBar.js';

export function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.adminLogin(username, password);
      navigate('/admin');
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 401
          ? 'Invalid credentials.'
          : 'Could not sign in. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap">
      <TopBar />
      <div className="login-wrap">
        <form className="login-card" onSubmit={onSubmit}>
          <h1>Admin sign-in</h1>
          <label htmlFor="u">Username</label>
          <input
            id="u"
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
          />
          <label htmlFor="p">Password</label>
          <input
            id="p"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p className="login-err" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="cta solid"
            style={{ marginTop: 20 }}
            disabled={busy || !username || !password}
          >
            {busy ? 'Signing in…' : 'SIGN IN'}
          </button>
        </form>
      </div>
    </div>
  );
}
