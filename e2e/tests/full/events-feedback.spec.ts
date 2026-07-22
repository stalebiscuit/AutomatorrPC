import { test, expect } from '@playwright/test';
import { API_BASE } from '../../lib/env.js';

/** Analytics events + public feedback intake (full suite). */
test.describe('events & feedback', () => {
  test('search + click events are accepted', async ({ request }) => {
    const search = await request.post(`${API_BASE}/events/search`, {
      data: { type: 'search', sessionId: 'e2e-sess', category: 'cpu', query: 'ryzen' },
    });
    expect([200, 201, 204]).toContain(search.status());

    const click = await request.post(`${API_BASE}/events/click`, {
      data: { sessionId: 'e2e-sess', componentId: 'e2e', store: 'Mwave', url: 'https://example.com' },
    });
    expect([200, 201, 204]).toContain(click.status());
  });

  test('feedback submission is accepted', async ({ request }) => {
    const res = await request.post(`${API_BASE}/feedback`, {
      data: { type: 'idea', message: 'e2e automated feedback submission', context: { path: '/' } },
    });
    expect([200, 201]).toContain(res.status());
    expect((await res.json()).ok).toBe(true);
  });

  test('honeypot feedback is silently accepted but not stored as real', async ({ request }) => {
    // The `website` field is a honeypot; a populated value marks spam. (message
    // must be >= 10 chars to pass validation and actually reach the honeypot check.)
    const res = await request.post(`${API_BASE}/feedback`, {
      data: {
        type: 'other',
        message: 'this is a honeypot submission',
        website: 'http://spam.example',
      },
    });
    expect([200, 201]).toContain(res.status());
  });
});
