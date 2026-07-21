# DB-1 — Catalogue Scope & Master Parts List (source of truth)

_Defines the complete component universe the database must hold. Every later task (DB-2 GTINs → DB-8 QA) fills against this. Builds on `docs/task3-catalogue-data-plan.md` (Icecat specs/images/GTIN + PassMark index + affiliate-feed pricing)._

---

## 1. Selection criteria (what's in, what's out)

**In scope**
- **Region:** Australia — parts sold by at least one of our AU retailers (Amazon AU, Mwave, Scorptec, Centre Com, PLE, PCCaseGear).
- **Segment:** desktop DIY — mainstream + enthusiast. Consumer parts a person building or upgrading a desktop would compare.
- **Era:** **2014 → present.** 2014 is the floor because it's the oldest generation still realistically in service / second-hand relevant (Intel Haswell, AMD FX/first Ryzen lead-in). CPUs explicitly reach back to 2014 (DB-7); other categories follow the same floor where parts remain relevant.
- **Status:** current + recently-EOL (kept, flagged `eol: true`) so historical comparisons still resolve. Brand-new launches are picked up automatically by the weekly Icecat ingest.

**Out of scope (non-goals)**
- Server/workstation-only parts (Xeon-only SKUs, EPYC, Threadripper PRO), OEM/tray-only chips with no retail GTIN, laptop/mobile parts, pre-2014 hardware, non-AU-market SKUs, and one-off bundles/kits. Prebuilt systems are out — we catalogue components only.

---

## 2. Data each component must carry (the "complete" bar)

A component is **complete** when it has: all `critical` + `required` fields for its category (`catalogSpec.ts`, `isBuilderReady === true`), a **GTIN**, an **image**, a **colour** (aesthetic categories), a **performanceIndex** (benchmarked categories), and **≥1 live price with a buy-link** (once feeds are wired). Field → source:

| Field | Source | Task |
|---|---|---|
| Specs (socket, tdp, length, wattage…) | Icecat (GTIN-keyed) + curated CPU overlay | DB-3 |
| GTIN / EAN | Retailer feed + Icecat + manual | DB-2 |
| Image (`imageUrl`) | Icecat gallery | DB-4 |
| Colour | Icecat "product colour" | DB-4 |
| performanceIndex | PassMark (CPU/GPU), UB fallback (RAM/storage) | DB-5 |
| Prices / stock / buy-link | Affiliate feeds (CF/FlexOffers/Awin) by GTIN | DB-6 |

---

## 3. Coverage matrix & target counts

Targets are "comprehensive mainstream," not every AIB variant — one canonical entry per reference model, plus notable factory-OC/variant SKUs only where they materially differ (price/clocks/length). Current counts are today's seed.

| Category | Era / generations to cover | Selection rule | Current | Target |
|---|---|---|---:|---:|
| **CPU** | 2014→: Intel 4th–14th gen + Core Ultra 200S; AMD FX (AM3+), Ryzen 1000–9000 + APUs | All retail desktop SKUs | 79 | **~145** |
| **GPU** | 2014→: NVIDIA GTX 900/10/16/RTX 20/30/40/50; AMD R9 300/RX 400/500/Vega/5000/6000/7000; Intel Arc A/B | Reference model per tier + notable AIB variants | 8 | **~110** |
| **Motherboard** | Sockets LGA 1150/1151/1200/1700/1851, AM3+/AM4/AM5 × chipsets × ATX/mATX/ITX | Popular boards per chipset/form-factor | 6 | **~130** |
| **RAM** | DDR3 (legacy boards), DDR4, DDR5 — key capacities/speeds/CLs | Popular kits per type/capacity tier | 8 | **~70** |
| **Storage** | NVMe Gen3/4/5 SSD, SATA SSD, 3.5" HDD — 250 GB→8 TB | Popular drives per interface/capacity | 10 | **~85** |
| **CPU Cooler** | Air + AIO (120/240/280/360 mm), incl. legacy socket support | Popular coolers across price tiers | 6 | **~65** |
| **Case** | ATX / mATX / ITX, airflow + silent, incl. colours | Popular chassis per form-factor | 6 | **~65** |
| **PSU** | 450–1600 W, 80+ Bronze→Titanium, ATX/SFX | Popular units per wattage/efficiency tier | 6 | **~65** |
| **Monitor** | 1080p/1440p/4K/ultrawide, 60–360 Hz, IPS/VA/OLED | Popular displays per resolution/refresh tier | 5 | **~80** |
| | | | **~128** | **~880** |

---

## 4. Master parts list — schema (the source of truth)

DB-2+ populate one row per component. The planning-level list (`docs/master-parts-list.csv`) enumerates the **series/chipset rows** to expand into concrete models; the model-level GTIN list is filled in DB-2.

| Column | Meaning |
|---|---|
| `category` | builder category |
| `brand` | manufacturer |
| `model` | exact retail model name |
| `generation` | series / chipset / era tag (e.g. "Haswell", "Z790", "RTX 40") |
| `socket`/`chipset` | key compatibility discriminator where relevant |
| `releaseYear` | for the 2014 floor + EOL logic |
| `gtin` | filled DB-2 (blank = needs sourcing) |
| `status` | `active` \| `eol` |
| `priority` | P1 (current, in-stock) → P3 (legacy/EOL) for sequencing |

---

## 5. Generation breakdown to enumerate (per category)

The concrete series each category expands into — this is the checklist DB-2 works down.

**CPU (→ DB-7 for the pre-2020 half)**
- Intel: 4th Haswell/Devil's Canyon (LGA1150), 6th–9th Skylake→Coffee Lake (LGA1151), 10th–11th (LGA1200), 12th–14th (LGA1700), Core Ultra 200S (LGA1851); HEDT 2011-v3/2066 (enthusiast only).
- AMD: FX Vishera (AM3+); Ryzen 1000/2000/3000/5000/7000/9000 + G-series APUs (AM4/AM5).

**GPU** — NVIDIA GTX 900→RTX 50; AMD R9 300→RX 7000; Intel Arc. One entry per reference tier (e.g. RTX 4070, RX 7800 XT) + notable variants (Ti/SUPER/XT/XTX).

**Motherboard** — per socket × chipset × form factor: Intel H/B/Z (e.g. B760, Z790), AMD A/B/X (e.g. B650, X670E) plus legacy (Z97, B450). Popular ATX/mATX/ITX boards each.

**RAM** — DDR4 (3200–4000) + DDR5 (5200–7200) kits at 16/32/64 GB, common CLs; a few DDR3 kits for legacy boards.

**Storage** — NVMe Gen4/5 flagships + value, SATA SSDs, 3.5" HDDs (WD/Seagate) 1–8 TB.

**Cooler** — air (single/dual tower, low-profile) + AIO 240/280/360; **must list legacy sockets** in `socketSupport` (LGA115x/AM3+) so DB-7 CPUs stay compatible.

**Case / PSU / Monitor** — per the tiers in §3; colours captured for case/cooler.

---

## 6. Sequencing & priorities

1. **P1 first** — current, in-stock parts (the ones users compare/buy today): fastest path to a useful live catalogue.
2. **P2** — the 2014–2019 mainstream (Haswell→Coffee Lake, Ryzen 1000–3000, GTX 10/16, RX 400–5000).
3. **P3** — enthusiast/legacy edge (HEDT, FX, EOL variants), flagged `eol`.

Compatibility rule (blocks builds if skipped): whenever a legacy **CPU socket** is added, the matching **coolers** (`socketSupport`) and **motherboards** must be added in the same pass — otherwise those CPUs flag incompatible everywhere (this is DB-7's critical note).

---

## 7. DB-1 exit criteria
- Scope, era floor, and per-category targets agreed (this doc).
- `docs/master-parts-list.csv` scaffold created with every series/chipset row + priority.
- Ready to hand to **DB-2** (GTIN acquisition) against P1 rows first.
