---
pivota_spec_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 01-01-PLAN.md (repository substrate + deny-by-default guard chain)
last_updated: "2026-10-05T12:56:02.708Z"
last_activity: 2026-10-05 — Plans 01-01 and 01-02 complete (repository substrate + deny-by-default guard chain; OPA/Rego authorization policy bundle)
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 15
  completed_plans: 2
  percent: 1
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-04)

**Core value:** Give courts one current, auditable, explainable record for exhibits and speedy-trial deadlines — reducing manual paper/spreadsheet reconciliation and discrepancies — while keeping judges and authorized staff in command of every ruling, finding, override, and final determination.
**Current focus:** Phase 1 — Core Identity, Case Model, Audit & Security Baseline

## Current Position

Phase: 1 of 8 (Core Identity, Case Model, Audit & Security Baseline)
Plan: 3 of 15
Status: Executing
Last activity: 2026-10-05 — Plans 01-01 and 01-02 complete (repository substrate + deny-by-default guard chain; OPA/Rego authorization policy bundle)

Progress: [░░░░░░░░░░] 1%

## Performance Metrics

**Velocity:**

- Total plans completed: 2
- Average duration: 29 min
- Total execution time: 1.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 | 2 | 57 min | 29 min |

**Per-plan detail:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| 01-01 | 15 min | 3 | 33 |
| 01-02 | 42 min | 3 | 14 |

**Recent Trend:**

- Last 5 plans: 01-01 (15 min), 01-02 (42 min)
- Trend: stable — both wave-1 plans completed well inside expectations

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

### Pending Todos

None yet.

### Blockers/Concerns

- Several FRD `[ASSUMPTION]` tags (e.g., F0 role catalog, F3 maker-checker approval, F5 sealed-record existence hiding, F7 rationale minimum length) are explicitly flagged as pre-pilot assumptions requiring stakeholder validation — not blockers for building v1, but should be revisited before production rollout.
- ASM-07: ROADMAP criterion 5 (all data encrypted at rest) will be only PARTIALLY evidenced in Phase 1 — object-store encryption is provable (MinIO SSE-S3 via HeadObject), but PostgreSQL at-rest encryption is a property of the deployment substrate whose IaC is deferred per CONTEXT. Must be satisfied by the deployment target before pilot.
- ASM-05: TechArch 02a 5.2 and 03a 6.1 omit the ao_program_manager role that FRD/Y0a, FRD/F00 and CONTEXT all list. Phase 1 implements 10 roles following the FRD side; the source documents need reconciling — cheap now, expensive once production role assignments exist.

## Session Continuity

Last session: 2026-10-05T12:55:52.327Z
Stopped at: Completed 01-01-PLAN.md (repository substrate + deny-by-default guard chain)
Resume file: None
