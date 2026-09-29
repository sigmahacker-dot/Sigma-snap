# SIGMA SNAP

A production-grade, camera-first social + messaging platform with an original brand,
original AR lens engine, realtime chat, WebRTC calls, stories, spotlight feed,
creator tools, templates, AI tools, moderation and an admin panel.

**100% original assets** — brand, icons, lenses, sounds, templates. See
`docs/ARCHITECTURE.md` §8.

## Quickstart (local dev)

Prereqs: Node ≥ 20, npm ≥ 10. Docker (only for the infra below, on your own machine).

```bash
# 1. Infrastructure (postgres + redis + minio) — on your own machine:
docker compose up -d

# 2. Install dependencies (npm workspaces):
npm install

# 3. Configure:
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# edit DATABASE_URL / REDIS_URL / S3_* / JWT secrets as needed

# 4. Database:
npm run prisma:generate
npm run prisma:migrate        # creates tables (needs postgres running)

# 5. Seed demo data (users + admin + sample content):
npm run seed

# 6. Run:
npm run dev:api   # http://localhost:4000
npm run dev:web   # http://localhost:3000  (camera home screen)
```

Production build check:

```bash
npm run build                 # builds shared → lens-sdk → api → web
npm run prisma:validate       # validates prisma/schema.prisma
```

## Demo / seed credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@sigmasnap.app` | `SigmaAdmin123!` |
| Demo user | `nova@sigmasnap.app` | `SigmaDemo123!` |
| Demo user | `pixel@sigmasnap.app` | `SigmaDemo123!` |

(Seeded by `apps/api/src/seed.ts`. Change immediately in any shared environment.)

## Repo layout

- `apps/api` — Express + TypeScript API, Socket.IO realtime, BullMQ + FFmpeg workers
- `apps/web` — Next.js App Router + Tailwind frontend (camera is the home screen)
- `packages/lens-sdk` — pluggable AR lens engine + 12 original procedural lenses
- `packages/shared` — shared types + plan/feature-flag constants
- `prisma/schema.prisma` — full database schema
- `docs/API.md` — REST + WebSocket specification
- `docs/BUILD_NOTES.md` — honest build accounting, env vars, gaps

## Environment variables

See `apps/api/.env.example` and `apps/web/.env.example`. Key groups:
`DATABASE_URL`, `REDIS_URL`, `JWT_*`, `S3_*` (endpoint, keys, bucket),
`AI_PROVIDER`/`AI_API_KEY`, `PUSH_*`, `TURN_*`, `MALWARE_*`, `OAUTH_*`.
Never commit real secrets; never expose them to the web bundle
(only `NEXT_PUBLIC_*` reaches the browser).
