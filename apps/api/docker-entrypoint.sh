#!/bin/sh
# SIGMA SNAP API — container entrypoint.
# Applies pending Prisma migrations (or pushes the schema on a brand-new DB),
# then starts the API. Safe to run on every boot: `migrate deploy` is idempotent.
set -eu

# Migrations/DDL should run against the DIRECT (non-pooled) connection when one
# is provided (Supabase: port 5432). Falls back to DATABASE_URL otherwise.
MIGRATE_URL="${DIRECT_URL:-${MIGRATION_DATABASE_URL:-$DATABASE_URL}}"

if [ -d "./prisma/migrations" ] && [ -n "$(ls -A ./prisma/migrations 2>/dev/null)" ]; then
  echo "[entrypoint] prisma/migrations found — running migrate deploy..."
  DATABASE_URL="$MIGRATE_URL" npx prisma migrate deploy --schema ./prisma/schema.prisma
else
  echo "[entrypoint] no prisma/migrations found — pushing schema with 'prisma db push'."
  echo "[entrypoint] (For a proper migration history, run 'prisma migrate dev' locally once, then redeploy.)"
  DATABASE_URL="$MIGRATE_URL" npx prisma db push --schema ./prisma/schema.prisma
fi

echo "[entrypoint] starting SIGMA SNAP API..."
exec node apps/api/dist/index.js
