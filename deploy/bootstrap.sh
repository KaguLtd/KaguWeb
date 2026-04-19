#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/srv/kagu/app"
STORAGE_ROOT="/srv/kagu/storage"
UPLOAD_TEMP_ROOT="/srv/kagu/tmp/uploads"
RUNTIME_ROOT="/srv/kagu/runtime"

sudo mkdir -p "$APP_ROOT" "$STORAGE_ROOT" "$UPLOAD_TEMP_ROOT" "$RUNTIME_ROOT"
sudo chown -R kagu:kagu /srv/kagu

cd "$APP_ROOT"

npm ci
npm run prisma:generate
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npm run build

sudo cp deploy/kagu-api.service /etc/systemd/system/kagu-api.service
sudo cp deploy/kagu-web.service /etc/systemd/system/kagu-web.service
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile

sudo systemctl daemon-reload
sudo systemctl enable --now kagu-api.service
sudo systemctl enable --now kagu-web.service
sudo systemctl reload caddy
