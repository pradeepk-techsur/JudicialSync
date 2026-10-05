---
pivota_spec_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 01-07-PLAN.md (real ABAC enforcement against OPA, 403/404 split, access_attempt auditing)
last_updated: "2026-10-05T21:54:36.833Z"
last_activity: "2026-10-05 — Wave 5: 01-07 landed (AbacGuard enforces real OPA decisions; stopping OPA turns 200 into 503)"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 15
  completed_plans: 7
  percent: 47
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-04)

**Core value:** Give courts one current, auditable, explainable record for exhibits and speedy-trial deadlines — reducing manual paper/spreadsheet reconciliation and discrepancies — while keeping judges and authorized staff in command of every ruling, finding, override, and final determination.
**Current focus:** Phase 1 — Core Identity, Case Model, Audit & Security Baseline

## Current Position

Phase: 1 of 8 (Core Identity, Case Model, Audit & Security Baseline)
Plan: 7 of 15 complete (wave 5: 01-07 landed; 01-08 next)
Status: Executing
Last activity: 2026-10-05 — Wave 5: 01-07 landed (AbacGuard enforces real OPA decisions; stopping OPA turns 200 into 503)

Progress: [█████░░░░░] 47%

## Performance Metrics

**Velocity:**

- Total plans completed: 7
- Average duration: 58 min
- Total execution time: 6.8 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 | 7 | 406 min | 58 min |

**Per-plan detail:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| 01-01 | 15 min | 3 | 33 |
| 01-02 | 42 min | 3 | 14 |
| 01-03 | 41 min | 3 | 13 |
| 01-04 | 95 min | 3 | 18 |
| 01-05 | 38 min | 3 | 13 |
| 01-06 | 97 min | 3 | 23 |
| 01-07 | 78 min | 3 | 16 |

**Recent Trend:**

- Last 5 plans: 01-03 (41 min), 01-04 (95 min), 01-05 (38 min), 01-06 (97 min), 01-07 (78 min)
- Trend: 01-04, 01-06 and 01-07 are the outliers, for the same underlying reason — all three integrate against live external systems. 01-06's time went into five real defects in the gap between what the IdP documents and what it emits; 01-07's went into four found only by running the suites (an unreachable PDP address, an audit query matching login rows, a stale principal cache, a default parameter that swallowed an explicit undefined) plus two cross-plan fixture/config gaps that no single plan's tests could have seen. The pattern is consistent: time spent against a live stack buys defects that unit tests structurally cannot find.

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Shared platform foundation split into 4 phases (identity/case/audit/security → config/notifications/search → work queue/exception/timeline/reporting/CM-ECF → UI workspaces/attorney portal) to respect TechArch dependency layering before either domain module begins.
- Roadmap: Evidentiary Tracking (Phases 5–6) and Speedy Trial Tracker (Phases 7–8) both depend only on Phase 4 and are architecturally independent — may be executed in parallel or either order.
- Roadmap: v2 requirements (F20-F25, F33-F34, F36-F39) explicitly excluded from all phases per REQUIREMENTS.md scope.
- [Phase 01]: Policy bundle (policy/**) is owned by plan 01-02; later plans adding a route request an action_entitlement_map row there rather than editing the bundle — an unmapped (type, action) pair is denied by design
- [Phase 01]: Authorization allow can only come from an entitlement match, never a role match — roles may only deny (RBAC gate) or scope (court/division), making 'role existence never implies access' structural
- [Phase 01]: input.security_policies replaces the built-in designation→entitlement map wholesale rather than merging, so configuration can genuinely change a mapping; a designation absent from a supplied set denies
- [Phase 01]: Scope assignments express granularity not a checklist: the court check is unconditional (multi-tenancy boundary) while division/case/proceeding checks apply only to principals holding scopes of that type
- [Phase 01]: Both guards registered as global APP_GUARD providers before any protected route exists, so per-route opt-in is structurally impossible and a forgotten decorator yields 401/503 rather than an open endpoint
- [Phase 01]: Guard stubs deny rather than allow — a route added before plans 01-06/01-07 land must 401/503, never 200; 503 SECURITY_POLICY_UNAVAILABLE is also the correct real response when OPA is unreachable, so the stub exercises the production code path
- [Phase 01]: app.module.ts, apps/api/package.json, .env.example and ci.yml are single-owner files declaring their full Phase 1 content up front; later plans add sibling files (policy.yml/e2e.yml/assurance.yml) rather than editing shared ones
- [Phase 01]: Principal.entitlements modelled as a first-class field distinct from roles, so role existence can never imply access; 10 roles implemented including ao_program_manager following FRD/Y0a over TechArch 5.2, with the spec disagreement recorded as ASM-05 rather than silently resolved
- [Phase 01]: Audit row_hash covers a pinned, ordered field list rather than to_jsonb(NEW) — a whole-row hash is self-referential and would invalidate every historical chain the first time a later phase adds a column, turning routine migrations into total-chain-break alarms
- [Phase 01]: entitlement_grants, user_roles and security_designations hold column-scoped UPDATE on revoked_at/revoked_by only; table-wide UPDATE would permit retitling a sealing order while keeping its original grantor and timestamp — a forged record with credible provenance
- [Phase 01]: security_designations gains revoked_at/revoked_by (a traced departure from TechArch 5.3) because a sealing order can be lifted and, with no DELETE grant and no status column, there would be no lawful way to say so
- [Phase 01]: PrismaService asserts current_user = app_rw at boot (fatal in production): pointing DATABASE_URL at the migration role app_dba would void every append-only grant while every test still passed
- [Phase 01]: Hand-written SQL migrations are authoritative and schema.prisma is a pinned mirror (index map: + NoAction relations) so prisma migrate diff reports empty and becomes a real drift gate; prisma migrate dev must never be run, as it would drop the grants and the trigger
- [Phase 01]: Audit atomicity enforced by the compiler: AuditService.record takes a Prisma.TransactionClient as its first parameter, so an audit write outside a transaction does not typecheck — FRD F02's 'commit atomically, or neither does' becomes unwriteable-wrong rather than a code-review request
- [Phase 01]: withAudit() is the single documented path for every state-changing operation in Phases 1-8; rollback is the transaction's, never a compensating write, because compensation can itself fail and leave the exact state the guarantee rules out
- [Phase 01]: Non-integer numbers in audit before_state/after_state are rejected with an actionable error rather than guessed: jsonb stores arbitrary-precision numeric and a JS double cannot predict its text, so a guess becomes an opaque AUDIT_CHAIN_BROKEN on an honest write
- [Phase 01]: canonicalJsonb replicates Postgres jsonb key ordering (UTF-8 byte length first, then bytewise); a lexicographic sort agrees on most real payloads and diverges on others — intermittent, data-dependent, invisible until a specific court action hits it
- [Phase 01]: POST /audit/events fails closed on an unset INTERNAL_SERVICE_TOKEN and refuses any request carrying Authorization even with a valid service token, so a deployment slip cannot yield a world-writable audit log and a header-forwarding proxy cannot launder a user credential into a service call
- [Phase 01]: actor_id supplied in an audit request body is a 422, never an ignored field: a caller that sent one believed it was setting the actor, and silently recording a different one produces an entry confidently wrong about who acted
- [Phase 01]: Every platform.* function must pin SET search_path (docs/SCHEMA-NOTES.md §7); inheriting the caller's means depending on a connection string in a secrets manager for correctness
- [Phase 01]: One TLS origin (judicialsync.localhost:8443) with a Compose network alias, so the OIDC issuer is byte-identical for the browser and the API container; the usual two-address local-dev setup makes every login fail with an error that looks like a token problem
- [Phase 01]: The API trusts Caddy's internal CA via NODE_EXTRA_CA_CERTS and refuses to start if the copy fails; NODE_TLS_REJECT_UNAUTHORIZED is never set, and only the proxy publishes a host port so 'no plaintext path' is structural rather than asserted
- [Phase 01]: MFA is enforced by conditioning OTP on Level of Authentication 2, NOT by promoting the built-in browser flow's OTP step — the built-in conditions on 'user configured', so a user with no OTP credential skips MFA entirely (verified: such a user is forced into enrolment, and acr_values downgrade requests do not skip the form)
- [Phase 01]: The seed opens two connections — app_rw for operational data, app_dba for the four configuration tables app_rw holds SELECT-only on; widening app_rw instead would let the running application rewrite the designation→entitlement map the policy engine reads
- [Phase 01]: Seed writes to user_roles/entitlement_grants/security_designations use an EMPTY update:{}; a substance-column payload raises 42501 on the SECOND boot only, so compose up would work once and then break (reproduced by sabotage, then restored)
- [Phase 01]: jury_admin holds a role and zero entitlements as a permanent fixture — it is what makes 'role existence never implies access' falsifiable rather than asserted; granting it anything fails exactly one test in 01-14's assurance suite
- [Phase 01]: pgcrypto is created in `public` at cluster init because CREATE EXTENSION with no SCHEMA clause lands it wherever the creating session's search_path points, making its location depend on the connection string (psql vs Prisma's ?schema=platform)
- [Phase 01]: Keycloak realm import has three non-obvious constraints, each documented inline: RealmRepresentation rejects unknown root keys outright, AUTHENTICATION_FLOW.DESCRIPTION is VARCHAR(255), and client minimum.acr.value fails the import-time validator even when valid
- [Phase 01]: dns_search ['.'] on every Compose service — the sandbox host's ndots:5 and cluster.local search list are copied into containers and break short-name resolution intermittently (cached names still answer), presenting as ENOTFOUND for a healthy service on the same network
- [Phase 01]: ACR aliases are resolved through the realm's acr.loa.map rather than parsed as numbers — the browser flow emits acr:'otp' with NO amr claim, so the obvious Number(acr)>=2 test yields NaN>=2 and rejects every genuine MFA login; it fails closed, but the tempting repair ('any non-empty acr counts') inverts that and admits the acr:'1' direct-grant token
- [Phase 01]: An ACR value naming an RFC 8176 second factor is read as evidence of that factor, because acr.loa.map is NOT published in discovery (only the unlinked acr_values_supported ['otp','0','2']); scoped narrowly so numerics are still scored first and an unrecognised vendor alias still denies
- [Phase 01]: Every redirect query parameter is forwarded to the token exchange — Keycloak advertises authorization_response_iss_parameter_supported, so RFC 9207 iss validation is mandatory and passing only {code,state} fails every exchange with an error that reads like a bad credential
- [Phase 01]: Authentication integration tests drive the REAL Keycloak with real TOTP rather than a mock; a mocked IdP built from the same assumptions as the implementation would have confirmed all five defects this plan found instead of catching them
- [Phase 01]: IdentityModule is @Global() so the APP_GUARD registered in app.module.ts resolves SessionService without editing that single-owner file, preserving plan 01-01's composition-root rule
- [Phase 01]: Entitlement cache invalidation and session revocation are a documented PAIR — invalidate-without-revoke leaves in-flight requests stale, and revoke-without-invalidate is worse because the user's NEW session resolves from a cache holding the old entitlements and looks like it worked
- [Phase 01]: AbacGuard assembles input, OPA decides, the guard translates — no entitlement, court, designation or self-approval comparison exists in TypeScript, asserted by grep so a reimplementation (a second, silently-diverging policy) cannot land unnoticed
- [Phase 01]: PdpClient has no cached-decision, last-known-good or fail-open-circuit-breaker path: a cached allow is issued by a system that cannot evaluate whether it should allow, replaying the entitlement most likely just revoked — the class comment names each tempting 'availability improvement' as the same bug
- [Phase 01]: input.security_policies is OMITTED, never sent empty, when a court has no rows — the Rego replaces its defaults wholesale, so [] would map every designation to nothing and deny every designated record in a court whose configuration had not loaded
- [Phase 01]: parsePdpDecision rejects a stringly-typed allow rather than coercing it: Boolean("false") is true, so coercion would convert the fail-closed client into a fail-open one on a bundle that returned a stringly-typed decision
- [Phase 01]: Both the existence-hidden and genuinely-absent 404 paths call one notFound() method, so the bodies cannot diverge into an existence oracle; the guard suite asserts the two responses byte-identical rather than asserting each status separately
- [Phase 01]: A failed access_attempt write on a denial is logged as an integrity gap and SWALLOWED — the only place an audit failure does not abort, because converting a 403 into a 500 hands the caller a different signal and on the 404 path leaks that something is there to fail about
- [Phase 01]: Every security_designations read goes through one activeDesignationsFor helper filtering revoked_at IS NULL: a missed filter is a false DENIAL, which users report as 'I lack the entitlement' rather than as a bug, so it can persist for the life of a record
- [Phase 01]: The missing-@Resource() probe route lives in test code, never in the application: a real route missing its descriptor IS the bug the guard exists to catch, so shipping one to prove the guard works would ship the vulnerability to test the mitigation
- [Phase 01]: /security/policy-evaluate accepts requester_scope for TechArch 6.9 shape compatibility and never lets it influence the decision (honouring it would be a complete authorization bypass), echoing disagreements under detail.supplied_scope_ignored so caller drift is visible rather than silent

### Pending Todos

None yet.

### Blockers/Concerns

- Several FRD `[ASSUMPTION]` tags (e.g., F0 role catalog, F3 maker-checker approval, F5 sealed-record existence hiding, F7 rationale minimum length) are explicitly flagged as pre-pilot assumptions requiring stakeholder validation — not blockers for building v1, but should be revisited before production rollout.
- ASM-07: ROADMAP criterion 5 (all data encrypted at rest) will be only PARTIALLY evidenced in Phase 1 — object-store encryption is provable (MinIO SSE-S3 via HeadObject), but PostgreSQL at-rest encryption is a property of the deployment substrate whose IaC is deferred per CONTEXT. Must be satisfied by the deployment target before pilot.
- ASM-05: TechArch 02a 5.2 and 03a 6.1 omit the ao_program_manager role that FRD/Y0a, FRD/F00 and CONTEXT all list. Phase 1 implements 10 roles following the FRD side; the source documents need reconciling — cheap now, expensive once production role assignments exist.
- ASM-08 (from 01-05): the `docs/SCHEMA-NOTES.md` §7 `search_path` rule applies to EVERY future `platform.*` function, but the regression gate in migration `20260101000300` only covers `compute_audit_row_hash`. A later migration adding an unpinned function reintroduces the same production-breaking defect (`digest()` unresolvable under `search_path=platform`, which aborts every audit write and therefore every audited domain write) with no automated catch. Worth a generic lint over `pg_proc.proconfig` in a later assurance plan.
- ASM-09 (from 01-04): two pinned container images vanished mid-phase — `minio/minio` was withdrawn from Docker Hub entirely (quay.io now requires authentication for every tag) and `clamav/clamav:1.3.1_base` was delisted. MinIO is now `chainguard/minio` DIGEST-pinned, which is a stronger pin than a tag but tracks no upstream release line and will not receive patches without a deliberate bump. Nothing checks that the stack's images still resolve, so the next withdrawal surfaces as a failed build in whichever plan happens to run next. Worth a registry-reachability check in a later assurance plan.
- ASM-10 (from 01-06): `SESSION_TOKEN_SECRET` is consumed by `SessionService` but is absent from `.env.example`, which plan 01-01 owns and this plan could not modify. Unset, each process derives an ephemeral HMAC key, so access tokens do not survive a restart and do not validate across multiple instances — correct for local development and fatal for any multi-instance deployment. It is logged loudly at boot, but nothing fails. A later plan that may edit `.env.example` should declare it (marked `[SECRET]`, resolved from the secrets manager in production), and the Compose `api` service should set it.
- DEF-01 (from 01-07, full detail in the phase's `deferred-items.md`): the seeded `judge` CANNOT read the seeded sealed case, so the **positive** half of Phase 1 criterion 4 is not demonstrable from the seed as it stands. 01-04 gives `judge` a `case` scope row on the PLAIN case, and under 01-02's narrowing semantics one such row confines the principal to exactly the cases named — the sealed read is therefore denied on SCOPE, before designation is ever considered. Both plans are individually correct and were never checked against each other; neither plan's tests could have caught it (01-02 uses synthetic principals, 01-04 asserts rows exist rather than what they authorize). 01-07's guard suite adds the row in-test and asserts BOTH states, so the semantics stay pinned. One-row fix in `seed/identity.ts` recommended to 01-14. Do NOT "fix" it by removing the narrowing — that would let every case-scoped principal, including the Phase 4 external attorney, reach every case in their court.
- DEF-02 (from 01-07, PRE-EXISTING, full detail in `deferred-items.md`): `INTERNAL_SERVICE_TOKEN` is absent from `docker-compose.yml`'s `api` environment, so BOTH internal service routes — 01-05's `POST /audit/events` and 01-07's `POST /security/policy-evaluate` — return 403 in the deployed stack. `ServiceTokenGuard` failing closed on an unset secret is correct behaviour, so the symptom is the control working over a config gap. Nothing caught it because the in-process suites set the variable themselves and structurally cannot observe what Compose forwards, making this a coverage gap as much as a configuration one. One-line fix (the `:?` required-secret form the other secrets already use) recommended to 01-14, ideally with a test that calls an internal route through the deployed container.

## Session Continuity

Last session: 2026-10-05T21:54:36.831Z
Stopped at: Completed 01-07-PLAN.md (real ABAC enforcement against OPA, 403/404 split, access_attempt auditing)
Resume file: None
