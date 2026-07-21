# Affiliate-link Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only section (a button beside the Compare/Builder toggle in the analytics dashboard) to view, edit, update, and remove per-retailer affiliate links, which the backend applies live to every outbound "Buy" URL.

**Architecture:** A new `AffiliateLink` MongoDB collection stores one config per retailer (`off | tag | wrapper`). A pure `applyAffiliateLink(url, config)` transform decorates URLs; an in-memory cache (loaded at startup, refreshed on every admin write) is consulted by the catalogue service, which decorates each served component's price URLs on read. Admin `GET`/`PUT` endpoints (behind the existing JWT guard) manage the configs; a React modal edits them.

**Tech Stack:** TypeScript (strict), Node + Express + Mongoose + zod (server), React 18 + TanStack Query (client), Vitest + Supertest + mongodb-memory-server (tests). The `@automatorr/shared` workspace exports from source (`shared/src/index.ts`), so new shared types need no build step.

**Design source:** `docs/superpowers/specs/2026-07-17-affiliate-links-admin-design.md`

**Store identifiers (canonical, from the retailer registry):** `Amazon`, `Mwave`, `Scorptec`, `PLE Computers`, `PCCaseGear`, `Centre Com`.

---

### Task 1: Shared `AffiliateLinkConfig` contract

**Files:**
- Modify: `shared/src/types.ts` (append at end of file)

- [ ] **Step 1: Add the type**

Append to `shared/src/types.ts`:

```ts
// ─── Affiliate links (admin-managed outbound-link decoration) ────────
export type AffiliateMode = 'off' | 'tag' | 'wrapper';

/**
 * Per-retailer affiliate configuration. `off` = pass-through (default).
 * `tag` appends `paramName=tag` to each product URL (e.g. Amazon `?tag=…`).
 * `wrapper` substitutes the product URL into `{url}` inside `wrapperTemplate`
 * (e.g. a Commission Factory deep link). Shared so client + server agree.
 */
export interface AffiliateLinkConfig {
  store: string;
  mode: AffiliateMode;
  /** tag mode: query-parameter name (default 'tag') */
  paramName: string;
  /** tag mode: the affiliate id value */
  tag: string;
  /** wrapper mode: URL template containing the literal "{url}" */
  wrapperTemplate: string;
}
```

- [ ] **Step 2: Typecheck the shared package**

Run: `npm run build --workspace shared`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add shared/src/types.ts
git commit -m "feat(shared): add AffiliateLinkConfig contract"
```

---

### Task 2: Pure `applyAffiliateLink` transform (TDD)

**Files:**
- Create: `server/src/services/affiliate/applyAffiliateLink.ts`
- Test: `server/tests/affiliate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/tests/affiliate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { AffiliateLinkConfig } from '@automatorr/shared';
import { applyAffiliateLink } from '../src/services/affiliate/applyAffiliateLink.js';

const cfg = (over: Partial<AffiliateLinkConfig>): AffiliateLinkConfig => ({
  store: 'Test',
  mode: 'off',
  paramName: 'tag',
  tag: '',
  wrapperTemplate: '',
  ...over,
});

describe('applyAffiliateLink', () => {
  const URL0 = 'https://www.amazon.com.au/dp/B0C123';

  it('passes through when config is undefined or off', () => {
    expect(applyAffiliateLink(URL0, undefined)).toBe(URL0);
    expect(applyAffiliateLink(URL0, cfg({ mode: 'off' }))).toBe(URL0);
  });

  it('appends a tag param', () => {
    expect(applyAffiliateLink(URL0, cfg({ mode: 'tag', tag: 'automatorr-22' }))).toBe(
      'https://www.amazon.com.au/dp/B0C123?tag=automatorr-22',
    );
  });

  it('appends onto a URL that already has query params', () => {
    const out = applyAffiliateLink('https://x.au/s?q=cpu', cfg({ mode: 'tag', tag: 'a1' }));
    expect(out).toBe('https://x.au/s?q=cpu&tag=a1');
  });

  it('honours a custom param name', () => {
    const out = applyAffiliateLink(URL0, cfg({ mode: 'tag', paramName: 'aff', tag: '99' }));
    expect(out).toBe('https://www.amazon.com.au/dp/B0C123?aff=99');
  });

  it('passes through tag mode with an empty tag', () => {
    expect(applyAffiliateLink(URL0, cfg({ mode: 'tag', tag: '' }))).toBe(URL0);
  });

  it('substitutes the encoded url into a wrapper template', () => {
    const out = applyAffiliateLink(URL0, cfg({ mode: 'wrapper', wrapperTemplate: 'https://t.cfjump.com/1/t?url={url}' }));
    expect(out).toBe(`https://t.cfjump.com/1/t?url=${encodeURIComponent(URL0)}`);
  });

  it('passes through wrapper mode when the template lacks {url}', () => {
    expect(applyAffiliateLink(URL0, cfg({ mode: 'wrapper', wrapperTemplate: 'https://t.cfjump.com/1/t' }))).toBe(URL0);
  });

  it('passes through a non-http url', () => {
    expect(applyAffiliateLink('mailto:x@y.z', cfg({ mode: 'tag', tag: 'a1' }))).toBe('mailto:x@y.z');
    expect(applyAffiliateLink('not a url', cfg({ mode: 'tag', tag: 'a1' }))).toBe('not a url');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace server -- affiliate.test`
Expected: FAIL — `Cannot find module '.../applyAffiliateLink.js'`.

- [ ] **Step 3: Implement the transform**

Create `server/src/services/affiliate/applyAffiliateLink.ts`:

```ts
import type { AffiliateLinkConfig } from '@automatorr/shared';

/**
 * Pure: decorate a raw product URL with a store's affiliate config.
 * A bad/missing config must NEVER break a link — worst case is pass-through.
 */
export function applyAffiliateLink(
  rawUrl: string,
  config: AffiliateLinkConfig | undefined,
): string {
  if (!config || config.mode === 'off') return rawUrl;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return rawUrl;

  if (config.mode === 'tag') {
    const tag = config.tag?.trim();
    if (!tag) return rawUrl;
    const name = config.paramName?.trim() || 'tag';
    parsed.searchParams.set(name, tag);
    return parsed.toString();
  }

  if (config.mode === 'wrapper') {
    const tpl = config.wrapperTemplate?.trim();
    if (!tpl || !tpl.includes('{url}')) return rawUrl;
    return tpl.replaceAll('{url}', encodeURIComponent(rawUrl));
  }

  return rawUrl;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace server -- affiliate.test`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/affiliate/applyAffiliateLink.ts server/tests/affiliate.test.ts
git commit -m "feat(server): pure applyAffiliateLink transform + unit tests"
```

---

### Task 3: `AffiliateLink` model + registry store list

**Files:**
- Create: `server/src/models/AffiliateLink.ts`
- Modify: `server/src/models/index.ts`
- Modify: `server/src/services/pricing/retailers/index.ts` (append export)

- [ ] **Step 1: Create the model**

Create `server/src/models/AffiliateLink.ts`:

```ts
import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

/** Per-retailer affiliate configuration (admin-managed). One doc per store. */
const AffiliateLinkSchema = new Schema(
  {
    store: { type: String, required: true, unique: true },
    mode: { type: String, enum: ['off', 'tag', 'wrapper'], required: true, default: 'off' },
    paramName: { type: String, default: 'tag' },
    tag: { type: String, default: '' },
    wrapperTemplate: { type: String, default: '' },
  },
  { timestamps: true },
);

export type AffiliateLinkDoc = InferSchemaType<typeof AffiliateLinkSchema>;
export const AffiliateLinkModel: Model<AffiliateLinkDoc> = model<AffiliateLinkDoc>(
  'AffiliateLink',
  AffiliateLinkSchema,
);
```

- [ ] **Step 2: Export from the models barrel**

In `server/src/models/index.ts`, add this line after the `ClickEventModel` export:

```ts
export { AffiliateLinkModel, type AffiliateLinkDoc } from './AffiliateLink.js';
```

- [ ] **Step 3: Export the canonical store list**

In `server/src/services/pricing/retailers/index.ts`, append after the `RETAILERS` array:

```ts
/** Canonical retailer store names — the affiliate-config key set. */
export const RETAILER_STORES: string[] = RETAILERS.map((r) => r.store);
```

- [ ] **Step 4: Typecheck**

Run: `npm run build --workspace server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/models/AffiliateLink.ts server/src/models/index.ts server/src/services/pricing/retailers/index.ts
git commit -m "feat(server): AffiliateLink model + RETAILER_STORES list"
```

---

### Task 4: Affiliate config service (cache, decorate, CRUD helpers)

**Files:**
- Create: `server/src/services/affiliate/affiliateService.ts`

- [ ] **Step 1: Implement the service**

Create `server/src/services/affiliate/affiliateService.ts`:

```ts
import type { AffiliateLinkConfig, AffiliateMode, Component, PriceQuote } from '@automatorr/shared';
import { AffiliateLinkModel, type AffiliateLinkDoc } from '../../models/index.js';
import { RETAILER_STORES } from '../pricing/retailers/index.js';
import { applyAffiliateLink } from './applyAffiliateLink.js';

const cache = new Map<string, AffiliateLinkConfig>();
let loadedAt = 0;
const TTL_MS = 5 * 60 * 1000;

const keyOf = (store: string): string => store.trim().toLowerCase();

function toConfig(store: string, d: AffiliateLinkDoc): AffiliateLinkConfig {
  return {
    store,
    mode: d.mode as AffiliateMode,
    paramName: d.paramName ?? 'tag',
    tag: d.tag ?? '',
    wrapperTemplate: d.wrapperTemplate ?? '',
  };
}

function defaultConfig(store: string): AffiliateLinkConfig {
  return { store, mode: 'off', paramName: 'tag', tag: '', wrapperTemplate: '' };
}

/** Load all saved configs into the in-memory cache. */
export async function loadAffiliateConfigs(): Promise<void> {
  const docs = await AffiliateLinkModel.find();
  cache.clear();
  for (const d of docs) cache.set(keyOf(d.store), toConfig(d.store, d));
  loadedAt = Date.now();
}

/** Reload the cache immediately (called after every admin write). */
export async function refreshAffiliateConfigs(): Promise<void> {
  await loadAffiliateConfigs();
}

/** Lazy safety reload so multi-process deploys converge within the TTL. */
export async function ensureFresh(): Promise<void> {
  if (Date.now() - loadedAt > TTL_MS) await loadAffiliateConfigs();
}

/** Copy of a component with each price URL decorated for its store. */
export function decorateComponent(component: Component): Component {
  if (!component.prices.length) return component;
  const prices: PriceQuote[] = component.prices.map((p) => ({
    ...p,
    url: applyAffiliateLink(p.url, cache.get(keyOf(p.store))),
  }));
  return { ...component, prices };
}

/** All known stores, each with its saved config or a pass-through default. */
export async function listAffiliateConfigs(): Promise<AffiliateLinkConfig[]> {
  const docs = await AffiliateLinkModel.find();
  const bySaved = new Map(docs.map((d) => [keyOf(d.store), d]));
  return RETAILER_STORES.map((store) => {
    const d = bySaved.get(keyOf(store));
    return d ? toConfig(store, d) : defaultConfig(store);
  });
}

export interface AffiliateUpdate {
  mode: AffiliateMode;
  paramName?: string;
  tag?: string;
  wrapperTemplate?: string;
}

/** Upsert one known store's config; returns null if the store is unknown. */
export async function upsertAffiliateConfig(
  store: string,
  update: AffiliateUpdate,
): Promise<AffiliateLinkConfig | null> {
  const canonical = RETAILER_STORES.find((s) => keyOf(s) === keyOf(store));
  if (!canonical) return null;
  const doc = await AffiliateLinkModel.findOneAndUpdate(
    { store: canonical },
    {
      store: canonical,
      mode: update.mode,
      paramName: update.paramName ?? 'tag',
      tag: update.tag ?? '',
      wrapperTemplate: update.wrapperTemplate ?? '',
    },
    { new: true, upsert: true },
  );
  await refreshAffiliateConfigs();
  return toConfig(canonical, doc as AffiliateLinkDoc);
}

/** Test helper — clear the module-level cache between suites. */
export function resetAffiliateCacheForTests(): void {
  cache.clear();
  loadedAt = 0;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build --workspace server`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/affiliate/affiliateService.ts
git commit -m "feat(server): affiliate config cache + decorate + CRUD helpers"
```

---

### Task 5: Decorate price URLs on read in the catalogue service

**Files:**
- Modify: `server/src/services/catalog.ts`

- [ ] **Step 1: Import the decorator**

In `server/src/services/catalog.ts`, add after the existing `serialize` import (line ~10):

```ts
import { decorateComponent, ensureFresh } from './affiliate/affiliateService.js';
```

- [ ] **Step 2: Decorate the paginated list**

In `listComponents`, replace the final block:

```ts
  const total = items.length;
  const start = (page - 1) * pageSize;
  const components = items.slice(start, start + pageSize);
  return { components, total, page, pageSize };
```

with:

```ts
  const total = items.length;
  const start = (page - 1) * pageSize;
  await ensureFresh();
  const components = items.slice(start, start + pageSize).map(decorateComponent);
  return { components, total, page, pageSize };
```

- [ ] **Step 3: Decorate the single-component read**

In `getComponent`, replace:

```ts
  const doc = await ComponentModel.findOne({ category, slug });
  return doc ? serializeComponent(doc) : null;
```

with:

```ts
  const doc = await ComponentModel.findOne({ category, slug });
  if (!doc) return null;
  await ensureFresh();
  return decorateComponent(serializeComponent(doc));
```

(`getPair` calls `getComponent`, so compare + verdict are covered transitively.)

- [ ] **Step 4: Typecheck**

Run: `npm run build --workspace server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/catalog.ts
git commit -m "feat(server): decorate price URLs with affiliate links on read"
```

---

### Task 6: Zod schemas for the affiliate endpoints

**Files:**
- Modify: `server/src/routes/schemas.ts` (append at end)

- [ ] **Step 1: Add the schemas**

Append to `server/src/routes/schemas.ts`:

```ts
export const affiliateStoreParams = z.object({ store: z.string().min(1).max(80) });

export const affiliateUpdateBody = z
  .object({
    mode: z.enum(['off', 'tag', 'wrapper']),
    paramName: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]+$/, 'paramName must be alphanumeric / _ / -')
      .max(40)
      .optional(),
    tag: z.string().trim().max(200).optional(),
    wrapperTemplate: z.string().trim().max(600).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'tag' && !val.tag) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tag'], message: 'tag is required in tag mode' });
    }
    if (val.mode === 'wrapper') {
      if (!val.wrapperTemplate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wrapperTemplate'], message: 'wrapperTemplate is required in wrapper mode' });
      } else if (!val.wrapperTemplate.includes('{url}')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wrapperTemplate'], message: 'wrapperTemplate must contain {url}' });
      }
    }
  });
```

- [ ] **Step 2: Typecheck**

Run: `npm run build --workspace server`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/schemas.ts
git commit -m "feat(server): zod schemas for affiliate config endpoints"
```

---

### Task 7: Admin GET/PUT affiliate routes

**Files:**
- Modify: `server/src/routes/admin.ts`

- [ ] **Step 1: Add imports**

In `server/src/routes/admin.ts`, extend the analytics-service import and schema import. Replace:

```ts
import { getAnalytics, getBuilderAnalytics } from '../services/analytics.js';
import { adminLoginBody, analyticsQuery } from './schemas.js';
```

with:

```ts
import { getAnalytics, getBuilderAnalytics } from '../services/analytics.js';
import { listAffiliateConfigs, upsertAffiliateConfig } from '../services/affiliate/affiliateService.js';
import {
  adminLoginBody,
  analyticsQuery,
  affiliateStoreParams,
  affiliateUpdateBody,
} from './schemas.js';
```

- [ ] **Step 2: Add the routes**

In `server/src/routes/admin.ts`, before the final closing (after the `/admin/analytics/builder` handler), add:

```ts
adminRouter.get(
  '/admin/affiliates',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const stores = await listAffiliateConfigs();
    res.json({ stores });
  }),
);

adminRouter.put(
  '/admin/affiliates/:store',
  requireAdmin,
  validate({ params: affiliateStoreParams, body: affiliateUpdateBody }),
  asyncHandler(async (_req, res) => {
    const { params, body } = getValidated<
      unknown,
      z.infer<typeof affiliateUpdateBody>,
      z.infer<typeof affiliateStoreParams>
    >(res);
    const saved = await upsertAffiliateConfig(params.store, body);
    if (!saved) throw ApiError.notFound(`Unknown store "${params.store}"`);
    res.json({ store: saved });
  }),
);
```

- [ ] **Step 3: Typecheck**

Run: `npm run build --workspace server`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/admin.ts
git commit -m "feat(server): admin GET/PUT affiliate config routes"
```

---

### Task 8: Load the cache at startup + ensure the index

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/devServer.ts`

- [ ] **Step 1: Wire into the production entrypoint**

In `server/src/index.ts`:

Add `AffiliateLinkModel` to the model import block from `./models/index.js` (append it to the destructured list).

Add after the imports, alongside the other service imports:

```ts
import { loadAffiliateConfigs } from './services/affiliate/affiliateService.js';
```

Add `AffiliateLinkModel.init(),` to the `Promise.all([...])` index-init list.

After `logger.info('Indexes ensured for all collections');`, add:

```ts
  await loadAffiliateConfigs();
  logger.info('Affiliate link configs loaded');
```

- [ ] **Step 2: Wire into the demo server**

In `server/src/devServer.ts`, add the import near the other seed imports:

```ts
import { loadAffiliateConfigs } from './services/affiliate/affiliateService.js';
```

After `await ComponentModel.init();`, add:

```ts
  await loadAffiliateConfigs();
```

- [ ] **Step 3: Typecheck**

Run: `npm run build --workspace server`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts server/src/devServer.ts
git commit -m "feat(server): load affiliate cache + ensure index on startup"
```

---

### Task 9: Integration tests for the affiliate API + read seam

**Files:**
- Create: `server/tests/affiliate-api.test.ts`

- [ ] **Step 1: Write the test**

Create `server/tests/affiliate-api.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { seedDatabase } from '../src/seed/seed.js';
import { ComponentModel } from '../src/models/index.js';
import { loadAffiliateConfigs, resetAffiliateCacheForTests } from '../src/services/affiliate/affiliateService.js';

describe('Affiliate config API + read decoration', () => {
  const app = createApp();

  beforeAll(async () => {
    await startMemoryDb();
    await clearCollections();
    resetAffiliateCacheForTests();
    await seedDatabase();
    // Give a known CPU a Scorptec price so we can assert decoration end-to-end.
    await ComponentModel.updateOne(
      { category: 'cpu', slug: 'intel-core-i9-14900k' },
      {
        $set: {
          prices: [
            {
              store: 'Scorptec',
              price: 999,
              currency: 'AUD',
              url: 'https://www.scorptec.com.au/product/x',
              lastUpdated: new Date(),
            },
          ],
        },
      },
    );
    await loadAffiliateConfigs();
  });
  afterAll(async () => {
    await stopMemoryDb();
  });

  const login = async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/admin/login').send({ username: 'admin', password: 'test-password' });
    expect(res.status).toBe(200);
    return agent;
  };

  it('blocks GET /api/admin/affiliates without a session', async () => {
    const res = await request(app).get('/api/admin/affiliates');
    expect(res.status).toBe(401);
  });

  it('lists all six known stores with pass-through defaults', async () => {
    const agent = await login();
    const res = await agent.get('/api/admin/affiliates');
    expect(res.status).toBe(200);
    const stores = res.body.stores as { store: string; mode: string }[];
    expect(stores.map((s) => s.store)).toEqual([
      'Amazon',
      'Mwave',
      'Scorptec',
      'PLE Computers',
      'PCCaseGear',
      'Centre Com',
    ]);
    expect(stores.every((s) => s.mode === 'off')).toBe(true);
  });

  it('rejects an unknown store with 404', async () => {
    const agent = await login();
    const res = await agent.put('/api/admin/affiliates/Nope').send({ mode: 'tag', tag: 'x' });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid mode with 400', async () => {
    const agent = await login();
    const res = await agent.put('/api/admin/affiliates/Amazon').send({ mode: 'bogus' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a wrapper template missing {url} with 400', async () => {
    const agent = await login();
    const res = await agent
      .put('/api/admin/affiliates/Mwave')
      .send({ mode: 'wrapper', wrapperTemplate: 'https://t.cfjump.com/1/t' });
    expect(res.status).toBe(400);
  });

  it('saves a tag config and decorates that store\'s URLs on read', async () => {
    const agent = await login();
    const put = await agent
      .put('/api/admin/affiliates/Scorptec')
      .send({ mode: 'tag', paramName: 'aff', tag: 'automatorr-22' });
    expect(put.status).toBe(200);
    expect(put.body.store.mode).toBe('tag');

    const res = await request(app).get('/api/components/cpu/intel-core-i9-14900k');
    expect(res.status).toBe(200);
    const price = res.body.component.prices.find((p: { store: string }) => p.store === 'Scorptec');
    expect(price.url).toBe('https://www.scorptec.com.au/product/x?aff=automatorr-22');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm run test --workspace server -- affiliate-api.test`
Expected: PASS (6 tests). If a test fails, fix the implementation from Tasks 3–8, not the test.

- [ ] **Step 3: Run the full server suite (no regressions)**

Run: `npm run test --workspace server`
Expected: PASS (all suites).

- [ ] **Step 4: Commit**

```bash
git add server/tests/affiliate-api.test.ts
git commit -m "test(server): affiliate API + read-decoration integration tests"
```

---

### Task 10: Reconcile the `PLE` store-name drift

**Files:**
- Modify: `server/src/seed/demoPrices.ts:21`

- [ ] **Step 1: Fix the store name**

In `server/src/seed/demoPrices.ts`, change the PLE line from:

```ts
  { store: 'PLE', url: (q) => `https://www.ple.com.au/Catalogue/search?q=${encodeURIComponent(q)}` },
```

to:

```ts
  { store: 'PLE Computers', url: (q) => `https://www.ple.com.au/Catalogue/search?q=${encodeURIComponent(q)}` },
```

- [ ] **Step 2: Typecheck**

Run: `npm run build --workspace server`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/src/seed/demoPrices.ts
git commit -m "fix(server): use canonical 'PLE Computers' store name in demo prices"
```

---

### Task 11: Client API methods + preview helper

**Files:**
- Modify: `client/src/lib/api.ts`
- Create: `client/src/lib/affiliate.ts`

- [ ] **Step 1: Add the display-only preview helper**

Create `client/src/lib/affiliate.ts`:

```ts
import type { AffiliateLinkConfig } from '@automatorr/shared';

/**
 * Display-only mirror of the server transform, for the admin modal's live
 * preview. The server (services/affiliate/applyAffiliateLink) is authoritative.
 */
export function previewAffiliateLink(rawUrl: string, config: AffiliateLinkConfig): string {
  if (config.mode === 'off') return rawUrl;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return rawUrl;

  if (config.mode === 'tag') {
    const tag = config.tag.trim();
    if (!tag) return rawUrl;
    parsed.searchParams.set(config.paramName.trim() || 'tag', tag);
    return parsed.toString();
  }
  const tpl = config.wrapperTemplate.trim();
  if (!tpl || !tpl.includes('{url}')) return rawUrl;
  return tpl.replaceAll('{url}', encodeURIComponent(rawUrl));
}
```

- [ ] **Step 2: Add API methods**

In `client/src/lib/api.ts`, add `AffiliateLinkConfig` to the type import from `@automatorr/shared` (append to the destructured type list), then add this interface after the `BuildBody` interface:

```ts
export interface AffiliateUpdateBody {
  mode: 'off' | 'tag' | 'wrapper';
  paramName?: string;
  tag?: string;
  wrapperTemplate?: string;
}
```

Add these two methods to the `api` object (after `postConversionEvent`):

```ts
  getAffiliates: () => request<{ stores: AffiliateLinkConfig[] }>('/admin/affiliates'),

  putAffiliate: (store: string, body: AffiliateUpdateBody) =>
    request<{ store: AffiliateLinkConfig }>(`/admin/affiliates/${encodeURIComponent(store)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
```

- [ ] **Step 3: Typecheck the client**

Run: `npm run build --workspace client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/api.ts client/src/lib/affiliate.ts
git commit -m "feat(client): affiliate API methods + preview helper"
```

---

### Task 12: Affiliate links modal component

**Files:**
- Create: `client/src/components/admin/AffiliateLinksModal.tsx`

- [ ] **Step 1: Implement the modal**

Create `client/src/components/admin/AffiliateLinksModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AffiliateLinkConfig, AffiliateMode } from '@automatorr/shared';
import { api, type AffiliateUpdateBody } from '../../lib/api.js';
import { previewAffiliateLink } from '../../lib/affiliate.js';

const SAMPLE_URL = 'https://www.example.com/product/abc';
const MODES: AffiliateMode[] = ['off', 'tag', 'wrapper'];

interface Props {
  onClose: () => void;
}

/** Admin modal: edit per-store affiliate config (tag or wrapper) + live preview. */
export function AffiliateLinksModal({ onClose }: Props) {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['affiliates'],
    queryFn: () => api.getAffiliates(),
  });

  const [drafts, setDrafts] = useState<Record<string, AffiliateLinkConfig>>({});
  const [savedStore, setSavedStore] = useState<string | null>(null);

  // Seed local drafts once the configs load.
  useEffect(() => {
    if (!data) return;
    const next: Record<string, AffiliateLinkConfig> = {};
    for (const s of data.stores) next[s.store] = { ...s };
    setDrafts(next);
  }, [data]);

  // Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: ({ store, body }: { store: string; body: AffiliateUpdateBody }) =>
      api.putAffiliate(store, body),
    onSuccess: (_res, vars) => {
      setSavedStore(vars.store);
      void qc.invalidateQueries({ queryKey: ['affiliates'] });
      setTimeout(() => setSavedStore((s) => (s === vars.store ? null : s)), 1500);
    },
  });

  const patch = (store: string, over: Partial<AffiliateLinkConfig>) =>
    setDrafts((d) => ({ ...d, [store]: { ...d[store]!, ...over } }));

  const toBody = (c: AffiliateLinkConfig): AffiliateUpdateBody => ({
    mode: c.mode,
    paramName: c.paramName,
    tag: c.tag,
    wrapperTemplate: c.wrapperTemplate,
  });

  const save = (store: string) => mutation.mutate({ store, body: toBody(drafts[store]!) });
  const clear = (store: string) => {
    patch(store, { mode: 'off', tag: '', wrapperTemplate: '' });
    mutation.mutate({ store, body: { mode: 'off', paramName: 'tag', tag: '', wrapperTemplate: '' } });
  };

  return (
    <div className="picker-root" role="dialog" aria-modal="true" aria-label="Affiliate links">
      <div className="picker-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="picker-panel">
        <div className="picker-head">
          <h3>Affiliate links</h3>
          <button type="button" className="drawer-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="picker-list">
          {isLoading && <p className="muted">Loading…</p>}
          {isError && <p className="muted">Couldn’t load affiliate config.</p>}
          {data?.stores.map((s) => {
            const draft = drafts[s.store] ?? s;
            return (
              <div key={s.store} className="aff-row">
                <div className="aff-row-head">
                  <span className="aff-store">{s.store}</span>
                  <select
                    value={draft.mode}
                    aria-label={`${s.store} mode`}
                    onChange={(e) => patch(s.store, { mode: e.target.value as AffiliateMode })}
                  >
                    {MODES.map((m) => (
                      <option key={m} value={m}>
                        {m === 'off' ? 'Off' : m === 'tag' ? 'Affiliate tag' : 'Wrapper link'}
                      </option>
                    ))}
                  </select>
                </div>

                {draft.mode === 'tag' && (
                  <div className="aff-fields">
                    <input
                      type="text"
                      placeholder="Param name (default: tag)"
                      value={draft.paramName}
                      aria-label={`${s.store} param name`}
                      onChange={(e) => patch(s.store, { paramName: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="Affiliate ID (e.g. automatorr-22)"
                      value={draft.tag}
                      aria-label={`${s.store} affiliate id`}
                      onChange={(e) => patch(s.store, { tag: e.target.value })}
                    />
                  </div>
                )}

                {draft.mode === 'wrapper' && (
                  <div className="aff-fields">
                    <input
                      type="text"
                      placeholder="https://network.example/xxxx?url={url}"
                      value={draft.wrapperTemplate}
                      aria-label={`${s.store} wrapper template`}
                      onChange={(e) => patch(s.store, { wrapperTemplate: e.target.value })}
                    />
                  </div>
                )}

                {draft.mode !== 'off' && (
                  <div className="aff-preview muted" title="Example decorated link">
                    {previewAffiliateLink(SAMPLE_URL, draft)}
                  </div>
                )}

                <div className="aff-actions">
                  <button type="button" className="btn-add" onClick={() => save(s.store)}>
                    {savedStore === s.store ? 'Saved ✓' : 'Save'}
                  </button>
                  <button type="button" className="admin-link" onClick={() => clear(s.store)}>
                    Clear
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the client**

Run: `npm run build --workspace client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/admin/AffiliateLinksModal.tsx
git commit -m "feat(client): affiliate links admin modal"
```

---

### Task 13: Wire the button into the dashboard + styles

**Files:**
- Modify: `client/src/pages/AdminDashboard.tsx`
- Modify: `client/src/styles/app.css` (append)

- [ ] **Step 1: Import the modal + add state**

In `client/src/pages/AdminDashboard.tsx`, add the import after the `RecentEvents` import:

```ts
import { AffiliateLinksModal } from '../components/admin/AffiliateLinksModal.js';
```

Add this state next to the existing `view` state:

```ts
  const [showAffiliates, setShowAffiliates] = useState(false);
```

- [ ] **Step 2: Add the button beside the compare/builder toggle**

In `client/src/pages/AdminDashboard.tsx`, immediately after the closing `</div>` of the `win-toggle` group labelled `aria-label="Dashboard"` (the compare/pc-builder toggle), insert:

```tsx
          <button
            type="button"
            className="admin-link"
            onClick={() => setShowAffiliates(true)}
          >
            AFFILIATE LINKS
          </button>
```

- [ ] **Step 3: Render the modal**

In `client/src/pages/AdminDashboard.tsx`, just before the final `</div>` that closes the `wrap` container, add:

```tsx
      {showAffiliates && <AffiliateLinksModal onClose={() => setShowAffiliates(false)} />}
```

- [ ] **Step 4: Add styles**

Append to `client/src/styles/app.css`:

```css
/* Affiliate links admin modal rows */
.aff-row {
  padding: 14px 0;
  border-bottom: 1px solid var(--line);
}
.aff-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.aff-store {
  font-weight: 600;
}
.aff-fields {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.aff-fields input {
  flex: 1 1 200px;
}
.aff-preview {
  margin-top: 6px;
  font-family: var(--mono, monospace);
  font-size: 12px;
  word-break: break-all;
}
.aff-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 10px;
}
```

- [ ] **Step 5: Typecheck the client**

Run: `npm run build --workspace client`
Expected: PASS.

- [ ] **Step 6: Verify the full build + lint**

Run: `npm run build && npm run lint`
Expected: PASS across all workspaces.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/AdminDashboard.tsx client/src/styles/app.css
git commit -m "feat(client): affiliate links button + modal wiring + styles"
```

---

### Task 14: Manual end-to-end verification (demo mode)

**Files:** none (manual check)

- [ ] **Step 1: Start the demo API + client**

Run (two terminals):
```bash
npm run dev:demo --workspace server
npm run dev --workspace client
```

- [ ] **Step 2: Exercise the flow**

1. Open `http://localhost:5173/admin/login`, sign in with `admin` / `demo-password`.
2. On the dashboard, confirm an **AFFILIATE LINKS** button sits beside the compare/pc-builder toggle.
3. Click it → modal lists all six stores, each defaulting to **Off**.
4. Set **Scorptec** to **Affiliate tag**, param `tag`, id `automatorr-22`; confirm the preview shows `…?tag=automatorr-22`; click **Save** → "Saved ✓".
5. Set another store to **Wrapper link** with `https://t.cfjump.com/1/t?url={url}`; confirm the preview wraps the sample URL; Save.
6. Reload the modal → values persisted.
7. (If demo prices are populated via `npm run scrape` or seed) open a Compare with Scorptec prices and confirm the outbound Buy link carries `?tag=automatorr-22`.

- [ ] **Step 3: Confirm safe-empty behaviour**

Set a store back to **Off** via **Clear** and confirm its Buy links revert to the raw URL.

---

## Self-Review

**Spec coverage:**
- Per-store Tag vs Wrapper config → Tasks 1, 6, 12. ✓
- Decorate-on-read (Approach A) → Tasks 4, 5. ✓
- `AffiliateLink` collection → Task 3. ✓
- Admin GET/PUT behind auth → Task 7; auth verified in Task 9. ✓
- Button beside Compare toggle + modal → Tasks 12, 13. ✓
- Safe-empty pass-through default → `mode:'off'` default (Task 3), verified Tasks 9 & 14. ✓
- `PLE` → `PLE Computers` reconciliation → Task 10. ✓
- Startup cache load + index → Task 8. ✓
- Tests (unit + integration) → Tasks 2, 9. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code.

**Type consistency:** `AffiliateLinkConfig` / `AffiliateMode` (shared) used consistently across service, routes, client, and preview helper. `AffiliateUpdate` (server) and `AffiliateUpdateBody` (client) mirror the zod `affiliateUpdateBody` shape. `applyAffiliateLink(rawUrl, config)` signature is consistent between definition (Task 2) and callers (Task 4).

**Notes for the executor:**
- The repo uses git branches (e.g. `build/automatorr-compare`). If you are on a default/protected branch, create a feature branch before the first commit.
- MongoDB and network are unavailable in some sandboxes; run server tests where `mongodb-memory-server` can start, and Task 14 on a machine with the demo stack.
