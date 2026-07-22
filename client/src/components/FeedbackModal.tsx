import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, type FeedbackContext, type FeedbackType } from '../lib/api.js';
import { getSessionId } from '../lib/session.js';
import { onOpenFeedback } from '../lib/feedback.js';
import { countWords, capWords } from '../lib/format.js';

/**
 * Global feedback modal (launch-polish P4). FeedbackHost is mounted once in
 * App; any component can open it via openFeedback(). Context (page URL, part
 * slugs, build id) is auto-captured so a "wrong data" report points at the
 * exact page it came from — and users are told what's included.
 */

const TYPES: Array<{ id: FeedbackType; label: string }> = [
  { id: 'idea', label: 'IDEA' },
  { id: 'bug', label: 'BUG' },
  { id: 'data', label: 'WRONG DATA' },
  { id: 'other', label: 'OTHER' },
];

const MIN_CHARS = 10;
const MAX_WORDS = 200;

/** Derive structured context from the current route. */
function captureContext(pathname: string): FeedbackContext {
  const ctx: FeedbackContext = { path: pathname };
  const compare = pathname.match(/^\/compare\/([^/]+)\/(.+)-vs-(.+)$/);
  if (compare) {
    ctx.category = compare[1];
    ctx.slugs = [compare[2]!, compare[3]!];
  }
  const build = pathname.match(/^\/pc-builder\/([^/]+)$/);
  if (build) ctx.buildShortId = build[1];
  return ctx;
}

export function FeedbackHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => onOpenFeedback(() => setOpen(true)), []);
  if (!open) return null;
  return <FeedbackModal onClose={() => setOpen(false)} />;
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const [type, setType] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    boxRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const words = countWords(message);
  const valid = type !== null && message.trim().length >= MIN_CHARS && words <= MAX_WORDS;

  const submit = async () => {
    if (!valid || state === 'sending') return;
    setState('sending');
    try {
      await api.postFeedback({
        type: type!,
        message: message.trim(),
        email: email.trim() || undefined,
        context: captureContext(location.pathname),
        sessionId: getSessionId(),
      });
      setState('sent');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="consent-root" role="presentation">
      <div className="consent-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="consent-card feedback-card" role="dialog" aria-modal="true" aria-labelledby="fb-title">
        {state === 'sent' ? (
          <>
            <span className="eyebrow" id="fb-title">
              RECEIVED, CHEERS
              <span className="cursor" aria-hidden="true" />
            </span>
            <p>Thanks for helping make Speccify better. If you left an email, we&rsquo;ll reply when it ships.</p>
            <button type="button" className="cta solid consent-accept" onClick={onClose}>
              DONE
            </button>
          </>
        ) : (
          <>
            <span className="eyebrow" id="fb-title">
              FEEDBACK / IDEAS
              <span className="cursor" aria-hidden="true" />
            </span>
            <div className="fb-types" role="radiogroup" aria-label="Feedback type">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={type === t.id}
                  className={`fb-type${type === t.id ? ' on' : ''}`}
                  onClick={() => setType(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              ref={boxRef}
              className="fb-text"
              placeholder="What's on your mind? Wrong spec, missing part, feature idea…"
              value={message}
              rows={5}
              onChange={(e) => setMessage(capWords(e.target.value, MAX_WORDS))}
              aria-label="Your feedback"
            />
            <div className="fb-meta">
              <span className={words >= MAX_WORDS ? 'fb-count warn' : 'fb-count'}>
                {words}/{MAX_WORDS} WORDS
              </span>
              <span className="fb-context">INCLUDES: CURRENT PAGE URL</span>
            </div>
            <input
              type="email"
              className="fb-email"
              placeholder="Email, only if you'd like a reply (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email (optional)"
            />
            {state === 'error' && (
              <p className="fb-error">Couldn&rsquo;t send. Please try again, your message is still here.</p>
            )}
            <button
              type="button"
              className="cta solid consent-accept"
              disabled={!valid || state === 'sending'}
              onClick={() => void submit()}
            >
              {state === 'sending' ? 'SENDING…' : 'SEND IT'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
