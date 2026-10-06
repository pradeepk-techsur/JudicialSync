---
phase: 01-core-identity-case-model-audit-security-baseline
plan: 13
subsystem: ui
tags: [react, uswds, vite, openapi, hey-api, playwright, axe-core, oidc, totp, tanstack-query, react-router]

# Dependency graph
requires:
  - phase: 01-06
    provides: "GET /auth/entitlements, POST /auth/login, GET /auth/authorize-url — the real OIDC+TOTP auth endpoints"
  - phase: 01-09
    provides: "GET /cases — case-context read API, for the generated client's types"
  - phase: 01-12
    provides: "GET /audit/explorer — Audit Explorer read API, for the generated client's types"
provides:
  - "openapi/openapi.json — the OpenAPI 3.1 contract emitted code-first from the running NestJS app"
  - "apps/web — the thin USWDS shell: real browser OIDC+TOTP login, one generic authenticated frame, entitlement-driven nav"
  - "apps/web/src/api/client.ts + generated client — typed, same-origin API client with bearer auth, 401 handling, and typed ApiError(error_code)"
  - "apps/web/e2e/fixtures/totp.ts — the reusable real OIDC+TOTP loginAs fixture every later Playwright spec reuses"
  - ".github/workflows/e2e.yml — contract/client drift gate + the release-blocking axe-core accessibility gate"
  - "web Compose service behind the single Caddy TLS origin"
affects: [phase-01-15, phase-04-ui-workspaces, frontend, accessibility, api-contract]

# Tech tracking
tech-stack:
  added:
    - "React 18 + Vite 5 + TypeScript 5 (apps/web)"
    - "@uswds/uswds 3 (Sass source) + @trussworks/react-uswds 9"
    - "@tanstack/react-query 5, react-router-dom 6"
    - "@hey-api/openapi-ts + @hey-api/client-fetch (generated client)"
    - "@nestjs/swagger document build (code-first OpenAPI 3.1)"
    - "@playwright/test 1.63.0 (pinned), @axe-core/playwright, otplib"
    - "vite-plugin-static-copy (USWDS fonts/img into the build)"
  patterns:
    - "Code-first OpenAPI: the document is generated from the running route table; CI drift-checks the committed contract and client"
    - "Entitlement-gated rendering: UI checks computed entitlements, never role labels; the server re-validates every call"
    - "One generic shell for every role; per-role workspaces deferred to Phase 4"
    - "Real-IdP E2E: Playwright drives Keycloak with real password+TOTP, no mock"

key-files:
  created:
    - "apps/api/src/openapi.ts — code-first OpenAPI 3.1 document builder (ApiErrorBody + UI response schemas)"
    - "apps/api/scripts/emit-openapi.ts — builds via nest build, emits openapi/openapi.json without a live DB"
    - "openapi/openapi.json — the committed 3.1 contract (43 paths)"
    - "apps/web/src/api/client.ts — typed client wrapper (bearer, 401, ApiError)"
    - "apps/web/src/auth/{AuthProvider,LoginPage,CallbackPage,RequireSession}.tsx"
    - "apps/web/src/shell/{AppShell,SideNav}.tsx, apps/web/src/routes.tsx, apps/web/src/App.tsx"
    - "apps/web/src/styles/uswds.scss + uswds/_theme.scss"
    - "apps/web/e2e/{fixtures/totp,login-shell.spec,axe.spec,global-setup}.ts"
    - "apps/web/playwright.config.ts, apps/web/vite.config.ts, Dockerfile.web"
    - ".github/workflows/e2e.yml"
  modified:
    - "apps/api/src/main.ts — serves /api/v1/openapi.json (non-prod) via a raw Express route, no guard exemption"
    - "apps/api/src/modules/identity/auth.service.ts + dto/auth.dto.ts — entitlements now returns display_name"
    - "docker-compose.yml — web service; OIDC_REDIRECT_URI -> /login/callback"
    - "Caddyfile — handle { reverse_proxy web:5173 }"

key-decisions:
  - "Code-first OpenAPI (not spec-first): the running controllers/zod are the source; CI git-diff drift check keeps it honest"
  - "openapi:emit runs nest build then loads compiled JS, because tsx/esbuild does not emit the design:paramtypes metadata the Swagger explorer needs"
  - "openapi.json served from a raw Express route (non-prod), Swagger UI not shipped, so no global guard gains a path-based exemption"
  - "OIDC callback lives at the SPA route /login/callback, never under /auth/* (Caddy routes /auth/* to Keycloak)"
  - "entitlements endpoint gained display_name so the shell shows the user's name, not a UUID"
  - "Audit Explorer lives at /audit in the generic shell; Phase 4 remounts it under a role workspace (mockup's /admin/audit)"

patterns-established:
  - "Generated client drift gate: emit + generate + git diff --exit-code in CI"
  - "Real OIDC+TOTP Playwright fixture with single-use TOTP-window handling, reused by all later FE specs"
  - "Release-blocking axe gate: zero critical/serious on every shipped screen, report-only rejected"

# Metrics
duration: 3h 55m
completed: 2026-10-06
---

# Phase 1 Plan 13: Thin USWDS Shell, Generated API Client & Accessibility Gate Summary

**A real browser OIDC+TOTP login into one generic USWDS shell, typed against a code-first OpenAPI 3.1 contract generated from the running backend, with a release-blocking axe-core gate — all behind the single Caddy TLS origin.**

## Performance

- **Duration:** ~3h 55m
- **Completed:** 2026-10-06
- **Tasks:** 3
- **Files created/modified:** ~40 (apps/web app, OpenAPI pipeline, Compose/proxy wiring, E2E suite)

## Accomplishments

- **Code-first OpenAPI 3.1 contract** (43 paths) emitted from the running NestJS route table, with the shared `ApiErrorBody` envelope on every error status and typed success bodies for the three UI-consumed reads; a typed `@hey-api/openapi-ts` client wraps it with same-origin base URL, bearer auth, 401 → session-clear, and a `error_code`-carrying `ApiError`.
- **The thin USWDS shell**: a real full-page redirect to Keycloak (no credential form in the app), a callback that posts the code to the API, an `AuthProvider` that holds the session and fetches entitlements, `RequireSession` guarding routes, and one generic `AppShell` + entitlement-driven `SideNav` used by every role.
- **The whole stack, UI included, comes up behind one TLS origin** (`docker compose up`): a `web` service with no host port, fronted by `Caddy reverse_proxy web:5173`.
- **A release-blocking accessibility gate and a real-IdP E2E suite**: 9 login/shell cases (round-trip, no-TOTP failure, unauthenticated redirect, entitlement-driven nav across three users, logout, nav navigation) and 5 axe cases (zero critical/serious on /login, /cases, /audit, plus skip-link and landmark assertions). **All 14 pass against the live stack.**

## Task Commits

1. **Task 1: OpenAPI 3.1 contract + generated client** — `ac350f8` (feat)
2. **Task 2: generic USWDS shell + OIDC login + Compose/proxy wiring** — `abc0754` (feat)
3. **Task 3: Playwright TOTP fixture + axe gate (+ deviations)** — `85e198c` (feat)

_Interleaved `01-14` commits on this branch are from the parallel assurance plan, not this plan._

## Files Created/Modified

See frontmatter `key-files`. Highlights:
- `apps/api/src/openapi.ts` / `scripts/emit-openapi.ts` — the code-first contract pipeline.
- `apps/web/src/api/client.ts` + `src/api/generated/` — the typed client and its drift-checked generated output.
- `apps/web/src/auth/*` + `src/shell/*` + `src/routes.tsx` — the login flow and the generic shell.
- `apps/web/e2e/fixtures/totp.ts` — the reusable real OIDC+TOTP fixture.
- `.github/workflows/e2e.yml` — drift + accessibility gate.
- `docker-compose.yml`, `Caddyfile`, `Dockerfile.web` — the web service behind the TLS origin.

## Decisions Made

See frontmatter `key-decisions`. The load-bearing ones:
- **Code-first OpenAPI**, emitted from compiled output (tsx/esbuild omits `design:paramtypes`), drift-checked in CI.
- **No guard path-exemption**: the contract is served from a raw Express route in non-production only; Swagger UI is not shipped.
- **Callback at `/login/callback`**, not `/auth/*` (Caddy owns `/auth/*`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `openapi:emit` crashed under tsx — build-then-load from compiled output**
- **Found during:** Task 1
- **Issue:** `@nestjs/swagger`'s explorer reads route-param types from `design:paramtypes` reflection metadata, which `tsx`/esbuild does not emit; `createDocument` crashed with `Cannot read properties of undefined (reading '0')`.
- **Fix:** `scripts/emit-openapi.ts` (run under tsx) now runs `nest build` and loads `AppModule`/`buildOpenApiDocument` from `dist/` (tsc emits the metadata). App created without `app.init()` and with a placeholder `DATABASE_URL`, so no live DB is required.
- **Verification:** `npm run openapi:emit -w apps/api` emits 43 paths, OpenAPI 3.1, idempotent.
- **Commit:** `ac350f8`

**2. [Rule 1 - Bug] `OIDC_REDIRECT_URI` pointed at a non-existent API path**
- **Found during:** Task 3 (first real login round-trip)
- **Issue:** `OIDC_REDIRECT_URI` was `.../api/v1/auth/callback`; Keycloak redirected the browser there and got a 404 `RESOURCE_NOT_FOUND` (no such API route). Plan 01-06's design has the FRONTEND handle the callback and POST `{identity_assertion, state, callback_params}` to `/auth/login`.
- **Fix:** moved the SPA callback route to `/login/callback` (NOT under `/auth/*`, which Caddy routes to Keycloak) and set `OIDC_REDIRECT_URI` to that exact string (used on both the authorize request and the token exchange, so they match).
- **Verification:** the full login round-trip lands in the shell; E2E case 1 passes.
- **Commit:** `85e198c`

**3. [Rule 2 - Missing Critical] entitlements endpoint did not return a display name**
- **Found during:** Task 3 (header must show "their name and role")
- **Issue:** `GET /auth/entitlements` returned only `user_id` (a UUID); the must-have truth requires the shell to show the user's name. The backend stores `users.display_name` (from the IdP) but exposed it nowhere the UI could read.
- **Fix:** added `display_name` to `EntitlementsDto`; `entitlementsFor` reads it from the `users` row (falls back to `user_id`). `toEntitlementsDto` takes an optional `displayName` so the login path stays well-formed. Contract + generated client regenerated; `RoleAssignment`/`ScopeAttribute` in the FE aligned to the real wire shape (`role_name`, `scope_type`).
- **Verification:** the header renders the display name and a `role_name` Tag; E2E case 1 asserts both.
- **Commit:** `85e198c`

**4. [Rule 1 - Bug] USWDS Sass self-referential module loop + hoisted-package resolution**
- **Found during:** Task 2 (web build)
- **Issue:** `@forward 'uswds'` from a file named `uswds.scss` resolved to itself ("Module loop"); and the `@uswds/uswds` package is hoisted to the root `node_modules`, so a fixed relative `loadPaths` did not exist.
- **Fix:** the USWDS import lives in `src/styles/uswds/_theme.scss` (a subdir, so its `@forward` can't self-match); `vite.config.ts` resolves the package root via `require.resolve` and the modern Sass compiler API, and copies the USWDS `fonts`/`img` into the build.
- **Verification:** `npm run build -w apps/web` succeeds; the UI renders styled over TLS; axe passes.
- **Commit:** `abc0754`

**5. [Rule 1 - Bug] E2E flakiness from TOTP single-use/window races (test reliability)**
- **Found during:** Task 3 (suite runs)
- **Issue:** reusing seeded accounts across cases submitted the same single-use TOTP within one 30s window → Keycloak rejected the replay → logins stalled on the Keycloak form; the aggressive realm brute-force factor compounded it.
- **Fix:** the fixture tracks the last TOTP window per user and waits for a fresh one; `global-setup.ts` clears Keycloak brute-force state once up front; test users are distributed across `case_read` accounts.
- **Verification:** the full 14-test suite passes from a clean stack in ~2.2m.
- **Commit:** `85e198c`

---

**Total deviations:** 5 auto-fixed (2 blocking/toolchain, 2 bugs, 1 missing-critical). **Impact:** all were necessary for the plan's must-haves (a working login, the name-and-role display) or for a reliable gate. No scope creep — no Phase 4 routes, no role-specific layouts, one generic shell.

## Known Stubs

- `apps/web/src/routes.tsx` — `/cases` and `/audit` render labeled placeholder regions. **Cosmetic / intended**: the plan ships them wired into the nav so neither is an orphan route; plan 01-15 mounts the real Case List and Audit Explorer screens. Not blocking — the shell, login, nav gating and accessibility all work and are tested.
- No other stubs found.

## Authentication Gates

None — Keycloak is seeded and self-provisioned by the Compose stack; the suite authenticates with the published local-dev credentials.

## Issues Encountered

- A subtle one-time proxy reload is required when the `Caddyfile` changes on an *already-running* stack (`docker compose up` does not recreate `proxy` for a mounted-file change). A fresh `docker compose up` (as CI does) is unaffected. Documented for anyone iterating locally.

## Next Phase Readiness

- The USWDS build, the generated OpenAPI client, the real login, and the accessibility gate are all in place — plan 01-15 can mount the Case List and Audit Explorer screens into the existing shell, and Phase 4 extends a working shell rather than absorbing the whole frontend toolchain risk.
- The `loginAs` fixture is the reusable entry point for every later Playwright spec (Phases 4–8).
- Note for 01-14/01-15: the `GET /auth/entitlements` response now carries `display_name` (UI-only, no authority).

---
*Phase: 01-core-identity-case-model-audit-security-baseline*
*Completed: 2026-10-06*

## Self-Check: PASSED

- All created files present on disk (openapi.ts, emit-openapi.ts, openapi/openapi.json, client.ts, AppShell.tsx, login-shell.spec.ts, axe.spec.ts, totp.ts, e2e.yml, Dockerfile.web).
- All three task commits present: `ac350f8`, `abc0754`, `85e198c`.
- Plan-level build: `npm run build -w apps/api` → exit 0; `npm run build -w apps/web` → exit 0.
- Contract/client drift: `openapi:emit` + `api:generate` produce no diff (CONTRACT IN SYNC, CLIENT IN SYNC).
- Full E2E gate against the live Compose stack: 14/14 passed (9 login-shell + 5 axe, zero critical/serious violations).
- Known Stubs section present; only cosmetic/intended placeholders (plan 01-15 mounts the real screens). No blocking stubs.
