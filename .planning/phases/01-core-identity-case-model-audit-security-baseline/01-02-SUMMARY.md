---
phase: 01-core-identity-case-model-audit-security-baseline
plan: 02
subsystem: auth
tags: [opa, rego, abac, rbac, authorization, policy, separation-of-duties, existence-hiding]

# Dependency graph
requires: []
provides:
  - "data.judicialsync.authz.decision — the single authorization entry point returning {allow, reason_code, hide_existence}"
  - "action_entitlement_map — the authoritative Phase 1 route-authorization inventory (31 pairs / 15 resource types)"
  - "Y2 principle 3 403-vs-404 existence-hiding decision, encoded once in policy"
  - "Resource-type-agnostic separation-of-duties rule (requested_by != approver)"
  - "scripts/opa-test.sh — self-bootstrapping OPA 0.64.1 test runner"
  - ".github/workflows/policy.yml — CI policy gate"
affects:
  - "01-07 (API guard — codes against the input/output contract)"
  - "01-08 (entitlement grant workflow — relies on the SoD rule)"
  - "01-09 (case model routes — every @Resource() needs a map row)"
  - "01-11 (configuration read path — supplies input.security_policies)"
  - "01-12 (audit explorer — audit_reader separation of duties)"
  - "01-14 (negative-path assurance suite — criteria 1 and 4)"
  - "Phase 2 F03 configuration publish, Phase 5 F25 template application (reuse SoD unchanged)"

# Tech tracking
tech-stack:
  added: ["OPA 0.64.1 (opa_linux_amd64_static)", "Rego v0 with future.keywords"]
  patterns:
    - "Single PDP entry point — one decision document, never per-route policy logic"
    - "Default-deny: `default decision := {allow: false}` makes undefined unreachable"
    - "Entitlement-only allow: roles can deny or scope, never grant"
    - "Table-driven tests that read the policy data they verify, so they cannot drift"
    - "Self-bootstrapping version-pinned tooling in .tools/ (gitignored)"

key-files:
  created:
    - policy/judicialsync/authz/decision.rego
    - policy/judicialsync/authz/rbac.rego
    - policy/judicialsync/authz/abac.rego
    - policy/judicialsync/authz/designation.rego
    - policy/judicialsync/authz/sod.rego
    - policy/judicialsync/authz/decision_test.rego
    - policy/judicialsync/authz/rbac_test.rego
    - policy/judicialsync/authz/abac_test.rego
    - policy/judicialsync/authz/designation_test.rego
    - policy/judicialsync/authz/sod_test.rego
    - policy/README.md
    - scripts/opa-test.sh
    - .github/workflows/policy.yml
  modified:
    - .gitignore

key-decisions:
  - "Scope assignments express granularity, not a checklist: the court check is unconditional (multi-tenancy boundary) while division/case/proceeding checks apply only to principals holding scopes of that type"
  - "input.security_policies REPLACES the built-in designation map rather than merging, so a configuration row can genuinely change a mapping; a designation absent from a supplied set therefore denies"
  - "has_parent_case_access accepts court-scoped principals holding case_read, not only principals with an explicit per-case scope row — consistent with the narrowing-scope semantics"
  - "Existence-hiding is evaluated before and independently of reason precedence, so the error code cannot vary by denial cause"
  - "decision.rego and sod.rego were written during task 2 rather than task 3, because task 2's named tests assert on composed reason_code values"

patterns-established:
  - "Policy ownership: policy/** belongs to plan 01-02; later plans adding a route request a map row here rather than editing the bundle"
  - "Fail closed on unmapped (resource.type, action) pairs — a new resource type without a map row is denied"
  - "Sibling CI workflows per gate, never shared files, so parallel plans cannot conflict"

# Metrics
duration: 42 min
completed: 2026-10-05
---

# Phase 1 Plan 02: Authorization Policy Bundle Summary

**A loadable OPA/Rego bundle exposing one decision entry point (`data.judicialsync.authz.decision`) that composes an RBAC route gate, ABAC scope matching, a 31-pair entitlement map, configuration-driven security designations with the Y2 principle 3 403-vs-404 rule, and a resource-type-agnostic separation-of-duties check — proven by 55 passing Rego unit tests.**

## Performance

- **Duration:** 42 min
- **Started:** 2026-10-05T12:36:00Z
- **Completed:** 2026-10-05T13:18:00Z
- **Tasks:** 3
- **Files created:** 13 (+1 modified)
- **Tests:** 55, all passing

## Accomplishments

- **One authorization brain, zero TypeScript.** Every rule lives in Rego, satisfying CONTEXT's hard requirement that policy not be reimplemented in application code. The plan authored no `.ts` files at all.
- **"Role existence must never imply access" is structural, not documentary.** The only thing that can satisfy the entitlement requirement is membership in `principal.entitlements`; nothing in the bundle derives an entitlement from a role. Roles can only *deny* (the RBAC gate) or *scope* (court/division affiliation). Verified by mutation test — making roles imply entitlements fails 2 tests.
- **The 403-vs-404 decision is encoded once.** `designation.rego` resolves Y2 principle 3 in policy so no handler re-decides it per endpoint, and both outcomes are asserted *against the same sealed resource*, varying only the requester — proving the decision is context-dependent rather than a blanket rule.
- **The entitlement map doubles as the route-authorization inventory.** 31 `(type, action)` pairs across 15 resource types, with `test_map_covers_every_declared_route` pinning it against a transcribed expected set, so a later phase that adds a route and forgets its row fails at `opa test` time rather than 403-ing silently in integration.
- **Fail-closed at three levels**, each asserted: empty/malformed input, unmapped resource types, and designations absent from a supplied configuration set.

## Task Commits

1. **Task 1: RBAC route gate and ABAC scope rules** — `92e3483` (feat)
2. **Task 2: Security-designation rules + Y2 principle 3** — `a5b891e` (feat)
3. **Task 3: Separation of duties + composed decision entry point** — `6c8ea6f` (feat)

## Files Created/Modified

| File | Purpose |
|---|---|
| `policy/judicialsync/authz/decision.rego` | Single entry point; default-deny; reason precedence; existence-hiding branch |
| `policy/judicialsync/authz/rbac.rego` | Layer 1 — `attorney_external` internal-route exclusion, MFA gate. Deny-only. |
| `policy/judicialsync/authz/abac.rego` | Layer 2 — court/division/case/proceeding scope matching + `action_entitlement_map` |
| `policy/judicialsync/authz/designation.rego` | Designation entitlements, configuration override, `hide_existence` |
| `policy/judicialsync/authz/sod.rego` | Resource-type-agnostic `requested_by != approver` rule |
| `policy/judicialsync/authz/*_test.rego` | 55 unit tests across five files |
| `policy/README.md` | Input/output contract, full map with route column, ownership rule, scope semantics |
| `scripts/opa-test.sh` | Self-bootstrapping, version-verifying OPA 0.64.1 runner |
| `.github/workflows/policy.yml` | CI gate (sibling of `ci.yml`, which was not touched) |
| `.gitignore` | Added `.tools/` (self-bootstrapped binary is a build artifact) |

## Decisions Made

1. **Scope assignments express granularity, not a checklist.** The division/case/proceeding checks apply only to a principal who actually *holds* scopes of that type; the court check is unconditional because `court_id` is the multi-tenancy boundary (`TechArch/00-overview.md` §159). Without this, a court-scoped judge holding no per-case rows would be denied every case in their own court. Both directions are tested.

2. **`input.security_policies` replaces the built-in designation map rather than merging with it.** Merging would make it impossible for a configuration row to genuinely *change* a mapping — only to add one. The fail-closed consequence is deliberate and tested: a designation absent from a supplied set maps to nothing and therefore denies. A configuration that forgets a designation hides records; it never exposes them.

3. **`has_parent_case_access` accepts court-scoped principals holding `case_read`**, not only those with an explicit per-case scope row. A court-scoped judge legitimately reaches every case in their court, so their knowledge of the case's existence is equally legitimate and a 403 leaks nothing. Covered by `test_court_scoped_requester_gets_403_not_404`.

4. **Existence-hiding is evaluated independently of, and ahead of, reason precedence.** If the error code varied by denial cause, the difference would itself signal that a sealed matter exists. `test_hidden_responses_are_indistinguishable` asserts two blind-discovery responses are byte-identical despite differing underlying denials.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `decision.rego` and `sod.rego` written during Task 2 rather than Task 3**
- **Found during:** Task 2 (designation rules)
- **Issue:** Task 2's plan-named tests (`test_sealed_denied_403_when_requester_has_case_access`, `test_sealed_denied_404_when_blind_discovery`) assert on `reason_code` and `allow` — values produced only by the composed `decision` rule, which the plan scheduled for Task 3. Written as specified, Task 2's tests could not execute (`rego_unsafe_var_error: var decision is unsafe`).
- **Fix:** Brought `decision.rego` and `sod.rego` forward into Task 2 as dependencies. Task 3 then added their test suites and the CI workflow. All plan-named tests remain in their specified files.
- **Verification:** `opa test policy/` — 55/55 pass; both Task 2 named tests assert the composed `reason_code`.
- **Committed in:** `a5b891e`

**2. [Rule 1 - Bug] Off-by-one in the reason-precedence scan**
- **Found during:** Task 3 (decision tests)
- **Issue:** `highest_precedence_reason` used `every j in numbers.range(0, i - 1)` to express "no earlier reason matched". For `i == 0` this evaluates `numbers.range(0, -1)`, which in Rego counts *down* to `-1` rather than yielding an empty sequence, so the top-precedence reason (`AUTH_SOD_VIOLATION`) could never be selected. The rule went undefined and `decision` fell through to the `default`, reporting `AUTH_SCOPE_DENIED` for a self-approval. Caught by `test_precedence_sod_over_scope` and `test_self_approval_decision_reports_sod_violation`.
- **Severity note:** This was fail-*closed* (the request was still denied), so it would never have granted unauthorized access — but it would have returned a misleading reason code to the client and made the SoD violation invisible to the UI and to anyone triaging a denial.
- **Fix:** Replaced the scan with a min-over-matching-indices formulation: `reason_precedence[min(matched_precedence_indices)]`. The off-by-one trap is documented in a comment at the site.
- **Verification:** All three precedence tests pass; a mutation reversing the precedence list fails exactly those three, confirming each level is genuinely pinned.
- **Committed in:** `6c8ea6f`

**3. [Rule 2 - Missing Critical] `.gitignore` entry for `.tools/`**
- **Found during:** Task 1
- **Issue:** `scripts/opa-test.sh` downloads a ~30 MB binary into `.tools/`; without an ignore rule it would be committed.
- **Fix:** Added `.tools/` outside the Pivota-managed markers (inside them it would be overwritten on the next push).
- **Committed in:** `92e3483`

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 bug, 1 missing critical)
**Impact on plan:** No scope change. Deviation 1 is a task-ordering correction, not added work. Deviation 2 found and fixed a genuine defect in policy written by this plan.

## Verification Evidence

All commands run and output recorded:

| Check | Result |
|---|---|
| `bash scripts/opa-test.sh` | exit 0 — bootstraps OPA 0.64.1, `PASS: 55/55` |
| `opa check policy/` | exit 0 |
| `opa test policy/ \| grep -c FAIL` | `0` |
| 31 map pairs present | `31` ✓ |
| 15 resource types | ✓ (`test_map_resource_type_count`) |
| Empty input denies | `{"allow":false,...}` ✓ |
| Role-bearing, entitlement-less principal denies | `allow: false` ✓ |
| `decision` key shape | `["allow","hide_existence","reason_code"]` ✓ |
| `policy.yml` parses as YAML | valid; job `policy-test` |
| `ci.yml` untouched | not in any commit by this plan ✓ |
| All 10 policy files share one package | ✓ |
| No `.ts`/`.js` authored | ✓ |

**Bootstrap tested from clean:** `.tools/` was deleted and `scripts/opa-test.sh` re-run end-to-end, confirming a fresh clone works with no prior setup.

### Mutation testing

Rather than trusting that 55 green tests mean the rules are enforced, each critical control was deliberately broken to confirm the suite catches it:

| Mutation | Tests that failed | Control proven |
|---|---|---|
| Dropped a row from `action_entitlement_map` | 3 | Route-inventory coverage is real |
| Made roles imply entitlements | 2 | "Role existence never implies access" |
| `hide_existence` always true (blanket 404) | 3 | 403 path is genuinely reachable |
| `hide_existence` never true (blanket 403) | 1 | 404 existence-hiding is genuinely reachable |
| Reversed reason precedence | 3 | All three precedence levels pinned |
| Disabled `designation_deny` | 11 | `decision` → `designation` composition is live |

## Success Criteria

| Criterion | Status |
|---|---|
| `opa check` and `opa test` both exit 0, zero failures | ✓ 55/55 |
| Exactly one entry point returning `{allow, reason_code, hide_existence}` | ✓ |
| Default decision is deny; empty and malformed input return `allow: false` | ✓ |
| Role but no entitlements → denied, proven by named test | ✓ `test_role_without_entitlement_denied` |
| Cross-court request denied, proven by named test | ✓ `test_cross_court_denied` |
| Same sealed resource → 403 with parent access, 404 blind, two named tests | ✓ both |
| Self-approval → `AUTH_SOD_VIOLATION`, proven by named test | ✓ `test_self_approval_decision_reports_sod_violation` |
| No authorization logic in TypeScript | ✓ no `.ts` authored |

## Threat Model Coverage

| Threat | Mitigation | Asserted by |
|---|---|---|
| T-01-04 — undefined decision misread as allow | `default decision := {allow: false, ...}` | `test_default_is_deny_on_empty_input`, `test_default_is_deny_on_malformed_input`, `test_decision_always_complete_document` |
| T-01-05 — 403 on blind-discovery leaks sealed-matter existence | `hide_existence` gates on `has_parent_case_access`; branch outranks all other denials | `test_hide_existence_wins_over_other_denials`, `test_hide_existence_wins_over_sod`, `test_hidden_responses_are_indistinguishable` |
| T-01-06 — later-phase resource type with no map row is allowed | `entitlement_deny` fires when `required_entitlement` is undefined | `test_unmapped_resource_type_denied`, `test_unmapped_action_on_mapped_type_denied` |

## Known Stubs

**None found.** The scan over `policy/`, `scripts/opa-test.sh` and `.github/workflows/policy.yml` returned no `TODO`/`FIXME`/`placeholder`/`not implemented` markers, and no rule returns a hardcoded result standing in for real logic.

## Issues Encountered

- **Rego `future.keywords` imports are per-file.** Four files needed `import future.keywords.every` added after `opa check` rejected the `every` comprehensions. Caught immediately by `opa check`; no impact beyond the edit.
- **PyYAML is unavailable in the sandbox**, so the plan's `python3 -c "import yaml..."` workflow-validation command could not run as written. Validated with Node's `yaml` parser instead — the same parse GitHub performs. Both `policy.yml` and `ci.yml` parse cleanly.

## Notes for Downstream Plans

- **Plan 01-07 (API guard):** the contract is in `policy/README.md`. Call `POST /v1/data/judicialsync/authz/decision`. Map `RESOURCE_NOT_FOUND` to the per-resource 404 code (`CASE_NOT_FOUND`, `AUDIT_NOT_FOUND`, …) — the policy deliberately does not know those. `reason_code` is `""` exactly when `allow` is `true`.
- **Plans 01-08 … 01-12:** every `@Resource()` descriptor must have a row in `action_entitlement_map`. An unmapped pair is **denied**, and `test_map_covers_every_declared_route` will fail if the map and the README table disagree. `policy/**` is owned by this plan — request the row here rather than editing the bundle.
- **Plan 01-11 (configuration read path):** supply `input.security_policies` as `[{designation, required_entitlement}]`. It replaces the built-in defaults wholesale; include every designation in use.
- **Plan 01-04 (seed/Compose):** the entitlements the map expects are `case_read`, `case_create`, `case_update`, `case_security_admin`, `audit_reader`, `file_upload`, `retention_viewer`, `disposition_confirm`, `access_admin`, `key_custodian`, plus the five `designation_*` entitlements. The OPA image pin `openpolicyagent/opa:0.64.1-static` must stay in sync with `OPA_VERSION` in `scripts/opa-test.sh`.

## Next Phase Readiness

The policy bundle is complete, loadable, and independently testable with no application dependency — plan 01-07's guard has a stable contract to code against, and plans 01-08 through 01-12 have an authoritative entitlement map. Wave 1 parallelism held: this plan touched no file owned by plan 01-01 (`ci.yml` was left untouched; `policy.yml` is a sibling as that plan's ownership table anticipated).

**Ready for 01-03.**

## Self-Check: PASSED

- **Files:** all 13 created files verified present on disk.
- **Commits:** `92e3483`, `a5b891e`, `6c8ea6f` all verified in `git log`.
- **Build/test:** `.tools/` deleted and `bash scripts/opa-test.sh` re-run from clean → **exit 0**, `PASS: 55/55`. (For a policy bundle, `opa check` + `opa test` is the build.)
- **Known Stubs:** section present; none found, none blocking.

---
*Phase: 01-core-identity-case-model-audit-security-baseline*
*Completed: 2026-10-05*
