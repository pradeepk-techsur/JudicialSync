---
phase: 01-core-identity-case-model-audit-security-baseline
plan: 07
subsystem: auth
tags: [abac, opa, rego, pdp, authorization, nestjs, audit, fail-closed]

# Dependency graph
requires:
  - phase: 01-02
    provides: the Rego bundle at policy/judicialsync/authz and its published {allow, reason_code, hide_existence} contract
  - phase: 01-03
    provides: platform schema, security_designations revocation columns, append-only grants
  - phase: 01-05
    provides: AuditService, recordStandaloneAudit, ServiceTokenGuard
  - phase: 01-06
    provides: SessionAuthGuard populating request.principal, EntitlementResolverService
provides:
  - PdpClient — fail-closed OPA client with a bounded AbortController timeout and no fallback path
  - ResourceLoaderService — database-resolved court/division/case/proceeding/designation attributes for all 15 resource types
  - "@Resource() route descriptor, with ResourceType mirroring plan 01-02's action_entitlement_map"
  - AbacGuard — the real global enforcement point, applying OPA's verdict with the 403/404 split and access_attempt auditing
  - POST /security/policy-evaluate — the internal PDP oracle, service-token guarded, immune to caller-supplied scope
  - jest.policy.config.js + npm run test:policy — the live-stack policy suites
affects: [01-08, 01-09, 01-10, 01-11, 01-12, 01-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guard assembles input, PDP decides, guard translates — no authorization logic in TypeScript"
    - "Every protected route declares exactly one @Resource(); an undeclared route is denied 503, never allowed"
    - "A denial's audit write is swallowed on failure so it can never change the response"
    - "Live-stack suites get their own jest config; the hermetic npm test stays Docker-free"

key-files:
  created:
    - apps/api/src/modules/policy/pdp.types.ts
    - apps/api/src/modules/policy/pdp.client.ts
    - apps/api/src/modules/policy/resource-descriptor.decorator.ts
    - apps/api/src/modules/policy/resource-loader.service.ts
    - apps/api/src/modules/policy/policy-evaluate.controller.ts
    - apps/api/src/modules/policy/policy-contract.spec.ts
    - apps/api/test/abac-guard.e2e-spec.ts
    - apps/api/test/abac-fail-closed.e2e-spec.ts
    - apps/api/test/abac-probe.controller.ts
    - apps/api/jest.policy.config.js
  modified:
    - apps/api/src/common/guards/abac.guard.ts
    - apps/api/src/modules/policy/policy.module.ts
    - apps/api/test/auth-harness.ts
    - apps/api/test/guards-fail-closed.e2e-spec.ts
    - apps/api/jest.config.js
    - apps/api/package.json

key-decisions:
  - "PdpClient has no cached-decision, last-known-good or circuit-breaker path, and the class comment names each tempting 'availability improvement' as the same fail-open bug — a cached allow is issued by a system that cannot evaluate whether it should allow, replaying the entitlement most likely just revoked"
  - "parsePdpDecision rejects a stringly-typed allow rather than coercing: Boolean(\"false\") is true, so coercion would silently convert the fail-closed client into a fail-open one"
  - "security_policies is OMITTED, never sent empty, when a court has no rows — the bundle replaces its defaults wholesale, so [] would map every designation to nothing and deny every designated record in a court whose config had not loaded"
  - "Every security_designations read goes through one activeDesignationsFor helper; a missed revocation filter is a false DENIAL, which users report as 'I lack the entitlement' rather than as a bug, so it can persist for the life of a record"
  - "Both the hidden-resource and genuinely-absent 404 paths call one notFound() method, so the bodies cannot diverge into an existence oracle"
  - "A failed access_attempt write is logged as an integrity gap and swallowed — converting a 403 into a 500 would hand the caller a different signal, and on the 404 path would leak that something is there to fail about"
  - "The missing-@Resource() probe route lives in test code, because a real route missing its descriptor IS the bug the guard exists to catch"
  - "/security/policy-evaluate accepts requester_scope for API-shape compatibility and never lets it influence the decision, echoing disagreements under detail.supplied_scope_ignored so caller drift is visible rather than silent"

patterns-established:
  - "Contract parity by parsing, not copying: policy-contract.spec.ts reads abac.rego itself to assert ResourceType matches the policy map, so the two cannot drift"
  - "Resolver coverage asserted against the logger rather than the return value, since a missing resolver and a database miss both return null"
  - "Live-stack test helpers pair a scope/entitlement write with revokeAllForUser, per 01-06's documented invalidation rule"

# Metrics
duration: 78 min
completed: 2026-10-05
---

# Phase 1 Plan 07: ABAC Policy Enforcement Summary

**The deny-everything stub is now a real enforcement point: every protected request loads its target's attributes from the database, is decided by the OPA container, and is refused with the 403/404 split the FRD specifies — with the denial itself written to the hash-chained audit trail.**

## Performance

- **Duration:** 78 min
- **Tasks:** 3
- **Files created:** 10 · **modified:** 6
- **Tests:** 155 hermetic (was 134), 24 new live-stack policy, 38 auth unchanged

## Accomplishments

- `AbacGuard` replaced plan 01-01's 503 stub with the real flow — public → self-scoped → undeclared-deny → load → evaluate → apply — containing **no** authorization logic of its own.
- Cross-court isolation, role-without-entitlement denial, the sealed-record 403-vs-404 distinction, and the forgot-the-decorator 503 are all demonstrated over HTTP against the real OPA container and real TOTP logins.
- Stopping the OPA container genuinely turns a 200 into a 503 and back — asserted as a round trip, so the 503 is pinned to the PDP's absence rather than to any other breakage.
- `POST /security/policy-evaluate` ships internal-only and cannot be steered by caller-supplied scope.
- Designation policy is proven configuration-driven by *changing* a `security_policies` row and watching a previously-allowed read close.

## Task Commits

1. **Task 1: PDP client and resource attribute loader** — `152252b` (feat)
2. **Task 2: Real AbacGuard with 403/404 mapping and access_attempt auditing** — `0a31ac1` (feat)
3. **Task 3: /security/policy-evaluate and the fail-closed proof** — `be33456` (feat)

## Files Created/Modified

- `pdp.types.ts` — the wire contract, transcribed from `policy/README.md`, with a non-coercing decision parser
- `pdp.client.ts` — OPA client; every failure mode raises 503 `SECURITY_POLICY_UNAVAILABLE`
- `resource-descriptor.decorator.ts` — `@Resource()`, with the 15-type union mirroring the Rego map
- `resource-loader.service.ts` — real attributes for all 15 types; one revocation-filtered designation reader
- `policy-evaluate.controller.ts` — the internal PDP oracle
- `abac.guard.ts` — the authoritative enforcement point
- `policy-contract.spec.ts` — 21 hermetic proofs of the properties grep cannot check
- `abac-guard.e2e-spec.ts` / `abac-fail-closed.e2e-spec.ts` — 24 live-stack tests
- `abac-probe.controller.ts` — probe routes, including the deliberately-undeclared one
- `jest.policy.config.js` + `test:policy` — the live-stack config, mirroring 01-06's split

## Decisions Made

See `key-decisions` in the frontmatter. The load-bearing one is the absence of any PDP fallback: the class comment enumerates the four plausible "availability improvements" and explains that each converts a specified outage into a silent bypass active precisely when authorization is broken.

A second worth surfacing: **the three live-suite defects below were all found by running the tests, and each had failed in the safe direction.** The misconfigured `OPA_URL` in particular produced a suite in which every route 503'd — the guard failing closed correctly over a harness address. Had the client been written with the fallback this plan forbids, the same misconfiguration would have produced a green suite in which nothing was ever actually authorized.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `AbacGuard`'s new constructor broke plan 01-01's fail-closed suite**
- **Found during:** Task 2
- **Issue:** `guards-fail-closed.e2e-spec.ts` constructs the guard directly and registers it as an `APP_GUARD`; four new dependencies broke both.
- **Fix:** Supplied **throwing** doubles rather than permissive ones. Every path that suite exercises is decided before the guard touches a collaborator, so a call means the chain has changed — and the file's purpose is to fail loudly when it does.
- **Commit:** `0a31ac1`

**2. [Rule 1 - Bug] `OPA_URL` defaulted to an address the test process cannot reach**
- **Found during:** Task 2
- **Issue:** `.env.example`'s `http://localhost:8181` reaches nothing from the host — Compose publishes only `proxy:8443` by design. Every evaluation failed with `TypeError: fetch failed` and every protected route answered 503.
- **Fix:** `testOpaUrl()` discovers the container address via `docker inspect`, exactly as the harness already did for `db` and `redis`; `bootApp` sets it for every suite, since `AbacGuard` is global.
- **Commit:** `0a31ac1`

**3. [Rule 1 - Bug] The audit assertion matched login events**
- **Found during:** Task 2
- **Issue:** `action_type = 'access_attempt'` is shared with 01-06's `AuthService`, which writes `login_success` under it. Every test signs in first, so the newest row was reliably the login — the helper asserted against the wrong row and reported `Received: {"outcome": "login_success"}`.
- **Fix:** Filter on `after_state->>'outcome' = 'denied'`.
- **Commit:** `0a31ac1`

**4. [Rule 1 - Bug] A scope row written directly was invisible to the guard**
- **Found during:** Task 2
- **Issue:** `EntitlementResolverService` caches the principal — including scopes — per user for `claim_cache_seconds`. Re-login did not help, because the cache is per-user, not per-session. The request was denied `AUTH_SCOPE_DENIED` with the stale principal entirely correct about a five-minute-old state. This is exactly the "revoke without invalidate" half of 01-06's pairing rule, which that file calls *"the worse of the two because it looks like it worked."*
- **Fix:** Test helpers pair every scope write with `revokeAllForUser`, which invalidates as part of its contract.
- **Commit:** `0a31ac1`

**5. [Rule 1 - Bug] The no-service-token test sent a valid token**
- **Found during:** Task 3
- **Issue:** `token: string | undefined = SERVICE_TOKEN` applies its default to an *explicit* `undefined`, so the case written to mean "send no token" sent the valid one and got 200 where it asserted 403.
- **Fix:** An explicit `omitToken` flag. Because a test bug and a missing guard present identically here, the guard was verified independently against the live stack (`curl` with no token and with a wrong token both → 403) before concluding the test was at fault.
- **Commit:** `be33456`

### Deliberate additions beyond the plan

- **`policy-contract.spec.ts` (21 hermetic tests).** The plan's `<verify>` greps are tripwires that match comments as readily as code — two of them initially fired on my own warning prose. The real properties are now machine-checked: `ResourceType` is compared against `abac.rego` *parsed from disk*, all 15 types are proven to reach a resolver, and the client is proven to deny on each failure mode. These run under `npm test`, so they gate every commit rather than only stack-up runs.
- **`jest.policy.config.js`.** The live suites need the CA `globalSetup`; folding them into the hermetic config would make `npm test` require Docker, and widening `jest.auth.config.js` would edit plan 01-06's file.

---

**Total deviations:** 5 auto-fixed (1 blocking, 4 bugs), plus 2 deliberate additions.
**Impact:** No scope creep. Four of the five bugs were in this plan's own test code and were found by running it; the fifth was a constructor break in an inherited test.

## Issues Encountered

Two findings are **real and remain open**, logged in `deferred-items.md`. Both lie outside this plan's file ownership, so neither was fixed here.

**DEF-01 — the seeded `judge` cannot read the seeded sealed case.** `seed/courts.ts` states the sealed case is "visible to [judge] and denied to [clerk]". It is not: 01-04 gives `judge` a case-scope row on the *plain* case, and under 01-02's narrowing semantics one such row confines the principal to exactly the cases named — so the sealed read is denied on **scope**, before designation is ever considered. Both plans are individually correct and were never checked against each other; neither plan's tests could have caught it (01-02 uses synthetic principals, 01-04 asserts rows exist rather than what they authorize). **Consequence:** the *positive* half of Phase 1 criterion 4 is not demonstrable from the seed as it stands. The guard suite adds the missing scope row in-test and asserts **both** states, so the narrowing semantics stay pinned rather than papered over. One-row fix recommended to 01-14.

**DEF-02 — `INTERNAL_SERVICE_TOKEN` is absent from `docker-compose.yml`'s `api` environment.** Both internal routes therefore 403 in the deployed stack. **Pre-existing, not introduced here** — confirmed by the identical symptom on 01-05's `POST /audit/events`. `ServiceTokenGuard` failing closed on an unset secret is correct behaviour. Nothing caught it because the in-process suites set the variable themselves and structurally cannot observe what Compose forwards, making this a coverage gap as much as a configuration one. One-line fix recommended to 01-14.

## Known Stubs

**None.** A scan of every created and modified file found one `placeholder` match, in an `abac.guard.ts` comment explaining why the nil UUID is used for an absent `object_id` — explanatory prose, not an incomplete implementation. No handler returns hardcoded data, no function body is empty, and no error is silently swallowed except the one documented deliberate case (the audit-write failure on a denial, which must not alter the response).

## Verification

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit -p apps/api/tsconfig.json` | exit 0 |
| Root build | `npm run build` | exit 0 |
| Hermetic suite | `npm test` | **155 passed** / 8 suites (was 134) |
| Auth suite (01-06 regression) | `npm run test:auth` | **38 passed** / 3 suites |
| Policy suites (live stack) | `npm run test:policy` | **24 passed** / 2 suites |
| No policy logic in TypeScript | plan's grep over `abac.guard.ts` | no match |
| No fail-open fallback | plan's grep over `pdp.client.ts` | no match |
| Designation reads filter revocation | 1 query site, filtered | centralized in `activeDesignationsFor` |

Against the live stack, `POST /security/policy-evaluate` returns 403 with no token and 403 with a wrong token.

## Next Phase Readiness

**Ready for 01-08.** Every protected route added from here declares one `@Resource()`, and its `(type, action)` pair needs a row in plan 01-02's `action_entitlement_map` — an unmapped pair is denied, and `test_map_covers_every_declared_route` catches drift at `opa test` time.

Two carried concerns, both for 01-14: **DEF-01** (the seed's sealed-case fixture does not demonstrate what its comment claims) and **DEF-02** (two internal routes are unreachable in the deployed stack). Neither blocks the next plan.

## Self-Check: PASSED

All 10 created files exist on disk. All 3 task commits plus their content verified in `git log`. Root build run and clean. `## Known Stubs` present with no blocking entry.

---
*Phase: 01-core-identity-case-model-audit-security-baseline*
*Completed: 2026-10-05*
