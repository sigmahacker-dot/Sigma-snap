# SIGMA SNAP — System Architecture

## 1. Overview

SIGMA SNAP is a camera-first social + messaging platform. The camera is the home screen;
everything else (stories, spotlight feed, chat, calls, creator tools, admin) radiates from it.
All branding, UI, icons, lens effects, sounds and templates are **original** — designed for
this project, not copied from any existing product (see §8 Originality note).

## 2. Monorepo layout

```
sigma-snap/
├── apps/api/            # Node 20+ · TypeScript · Express · Prisma · Socket.IO
│   └── src/
│       ├── index.ts            # bootstrap (http + socket.io + workers)
│       ├── config/             # env, plans/feature flags
│       ├── db/                 # prisma client singleton
│       ├── middleware/         # auth (JWT), rbac, rateLimit, validate (zod), audit
│       ├── modules/            # one folder per domain:
│       │   └── {auth,users,friends,stories,posts,search,sounds,
│       │        lenses,effects,templates,ai,conversations,messages,
│       │        calls,notifications,subscriptions,admin,moderation,media}
│       │       └── {*.controller.ts, *.service.ts, *.routes.ts, *.schemas.ts}
│       ├── realtime/           # socket.io server, event handlers, presence
│       ├── queue/              # BullMQ queues + FFmpeg worker + schedulers
│       ├── services/           # storage (S3 presign), push, aiProvider, malwareScan
│       └── seed.ts             # demo users + admin + sample content
├── apps/web/            # Next.js 14 App Router · TypeScript · Tailwind
│   └── app/  (routes)   # (auth)/login, (auth)/register, camera, editor,
│                        # stories, spotlight, chat, calls, friends, profile,
│                        # map, search, notifications, creator, ai, templates, admin
├── packages/lens-sdk/   # framework-agnostic AR lens engine
│   └── src/  Lens interface · LensRegistry · LensEngine (canvas renderer)
│             · FaceDetector interface (pluggable) · 12+ original lenses
├── packages/shared/     # shared TS types, plan/feature-flag constants
├── prisma/schema.prisma # single source of truth for the data model
└── docs/                # ARCHITECTURE.md · API.md · BUILD_NOTES.md
```

## 3. Service map

| Concern | Technology | Notes |
|---|---|---|
| API | Express + TypeScript | Modular controllers/services, zod validation |
| DB | PostgreSQL + Prisma | Schema in `prisma/`; soft delete via `deletedAt` |
| Cache / queue | Redis + BullMQ | Video processing jobs, AI jobs, notifications fan-out |
| Realtime | Socket.IO | Chat, typing, receipts, presence, notifications, call signaling |
| Media storage | S3-compatible (MinIO locally) | Presigned PUT/GET; never expose secret keys to web |
| Video processing | FFmpeg worker (BullMQ) | Transcode, thumbnails, trims; abstracts to a `VideoProcessor` interface |
| Search | PostgreSQL full-text (default) | `SearchProvider` interface; OpenSearch/Elastic adapter optional via env |
| Calls | WebRTC (peer-to-peer) | Socket.IO only for signaling; TURN/STUN via env |
| Push | Provider abstraction | `PushProvider` interface; FCM/APNs via env, no-op fallback |
| AI | Provider abstraction | `AiProvider` interface (`AI_PROVIDER=local|openai|...`); offline procedural fallback |
| Malware scan | Scanner abstraction | `MalwareScanner` interface; ClamAV/3rd-party via env, allow-list fallback |
| Auth | JWT (access+refresh) + bcrypt | OAuth provider abstraction; admin 2FA via TOTP |

## 4. Key data flows

### 4.1 Capture → upload → process → feed
1. Web captures photo (canvas) or video (MediaRecorder) → requests `POST /api/v1/media/presign`
   with `{kind, mimeType, sizeBytes}`.
2. API validates plan quota + file rules, returns presigned PUT URL + `assetId`.
3. Web uploads bytes directly to S3/MinIO, then `POST /api/v1/media/:id/complete`.
4. API enqueues BullMQ `video:process` job (FFmpeg: transcode renditions, thumbnail,
   duration probe). Photo path marks READY immediately after validation.
5. Worker updates `MediaAsset`/`Video` rows; `POST /api/v1/posts` can reference ready assets.
6. Feed reads ranked posts; view events increment counters + daily `CreatorAnalytics`.

### 4.2 Realtime chat
Socket.IO namespace `/` with JWT auth. Client joins `conversation:{id}` rooms.
`message:send` → service persists → emits `message:new` to room + `notification:new` to
recipient's user room. Typing/read receipts are ephemeral events (also persisted for reads).
Disappearing messages: `expiresAt` set at send; a scheduler hard-deletes expired rows.

### 4.3 24h story expiry
`Story.expiresAt = createdAt + 24h`. A node-cron scheduler (every 15 min) marks expired
stories (soft-delete or archive flag) and prunes `StoryView` rows. All story queries filter
`expiresAt > now()` and `deletedAt IS NULL`.

### 4.4 WebRTC call signaling
`POST /api/v1/calls` creates a `Call` row (RINGING) → `call:incoming` to callee's user room.
SDP/ICE flow over socket events (`call:offer`, `call:answer`, `call:ice-candidate`).
Media is peer-to-peer; the server never sees audio/video. Hangup/miss updates `Call.status`
and appends to call history.

### 4.5 Prompt-based AI effect ("cinematic rainy night")
`POST /api/v1/ai/effect {prompt, language}` → `AiProvider` (or local fallback) maps the
prompt to an effect pipeline: `{filter, overlays[], colorGrade, audio?}`. The web client
applies it with the canvas editor / lens engine. Every generation is logged to
`AiGeneration` for the admin AI-usage dashboard.

## 5. Lens SDK architecture

`packages/lens-sdk` is framework-agnostic:

- `Lens` interface: `{id, name, category, isPremium, thumbnail(), apply(ctx, frame, faces, t)}`.
  New lenses are added by dropping a file into `src/lenses/` and registering it —
  core engine code never changes.
- `FaceDetector` interface: `detect(video): Promise<FaceBox[]>` — pluggable; ships with
  `HeuristicFaceDetector` (center-weighted fallback) and accepts any real detector
  (e.g. MediaPipe/TF.js) via `engine.setDetector()`.
- `LensEngine`: owns a `<canvas>`, runs `requestAnimationFrame`, draws the camera frame,
  runs detection at a throttled rate, then calls the active lens's `apply()`.
- All 12+ bundled lenses are **original procedural effects** (canvas 2D math):
  neon contours, prism rain, galaxy dust, sketch ink, thermal wave, glitch static,
  aurora wash, cartoon cel, starlight bokeh, CRT scanlines, mono chrome, candy swirl…

## 6. Security model

- JWT access (15 min) + rotating refresh tokens; bcrypt (cost 12) password hashing.
- RBAC: `USER < MODERATOR < ADMIN`; admin routes require ADMIN; admin 2FA (TOTP).
- Rate limiting (express-rate-limit): strict on auth, lenient on reads; per-user quotas.
- zod validation on every input; file validation (MIME sniffing, size caps per plan).
- Signed, time-limited media URLs; private buckets; no secret keys in frontend code.
- CSRF: SameSite cookies for refresh; state-changing API uses Bearer tokens.
- Audit log on every admin/moderation action; appeals workflow for bans/removals.

## 7. Plans & feature flags

`Plan`: FREE / PRO / CREATOR. `FeatureFlag` rows gate premium capabilities
(premium lenses, AI credits, export quality, cloud storage, advanced analytics,
premium templates). Server enforces; client only reflects.

## 8. Originality note

SIGMA SNAP ships **zero** third-party-copyrighted creative assets:
- Brand: original name, original hex-sigil logo (drawn SVG), palette
  `void #0B0B12 / violet #7C5CFF / cyan #38E1FF` — not Snapchat yellow.
- Icons: hand-drawn original 24px line-icon SVG set (`apps/web/lib/icons.tsx`).
- Lenses/effects: original procedural canvas algorithms (no copied filters).
- Sounds: synthesized in-browser with WebAudio oscillators (`apps/web/lib/sounds.ts`);
  the sound library seeds **metadata only** — no copyrighted music files.
- Templates: original compositions created for this project.
- AI copy (captions/hashtags) is generated, not scraped.
