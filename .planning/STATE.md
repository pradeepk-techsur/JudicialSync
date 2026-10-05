---
pivota_spec_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 01-03-PLAN.md (platform schema, grant posture, audit hash chain)
last_updated: "2026-10-05T13:15:59.303Z"
last_activity: 2026-10-05 — Plan 01-03 complete (platform schema; audit immutability enforced at the database grant level)
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 15
  completed_plans: 3
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-04)

**Core value:** Give courts one current, auditable, explainable record for exhibits and speedy-trial deadlines — reducing manual paper/spreadsheet reconciliation and discrepancies — while keeping judges and authorized staff in command of every ruling, finding, override, and final determination.
**Current focus:** Phase 1 — Core Identity, Case Model, Audit & Security Baseline

## Current Position

Phase: 1 of 8 (Core Identity, Case Model, Audit & Security Baseline)
Plan: 4 of 15
Status: Executing
Last activity: 2026-10-05 — Plan 01-03 complete (platform schema; audit immutability enforced at the database grant level)

Progress: [██░░░░░░░░] 20%

## Performance Metrics

**Velocity:**

- Total plans completed: 3
- Average duration: 33 min
- Total execution time: 1.6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 | 3 | 98 min | 33 min |

**Per-plan detail:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| 01-01 | 15 min | 3 | 33 |
| 01-02 | 42 min | 3 | 14 |
| 01-03 | 41 min | 3 | 13 |

**Recent Trend:**

- Last 5 plans: 01-01 (15 min), 01-02 (42 min), 01-03 (41 min)
- Trend: stable — wave 2 matching wave 1's pace

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

### Pending Todos

None yet.

### Blockers/Concerns

- Several FRD `[ASSUMPTION]` tags (e.g., F0 role catalog, F3 maker-checker approval, F5 sealed-record existence hiding, F7 rationale minimum length) are explicitly flagged as pre-pilot assumptions requiring stakeholder validation — not blockers for building v1, but should be revisited before production rollout.
- ASM-07: ROADMAP criterion 5 (all data encrypted at rest) will be only PARTIALLY evidenced in Phase 1 — object-store encryption is provable (MinIO SSE-S3 via HeadObject), but PostgreSQL at-rest encryption is a property of the deployment substrate whose IaC is deferred per CONTEXT. Must be satisfied by the deployment target before pilot.
- ASM-05: TechArch 02a 5.2 and 03a 6.1 omit the ao_program_manager role that FRD/Y0a, FRD/F00 and CONTEXT all list. Phase 1 implements 10 roles following the FRD side; the source documents need reconciling — cheap now, expensive once production role assignments exist.

## Session Continuity

Last session: 2026-10-05T13:15:59.302Z
Stopped at: Completed 01-03-PLAN.md (platform schema, grant posture, audit hash chain)
Resume file: None
