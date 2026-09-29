# Supabase Postgres setup for SIGMA SNAP

The API uses **two** connection strings from one Supabase project:

| Purpose | Where in Supabase dashboard | Port | Used by |
|---|---|---|---|
| Pooled (runtime) | Project Settings → Database → Connection string → **Session / Transaction pooler** | 6543 | `DATABASE_URL` — the API at runtime |
| Direct (migrations) | Project Settings → Database → Connection string → **Direct connection** | 5432 | `DIRECT_URL` — `prisma migrate deploy` / `db push` at container boot |

## 1. Create the project

1. Go to <https://supabase.com> → New project.
2. Pick a name (e.g. `sigma-snap`), a strong database password (save it — Supabase shows it once), and the region closest to your users/API host.
3. Wait for the project to finish provisioning.

## 2. Copy the connection strings

Project Settings → Database → Connection string:

- **Pooled:** choose the pooler URI. It looks like
  `postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true`
  → this becomes `DATABASE_URL` (keep `?pgbouncer=true`; the API's Prisma client talks through the pooler).
- **Direct:** choose the direct URI (port `5432`, host `db.<ref>.supabase.co`)
  → this becomes `DIRECT_URL` (used only for migrations/DDL at deploy boot).

Use the **service_role-safe** `postgres` credentials Supabase gives you for both; never commit them anywhere.

## 3. Baseline the schema (one time, from your machine)

The repo currently has `prisma/schema.prisma` but **no `prisma/migrations/` folder yet**.
Create the baseline migration once, locally, against the DIRECT connection:

```bash
cd ~/workspace/sigma-snap/apps/api
DIRECT_URL='postgresql://postgres.<ref>:<PASSWORD>@db.<ref>.supabase.co:5432/postgres' \
DATABASE_URL="$DIRECT_URL" \
npx prisma migrate dev --name init --schema ../../prisma/schema.prisma
```

This creates `prisma/migrations/` and applies it. **Commit the `prisma/migrations/` folder** —
from then on, every deploy runs `prisma migrate deploy` automatically at boot.

> Shortcut if you just want it live now: skip the baseline and let the API
> container run `prisma db push` on first boot (the entrypoint does this when no
> migrations folder exists). Then generate the baseline migration later with
> `prisma migrate dev` so future schema changes deploy cleanly.

## 4. Seed (one time)

The seed script creates the admin + demo accounts (change their passwords after):

```bash
# locally, against Supabase direct:
cd ~/workspace/sigma-snap
DATABASE_URL='postgresql://postgres.<ref>:<PASSWORD>@db.<ref>.supabase.co:5432/postgres' \
npm run seed --workspace apps/api
```

Or on Render after deploy, via the service's **Shell** tab (env vars are already set there):

```bash
node apps/api/dist/seed.js
```

## Prisma notes (for the implementing agent — schema NOT changed by this doc)

- The project uses **Prisma 5.22**, which fully supports `directUrl` on the
  datasource. Recommended addition to `prisma/schema.prisma`:
  ```prisma
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")   // pooled (6543) at runtime
    directUrl = env("DIRECT_URL")     // direct (5432) for migrate/diff
  }
  ```
  With `directUrl` set, `prisma migrate deploy` automatically uses `DIRECT_URL`
  and the runtime uses `DATABASE_URL` — no env juggling needed. Until that lands,
  the Docker entrypoint overrides `DATABASE_URL` with `DIRECT_URL` for the
  migrate step only.
- Supabase pooler + Prisma: keep `?pgbouncer=true` on the pooled URL.
- The sandbox quirk: in this build VM, `prisma validate` needs to be run from
  `apps/api/` (the `--schema ../../prisma/schema.prisma` path is cwd-relative)
  with the engine workaround env vars — see
  `apps/api/PRISMA_ENGINES_WORKAROUND.md`. Not needed on a normal machine.
