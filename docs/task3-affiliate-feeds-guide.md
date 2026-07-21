# Affiliate product feeds — sign-up guide + what to hand me

This is the last piece of Task 3: the **retailer-feed → GTIN → Icecat** pipeline that populates the catalogue with real, buyable parts and keeps it fresh. It's blocked only on you obtaining the retailers' **product data feeds** and **affiliate tracking IDs**. This guide is what to sign up for and exactly what to give me.

---

## Why feeds (the 30-second version)

A retailer's **product data feed** is a downloadable file (CSV/XML) listing everything they sell, with — crucially — each item's **GTIN** (barcode number), price, stock, product URL, and image. The pipeline reads the feed, takes each **GTIN**, looks it up in Icecat for the compatibility specs, and saves a canonical part with the retailer's (affiliate-tagged) price attached. GTIN is an exact key, so no fuzzy matching, and it's scoped to real stock (rate-friendly, unlike scraping the whole Icecat DB).

You don't need all 6 retailers to start — **one working feed is enough** to prove the pipeline end-to-end.

---

## The general process (same for each retailer)

1. **Find the retailer's affiliate program.** Look in the site footer for "Affiliates", "Affiliate Program", or "Partner with us". It'll tell you which **affiliate network** runs it. In Australia these are commonly **Commission Factory**, plus **Partnerize**, **Rakuten Advertising**, **Impact**, or **Awin**. (Confirm per retailer — it changes.)
2. **Join that network** as a publisher/affiliate (free) and **apply to the specific merchant.** Approval can take a few days and may ask for your site — use `automatorr.com`.
3. Once approved, in the network dashboard find **"Product Feeds" / "Data Feeds"** for that merchant → copy the **feed URL** (or download the file). Note the format (CSV or XML) and whether the URL needs a key/login.
4. Grab your **affiliate tracking format** — either a tracking ID to append to product URLs, or a link-wrapper template the network gives you.

**Amazon is different:** it's not a feed. Join **Amazon Associates (AU)** and use the **Product Advertising API (PA-API)** for prices — keys + partner tag are covered in `task3-credentials-checklist.md`.

---

## Per-retailer checklist

| Retailer | Likely network (confirm) | What to obtain |
|---|---|---|
| **Amazon AU** | Amazon Associates (direct) | PA-API Access Key + Secret Key + Partner Tag (see credentials checklist) |
| **Mwave** | Commission Factory | Product feed URL + your affiliate/tracking ID |
| **Scorptec** | Commission Factory | Product feed URL + tracking ID |
| **Centre Com** | Commission Factory / other | Product feed URL + tracking ID |
| **PLE Computers** | Commission Factory / other | Product feed URL + tracking ID |
| **PCCaseGear** | Partnerize / Commission Factory | Product feed URL + tracking ID |

If a retailer has **no public affiliate program**, tell me — we can still list it without a tag (Buy link without commission), or skip it.

---

## What to hand me (and where to put it)

Put values in **`server/.env`** (git-ignored — never commit them) and just tell me "Mwave feed is in" etc. Don't paste secrets into chat. Env var names the pipeline will read:

```
# Per-retailer product feed URL + affiliate tracking id
MWAVE_FEED_URL=            MWAVE_AFFILIATE_ID=
SCORPTEC_FEED_URL=         SCORPTEC_AFFILIATE_ID=
CENTRECOM_FEED_URL=        CENTRECOM_AFFILIATE_ID=
PLE_FEED_URL=              PLE_AFFILIATE_ID=
PCCG_FEED_URL=             PCCG_AFFILIATE_ID=

# If the feed URL needs network auth (e.g. Commission Factory API key)
AFFILIATE_NETWORK_API_KEY=

# Amazon (PA-API) — see task3-credentials-checklist.md
AMAZON_PAAPI_ACCESS_KEY=   AMAZON_PAAPI_SECRET_KEY=   AMAZON_PARTNER_TAG=
```

For each feed, it also helps to send me **one sample feed URL or a few sample rows** so I can see the exact column names (they vary: `gtin`/`ean`/`barcode`, `price`, `stock`/`availability`, `url`, `image`). I build the parser around the real columns.

---

## What I build once a feed lands

1. A `RetailerFeedSource` per retailer: fetch + parse the feed → `{ name, gtin, price, stock, url }`, with the affiliate tag applied to the Buy URL.
2. Feed ingestion: for each row, **GTIN → Icecat** (specs, using the lean field contract) → upsert the canonical part → attach the retailer's price/stock. Deduped by GTIN/canonical key; unmatched GTINs go to the review queue.
3. A scheduled refresh (reusing the existing scheduler) so prices/stock stay current and new launches appear automatically.

**Fastest path to see it work:** get **one** retailer's feed (Mwave or Scorptec on Commission Factory is usually quickest), hand me the feed URL + tracking ID, and I'll wire that source end-to-end as the proof — then we add the rest.
