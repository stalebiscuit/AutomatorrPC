# Speccify — full database build runbook

Everything runs on **your** machine (needs MongoDB + network; the sandbox has neither).
All curation scripts are **idempotent** — safe to re-run; they skip parts already present.

## 0. Prerequisites (once)
```
npm install
npm i -D playwright --workspace server && npx playwright install chromium
# server/.env has: MONGODB_URI, ICECAT_USERNAME, ICECAT_API_TOKEN
# MongoDB running at the MONGODB_URI
```

## 1. Curate the seed files (writes server/src/seed/data/*.json)
```
npm run db7:legacy      --workspace server   # legacy CPUs, motherboards, DDR3, broaden cooler sockets
npm run db3:ram         --workspace server   # DDR5 EXPO + high-value kits
npm run curate:ram      --workspace server   # DDR4 depth (MPN-decoded, ~119)
npm run curate:gpu      --workspace server   # GPU depth (chipset-decoded, ~97)
npm run curate:storage  --workspace server   # storage depth (~138)
npm run curate:gated    --workspace server   # PSU/cooler/case flagships from names
npm run db8:fix         --workspace server -- --seed --apply   # strip any junk dup from seed (durable)
```

## 2. Seed the DB (seed JSON -> Mongo)
```
npm run seed --workspace server
```
The `no CSV match … using fallback ubRaw` lines are EXPECTED — curated parts score off their
computed fallback (same as CPUs), not the UserBenchmark CSV.

## 3. Enrich + score (Mongo)
```
npm run icecat:enrich     --workspace server    # GTIN + specs + image + colour for Open-Icecat brands
npm run index:benchmarked --workspace server    # fill performanceIndex on enriched gpu/ram/storage
npm run gtins:apply       --workspace server -- ../docs/gtin-worklist.csv --db   # CPU GTINs (optional)
```

## 4. QA / dedupe / clean (Mongo)
```
npm run db8:fix --workspace server               # DRY RUN — preview merges/deletes/renames
npm run db8:fix --workspace server -- --apply    # execute
```

## 5. Product images (Mongo, needs Playwright)
```
npm run db4:images --workspace server -- --render 20          # dry run, sample the hit rate
npm run db4:images --workspace server -- --render --apply     # full run (~15-25 min)
```
Now with a match-confidence guard: a store's image is only used when its result title matches
the part, so mismatched/sibling photos fall back to the Tier-1 category placeholder.

## 6. Verify
```
npm run catalog:check --workspace server         # specs + coverage CI gate (also usable in CI)
npm run db8:audit     --workspace server          # live-catalogue health (0 high dups expected)
```

## Notes
- Re-run order for a refresh after editing seeds: step 2 → 3 → 4 → 5 (enrichment/images live in
  Mongo, so they must be re-applied after any `npm run seed`).
- The Mwave snapshot is DDR4-era (no DDR5 MPNs), so `curate:ram` fills DDR4; DDR5 comes from `db3:ram`.
- GPU/storage curation caps for diversity (2 board partners per chipset/VRAM; per-brand storage cap),
  so it adds a representative set rather than thousands of near-duplicates.
