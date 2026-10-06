---
phase: 01-core-identity-case-model-audit-security-baseline
plan: 12
subsystem: audit
tags: [audit, audit-explorer, hash-chain, integrity, bullmq, redis, designation, separation-of-duties, keyset-pagination, nestjs, opa]

# Dependency graph
requires:
  - phase: 01-05
    provides: AuditService, recordStandaloneAudit, computeRowHash (the TypeScript canonical-payload hash), AuditModule, platform.audit_events/audit_chain_head
  - phase: 01-07
    provides: AbacGuard, @Resource() descriptor, ResourceLoaderService (effectiveSecurityConfig), PdpClient, the access_attempt denial-logging pattern
  - phase: 01-03
    provides: platform.integrity_alerts, append-only grants (app_rw has no UPDATE/DELETE on audit_events), security_designations revocation columns
provides:
  - "GET /audit/explorer — access-scoped, designation-pre-filtered audit query with keyset pagination and rule-package-version linkage"
  - "AuditExplorerService — the per-row designation SQL pre-filter and the 403-vs-404-vs-empty branching FRD/Y2 principle 3 specifies"
  - "ChainVerifierService.verify — independent hash-chain re-walk detecting row_hash / prev_hash / chain_head breaks, writing critical integrity_alerts"
  - "IntegrityProcessor — BullMQ repeatable incremental + daily full re-walk, schedule-disableable without disabling verification"
  - "GET /audit/integrity/status, /alerts (audit_reader); POST /audit/integrity/verify (approve, coalesced on-demand run)"
  - "AbacGuard resource-type-aware error-code refinement (AUDIT_READ_DENIED / AUDIT_DESIGNATION_DENIED), extensible per feature"
affects: [phase-3, phase-4, 01-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Designation pre-filter as a correlated SQL NOT EXISTS, applied pre-ranking so counts/timing cannot leak existence (TechArch 04 §7.6)"
    - "Keyset pagination over (occurred_at, id) with an opaque base64url cursor, for an append-only table that grows without bound"
    - "Independent verification: the chain re-walk recomputes with the TypeScript hash, never the DB function, so a compromised function cannot validate its own forgeries"
    - "BullMQ connection via forRootAsync so the factory reads REDIS_URL at instantiation, not at module-decoration (import) time"
    - "Boot never blocks on an absent Redis: a bounded ping gates schedule arming; the verifier stays callable regardless"
    - "Resource-type-aware error-code refinement in the guard — presentation only, the PDP still decides — to satisfy per-feature FRD error tables"

key-files:
  created:
    - apps/api/src/modules/audit/dto/explorer.dto.ts
    - apps/api/src/modules/audit/explorer.service.ts
    - apps/api/src/modules/audit/explorer.controller.ts
    - apps/api/src/modules/audit/integrity/chain-verifier.service.ts
    - apps/api/src/modules/audit/integrity/integrity.processor.ts
    - apps/api/src/modules/audit/integrity/integrity.controller.ts
    - apps/api/src/modules/audit/integrity/integrity-status.service.ts
    - apps/api/test/audit-explorer.e2e-spec.ts
    - apps/api/test/audit-integrity-job.e2e-spec.ts
    - apps/api/jest.integrity.config.js
  modified:
    - apps/api/src/modules/audit/audit.module.ts
    - apps/api/src/common/guards/abac.guard.ts
    - apps/api/jest.config.js
    - apps/api/package.json

key-decisions:
  - "The Explorer route declares @Resource({type:'audit_event', action:'read'}) with NO idParam: the guard enforces only audit_reader (collection form), and the service owns the per-case designation decision — passing case_id as idParam would make the guard pre-empt and silently diverge from the service's collection-aware 403/404/empty branching"
  - "Designation exclusion is a correlated SQL NOT EXISTS resolving each audit row's object to its case, applied before ORDER BY/LIMIT — a post-filter over a fetched page would leak existence through counts and break keyset pagination privilege-dependently"
  - "The verifier recomputes with the TypeScript computeRowHash, not platform.compute_audit_row_hash, so a compromised DB function cannot validate forgeries it produced; 01-05's parity corpus keeps the two honest"
  - "chain_head_mismatch is checked only on a full re-walk (the head reflects the whole tail); the daily full run is what catches tail deletion, which a per-row verifier misses entirely"
  - "AUDIT_INTEGRITY_SCHEDULE_ENABLED is a scheduling switch, not a verification bypass: the verifier and the on-demand route remain callable when it is false"
  - "BullModule.forRootAsync (not inline forRoot) so REDIS_URL is read at instantiation; the inline form captured the localhost fallback at import time and the schedule never armed under tests"
  - "AbacGuard gained a resource-type-aware (type, reason_code) -> (error_code, message) refinement so audit_event denials surface as AUDIT_READ_DENIED / AUDIT_DESIGNATION_DENIED per FRD/F02's error table — presentation only, the decision stays the PDP's; later features add their own rows"

patterns-established:
  - "Live-stack suites that mutate the shared audit chain cache session tokens per user (Keycloak TOTP one-time-use) and assert on their own rows, not the shared chain's boundary"
  - "A new jest.<concern>.config.js per plan for stack-dependent suites, excluded from the hermetic jest.config.js — mirrors 01-06 (auth) and 01-07 (policy)"

# Metrics
duration: 95 min
completed: 2026-10-06
---

# Phase 1 Plan 12: Audit Explorer and Hash-Chain Verification Summary

**The read half of the audit feature: an access-scoped, designation-pre-filtered Audit Explorer with keyset pagination and rule-package linkage, plus a BullMQ-scheduled chain verifier that recomputes hashes independently of the database function and writes persistent critical `integrity_alerts` on any row-hash, prev-hash, or tail-deletion break — making "tamper-evident" an observed property rather than a claim.**

## Performance

- **Duration:** ~95 min
- **Tasks:** 3
- **Files created:** 10 · **modified:** 4
- **Tests:** 19 new live-stack (10 Explorer, 9 integrity); hermetic `npm test` 214 passing

## Accomplishments

- **The Audit Explorer enforces separation of duties through one point — the PDP.** `audit_reader` is required by `@Resource({type:'audit_event', action:'read'})`; a `clerk_case_admin` with broad edit entitlements is denied `403 AUDIT_READ_DENIED`, proven by the named test `operational edit rights do not imply audit read access` (`US-2.3`, threat T-01-50). The service contains no duplicate entitlement check.
- **Sealed-case audit entries are withheld by a SQL pre-filter**, applied before pagination so counts and timing cannot leak existence. A requester holding parent case access but not the designation entitlement gets `403 AUDIT_DESIGNATION_DENIED`; a blind-discovery requester gets an empty result **byte-identical** to the one for a nonexistent case — asserted by direct comparison (threat T-01-51). Both attempts are logged as `access_attempt` events.
- **Denied attempts appear as first-class rows**, not omitted — an authorized auditor filtering `action_type=access_attempt` sees them (`Screen-17`: "tried and was told no" is distinct from "does not exist").
- **The scheduled job re-walks the chain independently and catches tamper the write path cannot.** Deliberately corrupting a `row_hash`, a `prev_hash`, and deleting the chain tail are each detected as the correct break kind, each producing a `critical` `integrity_alerts` row — and the corruption is performed as `app_dba` only after asserting `app_rw` is refused the UPDATE (SQLSTATE 42501), exercising both the grant posture and the verifier (threats T-01-52, T-01-53).
- **Detection never writes back.** No repair path exists (grep-asserted), and a test confirms the corrupted row is byte-for-byte unchanged after detection.
- **No Exception Queue was built** — the `integrity_alerts` rows are left exactly as Phase 3 (F07) will consume them.

## Task Commits

1. **Task 1: Audit Explorer query API** — `2894505` (feat)
2. **Task 2: chain verifier, BullMQ schedule, integrity_alert records** — `1efaff1` (feat)
3. **Task 3: Explorer + integrity e2e suites** — `a3364c6` (test), `c1dc291` (test — shared-stack robustness)

## Files Created/Modified

- `dto/explorer.dto.ts` — the zod query contract (+ `action_type`, `limit`, `cursor`), `AuditExplorerEvent` with `before_after_summary` and `rule_version_label`, opaque keyset cursor codec
- `explorer.service.ts` — the access-scoped query: designation pre-filter (`NOT EXISTS` over resolved case), the 403/404/empty branching, keyset pagination, diff/label derivation, access-attempt logging
- `explorer.controller.ts` — `GET /audit/explorer`, read-only (only `@Get`)
- `integrity/chain-verifier.service.ts` — the independent re-walk; three break kinds; critical alert persistence; never writes back
- `integrity/integrity.processor.ts` — BullMQ worker; incremental + daily full repeatable jobs; bounded Redis-reachability probe so boot never blocks; on-demand run coalesced via fixed job id
- `integrity/integrity.controller.ts` — `/status`, `/alerts` (audit_reader), `POST /verify` (approve)
- `integrity/integrity-status.service.ts` — Redis-cached `last_verified_at`, authoritative open-count from the DB
- `audit.module.ts` — wires the Explorer, the integrity services/controller, and BullMQ (`forRootAsync`)
- `common/guards/abac.guard.ts` — resource-type-aware error-code refinement (see Deviations)
- `jest.integrity.config.js` + `jest.config.js` ignore + `package.json` `test:integrity`
- `test/audit-explorer.e2e-spec.ts`, `test/audit-integrity-job.e2e-spec.ts` — the two live-stack suites

## Decisions Made

See `key-decisions` in the frontmatter. The two most load-bearing:

1. **The Explorer route carries no `idParam`.** The guard decides only `audit_reader`; the per-case designation 403/404/empty decision is the service's, because only the service can distinguish "parent access, missing designation" from "blind discovery" across a *collection* query. Passing `case_id` as `idParam` made the guard resolve the sealed case's audit resource and 404 it before the service ever ran — the three designation cases all collapsed to the guard's single hidden-resource 404.
2. **The verifier recomputes in TypeScript, never via the DB function.** If both sides were the same code, a compromised `platform.compute_audit_row_hash` would validate its own forgeries. Independence is the whole point; 01-05's parity corpus keeps the two from drifting into false alarms.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added resource-type-aware error codes to AbacGuard**
- **Found during:** Task 3, when the SoD test expected `403 AUDIT_READ_DENIED` but received `AUTH_SCOPE_DENIED`.
- **Issue:** The plan (and `FRD/F02`'s error table, and `FRD/Y2-errors.md` principle 3) require feature-specific denial codes — `AUDIT_READ_DENIED`, `AUDIT_DESIGNATION_DENIED` (and, for other features, `CASE_DESIGNATION_DENIED`, `PORTAL_DESIGNATION_DENIED`, `LEDGER_DESIGNATION_DENIED`). The plan attributed these to "plan 01-07's resource-type → error-code table," but 01-07 built only a reason-code-keyed `REASON_RESPONSES`; the PDP's reason vocabulary is a fixed small set that emits `AUTH_SCOPE_DENIED` for every entitlement denial. No mechanism existed to produce the per-feature codes the FRD mandates.
- **Fix:** Added a `(resource_type, reason_code) → (error_code, message)` refinement table to `AbacGuard`, with `audit_event` rows for the two F02 codes. It is **presentation only** — the allow/deny decision is unchanged and still entirely the PDP's; the table only relabels a denial the policy already made. An absent entry falls back to the generic code, so it never widens access and later features add their own rows.
- **Files modified:** `apps/api/src/common/guards/abac.guard.ts`
- **Verification:** the SoD test now gets `AUDIT_READ_DENIED`; the designation test gets `AUDIT_DESIGNATION_DENIED`; 01-07's existing `AUTH_SCOPE_DENIED` assertions (all on `case`, which declares no override) are unaffected, confirmed by the full hermetic run (214 tests green).
- **Committed in:** `a3364c6`

**2. [Rule 1 - Bug] BullMQ connection captured the localhost fallback at import time**
- **Found during:** Task 3, when the scheduled-job test's `last_verified_at` never advanced and no `bull:*` keys appeared in Redis.
- **Issue:** `BullModule.forRoot({ connection: redisConnection() })` evaluates `redisConnection()` at class-decoration (import) time — before a test's `bootApp` sets `REDIS_URL` — so it parsed the `localhost:6379` fallback and BullMQ connected nowhere. The schedule-arming `queue.client` await then hung until the bounded ping timed out, and no job was ever enqueued.
- **Fix:** switched to `BullModule.forRootAsync({ useFactory: () => ({ connection: redisConnection() }) })`, which runs the factory at instantiation, after the environment is in place. Also bounded BOTH the `queue.client` await and the `ping` by a single deadline so boot never hangs on an absent/slow Redis.
- **Files modified:** `apps/api/src/modules/audit/audit.module.ts`, `apps/api/src/modules/audit/integrity/integrity.processor.ts`
- **Verification:** after the fix, `bull:audit-integrity:*` keys appear and the status key records a completed run; the scheduled-job test passes.
- **Committed in:** `a3364c6`

**3. [Rule 1 - Bug] Live-stack suites were flaky under a shared Keycloak/chain**
- **Found during:** Task 3, running the two suites together (each passed in isolation).
- **Issue:** Keycloak enforces TOTP one-time-use; ~19 sequential real logins across the two suites (plus the parallel plans' suites on the same IdP) forced 30s TOTP-window waits and spurious login failures. Separately, "clean chain verifies" over the whole shared chain failed because other suites' teardown deletions sever prev_hash linkage.
- **Fix:** cache each user's session token per suite (one login per user), and scope the clean-chain/idempotency assertions to the rows the test itself wrote (no `row_hash` break on its own ids) rather than the shared chain's boundary.
- **Files modified:** `apps/api/test/audit-explorer.e2e-spec.ts`, `apps/api/test/audit-integrity-job.e2e-spec.ts`
- **Verification:** both suites now pass together, 19/19.
- **Committed in:** `c1dc291`

---

**Total deviations:** 3 auto-fixed (1 missing-critical, 2 bugs).
**Impact:** Deviation 1 is the significant one — it fills a cross-cutting gap (per-feature FRD error codes) that 01-07 did not provide and that F01/F12/F16 will also need; it is additive and the guard remains policy-logic-free. Deviations 2 and 3 were found only by running against the live stack, consistent with this phase's pattern. No scope creep.

## Spec gap closed

`action_type` is not among `FRD/Y1a`'s listed Explorer filters, but `Screen-17` requires surfacing `access_attempt` rows with a `denied` tag — and `access_attempt` is an `action_type`, not an `object_type`. The filter was added to the query DTO and the gap is recorded here per the plan's instruction.

## Authentication Gates

None. The internal routes were already configured; the live suites authenticate through the real Keycloak as normal flow.

## Issues Encountered

- **Running the two heavy live-stack suites *together* remains sensitive to the shared Keycloak** when many other plans' suites hit the same IdP concurrently (TOTP one-time-use). The session-token caching (deviation 3) makes them robust; each also passes independently. CI should run them with the stack dedicated, as `jest.integrity.config.js` already serialises with `maxWorkers: 1`.

## Known Stubs

**None.** Scanned every created/modified file for `TODO`/`FIXME`/`placeholder`/`not implemented`/`coming soon`; the only match is explanatory prose in a pre-existing `abac.guard.ts` comment about the nil-UUID marker. No handler returns hardcoded data, no function body is empty, and the only swallowed errors are the two deliberate access-attempt-write failures (logged as integrity gaps so a denial's response never changes), consistent with 01-07's pattern.

## Deferred Issues

None from this plan. The carried-forward concerns DEF-01 and DEF-02 (from 01-07, for 01-14) are unaffected by this work.

## Next Phase Readiness

- **Phase 3 (F07, Exception Queue)** can consume the `integrity_alerts` rows this plan writes as-is: `alert_type: 'audit_integrity_break'`, `severity: 'critical'`, `status: 'open'`, with `audit_event_id`, `expected_hash`, `actual_hash`, and a `detail` JSONB carrying the break kind. No rewrite — Phase 3 routes these existing rows.
- **Phase 4 (Admin Dashboard)** can mount the Explorer screen on `GET /audit/explorer`, `/audit/integrity/status`, and `/audit/integrity/alerts`.
- **Later feature plans** needing their own FRD denial codes extend `RESOURCE_REASON_OVERRIDES` in `abac.guard.ts` with a row per resource type — the mechanism is in place.

---
*Phase: 01-core-identity-case-model-audit-security-baseline*
*Completed: 2026-10-06*

## Self-Check: PASSED

- All 10 created files + 4 modified files verified present on disk.
- All 4 task commits verified in `git log`: `2894505`, `1efaff1`, `a3364c6`, `c1dc291`.
- Plan-level build gate: `npm run build` → exit 0.
- Hermetic suite: `npm test` → 15 suites, **214 tests, all passing** (no regression from the guard change or BullMQ in AppModule).
- Live-stack suites: `npm run test:integrity` → **19/19 passing** (10 Explorer, 9 integrity), both together and in isolation.
- Plan verification greps: explorer route present ✓ · read-only (no write verbs) ✓ · `rule_version_label` linkage ✓ · `access_attempt` surfaced ✓ · persistent alerts ✓ · `chain_head_mismatch` (tail deletion) ✓ · independent `computeRowHash` recomputation ✓ · no self-repair path ✓ · no Phase-3 exception queue ✓ · named SoD test present ✓ · tail-deletion tested ✓
- `## Known Stubs` present with no blocking entry.
