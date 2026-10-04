# Technical Architecture Document: JudicialSync

**Project Acronym:** JudicialSync
**Document Type:** TechArch (Technical Architecture)
**Version:** 1.0 (Draft — derived from PRD-JudicialSync v1.0 and FRD-JudicialSync v1.0, pre-pilot/pre-stakeholder-validation)
**Generated:** 2026-10-04
**Upstream Sources:** `project_specs/PRD-JudicialSync.md`, `project_specs/FRD-JudicialSync.md` (and chunk files `project_specs/FRD/Y0a/b/c-schema-*.md`, `Y1a/b/c-api-*.md`, `Y2-errors.md`, `Y3-integrations.md`), `.planning/PROJECT.md`

---

## Scope Statement

This document specifies **how** JudicialSync is built: architecture pattern, component decomposition, data model (full DDL), API design (REST + TypeScript contracts), security architecture, technology stack, and integration points. It assumes the functional behavior specified in the FRD and does not re-derive *what* each feature does — it specifies the technical substrate that makes that behavior possible, auditable, and federally deployable.

Three binding, non-negotiable constraints shape every architectural decision below:

1. **USWDS is mandatory for all UI.** The frontend framework choice must be compatible with the U.S. Web Design System (https://designsystem.digital.gov/) component library and design tokens. This is a federal accessibility (Section 508) and visual-consistency requirement, not a preference.
2. **Audit immutability is structural, not procedural.** The `audit_events`, `exhibit_versions`, `calculation_versions`, and `confirmed_exclusions` tables (and others flagged in FRD Y2) are append-only at the database-grant level — no application code path, however privileged, can issue `UPDATE`/`DELETE` against them. Tamper-evidence is enforced via hash-chaining, not merely by convention.
3. **Human-in-command is enforced at the API layer.** No service may auto-finalize a ruling, exclusion confirmation, override, or final Speedy Trial status. Every state-changing endpoint that touches a legally significant object requires an explicit authenticated actor and produces a versioned, attributable record — the architecture makes "silent auto-finalization" structurally impossible, not merely disallowed by policy.

---

## 1. Architectural Pattern

JudicialSync is built as a **modular, domain-partitioned service architecture** — not a single monolith, not a fully decomposed microservices mesh. Three deployable units share one data platform and one API gateway:

- **Platform Core Service** — identity/ABAC, case/docket model, audit, configuration engine, notifications, search, work queue, exception queue, timeline, CM/ECF adapter, security/file-scanning, reporting feed. Every other service depends on Platform Core; Platform Core depends on nothing else in the system.
- **Evidentiary Tracking Service** — exhibit ledger, courtroom logging, reconciliation, custody, sealing, jury package, closeout. Depends on Platform Core only (via internal API, never by directly querying Platform Core's tables).
- **Speedy Trial Service** — tracker initialization, event mapping, candidate exclusion engine, calculation engine, review/approval, threshold alerts, continuance findings, multi-defendant separation. Depends on Platform Core only.

This "shared-core, two domain modules" shape directly mirrors the PRD's Technical Architecture table (§4) and lets a court adopt one module first (e.g., Evidentiary only) without standing up Speedy Trial infrastructure, while both modules get identity, audit, configuration, and notifications for free on day one.

**Why not a single monolith:** The PRD requires the two domains to be "independently deployable" (§4) so pilot courts can adopt one module first. A single deployable would force synchronized releases across both domains and make partial-adoption impossible.

**Why not full microservices decomposition:** Splitting each FRD feature (F00–F39) into its own service would multiply operational burden (40 services, 40 deployment pipelines, 40 sets of federal ATO/security review artifacts) without a corresponding benefit — the PRD's scaling axis is "more courts," not "independent feature-level scaling." Three coarse-grained, domain-aligned services balance deployability against operational and compliance overhead appropriate for a first-pilot federal system.

### 1.1 Logical Architecture Diagram

```
                              ┌─────────────────────────────────────────────┐
                              │         Experience Layer (USWDS)             │
                              │  ┌───────────┐ ┌───────────┐ ┌────────────┐ │
                              │  │  Judge /  │ │   Clerk   │ │ Courtroom  │ │
                              │  │ Chambers  │ │Operations │ │  Deputy    │ │
                              │  │ Workspace │ │  Console  │ │ Interface  │ │
                              │  └───────────┘ └───────────┘ └────────────┘ │
                              │  ┌───────────┐ ┌───────────────────────────┐│
                              │  │  Admin    │ │ Restricted Attorney Portal││
                              │  │ Dashboard │ │   (separate auth realm)   ││
                              │  └───────────┘ └───────────────────────────┘│
                              └───────────────────────┬───────────────────────┘
                                                       │ HTTPS / TLS 1.2+
                                                       ▼
                              ┌─────────────────────────────────────────────┐
                              │              API Gateway                     │
                              │  - Token validation (OIDC/SAML)              │
                              │  - ABAC policy-evaluation hook (per request) │
                              │  - Rate limiting, request logging            │
                              │  - Separate audience/issuer for portal vs.   │
                              │    internal realm (F12 separation req.)      │
                              └───────┬───────────────┬───────────────┬──────┘
                                      │               │               │
                   ┌──────────────────┘               │               └──────────────────┐
                   ▼                                  ▼                                  ▼
      ┌─────────────────────────┐      ┌──────────────────────────┐     ┌──────────────────────────┐
      │   Platform Core Service  │      │ Evidentiary Tracking Svc │     │   Speedy Trial Service    │
      │ ┌───────────────────────┐│      │┌─────────────────────────┐│    │┌─────────────────────────┐│
      │ │ Identity/ABAC (F00)   ││      ││ Exhibit Ledger (F16)    ││    ││ Tracker Init (F26)      ││
      │ │ Case/Docket (F01)     ││      ││ Courtroom Logging (F17) ││    ││ Event Mapping (F27)     ││
      │ │ Audit Service (F02)   ││◄─────┤│ Reconciliation (F18)    ││    ││ Exclusion Engine (F28)  ││
      │ │ Config Engine (F03)   ││ internal││ Custody (F20)        ││    ││ Calc Engine (F29)       ││
      │ │ Notifications (F04)  ││ API  ││ Sealing (F21)           ││    ││ Review/Approval (F30)   ││
      │ │ Search (F05)         ││      ││ Jury Package (F22)      ││    ││ Threshold Alerts (F31)  ││
      │ │ Work Queue (F06)     ││      ││ Closeout (F19/F24)      ││    ││ Continuance Check (F33) ││
      │ │ Exception Queue (F07)││      │└─────────────────────────┘│    ││ Multi-Defendant (F34)   ││
      │ │ Timeline (F08)       ││      └──────────────────────────┘     │└─────────────────────────┘│
      │ │ Reporting (F09)      ││                                       └──────────────────────────┘
      │ │ CM/ECF Adapter (F10) ││
      │ │ File/Malware (F13)   ││
      │ └───────────────────────┘│
      └─────────────┬─────────────┘
                     │
                     ▼
      ┌───────────────────────────────────────────────────────────┐
      │                    Data & Integration Layer                 │
      │ ┌─────────────┐ ┌──────────────┐ ┌───────────┐ ┌──────────┐│
      │ │ PostgreSQL   │ │ Object Store │ │  Search   │ │  Redis   ││
      │ │ (operational │ │ (file refs / │ │ (OpenSearch│ │ (cache / ││
      │ │  + audit)    │ │  evidence)   │ │  index)   │ │ sessions)││
      │ └─────────────┘ └──────────────┘ └───────────┘ └──────────┘│
      └───────────────────────────┬───────────────────────────────┘
                                   │
                                   ▼
      ┌───────────────────────────────────────────────────────────┐
      │                   External Systems (Y3)                     │
      │  CM/ECF (authoritative docket) │ IdP (SSO/MFA) │ Email/SMS   │
      │  Courtroom display/jury-review hardware │ AO reporting feed │
      └───────────────────────────────────────────────────────────┘
```

### 1.2 Key Architectural Decisions

| Decision | Rationale |
|---|---|
| Three coarse-grained services (Platform Core, Evidentiary, Speedy Trial), not a monolith and not per-feature microservices | Matches PRD's "independently deployable modules sharing a platform layer" without multiplying federal ATO/ops overhead across 40 feature-level services |
| Single shared PostgreSQL cluster, schema-separated by domain (`platform`, `evidentiary`, `speedytrial`), not separate databases per service | Audit linkage (`audit_events.object_id`) and cross-module views (Case Timeline F08, Search F05) require efficient cross-schema joins; full physical database separation would force expensive cross-database federation for features that are inherently cross-cutting |
| API Gateway terminates all external traffic; internal service-to-service calls use a private network segment, never routed back through the public gateway | Defense in depth; internal calls (e.g., Evidentiary → Platform Core audit write) must not be interceptable from the public internet path |
| Append-only tables enforced at the PostgreSQL **role/grant** level, not only at the application/ORM level | FRD Y2 explicitly requires database-level enforcement ("no UPDATE/DELETE grants... at the DB level") — application-layer-only enforcement is bypassable by a compromised or misconfigured app process; grant-level enforcement is not |
| ABAC policy evaluation is centralized (Policy Decision Point) rather than re-implemented per service | F00 requires identical scope-attribute evaluation (court/division/case/proceeding/party-role/security-designation) across all three services; a single policy engine avoids three divergent, independently-buggy ABAC implementations |
| External attorney portal (F12) is served by a structurally separate API audience/issuer and a separate frontend bundle, not a role-gated view inside the internal app | FRD F00/F12/Y3 explicitly require a token issued for the portal to be structurally rejected by internal-only endpoints — this is implemented as distinct OIDC client IDs/audiences, not a shared token with a "portal" role flag that a bug could misread |

---

## 2. Deployment Topology

JudicialSync targets a **federal government cloud environment** (e.g., AWS GovCloud (US) or Azure Government), reflecting the domain's security and compliance posture (FedRAMP-aligned controls, data residency, federal PKI/IdP compatibility). Deployment uses containerized services orchestrated by Kubernetes, with environment promotion (dev → staging → pilot-court production) gated by automated security scanning and manual release approval (separation-of-duties for release control, per PRD NFR "Separation of duties").

```
┌───────────────────────────────────────────────────────────────────────┐
│                     Federal Government Cloud Region                    │
│                                                                         │
│  ┌───────────────── Public-Facing Subnet (DMZ) ─────────────────────┐ │
│  │  WAF / CDN  →  Load Balancer  →  API Gateway (ingress)            │ │
│  └────────────────────────────┬──────────────────────────────────────┘ │
│                                │ (private network only beyond this)     │
│  ┌───────────────── Application Subnet (private) ───────────────────┐ │
│  │  Kubernetes cluster:                                              │ │
│  │   - platform-core (N replicas, HPA on CPU/queue depth)            │ │
│  │   - evidentiary-svc (N replicas)                                  │ │
│  │   - speedytrial-svc (N replicas)                                  │ │
│  │   - policy-decision-point (ABAC engine, sidecar or shared svc)    │ │
│  │   - notification-worker (async queue consumer)                   │ │
│  │   - cmecf-sync-worker (polling/webhook consumer)                  │ │
│  └────────────────────────────┬──────────────────────────────────────┘ │
│                                │                                        │
│  ┌───────────────── Data Subnet (private, most restricted) ─────────┐ │
│  │  - PostgreSQL (Multi-AZ primary + read replica)                   │ │
│  │  - Redis (session cache, rate-limit counters)                    │ │
│  │  - OpenSearch cluster (search index, F05)                        │ │
│  │  - Object Store (encrypted at rest, versioned, exhibit/package    │ │
│  │    reference layer — F13/F15/F22/F24)                            │ │
│  │  - Backup / snapshot store (cross-region, immutable retention)   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────── Security & Ops Plane (cross-cutting) ───────────┐ │
│  │  Centralized logging (SIEM-forwarded) │ Secrets manager (KMS)    │ │
│  │  Vulnerability scanning │ Config management │ Audit-chain         │ │
│  │  verification job (scheduled) │ Malware-scan service (F13)        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                 │                              │
                 ▼                              ▼
         CM/ECF (external,              Identity Provider
         court-network boundary)        (SAML/OIDC, federal PKI-aware)
```

**Deployment notes:**

- **Court-level tenancy:** One deployment serves multiple courts (multi-tenant by `court_id`), not one deployment per court — this is what makes "national core, local configuration" (F03, F37) operationally real rather than aspirational. Tenancy isolation is enforced at the ABAC/row-level-security layer, not by physical separation.
- **Courtroom continuity:** Per PRD NFR "Reliability and continuity," the Courtroom Deputy Interface supports an offline-capable local write-ahead queue (`synced_from_offline` flag on `session_log_entries`, see Y0b) so real-time logging continues through a transient network/API outage and reconciles on reconnect — this is a deliberate client-architecture decision, not merely a backend concern.
- **Availability target:** Multi-AZ deployment within the region for all stateful components; availability SLO is scoped to court operating hours per the PRD NFR, with maintenance windows scheduled outside those hours.
- **Environment separation:** Dev/staging/pilot-production are fully isolated (separate databases, separate IdP realms, no production case data in lower environments) given the sensitivity of sealed/restricted/PII-bearing records.

---

## 3. Binding Architectural Principles Reflected in This Design

| PRD Principle | Architectural Realization |
|---|---|
| National core, local configuration | `rule_package_versions` (F03) as the single configuration source of truth read by all three services at action time; no per-court code branches or deployments |
| Human-in-command | Every legally significant mutation requires an authenticated actor claim + produces a new version row; no batch/cron job has write grants to `calculation_versions`, `confirmed_exclusions`, or `exhibit_versions` |
| Explain every consequential result | `timeline_segments`, `calculation_versions.rule_version_ref`, and `exhibit_versions.audit_event_id` provide a queryable, reconstructable lineage from any displayed number back to its source events and rule version |
| Courtroom speed | Dedicated lightweight Courtroom Deputy client bundle (minimal JS payload, offline-tolerant, keyboard-first), separate from the heavier Clerk/Admin consoles |
| Authoritative-source discipline | `source_system`/`source_identifier` columns on every CM/ECF-derived table; `sync_conflicts` table routes discrepancies to human review rather than overwriting |
| Accessibility by design | USWDS component library + design tokens as the mandatory frontend foundation (§5, Technology Stack) |
| API-first interoperability | All external integrations (CM/ECF, IdP, notification channels, courtroom tech) are isolated behind the Platform Core's integration-adapter boundary; no domain service calls an external system directly |

---

## 4. Component Architecture

### 4.1 Platform Core Service

The Platform Core Service is the dependency root for the entire system. It owns identity/ABAC, the shared case/docket model, the audit trail, configuration, notifications, search, work queue, exception queue, timeline, CM/ECF adapter, and the security/file-scanning baseline. No domain module (Evidentiary, Speedy Trial) may bypass Platform Core to reach these capabilities directly.

| Component | Responsibility | FRD Features | Key Dependencies |
|---|---|---|---|
| Identity & ABAC Module | SSO/OIDC-SAML exchange, MFA enforcement, session issuance/refresh, role catalog, scope-attribute resolution, entitlement computation | F00 | IdP (external), Policy Decision Point |
| Policy Decision Point (PDP) | Centralized ABAC policy evaluation (court/division/case/proceeding/party-role/security-designation) invoked by the API Gateway and by services for in-process checks | F00 | Identity & ABAC Module (policy source) |
| Case & Docket Context Service | Court/division/case/proceeding/hearing/party/docket-event/document-reference model; the single source of case context consumed by both domain modules | F01 | CM/ECF Adapter |
| Audit Service | Append-only, hash-chained audit event capture; transactional-outbox coordination with domain writes; Audit Explorer query API | F02 | PostgreSQL (restricted grants) |
| Configuration Engine | Court profile management, rule package versioning, workflow-state/threshold/event-mapping definitions, maker-checker publish workflow | F03 | Audit Service |
| Notifications Service | Multi-channel delivery, content-policy template enforcement, delivery-status tracking, escalation cadence | F04 | Notification Channels (external), Configuration Engine |
| Search Service | Access-scoped full-text/structured search over the denormalized `search_index` | F05 | OpenSearch, Identity & ABAC |
| Work Queue Service | Role-scoped task surfacing, assignment, completion/dismissal with audit linkage | F06 | Audit Service |
| Exception Queue Service | Cross-module exception capture, rationale-gated resolution, aging/escalation | F07 | Work Queue Service, Notifications Service |
| Timeline Service | Chronological merge of docket events, hearings, exhibit actions, and clock segments for a case | F08 | Case & Docket Context, Evidentiary Svc (read), Speedy Trial Svc (read) |
| Reporting Feed Service | Role-limited/de-identified operational dashboards and exports | F09 | PostgreSQL read replica |
| CM/ECF Integration Adapter | Inbound sync (case/party/docket-event/order/document-reference), idempotent redelivery handling, conflict routing | F10 | CM/ECF (external) |
| File/Malware Scanning Service | Upload intake, allowlist enforcement, malware scan orchestration | F13 | Object Store, scanning engine (external/managed service) |
| Retention & Disposition Engine | Configurable retention schedules, disposition task generation | F13 | Configuration Engine, Work Queue Service |
| Governance Module (Scale) | National baseline configuration, override-request workflow, cross-court consistency reporting | F37 | Configuration Engine |
| Analytics Module (Scale) | Cross-court trend analytics, de-identified exports | F38 | Reporting Feed Service |

### 4.2 Evidentiary Tracking Service

| Component | Responsibility | FRD Features | Key Dependencies |
|---|---|---|---|
| Exhibit Setup Module | Proceeding-scoped numbering scheme activation, party/security-designation binding | F14 | Case & Docket Context (Platform Core) |
| Intake Module | Structured exhibit list/file intake, validation, duplicate detection, accept/reject/correction workflow | F15 | File/Malware Scanning (Platform Core), Exception Queue |
| Exhibit Ledger Module | Current-state exhibit record + full immutable version history (status lifecycle) | F16 | Audit Service (Platform Core) |
| Courtroom Logging Module | Real-time offer/objection/ruling/withdrawal/substitution capture, offline-tolerant session log | F17 | Exhibit Ledger Module |
| Reconciliation Module | Scheduled/on-demand comparison across source lists and the live ledger, discrepancy resolution | F18 | Exhibit Ledger Module, Exception Queue, Notifications |
| Closeout Module (basic + full) | Filtered export/certification (F19); full appeal-ready package with disposition tasks and receipts (F24) | F19, F24 | Reconciliation Module, Retention & Disposition Engine |
| Custody Module | Transfer/return/storage event recording, acknowledgment, unacknowledged-transfer alerting | F20 | Notifications Service |
| Sealing Module | Judge-authorized seal/release workflow, sealed-access audit | F21 | Audit Service, Security Policies (Platform Core) |
| Jury Package Module | Court-authorized package composition, session-scoped access, package-access logging | F22 | Exhibit Ledger Module, Sealing Module |
| Exhibit Type Catalog | Exhibit-type classification and type-specific validation rules | F23 | Configuration Engine (Platform Core) |
| Portfolio & Templates Module (Scale) | Cross-case dashboard, court-configuration templates | F25 | Reporting Feed Service |
| Courtroom Technology Bridge (Scale) | Secure display/stream session management for registered endpoints | F39 | Sealing Module, Jury Package Module |

### 4.3 Speedy Trial Service

| Component | Responsibility | FRD Features | Key Dependencies |
|---|---|---|---|
| Tracker Initialization Module | Defendant-specific tracker creation (auto/manual), missing-trigger detection | F26 | Case & Docket Context (Platform Core) |
| Event Ingestion & Mapping Module | Docket-event consumption (CM/ECF or manual), configurable category mapping, unmapped-event queue | F27 | CM/ECF Integration Adapter (Platform Core), Exception Queue |
| Candidate Exclusion Engine | Rule-driven candidate exclusion generation from mapped events, linked to triggering event + rule version | F28 | Configuration Engine (Platform Core) |
| Calculation Engine | Elapsed/excluded/remaining time computation, full versioning, "explain this date" segment generation | F29 | Candidate Exclusion Engine, Review & Approval Module |
| Review & Approval Module | Proposed-vs-confirmed state machine for events/exclusions/calculations, override capture | F30 | Audit Service (Platform Core), Work Queue (Platform Core) |
| Threshold Alert Module | Court-configurable threshold evaluation, alert generation, escalation | F31 | Notifications Service (Platform Core), Calculation Engine |
| Version Comparison Module | Version-to-version diff (additions/removals/modifications) | F32 | Calculation Engine |
| Continuance Findings Module | Structural completeness check on continuance records, chambers routing | F33 | Review & Approval Module |
| Multi-Defendant Module | Independent per-defendant clocks, cross-defendant relationship/severance tracking | F34 | Tracker Initialization Module |
| Case Conference View Module | Chambers-oriented summary aggregation + packet export | F35 | Calculation Engine, Continuance Findings Module (read-only) |
| Portfolio Dashboard Module (Pilot hardening) | Personal/court-level risk-indicator dashboards | F36 | Reporting Feed Service (Platform Core) |

### 4.4 Frontend Components (Experience Layer)

All frontend workspaces are built as a single TypeScript/React codebase with per-role entry bundles, sharing a common USWDS-based component library (`@judicialsync/ui-kit`, wrapping `@uswds/uswds` design tokens and `@trussworks/react-uswds` components) so accessibility and visual consistency are enforced by shared components, not per-screen discipline.

| Workspace | Primary Users | Key Characteristics | FRD Features |
|---|---|---|---|
| Judge/Chambers Workspace | Judges, law clerks | Decision/oversight views: case conference view, calculation explain view, review/approval queues, sealing authorization | F08, F11, F29, F30, F33, F35 |
| Clerk Operations Console | Clerks/case administrators | Case/proceeding setup, intake triage, reconciliation, closeout, configuration (if entitled) | F11, F14, F15, F18, F19, F24 |
| Courtroom Deputy Interface | Courtroom deputies | Minimal-step, large-touch-target, keyboard-first real-time logging; offline-tolerant local queue | F11, F17 |
| Administrative Dashboard | Court admins, system admins, security officers | Configuration engine, user/role management, portfolio dashboards, reporting feed, audit explorer | F02, F03, F09, F11, F25, F36, F37, F38 |
| Restricted External Attorney Portal | Authorized external attorneys | Structurally separate auth realm/bundle; structured exhibit metadata submission, read-only deadline visibility | F11, F12 |

**Frontend architecture notes:**

- Each workspace is a separately code-split bundle (not one monolithic SPA shipping all five role experiences to every user) to keep the Courtroom Deputy Interface's payload minimal per the "courtroom speed" NFR.
- The Restricted External Attorney Portal is built and deployed as a **structurally distinct frontend application** (separate build, separate hosting path, separate OIDC client) — not a route guarded by a role flag inside the internal app — directly reflecting the FRD's token-audience separation requirement (F12, Y3).
- All workspaces consume the same generated TypeScript API client (from the OpenAPI contract, §6) so request/response shapes are compile-time checked against the backend contract.

---

## 5. Data Model

JudicialSync uses a single PostgreSQL 15+ cluster, logically partitioned into three schemas — `platform`, `evidentiary`, `speedytrial` — mirroring the three deployable services. All primary keys are UUIDv4 (`gen_random_uuid()`, pgcrypto extension). All persisted timestamps are UTC `timestamptz`; the presentation layer converts to court-local time zone per court profile. No table feeding the audit trail or docket-sourced data permits hard deletes — removal is always a status transition.

**Immutability enforcement (binding, applies to all tables marked "append-only" below):** For `audit_events`, `exhibit_versions`, `calculation_versions`, and `confirmed_exclusions`, the PostgreSQL application role (`app_rw`) is granted `SELECT, INSERT` **only** — no `UPDATE` or `DELETE` grant exists at the database level for these tables. Corrections are modeled as new rows referencing the superseded row (`supersedes_version_id`, `supersedes_confirmed_exclusion_id`), never as in-place edits. A separate, break-glass `app_dba` role retains schema-migration privileges but is not used by the running application and requires its own audited access path.

### 5.1 Entity-Relationship Diagram — Shared Foundation

```
┌───────────┐       ┌─────────────┐       ┌───────────────────┐
│  courts   │──1:N──│  divisions  │──1:N──│       cases        │
└───────────┘       └─────────────┘       └─────────┬─────────┘
                                                      │ 1:N
                     ┌────────────────────────────────┼────────────────────────┐
                     │                                │                        │
                     ▼                                ▼                        ▼
             ┌───────────────┐              ┌──────────────┐          ┌──────────────────┐
             │  proceedings  │──1:N──────────│   parties    │         │  docket_events    │
             └───────┬───────┘              └──────┬───────┘          └──────────────────┘
                     │ 1:N                          │
                     ▼                              │(defendant party →
             ┌───────────────┐                      │ Speedy Trial tracker,
             │   hearings    │                      │ see Y0c)
             └───────────────┘                      │
                                                     ▼
┌──────────┐    ┌───────────┐    ┌──────────────┐  ┌──────────────────────┐
│  users   │─N:M│   roles   │    │ scope_        │  │ security_designations │
│          │via │           │    │ assignments   │  │ (polymorphic: case /  │
└────┬─────┘user_roles└─────┘    └──────────────┘  │  document_reference / │
     │                                              │  exhibit)              │
     │ 1:N                                          └──────────────────────┘
     ▼
┌───────────┐
│ sessions  │
└───────────┘

┌───────────────────────────────────────────────────────────────────┐
│  audit_events (append-only, hash-chained)                          │
│  — polymorphic object_type/object_id linkage to EVERY other table  │
└───────────────────────────────────────────────────────────────────┘

┌─────────────────┐   ┌──────────────────────┐   ┌────────────────────┐
│ court_profiles   │──│ rule_package_versions │──│ workflow_state_defs │
└─────────────────┘   │  (immutable, versioned)│  │ threshold_defs      │
                       └──────────────────────┘   │ event_mapping_defs  │
                                                    └────────────────────┘
```

### 5.2 DDL — Identity (F00)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_idp_subject TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  workspace_preference TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name TEXT NOT NULL UNIQUE, -- judge | law_clerk | courtroom_deputy | clerk_case_admin |
                                   -- attorney_external | jury_admin | court_admin |
                                   -- system_admin | security_officer
  description TEXT
);

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  court_id UUID REFERENCES courts(id),
  division_id UUID REFERENCES divisions(id),
  granted_by UUID NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id, court_id, division_id)
);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_court ON user_roles(court_id);

CREATE TABLE scope_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('court','division','case','proceeding','party_role','security_designation')),
  scope_value UUID, -- nullable for party_role/security_designation enum-type scopes
  scope_enum_value TEXT -- used for party_role/security_designation
);
CREATE INDEX idx_scope_assignments_user ON scope_assignments(user_id);
CREATE INDEX idx_scope_assignments_value ON scope_assignments(scope_value);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  refresh_token_hash TEXT NOT NULL,
  mfa_satisfied BOOLEAN NOT NULL DEFAULT false,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
```

### 5.3 DDL — Case Model (F01)

```sql
CREATE TABLE courts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_name TEXT NOT NULL,
  court_code TEXT NOT NULL UNIQUE
);

CREATE TABLE divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id),
  division_name TEXT NOT NULL,
  UNIQUE (court_id, division_name)
);

CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id),
  division_id UUID NOT NULL REFERENCES divisions(id),
  case_number TEXT NOT NULL,
  case_caption TEXT NOT NULL,
  case_type TEXT NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'manual',
  source_identifier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (division_id, case_number)
);
CREATE INDEX idx_cases_court ON cases(court_id);
CREATE INDEX idx_cases_source ON cases(source_system, source_identifier);

CREATE TABLE proceedings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  proceeding_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  presiding_judge_id UUID REFERENCES users(id)
);
CREATE INDEX idx_proceedings_case ON proceedings(case_id);

CREATE TABLE hearings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceeding_id UUID NOT NULL REFERENCES proceedings(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  held_at TIMESTAMPTZ,
  hearing_type TEXT NOT NULL
);
CREATE INDEX idx_hearings_proceeding ON hearings(proceeding_id);

CREATE TABLE parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  party_name TEXT NOT NULL,
  party_role TEXT NOT NULL CHECK (party_role IN ('defendant','government','plaintiff','counsel','pro_se')),
  external_id TEXT, -- CM/ECF party identifier
  source_system TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX idx_parties_case ON parties(case_id);

CREATE TABLE docket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  source_system TEXT NOT NULL,
  source_identifier TEXT NOT NULL,
  event_code TEXT,
  event_description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  locally_modified BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (source_system, source_identifier)
);
CREATE INDEX idx_docket_events_case ON docket_events(case_id);
CREATE INDEX idx_docket_events_date ON docket_events(event_date);

CREATE TABLE document_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  source_system TEXT NOT NULL,
  source_identifier TEXT,
  document_title TEXT,
  storage_pointer TEXT -- reference to object store / repository location
);
CREATE INDEX idx_document_references_case ON document_references(case_id);

CREATE TABLE security_designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL, -- 'case' | 'document_reference' | 'exhibit'
  object_id UUID NOT NULL,
  designation TEXT NOT NULL CHECK (designation IN ('sealed','restricted','grand_jury','juvenile','pii')),
  applied_by UUID NOT NULL REFERENCES users(id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_security_designations_object ON security_designations(object_type, object_id);
```

### 5.4 DDL — Audit (F02) — Append-Only, Hash-Chained

```sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES users(id),
  action_type TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  before_state JSONB,
  after_state JSONB,
  rule_version_ref UUID,
  calculation_version_ref UUID,
  client_ip TEXT,
  session_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prev_hash TEXT NOT NULL,
  row_hash TEXT NOT NULL
);
CREATE INDEX idx_audit_events_object ON audit_events(object_type, object_id);
CREATE INDEX idx_audit_events_actor ON audit_events(actor_id);
CREATE INDEX idx_audit_events_occurred ON audit_events(occurred_at);

-- Database-level immutability enforcement (binding, not merely application convention):
REVOKE UPDATE, DELETE ON audit_events FROM app_rw;
GRANT SELECT, INSERT ON audit_events TO app_rw;

-- row_hash is computed application-side as sha256(canonical_json(row) || prev_hash)
-- before INSERT; a BEFORE INSERT trigger additionally recomputes and rejects any
-- INSERT whose supplied row_hash does not match, guarding against a compromised
-- application instance forging a hash chain.
```

### 5.5 DDL — Configuration Engine (F03)

```sql
CREATE TABLE court_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id) UNIQUE
);

CREATE TABLE rule_package_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id),
  version_number INTEGER NOT NULL,
  drafted_by UUID NOT NULL REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  effective_from TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  config_snapshot JSONB NOT NULL,
  UNIQUE (court_id, version_number)
);
CREATE INDEX idx_rule_package_versions_court ON rule_package_versions(court_id, effective_from);

CREATE TABLE workflow_state_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_package_version_id UUID NOT NULL REFERENCES rule_package_versions(id),
  object_type TEXT NOT NULL,
  state_name TEXT NOT NULL,
  allowed_transitions TEXT[] NOT NULL DEFAULT '{}',
  required_role TEXT
);
CREATE INDEX idx_workflow_state_defs_version ON workflow_state_defs(rule_package_version_id);

CREATE TABLE threshold_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_package_version_id UUID NOT NULL REFERENCES rule_package_versions(id),
  threshold_type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL
);
CREATE INDEX idx_threshold_defs_version ON threshold_defs(rule_package_version_id);

CREATE TABLE event_mapping_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_package_version_id UUID NOT NULL REFERENCES rule_package_versions(id),
  source_event_code TEXT,
  source_event_description_pattern TEXT,
  internal_category TEXT NOT NULL
);
CREATE INDEX idx_event_mapping_defs_version ON event_mapping_defs(rule_package_version_id);
```

### 5.6 DDL — Notifications (F04)

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  court_id UUID NOT NULL REFERENCES courts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_court ON notifications(court_id);

CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id),
  recipient_user_id UUID NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','failed','acknowledged')),
  sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ
);
CREATE INDEX idx_notification_deliveries_recipient ON notification_deliveries(recipient_user_id, status);

CREATE TABLE notification_recipients_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id),
  notification_type TEXT NOT NULL,
  recipient_role TEXT NOT NULL,
  channel TEXT NOT NULL,
  escalation_cadence_minutes INTEGER
);
CREATE INDEX idx_notification_recipients_court ON notification_recipients_config(court_id, notification_type);
```

### 5.7 DDL — Work Queue (F06) / Exception Queue (F07)

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL,
  owner_role TEXT,
  owner_user_id UUID REFERENCES users(id),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','dismissed')),
  completing_audit_event_id UUID REFERENCES audit_events(id),
  dismissal_rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_tasks_owner_role ON tasks(owner_role, status);
CREATE INDEX idx_tasks_owner_user ON tasks(owner_user_id, status);
CREATE INDEX idx_tasks_object ON tasks(object_type, object_id);

CREATE TABLE exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  detail JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','escalated')),
  resolution_action TEXT,
  rationale TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_exceptions_status_severity ON exceptions(status, severity);
CREATE INDEX idx_exceptions_object ON exceptions(object_type, object_id);
```

### 5.8 Search Index (F05)

```sql
CREATE MATERIALIZED VIEW search_index AS
  SELECT 'exhibit' AS object_type, id AS object_id, description AS summary,
         court_id, case_id, security_designation_tags, updated_at
  FROM exhibits
  UNION ALL
  SELECT 'defendant_tracker', id, NULL, court_id, case_id, '{}', updated_at
  FROM defendant_trackers
  UNION ALL
  SELECT 'docket_event', id, event_description, NULL, case_id, '{}', event_date
  FROM docket_events;
-- Materialized view is refreshed incrementally via logical-replication-driven
-- triggers on source tables; in production this backs an OpenSearch index
-- (see §7 Technology Stack) rather than being queried directly, since access
-- scoping must occur as a mandatory pre-filter at the search-engine query layer,
-- not a Postgres-side post-filter.
```

### 5.9 DDL — CM/ECF Integration (F10) / External Portal (F12) / Security & Retention (F13)

```sql
CREATE TABLE sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  cmecf_value TEXT,
  local_value TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_value TEXT,
  resolved_source TEXT CHECK (resolved_source IN ('CM/ECF','manual_override'))
);
CREATE INDEX idx_sync_conflicts_object ON sync_conflicts(object_type, object_id);

CREATE TABLE adapter_health_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_successful_sync_at TIMESTAMPTZ,
  error_count INTEGER NOT NULL DEFAULT 0,
  backlog_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE external_principals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_idp_subject TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bar_number TEXT
);

CREATE TABLE file_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_pointer TEXT NOT NULL,
  file_type TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  declared_purpose TEXT NOT NULL,
  scan_status TEXT NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','rejected'))
);
CREATE INDEX idx_file_references_scan_status ON file_references(scan_status);

CREATE TABLE malware_scan_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_reference_id UUID NOT NULL REFERENCES file_references(id),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result TEXT NOT NULL CHECK (result IN ('clean','infected','error'))
);

CREATE TABLE security_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_package_version_id UUID NOT NULL REFERENCES rule_package_versions(id),
  designation TEXT NOT NULL,
  required_entitlement TEXT NOT NULL
);

CREATE TABLE retention_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id),
  record_category TEXT NOT NULL,
  retention_period_days INTEGER NOT NULL,
  disposition_action TEXT NOT NULL
);

CREATE TABLE disposition_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  disposition_action TEXT NOT NULL,
  confirmed_by UUID NOT NULL REFERENCES users(id),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_disposition_log_object ON disposition_log(object_type, object_id);
```

### 5.10 DDL — National Governance (F37, Scale) / Advanced Analytics (F38, Scale)

```sql
CREATE TABLE national_baseline_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name TEXT NOT NULL UNIQUE,
  default_value JSONB NOT NULL,
  court_overridable BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE governance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id),
  requested_field TEXT NOT NULL,
  requested_value JSONB NOT NULL,
  rationale TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  decided_by UUID REFERENCES users(id)
);

CREATE TABLE analytics_trend_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id),
  metric_category TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  aggregate_value NUMERIC NOT NULL
);
CREATE INDEX idx_analytics_snapshots_court ON analytics_trend_snapshots(court_id, period_start);
```

---

### 5.11 Entity-Relationship Diagram — Evidentiary Tracking

```
┌──────────────────────────┐
│ exhibit_tracking_contexts │ (one per proceeding; activates numbering scheme)
└────────────┬──────────────┘
             │
             ▼
┌───────────────────────────┐        ┌────────────────────┐
│ exhibit_intake_submissions │──────▶│     exhibits        │◄──── exhibit_type_catalog
│ (proposed → accepted)      │ 1:1   │  (current-state row) │      (court-configurable types)
└───────────────────────────┘ accept └──────────┬──────────┘
                                                 │ 1:N (append-only)
                                                 ▼
                                      ┌─────────────────────┐
                                      │  exhibit_versions    │  (immutable history;
                                      │  (every status       │   audit_event_id required)
                                      │   transition)        │
                                      └─────────────────────┘

┌─────────────────────┐     ┌──────────────────────┐
│ courtroom_sessions   │────▶│ session_log_entries   │ (offer/objection/ruling/
│ (per-proceeding)     │ 1:N │ (references exhibits)  │  withdraw/substitute)
└─────────────────────┘     └──────────────────────┘

┌─────────────────────┐     ┌────────────────────────────┐
│ reconciliation_runs  │────▶│ reconciliation_discrepancies │ (per-exhibit conflicts)
└─────────────────────┘ 1:N └────────────────────────────┘

┌─────────────────┐          ┌──────────────────────┐
│ exhibit_exports  │          │  custody_transfers     │──────▶ storage_locations
│ (basic closeout) │          │ (transferor/recipient)│
└─────────────────┘          └──────────────────────┘

┌──────────────────────┐     ┌─────────────────┐     ┌────────────────────────┐
│ exhibit_designations   │    │  jury_packages   │────▶│  jury_package_items     │
│ (seal/release, judge-  │    │  (per-proceeding, │ 1:N │  (admitted-only items)  │
│  authorized)           │    │   versioned)      │    └────────────────────────┘
└──────────────────────┘     └────────┬─────────┘
                                       │ 1:N
                                       ▼
                             ┌────────────────────────┐
                             │ jury_package_access_log  │
                             └────────────────────────┘

┌─────────────────────┐     ┌────────────────────┐     ┌─────────────────────────┐
│ closeout_packages     │────▶│ disposition_records  │────▶│ disposition_receipts     │
│ (links reconciliation)│ 1:N │                      │ 1:N │                          │
└─────────────────────┘     └────────────────────┘     └─────────────────────────┘

┌─────────────────────────┐     ┌──────────────────────────────┐
│ exhibit_config_templates  │────▶│ exhibit_config_template_versions│
└─────────────────────────┘ 1:N └──────────────────────────────┘

┌────────────────────────────┐     ┌──────────────────────────┐
│ registered_display_endpoints │────▶│ courtroom_display_sessions │
└────────────────────────────┘ 1:N └──────────────────────────┘
```

### 5.12 DDL — Case Setup (F14)

```sql
CREATE TABLE exhibit_tracking_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  proceeding_id UUID NOT NULL REFERENCES proceedings(id),
  numbering_scheme_id UUID NOT NULL,
  activated_by UUID NOT NULL REFERENCES users(id),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proceeding_id)
);
```

### 5.13 DDL — Pretrial Intake (F15)

```sql
CREATE TABLE exhibit_intake_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceeding_id UUID NOT NULL REFERENCES proceedings(id),
  description TEXT NOT NULL,
  offering_party_id UUID NOT NULL REFERENCES parties(id),
  exhibit_type TEXT NOT NULL,
  proposed_number TEXT,
  file_reference_id UUID REFERENCES file_references(id),
  submitted_via TEXT NOT NULL DEFAULT 'internal' CHECK (submitted_via IN ('internal','external_portal')),
  submitted_by UUID REFERENCES users(id),
  external_submitter_id UUID REFERENCES external_principals(id),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','in_review','accepted','rejected','correction_requested')),
  deficiency_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_intake_proceeding_status ON exhibit_intake_submissions(proceeding_id, status);
```

### 5.14 DDL — Exhibit Ledger (F16, F23) — Append-Only Version History

```sql
CREATE TABLE exhibit_type_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id),
  type_code TEXT NOT NULL, -- file_reference | physical | demonstrative | contraband | special_storage | court-specific extension
  required_fields JSONB NOT NULL DEFAULT '[]',
  UNIQUE (court_id, type_code)
);

CREATE TABLE exhibits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceeding_id UUID NOT NULL REFERENCES proceedings(id),
  exhibit_number TEXT NOT NULL,
  description TEXT NOT NULL,
  offering_party_id UUID NOT NULL REFERENCES parties(id),
  exhibit_type TEXT NOT NULL,
  current_status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (current_status IN ('proposed','offered','admitted','rejected','withdrawn','substituted','sealed','returned')),
  confidentiality TEXT,
  current_location TEXT,
  current_custodian_id UUID,
  intake_submission_id UUID REFERENCES exhibit_intake_submissions(id),
  security_designation_tags TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proceeding_id, exhibit_number)
);
CREATE INDEX idx_exhibits_proceeding ON exhibits(proceeding_id);
CREATE INDEX idx_exhibits_status ON exhibits(current_status);
CREATE INDEX idx_exhibits_offering_party ON exhibits(offering_party_id);

CREATE TABLE exhibit_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exhibit_id UUID NOT NULL REFERENCES exhibits(id),
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  ruling_actor_id UUID REFERENCES users(id),
  notes TEXT,
  recorded_by UUID NOT NULL REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  audit_event_id UUID NOT NULL REFERENCES audit_events(id),
  UNIQUE (exhibit_id, version_number)
);
CREATE INDEX idx_exhibit_versions_exhibit ON exhibit_versions(exhibit_id);

-- Database-level immutability enforcement:
REVOKE UPDATE, DELETE ON exhibit_versions FROM app_rw;
GRANT SELECT, INSERT ON exhibit_versions TO app_rw;
```

### 5.15 DDL — Courtroom Logging (F17)

```sql
CREATE TABLE courtroom_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceeding_id UUID NOT NULL REFERENCES proceedings(id),
  opened_by UUID NOT NULL REFERENCES users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))
);
CREATE INDEX idx_courtroom_sessions_proceeding ON courtroom_sessions(proceeding_id);

CREATE TABLE session_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES courtroom_sessions(id),
  exhibit_id UUID NOT NULL REFERENCES exhibits(id),
  action TEXT NOT NULL CHECK (action IN ('offer','objection','ruling','withdraw','substitute')),
  objection_category TEXT,
  ruling_outcome TEXT CHECK (ruling_outcome IN ('admit','reject')),
  presiding_judge_id UUID REFERENCES users(id),
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_from_offline BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_session_log_entries_session ON session_log_entries(session_id);
CREATE INDEX idx_session_log_entries_exhibit ON session_log_entries(exhibit_id);
```

### 5.16 DDL — Reconciliation (F18)

```sql
CREATE TABLE reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceeding_id UUID NOT NULL REFERENCES proceedings(id),
  checkpoint_type TEXT NOT NULL CHECK (checkpoint_type IN ('recess','day_end','trial_close','on_demand')),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','complete','partial')),
  triggered_by UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  override_rationale TEXT
);
CREATE INDEX idx_reconciliation_runs_proceeding ON reconciliation_runs(proceeding_id);

CREATE TABLE reconciliation_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_run_id UUID NOT NULL REFERENCES reconciliation_runs(id),
  exhibit_id UUID NOT NULL REFERENCES exhibits(id),
  conflicting_values JSONB NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  resolved_value TEXT,
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved'))
);
CREATE INDEX idx_reconciliation_discrepancies_run ON reconciliation_discrepancies(reconciliation_run_id);
```

### 5.17 DDL — Basic Closeout (F19) / Custody (F20)

```sql
CREATE TABLE exhibit_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceeding_id UUID NOT NULL REFERENCES proceedings(id),
  status_filter TEXT[] NOT NULL,
  snapshot_version_refs JSONB NOT NULL, -- {exhibit_id: exhibit_version_id, ...}
  certified_by UUID REFERENCES users(id),
  certified_at TIMESTAMPTZ
);

CREATE TABLE storage_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id),
  location_name TEXT NOT NULL,
  location_type TEXT NOT NULL
);

CREATE TABLE custody_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exhibit_id UUID NOT NULL REFERENCES exhibits(id),
  transferor_id UUID NOT NULL REFERENCES users(id),
  recipient_custodian_id UUID NOT NULL,
  purpose TEXT NOT NULL,
  location TEXT NOT NULL,
  condition_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','disputed')),
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id)
);
CREATE INDEX idx_custody_transfers_exhibit ON custody_transfers(exhibit_id);
CREATE INDEX idx_custody_transfers_status ON custody_transfers(status) WHERE status = 'pending';
```

### 5.18 DDL — Sealing (F21) / Jury Package (F22)

```sql
CREATE TABLE exhibit_designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exhibit_id UUID NOT NULL REFERENCES exhibits(id),
  designation_category TEXT NOT NULL CHECK (designation_category IN ('sealed','restricted','grand_jury','juvenile')),
  authorizing_judge_id UUID NOT NULL REFERENCES users(id),
  permitted_entitlement_scope JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  release_authorizing_judge_id UUID REFERENCES users(id),
  release_reason TEXT
);
CREATE INDEX idx_exhibit_designations_exhibit ON exhibit_designations(exhibit_id);

CREATE TABLE jury_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceeding_id UUID NOT NULL REFERENCES proceedings(id),
  authorizing_judge_id UUID NOT NULL REFERENCES users(id),
  version_number INTEGER NOT NULL,
  session_window_start TIMESTAMPTZ NOT NULL,
  session_window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jury_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jury_package_id UUID NOT NULL REFERENCES jury_packages(id),
  exhibit_id UUID NOT NULL REFERENCES exhibits(id)
);
CREATE INDEX idx_jury_package_items_package ON jury_package_items(jury_package_id);

CREATE TABLE jury_package_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jury_package_id UUID NOT NULL REFERENCES jury_packages(id),
  accessed_by UUID REFERENCES users(id),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL -- open | view_exhibit | session_end
);
CREATE INDEX idx_jury_package_access_log_package ON jury_package_access_log(jury_package_id);
```

### 5.19 DDL — Post-Trial Closeout (F24)

```sql
CREATE TABLE closeout_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceeding_id UUID NOT NULL REFERENCES proceedings(id),
  reconciliation_run_id UUID NOT NULL REFERENCES reconciliation_runs(id),
  certified_by UUID REFERENCES users(id),
  certified_at TIMESTAMPTZ,
  package_snapshot JSONB NOT NULL
);

CREATE TABLE disposition_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closeout_package_id UUID NOT NULL REFERENCES closeout_packages(id),
  exhibit_id UUID NOT NULL REFERENCES exhibits(id),
  disposition_action TEXT NOT NULL CHECK (disposition_action IN ('return','retain','transfer','destroy_scheduled')),
  executing_custodian_id UUID,
  executed_at TIMESTAMPTZ
);
CREATE INDEX idx_disposition_records_package ON disposition_records(closeout_package_id);

CREATE TABLE disposition_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disposition_record_id UUID NOT NULL REFERENCES disposition_records(id),
  receipt_document_ref UUID REFERENCES document_references(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.20 DDL — Portfolio & Templates (F25, Scale) / Courtroom Technology (F39, Scale)

```sql
CREATE TABLE exhibit_config_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL,
  source_court_id UUID NOT NULL REFERENCES courts(id)
);

CREATE TABLE exhibit_config_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES exhibit_config_templates(id),
  version_number INTEGER NOT NULL,
  config_snapshot JSONB NOT NULL,
  published_by UUID NOT NULL REFERENCES users(id),
  UNIQUE (template_id, version_number)
);

CREATE TABLE registered_display_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id),
  endpoint_name TEXT NOT NULL,
  integration_credential_hash TEXT NOT NULL
);

CREATE TABLE courtroom_display_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceeding_id UUID NOT NULL REFERENCES proceedings(id),
  endpoint_id UUID NOT NULL REFERENCES registered_display_endpoints(id),
  exhibit_id UUID REFERENCES exhibits(id),
  jury_package_id UUID REFERENCES jury_packages(id),
  authorized_by UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX idx_courtroom_display_sessions_proceeding ON courtroom_display_sessions(proceeding_id);
```

---

### 5.21 Entity-Relationship Diagram — Speedy Trial Tracker

```
┌──────────────────────┐
│  defendant_trackers    │ (one per case+defendant; proposed → confirmed → closed)
│  current_calculation_  │────────────────────────────────┐
│  version_id (FK added  │                                 │
│  after calc_versions)  │                                 │
└──────────┬────────────┘                                 │
           │ 1:N                                            │
           ▼                                                 ▼
┌──────────────────────┐                          ┌──────────────────────────┐
│ speedy_trial_events    │                          │  calculation_versions      │
│ (unmapped → mapped,    │                          │  (append-only, versioned;  │
│  source_identifier     │                          │   supersedes_version_id    │
│  unique)               │                          │   chain — NEVER overwritten)│
└──────────────────────┘                          └────────────┬───────────────┘
           │                                                     │ 1:N
           ▼                                                     ▼
┌──────────────────────┐                          ┌──────────────────────────┐
│ candidate_exclusions   │─────────────────────────▶│  timeline_segments         │
│ (state: candidate →    │  review produces          │  (included/excluded,       │
│  reviewed)             │  confirmed_exclusions     │   rule_version_ref,        │
└──────────────────────┘                          │   reviewer, reason)        │
           │                                       └──────────────────────────┘
           ▼
┌──────────────────────┐          ┌──────────────────────┐
│ confirmed_exclusions   │◄─────────│   review_actions       │ (accept/modify/
│ (append-only;          │          │  (polymorphic: tracker  │  reject/override on
│  supersedes_confirmed_  │          │   start / candidate     │  any reviewable object)
│  exclusion_id chain)    │          │   exclusion / calc ver.)│
└──────────────────────┘          └──────────────────────┘

┌──────────────────────┐          ┌──────────────────────┐
│  threshold_alerts       │─────────▶│  alert_escalations     │
│ (linked to calc_version)│         └──────────────────────┘
└──────────────────────┘

┌──────────────────────────┐
│  continuance_records       │ (completeness check; links candidate/confirmed exclusion
│                             │  + order_document_ref)
└──────────────────────────┘

┌──────────────────────────┐     ┌──────────────────────┐
│ codefendant_relationships  │     │  severance_events       │
│ (joint ↔ severed)          │     │  (confirmed, audited)  │
└──────────────────────────┘     └──────────────────────┘
```

### 5.22 DDL — Tracker Initialization (F26)

```sql
CREATE TABLE defendant_trackers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  defendant_party_id UUID NOT NULL REFERENCES parties(id),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','closed')),
  trigger_event_id UUID, -- references speedy_trial_events(id) once ingested
  trigger_event_type TEXT,
  trigger_date DATE,
  confirming_user_id UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  current_calculation_version_id UUID, -- FK added after calculation_versions defined (§5.24)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, defendant_party_id)
);
CREATE INDEX idx_defendant_trackers_case ON defendant_trackers(case_id);
CREATE INDEX idx_defendant_trackers_status ON defendant_trackers(status);
```

### 5.23 DDL — Event Ingestion & Mapping (F27)

```sql
CREATE TABLE speedy_trial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  defendant_party_id UUID REFERENCES parties(id),
  source_system TEXT NOT NULL DEFAULT 'manual',
  source_identifier TEXT NOT NULL,
  source_code TEXT,
  source_description TEXT,
  event_date DATE NOT NULL,
  event_category TEXT, -- NULL until mapped
  mapping_status TEXT NOT NULL DEFAULT 'unmapped' CHECK (mapping_status IN ('unmapped','mapped')),
  entered_by UUID REFERENCES users(id),
  UNIQUE (source_system, source_identifier)
);
CREATE INDEX idx_speedy_trial_events_case ON speedy_trial_events(case_id);
CREATE INDEX idx_speedy_trial_events_unmapped ON speedy_trial_events(mapping_status) WHERE mapping_status = 'unmapped';

CREATE TABLE event_category_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_package_version_id UUID NOT NULL REFERENCES rule_package_versions(id),
  source_code_pattern TEXT NOT NULL,
  event_category TEXT NOT NULL
);
CREATE INDEX idx_event_category_mappings_version ON event_category_mappings(rule_package_version_id);
```

### 5.24 DDL — Candidate Exclusion Engine (F28) / Review & Approval (F30)

```sql
CREATE TABLE candidate_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id UUID NOT NULL REFERENCES defendant_trackers(id),
  exclusion_category TEXT NOT NULL,
  proposed_start DATE NOT NULL,
  proposed_end DATE, -- nullable, open-ended pending disposing event
  triggering_event_refs UUID[] NOT NULL,
  rule_version_ref UUID NOT NULL REFERENCES rule_package_versions(id),
  joint_event_group_id UUID, -- links sibling candidates across co-defendants (F34)
  state TEXT NOT NULL DEFAULT 'candidate' CHECK (state IN ('candidate','reviewed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_candidate_exclusions_tracker ON candidate_exclusions(tracker_id, state);

CREATE TABLE confirmed_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id UUID NOT NULL REFERENCES defendant_trackers(id),
  candidate_exclusion_id UUID REFERENCES candidate_exclusions(id),
  exclusion_category TEXT NOT NULL,
  confirmed_start DATE NOT NULL,
  confirmed_end DATE,
  is_override BOOLEAN NOT NULL DEFAULT false,
  supersedes_confirmed_exclusion_id UUID REFERENCES confirmed_exclusions(id),
  rationale TEXT,
  reviewing_user_id UUID NOT NULL REFERENCES users(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  audit_event_id UUID NOT NULL REFERENCES audit_events(id)
);
CREATE INDEX idx_confirmed_exclusions_tracker ON confirmed_exclusions(tracker_id);

-- Database-level immutability enforcement — corrections MUST create a new row
-- with supersedes_confirmed_exclusion_id set, never an UPDATE of an existing row:
REVOKE UPDATE, DELETE ON confirmed_exclusions FROM app_rw;
GRANT SELECT, INSERT ON confirmed_exclusions TO app_rw;

CREATE TABLE review_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewable_object_type TEXT NOT NULL, -- 'candidate_exclusion' | 'tracker_start_context' | 'calculation_version'
  reviewable_object_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('accept','modify','reject','override')),
  modified_value JSONB,
  rationale TEXT,
  reviewing_user_id UUID NOT NULL REFERENCES users(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_actions_object ON review_actions(reviewable_object_type, reviewable_object_id);
```

### 5.25 DDL — Versioned Clock Calculation & Explainability (F29) — Core Immutability Design

This is the system's most compliance-sensitive table set: every Speedy Trial date displayed to a judge, clerk, or attorney must be traceable back to the exact confirmed events, exclusions, and rule package in effect when it was computed — **and a later recalculation must never silently replace that trail.**

```sql
CREATE TABLE calculation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id UUID NOT NULL REFERENCES defendant_trackers(id),
  version_number INTEGER NOT NULL,
  calculation_date DATE NOT NULL,
  elapsed_includable_time INTEGER NOT NULL, -- days
  total_excluded_time INTEGER NOT NULL,
  remaining_time INTEGER NOT NULL,
  status_indicator TEXT NOT NULL, -- within_limit | approaching_threshold | limit_reached (decision-support label only)
  rule_version_ref UUID NOT NULL REFERENCES rule_package_versions(id),
  triggering_reason TEXT NOT NULL CHECK (triggering_reason IN ('scheduled','event_driven','manual','override')),
  is_override BOOLEAN NOT NULL DEFAULT false,
  supersedes_version_id UUID REFERENCES calculation_versions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tracker_id, version_number)
);
CREATE INDEX idx_calculation_versions_tracker ON calculation_versions(tracker_id, version_number DESC);

-- Database-level immutability enforcement (binding — no application code path,
-- including a privileged system_admin action, may UPDATE or DELETE a published
-- calculation version; a recalculation always INSERTs a new row with
-- version_number = max(version_number)+1 and supersedes_version_id set):
REVOKE UPDATE, DELETE ON calculation_versions FROM app_rw;
GRANT SELECT, INSERT ON calculation_versions TO app_rw;

CREATE TABLE timeline_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_version_id UUID NOT NULL REFERENCES calculation_versions(id),
  segment_type TEXT NOT NULL CHECK (segment_type IN ('included','excluded')),
  start_date DATE NOT NULL,
  end_date DATE,
  confirmed_exclusion_id UUID REFERENCES confirmed_exclusions(id), -- required when segment_type = 'excluded'
  rule_version_ref UUID NOT NULL REFERENCES rule_package_versions(id),
  reviewer_id UUID REFERENCES users(id),
  reason TEXT
);
CREATE INDEX idx_timeline_segments_version ON timeline_segments(calculation_version_id);

ALTER TABLE defendant_trackers
  ADD CONSTRAINT fk_current_calc_version
  FOREIGN KEY (current_calculation_version_id) REFERENCES calculation_versions(id);
```

**Immutability/explainability design notes:**

- `calculation_versions` is append-only at the grant level (see REVOKE above), identical in enforcement pattern to `audit_events`, `exhibit_versions`, and `confirmed_exclusions`. A recalculation is structurally a new row, never a row mutation.
- `supersedes_version_id` forms a linked list back through every prior calculation for a tracker; the "explain this date" API (`GET /calculation-versions/{id}/explain`, §6.3) walks `timeline_segments` for the requested version, each segment resolving to its `confirmed_exclusion_id` (if excluded) and `rule_version_ref`, giving a fully reconstructable chain: **displayed number → timeline segments → confirmed exclusions → candidate exclusions → triggering events → rule package version → reviewing user**.
- `is_override = true` combined with `triggering_reason = 'override'` flags a version created via explicit human override (F30) rather than routine recalculation; the override's `review_actions` row (linked via the reviewable-object pattern) carries the mandatory rationale.
- No scheduled job, batch process, or cron task holds `INSERT` privilege on `calculation_versions` with `triggering_reason` values other than `'scheduled'` — the distinction between a system-scheduled recalculation and a human-initiated one is itself part of the audit record, not inferred after the fact.

### 5.26 DDL — Threshold Alerts & Escalation (F31)

```sql
CREATE TABLE threshold_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id UUID NOT NULL REFERENCES defendant_trackers(id),
  calculation_version_id UUID NOT NULL REFERENCES calculation_versions(id),
  tier_name TEXT NOT NULL,
  severity TEXT NOT NULL,
  notification_id UUID REFERENCES notifications(id),
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_threshold_alerts_tracker ON threshold_alerts(tracker_id);
CREATE INDEX idx_threshold_alerts_unacked ON threshold_alerts(acknowledged_at) WHERE acknowledged_at IS NULL;

CREATE TABLE alert_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threshold_alert_id UUID NOT NULL REFERENCES threshold_alerts(id),
  escalated_to_role TEXT NOT NULL,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.27 DDL — Continuance Findings Check (F33)

```sql
CREATE TABLE continuance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id UUID NOT NULL REFERENCES defendant_trackers(id),
  candidate_exclusion_id UUID REFERENCES candidate_exclusions(id),
  confirmed_exclusion_id UUID REFERENCES confirmed_exclusions(id),
  structured_findings_ref UUID,
  order_document_ref UUID REFERENCES document_references(id),
  completeness_status TEXT NOT NULL DEFAULT 'incomplete' CHECK (completeness_status IN ('complete','incomplete')),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_continuance_records_tracker ON continuance_records(tracker_id);
CREATE INDEX idx_continuance_records_incomplete ON continuance_records(completeness_status) WHERE completeness_status = 'incomplete';
```

### 5.28 DDL — Multi-Defendant Separation (F34)

```sql
CREATE TABLE codefendant_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  tracker_ids UUID[] NOT NULL,
  relationship_status TEXT NOT NULL DEFAULT 'joint' CHECK (relationship_status IN ('joint','severed'))
);
CREATE INDEX idx_codefendant_relationships_case ON codefendant_relationships(case_id);

CREATE TABLE severance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  severed_defendant_tracker_ids UUID[] NOT NULL,
  severance_date DATE NOT NULL,
  confirmed_by UUID NOT NULL REFERENCES users(id),
  audit_event_id UUID NOT NULL REFERENCES audit_events(id)
);
```

### 5.29 Case Conference View (F35) / Portfolio Dashboard (F36)

Both are **read-only aggregation views** with no dedicated writable tables — they query across `defendant_trackers`, `calculation_versions`, `candidate_exclusions`, `confirmed_exclusions`, `continuance_records`, `exceptions`, and `threshold_alerts` defined above. Implemented as PostgreSQL views (not materialized, given the need for real-time accuracy in chambers-facing summaries) with ABAC predicates applied identically to the search-index pattern (§5.8).

```sql
CREATE VIEW v_tracker_conference_summary AS
  SELECT
    dt.id AS tracker_id,
    dt.case_id,
    dt.status,
    cv.remaining_time,
    cv.status_indicator,
    cv.calculation_date,
    (SELECT count(*) FROM candidate_exclusions ce WHERE ce.tracker_id = dt.id AND ce.state = 'candidate') AS pending_exclusion_reviews,
    (SELECT count(*) FROM continuance_records cr WHERE cr.tracker_id = dt.id AND cr.completeness_status = 'incomplete') AS incomplete_continuances
  FROM defendant_trackers dt
  LEFT JOIN calculation_versions cv ON cv.id = dt.current_calculation_version_id;
```

---

## 6. API Design

JudicialSync exposes a single versioned REST API (`/api/v1`) generated from an OpenAPI 3.1 contract, with a structurally separate contract/audience for the External Attorney Portal (`/portal/v1`). All request/response bodies are validated server-side against JSON Schema derived from the same OpenAPI contract consumed to generate the frontend TypeScript client — the backend and frontend never drift because both are generated from one source of truth.

**Cross-cutting API conventions (apply to every endpoint below unless noted):**
- Every request requires a valid bearer session token (F00) except the login/refresh flow itself.
- Every mutating request is evaluated against the Policy Decision Point (ABAC) before the handler executes; a denial returns `403`, or `404` for existence-hiding contexts (sealed/restricted records per FRD Y2 principle 3).
- Every mutating request that touches a legally significant object emits an audit event (F02) transactionally with the domain write (fail-closed: if the audit write fails, the domain write rolls back).
- Error responses follow the shape `{error_code, message, detail?}` per the FRD Y2 catalog; see §6.6 for the shared error envelope type.

### 6.1 Identity & Access (F00)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/auth/login` | `{identity_assertion}` | `{session_token, refresh_token, entitlements}` | IdP-assertion exchange |
| POST | `/auth/mfa-challenge` | `{mfa_challenge_response}` | `{session_token}` | Conditional second step |
| POST | `/auth/refresh` | `{refresh_token}` | `{session_token}` | Rotates refresh token |
| POST | `/auth/logout` | — | `204` | Revokes session |
| GET | `/auth/entitlements` | — | `{roles[], scopes[]}` | Current user's computed entitlements |

```typescript
interface LoginRequest {
  identity_assertion: string; // SAML response or OIDC id_token
}

interface LoginResponse {
  session_token: string;      // short-lived JWT
  refresh_token: string;      // rotation-enabled, long-lived
  entitlements: Entitlements; // for UI gating only — server re-validates on every call
}

interface Entitlements {
  user_id: string;
  roles: RoleAssignment[];
  scopes: ScopeAttribute[];
  mfa_satisfied: boolean;
}

interface RoleAssignment {
  role_name:
    | "judge" | "law_clerk" | "courtroom_deputy" | "clerk_case_admin"
    | "attorney_external" | "jury_admin" | "court_admin"
    | "system_admin" | "security_officer";
  court_id?: string;
  division_id?: string;
}

interface ScopeAttribute {
  scope_type: "court" | "division" | "case" | "proceeding" | "party_role" | "security_designation";
  scope_value?: string;        // UUID, when applicable
  scope_enum_value?: string;   // for party_role / security_designation
}
```

### 6.2 Case & Docket Model (F01)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/cases` | `{case_number, court_id, division_id, case_caption, case_type, party[]}` | `201 {case}` | Manual creation fallback |
| GET | `/cases/{id}` | — | `{case}` | — |
| GET | `/cases/{id}/proceedings` | — | `{proceedings[]}` | — |
| POST | `/cases/{id}/proceedings` | `{proceeding_type}` | `201 {proceeding}` | — |
| GET | `/cases/{id}/parties` | — | `{parties[]}` | — |
| GET | `/cases/{id}/docket-events` | query: date range, category | `{docket_events[]}` | — |
| PATCH | `/cases/{id}/security-designations` | `{designations[]}` | `200` | Requires `case_security_admin` |

```typescript
interface Case {
  id: string;
  court_id: string;
  division_id: string;
  case_number: string;
  case_caption: string;
  case_type: string;
  source_system: string;
  source_identifier?: string;
  created_at: string; // ISO-8601 UTC
}

interface CreateCaseRequest {
  case_number: string;
  court_id: string;
  division_id: string;
  case_caption: string;
  case_type: string;
  party: Array<{ name: string; role: PartyRole; external_id?: string }>;
}

type PartyRole = "defendant" | "government" | "plaintiff" | "counsel" | "pro_se";

interface Proceeding {
  id: string;
  case_id: string;
  proceeding_type: string;
  status: "open" | "closed";
  presiding_judge_id?: string;
}

interface DocketEvent {
  id: string;
  case_id: string;
  source_system: string;
  source_identifier: string;
  event_code?: string;
  event_description?: string;
  event_date: string;
  locally_modified: boolean;
}

interface SecurityDesignation {
  object_type: "case" | "document_reference" | "exhibit";
  object_id: string;
  designation: "sealed" | "restricted" | "grand_jury" | "juvenile" | "pii";
  applied_by: string;
  applied_at: string;
}
```

### 6.3 Audit (F02)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/audit/events` | (internal service-to-service only) | `201` | Not user-invokable |
| GET | `/audit/explorer` | query: `case_id, user_id, date_range, object_type` | `{audit_events[]}` | Requires `audit_reader` entitlement |

```typescript
interface AuditEvent {
  id: string;
  actor_id: string;
  action_type:
    | "status_change" | "ruling" | "custody_transfer" | "calculation_override"
    | "approval" | "designation_change" | "config_change" | "access_attempt";
  object_type: string;
  object_id: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  rule_version_ref?: string;
  calculation_version_ref?: string;
  client_ip?: string;
  session_id?: string;
  occurred_at: string;
  prev_hash: string;
  row_hash: string; // sha256(canonical_json(row_without_hash) + prev_hash)
}

interface AuditExplorerQuery {
  case_id?: string;
  user_id?: string;
  date_from?: string;
  date_to?: string;
  object_type?: string;
}
```

### 6.4 Configuration (F03)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/config/court-profiles/{court_id}` | — | `{court_profile}` | — |
| POST | `/config/rule-packages` | `{numbering_scheme, workflow_states[], thresholds[], event_mappings[]}` | `201 {rule_package_version (draft)}` | — |
| POST | `/config/rule-packages/{id}/publish` | `{approving_user_id}` | `200` | Maker-checker: approver ≠ drafter |
| GET | `/config/rule-packages/{court_id}/effective` | — | `{rule_package_version}` | Currently effective version |

```typescript
interface RulePackageVersion {
  id: string;
  court_id: string;
  version_number: number;
  drafted_by: string;
  approved_by?: string;
  effective_from?: string;
  published_at?: string;
  config_snapshot: RulePackageConfig;
}

interface RulePackageConfig {
  numbering_scheme: { prefix_pattern: string; sequence_reset_rule: string };
  workflow_states: WorkflowStateDef[];
  thresholds: ThresholdDef[];
  event_mappings: EventMappingDef[];
}

interface WorkflowStateDef {
  object_type: string;
  state_name: string;
  allowed_transitions: string[];
  required_role?: string;
}

interface ThresholdDef {
  threshold_type: string;
  value: number;
  unit: string;
}

interface EventMappingDef {
  source_event_code?: string;
  source_event_description_pattern?: string;
  internal_category: string;
}
```

### 6.5 Notifications (F04) / Search (F05)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/notifications` | `{recipient_role\|recipient_user_id, notification_type, severity, object_reference, court_id}` | `201` | Internal trigger |
| GET | `/notifications/my` | — | `{notifications[]}` | User's inbox |
| POST | `/notifications/{id}/acknowledge` | — | `200` | — |
| GET | `/search` | query: `query_text, identifier, party_name, witness_name, status, date_from, date_to, proceeding_id` | `{results[]}` | Access-scoped pre-filtered |

```typescript
interface NotificationTrigger {
  recipient_role?: string;
  recipient_user_id?: string;
  notification_type:
    | "exception_raised" | "reconciliation_discrepancy" | "custody_unacknowledged"
    | "threshold_crossed" | "approval_needed" | "config_changed";
  severity: "info" | "warning" | "critical";
  object_reference: { object_type: string; object_id: string };
  court_id: string;
}

interface SearchResult {
  object_type: "exhibit" | "defendant_tracker" | "docket_event";
  object_id: string;
  summary_snippet?: string;
  deep_link: string;
  last_updated: string;
}
```

### 6.6 Work Queue (F06) / Exception Queue (F07) / Shared Error Envelope

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/tasks` | `{task_type, owner_role\|owner_user_id, object_reference, priority}` | `201` | Internal trigger |
| GET | `/tasks/my-queue` | query: filters | `{tasks[]}` | Role-scoped |
| POST | `/tasks/{id}/complete` | `{completing_audit_event_id}` | `200` | — |
| POST | `/tasks/{id}/dismiss` | `{rationale}` | `200` | Rationale required for legally significant tasks |
| GET | `/exceptions` | query: `module, type, severity, age` | `{exceptions[]}` | — |
| POST | `/exceptions/{id}/resolve` | `{resolution_action, rationale}` | `200` | Rationale min-length enforced |

```typescript
interface Task {
  id: string;
  task_type:
    | "exception_resolution" | "exclusion_review" | "approval_request"
    | "custody_acknowledgment" | "continuance_findings_review" | "config_approval";
  owner_role?: string;
  owner_user_id?: string;
  object_reference: { object_type: string; object_id: string };
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "completed" | "dismissed";
  completing_audit_event_id?: string;
  dismissal_rationale?: string;
  created_at: string;
  completed_at?: string;
}

interface ExceptionRecord {
  id: string;
  exception_type:
    | "reconciliation_mismatch" | "missing_metadata" | "unmapped_docket_event"
    | "conflicting_log_entry" | "incomplete_approval" | "audit_integrity_break";
  severity: "low" | "medium" | "high" | "critical";
  object_reference: { object_type: string; object_id: string };
  detail: Record<string, unknown>;
  status: "open" | "in_review" | "resolved" | "escalated";
  resolution_action?: string;
  rationale?: string;
  detected_at: string;
  resolved_at?: string;
}

// Shared error envelope returned by every endpoint on failure (FRD Y2):
interface ApiError {
  error_code: string;   // e.g. "AUTH_SCOPE_DENIED", "EXCEPTION_RATIONALE_REQUIRED"
  message: string;      // human-readable, display-safe — never a raw stack trace
  detail?: Record<string, unknown>;
}
```

### 6.7 Case Timeline (F08) / Reporting (F09) / CM/ECF Adapter (F10)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/cases/{id}/timeline` | query: `event_type[], date_from, date_to, module[]` | `{timeline_entries[]}` | Access-scoped merge |
| GET | `/reporting/dashboard` | query: `scope, metric_set[]` | `{metrics}` | Requires `reporting_viewer` |
| GET | `/reporting/export` | query: same | file | De-identified |
| POST | `/integrations/cmecf/sync` | CM/ECF payload | `200/409` | Inbound webhook/poll target |
| GET | `/integrations/cmecf/status` | — | `{last_sync, error_rate, backlog}` | — |
| POST | `/integrations/cmecf/outbound` | `{filing_payload}` | `201` | Requires `docket_outbound` entitlement |

```typescript
interface TimelineEntry {
  event_type: "docket_event" | "hearing" | "exhibit_action" | "clock_segment" | "decision";
  occurred_at: string;
  summary: string;
  module: "shared" | "evidentiary" | "speedytrial";
  deep_link: string;
}

interface AdapterStatus {
  last_sync: string;
  error_rate: number;
  backlog: number;
}
```

### 6.8 External Portal (F12) — Separate Base Path `/portal/v1`, Distinct Auth Audience

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/portal/submissions` | exhibit metadata | `201` | `submitted_via='external_portal'` |
| GET | `/portal/trackers/{id}/summary` | — | `{remaining_time, next_threshold, confirmed_periods[]}` | Read-only, scoped visibility |

```typescript
// Portal types are intentionally a narrower, read-mostly subset — the portal
// frontend bundle never imports internal-only types (exhibit_versions,
// calculation_versions, audit events) even though the underlying API gateway
// enforces this independently via token audience validation.
interface PortalTrackerSummary {
  tracker_id: string;
  remaining_time: number;
  next_threshold?: { tier_name: string; value: number; unit: string };
  confirmed_periods: Array<{ category: string; start: string; end?: string }>;
}
```

### 6.9 UI Workspaces (F11) / Security Baseline (F13) / Governance (F37, Scale) / Analytics (F38, Scale)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| PATCH | `/users/me/workspace-preference` | `{workspace_preference}` | `200` | Persists the user's default workspace entry point |
| POST | `/files/upload` | multipart file | `201/422` | Malware scan + allowlist gate |
| POST | `/security/policy-evaluate` | `{object_type, object_id, requester_scope}` | `{allow\|deny}` | Internal — the ABAC PDP call itself (§7.2) |
| GET | `/retention/schedules` | query: `court_id` | `{schedules[]}` | — |
| GET | `/retention/due-for-disposition` | query: `court_id` | `{records[]}` | Feeds F06 tasks |
| GET/POST | `/governance/national-baseline` | `{field, default_value, court_overridable}` | `{baseline}` | Requires `national_governance_admin` |
| POST | `/governance/requests` | `{court_id, requested_field, requested_value, rationale}` | `201` | Court-initiated override request |
| GET | `/governance/consistency-report` | — | `{divergences[]}` | Cross-court configuration divergence report |
| GET | `/analytics/trends` | query: `court_ids[], metric_categories[], period` | `{trends}` | Requires `ao_program_analytics` |
| GET | `/analytics/export` | query: same | file | De-identified, court-level minimum aggregation |

```typescript
interface FileUploadResponse {
  file_reference_id: string;
  scan_status: "pending" | "clean" | "rejected";
}

interface PolicyEvaluationRequest {
  object_type: string;
  object_id: string;
  requester_scope: ScopeAttribute[];
}

interface PolicyEvaluationResponse {
  decision: "allow" | "deny";
  reason_code?: string;
}
```

---

### 6.10 Evidentiary Tracking API — Base Path `/api/v1/evidentiary`

#### Case Setup (F14) / Pretrial Intake (F15)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/cases/{id}/setup` | `{proceeding_id, numbering_scheme_id, party_ids[], security_designations[]}` | `201 {exhibit_tracking_context}` | Idempotent re-run |
| POST | `/intake` | `{description, offering_party_id, proceeding_id, exhibit_type, proposed_number, file}` | `201 {submission}` | File via F13 scan gate |
| GET | `/intake` | query: `proceeding_id, status` | `{submissions[]}` | — |
| POST | `/intake/{id}/accept` | — | `200 {exhibit}` | Promotes to ledger |
| POST | `/intake/{id}/reject` | `{reason}` | `200` | — |
| POST | `/intake/{id}/request-correction` | `{deficiency_detail}` | `200` | — |

```typescript
interface ExhibitTrackingContext {
  id: string;
  case_id: string;
  proceeding_id: string;
  numbering_scheme_id: string;
  activated_by: string;
  activated_at: string;
}

interface IntakeSubmission {
  id: string;
  proceeding_id: string;
  description: string;
  offering_party_id: string;
  exhibit_type: string;
  proposed_number?: string;
  file_reference_id?: string;
  submitted_via: "internal" | "external_portal";
  submitted_by?: string;
  external_submitter_id?: string;
  status: "proposed" | "in_review" | "accepted" | "rejected" | "correction_requested";
  deficiency_detail?: string;
  created_at: string;
}
```

#### Exhibit Ledger (F16) / Exhibit Types (F23)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/exhibits` | query: filters | `{exhibits[]}` | — |
| GET | `/exhibits/{id}` | — | `{exhibit}` | — |
| POST | `/exhibits/{id}/transition` | `{status_transition, proceeding_id, ruling_actor_id?, notes}` | `200 {exhibit, new_version}` | Workflow-validated |
| GET | `/exhibits/{id}/versions` | — | `{versions[]}` | Immutable history |
| GET | `/exhibit-types` | query: `court_id` | `{types[]}` | Catalog |
| POST | `/exhibits/{id}/reclassify` | `{new_type, reason}` | `200` | Audit-logged |

```typescript
type ExhibitStatus =
  | "proposed" | "offered" | "admitted" | "rejected"
  | "withdrawn" | "substituted" | "sealed" | "returned";

interface Exhibit {
  id: string;
  proceeding_id: string;
  exhibit_number: string;
  description: string;
  offering_party_id: string;
  exhibit_type: string;
  current_status: ExhibitStatus;
  confidentiality?: string;
  current_location?: string;
  current_custodian_id?: string;
  intake_submission_id?: string;
  security_designation_tags: string[];
  updated_at: string;
}

interface ExhibitVersion {
  id: string;
  exhibit_id: string;
  version_number: number;
  status: ExhibitStatus;
  ruling_actor_id?: string;
  notes?: string;
  recorded_by: string;
  recorded_at: string;
  audit_event_id: string; // every version row traces to an immutable audit event
}

interface TransitionExhibitRequest {
  status_transition: ExhibitStatus;
  proceeding_id: string;
  ruling_actor_id?: string; // the judge — required when status_transition is 'admitted'|'rejected'
  notes?: string;
}
```

#### Courtroom Logging (F17)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/sessions` | `{proceeding_id}` | `201 {session}` | Opens logging session |
| POST | `/sessions/{id}/log-action` | `{exhibit_id, action, objection_category?, ruling_outcome?, notes?}` | `200` | Judge attribution auto-resolved |
| POST | `/sessions/{id}/close` | — | `200/409` | Triggers F18 reconciliation |

```typescript
interface CourtroomSession {
  id: string;
  proceeding_id: string;
  opened_by: string;
  opened_at: string;
  closed_at?: string;
  status: "open" | "closed";
}

interface LogActionRequest {
  exhibit_id: string;
  action: "offer" | "objection" | "ruling" | "withdraw" | "substitute";
  objection_category?: string;
  ruling_outcome?: "admit" | "reject";
  notes?: string;
  // client_local_timestamp + idempotency_key are included (not shown) to
  // support the offline-tolerant write queue — see §4.4 frontend notes.
}
```

#### Reconciliation (F18) / Basic Closeout (F19)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/reconciliation/runs` | `{proceeding_id, checkpoint_type}` | `201 {run}` | — |
| GET | `/reconciliation/runs/{id}/discrepancies` | — | `{discrepancies[]}` | — |
| POST | `/reconciliation/discrepancies/{id}/resolve` | `{resolved_value, rationale}` | `200` | — |
| POST | `/exports` | `{proceeding_id, status_filter[], export_format}` | `201 {export}` | — |
| POST | `/exports/{id}/certify` | — | `200` | Distinct confirmation action |

```typescript
interface ReconciliationRun {
  id: string;
  proceeding_id: string;
  checkpoint_type: "recess" | "day_end" | "trial_close" | "on_demand";
  status: "in_progress" | "complete" | "partial";
  triggered_by: string;
  started_at: string;
  completed_at?: string;
  override_rationale?: string;
}

interface ReconciliationDiscrepancy {
  id: string;
  reconciliation_run_id: string;
  exhibit_id: string;
  conflicting_values: Record<string, unknown>;
  severity: string;
  resolved_value?: string;
  rationale?: string;
  status: "open" | "resolved";
}
```

#### Custody (F20) / Sealing (F21)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/exhibits/{id}/custody-transfers` | `{recipient_custodian_id, purpose, location, condition_note}` | `201 {transfer}` | — |
| POST | `/custody-transfers/{id}/acknowledge` | `{condition_confirmed}` | `200` | Recipient-only |
| POST | `/exhibits/{id}/seal` | `{designation_category, authorizing_judge_id, permitted_entitlement_scope}` | `200` | Judge-only |
| POST | `/exhibits/{id}/release` | `{release_authorizing_judge_id, release_reason}` | `200` | — |

```typescript
interface CustodyTransfer {
  id: string;
  exhibit_id: string;
  transferor_id: string;
  recipient_custodian_id: string;
  purpose: string;
  location: string;
  condition_note?: string;
  status: "pending" | "completed" | "disputed";
  initiated_at: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
}

interface SealExhibitRequest {
  designation_category: "sealed" | "restricted" | "grand_jury" | "juvenile";
  authorizing_judge_id: string;
  permitted_entitlement_scope: Record<string, unknown>;
}
```

#### Jury Package (F22) / Full Closeout (F24)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/proceedings/{id}/jury-packages` | `{authorizing_judge_id, inclusion_scope, session_window}` | `201 {package}` | Auto-excludes sealed/non-admitted |
| GET | `/jury-packages/{id}/session` | — | `{access_token, expires_at}` | Session-scoped |
| POST | `/proceedings/{id}/closeout` | — | `201 {closeout_package}` | Requires completed reconciliation |
| POST | `/closeout/{id}/dispositions` | `{exhibit_id, disposition_action, executing_custodian_id}` | `200` | — |
| POST | `/closeout/{id}/certify` | — | `200` | — |

```typescript
interface JuryPackage {
  id: string;
  proceeding_id: string;
  authorizing_judge_id: string;
  version_number: number;
  session_window_start: string;
  session_window_end: string;
  created_at: string;
}

interface ClosureDisposition {
  closeout_package_id: string;
  exhibit_id: string;
  disposition_action: "return" | "retain" | "transfer" | "destroy_scheduled";
  executing_custodian_id?: string;
  executed_at?: string;
}
```

#### Portfolio & Templates (F25, Scale) / Courtroom Technology (F39, Scale)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/portfolio/dashboard` | query: `scope` | `{metrics}` | Caseload-scoped |
| POST | `/templates` | `{source_court_id, template_name}` | `201` | Requires `system_admin` |
| POST | `/templates/{id}/apply` | `{target_court_id, approving_user_id}` | `200` | Maker-checker |
| POST | `/courtroom-display/sessions` | `{exhibit_id\|jury_package_id, authorized_endpoint_id, proceeding_id}` | `201` | — |
| GET | `/courtroom-display/endpoints` | query: `court_id` | `{endpoints[]}` | — |

---

### 6.11 Speedy Trial API — Base Path `/api/v1/speedytrial`

#### Tracker Initialization (F26) / Event Ingestion (F27)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/trackers` | `{defendant_party_id, case_id, trigger_event_id\|trigger_event_type+trigger_date}` | `201 {tracker (proposed)}` | Auto or manual path |
| POST | `/trackers/{id}/confirm` | — | `200 {tracker (confirmed)}` | Requires reviewer entitlement |
| POST | `/trackers/{id}/reject` | `{reason}` | `200` | Routes to exception |
| POST | `/events` | `{source_identifier, source_code, source_description, event_date, case_id, defendant_party_id}` | `201/200 (idempotent)` | Duplicate-safe |
| POST | `/events/{id}/resolve-mapping` | `{event_category}` or `{new_mapping_rule_request}` | `200` | Requires reviewer entitlement |

```typescript
type TrackerStatus = "proposed" | "confirmed" | "closed";

interface DefendantTracker {
  id: string;
  case_id: string;
  defendant_party_id: string;
  status: TrackerStatus;
  trigger_event_id?: string;
  trigger_event_type?: string;
  trigger_date?: string;
  confirming_user_id?: string;
  confirmed_at?: string;
  current_calculation_version_id?: string;
  created_at: string;
}

interface SpeedyTrialEvent {
  id: string;
  case_id: string;
  defendant_party_id?: string;
  source_system: string;
  source_identifier: string;
  source_code?: string;
  source_description?: string;
  event_date: string;
  event_category?: string;
  mapping_status: "unmapped" | "mapped";
  entered_by?: string;
}
```

#### Candidate Exclusions (F28) — Read/List Only (Generation Is System-Triggered)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/trackers/{id}/candidate-exclusions` | query: `state` | `{candidates[]}` | Read/list only; generation is system-triggered |

```typescript
interface CandidateExclusion {
  id: string;
  tracker_id: string;
  exclusion_category: string;
  proposed_start: string;
  proposed_end?: string; // open-ended pending disposing event
  triggering_event_refs: string[];
  rule_version_ref: string;
  joint_event_group_id?: string; // links sibling candidates across co-defendants
  state: "candidate" | "reviewed";
  created_at: string;
}
```

#### Clock Calculation & Explainability (F29) — The Core Versioned-Immutability Surface

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/trackers/{id}/calculate` | `{calculation_date?}` | `201 {calculation_version}` | Creates new immutable version — **never updates an existing one** |
| GET | `/trackers/{id}/calculation-versions` | — | `{versions[]}` | Full history, newest first |
| GET | `/calculation-versions/{id}/explain` | — | `{segments[]}` | "Explain this date" view |

```typescript
type StatusIndicator = "within_limit" | "approaching_threshold" | "limit_reached"; // decision-support label only, never a ruling

interface CalculationVersion {
  id: string;
  tracker_id: string;
  version_number: number;
  calculation_date: string;
  elapsed_includable_time: number; // days
  total_excluded_time: number;
  remaining_time: number;
  status_indicator: StatusIndicator;
  rule_version_ref: string;
  triggering_reason: "scheduled" | "event_driven" | "manual" | "override";
  is_override: boolean;
  supersedes_version_id?: string; // linked-list chain back through every prior version
  created_at: string;
}

interface CreateCalculationRequest {
  calculation_date?: string; // defaults to today if omitted
}

interface TimelineSegment {
  id: string;
  calculation_version_id: string;
  segment_type: "included" | "excluded";
  start_date: string;
  end_date?: string;
  confirmed_exclusion_id?: string; // required when segment_type = 'excluded'
  rule_version_ref: string;
  reviewer_id?: string;
  reason?: string;
}

interface ExplainCalculationResponse {
  calculation_version: CalculationVersion;
  segments: TimelineSegment[];
  // Each segment is individually traceable to its confirmed_exclusion (if
  // excluded) and that exclusion's candidate_exclusion + triggering events +
  // rule package version + reviewing user — the full "explain this date" chain.
}
```

#### Review & Approval (F30)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/review-items/{id}/accept` | — | `200 {confirmed_record}` | — |
| POST | `/review-items/{id}/modify` | `{modified_value, rationale}` | `200` | — |
| POST | `/review-items/{id}/reject` | `{rationale}` | `200` | — |
| POST | `/review-items/{id}/override` | `{modified_value, rationale}` | `200 {new_version}` | Never edits in place — always inserts a new version row |

```typescript
interface ReviewAction {
  id: string;
  reviewable_object_type: "candidate_exclusion" | "tracker_start_context" | "calculation_version";
  reviewable_object_id: string;
  action: "accept" | "modify" | "reject" | "override";
  modified_value?: Record<string, unknown>;
  rationale?: string; // required for modify/reject/override
  reviewing_user_id: string;
  reviewed_at: string;
}

interface ConfirmedExclusion {
  id: string;
  tracker_id: string;
  candidate_exclusion_id?: string;
  exclusion_category: string;
  confirmed_start: string;
  confirmed_end?: string;
  is_override: boolean;
  supersedes_confirmed_exclusion_id?: string; // correction chain, never an in-place edit
  rationale?: string;
  reviewing_user_id: string;
  reviewed_at: string;
  audit_event_id: string;
}
```

#### Threshold Alerts (F31) / Version Comparison (F32)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/trackers/{id}/alerts` | — | `{alerts[]}` | — |
| POST | `/alerts/{id}/acknowledge` | — | `200` | Feeds audit trail |
| GET | `/trackers/{id}/calculation-versions/compare` | query: `version_a_id, version_b_id` | `{additions[], removals[], modifications[]}` | Same-tracker only |

```typescript
interface ThresholdAlert {
  id: string;
  tracker_id: string;
  calculation_version_id: string;
  tier_name: string;
  severity: string;
  notification_id?: string;
  acknowledged_by?: string;
  acknowledged_at?: string;
  created_at: string;
}

interface VersionComparisonResponse {
  version_a_id: string;
  version_b_id: string;
  additions: TimelineSegment[];
  removals: TimelineSegment[];
  modifications: Array<{ field: string; old_value: unknown; new_value: unknown; segment_id: string }>;
}
```

#### Continuance Findings (F33) / Multi-Defendant (F34)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/continuances/{id}/completeness` | — | `{status, missing_fields[]}` | Structural check only — never a legal-sufficiency ruling |
| POST | `/continuances/{id}/supply-references` | `{structured_findings_ref, order_document_ref}` | `200` | Chambers/judge entitlement |
| GET | `/cases/{id}/defendant-trackers` | — | `{trackers[], relationships[]}` | No collapsed view across co-defendants |
| POST | `/cases/{id}/severance` | `{severed_defendant_ids[], severance_date}` | `201 {severance_event}` | Explicit confirmation required |

```typescript
interface ContinuanceCompletenessResponse {
  status: "complete" | "incomplete";
  missing_fields: string[]; // e.g. ["structured_findings_ref", "order_document_ref"]
}

interface CodefendantRelationship {
  id: string;
  case_id: string;
  tracker_ids: string[];
  relationship_status: "joint" | "severed";
}
```

#### Case Conference View (F35) / Portfolio Dashboard (F36)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/trackers/{id}/conference-view` | query: `proceeding_context?` | `{summary}` | Deep-linked, read-only aggregation |
| GET | `/trackers/{id}/conference-view/export` | — | file (packet) | — |
| GET | `/dashboard/personal` | — | `{flagged_trackers[]}` | Caseload-scoped |
| GET | `/dashboard/court` | query: `court_id` | `{aggregate_metrics}` | Requires `court_admin` |

```typescript
interface ConferenceViewSummary {
  tracker_id: string;
  current_calculation: CalculationVersion;
  pending_exclusion_reviews: number;
  incomplete_continuances: number;
  upcoming_hearings: Array<{ hearing_id: string; scheduled_at: string; hearing_type: string }>;
}
```

---

## 7. Security Architecture

JudicialSync's security architecture is built around four structural guarantees, each enforced at the lowest practical layer (database grant, middleware, or protocol) rather than by application-code discipline alone — because federal court data (sealed records, grand jury material, juvenile records, PII, and legally dispositive calculations) cannot tolerate "we trust the code wrote it right" as the sole safeguard.

### 7.1 Authentication

| Mechanism | Detail |
|---|---|
| Protocol | OIDC (preferred) or SAML 2.0, per court-selected IdP; `[ASSUMPTION per FRD F00]` — exact protocol is court-configurable, both are supported by the Identity & ABAC Module's pluggable assertion validator |
| MFA | Mandatory for all internal court-user roles; court-configurable (default: required) for the external attorney portal realm |
| Token model | Short-lived signed JWT access token (5–15 min) + longer-lived rotating refresh token; refresh tokens are stored hashed (`sessions.refresh_token_hash`), never in plaintext |
| Audience separation | Internal realm and external attorney portal realm use **distinct OIDC client IDs / SAML service-provider entity IDs**, so a portal-issued token is structurally rejected (invalid audience claim) by any internal-only endpoint, independent of any role-check bug |
| Session invalidation | Role or scope-attribute change immediately revokes active sessions (`sessions.revoked_at` set); next request forces re-authentication to pick up updated entitlements — enforced via a revocation check on every token validation, not merely token expiry |
| IdP outage handling | Fail-closed: if the IdP is unreachable, authentication fails with `503 AUTH_IDP_UNAVAILABLE`; the system never falls back to an unauthenticated or degraded-trust mode |

### 7.2 Authorization — RBAC + ABAC Enforced at the API Layer

Authorization is a two-layer model, and **both layers are evaluated server-side on every request** — client-supplied entitlement claims are advisory for UI gating only and are never trusted as the authorization decision.

**Layer 1 — RBAC (coarse-grained):** A request's role (`judge`, `law_clerk`, `courtroom_deputy`, `clerk_case_admin`, `attorney_external`, `jury_admin`, `court_admin`, `system_admin`, `security_officer`) determines which *endpoint classes* are even reachable (e.g., `attorney_external` can never reach `/audit/explorer` or any `/*/transition` write endpoint, by route-level RBAC gate, before ABAC is even evaluated).

**Layer 2 — ABAC (fine-grained):** For every request that passes the RBAC gate, a centralized **Policy Decision Point (PDP)** evaluates the requester's scope attributes (court, division, case, proceeding, party-role, security-designation) against the target resource's actual attributes, returning `allow`/`deny`. The PDP is implemented as a shared policy-evaluation service (e.g., Open Policy Agent with Rego policies, or an equivalent embedded policy engine) invoked identically by the API Gateway (coarse pre-filter) and by each of the three backend services (fine-grained, resource-specific checks that require loading the actual object's attributes).

```
Request → API Gateway → [RBAC route gate] → Service handler
                                                  │
                                                  ▼
                                   [PDP: ABAC policy-evaluate(
                                      requester_scope, resource_attributes)]
                                                  │
                                   allow ──────────┼────────── deny
                                     │                            │
                                     ▼                            ▼
                              handler executes         403 (or 404 if existence-
                              domain logic             hiding applies, e.g. sealed
                                                        case per FRD Y2 principle 3)
```

**Binding ABAC rules (directly from FRD F00/Y2, enforced in policy, not scattered across handler code):**

- A principal holding only `attorney_external` can never receive an `allow` decision for internal-only resource classes (ledger write, calculation override, audit explorer), regardless of any case association — this is a policy-level deny, not a per-endpoint check that could be missed on a new endpoint.
- Access to a security-designated object (sealed/restricted/grand_jury/juvenile) requires an explicit additional entitlement beyond the base role; absence of that entitlement against a sealed object returns `404`, not `403`, to avoid confirming the object's existence (existence-hiding, per FRD Y2 principle 3).
- `system_admin` and `security_officer` may not approve a privileged role-grant request they themselves created — enforced as a policy rule comparing `request.created_by` against `request.approved_by`, not an application-layer `if` statement that a future refactor could drop.
- Entitlement claims cached client-side (for UI gating) expire after a configurable short window (default 5 minutes) and are always re-validated server-side before any privileged action — a stale "I have access" UI state can never itself grant access.

**Separation of duties (maker-checker):** Configuration publishing (F03), role grants (F00), exhibit-config-template application (F25), and national-baseline governance changes (F37) all require a second, distinct approving user — enforced in policy as `drafted_by != approved_by`, with violations returning `403 *_SOD_VIOLATION`.

### 7.3 Audit Immutability Architecture

This is the system's accountability backbone and the single most structurally enforced guarantee in the architecture, because the PRD requires the audit trail to be suitable for appellate review — a record an appellate court could be asked to trust.

**Append-only enforcement at the database-grant level:**

```sql
-- Applied identically to audit_events, exhibit_versions, calculation_versions,
-- and confirmed_exclusions — the four tables FRD Y2 flags as immutable:
REVOKE UPDATE, DELETE ON audit_events FROM app_rw;
GRANT  SELECT, INSERT ON audit_events TO app_rw;
```

The running application's database role (`app_rw`) physically cannot issue `UPDATE` or `DELETE` against these tables — not because the ORM forbids it, but because PostgreSQL itself will reject the statement regardless of which code path generated it, including a compromised application process or an operator using the application's own credentials. Only a separate, non-application `app_dba` role can alter these tables' structure (schema migrations), and that role is never used by running request-handling code.

**Hash-chain tamper evidence:**

```
row_hash[n] = SHA-256( canonical_json(row[n] minus row_hash) || row_hash[n-1] )
```

Each `audit_events` row stores `prev_hash` (copied from the previous row's `row_hash` at write time) and its own `row_hash`. A `BEFORE INSERT` trigger recomputes the expected hash server-side and rejects the insert if the application-supplied hash doesn't match — this prevents a compromised application instance from forging a consistent-looking chain by computing hashes incorrectly or out of order. A scheduled integrity-verification job re-walks the entire chain (or an incremental window) and raises a **P0, individually-reviewed exception** (`audit_integrity_break`, FRD F02/F07) the instant any break is detected — this check is never silently logged and auto-dismissed.

**Transactional outbox for domain-write + audit-write atomicity:** Every state-changing operation on an audited object (exhibit status transition, custody transfer, calculation override, configuration change) writes its domain row and its corresponding `audit_events` row **in the same database transaction**. If the audit insert fails for any reason, the entire transaction rolls back and the domain change is never committed — "the action happened but wasn't audited" is structurally impossible, not merely discouraged.

**Audit read/write separation:** Audit read access requires a distinct `audit_reader` entitlement that is never implied by operational edit roles — a clerk with exhibit-ledger write access does not automatically gain audit-explorer read access, and vice versa. This is enforced in the ABAC policy, not by UI link-hiding.

### 7.4 Speedy Trial Calculation Immutability

The Speedy Trial clock calculation receives the same structural immutability treatment as the audit trail, because a miscalculated or silently-altered deadline is itself a legally significant failure mode (PRD success metric: "Zero instances of a prior approved Speedy Trial calculation being silently overwritten rather than versioned").

- `calculation_versions` and `confirmed_exclusions` carry the same `REVOKE UPDATE, DELETE` database-grant treatment as `audit_events` (§5.25, §5.24).
- Every recalculation — whether system-scheduled, event-driven, manually requested, or an explicit human override — **inserts a new row** with `supersedes_version_id` (or `supersedes_confirmed_exclusion_id`) pointing to the prior version; no code path updates a published calculation in place.
- The `triggering_reason` column (`scheduled | event_driven | manual | override`) distinguishes *why* a new version was created as part of the permanent record, not merely in a separate log — this is itself queryable evidence of whether a human initiated a change.
- The "explain this date" API (`GET /calculation-versions/{id}/explain`) walks `timeline_segments` to reconstruct, for any historical version, exactly which confirmed exclusions, triggering events, and rule-package version produced that specific number — including versions that have since been superseded. Nothing about a prior approved result becomes unreconstructable just because a newer version exists.
- No batch/cron identity has `INSERT` privilege with `triggering_reason = 'override'` — overrides can only originate from an authenticated human request through the Review & Approval Module (F30), which requires a mandatory rationale captured in the linked `review_actions` row.

### 7.5 Data Protection

| Control | Implementation |
|---|---|
| Encryption in transit | TLS 1.2+ enforced at the API Gateway and load balancer; internal service-to-service traffic within the private network segment also TLS-encrypted (not merely network-isolated) |
| Encryption at rest | PostgreSQL transparent data encryption (or cloud-managed disk encryption) + object store server-side encryption, both using keys managed by a dedicated KMS; application never handles raw encryption keys |
| Key management | Federal-cloud-native KMS (AWS KMS GovCloud / Azure Key Vault Government), key rotation policy, no application-embedded secrets — all credentials resolved from a secrets manager at runtime |
| Malware scanning | Every upload (`POST /files/upload`) is quarantined (`scan_status = 'pending'`) until an asynchronous scan completes; only `clean` results permit the file to be referenced by intake/custody/jury-package workflows; `infected`/`error` results are rejected and logged (`SECURITY_MALWARE_DETECTED`) |
| File-type allowlisting | Enforced server-side against a configurable allowlist per court profile, independent of client-supplied MIME type (content-sniffed, not trusted from the `Content-Type` header) |
| Sealed/restricted/grand-jury/juvenile/PII handling | Policy-driven via `security_designations`/`exhibit_designations` + `security_policies` (rule-package-scoped `required_entitlement` per designation) — never an ad hoc `if is_sealed` check scattered through handler code |
| Notification content policy | Enforced by **reviewed, approved templates**, not free-text composition — a template cannot reference defendant name, exhibit description, or sealed-case identifiers; violations are blocked pre-send (`NOTIFY_CONTENT_POLICY_VIOLATION`) rather than caught after delivery |
| Retention & disposition | `retention_schedules` (per court, per record category) drive scheduled disposition tasks (F06); disposition actions themselves are logged to the append-only `disposition_log`, never silently executed without a confirming user |

### 7.6 Existence-Hiding for Sealed Records

Per FRD Y2 principle 3, where an object's mere existence is itself sensitive (sealed cases/exhibits), an unauthorized access attempt — including via Search (F05) — returns `404 Not Found`, never `403 Forbidden`. This is implemented as a pre-ranking, mandatory access-scope filter at the search-index query layer (not a post-hoc redaction of search results), so result counts, ranking positions, and response timing cannot be used to infer the existence of a sealed matter. Every such denied/hidden attempt is itself logged as an `access_attempt` audit event.

### 7.7 Separation of Duties — Operational & Release Controls

Beyond the maker-checker patterns in §7.2, release and infrastructure controls enforce separation between those who can deploy code and those who can approve a production release:

- CI/CD pipeline requires a distinct approving reviewer for any change touching the `platform/core` audit, authorization, or calculation-engine modules, flagged automatically via CODEOWNERS-style path rules.
- Infrastructure-as-code changes to database grants (the `REVOKE UPDATE, DELETE` statements in §7.3/§7.4) are themselves version-controlled and require security-officer sign-off before merge — the immutability guarantee's own definition is protected by the same separation-of-duties discipline it enforces on the data.
- Vulnerability scanning (dependency, container image, and infrastructure) runs on every build; findings above a configured severity threshold block promotion to the pilot-production environment.

---

## 8. Technology Stack

### 8.1 Frontend

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| UI framework | React | 18.x | Component model for all five role-specific workspaces |
| Design system (binding) | U.S. Web Design System (USWDS) | 3.x | Mandatory federal design system — Section 508 accessibility, consistent federal UX; source: https://designsystem.digital.gov/ |
| USWDS React bindings | `@trussworks/react-uswds` | latest stable | React component wrappers over USWDS markup/CSS, avoids hand-rolling USWDS HTML structure |
| Design tokens / CSS | `@uswds/uswds` (Sass source) | 3.x | Underlying USWDS tokens, compiled via the project's Sass build, themeable per court branding within USWDS constraints |
| Language | TypeScript | 5.x | Compile-time contract checking against the generated OpenAPI client |
| State/data fetching | TanStack Query (React Query) | 5.x | Server-state caching, used for all REST calls; no client-side ABAC decisions ever trusted — UI gating only |
| Routing / code-splitting | React Router + per-workspace bundle splitting | 6.x | Enables the Courtroom Deputy Interface to ship a minimal bundle distinct from Clerk/Admin consoles |
| Offline support (Courtroom Deputy Interface only) | Service Worker + IndexedDB write queue | — | Local-first queue for `session_log_entries` during network/API interruption, reconciled on reconnect (F17) |
| Accessibility testing | axe-core / Pa11y in CI | — | Automated Section 508/WCAG 2.1 AA gate on every build, release-blocking per NFR |
| API client generation | OpenAPI Generator (TypeScript-fetch target) | — | Generated directly from the backend's OpenAPI 3.1 contract — frontend and backend share one source of truth |

### 8.2 Backend

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Runtime | Node.js | 20.x LTS | Shared runtime across all three services (Platform Core, Evidentiary, Speedy Trial) |
| Framework | NestJS | 10.x | Modular, dependency-injected service framework; module boundaries map directly to FRD feature groupings (§4 Component Architecture) |
| Language | TypeScript | 5.x | End-to-end type safety from DB layer through API contract to frontend |
| ORM / query layer | Prisma | 5.x | Type-safe schema access; raw SQL escape hatch used for the hash-chain trigger logic and append-only grant management (migrations), since those require direct DDL/grant control beyond typical ORM abstractions |
| API contract | OpenAPI 3.1 | — | Single source of truth for request/response schemas, consumed by both the TypeScript client generator and server-side request validation (`zod`/`class-validator`) |
| Authentication | `openid-client` (OIDC) / `node-saml` (SAML) | — | Pluggable per-court IdP protocol support (F00) |
| Policy engine (ABAC/PDP) | Open Policy Agent (OPA), Rego policies | latest | Centralized policy decision point invoked by the API Gateway and each service (§7.2) |
| Background jobs / workers | BullMQ (Redis-backed) | 5.x | Notification delivery retries, CM/ECF sync polling, audit hash-chain verification job, scheduled Speedy Trial recalculation |
| Validation | `zod` | 3.x | Runtime request-body validation generated from/aligned to the OpenAPI schema |

### 8.3 Data Platform

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Primary database | PostgreSQL | 15.x | Operational data, audit trail, configuration, all DDL in §5; chosen for mature row-level security, `UUID`/`JSONB` support, and the fine-grained `GRANT`/`REVOKE` model §7.3/§7.4 depend on |
| Extensions | `pgcrypto` (UUID generation), `pg_trgm` (fallback text search) | — | UUID defaults; trigram search as a fallback when OpenSearch is unavailable |
| Search | OpenSearch | 2.x | Access-tagged, denormalized search index (F05) backing `search_index`; chosen over Elasticsearch for its Apache-2.0 licensing and GovCloud availability |
| Cache / session store | Redis | 7.x | Session token short-cache window (§7.2), rate-limit counters, BullMQ job queue backend |
| Object storage | S3-compatible object store (AWS S3 GovCloud / Azure Blob Government) | — | Exhibit file references, generated packages/exports, encrypted at rest (§7.5) |
| Backup / DR | Automated snapshot + cross-region replication, immutable (WORM) backup retention for audit/calculation tables | — | Matches the append-only guarantee at the backup layer, not just the live database |

### 8.4 Infrastructure & Operations

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Cloud environment | AWS GovCloud (US) or Azure Government | — | Federal data-residency and compliance posture (FedRAMP-aligned) |
| Container orchestration | Kubernetes (EKS GovCloud / AKS Government) | 1.29+ | Runs Platform Core, Evidentiary, Speedy Trial, PDP, and worker deployments |
| API Gateway / ingress | Kong or cloud-native API Gateway + WAF | — | Token validation entry point, rate limiting, audience separation enforcement (internal vs. portal) |
| CI/CD | GitHub Actions (or GitLab CI, per court/AO infra constraints) with mandatory security-scan + CODEOWNERS review gates | — | Separation-of-duties-enforced release pipeline (§7.7) |
| Infrastructure as Code | Terraform | 1.x | Reproducible environment provisioning, including the database grant/role definitions themselves |
| Secrets management | AWS Secrets Manager / Azure Key Vault (Government) | — | No credentials embedded in code or container images |
| Observability | OpenTelemetry (traces/metrics) + centralized logging (SIEM-forwarded) | — | Cross-cutting request tracing across the three services; audit-chain verification job alerts surface here |
| Vulnerability management | Container image scanning (Trivy/Grype) + dependency scanning (Dependabot/Snyk) in CI | — | Release-blocking above configured severity threshold |

### 8.5 Why This Stack

- **Node.js/TypeScript end-to-end** keeps one language across frontend, backend, and the generated API contract, minimizing the risk of request/response shape drift between the three services and five frontend workspaces — a meaningful risk given the system's 60+ entity data model.
- **NestJS's module system** maps directly onto the FRD's feature-group boundaries (F00–F13 Platform Core modules, F14–F25/F39 Evidentiary modules, F26–F36 Speedy Trial modules), so the codebase's physical structure mirrors the architecture diagram in §1, not an ad hoc folder layout.
- **PostgreSQL over a NoSQL alternative** is a direct consequence of the append-only/hash-chain immutability requirement (§7.3/§7.4): fine-grained `REVOKE`/`GRANT` at the table level, mature transactional guarantees for the outbox pattern, and `JSONB` columns give schema flexibility (e.g., `config_snapshot`, `detail` on exceptions) without sacrificing relational integrity for the core case/exhibit/tracker graph.
- **OPA/Rego for the Policy Decision Point** avoids three independently-implemented, independently-buggy ABAC checks across the three services — policy logic is written once and versioned like code, with its own test suite, directly addressing the FRD's requirement that ABAC evaluation be identical regardless of which service receives the request.
- **USWDS is non-negotiable per PRD/PROJECT.md** — the `@trussworks/react-uswds` + `@uswds/uswds` pairing is the most mature, actively maintained React binding for USWDS as of this writing, minimizing the risk of hand-rolled, drift-prone reimplementations of USWDS accessibility patterns.

---

## 9. Integration Points

All external integrations are isolated behind the Platform Core Service's integration-adapter boundary (§1.2 Key Architectural Decisions) — no Evidentiary or Speedy Trial service component calls an external system directly. This keeps external-system churn (a CM/ECF upgrade, an IdP migration) contained to one service's adapter layer.

### 9.1 CM/ECF (or Successor Case-Management Platform)

| Aspect | Detail |
|---|---|
| Purpose | Case, party, docket-event, order, and document-reference synchronization (F10) |
| Direction | Primarily inbound; controlled outbound references/filings only where explicitly authorized |
| Transport | Polling adapter (scheduled, configurable interval) with webhook support where the court's CM/ECF deployment exposes one; `[ASSUMPTION per FRD Y3]` — exact mechanism, schema, and latency are unresolved pending CM/ECF interface availability per court, so the adapter is built against an abstract `CmecfSyncProvider` interface with a pluggable transport implementation |
| Idempotency | Every inbound record carries a stable CM/ECF-native `source_identifier`; redelivery of the same `source_identifier` + payload is a no-op (`sync_conflicts`/dedup check before insert), never a duplicate row |
| Conflict handling | CM/ECF data wins by default; a field-level conflict with a locally-modified value creates a `sync_conflicts` row routed to the Exception Queue (F07) for human resolution — never a silent overwrite |
| Health monitoring | `adapter_health_log` (last successful sync, error count, backlog count) surfaces to the Admin Dashboard and feeds the Reporting Feed (F09); sustained failure triggers a critical notification (F04) and an exception (F07) |
| Consumed by | Case & Docket Context Service (F01), CM/ECF Adapter itself (F10), Exhibit Setup (F14), Speedy Trial tracker/event ingestion (F26/F27) |

```
┌──────────────┐  poll/webhook   ┌─────────────────────────┐  idempotent   ┌────────────────┐
│   CM/ECF      │────────────────▶│ CM/ECF Integration       │───insert────▶│ cases, parties, │
│  (external,   │                 │ Adapter (Platform Core)  │              │ docket_events,  │
│  authoritative│◄────controlled──│                          │              │ document_refs   │
│  docket)      │     outbound    └───────────┬─────────────┘              └────────────────┘
└──────────────┘     (authorized              │ conflict detected
                       filings only)           ▼
                                      ┌─────────────────┐
                                      │  sync_conflicts   │──▶ Exception Queue (F07) ──▶ human review
                                      └─────────────────┘
```

### 9.2 Identity Provider (IdP)

| Aspect | Detail |
|---|---|
| Purpose | SSO + MFA for internal court users (F00); separately-scoped flow for external attorneys (F12) |
| Protocol | OIDC or SAML 2.0, per court-selected IdP; federal PKI (PIV/CAC) compatibility expected for internal court-user authentication where the court's IdP supports it |
| Audience separation | Internal realm and external attorney portal realm use distinct client IDs/entity IDs (§7.1) — a single IdP technology may serve both, but tokens are not interchangeable between realms |
| Role/scope resolution | The IdP assertion is not assumed to carry JudicialSync-specific role/scope claims; the Identity & ABAC Module resolves role and scope-attribute assignments independently from its own `user_roles`/`scope_assignments` tables, using the IdP assertion only to establish *who* authenticated, not *what* they're entitled to |
| Consumed by | Identity & ABAC Module (F00, core), External Portal (F12), UI workspace routing (F11, depends on resolved role) |

### 9.3 Document / Object Repository

| Aspect | Detail |
|---|---|
| Purpose | Secure storage/reference layer for electronic exhibits, generated packages, and file artifacts (F13, F15, F22, F24) |
| Direction | Bidirectional (upload and retrieval) |
| Storage model | `[ASSUMPTION per FRD Y3]` — store-vs-reference-vs-both is a pilot-validation decision; the architecture implements at minimum a reference layer (`storage_pointer` on `document_references`/`file_references`) with the object store itself holding content when the "store" model is selected, so no schema change is required if the storage-model decision shifts during pilot scoping |
| Security | Server-side encryption at rest (§7.5), malware-scan quarantine gate before any reference becomes usable by downstream workflows, sealed/restricted content logically separated via `security_designations`/`exhibit_designations` policy (not a separate physical bucket, to avoid policy drift between two storage paths) |
| Consumed by | File/Malware Scanning Service (F13, core), Intake Module (F15), Custody Module (F20, condition-note attachments), Jury Package Module (F22), Closeout Module (F24, receipts/audit package) |

### 9.4 Notification Channels (Email, In-App, Other Approved Channels)

| Aspect | Detail |
|---|---|
| Purpose | Outbound alert/notice delivery (F04), consumed by Reconciliation (F18), Custody (F20), Threshold Alerts (F31), Exception Queue (F07) |
| Direction | Outbound, with delivery status (sent/failed/acknowledged) tracked back inbound |
| Channel registry | Extensible — email (SMTP/transactional-email provider) and in-app (WebSocket/poll-based inbox) at MVP; additional channels added via the same `notification_recipients_config` per-court configuration without code changes |
| Content policy enforcement | Templates are reviewed/approved assets (§7.5) — no free-text composition path exists in the delivery pipeline |
| Retry/escalation | BullMQ-backed retry with exponential backoff (minimum 3 attempts) before marking `failed`; persistent failure escalates to the Exception Queue and, for custody/threshold alerts, to a configured secondary recipient |
| Consumed by | Notifications Service (F04, core), F07, F18, F20, F31 |

### 9.5 Courtroom Technology (Display / Jury-Review Hardware)

| Aspect | Detail |
|---|---|
| Purpose | Secure display/streaming of authorized admitted evidence (F22 baseline session-scoped package; F39 deeper integration, Scale increment) |
| Direction | Controlled outbound package/stream only; no uncontrolled copying or public access |
| Credential scope | Registered endpoint credentials (`registered_display_endpoints.integration_credential_hash`) are narrowly scoped to display/stream operations only, structurally distinct from general API access credentials |
| Monitoring | Connection/session health surfaces to system administrators; repeated unauthorized connection attempts escalate as a security exception (F07), not merely a log entry |
| Consumed by | Jury Package Module (F22, baseline), Courtroom Technology Bridge (F39, Scale increment) |

### 9.6 Reporting / Analytics Consumers

| Aspect | Detail |
|---|---|
| Purpose | Operational metrics, backlog, data-quality, and adoption reporting for court administrators and AO program managers (F09 baseline; F38 advanced, Scale increment) |
| Direction | Outbound, de-identified or role-limited |
| Guardrail | No judge-outcome-attributed metric exists in the metric catalog by construction — the Reporting Feed Service's query layer has no schema path from a metric definition to an individual judicial determination, enforced by the metric catalog's own data-access boundary, not merely a policy statement |
| Consumed by | Reporting Feed Service (F09, core), Analytics Module (F38, cross-court trend extension), Portfolio Dashboard (F25/F36, operationally case-identified and viewer-scoped — distinct from the de-identified reporting feed) |

### 9.7 Cross-Cutting Integration Monitoring

Every integration above surfaces health/status metrics (last successful sync, error rate, backlog where applicable) to the Admin Dashboard (F11), with sustained failure triggering both a critical notification (F04) and an exception-queue entry (F07) rather than failing silently. No integration failure may block a user's ability to perform documented manual-fallback procedures — most critically, courtroom deputies must be able to continue real-time exhibit logging via the offline-tolerant local write queue (§8.1) even if the CM/ECF sync or notification channel is unavailable.
