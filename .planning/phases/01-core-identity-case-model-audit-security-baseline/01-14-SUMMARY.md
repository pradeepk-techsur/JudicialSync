---
phase: 01-core-identity-case-model-audit-security-baseline
plan: 14
subsystem: testing
tags: [assurance, negative-path, raw-http, keycloak, totp, opa, clamav, minio, hash-chain, designation, abac, traceability, ci]

# Dependency graph
requires:
  - phase: 01-07
    provides: AbacGuard with 403/404 mapping and access_attempt auditing, hidden-existence 404 parity
  - phase: 01-08
    provides: entitlement grant approval endpoints and 3-layer SoD
  - phase: 01-09
    provides: CaseContextService, cases/proceedings/parties/docket/document routes, no-delete proof
  - phase: 01-10
    provides: secure file upload (content-sniffed allowlist, real ClamAV, AES256 S3, no store URL)
  - phase: 01-12
    provides: ChainVerifierService, GET /audit/explorer, POST /audit/integrity/verify + /status + /alerts
provides:
  - "A standalone, criterion-traceable negative-path assurance suite that attacks the Phase 1 guarantees over raw HTTP against the running stack and as app_rw/app_dba via raw SQL"
  - "apps/api/test/assurance/harness.ts — real-Keycloak token acquisition, a never-throwing fetch client, mirrored seed ids; no self-minted JWTs"
  - "apps/api/test/assurance/raw-sql-client.ts — role-asserting app_rw/app_dba pg clients"
  - "docs/ASSURANCE.md — the criterion→evidence traceability matrix, machine-checked by traceability.assurance-spec.ts"
  - ".github/workflows/assurance.yml — a separately-visible CI gate for criteria 1,3,4,5"
affects: [phase-2, phase-3, phase-4, phase-5, phase-7]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Black-box assurance: raw fetch against the proxied running stack + raw pg as the app's own role, with zero imports from src/ or prisma/, so no in-process behaviour can be mistaken for a guarantee"
    - "Role-asserting DB clients (SELECT current_user on connect) so a grant-level proof cannot degrade into a tautology over the wrong role"
    - "A documentation↔test traceability meta-test: the matrix may name only spec files and it()/describe() titles that actually exist"
    - "Shared-chain robustness: every destructive audit case is scoped to the rows it wrote/corrupted and restores the chain head in a finally, never asserting on the global chain_verified flag"
    - "Cross-window bounded TOTP retry + loginFresh seeding the token cache, so a suite driving one shared real IdP survives one-time-use contention"

key-files:
  created:
    - apps/api/jest.assurance.config.js
    - apps/api/test/assurance/harness.ts
    - apps/api/test/assurance/raw-sql-client.ts
    - apps/api/test/assurance/criterion-1-scoped-access.assurance-spec.ts
    - apps/api/test/assurance/criterion-3-audit-immutability.assurance-spec.ts
    - apps/api/test/assurance/criterion-4-designation-denial.assurance-spec.ts
    - apps/api/test/assurance/criterion-5-upload-and-encryption.assurance-spec.ts
    - apps/api/test/assurance/traceability.assurance-spec.ts
    - docs/ASSURANCE.md
    - .github/workflows/assurance.yml
  modified: []

key-decisions:
  - "The suite is a black box: it imports nothing from src/ or prisma/, drives raw HTTP against the proxied running container and raw SQL as app_rw/app_dba, because CONTEXT requires it bypass the UI and the in-process Nest module entirely"
  - "TOTP secrets are read from the published local-dev values (docs/SEED-CREDENTIALS.md / SEED_USERS), the established project convention, rather than parsed out of the realm export's per-user credential blobs — one source of truth, not a fragile second parse"
  - "POST /audit/integrity/verify is async (202); the specs trigger it then poll /alerts for an alert naming their own audit_event_id, never asserting the global chain_verified flag, because the shared dev DB carries genuine prev_hash breaks from other suites' teardown (DEF-03)"
  - "The criterion-4 404 branch uses system_admin (SDNY-scoped) against the NDCA sealed case, asserting a byte-identical 404 to a nonexistent UUID; the 403 branch uses clerk_case_admin (NDCA, no designation_sealed)"
  - "No production code was written: where a test needed the judge to read the sealed case (DEF-01) it granted a sealed-case scope in-test as app_dba and cleaned up, exactly as 01-07's guard suite does; DEF-01 is recorded as a confirmed finding with its one-row seed fix"

patterns-established:
  - "Negative-path assurance as a named, separately-runnable deliverable with its own CI check and its own traceability matrix"
  - "Criterion traceability enforced by a meta-test rather than by review"

# Metrics
duration: ~110 min
completed: 2026-10-06
---

# Phase 1 Plan 14: Negative-Path Assurance Suite Summary

**A standalone, criterion-traceable assurance suite (42 tests) that proves Phase 1 success criteria 1, 3, 4 and 5 by attacking them over raw HTTP against the running stack and as `app_rw`/`app_dba` via raw SQL — real Keycloak+TOTP tokens, UPDATE/DELETE/TRUNCATE/trigger-tamper on `audit_events` refused with SQLSTATE 42501, designation denial as a byte-identical 403/404 split with every denial audited, and upload rejection-before-storage + TLS-1.2+/no-plaintext-path + AES256-at-rest — with a documentation↔test traceability gate and criterion 5 honestly marked PARTIAL (database at-rest encryption deferred, ASM-07).**

## Performance

- **Duration:** ~110 min
- **Started:** 2026-10-06T04:18Z (approx)
- **Completed:** 2026-10-06T05:10Z (approx)
- **Tasks:** 3
- **Files created:** 10 · **modified:** 0 (no production code)
- **Tests:** 42 new assurance tests (11 criterion-1, 8 criterion-3, 10 criterion-4, 8 criterion-5, 5 traceability), all passing against the live stack; the hermetic feature suite remains 210 green

## Accomplishments

- **Criterion 1 (scoped access, server-side):** MFA enforced end-to-end by the IdP (a direct grant without TOTP → `401 invalid_grant`); cross-court isolation proven in both directions and for every resource family, for reads AND writes; the sub-court scope dimensions enforced (a court-scoped deputy is still confined); `attorney_external` denied every internal surface even after a case scope is granted; a denial body shown to be the bare `{error_code,message}` envelope with none of the resource's data; immediate session revocation; and an `access_attempt` audit row per denial.
- **Criterion 3 (audit immutability at the grant level):** `UPDATE`, `DELETE`, `TRUNCATE`, and `DISABLE/DROP TRIGGER` against `audit_events` as `app_rw` all refused with **SQLSTATE 42501**; `information_schema` confirms `app_rw` holds **zero DELETE** across the whole `platform` schema; forged `row_hash`/stale `prev_hash` inserts rejected by the trigger with `AUDIT_CHAIN_BROKEN`; deliberate corruption (as `app_dba`, only after proving `app_rw` cannot) detected as `row_hash_mismatch` and tail deletion as `chain_head_mismatch`, each a critical alert naming the row, with detection never repairing it.
- **Criterion 4 (designation denial, audited):** sealed/restricted cases → `403 AUTH_DESIGNATION_DENIED` for a parent-access requester; a **byte-identical 404** for a no-path requester (and within a generous timing band); `jury_admin` (a role with zero entitlements) denied even the ordinary case — the named test that makes "role existence never implies access" falsifiable; the entitled judge allowed (positive control); audit history inherits the designation; list endpoints omit the case entirely; every denial audited; designation changes themselves gated.
- **Criterion 5 (upload + encryption):** disallowed type and header-spoofed executable rejected **before storage** with **no scan attempted**; EICAR of an allowed type rejected by the **real** ClamAV; scanner outage **fails closed** (`503`) then recovers; stored object reports **AES256**; **no plaintext path** to the API and **TLS 1.2+** enforced; no store address/signature leaks in any response; rejections audited. **Database at-rest encryption is explicitly recorded as deferred (ASM-07), not claimed.**
- **Traceability:** `docs/ASSURANCE.md` maps all five criteria to named, existing tests (criterion 2 recorded as structural), and `traceability.assurance-spec.ts` parses the matrix and fails if it cites any spec file or test title that does not exist — so the matrix cannot drift.
- **CI:** `.github/workflows/assurance.yml` is a sibling gate (ci.yml untouched) that brings up the stack and runs the suite as a separately-visible check.

## Task Commits

1. **Task 1: harness + criterion-1 + assurance.yml** — `c65a071` (test)
2. **Task 2: criterion-3 audit immutability** — `389c766` (test)
3. **Task 3: criterion-4/5 + traceability + ASSURANCE.md** — `947bf93` (test)

**Plan metadata:** (this commit) `docs(01-14)`

## Files Created

- `apps/api/jest.assurance.config.js` — standalone runner (raw-HTTP suite, `maxWorkers:1`, long timeout, shared Caddy-CA trust anchor)
- `apps/api/test/assurance/harness.ts` — real-Keycloak token acquisition (password+TOTP → `/auth/login`), never-throwing fetch client, mirrored seed ids, bounded cross-window TOTP retry
- `apps/api/test/assurance/raw-sql-client.ts` — `app_rw`/`app_dba` pg clients asserting `current_user` on connect
- `apps/api/test/assurance/criterion-1-scoped-access.assurance-spec.ts`
- `apps/api/test/assurance/criterion-3-audit-immutability.assurance-spec.ts`
- `apps/api/test/assurance/criterion-4-designation-denial.assurance-spec.ts`
- `apps/api/test/assurance/criterion-5-upload-and-encryption.assurance-spec.ts`
- `apps/api/test/assurance/traceability.assurance-spec.ts`
- `docs/ASSURANCE.md` — the criterion→evidence matrix + run instructions + Known gaps
- `.github/workflows/assurance.yml` — the CI gate

## Decisions Made

See `key-decisions` in the frontmatter. The most load-bearing:

1. **Black box by construction.** The suite imports nothing from `src/`/`prisma/`; it issues raw HTTP through the proxy and raw SQL as the application's own role. That is the difference between "more feature tests" and "evidence an attacker could not get past these controls."
2. **Scoped assertions over a shared chain.** The destructive criterion-3/4 cases never assert the global `chain_verified` flag — the shared dev database carries genuine `prev_hash` breaks from other suites' teardown (DEF-03). Each case scopes its assertions to the `audit_event_id` it touched and restores the head in a `finally`, mirroring 01-12's established robustness pattern. The suite passed clean twice end to end.
3. **No production code; findings recorded.** DEF-01 (the judge cannot read the sealed case from the seed as shipped) was confirmed; the positive control grants the scope in-test and the SUMMARY/matrix record the one-row seed fix for a later plan rather than making it here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuilt the `api` container so it ran the plan's dependency code**
- **Found during:** Task 1 setup
- **Issue:** The running `api` container had been built before plans 01-09/01-12 merged onto the branch, so `/audit/explorer`, `/audit/integrity/*` and the case-child routes 404'd. The suite attacks controls that must already exist; a stale image made them absent.
- **Fix:** `docker compose build api && docker compose up -d api`; the RouterExplorer logs then showed all audit routes mapped. No source was changed — only the image was brought current with HEAD.
- **Files modified:** none (image rebuild)
- **Verification:** `/audit/explorer` → 200 with `{audit_events,next_cursor}`; `/audit/integrity/status` → 200.
- **Committed in:** n/a (runtime only)

**2. [Rule 1 - Bug] TOTP one-time-use contention made the full run flaky**
- **Found during:** the first full-suite run (7 criterion-1 logins failed with "Keycloak did not redirect (status 200)")
- **Issue:** The suite drives one shared real Keycloak, which enforces TOTP one-time-use; back-to-back logins for the same user inside one 30s window both spend its code. A single retry was not always enough.
- **Fix:** bounded **cross-window** OTP retry (up to 4 windows, still surfacing a genuine auth failure), and `loginFresh` now seeds the token cache so an immediately-following `tokenFor(sameUser)` reuses the session instead of minting a second login in the same window. This is test-harness robustness, consistent with 01-06/01-12's documented TOTP handling.
- **Files modified:** `apps/api/test/assurance/harness.ts`
- **Verification:** the full suite then passed 42/42, and passed again on a re-run.
- **Committed in:** `947bf93` (part of Task 3)

---

**Total deviations:** 2 ([Rule 3] a runtime image rebuild, [Rule 1] a test-harness flakiness fix). Neither changed production code.
**Impact:** Both were necessary to exercise and stabilise the suite against the live stack. No scope creep; the plan's "no production code" constraint held.

## Issues Encountered

- **The sandbox docker daemon was reset mid-plan** (all containers vanished between Task 2 and Task 3). Brought the full stack back up with `docker compose up -d --build`, re-extracted the (new) Caddy CA, and continued. This is an environment event, not a code issue.
- **Residual TOTP sensitivity under repeated back-to-back full runs.** With the cross-window retry + cache-seeding the suite passes reliably in a single run (and passed on consecutive runs here); CI runs it with a dedicated stack and `maxWorkers:1`, which is the intended operating mode. Consistent with 01-12's documented experience driving one shared IdP.

## Known Stubs

**None.** Scanned every created file for `TODO`/`FIXME`/`placeholder`/`not implemented`/`coming soon`; the only match is a comment quoting the UX spec's phrase "'restricted' placeholder" (prose, not a stub). No handler, no hardcoded data (this plan writes tests + docs only), no swallowed errors.

## Deferred Issues / Findings (recorded, not fixed — no production code this plan)

- **DEF-01 (confirmed):** the seeded `judge` cannot read the sealed case because its only case scope is the plain case (01-04) and 01-02's narrowing confines it there — so the positive half of criterion 4 is not demonstrable from the seed as shipped. Recommended fix for a later plan: one row in `prisma/seed/identity.ts` giving the judge a `case` scope on `SEED_IDS.cases.sealed`. Do NOT remove the narrowing. Recorded in `docs/ASSURANCE.md` Known gaps.
- **ASM-07 (criterion 5 PARTIAL):** database at-rest encryption is deferred to the deployment substrate (KMS per TechArch §7.5); only object-store AES256 is proven. Marked explicitly in the matrix and cross-linked from the criterion 5 row.
- **Later-phase audit producers (criterion 3):** `ruling`/`custody_transfer`/`calculation_override` have no Phase 1 producer; the schema accepts them (unconstrained text column), and their producers arrive in Phases 5/7. Recorded in Known gaps.
- **DEF-03 (shared-DB chain):** the shared dev database carries genuine `prev_hash` breaks from other suites' teardown, so the global `chain_verified` flag is not a usable assertion; the suite scopes every chain assertion to its own rows. Noted here for later consolidation.

## Next Phase Readiness

- **Phase 1 is now self-evidencing for criteria 1, 3, 4, 5.** A reviewer runs `npm run test:assurance -w apps/api` (or reads the Assurance CI check) and reads `docs/ASSURANCE.md` to answer "is the foundation sound?".
- **Recommended before pilot:** apply the DEF-01 one-row seed fix so the judge's sealed-case positive control needs no in-test scope grant; satisfy ASM-07 (database at-rest encryption) on the deployment target.

---
*Phase: 01-core-identity-case-model-audit-security-baseline*
*Completed: 2026-10-06*

## Self-Check: PASSED

- All 10 created files verified present on disk.
- All 3 task commits verified in `git log`: `c65a071`, `389c766`, `947bf93`.
- Plan-level build gate: `npm run build --workspace @judicialsync/api` → exit 0.
- Full assurance suite: `npm run test:assurance -w apps/api` → **42/42 passing** across 5 suites (two clean end-to-end runs).
- Hermetic feature suite: `npm test` → **210 passing**, no regression.
- No production code changed (zero files under `apps/api/src/` or `prisma/` in any of the three commits); `ci.yml` untouched.
- Plan verification greps: raw HTTP against running stack ✓ · no self-minted tokens ✓ · `42501` asserted ✓ · `DISABLE TRIGGER` tested ✓ · `chain_head_mismatch` tested ✓ · assurance.yml valid YAML + wired ✓ · hard-constraint test present ✓ · matrix present ✓ · `PARTIAL — see ASM-07` ✓ · ASM-07 registered ✓.
- `## Known Stubs` present with no blocking entry.
