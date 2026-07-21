# Affiliate programs & price sourcing — reference

How affiliate monetisation and price data fit together in Speccify, plus a per-retailer
sign-up + config checklist.

## Key principle: prices ≠ affiliate links

These are **two independent layers**:

1. **Price data** — where the number "$648 at Scorptec" comes from. Sourced by crawling /
   scraping the store or ingesting an affiliate **product datafeed**. Needs no affiliate
   membership.
2. **Affiliate link** — a monetisation wrapper placed on the *outbound* "Buy at X" URL so you
   earn commission on the click-through. Needs program membership, but does **not** affect the
   price shown.

You can ship prices now with plain product links, and switch on affiliate wrapping per store
later — **zero code change**, just flip the config in the admin UI.

## How the app's affiliate config works

One `AffiliateLink` doc per store (admin-editable in the Affiliate Links modal). Each price URL
is decorated at serve time by `applyAffiliateLink` (pass-through if misconfigured — a bad config
can never break a link).

| mode | what it does | use for |
|---|---|---|
| `off` | returns the plain product URL | default / not yet approved |
| `tag` | appends `?<paramName>=<tag>` to the product URL | Amazon Associates |
| `wrapper` | substitutes the URL-encoded product URL into `{url}` in a redirect template | Awin, Commission Factory, FlexOffers, Partnerize, most networks |

Fields: `mode`, `paramName` (tag mode, default `tag`), `tag` (the affiliate id), `wrapperTemplate`
(wrapper mode, must contain the literal `{url}`).

## The strategy: join networks, not sites

Almost every AU retailer runs its program through an affiliate **network**. Join the network once
and you get deep-link access to all its merchants; the network's merchant directory is the real
"list of all the sites." Priorities:

- **Commission Factory** — dominant AU network (JB Hi-Fi, often Mwave, and many more)
- **Awin** — PC Case Gear
- **Amazon Associates** — direct (Amazon AU)
- **FlexOffers** — aggregates Scorptec, PLE

## Per-retailer checklist

| Retailer | Program / network | Join at | Cookie | App config |
|---|---|---|---|---|
| **Amazon AU** | Amazon Associates (direct) | affiliate-program.amazon.com.au | 24h (90d cart) | `tag` · paramName `tag` · tag `yourid-22` |
| **PC Case Gear** | Awin (merchant #33135) | awin.com → apply → request PCCG | per program | `wrapper` (see Awin template below) |
| **Mwave** | Direct program | mwave.com.au/catalog/affiliate | per program | `wrapper` — template from dashboard |
| **Scorptec** | FlexOffers (also check Commission Factory) | flexoffers.com | ~30d | `wrapper` — deep-link from FlexOffers |
| **PLE Computers** | FlexOffers (also check Commission Factory) | flexoffers.com | 30d | `wrapper` — deep-link from FlexOffers |
| **Umart** | Own program | help.umart.com.au → "Umart Affiliate Program" | per program | `wrapper` — template from dashboard |
| **MSY** | Via Umart (MSY was acquired by Umart) | — same program | — | same as Umart |
| **JB Hi-Fi** | Commission Factory | commissionfactory.com | per program | `wrapper` — CF deep-link |
| **Centre Com** | No public program found | contact them directly | — | — |

### Concrete templates

**Amazon AU** (`tag` mode): set `paramName = tag`, `tag = <your-associate-id>` (AU ids end in
`-22`). Result: `https://www.amazon.com.au/dp/XXXX?tag=yourid-22`.

**Awin** (`wrapper` mode) — the format is stable:
```
https://www.awin1.com/cread.php?awinmid=33135&awinaffid=<YOUR_AFFID>&ued={url}
```
(`awinmid` 33135 = PC Case Gear; swap for other Awin merchants' ids.)

**Commission Factory / FlexOffers / Partnerize** (`wrapper` mode): grab the deep-link template
from the network dashboard. It contains a destination-URL parameter (e.g. `url=`, `ued=`,
`destination=`) — put `{url}` there. The app URL-encodes the product URL into `{url}` for you.

## Sourcing prices before / without affiliate links

You do **not** need any affiliate program to show prices. In order of preference:

1. **Live scraper (built, works now)** — `npm run scrape` runs `refreshAllPrices` across the
   catalogue via the retailer adapters, saving the cheapest-first quote list per part. Works for
   the un-gated stores: **Mwave, PLE, PCCaseGear** (PLE plain, PCCG/Mwave via `--render`).
   Scorptec is **Cloudflare-gated** and can't be scraped — leave it `off` until you have a feed.
2. **Crawl-attached price** — every crawled product already carries the store's listing price
   from the crawl, so a single-store price exists immediately for PLE + PCCaseGear parts.
3. **Affiliate product datafeeds (best at scale, once joined)** — Awin / Commission Factory /
   FlexOffers publish a **bulk product datafeed** (CSV/API of every product + price + deep link)
   for their merchants. Once you're approved, ingest the feed instead of scraping: it's the
   ToS-compliant, complete, always-current price source **and** it hands you the affiliate deep
   link per product. This is the long-term path — it also unlocks Scorptec pricing without
   fighting Cloudflare.

**Recommended sequence:** run the scraper now for Mwave/PLE/PCCaseGear multi-store prices with
plain links → apply to the networks → as each is approved, flip that store's config from `off`
to `tag`/`wrapper`, and (where available) switch its price source to the datafeed.

## Adding a new retailer (Umart, MSY, JB Hi-Fi, …)

A store only appears in the affiliate admin if it's in `RETAILER_STORES` (derived from the price
retailer registry). To add one: register a retailer adapter (or a datafeed ingestor) with a
matching `store` name — it then auto-appears in the Affiliate Links modal and its prices get
decorated. No point adding it before a price source exists.
