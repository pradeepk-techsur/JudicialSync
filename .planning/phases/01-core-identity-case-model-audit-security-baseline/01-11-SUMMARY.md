---
phase: 01-core-identity-case-model-audit-security-baseline
plan: 11
subsystem: security
tags: [configuration, retention, disposition, key-access, separation-of-duties, zod, redis, nestjs]

# Dependency graph
requires:
  - phase: 01-05
    provides: "withAudit transactional-outbox helper and AuditService"
  - phase: 01-07
    provides: "@Resource() route descriptor, AbacGuard, ResourceLoaderService (encryption_key as a capability, disposition recursion)"
provides:
  - "CourtConfigService.getEffective — the single configuration read path (@Global export)"
  - "GET /config/court-profiles/{id} and GET /config/rule-packages/{id}/effective"
  - "GET /retention/schedules and GET /retention/due-for-disposition (designation-filtered, on-demand)"
  - "POST /retention/dispositions with the human-confirmation DispositionGuard (no auto-purge)"
  - "POST /security/keys/rotate + GET /security/keys/status (security_officer / system_admin split)"
  - "docs/MANUAL-FALLBACK.md — the F13 manual-fallback and recovery runbook"
affects: [phase-02-configuration-engine, phase-03-work-queue, phase-05-exhibit-intake]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Configuration read path parses config_snapshot with a zod schema and raises an internal-guard error rather than defaulting"
    - "A dangerous capability is gated twice: the PDP answers 'may this principal at all', an in-code guard answers 'is this a genuine human confirmation'"
    - "A disposition is a recorded decision, never an executed deletion; an unknown action raises 501 rather than being guessed"

key-files:
  created:
    - apps/api/src/modules/config/config.types.ts
    - apps/api/src/modules/config/court-config.service.ts
    - apps/api/src/modules/config/config.controller.ts
    - apps/api/src/modules/retention/retention.service.ts
    - apps/api/src/modules/retention/retention.controller.ts
    - apps/api/src/modules/retention/disposition.guard.ts
    - apps/api/src/modules/retention/key-access.controller.ts
    - apps/api/test/config-read-path.e2e-spec.ts
    - apps/api/test/retention-disposition.e2e-spec.ts
    - docs/MANUAL-FALLBACK.md
  modified:
    - apps/api/src/modules/config/config.module.ts
    - apps/api/src/modules/retention/retention.module.ts

key-decisions:
  - "No default in the config read path: a missing version is 500 CONFIG_NOT_FOUND and a malformed snapshot is 500 CONFIG_INVALID_SNAPSHOT — a silent default would be an invisible return to the hardcoded constants CONTEXT rejected"
  - "DispositionGuard checks the human-session/service-token condition FIRST, so a batch identity is refused before the confirmation fields are even weighed"
  - "confirmed_by must EQUAL the authenticated principal and resolve to an active user — a confirmation naming someone else is one person asserting another confirmed, which a disposition record must not be able to forge"
  - "Key-access routes are @SelfScoped with a controller-level key_custodian check, because the specific SECURITY_KEY_ACCESS_DENIED code cannot come from the global AbacGuard (owned by 01-07) without editing it, and encryption_key is a capability with no resource attributes to weigh"
  - "The designation pre-filter on due-for-disposition reimplements the exclusion predicate inline (CaseContextService from 01-04 is a stub on this branch); the two must share one predicate once that service lands"

patterns-established:
  - "CourtConfigService is @Global() so every module reads configuration through one path without importing the config module"
  - "Real-IdP e2e suites cache a session token per user to avoid TOTP one-time-use contention across many sequential logins"

# Metrics
duration: 83 min
completed: 2026-10-06
---

# Phase 1 Plan 11: Configuration Read Path, Retention/Disposition, and Security Baseline Summary

**The single database-backed configuration read path, the on-demand retention/due-for-disposition surface with a human-confirmation guard that makes automated purge impossible, the security_officer/system_admin key-access split, and the F13 manual-fallback runbook.**

## Performance

- **Duration:** 83 min
- **Started:** 2026-10-06T02:44:00Z
- **Completed:** 2026-10-06T04:07:06Z
- **Tasks:** 3
- **Files modified:** 12 (10 created, 2 modified)

## Accomplishments

- `CourtConfigService.getEffective` resolves a court's published, currently-effective rule package, parses `config_snapshot` with a `zod` schema, and refuses to substitute a default — a missing version is `500 CONFIG_NOT_FOUND`, a malformed snapshot is `500 CONFIG_INVALID_SNAPSHOT`. Cached in Redis (60s) with `invalidate()` for Phase 2's publish flow to own.
- Two configuration read endpoints; the Phase 2 authoring/publish routes are deliberately absent, and `policy/**` is untouched.
- `GET /retention/schedules` and `GET /retention/due-for-disposition` (both `retention_viewer`); due-for-disposition is computed on demand with a designation pre-filter and generates no tasks or scheduled jobs.
- `DispositionGuard.assertHumanConfirmed` refuses any disposition that is not a genuine human confirmation — no `x-service-token`, a self-named `confirmed_by` resolving to an active user, and a ≥10-character rationale — with `403 SECURITY_DISPOSITION_UNCONFIRMED`.
- `POST /retention/dispositions` records an immutable `disposition_log` row plus its audit event in one `withAudit` transaction and **deletes nothing**; an unknown action is `501 SECURITY_DISPOSITION_ACTION_UNSUPPORTED`.
- `POST /security/keys/rotate` returns `202` for `security_officer` and `403 SECURITY_KEY_ACCESS_DENIED` (with an `access_attempt` audit) for `system_admin`, enforcing the separation of duties; the handler never touches key material.
- `docs/MANUAL-FALLBACK.md` ships the seven-section F13 runbook, defers the offline draft buffer to F17/Phase 5, and cross-references the open ASM-06 assumption.

## Task Commits

1. **Task 1: Configuration read path** — `e97981a` (feat)
2. **Task 2: Retention, due-for-disposition, no-auto-purge guard** — `c13f3f3` (feat)
3. **Task 3: Key-access SoD and manual-fallback runbook** — `da3592f` (feat)

## Files Created/Modified

- `apps/api/src/modules/config/config.types.ts` — zod schema for `config_snapshot` and the `EffectiveCourtConfig`/response shapes
- `apps/api/src/modules/config/court-config.service.ts` — the single configuration read path, with Redis caching and no defaults
- `apps/api/src/modules/config/config.controller.ts` — the two read endpoints
- `apps/api/src/modules/config/config.module.ts` — `@Global()`, exports `CourtConfigService`
- `apps/api/src/modules/retention/retention.service.ts` — schedules, on-demand due-for-disposition with the designation pre-filter, and the no-delete disposition write
- `apps/api/src/modules/retention/retention.controller.ts` — the two reads and the disposition write
- `apps/api/src/modules/retention/disposition.guard.ts` — the human-confirmation dangerous-capability guard
- `apps/api/src/modules/retention/key-access.controller.ts` — the key-rotation/status routes with the SoD entitlement check
- `apps/api/src/modules/retention/retention.module.ts` — wires the controllers, service and guard
- `apps/api/test/config-read-path.e2e-spec.ts` — 6 tests
- `apps/api/test/retention-disposition.e2e-spec.ts` — 17 tests (retention + key access)
- `docs/MANUAL-FALLBACK.md` — the F13 runbook

## Decisions Made

See `key-decisions` in the frontmatter. The two load-bearing ones: the config read path has no default by design, and the record-destroying capability is gated twice (PDP entitlement + in-code human confirmation) with neither subsuming the other.

## Deviations from Plan

### Auto-fixed / adapted

**1. [Rule 3 - Blocking] The constants test drives `CourtConfigService`, not `/files/upload`**
- **Found during:** Task 1
- **Issue:** The plan's constants test asserts that changing the seeded allowlist changes what `/files/upload` accepts. On this branch the File/Malware Scanning Service (plan 01-10) is still a stub — `/files/upload` does not exist.
- **Fix:** The constants test instead changes the seeded snapshot through the administrative connection, invalidates the cache, and asserts `CourtConfigService.getEffective` returns the NEW value. This is the same property — configuration genuinely read from the database — observed at the read path every consumer (including the future `/files/upload`) goes through.
- **Files modified:** apps/api/test/config-read-path.e2e-spec.ts
- **Verification:** The "reads a changed seeded value from the database, not a constant" test passes.
- **Committed in:** e97981a

**2. [Rule 3 - Blocking] The designation pre-filter reimplements the exclusion predicate inline**
- **Found during:** Task 2
- **Issue:** The plan says to reuse the exclusion predicate `CaseContextService` uses. `CaseContextService` (plan 01-04) is a stub on this branch.
- **Fix:** `RetentionService.callerMaySee` implements the same predicate directly — active (`revoked_at IS NULL`) designations on the case, each requiring the entitlement the court's `security_policies` map to, read through `CourtConfigService`. The SUMMARY and an inline comment record that the two must share one predicate once that service exists.
- **Files modified:** apps/api/src/modules/retention/retention.service.ts
- **Verification:** The sealed-case test proves both directions (hidden from a non-sealed caller, shown to one holding `designation_sealed`).
- **Committed in:** c13f3f3

**3. [Rule 3 - Blocking] Key-access routes are @SelfScoped with a controller-level check, not @Resource**
- **Found during:** Task 3
- **Issue:** The plan asks for `@Resource({type:'encryption_key'})` and for the denial to surface `403 SECURITY_KEY_ACCESS_DENIED` "via plan 01-07's resource-type → error-code table." No such table exists in `AbacGuard` on this branch — the global guard maps a PDP entitlement denial to the generic `AUTH_SCOPE_DENIED`, and the guard is plan 01-07's file, which this plan must not edit (its verification greps it).
- **Fix:** The key routes are `@SelfScoped()` (still session- and MFA-gated by `SessionAuthGuard`) and the `key_custodian` check, the specific `SECURITY_KEY_ACCESS_DENIED` code, and the `access_attempt` audit live in the controller. This is faithful: the resource-loader's own comment already notes `encryption_key` is "a capability, not an object … the key_custodian entitlement IS the whole decision," so there are no resource attributes for the PDP to weigh.
- **Files modified:** apps/api/src/modules/retention/key-access.controller.ts
- **Verification:** The named `system_admin cannot rotate keys` test and the custodian/clerk/422/status tests all pass.
- **Committed in:** da3592f

**4. [Rule 3 - Blocking] Real-IdP e2e suites cache a session token per user**
- **Found during:** Task 3 (full-suite run)
- **Issue:** Each `loginAs` does a full browser login with a one-time-use TOTP code; ~20 sequential logins exhaust TOTP windows and occasionally fail a login outright to contention, timing out the suite.
- **Fix:** `retention-disposition.e2e-spec.ts` logs in once per user and reuses the session token (valid for the whole run); the two tests that revoke sessions evict the cache. Runtime dropped from >475s to ~110s, all 17 green.
- **Files modified:** apps/api/test/retention-disposition.e2e-spec.ts
- **Committed in:** da3592f

---

**Total deviations:** 4, all blocking-class adaptations forced by sibling plans (01-04, 01-10) being stubs on this isolated phase branch, plus one test-runtime fix. **Impact:** every deliverable this plan OWNS is built in full and tested green; the adaptations preserve each property the plan asserts (configuration read from the DB, designation-filtered disposition listing, the specific key-access code) at the seam available on this branch.

## Issues Encountered

- **Shared-stack audit-chain noise.** Parallel plans (01-08, 01-12) write to the same seeded audit chain during their own runs; `ChainVerifierService` logs `AUDIT_CHAIN_BROKEN` for breaks their concurrent writes create. Not caused by this plan and not asserted against here.
- **E2e suites need `--forceExit`.** Like the existing `jest.policy.config.js`/`jest.auth.config.js` suites, the real-IdP suites leave a lingering handle (undici/ioredis) after the tests pass; the single-test run exits cleanly (no open handles detected), but the full run needs `--forceExit` to terminate — the same reason the other live-stack configs set it. Tests themselves are all green.

## Deferred / Follow-ups (noted, not actioned — out of this plan's ownership)

- **01-06's `session-config.service.ts` `LAST_RESORT` constants** (`idle_timeout_minutes: 30`, `claim_cache_seconds: 300`) trip the plan's "no hardcoded config values" grep. They are a documented availability fallback in another plan's file (used only when the config row is unreadable, logged loudly), not a hardcoded config value in a hot path. MY config/retention modules are clean. Recommend 01-06 switch its read to `CourtConfigService`.
- **Stopgap direct reads of `rule_package_versions`** in 01-06 (`SessionConfigService`) and 01-07 (`ResourceLoaderService.effectiveSecurityConfig`) should switch to `CourtConfigService.getEffective` now that it exists. Recommended to 01-14.
- **The designation pre-filter predicate** in `RetentionService.callerMaySee` should become a shared call once `CaseContextService.listCasesForPrincipal` (01-04) lands.

## Known Stubs

None found. (The one `grep` hit — "intentionally not implemented here" in `config.controller.ts` — is the documented, deliberate omission of Phase 2's rule-package authoring routes, not an incomplete implementation.)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `CourtConfigService` is the configuration read path Phase 2's Configuration Engine (F3) adds versioning, maker-checker approval, and the admin UI on top of — the tables and read path exist, and `invalidate()` is the seam the publish flow will call.
- `GET /retention/due-for-disposition` is the endpoint Phase 3's Work Queue (F06) sweep will drive.
- The `disposition_log` and the no-auto-purge guard are in place from day one, as the "dangerous capability first" principle requires.
- Blocker for full criterion demonstration: the `/files/upload` behavioral constants test and the `CaseContextService`-shared designation predicate wait on plans 01-10 and 01-04 respectively; both are tracked above.

---
*Phase: 01-core-identity-case-model-audit-security-baseline*
*Completed: 2026-10-06*

## Self-Check: PASSED

- All 12 created/modified files verified present on disk.
- All three task commits (e97981a, c13f3f3, da3592f) verified in git log.
- Plan-level build (`npx nest build`) → exit 0.
- Tests: config-read-path 6/6 green; retention-disposition 17/17 green (real stack).
- `## Known Stubs`: none blocking.
