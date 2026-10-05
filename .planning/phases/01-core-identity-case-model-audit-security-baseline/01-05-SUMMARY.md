---
phase: 01-core-identity-case-model-audit-security-baseline
plan: 05
subsystem: audit
tags: [audit, hash-chain, sha256, transactional-outbox, prisma, postgres, jsonb, zod, nestjs, timing-safe]

# Dependency graph
requires:
  - phase: 01-03
    provides: platform.audit_events, platform.audit_chain_head, compute_audit_row_hash, the BEFORE INSERT hash-chain trigger, append-only grants, PrismaService/PrismaModule
  - phase: 01-01
    provides: NestJS app skeleton, global SessionAuthGuard + AbacGuard, ApiException/ApiExceptionFilter, @Public() decorator
provides:
  - "AuditService.record(tx, input) — the single writer of platform.audit_events, requiring a transaction by signature"
  - "withAudit(prisma, audit, fn) — the transactional-outbox helper every state-changing operation in Phases 1-8 routes through"
  - "recordStandaloneAudit(prisma, audit, events) — the named path for audit writes with no paired domain write (access_attempt, external reporting services)"
  - "canonicalJsonb / buildCanonicalPayload / computeRowHash — byte-exact TypeScript reproduction of platform.compute_audit_row_hash"
  - "POST /api/v1/audit/events — service-to-service-only write endpoint, fail-closed"
  - "AuditActionType — all eight FRD F02 action types including access_attempt"
  - "Migration 20260101000300 — pins search_path on both audit hash functions (fixes a production-breaking 01-03 defect)"
affects: [01-06, 01-07, 01-08, 01-09, 01-12, 01-14, phase-2, phase-3, phase-4, phase-5, phase-6, phase-7, phase-8]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Transaction-by-signature: AuditService.record takes Prisma.TransactionClient as its first parameter, so an audit write outside a transaction does not typecheck"
    - "Canonical-payload parity testing: a TypeScript serializer is proven byte-identical to its PL/pgSQL twin by a fixture corpus checked against a live database on every CI run"
    - "Fail-closed secret handling: an unset secret denies rather than disables the check"
    - "Constant-time secret comparison over SHA-256 digests, so timingSafeEqual never sees mismatched widths"
    - "Pin SET search_path on every platform.* function (docs/SCHEMA-NOTES.md §7)"

key-files:
  created:
    - apps/api/src/modules/audit/audit.types.ts
    - apps/api/src/modules/audit/canonical-payload.ts
    - apps/api/src/modules/audit/audit.service.ts
    - apps/api/src/modules/audit/with-audit.ts
    - apps/api/src/modules/audit/audit-internal.controller.ts
    - apps/api/src/modules/audit/service-token.guard.ts
    - apps/api/test/audit-canonical-parity.e2e-spec.ts
    - apps/api/test/audit-write.e2e-spec.ts
    - apps/api/test/audit-outbox.e2e-spec.ts
    - apps/api/prisma/migrations/20260101000300_audit_hash_search_path/migration.sql
  modified:
    - apps/api/src/modules/audit/audit.module.ts
    - apps/api/test/testcontainers-postgres.ts
    - docs/SCHEMA-NOTES.md

key-decisions:
  - "Non-integer numbers in before_state/after_state are rejected with an actionable error rather than guessed: jsonb stores numeric and a JavaScript double cannot predict its text form, so a guess becomes an opaque AUDIT_CHAIN_BROKEN on an honest write"
  - "canonicalJsonb replicates Postgres jsonb key ordering (UTF-8 byte length first, then bytewise) — a lexicographic sort agrees on most real payloads and diverges on others, the worst possible failure shape"
  - "AuditService.record requires a Prisma.TransactionClient so atomicity is enforced by the compiler, not by code review"
  - "withAudit translates only audit-write failures to AUDIT_WRITE_FAILED; domain errors propagate unchanged so a 409 never reaches a clerk as an integrity incident"
  - "Rollback is the transaction's, never a compensating write — compensation can itself fail, leaving the exact state the guarantee rules out"
  - "ServiceTokenGuard denies when INTERNAL_SERVICE_TOKEN is unset: treating 'no secret' as 'no check' turns a deployment slip into a world-writable audit log that looks healthy"
  - "A request carrying Authorization is refused even with a valid service token, so a header-forwarding proxy cannot launder an end-user credential into a service call"
  - "actor_id in a request body is a 422, not an ignored field: silently recording a different actor produces an entry confidently wrong about who acted"
  - "Prisma transaction maxWait/timeout raised to 15s/30s because audit writes serialise on the chain-head lock by design; the defaults would surface ordinary contention as a spurious AUDIT_WRITE_FAILED"
  - "01-03's search_path defect fixed by a forward migration with byte-identical function bodies, so no historical row is invalidated"

patterns-established:
  - "Parity corpus: check a serializer twice per fixture — the narrow field comparison names the broken rule, the end-to-end hash comparison is what the trigger enforces"
  - "Atomicity tests assert by querying the tables afterwards, never by inferring from a thrown error"
  - "Security guards are tested over HTTP through the real pipeline, since a guard is a property of the request pipeline and a direct handler call proves nothing about whether it runs"

# Metrics
duration: 38 min
completed: 2026-10-05
---

# Phase 1 Plan 05: Audit Service Write Path Summary

**Append-only hash-chained audit capture whose TypeScript SHA-256 is proven byte-identical to the PL/pgSQL trigger across a 25-fixture corpus, with a transactional-outbox helper that makes "the action happened but wasn't audited" a compile error rather than a code-review request.**

## Performance

- **Duration:** 38 min
- **Tasks:** 3
- **Files created:** 10
- **Files modified:** 3
- **Tests added:** 42 (117 total in `apps/api`, all green)

## Accomplishments

- **Hash parity proven, not assumed.** `canonicalJsonb` reproduces PostgreSQL's `jsonb::text` exactly — including the key ordering (UTF-8 byte length first, then bytewise) that no lexicographic sort produces. Each of 25 fixtures is checked twice against a live PostgreSQL: once field-by-field against `$1::jsonb::text` (diagnostic) and once end-to-end against `platform.compute_audit_row_hash` (the check the trigger actually enforces).
- **Atomicity enforced by the type system.** `AuditService.record` takes a `Prisma.TransactionClient` as its first parameter, so there is no shape of code in which a domain write commits and the audit write is merely attempted afterwards. `withAudit()` makes the atomic path the shortest one a feature can write.
- **Both rollback directions proven by querying the database**, not by trusting a thrown error — a failed audit write leaves zero domain rows; a failed domain write leaves zero audit rows; and the chain head survives a rollback intact so a harmless failure cannot permanently break the chain.
- **Ten concurrent writers verified to produce one unbroken chain** with no duplicate `prev_hash` — the assertion that actually detects a fork, since a forked chain still has a valid-looking path from genesis to one of its tips.
- **Found and fixed a production-breaking defect in plan 01-03** that would have made every court action unsaveable (see Deviations).

## Task Commits

1. **Task 1: canonical payload builder + parity corpus** — `3c6cd6e` (feat)
2. **Task 2: AuditService + withAudit + the 01-03 search_path fix** — `fa47db7` (feat/fix)
3. **Task 3: service-to-service-only write endpoint** — `173356a` (feat)

## Files Created/Modified

- `audit.types.ts` — `AuditActionType` (all eight FRD F02 values incl. `access_attempt`), `AuditWriteInput`, genesis constant
- `canonical-payload.ts` — `canonicalJsonb`, `buildCanonicalPayload`, `computeRowHash`, `formatOccurredAt`
- `audit.service.ts` — the single writer; locks the chain head `FOR UPDATE`, binds every parameter
- `with-audit.ts` — the transactional outbox helper + `recordStandaloneAudit`
- `service-token.guard.ts` — fail-closed, constant-time, rejects co-presented user credentials
- `audit-internal.controller.ts` — `POST /audit/events`, zod `.strict()`, `actor_id` from header only
- `audit.module.ts` — exports `AuditService`; **first importer of `PrismaModule`**, which is what registers the `@Global()` module for every module after it
- `20260101000300_audit_hash_search_path/migration.sql` — the 01-03 fix, with a migrate-time regression gate
- `docs/SCHEMA-NOTES.md` — new §7 (the `search_path` rule) and the error-code addendum for `AUDIT_WRITE_DENIED`

## Decisions Made

See `key-decisions` in the frontmatter. The three worth re-reading before the next plan:

1. **Non-integer numbers throw.** `jsonb` stores `numeric`, which preserves the written form; an IEEE-754 double has no written form to preserve. Guessing produces a hash the trigger rejects, surfacing as `AUDIT_CHAIN_BROKEN` — a tamper alarm raised by an honest write, pointing at nothing actionable. The error names the field and says "pass a string".
2. **An unset `INTERNAL_SERVICE_TOKEN` denies.** The alternative turns a missing env var into a world-writable audit log, and nothing about the running system would look wrong.
3. **`actor_id` in a body is a 422, not an ignored field.** A caller that sent one believed it was setting the actor.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a production-breaking `search_path` defect inherited from plan 01-03**

- **Found during:** Task 2, on the first `INSERT` issued through Prisma rather than raw `pg`.
- **Issue:** `platform.compute_audit_row_hash` called `digest()` unqualified. `pgcrypto` installs into `public`, and the application's `DATABASE_URL` carries `?schema=platform`, so Prisma sets `search_path` to `platform` alone and the name did not resolve:
  `ERROR: function digest(bytea, unknown) does not exist`.
  Because the trigger fires `BEFORE INSERT` on the outbox path, the failure rolled back the domain write with it. **In production no status change, ruling, custody transfer or designation change could have been saved at all** — the defect was total, not partial.
- **Why 01-03 missed it:** its tests exercise the chain through the raw `pg` driver, which ignores `?schema=` and leaves `public` on the path. The application connects through Prisma, which does not. The harness and the application disagreed about a session setting, and neither side mentioned it. `audit-write.e2e-spec.ts` now drives the write path through Prisma specifically.
- **Fix:** forward migration `20260101000300_audit_hash_search_path` adding `SET search_path = pg_catalog, public` to both functions. Bodies are **byte-identical** to 01-03 — a hard requirement, since changing the hash definition would invalidate every previously written row. Ends with a `DO` block that resolves the function under `search_path = platform` alone and fails the deploy otherwise, so a recurrence is caught at migrate time.
- **Files:** `apps/api/prisma/migrations/20260101000300_audit_hash_search_path/migration.sql`, `apps/api/test/testcontainers-postgres.ts`, `docs/SCHEMA-NOTES.md` §7
- **Verification:** 117 tests green; additionally simulated plan 01-04's Compose init sequence (`01-roles.sql` → `02-extensions.sql` → all four migrations) in a throwaway container and confirmed the hash resolves under `search_path = platform`.
- **Committed in:** `fa47db7`

**2. [Rule 2 - Missing Critical] Raised Prisma transaction `maxWait`/`timeout` for the audit path**

- **Found during:** Task 2 (ten-concurrent-writers case).
- **Issue:** audit writes serialise on the chain-head row lock *by design* — a totally ordered log is the product requirement. Prisma's defaults (2s `maxWait`, 5s `timeout`) assume transactions that do not queue behind each other, so a burst of concurrent writes would surface ordinary contention as a spurious `AUDIT_WRITE_FAILED`.
- **Fix:** `maxWait: 15_000, timeout: 30_000` in `withAudit`, with the reasoning recorded at the call site.
- **Committed in:** `fa47db7`

**3. [Rule 2 - Missing Critical] Added `recordStandaloneAudit` and an explicit `allowNoDomainWrite` opt-out**

- **Found during:** Task 3.
- **Issue:** the internal endpoint has no domain write to pair with (the calling service already did its work elsewhere), but `withAudit`'s empty-event-list guard correctly treats "no events" as an unaudited state change. The first draft worked around this by re-reading the chain head after commit for the response — racy under concurrent writers, and it would have returned another writer's tip.
- **Fix:** `recordStandaloneAudit` captures each write's receipt from *inside* the transaction and marks the case explicitly via `allowNoDomainWrite`, so the guard keeps catching the mistake it exists for while this legitimate case is named rather than disguised. Also the documented path for plan 01-07's `access_attempt` events.
- **Committed in:** `173356a`

**4. [Rule 1 - Bug] Reworded a comment that defeated the plan's own security gate**

- **Found during:** Task 3 verification.
- **Issue:** a comment in `audit.service.ts` explaining why the unsafe raw-SQL APIs are banned *named* them, which made the plan's `! grep -E '\$(queryRawUnsafe|executeRawUnsafe)'` check fail. The grep is a real control for threat T-01-18, so weakening it to accommodate prose would have been the wrong repair.
- **Fix:** comment rewritten to describe the ban without writing the identifiers.
- **Committed in:** `173356a`

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 missing-critical). **Impact:** deviation 1 is the significant one — it was a latent total outage in already-merged work, found only because this plan was the first to exercise the path the way the application actually does. No scope creep; nothing outside this plan's file ownership was modified except `docs/SCHEMA-NOTES.md` (additive) and `testcontainers-postgres.ts` (one migration-list entry).

## Issues Encountered

**Concurrent file ownership with plan 01-04 — resolved, no conflict.** While this plan ran, 01-04 landed `infra/db/init/02-extensions.sql`, which fixes the *same* root cause from the opposite side (pinning `pgcrypto` into `public` at cluster init, because under Compose the migration ran with `search_path = platform` and would otherwise have installed `digest()` into `platform`). Their file references migration `20260101000300` by name and warns that it fails against a Compose-migrated database.

The two fixes are complementary rather than contradictory, but the warning was worth testing rather than assuming. Simulated the full Compose init order in a throwaway container: `01-roles.sql` → `02-extensions.sql` → all four migrations applied cleanly, and `compute_audit_row_hash` resolves under `search_path = platform`. Both environments (Testcontainers/`psql` and Compose/Prisma) now work.

**Deliberate stderr noise in `audit-outbox.e2e-spec.ts`.** The rollback cases log the real failure cause server-side by design (the client gets only the fixed display-safe message, while an operator needs the trigger's actual complaint). The suite passes; the stack traces in the output are expected.

## Known Stubs

None found. Scanned all created/modified files for `TODO`/`FIXME`/`placeholder`/`not implemented`; the only match is the literal string `\uXXXX` inside a comment about JSON escaping.

Deliberately out of scope per the plan: the Audit **Explorer read API** (`GET /audit/explorer`) and the BullMQ integrity-verification job are plan **01-12**. This plan built the write path only.

## User Setup Required

`INTERNAL_SERVICE_TOKEN` must be set for `POST /api/v1/audit/events` to accept any call. It was already declared in `.env.example` by plan 01-01 (line 115) with a note that production resolves it from the secrets manager. **An unset value is not a failure mode — the endpoint denies every request, by design.** No other configuration is required.

## Next Phase Readiness

**Ready for plans 01-06 through 01-12.** Each of them has what it needs:

- **01-06** (identity): inject `AuditService`, use `withAudit` for login/MFA/session events.
- **01-07** (ABAC/PDP): emit `access_attempt` on every denial via `recordStandaloneAudit` — the action type is in the union and the path is built.
- **01-09** (case model): `designation_change` events through `withAudit`.
- **01-12** (Audit Explorer + integrity job): reads rows this plan writes; `computeRowHash` is exported and reusable for independent chain re-walking.

**Two things later plans must know:**

1. **`withAudit` is the only correct path for a state change.** Calling `prisma.$transaction` directly for an audited object is a review-blocking mistake; the JSDoc says so at the definition.
2. **`AuditModule` is now `PrismaModule`'s first importer**, so the `@Global()` module is registered — every module after this one gets `PrismaService` injected without an import and without touching the single-owner `app.module.ts`.

**One carried-forward concern:** the `search_path` rule (`docs/SCHEMA-NOTES.md` §7) applies to *every* future `platform.*` function, not just these two. A migration that adds a function without `SET search_path` reintroduces exactly the defect fixed here, and the regression gate in `20260101000300` only covers `compute_audit_row_hash`.

---
*Phase: 01-core-identity-case-model-audit-security-baseline*
*Completed: 2026-10-05*

## Self-Check: PASSED

- All 10 created files + 3 modified files verified present on disk.
- All 3 task commits verified in `git log`: `3c6cd6e`, `fa47db7`, `173356a`.
- Plan-level build gate: `npm run build` → exit 0.
- Full test suite: `npm test` → 6 suites, **117 tests, all passing** (includes 01-01's and 01-03's).
- Lint: `eslint "src/**/*.ts" "test/**/*.ts"` → exit 0.
- Plan verification block: `Prisma.TransactionClient` present ✓ · `AUDIT_WRITE_FAILED` present ✓ · no `$queryRawUnsafe`/`$executeRawUnsafe` in the audit module ✓ · `timingSafeEqual` present ✓ · `INTERNAL_SERVICE_TOKEN` in `.env.example` ✓ · parity corpus ≥20 fixtures (25) ✓
- No blocking stubs.
