import { useEffect } from 'react';

/**
 * Per-page document metadata (review fix 1.9 — SEO batch). Every page shared
 * one title/description before this; for a site whose growth strategy is
 * shareable comparison permalinks, that forfeited most of the SEO value.
 */

const ORIGIN = 'https://speccify.info';

interface Meta {
  title: string;
  description?: string;
  /** Path for the canonical + og:url tags; defaults to the current path. */
  canonicalPath?: string;
}

function setMetaTag(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function useDocumentMeta({ title, description, canonicalPath }: Meta): void {
  useEffect(() => {
    document.title = title;
    setMetaTag('property', 'og:title', title);
    if (description) {
      setMetaTag('name', 'description', description);
      setMetaTag('property', 'og:description', description);
    }
    const url = `${ORIGIN}${canonicalPath ?? window.location.pathname}`;
    setCanonical(url);
    setMetaTag('property', 'og:url', url);
  }, [title, description, canonicalPath]);
}
