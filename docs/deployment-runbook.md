# Speccify — Setup & Deployment Runbook

How to run the app end-to-end and deploy it to your Azure VM at **https://speccify.info**.

## Architecture (single VM)

```
Namecheap DNS (speccify.info A record) ──▶ Azure VM public IP
                                              │
                                    ┌─────────┴──────────┐
                                    │  Caddy :443/:80    │  HTTPS termination (auto Let's Encrypt)
                                    │  reverse_proxy ─────┼──▶ Node :4000
                                    └────────────────────┘        │  serves client/dist  +  /api
                                                                   │
                                                          MongoDB 127.0.0.1:27017  (auth on, localhost-only)
```

- **One Node process** serves both the built React client *and* the `/api` routes (it already does this when `NODE_ENV=production`). No separate frontend host needed.
- The two founder super-admins (`daniel.hardman@automatorr.com`, `abishai.bajaj@automatorr.com`) are **auto-seeded at boot** — no manual seeding.
- Every admin change (allowed domains, users, affiliate config) is written to MongoDB. Nothing is stored locally.

---

## Part 0 — Test it locally first (do this before touching the VM)

1. From the repo root: `npm install`
2. Make sure a local MongoDB is running (`mongodb://127.0.0.1:27017`).
3. Copy the env template: `cp .env.example .env`  (defaults are fine for dev — `MAILER_PROVIDER=console`, DB `speccify`, founders pre-set).
4. Load catalogue data:
   - If you already have data in the old `automatorr` DB: `npm run db:migrate-speccify --workspace server`
   - Otherwise seed fresh: `npm run seed --workspace server`
5. Run the app: `npm run dev`  (server :4000, client :5173)
6. Test admin login: open `http://localhost:5173/admin` → you're redirected to the login → enter `daniel.hardman@automatorr.com` → **the 6-digit code prints to the server console** (console mailer) → enter it → you land on the dashboard with **Allowed Domains** and **Users** tabs.
7. Run the backend test suite: `npm test --workspace server`  (OTP lifecycle, RS256, refresh rotation/reuse, RBAC, founder-lock, CRUD).

Dev keys auto-generate; you do **not** need `generate-keys` locally.

---

## Part 1 — Provision the Azure VM

1. Create an **Ubuntu 22.04 LTS** VM (B2s or larger).
2. In the VM's **Network Security Group**, allow inbound:
   - **22** (SSH) — ideally restricted to your own IP
   - **80** and **443** (web)
   - **Do NOT open 27017** — MongoDB stays private.
3. SSH in, then install runtimes:
   ```bash
   # Node 20
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   # MongoDB 7 (see mongodb.com for the current apt steps for 22.04)
   sudo apt-get install -y gnupg curl
   # ...import the MongoDB key + repo, then:
   sudo apt-get install -y mongodb-org
   sudo systemctl enable --now mongod
   ```

---

## Part 2 — Secure MongoDB (Subsystem B: auth + private binding)

1. Create the database users (while auth is still off):
   ```bash
   mongosh
   ```
   ```javascript
   use admin
   db.createUser({ user: "mongoAdmin", pwd: "STRONG_ADMIN_PASSWORD",
     roles: [ { role: "userAdminAnyDatabase", db: "admin" }, "readWriteAnyDatabase" ] })
   use speccify
   db.createUser({ user: "speccify_app", pwd: "STRONG_APP_PASSWORD",
     roles: [ { role: "readWrite", db: "speccify" } ] })
   exit
   ```
2. Turn on auth and lock the bind address — edit `/etc/mongod.conf`:
   ```yaml
   net:
     bindIp: 127.0.0.1        # localhost only — never 0.0.0.0
     port: 27017
   security:
     authorization: enabled
   ```
3. Restart: `sudo systemctl restart mongod`
4. Your connection string becomes:
   ```
   mongodb://speccify_app:STRONG_APP_PASSWORD@127.0.0.1:27017/speccify?authSource=speccify
   ```

**On "secure connections throughout":** because Node and MongoDB run on the *same* VM and Mongo is bound to `127.0.0.1`, traffic never leaves the machine, and auth + the closed 27017 port are the primary controls. If you also want TLS on the DB link (optional hardening), add to `mongod.conf`:
```yaml
net:
  tls:
    mode: requireTLS
    certificateKeyFile: /etc/ssl/mongodb.pem   # your cert+key concatenated
```
and append `&tls=true&tlsCAFile=/etc/ssl/ca.pem` to the URI.

---

## Part 3 — Deploy the app

1. Clone and install:
   ```bash
   sudo mkdir -p /opt/speccify && sudo chown $USER /opt/speccify
   cd /opt/speccify && git clone <YOUR_REPO_URL> AutomatorrPC
   cd AutomatorrPC && npm install
   ```
2. Generate the production RS256 keypair:
   ```bash
   npm run generate-keys --workspace server
   ```
   Copy the two base64 values it prints into the env file below.
3. Create **`server/.env`** (git-ignored — holds all secrets):
   ```bash
   NODE_ENV=production
   PORT=4000
   CLIENT_ORIGIN=https://speccify.info
   MONGODB_URI=mongodb://speccify_app:STRONG_APP_PASSWORD@127.0.0.1:27017/speccify?authSource=speccify

   SUPERADMIN_EMAILS=daniel.hardman@automatorr.com,abishai.bajaj@automatorr.com
   ADMIN_JWT_PRIVATE_KEY=<from generate-keys>
   ADMIN_JWT_PUBLIC_KEY=<from generate-keys>

   MAILER_PROVIDER=smtp
   OTP_FROM=AI@Automatorr.com
   OTP_FROM_NAME=Speccify
   SMTP_HOST=smtp.office365.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=AI@Automatorr.com
   SMTP_PASS=<app password — see Part 5>
   ```
4. Build (shared + client bundle + server typecheck):
   ```bash
   npm run build
   ```
5. Bring data over (once) and/or seed:
   ```bash
   npm run db:migrate-speccify --workspace server   # if migrating existing data
   # and/or: npm run seed --workspace server
   ```
6. Run Node as a service — create `/etc/systemd/system/speccify.service`:
   ```ini
   [Unit]
   Description=Speccify
   After=network.target mongod.service

   [Service]
   Type=simple
   WorkingDirectory=/opt/speccify/AutomatorrPC/server
   EnvironmentFile=/opt/speccify/AutomatorrPC/server/.env
   ExecStart=/usr/bin/npm run start
   Restart=always
   User=%i

   [Install]
   WantedBy=multi-user.target
   ```
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now speccify
   sudo systemctl status speccify        # should be active; serving on 127.0.0.1:4000
   ```

---

## Part 4 — Domain + HTTPS (Subsystem C)

1. **Point the domain at the VM** — in Namecheap → *Domain List → Manage speccify.info → Advanced DNS*:
   - Delete the default parking / CNAME records.
   - Add **A record**: Host `@` → Value = your VM's public IP.
   - Add **A record**: Host `www` → same IP.
   - Give DNS a few minutes to propagate (`dig speccify.info` to confirm).
2. **Install Caddy** (auto-HTTPS via Let's Encrypt):
   ```bash
   sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
   # ...add Caddy's apt repo (see caddyserver.com/docs/install), then:
   sudo apt-get install -y caddy
   ```
3. Set **`/etc/caddy/Caddyfile`**:
   ```
   speccify.info, www.speccify.info {
       reverse_proxy 127.0.0.1:4000
   }
   ```
   ```bash
   sudo systemctl reload caddy
   ```
   Caddy fetches the TLS cert automatically (needs 80+443 open and DNS pointing here). Because you're now on HTTPS, the app's `Secure`, `SameSite=strict` auth cookies activate correctly.

---

## Part 5 — OTP email from AI@Automatorr.com

The login codes send from `AI@Automatorr.com` (a Microsoft 365 mailbox). To let the server send via SMTP:
1. In Microsoft 365 admin, ensure **SMTP AUTH is enabled** for that mailbox.
2. If the mailbox has MFA, create an **app password** for it.
3. Put the credentials in `server/.env` (Part 3): `SMTP_USER=AI@Automatorr.com`, `SMTP_PASS=<app password>`, host `smtp.office365.com`, port `587`, `SMTP_SECURE=false` (STARTTLS).
4. Test by requesting a login code — it should arrive in the inbox instead of the console.

---

## Part 6 — First login and granting access

1. Go to `https://speccify.info/admin` → sign in as `daniel.hardman@automatorr.com` (auto-seeded super-admin) → code arrives by email → you're in.
2. **Users** tab — invite specific people by email (they become `admin`; only you two stay super-admin).
3. **Allowed Domains** tab — add `automatorr.com` if you want *anyone* with an `@automatorr.com` email to sign in as an admin.
4. All of these are saved to MongoDB and reflected immediately.

---

## Reference

**MongoDB collections (database `speccify`, 15 total):**
`adminusers`, `alloweddomains`, `adminotps`, `adminsessions`, `adminauditlogs` (admin auth) · `components`, `builds`, `verdicts`, `matchaliases`, `matchreviews`, `affiliatelinks`, `searchevents`, `clickevents`, `conversionevents`, `trendrollups` (app).

**Security checklist before go-live:**
- [ ] 27017 not reachable from the internet (localhost bind + NSG).
- [ ] Mongo `authorization: enabled`; app user is `readWrite` on `speccify` only.
- [ ] `server/.env` is git-ignored; Mongo password, RS256 private key, and SMTP password live only there.
- [ ] HTTPS working (padlock on speccify.info) so `Secure` cookies engage.
- [ ] Rotate any dev secrets that were ever committed; production uses freshly generated RS256 keys.
- [ ] Old `automatorr` DB kept as a backup until you've confirmed `speccify` is correct, then drop it.

**Ongoing:**
- Prices refresh nightly via the built-in scraper cron; run on demand with `npm run scrape --workspace server`.
- Deploy an update: `git pull && npm install && npm run build && sudo systemctl restart speccify`.

**Scope note:** this covers Subsystem A (admin auth, done), B (Mongo auth — Parts 1–2), and C (domain + HTTPS + deploy — Parts 3–4). Optional DB-link TLS is noted in Part 2.
