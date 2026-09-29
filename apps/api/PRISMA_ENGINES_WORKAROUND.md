# Prisma engines workaround (sandbox, 2026-09-29)

`prisma generate` / `prisma validate` in this sandbox fail with `ECONNRESET`
because prisma's internal Node downloader cannot fetch from binaries.prisma.sh
through the proxy (plain curl works fine — the failure is specific to prisma's
fetch client).

Workaround (already applied once):
1. Download the engines with curl into the prisma cache dir:
   `~/.cache/prisma/master/605197351a3c8bdd595af2d2a9bc3025bca48ea2/debian-openssl-3.0.x/`
   - `schema-engine.gz`, `libquery_engine.so.node.gz`, `prisma-fmt.gz`
   from `https://binaries.prisma.sh/all_commits/605197351a3c8bdd595af2d2a9bc3025bca48ea2/debian-openssl-3.0.x/<name>.gz`
2. Copy the extracted binaries into the CLI's engine dir as:
   - `node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x`
   - `node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node`
3. Point prisma at them explicitly (this alone is enough to skip downloads):
   ```
   PRISMA_SCHEMA_ENGINE_BINARY=<repo>/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x
   PRISMA_QUERY_ENGINE_LIBRARY=<repo>/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node
   ```
4. `prisma validate` also needs `DATABASE_URL` set (any placeholder) because the
   schema reads `env("DATABASE_URL")` in getConfig.

Note: step 2 lives in node_modules and will be wiped by a fresh `npm install`;
repeat the workaround then. The engine hash `605197351a3c8bdd595af2d2a9bc3025bca48ea2`
corresponds to prisma 5.22.0.
