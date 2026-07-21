# Speccify Logo Design — Context Handoff (for Fable 5)

_Scope: **the logo/brand mark only.** Ignore every other system in this repo (compare tool, PC builder, dashboards, etc.). This document is everything you need to continue the logo work._

---

## 1. What the logo is for
**Speccify** is a PC-hardware comparison and build-planning web app (Australian). The brand voice is precise, technical, and trustworthy, with a little playfulness. The name is a pun on **spec** (specifications) + **specify**. It is a **rebrand from "Automatorr"** — Automatorr is now the underlying platform, credited as **"Powered by Automatorr."**

## 2. Direction that was chosen (locked)
A **circuit-trace "S"** glyph + the wordmark **"peccify"**, so the mark reads **S-peccify → Speccify**. The "S" is drawn as a PCB trace: rounded routing lines, small **vias** (ring connection points) at the trace ends, a **central microchip** where the S crosses, and a single **red LED** accent near the lower-left tip.

Two other concepts were rejected: a bike-chain "S" (reads as cycling/mechanical — wrong category) and a snake "S" (the previous identity; kept as a fallback only if a single do-everything mark is needed).

## 3. Simplification system (Step 1 → Step 3, from Scott's brief)
The logo is a **two-asset system** because the detailed version doesn't survive small sizes:
- **Hero glyph** — full detail (traces, branch stubs, vias, LED, chip). Use in headers / hi-res.
- **Simplified icon** — just the **S trace + central chip**. No fine traces, no LED. Use for favicon (16 px) and app tile (32 px). Brand recognition must survive at micro scale.

## 4. Palette & type (match exactly)
| Token | Value | Use |
|---|---|---|
| Navy background | `#14213F` (deep `#0E1A33`) | logo field |
| Trace blue | `#8EA6D8` | the S traces, vias, chip outline |
| Chip fill | `#33437A` | central microchip body |
| LED accent | `#E0483D` (glow `#FF6B5E`) | single red LED, hero only |
| Wordmark (dark) | `#EEF3FB` | "peccify" on dark |
| Wordmark (light) | `#16131F` | "peccify" on light mode |
| Fonts | Kanit (display/wordmark), Inter (body), JetBrains Mono (kicker) | — |

## 5. Assets already created (production SVG)
Clean vector rebuilds live in the repo — start from these, don't recreate from scratch:
- `client/public/speccify-hero-icon.svg` — hero glyph (viewBox `0 0 72 80`).
- `client/public/speccify-icon.svg` — simplified S+chip icon (viewBox `0 0 72 80`).

**Fidelity caveat:** these are a *clean interpretation* of the nano-banana raster renders, not pixel-identical. The S-curve and chip proportions are close but not exact. If Scott wants an exact match, he'll provide a clean **hero PNG on a transparent background** to trace precisely.

## 6. Placement (locked: "Option B")
Header, top-left — the current Automatorr logo slot:
- **Hero glyph** ~28–30 px tall, then the **"peccify"** wordmark (Kanit bold, ~28–30 px), **8–9 px** gap between them.
- Directly **under the wordmark**, a micro-credit kicker: the words **"Powered by"** (JetBrains Mono, ~10 px, uppercase, letter-spaced, muted) followed by the **actual Automatorr logo image** (not text) at **13 px** height, **6 px** gap. It reads as a logo at the same visual weight as the kicker text.

**Automatorr credit asset:** `client/public/automatorr-logo.png` (800×82, RGBA, a light-on-dark wordmark).

## 7. Hard constraint from Scott (do not violate)
**On light mode, keep the Automatorr credit in its normal (light) colour — do NOT invert it.** It sits as a quiet, low-contrast credit on light backgrounds; that's intended. (An earlier mock inverted it; that was rejected.)

## 8. Where it lands in code (logo touchpoints only)
- `client/src/components/TopBar.tsx` — currently renders `automatorr-logo.png` at `height:26px` in `.logo-link`. This is the slot to replace with the Speccify lockup (hero glyph + "peccify" + the Powered-by kicker).
- `client/src/styles/app.css` — `.topbar`, `.logo-img` (`height:26px`) styles.
- Footer credit "© 2026 Automatorr" lives in `client/src/pages/ComparePage.tsx` (`.foot`). If placement ever moves to a footer credit instead of the kicker, that's the spot.

## 9. Reference mockups (open in a browser)
- `docs/speccify-logo-system.html` — the current SVG system in context (both glyphs, header dark + light, favicon/app-tile sizes). **Most current.**
- `docs/speccify-optionB-poweredby.html` — Option B header with the real Automatorr logo in the credit.
- `docs/speccify-rebrand-mockups.html` — the original A/B/C placement options (A footer, B kicker, C pill).
- `docs/speccify-logo-prompt.md` (if present) — the nano-banana generation prompt, for regenerating raster concepts.

## 10. Outstanding work / next steps
1. **Confirm glyph fidelity** with Scott (approve the SVG shape, or trace an exact hero PNG).
2. **Wire the lockup into `TopBar.tsx`** (replace the Automatorr logo; add the Powered-by kicker) and update the `alt`/`aria-label` to "Speccify".
3. **Generate the favicon set** from `speccify-icon.svg`: `favicon.ico` (16/32), 180 px apple-touch, 512 px PWA — update `client/index.html`.
4. **Light-mode wordmark**: ensure "peccify" flips to `#16131F`; leave the Automatorr credit uninverted (see §7).
5. **Optional:** a dark Automatorr variant for light mode is a nicer long-term fix, but only if Scott changes his mind on §7 — do not do it unprompted.

## 11. One-line summary
Circuit-trace **"S" + "peccify"**, navy/periwinkle palette, two-asset system (detailed hero + simplified chip icon), placed top-left with **"Powered by [Automatorr logo]"** underneath — and the Automatorr credit stays its normal colour on light mode.
