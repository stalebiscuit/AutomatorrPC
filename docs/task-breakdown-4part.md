# Automatorr — 4-Part Engineering Task Breakdown

_Prepared as a senior-manager review of the current `AutomatorrPC` codebase (branch `build/automatorr-compare`). Every finding below was verified against the source, not the running site — Claude in Chrome is offline, so items marked **[verify on site]** need Scott to confirm the live behaviour._

**Legend:** 🐞 confirmed bug · 🔍 investigation/answer · 🛠 feature build · ✅ QA/validation · 🎨 design

---

## Task 1 — PC Builder Section

Files that own this area: `client/src/pages/PcBuilder.tsx`, `client/src/components/builder/*`, `shared/src/{compatibility,wattage,buildScore,pricing}.ts`, `server/src/services/builder/builds.ts`, `server/src/services/catalog.ts`.

### 1.1 🔍 Clarify the purpose of the budget field
The "Budget (AUD)" input feeds one thing only: the **budget-fit sub-score** inside `scoreBuild()` (`shared/src/buildScore.ts`, weight 25/100). It does **not** filter parts, cap the picker, or warn on overspend beyond the score note. Behaviour today: if `total > budget` the score is penalised proportionally ("Over budget by $X"); if under budget the score rewards higher budget utilisation (`0.6 + 0.4 × utilisation`). **Decision needed:** keep it purely as a scoring input, or promote it to an active constraint (filter the picker by remaining budget, colour the total red when over). Recommend documenting it in-UI with a tooltip either way.

### 1.2 🔍 Audit each control in the builder
- **Overview vs "Prices by merchant" tabs** — Overview = cheapest-quote-per-part (you buy each part wherever it's cheapest, i.e. multiple orders). "Prices by merchant" (`pricesByMerchant()` in `shared/src/pricing.ts`) = the total if you bought **everything from one store**, with a "+$ vs cheapest" column. **Its value: single-checkout convenience** (one shipping fee, one warranty contact) vs the absolute-cheapest split cart. This is the standard PCPartPicker feature and is worth keeping — but the UI must label _why_ (add a one-line caption: "buy the whole build from one store"). **[verify on site]** confirm the caption is missing.
- **"+ Choose [part]" button** — opens the `PartPicker` modal for that category. Works as intended.
- **Manufacturer input (in `PartPicker.tsx`)** — **it matters but is near-broken.** `catalog.ts` matches it with an _anchored, exact_ regex (`^asus$`), so "asus" works, "asu" or "ASUS ROG" returns nothing. Meanwhile the search box already matches name **and** brand. **Action:** either make manufacturer a `contains` match / dropdown of known brands, or remove it as redundant with search. Recommend a brand **dropdown** populated from the catalogue.
- **Sort options** (`performance`, `priceAsc`, `priceDesc`, `name`) — "Performance" sorts by `performanceIndex`, which is **only meaningful for cpu/gpu/ram/storage**. For cooler/case/psu/motherboard/monitor the index is ~0, so "Performance" silently degrades to an arbitrary order. **Action:** hide or relabel the "Performance" sort for non-benchmarked categories (default those to price or name).
- **Name/selection column** — see 1.3.

### 1.3 🐞 Fix the part naming scheme
**Root cause (verified):** two compounding issues.
1. **Ingested names.** `server/src/services/catalog/icecat/normalize.ts` (line ~157) builds the name as `Brand + ProductName`, but **falls back to Icecat's `Title`** when `ProductName` is absent. `Title` is the full marketing string — that's exactly Scott's example (`MSI MAG CORELIQUID 360R CPU AIO Cooler ' 360mm Radiator, 3x 120mm ARGB PWM Fan…`). The hand-authored seed data (`server/src/seed/data/*.json`) is clean; **the mess only enters through the Icecat pipeline.**
2. **Spec summary.** In `PartPicker.tsx`, `specSummary()` appends the raw spec values, and for coolers `socketSupport` is a giant CSV (`LGA 1150 (Socket H3),LGA 1151…`) that renders in full (the `aio · 32 · LGA 1150(…)` tail).

**Fix:**
- In `normalize.ts`, never fall back to `Title`; if `ProductName` is missing, derive a short name (`Brand + ProductCode/model tokens`) or flag the record for curation instead of storing the marketing blob.
- Add a `cleanName()` pass (strip trailing description after the model, cap length).
- In `specSummary()`, truncate list-type specs (show first 2 + "…", or a socket count like "6 sockets") rather than the whole CSV.
- Backfill: re-run the ingest/normalise over existing DB rows or write a one-off cleanup script.

### 1.4 🛠 Add a "socket needed" filter to the picker
Today `PartPicker` filters only by search/manufacturer/sort — there is **no spec filter**. Add a socket selector (and ideally a generic spec-filter slot) so a user with an AM5 board only sees AM5 CPUs/coolers. Requires: (a) a `socket` query param on `PartFilters` + `listComponents()` in `catalog.ts`, (b) a dropdown in `PartPicker` populated from distinct socket values, (c) ideally auto-prefill from the already-selected CPU/motherboard so the picker is context-aware.

### 1.5 🐞 Fix the CPU↔cooler socket incompatibility false positive
**Confirmed against the DB — this is a string-format mismatch, not a real incompatibility.**
- CPU/motherboard sockets are stored **with a space**: `"LGA 1700"`, `"LGA 1200"`, `"AM5"`, `"AM4"`, `"LGA 1851"` (`server/src/seed/data/cpu.json`, `motherboard.json`).
- Cooler `socketSupport` is stored **without spaces**: `"AM5,AM4,LGA1700,LGA1851,LGA1200"` (`cooler.json`).
- Rule 2 in `shared/src/compatibility.ts` (`cooler-cpu-socket`) uses `csvIncludes()` = **exact** case-insensitive equality. `"LGA 1700" !== "LGA1700"`, so **every Intel CPU is falsely flagged incompatible with every cooler.** (AMD sockets happen to match, so they pass — matching Scott's "CPUs always say incompatibility.")

**Fix:** normalise both sides before comparing — strip non-alphanumerics/spaces and uppercase (`"LGA 1700" → "LGA1700"`) in the socket comparison (apply the same normalisation to rule 1 for safety). Add a unit test with the real seed values. This is a one-function fix with high user impact.

### 1.6 🐞 Fix estimated wattage showing 30 W on an empty build
**Confirmed.** `estimateWattage()` in `shared/src/wattage.ts` seeds `w = WATTAGE_OVERHEAD.baseline` (30) unconditionally, so an empty build reports 30 W. **Fix:** return `0` when `build.length === 0` (guard at the top of `estimateWattage`). Keep the 30 W baseline only once at least one part is present. Add a test for the empty-build case.

### 1.7 🐞/🔍 "Remove 'choose OS' section"
**There is no OS section anywhere in this branch** — no `os` entry in `BUILDER_CATEGORY_META`, no "choose OS"/"operating system" string in `client`, `server`, or `shared`. So either it was already removed, or the live site is running an **older build**. **Action:** **[verify on site]** — if it still appears live, redeploy from this branch; if it's genuinely still in code, point me at the exact screen/string and I'll remove it. No code change is needed against the current source.

### 1.8 ✅ Validate the /100 build score
`scoreBuild()` (`shared/src/buildScore.ts`) blends compatibility (40), budget fit (25), completeness (20), balance (15); any hard incompatibility caps the total at 40, and quality sub-scores are scaled by build completeness. **Validation plan:** (a) build 3–4 reference configs (a clean mid-range, an over-budget one, a CPU/GPU-imbalanced one, an incompatible one), (b) paste the same parts + specs into a fresh Claude chat and ask for a 0–100 rating with rationale, (c) compare deltas and check the weighting feels right. **Second, code-level check:** add golden-value unit tests asserting expected scores for fixed builds so the formula can't drift silently. **Note:** score is deterministic, so the "verify" here is about whether the _weights_ match expectations, not correctness of arithmetic.

### 1.9 ✅ Test save & share — how/where it's stored
**Verified.** Save (`PcBuilder.tsx` → `api.createBuild/updateBuild` → `server/src/routes/builds.ts` → `services/builder/builds.ts`) persists the build to **MongoDB** (`BuildModel`) as `{ shortId, budget, items[] }`, where each item is `{category, slug, chosenStore}` — **only references are stored, not prices/specs**, so a shared build always reflects live catalogue data. Sharing = an 8-char base62 `shortId` permalink (`/pc-builder/:shortId`), rehydrated via `GET /builds/:shortId`. **No auth** — anyone with the link can view (and the PATCH endpoint lets anyone with the id edit). **Actions to test/decide:** confirm round-trip (save → reload URL → identical build), decide whether builds should be immutable once shared or owner-locked, and add a "not found / expired" state for bad ids.

---

## Task 2 — Compare Components

Files: `server/src/services/{compareConfig,compare,categoriesMeta}.ts`, `shared/src/types.ts` (`CATEGORIES`), `client/src/pages/ComparePage.tsx`, `client/src/components/{CompareResults,PriceList,ComponentPicker}.tsx`.

### 2.1 🛠 Add the missing categories (cooler, case, monitor, psu)
**Confirmed scope.** The compare tool is hard-limited to **four** categories: `CATEGORIES = ['cpu','gpu','ram','storage']` (`shared/src/types.ts`), mirrored in `COMPARE_CONFIGS` and `CATEGORY_META`. The builder already carries all nine categories with data. To add the four missing ones:
1. Extend the comparable set (widen `CATEGORIES`, or add a separate "comparable-but-not-benchmarked" tier so `performanceIndex` isn't assumed).
2. Add `COMPARE_CONFIGS` entries for cooler/case/monitor/psu with their comparable fields (see 2.2).
3. Add `CATEGORY_META` entries (label + blurb).
4. Handle the "best for" tag logic and the winner/verdict path for non-benchmarked categories (no UB index — verdict must lean on the counted fields, not the performance index).
5. Confirm each category has enough clean spec coverage in the DB to compare (`isBuilderReady`/`validateSpecs` already exist to gate).

### 2.2 🛠 Add dynamic per-category comparison metrics
Because coolers/cases/psus/monitors have no benchmark index, define **meaningful counted fields** per category, e.g.:
- **PSU:** wattage (↑), efficiency rating (80+ tier), modular (y/n), form factor.
- **Cooler:** type (air/AIO), TDP rating (↑), height/radiator size, noise dB (↓).
- **Monitor:** refresh Hz (↑), resolution, size, panel type, response time (↓).
- **Case:** max GPU length (↑), max cooler height (↑), supported form factors, radiator support.

Encode these in `COMPARE_CONFIGS` with `direction`, `numeric`, `counted`, `deltaFormat` — the compare engine (`compare.ts`) is already fully config-driven, so this is mostly data entry plus verifying the field values exist in the catalogue.

### 2.3 🔍/🛠 Confirm prices are accurate with working per-product links
**Important finding:** the hand-authored seed catalogue currently ships with **`prices: []` and no `gtin`** on components (verified in `cpu.json` etc.). Live prices are meant to arrive via the scraper/affiliate-feed pipeline (see `somethind.md` / `docs/task3-affiliate-feeds-guide.md`), which is **not yet connected** (no feed credentials filled in). So "verify the links go to the exact product" can't be fully closed until at least one feed is live. Sub-steps:
- Store the **GTIN** on the `Component` model (it's the Icecat ingest key but isn't persisted today) so retailer deep-links can be built/verified per product.
- Stand up one affiliate feed end-to-end (Commission Factory → Mwave is the recommended first, per the guide) to populate real `PriceQuote.url`s.
- Add a link-check step (each `prices[].url` resolves 200 and the GTIN on the landing page matches). **[verify on site]** once feeds exist.

### 2.4 🎨 Redesign the comparison view (less scrolling)
Deliver visual mockups for a more compact head-to-head: a sticky two-column header, collapsible spec groups, "differences only" toggle, and a summary card up top so the verdict is visible without scrolling. Produce 2–3 mockup options (static HTML/SVG) for Scott to pick before implementing against `CompareResults.tsx`.

---

## Task 3 — Analytical Dashboard

Files: `server/src/services/analytics.ts`, `client/src/pages/AdminDashboard.tsx`, `client/src/components/{RecentEvents,TopList,TrendChart}.tsx`, models `ClickEvent`, `SearchEvent`, `BuildModel`.

### 3.1 🛠 Add click-vs-conversion tracking to "Top stores by clicks"
Today only **clicks** are captured (`ClickEventModel`); there is no purchase/conversion event. To show click→sale conversion next to each store:
1. Add a `ConversionEvent` model (store, componentId, url/orderRef, ts) and an endpoint to record it — wired to the future affiliate postback/return URL (ties into the affiliate work in `somethind.md`).
2. Extend `getAnalytics()` to aggregate conversions per store and compute a conversion % (`conversions / clicks`).
3. Add a **selectable toggle** in the "Top stores by clicks" panel (clicks | conversions | conversion-rate). This is a build-ahead: the tracker is stubbed until affiliate postbacks exist, so ship the schema + UI now and backfill data when a feed goes live.

### 3.2 🐞 Fix corrupted "Detail" in Recent Events
**Confirmed root cause.** In `analytics.ts` → `getRecentEvents()`, the detail is `e.query || e.pairKey || e.componentId || e.category`. For a **single-component "view" event** there's no query and no pairKey, so it falls through to `e.componentId` — a raw Mongo ObjectId (`6a5457162cb7b0913bc22773`), exactly Scott's example. The main dashboard lists already resolve ids→names (`resolveComponentNames`), but **`getRecentEvents` does not.** **Fix:** resolve `componentId → component name` inside `getRecentEvents` (reuse `resolveComponentNames` / `shortComponentName`), and pretty-print the click `url`/`pairKey` details too. Add a test asserting no 24-hex string ever reaches a `detail`.

### 3.3 🛠 Add a secondary dashboard selector (Compare | PC Builder)
Add a top-level view switch next to the day/week/month toggle in `AdminDashboard.tsx` to flip between the existing **Compare** analytics and a new **PC Builder** dashboard (3.4). Keep the window toggle shared. This is a small UI/routing change plus a second analytics query path.

### 3.4 🛠 Build the PC Builder analytics
Derive builder metrics from `BuildModel` (and new events if needed): builds created over time, most-used parts per category, average budget, average build score, average estimated wattage, completion rate (how many builds have all essentials), and top shared builds. Note: build **creation** currently isn't logged as an event — either aggregate directly from `BuildModel` documents or add lightweight build events for time-series. Mirror the existing chart/TopList components for consistency.

---

## Task 4 — Overall Website (theme)

### 4.1 🔍 Light mode as the default, remembered next time — **very low effort**
**Verified findings:**
- The default is **already light**: `client/index.html` ships `<html lang="en" data-theme="light">`, and `tokens.css` defines the full light palette (`:root[data-theme='light']`).
- A working **light/dark toggle** already exists in `TopBar.tsx` and it **writes** the choice to `localStorage['automatorr-theme']`.
- **The only gap:** nothing **reads** that saved value back on page load. `main.tsx` never re-applies it, so every reload resets to the index.html default. The preference is written but never restored.

**Fix (≈5 lines, trivial):** add a tiny inline boot script in `index.html`'s `<head>` (before the app renders, to avoid a flash-of-wrong-theme):
```html
<script>
  try {
    var t = localStorage.getItem('automatorr-theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
</script>
```
Optionally respect the OS setting on first visit via `matchMedia('(prefers-color-scheme: dark)')` when nothing is stored. **Difficulty: very low** — persistence is 90% wired already; this closes it. Add an e2e check: toggle → reload → theme sticks.

---

## Cross-cutting notes & environment caveats
- **Can't confirm live UI:** anything marked **[verify on site]** (OS section 1.7, missing captions, live prices/links 2.3) needs Scott's eyes on the running app since Chrome automation is offline.
- **Sandbox can't run MongoDB**, so DB-backed integration tests and the demo server weren't exercised here — pure-logic fixes (1.5, 1.6, 3.2) are unit-testable and should ship with tests.
- **Recommended sequencing:** the confirmed one-function bugs (1.5 socket, 1.6 wattage, 3.2 recent-events) are quick wins to land first; the naming cleanup (1.3), compare-category expansion (2.1/2.2), and affiliate-dependent items (2.3, 3.1) are larger and partly blocked on the affiliate feed going live.
