# Automatorr — Component Comparison Tool · Design Spec

**Date:** 2026-06-17
**Status:** Approved for implementation planning
**Suggested repo path:** `docs/specs/2026-06-17-automatorr-compare-design.md`

---

## 1. Overview & goals

Automatorr is a web app that pits **two PC components of the same category head-to-head** and settles which one wins. A user picks a category, chooses two parts, and the comparison runs automatically: official specs, a normalised Automatorr performance index, multi-store pricing, and a verdict (a data-driven scorecard plus a prose summary). The app also records what gets searched and which store links get clicked, surfaced to the operator through an admin analytics dashboard.

**Primary goals**
- Fast, frictionless two-part comparison with an unambiguous winner.
- Brand-authentic UI (translated from automatorr.com — dark, editorial-technical, Royal Night + Lime).
- A curated, auditable data layer the operator fully controls.
- Clean extension seams: prices and AI prose are pluggable, so today's stubs become tomorrow's live integrations with no UI change.
- Capture usage analytics for trend/popularity insight.

**Non-goals (v1):** user accounts, payments, live retail price APIs (seam only), AI prose generation (placeholder only), and the motherboard / PSU / CPU-cooling categories.

---

## 2. Scope

**In scope — four categories:** CPU, GPU, RAM, Storage.

**Core features**
1. Category selection (4 categories).
2. Two component pickers (search/select within the chosen category).
3. **Auto-compare** the instant both slots are filled — no Compare button.
4. Spec comparison with per-row "Lead" indicators.
5. Performance index (UserBenchmark normalised per category).
6. Multi-store price list per component (lowest highlighted), with outbound links.
7. Verdict panel: deterministic **scorecard** (winner, spec-wins tally, decisive deltas, "best for" tags) + **placeholder prose**.
8. Deep-linkable comparisons (shareable URLs).
9. Event tracking (search/view + price-link clicks).
10. Admin analytics dashboard (auth-gated).

**Out of scope (designed-for, not built):** Claude prose generation, live price providers, the three removed categories.

---

## 3. Product behaviour & UX

- **Landing / Compare page** is the whole product surface for end users. Order top-to-bottom: top bar (logo + MENU), hero (eyebrow + headline + intro line), the category nav (4 pills, CPU active by default), the two pickers with a central VS, then the results region.
- **Empty state:** before both slots are filled, the results region shows a prompt to pick the second part.
- **Auto-compare:** when both slots are filled (or one is swapped), the client fetches the comparison. Specs + scorecard render immediately. The verdict prose slot shows the placeholder. (When the Claude provider is later wired, the prose streams in with a shimmer; debounced so rapid swaps don't spam the provider.)
- **Winner treatment:** both cards share an identical surface; the winner is signalled only by a lime keyline + glow, an "OUTCLASSES" badge, and a lime performance score. (Avoids pre-judging via fill colour.)
- **Component image:** `component.imageUrl` if present; otherwise a per-category Automatorr-branded render (CPU/GPU/RAM/Storage) so the slot is never empty.
- **Prices:** each card shows an indexed source list (`1.0 / 1.1 / 1.2 …`) with store, price, and an outbound `↗` link; the lowest price is lime. A "SEE ALL PRICES >" CTA.
- **Deep links:** `/compare/:category/:slugA-vs-:slugB` reproduces a comparison exactly and is shareable; this is also the canonical URL logged for trends.
- **Admin dashboard** (`/admin`, auth-gated): trending components/comparisons over a time window, most-clicked stores, search volume over time, recent events.

---

## 4. Visual design system (locked — "v5")

Translated from automatorr.com: dark, editorial-technical, precise.

**Colour tokens**
```
--royal:       #2200a5   /* feature / winner surface accent */
--lime:        #c2e830   /* keylines, winner signal, accents */
--lilac:       #c783ff   /* secondary accent, source indices */
--bg:          #07040f   /* near-black base */
--bg-2:        #0c0820
--surface:     #100b26   /* cards / panels */
--line:        rgba(199,131,255,0.14)   /* hairlines */
--text:        #ffffff
--muted:       #a59fd0
--muted-2:     #7b76ab
```
Lime is **never used for body text on dark** beyond accents; reserved for keylines, the winner score, lead tags, lowest price, verdict highlights, and the cursor caret.

**Type**
- Display / headings & big numbers: **Kanit** (500/600/700).
- Body / data values: **Inter** (400/500/600), `font-variant-numeric: tabular-nums` on all data + prices.
- Indices, eyebrows, labels: **JetBrains Mono** (the `[02]` / `THE VERDICT_` technical voice).
All three are Google Fonts.

**Brand signatures carried into the UI**
- Bracketed section indices `[02] HEAD TO HEAD_`, `[03] THE VERDICT_`.
- Underscore-cursor eyebrows with a blinking lime caret.
- Indexed lists (`1.0`, `1.1`) for price sources, echoing the site footer.
- Two brand button styles: lime-outline-on-dark and lime-fill.
- Faint automation grid + soft royal/lilac corner glows on the background.

**UX guardrails (from the UI/UX skill)**
- Contrast ≥ 4.5:1 for text on all surfaces; colour is never the only signal (Lead tags, badges accompany colour).
- Touch targets ≥ 44px; visible focus states; `prefers-reduced-motion` respected.
- Motion 150–300ms; tabular figures to prevent layout shift; reserve image space (no CLS).
- One primary CTA per card; loading uses shimmer/skeleton, not blocking spinners.

The locked reference mockup is `automatorr-compare-mockup-v5.html`.

---

## 5. Architecture & stack

**Monorepo**, three packages:

```
automatorr-compare/
├── client/     React + Vite + TypeScript (SPA)
├── server/     Node + Express + TypeScript (API, scraper, seeding)
└── shared/     TypeScript types shared by client & server
```

**Server:** Node (LTS) · Express · TypeScript · MongoDB via Mongoose · `node-cron` (scheduler) · `cheerio` + `undici/fetch` (scraper parsing) · `p-limit` (throttle) · `bcrypt` + `jsonwebtoken` (admin auth) · `zod` (input validation). The Anthropic SDK is **added later** with the Claude verdict provider.

**Client:** React · Vite · TypeScript · React Router (deep links) · TanStack Query (data fetching/caching) · CSS variables for brand tokens (no heavy UI kit; bespoke components matching the mockup).

**Shared:** the canonical TypeScript interfaces (component, compare result, scorecard, price quote, events) imported by both sides so the contract can't drift.

**Why MongoDB:** specs differ per category (a CPU doc and a RAM doc have different fields) — a document store fits this heterogeneity without rigid columns, and the append-only event streams + periodic rollups are a natural fit.

---

## 6. Data model (MongoDB)

### `components`
```ts
{
  _id, category: 'cpu'|'gpu'|'ram'|'storage',
  brand: string, name: string, slug: string,        // slug unique per category
  imageUrl?: string,                                  // null → branded fallback
  specs: Record<string, string|number>,              // category-specific (see §11)
  benchmark: { ubRaw: number, ubSource: string },     // from UserBenchmark CSV
  performanceIndex: number,                            // normalised, "uncapped" (see §10)
  prices: Array<{ store: string, price: number, currency: 'AUD',
                  url: string, lastUpdated: ISODate }>,
  provenance: { specSourceUrl: string, csvRow?: string, seededAt: ISODate },
  createdAt, updatedAt
}
```
Indexes: `{ category: 1, slug: 1 }` unique; text index on `name`/`brand` for search; `{ category: 1, performanceIndex: -1 }`.

### `verdicts` (cache — dormant until Claude provider lands)
```ts
{ _id, pairKey: string,        // `${category}:${slugLow}|${slugHigh}` (order-stable)
  prose: string, model: string, generatedAt: ISODate }
```
Index: `{ pairKey: 1 }` unique.

### `searchEvents` (append-only)
```ts
{ _id, type: 'search'|'view', category, componentId?, pairKey?, query?, sessionId, ts }
```

### `clickEvents` (append-only)
```ts
{ _id, componentId, store, url, sessionId, ts }
```
Indexes on `ts`, `category`, `store` for rollups.

### `trendRollups` (periodic aggregation for fast dashboard reads)
```ts
{ _id, window: 'day'|'week', date, metric: 'topComponents'|'topStores'|'searchVolume',
  data: Array<{ key, count }>, generatedAt }
```

`sessionId` is an anonymous UUID from a first-party cookie/localStorage — **no PII**.

---

## 7. Backend services (isolated, single-purpose)

Each is a module with a clear interface, independently testable.

1. **Catalog** — `listComponents(category, q?)`, `getComponent(category, slug)`. Reads `components`, supports search.
2. **Scoring** — `normaliseIndex(category, ubRaw): number`. The single swappable scoring module (see §10). Used by the seeding pipeline.
3. **Compare** — `compare(a, b): CompareResult`. Pure function of two component docs → specs side-by-side, per-spec Lead flags, **scorecard** (winner, tally, deltas, tags). Driven by per-category `compareConfig` (§11). No I/O.
4. **Verdict** — `VerdictProvider` interface. v1 = `PlaceholderVerdictProvider` returning the fixed sentence. Later = `ClaudeVerdictProvider` (Anthropic SDK, Haiku-class model, cache-first via `verdicts`). Selected by config.
5. **Pricing** — `PriceProvider` interface (`getPrices(component): PriceQuote[]`). v1 = `ScraperPriceProvider` (per-retailer adapters + scheduler, §12). Writes `component.prices`. Future providers drop in via config.
6. **Analytics** — `recordSearch()`, `recordView()`, `recordClick()`, plus `buildRollups()` (scheduled) and `getAnalytics(window)` for the dashboard.
7. **Seeding** — turns official-page spec data + UserBenchmark CSV rows into finished `components` docs (§11). Re-runnable; records provenance.
8. **Admin auth** — env-credential login → JWT (httpOnly cookie); middleware guards `/api/admin/*`.

---

## 8. API surface

All JSON. Inputs validated with `zod`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/categories` | The 4 categories + metadata |
| GET | `/api/components?category=&q=` | Search/list components in a category |
| GET | `/api/components/:category/:slug` | Single component |
| GET | `/api/compare?category=&a=&b=` | Specs + scorecard for two slugs |
| GET | `/api/verdict?category=&a=&b=` | `{ scorecard, prose, generated }` (prose = placeholder in v1) |
| POST | `/api/events/search` | Log a search/view event |
| POST | `/api/events/click` | Log a price-link click (returns before redirect) |
| POST | `/api/admin/login` | Admin login → sets JWT cookie |
| GET | `/api/admin/analytics?window=` | Trends, top stores, search volume (auth) |
| GET | `/api/health` | Liveness |

`/api/compare` and `/api/verdict` accept slugs; the server resolves them, so URLs stay human-readable and deep-link friendly.

---

## 9. Frontend

**Routes**
- `/` — Compare page (no selection → empty state).
- `/compare/:category/:slugA-vs-:slugB` — canonical comparison (hydrates pickers + results, logged for trends).
- `/admin/login`, `/admin` — admin dashboard (guarded).

**Component tree (Compare page)**
```
<ComparePage>
  <TopBar/>                  logo + MENU
  <Hero/>                    eyebrow + headline (no forced break) + intro line
  <CategoryNav/>             4 pills (CPU/GPU/RAM/Storage), CPU active
  <SelectorRow>              <ComponentPicker x2> + <VsBadge>
  <ResultsRegion>
     <EmptyState/>  | <CompareGrid>
        <ComponentCard/>     image|fallback, score, spec rows (+Lead), <PriceList/>, CTA
        <VsSpine/>
        <ComponentCard win/>
     <VerdictPanel>
        <Scorecard/>         tally bar, delta tiles, tags
        <VerdictProse/>      placeholder (shimmer-ready)
```
**Admin:** `<AdminDashboard>` with `<TrendChart/>` (search volume over time), `<TopList/>` (top components, top stores), `<RecentEvents/>`. Charts respect the chart-a11y rules (legends, tooltips, table fallback, colourblind-safe palette).

**State/data:** TanStack Query for fetches (`compare`, `verdict`, `components`); URL is the source of truth for the current comparison (enables deep links + back/forward). A `sessionId` util manages the anonymous id and posts events.

---

## 10. Performance index (normalisation)

- **Source:** UserBenchmark CSV per category → `benchmark.ubRaw`.
- **Normalisation:** per category, scale raw scores against a fixed per-category reference component (reference = index **1000**); others scale proportionally. **Uncapped** — values may exceed 1000 (matches the prototype's 960 / 1020). Formula lives only in the Scoring module.
- **Stored:** both `benchmark.ubRaw` (provenance/re-tuning) and the derived `performanceIndex`.
- **Swappable:** the entire mapping is one function; changing it re-seeds indices without touching specs, compare, or UI.

---

## 11. Seeding pipeline & category configs

**Inputs:** (a) curated official-page spec values per component (e.g., AMD/Intel/NVIDIA product pages), authored as structured seed files; (b) UserBenchmark CSV exports per category.

**Process:** parse CSV rows → match to seed components by name/model → merge specs + `ubRaw` → compute `performanceIndex` (Scoring) → attach initial `prices` (empty or scraper-filled) → write `components` with `provenance`. Idempotent (re-runnable upserts by `category+slug`).

**Per-category `specs` + `compareConfig`** (which fields compare, direction, units):

- **CPU:** cores, threads, baseClock, boostClock(↑), l3Cache(↑), tdp(↓), socket, igpu. Tags: Gaming (cache/benchmark), Value (index/price), Efficiency (tdp).
- **GPU:** vram(↑), vramType, boostClock(↑), cudaOrStream, tbp(↓), busWidth(↑), length. Tags: 4K/1440p, Value, Efficiency.
- **RAM:** capacity(↑), speedMTs(↑), casLatency(↓), kitConfig, voltage, type(DDR5/4). Tags: Speed, Value, Capacity.
- **Storage** — storage components carry `specs.subtype: 'ssd' | 'hdd'` (SSDs seed from `SSD_UserBenchmarks.csv`, HDDs from `HDD_UserBenchmarks.csv`; both live in the single `storage` category). The `compareConfig` for storage is **subtype-aware** with three field groups:
  - **Common (both subtypes — always compared):** `capacity`(↑, GB/TB), `seqRead`(↑, MB/s), `seqWrite`(↑, MB/s), `interface` (e.g. SATA III / NVMe PCIe 4.0), `formFactor` (2.5" / 3.5" / M.2), plus `performanceIndex`(↑) and best `price`(↓). A derived `pricePerTB`(↓) is also computed and compared (this is where HDDs typically win).
  - **SSD-only:** `tbw`(↑, endurance), `randomIOPS`(↑), `dram` (present/none), `nandType`. Tags: Speed, Value, Endurance.
  - **HDD-only:** `rpm`(↑), `cacheMB`(↑). Tags: Capacity, Value, Workload.
  - **Cross-subtype rule (SSD vs HDD):** the **win-tally and decisive deltas use only the Common group** (the fields both parts have). Subtype-unique fields still render as info rows, shown as "—" on the side that lacks them, and are **excluded from the tally** so the count stays fair. The performance index remains the primary winner determinant (an SSD will rightly win on throughput); `pricePerTB`/capacity is where an HDD scores — so a cross-subtype comparison reads honestly as "SSD wins speed, HDD wins capacity/value."
  - **Normalisation:** storage uses a **single category-wide reference** (not per-subtype) so SSD and HDD indices sit on one comparable scale (SSDs land far higher, as expected). Raw value, `subtype`, and source CSV are kept in `provenance`.

`compareConfig` declares for each comparable field: `{ label, direction: 'higher'|'lower', unit, weightForTags }`. The Compare service uses it to set Lead flags, count the wins tally, pick decisive deltas, and derive tags — fully data-driven, so adding a field is a config edit.

---

## 12. Pricing — provider seam & scraper

**Interface** (the stable contract):
```ts
interface PriceProvider { getPrices(c: Component): Promise<PriceQuote[]> }
type PriceQuote = { store: string; price: number; currency: 'AUD'; url: string; lastUpdated: string }
```

**`ScraperPriceProvider` (v1)**
- Hardcoded AU retailer registry; each retailer = a small adapter `{ store, buildSearchUrl(c), parse(html): PriceQuote|null }`.
- Runs as a **scheduled job** (`node-cron`, e.g. nightly) + a manual refresh command; **never inline** on a request. Writes `component.prices`.
- Guardrails: respect `robots.txt`; `p-limit` throttle + per-domain delay; descriptive user-agent; timeout + bounded retries; on failure keep last-known price (UI already shows `lastUpdated`); adapter errors are logged and isolated (one retailer failing never breaks the job).
- Adapters tested against saved HTML fixtures so selector breakage is caught.
- **ToS note:** per-retailer terms warrant a legal review before production. Not a build blocker.

**Future providers:** `AmazonPaapiProvider`, retailer feeds — implement `PriceProvider`, selected by config. No UI/endpoint/tracking change.

---

## 13. Cross-cutting concerns

**Config / env** (`.env`, validated at boot):
```
MONGODB_URI, PORT, CLIENT_ORIGIN,
JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD_HASH,
PRICE_PROVIDER=scraper, VERDICT_PROVIDER=placeholder,
SCRAPE_CRON, SCRAPE_USER_AGENT,
ANTHROPIC_API_KEY (later), VERDICT_MODEL (later)
```

**Security:** admin routes JWT-gated (httpOnly, sameSite); passwords bcrypt-hashed; no secrets client-side; CORS locked to `CLIENT_ORIGIN`; all inputs zod-validated; events store no PII.

**Error handling:** typed API errors `{ error, code }`; client shows actionable empty/error states with retry; scraper + rollup jobs fail soft and log.

**Accessibility & performance:** per §4 guardrails — contrast, focus, reduced-motion, tabular figures, reserved image space, lazy-load below the fold, route-level code splitting.

**Testing:** unit (scoring normalisation, compare/scorecard logic, each price adapter vs fixtures); integration (API routes against `mongodb-memory-server`); e2e happy-paths (compare flow renders winner; admin login → dashboard). 

---

## 14. Future / designed-for

- **Claude verdict:** wire `ClaudeVerdictProvider` (Anthropic SDK, Haiku-class, grounded on the two docs' specs + index gap), cache-first via `verdicts`, set `VERDICT_PROVIDER=claude`. No other change.
- **Live pricing:** add a `PriceProvider` implementation; flip `PRICE_PROVIDER`.
- **More categories:** re-add motherboard/PSU/cooling by adding seed data + a `compareConfig` block.

---

## 15. Assumptions

- Region: **AUD**, AU retailers.
- Admin = single env-configured credential (not multi-user).
- UserBenchmark CSVs are obtainable per category; official spec values are curated into seed files by the operator.
- "Uncapped index" with a per-category reference = 1000 baseline (revisable in Scoring).
