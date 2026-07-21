# Affiliate-link management in the admin dashboard — design

- **Date:** 2026-07-17
- **Status:** Approved (design)
- **Author:** Dan + Claude
- **Area:** `server/` (pricing/affiliate seam, admin API) + `client/` (admin dashboard)

## 1. Problem & context

Outbound "Buy" links across the site (compare cards, price lists, the PC-builder
table) render `PriceQuote.url` — the raw product/search URL captured by the price
scraper. **No affiliate tracking is applied anywhere today.** The `*_AFFILIATE_TAG`
entries in `.env.example` are placeholders that no code reads.

We want an admin-only section in the analytics dashboard, reached from a button next
to the Compare/Builder toggle, where each retailer's affiliate configuration can be
edited, updated, or removed. Saving persists to the backend and takes effect on every
outbound link immediately — no redeploy, no re-scrape.

The operator does **not** have affiliate IDs yet; they will be entered after
deployment. The feature must therefore ship safe-empty: with nothing configured, every
link behaves exactly as it does today.

## 2. Goals / non-goals

**Goals**
- Per-store affiliate config, editable from the admin dashboard, persisted to MongoDB.
- Two mechanisms per store, operator-selectable:
  - **Tag** — append an affiliate ID as a query parameter (e.g. Amazon `?tag=…`).
  - **Wrapper** — a network deep-link/redirect template with a `{url}` placeholder
    (e.g. Commission Factory `https://t.cfjump.com/12345/t?url={url}`).
- Applied live to every outbound price URL the API serves.
- Safe-empty default (pass-through) so it can deploy before any IDs exist.

**Non-goals (YAGNI)**
- No admin-managed *adding* of new stores — the store set is the fixed retailer
  registry (6 stores).
- No per-product / per-category tag overrides.
- No click-time redirect endpoint (Approach B was considered and rejected — see §4).
- No change to the price scraper or the existing click-tracking flow.
- No live retailer feeds / credentials work (tracked separately in Task 3).

## 3. Store identifiers

The canonical store set is the retailer registry
(`server/src/services/pricing/retailers/`), the source of truth for scraped prices:

`Amazon`, `Mwave`, `Scorptec`, `PLE Computers`, `PCCaseGear`, `Centre Com`.

**Known drift to reconcile:** demo/seed prices in `server/src/seed/demoPrices.ts` use
`PLE` where the registry uses `PLE Computers`. Because affiliate matching keys on the
store string, this would silently drop the tag for PLE. Fix: update `demoPrices.ts` to
the canonical `PLE Computers` so there is a single store-name source of truth. Matching
is additionally normalised (trimmed, case-insensitive) to be resilient to casing.

## 4. Application seam — decorate on read (Approach A)

Every public price URL flows through `serializeComponent`
(`server/src/lib/serialize.ts`) → the catalogue service
(`getComponent` / `listComponents` / `getPair` in `server/src/services/catalog.ts`),
which the compare, verdict, components, and all builder/by-merchant reads consume.
Decoration applied at this single choke point covers the whole site.

- `serializeComponent` stays pure (no config dependency).
- The catalogue service runs each served component's `prices[]` through the affiliate
  transform immediately after serialization.

Rejected alternatives:
- **B. Click-time redirect endpoint** — cleaner tracking but requires a new endpoint
  and changing every Buy link in the client. More invasive; not needed for v1.
- **C. Bake tag at scrape time** — stale; changing a tag would require a re-scrape.

## 5. Data model

New Mongoose collection `AffiliateLink`, one document per store:

| Field | Type | Notes |
|---|---|---|
| `store` | string | Canonical registry name. **Unique index.** |
| `mode` | `'off' \| 'tag' \| 'wrapper'` | Default `'off'` = pass-through. Doubles as enable/disable/remove. |
| `paramName` | string | Tag mode only. Query-param name. Default `'tag'`. |
| `tag` | string | Tag mode only. The affiliate ID value. |
| `wrapperTemplate` | string | Wrapper mode only. Must contain `{url}`. |
| `createdAt` / `updatedAt` | Date | Mongoose timestamps. |

Empty collection ⇒ all stores behave as `off` ⇒ links pass through unchanged.

A shared type (`AffiliateLinkConfig`) is added to `shared/src/types.ts` so client and
server share one contract, consistent with the existing "no type drift" convention.

## 6. Pure transform

`applyAffiliateLink(store, rawUrl, config): string` — server-side, pure, unit-tested.
Lives in `server/src/services/affiliate/applyAffiliateLink.ts`.

Rules, in order:
1. If `rawUrl` is not a valid `http(s)` URL → return `rawUrl` unchanged.
2. `mode === 'off'`, or the mode's required value is empty → return `rawUrl` unchanged.
3. `mode === 'tag'`:
   ```
   const u = new URL(rawUrl);
   u.searchParams.set(paramName || 'tag', tag);   // set() so re-runs never duplicate
   return u.toString();
   ```
4. `mode === 'wrapper'`:
   ```
   return wrapperTemplate.replaceAll('{url}', encodeURIComponent(rawUrl));
   ```
5. Any thrown error → return `rawUrl` unchanged (a bad config must never break a link).

Examples:
- tag: `…/dp/B0C123` + `{mode:'tag', tag:'automatorr-22'}` → `…/dp/B0C123?tag=automatorr-22`
- tag onto URL with existing query: `…/search?q=cpu` → `…/search?q=cpu&tag=automatorr-22`
- wrapper: `{mode:'wrapper', wrapperTemplate:'https://t.cfjump.com/123/t?url={url}'}`
  → `https://t.cfjump.com/123/t?url=https%3A%2F%2F…`

## 7. Affiliate config service & cache

`server/src/services/affiliate/affiliateService.ts`:
- In-memory `Map<normalizedStore, AffiliateLinkConfig>`.
- `loadAffiliateConfigs()` — read all docs into the cache. Called at server startup
  (in `index.ts`, alongside index init) and by the demo server.
- `refreshAffiliateConfigs()` — reload the cache; called after every admin write so
  changes take effect immediately. A short safety TTL (e.g. 5 min) also triggers a
  lazy reload, so multi-process deploys converge even without a write locally.
- `decorateComponent(component): Component` — returns a copy with each price's `url`
  run through `applyAffiliateLink` using the cached config for that store.

The catalogue service calls `decorateComponent` on every serialized component.

## 8. Admin API

All routes under the existing `requireAdmin` JWT-cookie guard, zod-validated, mounted
in `server/src/routes/admin.ts`.

- `GET /api/admin/affiliates`
  → `{ stores: AffiliateLinkConfig[] }` — one entry per **known registry store**,
  filling defaults (`mode:'off'`, `paramName:'tag'`, empty values) for stores with no
  saved doc. The client never hardcodes the store list.

- `PUT /api/admin/affiliates/:store`
  - `:store` validated against the known registry store set (404 otherwise).
  - Body (zod): `{ mode, paramName?, tag?, wrapperTemplate? }`.
  - Validation: `mode ∈ {off,tag,wrapper}`; when `mode==='wrapper'`, `wrapperTemplate`
    is required and must contain `{url}`; when `mode==='tag'`, `tag` is required;
    length caps (`tag` ≤ 200, `paramName` ≤ 40 and `[A-Za-z0-9_-]+`, `wrapperTemplate`
    ≤ 600 and a valid `http(s)` URL once `{url}` is substituted with a probe).
  - Upserts the doc, calls `refreshAffiliateConfigs()`, returns the saved config.
  - Reset/remove = `PUT` with `{ mode:'off' }`.

Zod schemas added to `server/src/routes/schemas.ts`.

## 9. Admin UI

`client/src/pages/AdminDashboard.tsx` header (`.admin-head`), next to the
compare/builder toggle, gains a button **"Affiliate links"** (styled like the existing
`admin-link`/toggle atoms). It opens a **modal** (following the existing modal pattern
used by the builder `PartPicker`).

New component `client/src/components/admin/AffiliateLinksModal.tsx`:
- `useQuery(['affiliates'])` → `api.getAffiliates()`; renders one row per store.
- Each row: store name · **mode** select (Off / Tag / Wrapper) · conditional inputs —
  Tag mode shows *param name* (default `tag`) + *affiliate ID*; Wrapper mode shows a
  single *full link* field with a `{url}` placeholder hint · a **live preview** of a
  sample decorated URL (computed client-side with the same transform logic) · **Save**
  and **Clear** buttons.
- Save = `useMutation` → `api.putAffiliate(store, body)`; on success invalidates
  `['affiliates']` and shows a transient "Saved" state. Clear = Save with `mode:'off'`.
- Errors surface inline per row (validation message from the API).
- Accessibility: focus trap, Escape-to-close, `role="dialog"`, matching `PartPicker`.

`client/src/lib/api.ts` gains `getAffiliates()` and `putAffiliate(store, body)`.
Styling reuses existing brand tokens; minimal additions to `styles/app.css`.

The transform used for the client-side preview is duplicated as a tiny pure helper in
the client (it cannot import server code). It is display-only; the server transform in
§6 remains authoritative.

## 10. Edge cases

- Product URL already has query params → `URL.searchParams.set` appends with `&`.
- `tag` mode with empty `tag`, or `wrapper` mode with empty/invalid template →
  pass-through (no decoration).
- Non-`http(s)` or malformed `url` → pass-through.
- Store on a price quote with no matching config (e.g. an unknown store) → pass-through.
- Re-decoration is idempotent for tag mode (`set` overwrites). Wrapper mode is applied
  once per read on the raw stored URL, so it does not double-wrap.
- `{url}` appearing more than once in a template → all occurrences substituted.

## 11. Testing

- **Unit** (`server/tests/affiliate.test.ts`): `applyAffiliateLink` — tag append onto
  URLs with/without existing params, param-name default + override, wrapper
  substitution + encoding, multiple `{url}`, off/empty/invalid → pass-through,
  store-name normalisation.
- **Integration** (extend `server/tests/api.test.ts` or new `affiliate-api.test.ts`):
  - `GET /api/admin/affiliates` requires auth; returns all six stores with defaults.
  - `PUT` validation (bad mode, wrapper missing `{url}`, unknown store) and success.
  - After a `PUT`, a `/api/compare` (or `/api/components/:cat/:slug`) response shows
    the decorated URL — proving the read seam + cache refresh end-to-end.
- **Client** (optional): a render/interaction test for `AffiliateLinksModal` mode
  switching + preview, consistent with `client/tests/VerdictPanel.test.tsx`.

## 12. Files touched (estimate)

**New**
- `server/src/models/AffiliateLink.ts` (+ export in `models/index.ts`)
- `server/src/services/affiliate/applyAffiliateLink.ts`
- `server/src/services/affiliate/affiliateService.ts`
- `server/tests/affiliate.test.ts`, `server/tests/affiliate-api.test.ts`
- `client/src/components/admin/AffiliateLinksModal.tsx`
- `docs/superpowers/specs/2026-07-17-affiliate-links-admin-design.md` (this file)

**Modified**
- `shared/src/types.ts` — `AffiliateLinkConfig` type + mode union.
- `server/src/services/catalog.ts` — decorate on read.
- `server/src/routes/schemas.ts` — affiliate zod schemas.
- `server/src/routes/admin.ts` — the two affiliate routes live here (all `/admin/*`;
  the admin router is already mounted, so no `routes/index.ts` change).
- `server/src/index.ts` + `server/src/devServer.ts` — load cache on startup; init model.
- `server/src/seed/demoPrices.ts` — `PLE` → `PLE Computers`.
- `client/src/lib/api.ts` — `getAffiliates` / `putAffiliate`.
- `client/src/pages/AdminDashboard.tsx` — header button + modal wiring.
- `client/src/styles/app.css` — modal/row styling.

## 13. Rollout & safety

- Ships with an empty `AffiliateLink` collection ⇒ pass-through ⇒ no behaviour change.
- Operator later opens the modal, sets each store to Tag or Wrapper, saves.
- Because decoration is on read, tags apply to all existing and future prices at once.
- Guard invariant: a bad/missing config can never produce a broken link — worst case a
  link is served untagged.

## 14. Open items / future

- Which stores use Tag vs Wrapper is unknown until affiliate programs are approved
  (Amazon = Tag confirmed; the Commission-Factory stores likely Wrapper).
- Future: click-time redirect endpoint (Approach B) if raw-URL hiding or richer
  attribution is wanted; per-product deep-link IDs once retailer feeds are live.
