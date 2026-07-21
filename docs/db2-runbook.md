# DB-2 → DB-4 Runbook — populate GTINs, specs, images, colours

_Everything here runs on **your** machine (it needs internet to Icecat + a running MongoDB — the sandbox has neither). The pipeline, validator and tests are built and green; these are the commands to feed it real data._

## Prerequisites
- MongoDB running, and `server/.env` has `MONGODB_URI`, `ICECAT_USERNAME`, `ICECAT_API_TOKEN` (all present).
- `npm install` done.

## Two acquisition paths (by brand)

| Parts | Path | Why |
|---|---|---|
| **Component brands** — GPU (AIB cards), motherboard, RAM, storage, PSU, case, cooler, monitor | **Icecat enrich** by Brand + MPN | Open Icecat (free) covers these — one call returns **GTIN + specs + image + colour** |
| **CPUs** (AMD/Intel) | **GTIN worklist** | AMD/Intel are Full-Icecat-gated (paid); source GTINs from retailer/manufacturer pages into the worklist, specs stay curated |

## Commands

**1. Enrich component-brand parts from Icecat** (fills GTIN + specs + image + colour into the DB):
```
npm run icecat:enrich --workspace server
```
Reads `server/src/seed/icecat-seeds.json` — one entry per part: `{ category, id: { brand, productCode } }` (productCode = MPN). Add parts to that file to grow coverage. It prints ✓/✗ per seed so you can see what resolved.

**2. Apply CPU GTINs from the worklist** (validates every barcode, writes to seed JSON + DB):
```
npm run gtins:apply --workspace server -- ../docs/gtin-worklist.csv --db
```
Fill the `gtin` column in `docs/gtin-worklist.csv` first (CPU rows). Invalid check-digits are rejected and reported — nothing bad enters the catalogue.

**3. Verify what's populated:**
```
npm run catalog:check --workspace server   # builderReady + missing-critical report per category
```

## What's already seeded to prove the flow
- `icecat-seeds.json` — 9 verified enrichable parts (incl. Corsair RM750e `CP-9020262-NA`). Run command 1 and they populate.
- `gtin-worklist.csv` — Intel Core i9-14900K GTIN `735858546966` (verified). Run command 2 and it applies.

## Scaling MPN/GTIN acquisition (to reach all ~676 parts)
The only remaining input is the **Brand+MPN** list (components) and the **CPU GTINs**. Fastest sources:
- **PCPartPicker product pages** list the MPN in the title (e.g. "…(CP-9020262-NA)") — copy into `icecat-seeds.json`.
- **Manufacturer spec pages / retailer listings** show MPN + often the UPC/EAN (GTIN) — CPUs go to the worklist.
- **I can keep web-searching MPNs in batches** and appending to `icecat-seeds.json` / the worklist — just say "next batch".

## Known nuance (flagged for DB-8)
Icecat enrich keys the upsert on `category + slug` derived from the Icecat product name, which may differ from a curated entry's slug — so an enriched part can land as a *new* record beside a curated one. The canonical-key matcher/dedupe (DB-8) reconciles these. For a clean run, prefer enriching net-new parts, or align the curated slug to the Icecat name.
