#!/usr/bin/env bash
#
# VM-side deploy for Speccify. Invoked by the pipeline over SSH:
#   /opt/speccify/deploy.sh <test|prod> [commit]
#
# Test and Prod are separate checkouts on the SAME VM, each with its own port,
# PM2 process, Nginx site and database. Real secrets live in gitignored env
# files inside each checkout (server/.env.<NODE_ENV>, client/.env.<mode>),
# created ONCE during provisioning — git operations never touch untracked files.
set -euo pipefail

ENVN="${1:-}"
COMMIT="${2:-}"

case "$ENVN" in
  test) PORT=8101; NODE_ENV=test;       VITE_MODE=test;       PM2=speccify-test-backend;;
  prod) PORT=8102; NODE_ENV=production; VITE_MODE=production; PM2=speccify-prod-backend;;
  *) echo "usage: deploy.sh <test|prod> [commit]"; exit 2;;
esac

REPO="/var/www/speccify-$ENVN/current"
echo "→ Deploying $ENVN (port $PORT, NODE_ENV=$NODE_ENV) from $REPO"
cd "$REPO"

git fetch --all --prune
if [ -n "$COMMIT" ]; then
  git checkout -f "$COMMIT"
else
  git pull --ff-only
fi

npm ci
npm run build --workspace shared
npm run build --workspace server
npm run build --workspace client -- --mode "$VITE_MODE"

# Sanity: the env file this environment loads must exist.
if [ ! -f "server/.env.$NODE_ENV" ]; then
  echo "✗ Missing server/.env.$NODE_ENV on the VM. Create it from the template before deploying." >&2
  exit 1
fi

pm2 startOrReload "deploy/pm2/ecosystem.$ENVN.config.cjs" --update-env
pm2 save
echo "✓ $ENVN deploy complete — $PM2 reloaded on 127.0.0.1:$PORT"
