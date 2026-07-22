# Speccify CI/CD — Operator Runbook

Everything below Stage 6 is **built and validated locally**. Stages 7–10 need
things only you can do (push access, a PAT, the VM, DNS). Do them in order.

## What exists in the repo

| Area | Files |
| --- | --- |
| Per-env config | `server/src/config.ts` (loads `server/.env.<NODE_ENV>`), `server/.env.*.example`, `client/.env.*`, `client/src/vite-env.d.ts` |
| E2E suite | `e2e/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/global-teardown.ts`, `e2e/lib/*`, `e2e/tests/smoke/*` (`@smoke`), `e2e/tests/ui/*` |
| Server test seam | `server/src/routes/testHooks.ts` (mounted only when `E2E_TEST_HOOKS=true` and not production) |
| Azure DevOps integration | `e2e/azdo/{config,client,scan-tests,run-context,sync-test-plan,coverage-gate,reporter,build-evidence-pdf,attach-evidence}.js` |
| Pipeline | `azure-pipelines.yml` (`trigger: none`, `gateMode` param, 5 stages) |
| Trigger/preview | `scripts/ci/trigger.mjs`, `scripts/ci/preview.mjs` → `npm run push:dev` / `promote:test` / `promote:prod` / `ci:preview` |
| Deploy artifacts | `scripts/deploy/deploy.sh`, `deploy/pm2/ecosystem.{test,prod}.config.cjs`, `deploy/nginx/{test.speccify.info,speccify.info}.conf` |

Gate modes: `gate` (smoke only), `gate-then-full` (deploy after smoke, full runs
after non-blocking), `full` (deploy after entire suite), `auto` (Test = gate-then-full,
Prod = full). The pipeline `dependsOn` wiring is per-mode via template expressions.

---

## Stage 7 — Push to Azure DevOps

**Need from you:** the ADO repo clone URL (Repos → Files → Clone in the empty
`AutomatorrSpeccify` project), e.g. `https://automatorr@dev.azure.com/automatorr/AutomatorrSpeccify/_git/AutomatorrSpeccify`.

```bash
# from repo root — GitHub stays as origin; ADO is a second remote 'azure'
git remote add azure <ADO_REPO_URL>
git add -A && git commit -m "CI/CD: per-env config, e2e + Azure DevOps integration, pipeline"
git push azure main

# create the long-lived branches from main
git push azure main:refs/heads/dev
git push azure main:refs/heads/test
```

Pushing does **not** start CI (`trigger: none`). That's intentional.

---

## Stage 8 — PAT, secrets, pipeline, Test Plan

### 8a. Create the PAT
User settings → Personal access tokens → New. Scopes:
- **Work Items** (Read & Write)
- **Test Management** (Read & Write)
- **Build** (Read & Execute)

> ⚠️ Regenerating a PAT's scopes **rotates its value**. Every time, update BOTH
> `e2e/.env` (local) AND the pipeline's `AZURE_DEVOPS_PAT` variable, or CI
> silently fails auth while local calls keep working.

### 8b. Local `e2e/.env`
```bash
cp e2e/.env.example e2e/.env
# then edit e2e/.env: paste AZURE_DEVOPS_PAT; leave the rest as-is for now
```

### 8c. Create the pipeline in ADO
Pipelines → New pipeline → Azure Repos Git → `AutomatorrSpeccify` → Existing
Azure Pipelines YAML file → `/azure-pipelines.yml` → **Save** (not "Save and run").
Note the numeric **pipeline id** (in the URL `?definitionId=<id>`), then add it to
`e2e/.env`: `AZDO_PIPELINE_ID=<id>`.

### 8d. Pipeline variables (Edit → Variables)
- `AZURE_DEVOPS_PAT` — the PAT, **secret**.
- `E2E_JWT_SECRET` — any strong random string, **secret** (auth signing in the E2E stages).

### 8e. Validate the YAML for every gate mode (free, no real run)
```bash
npm run ci:preview        # previews gate / gate-then-full / full / auto
```

### 8f. Bootstrap the Test Plan
```bash
npm run azdo:sync         # creates "Speccify Regression", suites, test cases
```
Coverage gate: any open **Task** on the board must have a test whose title
contains `[AB#<id>]`, or the Task is tagged `no-test`, or (emergency only) the
pipeline var `AZDO_GATE_SKIP=true` is set (it logs loudly).

---

## Stage 9 — VM provisioning (Test + Prod on ONE VM)

SSH in with your key:
```bash
ssh -i "C:/Users/AbishaiBajaj/.ssh/Automatorr-Website-VM_key.pem" <user>@<VM_PUBLIC_IP>
```
> **Need from you:** the VM public IP and SSH username (Azure Ubuntu default is
> usually `azureuser`). NSG must allow inbound 22 (your IP), 80, 443. Never open 27017.

### 9a. Runtimes
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx
sudo npm i -g pm2
# MongoDB 7 — follow mongodb.com apt steps for Ubuntu 22.04, then:
sudo systemctl enable --now mongod
```

### 9b. Two databases (one mongod, separate DBs), then enable auth
```bash
mongosh
```
```javascript
use speccify_test
db.createUser({ user: "speccify_app", pwd: "STRONG_TEST_PW", roles: [{ role: "readWrite", db: "speccify_test" }] })
use speccify_prod
db.createUser({ user: "speccify_app", pwd: "STRONG_PROD_PW", roles: [{ role: "readWrite", db: "speccify_prod" }] })
exit
```
Set `security.authorization: enabled` and `net.bindIp: 127.0.0.1` in
`/etc/mongod.conf`, then `sudo systemctl restart mongod`.

### 9c. Directories + two checkouts
```bash
sudo mkdir -p /var/www/speccify-test /var/www/speccify-prod
sudo chown -R $USER:$USER /var/www/speccify-test /var/www/speccify-prod
git clone <ADO_REPO_URL> /var/www/speccify-test/current && (cd /var/www/speccify-test/current && git checkout test)
git clone <ADO_REPO_URL> /var/www/speccify-prod/current && (cd /var/www/speccify-prod/current && git checkout main)
```

### 9d. Env files on each checkout (gitignored; git never overwrites them)
```bash
# TEST checkout
cd /var/www/speccify-test/current
cp server/.env.test.example server/.env.test          # then edit: MONGO_URI (speccify_test + STRONG_TEST_PW),
                                                      # SMTP_PASS, and RS256 keys or JWT_SECRET
npm run generate-keys --workspace server              # paste ADMIN_JWT_* into server/.env.test (or set JWT_SECRET)
cp client/.env.test.example client/.env.test          # VITE_BASE_API_URL=/api (already set)

# PROD checkout
cd /var/www/speccify-prod/current
cp server/.env.production.example server/.env.production   # MONGO_URI (speccify_prod + STRONG_PROD_PW), SMTP, keys
npm run generate-keys --workspace server                  # prod REQUIRES RS256 keypair or JWT_SECRET
cp client/.env.production.example client/.env.production
```

### 9e. First build + seed + PM2 (per checkout)
```bash
cd /var/www/speccify-test/current && npm ci && npm run build --workspace shared && npm run build --workspace server && npm run build --workspace client -- --mode test && NODE_ENV=test npm run seed --workspace server && pm2 start deploy/pm2/ecosystem.test.config.cjs
cd /var/www/speccify-prod/current && npm ci && npm run build --workspace shared && npm run build --workspace server && npm run build --workspace client -- --mode production && NODE_ENV=production npm run seed --workspace server && pm2 start deploy/pm2/ecosystem.prod.config.cjs
pm2 save && pm2 startup   # run the printed command so PM2 survives reboots
```

### 9f. deploy.sh on the VM (used by the pipeline over SSH)
```bash
sudo cp /var/www/speccify-prod/current/scripts/deploy/deploy.sh /opt/speccify/deploy.sh 2>/dev/null || (sudo mkdir -p /opt/speccify && sudo cp /var/www/speccify-prod/current/scripts/deploy/deploy.sh /opt/speccify/deploy.sh)
sudo chmod +x /opt/speccify/deploy.sh
```

### 9g. Nginx sites
```bash
sudo cp /var/www/speccify-prod/current/deploy/nginx/test.speccify.info.conf /etc/nginx/sites-available/
sudo cp /var/www/speccify-prod/current/deploy/nginx/speccify.info.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/test.speccify.info.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/speccify.info.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 9h. DNS (Namecheap → Advanced DNS) — neither points at the VM yet
Add A records → your VM public IP:
- `@`   → `<VM_PUBLIC_IP>`
- `www` → `<VM_PUBLIC_IP>`
- `test`→ `<VM_PUBLIC_IP>`

Confirm with `dig +short speccify.info` / `dig +short test.speccify.info`.

### 9i. TLS
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d speccify.info -d www.speccify.info -d test.speccify.info
```

### 9j. ADO deploy plumbing
- Project Settings → **Service connections** → new **SSH** connection named
  `speccify-vm` (host = VM IP, username, the private key).
- Pipelines → **Environments** → create `speccify-test` and `speccify-prod`
  (add approvals on `speccify-prod` if you want a manual gate before prod).

---

## Stage 10 — First real run

```bash
npm run push:dev        # prompts gate mode + note → tests + Test Run, NO deploy
npm run promote:test    # dev → test → deploys to test.speccify.info on a passing gate
npm run promote:prod    # test → main → deploys to speccify.info (default gate: full)
```
Watch each run in Pipelines. Verify a Test Run appears under **Test Plans →
Runs**, and (full mode) an evidence PDF is attached to that build's run(s).

---

## Env / secret quick reference

| Where | Keys |
| --- | --- |
| `server/.env.<env>` (VM, gitignored) | `MONGO_URI`, `PORT` (8101 test / 8102 prod), `CLIENT_URL`, `APP_URL`, `ADMIN_JWT_*` or `JWT_SECRET`, SMTP\_\* |
| `client/.env.<env>` (gitignored) | `VITE_BASE_API_URL=/api` |
| `e2e/.env` (local, gitignored) | `AZURE_DEVOPS_PAT`, `AZDO_PIPELINE_ID`, `AZDO_PROJECT`, `AZDO_ORG_URL` |
| Pipeline variables (ADO) | `AZURE_DEVOPS_PAT` (secret), `E2E_JWT_SECRET` (secret) |

## Gotchas already handled in code
- Invalid PAT returns **HTTP 200 + HTML** → `client.js` detects non-JSON 2xx and throws a clear error.
- `buildIds` is silently ignored → `attach-evidence.js` filters by `buildUri` only.
- `pointIds` at run creation double-counts → `reporter.js` passes `plan.id`, never `pointIds`.
- Retries fire the reporter per attempt → `reporter.js` dedupes to the final attempt.
- Frontend needs its own CI env → pipeline writes `client/.env.production` before building.
- Destructive teardown → guarded to disposable `*e2e*`/`*ci*` DBs on localhost only.
