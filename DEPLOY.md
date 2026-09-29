# SIGMA SNAP — production deployment

Three pieces, three hosts:

| Piece | Host | Why |
|---|---|---|
| **Database** | Supabase (free Postgres) | Managed Postgres + pooler |
| **API** (Express + Socket.IO + BullMQ) | **Render** (Docker web service) + Render Redis | Needs an always-on server — Vercel serverless functions **cannot** hold WebSocket connections |
| **Web app** (Next.js) | **Vercel** | Native Next.js hosting |

Alternatives: **Fly.io** instead of Render (§5), or everything on **one VPS** via `docker-compose.prod.yml` (§6).

Prerequisites: this repo pushed to GitHub; accounts on Supabase, Render, Vercel.

---

## A. Database — Supabase

Full walkthrough: [`docs/supabase-setup.md`](docs/supabase-setup.md). Short version:

1. Create a Supabase project, save the DB password.
2. Project Settings → Database → copy the **pooled** URI (port 6543, `?pgbouncer=true`) → `DATABASE_URL`.
3. Copy the **direct** URI (port 5432) → `DIRECT_URL`.
4. Baseline migration (one time, locally, from `apps/api/`):
   ```bash
   DIRECT_URL='<direct-5432-uri>' DATABASE_URL='<direct-5432-uri>' \
     npx prisma migrate dev --name init --schema ../../prisma/schema.prisma
   ```
   Commit the generated `prisma/migrations/` folder.
5. Seed (one time) — creates `admin@sigmasnap.app` / `SigmaAdmin123!` and demo users:
   ```bash
   DATABASE_URL='<direct-5432-uri>' npm run seed --workspace apps/api
   ```
   **Change these passwords immediately after first login** (Profile → Settings).

## B. API — Render

1. Render dashboard → **New → Blueprint** → select the GitHub repo.
   `render.yaml` provisions `sigma-snap-api` (Docker) + `sigma-snap-redis`.
2. When prompted, fill the `sync: false` values:
   - `DATABASE_URL` — Supabase pooled URI (step A2)
   - `DIRECT_URL` — Supabase direct URI (step A3)
   - `WEB_URL` — your Vercel URL, e.g. `https://sigma-snap.vercel.app` (no trailing slash). **Set this before testing login** — it drives CORS and cookie behavior.
   - `S3_*` — object storage. Easiest: Supabase Storage's S3-compatible endpoint (`https://<ref>.storage.supabase.co/storage/v1/s3`, region `us-east-1`, path-style `true`), or any S3 provider / MinIO.
3. `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are auto-generated. Everything else has working defaults for a first deploy.
4. Deploy. The container entrypoint runs `prisma migrate deploy` (via `DIRECT_URL`), then starts the API.

### API env-var reference (from `apps/api/src/config/env.ts`)

| Var | Required? | Notes |
|---|---|---|
| `NODE_ENV` | set to `production` | Enables `secure` cookies, prod behavior |
| `PORT` | Render injects (`10000`) | App listens on `env.PORT` |
| `DATABASE_URL` | **yes** | Supabase pooled (6543, `?pgbouncer=true`) |
| `DIRECT_URL` | **yes** | Supabase direct (5432); migrations only (see note) |
| `REDIS_URL` | auto (Render Redis) | Cache + BullMQ |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | **yes** (generated) | Min 32 random chars; never reuse dev defaults |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | no | Defaults `15m` / `30d` |
| `WEB_URL` | **yes** | Public web origin — must exactly match the Vercel URL (CORS) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_PUBLIC_URL`, `S3_FORCE_PATH_STYLE` | **yes** | Media uploads; no working media without these |
| `AI_PROVIDER` | no | `local` (default, offline) |
| `AI_API_KEY`, `AI_MODEL` | no | Only when `AI_PROVIDER` is external |
| `PUSH_PROVIDER` | no | `noop` default; `fcm` needs `FCM_SERVER_KEY` |
| `STUN_URLS` | no | Default Google STUN; `TURN_*` only if you run a TURN server |
| `MALWARE_SCANNER` / `CLAMAV_HOST` | no | `none` default |
| `SEARCH_PROVIDER` / `OPENSEARCH_URL` | no | `postgres` full-text default |
| `OAUTH_GOOGLE_CLIENT_ID/SECRET` | no | Only for Google OAuth login |
| `SUBSCRIPTION_PROVIDER` / `SUBSCRIPTION_API_KEY` | no | Payment provider for Pro plans |

> `DIRECT_URL` note: the Prisma schema currently declares only `url = env("DATABASE_URL")`.
> Prisma 5.22 supports `directUrl = env("DIRECT_URL")` — adding it is recommended so
> migrations automatically use the direct connection. Until then, the Docker
> entrypoint overrides `DATABASE_URL` with `DIRECT_URL` for the migrate step only.

## C. Web app — Vercel

No `vercel.json` needed — defaults work. Project settings:

| Setting | Value |
|---|---|
| Root Directory | repository root (default) |
| Framework Preset | Next.js |
| Build Command | `npm run build:web` (runs `next build` in `apps/web`) |
| Output Directory | `apps/web/.next` |
| Install Command | default (`npm install`; npm workspaces hoist to root) |

Environment variables (all three are read by the code; baked in at build time):

| Var | Value | Required? |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://sigma-snap-api.onrender.com` (your Render API URL, no trailing slash) | **yes** |
| `NEXT_PUBLIC_SOCKET_URL` | same as above | **yes** |
| `NEXT_PUBLIC_STUN_URLS` | `stun:stun.l.google.com:19302` | no (has default) |

After Vercel assigns the production URL, go back to Render and set `WEB_URL` to exactly that origin, then redeploy/restart the API.

## D. Verification checklist

```bash
API=https://sigma-snap-api.onrender.com
curl -s $API/api/v1/health
# → {"status":"ok","service":"sigma-snap-api",...}
```

1. **Health:** above returns `status: ok`.
2. **Signup:** `POST $API/api/v1/auth/register` with
   `{"email":"you@example.com","username":"you","password":"longpassword1","displayName":"You"}`
   → `201` with user object. (Or use the web `/register` page.)
3. **Login:** `POST $API/api/v1/auth/login` with `{"emailOrUsername":"you","password":"..."}`
   → `200` with `accessToken`. Then `GET $API/api/v1/auth/me` with
   `Authorization: Bearer <token>` → `200`.
4. **Realtime round-trip:** open the web app in two browsers (or two accounts),
   log in as different users, add each other as friends, send a chat message —
   it must appear on the other side without refresh, and a notification is created.
5. **Media:** upload a photo from the camera tab → it should render from the S3 public URL.
6. **Migrations:** Render deploy logs show `prisma migrate deploy` applied N migrations with no errors.

---

## 5. Alternative: Fly.io instead of Render

Fly.io keeps a cheap always-on machine (no free-tier sleeping):

```bash
fly launch --name sigma-snap-api --dockerfile apps/api/Dockerfile --no-deploy
fly redis create --name sigma-snap-redis   # or Upstash Redis
fly secrets set DATABASE_URL='<pooled>' DIRECT_URL='<direct>' \
  JWT_ACCESS_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)" \
  WEB_URL='https://sigma-snap.vercel.app' S3_ENDPOINT='...' S3_ACCESS_KEY='...' \
  S3_SECRET_KEY='...' S3_BUCKET='sigmasnap' S3_PUBLIC_URL='...' NODE_ENV=production
fly deploy --dockerfile apps/api/Dockerfile
```

(One `fly.toml` can be added later; the Dockerfile + entrypoint already handle migrations.)

## 6. Alternative: everything on one VPS

```bash
# .env.prod with: POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, JWT_ACCESS_SECRET,
# JWT_REFRESH_SECRET, WEB_URL, S3_PUBLIC_URL, NEXT_PUBLIC_API_URL (+ API_PORT/WEB_PORT)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Put Caddy/Nginx in front for HTTPS (`WEB_URL`/`NEXT_PUBLIC_API_URL` must be `https://`).

## Known deployment caveats (flagged, not fixed here)

1. **Cross-origin refresh cookie.** The API sets the refresh cookie with
   `SameSite=Lax`. With the web app on Vercel and the API on Render (different
   sites), browsers will **not** send the cookie on `fetch` — silent token refresh
   breaks and users get logged out after the 15-minute access-token TTL. Fix
   (app source): use `SameSite=None; Secure` for the refresh cookie in production.
2. **Render free tier sleeps.** Idle free web services spin down; the first request
   cold-starts (~30–60s) and WebSocket connections drop while asleep. Use
   `starter`+ for always-on, or Fly.io/VPS.
3. **No `prisma/migrations/` yet.** First boot uses `prisma db push`; generate the
   baseline migration (§A4) so later schema changes deploy via `migrate deploy`.
4. **Seed credentials are public defaults** — rotate `admin@sigmasnap.app` /
   `SigmaAdmin123!` immediately after first deploy.
