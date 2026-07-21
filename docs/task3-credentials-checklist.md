# Task 3 — Credentials checklist (what I need from you)

The **pure logic** (canonical identity, matcher, spec schema, scoring math) needs nothing from you and is being built + tested in-sandbox. The **live data steps** need external accounts/keys that only you can create. Below is each one: what it's for, how to get it, and the exact env var name.

> **Security — important.** Please put the actual values **only in `AutomatorrPC/server/.env`** (already git-ignored) — don't paste secrets into this chat. When each is in place, just tell me "Icecat done", "PA-API done", etc., and I'll wire the code that reads that env var. I never need to see the secret values themselves. Terms/flows below can change — confirm current details on each provider's site (I can double-check any of them for you on request).

---

## 1. Icecat — product specs (the catalogue backbone)
- **Why:** structured specs + images for every part, keyed by GTIN/MPN (which also powers price-matching).
- **How:** at icecat.biz choose **Channel Partner Registration** (NOT Brand Partner — that's for manufacturers publishing their own content; you're a data *consumer*). Register for **Open Icecat** (free tier), then get your **username** + **API token** from your account. Broader coverage is the paid "Full Icecat" tier — start free.
- **Env vars:** `ICECAT_USERNAME`, `ICECAT_API_TOKEN` (+ `ICECAT_APP_KEY` for Full Icecat)
- **⚠️ Finding (2026-07-15):** the connection + auth work, but AMD/Intel (and likely NVIDIA/ASUS/etc.) datasheets are **Full Icecat (paid)** — Open Icecat free returns `StatusCode 9: app_key required`. Getting core PC-component specs from Icecat needs a **Full Icecat subscription + app_key** (and app_key needs your server IP whitelisted in My Profile). Open free mostly covers peripherals/other brands, not core build parts.

## 2. Amazon Product Advertising API (PA-API 5.0) — Amazon AU prices
- **Why:** Amazon prohibits scraping; PA-API is the sanctioned way to pull prices/availability.
- **How:** join **Amazon Associates (AU)** and get approved → in the Associates portal, request **Product Advertising API** access → generate an **Access Key** + **Secret Key**; your **Partner/Associate Tag** is your affiliate id. (Note: Amazon requires a few qualifying sales within ~180 days to keep PA-API access live.)
- **Env vars:** `AMAZON_PAAPI_ACCESS_KEY`, `AMAZON_PAAPI_SECRET_KEY`, `AMAZON_PARTNER_TAG`, `AMAZON_PAAPI_HOST` (default `webservices.amazon.com.au`), `AMAZON_PAAPI_REGION` (default `us-west-2`)

## 3. PassMark — performance index
- **Why:** the CPU/GPU marks that drive the build score (replacing UserBenchmark).
- **How:** PassMark has **no free API** — contact PassMark (passmark.com) for a **benchmark data license** (they sell CPU/GPU data as a file/feed). Once licensed, drop the data file in the repo and point the env var at it (or use their key if they issue one).
- **Env vars:** `PASSMARK_DATA_PATH` (path to the licensed data file) — or `PASSMARK_API_KEY` if they provide API access.
- *Interim:* we keep the existing UserBenchmark CSVs as the fallback until this lands, so nothing is blocked.

## 4. Retailer affiliate tags — Buy-link monetization + conversion tracking
- **Why:** to earn on outbound Buy clicks and (later) measure click→purchase conversion.
- **How:** apply to each retailer's affiliate program. AU electronics retailers commonly run theirs through affiliate networks (e.g. Commission Factory / Partnerize) rather than directly — sign up to the network, apply to each merchant, and get your **tracking/affiliate id** (and their required link format). Amazon's tag is the Partner Tag from step 2.
- **Env vars:** `MWAVE_AFFILIATE_TAG`, `SCORPTEC_AFFILIATE_TAG`, `CENTRECOM_AFFILIATE_TAG`, `PLE_AFFILIATE_TAG`, `PCCG_AFFILIATE_TAG`
- *Note:* some of these may not offer a public program — flag any that don't and we'll link without a tag for now.

---

## Quick status table (tick as you go)

| # | Credential | Env var(s) | Blocks | Got it? |
|---|---|---|---|---|
| 1 | Icecat | `ICECAT_USERNAME`, `ICECAT_API_TOKEN` | Phase 1 spec ingestion | ☐ |
| 2 | Amazon PA-API | `AMAZON_PAAPI_*`, `AMAZON_PARTNER_TAG` | Amazon pricing | ☐ |
| 3 | PassMark | `PASSMARK_DATA_PATH` | PassMark index (UB fallback until then) | ☐ |
| 4 | Affiliate tags (×5) | `*_AFFILIATE_TAG` | Buy monetization / conversion | ☐ |

Placeholders for all of these have been added (commented) to `.env.example` for reference. Nothing here blocks the pure-logic build — I'll keep going on that while you gather these.
