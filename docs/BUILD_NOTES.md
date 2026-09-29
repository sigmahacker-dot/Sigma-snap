# SIGMA SNAP — Build Notes

Honest accounting of what was built, what is real, what is abstracted, and how to run it.
Phase 4 verification (2026-09-29): `npm run build` passes for all 4 workspaces,
`prisma validate` → "schema is valid", API boots and serves (health + validation smoke-tested).

## What is fully real (no mocks)

- **Auth**: register/login with bcrypt-12, username rules (`^[a-z0-9._]{3,24}$`, change ≤ 1/30 days),
  JWT access (15m) + rotating refresh in httpOnly cookie, RBAC (USER/MODERATOR/ADMIN), rate limits.
- **Camera**: real `getUserMedia` (front/rear), tap-to-focus, pinch-to-zoom, torch/flash/timer/grid/
  safe-area/resolution/fps controls, photo via canvas, hold-to-record video via MediaRecorder
  (60s limit), 5 modes (photo/video/portrait/slow-mo/timelapse), lens carousel.
- **Lens engine**: 16 original procedural canvas lenses; pluggable `FaceDetector` interface
  (ships with a heuristic fallback detector — see gaps).
- **Editor**: real canvas pipeline — filters, adjust, crop/rotate/flip, text layers, original SVG
  stickers, drawing, music attach + trim + fade, voiceover recording, WebAudio mixdown export,
  trim/split/segments/transitions, speed, AI-effect overlays.
- **Stories**: composer (upload/capture, text/stickers/music/location/mentions/polls/questions,
  privacy incl. close-friends + hide-from), 24h expiry (scheduler), viewer with progress,
  viewer list, replies, reactions, archive, highlights.
- **Spotlight**: ranked feed (recency + engagement + follow boost), vertical snap feed,
  like/comment/share/save/follow, sound sheets, hashtags, search, reporting.
- **Chat**: 1:1 + group, text/image/video/voice (MediaRecorder), stickers, reactions, replies,
  forwarding, deletion, typing indicators, presence, read receipts, disappearing messages.
- **Calls**: real WebRTC 1:1 voice/video via Socket.IO signaling; mute/camera/speaker controls;
  call history. Group calls are best-effort mesh (≤4 tiles, see gaps).
- **Friends/profiles/map/search/notifications/creator/templates/admin/moderation**: all wired
  to real API endpoints with loading/error/empty/success states.

## Service abstractions (env-configured, honest 501s when unconfigured)

| Concern | Abstraction | Default (works offline) |
|---|---|---|
| AI (`AI_PROVIDER`) | `AiProvider` interface | `local` — procedural captions/hashtags/titles/scripts/ideas in 5 languages (ur, roman-ur, en, ar, hi) + keyword→pipeline effect generator. `http` provider stub returns 501 unless configured. |
| AI voice (`POST /ai/voice`) | — | 501 `PROVIDER_NOT_CONFIGURED` with local provider (no TTS bundled). |
| Push (`PUSH_PROVIDER`) | `PushProvider` | `noop` — in-app + socket notifications work; native push needs FCM/APNs keys. |
| OAuth (`OAUTH_*`) | provider stub | 501 unless configured. |
| Checkout (`POST /subscriptions/checkout`) | provider stub | 501 unless a billing provider is wired. |
| Malware scan (`MALWARE_SCANNER`) | `MalwareScanner` | allow-list `none` impl; MIME + size validation always enforced. |
| Search (`SEARCH_PROVIDER`) | `SearchProvider` | `postgres` full-text; OpenSearch adapter is a stub. |
| TURN (`TURN_*`) | env | STUN default; UI warns when ICE fails without TURN. |

## Environment variables

See `apps/api/.env.example` (all groups: server, DB, Redis, JWT, S3/MinIO, AI, push,
WebRTC, malware, search, OAuth) and `apps/web/.env.example` (`NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_STUN_URLS`). Never commit real secrets; only
`NEXT_PUBLIC_*` reaches the browser bundle.

## Seed credentials (from `apps/api/src/seed.ts`)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@sigmasnap.app` | `SigmaAdmin123!` |
| Demo | `nova@sigmasnap.app` | `SigmaDemo123!` |
| Demo | `pixel@sigmasnap.app` | `SigmaDemo123!` |

Seed also creates follows, a friendship, 2 posts, 1 story, 3 original sounds (metadata),
4 lenses, 2 templates, 5 feature flags.

## How to run

```bash
docker compose up -d            # postgres + redis + minio (your own machine)
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm run prisma:generate
npm run prisma:migrate           # or: prisma migrate deploy
npm run seed
npm run dev:api                 # :4000
npm run dev:web                 # :3000
```

## Known gaps / limitations

1. **Face detection is heuristic** — the bundled `HeuristicFaceDetector` is a center-weighted
   motion-aware estimate, not ML face detection. Plug a MediaPipe/TF.js detector via
   `engine.setDetector()` for production. Face-anchored lenses degrade gracefully.
2. **Video export is WebM** in most browsers (MediaRecorder); MP4 only where supported.
   Export is real-time (a 30s clip takes ~30s to render).
3. **Reverse video** is not implemented — the UI says so honestly instead of faking it.
4. **Group calls** are a best-effort mesh (signaling passthrough lacks offerer attribution
   for full N×N); 1:1 calls are complete.
5. **Screenshot detection** is not claimed anywhere (per spec — not guaranteed on all OSes).
6. **Story polls** have no dedicated vote endpoint — votes arrive as DM replies to the owner.
7. **Public profile post grids** — no list-other-user-posts endpoint in the contract; shows an
   honest empty state.
8. **Conversation mute** is client-side (localStorage); no server endpoint in the contract.
9. **Light theme** toggle lives in Settings and re-applies per page; a truly global theme
   needs a layout-level boot (layout.tsx was frozen during parallel work).
10. **No database was available in this sandbox** — migrations and seed were not executed
    here; run them against real Postgres before launch.
11. **Prisma engines in this sandbox** needed a curl-based workaround (proxy blocks prisma's
    own downloader): see `apps/api/PRISMA_ENGINES_WORKAROUND.md`. A fresh `npm install`
    wipes `node_modules/@prisma/engines` — repeat the workaround (env vars
    `PRISMA_SCHEMA_ENGINE_BINARY` / `PRISMA_QUERY_ENGINE_LIBRARY`).
12. AI "thumbnail"/"subtitles"/"background" with the local provider return heuristic
    results (composite specs, timing heuristics) — real quality needs an AI provider key.
