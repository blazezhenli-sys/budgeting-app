#!/bin/sh
set -eu

echo "[startup] Preparing database schema..."
if [ -d "prisma/migrations" ] && [ -n "$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d 2>/dev/null)" ]; then
  echo "[startup] Applying migrations (prisma migrate deploy)..."
  npm run db:migrate:deploy
else
  echo "[startup] No migration files found; syncing schema with prisma db push..."
  npm run db:push
fi

if [ "${RUN_DB_SEED_ON_STARTUP:-false}" = "true" ]; then
  echo "[startup] Running seed..."
  npm run db:seed
fi

echo "[startup] Starting app..."
exec npm run start
