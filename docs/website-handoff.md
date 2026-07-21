# Speccify — Full Website Handoff

_A complete orientation to the codebase for a new agent/developer: what it is, how it's built, and how every feature works. Reflects the current state of the `feat/admin-auth` branch (July 2026)._

> **Heads-up on older docs:** the root `README.md` and `docs/automatorr-compare-spec.md` predate two big changes and are partly stale — (a) admin login was replaced (password → passwordless email-OTP + RS256), and (b) the database was renamed `automatorr → speccify`. Where they conflict with this doc, this doc is correct.

---

## 1. What it is

**Speccify** (repo: `AutomatorrPC`, brand: Automatorr) is a PC-hardware web app with two public tools and an operator back office:

1. **Component Comparison** — pick a category, pick two parts, and get an instant head-to-head: official specs with per-row "lead" flags, a normalised performance index, multi-store prices, and a deterministic verdict (scorecard + prose).
2. **PC Builder** — assemble a full build part-by-part with live compatibility checks, wattage estimate, a build score, per-merchant pricing ("buy it all from one store" vs cheapest split cart), and shareable permalinks.
3. **Admin back office** — passwordless email-OTP login with role-based access, an analytics dashboard, and management of affiliate links, allowed sign-in domains, and admin users.

**Business model:** free tools; monetised via **affiliate links** on the outbound "Buy" URLs. The catalogue is a curated, operator-controlled data layer (thousands of parts across 9 categories) with multi-retailer price coverage.

**Domain / deploy target:** `https://speccify.info` (Namecheap domain → Azure VM). See `docs/deployment-runbook.md`.

---

## 2. Architecture

npm-workspaces monorepo, TypeScript strict throughout:

```
AutomatorrPC/
├── shared/   canonical contracts + pure logic imported by BOTH apps (no type drift)
├── server/   Node + Express + Mongoose + zod (API, scraper, seeding, analytics, auth)
└── client/   React 18 + Vite + React Router + TanStack Query (single-page app)
```

- **shared/** holds the types AND the pure domain logic that must agree on both sides: `types.ts` (Component, categories, DTOs), `catalogSpec.ts` (`validateSpecs`, per-category spec schema + criticality), `compatibility.ts` (build checks), `buildScore.ts`, `wattage.ts`, `pricing.ts` (`bestPrice`, `pricesByMerchant`), `verdictSummary.ts` (deterministic verdict prose), `gtin.ts`, `specUtil.ts`.
- **server/** resolves `@automatorr/shared` from its built `dist/`, so after editing `shared/src` you must `npm run build --workspace shared` (and restart) for server/client to see it.
- **Single-service production:** in `NODE_ENV=production` the Express server also serves the built client (`client/dist`) with an SPA fallback (`server/src/app.ts`) — so one Node process serves both the UI and `/api`. The client calls the API with a **relative `/api`** path, so it must be same-origin (or reverse-proxied). Cookies are `Secure` only in production, so local dev works over http.

**Stack:** Express · Mongoose · zod · node-cron · cheerio · p-limit · jsonwebtoken · nodemailer (lazy) · Playwright (optional, render-only) · React 18 · Vite · React Router · TanStack Query · brand CSS tokens (no UI kit).

---

## 3. Data model — MongoDB (`speccify` database, 15 collections)

**Catalogue + app (10):** `components`, `builds`, `verdicts`, `matchaliases`, `matchreviews`, `affiliatelinks`, `searchevents`, `clickevents`, `conversionevents`, `trendrollups`.
**Admin auth (5):** `adminusers`, `alloweddomains`, `adminotps`, `adminsessions`, `adminauditlogs`.

### The `Component` model is the heart of the catalogue
`server/src/models/Component.ts` — one model for every part in every category.

| field | notes |
|---|---|
| `category` | one of 9 `BUILDER_CATEGORIES` |
| `brand`, `name`, `slug` | identity key is **`{category, slug}` (unique)** — everything upserts on it |
| `specs` | `Mixed` map, heterogeneous per category (`Record<string, string\|number>`). Spec *shape* is validated by `validateSpecs()` in `shared/catalogSpec.ts`, which grades fields `critical\|required\|optional`; `builderReady = no missing critical` |
| `prices` | `[{ store, price, currency:'AUD', url, lastUpdated }]`, lowest-first |
| `imageUrl`, `gtin` | image + barcode (feed join key) |
| `performanceIndex` | normalised score (see §7); **0 for non-benchmarked categories** |
| `benchmark` | `{ ubRaw, ubSource }` provenance for the index |
| `provenance` | spec source URL / seed metadata |

**Benchmarked categories** (get a real `performanceIndex`): **cpu, gpu, ram, storage**. The other 5 (cooler, motherboard, case, psu, monitor) carry `performanceIndex 0` and are compared on specs only.

---

## 4. Feature: Component Comparison

**Flow:** `/compare/:category/:pair` → `ComparePage` picks a category (`CategoryNav`) and two parts (`ComponentPicker` ×2, server-side search) → the instant both are chosen it auto-compares (`CompareResults` → `api.compare`) → renders a `VerdictCard` + two `ComponentCard`s.

**Comparable categories** (`COMPARE_CATEGORIES` in `shared/types.ts`): cpu, gpu, **motherboard**, ram, storage, cooler, case, psu, monitor. (Motherboard was added this session.) The category list + labels also live in `server/src/services/categoriesMeta.ts` (`CATEGORY_META`) which the `/api/categories` endpoint serves.

**The compare engine** — `server/src/services/compare.ts` + `compareConfig.ts`:
- `COMPARE_CONFIGS[category]` declares the fields to compare: each `{ key, label, unit?, direction?, numeric, counted, deltaFormat? }`. `counted` numeric fields contribute to the **win tally**; info fields (socket, chipset…) don't.
- `compare(a, b)` builds a `CompareRow[]`: for each config field it resolves values (`rawValue` handles derived `performanceIndex`/`price`/`pricePerTB`), sets a per-row `lead` ('a'/'b'/'tie'/'none'), and tallies counted leads.
- **Show-everything behaviour (added this session):** after the configured rows it appends an info row for **every other spec key present in the data** (excluding internal plumbing like `subtype`/cpu match-keys), with friendly labels (`color`→Colour, `maxRam`→Max memory, `passmarkCpuMark`→PassMark, `releaseYear`→Release year). Then it **drops any row that is empty ("—") on both sides** — so nothing scraped is hidden and no empty placeholder shows.
- **Winner:** higher `performanceIndex`, tie-broken by lower best price then index. `scorecard` = `{ winnerSlug, tally, deltas (decisive stat gaps), tags ("best for") }`.
- **Verdict prose:** `VERDICT_PROVIDER` seam (`placeholder` | `seeded` | `claude`, default `seeded`). `shared/verdictSummary.ts` writes the deterministic sentence ("X wins N of M measured categories, leading on …"). `ClaudeVerdictProvider` is a stub for later.

`ComponentCard` renders the spec rows (hiding `performanceIndex`/`price`, which show in their own blocks), the brand image (local logo/concept render fallback — see §12), the price list, and the "OUTCLASSES" badge on the winner. The "Performance score" block is hidden when the index is 0 (non-benchmarked parts).

---

## 5. Feature: PC Builder

**Flow:** `/pc-builder` (or `/pc-builder/:shortId` for a shared build) → `PcBuilder` page. Users add one part per category via `PartPicker` (modal, server-side search + manufacturer/socket filters + sort). State is client-side until saved.

- **Compatibility** (`shared/compatibility.ts` → `CompatibilityBanner`): green/amber/red banner mirroring PCPartPicker — socket match (CPU↔board↔cooler), RAM type, GPU/cooler clearance vs case, wattage headroom, etc.
- **Wattage** (`shared/wattage.ts`): sums part draw (`tdp`/`tbp`) → `BuildSummaryBar`.
- **Build score** (`shared/buildScore.ts`): out of 100 across compatibility, budget-fit, completeness, balance. Budget-fit defaults to full marks when no budget is set (the budget input was removed this session).
- **Pricing** — two tabs:
  - _Overview:_ per-part table (Component · Selection · Availability · Price · Where · remove), with a merchant `<select>` + "Buy" link per part.
  - _Prices by merchant_ (`pricesByMerchant` in `shared/pricing.ts` → `PricesByMerchant`): each store's total is the cost of **only the parts it actually stocks** (its own quotes, never back-filled). A store that stocks the **whole** build is a real single-store checkout, ranked "Cheapest / +$diff"; partial stores show "—". (This was fixed this session — previously partial stores inherited the whole-build price.)
- **Save & share:** `POST/PATCH /api/builds` stores the build and returns a `shortId`; the page shows a copyable permalink. Save & share sits in the page header.

---

## 6. Feature: Admin back office (auth + management)

Everything under `/admin`. Public site is untouched. Design spec: `docs/superpowers/specs/2026-07-21-admin-auth-design.md`.

**Passwordless login (email OTP + RS256 JWT + RBAC):**
- **Login flow** (`AdminLogin`): enter email → `POST /api/admin/auth/request-otp` (always returns a generic 200 to prevent enumeration; sends a 6-digit code only if eligible) → enter code → `POST /api/admin/auth/verify-otp` sets cookies. Resend has a 30s cooldown. Codes are hashed at rest, 10-min TTL, ≤5 attempts, rate-limited. Dev mailer prints the code to the server console; prod sends from `AI@Automatorr.com` via SMTP.
- **Sessions:** RS256 access JWT (15-min, `sp_at` cookie) + opaque rotating refresh token (`sp_rt`, hashed in `adminsessions`). The client silently refreshes (~13-min timer + a single 401-retry in the api wrapper). Refresh-token reuse revokes the whole family (theft response). 8-hour absolute session cap → re-login.
- **Eligibility & roles:** you can sign in if your email domain is in **Allowed Domains** OR your email is in **Users**. `superadmin` = exactly the two founders (`daniel.hardman@automatorr.com`, `abishai.bajaj@automatorr.com`), auto-seeded at boot and immutable (can't be created/deleted/demoted via API). Everyone else is `admin`. Only super-admins may CRUD domains and users.
- **CSRF:** mutations require an `x-csrf` header (the api client always sends it) on top of SameSite=strict cookies.

**Management pages** (`AdminNav` tabs; the two management tabs are super-admin only, enforced server-side too):
- **Analytics** (`AdminDashboard`) — the operator dashboard (§10).
- **Allowed Domains** (`AllowedDomainsPage`) — add/edit/remove sign-in domains.
- **Users** (`AdminUsersPage`) — invite (email → always `admin`), enable/disable, remove; founders shown as `PROTECTED`.
- **Affiliate links** (`AffiliateLinksModal`, opened from the dashboard) — configure the outbound-link rewriting per store (§9).

Every access-control action is written to `adminauditlogs`.

---

## 7. Catalogue data pipeline (how parts get in)

Everything is keyed by `{category, slug}` and idempotent. Run scripts with `--workspace server`.

1. **Seed** (`npm run seed`) — loads the hand-curated `server/src/seed/data/<cat>.json` (one per category), joins UserBenchmark CSVs, computes `performanceIndex`, and also ingests the 5 builder-only categories. This is the baseline catalogue.
2. **Curation helpers** (write back into the seed JSON, then re-seed): `db3:ram`, `db7:legacy`, `curate:gated`, `curate:gpu`, `curate:ram`, `curate:storage`, `mwave:convert`, `gtins:apply`.
3. **Icecat enrichment** (`icecat:enrich`) — pulls real datasheet specs/images/GTINs for **known** parts (per-identifier, not a category lister). Only free "Open Icecat" brands resolve today — there's `ICECAT_USERNAME`/`ICECAT_API_TOKEN` but **no paid `ICECAT_APP_KEY`**, so gated brands (Corsair, AMD, Intel, WD, G.Skill…) 403 and are hand-curated instead. Manual CLI step, no scheduler.
4. **Live-store crawl** (`crawl:ple`, `crawl:scorptec`, `crawl:pccasegear`) — `decodeCrawledPart()` turns a product listing name into specs per category, then an **additive `$setOnInsert` upsert** (inserts brand-new slugs only; never overwrites curated specs). **PLE works with a plain fetch; Scorptec + PCCaseGear are JS-rendered and need `-- --render` (Playwright).** `crawl:debug` diagnoses blockers. Dry-run by default; `-- --apply` to write.
5. **Benchmark index** (`index:benchmarked`) — derives `performanceIndex` for gpu/ram/storage from specs (`normaliseIndex` pins a reference part to 1000; CPUs are scored at seed time from PassMark/UserBenchmark). GPU die specs (VRAM type / bus / shaders) were added this session — `npm run gpu:backfill` fills them onto existing GPUs.
6. **Quality gate — DB8** (`db8:audit` read-only → `db8:fix -- --apply`): detects duplicate clusters, name issues, near-empty/not-ready parts, and compatibility-coverage gaps; the fix merges dups under the **colour-only-collapse policy** (merge pure-colour variants; keep RGB/ARGB and PSU-efficiency variants distinct), renames verbose names, deletes junk, backfills cooler sockets. `catalog:check` is the seed-level CI guardrail.
7. **Nightly ingest** — `CATALOG_INGEST_CRON` (04:30) re-ingests the builder-only categories.

---

## 8. Pricing pipeline

`server/src/services/pricing/`. The `ScraperPriceProvider` runs each retailer adapter for a component (concurrency 3, per-domain 1.5s throttle, robots.txt respected, retries), producing `PriceQuote[]`.

**Retailer adapters** (`retailers/`) — only **Mwave, PLE, PCCaseGear (Algolia JSON API)** actually produce prices. Disabled (still configurable for affiliate): **Amazon** (stub → intended PA-API), **Scorptec** (Cloudflare), **Centre Com** (stub), **Umart** + **MSY** (robots.txt disallow). `AFFILIATE_ONLY_STORES = ['JB Hi-Fi']` (affiliate link, never scraped).

- `refreshAllPrices(provider, {limit?})` — for each component, fetches quotes; on error/empty it **keeps last-known prices**, on success it **replaces** the array (lowest first). Returns `{scanned, updated, keptLastKnown}`.
- **`npm run scrape`** runs it (`-- --render` for JS stores, `-- --limit N`). **`SCRAPE_CRON`** (03:15 daily) schedules it. `npm run db4:images` back-fills missing thumbnails only.

---

## 9. Affiliate system

`server/src/services/affiliate/` + `AffiliateLink` model (one doc per store).

- **Modes:** `off` (pass-through) · `tag` (append `?tag=…`, e.g. Amazon) · `wrapper` (deep-link template with `{url}`, e.g. Commission Factory / Awin `cread.php`). `applyAffiliateLink()` is a pure, fail-safe rewrite (bad config → original URL).
- **Serve-time:** `decorateComponent()` rewrites every `prices[].url` using a 5-min cached config. Applied on **all** serve paths — components, compare, builder — via `services/catalog.ts`.
- **Admin config:** `GET /api/admin/affiliates` (list all `RETAILER_STORES`) and `PUT /api/admin/affiliates/:store` (per-store upsert), driven by `AffiliateLinksModal`. All changes persist to Mongo and refresh the cache.
- Reference: `docs/affiliate-programs.md` (per-retailer program/network/join links). The affiliate gate is a **live site**, not prior sales.

---

## 10. Analytics & events

- **Capture (public, no auth):** `POST /api/events/{search,click,conversion}` → `searchevents` / `clickevents` / `conversionevents` (append-only, anonymous `sessionId`, no PII). Client helpers in `client/src/lib/session.ts` (`trackSearch`, `trackView`, `trackClick`).
- **Dashboards (super-admin):** `GET /api/admin/analytics` → KPIs (searches/views/clicks/conversions), search-volume trend, top components/comparisons/stores, per-store conversion stats, recent events. `GET /api/admin/analytics/builder` → builds over time, top parts, category usage, averages, completion rate (aggregated from `builds`).
- **Rollups:** `ROLLUP_CRON` (hourly) writes daily `trendrollups`; `npm run rollups` runs it on demand.

---

## 11. Backend API surface (all under `/api`)

- **Public content:** `GET /categories`, `GET /components` (list; `pageSize` up to 1000), `GET /components/:category/:slug`, `GET /compare?category&a&b`, `GET /verdict?…`, builder `GET /builder/categories`, builds `POST /builds`, `GET/PATCH /builds/:shortId`, `GET /builds/:shortId/by-merchant`, events `POST /events/{search,click,conversion}`, `GET /health`.
- **Admin auth (cookie):** `POST /admin/auth/{request-otp,verify-otp,refresh,logout}`, `GET /admin/auth/me`.
- **Admin management (super-admin + CSRF):** `GET/POST/PATCH/DELETE /admin/allowed-domains[/:id]`, same for `/admin/users`, `GET /admin/affiliates`, `PUT /admin/affiliates/:store`.
- **Admin analytics (auth):** `GET /admin/analytics`, `GET /admin/analytics/builder`.

Guards: `requireAuth` (RS256 cookie), `requireSuperadmin`, `requireCsrf`. Input validated with zod (`routes/schemas.ts`).

---

## 12. Frontend

- **Pages** (`client/src/pages/`): `ComparePage`, `PcBuilder`, `AdminLogin`, `AdminDashboard`, `AllowedDomainsPage`, `AdminUsersPage`.
- **Routing** (`App.tsx`): public routes + a `/admin` layout route wrapped in `AdminAuthProvider`; `/admin`, `/admin/domains`, `/admin/users` are guarded by `AuthGate` (the last two `requireSuperadmin`).
- **Auth context** (`lib/adminAuth.tsx`): `AdminAuthProvider`, `useAdminAuth`, `AuthGate` (redirect + role gate + silent refresh).
- **API client** (`lib/api.ts`): relative `/api`, `credentials:'include'`, auto `x-csrf` on admin calls, single 401-retry via refresh. All DTOs live here.
- **Images** (`lib/partImage.ts` + `Thumb`/`ComponentCard`): fallback chain = local product/logo asset → brand logo (Intel/AMD/NVIDIA) → category "concept" render (DDR5 / drive) → wireframe placeholder. External retailer photos are skipped in compare (they hotlink-block).
- **State:** TanStack Query for all server data; brand CSS tokens (`styles/`), no UI kit.

---

## 13. Configuration (env)

Key vars (see `.env.example`; secrets belong in git-ignored `server/.env`): `NODE_ENV`, `MONGODB_URI` (default `mongodb://127.0.0.1:27017/speccify`), `PORT` (4000), `CLIENT_ORIGIN`. Admin auth: `ADMIN_JWT_PRIVATE_KEY`/`ADMIN_JWT_PUBLIC_KEY` (RS256, required in prod — `npm run generate-keys`), `SUPERADMIN_EMAILS`, `MAILER_PROVIDER` (`console`|`smtp`) + `SMTP_*` + `OTP_FROM`. Provider seams: `PRICE_PROVIDER=scraper`, `VERDICT_PROVIDER=seeded`. Crons: `SCRAPE_CRON`, `ROLLUP_CRON`, `CATALOG_INGEST_CRON`. Optional data sources: `ICECAT_*`, `AMAZON_PAAPI_*`, retailer affiliate tags/feed URLs.

> The old `JWT_SECRET`/`ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` and `hash-password` script from the README are **removed** (replaced by RS256 + OTP).

---

## 14. Operational scripts (quick map, all `--workspace server`)

- **Run:** `npm run dev` (root: server+client) · `dev:demo` (in-memory Mongo, auto-seed) · `build` (shared→server→client).
- **Catalogue:** `seed`, `ingest`, `icecat:enrich`, `crawl:ple|scorptec|pccasegear` (`-- --apply [--render]`), `index:benchmarked`, `gpu:backfill`, `db8:audit`, `db8:fix -- --apply`, `catalog:check`, `curate:*`, `db3:ram`, `db7:legacy`, `gtins:apply`.
- **Pricing/images:** `scrape` (`-- --render --limit N`), `db4:images`.
- **Analytics:** `rollups`, `reseed:events`.
- **Auth/deploy:** `generate-keys`, `db:migrate-speccify` (copy `automatorr`→`speccify`).
- **Quality:** `npm test --workspace server` (vitest), `tsc --noEmit`, `eslint`.

---

## 15. Deployment

Single-VM, single-service: MongoDB (auth on, localhost-bound) + one Node process (serves `client/dist` + `/api`) + Caddy (HTTPS termination, reverse-proxy to :4000) + Namecheap DNS → the VM. Founders auto-seed at boot. **Full step-by-step in `docs/deployment-runbook.md`.** Subsystem B (Mongo TLS/auth) and C (domain/HTTPS) are covered there.

---

## 16. Known gaps, TODOs & gotchas

- **Run after data changes:** `npm run gpu:backfill` (fills GPU die specs on existing rows) and `npm run db8:fix -- --apply` (dedup/clean); restart after any `shared/` change (dist rebuild).
- **Decoder gaps:** crawled motherboards lack `maxRamSpeed`/`m2Slots` (not in listing names) → those rows now hide rather than show "—"; populating them is a decoder enhancement. GPU **boost clock** is intentionally blank (varies by factory-OC card).
- **Retailers:** only Mwave/PLE/PCCaseGear scrape; Amazon/Scorptec/Centre Com/Umart/MSY/JB Hi-Fi need affiliate **datafeeds** or PA-API (see the post-deployment backlog).
- **Icecat:** gated brands need a paid `ICECAT_APP_KEY`; otherwise hand-curate.
- **Verdict prose:** `seeded`/`placeholder` only; `claude` provider is a stub.
- **Sandbox note:** the automated test suite (`vitest`) can't run in some sandboxed environments due to a rollup native-binary/arch mismatch in `node_modules` — run it locally.
- **Post-deployment backlog** (tracked as one task): staticice.com.au price source (check terms first), PassMark-style compare visuals + energy-cost estimator, and build-vs-build comparison.
- **Branch:** work is on `feat/admin-auth`, which also carries this session's compare/builder/image polish as uncommitted changes.
