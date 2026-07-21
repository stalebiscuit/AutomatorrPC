# Task 3 — Real catalogue data + live ingestion source

**Goal:** replace the sample seed data with a real, maintained catalogue that auto-updates as parts launch — the "clean catalogue + compatibility graph = ~80% of the product" foundation both the builder and the future AI agent depend on.

**Builds on (already in the repo):** the ingestion scaffold (`services/catalog/ingest.ts` — `SpecSource` interface, `DatasetSpecSource`, `ingestBuilderCatalog`, EOL-candidate reporting), `ingestScheduler.ts` + `npm run ingest`, the retailer adapters (`services/pricing/retailers/*` — Mwave/Scorptec HTML, Amazon PA-API stub, PLE/PCCG unregistered), `robots.ts`, `p-limit` rate-limiting, and `Component.provenance`.

> **Approval gate.** Plan only — no ingestion code ships against a paid/live source until Dan approves the Phase 0 choices.

---

## 0. Decisions (confirmed 2026-07-14)

| Decision | Default | Why |
|---|---|---|
| **Spec source** | **Icecat Open (free) primary + curated CPU overlay** (re-confirmed 2026-07-15) — enrich via the Icecat JSON API for component brands; hand-curate CPUs. | Verified free API access for MSI/component-brand parts (GPU/mobo/RAM/PSU/case/cooler/monitor). Only CPU chip brands (AMD/Intel) are Full-restricted → curate the small CPU set in `cpu.json`. Parts carry GTINs → exact join key with retailer feeds (no fuzzy matching). Correction of the earlier over-pessimistic curated-only pivot. |
| **Performance index** | **PassMark** (CPU/GPU marks), migrating off UserBenchmark | Clean single mark per part, broad coverage, neutral reputation. Keep UB as fallback until wired; add a game-benchmark source later for FPS claims. |
| **Retailer coverage** | **6 stores** — Amazon (PA-API) + Mwave + Scorptec + Centre Com + PLE + PCCG | Closer to PCPartPicker AU coverage. Mwave/Scorptec adapters exist; PLE/PCCG adapters exist but are unregistered; Centre Com is new. Amazon via PA-API (no scraping). |

These are the only choices that change the build shape; everything else follows.

---

## 1. Objective & non-goals

**Objective.** A canonical, current catalogue across all 10 categories with reliable compatibility fields, live AU prices/stock attached from real retailers, refreshed on a schedule, with new parts ingested automatically.

**Non-goals.** Scraping PCPartPicker (no public API, ToS-forbidden — we source our own); a bespoke ML entity-resolution system (the matcher starts heuristic); non-AU regions.

---

## 2. Architecture (three data streams, one canonical catalogue)

The core insight from the earlier discussion: **retailers tell you what you can sell and for how much; a spec source gives you the compatibility graph; a matcher ties them together on a canonical identity.**

1. **Canonical catalogue** — the single `Component` collection remains the source of truth. Each part has a **canonical identity** (§3) and validated compatibility fields (§4). This is authored from the spec source, not from retailer listings.
2. **Spec ingestion** (`SpecSource`) — pulls structured specs from Icecat (+ manufacturer gaps), normalizes into `Component`, keyed by canonical identity. Refreshed weekly (`CATALOG_INGEST_CRON`).
3. **Price/stock ingestion** (retailer adapters) — pulls live prices/stock, then the **matcher** (§5) maps each retailer listing onto a canonical part and attaches the quote to `Component.prices`. Refreshed daily+ (`SCRAPE_CRON`).

The builder and agent read only the canonical catalogue, so they never see duplicate or mismatched parts.

## 3. Canonical identity

A deterministic key so the same part from any source resolves to one record:
`canonicalKey = category + ':' + normalize(brand) + ':' + normalize(model)`, where `normalize` lowercases, strips punctuation/whitespace, unifies known synonyms (e.g. "GeForce RTX 4070" ↔ "RTX 4070", "AMD Ryzen 5 7600X" ↔ "ryzen5 7600x"), and drops retailer fluff ("6-Core Processor", "Graphics Card", box/bundle suffixes). The existing `slug` becomes the canonical id. A small **synonym/alias table** handles the messy cases the normalizer misses.

## 4. Canonical spec schema (per category)

Formalize the required compatibility fields (already prototyped in Track 0/A) as a validated contract, and **gate a part out of the builder if a critical field is missing** (e.g. CPU/mobo `socket`, mobo/case `formFactor`, GPU `length`, PSU `wattage`). Missing-but-non-critical fields are recorded in `provenance.unknownFields` rather than guessed (existing convention).

## 5. The matcher (the hard part)

Maps a retailer listing → canonical part:
1. **Exact** canonical-key match after normalization.
2. **Fuzzy** fallback — token-set similarity (brand must match; model tokens scored) with a **confidence threshold**; above → auto-attach, below → **manual-review queue**.
3. **Alias table** — persistent overrides for confirmed matches/misses so a listing only needs resolving once.
Pure, deterministic, and unit-testable without a DB (runs in-sandbox).

---

## 5a. Icecat field-map tuning — DONE (2026-07-15)

All category FEATURE_MAPs now use Icecat's **verified real field names** (reconned against live MSI/Kingston/Samsung parts), e.g. motherboard socket="Processor socket", ramType="Supported memory types", formFactor="Motherboard form factor"; PSU wattage="Total power", efficiency="Efficiency", modular="Cabling type"; case maxGpuLength="Maximum graphics card length", maxCoolerHeight="Maximum CPU cooler height", formFactorSupport="Supported motherboard form factors"; cooler type="Type", socketSupport="Supported processor sockets"; RAM type="Internal memory type", speed="Memory data transfer rate"; storage capacity="SSD capacity", formFactor="SSD form factor"; monitor resolution="Display resolution", refresh="Maximum refresh rate", size="Display diagonal". Added value-normalization for socket ("Socket AM5"→"AM5") and cooler type (Liquid→aio/Air→air). Brand coverage is per-brand (Kingston RAM free; Corsair RAM Full-gated) — the enrich report surfaces gated parts.

**Known refinements (non-blocking):** derive cooler radiatorSize from "Radiator width"; infer storage subtype (ssd/hdd) from interface/NVMe; capture GPU power via "Minimum system power supply" (no direct TBP) for the wattage estimator.

## 5d. CPU performance from PassMark + naming fix (2026-07-15)

- **Real benchmark index:** CPU `performanceIndex` now comes from **PassMark CPU Mark** (pulled live for all 79), replacing the estimated values. Pre-scaled so Intel Core i5-13600K (37,481) pins to index 1000 — keeping `scoring.ts` REFERENCES.cpu (122) valid, no scoring/compare test changes. Raw score kept in `specs.passmarkCpuMark`. `seed.ts` no longer uses the UB CSV for CPUs (`csvTypesFor('cpu')` → []; ubSource = passmark); `seed.test.ts` updated accordingly. Sample indices: 14900K 1555, 9950X3D 1871, 7800X3D 915, 3600 471.
- **Naming fix:** CPU names/slugs are now brand-prefixed ("AMD Ryzen 7 7800X3D" / "intel-core-i9-14900k"), matching the rest of the catalogue and overwriting the original entries. NOTE: seed is upsert-only, so the earlier brand-less CPU docs are orphans — **drop the `components` collection and re-seed** for a clean catalogue.

## 5c. CPU dataset — expanded + verified (2026-07-15)

`cpu.json` expanded to **79 desktop CPUs (2020→)**: AMD Ryzen 3000/5000/7000/9000 + 5000G/8000G APUs (AM4/AM5), Intel 10th–14th gen + Core Ultra 200S (LGA1200/1700/1851). Socket spread: AM4 ×22, AM5 ×21, LGA1700 ×20, LGA1200 ×13, LGA1851 ×3. All builder-ready. Compatibility fields (socket/cores/threads/TDP/iGPU) cross-referenced against Wikipedia's processor lists; the AM5 Ryzen 9000 + 8000G specs were **verified exact** against the authoritative table. `performanceIndex` still provisional → replaced with real PassMark data in Step 2. `releaseYear` added per CPU.

## 5b. CPU overlay — DONE (2026-07-15)

Curated `cpu.json` = **39 current CPUs**, all builder-ready: AMD Zen 3/4/5 (Ryzen 5000/7000/9000) + Intel 12th–14th gen + Core Ultra 200S. Socket coverage: AM5 ×17, LGA 1700 ×12, AM4 ×7, LGA 1851 ×3. Compatibility fields (socket/cores/threads/TDP/iGPU) authoritative; clocks/L3 accurate; performanceIndex provisional (curated `fallbackUbRaw`, tunable). Prices intentionally empty — they come from the pricing pipeline (scraper / retailer feeds). **Coverage note:** AM4 + LGA 1851 CPUs need matching motherboards added (current mobo seed is AM5 + LGA 1700) for complete builds.

**To load locally:** `npm run seed` (loads the 39 CPUs + component seeds), then optionally `npm run scrape` to populate AU prices.

**Task 3 status:** Step 1 (field-map tuning) ✓, Step 3 (CPU overlay) ✓. Only Step 2 (retailer-feed → GTIN ingestion) remains — blocked on affiliate feed access.

## 5e. Lean component data contract (2026-07-15)

Per Dan: store **only builder-relevant fields** per component (+ a couple of display bonuses); **OS removed** as a category. Categories now: cpu, cooler, motherboard, ram, storage, gpu, case, psu, monitor (9). The normalizer maps a defined set into `specs` and discards everything else Icecat returns (marketing text, galleries, reviews, packaging). Needed fields drive compatibility/wattage/score/display; bonuses kept per category (e.g. GPU HDMI/DP counts, storage read/write, PSU PCIe connectors, cooler noise). Dropped GPU fluff: colour, max resolution, memory bus, CUDA cores, fans, gpu family. All 134 seed parts builder-ready.

**Note on catalogue volume:** the lean contract is set; scaling the *number* of parts to a full buyable catalogue is the retailer-feed → GTIN pipeline (bulk-scraping Icecat is rate-limited/ToS-bound — confirmed a 429). Re-load locally with `npm run db:reset && npm run seed && npm run icecat:enrich`.

## 6. Phases & acceptance criteria

**Phase 0 — Decisions.** DONE (§0).

**Phase 1 — Canonical catalogue + real spec ingestion.**
Canonical identity module (§3) + alias table; canonical spec schema per category (§4) with validation and builder-gating; `IcecatSpecSource` (API client + taxonomy→our-fields map) plus a manual curation layer for enthusiast gaps; PassMark performance index integrated (replaces the UB source); ingestion expanded to all 10 categories.
*Acceptance:* `npm run ingest` populates real specs with canonical slugs; parts missing a critical field are flagged and gated out; `performanceIndex` comes from PassMark.

**Retailer status (recon 2026-07-14).** Registry now holds all 6: **Mwave, Scorptec, PLE, PCCaseGear** have working fixture-tested HTML adapters; **Amazon** is a stub pending PA-API (§0); **Centre Com** is a stub pending work — its site uses a **client-side instant-search** (the `/search` and `/catalogsearch/result/` endpoints 404), so it needs its search API reverse-engineered rather than a plain HTML scrape.

**Phase 2 — Price/stock + matcher across 6 retailers.**
Register PLE/PCCG adapters, add a Centre Com adapter, keep Amazon PA-API + Mwave + Scorptec; build the matcher (§5); attach matched quotes to `Component.prices` with stock flags and affiliate-tagged Buy URLs.
*Acceptance:* prices from the available retailers attach to canonical parts; by-merchant view populated; unmatched listings surfaced to a review queue.

**Icecat integration status (built 2026-07-14).** `services/catalog/icecat/` — `IcecatClient` (Live JSON API), a normalizer mapping `FeaturesGroups` → our spec schema (typed coercion), and `IcecatSpecSource.enrich()/enrichMany()` + `upsertIcecatParts()`. Config reads `ICECAT_USERNAME`/`ICECAT_API_TOKEN`. Note Icecat is **per-identifier** (1 request = 1 product), so it *enriches known parts* — the next step is a seed list of identifiers (GTIN / brand+MPN) or a CLI to enrich, plus two refinements once real responses are seen: trim socket values ("Socket AM5" → "AM5") and curate enthusiast fields Icecat omits (GPU length, cooler height, radiator/QVL).

**Phase 3 — Dedup, EOL & data quality.**
EOL flagging (gone from all sources), duplicate-canonical merge, a data-quality gate, and an admin coverage/quality view (extends the existing ingest reporting).

**Phase 4 — Automation & monitoring.**
Crons: specs weekly, prices daily+, new-launch detection; alerts on ingest failure or coverage drop. This delivers "auto-update as parts launch."

## 7. Legal / ToS guardrails
Amazon via PA-API only (no scraping). Icecat via its licensed API. Retailer scrapes respect `robots.txt` (`robots.ts`), rate limits (`p-limit`), and an identifying UA (`SCRAPE_USER_AGENT`). Affiliate enrollment per store; affiliate tags + API keys in env config, never committed.

## 8. Built (reuse) vs new
**Reuse:** ingestion scaffold + scheduler + `npm run ingest`; Mwave/Scorptec adapters + Amazon PA-API seam + PLE/PCCG adapters (unregistered); `robots.ts`; `p-limit`; `provenance`; shared pricing/by-merchant.
**New:** canonical identity + alias table; canonical spec schema/validator + builder-gating; `IcecatSpecSource` + taxonomy map; PassMark index source; the matcher + manual-review queue; Centre Com adapter + register PLE/PCCG; EOL/dedup/quality + admin view; affiliate tagging.

## 9. Testing
**Pure / in-sandbox:** canonical normalizer, matcher (fixtures of real retailer titles → expected canonical), spec validator/gating, PassMark name mapping. **Fixture-driven:** Centre Com adapter (existing `tests/fixtures/*.html` pattern). **Live APIs** (Icecat, PA-API) behind config, run on Dan's machine with keys.

## 10. Risks & open questions
- Icecat free-tier coverage gaps → curation layer; full coverage may need a subscription.
- Enthusiast fields (GPU length, cooler height, radiator support, RAM QVL) may be absent in Icecat → curate those critical fields manually; gate parts that lack them out of the builder.
- Matcher false positives → confidence threshold + manual-review queue + alias table.
- Icecat/PassMark commercial-use licensing → confirm before production.
- Credentials (Icecat key, Amazon PA-API, affiliate tags) → Dan provisions; env config, never committed.

## 11. Task breakdown (build order)
1. Canonical identity + alias table (pure) + tests.
2. Canonical spec schema per category + validator + builder-gating.
3. `IcecatSpecSource` (API client + taxonomy map) + env config; expand ingest to all 10 categories.
4. PassMark index source; migrate `performanceIndex`.
5. Matcher (pure) + tests; manual-review-queue model.
6. Retailer coverage: register PLE/PCCG, add Centre Com adapter (+ fixture test).
7. Wire price/stock ingestion → matcher → `Component.prices`; affiliate tagging.
8. EOL / dedup / quality + admin view.
9. Automation crons + monitoring.

## 12. Immediate next step
Steps 1 and 5 (canonical identity + matcher) are pure and testable in-sandbox with no external dependency — the right place to start. The live-API steps (Icecat, PA-API, PassMark, affiliate tags) need credentials you provision and run on your machine.
