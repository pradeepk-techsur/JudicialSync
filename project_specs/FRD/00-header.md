# Functional Requirements Document: JudicialSync

**Project Acronym:** JudicialSync
**Document Type:** FRD (Functional Requirements Document)
**Version:** 1.0 (Draft — derived from PRD-JudicialSync v1.0, pre-pilot/pre-stakeholder-validation)
**Generated:** 2026-10-04
**Upstream Source:** `project_specs/PRD-JudicialSync.md`, `.planning/PROJECT.md`, `project_specs/ref_docs/Court_Operations_Trackers_Vision.txt` (directional input only)

---

## Scope Statement

This FRD specifies the functional behavior of every feature in the JudicialSync PRD (F0–F39): inputs, outputs, validation rules, process flows, error states, API surface, and database schema touchpoints, at a level of detail sufficient for implementation without further product clarification on *what* each feature must do. It does not resolve open policy/legal/security questions explicitly flagged in the PRD and vision document (exhibit file storage model, custody categories, user authority matrix, CM/ECF event availability/latency, local Speedy Trial plan variability, external counsel access scope, national/local governance split, retention schedules) — these are carried forward as **explicit assumptions**, marked `[ASSUMPTION]` inline in the relevant feature chunk, to be validated during pilot scoping. This FRD assumes, but does not specify, the technology stack — that belongs to the TechArch document.

**Binding constraints carried forward from the PRD/PROJECT.md, applicable to every feature below:**
- Every legally significant state transition (ruling, exclusion confirmation, continuance finding, override, final Speedy Trial status) requires an explicit human-approval gate; no feature may auto-finalize such a transition.
- Every material action (status change, ruling, custody transfer, override, approval) is captured as an immutable/tamper-evident audit event (see F2, `Y0a-schema-shared.md` §audit_event).
- CM/ECF (or successor) is the authoritative docket; JudicialSync never silently overwrites docket-sourced data — conflicts route to human review via the Exception Queue (F7).
- Access control is role-based **and** attribute-based, scoped by court/division/case/proceeding/party-role/security-designation (F0).
- All UI surfaces conform to Section 508 via USWDS components (F11).

---

## Conventions

- **Feature IDs** (`F0`–`F39`) map 1:1 to PRD §5 feature IDs. Each feature chunk file is named `F{nn}-{slug}.md` with zero-padded `nn`.
- **Cross-references** use the form `see F17 §Process step 3` or `see Y0b-schema-evidentiary.md §exhibit`.
- **API endpoints** referenced per-feature as a summary table; full request/response schemas live in `Y1a/b/c-api-*.md`.
- **Schema** referenced per-feature as a bullet list of tables touched; full DDL lives in `Y0a/b/c-schema-*.md`.
- **Error tables** are feature-local; the full cross-feature catalog (including shared platform errors reused by many features) is in `Y2-errors.md`.
- **Entity naming**: table names are `snake_case`, singular conceptual entity / plural table name per SQL convention (e.g. entity "exhibit" → table `exhibits`).
- **IDs**: all primary keys are UUIDv4 unless otherwise noted. Court-facing human-readable identifiers (exhibit numbers, case numbers) are separate display-only fields, not primary keys.
- **Timestamps**: all persisted timestamps are UTC `timestamptz`; display layer converts to court-local time zone per court profile (F3).
- **Soft-delete**: no hard deletes are permitted on any table feeding the audit trail (F2) or docket-sourced data (F10); removal is represented as a status transition, never a row deletion.
- **`[ASSUMPTION]`** tags mark content that resolves a PRD/vision open decision for FRD purposes; these must be re-validated with stakeholders before implementation lock.

---

## Shared Cross-Cutting Terminology

- **Court Profile:** The unit of local configuration (numbering schemes, local rules, thresholds, workflow states, event mappings) scoped to one federal district court, managed via the Configuration Engine (F3).
- **Security Designation:** A policy-driven sensitivity tag (sealed, restricted, grand jury, juvenile, PII) attached to a case, proceeding, document, or exhibit that drives access-control and notification-content enforcement.
- **Proposed vs. Confirmed State:** The core human-in-command pattern used across both modules — system-suggested data (candidate exclusions, mapped events, calculated dates) exists in a "proposed" state until an authorized human reviewer explicitly confirms, modifies, or rejects it. Confirmed state is never silently replaced; superseding a confirmed value creates a new version with full lineage to the prior one.
- **Rule Package / Calculation Version:** A versioned, timestamped snapshot of the configuration and logic in effect when a calculation or rule-driven suggestion was produced, so results remain explainable and reproducible after later configuration changes.
- **Audit Event:** An immutable record of a material action (who, what, when, under which rule/calculation version, old value, new value) forming the tamper-evident audit trail (F2).
- **Work Queue / Task:** A role-scoped actionable item requiring human attention (approval, review, resolution), surfaced via F6.
- **Exception:** A flagged data-quality or reconciliation issue (discrepancy, unmapped event, missing metadata) surfaced via the shared Exception Queue (F7), requiring rationale on resolution.
- **Docket Event:** A CM/ECF-sourced or manually entered record of a case-affecting action (filing, order, hearing) that both modules consume as an input signal, always retaining its CM/ECF source identifier.
- **Source Identifier:** The originating system's unique identifier for an imported record (e.g., CM/ECF document number), preserved alongside the JudicialSync-internal ID to support authoritative-source discipline.

---

## Master Table of Contents

### Shared Platform Foundation (§5.1 of PRD)
- [F00: Identity and Access Management](F00-identity-access-management.md)
- [F01: Core Case and Docket Data Model](F01-core-case-docket-data-model.md)
- [F02: Audit Trail and Audit Explorer](F02-audit-trail-explorer.md)
- [F03: Configuration Engine](F03-configuration-engine.md)
- [F04: Notifications Service](F04-notifications-service.md)
- [F05: Search Service](F05-search-service.md)
- [F06: Work Queue and Task Management](F06-work-queue-task-management.md)
- [F07: Exception Queue](F07-exception-queue.md)
- [F08: Case Timeline View](F08-case-timeline-view.md)
- [F09: Operational Reporting Feed](F09-operational-reporting-feed.md)
- [F10: CM/ECF Integration Adapter](F10-cmecf-integration-adapter.md)
- [F11: Role-Specific UI Workspaces](F11-role-specific-ui-workspaces.md)
- [F12: Restricted External Attorney Portal](F12-restricted-external-attorney-portal.md)
- [F13: Security and Compliance Baseline](F13-security-compliance-baseline.md)

### Evidentiary Tracking Module (§5.2 of PRD)
- [F14: Case and Proceeding Setup for Exhibits](F14-case-proceeding-setup-exhibits.md)
- [F15: Pretrial Exhibit Intake](F15-pretrial-exhibit-intake.md)
- [F16: Exhibit Ledger](F16-exhibit-ledger.md)
- [F17: Real-Time Courtroom Logging](F17-realtime-courtroom-logging.md)
- [F18: Dual-Log and Source Reconciliation](F18-dual-log-reconciliation.md)
- [F19: Exportable Exhibit List and Basic Closeout](F19-exportable-exhibit-list-basic-closeout.md)
- [F20: Custody and Location Tracking](F20-custody-location-tracking.md)
- [F21: Sealing and Restricted Exhibit Handling](F21-sealing-restricted-exhibit-handling.md)
- [F22: Jury Review Package Assembly](F22-jury-review-package-assembly.md)
- [F23: Physical and Digital Exhibit Distinction](F23-physical-digital-exhibit-distinction.md)
- [F24: Post-Trial Closeout (Full)](F24-post-trial-closeout-full.md)
- [F25: Exhibit Portfolio Dashboard and Court Templates](F25-exhibit-portfolio-dashboard-templates.md)

### Speedy Trial Tracker Module (§5.3 of PRD)
- [F26: Case and Defendant Tracker Initialization](F26-case-defendant-tracker-initialization.md)
- [F27: Docket Event Ingestion and Mapping](F27-docket-event-ingestion-mapping.md)
- [F28: Candidate Exclusion Engine](F28-candidate-exclusion-engine.md)
- [F29: Versioned Clock Calculation and Explainability](F29-versioned-clock-calculation-explainability.md)
- [F30: Review and Approval Workflow](F30-review-approval-workflow.md)
- [F31: Configurable Threshold Alerts and Escalation](F31-configurable-threshold-alerts-escalation.md)
- [F32: Calculation Version History ("What Changed")](F32-calculation-version-history.md)
- [F33: Continuance Findings Check](F33-continuance-findings-check.md)
- [F34: Multi-Defendant Separation](F34-multi-defendant-separation.md)
- [F35: Case Conference View](F35-case-conference-view.md)
- [F36: Speedy Trial Portfolio Dashboard](F36-speedy-trial-portfolio-dashboard.md)

### Scale / Later-Increment Features (§5.4 of PRD)
- [F37: Cross-Court Governance and National Configuration](F37-cross-court-governance-national-config.md)
- [F38: Advanced Analytics](F38-advanced-analytics.md)
- [F39: Broader Courtroom Technology Integration](F39-broader-courtroom-tech-integration.md)

### Cross-Feature Reference Chunks
- [Y0a: Database Schema — Shared Foundation](Y0a-schema-shared.md)
- [Y0b: Database Schema — Evidentiary Tracking](Y0b-schema-evidentiary.md)
- [Y0c: Database Schema — Speedy Trial Tracker](Y0c-schema-speedytrial.md)
- [Y1a: API Endpoints — Shared Platform](Y1a-api-shared.md)
- [Y1b: API Endpoints — Evidentiary Tracking](Y1b-api-evidentiary.md)
- [Y1c: API Endpoints — Speedy Trial Tracker](Y1c-api-speedytrial.md)
- [Y2: Cross-Feature Error Catalog](Y2-errors.md)
- [Y3: Integration Points](Y3-integrations.md)

---
