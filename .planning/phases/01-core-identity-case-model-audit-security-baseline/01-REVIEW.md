---
phase: 1
status: issues_found
blockers: 1
warnings: 2
review_blockers_open: 1
files_reviewed: 28
files_reviewed_list:
  - apps/api/src/main.ts
  - apps/api/src/common/guards/abac.guard.ts
  - apps/api/src/modules/identity/auth.service.ts
  - apps/api/src/modules/identity/dto/auth.dto.ts
  - apps/api/src/modules/entitlements/grants.service.ts
  - apps/api/src/modules/entitlements/grants.controller.ts
  - apps/api/src/modules/entitlements/bootstrap.service.ts
  - apps/api/src/modules/entitlements/bootstrap.controller.ts
  - apps/api/src/modules/files/files.service.ts
  - apps/api/src/modules/files/files.controller.ts
  - apps/api/src/modules/files/object-store.service.ts
  - apps/api/src/modules/files/allowlist.service.ts
  - apps/api/src/modules/audit/audit.service.ts
  - apps/api/src/modules/audit/explorer.service.ts
  - apps/api/src/modules/audit/explorer.controller.ts
  - apps/api/src/modules/audit/dto/explorer.dto.ts
  - apps/api/src/modules/audit/integrity/chain-verifier.service.ts
  - apps/api/src/modules/audit/integrity/integrity-status.service.ts
  - apps/api/src/modules/audit/integrity/integrity.controller.ts
  - apps/api/src/modules/audit/integrity/integrity.processor.ts
  - apps/api/src/modules/case-context/case-context.service.ts
  - apps/api/src/modules/case-context/cases.service.ts
  - apps/api/src/modules/case-context/cases.controller.ts
  - apps/api/src/modules/case-context/designations.controller.ts
  - apps/api/src/modules/case-context/proceedings.service.ts
  - apps/api/src/modules/case-context/proceeding-activity.probe.ts
  - apps/api/src/modules/config/config.controller.ts
  - apps/api/src/modules/config/court-config.service.ts
  - apps/api/src/modules/retention/retention.service.ts
  - apps/api/src/modules/retention/disposition.guard.ts
  - apps/api/src/modules/retention/key-access.controller.ts
  - apps/web/src/api/client.ts
  - apps/web/src/auth/AuthProvider.tsx
  - apps/web/src/auth/CallbackPage.tsx
  - apps/web/src/auth/RequireSession.tsx
  - apps/web/src/pages/AuditExplorerPage.tsx
  - apps/web/src/pages/CaseListPage.tsx
  - apps/web/src/pages/audit/AuditFilters.tsx
  - apps/web/src/pages/audit/ChainIntegrityBadge.tsx
  - apps/web/src/routes.tsx
  - apps/web/src/api/generated/services.gen.ts
reviewed_at: 2026-10-06T07:35:43Z
iteration: 1
---

# Phase 1 Code Review

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
