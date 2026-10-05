---
pivota_spec_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 01-04-PLAN.md (runnable stack, court IdP realm, idempotent seed)
last_updated: "2026-10-05T14:25:58.672Z"
last_activity: "2026-10-05 — Wave 3 complete: 01-04 (stack up behind one TLS origin, real TOTP MFA, idempotent seed) and 01-05 (audit write path)"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 15
  completed_plans: 5
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-04)

**Core value:** Give courts one current, auditable, explainable record for exhibits and speedy-trial deadlines — reducing manual paper/spreadsheet reconciliation and discrepancies — while keeping judges and authorized staff in command of every ruling, finding, override, and final determination.
**Current focus:** Phase 1 — Core Identity, Case Model, Audit & Security Baseline

## Current Position

Phase: 1 of 8 (Core Identity, Case Model, Audit & Security Baseline)
Plan: 5 of 15 complete (wave 3 done: 01-04 and 01-05 both landed)
Status: Executing
Last activity: 2026-10-05 — Wave 3 complete: 01-04 (stack up behind one TLS origin, real TOTP MFA, idempotent seed) and 01-05 (audit write path)

Progress: [███░░░░░░░] 33%

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: 46 min
- Total execution time: 3.9 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 | 5 | 231 min | 46 min |

**Per-plan detail:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| 01-01 | 15 min | 3 | 33 |
| 01-02 | 42 min | 3 | 14 |
| 01-03 | 41 min | 3 | 13 |
| 01-04 | 95 min | 3 | 18 |
| 01-05 | 38 min | 3 | 13 |

**Recent Trend:**

- Last 5 plans: 01-01 (15 min), 01-02 (42 min), 01-03 (41 min), 01-04 (95 min), 01-05 (38 min)
- Trend: 01-04 is the outlier — infrastructure plans absorb environment drift (two withdrawn images, host DNS settings, three mis-specified healthchecks) that code-only plans do not

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

### Pending Todos

None yet.

### Blockers/Concerns

- Several FRD `[ASSUMPTION]` tags (e.g., F0 role catalog, F3 maker-checker approval, F5 sealed-record existence hiding, F7 rationale minimum length) are explicitly flagged as pre-pilot assumptions requiring stakeholder validation — not blockers for building v1, but should be revisited before production rollout.
- ASM-07: ROADMAP criterion 5 (all data encrypted at rest) will be only PARTIALLY evidenced in Phase 1 — object-store encryption is provable (MinIO SSE-S3 via HeadObject), but PostgreSQL at-rest encryption is a property of the deployment substrate whose IaC is deferred per CONTEXT. Must be satisfied by the deployment target before pilot.
- ASM-05: TechArch 02a 5.2 and 03a 6.1 omit the ao_program_manager role that FRD/Y0a, FRD/F00 and CONTEXT all list. Phase 1 implements 10 roles following the FRD side; the source documents need reconciling — cheap now, expensive once production role assignments exist.
- ASM-08 (from 01-05): the `docs/SCHEMA-NOTES.md` §7 `search_path` rule applies to EVERY future `platform.*` function, but the regression gate in migration `20260101000300` only covers `compute_audit_row_hash`. A later migration adding an unpinned function reintroduces the same production-breaking defect (`digest()` unresolvable under `search_path=platform`, which aborts every audit write and therefore every audited domain write) with no automated catch. Worth a generic lint over `pg_proc.proconfig` in a later assurance plan.
- ASM-09 (from 01-04): two pinned container images vanished mid-phase — `minio/minio` was withdrawn from Docker Hub entirely (quay.io now requires authentication for every tag) and `clamav/clamav:1.3.1_base` was delisted. MinIO is now `chainguard/minio` DIGEST-pinned, which is a stronger pin than a tag but tracks no upstream release line and will not receive patches without a deliberate bump. Nothing checks that the stack's images still resolve, so the next withdrawal surfaces as a failed build in whichever plan happens to run next. Worth a registry-reachability check in a later assurance plan.

## Session Continuity

Last session: 2026-10-05T14:25:58.671Z
Stopped at: Completed 01-04-PLAN.md (runnable stack, court IdP realm, idempotent seed)
Resume file: None
