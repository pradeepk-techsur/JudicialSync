# Roadmap: JudicialSync

## Overview

JudicialSync is built bottom-up through its architectural layers, in the order the TechArch document requires: first the non-negotiable substrate (identity/access, the shared case/docket model, the tamper-evident audit trail, and the security baseline — nothing else in the system may exist without these), then the shared platform services that both domain modules consume (configuration, notifications, search, work queues/exceptions, timeline, reporting, CM/ECF sync), then the role-specific UI shell and external attorney portal, and only then the two domain modules themselves.

Evidentiary Tracking and the Speedy Trial Tracker are architecturally independent services that both depend only on the shared platform layer (Phases 1–4) — they do not depend on each other. Phases 5–6 (Evidentiary) and Phases 7–8 (Speedy Trial) are numbered sequentially for execution bookkeeping, but Phase 7 depends only on Phase 4, not on Phases 5–6, so the two module tracks can be planned/executed in either order or in parallel once the shared foundation (Phases 1–4) is complete.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core Identity, Case Model, Audit & Security Baseline** - Authenticated/scoped access, the one shared case/docket model, tamper-evident audit, and baseline security controls
- [ ] **Phase 2: Platform Configuration & Communication Services** - Court-configurable rules/thresholds without code forks, policy-compliant notifications, access-scoped search
- [ ] **Phase 3: Workflow Aggregation & CM/ECF Sync** - Shared work queue, exception queue, case timeline, reporting feed, and inbound CM/ECF synchronization
- [ ] **Phase 4: Role-Specific UI Workspaces & External Attorney Portal** - Purpose-built USWDS workspaces per role, plus a structurally separate, read/submit-only attorney portal
- [ ] **Phase 5: Evidentiary Tracking Core** - Case/proceeding exhibit setup, pretrial intake, the exhibit ledger, and real-time courtroom logging
- [ ] **Phase 6: Evidentiary Tracking Reconciliation & Closeout** - Dual-log reconciliation at session checkpoints and certified exportable exhibit lists
- [ ] **Phase 7: Speedy Trial Tracker Core** - Tracker initialization, docket event ingestion/mapping, candidate exclusion engine, versioned calculation, and review/approval
- [ ] **Phase 8: Speedy Trial Tracker Alerts & Visibility** - Threshold alerts/escalation, calculation version history, and the chambers case conference view

## Phase Details

### Phase 1: Core Identity, Case Model, Audit & Security Baseline
**Goal**: Establish the trusted substrate — authenticated, scoped access; one shared case/docket model; tamper-evident audit; baseline security controls — so every later feature has a safe, consistent foundation rather than re-implementing identity, case context, or audit logic per module.
**Depends on**: Nothing (first phase)
**Requirements**: F0, F1, F2, F13
**Success Criteria** (what must be TRUE):
  1. A user can log in via SSO and complete MFA, and is granted only the access their role/court/division/case/proceeding/party-role/security-designation scope allows — an unauthorized resource request is denied server-side (403), not merely hidden in the UI.
  2. A clerk can create or sync a case with court/division/proceeding/parties/docket events through one shared case-context model — there is no duplicate, module-specific case representation for Evidentiary vs. Speedy Trial to later diverge from.
  3. Every status change, ruling, custody transfer, override, or approval produces an immutable, hash-chained audit entry; an attempt to UPDATE or DELETE a past audit row fails at the database grant level, not merely via application convention.
  4. A user lacking a specific security-designation entitlement (sealed/restricted/grand-jury/juvenile/PII) is denied access to a tagged record, and the denied attempt itself is logged as an audit event.
  5. An uploaded file of a disallowed type or failing malware scan is rejected before storage, and all data is encrypted in transit and at rest.
  *(Note: this phase's goal references "so every later feature has a safe foundation" — this is an enabling promise for Phases 2–8, not a criterion testable within this phase itself.)*
**Plans**: 15 plans across 8 waves

Plans:
- [ ] 01-01-PLAN.md — Monorepo, NestJS Platform Core skeleton, deny-by-default global guards, CI, assumptions register (wave 1)
- [ ] 01-02-PLAN.md — OPA Rego policy bundle (RBAC gate, ABAC scope, designation 403-vs-404, SoD) with its own test suite (wave 1)
- [ ] 01-03-PLAN.md — Platform schema, migrations, app_rw/app_dba grants, append-only enforcement, hash-chain trigger (wave 2)
- [ ] 01-04-PLAN.md — Docker Compose stack behind one TLS origin, Keycloak realm with real TOTP, idempotent seed (wave 3)
- [ ] 01-05-PLAN.md — Audit Service: hash-chained append-only writes, transactional outbox, service-only write API (wave 3)
- [ ] 01-06-PLAN.md — Identity: real OIDC/MFA, sessions with immediate revocation, entitlement resolution (wave 4)
- [ ] 01-07-PLAN.md — Global ABAC guard, OPA PDP integration, fail-closed, access_attempt auditing (wave 5)
- [ ] 01-08-PLAN.md — Entitlement grants: two-person request→approve with server-side SoD, constrained bootstrap (wave 6)
- [ ] 01-09-PLAN.md — Shared case & docket context API: no deletes, full provenance, security designations (wave 6)
- [ ] 01-10-PLAN.md — File upload pipeline: allowlist → ClamAV → encrypted MinIO, authenticated download (wave 6)
- [ ] 01-11-PLAN.md — Configuration read path, retention schedules, no-auto-purge guard, key-access SoD, fallback runbook (wave 6)
- [ ] 01-12-PLAN.md — Audit Explorer API plus BullMQ chain-verification job writing integrity_alert records (wave 6)
- [ ] 01-13-PLAN.md — OpenAPI contract, generated TS client, USWDS shell with real browser login, axe gate (wave 7)
- [ ] 01-14-PLAN.md — Negative-path assurance suite evidencing success criteria 1, 3, 4, and 5 (wave 7)
- [ ] 01-15-PLAN.md — Case list and Audit Explorer screens with Playwright and extended accessibility coverage (wave 8)

### Phase 2: Platform Configuration & Communication Services
**Goal**: Give each court the ability to configure its own rules, thresholds, and event mappings without a code fork, be notified of risk through policy-compliant channels, and find anything a user is authorized to see — so local variation never requires custom deployment and risk signals reach the right person without exposing sensitive content.
**Depends on**: Phase 1
**Requirements**: F3, F4, F5
**Success Criteria** (what must be TRUE):
  1. A court admin drafts, validates, and publishes a new rule-package version (numbering, thresholds, workflow states, event mappings) through a maker-checker flow requiring a second approver; the prior version remains retrievable and the change is audit-logged.
  2. A recipient receives a notification whose body/preview never contains party names, exhibit descriptions, or sealed-case detail — only a generic description plus a secure deep link — with delivery status (sent/failed/acknowledged) tracked.
  3. A notification that fails delivery is retried per the configured backoff policy and, if still unacknowledged past the court-configured escalation cadence, auto-escalates to a secondary recipient — an alert is never silently dropped on persistent failure.
  4. A user searching by identifier/party/witness/status/date/proceeding receives zero hits for a record outside their access scope (not a redacted placeholder result) — confirmed by an unauthorized user's search against a sealed record returning nothing.
**Plans**: TBD

### Phase 3: Workflow Aggregation & CM/ECF Sync
**Goal**: Give staff one place to see what needs their attention across both modules, one merged chronological view per case, de-identified operational visibility for administrators, and a trustworthy inbound sync from CM/ECF — so nothing is worked from a cold search, nothing is silently overwritten from the docket, and data-quality risk surfaces before it causes downstream errors.
**Depends on**: Phase 2
**Requirements**: F6, F7, F8, F9, F10
**Success Criteria** (what must be TRUE):
  1. A clerk/deputy/chambers user sees their role-scoped open tasks in one work queue, sorted with oldest items visibly flagged by age, and cannot dismiss a legally-significant task without entering a rationale.
  2. A staff member sees cross-module exceptions (reconciliation mismatches, unmapped events, missing metadata) in one exception queue; a critical-severity exception can never be auto-closed by a batch process, and no exception can be marked resolved without a rationale meeting the minimum length bar.
  3. A user viewing a case's timeline sees docket events and hearings merged into one filterable chronological view with deep links into each underlying record.
  4. A court administrator views a role-limited, de-identified operational dashboard (backlog age, configuration consistency, adoption) that contains no path back to an individual judicial determination.
  5. Inbound CM/ECF case/party/docket-event/order data appears with source identifiers preserved, and when an incoming field conflicts with an existing local value, the conflict routes to a human-review queue instead of silently overwriting either value — confirmed by deliberately creating a conflicting field and observing it land in the conflict queue, not get silently applied.
**Plans**: TBD

### Phase 4: Role-Specific UI Workspaces & External Attorney Portal
**Goal**: Give every primary user type a purpose-built, USWDS-based, Section 508-accessible workspace, and let external attorneys contribute structured input — so each role works efficiently in its own interface, and external attorneys can submit/view only what they're authorized to, never touching the official record.
**Depends on**: Phase 3
**Requirements**: F11, F12
**Success Criteria** (what must be TRUE):
  1. Each internal role (judge/chambers, clerk, courtroom deputy, admin) sees a distinct workspace shell — built from shared USWDS components — optimized for that role's working pattern, and the shell passes a baseline Section 508 accessibility check.
  2. An external attorney logs into a structurally separate portal (distinct OIDC client/audience) and can submit structured exhibit metadata and view authorized deadline information, but an attempted write call against the official ledger/docket/calculation endpoints is rejected at the API layer — not merely absent from the portal's navigation.
  3. A session token issued for the external attorney portal is rejected by internal-only (judge/clerk/admin) endpoints, confirmed by a deliberate cross-realm request being denied.
**Plans**: TBD

### Phase 5: Evidentiary Tracking Core
**Goal**: Let clerks set up a proceeding for exhibit tracking, intake exhibit lists/files with validation, and let courtroom deputies log offers/objections/rulings in real time against one authoritative ledger — so no parallel paper log is needed during a live proceeding.
**Depends on**: Phase 4
**Requirements**: F14, F15, F16, F17
**Success Criteria** (what must be TRUE):
  1. A clerk creates or syncs a case and proceeding, assigns parties and security designations, and configures an exhibit numbering scheme before exhibit activity begins.
  2. A clerk/attorney submits a structured exhibit list (with optional file); a submission with missing required metadata, a duplicate, or an unsupported file format is routed to the exception queue rather than silently accepted.
  3. An exhibit's full status lifecycle (proposed → offered → admitted/rejected/withdrawn/substituted/sealed/returned) lives in one authoritative ledger record, with every status change feeding the audit trail.
  4. A courtroom deputy logs an exhibit offer, objection, and judge's ruling in a small number of rapid, keyboard-supported interactions during a live session; the judge's ruling is explicitly attributed to the judge (never auto-decided), and chambers sees the live status update during the same session.
**Plans**: TBD

### Phase 6: Evidentiary Tracking Reconciliation & Closeout
**Goal**: Let clerks/deputies compare the live ledger against party lists, deputy logs, and admitted lists at natural session checkpoints, resolve discrepancies with a documented rationale, and produce a certified exportable exhibit list — so post-trial reconciliation stops being a manual, after-the-fact scramble.
**Depends on**: Phase 5
**Requirements**: F18, F19
**Success Criteria** (what must be TRUE):
  1. A clerk/deputy runs an on-demand or scheduled reconciliation comparing source lists against the live ledger at a recess/day-end/trial-close checkpoint; every discrepancy found requires an explicit resolution rationale before it can be closed — no mismatch is auto-resolved.
  2. A resolved reconciliation discrepancy is visible in the audit trail with its rationale attached, confirmed by opening the audit entry for a specific resolved mismatch.
  3. A clerk/deputy produces a one-click, filtered (e.g., admitted-only) exhibit list export with certification attached, usable as an interim closeout artifact.
**Plans**: TBD

### Phase 7: Speedy Trial Tracker Core
**Goal**: Automatically or manually initialize a defendant's Speedy Trial clock from trigger events, ingest and map docket events, propose candidate exclusion periods for human review, and calculate a fully versioned, explainable elapsed/excluded/remaining-time result — so courts get a defensible, auditable deadline instead of a manual spreadsheet calculation.
**Depends on**: Phase 4
**Requirements**: F26, F27, F28, F29, F30
**Success Criteria** (what must be TRUE):
  1. A tracker is created (automatically from a configured trigger event, or manually by a clerk) per defendant, and a missing-trigger condition is explicitly flagged for review rather than silently defaulting to an assumed start date.
  2. An inbound docket event is mapped to a configured Speedy Trial event category; an event matching no configured mapping routes to a resolution queue rather than being silently dropped or miscategorized.
  3. A candidate exclusion period (motion, competency, continuance, interlocutory matter) is generated and linked to its triggering event and rule reference, but remains in a "proposed" state until a reviewer explicitly accepts, modifies, or rejects it — the system never auto-applies an exclusion.
  4. A user views a full "explain this date" breakdown of the current calculation (event, rule reference, period, status, reviewer, reason per segment), and a new calculation never silently overwrites a prior approved result — the prior version remains retrievable with its own approvals intact.
  5. An override to a confirmed calculation requires a reviewer identity, timestamp, and mandatory rationale before it takes effect.
**Plans**: TBD

### Phase 8: Speedy Trial Tracker Alerts & Visibility
**Goal**: Alert the right people as a defendant's remaining time crosses a court-configured threshold (with full explanatory context, not a bare date), let staff see exactly what changed between calculation versions, and give chambers a single-screen conference-ready summary — so risk is visible before it becomes a missed deadline and no recalculation is ever opaque.
**Depends on**: Phase 7
**Requirements**: F31, F32, F35
**Success Criteria** (what must be TRUE):
  1. As a defendant's remaining time crosses a court-configured threshold, a notification is delivered to the configured recipients via the shared Notifications Service, and the alert links to the "explain this date" context rather than displaying a bare date.
  2. A threshold alert that goes unacknowledged beyond the configured escalation cadence actually escalates to a secondary recipient — confirmed by simulating an unacknowledged alert past its window, not merely confirming the first send occurred.
  3. A user compares two calculation versions and sees highlighted diffs (added/removed events, changed exclusion periods, new overrides) with each override's rationale displayed inline.
  4. A judge/clerk opens a case conference view showing clock state, pending motions, continuance history, and open issues on one screen, and generates a pre-conference review packet from it.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order for bookkeeping: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Phases 5–6 (Evidentiary) and Phases 7–8 (Speedy Trial) each depend only on Phase 4 and may be planned/executed in parallel or in either order relative to each other.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Identity, Case Model, Audit & Security Baseline | 0/15 | Planned | - |
| 2. Platform Configuration & Communication Services | 0/TBD | Not started | - |
| 3. Workflow Aggregation & CM/ECF Sync | 0/TBD | Not started | - |
| 4. Role-Specific UI Workspaces & External Attorney Portal | 0/TBD | Not started | - |
| 5. Evidentiary Tracking Core | 0/TBD | Not started | - |
| 6. Evidentiary Tracking Reconciliation & Closeout | 0/TBD | Not started | - |
| 7. Speedy Trial Tracker Core | 0/TBD | Not started | - |
| 8. Speedy Trial Tracker Alerts & Visibility | 0/TBD | Not started | - |

---
*Roadmap created: 2026-10-04*
*Granularity: standard (8 phases)*
