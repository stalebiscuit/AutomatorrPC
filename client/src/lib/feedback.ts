/**
 * Tiny event bus for opening the global feedback modal from anywhere
 * (header button, footer link, disclaimers) without prop-drilling.
 * FeedbackHost (mounted once in App) listens for this event.
 */
const EVENT = 'speccify:feedback';

export function openFeedback(): void {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onOpenFeedback(handler: () => void): () => void {
  const h = () => handler();
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
