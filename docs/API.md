# SIGMA SNAP — API Specification

Base URL: `{API_URL}/api/v1` (web uses `NEXT_PUBLIC_API_URL`).
Auth: `Authorization: Bearer <accessToken>` unless noted. Refresh via httpOnly cookie.
Errors: `{ "error": { "code": "string", "message": "string", "details?": any } }`.
Pagination: `?page=&limit=&cursor=` → `{ "data": [...], "page": { "nextCursor": "…|null" } }`.
All timestamps ISO-8601. Soft-deleted rows are never returned.

---

## 1. Auth — `/auth`

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| POST | `/auth/register` | no | `{email, username, password, displayName}` → `{user, accessToken}`; sets refresh cookie. Username rules: 3–24 chars, `[a-z0-9._]`, change ≤ 1 / 30 days. |
| POST | `/auth/login` | no | `{emailOrUsername, password}` → `{user, accessToken}` |
| POST | `/auth/refresh` | cookie | rotates refresh → `{accessToken}` |
| POST | `/auth/logout` | yes | clears refresh cookie |
| GET | `/auth/me` | yes | current user + profile + plan + flags |
| POST | `/auth/change-password` | yes | `{currentPassword, newPassword}` |
| POST | `/auth/oauth/:provider` | no | abstraction; 501 unless `OAUTH_*` configured |

Rate limits: 10 req/min per IP on register/login.

## 2. Media upload — `/media`

| Method | Path | Body / Notes |
|---|---|---|
| POST | `/media/presign` | `{kind: PHOTO\|VIDEO\|AUDIO\|THUMBNAIL, mimeType, sizeBytes}` → `{assetId, uploadUrl, expiresAt}`. Enforces plan quotas + MIME allow-list. |
| POST | `/media/:id/complete` | `{width?, height?, durationSec?}` → marks UPLOADED, enqueues processing for VIDEO |
| GET | `/media/:id` | asset metadata (owner or public context) |

## 3. Users — `/users`

| Method | Path | Notes |
|---|---|---|
| GET | `/users/search?q=` | username/displayName search, excludes blocked |
| GET | `/users/suggestions` | follow-graph + activity suggestions |
| GET | `/users/:username` | public profile (respects privacy/blocks) |
| PATCH | `/users/me` | `{displayName?, bio?, website?, location?}` |
| PATCH | `/users/me/username` | `{username}` — 30-day rule enforced |
| PATCH | `/users/me/avatar` | `{assetId}` (must be READY photo owned by user) |
| PATCH | `/users/me/privacy` | `{isPrivate?, allowMessagesFrom?, storyPrivacyDefault?, showOnlineStatus?}` |
| PATCH | `/users/me/notifications` | `{likes?, comments?, follows?, messages?, stories?, calls?}` (stored in profile JSON/prefs) |
| PATCH | `/users/me/location` | `{mode: OFF\|FRIENDS\|TEMPORARY, latitude?, longitude?, minutes?}` — explicit opt-in only |
| GET | `/users/:id/followers`, `/users/:id/following` | paginated |
| POST | `/users/:id/follow` / DELETE | follow / unfollow |
| POST | `/users/:id/block` / DELETE | block / unblock |
| POST | `/users/:id/mute` / DELETE | mute / unmute |
| GET | `/users/me/blocked` | blocked list |

## 4. Friends — `/friends`

| Method | Path | Notes |
|---|---|---|
| GET | `/friends` | friend list |
| GET | `/friends/requests?dir=incoming\|outgoing` | |
| POST | `/friends/requests` | `{toUserId}` |
| POST | `/friends/requests/:id/accept` | creates both `Friend` rows + follow |
| POST | `/friends/requests/:id/reject` | |
| DELETE | `/friends/:userId` | remove friend |
| GET | `/friends/close` | close-friends list |
| POST | `/friends/close/:userId` / DELETE | add/remove close friend |
| GET | `/friends/discover` | contacts-discovery stub — requires explicit permission flag in body |

## 5. Stories — `/stories`

| Method | Path | Notes |
|---|---|---|
| POST | `/stories` | `{assetId, mediaType, caption?, textOverlays?, stickers?, musicId?, locationName?, mentions?, poll?, question?, privacy?, hideFrom?}` → `expiresAt = now+24h` |
| GET | `/stories/feed` | grouped by friend: `[{user, stories[]}]`, only unexpired + visible |
| GET | `/stories/user/:userId` | that user's active stories (privacy-respecting) |
| GET | `/stories/:id` | single story (marks nothing) |
| DELETE | `/stories/:id` | owner delete |
| POST | `/stories/:id/view` | records view (idempotent) |
| GET | `/stories/:id/viewers` | owner only |
| POST | `/stories/:id/react` | `{emoji}` |
| POST | `/stories/:id/reply` | `{text}` → also creates DM to owner |
| GET | `/stories/archive` | owner's expired stories |
| GET | `/stories/highlights` / POST | `{title, storyIds[], coverAssetId?}` |
| PATCH | `/stories/highlights/:id` / DELETE | |

## 6. Posts / Spotlight feed — `/posts`, `/feed`

| Method | Path | Notes |
|---|---|---|
| POST | `/posts` | `{assetIds[], kind, caption?, mentions?, locationName?, musicId?, isPublic?, allowComments?}` → enqueues processing; `status=PROCESSING` for video |
| GET | `/feed` | ranked: `score = w1*recency + w2*engagement + w3*followBoost + w4*interest`; `?cursor=` |
| GET | `/feed/following` | chronological from follows |
| GET | `/posts/:id` | increments viewCount (dedupe per user/hour) |
| PATCH | `/posts/:id` | `{caption?, isPublic?, allowComments?}` owner |
| DELETE | `/posts/:id` | owner soft-delete |
| POST | `/posts/:id/like` / DELETE | |
| GET | `/posts/:id/likes` | |
| POST | `/posts/:id/comments` | `{text, parentId?}` |
| GET | `/posts/:id/comments?cursor=` | threaded |
| DELETE | `/comments/:id` | owner or post owner |
| POST | `/comments/:id/like` / DELETE | |
| POST | `/posts/:id/share` | `{target?: conversationId}` → increments shareCount |
| POST | `/posts/:id/save` / DELETE | |
| GET | `/users/me/saved` | |
| POST | `/posts/:id/report` | alias → `/reports` |

## 7. Search — `/search`

| Method | Path | Notes |
|---|---|---|
| GET | `/search?q=&type=all\|users\|videos\|sounds\|hashtags\|effects\|templates\|places` | saves to history (auth) |
| GET | `/search/trending` | trending hashtags + sounds + templates |
| GET | `/search/suggestions?q=` | prefix suggestions |
| GET | `/search/history` / DELETE | clear history |

## 8. Sounds — `/sounds`

| Method | Path | Notes |
|---|---|---|
| GET | `/sounds?q=&sort=trending\|new` | library (original metadata + user uploads only) |
| POST | `/sounds` | `{title, artist?, assetId}` — upload original/user audio |
| GET | `/sounds/:id` | sound page |
| GET | `/sounds/:id/posts` | videos using this sound |
| DELETE | `/sounds/:id` | uploader or admin |

## 9. Lenses & effects — `/lenses`, `/effects`

| Method | Path | Notes |
|---|---|---|
| GET | `/lenses?category=` | active lenses; `isPremium` flagged (server enforces on use) |
| GET | `/lenses/:id` | |
| POST | `/lenses/:id/use` | `{assetId?}` — increments usage, plan-gates premium |
| GET | `/effects?category=` | prompt/AI + procedural effects catalog |
| POST | `/ai/effect` | `{prompt, language?}` → `{pipeline: {filter, overlays[], colorGrade, params}}` (see §13) |
| Admin: POST/PATCH/DELETE | `/lenses`, `/lenses/:id`, `/effects`, `/effects/:id` | upload original lenses |

## 10. Templates — `/templates`

| Method | Path | Notes |
|---|---|---|
| GET | `/templates?category=` | published templates |
| GET | `/templates/:id` | includes `slots[]: {index, kind: media|text, label, required}` |
| POST | `/templates/:id/use` | `{media: {slotIndex: assetId}, texts: {slotIndex: string}, musicId?}` → creates DRAFT post |
| Admin: POST/PATCH/DELETE | `/templates`, `/templates/:id` | publish/unpublish, edit |

## 11. Conversations & messages — `/conversations`, `/messages`

| Method | Path | Notes |
|---|---|---|
| GET | `/conversations` | with last message + unread counts |
| POST | `/conversations` | `{type: DIRECT\|GROUP, userIds[], title?}` — DIRECT dedupes |
| GET | `/conversations/:id` | incl. participants |
| PATCH | `/conversations/:id` | `{title?, disappearingAfterSec?}` group admin / any for DM settings |
| POST | `/conversations/:id/leave` | group leave |
| GET | `/conversations/:id/messages?cursor=&limit=` | newest-first pages |
| POST | `/conversations/:id/messages` | `{type, text?, attachmentIds?, replyToId?, expiresAt?}` |
| PATCH | `/messages/:id` | `{text}` sender, 15-min window |
| DELETE | `/messages/:id` | sender (or admin) → tombstone |
| POST | `/messages/:id/react` | `{emoji}` / DELETE `/:emoji` |
| POST | `/messages/:id/forward` | `{toConversationId}` |
| POST | `/conversations/:id/read` | `{lastReadAt}` → read receipts |

## 12. Calls — `/calls`

| Method | Path | Notes |
|---|---|---|
| POST | `/calls` | `{userId?, conversationId?, type: VOICE\|VIDEO}` → `{call}` + socket `call:incoming` |
| GET | `/calls/history` | paginated |
| GET | `/calls/:id` | |
| POST | `/calls/:id/end` | fallback for non-socket hangup |

Signaling itself is WebSocket (see §16).

## 13. AI — `/ai`

All endpoints: `{input…, language?: ur|roman-ur|en|ar|hi}` → result + logged to `AiGeneration`.
Provider via `AI_PROVIDER` env (`local` = built-in procedural/heuristic, works offline).

| Method | Path | Notes |
|---|---|---|
| POST | `/ai/caption` | `{context?}` |
| POST | `/ai/hashtags` | `{caption?}` |
| POST | `/ai/title` | |
| POST | `/ai/script` | `{topic, durationSec?}` |
| POST | `/ai/ideas` | `{kind: story\|video, niche?}` |
| POST | `/ai/thumbnail` | `{postId}` → generated thumbnail asset (local: canvas-composite spec) |
| POST | `/ai/subtitles` | `{assetId}` → WebVTT (local: placeholder w/ timing heuristic) |
| POST | `/ai/translate` | `{text, targetLang}` |
| POST | `/ai/voice` | `{text, voice?, language?}` → audio asset (local: not available → 501 w/ message) |
| POST | `/ai/background` | `{assetId, prompt}` → background-replaced image spec/asset |
| POST | `/ai/effect` | prompt → effect pipeline JSON (works fully offline) |

## 14. Notifications — `/notifications`

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications?cursor=` | newest first |
| PATCH | `/notifications/:id/read` | |
| POST | `/notifications/read-all` | |
| POST | `/devices/push-token` | `{token, platform}` |
| DELETE | `/devices/push-token` | `{token}` |

## 15. Subscriptions & features — `/plans`, `/features`

| Method | Path | Notes |
|---|---|---|
| GET | `/plans` | FREE/PRO/CREATOR details + prices |
| GET | `/subscriptions/me` | current |
| POST | `/subscriptions/checkout` | `{plan}` → provider abstraction (stub URL unless configured) |
| POST | `/subscriptions/cancel` | |
| GET | `/features` | resolved feature flags for current user |

## 16. WebSocket events (Socket.IO, JWT in `auth.token`)

Client → server:

| Event | Payload |
|---|---|
| `conversation:join` / `conversation:leave` | `{conversationId}` |
| `message:send` | `{conversationId, type, text?, attachmentIds?, replyToId?, clientId}` → ack `{message}` |
| `message:read` | `{conversationId, messageId}` |
| `typing:start` / `typing:stop` | `{conversationId}` |
| `call:offer` | `{callId, toUserId, sdp}` |
| `call:answer` | `{callId, sdp}` |
| `call:ice-candidate` | `{callId, candidate}` |
| `call:reject` / `call:hangup` | `{callId}` |
| `presence:ping` | `{}` → updates `isOnline/lastSeenAt` |

Server → client:

| Event | Payload |
|---|---|
| `message:new` / `message:updated` / `message:deleted` | `{message}` / `{messageId, conversationId}` |
| `typing:update` | `{conversationId, userId, typing}` |
| `presence:update` | `{userId, isOnline, lastSeenAt}` |
| `notification:new` | `{notification}` |
| `call:incoming` | `{call, fromUser}` |
| `call:offer` / `call:answer` / `call:ice-candidate` | passthrough |
| `call:ended` | `{callId, reason}` |
| `story:viewed` | `{storyId, viewerId}` (to story owner) |
| `error` | `{code, message}` |

## 17. Reports & appeals — `/reports`, `/appeals`

| Method | Path | Notes |
|---|---|---|
| POST | `/reports` | `{targetType, targetId, reason, details?}` |
| GET | `/reports/me` | own reports + statuses |
| POST | `/appeals` | `{reportId?, moderationActionId?, text}` |
| GET | `/appeals/me` | |

## 18. Admin — `/admin` (requires `ADMIN`)

`GET /admin/stats` (users, posts, stories, reports pending, storage, AI usage),
`GET /admin/users?q=&filter=banned|suspended`,
`PATCH /admin/users/:id/{ban|suspend|unban|unsuspend|set-plan|set-role}`,
`GET /admin/reports?status=`, `PATCH /admin/reports/:id` `{status, action?, reason?}`,
`GET /admin/moderation/actions`, `GET /admin/appeals`, `PATCH /admin/appeals/:id`,
`GET /admin/content/posts|stories|comments?q=`, `DELETE /admin/content/...`,
`POST /admin/content/:type/:id/feature`,
`GET /admin/ai-usage`, `GET /admin/audit-logs`, `GET /admin/storage`,
`GET/PUT /admin/feature-flags`, `POST /admin/notifications/broadcast`.

Every admin write is audit-logged.

## 19. Creator — `/creator`

`GET /creator/analytics?days=30` → `{totals, series[], topPosts[]}`,
`GET /creator/drafts`, `GET /creator/posts`.
