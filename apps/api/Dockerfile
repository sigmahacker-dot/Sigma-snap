# ── SIGMA SNAP API (Express + Socket.IO + BullMQ) — production image ──────────────
# Build context must be the REPO ROOT (uses the npm-workspaces layout + root prisma/).
#   docker build -f apps/api/Dockerfile -t sigmasnap-api .
# On container start, docker-entrypoint.sh runs `prisma migrate deploy`
# (or `prisma db push` when no migrations exist yet), then starts the API.

FROM node:20-slim AS builder
WORKDIR /app

# Install the full workspace tree first (better layer caching).
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/lens-sdk/package.json ./packages/lens-sdk/
RUN npm ci --no-audit --no-fund

# Copy sources needed for the API build.
COPY prisma ./prisma
COPY apps/api ./apps/api
COPY packages ./packages

RUN npx prisma generate --schema ./prisma/schema.prisma
RUN npm run build --workspace apps/api
# dist/index.js is the production entrypoint (also builds dist/seed.js).

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/lens-sdk/package.json ./packages/lens-sdk/
RUN npm ci --omit=dev --no-audit --no-fund

# prisma CLI (a devDependency upstream) is needed at BOOT for migrate deploy.
# Pin it to the exact @prisma/client version that was installed.
RUN PRISMA_VERSION="$(node -p "require('@prisma/client/package.json').version")" \
 && npm install --no-save --no-audit --no-fund "prisma@$PRISMA_VERSION" \
 && npx prisma --version

COPY --from=builder /app/prisma ./prisma
RUN npx prisma generate --schema ./prisma/schema.prisma

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY apps/api/docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
