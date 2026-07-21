# PC Builder — Phase 1: PCPartPicker `/list` feature inventory

**Reference:** https://au.pcpartpicker.com/list/ (Australia region)
**Purpose:** feature map that feeds the Task 1 replication plan for the `/pc-builder` section of AutomatorrPC.

> **Source note.** The Claude-in-Chrome extension would not pair with this session
> (`list_connected_browsers` returned empty after repeated retries), so this inventory is
> compiled from established knowledge of the PCPartPicker list builder rather than a live crawl.
> Every item in §12 must be confirmed against the live AU site once the browser connects — treat
> AU-specific columns, exact filter fields, and compatibility copy as *provisional* until then.

---

## 1. Overall layout
A single-page **build list**: one large table where every row is a component **category**. Around it:
- a **compatibility notes** banner (issues/warnings for the current selection),
- an **estimated wattage** readout,
- a **running price total** (multi-merchant),
- action controls: **Permalink**, **Save/name list** (account), **Markup/BOM**, **Add note**, **Reset**.

## 2. The build table — columns
Left → right, per row:
`Component (category)` · `Image + Selection (part name → product page)` · `Base` · `Promo` · `Shipping` · `Tax` · `Price` · `Where (merchant dropdown / Buy)` · `Rating` · `Actions (+ / × / note)`.
- Populated row: thumbnail, part name, **merchant dropdown** (auto-picks cheapest, can override), price breakdown, **Buy** (affiliate outbound), remove (×), add note.
- Empty row: **"Choose a &lt;Category&gt;"** button.

## 3. Category rows (default set)
Core rows: **CPU, CPU Cooler, Motherboard, Memory, Storage, Video Card, Case, Power Supply, Operating System, Monitor.**
Repeatable rows: **Storage, Monitor, Case Fan** (add multiple).
"Add" more categories: Sound Card, Wired/Wireless Network Adapter, Optical Drive, Thermal Compound, UPS, External Storage, Headphones, Keyboard, Mouse, Speakers, Webcam, **Custom part**.

## 4. Add-a-part flow
"Choose a &lt;Category&gt;" → a **part-list page** for that category (e.g. `/products/cpu/`), pre-scoped and (optionally) compatibility-filtered → pick a part → returns to the list with the part + merchant + price attached.

## 5. Part-list page (the picker)
- **Filter sidebar (left):** Price range, Merchant + **"In stock only"**, Manufacturer, and **category-specific spec filters**:
  - CPU: cores, core clock, TDP, socket, integrated graphics, SMT.
  - Video Card: chipset, VRAM, GPU length, interface.
  - Memory: DDR gen, speed, modules (kit), CAS, per-module capacity.
  - Motherboard: socket/CPU, form factor, chipset, memory max/slots, RAM speed support.
  - PSU: wattage, efficiency rating, modular, form factor.
  - Storage: capacity, type (SSD/HDD), form factor, interface, NVMe.
  - Case: type/form factor, side panel, colour, max GPU length, max cooler height.
- **Compatibility filter:** "Compatible Products Only" checkbox → hides parts incompatible with the current build.
- **Search box**, **sortable columns**, **rating** stars + review counts, per-row cheapest price, **Add (+)**, pagination.

## 6. Compatibility system
- **Notes/warnings banner** on both the build page and picker: "No issues" / "Warnings" / "Potential Issue" with specific messages.
- Rule families to cover: socket ↔ chipset, RAM type/speed vs mobo (QVL), GPU length vs case clearance, cooler height vs case, PSU wattage headroom + connectors (12V-2x6), M.2 slots / PCIe lane sharing, radiator support, mobo ↔ case form factor.
- **Hard** (block/never render) vs **soft** (advisory warning) distinction matters.

## 7. Estimated wattage
`Estimated Wattage: NNN W`, derived from selected parts (≈ CPU TDP + GPU TBP + component overhead). Drives PSU sizing guidance.

## 8. Pricing / totals
- **Per-part multi-merchant:** cheapest merchant shown by default, dropdown to override; columns break out Base / Promo / Shipping / Tax / Price.
- **Totals:** "Base Total" and "Total" (incl. promo/shipping/tax); recompute live as merchant/part changes.
- **Buy** links are affiliate/outbound.

## 9. Saved lists / permalink / sharing
- **Permalink** → shareable build URL.
- **Save + name** a list requires an account ("My Lists"). Also: notes per row, Markup/BOM view, **Completed Builds** gallery, **price-drop alerts**.

## 10. Mapping to the AutomatorrPC stack
**Reuse as-is:** component catalogue (Mongoose `Component`), multi-store AUD pricing, retailer adapters (Amazon AU / Mwave / Scorptec), the normalized performance index, deterministic scoring.
**New (the real lifts):**
1. **Category expansion** — add Motherboard, PSU, Case, CPU Cooler, OS, Monitor (+ their spec fields) to the catalogue; today we only seed CPU/GPU/RAM/Storage.
2. **Build model + state** — an ordered set of chosen parts, per-part chosen merchant/price, running total, wattage estimate, build score vs budget.
3. **Compatibility engine** — the hard part; socket/chipset/RAM/PSU/GPU-length/cooler-height/form-factor as a rules graph (this is ~80% of the product's value).
4. **`/pc-builder` UI** — category rows + part-picker table/modal with filters, reusing TopBar/drawer + the light/dark theme.
5. **Wattage estimator**, **permalink** (URL-encoded build), optional **saved lists**.

## 11. Suggested v1 vs later (for the plan to confirm)
**v1:** rows for existing 4 categories + a few new ones with catalogue data; add/remove parts; running AUD total (cheapest store per part); basic wattage estimate; a **small set of hard compatibility rules** (socket, RAM type, PSU wattage headroom, GPU length vs case); permalink via URL-encoded build; **build score /100 vs budget** (per features.md).
**Later:** full compatibility/QVL graph, saved named lists (accounts), price-drop alerts, completed-builds gallery, per-merchant Base/Promo/Ship/Tax breakdown, affiliate + click-vs-purchase conversion tracker.

## 12. ⚠️ Verify-live checklist (run the moment Chrome pairs)
- [ ] Exact AU column set — do promo/shipping/tax columns render for AU merchants?
- [ ] Exact category list + which rows are multi-instance.
- [ ] Per-category filter fields (confirm current spec filters).
- [ ] Compatibility warning copy + which checks are hard vs soft.
- [ ] Wattage formula display + PSU headroom recommendation wording.
- [ ] Permalink URL format; what save/list features gate behind an account.
- [ ] AU merchant set + how "cheapest" is selected (in-stock handling).
- [ ] Mobile/responsive layout of the list table.

## 13. Decisions to confirm with Scott before writing the replication plan
1. **Scope:** MVP subset vs fuller clone for v1.
2. **Catalogue:** reuse/extend the existing component DB for the builder (assumed yes).
3. **Compatibility depth in v1:** the small hard-rule set above, or a deeper engine from the start.
4. **Region:** AU confirmed (pricing, merchants).
5. **Build scoring:** confirm the "score /100 vs budget" model from features.md as the builder's headline metric.

---

## 14. Live verification results (crawled 2026-07-12, Chrome bridge restored)

The Claude-in-Chrome bridge reconnected and the AU site was crawled live
(`/list/`, `/products/cpu/`, `/list/by_merchant/`). Results against §12:

- [x] **AU column set** — build table is `Component · Selection · Base · Promo · Shipping · Tax · Availability · Price · Where`. **Correction:** there is **no Rating column in the build table** (rating lives only on the picker). `Base/Promo/Shipping/Tax` render but are often blank/`—`; `Shipping` shows `FREE` where applicable.
- [x] **Category list** — core rows confirmed: CPU, CPU Cooler, Motherboard, Memory, Storage, Video Card, Case, Power Supply, Operating System, Monitor. Below the table, add-more groups: **Expansion Cards/Networking** (Sound Cards, Wired/Wireless Network Adapters), **Peripherals** (Headphones, Keyboards, Mice, Speakers, Webcams), **Accessories/Other** (Case Accessories, Case Fans, Fan Controllers, Thermal Compound, External Storage, Optical Drives, UPS).
- [x] **Picker filters (CPU)** — sidebar: Compatibility Filter toggle (on by default) + live mini-summary (Parts / Total / Estimated Wattage); Merchants filter; Pricing option "Include mail-in rebates"; then Filters: **Price** (range slider), **Manufacturer** (All/AMD/Intel), **Rating** (star tiers + Unrated), **Core Count**, and further spec filters. Product table: Name · Core Count · Perf Core Clock · Perf Boost Clock · Microarchitecture · TDP · Integrated Graphics · Rating · Price · **Add**. Also **Add From Filter**, search, Select All/None, Compare Selected, sortable columns. **1438 compatible CPUs** listed for an empty build.
- [x] **Compatibility banner** — green when clean: "No issues or incompatibilities found"; changes to "See details below" once parts imply notes. Confirmed hard/soft distinction is surfaced in a details section.
- [x] **Wattage** — live: adding a 65 W CPU flipped `Estimated Wattage: 0W → 65W`. Derived from part TDP/TBP.
- [x] **Pricing / cheapest merchant** — populated row auto-selects the cheapest in-stock merchant in **Where** (observed "Centre Com"), with a **Buy** (affiliate outbound) button, a per-part gear (options) and × (remove). Green price = cheapest.
- [x] **Prices By Merchant** (`/list/by_merchant/`) — a second tab appears once parts exist; lists the build priced at **each merchant** with per-store Total and a **Difference** column ("$3.00 more than Centre Com"). Single-store total optimiser.
- [x] **Permalink** — auto-generated `au.pcpartpicker.com/list/<shortId>` (e.g. `/list/dCm3Zw`), updates as the build changes; **Markup** export (PCPP / Reddit / HTML / Plain Text / BB Code), **History**, **Save As**, **Start New**.
- [x] **AU merchant set** — far broader than our 3 registered adapters. Observed: **Centre Com, PLE Computers, PCCG/PC Case Gear, + ~10 others** in the by-merchant view. Our registry today = Amazon AU (stub) + Mwave + Scorptec.
- [ ] **Mobile/responsive layout** — not captured this pass (desktop 1440px only). Defer.

**Net effect on the plan:** inventory in §1–§11 holds; the only substantive corrections are (a) no rating column in the build table, (b) AU merchant list is much larger than our adapters, (c) "Prices By Merchant" difference column confirmed as a first-class feature.
