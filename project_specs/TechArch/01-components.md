
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
