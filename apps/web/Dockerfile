# ── SIGMA SNAP WEB (Next.js) — production standalone image ────────────────────────
# Build context must be the REPO ROOT (npm workspaces + shared packages).
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://your-api-host \
#     --build-arg NEXT_PUBLIC_SOCKET_URL=https://your-api-host \
#     -t sigmasnap-web .
# NOTE: NEXT_PUBLIC_* values are baked in at BUILD time — rebuild to change them.
# NOTE: standalone output is enabled by a container-local patch of next.config.mjs
# (the repo file itself is NOT modified); the build fails loudly if the patch
# cannot be applied.

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/lens-sdk/package.json ./packages/lens-sdk/
RUN npm ci --no-audit --no-fund

FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/web ./apps/web
COPY packages ./packages

# Enable `output: 'standalone'` without editing the repo's next.config.mjs.
RUN node <<'EOF'
const fs = require('fs');
const p = 'apps/web/next.config.mjs';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('standalone')) {
  console.log('next.config.mjs already configures standalone output — skipping patch');
} else {
  const anchor = 'reactStrictMode: true,';
  if (!s.includes(anchor)) {
    throw new Error(
      'next.config.mjs shape changed and the standalone patch cannot be applied. ' +
      "Add output: 'standalone' to next.config.mjs manually."
    );
  }
  s = s.replace(anchor, anchor + "\n  output: 'standalone',");
  fs.writeFileSync(p, s);
  console.log('patched next.config.mjs (container-local) with output: standalone');
}
EOF

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_STUN_URLS=stun:stun.l.google.com:19302
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL \
    NEXT_PUBLIC_STUN_URLS=$NEXT_PUBLIC_STUN_URLS

RUN npm run build --workspace apps/web
RUN test -d apps/web/.next/standalone \
  || (echo 'FATAL: apps/web/.next/standalone was not produced' >&2; exit 1)

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
