import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '../lib/api.js';
import { useAdminAuth } from '../lib/adminAuth.js';
import { TopBar } from '../components/TopBar.js';

const RESEND_SECONDS = 30;

export function AdminLogin() {
  const navigate = useNavigate();
  const { status, setUser } = useAdminAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  // Already signed in → skip the form.
  useEffect(() => {
    if (status === 'authed') navigate('/admin', { replace: true });
  }, [status, navigate]);

  // Resend cooldown ticker.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [resendIn]);

  const startCodeStep = () => {
    setStep('code');
    setResendIn(RESEND_SECONDS);
    setTimeout(() => codeRef.current?.focus(), 0);
  };

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.requestOtp(email.trim());
      startCodeStep();
    } catch {
      setError('Could not send a code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0 || busy) return;
    setError(null);
    setBusy(true);
    try {
      await api.requestOtp(email.trim());
      setResendIn(RESEND_SECONDS);
      setCode('');
      codeRef.current?.focus();
    } catch {
      setError('Could not resend. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { user } = await api.verifyOtp(email.trim(), code.trim());
      setUser(user);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiClientError && (err.status === 401 || err.status === 403)
          ? 'That code is invalid or expired.'
          : 'Could not verify the code. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap">
      <TopBar />
      <div className="login-wrap">
        {step === 'email' ? (
          <form className="login-card" onSubmit={submitEmail}>
            <h1>Admin sign-in</h1>
            <p className="login-sub">Enter your work email and we&rsquo;ll send you a sign-in code.</p>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              autoComplete="email"
              autoFocus
              placeholder="you@automatorr.com"
              onChange={(e) => setEmail(e.target.value)}
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
              disabled={busy || !email.trim()}
            >
              {busy ? 'Sending…' : 'SEND CODE'}
            </button>
          </form>
        ) : (
          <form className="login-card" onSubmit={submitCode}>
            <h1>Enter code</h1>
            <p className="login-sub">
              We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.
            </p>
            <label htmlFor="code">Sign-in code</label>
            <input
              id="code"
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              placeholder="000000"
              className="otp-input"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
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
              disabled={busy || code.trim().length < 6}
            >
              {busy ? 'Verifying…' : 'VERIFY & SIGN IN'}
            </button>
            <div className="login-actions">
              <button
                type="button"
                className="admin-link"
                onClick={() => void resend()}
                disabled={resendIn > 0 || busy}
              >
                {resendIn > 0 ? `RESEND IN ${resendIn}S` : 'RESEND CODE'}
              </button>
              <button
                type="button"
                className="admin-link"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
              >
                CHANGE EMAIL
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
