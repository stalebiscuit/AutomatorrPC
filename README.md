# Automatorr — Component Comparison Tool

Pit two PC components of the same category head‑to‑head and settle which one wins:
official specs, a normalised Automatorr performance index, multi‑store pricing, and a
verdict (a deterministic scorecard + prose). Built dark, editorial‑technical, on the
Automatorr brand (Royal Night + Lime).

> Source of truth: `docs` specification (`automatorr-compare-spec.md`). This README covers
> how to run, seed, test, and extend the app.

---

## Stack

npm‑workspaces monorepo, TypeScript strict throughout:

```
automatorr-compare/
├── shared/    canonical contracts imported by both apps (no type drift)
├── server/    Node + Express + Mongoose + zod (API, scraper, seeding, analytics)
└── client/    React + Vite + React Router + TanStack Query (SPA)
```

- **Server:** Express · Mongoose (MongoDB) · zod · node‑cron · cheerio · p‑limit ·
  bcryptjs · jsonwebtoken.
- **Client:** React 18 · Vite · React Router · TanStack Query · bespoke components driven
  by brand CSS tokens (no UI kit).

---

## Prerequisites

- **Node ≥ 20**
- **MongoDB** for the full app (`npm run dev`). No Mongo? Use the **demo mode** below — it
  spins up an in‑memory MongoDB automatically.

---

## Quick start (demo mode — no MongoDB needed)

```bash
npm install
# Terminal 1 — API + in‑memory Mongo + auto‑seed:
npm run dev:demo --workspace server
# Terminal 2 — client:
npm run dev --workspace client
```

Open http://localhost:5173. Try a deep link:
`/compare/cpu/intel-core-i9-14900k-vs-amd-ryzen-7-7800x3d`.
Admin (demo creds): **admin / demo-password** at `/admin/login`.

## Full setup (with MongoDB)

```bash
npm install
cp .env.example .env                 # then edit values
# generate an admin password hash and paste into ADMIN_PASSWORD_HASH:
npm run hash-password --workspace server -- "your-admin-password"
npm run seed                         # populate the catalogue from CSV + seed data
npm run dev                          # server (:4000) + client (:5173)
```

### Environment (`.env`)

| Var | Purpose |
|---|---|
| `MONGODB_URI` | Mongo connection string |
| `PORT` | API port (default 4000) |
| `CLIENT_ORIGIN` | CORS origin (default http://localhost:5173) |
| `JWT_SECRET` | admin session signing secret (≥16 chars) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` | single admin credential (bcrypt hash) |
| `PRICE_PROVIDER` | `scraper` (provider seam) |
| `VERDICT_PROVIDER` | `placeholder` \| `claude` (provider seam) |
| `SCRAPE_CRON` / `SCRAPE_USER_AGENT` | scraper schedule + UA |
| `ROLLUP_CRON` | analytics rollup schedule |
| `ANTHROPIC_API_KEY` / `VERDICT_MODEL` | *(later)* Claude verdict provider |

---

## Scripts (run from repo root)

| Command | Description |
|---|---|
| `npm run dev` | server + client together |
| `npm run dev:demo --workspace server` | API with in‑memory Mongo + auto‑seed (no external DB) |
| `npm run build` | type‑check + build all workspaces (client → static) |
| `npm test` | unit + integration (Vitest, mongodb‑memory‑server) |
| `npm run lint` | ESLint across the monorepo |
| `npm run seed` | upsert the curated catalogue (idempotent) |
| `npm run scrape` | refresh prices from the implemented retailer adapters |
| `npm run rollups` | build analytics rollups |
| `npm run hash-password --workspace server -- "pw"` | print a bcrypt hash |
| `npm run e2e --workspace client` | Playwright happy‑paths (needs demo API + client up) |

---

## Data, scoring & the catalogue

- **Catalogue:** ~35 real components (CPU 9, GPU 8, RAM 8, Storage 6 SSD + 4 HDD) authored
  from official product pages in `server/src/seed/data/*.json`, with `provenance.specSourceUrl`.
  Genuinely‑unknown spec values are **flagged** (`provenance.unknownFields`), never guessed.
- **Performance index (`scoring.ts`, spec §10):** a pure linear normalisation of the
  UserBenchmark raw score against a fixed per‑category reference pinned to **1000**,
  **uncapped**. It is **UB‑faithful** — it preserves UserBenchmark ordering. Consequently
  the i9‑14900K (raw 131) outranks the 7800X3D (raw 121); the v5 mockup's depicted winner
  is illustrative only. Storage uses a **single category‑wide reference** so SSDs and HDDs
  sit on one comparable scale. The whole mapping is one swappable function — re‑seed to
  re‑tune without touching specs/compare/UI.
- **CSV ingestion:** `server/src/seed/csv/*.csv` (UserBenchmark exports). Rows are matched
  to seed components by `(Type, Model)`; the `Benchmark` column is used verbatim as `ubRaw`.
  If a CSV is absent, a `fallbackUbRaw` in the seed file keeps the build running.
- **Compare (`compare.ts`):** a pure function driven entirely by `compareConfig.ts` — Lead
  flags, win tally, decisive deltas, and "best for" tags. Storage is subtype‑aware: in a
  cross‑subtype (SSD vs HDD) comparison only the **Common** field group counts toward the
  tally; subtype‑unique fields still render as info rows (shown "—" on the side that lacks
  them) and are excluded from the count.

---

## Pricing (provider seam + scraper)

- `PriceProvider` is the stable contract; `PRICE_PROVIDER` selects the implementation.
- `ScraperPriceProvider` (v1) runs a hardcoded AU retailer registry (Scorptec, PLE,
  PCCaseGear implemented; Amazon AU + Centre Com stubbed) with a concurrency cap,
  per‑domain delay, descriptive UA, timeouts + bounded retries, and **robots.txt respect**.
  Each adapter is isolated — one failing retailer never breaks the run; empty/failed scrapes
  keep the last‑known price (`lastUpdated` is shown in the UI).
- Runs as a scheduled job (`SCRAPE_CRON`) and via `npm run scrape`; **never inline** on a
  request. Adapters are tested against saved HTML fixtures.
- **ToS note:** per‑retailer terms warrant a legal review before production use. Not a build
  blocker.

---

## Extending the two seams (designed‑for, spec §14)

Both deferred features are pre‑wired through factories — flipping one env var is the only change.

**Claude verdict.** Implement `server/src/services/verdict/ClaudeVerdictProvider.ts` (Anthropic
SDK, Haiku‑class model, grounded on the two specs + the scorecard's index gap, cache‑first via
the `verdicts` collection), set `ANTHROPIC_API_KEY` / `VERDICT_MODEL`, then:

```
VERDICT_PROVIDER=claude
```

The `/api/verdict` response shape (`{ scorecard, prose, generated, model }`) and the UI do not
change; `generated` flips to `true` and the "AI verdict — coming soon" pill disappears.

**Live pricing.** Add a `PriceProvider` implementation (e.g. `AmazonPaapiProvider`) and set
`PRICE_PROVIDER=<name>`. No endpoint, UI, or tracking change.

The factory wiring is covered by `server/tests/seams.test.ts`.

---

## API surface

`GET /api/categories` · `GET /api/components?category=&q=` ·
`GET /api/components/:category/:slug` · `GET /api/compare?category=&a=&b=` ·
`GET /api/verdict?category=&a=&b=` · `POST /api/events/search` · `POST /api/events/click` ·
`POST /api/admin/login` · `GET /api/admin/analytics?window=` · `GET /api/health`.
All inputs are zod‑validated; errors are `{ error, code }`.

---

## Admin analytics

`/admin/login` → JWT in an httpOnly cookie guards `/admin`. The dashboard shows search‑volume
over time (accessible chart with a table fallback), trending components, top comparisons, top
stores by clicks, and recent events. Events are append‑only and store **no PII** (an anonymous
first‑party `sessionId`).

---

## Testing

- **Unit:** scoring normalisation, compare/scorecard (ties, missing specs, cross‑subtype),
  each price adapter vs fixtures.
- **Integration:** all API routes against `mongodb-memory-server`, incl. auth + validation.
- **e2e (Playwright):** compare happy‑path renders the winner; admin login → dashboard.
  Run with the demo API + client up: `npm run e2e --workspace client`.

```bash
npm test                       # unit + integration
npm run e2e --workspace client # e2e (start dev:demo + client first)
```

---

## Production build

```bash
npm run build
# Server then serves client/dist (SPA fallback) from the same origin when present:
NODE_ENV=production MONGODB_URI=... npm run start --workspace server
```

Lock `CLIENT_ORIGIN` (CORS) to your deployed client origin, or serve the built client from the
API origin as above. `server/src/app.ts` auto‑serves `client/dist` if it exists.

---

## Project layout

```
shared/src/types.ts              canonical contracts
server/src/
  config.ts db.ts app.ts index.ts devServer.ts
  models/                        Component, Verdict, SearchEvent, ClickEvent, TrendRollup
  routes/                        categories, components, compare, verdict, events, admin
  services/
    scoring.ts compareConfig.ts compare.ts catalog.ts analytics.ts adminAuth.ts
    verdict/  VerdictProvider (+ Placeholder, Claude stub)
    pricing/  PriceProvider, ScraperPriceProvider, retailers/, robots, scheduler
  seed/       seed.ts, csvParser.ts, data/*.json, csv/*.csv
client/src/
  pages/      ComparePage, AdminLogin, AdminDashboard
  components/ TopBar, CategoryNav, ComponentPicker, ComponentCard, PriceList,
              CompareResults, VerdictPanel, charts…
  styles/     tokens.css (brand vars) + app.css (v5 translation)
```
