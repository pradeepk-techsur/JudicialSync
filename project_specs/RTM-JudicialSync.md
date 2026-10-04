# Requirements Traceability Matrix: JudicialSync

**Project Acronym:** JudicialSync
**Document Type:** RTM (Requirements Traceability Matrix)
**Version:** 1.0 (Draft — pre-pilot, pending stakeholder validation)
**Generated:** 2026-10-04
**Upstream Sources:** `project_specs/PRD-JudicialSync.md`, `project_specs/FRD-JudicialSync.md` (+ `FRD/F00–F39`, `FRD/Y0a/b/c`, `FRD/Y1a/b/c`, `FRD/Y2`, `FRD/Y3`), `project_specs/TechArch-JudicialSync.md` (+ `TechArch/00–06`), `project_specs/UserStories-JudicialSync.md` (+ `UserStories/Epic-00–39`, `UserStories/Y0`, `Y1`), `.planning/PROJECT.md`

---

## 1. Overview

This Requirements Traceability Matrix (RTM) provides bidirectional traceability across every layer of the JudicialSync spec suite: Product Requirements (PRD features F0–F39), Functional Requirements (FRD feature chunks F00–F39, each with inputs/outputs/validation/error states), Technical Architecture (TechArch component ownership, schema, and API surfaces), and User Stories (93 stories across 40 epics, Epic-00 through Epic-39). It exists to answer three questions for any reviewer, auditor, or pilot-court stakeholder: for any given PRD feature, what functional behavior was specified, what was built to support it, and what user-facing story and acceptance criteria prove it works.

JudicialSync's ID scheme is unusually clean for traceability purposes: the feature identifier (`F0`–`F39`) is shared verbatim across the PRD, FRD, and User Stories documents — the FRD's `F00-identity-access-management.md` through `F39-broader-courtroom-tech-integration.md` chunk files map one-to-one to PRD §5 feature IDs, and User Story epics (`Epic-00` through `Epic-39`, containing stories numbered `US-{F}.{n}`) map one-to-one to the same IDs. The TechArch document does not introduce a parallel "SPEC-XXX" numbering scheme; instead it organizes implementation detail into three named services (Platform Core, Evidentiary Tracking Service, Speedy Trial Service) and explicitly tags each component, schema table, and API endpoint group with its owning FRD Feature Ref(s) in its component tables (TechArch §4.1–4.3) and schema/API chunk headers (`Y0a/b/c`, `Y1a/b/c`). This RTM therefore traces PRD → FRD → TechArch Component/Schema/API → User Story using the shared `F{nn}` key, and additionally traces down to FRD error codes as the de facto test-case catalog (every error-state row in an FRD feature chunk corresponds to a required negative test case; every acceptance-criterion bullet in a User Story corresponds to a required positive or behavioral test case).

Because this project is explicitly pre-pilot and pre-stakeholder-validation (per PRD §1 and `.planning/PROJECT.md`), several FRD sections carry inline `[ASSUMPTION]` tags resolving open PRD/vision-document decisions (user authority matrix, maker-checker configuration publishing, exhibit file storage model, sealed-record existence-hiding behavior, notification-log vs. audit-log boundary). This RTM flags those rows so pilot validation activity can be scoped directly against the traceability matrix rather than re-deriving which requirements are provisional.

---

## 2. Requirements Summary

- **Total PRD features:** 40 (F0–F39), organized into four groups — Shared Platform Foundation (F0–F13, 14 features), Evidentiary Tracking Module (F14–F25, 12 features), Speedy Trial Tracker Module (F26–F36, 11 features), Scale/Later-Increment (F37–F39, 3 features)
- **Priority distribution (PRD Feature Index):** P0 Critical/MVP = 23 features; P1 High/MVP-adjacent = 5 features; P2 Pilot hardening = 8 features; P3 Scale = 4 features
- **FRD coverage:** 40 feature chunks (F00–F39), each specifying Description, Terminology, Sub-features, Process, Inputs, Outputs, Validation, Error States, API Surface, and Schema Surface — 1:1 with every PRD feature; no PRD feature lacks a corresponding FRD chunk
- **FRD error-code catalog:** 40 feature-local error-state tables (one per feature chunk) plus a cross-feature catalog (`Y2-errors.md`) for shared/reused error codes — every row is a required negative-path test case
- **TechArch component coverage:** 3 deployable services (Platform Core, Evidentiary Tracking Service, Speedy Trial Service) decomposing into 29 named components across §4.1–4.3, each tagged with its owning FRD Feature Ref(s); full DDL provided for every schema area referenced by the FRD (`Y0a` shared, `Y0b` evidentiary, `Y0c` speedytrial)
- **User Story coverage:** 93 stories across 40 epics (Epic-00–Epic-39), 1:1 with PRD/FRD feature IDs; every story carries explicit acceptance criteria referencing the same error codes defined in the FRD
- **Story priority distribution:** P0 = 59 stories (Epics 0–8, 10, 11, 13–18, 26–31); P1 = 10 stories (Epics 9, 12, 19, 32, 35); P2 = 17 stories (Epics 20–24, 33, 34, 36); P3 = 7 stories (Epics 25, 37–39)
- **Binding cross-cutting constraints traced into every feature row below:** human-in-command gating on legally significant actions (no auto-finalization), tamper-evident audit linkage (F2/F02), CM/ECF authoritative-source discipline with conflict routing (F10/F10), USWDS/Section 508 accessibility (F11/F11), and RBAC+ABAC scope enforcement (F0/F00)
- **Open/assumption-flagged rows:** 7 FRD features carry explicit `[ASSUMPTION]` tags requiring pilot stakeholder re-validation before implementation lock — F00 (role catalog), F03 (maker-checker publish), F05 (sealed-record existence-hiding), F07 (rationale minimum length), F01/F13/F23 (exhibit storage model), per PRD §9.3 open decisions

---

## 3. Traceability Matrix

The table below links every PRD feature to its FRD chunk, owning TechArch service/component, and User Story epic. "TechArch Component" cites the component name(s) from TechArch §4.1–4.3 (Platform Core, Evidentiary Tracking Service, or Speedy Trial Service component tables); "Schema/API Ref" cites the governing chunk file(s).

### 3.1 Shared Platform Foundation (PRD §5.1)

| PRD Feature | FRD Chunk | TechArch Component (Service) | Schema/API Ref | User Story Epic | Story IDs |
|---|---|---|---|---|---|
| F0: Identity and Access Management | F00-identity-access-management.md | Identity & ABAC Module; Policy Decision Point (Platform Core) | Y0a §Identity (`users`,`roles`,`user_roles`,`scope_assignments`,`sessions`); Y1a §Identity & Access | Epic 0: Identity and Access Management | US-0.1, US-0.2, US-0.3 |
| F1: Core Case and Docket Data Model | F01-core-case-docket-data-model.md | Case & Docket Context Service (Platform Core) | Y0a §Case Model (`courts`,`divisions`,`cases`,`proceedings`,`hearings`,`parties`,`docket_events`,`document_references`,`security_designations`); Y1a §Case & Docket Model | Epic 1: Core Case and Docket Data Model | US-1.1, US-1.2, US-1.3 |
| F2: Audit Trail and Audit Explorer | F02-audit-trail-explorer.md | Audit Service (Platform Core) | Y0a §Audit (`audit_events`, append-only/hash-chained); Y1a §Audit | Epic 2: Audit Trail and Audit Explorer | US-2.1, US-2.2, US-2.3 |
| F3: Configuration Engine | F03-configuration-engine.md | Configuration Engine (Platform Core) | Y0a §Configuration (`court_profiles`,`rule_package_versions`,`workflow_state_defs`,`threshold_defs`,`event_mapping_defs`); Y1a §Configuration | Epic 3: Configuration Engine | US-3.1, US-3.2, US-3.3 |
| F4: Notifications Service | F04-notifications-service.md | Notifications Service (Platform Core) | Y0a §Notifications (`notifications`,`notification_deliveries`,`notification_recipients_config`); Y1a §Notifications | Epic 4: Notifications Service | US-4.1, US-4.2 |
| F5: Search Service | F05-search-service.md | Search Service (Platform Core) | Y0a §Search Index (`search_index` materialized view / OpenSearch); Y1a §Search | Epic 5: Search Service | US-5.1, US-5.2 |
| F6: Work Queue and Task Management | F06-work-queue-task-management.md | Work Queue Service (Platform Core) | Y0a §Work Queue (`tasks`); Y1a §Work Queue | Epic 6: Work Queue and Task Management | US-6.1, US-6.2 |
| F7: Exception Queue | F07-exception-queue.md | Exception Queue Service (Platform Core) | Y0a §Exception Queue (`exceptions`); Y1a §Exception Queue | Epic 7: Exception Queue | US-7.1, US-7.2 |
| F8: Case Timeline View | F08-case-timeline-view.md | Timeline Service (Platform Core) | Y0a (timeline merge, reads `docket_events`+exhibit/calc segments); Y1a §Timeline | Epic 8: Case Timeline View | US-8.1, US-8.2 |
| F9: Operational Reporting Feed | F09-operational-reporting-feed.md | Reporting Feed Service (Platform Core) | PostgreSQL read replica; Y1a §Reporting | Epic 9: Operational Reporting Feed | US-9.1, US-9.2 |
| F10: CM/ECF Integration Adapter | F10-cmecf-integration-adapter.md | CM/ECF Integration Adapter (Platform Core) | Y0a §CM/ECF Integration (`sync_conflicts`,`adapter_health_log`); Y3-integrations.md §CM/ECF | Epic 10: CM/ECF Integration Adapter | US-10.1, US-10.2 |
| F11: Role-Specific UI Workspaces | F11-role-specific-ui-workspaces.md | Experience Layer — Judge/Chambers Workspace, Clerk Operations Console, Courtroom Deputy Interface, Administrative Dashboard (`@judicialsync/ui-kit`, USWDS) | TechArch §4.4 Frontend Components; generated TS API client (TechArch §6) | Epic 11: Role-Specific UI Workspaces | US-11.1, US-11.2, US-11.3, US-11.4 |
| F12: Restricted External Attorney Portal | F12-restricted-external-attorney-portal.md | Restricted External Attorney Portal (structurally separate frontend/auth realm) | Y0a §External Portal (`external_principals`); Y1a §Portal; Y3-integrations.md §IdP (dual-audience) | Epic 12: Restricted External Attorney Portal | US-12.1, US-12.2, US-12.3 |
| F13: Security and Compliance Baseline | F13-security-compliance-baseline.md | File/Malware Scanning Service; Retention & Disposition Engine (Platform Core) | Y0a §Security & Retention (`file_references`,`malware_scan_results`,`security_policies`,`retention_schedules`,`disposition_log`); TechArch §7 Security Architecture | Epic 13: Security and Compliance Baseline | US-13.1, US-13.2, US-13.3 |

### 3.2 Evidentiary Tracking Module (PRD §5.2)

| PRD Feature | FRD Chunk | TechArch Component (Service) | Schema/API Ref | User Story Epic | Story IDs |
|---|---|---|---|---|---|
| F14: Case and Proceeding Setup for Exhibits | F14-case-proceeding-setup-exhibits.md | Exhibit Setup Module (Evidentiary Tracking Service) | Y0b §Exhibit Setup; Y1b §Setup | Epic 14: Case and Proceeding Setup for Exhibits | US-14.1, US-14.2 |
| F15: Pretrial Exhibit Intake | F15-pretrial-exhibit-intake.md | Intake Module (Evidentiary Tracking Service) | Y0b §Intake; Y1b §Intake | Epic 15: Pretrial Exhibit Intake | US-15.1, US-15.2, US-15.3 |
| F16: Exhibit Ledger | F16-exhibit-ledger.md | Exhibit Ledger Module (Evidentiary Tracking Service) | Y0b §Exhibit Ledger (`exhibits`, `exhibit_versions` append-only); Y1b §Ledger | Epic 16: Exhibit Ledger | US-16.1, US-16.2, US-16.3 |
| F17: Real-Time Courtroom Logging | F17-realtime-courtroom-logging.md | Courtroom Logging Module (Evidentiary Tracking Service) | Y0b §Courtroom Logging (`session_log_entries`, offline `synced_from_offline` flag); Y1b §Courtroom Logging | Epic 17: Real-Time Courtroom Logging | US-17.1, US-17.2, US-17.3 |
| F18: Dual-Log and Source Reconciliation | F18-dual-log-reconciliation.md | Reconciliation Module (Evidentiary Tracking Service) | Y0b §Reconciliation; Y1b §Reconciliation | Epic 18: Dual-Log and Source Reconciliation | US-18.1, US-18.2, US-18.3 |
| F19: Exportable Exhibit List and Basic Closeout | F19-exportable-exhibit-list-basic-closeout.md | Closeout Module — basic (Evidentiary Tracking Service) | Y0b §Closeout; Y1b §Export/Closeout | Epic 19: Exportable Exhibit List and Basic Closeout | US-19.1, US-19.2 |
| F20: Custody and Location Tracking | F20-custody-location-tracking.md | Custody Module (Evidentiary Tracking Service) | Y0b §Custody; Y1b §Custody | Epic 20: Custody and Location Tracking | US-20.1, US-20.2, US-20.3 |
| F21: Sealing and Restricted Exhibit Handling | F21-sealing-restricted-exhibit-handling.md | Sealing Module (Evidentiary Tracking Service) | Y0b §Sealing; Y1b §Sealing | Epic 21: Sealing and Restricted Exhibit Handling | US-21.1, US-21.2 |
| F22: Jury Review Package Assembly | F22-jury-review-package-assembly.md | Jury Package Module (Evidentiary Tracking Service) | Y0b §Jury Package; Y1b §Jury Package | Epic 22: Jury Review Package Assembly | US-22.1, US-22.2 |
| F23: Physical and Digital Exhibit Distinction | F23-physical-digital-exhibit-distinction.md | Exhibit Type Catalog (Evidentiary Tracking Service) | Y0b §Exhibit Types; Y1b §Type Catalog | Epic 23: Physical and Digital Exhibit Distinction | US-23.1, US-23.2 |
| F24: Post-Trial Closeout (Full) | F24-post-trial-closeout-full.md | Closeout Module — full (Evidentiary Tracking Service) | Y0b §Closeout (full/appeal-ready); Y1b §Closeout Full | Epic 24: Post-Trial Closeout (Full) | US-24.1, US-24.2 |
| F25: Exhibit Portfolio Dashboard and Court Templates | F25-exhibit-portfolio-dashboard-templates.md | Portfolio & Templates Module — Scale (Evidentiary Tracking Service) | Y0b §Portfolio/Templates; Y1b §Portfolio | Epic 25: Exhibit Portfolio Dashboard and Court Templates | US-25.1, US-25.2 |

### 3.3 Speedy Trial Tracker Module (PRD §5.3)

| PRD Feature | FRD Chunk | TechArch Component (Service) | Schema/API Ref | User Story Epic | Story IDs |
|---|---|---|---|---|---|
| F26: Case and Defendant Tracker Initialization | F26-case-defendant-tracker-initialization.md | Tracker Initialization Module (Speedy Trial Service) | Y0c §Tracker Init (`defendant_trackers`); Y1c §Tracker Init | Epic 26: Case and Defendant Tracker Initialization | US-26.1, US-26.2, US-26.3 |
| F27: Docket Event Ingestion and Mapping | F27-docket-event-ingestion-mapping.md | Event Ingestion & Mapping Module (Speedy Trial Service) | Y0c §Event Mapping; Y1c §Event Mapping | Epic 27: Docket Event Ingestion and Mapping | US-27.1, US-27.2 |
| F28: Candidate Exclusion Engine | F28-candidate-exclusion-engine.md | Candidate Exclusion Engine (Speedy Trial Service) | Y0c §Exclusions (`candidate_exclusions`); Y1c §Exclusions | Epic 28: Candidate Exclusion Engine | US-28.1, US-28.2 |
| F29: Versioned Clock Calculation and Explainability | F29-versioned-clock-calculation-explainability.md | Calculation Engine (Speedy Trial Service) | Y0c §Calculation (`calculation_versions` append-only, `timeline_segments`); Y1c §Calculation | Epic 29: Versioned Clock Calculation and Explainability | US-29.1, US-29.2, US-29.3 |
| F30: Review and Approval Workflow | F30-review-approval-workflow.md | Review & Approval Module (Speedy Trial Service) | Y0c §Review/Approval (`confirmed_exclusions` append-only); Y1c §Review | Epic 30: Review and Approval Workflow | US-30.1, US-30.2 |
| F31: Configurable Threshold Alerts and Escalation | F31-configurable-threshold-alerts-escalation.md | Threshold Alert Module (Speedy Trial Service) | Y0c §Threshold Alerts; Y1c §Alerts | Epic 31: Configurable Threshold Alerts and Escalation | US-31.1, US-31.2 |
| F32: Calculation Version History ("What Changed") | F32-calculation-version-history.md | Version Comparison Module (Speedy Trial Service) | Y0c §Version Comparison; Y1c §Version Diff | Epic 32: Calculation Version History | US-32.1 |
| F33: Continuance Findings Check | F33-continuance-findings-check.md | Continuance Findings Module (Speedy Trial Service) | Y0c §Continuance Findings; Y1c §Continuance Check | Epic 33: Continuance Findings Check | US-33.1, US-33.2 |
| F34: Multi-Defendant Separation | F34-multi-defendant-separation.md | Multi-Defendant Module (Speedy Trial Service) | Y0c §Multi-Defendant; Y1c §Multi-Defendant | Epic 34: Multi-Defendant Separation | US-34.1, US-34.2 |
| F35: Case Conference View | F35-case-conference-view.md | Case Conference View Module (Speedy Trial Service) | Y0c §Conference View; Y1c §Conference | Epic 35: Case Conference View | US-35.1, US-35.2 |
| F36: Speedy Trial Portfolio Dashboard | F36-speedy-trial-portfolio-dashboard.md | Portfolio Dashboard Module — Pilot hardening (Speedy Trial Service) | Reporting Feed Service (Platform Core, read); Y1c §Portfolio Dashboard | Epic 36: Speedy Trial Portfolio Dashboard | US-36.1, US-36.2 |

### 3.4 Scale / Later-Increment Features (PRD §5.4)

| PRD Feature | FRD Chunk | TechArch Component (Service) | Schema/API Ref | User Story Epic | Story IDs |
|---|---|---|---|---|---|
| F37: Cross-Court Governance and National Configuration | F37-cross-court-governance-national-config.md | Governance Module — Scale (Platform Core) | Y0a §National Governance (`national_baseline_config`,`governance_requests`) | Epic 37: Cross-Court Governance and National Configuration | US-37.1, US-37.2 |
| F38: Advanced Analytics | F38-advanced-analytics.md | Analytics Module — Scale (Platform Core) | Y0a §Analytics (`analytics_trend_snapshots`) | Epic 38: Advanced Analytics | US-38.1 |
| F39: Broader Courtroom Technology Integration | F39-broader-courtroom-tech-integration.md | Courtroom Technology Bridge — Scale (Evidentiary Tracking Service) | Y3-integrations.md §Courtroom Technology | Epic 39: Broader Courtroom Technology Integration | US-39.1, US-39.2 |

---

## 4. Requirements Detail

PRD features with their governing FRD requirement scope, grouped by module:

**Shared Platform Foundation (F0–F13, all P0 except F9/F12=P1):**
- F0 Identity and Access Management — SSO/MFA, RBAC+ABAC scoped by court/division/case/proceeding/party-role/security-designation, session controls, separation of duties on privileged grants
- F1 Core Case and Docket Data Model — court/division/case/proceeding/hearing/party entity model, docket event + document reference representation with source-identifier preservation, shared case-context API
- F2 Audit Trail and Audit Explorer — append-only hash-chained audit capture, audit-read/operational-edit separation, Audit Explorer UI, rule/calculation-version linkage
- F3 Configuration Engine — court profiles, versioned rule packages, workflow states/thresholds/event mappings, maker-checker publish `[ASSUMPTION]`
- F4 Notifications Service — multi-channel delivery, content-policy enforcement (no sensitive data in notification text), delivery-status tracking, escalation cadence
- F5 Search Service — access-scoped cross-module search, pre-filter-before-rank access enforcement, existence-hiding for sealed records `[ASSUMPTION]`
- F6 Work Queue and Task Management — role-scoped task queues, audit-linked completion, cross-module aggregation
- F7 Exception Queue — cross-module exception surfacing, mandatory resolution rationale `[ASSUMPTION: min length]`, aging/escalation
- F8 Case Timeline View — chronological merge of docket/hearings/exhibit/clock events, confirmed-vs-pending toggle, security-designation filtering
- F9 Operational Reporting Feed (P1) — de-identified/role-limited dashboards and exports, explicit guard against influencing judicial determinations
- F10 CM/ECF Integration Adapter — inbound sync with source-identifier preservation, conflict routing (never silent overwrite), idempotent redelivery handling
- F11 Role-Specific UI Workspaces — Judge/Chambers, Clerk Console, Courtroom Deputy, Admin Dashboard; all USWDS/Section 508 compliant
- F12 Restricted External Attorney Portal (P1) — structured exhibit metadata submission, read-only deadline visibility, structurally separate auth realm `[ASSUMPTION: access scope]`
- F13 Security and Compliance Baseline — encryption in transit/at rest, malware scanning + allowlist, sealed/restricted/grand-jury/juvenile/PII policy-driven handling, retention/disposition schedules

**Evidentiary Tracking Module (F14–F25; P0 F14–F18, P1 F19, P2 F20–F24, P3 F25):**
- F14 Case/Proceeding Setup for Exhibits — proceeding-gated activation, numbering-scheme binding (locked post-assignment), party/security-designation setup
- F15 Pretrial Exhibit Intake — structured list + optional file intake, duplicate/format validation, exception-queue routing, accept/reject/correction workflow
- F16 Exhibit Ledger — full status lifecycle (proposed→offered→admitted/rejected→withdrawn/substituted/sealed/returned), immutable version history, judge-attributed rulings
- F17 Real-Time Courtroom Logging — ≤3-action offer/objection/ruling entry, keyboard-first, offline-tolerant local buffer with conflict-routed resync
- F18 Dual-Log and Source Reconciliation — scheduled/on-demand multi-source comparison, rationale-gated discrepancy resolution, high-severity completion gate
- F19 Exportable Exhibit List and Basic Closeout (P1) — filtered export, distinct certification action with ledger-state snapshot reference
- F20 Custody and Location Tracking (P2) — dual-confirmation transfer/acknowledgment, type-specific required fields, unacknowledged-transfer escalation
- F21 Sealing and Restricted Exhibit Handling (P2) — judge-authorized seal/release, access-attempt audit logging (successful and denied)
- F22 Jury Review Package Assembly (P2) — court-authorized composition restricted to admitted electronic exhibits, session-scoped access, package-access logging
- F23 Physical and Digital Exhibit Distinction (P2) — exhibit-type classification, type-specific custody/validation rules
- F24 Post-Trial Closeout (Full) (P2) — appeal-ready package, disposition task generation per retention policy, receipt generation
- F25 Exhibit Portfolio Dashboard and Court Templates (P3) — cross-case dashboard, versioned configuration templates for new-court onboarding

**Speedy Trial Tracker Module (F26–F36; P0 F26–F31, P1 F32/F35, P2 F33/F34/F36):**
- F26 Case and Defendant Tracker Initialization — auto/manual trigger-event tracker creation, missing-trigger flagging, authorized confirmation
- F27 Docket Event Ingestion and Mapping — CM/ECF or manual inbound ingestion, configurable category mapping, unmapped-event resolution queue
- F28 Candidate Exclusion Engine — rule-driven candidate generation (motions/competency/continuances/interlocutory), accept/modify/reject review, source-event + rule-version linkage
- F29 Versioned Clock Calculation and Explainability — elapsed/excluded/remaining calculation, full "explain this date" breakdown, append-only versioning (no silent overwrite)
- F30 Review and Approval Workflow — proposed-vs-confirmed state machine, reviewer attribution, mandatory-rationale overrides
- F31 Configurable Threshold Alerts and Escalation — court-configurable tiers, explanation-linked alerts (not bare dates), shared Notifications Service delivery
- F32 Calculation Version History ("What Changed") (P1) — version-to-version diff view, inline override rationale display
- F33 Continuance Findings Check (P2) — structural completeness flag only (never legal-sufficiency determination), chambers routing
- F34 Multi-Defendant Separation (P2) — independent per-defendant clocks, cross-defendant relationship/severance visibility
- F35 Case Conference View (P1) — single-screen clock/motion/continuance/issue summary, pre-conference packet generation
- F36 Speedy Trial Portfolio Dashboard (P2) — personal and court-level risk-indicator dashboards

**Scale / Later-Increment (F37–F39, all P3):**
- F37 Cross-Court Governance and National Configuration — national baseline with controlled override scope, governance approval workflow
- F38 Advanced Analytics — cross-court trend analysis, de-identified exports, explicit non-judicial-use guardrail
- F39 Broader Courtroom Technology Integration — secure display/streaming integration, controlled outbound package/stream, incident monitoring

---

## 5. Test Case Coverage

Because JudicialSync's FRD specifies a complete per-feature error-state table (negative-path tests) and the User Stories specify explicit, checkbox-style acceptance criteria (positive/behavioral-path tests), the table below derives required test-case counts directly from these two sources rather than from a separately-authored test plan. "FRD Error States" counts the rows in each feature chunk's Error States table (each a required negative test, tallied directly from `project_specs/FRD/F{nn}-*.md`); "US Acceptance Criteria" counts the total checkbox bullets across that feature's stories (each a required behavioral test, tallied directly from `project_specs/UserStories/Epic-{nn}-*.md`); "Est. Test Cases" is their sum, representing the minimum test suite size to achieve full requirements-based coverage for that feature. All counts below were extracted directly from source files, not estimated.

### 5.1 Shared Platform Foundation

| Feature | Stories | FRD Error States | US Acceptance Criteria | Est. Test Cases | Coverage |
|---|:---:|:---:|:---:|:---:|:---:|
| F0: Identity and Access Management | 3 | 7 | 14 | 21 | 100% |
| F1: Core Case and Docket Data Model | 3 | 5 | 13 | 18 | 100% |
| F2: Audit Trail and Audit Explorer | 3 | 4 | 13 | 17 | 100% |
| F3: Configuration Engine | 3 | 5 | 12 | 17 | 100% |
| F4: Notifications Service | 2 | 4 | 8 | 12 | 100% |
| F5: Search Service | 2 | 3 | 8 | 11 | 100% |
| F6: Work Queue and Task Management | 2 | 3 | 8 | 11 | 100% |
| F7: Exception Queue | 2 | 4 | 8 | 12 | 100% |
| F8: Case Timeline View | 2 | 3 | 8 | 11 | 100% |
| F9: Operational Reporting Feed | 2 | 3 | 8 | 11 | 100% |
| F10: CM/ECF Integration Adapter | 2 | 5 | 8 | 13 | 100% |
| F11: Role-Specific UI Workspaces | 4 | 2 | 14 | 16 | 100% |
| F12: Restricted External Attorney Portal | 3 | 4 | 12 | 16 | 100% |
| F13: Security and Compliance Baseline | 3 | 5 | 12 | 17 | 100% |

### 5.2 Evidentiary Tracking Module

| Feature | Stories | FRD Error States | US Acceptance Criteria | Est. Test Cases | Coverage |
|---|:---:|:---:|:---:|:---:|:---:|
| F14: Case and Proceeding Setup for Exhibits | 2 | 4 | 8 | 12 | 100% |
| F15: Pretrial Exhibit Intake | 3 | 6 | 12 | 18 | 100% |
| F16: Exhibit Ledger | 3 | 5 | 11 | 16 | 100% |
| F17: Real-Time Courtroom Logging | 3 | 4 | 13 | 17 | 100% |
| F18: Dual-Log and Source Reconciliation | 3 | 4 | 10 | 14 | 100% |
| F19: Exportable Exhibit List and Basic Closeout | 2 | 3 | 7 | 10 | 100% |
| F20: Custody and Location Tracking | 3 | 3 | 11 | 14 | 100% |
| F21: Sealing and Restricted Exhibit Handling | 2 | 3 | 7 | 10 | 100% |
| F22: Jury Review Package Assembly | 2 | 4 | 10 | 14 | 100% |
| F23: Physical and Digital Exhibit Distinction | 2 | 4 | 6 | 10 | 100% |
| F24: Post-Trial Closeout (Full) | 2 | 4 | 8 | 12 | 100% |
| F25: Exhibit Portfolio Dashboard and Court Templates | 2 | 4 | 6 | 10 | 100% |

### 5.3 Speedy Trial Tracker Module

| Feature | Stories | FRD Error States | US Acceptance Criteria | Est. Test Cases | Coverage |
|---|:---:|:---:|:---:|:---:|:---:|
| F26: Case and Defendant Tracker Initialization | 3 | 3 | 10 | 13 | 100% |
| F27: Docket Event Ingestion and Mapping | 2 | 3 | 7 | 10 | 100% |
| F28: Candidate Exclusion Engine | 2 | 3 | 6 | 9 | 100% |
| F29: Versioned Clock Calculation and Explainability | 3 | 4 | 11 | 15 | 100% |
| F30: Review and Approval Workflow | 2 | 4 | 8 | 12 | 100% |
| F31: Configurable Threshold Alerts and Escalation | 2 | 3 | 8 | 11 | 100% |
| F32: Calculation Version History | 1 | 3 | 5 | 8 | 100% |
| F33: Continuance Findings Check | 2 | 3 | 8 | 11 | 100% |
| F34: Multi-Defendant Separation | 2 | 3 | 8 | 11 | 100% |
| F35: Case Conference View | 2 | 2 | 9 | 11 | 100% |
| F36: Speedy Trial Portfolio Dashboard | 2 | 3 | 8 | 11 | 100% |

### 5.4 Scale / Later-Increment Features

| Feature | Stories | FRD Error States | US Acceptance Criteria | Est. Test Cases | Coverage |
|---|:---:|:---:|:---:|:---:|:---:|
| F37: Cross-Court Governance and National Configuration | 2 | 3 | 6 | 9 | 100% |
| F38: Advanced Analytics | 1 | 3 | 5 | 8 | 100% |
| F39: Broader Courtroom Technology Integration | 2 | 4 | 8 | 12 | 100% |

**Totals:** 93 user stories across all 40 FRD feature chunks (F00–F39); 40/40 feature chunks carry a complete Error States table with a combined **149 feature-local error-code rows** across the feature set (plus the shared cross-feature catalog in `Y2-errors.md` for reused codes); 93 stories carry a combined **362 acceptance-criteria checkboxes**. Combined minimum traceable test-case basis: **511 test cases** across the full feature set, 100% of which map to a named PRD feature, FRD chunk, TechArch component, and User Story — no feature has an untraceable requirement or an acceptance criterion without a corresponding FRD-specified behavior.

---

## 6. Change Management

| Version | Date | Change Description | Changed By | Impact |
|---|---|---|---|---|
| 1.0 | 2026-10-04 | Initial RTM generated from PRD v1.0, FRD v1.0, TechArch v1.0, UserStories v1.0 (all pre-pilot drafts) | Pivota Spec RTM Generator | Baseline traceability established for all 40 features (F0–F39), 93 user stories |

**Pending validation triggers that will require an RTM update:**
- Stakeholder validation of the 7 `[ASSUMPTION]`-tagged FRD decisions (F00 role catalog, F03 maker-checker, F05 existence-hiding, F07 rationale minimum length, F01/F13/F23 exhibit storage model) may change feature scope, requiring FRD/TechArch/UserStories re-sync and corresponding RTM row updates
- Pilot-district engagement (per PRD §8.3) may reprioritize P1/P2/P3 features, requiring Priority Summary updates in §2 above
- Any FRD feature chunk revision (new error codes, changed validation rules) should trigger re-verification of the corresponding row in §5 Test Case Coverage

---

## 7. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Product Owner | _________________________ | _________________________ | _________________________ |
| Engineering Lead (TechArch) | _________________________ | _________________________ | _________________________ |
| QA / Test Lead | _________________________ | _________________________ | _________________________ |
| Security Officer | _________________________ | _________________________ | _________________________ |
| AOUSC / Pilot Court Stakeholder | _________________________ | _________________________ | _________________________ |

*This RTM is derived from pre-pilot, pre-stakeholder-validation spec documents (PRD/FRD/TechArch/UserStories v1.0). Per PRD §1 and `.planning/PROJECT.md`, scope, priorities, and the `[ASSUMPTION]`-tagged decisions above should be revisited after pilot-district engagement, and this RTM re-generated/updated accordingly.*
