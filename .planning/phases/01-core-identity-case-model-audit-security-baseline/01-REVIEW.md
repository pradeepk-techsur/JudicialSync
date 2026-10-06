---
phase: 1
status: clean
blockers: 1
warnings: 2
review_blockers_open: 0
files_reviewed: 6
files_reviewed_list:
  - apps/api/src/modules/audit/integrity/chain-verifier.service.ts
  - apps/api/src/modules/case-context/designations.controller.ts
  - apps/api/src/openapi.ts
  - apps/web/src/api/generated/schemas.gen.ts
  - apps/web/src/api/generated/types.gen.ts
  - apps/web/src/auth/AuthProvider.tsx
reviewed_at: 2026-10-06T08:05:00Z
iteration: 2
---

# Phase 1 Code Review

## Iteration 2 — re-review verdict (status: clean, review_blockers_open: 0)

Re-review of the three iteration-1 findings after the code-fixer's commits
(`987a5bc` B1, `3b5002e` W1, `a7e46d1` W2). Scope: the six fixer-touched files
(`chain-verifier.service.ts`, `designations.controller.ts`, `openapi.ts`, the two
regenerated web client files, `AuthProvider.tsx`) plus their verification seams
(`audit.service.ts` insert path, `integrity-status.service.ts`, `integrity.processor.ts`,
`entitlement-resolver.service.ts`/`principal.types.ts`, `audit-integrity-job.e2e-spec.ts`).
Each fix was read in full — not trusted from the commit message — and checked for
regressions. **All three findings are genuinely resolved; no fix-introduced
regression survives refutation.** `apps/api` and `apps/web` `tsc --noEmit` both pass.

- **B1 — FIXED.** The verifier now traverses by LINKAGE: it indexes each
  `(occurred_at, id)` batch by `prev_hash` into a `pending` map and consumes rows
  in `prev_hash → row_hash` order from `chainStart`, so a concurrency-driven
  timestamp/linkage divergence no longer produces a false `prev_hash_mismatch`.
  The `row_hash` content check (`checkRowHashOnly`) recomputes from each row's OWN
  stored `prev_hash`, so it stays order-independent and a content tamper is still
  caught; the traversal advances on the STORED `row_hash` (line 196), so a
  mid-chain `row_hash` edit surfaces as one content break plus a localised
  detached-segment head rather than one break per following row. Detached
  segments, fork tampers (two rows sharing a `prev_hash`), and cycles are each
  handled and counted; `chain_head_mismatch` tail-detection still runs on the full
  walk. The 9 integrity-job e2e cases exercise content tamper, mid-chain
  `prev_hash` tamper, tail deletion, multi-break, and the no-repair invariant.
  Refuted the one residual I could construct (an incremental-window BOUNDARY row
  could still mis-seed `prev_hash` under boundary straddle): it is a PRE-EXISTING
  property of the `seedPrevHash`/windowing design — untouched by this fix — and
  the authoritative daily FULL walk is boundary-free and now correct; the new
  linkage walk strictly IMPROVES the incremental interior over the old sort walk.
  Noted as an observation below, not a finding.

- **W1 — FIXED.** Root cause was the OpenAPI source (`openapi.ts`) declaring the
  scope shape as `{scope_type, scope_id}`. It now declares
  `{scope_type, scope_value, scope_enum_value}`, matching what the API actually
  emits (`entitlement-resolver.service.ts` → `principal.types.ts` `ScopeAttribute`).
  `openapi.json`, `types.gen.ts`, `schemas.gen.ts` and the hand-written
  `AuthProvider.tsx` `ScopeAttribute` are all realigned. A repo-wide search finds
  zero remaining `scope_id` reference in `apps/web/src`; the web client copies
  `data.scopes` through unchanged, now shape-consistent with the server.

- **W2 — FIXED.** `designations.controller.ts` now threads a `runningSet` through
  the apply and revoke loops; each `changeEvent` derives `after_state` from the
  passed `beforeSet` and the caller advances `runningSet` to that `after_state`,
  so successive events chain (event n `after` == event n+1 `before`) and the final
  event shows the true cumulative set. The returned payload is independently
  re-queried from the DB, so it is unaffected either way. Carries the fixer's
  `requires human verification` flag for the multi-change path (no existing e2e
  exercises it); the single-change `designations-api` suite passes unchanged.

### Iteration-2 observation (pre-existing, not a finding)
On an INCREMENTAL verify, `seedPrevHash` picks the pre-window predecessor by
`occurred_at` order; under the same timestamp/linkage divergence B1 describes, a
boundary-straddling commit pair could mis-seed the first in-window row and write a
sticky `critical` alert. This is inherent to time-windowing (the boundary is a
wall-clock instant), is NOT introduced or worsened by `987a5bc`, and is masked in
practice by the daily full re-walk (boundary-free, authoritative for
`chain_verified`) and the 2×-interval window overlap. Worth a hardening ticket for
a later phase (seed/boundary by linkage, or treat an unresolved incremental
boundary as inconclusive rather than a break) — out of scope for this phase's goal.

---

The phase diff was taken from the root commit `9e4410b` (the phase branch base — it
is a root commit with no parent) to `HEAD`, excluding `.planning`, lockfiles and
generated client code (read separately only to confirm integration seams). The
security-critical core — the ABAC guard, auth/session flow, grant SoD, bootstrap,
file-upload pipeline, audit Explorer scoping, the hash-chain verifier, and the
frontend↔backend seams — was read in full. The implementation is, overall,
unusually careful: fail-closed defaults, PDP-single-authority, append-only audit,
pre-filtered (not post-filtered) designation exclusion, and byte-identical 404s are
all correctly realised. One real correctness defect in the integrity verifier
survives refutation as a BLOCKER.

## BLOCKERs

### B1: Hash-chain verifier raises false `AUDIT_CHAIN_BROKEN` alerts because it reconstructs chain linkage from `(occurred_at, id)` sort order, which diverges from true insertion order under concurrency
- **File:** apps/api/src/modules/audit/integrity/chain-verifier.service.ts:140-190 (walk/ordering); apps/api/src/modules/audit/audit.service.ts:84-94 (root cause)
- **Category:** bug
- **Evidence:**
  The chain is *built* at insert time by serialising writers on a `FOR UPDATE`
  lock of the single `audit_chain_head` row (`audit.service.ts` step 1, lines
  89-94). The true predecessor of any row is therefore the row that held that lock
  immediately before it — i.e. **insertion/linkage order**, which `prev_hash`
  encodes directly.

  However, `occurred_at` is captured in JS **before** the lock is acquired:
  ```ts
  const occurredAt = new Date();           // line 84 — BEFORE the lock
  const head = await tx.$queryRaw`... FOR UPDATE`;  // line 89 — lock acquired here
  ```
  Two concurrent writers can therefore capture `occurred_at` timestamps in one
  order and then acquire the chain-head lock (and thus link into the chain) in the
  opposite order. The stored chain is perfectly intact (`prev_hash` → `row_hash`
  linkage is correct), but `occurred_at` is **not** monotonic with respect to the
  linkage.

  `ChainVerifierService.verify` ignores the `prev_hash` linkage as a traversal key
  and instead re-sorts every row by `(occurred_at, id)` (`fetchBatch` ORDER BY
  lines 340; walk lines 144-183), then asserts `row.prev_hash === expectedPrev`
  where `expectedPrev` is the *previous row in sort order*'s `row_hash` (line 181).
  When sort order ≠ linkage order, this comparison fails on genuinely-intact rows:
  the walk emits a `prev_hash_mismatch` `ChainBreak`, and `persistAlerts`
  (lines 272-304) writes a **`critical` `integrity_alerts` row** and logs
  `AUDIT_CHAIN_BROKEN`. `IntegrityStatusService.getStatus` then reports
  `chain_verified: false` from the open-alert count (lines 97-121), which drives
  the Explorer UI's non-dismissable "Audit integrity check failed — escalated to
  security officer" state (`ChainIntegrityBadge.tsx:99-137`).

  This is not merely a test artefact. The phase's own `deferred-items.md` DEF-03
  already observed it against the shared stack ("up to 55 breaks over 379 rows …
  every orphan is an `access_attempt` event") and correctly diagnosed it as an
  ordering/interleave problem, but logged it as an "observation" owned by a later
  plan. It is a genuine false-positive on the single most important integrity
  signal in the system: any production concurrency (two `access_attempt` denials,
  or a denial interleaving with a domain write, committing with
  close/out-of-order `occurred_at`) will, on the daily full re-walk, manufacture a
  `critical` integrity alert and tell an auditor the audit trail was tampered with
  when it was not. A tamper-evidence mechanism that cries wolf under normal load
  undermines the very property Phase 1 success criterion 3 must demonstrate.
- **Fix direction:** The verifier must traverse the chain by its *linkage*, not by
  a timestamp re-sort. Walk by following `prev_hash` → `row_hash` from genesis
  (the stored `prev_hash` already names each row's true predecessor), or make the
  stored `occurred_at` monotonic with lock order by capturing it *after* the
  `FOR UPDATE` acquisition and/or ordering the walk by an insertion-monotonic key
  (e.g. a sequence/`ctid`-free surrogate) rather than `(occurred_at, id)`. Either
  closes the divergence; following the linkage is the more robust choice because it
  makes the verifier independent of any wall-clock assumption. (Note the Explorer's
  keyset pagination shares the `(occurred_at, id)` ordering, but there it is
  benign — it only affects page boundaries, not a correctness verdict.)
- **Resolution:** fixed (987a5bc). The verifier now traverses by LINKAGE
  (`prev_hash` → `row_hash`) from genesis instead of a `(occurred_at, id)`
  re-sort. Rows are still fetched in `(occurred_at, id)` batches to stay
  memory-bounded, but indexed by `prev_hash` and consumed in linkage order;
  detached segments are localised to their head so a mid-chain tamper breaks the
  chain once at the tampered point. Verified against the live Compose stack: the
  old sort walk would report 103 `prev_hash` mismatches on the shared chain
  (confirmed by a direct SQL `LAG` query), the linkage walk reports only the 26
  genuine cuts (rows whose `prev_hash` names a non-existent `row_hash`). All 9
  `audit-integrity-job` e2e cases and all 8 `criterion-3-audit-immutability`
  assurance cases pass — deliberate `prev_hash`, tail-deletion and `row_hash`
  tampers are still detected.

## WARNINGs

### W1: Frontend `ScopeAttribute` field name (`scope_id`) does not match the backend `EntitlementsDto` scope shape (`scope_value` / `scope_enum_value`)
- **File:** apps/web/src/auth/AuthProvider.tsx:53-57, 165-168; cf. apps/api/src/modules/identity/dto/auth.dto.ts:109 and the `ScopeAttribute` type it imports
- **Evidence:** The backend `/auth/entitlements` payload carries scope rows with
  `scope_type`, `scope_value`, `scope_enum_value` (the `Principal`/`ScopeAttribute`
  shape used throughout the API and sent verbatim by `toEntitlementsDto`). The
  web `ScopeAttribute` interface instead declares `{ scope_type; scope_id? }`, and
  `AuthProvider` copies `data.scopes` straight into `principal.scopes`. `scope_id`
  will therefore always be `undefined` client-side. This is latent in Phase 1 only
  because nothing in the web app reads a scope's value — `hasEntitlement` consults
  `entitlements` alone, and a grep of `apps/web/src` finds no reader of
  `scope_value`/`scope_id`. It is type drift that will silently mis-map the moment
  a future screen tries to render or filter by scope. Not a Phase 1 functional
  break, hence a WARNING. Fix direction: align the web interface to the generated
  contract (`scope_value`/`scope_enum_value`) or drive it from `types.gen.ts`.
- **Resolution:** fixed (3b5002e). The root cause was the OpenAPI spec itself:
  `apps/api/src/openapi.ts` declared the scope shape as `{scope_type, scope_id}`
  while the API returns `{scope_type, scope_value?, scope_enum_value?}`
  (`EntitlementsDto`/`ScopeAttribute`), so the *generated* web types carried the
  same `scope_id` drift. Fixed `openapi.ts`, re-emitted `openapi/openapi.json`,
  regenerated the web client (`types.gen.ts`/`schemas.gen.ts`), and aligned the
  hand-written `AuthProvider.tsx` `ScopeAttribute` interface. Both `apps/api`
  and `apps/web` `tsc --noEmit` pass; no remaining `scope_id` reference in
  `apps/web/src`.

### W2: Multi-change designation updates write audit events whose before/after sets are each computed from the original set, so no single event reflects the cumulative state
- **File:** apps/api/src/modules/case-context/designations.controller.ts:128-188 (loop over `added`/`removed`, `changeEvent` using `currentSet`)
- **Evidence:** When a single `PATCH .../security-designations` both adds and
  removes (or adds several) designations, every emitted `designation_change` event
  derives `before_state`/`after_state` from the same captured `currentSet`
  (`changeEvent(..., currentSet, ...)`). So for two adds X then Y, event-1 records
  `after = {…,X}` and event-2 records `after = {…,Y}` — neither event shows the
  true post-operation set `{…,X,Y}`, and the per-event `before`/`after` do not form
  a consistent successive chain. Each event does carry an unambiguous
  `changed`/`change` marker, and the final active set is reconstructable from the
  rows, so this is an audit-fidelity degradation rather than data loss or an access
  defect — a WARNING. `US-1.2` ("each designation change produces an audit event
  with before/after state") is arguably weakened for the multi-change case. Fix
  direction: thread a running set through the loop so each event's before/after is
  the state immediately surrounding that single change.
- **Resolution:** fixed (a7e46d1). A `runningSet` is now threaded through the
  apply then revoke loops: each event's `before_state` is the set immediately
  before that single change and its `after_state` the set after it, so
  successive events chain (event n `after_state` == event n+1 `before_state`)
  and the final event shows the true cumulative set. Tier 1 (re-read) and Tier 2
  (`tsc --noEmit`) clean; the single-change `designations-api` e2e suite (5
  cases) passes unchanged. No existing test exercises the multi-change chaining
  path, so this carries a `requires human verification` flag for UAT.

## Observations (pre-existing / out of file-ownership — not phase-diff defects)

- **DEF-01** (`deferred-items.md`): the seeded `judge` cannot read the seeded
  sealed case because a `case`-scope seed row narrows them away from it before the
  designation layer runs. Lives in `prisma/seed/**` (not in this review's scope);
  the positive half of success criterion 4 is demonstrated only via an in-test
  scope insertion. Policy and seed are each individually correct; the mismatch is a
  fixture concern. Noted, not a finding here.
- **DEF-02** (`deferred-items.md`): `INTERNAL_SERVICE_TOKEN` is not forwarded to
  the `api` service in `docker-compose.yml`, so `POST /audit/events` and
  `/security/policy-evaluate` deny every caller in the Compose stack. Fail-closed
  (correct direction) and no Phase-1 user-facing path calls them, but any Phase 2+
  internal integration will 403. Lives in `docker-compose.yml` (plan 01-04), not in
  the source diff reviewed here.

## Cross-file seams checked
- `casesControllerList` (web CaseListPage) ↔ `GET /cases` controller/service — OK (payload `{cases,total}` matches `CaseListPayload`).
- `auditExplorerControllerExplore` (web AuditExplorerPage/AuditFilters) ↔ `GET /audit/explorer` + `AuditExplorerQuerySchema` — OK; all FILTER_KEYS + `cursor` are in the `.strict()` schema; empties stripped client-side so no `.strict()` rejection.
- `integrityControllerGetStatus` / `GetAlerts` (web ChainIntegrityBadge) ↔ `IntegrityController` — OK (response shapes match; status drives badge/alert correctly). The data *content* is affected by B1, not the seam.
- `authControllerEntitlements` ↔ `EntitlementsDto` — scope field drift (see W1); `entitlements`/`roles`/`display_name` all align.
- `authControllerLogin` (web CallbackPage) ↔ `POST /auth/login` (`identity_assertion`/`state`/`callback_params`) — OK (RFC 9207 `iss` forwarded verbatim).
- Grant workflow routes ↔ `sod.rego` action binding — OK; `deny` deliberately uses `action:'approve'` and `revoke` uses `entitlement_grant` (leaves `requested_by` null) exactly as the SoD rule requires; service-layer SoD check present as defense-in-depth.
- `@Resource(...)` descriptors on every controller route ↔ global `AbacGuard` fail-closed-on-undeclared — OK; self-scoped/key-access routes correctly carry `@SelfScoped()` with a local entitlement check for the feature-specific `SECURITY_KEY_ACCESS_DENIED` code.
- File upload `@Resource` + multipart limit ↔ `AllowlistService`/`ClamAvScanner`/`ObjectStoreService` ordering (allowlist → scan → store → DB+audit) — OK; store-before-DB with compensating orphan log; sniffed-not-declared type decision; fail-closed empty allowlist. (Doc nit: the upload controller comment references `SECURITY_FILE_TYPE_TOO_LARGE` while the code emits `SECURITY_FILE_TOO_LARGE` — comment-only, no code impact.)
