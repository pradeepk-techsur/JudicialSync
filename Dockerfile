# =============================================================================
# JudicialSync Platform Core API — production-shaped container image
# =============================================================================
#
# Multi-stage. Stage 1 holds the full toolchain (TypeScript, the Nest CLI,
# Prisma's generator); stage 2 holds only what the process needs at runtime.
#
# NOTE ON `npm ci` AND devDependencies: the build toolchain for this project
# lives in devDependencies (`@nestjs/cli` supplies `nest`, plus `typescript`,
# `prisma`, `tsx`). Installing with `--omit=dev` — or exporting
# NODE_ENV=production before the install — strips them and the build dies with
# `sh: nest: not found`. The builder stage therefore installs everything, and
# NODE_ENV is only set to `production` in the runtime stage, after the build.
#
# NOTE ON `tsx`: the runtime stage keeps it, because the container's start
# command runs `db:seed` (`tsx prisma/seed.ts`) on every boot before serving.
# Dropping devDependencies in the runtime stage would make the seed step fail
# at the point where it is least diagnosable.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — build
# -----------------------------------------------------------------------------
FROM node:20.20-alpine AS builder

# Prisma's engine loader probes for libssl to choose a query-engine binary.
# node:alpine ships neither openssl nor libc6-compat, so without these it warns
# ("failed to detect the libssl/openssl version") and falls back to an
# openssl-1.1.x engine that then fails to load against Alpine's musl at
# runtime. Installing them makes the engine selection correct rather than
# lucky.
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copy the manifests first so the dependency layer is cached independently of
# source changes. This is an npm-workspaces monorepo, so the root lockfile and
# every workspace manifest must be present before `npm ci` will resolve.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json

# `npm ci` — reproducible from the lockfile. devDependencies INCLUDED (see above).
RUN npm ci --include=dev

# Prisma's schema is needed before `generate`; copy it ahead of the rest so a
# source-only change does not invalidate the generated client layer.
#
# `--schema` is resolved relative to the WORKSPACE directory, not the repo
# root, because `--workspace` changes npm's working directory before running
# the binary. Passing a root-relative path here fails with "file or directory
# not found" even though the file is plainly present.
COPY apps/api/prisma ./apps/api/prisma
RUN npm exec --workspace @judicialsync/api -- prisma generate --schema prisma/schema.prisma

# Remaining build inputs.
COPY tsconfig.base.json ./
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json ./apps/api/
COPY apps/api/src ./apps/api/src

# `nest build` honours nest-cli.json's `sourceRoot: src`, so the entry point
# lands at dist/src/main.js — which is exactly what `start:prod` runs. Do not
# "simplify" that path; the two must agree.
RUN npm run build --workspace @judicialsync/api

# -----------------------------------------------------------------------------
# Stage 2 — runtime
# -----------------------------------------------------------------------------
FROM node:20.20-alpine AS runtime

# `wget` backs the container healthcheck; the stock node:alpine image has no
# curl. `su-exec` lets the entrypoint drop privileges after it has copied the
# Caddy CA into place (see docker-compose.yml).
#
# openssl + libc6-compat are needed HERE as well as in the builder, not only
# there: `prisma migrate deploy` runs in this stage, on every container boot,
# and it spawns the schema engine binary. Without libssl that binary fails to
# load and Prisma reports it as `Could not parse schema engine response:
# SyntaxError: Unexpected token 'E'` — which reads like a Prisma bug and is
# actually a missing shared library.
RUN apk add --no-cache wget su-exec openssl libc6-compat

ENV NODE_ENV=production

WORKDIR /app

# Everything the running process needs, and nothing else. node_modules carries
# the generated Prisma client from the builder stage, so no generate step is
# required at runtime.
#
# npm workspaces hoist: there is exactly ONE node_modules, at the repo root,
# and no apps/api/node_modules at all. Copying the root tree therefore carries
# the generated Prisma client too, so no `prisma generate` runs at runtime.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Non-root. `node` (uid 1000) ships with the base image.
# The container starts as root only long enough for the entrypoint to create
# /caddy-ca from the read-only Caddy volume, then drops to this user via
# su-exec. Nothing in the request path ever runs as root.
RUN mkdir -p /caddy-ca && chown -R node:node /caddy-ca /app

EXPOSE 3000

# Liveness. Deliberately the dependency-free `/api/v1/health` route: a probe
# that fails when PostgreSQL is degraded cannot distinguish "the process is
# wedged" from "a downstream is slow", and an orchestrator responds very
# differently to those two.
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=12 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/v1/health || exit 1

CMD ["node", "apps/api/dist/src/main.js"]
