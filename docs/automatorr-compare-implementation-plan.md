# Automatorr — Component Comparison Tool · Implementation Plan

**Companion to:** `automatorr-compare-spec.md` (the spec is the source of truth; this plan sequences the build).
**Audience:** an agentic coding tool (e.g. Claude Code) executing top-to-bottom.
**Suggested repo path:** `docs/plans/2026-06-17-automatorr-compare-plan.md`

---

## How to use this plan

- Execute phases **in order**; each phase has a **Definition of Done (DoD)** — don't advance until it's met.
- Use **current stable** versions of all libraries unless a version is pinned here.
- TypeScript everywhere, strict mode. Shared contracts live in `shared/` and are imported by both apps — never duplicate types.
- After each phase, run that phase's tests/build before moving on.
- Brand tokens, data model, API contracts, and the scoring/compare/scraper designs are specified in the spec §4, §6, §8, §10–§12 — follow them exactly. Visual reference: `automatorr-compare-mockup-v5.html`.

**Global conventions**
- Package manager: npm workspaces (or pnpm) for the monorepo.
- Lint/format: ESLint + Prettier. Tests: Vitest (+ Supertest, mongodb-memory-server). e2e: Playwright (minimal).
- Commit at the end of each phase.

---

## Target repo structure

```
automatorr-compare/
├── package.json                # workspaces: client, server, shared
├── .env.example
├── shared/
│   └── src/types.ts            # Category, Component, PriceQuote, CompareResult, Scorecard, events
├── server/
│   ├── src/
│   │   ├── index.ts            # express bootstrap
│   │   ├── config.ts           # env load + zod validation
│   │   ├── db.ts               # mongoose connection
│   │   ├── models/             # Component, Verdict, SearchEvent, ClickEvent, TrendRollup
│   │   ├── routes/             # categories, components, compare, verdict, events, admin
│   │   ├── middleware/         # auth (jwt), error handler, validate(zod)
│   │   ├── services/
│   │   │   ├── catalog.ts
│   │   │   ├── scoring.ts            # normaliseIndex (SWAPPABLE)
│   │   │   ├── compare.ts           # compare() pure fn + scorecard
│   │   │   ├── compareConfig.ts     # per-category field config
│   │   │   ├── analytics.ts
│   │   │   ├── verdict/
│   │   │   │   ├── VerdictProvider.ts        # interface + factory
│   │   │   │   ├── PlaceholderVerdictProvider.ts
│   │   │   │   └── ClaudeVerdictProvider.ts  # later (stub file)
│   │   │   └── pricing/
│   │   │       ├── PriceProvider.ts          # interface + factory
│   │   │       ├── ScraperPriceProvider.ts
│   │   │       ├── retailers/                # one adapter per AU store
│   │   │       └── scheduler.ts              # node-cron job
│   │   └── seed/
│   │       ├── seed.ts                        # entrypoint
│   │       ├── data/                          # curated official-spec seed files (json)
│   │       └── csv/                           # UserBenchmark CSVs go here
│   └── tests/
└── client/
    ├── index.html
    ├── src/
    │   ├── main.tsx, App.tsx, router.tsx
    │   ├── styles/tokens.css                  # brand CSS variables (spec §4)
    │   ├── lib/api.ts, lib/session.ts, lib/queryClient.ts
    │   ├── pages/ComparePage.tsx, AdminLogin.tsx, AdminDashboard.tsx
    │   └── components/                         # TopBar, CategoryNav, ComponentPicker,
    │                                           # CompareGrid, ComponentCard, VsSpine,
    │                                           # PriceList, VerdictPanel, Scorecard, charts…
    └── tests/
```

---

## Phase 0 — Scaffold & shared contracts

**Tasks**
1. Init monorepo with npm workspaces (`client`, `server`, `shared`); root scripts (`dev`, `build`, `test`, `lint`).
2. TypeScript strict configs per package; ESLint + Prettier; Vitest.
3. `shared/src/types.ts` — author the canonical contracts:
   - `Category = 'cpu'|'gpu'|'ram'|'storage'`
   - `Component`, `PriceQuote`, `SpecField`, `CompareResult`, `Scorecard` (`{ winnerSlug, tally:{a,b,total}, deltas:[{label,value,unit}], tags:string[] }`), `VerdictResponse` (`{ scorecard, prose, generated:boolean }`), `SearchEvent`, `ClickEvent`.
4. `.env.example` with every var from spec §13.

**DoD:** `npm run build` and `npm run lint` pass across all workspaces; shared types import cleanly into a throwaway file in both client and server.

---

## Phase 1 — Data layer

**Tasks**
1. `server/src/config.ts` — load + zod-validate env; fail fast on missing required vars.
2. `server/src/db.ts` — mongoose connect with retry/logging.
3. `models/` — Mongoose schemas matching spec §6 exactly (Component, Verdict, SearchEvent, ClickEvent, TrendRollup), including the indexes listed (unique `category+slug`, text index on name/brand, `category+performanceIndex`, event `ts/category/store`).
4. `/api/health` route + express bootstrap (`index.ts`), CORS locked to `CLIENT_ORIGIN`, JSON body parsing, central error handler.

**DoD:** server boots, connects to Mongo, `/api/health` returns ok; models create indexes on startup.

---

## Phase 2 — Seeding pipeline & sample data

**Tasks**
1. `services/scoring.ts` — `normaliseIndex(category, ubRaw)` per spec §10 (per-category reference = 1000, uncapped). Pure + unit-tested.
2. `services/compareConfig.ts` — per-category field configs per spec §11 (label, direction, unit, tag weighting) for CPU/GPU/RAM/Storage.
3. `seed/data/` — curated seed files: author **at least 6–10 real components per category** from official product pages (include the AMD Ryzen 7 7800X3D and Intel i9-14900K from the prototype), with `specs`, `imageUrl?`, and `provenance.specSourceUrl`.
4. `seed/csv/` + CSV parser — read UserBenchmark CSVs, match rows to seed components by model name, attach `benchmark.ubRaw`. Provide a documented CSV column-mapping; if a CSV is absent, allow a fallback `ubRaw` in the seed file so the build still runs.
5. `seed/seed.ts` — merge specs + ubRaw → compute `performanceIndex` → upsert `components` (idempotent by `category+slug`) → write provenance. Add `npm run seed`.

**DoD:** `npm run seed` populates all four categories; querying Mongo shows complete docs with `performanceIndex`; re-running seed is idempotent. Scoring + a sample compareConfig have passing unit tests.

---

## Phase 3 — Core services & public API

**Tasks**
1. `services/catalog.ts` — `listComponents(category,q?)` (text search + sort by index), `getComponent(category,slug)`.
2. `services/compare.ts` — pure `compare(a,b)` → side-by-side specs with per-field Lead flags, winner (higher `performanceIndex`; tie-break lower best-price then higher index), tally, decisive deltas (top 3 by magnitude/weight), tags — all driven by `compareConfig`. No I/O. Heavily unit-tested.
3. `services/verdict/` — `VerdictProvider` interface + factory (reads `VERDICT_PROVIDER`); `PlaceholderVerdictProvider` returns the fixed sentence: *"Claude API will be wired to generate a comparison between the two components in a further version."*; create empty `ClaudeVerdictProvider.ts` with a `// TODO(phase: later)` stub implementing the interface.
4. `routes/` — wire `GET /api/categories`, `/api/components`, `/api/components/:category/:slug`, `/api/compare`, `/api/verdict` (returns `{ scorecard, prose, generated:false }`). All inputs zod-validated via `middleware/validate`.

**DoD:** hitting `/api/compare?category=cpu&a=intel-core-i9-14900k&b=amd-ryzen-7-7800x3d` returns correct specs + scorecard (AMD winner, tally, deltas, tags); `/api/verdict` returns the placeholder prose; integration tests green against `mongodb-memory-server`.

---

## Phase 4 — Pricing (seam + scraper)

**Tasks**
1. `services/pricing/PriceProvider.ts` — interface + factory (reads `PRICE_PROVIDER`).
2. `retailers/` — adapters for the AU registry (Amazon AU, Scorptec, PLE, Centre Com, PCCaseGear): each `{ store, buildSearchUrl(c), parse(html) }`. Start with 2–3 implemented + the rest stubbed returning `null`.
3. `ScraperPriceProvider.ts` — orchestrates adapters with `p-limit` throttle, per-domain delay, user-agent, timeout, bounded retries, `robots.txt` respect; isolates adapter failures; returns `PriceQuote[]`.
4. `scheduler.ts` — `node-cron` job (`SCRAPE_CRON`) that refreshes `component.prices` (writes `lastUpdated`, keeps last-known on failure) + `npm run scrape` manual command.
5. Adapter unit tests against saved HTML fixtures.

**DoD:** `npm run scrape` populates `prices[]` for seeded components from the implemented adapters; failures log without crashing; `/api/compare` now returns prices; adapter fixture tests pass. (Note in README: per-retailer ToS review before production.)

---

## Phase 5 — Analytics + admin auth + dashboard API

**Tasks**
1. `services/analytics.ts` — `recordSearch/recordView/recordClick`, `buildRollups()` (scheduled via cron), `getAnalytics(window)` (top components, top stores, search volume time-series, recent events).
2. `routes/events` — `POST /api/events/search`, `POST /api/events/click` (records then returns; client then redirects).
3. `middleware/auth.ts` — JWT verify (httpOnly cookie). `routes/admin` — `POST /api/admin/login` (bcrypt-check env creds → set JWT cookie), `GET /api/admin/analytics` (guarded).

**DoD:** posting events writes to `searchEvents`/`clickEvents`; admin login succeeds with env creds and rejects bad creds; `/api/admin/analytics` returns aggregated data only when authed; integration tests cover auth + event capture.

---

## Phase 6 — Client scaffold, tokens, shared UI

**Tasks**
1. Vite + React + Router + TanStack Query setup; `lib/api.ts` (typed fetch from `shared` types), `lib/queryClient.ts`, `lib/session.ts` (anonymous UUID + event posting).
2. `styles/tokens.css` — brand CSS variables from spec §4; load Kanit + Inter + JetBrains Mono; global resets; `prefers-reduced-motion` handling.
3. Primitive components matching the mockup: `TopBar`, `CategoryNav`, eyebrow/index atoms (with blinking lime caret), buttons (lime-outline, lime-fill), card shell.

**DoD:** app runs, shows the branded shell (top bar → hero → category nav, in that order) pixel-close to v5; tokens drive all colour/type; Lighthouse a11y has no contrast failures.

---

## Phase 7 — Compare page (the core)

**Tasks**
1. `ComponentPicker` ×2 — searchable select hitting `/api/components`; fires a search event on selection.
2. URL-as-state: `/compare/:category/:slugA-vs-:slugB` hydrates pickers + results; selecting both navigates here (deep-linkable, back/forward works).
3. **Auto-compare:** on both slots filled, query `/api/compare` (specs + scorecard render immediately) and `/api/verdict` (placeholder prose); debounce on swaps; fire a view event.
4. `ComponentCard` — image-or-branded-fallback (per-category SVG render), Kanit score (lime if winner), spec rows with Lead tags, `PriceList` (indexed `1.0/1.1`, lowest lime, outbound links that POST a click event then open the store), CTA. Winner = lime keyline + glow + OUTCLASSES badge only (identical surface).
5. `VsSpine`, `EmptyState` (prompt for second part), loading shimmers.
6. `VerdictPanel` — two-column: `Scorecard` (tally bar, delta tiles, tags) + `VerdictProse` (placeholder text, shimmer-ready, "AI verdict — coming soon" pill).

**DoD:** end-to-end in the browser — pick two CPUs → instant specs + scorecard + winner styling + prices + placeholder verdict; deep link reproduces it; search/view/click events land in Mongo; matches v5; reduced-motion + keyboard nav work.

---

## Phase 8 — Admin dashboard UI

**Tasks**
1. `/admin/login` form → `/api/admin/login`; guarded `/admin` route.
2. `AdminDashboard` — `TrendChart` (search volume over time), `TopList` (top components, top stores by clicks), `RecentEvents` table. Charts: legends, tooltips, table fallback, colourblind-safe palette, reduced-motion (spec §4 chart rules).

**DoD:** logging in shows real aggregated analytics from captured events; unauthorised access redirects to login.

---

## Phase 9 — Tests & hardening

**Tasks**
1. Fill unit coverage: scoring, compare/scorecard edge cases (ties, missing specs), each price adapter.
2. Integration: all API routes against `mongodb-memory-server`, incl. auth + validation failures.
3. e2e (Playwright): compare happy-path renders winner; admin login → dashboard.
4. Error/empty states audited; scraper + rollup jobs verified to fail soft.

**DoD:** `npm test` green; e2e happy-paths pass; no unhandled promise rejections in job runs.

---

## Phase 10 — Build, run, docs

**Tasks**
1. Production build for client (static) + server; serve client build from Express or document separate hosting; lock CORS.
2. `README.md` — setup, `.env`, `npm run seed`, `npm run scrape`, dev/build/test, the ToS note, and the two "later" wiring steps (Claude verdict, live price provider) with exact env flips.
3. Verify the two seams: setting `VERDICT_PROVIDER=claude` / `PRICE_PROVIDER=<new>` resolves via factory (Claude stub may throw "not implemented" — that's fine; the wiring path is proven).

**DoD:** fresh clone → `npm install` → set `.env` → `npm run seed` → `npm run dev` yields a working app; README lets a new dev reproduce it and shows exactly how to light up the deferred features.

---

## Build-order rationale (dependency flow)

`shared types → db/models → seed (needs scoring/config) → core services+API (needs data) → pricing (enriches data) → analytics/admin (needs events) → client shell → compare page (needs all public APIs) → admin UI (needs admin API) → tests → ship`. Each phase consumes only what earlier phases produced, so the agent never blocks on a forward dependency.

## Deferred (designed-for, not built) — see spec §14
- `ClaudeVerdictProvider` (Anthropic SDK, Haiku-class, cache via `verdicts`, `VERDICT_PROVIDER=claude`).
- Live `PriceProvider` (e.g. Amazon PA-API) via `PRICE_PROVIDER`.
- Re-adding motherboard / PSU / CPU-cooling (seed data + `compareConfig` block).
