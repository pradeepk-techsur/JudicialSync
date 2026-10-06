---
phase: 01-core-identity-case-model-audit-security-baseline
verified: 2026-10-06T07:53:41Z
status: passed
score: 5/5 must-haves verified
re_verification:
  previous_status: none
  note: "Initial verification — no prior VERIFICATION.md existed"
human_verification:
  - test: "Multi-change security-designation PATCH (add X and Y, or add+remove in one call) — inspect the resulting audit events"
    expected: "Each designation_change event's before_state/after_state chains (event n after == event n+1 before) and the final event shows the true cumulative set"
    why_human: "W2 fix (a7e46d1) is verified by review but no e2e exercises the multi-change chaining path; single-change designations-api suite passes. Carried forward from REVIEW.md as a UAT flag."
---

# Phase 1: Core Identity, Case Model, Audit & Security Baseline — Verification Report

**Phase Goal:** Establish the trusted substrate — authenticated, scoped access; one shared case/docket model; tamper-evident audit; baseline security controls — so every later feature has a safe, consistent foundation rather than re-implementing identity, case context, or audit logic per module.

**Verified:** 2026-10-06T07:53:41Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| #   | Truth (Success Criterion)                                                                                                                                 | Status      | Evidence                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SSO+MFA login; access limited to role/court/division/case/proceeding/party-role/designation scope; unauthorized request denied **server-side (403)**      | ✓ VERIFIED  | `abac.guard.ts` fails closed (unmarked route → deny 503 + loud log; scope denial → 403); 11 criterion-1 assurance tests prove MFA enforced by IdP (grant w/o TOTP → 401), cross-court isolation both directions, reads+writes, sub-court scope, denial body carries no resource data, revoked session rejected, each denial audited |
| 2   | One shared case-context model for court/division/proceeding/parties/docket; no duplicate Evidentiary vs. Speedy-Trial representation                        | ✓ VERIFIED  | Single `CaseContextService` / `cases.service.ts` is the one shared read surface; no second case representation exists; `cases-api.e2e-spec.ts` + `case-no-delete.e2e-spec.ts` pin it; ASSURANCE.md records it as structural COMPLETE |
| 3   | Every status change/ruling/custody/override/approval → immutable hash-chained entry; UPDATE/DELETE of a past audit row fails **at DB grant level**         | ✓ VERIFIED  | Migration `..._append_only_grants` REVOKEs UPDATE/DELETE on `audit_events` + self-enforcing DELETE-assertion block; 8 criterion-3 assurance tests prove SQLSTATE **42501** for UPDATE/DELETE/TRUNCATE/DISABLE-TRIGGER as raw `app_rw`, zero DELETE grant platform-wide, trigger rejects forged hashes, corruption detected as `row_hash_mismatch`, tail deletion as `chain_head_mismatch`. B1 verifier false-positive fixed (987a5bc) |
| 4   | User lacking a designation entitlement (sealed/restricted/grand-jury/juvenile/PII) denied tagged record; denial logged as audit event                      | ✓ VERIFIED  | Centralized single read of `security_designations` (`resource-loader.service.ts` "the one place"); 10 criterion-4 assurance tests prove 403 AUTH_DESIGNATION_DENIED, byte-identical 404 for no-path requester, role-without-entitlement denied, positive control allowed, list omission, each denial audited as `access_attempt` |
| 5   | Disallowed-type/scan-failing file rejected **before storage**; data encrypted in transit and at rest (PG at-rest deferred per ASM-07; object-store SSE provable) | ✓ VERIFIED  | `files.service.ts` strict ordering allowlist→scan→store→record; rejection before any store with audit; 8 criterion-5 assurance tests prove disallowed type rejected w/ no scan, spoofed executable sniffed, real ClamAV EICAR reject, scanner-down fails closed (503) then recovers, object AES256, no plaintext path / TLS 1.2+, no store-address leak. DB at-rest correctly marked PARTIAL per ASM-07 (matches the success-criterion note) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                                                                   | Expected                                             | Status     | Details                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------- | ---------- | ------------------------------------------------------------- |
| `apps/api/src/common/guards/abac.guard.ts`                                 | Fail-closed server-side authorization (crit 1)       | ✓ VERIFIED | Deny 503 on unmarked route, 403 on scope denial; wired via global guard; exercised by 5+ hermetic suites |
| `apps/api/src/modules/case-context/case-context.service.ts`                | Single shared case-context model (crit 2)            | ✓ VERIFIED | One read surface; no competing representation                  |
| `apps/api/prisma/migrations/..._append_only_grants/migration.sql`          | DB grant-level audit immutability (crit 3)           | ✓ VERIFIED | REVOKE UPDATE/DELETE + self-enforcing assertion block; 164 lines |
| `apps/api/src/modules/audit/integrity/chain-verifier.service.ts`           | Hash-chain tamper detection (crit 3)                 | ✓ VERIFIED | Linkage-based walk (B1 fixed); detects content/tail/fork tampers |
| `apps/api/src/modules/policy/resource-loader.service.ts`                   | Single designation read, filters revocation (crit 4) | ✓ VERIFIED | "The one place security_designations is read"                  |
| `apps/api/src/modules/files/files.service.ts`                              | Upload pipeline allowlist→scan→store→record (crit 5) | ✓ VERIFIED | 332 lines; rejection-before-store; AES256; audit on reject    |
| `apps/api/test/assurance/criterion-{1,3,4,5}-*.assurance-spec.ts`          | Black-box negative-path evidence                     | ✓ VERIFIED | 391/457/357/388 lines; real HTTP + raw `app_rw`/`app_dba` SQL; not stubs |
| `apps/api/test/assurance/harness.ts`                                       | Real Keycloak+TOTP token acquisition, raw pg clients | ✓ VERIFIED | 538 lines; no self-minted JWTs                                 |
| `apps/api/jest.assurance.config.js`                                        | Separate runnable assurance runner                   | ✓ VERIFIED | `testMatch` scoped to `assurance-spec.ts`, `maxWorkers: 1`     |
| `docs/ASSURANCE.md`                                                        | Criterion→test traceability matrix                   | ✓ VERIFIED | All 5 criteria mapped; machine-checked by traceability spec   |

### Key Link Verification

| From                              | To                                    | Via                                            | Status  | Details                                                                 |
| --------------------------------- | ------------------------------------- | ---------------------------------------------- | ------- | --------------------------------------------------------------------- |
| assurance harness                 | deployed stack (`judicialsync.localhost`) | raw HTTP, no in-process module, no UI       | WIRED   | harness.ts drives the proxied running container                        |
| criterion-3 spec                  | `platform.audit_events`               | raw `pg` as `app_rw` issuing UPDATE/DELETE      | WIRED   | Asserts SQLSTATE `42501` — grant-level, not application convention     |
| `docs/ASSURANCE.md`               | `apps/api/test/assurance/`            | each criterion row names spec file + test titles | WIRED | `traceability.assurance-spec.ts` fails if matrix cites a nonexistent test |
| `AbacGuard` (@Resource descriptors) | PDP / OPA policy                     | fail-closed on undeclared resource              | WIRED   | Confirmed by REVIEW cross-file seam check; covered by hermetic suites  |
| web `ScopeAttribute`              | backend `EntitlementsDto` scope shape | generated client contract                       | WIRED   | W1 drift fixed (3b5002e); zero `scope_id` remaining in `apps/web/src`  |

### Requirements Coverage

All five ROADMAP success criteria are the phase requirements; each maps to a verified truth above. No additional per-requirement REQUIREMENTS.md entries required re-checking beyond the success criteria.

### Gate & Review Evidence (cited, not re-litigated)

| Signal                  | Value                    | Assessment                                                                                                                                              |
| ----------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gate_status`           | passed_with_warnings      | Warning is SOLELY `ungated_waves: [5]` — a bookkeeping gap. Not a gap entry (see below).                                                               |
| `ungated_waves`         | [5] (01-07 AbacGuard)     | Wave-5 code is exercised green by `abac-guard`, `guards-fail-closed`, `abac-fail-closed`, `audit-explorer`, `grants-sod` hermetic suites AND the wave-9 phase regression ran the full suite green on the final tree. No untested code; not a gap. |
| `review_blockers_open`  | 0                        | B1 (chain-verifier false-positive), W1 (scope drift), W2 (multi-change audit) all verified fixed in iteration 2. Nothing to emit.                      |
| `boot_smoke`            | skipped                  | No blocker: `context-boot.e2e-spec.ts` (hermetic) passes in gate waves 1–3, AND the 42-test assurance suite boots and drives the deployed Compose stack over raw HTTP green twice end-to-end — a stronger boot proof than a dev-script smoke. "App does not boot" is affirmatively refuted. |

### Anti-Patterns Found

None blocking. 01-14 SUMMARY "Known Stubs: None" verified — the only `placeholder` match is prose quoting a UX spec. No TODO/FIXME blockers in the enforcement path. Two documentation nits noted in REVIEW (comment references `SECURITY_FILE_TYPE_TOO_LARGE` vs. emitted `SECURITY_FILE_TOO_LARGE`; upload comment code-code) — comment-only, zero code impact, not gaps.

### Human Verification Required

1. **Multi-change designation audit chaining (W2 UAT flag)** — PATCH a case's security-designations with multiple changes in one request (e.g. add X and Y, or add+remove together); inspect the emitted `designation_change` audit events. Expected: each event's before/after surrounds its single change (event n `after` == event n+1 `before`) and the final event shows the cumulative set. Why human: the W2 fix (a7e46d1) is review-verified but no automated e2e exercises the multi-change path.

### Deferred Items (pre-existing, judged — not phase-blocking)

- **DEF-01** — seeded `judge` cannot read the seeded sealed case (a `case`-scope seed row narrows them before the designation layer). This is a **seed-fixture/intent mismatch, not a policy defect**: both the narrowing policy and the seed are individually correct; they were never checked against each other. The positive half of criterion 4 is demonstrated via an in-test scope grant (the same pattern 01-07's guard suite uses), and the negative halves are fully covered. One-row seed fix recommended for a later plan. Does not defeat criterion 4 as written.
- **DEF-02** — `INTERNAL_SERVICE_TOKEN` not forwarded to the `api` service in `docker-compose.yml`, so the two internal-service routes (`POST /audit/events`, `/security/policy-evaluate`) fail closed (403) in the Compose stack. **No Phase 1 user-facing path calls them**; fail-closed is the correct direction. Affects Phase 2+ integration only. Not a Phase 1 criterion blocker.
- **ASM-07** — database at-rest encryption deferred to the deployment substrate (KMS per TechArch §7.5). This is **explicitly carved out by the success criterion itself** ("PostgreSQL at-rest encryption is deferred... object-store SSE is provable"); object-store AES256 is proven. Criterion 5 is honestly marked PARTIAL in ASSURANCE.md. Within the criterion as written → VERIFIED.

### Gaps Summary

No gaps. All five ROADMAP success criteria are satisfied by substantive, wired implementations backed by a standalone 42-test negative-path assurance suite that attacks the guarantees over raw HTTP against the deployed stack and as the application's own database role via raw SQL. Grant-level audit immutability is proven at SQLSTATE 42501 (not application convention), server-side authorization fails closed, the case model has a single shared representation, designation denials are audited, and the upload pipeline rejects before storage with encryption in transit + object-store at-rest. The sole gate warning (`ungated_waves: [5]`) is a bookkeeping artifact whose code is independently proven green by hermetic suites and the final phase regression. All three code-review findings are verified fixed. DEF-01/DEF-02/ASM-07 are pre-existing, correctly-scoped deferrals that do not defeat any criterion as written. One item (multi-change designation audit chaining) is flagged for human UAT.

---

_Verified: 2026-10-06T07:53:41Z_
_Verifier: Claude (pivota_spec-verifier)_
