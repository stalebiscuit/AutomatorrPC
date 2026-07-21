# PC Builder v1 — implementation notes & local-run handoff

Built against the plan in `pc-builder-implementation-plan.md`. Everything below compiles
(`npm run build` clean), lints clean (`npm run lint`), and the pure-logic suites pass
(19 shared + 22 server = 41 tests). The DB-backed and UI parts must be run on your machine —
the sandbox can't run MongoDB.

## What was built (by track)

**Track 0 — shared foundations** (`shared/src/`)
- `types.ts` — added `BUILDER_CATEGORIES` (10), `BuilderCategory`, `isComparableCategory`,
  `BUILDER_CATEGORY_META`, and the build domain types (`Build`, `BuildItem`, `ResolvedBuild`,
  `Violation`, `CompatibilityResult`, `WattageEstimate`, `BuildScoreResult`, `PartFilters`,
  `PartListResult`, `MerchantTotal`, `BuildSummary`). `Component.category` widened to `BuilderCategory`.
- `specUtil.ts` — defensive spec readers (`num`/`str`/`csv`/`moduleCount`); list specs are CSV strings.
- `compatibility.ts` — `checkCompatibility(build)` → the v1 core rules (§6.1).
- `wattage.ts` — `estimateWattage` / `recommendPsu` / `wattageEstimate`.
- `pricing.ts` — `bestPrice` / `buildTotal` / `pricesByMerchant`.
- `buildScore.ts` — `scoreBuild(build, {budget})` → /100 with breakdown.
- Tests: `shared/tests/*` (fixtures + 4 suites). Run: `npm run test --workspace shared`.

**Track A — catalogue + ingestion** (`server/src/`)
- `Component` model enum widened to 10 categories (single shared collection — both tools read it).
- Seed data for the 6 new categories: `seed/data/{cooler,motherboard,case,psu,os,monitor}.json`
  (sockets/form-factors matched to the existing CPUs/GPUs so a default build is compatible).
- `seed/builderSeedData.ts` — loader/schema for non-benchmarked parts.
- `services/catalog/ingest.ts` — the ingestion pipeline: `SpecSource` interface + `DatasetSpecSource`,
  `ingestBuilderCatalog()` (upsert + EOL-candidate reporting). Swap the source for a live feed later.
- `services/catalog/ingestScheduler.ts` + `runIngest.ts` — cron (`CATALOG_INGEST_CRON`) + `npm run ingest`.
- `seed/seed.ts` now seeds benchmarked 4 **and** ingests builder 6.

**Track B — server build domain** (`server/src/`)
- `models/Build.ts` — `Build` collection (nanoid-style `shortId` permalink; references catalogue by slug).
- `services/builder/builds.ts` — create/update/get, `resolveBuild` (hallucination guard: only DB SKUs),
  `summarizeBuild` (compat + wattage + total + score), `merchantBreakdown`.
- `routes/builds.ts` — `POST /api/builds`, `GET /api/builds/:shortId`, `PATCH /api/builds/:shortId`,
  `GET /api/builds/:shortId/by-merchant`.
- `routes/components.ts` + `services/catalog.ts` — `GET /api/components` now takes
  `manufacturer/priceMin/priceMax/sort/page/pageSize` for the picker (compatible with compare's usage).
- `routes/categories.ts` — added `GET /api/builder/categories`.

**Track C — client** (`client/src/`)
- `pages/PcBuilder.tsx` — the `/pc-builder` (+ `/pc-builder/:shortId`) page. Computes
  compatibility/wattage/total/score **client-side** via the shared modules for instant feedback;
  hits the server for the catalogue and to persist/share.
- `components/builder/` — `PartPicker` (modal, filters), `CompatibilityBanner`, `BuildSummaryBar`,
  `PricesByMerchant`. `lib/format.ts` helpers. `styles/builder.css`.
- `App.tsx` registers both `/pc-builder` and `/pc-builder/:shortId` (permalink hydration).

## Run it locally

```bash
cd AutomatorrPC
cp .env.example .env            # set MONGODB_URI etc. (see config.ts)
npm install
npm run build                   # typecheck all workspaces
npm run seed                    # seeds 35 benchmarked parts + ingests 37 builder parts
npm run dev                     # server (4000) + client (5173)
# open http://localhost:5173/pc-builder
npm run ingest                  # (re)run the catalogue ingestion pipeline on demand
```

## Verify

- Pure logic (works anywhere): `npm run test --workspace shared` and
  `npx vitest run tests/scoring.test.ts tests/compare.test.ts tests/seams.test.ts` (server).
- DB/route + e2e (need Mongo, run locally): `npm run test --workspace server`, `npm run e2e --workspace client`.
- Acceptance smoke: build CPU→PSU; deliberately pair an AM5 CPU with an LGA1700 board (red block);
  pick a 550 W PSU with a 350 W GPU (amber headroom warning); Save & share → open the permalink.

## Remaining / v1.x follow-ups

1. **Per-row merchant override** ("Where" dropdown) — v1 shows the auto-cheapest; overriding is v1.x.
2. **Picker spec filters** — v1 has search/manufacturer/price/sort; per-category spec facets are v2.
3. **Catalogue refresh** — the ingestion pipeline currently reads the bundled dataset; point
   `SpecSource` at a live spec/retailer feed for "auto-update on launch" (plan §4.1.1, §14.1).
4. **Deeper compatibility** (QVL, PCIe lanes, connectors), accounts/named lists, affiliate conversion
   tracker — all v2 (plan §6.2, §11).
