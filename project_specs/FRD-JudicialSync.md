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
## F00: Identity and Access Management

**Description:** Provides authentication and fine-grained authorization for every user across both modules, combining single sign-on (SSO), multifactor authentication (MFA), and a role-based + attribute-based access control (RBAC/ABAC) model scoped by court, division, case, proceeding, party role, and security designation. This feature is the gatekeeper for every other feature in the system; no other feature may bypass it.

**Terminology:**
- **Principal:** An authenticated identity (internal court user or external attorney) recognized by the system.
- **Entitlement:** The computed set of actions a principal may perform on a given resource, derived from role + attribute evaluation at request time.
- **Scope Attributes:** The dimensions used for ABAC evaluation — court, division, case, proceeding, party-role, security-designation.
- **Privileged Administrator:** A role class (system administrator, security officer) subject to separation-of-duties controls distinct from routine operational roles.

**Sub-features:**
- SSO integration with the court's identity provider (IdP)
- Multifactor authentication enforcement
- RBAC role catalog (judge, law clerk, courtroom deputy, clerk/case administrator, attorney, jury administrator, court administrator, system administrator) — see `[ASSUMPTION]` below
- ABAC policy evaluation scoped by court/division/case/proceeding/party-role/security-designation
- Session management (timeout, concurrent-session limits, forced logout on role change)
- Privileged-action separation of duties (no single admin role may both grant itself new permissions and perform the privileged action unaudited)
- Least-privilege default (new accounts start with zero module access until explicitly role-assigned)

**`[ASSUMPTION]`:** The PRD/vision document does not resolve the full user-authority matrix (who may create/confirm/override/certify each record type). This FRD assumes a baseline role catalog (judge, law_clerk, courtroom_deputy, clerk_case_admin, attorney_external, jury_admin, court_admin, system_admin, security_officer) with per-feature authority specified in each feature chunk's Validation section, to be revisited during pilot stakeholder validation per PRD §9.3.

**Process:**
1. Principal initiates login via court-configured IdP (SAML/OIDC) — see `Y3-integrations.md` §Identity Provider.
2. System receives IdP assertion, validates signature and expiry.
3. System enforces MFA challenge if not already satisfied by the IdP assertion (configurable per court profile).
4. System resolves principal to an internal user record, loading assigned roles and scope attributes (court/division affiliations).
5. System issues a session token (short-lived access token + refresh token) carrying role and scope claims.
6. On each subsequent API request, the API gateway validates the token and evaluates ABAC policy against the requested resource's court/division/case/proceeding/party-role/security-designation before allowing the handler to execute.
7. On role or scope-attribute change (e.g., reassignment), active sessions are invalidated and the user must re-authenticate to receive updated entitlements.
8. All authentication events (success, failure, MFA challenge outcome, session termination) are emitted as audit events (see F02).

**Inputs:**
- `identity_assertion` (SAML/OIDC token, required): IdP-issued proof of authentication
- `mfa_challenge_response` (string, conditional): required when MFA is enforced
- `requested_resource_scope` (object, implicit on every API call): court_id, division_id, case_id, proceeding_id, security_designation — used for ABAC evaluation, not user-supplied

**Outputs:**
- `session_token` (JWT or equivalent, short-lived)
- `refresh_token` (long-lived, rotation-enabled)
- `entitlements` (computed role + scope claim set returned to the client for UI gating, never trusted as the sole enforcement point — server-side ABAC check is authoritative)

**Validation:**
- MFA is mandatory for all internal court-user roles; external attorney portal (F12) MFA requirement is court-configurable but defaults to required.
- A session token's scope claims must be re-validated against current role/attribute state on every privileged action (no stale-claim trust beyond a configurable short cache window, default 5 minutes).
- A principal with only `attorney_external` role may never receive entitlements scoped to internal-only resources (ledger write, calculation override, audit explorer), regardless of any case association.
- Privileged administrative roles (`system_admin`, `security_officer`) may not self-approve role-grant requests they created (separation of duties).
- Access to a case/proceeding/exhibit/tracker bearing a security designation (sealed, restricted, grand jury, juvenile) requires an explicit additional entitlement beyond the base role, configured per F03.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Invalid or expired IdP assertion | 401 | AUTH_INVALID_ASSERTION | "Authentication failed; please sign in again" |
| MFA challenge failed | 401 | AUTH_MFA_FAILED | "Multifactor verification failed" |
| Session token expired | 401 | AUTH_SESSION_EXPIRED | "Session expired; please sign in again" |
| Insufficient scope for requested resource | 403 | AUTH_SCOPE_DENIED | "You do not have access to this record" |
| Security-designation entitlement missing | 403 | AUTH_DESIGNATION_DENIED | "This record requires additional authorization" |
| Self-approval of privileged role grant attempted | 403 | AUTH_SOD_VIOLATION | "Separation-of-duties violation: cannot approve your own request" |
| IdP unavailable | 503 | AUTH_IDP_UNAVAILABLE | "Authentication service temporarily unavailable" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Identity & Access for `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/entitlements` endpoints.

**Schema Surface (this feature):** uses tables `users`, `roles`, `user_roles`, `scope_assignments`, `sessions` — see `Y0a-schema-shared.md` §Identity.
## F01: Core Case and Docket Data Model

**Description:** Establishes the shared data model — court, division, case, proceeding, hearing, party, docket event, document reference, security designation — consumed by both the Evidentiary Tracking and Speedy Trial modules. This feature prevents each module from building a duplicate, divergent notion of "what case/proceeding/party means," which the PRD identifies as a core root cause of tool fragmentation.

**Terminology:**
- **Court:** A federal district court instance (top-level tenant boundary).
- **Division:** A sub-unit of a court (e.g., geographic division) used for scoping and local numbering.
- **Case:** The top-level matter record, synchronized from or linked to CM/ECF.
- **Proceeding:** A discrete procedural event within a case (e.g., a trial, a hearing session, a motion hearing) that both exhibit activity and Speedy Trial events attach to.
- **Hearing:** A scheduled or held session within a proceeding.
- **Party:** A participant in a case (defendant, plaintiff, government, counsel) with a role designation.
- **Document Reference:** A pointer to a CM/ECF-sourced or internally generated document, preserving the source system's identifier.

**Sub-features:**
- Court/division/case/proceeding/hearing/party entity model with referential hierarchy
- Docket event representation with source-system identifier preservation
- Document reference representation (pointer, not necessarily file storage — see F13/F23 for storage model)
- Security designation tagging at case and document level (sealed, restricted, grand jury, juvenile, PII)
- Shared case-context service/API consumed by both domain modules (no duplicate case model per module)

**Process:**
1. Case record is created either by CM/ECF sync (F10) or manual clerk entry (fallback when sync is unavailable or case predates sync).
2. Court/division association is assigned at case creation and is immutable thereafter (a case does not move between courts).
3. Proceedings and hearings are created under a case, either synced from CM/ECF or manually scheduled by clerk staff.
4. Parties are associated with the case with a role designation (defendant, government, plaintiff, counsel, pro se), sourced from CM/ECF where available.
5. Docket events arrive via F10 or manual entry, each preserving `source_system` and `source_identifier` fields.
6. Document references are created pointing to CM/ECF-sourced documents or internally generated artifacts (exports, packages); the model never embeds the authoritative document content unless F13's storage model `[ASSUMPTION: store]` applies.
7. Security designations are applied at case or document granularity by an authorized clerk/judge action, each designation change producing an audit event.
8. Both domain modules (Evidentiary, Speedy Trial) read case/proceeding/party/docket-event context exclusively through the shared case-context API — no module maintains a shadow copy of this data.

**Inputs:**
- `case_number` (string, required): court-assigned case number, human-readable
- `court_id`, `division_id` (UUID, required)
- `case_caption`, `case_type` (string, required)
- `party[]` (array of {name, role, external_id}, required at least one)
- `security_designation[]` (enum array, optional): sealed | restricted | grand_jury | juvenile | pii

**Outputs:**
- `case` record with resolved court/division/proceeding/party/designation graph
- `case_context` API response consumable by Evidentiary and Speedy Trial modules
- Docket event stream filtered/scoped per consuming module's subscription

**Validation:**
- `case_number` must be unique within its court+division scope.
- A case must have at least one associated party with role `defendant` before a Speedy Trial tracker (F26) may be initialized against it.
- Security designation changes require a role with `case_security_admin` entitlement (typically clerk or judge, per F00 ABAC); courtroom deputies may view but not alter designations.
- Docket events and document references must retain non-null `source_system` + `source_identifier` when originating from CM/ECF; manually entered events are flagged `source_system = 'manual'`.
- A proceeding cannot be deleted once it has associated exhibit or Speedy Trial activity — it may only be marked `closed`.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Duplicate case_number in court/division scope | 409 | CASE_DUPLICATE_NUMBER | "A case with this number already exists in this division" |
| Case missing required defendant party | 422 | CASE_MISSING_DEFENDANT | "At least one defendant party is required" |
| Unauthorized security-designation change | 403 | CASE_DESIGNATION_DENIED | "You are not authorized to change this record's security designation" |
| Attempt to delete proceeding with activity | 409 | CASE_PROCEEDING_IN_USE | "Cannot delete a proceeding with existing exhibit or tracker activity" |
| Docket event missing source identifier | 422 | CASE_EVENT_MISSING_SOURCE | "Imported docket events must include a source identifier" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Case & Docket Model for `/cases`, `/cases/{id}/proceedings`, `/cases/{id}/parties`, `/cases/{id}/docket-events` endpoints.

**Schema Surface (this feature):** uses tables `courts`, `divisions`, `cases`, `proceedings`, `hearings`, `parties`, `docket_events`, `document_references`, `security_designations` — see `Y0a-schema-shared.md` §Case Model.
## F02: Audit Trail and Audit Explorer

**Description:** Captures a tamper-evident, immutable record of every material action across both modules — status changes, rulings, custody transfers, calculation overrides, approvals — and provides an Audit Explorer UI to reconstruct who did what, when, and under which rule or calculation version. This is the system's core accountability mechanism and a binding requirement for appellate-review suitability.

**Terminology:**
- **Material Action:** Any state transition the PRD designates as audit-worthy: status change, ruling, custody transfer, calculation override, approval/confirmation, security-designation change, configuration change.
- **Tamper-Evident:** The audit log is append-only and cryptographically chainable (each entry's hash includes the prior entry's hash) such that any retroactive edit is detectable, even if not cryptographically impossible to attempt.
- **Audit Explorer:** The read-only UI/API surface for reconstructing history by case, user, date range, or object.

**Sub-features:**
- Append-only audit event capture triggered by every material action across both modules
- Hash-chained tamper-evidence (each audit row stores `prev_hash` and `row_hash`)
- Strict separation of audit read access from operational edit access (a user with ledger-edit rights does not automatically get audit-read rights, and vice versa)
- Audit Explorer UI: filter/reconstruct by case, user, date range, object type/ID
- Linkage of every audit entry to the specific configuration/rule-package version or calculation version in effect at action time

**Process:**
1. Any feature performing a material action calls the shared Audit Service (internal API, not directly exposed) with: actor, action type, object type/ID, before-state, after-state, rule/calculation version reference (if applicable), timestamp, and client context (IP, session ID).
2. Audit Service computes `row_hash = hash(row_content + prev_hash)` and persists the entry as a new append-only row; no update or delete operation is ever issued against this table at the application layer, and database-level permissions enforce this (no UPDATE/DELETE grants on the audit table for the application role).
3. Audit entry is immediately queryable via the Audit Explorer API, scoped by the requester's access rights to the underlying case/object (an auditor cannot see sealed-case audit entries without the sealed-record entitlement).
4. Periodic integrity verification job re-walks the hash chain and raises an exception-queue item (F07) if any break is detected.
5. Audit Explorer UI renders a chronological, filterable reconstruction; each entry deep-links to the relevant object detail view (exhibit, tracker, calculation version).

**Inputs:**
- `actor_id` (UUID, required, system-supplied from session — never client-supplied)
- `action_type` (enum, required): status_change | ruling | custody_transfer | calculation_override | approval | designation_change | config_change | access_attempt
- `object_type`, `object_id` (required)
- `before_state`, `after_state` (JSON, required for state-changing actions)
- `rule_version_ref` / `calculation_version_ref` (UUID, conditional — required when the action relates to a versioned calculation or rule package)
- Explorer query inputs: `case_id`, `user_id`, `date_range`, `object_type` (all optional filters)

**Outputs:**
- Persisted audit event row (immutable)
- Audit Explorer result set: chronological list of audit events matching filter, each with actor, action, before/after diff summary, rule/calculation version link

**Validation:**
- Every status-changing operation in F16 (ledger), F17 (courtroom logging), F20 (custody), F29/F30 (calculation/review) **must** emit a corresponding audit event before the operation is considered complete (enforced via transactional outbox pattern — the audit write and the domain write commit atomically, or neither does).
- Audit read access requires a distinct `audit_reader` entitlement, never implied by operational edit roles alone (separation of duties, per NFR "Auditability").
- Sealed/restricted-case audit entries are themselves access-restricted — viewing them requires the same security-designation entitlement as viewing the underlying record, and the *attempt* to view a sealed audit entry without entitlement is itself logged as an audit event (access_attempt).
- Hash-chain verification failures must raise a P0 exception-queue item, not merely a log line.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Audit write fails during transactional domain action | 500 | AUDIT_WRITE_FAILED | "Action could not be completed; audit record failed" (transaction rolled back) |
| Explorer query without audit_reader entitlement | 403 | AUDIT_READ_DENIED | "You do not have audit explorer access" |
| Explorer query against sealed case without designation entitlement | 403 | AUDIT_DESIGNATION_DENIED | "This case's audit history requires additional authorization" |
| Hash-chain integrity break detected | 500 (internal alert, not user-facing) | AUDIT_CHAIN_BROKEN | "Audit integrity check failed — escalated to security officer" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Audit for `/audit/events` (internal write, service-to-service only) and `/audit/explorer` (read, user-facing) endpoints.

**Schema Surface (this feature):** uses table `audit_events` (append-only, hash-chained) — see `Y0a-schema-shared.md` §Audit. Referenced by nearly every other table via `object_type`/`object_id` polymorphic linkage.
## F03: Configuration Engine

**Description:** Allows each court to configure local rules, numbering conventions, thresholds, workflow states, and docket-event-category mappings without requiring separate code branches or deployments. This feature is what makes "national core, local configuration" achievable — every other feature reads its court-specific behavior from here rather than hardcoding it.

**Terminology:**
- **Court Profile:** The named configuration bundle for one court (numbering scheme, local rules reference, security policy, thresholds, workflow states, event mappings).
- **Workflow State Set:** The court-configurable set of named statuses and allowed transitions for a given object type (e.g., exhibit status lifecycle, exclusion review states).
- **Event Mapping:** A court-configurable rule translating a raw CM/ECF docket-event code/description into a normalized internal event category consumed by F27/F28.
- **Rule Package:** A versioned, point-in-time snapshot of a court's active configuration (thresholds + mappings + workflow states) referenced by audit entries and calculation versions for explainability.

**Sub-features:**
- Court profile management (local numbering schemes, local rules references, security policy defaults)
- Configurable workflow states and approval roles per court (which role may transition an object from state A to state B)
- Configurable thresholds and notification rules (consumed by F31, F04)
- Configurable docket-event-category mappings (consumed by F27)
- Versioned configuration changes with full audit trail (every config change is itself a material action per F02)

**Process:**
1. An authorized `court_admin` or `system_admin` opens the Configuration Engine UI, scoped to their assigned court(s).
2. Admin edits a configuration section (numbering scheme, thresholds, workflow states, event mappings) in a draft state.
3. On save, system validates the draft against structural rules (no orphaned workflow states, no threshold with negative value, no event mapping pointing to a non-existent category).
4. System creates a new immutable **rule package version** incorporating the change, with effective-from timestamp; the prior version remains retrievable (never overwritten) for calculation/audit explainability.
5. Change is logged to the audit trail (F02) with before/after diff and the admin's identity.
6. Dependent services (F27 event mapping, F28 exclusion rules, F31 alert thresholds, F16 exhibit numbering) read the currently-effective rule package version at the moment they act, and any new calculation references that version ID.
7. In-flight calculations/trackers that referenced a prior rule-package version are **not** retroactively recalculated automatically — recalculation is an explicit, separately triggered action (see F29) so no silent recalculation occurs purely because configuration changed.

**Inputs:**
- `court_id` (UUID, required, scopes the edit)
- `numbering_scheme` (object: prefix pattern, sequence reset rules)
- `workflow_states[]` (array of {object_type, state_name, allowed_transitions[], required_role})
- `thresholds[]` (array of {threshold_type, value, unit})
- `event_mappings[]` (array of {source_event_code, source_event_description_pattern, internal_category})
- `effective_from` (timestamp, optional — defaults to immediate)

**Outputs:**
- New `rule_package_version` record (immutable once published)
- Updated "currently effective" pointer per court
- Audit event capturing the full diff

**Validation:**
- Workflow state sets must have at least one terminal state and no unreachable states.
- Thresholds must be non-negative and, where tiered (e.g., remaining-time tiers), must be internally ordered without gaps that would leave a value range unclassified.
- Event mappings must not map a single source event code to two different internal categories within the same rule package version (deterministic mapping required).
- Configuration edits require `config_admin` entitlement (distinct from both `system_admin` privileged-admin role and routine operational roles — separation of duties per NFR).
- Publishing a new rule package version requires a second approving user (`[ASSUMPTION]`: maker-checker pattern for configuration changes, since config errors can silently affect Speedy Trial calculations across an entire court's caseload) distinct from the drafting admin.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Draft config fails structural validation | 422 | CONFIG_INVALID_STRUCTURE | "Configuration draft has structural errors: {detail}" |
| Ambiguous event mapping (one code, two categories) | 422 | CONFIG_AMBIGUOUS_MAPPING | "Event code {code} is mapped to multiple categories" |
| Non-admin attempts config edit | 403 | CONFIG_EDIT_DENIED | "You do not have configuration administration access" |
| Same user attempts draft + approval (maker-checker) | 403 | CONFIG_SOD_VIOLATION | "A second approver is required to publish this configuration" |
| Threshold tier gap/overlap detected | 422 | CONFIG_THRESHOLD_GAP | "Threshold tiers must be contiguous and non-overlapping" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Configuration for `/config/court-profiles`, `/config/rule-packages`, `/config/rule-packages/{id}/publish` endpoints.

**Schema Surface (this feature):** uses tables `court_profiles`, `rule_package_versions`, `workflow_state_defs`, `threshold_defs`, `event_mapping_defs` — see `Y0a-schema-shared.md` §Configuration.
## F04: Notifications Service

**Description:** Delivers configurable alerts and notices to authorized users via email, in-application, or other approved channels, without exposing sensitive case details in notification text. Every other alert-producing feature (F18 reconciliation, F20 custody, F31 threshold alerts, F07 exceptions) routes through this shared service rather than implementing its own delivery logic.

**Terminology:**
- **Notification Channel:** A delivery mechanism (email, in-app, other court-approved channel) configured per court/recipient.
- **Content Policy:** The rule set preventing sensitive case/exhibit/defendant detail from appearing in notification bodies or previews, replaced instead by a secure deep link requiring re-authentication.
- **Delivery Status:** The lifecycle state of a notification instance (queued, sent, delivered, failed, acknowledged).

**Sub-features:**
- Multi-channel delivery (email, in-app, extensible channel registry)
- Configurable recipients, cadence, and thresholds per court (reads from F03)
- Delivery-status tracking (sent/failed/acknowledged) with retry on transient failure
- Content policy enforcement preventing sensitive data in notification text/previews

**Process:**
1. A triggering feature (F07, F18, F20, F31, etc.) calls the Notifications Service with: recipient(s) or recipient role, notification type, severity, object reference (case/exhibit/tracker ID — not embedded content), and court context.
2. Notifications Service resolves the court-configured recipient list and channel preferences (F03) for the given notification type.
3. Service applies the content policy: notification body contains only a generic description ("A Speedy Trial threshold has been reached for a case on your docket") plus a secure deep link; it never embeds defendant name, exhibit description, or sealed-case detail in the body or push-preview text.
4. Service renders the notification per channel (email template, in-app banner) and enqueues delivery.
5. Delivery adapter sends via the channel; delivery status (sent/failed) is recorded.
6. For channels supporting read receipts or in-app acknowledgment, the recipient's acknowledgment is recorded and timestamped.
7. Failed deliveries are retried per a configurable backoff policy; persistent failures escalate to the Exception Queue (F7) and, for custody/threshold alerts specifically, to a secondary recipient per F03 escalation configuration.
8. All notification send/delivery/acknowledgment events are logged (not necessarily as full F02 audit events, but as delivery-tracking records queryable by admins — `[ASSUMPTION]`: notification delivery logs are operational records, distinct from the legal-significance-triggering audit trail, though threshold-alert *acknowledgment* specifically does feed F02 since it is evidence a human reviewed a risk signal).

**Inputs:**
- `recipient_role` or `recipient_user_id` (required, at least one)
- `notification_type` (enum, required): exception_raised | reconciliation_discrepancy | custody_unacknowledged | threshold_crossed | approval_needed | config_changed
- `severity` (enum, required): info | warning | critical
- `object_reference` (object_type, object_id — required, used to build the deep link, never embedded content)
- `court_id` (required, for recipient/channel resolution)

**Outputs:**
- Notification instance record with delivery status
- Rendered, policy-compliant message per channel
- Delivery/acknowledgment status queryable by the triggering feature and by admins

**Validation:**
- Notification body/preview text must never contain party names, exhibit descriptions, sealed-case identifiers, or defendant-identifying detail — content policy is enforced by template, not by developer discipline alone (templates are reviewed/approved assets, not free-text).
- A notification type with no configured recipient for a given court must raise a configuration exception (F07), not silently fail to send.
- Threshold-crossed and custody-unacknowledged notifications require escalation-cadence configuration (F03) with a defined maximum unacknowledged duration before secondary escalation fires.
- Email channel delivery failures are retried at least 3 times with exponential backoff before being marked `failed` and escalated.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| No recipient configured for notification type/court | 422 | NOTIFY_NO_RECIPIENT_CONFIGURED | "No recipient is configured for this alert type in this court" |
| Delivery channel unavailable | 502 | NOTIFY_CHANNEL_UNAVAILABLE | "Notification channel temporarily unavailable; retry scheduled" |
| Content policy violation detected in template render | 500 (internal, blocks send) | NOTIFY_CONTENT_POLICY_VIOLATION | "Notification blocked: content policy violation detected" |
| Persistent delivery failure after retries | 502 | NOTIFY_DELIVERY_FAILED | "Notification could not be delivered after retries" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Notifications for `/notifications` (internal service-to-service trigger), `/notifications/my` (user-facing inbox), `/notifications/{id}/acknowledge` endpoints.

**Schema Surface (this feature):** uses tables `notifications`, `notification_deliveries`, `notification_recipients_config` — see `Y0a-schema-shared.md` §Notifications.
## F05: Search Service

**Description:** Provides cross-module, access-scoped search by identifier, party, witness, status, date, description, or proceeding, so authorized users can retrieve exhibits, trackers, and case objects without browsing full case hierarchies. Search results strictly respect each user's access scope, never exposing sealed/restricted records to unauthorized users even as a search hit without content.

**Terminology:**
- **Search Index:** The denormalized, access-tagged index of searchable objects (exhibits, trackers, docket events, documents) rebuilt/updated incrementally as source records change.
- **Access-Scoped Result:** A search result filtered at query time (not merely at render time) so that unauthorized records produce zero hits, not a redacted placeholder hit.

**Sub-features:**
- Full-text and structured search across exhibits, Speedy Trial trackers, and case objects
- Filters: identifier, party, witness, status, date range, free-text description, proceeding
- Access-scoped result filtering (sealed/restricted records excluded unless requester holds the entitlement)

**Process:**
1. User submits a search query (free text and/or structured filters) via the Search API.
2. Service resolves the user's access scope (court/division/case assignments, security-designation entitlements) from F00.
3. Service queries the search index with the user's scope as a mandatory pre-filter — the index itself is access-tagged at write time so unauthorized documents are excluded from the candidate set before relevance ranking, not filtered post-hoc.
4. Service returns ranked results with object type, summary snippet, and a deep link; sealed/restricted object summaries are fully excluded (no "restricted result" placeholder is shown, to avoid confirming the existence of a sealed matter to an unauthorized user — `[ASSUMPTION]`: existence-of-record itself may be sensitive for sealed cases; this is flagged for pilot validation per PRD §9.3 sealed-handling open question).
5. Index updates: whenever a source record (exhibit, tracker, docket event) changes status, security designation, or content, an index-update event is emitted so search results remain current within a bounded staleness window (target: near-real-time, exact SLA is a TechArch concern).

**Inputs:**
- `query_text` (string, optional)
- `filters` (object, optional): `identifier`, `party_name`, `witness_name`, `status`, `date_from`, `date_to`, `proceeding_id`
- Implicit: requester's access scope (not user-supplied)

**Outputs:**
- Ranked result list: `{object_type, object_id, summary_snippet, deep_link, last_updated}`
- Zero results (not an error) when no matches exist or are authorized

**Validation:**
- Index pre-filtering by access scope is mandatory and occurs before ranking, not after — a relevance-ranked-then-filtered design is explicitly disallowed since it risks information leakage through ranking side effects (e.g., result count hints).
- Free-text queries must not search within sealed/restricted document *content* even for authorized users beyond what the object's designated access level permits (e.g., a user authorized for "restricted" but not "grand_jury" designation must not have grand-jury content searchable).
- Search queries themselves are not treated as material actions requiring F02 audit entries by default, except queries that return or attempt to return sealed/restricted results, which are logged as access_attempt audit events.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Query malformed (invalid filter combination) | 400 | SEARCH_INVALID_QUERY | "Search query is invalid: {detail}" |
| Search index unavailable | 503 | SEARCH_INDEX_UNAVAILABLE | "Search is temporarily unavailable" |
| Result set exceeds pagination limit without pagination params | 400 | SEARCH_PAGINATION_REQUIRED | "Please refine your search or use pagination" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Search for `/search` endpoint.

**Schema Surface (this feature):** uses a dedicated `search_index` table/materialized view (access-tagged, denormalized from `exhibits`, `defendant_trackers`, `docket_events`, `document_references`) — see `Y0a-schema-shared.md` §Search Index.
## F06: Work Queue and Task Management

**Description:** Surfaces items requiring user action — pending reviews, unresolved exceptions, approvals — in role-scoped queues, so users work from a prioritized list instead of searching entire cases for what needs attention. This feature is the primary "inbox" pattern consumed by courtroom deputies, clerks, and chambers across both modules.

**Terminology:**
- **Task:** A unit of required human action (review a candidate exclusion, resolve an exception, approve a configuration change, acknowledge a custody transfer) with an owner role/user, status, and due/age indicator.
- **Work Queue:** A role-scoped, filterable view aggregating open tasks relevant to the viewing user.

**Sub-features:**
- Role-scoped task/work-queue views (deputy, clerk, chambers, admin)
- Task assignment, status, and completion tracking
- Cross-module aggregation (exhibit tasks + Speedy Trial tasks in one view where appropriate)

**Process:**
1. A triggering feature (F18 reconciliation discrepancy, F28 candidate exclusion, F30 approval request, F33 continuance findings flag) creates a task via the Task API: task type, owner role or specific user, related object reference, priority, created timestamp.
2. Task appears in the relevant role-scoped work queue(s) — e.g., a candidate exclusion task appears in the chambers/clerk queue per F03 workflow-role configuration.
3. User opens a task from the queue, which deep-links to the underlying object's detail/review view (e.g., F28's candidate exclusion review screen).
4. User completes the required action in the source feature (accept/reject/resolve); the source feature marks the task `completed` with a reference to the resulting audit event (F02).
5. Completed tasks age out of the active queue but remain queryable in a completed-task history for a configurable retention window.
6. Tasks that remain open beyond a configured age threshold are flagged (visually and optionally via F04 escalation notification) to support the "aging indicators" requirement shared with F07.

**Inputs:**
- `task_type` (enum, required): exception_resolution | exclusion_review | approval_request | custody_acknowledgment | continuance_findings_review | config_approval
- `owner_role` or `owner_user_id` (required, at least one)
- `object_reference` (object_type, object_id, required)
- `priority` (enum, optional, default `normal`): low | normal | high | urgent

**Outputs:**
- Task record with current status (`open`, `in_progress`, `completed`, `dismissed`)
- Role-scoped queue view: list of open tasks sorted by priority then age
- Cross-module aggregate view (exhibit + Speedy Trial tasks combined, filterable by module)

**Validation:**
- A task cannot be marked `completed` without a reference to the audit event produced by the underlying completing action (no "quiet" task dismissal that leaves no audit trace for a legally significant action).
- Tasks related to legally significant actions (exclusion review, approval request, continuance findings review) cannot be `dismissed` without a captured rationale (shared requirement with F07).
- A task's owner_role assignment must resolve to at least one user with that role in the relevant court/division scope at creation time; otherwise the task creation itself raises an exception (F07) rather than silently creating an orphaned task.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Task created with unresolvable owner_role | 422 | TASK_NO_ELIGIBLE_OWNER | "No user holds the required role to receive this task" |
| Dismiss attempted without rationale on legally significant task | 422 | TASK_RATIONALE_REQUIRED | "A rationale is required to dismiss this task" |
| Complete attempted without audit event reference | 500 (internal guard) | TASK_MISSING_AUDIT_REF | "Task cannot be completed without an audit record" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Work Queue for `/tasks`, `/tasks/my-queue`, `/tasks/{id}/complete`, `/tasks/{id}/dismiss` endpoints.

**Schema Surface (this feature):** uses table `tasks` — see `Y0a-schema-shared.md` §Work Queue.
## F07: Exception Queue

**Description:** A dedicated, cross-module queue highlighting data-quality issues — discrepancies, missing required fields, unmapped docket events, conflicting logs, incomplete approvals — so staff resolve them before they cause downstream errors (a stale ledger, a miscalculated Speedy Trial date). This feature operationalizes the PRD's "no proactive risk surfacing" root-cause fix.

**Terminology:**
- **Exception:** A flagged condition requiring human review and a documented resolution rationale before it can be closed.
- **Aging Indicator:** A visual/sortable signal showing how long an exception has remained unresolved, used to prioritize the oldest items.

**Sub-features:**
- Cross-module exception surfacing (exhibit reconciliation mismatches from F18, unmapped Speedy Trial events from F27, incomplete metadata from F15)
- Required rationale capture on exception resolution
- Age/aging indicators to prioritize oldest unresolved exceptions

**Process:**
1. A source feature (F15 intake validation, F18 reconciliation, F27 event mapping, F02 hash-chain integrity check) detects a condition meeting its exception criteria and creates an exception record: type, severity, object reference, detected timestamp, detecting feature.
2. Exception appears in the Exception Queue, filterable by module, type, severity, and age; a corresponding task (F6) is created for the owning role.
3. Authorized user opens the exception, reviews the detail (e.g., the specific field mismatch, the two conflicting log entries, the unmapped event's raw CM/ECF code), and takes a resolution action specific to the exception type (correct a field, accept one of two conflicting values, map an event to a category).
4. User must supply a resolution rationale (free text, minimum length enforced) before the exception can be marked `resolved`.
5. Resolution and rationale are logged as an audit event (F02); the exception's age-at-resolution is recorded for the F09 reporting feed.
6. Unresolved exceptions beyond a configured age threshold escalate via F04 notification to a supervisory role.

**Inputs:**
- `exception_type` (enum, required): reconciliation_mismatch | missing_metadata | unmapped_docket_event | conflicting_log_entry | incomplete_approval | audit_integrity_break
- `severity` (enum, required): low | medium | high | critical
- `object_reference` (object_type, object_id, required)
- `detail` (JSON, required): structured description of the discrepancy (e.g., field name, conflicting values, source raw event)
- Resolution input: `resolution_action` (enum, type-specific), `rationale` (string, required, min length enforced, e.g. 10 characters)

**Outputs:**
- Exception record with status (`open`, `in_review`, `resolved`, `escalated`)
- Exception Queue view: filterable, sortable by age/severity
- Resolution audit event with rationale attached

**Validation:**
- An exception cannot be marked `resolved` without a non-empty rationale meeting the minimum length/quality bar (`[ASSUMPTION]`: minimum 10 characters, not a single word — exact threshold is a UX/policy decision for pilot validation).
- Critical-severity exceptions (e.g., audit_integrity_break) cannot be auto-closed by any batch process; they require explicit individual review.
- An exception's resolution action must be type-appropriate (e.g., a `reconciliation_mismatch` exception's resolution must reference which source value was accepted, not an arbitrary free-text-only resolution).
- Exceptions related to legally significant data (unmapped Speedy Trial events, continuance findings gaps) must route to a role with the appropriate review authority per F03 workflow configuration, not merely any available clerk.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Resolve attempted without rationale | 422 | EXCEPTION_RATIONALE_REQUIRED | "A resolution rationale is required" |
| Resolve attempted with rationale below minimum length | 422 | EXCEPTION_RATIONALE_TOO_SHORT | "Rationale must be at least 10 characters" |
| Critical exception auto-close attempted | 403 (internal guard) | EXCEPTION_CRITICAL_MANUAL_ONLY | "Critical exceptions require individual manual review" |
| Resolution action type mismatch | 422 | EXCEPTION_ACTION_TYPE_MISMATCH | "Resolution action does not match exception type" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Exception Queue for `/exceptions`, `/exceptions/{id}/resolve` endpoints.

**Schema Surface (this feature):** uses table `exceptions` — see `Y0a-schema-shared.md` §Exception Queue.
## F08: Case Timeline View

**Description:** A unified chronological view combining docket events, hearings, evidentiary actions, Speedy Trial clock periods, and key decisions for a given case, so judges, chambers, and clerks see case history in context rather than switching between module-specific screens.

**Terminology:**
- **Timeline Entry:** A single chronologically-placed item sourced from docket events, hearings, exhibit status changes, or Speedy Trial timeline segments.
- **Deep Link:** A navigational link from a timeline entry to the full underlying detail record (exhibit detail, calculation version detail).

**Sub-features:**
- Chronological merge of docket events, hearings, exhibit actions, and Speedy Trial clock segments
- Filterable by event type, date range, or module
- Deep links into underlying exhibit or Speedy Trial detail records

**Process:**
1. User opens the Case Timeline view for a case they are authorized to access.
2. Service queries the shared case-context (F01) for docket events and hearings, the Evidentiary module for exhibit status changes (F16/F17), and the Speedy Trial module for timeline segments and confirmed exclusions (F29).
3. Service merges all sourced entries into a single chronologically ordered list, each tagged with its originating module and entry type.
4. User applies optional filters (event type, date range, module) to narrow the view.
5. User selects an entry to deep-link into its full detail record (e.g., clicking an exhibit ruling entry opens the F16 exhibit detail with the ruling highlighted).
6. Entries bearing a security designation the user lacks entitlement for are excluded from the merged view entirely (not shown as a redacted placeholder), consistent with F05's access-scoped result handling.

**Inputs:**
- `case_id` (UUID, required)
- `filters` (optional): `event_type[]`, `date_from`, `date_to`, `module[]` (evidentiary | speedy_trial | docket)

**Outputs:**
- Merged, chronologically ordered timeline entry list, each with `{source_module, entry_type, timestamp, summary, deep_link}`

**Validation:**
- Timeline merge must preserve true chronological order across sources with differing timestamp precision (docket events may carry only a date, exhibit/clock events carry full timestamps) — same-day entries are secondarily ordered by entry creation sequence.
- Security-designation filtering is applied identically to the F05 search access-scoping rule: unauthorized entries are fully excluded, not redacted.
- Timeline view must reflect the currently confirmed state of Speedy Trial segments (not proposed/candidate exclusions) by default, with an explicit toggle to additionally show pending/candidate items for authorized reviewers (avoids presenting unconfirmed data as settled fact in a judge-facing view).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Case not found or not authorized | 404 | TIMELINE_CASE_NOT_FOUND | "Case not found or not accessible" |
| Invalid date range filter (from > to) | 400 | TIMELINE_INVALID_RANGE | "Date range is invalid" |
| Underlying module service unavailable (partial timeline) | 206 (partial content) | TIMELINE_PARTIAL_DATA | "Some timeline sources are temporarily unavailable" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Case Timeline for `/cases/{id}/timeline` endpoint.

**Schema Surface (this feature):** read-only aggregation view over `docket_events`, `hearings`, `exhibits` status history, `timeline_segments` (Speedy Trial) — no dedicated table; see `Y0a-schema-shared.md` §Case Timeline (view definition).
## F09: Operational Reporting Feed

**Description:** Produces outbound, role-limited or de-identified operational metrics (backlog, data quality, adoption indicators) for court administrators and AO program managers, explicitly guarded against influencing judicial determinations. This is administrative analytics, not case-outcome analytics.

**Terminology:**
- **De-identified Export:** A reporting output with defendant/party/attorney identifying detail removed or aggregated beyond re-identification risk for the intended audience.
- **Adoption Indicator:** A metric reflecting system usage health (e.g., manual-parallel-tracking incidents, task completion rates) rather than case substance.

**Sub-features:**
- Operational dashboards for configuration consistency, backlog age, and adoption metrics
- Role-limited / de-identified export suitable for administrative review
- Explicit design guard against using aggregate analytics to alter judicial decisions

**Process:**
1. Reporting feed periodically aggregates operational metrics from F06 (task completion), F07 (exception age/volume), F18 (reconciliation discrepancy counts), F31 (alert delivery/acknowledgment rates) across the admin's authorized court/division scope.
2. Aggregation applies de-identification rules appropriate to the requesting role (court_admin sees court-level aggregates without defendant names; AO program manager may see cross-court aggregates with court-level, not case-level, granularity).
3. Dashboard renders metrics with no drill-through path into individual case/defendant records for the de-identified view tier (drill-through to case detail requires the viewer's own independent case-access entitlement, not granted by the reporting feed itself).
4. Export (CSV/structured) is generated on demand, carrying the same de-identification rules as the dashboard.
5. All reporting outputs carry a persistent UI label: "Administrative metrics — not for use in case determinations," reinforcing the human-in-command NFR.

**Inputs:**
- `scope` (court_id, division_id, or cross-court per role entitlement)
- `metric_set[]` (requested metric categories): backlog_age | exception_volume | adoption_rate | config_consistency | alert_effectiveness
- `date_range` (optional)

**Outputs:**
- Dashboard view with aggregate metrics, charts, trend indicators
- On-demand export file (CSV/structured), de-identified per role

**Validation:**
- Court-level dashboards must not expose individual defendant names, party names, or attorney names in aggregate metric displays — only counts, rates, and ages.
- Cross-court (AO-level) views aggregate at court granularity minimum; no cross-court view may expose single-case-level detail.
- Export access requires a distinct `reporting_viewer` entitlement, separate from operational edit roles.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Requester lacks reporting_viewer entitlement | 403 | REPORT_ACCESS_DENIED | "You do not have reporting access" |
| Requested scope exceeds role's authorized aggregation level | 403 | REPORT_SCOPE_DENIED | "This aggregation level is not available to your role" |
| Export requested for unsupported metric combination | 422 | REPORT_INVALID_METRIC_SET | "Requested metric combination is not supported" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Reporting for `/reporting/dashboard`, `/reporting/export` endpoints.

**Schema Surface (this feature):** read-only aggregation over `tasks`, `exceptions`, `reconciliation_runs`, `notification_deliveries` — no dedicated writable table; see `Y0a-schema-shared.md` §Reporting (aggregate view definitions).
## F10: CM/ECF Integration Adapter

**Description:** A controlled, primarily inbound adapter synchronizing case, party, docket-event, order, and document-reference data from CM/ECF (or a successor case-management platform), preserving the docket as the single authoritative source. This feature is the enforcement point for the system's "authoritative-source discipline" principle — it is architecturally impossible for JudicialSync to silently overwrite docket data because this adapter is the only inbound path and it never performs a blind overwrite.

**Terminology:**
- **Authoritative Source:** CM/ECF (or successor); its data always wins in a conflict unless a human explicitly overrides via a documented exception resolution.
- **Sync Conflict:** A detected mismatch between an incoming CM/ECF record and the existing JudicialSync record for the same source identifier.

**Sub-features:**
- Inbound sync of case/party/docket-event/order/document-reference data
- Source-identifier preservation on all imported records
- No silent overwrite of docket data — conflicts route to human review (F07)
- Controlled outbound references/filings only where explicitly authorized

**`[ASSUMPTION]`:** The PRD/vision document leaves open which CM/ECF events, orders, and documents are available via supported interfaces and their latency (PRD §9.3, vision §9.3). This FRD assumes a polling- or webhook-based adapter (exact mechanism is a TechArch decision) that treats any field present in the CM/ECF feed as authoritative and any field CM/ECF does not expose as locally-managed metadata layered on top of the synced record.

**Process:**
1. Adapter receives or polls for new/updated case, party, docket-event, order, and document-reference records from CM/ECF, each carrying a CM/ECF-native identifier.
2. For a new source identifier not yet known to JudicialSync, adapter creates the corresponding internal record (F01 case/party/docket-event/document-reference), storing `source_system = 'CM/ECF'` and `source_identifier`.
3. For an existing source identifier, adapter compares incoming field values against the current JudicialSync record. If all CM/ECF-authoritative fields match, no action is taken (or a `last_synced_at` timestamp is refreshed).
4. If a CM/ECF-authoritative field differs from the current JudicialSync value AND the JudicialSync value was never locally modified, adapter updates the field automatically (this is not an overwrite-of-local-edit, merely applying a fresh authoritative value).
5. If a CM/ECF-authoritative field differs from the current JudicialSync value AND the JudicialSync value *was* locally modified (e.g., a clerk corrected a party name pending CM/ECF catch-up), adapter does **not** auto-overwrite; it creates a Sync Conflict exception (F07) for human resolution.
6. Resolved conflicts are logged to the audit trail (F02) with both the CM/ECF value and the locally-chosen value, and the chosen value is explicitly marked `source_system = 'CM/ECF'` or `'manual_override'` accordingly.
7. Controlled outbound operations (e.g., a generated post-trial closeout package referenced back to the docket) occur only through an explicitly authorized, separately permissioned outbound path — never as a side effect of inbound sync.
8. Adapter health (last successful sync time, error rate, backlog) is monitored and surfaced to system administrators; prolonged sync failure triggers an F04 critical alert.

**Inputs:**
- Inbound CM/ECF feed records: case, party, docket_event, order, document_reference (schema per CM/ECF interface spec — `[ASSUMPTION]`: exact schema is a TechArch/integration-contract concern, treated here as an opaque structured payload with the fields enumerated in F01/F01's docket event model)
- `source_identifier` (required on every inbound record)

**Outputs:**
- Created/updated internal case/party/docket-event/document-reference records with source lineage preserved
- Sync Conflict exception records (F07) for unresolved mismatches
- Adapter health/status metrics (for F09, admin dashboards)

**Validation:**
- No inbound record may be persisted without a non-null `source_identifier`.
- No automated process may overwrite a JudicialSync field that has a recorded local modification without first routing through conflict resolution — this is enforced structurally (the adapter checks a `locally_modified` flag before applying any authoritative update), not merely by convention.
- Outbound filings/references require a distinct `docket_outbound` entitlement and are themselves audit-logged as a material action.
- Duplicate inbound delivery (same source_identifier, same payload, redelivered) must be idempotent — no duplicate internal records or duplicate conflict exceptions are created.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Inbound record missing source_identifier | 422 | CMECF_MISSING_SOURCE_ID | "Inbound record rejected: missing source identifier" |
| Sync conflict detected (locally modified field vs. new CM/ECF value) | 409 (internal, routes to F07) | CMECF_SYNC_CONFLICT | "Docket update conflicts with a local modification; routed for review" |
| CM/ECF feed unavailable / sync failure | 503 | CMECF_UNAVAILABLE | "CM/ECF synchronization is currently unavailable" |
| Unauthorized outbound filing attempt | 403 | CMECF_OUTBOUND_DENIED | "You are not authorized to submit outbound docket references" |
| Duplicate inbound delivery detected | 200 (idempotent no-op, logged) | CMECF_DUPLICATE_IGNORED | "Duplicate delivery ignored" |

**API Surface (this feature):** see `Y1a-api-shared.md` §CM/ECF Adapter for `/integrations/cmecf/sync` (inbound webhook/poll endpoint), `/integrations/cmecf/status`, `/integrations/cmecf/outbound` endpoints.

**Schema Surface (this feature):** uses tables `docket_events`, `document_references`, `parties`, `cases` (via `source_system`/`source_identifier`/`locally_modified` columns), plus a dedicated `sync_conflicts` and `adapter_health_log` table — see `Y0a-schema-shared.md` §CM/ECF Integration.
## F11: Role-Specific UI Workspaces

**Description:** Purpose-built interfaces for each primary user type — judge/chambers, clerk operations, courtroom deputy, administrator — each optimized for that role's working pattern rather than a one-size-fits-all screen, all built on USWDS components for Section 508 accessibility and federal UX consistency.

**Terminology:**
- **Workspace:** A role-tailored composition of shared components (work queue, timeline, search, exception queue) arranged for a specific user's working pattern.
- **USWDS Component:** A U.S. Web Design System UI building block (buttons, forms, tables, banners) used for all surfaces per the binding design-system constraint.

**Sub-features:**
- Judge/chambers workspace (decision and oversight views)
- Clerk operations console (case and portfolio operations)
- Courtroom deputy interface (real-time, low-friction operational use)
- Administrative dashboard (adoption, configuration, metrics)
- All workspaces built on USWDS components

**Process:**
1. On login, the system determines the user's primary role (F00) and routes to the corresponding default workspace (configurable per user if they hold multiple roles).
2. **Judge/chambers workspace** composes: case timeline (F08), pending approval tasks (F06, scoped to ruling/exclusion/finding review), exhibit status oversight (F16 read + ruling action), Speedy Trial explain-this-date view (F29), case conference view (F35).
3. **Clerk operations console** composes: case/proceeding setup (F14), pretrial intake queue (F15), exception queue (F07), reconciliation checkpoint actions (F18), portfolio dashboards (F25/F36).
4. **Courtroom deputy interface** composes: real-time courtroom logging (F17) as the primary full-screen surface, with minimal chrome, large touch targets, and keyboard shortcuts; secondary access to custody transfer recording (F20) and session-end reconciliation (F18).
5. **Administrative dashboard** composes: configuration engine (F03), identity/role management (F00), operational reporting feed (F09), adapter health (F10).
6. Every workspace is implemented using USWDS component library and patterns; accessibility (Section 508) conformance is a release gate verified via automated and manual testing before any workspace ships.

**Inputs:**
- `user_role` (resolved from F00 session)
- `workspace_preference` (optional, for multi-role users to select a default landing workspace)

**Outputs:**
- Rendered role-specific workspace composed of shared components, each component independently access-scoped per F00/F05 rules

**Validation:**
- No workspace may expose an action the user's role/entitlement does not permit merely because the component is present (component visibility reflects entitlement, not just role label — e.g., a clerk viewing the judge workspace layout, if permitted read-only access, never sees an enabled "confirm ruling" control).
- All workspaces must pass automated Section 508 accessibility checks (axe-core or equivalent) and a manual screen-reader pass before release; this is a non-negotiable release gate, not a backlog item.
- Courtroom deputy interface interactions (offer/objection/ruling entry) must be completable via keyboard alone, without requiring mouse/touch, to support courtroom speed and accessibility simultaneously.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| User has no role mapped to any workspace | 403 | UI_NO_WORKSPACE_ASSIGNED | "No workspace is configured for your account; contact an administrator" |
| Workspace component fails to load (dependent service down) | 206 (partial) | UI_COMPONENT_UNAVAILABLE | "Part of this workspace is temporarily unavailable" |

**API Surface (this feature):** Workspaces are composition layers over the per-feature APIs already cataloged (F06, F07, F08, F14–F20, F29, F35); no dedicated workspace-only API beyond `/users/me/workspace-preference` in `Y1a-api-shared.md` §UI Workspaces.

**Schema Surface (this feature):** uses `users` table's `workspace_preference` column; no additional dedicated tables — see `Y0a-schema-shared.md` §Identity.
## F12: Restricted External Attorney Portal

**Description:** A scoped external portal allowing authorized attorneys to submit structured exhibit metadata and view authorized deadline information, without any ability to alter the official record. This portal operates under a separate authentication/authorization scope from internal court users, consistent with the PRD's "no direct write access to official ledger, docket, or calculation status" principle.

**Terminology:**
- **External Principal:** An attorney/authorized-party identity authenticated through a portal-specific identity flow, distinct from internal court SSO.
- **Proposed Submission:** Attorney-submitted exhibit metadata or deficiency correction, which always enters the system in a "proposed" state requiring clerk/deputy acceptance (F15) — never directly written to the authoritative ledger.

**Sub-features:**
- Structured exhibit metadata submission (proposed exhibits, corrections to deficiencies)
- Authorized, read-only Speedy Trial deadline visibility where the court permits
- No direct write access to official ledger, docket, or calculation status
- Separate authentication/authorization scope from internal court users

**`[ASSUMPTION]`:** The PRD/vision document leaves open exactly what information external counsel may view or submit and at what case stage (PRD §9.3). This FRD assumes: (a) attorneys may submit proposed exhibit metadata only for cases/proceedings where they are a recorded party-of-record (per F01 party role), (b) Speedy Trial visibility is limited to a read-only "confirmed calculation summary" (remaining time, next threshold, confirmed trigger/exclusion periods) without full explainability detail or override history, and (c) exact scope is court-configurable per F03 and must be revalidated during pilot engagement.

**Process:**
1. Attorney authenticates via the portal-specific identity flow (separate IdP registration/scope from F00 internal SSO, though it may share the same underlying IdP technology — see `Y3-integrations.md` §Identity Provider).
2. System resolves the attorney's party-of-record associations (which cases/proceedings they are authorized to interact with) from F01 party records.
3. Attorney submits structured exhibit metadata (proposed exhibit list, corrections to a previously flagged deficiency) via a portal-specific intake form; submission is created in `proposed` state and routed into the standard F15 pretrial intake validation/exception flow — identical downstream handling to internally-submitted exhibits, distinguished only by `submitted_via = 'external_portal'`.
4. Attorney views a read-only Speedy Trial summary for their associated defendant(s), scoped per the court's configured visibility level (F03).
5. Attorney has no UI affordance, and the API enforces no entitlement, for any write operation against the ledger (F16), docket (F10), or calculation state (F29/F30) — all such endpoints reject external-principal tokens regardless of any case association.

**Inputs:**
- Portal login credentials / external IdP assertion
- `exhibit_metadata_submission` (same structured shape as F15 intake, plus `submitted_via = 'external_portal'`)
- Query: `defendant_tracker_summary` (read-only, for Speedy Trial visibility)

**Outputs:**
- Submission confirmation (routed to F15 intake queue, status = `pending_review`)
- Read-only Speedy Trial summary view (remaining time, next threshold, confirmed periods only — no candidate/proposed detail unless `[ASSUMPTION]` visibility level is configured broader by the court)

**Validation:**
- External principal tokens are structurally distinct from internal session tokens (different token issuer/audience claim) so that no internal API can be invoked by mistake using a portal token even if an endpoint's authorization check were misconfigured (defense in depth).
- An attorney may only submit metadata or view deadline information for cases where they hold an active party-of-record association; this association itself is sourced from CM/ECF via F01/F10, not self-asserted by the attorney.
- All external submissions are immutably logged with `submitted_via = 'external_portal'` and the submitting attorney's identity, feeding the same audit trail (F02) as internal submissions.
- Sealed/restricted/grand-jury/juvenile cases are never visible through the portal regardless of party-of-record status, unless explicitly and individually authorized by the court (`[ASSUMPTION]`: default-deny for all security-designated cases in the external portal).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Attorney attempts write to ledger/docket/calculation endpoint | 403 | PORTAL_WRITE_DENIED | "External users cannot modify the official record" |
| Attorney has no party-of-record association for the case | 403 | PORTAL_NOT_PARTY_OF_RECORD | "You are not associated with this case" |
| Attorney attempts to view a security-designated case | 403 | PORTAL_DESIGNATION_DENIED | "This case is not available through the external portal" |
| External IdP assertion invalid/expired | 401 | PORTAL_AUTH_FAILED | "Authentication failed; please sign in again" |

**API Surface (this feature):** see `Y1a-api-shared.md` §External Portal for `/portal/submissions`, `/portal/trackers/{id}/summary` endpoints (fully distinct base path and auth middleware from internal APIs).

**Schema Surface (this feature):** reuses `exhibits` (intake rows tagged `submitted_via`), `defendant_trackers` (read projection only); no dedicated external-only tables beyond `external_principals` — see `Y0a-schema-shared.md` §External Portal.
## F13: Security and Compliance Baseline

**Description:** Platform-wide security controls required for federal court operation, applied consistently across both modules — encryption, malware scanning, sensitive-record handling policy, retention/disposition schedules, and documented manual-fallback/recovery procedures. This feature is the non-functional backbone every other feature depends on rather than implementing independently.

**Terminology:**
- **Sensitive Record:** Any case/document/exhibit bearing a security designation (sealed, restricted, grand jury, juvenile, PII).
- **Retention Schedule:** A court/record-category-specific configuration defining how long a record category is retained before disposition action is required.
- **Manual Fallback:** A documented operational procedure for continuing essential courtroom operation (exhibit logging, Speedy Trial awareness) during a system or integration outage.

**Sub-features:**
- Encryption in transit and at rest; secure key management
- Malware scanning and approved file-type controls on uploads
- Sealed/restricted/grand-jury/juvenile/PII handling via explicit policy configuration (not ad hoc code paths)
- Configurable retention and disposition schedules by record category
- Documented manual-fallback and recovery procedures for courtroom or integration disruption

**`[ASSUMPTION]`:** The vision document's open decision on exhibit file storage model (store vs. reference vs. both) is carried forward unresolved here; this feature specifies the security controls applicable to *whichever* storage model TechArch selects, assuming at minimum a reference-layer exists and file storage (if implemented) is behind the same encryption/scanning controls.

**Process:**
1. All data at rest (database, object store) is encrypted using a managed key service; all data in transit uses TLS 1.2+ with no fallback to unencrypted transport.
2. Any file upload (exhibit intake F15, custody condition photos F20) passes through a malware-scanning gate before being accepted into the reference layer; scanning failure routes to rejection with a user-facing reason, never silent acceptance.
3. Approved file-type allowlist (per court configuration, F03) is enforced at upload; disallowed types are rejected before scanning is even attempted.
4. Every object (case, document, exhibit) carrying a security designation is evaluated against the centrally-defined policy engine (not per-feature if/else logic) to determine access — the policy engine is a single reusable service consumed by F00's ABAC evaluation, F05 search filtering, F08 timeline filtering, and F21 exhibit sealing.
5. Retention schedules are configured per record category (exhibit, document, audit event, notification) and court (F03); a scheduled disposition job surfaces due-for-disposition records as tasks (F06) for human action — no record is auto-purged without a human-confirmed disposition action for any category deemed court-record-significant.
6. Manual fallback procedures (documented runbook, not purely a software feature) are exercised and validated during pilot scenario testing (vision §8.3); the system supports fallback by ensuring deputies can resume real-time logging promptly after an outage without data loss (local draft persistence / fast resync).

**Inputs:**
- File upload: `file_binary`, `file_type`, `declared_purpose` (exhibit | custody_condition_note | package_artifact)
- Security designation policy config (from F03)
- Retention schedule config (from F03): `{record_category, retention_period, disposition_action}`

**Outputs:**
- Accepted file reference (post-scan) or rejection with reason
- Policy evaluation result (allow/deny) consumed by requesting feature
- Disposition-due task list (F06)

**Validation:**
- No file is persisted to the reference/storage layer until malware scan completes successfully.
- File types outside the court-configured allowlist are rejected regardless of scan result.
- Security designation policy changes are themselves rule-package-versioned (F03) and audit-logged (F02) — no designation policy may be altered via direct data edit outside the configuration engine.
- Retention schedule disposition actions require human confirmation via a task (F06); no automated hard-delete of any record category is permitted without this gate.
- Encryption key rotation and access must be restricted to the `security_officer` privileged role, separate from `system_admin` routine administration (separation of duties).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Upload fails malware scan | 422 | SECURITY_MALWARE_DETECTED | "File rejected: failed security scan" |
| Upload file type not in allowlist | 422 | SECURITY_FILE_TYPE_DENIED | "This file type is not permitted" |
| Policy engine evaluation failure (fail-closed) | 503 | SECURITY_POLICY_UNAVAILABLE | "Access cannot be evaluated at this time; request denied" |
| Disposition action attempted without human confirmation | 403 (internal guard) | SECURITY_DISPOSITION_UNCONFIRMED | "Disposition requires human confirmation" |
| Key rotation attempted by non-security-officer role | 403 | SECURITY_KEY_ACCESS_DENIED | "Key management requires security officer privileges" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Security Baseline for `/files/upload`, `/security/policy-evaluate` (internal), `/retention/schedules`, `/retention/due-for-disposition` endpoints.

**Schema Surface (this feature):** uses tables `file_references`, `malware_scan_results`, `security_policies`, `retention_schedules`, `disposition_log` — see `Y0a-schema-shared.md` §Security & Retention.
## F14: Case and Proceeding Setup for Exhibits

**Description:** Allows clerk staff to create or synchronize the matter, proceeding, parties, exhibit numbering scheme, and security designations before exhibit activity begins. This is the Evidentiary Tracking module's entry point — no exhibit intake or ledger entry can occur against a case that has not been set up here.

**Terminology:**
- **Exhibit Numbering Scheme:** A court-specific convention (e.g., `P-1`, `D-1`, `GOV-101`) governing how exhibit identifiers are assigned, configured via F03 and applied per-case here.

**Sub-features:**
- Case/proceeding creation or sync from CM/ECF (reuses F01/F10)
- Party and security-designation setup for exhibit purposes
- Court-specific exhibit numbering scheme configuration/activation for the case

**Process:**
1. Clerk opens "Set up exhibit tracking" for a case already present via F01 (synced or manually created).
2. Clerk confirms or adds parties relevant to exhibit offering (prosecution, defense, additional parties) using F01 party records.
3. Clerk selects or confirms the court's active exhibit numbering scheme (from F03 configuration) and any case-specific numbering override (e.g., separate prefix ranges per party).
4. Clerk applies or confirms security designations relevant to exhibits for this case (sealed exhibit handling default, grand jury default) sourced from F01/F13 policy.
5. System marks the case as "exhibit-tracking active," unlocking F15 intake and F16 ledger operations for this case/proceeding.
6. Setup completion and any designation choices are logged to the audit trail (F02).

**Inputs:**
- `case_id` (required, must already exist via F01)
- `proceeding_id` (required or created inline)
- `numbering_scheme_id` (required, selected from F03 court configuration)
- `party_ids[]` (required, at least prosecution + defense or equivalent)
- `security_designations[]` (optional)

**Outputs:**
- `exhibit_tracking_context` record marking the case/proceeding as ready for exhibit activity
- Confirmation that numbering scheme and parties are bound to the proceeding

**Validation:**
- A case must have at least one proceeding before exhibit tracking can be activated.
- Numbering scheme must be an active, published scheme from F03 — ad hoc numbering is not permitted.
- Only users with `clerk_case_admin` or higher entitlement may activate exhibit tracking for a case.
- Re-running setup on an already-active case must not reset or duplicate existing exhibit records — it is idempotent, allowing addition of parties/designations only.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Case has no proceeding | 422 | EXHIBIT_SETUP_NO_PROCEEDING | "A proceeding must exist before exhibit tracking can be activated" |
| Numbering scheme not found/not published | 422 | EXHIBIT_SETUP_INVALID_SCHEME | "Selected numbering scheme is not valid" |
| Unauthorized setup attempt | 403 | EXHIBIT_SETUP_DENIED | "You are not authorized to set up exhibit tracking for this case" |
| Setup re-run attempts to change numbering mid-case with existing exhibits | 409 | EXHIBIT_SETUP_SCHEME_LOCKED | "Numbering scheme cannot be changed after exhibits have been assigned" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Case Setup for `/evidentiary/cases/{id}/setup` endpoint.

**Schema Surface (this feature):** uses table `exhibit_tracking_contexts` plus references to `cases`, `proceedings`, `parties` — see `Y0b-schema-evidentiary.md` §Case Setup.
## F15: Pretrial Exhibit Intake

**Description:** Receives structured exhibit lists and, where permitted, digital files from attorneys or staff; validates required metadata and routes incomplete or duplicate submissions to the shared exception queue (F07). This is the controlled entry point through which proposed exhibits become candidates for the authoritative ledger (F16).

**Terminology:**
- **Proposed Exhibit:** An intake submission not yet accepted onto the official ledger; exists in `proposed` state until a clerk/deputy accepts it.
- **Deficiency:** A missing-metadata or validation failure on a submission, requiring correction before acceptance.

**Sub-features:**
- Structured exhibit list intake with optional file upload
- Required-metadata validation; duplicate and unsupported-format detection
- Clerk/deputy accept, reject, or request-correction workflow
- Integration with the shared exception queue (F07)

**Process:**
1. Submitter (internal staff or external attorney via F12) provides a structured exhibit list entry: description, offering party, proposed exhibit number (optional, system may assign), exhibit type (F23), and optionally a digital file.
2. If a file is attached, it passes through the F13 malware-scanning and file-type-allowlist gate before further processing.
3. System validates required metadata fields (description, offering party, proceeding association) are present and well-formed.
4. System checks for duplicate submissions (same offering party + same description/file-hash within the same proceeding) and unsupported file formats.
5. Submissions failing validation, flagged as duplicate, or in an unsupported format are routed to the Exception Queue (F07) as `missing_metadata` or a dedicated `intake_deficiency` exception type, with the submitter notified (F04) that correction is needed.
6. Submissions passing validation enter a clerk/deputy review queue (F06 task) with options: **accept** (promotes to F16 ledger in `proposed` status), **reject** (with reason, submitter notified), or **request correction** (returns to submitter with specific deficiency detail).
7. All intake decisions (accept/reject/correction-request) are logged to the audit trail (F02).

**Inputs:**
- `description` (string, required)
- `offering_party_id` (UUID, required)
- `proceeding_id` (UUID, required)
- `exhibit_type` (enum, required): file_reference | physical | demonstrative | contraband | special_storage (see F23)
- `proposed_number` (string, optional)
- `file` (binary, optional, subject to F13 scanning/allowlist)
- `submitted_via` (enum): internal | external_portal (set by F12 if applicable)

**Outputs:**
- Intake submission record in state `proposed`, `in_review`, `accepted`, `rejected`, or `correction_requested`
- On acceptance: new or updated F16 exhibit ledger entry referencing this intake submission

**Validation:**
- Required fields (description, offering_party_id, proceeding_id, exhibit_type) must be present; missing any routes to Exception Queue, not silent rejection.
- Duplicate detection compares offering_party + description similarity + file hash (if present) within the same proceeding; exact file-hash match is always flagged, description similarity uses a configurable fuzzy-match threshold (`[ASSUMPTION]`: exact similarity algorithm/threshold is an implementation detail for TechArch, default conservative threshold to avoid false negatives).
- Only users with `clerk_case_admin` or `courtroom_deputy` entitlement may accept/reject/request-correction; external submitters may only submit, never self-accept.
- A rejected or correction-requested submission must carry a reason/detail that is relayed back to the submitter (no bare rejection without explanation).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Required metadata missing | 422 | INTAKE_MISSING_METADATA | "Required exhibit metadata is missing: {fields}" |
| Duplicate submission detected | 409 | INTAKE_DUPLICATE | "This exhibit appears to be a duplicate submission" |
| Unsupported file format | 422 | INTAKE_UNSUPPORTED_FORMAT | "This file format is not supported" |
| File fails malware scan | 422 | INTAKE_FILE_REJECTED | "File rejected: failed security scan" (see F13) |
| Non-authorized user attempts accept/reject | 403 | INTAKE_REVIEW_DENIED | "You are not authorized to review intake submissions" |
| External submitter attempts self-accept | 403 | INTAKE_EXTERNAL_ACCEPT_DENIED | "External submitters cannot accept their own submissions" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Pretrial Intake for `/evidentiary/intake`, `/evidentiary/intake/{id}/accept`, `/evidentiary/intake/{id}/reject`, `/evidentiary/intake/{id}/request-correction` endpoints.

**Schema Surface (this feature):** uses table `exhibit_intake_submissions` — see `Y0b-schema-evidentiary.md` §Pretrial Intake.
## F16: Exhibit Ledger

**Description:** The current, authoritative-within-JudicialSync record of every exhibit's identifier, status, party, description, proceeding, confidentiality, and location. This is the Evidentiary Tracking module's system-of-record; every other Evidentiary feature (courtroom logging, custody, reconciliation, jury package, closeout) reads and writes through this ledger rather than maintaining a parallel status source.

**Terminology:**
- **Exhibit:** The top-level tracked entity — a proposed, offered, admitted, rejected, withdrawn, substituted, sealed, or returned item of evidence.
- **Exhibit Version:** A point-in-time snapshot capturing a status or attribute change, supporting full history reconstruction (distinct from F23 "exhibit file reference" which is a file pointer).
- **Status Lifecycle:** The defined set of states an exhibit may occupy and the permitted transitions between them.

**Sub-features:**
- Status lifecycle: proposed → offered → admitted | rejected | withdrawn | substituted; admitted → sealed | returned
- Identifier assignment/validation per court numbering convention (F03/F14)
- Confidentiality and location fields with security-designation enforcement
- Full status-change history feeding the audit trail (F02)

**Process:**
1. Exhibit ledger entry is created either from an accepted F15 intake submission (status `proposed`) or directly during courtroom proceedings (F17) for items not pre-submitted.
2. Each status transition (offer, ruling, withdrawal, substitution, seal, return) is requested by an authorized user action (typically via F17 during proceedings, or F20/F21/F24 post-trial) and validated against the court-configured workflow state set (F03) — only permitted transitions for the requesting role succeed.
3. Each transition creates a new **exhibit version** row (append-style history) rather than mutating the exhibit's canonical row destructively — the canonical row's `current_status` is updated, but the version history is retained in full.
4. Each transition emits an audit event (F02) with before/after status, actor, and timestamp.
5. Confidentiality/location fields are updated as part of custody actions (F20) or sealing actions (F21), each similarly versioned and audited.
6. Current ledger state is exposed via API/UI to all modules needing exhibit status (jury package F22, closeout F24, timeline F08, search F05), always reflecting the latest confirmed version.

**Inputs:**
- `exhibit_id` (UUID) or `proposed_number` (for new assignment)
- `status_transition` (enum, required): offer | admit | reject | withdraw | substitute | seal | return
- `proceeding_id`, `offering_party_id` (required context)
- `ruling_actor_id` (required for admit/reject transitions — must be attributed to the judge, never auto-decided, see F17)
- `notes` (string, optional)

**Outputs:**
- Updated exhibit ledger entry with `current_status`
- New exhibit version history row
- Audit event reference

**Validation:**
- Status transitions must follow the court-configured workflow state set (F03); an attempt to transition from `rejected` directly to `admitted` without an intervening re-offer, for example, is rejected unless the court's configuration explicitly allows it.
- The `admit`/`reject` transition (a ruling) must carry a `ruling_actor_id` attributed to a user holding the `judge` role for that proceeding — the system never defaults or auto-infers this value; the courtroom deputy records the occurrence of the ruling, but attribution is always to the judge (see F17 §Process for the human-in-command distinction between "deputy records" and "judge rules").
- Identifier assignment must conform to the active numbering scheme (F14/F03); a manually entered identifier outside the scheme's pattern is rejected.
- Confidentiality/location changes on an exhibit bearing a security designation require the entitlement specified in F21, not merely general ledger-edit rights.
- No exhibit version row may be deleted or edited after creation — corrections are made via a new version, never a retroactive edit (consistent with F02 audit immutability).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Invalid status transition per workflow config | 409 | LEDGER_INVALID_TRANSITION | "This status change is not permitted from the current state" |
| Ruling transition missing judge attribution | 422 | LEDGER_RULING_ACTOR_REQUIRED | "A ruling must be attributed to the presiding judge" |
| Identifier does not match active numbering scheme | 422 | LEDGER_INVALID_IDENTIFIER | "Exhibit identifier does not match the court's numbering scheme" |
| Confidentiality/location change without designation entitlement | 403 | LEDGER_DESIGNATION_DENIED | "This change requires additional authorization" |
| Attempt to edit/delete a prior exhibit version | 403 (internal guard) | LEDGER_VERSION_IMMUTABLE | "Prior exhibit versions cannot be modified" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Exhibit Ledger for `/evidentiary/exhibits`, `/evidentiary/exhibits/{id}/transition`, `/evidentiary/exhibits/{id}/versions` endpoints.

**Schema Surface (this feature):** uses tables `exhibits`, `exhibit_versions` — see `Y0b-schema-evidentiary.md` §Exhibit Ledger.
## F17: Real-Time Courtroom Logging

**Description:** Lets the courtroom deputy record exhibit offers, objections, rulings, withdrawals, and substitutions in real time during proceedings, with minimal interaction steps. This is the primary "courtroom speed" surface the PRD identifies as make-or-break for adoption — if it is slow, deputies revert to paper and the entire value proposition collapses.

**Terminology:**
- **Session:** An active, time-bounded courtroom logging context tied to a specific proceeding/hearing, opened by the deputy at the start of court and closed at recess/day-end/trial-close (feeding F18 reconciliation checkpoints).
- **Offer:** The deputy's record that a party has offered an exhibit for admission.
- **Objection:** The deputy's record of an objection category raised against an offered exhibit.
- **Ruling:** The judge's determination (admit/reject), always explicitly attributed to the judge — the deputy records that a ruling occurred and its content, but never originates or infers the ruling itself.

**Sub-features:**
- Rapid offer/objection/ruling entry optimized for courtroom speed (large targets, keyboard support)
- Timestamped entries with optional notes
- Deputy records actions; judge's ruling is explicitly attributed to the judge, never auto-decided
- Live shared status visible to chambers during the session

**Process:**
1. Deputy opens a logging session for the current proceeding/hearing (F01); session is bound to the exhibit tracking context (F14).
2. As an exhibit is offered in court, deputy selects it from the pre-loaded proposed-exhibit list (F15/F16) or quick-adds a new exhibit inline if unlisted, and marks it `offered` — a single-action, large-touch-target or single-keystroke operation.
3. If an objection is raised, deputy records the objection category (from a short, courtroom-relevant, configurable list) with one additional action.
4. When the judge rules, deputy records the ruling outcome (admit/reject) as having occurred, which the system persists as an F16 status transition explicitly attributed to the presiding judge of record for that proceeding (resolved from F01 proceeding/judge assignment, not manually typed by the deputy) — the deputy's action is "record that the judge admitted/rejected," not "decide to admit/reject."
5. Withdrawal/substitution actions follow the same rapid, single-to-few-action pattern, each timestamped automatically with optional free-text notes.
6. Every logged action updates the shared F16 ledger status immediately, visible in real time to chambers' workspace (F11) without requiring a manual refresh/sync step.
7. At session close (recess/day-end/trial-close), deputy triggers the F18 reconciliation checkpoint directly from the logging interface.
8. If connectivity/system disruption occurs mid-session, the interface persists entries locally (draft buffer) and resyncs automatically on reconnection without data loss, per the F13 manual-fallback/continuity requirement.

**Inputs:**
- `exhibit_id` (selected from pre-loaded list or quick-add)
- `action` (enum, required): offer | objection | ruling | withdraw | substitute
- `objection_category` (enum, conditional — required when action = objection)
- `ruling_outcome` (enum, conditional — required when action = ruling): admit | reject
- `notes` (string, optional)
- Implicit: `timestamp` (system-generated, not user-editable), `proceeding_id`, `presiding_judge_id` (resolved from proceeding context)

**Outputs:**
- Real-time F16 ledger status update
- Session log entry (timestamped, attributed)
- Live status feed visible to chambers workspace

**Validation:**
- A ruling entry's `presiding_judge_id` is always system-resolved from the proceeding's assigned judge — the deputy cannot manually select or override which judge a ruling is attributed to; if the proceeding has no assigned judge on record, the ruling action is blocked and routed to an exception (F07) rather than allowing an unattributed ruling.
- Every logging action must complete in a bounded number of UI interactions (target: ≤3 actions per offer/ruling cycle) and must be fully operable via keyboard shortcuts, per the courtroom-speed NFR.
- Session close triggers mandatory reconciliation (F18) — a session cannot be marked closed while leaving the ledger in an un-reconciled state without an explicit, logged override by an authorized user.
- Quick-add of an unlisted exhibit mid-session still requires the minimum F16 required fields (description, offering party) before the entry can be saved, routed to F07 if incomplete at session close.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Ruling attempted with no assigned judge on proceeding | 422 | COURTROOM_NO_JUDGE_ASSIGNED | "Cannot record a ruling: no presiding judge is assigned to this proceeding" |
| Action attempted on exhibit in terminal/incompatible status | 409 | COURTROOM_INVALID_ACTION | "This action cannot be recorded for the exhibit's current status" |
| Session close attempted with unresolved reconciliation | 409 | COURTROOM_UNRECONCILED_CLOSE | "Session cannot close with unresolved reconciliation discrepancies" |
| Local draft buffer resync conflict after reconnection | 409 (routes to F07) | COURTROOM_RESYNC_CONFLICT | "An entry made offline conflicts with a concurrent update; routed for review" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Courtroom Logging for `/evidentiary/sessions`, `/evidentiary/sessions/{id}/log-action`, `/evidentiary/sessions/{id}/close` endpoints.

**Schema Surface (this feature):** uses tables `courtroom_sessions`, `session_log_entries` (feeding `exhibit_versions` in F16) — see `Y0b-schema-evidentiary.md` §Courtroom Logging.
## F18: Dual-Log and Source Reconciliation

**Description:** Compares the live exhibit ledger against party lists, deputy logs, admitted lists, jury packages, and disposition records to surface discrepancies for resolution, at scheduled checkpoints (recess, day-end, trial-close) and on demand. This feature operationalizes the PRD's "no reconciliation discipline" root-cause fix for Evidentiary Tracking.

**Terminology:**
- **Reconciliation Checkpoint:** A defined point (recess, day-end, trial-close, on-demand) at which the live ledger is compared against one or more source lists.
- **Discrepancy:** A detected mismatch between two authoritative-for-comparison sources (e.g., deputy log shows "admitted," attorney's submitted list shows "withdrawn") for the same exhibit.

**Sub-features:**
- Scheduled and on-demand comparison across source lists and the live ledger
- Discrepancy highlighting with required resolution rationale
- Recess / day-end / trial-close reconciliation checkpoints
- Resolved exceptions logged to the audit trail

**Process:**
1. At a reconciliation checkpoint (triggered automatically at session close per F17, or manually on demand by a clerk/deputy), the system gathers the current F16 ledger state and all available comparison sources for the proceeding: party-submitted exhibit lists (F15), the deputy's session log (F17), any previously assembled jury package manifest (F22), and disposition records (F24, if post-trial).
2. System performs a field-by-field and status-by-status comparison per exhibit across all available sources.
3. Any mismatch (status disagreement, an exhibit present in one source but absent in another, conflicting metadata) generates a discrepancy record, routed to the Exception Queue (F07) as `reconciliation_mismatch`, with both/all conflicting values preserved for review.
4. Assigned clerk/deputy reviews each discrepancy, selects (or manually enters) the correct resolved value, and supplies a mandatory rationale.
5. Resolution updates the F16 ledger if the resolved value differs from current ledger state (itself a new exhibit version + audit event), and marks the discrepancy `resolved` with full audit trail (F02).
6. A reconciliation checkpoint cannot be marked `complete` while unresolved high-severity discrepancies remain open, absent an explicit, separately logged override by an authorized supervisory role.
7. Reconciliation run history (checkpoint type, time, discrepancy count, resolution time) feeds F09 operational reporting metrics.

**Inputs:**
- `proceeding_id` / `session_id` (required)
- `checkpoint_type` (enum, required): recess | day_end | trial_close | on_demand
- Comparison sources (system-gathered, not user-supplied): ledger state, session logs, submitted lists, jury package manifest, disposition records
- Resolution input: `exhibit_id`, `resolved_value`, `rationale` (string, required)

**Outputs:**
- Reconciliation run record with discrepancy count and status
- Discrepancy exception records (F07) for each mismatch
- Updated F16 ledger entries where resolution changed the authoritative value

**Validation:**
- A reconciliation run cannot be marked `complete` with open high-severity discrepancies unresolved, except via a logged supervisory override requiring its own rationale (double-gated, since this bypasses the core quality-control mechanism).
- Every discrepancy resolution requires a non-empty rationale meeting the same minimum-quality bar as F07's general exception resolution rule.
- Comparison must include every source available for the proceeding at the time of the checkpoint — a reconciliation run that silently skips an available source list (e.g., because it failed to load) must itself raise a `reconciliation_partial` exception rather than reporting a false "no discrepancies" result.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Checkpoint completion attempted with open high-severity discrepancies | 409 | RECONCILE_UNRESOLVED_HIGH_SEVERITY | "Cannot complete: unresolved high-severity discrepancies remain" |
| Resolution submitted without rationale | 422 | RECONCILE_RATIONALE_REQUIRED | "A resolution rationale is required" |
| A comparison source fails to load during the run | 206 (partial, routes to exception) | RECONCILE_SOURCE_UNAVAILABLE | "One or more comparison sources were unavailable; reconciliation is incomplete" |
| Supervisory override attempted by non-supervisory role | 403 | RECONCILE_OVERRIDE_DENIED | "You are not authorized to override an unresolved reconciliation" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Reconciliation for `/evidentiary/reconciliation/runs`, `/evidentiary/reconciliation/runs/{id}/discrepancies`, `/evidentiary/reconciliation/discrepancies/{id}/resolve` endpoints.

**Schema Surface (this feature):** uses tables `reconciliation_runs`, `reconciliation_discrepancies` — see `Y0b-schema-evidentiary.md` §Reconciliation.
## F19: Exportable Exhibit List and Basic Closeout

**Description:** Produces a one-click, court-approved export of admitted (or filtered) exhibits for review, filing, or downstream use — the baseline, non-pilot-hardened closeout capability, superseded by the full appeal-ready closeout (F24) in a later increment.

**Terminology:**
- **Export Certification:** The clerk/deputy's explicit confirmation that an exported list accurately represents the ledger at export time, itself an audit-logged action.

**Sub-features:**
- Filter-and-export of exhibit lists by status (e.g., admitted-only)
- Clerk/deputy certification of the export
- Basic exportable record suitable as an interim closeout artifact

**Process:**
1. Clerk/deputy selects a proceeding and a status filter (e.g., admitted-only, all-non-withdrawn) for export.
2. System generates an export artifact (structured format — CSV/PDF, exact format a TechArch concern) listing each matching exhibit's identifier, description, party, status, and ruling reference.
3. Clerk/deputy reviews the generated list and explicitly certifies it as accurate at time of export (a distinct confirmation action, not implied by the download itself).
4. Certification is logged to the audit trail (F02), capturing the exact ledger state snapshot (version references) the export was generated from, so a later audit can confirm what was exported and when.
5. Export artifact is made available for download/filing; it is explicitly labeled as a non-final, interim record where the court has not yet completed full post-trial closeout (F24).

**Inputs:**
- `proceeding_id` (required)
- `status_filter[]` (enum array, required, e.g. `['admitted']`)
- `export_format` (enum, optional, default per court configuration)

**Outputs:**
- Export artifact file
- Certification record referencing exact exhibit version snapshot included

**Validation:**
- Export cannot be certified by a user without `clerk_case_admin` or `courtroom_deputy` entitlement for the proceeding.
- Certification requires explicit confirmation action distinct from mere file generation/download — generating a preview does not itself constitute certification.
- Every certified export retains a snapshot reference (which exhibit version of each included exhibit was captured) so later ledger changes do not retroactively alter what a previously certified export is understood to have contained.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Export requested for proceeding with no matching exhibits | 404 | EXPORT_NO_MATCHING_EXHIBITS | "No exhibits match the selected filter" |
| Certification attempted by unauthorized user | 403 | EXPORT_CERTIFY_DENIED | "You are not authorized to certify this export" |
| Certification attempted without prior export generation | 409 | EXPORT_NOT_GENERATED | "An export must be generated before it can be certified" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Basic Closeout for `/evidentiary/exports`, `/evidentiary/exports/{id}/certify` endpoints.

**Schema Surface (this feature):** uses table `exhibit_exports` (snapshot references into `exhibit_versions`) — see `Y0b-schema-evidentiary.md` §Basic Closeout.
## F20: Custody and Location Tracking

**Description:** Tracks physical and digital exhibit possession, transfers, returns, storage requirements, and receipts, with each transfer confirmed by an authorized user. This feature addresses the PRD's "lost accountability for custody transfers" root cause by making every change of possession an explicit, dual-acknowledged, audited event.

**Terminology:**
- **Custodian:** The party (person, agency, storage facility) currently responsible for an exhibit's physical or digital possession.
- **Custody Transfer:** A recorded change of custodian, requiring acknowledgment from both transferor and recipient.
- **Storage Location:** A tracked physical or logical location (evidence room, agency custody, special-storage facility) an exhibit may reside at.

**Sub-features:**
- Transfer/return/storage event recording with responsible custodian
- Transferor and recipient acknowledgment with purpose, time, location, condition note
- Custody-event alerts for unacknowledged transfers
- Full custody history per exhibit

**`[ASSUMPTION]`:** The vision document leaves open which exhibit categories remain with parties/law-enforcement custodians and what transfer records are required (PRD §9.3). This FRD assumes a general-purpose custody transfer model applicable to any exhibit type (F23), with court-configurable required fields per exhibit type/category (e.g., contraband items may require an additional chain-of-custody field) via F03.

**Process:**
1. An authorized user (courtroom deputy, clerk, or custodian) initiates a custody transfer for an exhibit: specifies recipient custodian, purpose, and current location/condition note.
2. System creates a `pending` custody transfer record and notifies (F04) the designated recipient for acknowledgment.
3. Recipient reviews and acknowledges the transfer (confirming receipt, condition, time); transferor's initiation itself constitutes their acknowledgment of release.
4. On recipient acknowledgment, transfer status becomes `completed`, the exhibit's current custodian/location fields update (feeding F16), and an audit event (F02) is recorded.
5. If a transfer remains unacknowledged beyond a configured SLA (F03), an escalation alert (F04) fires to a supervisory role.
6. Full custody history (every transfer, return, and storage assignment) remains queryable per exhibit, feeding F24 closeout receipts generation and F08 timeline.

**Inputs:**
- `exhibit_id` (required)
- `recipient_custodian_id` (required)
- `purpose` (string, required)
- `location` (string, required)
- `condition_note` (string, optional)
- Acknowledgment: `acknowledged_by`, `acknowledgment_timestamp`, `condition_confirmed` (boolean)

**Outputs:**
- Custody transfer record (`pending` → `completed` or `disputed`)
- Updated exhibit current-custodian/location fields
- Custody history list per exhibit

**Validation:**
- A transfer is not considered complete, and the exhibit's custodian field does not update, until the recipient explicitly acknowledges — no auto-acknowledgment on timeout; timeout instead triggers escalation, not completion.
- Both transferor and recipient identities must be resolvable to specific authorized users/custodian records — a transfer to an unregistered/unknown custodian is rejected.
- Exhibit-type-specific required fields (F23/F03 configuration, e.g., contraband requiring an additional authorization reference) must be present before a transfer for that type can be initiated.
- Unacknowledged-transfer SLA breach must generate an escalation alert; per the PRD's success metric, the goal is zero custody transfers left unacknowledged beyond the defined SLA.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Transfer initiated to unregistered custodian | 422 | CUSTODY_UNKNOWN_CUSTODIAN | "Recipient custodian is not registered" |
| Required type-specific field missing | 422 | CUSTODY_MISSING_TYPE_FIELD | "This exhibit type requires additional fields: {fields}" |
| Acknowledgment attempted by non-designated recipient | 403 | CUSTODY_ACK_DENIED | "Only the designated recipient may acknowledge this transfer" |
| Transfer SLA breached (unacknowledged) | n/a (alert, not request error) | CUSTODY_SLA_BREACH | "Custody transfer has not been acknowledged within the required time" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Custody for `/evidentiary/exhibits/{id}/custody-transfers`, `/evidentiary/custody-transfers/{id}/acknowledge` endpoints.

**Schema Surface (this feature):** uses tables `custody_transfers`, `storage_locations` — see `Y0b-schema-evidentiary.md` §Custody & Location.
## F21: Sealing and Restricted Exhibit Handling

**Description:** Enforces explicit policy-driven handling for sealed, restricted, grand-jury, juvenile, and other sensitive exhibits beyond the platform-level baseline (F13), including judge-authorized sealing/release actions specific to individual exhibits. This feature exists because an exhibit's sensitivity may differ from its case's general security designation — a single exhibit within an otherwise-open case may need sealing.

**Terminology:**
- **Exhibit-Level Designation:** A sealing/restriction status applied to an individual exhibit, distinct from and potentially more restrictive than the case-level designation (F01).
- **Sealing Action:** A judge-authorized action restricting an exhibit's visibility to a narrower entitlement set than the proceeding's general participants.

**Sub-features:**
- Judge-authorized sealing and release workflow for individual exhibits
- Access restriction enforcement distinct from general case security designation
- Audit of every sealed-record access attempt (successful or denied)

**Process:**
1. Judge (or chambers, on the judge's behalf with explicit attribution) initiates a sealing action on a specific exhibit, specifying the designation category (sealed, restricted, grand_jury, juvenile) and the entitlement scope permitted to view it.
2. System applies the exhibit-level designation (F16 status update to `sealed` where applicable, or a non-status designation flag for restricted-but-not-sealed items), evaluated by the central policy engine (F13) at every subsequent access attempt.
3. Every attempt to view, search for (F05), include in a timeline (F08), or export (F19/F24) a sealed/restricted exhibit is checked against the requester's entitlement; both successful (authorized) and denied (unauthorized) attempts are logged as audit events (F02) — this exceeds the general platform baseline's access logging by making sealed-exhibit access attempts individually significant events, not just aggregate log lines.
4. Release (un-sealing) requires an explicit judge-authorized action, symmetric to sealing, and is itself audit-logged with the releasing judge's attribution.
5. Sealed exhibits are automatically excluded from jury review package assembly (F22) unless individually and explicitly authorized for that specific jury review instance.

**Inputs:**
- `exhibit_id` (required)
- `designation_category` (enum, required): sealed | restricted | grand_jury | juvenile
- `authorizing_judge_id` (required, system-resolved, not self-asserted)
- `permitted_entitlement_scope` (object, required): which roles/specific users may view
- Release: `release_authorizing_judge_id`, `release_reason` (required)

**Outputs:**
- Updated exhibit designation state
- Access-attempt audit log entries (successful and denied)
- Release record when applicable

**Validation:**
- Sealing/release actions require `authorizing_judge_id` resolved to an actual judge role holder for the proceeding — a clerk cannot self-authorize a seal even if acting "on the judge's behalf" without an attributable judge identity tied to the action (mirrors F17's ruling-attribution pattern).
- A sealed exhibit's existence may itself be sensitive (`[ASSUMPTION]`, consistent with F05's existence-hiding note) — unauthorized users must receive a "not found" response rather than an "access denied" response when attempting to access a sealed exhibit by direct ID, to avoid confirming its existence.
- Every access attempt against a sealed/restricted exhibit — successful or denied — must produce an audit event; this is a stricter logging requirement than the general platform baseline and is not optional/samples-only.
- Sealed exhibits are excluded from F22 jury packages by default; inclusion requires a separate, explicit judge authorization scoped to that specific jury review instance (not merely general release).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Non-judge attempts to seal/release | 403 | SEAL_AUTHORIZATION_DENIED | "Sealing actions require judge authorization" |
| Unauthorized access attempt to sealed exhibit by ID | 404 (existence-hiding) | SEAL_NOT_FOUND | "Exhibit not found" |
| Attempt to include sealed exhibit in jury package without specific authorization | 422 | SEAL_JURY_PACKAGE_DENIED | "This exhibit is sealed and not authorized for jury review" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Sealing for `/evidentiary/exhibits/{id}/seal`, `/evidentiary/exhibits/{id}/release` endpoints.

**Schema Surface (this feature):** uses tables `exhibit_designations`, extends `audit_events` access-attempt logging — see `Y0b-schema-evidentiary.md` §Sealing & Restricted Handling.
## F22: Jury Review Package Assembly

**Description:** Builds a controlled package containing only admitted electronic exhibits authorized for jury review, with access and session controls, automatically excluding rejected, withdrawn, or unauthorized sealed items. This feature provides the secure digital analog to physically handing admitted exhibits to a jury room.

**Terminology:**
- **Jury Package:** A court-authorized, session-scoped collection of admitted electronic exhibits assembled for jury review.
- **Package Session:** A time-bounded, access-controlled viewing session during which jurors (via jury administrator-managed access) may review the package contents.

**Sub-features:**
- Court-authorized package composition from admitted electronic exhibits only
- Session-scoped, access-controlled review package delivery
- Automatic exclusion of rejected/withdrawn/unauthorized-sealed items
- Package-access logging

**Process:**
1. Judge or chambers authorizes jury package assembly for a proceeding, specifying inclusion scope (default: all currently `admitted` electronic exhibits) and any specific exclusions.
2. System queries F16 ledger for all exhibits in `admitted` status with `exhibit_type` compatible with electronic review (F23), automatically excluding any exhibit in `rejected`, `withdrawn`, or `sealed` status (per F21) unless individually authorized for this specific package.
3. Jury administrator reviews the assembled candidate package, confirms composition with the court's authorization, and the system generates the package as a session-scoped, access-controlled artifact.
4. Package access is granted only during an active, time-bounded review session; each access event (open, view individual exhibit, session end) is logged.
5. Package composition and every access event feed the audit trail (F02); composition is itself audit-logged distinctly since it reflects a judicial authorization of scope.
6. If the admitted-exhibit set changes after package assembly (e.g., a late ruling), the package does not silently update — a new package version must be explicitly re-authorized, preserving the principle that no previously delivered jury package is silently altered.

**Inputs:**
- `proceeding_id` (required)
- `authorizing_judge_id` (required)
- `inclusion_scope` (default: all admitted-and-electronic; optional explicit exclusions)
- `session_window` (start/end time or duration, required)

**Outputs:**
- Jury package record (composition list + authorization reference)
- Package access session with time-bounded entitlement
- Package-access audit log

**Validation:**
- Only `admitted`-status, electronically-reviewable exhibit types (F23) are eligible for inclusion; physical-only exhibit types are structurally excluded regardless of status.
- Sealed exhibits (F21) are excluded unless individually authorized for this specific package instance by the same judge authorizing the package.
- Package composition requires `authorizing_judge_id` resolved to an actual judge for the proceeding (same attribution pattern as F17/F21).
- A package version, once delivered/opened for a review session, is immutable — any change in composition requires a new package version, never an in-place edit of a delivered package.
- Package access outside the authorized session window is denied regardless of requester's general entitlements.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Package assembly attempted by non-judge authorization | 403 | JURY_AUTHORIZATION_DENIED | "Jury package assembly requires judge authorization" |
| Attempt to include non-electronic or non-admitted exhibit | 422 | JURY_INELIGIBLE_EXHIBIT | "This exhibit is not eligible for jury package inclusion" |
| Access attempted outside session window | 403 | JURY_SESSION_EXPIRED | "This review session is not currently active" |
| Attempt to modify a delivered package in place | 409 | JURY_PACKAGE_IMMUTABLE | "A delivered package cannot be modified; create a new version" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Jury Package for `/evidentiary/proceedings/{id}/jury-packages`, `/evidentiary/jury-packages/{id}/session` endpoints.

**Schema Surface (this feature):** uses tables `jury_packages`, `jury_package_items`, `jury_package_access_log` — see `Y0b-schema-evidentiary.md` §Jury Package.
## F23: Physical and Digital Exhibit Distinction

**Description:** Distinguishes file reference, physical item, demonstrative aid, contraband, and special-storage item types within the ledger to support differentiated custody and storage treatment. This classification underlies several other features' eligibility logic (F22's electronic-only jury package inclusion, F20's type-specific custody fields).

**Terminology:**
- **Exhibit Type:** The classification of an exhibit's physical/digital nature, set at intake (F15) and immutable thereafter except via a documented re-classification action.
- **File Reference:** An exhibit type representing a pointer to an electronic file (document, image, audio, video).
- **Special-Storage Item:** An exhibit type requiring handling outside standard evidence-room storage (e.g., weapons, biological material, large items).

**Sub-features:**
- Exhibit-type classification (file reference, physical, demonstrative, contraband, special-storage)
- Type-specific custody/storage workflow rules
- Type-aware validation during intake (F15)

**Process:**
1. At intake (F15), submitter or reviewing clerk assigns an `exhibit_type` from the court-configured type catalog (F03 may extend the base five types with court-specific subtypes).
2. Type assignment drives downstream behavior: `file_reference` exhibits are eligible for F22 jury package electronic inclusion and F13 file-upload/scanning; `physical`/`demonstrative`/`special-storage` exhibits require F20 custody transfer records with type-specific required fields; `contraband` exhibits require additional authorization references per court configuration.
3. Type-specific required fields (configured per F03) are enforced at intake validation (F15) and at custody transfer initiation (F20) — e.g., a `contraband` item might require a law-enforcement case number field before a transfer can be recorded.
4. Re-classification (e.g., correcting an item mistakenly intaken as `physical` when it is actually `demonstrative`) is a distinct, audit-logged action requiring the same entitlement as general ledger edits, not a silent field update.

**Inputs:**
- `exhibit_type` (enum, required at intake): file_reference | physical | demonstrative | contraband | special_storage
- Type-specific metadata fields (per F03 configuration)

**Outputs:**
- Exhibit record with immutable-unless-reclassified `exhibit_type`
- Type-driven eligibility flags consumed by F20/F22

**Validation:**
- `exhibit_type` must be one of the court-configured catalog values (base five or court-specific extensions); an unrecognized type value is rejected at intake.
- Type-specific required fields must be present before a custody transfer (F20) can be initiated for that type.
- Re-classification requires the same entitlement as a ledger status transition (F16) and produces its own audit event; it may not be performed via a generic field-edit path that bypasses audit logging.
- `file_reference` is the only type eligible for F22 electronic jury package inclusion; attempts to mark any other type as package-eligible are structurally rejected.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Unrecognized exhibit_type submitted | 422 | TYPE_UNRECOGNIZED | "Exhibit type is not recognized for this court" |
| Custody transfer attempted without type-specific required field | 422 | TYPE_MISSING_REQUIRED_FIELD | "This exhibit type requires: {fields}" (see F20) |
| Non-electronic type submitted for jury package inclusion | 422 | TYPE_NOT_ELIGIBLE_FOR_PACKAGE | "This exhibit type is not eligible for electronic jury review" |
| Re-classification attempted without ledger-edit entitlement | 403 | TYPE_RECLASSIFY_DENIED | "You are not authorized to re-classify this exhibit" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Exhibit Types for `/evidentiary/exhibit-types` (catalog, read), `/evidentiary/exhibits/{id}/reclassify` endpoints.

**Schema Surface (this feature):** uses `exhibits.exhibit_type` column plus `exhibit_type_catalog` (F03-configured) — see `Y0b-schema-evidentiary.md` §Exhibit Type Classification.
## F24: Post-Trial Closeout (Full)

**Description:** Produces the complete appeal-ready closeout package: exportable exhibit list, return/retention tasks, custody receipts, and an audit package suitable for appellate review — superseding the baseline export (F19) with full disposition and audit-package assembly.

**Terminology:**
- **Disposition Action:** The final handling instruction for an exhibit post-trial (return to party, retain per court policy, transfer to permanent storage, destroy per retention schedule).
- **Appeal-Ready Audit Package:** A comprehensive, certified export including the full exhibit ledger history, custody chain, rulings, and reconciliation record for a proceeding, suitable for appellate review.

**Sub-features:**
- Full exhibit list export with status and disposition detail
- Return/retention/transfer task generation per court retention policy (F13)
- Receipt generation for all disposition actions
- Appeal-ready audit package assembly, clerk/deputy certified

**Process:**
1. Clerk initiates full closeout for a proceeding after trial conclusion and final reconciliation (F18) is complete with no unresolved high-severity discrepancies.
2. System determines the disposition action required for each exhibit based on its status, type (F23), and the court's retention schedule (F13 configuration): return to offering party, court retention, transfer to another custodian, or scheduled destruction per retention period.
3. System generates disposition tasks (F06) for each exhibit requiring action, assigned to the responsible clerk/custodian role.
4. As each disposition action is executed (physical return, transfer, retention confirmation), a receipt is generated and the exhibit's custody record (F20) is updated with the final disposition.
5. Once all exhibits have a finalized disposition (or an explicitly logged exception for any that remain outstanding beyond a reasonable closeout window), the system assembles the appeal-ready audit package: full exhibit list with final status, complete custody chain per exhibit, ruling history, reconciliation run summary, and all relevant audit trail excerpts.
6. Clerk/deputy reviews and certifies the full closeout package (same certification pattern as F19, but comprehensive rather than a simple filtered export).
7. Certification is audit-logged (F02), referencing the full snapshot of every included record's version at time of certification.

**Inputs:**
- `proceeding_id` (required, with completed reconciliation F18)
- Disposition execution inputs (per exhibit): `disposition_action` (enum): return | retain | transfer | destroy_scheduled, `executing_custodian_id`

**Outputs:**
- Disposition task list (F06) per exhibit
- Disposition receipts
- Full appeal-ready audit package artifact
- Certification record

**Validation:**
- Full closeout cannot begin while the proceeding's reconciliation (F18) has unresolved high-severity discrepancies.
- Every exhibit must have a determinable disposition action before the closeout package can be marked complete; exhibits without a clear disposition path are routed to an exception (F07) rather than silently omitted from the package.
- Destruction disposition actions must respect the court's configured retention period (F13) — destruction cannot be executed before the retention period has elapsed, enforced as a hard validation, not merely a warning.
- Certification requires `clerk_case_admin` entitlement and is a distinct action from package generation, mirroring F19's certification pattern but scoped to the comprehensive package.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Closeout attempted with unresolved reconciliation | 409 | CLOSEOUT_UNRESOLVED_RECONCILIATION | "Closeout cannot begin until reconciliation is complete" |
| Exhibit with no determinable disposition | 422 | CLOSEOUT_NO_DISPOSITION_PATH | "This exhibit has no determinable disposition action" |
| Destruction attempted before retention period elapsed | 409 | CLOSEOUT_RETENTION_NOT_ELAPSED | "Retention period has not yet elapsed for this record" |
| Certification attempted by unauthorized user | 403 | CLOSEOUT_CERTIFY_DENIED | "You are not authorized to certify closeout" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Full Closeout for `/evidentiary/proceedings/{id}/closeout`, `/evidentiary/closeout/{id}/dispositions`, `/evidentiary/closeout/{id}/certify` endpoints.

**Schema Surface (this feature):** uses tables `closeout_packages`, `disposition_records`, `disposition_receipts` — see `Y0b-schema-evidentiary.md` §Post-Trial Closeout.
## F25: Exhibit Portfolio Dashboard and Court Templates

**Description:** Aggregate, cross-case visibility into exhibit operations for clerks/administrators, plus reusable court-specific configuration templates to accelerate onboarding of additional courts. This is a Scale-increment feature supporting multi-court growth rather than single-court pilot operation.

**Terminology:**
- **Portfolio Dashboard:** A cross-case aggregate view of exhibit operational health (open exceptions, outstanding custody items, closeout backlog) for a clerk's or administrator's full caseload.
- **Court Template:** A reusable, versioned bundle of exhibit-specific configuration (numbering scheme, type catalog, custody rules) that can be applied to a newly onboarded court as a starting point.

**Sub-features:**
- Portfolio-level dashboard (open exceptions, custody items outstanding, closeout backlog)
- Court-specific exhibit-rule templates for faster new-court onboarding
- Template versioning and governance

**Process:**
1. Clerk/administrator opens the portfolio dashboard, which aggregates across all cases/proceedings within their authorized court/division scope: count and age of open F07 exceptions related to exhibits, count of outstanding (unacknowledged or pending) F20 custody transfers, count and age of proceedings pending F24 closeout.
2. Dashboard supports drill-through to the underlying case/proceeding detail (distinct from F09's de-identified reporting feed — this is operational, case-identified, access-scoped to the viewer's own authorized caseload, not an anonymized administrative export).
3. System administrator creates a court template by exporting a court's current exhibit configuration (numbering scheme, type catalog, custody field rules) as a versioned, named template artifact.
4. When onboarding a new court, administrator selects a template as a starting configuration, which is then applied via F03's configuration engine (producing a new rule-package version scoped to the new court) and may be locally adjusted thereafter.
5. Template versions are themselves governed (who may publish/modify a template) and audit-logged, consistent with F03's configuration change discipline.

**Inputs:**
- `scope` (court_id/division_id, from requester's authorization)
- Template creation: `source_court_id`, `template_name`
- Template application: `target_court_id`, `template_id`, `template_version`

**Outputs:**
- Portfolio dashboard view with aggregate operational counts and drill-through links
- Court template artifact (versioned, named)
- New court's initial configuration (via F03) derived from the applied template

**Validation:**
- Portfolio dashboard access is scoped to the viewer's authorized court/division caseload — it is not a cross-court aggregate (that is F09/F38's purpose); a clerk never sees another court's portfolio.
- Template creation requires `system_admin` entitlement; template application to a new court requires the same configuration maker-checker approval pattern as F03.
- A template, once published and applied to at least one court, is immutable — further changes create a new template version, preserving which exact template version each court was onboarded from for audit purposes.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Dashboard access requested outside authorized scope | 403 | PORTFOLIO_SCOPE_DENIED | "This portfolio view is not available to your role" |
| Template creation by non-admin | 403 | TEMPLATE_CREATE_DENIED | "You are not authorized to create configuration templates" |
| Template application without second approver | 403 | TEMPLATE_SOD_VIOLATION | "A second approver is required to apply this template" |
| Attempt to edit an already-applied template version | 409 | TEMPLATE_VERSION_IMMUTABLE | "This template version has already been applied and cannot be edited" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Portfolio & Templates for `/evidentiary/portfolio/dashboard`, `/evidentiary/templates`, `/evidentiary/templates/{id}/apply` endpoints.

**Schema Surface (this feature):** uses tables `exhibit_config_templates`, `exhibit_config_template_versions` — see `Y0b-schema-evidentiary.md` §Portfolio & Templates.
## F26: Case and Defendant Tracker Initialization

**Description:** Establishes a defendant-specific Speedy Trial tracking context from configured trigger events (automatic detection or manual clerk action), flagging missing trigger information for review. This is the Speedy Trial module's entry point — a tracker's existence and starting context is the foundation every later exclusion, calculation, and alert depends on.

**Terminology:**
- **Defendant Tracker:** The per-defendant Speedy Trial tracking context — one tracker per defendant per applicable charge context, not one per case (see F34 for multi-defendant handling).
- **Trigger Event:** A configured docket-event category (e.g., indictment, arraignment, initial appearance) whose occurrence starts or restarts a Speedy Trial clock per the applicable statute/plan.
- **Start Context:** The specific trigger event and date an authorized user confirms as the clock's applicable starting point.

**Sub-features:**
- Automatic tracker creation on configured trigger-event detection
- Manual tracker creation by clerk staff
- Missing-trigger-event detection and flagging
- Authorized-user confirmation of the applicable start context

**Process:**
1. When a docket event matching a court-configured trigger-event category (F03/F27) arrives for a defendant via CM/ECF (F10) or manual entry, the system automatically proposes creation of a new defendant tracker in `proposed` state, with a candidate start context (trigger event + date) pre-populated.
2. Alternatively, clerk staff manually open a tracker for a defendant when no automatic trigger was detected or when correcting a gap, entering the trigger event and date manually.
3. If the system detects a defendant with case activity but no corresponding trigger event found in the docket feed (e.g., an expected arraignment event never arrived), it flags a `missing_trigger_event` exception (F07) rather than silently leaving no tracker, or silently guessing a start date.
4. An authorized reviewer (clerk or chambers staff, per F03 workflow role configuration) reviews the proposed start context and explicitly confirms it — this confirmation is the human-approval gate; no tracker's start date becomes "confirmed" without it.
5. Confirmation creates the tracker's initial **calculation version** (see F29) using the confirmed start date as the basis for subsequent elapsed-time calculation.
6. Tracker creation/confirmation is audit-logged (F02), including which rule-package version's trigger-event mapping was in effect.

**Inputs:**
- `defendant_party_id` (required, must be a F01 party with role `defendant`)
- `case_id` (required)
- `trigger_event_id` (docket event reference, required for automatic path) or manually entered `trigger_event_type` + `trigger_date` (manual path)
- Confirmation input: `confirming_user_id` (system-resolved), `confirmed` (boolean) or `rejected` with `reason`

**Outputs:**
- Defendant tracker record in state `proposed` or `confirmed`
- Initial calculation version (post-confirmation) — see F29
- `missing_trigger_event` exception (F07) when applicable

**Validation:**
- A tracker cannot enter `confirmed` state without an explicit reviewer confirmation action — automatic trigger detection alone only reaches `proposed` state, never `confirmed`, regardless of how clear-cut the triggering event appears (human-in-command gate, non-negotiable per NFR).
- The confirming reviewer must hold a role with the `exclusion_reviewer`-equivalent entitlement per F03 workflow configuration for trackers (i.e., this is not necessarily the same as general clerk-edit rights — it is a specifically designated review authority).
- A defendant must have a resolvable party record with role `defendant` (F01) before a tracker may be created for them; attempting tracker creation for a non-defendant party is rejected.
- Rejection of a proposed start context requires a rationale and routes to a `missing_trigger_event` or `trigger_event_dispute` exception for further resolution, never a silent discard.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Tracker creation attempted for non-defendant party | 422 | TRACKER_NOT_DEFENDANT | "Tracker can only be created for a defendant party" |
| Confirmation attempted by user lacking review entitlement | 403 | TRACKER_CONFIRM_DENIED | "You are not authorized to confirm a tracker start context" |
| No trigger event found for case with defendant activity | n/a (exception, not request error) | TRACKER_MISSING_TRIGGER | "No trigger event was found for this defendant; manual review required" |
| Rejection submitted without reason | 422 | TRACKER_REJECT_REASON_REQUIRED | "A reason is required to reject the proposed start context" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Tracker Initialization for `/speedytrial/trackers`, `/speedytrial/trackers/{id}/confirm`, `/speedytrial/trackers/{id}/reject` endpoints.

**Schema Surface (this feature):** uses table `defendant_trackers` — see `Y0c-schema-speedytrial.md` §Tracker Initialization.
## F27: Docket Event Ingestion and Mapping

**Description:** Receives docket events from CM/ECF (via F10) or structured manual entry, maps them to configured Speedy Trial event categories, and routes unrecognized events to a resolution queue shared with F07. Accurate, reviewed event mapping is the prerequisite for everything downstream — a misclassified event silently corrupts the clock calculation (F29) without this gate.

**Terminology:**
- **Event Category:** A Speedy Trial-relevant classification (trigger event, motion filed, motion disposed, continuance granted, competency proceeding, interlocutory appeal, etc.) that a raw docket event is mapped to, per F03 configuration.
- **Unmapped Event:** A docket event for which no configured mapping rule matches, requiring human classification before it can feed F28's exclusion engine.

**Sub-features:**
- Inbound event ingestion from CM/ECF adapter (F10) or structured manual entry
- Configurable event-category mapping per court (F03)
- Unmapped-event resolution queue (shared with F07)
- Duplicate-event detection and resolution

**Process:**
1. A docket event arrives via F10 (CM/ECF sync) or manual structured entry, associated with a case/defendant.
2. System attempts to match the event's source code/description against the court's active event-mapping rules (F03), assigning an `event_category` if a match is found.
3. If no mapping rule matches, the event is flagged `unmapped` and routed to the Exception Queue (F07) as `unmapped_docket_event`, with the raw source code/description preserved for the reviewer.
4. An authorized reviewer resolves the unmapped event either by selecting the correct existing category or by requesting a new mapping rule be added to the court's configuration (F03) — the latter requires going through F03's configuration change process, not an ad hoc one-off mapping.
5. System checks for duplicate event delivery (same source_identifier, already-ingested) and silently de-duplicates (idempotent, no duplicate category assignment or downstream exclusion-candidate generation) rather than creating a second record.
6. Once categorized (automatically or via resolution), the event becomes available as an input to F28's candidate exclusion engine and F26's trigger-event detection.

**Inputs:**
- Raw docket event: `source_identifier`, `source_code`, `source_description`, `event_date`, `case_id`, `defendant_party_id` (where applicable)
- Resolution input (for unmapped events): `event_category` (selected) or `new_mapping_rule_request`

**Outputs:**
- Categorized docket event record, consumable by F26/F28
- `unmapped_docket_event` exception (F07) when no mapping matches
- Duplicate-ignored acknowledgment (idempotent, logged but not user-facing error)

**Validation:**
- Duplicate detection is based on `source_identifier` uniqueness within the ingestion pipeline — an event with an already-seen source_identifier is never re-processed as new, preventing double-counting in F28/F29.
- Event-category resolution for an unmapped event requires `exclusion_reviewer`-equivalent entitlement (shared with F26/F28/F30's reviewer role), not general clerk access alone, since miscategorization directly affects legally significant calculations.
- A new mapping rule requested during resolution must go through F03's configuration change process (including its maker-checker approval) before becoming a standing rule — the individual event resolution itself may proceed immediately (classify this one event), but the standing rule addition is gated separately.
- Manually entered events must capture the entering user's identity and are flagged `source_system = 'manual'`, distinct from CM/ECF-sourced events, for explainability purposes (F29).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Event arrives with no matching mapping rule | n/a (exception) | EVENT_UNMAPPED | "This docket event could not be mapped to a Speedy Trial category" |
| Duplicate event_identifier detected | 200 (idempotent, logged) | EVENT_DUPLICATE_IGNORED | "Duplicate event ignored" |
| Resolution attempted by user lacking reviewer entitlement | 403 | EVENT_RESOLUTION_DENIED | "You are not authorized to resolve event mapping" |
| Manual entry missing required defendant/case association | 422 | EVENT_MISSING_ASSOCIATION | "Event must be associated with a case and defendant" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Event Ingestion for `/speedytrial/events`, `/speedytrial/events/{id}/resolve-mapping` endpoints.

**Schema Surface (this feature):** uses tables `speedy_trial_events`, `event_category_mappings` (F03-configured) — see `Y0c-schema-speedytrial.md` §Event Ingestion.
## F28: Candidate Exclusion Engine

**Description:** Suggests candidate excludable time periods associated with motions, competency proceedings, continuances, interlocutory matters, and other configurable categories, strictly for human review rather than automatic application. This is the clearest expression of the system's "human-in-command" principle within the Speedy Trial module — the engine only ever produces *candidates*; a confirmed exclusion requires an explicit human decision (F30).

**Terminology:**
- **Candidate Exclusion:** A rule-suggested excludable time period, linked to its triggering event(s) and the rule reference that generated it, existing in `candidate` state until reviewed.
- **Confirmed Exclusion:** The result of a reviewer's accept/modify action on a candidate exclusion — only confirmed exclusions feed the clock calculation (F29).
- **Exclusion Category:** A configurable classification of excludable-time reason (motion pending, competency evaluation, continuance, interlocutory appeal, other per court plan) per F03.

**Sub-features:**
- Rule-driven candidate exclusion-period generation from mapped events (F27)
- Configurable exclusion categories per court/plan (F03)
- Explicit accept / modify / reject review workflow per candidate period (shared with F30)
- Every candidate period linked to its triggering event and rule reference

**Process:**
1. When a categorized docket event (F27) matches a configured exclusion-triggering category (e.g., "motion filed"), the engine generates a candidate exclusion period, calculating a proposed start date (from the triggering event) and, where determinable by rule, a proposed end date (e.g., from a corresponding "motion disposed" event) or leaving the end date open pending a future disposing event.
2. Candidate exclusion is created in `candidate` state, with explicit linkage to: the triggering event(s), the exclusion category, and the exact rule-package version (F03) whose configuration produced this suggestion.
3. Candidate appears in the reviewer's work queue (F06) for accept/modify/reject action (F30 governs the review mechanics in detail; this feature governs *generation*).
4. If a later docket event closes an open-ended candidate (e.g., a disposing order arrives), the engine updates the candidate's proposed end date — but only while still in `candidate` state; once a reviewer has confirmed/modified the period, a later event does not silently re-open or alter the confirmed record (a new candidate/override cycle would be required, per F29/F30's no-silent-overwrite rule).
5. Every candidate generation, update-while-candidate, and eventual review decision is audit-logged (F02), including the rule-package version reference for explainability (F29).

**Inputs:**
- Categorized docket event(s) (from F27) matching an exclusion-triggering category
- `exclusion_category` (resolved from F03 configuration)
- Rule-package version in effect at generation time (system-resolved, not user-supplied)

**Outputs:**
- Candidate exclusion record: `{category, proposed_start, proposed_end (nullable), triggering_event_refs[], rule_version_ref, state: candidate}`
- Updated candidate (still in `candidate` state) when a later event affects an open-ended proposal

**Validation:**
- A candidate exclusion must always carry a non-null `triggering_event_refs` and `rule_version_ref` — an exclusion period with no traceable source event or rule reference is a system defect, not a valid output (explainability is not optional).
- The engine itself has no authority to transition a candidate to `confirmed` — this transition exists only in F30 and always requires a human actor.
- Once a candidate has been reviewed (accepted, modified, or rejected per F30), the generation engine must not further mutate that specific exclusion record; any new information triggers a new candidate or an explicit override cycle, never a silent update to an already-reviewed record.
- Exclusion category definitions (which docket event categories trigger which exclusion category, and how start/end dates are derived) must be expressible entirely through F03 configuration — no court-specific exclusion logic may be hardcoded.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Candidate generated with no resolvable triggering event | 500 (internal guard, should never occur) | EXCLUSION_NO_SOURCE_EVENT | "Candidate exclusion generated without a source event (system defect)" |
| Attempt to auto-update an already-reviewed exclusion | 409 (internal guard) | EXCLUSION_ALREADY_REVIEWED | "This exclusion has already been reviewed and cannot be auto-updated" |
| Exclusion category not found in active rule package | 422 | EXCLUSION_CATEGORY_UNDEFINED | "No exclusion category is configured for this event type" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Candidate Exclusions for `/speedytrial/trackers/{id}/candidate-exclusions` (read/list; generation is system-triggered, not a direct user-invoked write).

**Schema Surface (this feature):** uses table `candidate_exclusions` — see `Y0c-schema-speedytrial.md` §Candidate Exclusion Engine.
## F29: Versioned Clock Calculation and Explainability

**Description:** Calculates elapsed includable time, excluded periods, and remaining time as of a given calculation date, and exposes a full "explain this date" breakdown of every contributing segment. This is the Speedy Trial module's centerpiece — the PRD's core "explainability" promise and the feature with the strictest versioning/immutability requirements in the entire system, since a prior approved result must never be silently replaced.

**Terminology:**
- **Calculation Version:** A complete, immutable snapshot of a clock calculation — inputs (confirmed trigger, confirmed exclusions as of that moment), rule-package version, computed elapsed/excluded/remaining time, and resulting status — produced at a specific point in time. Every recalculation creates a new version; none overwrites a prior one.
- **Timeline Segment:** A single contiguous period (included or excluded) within a calculation version's breakdown, each linked to its source event(s), rule reference, review status, and reviewer.
- **Calculation Date:** The as-of date the elapsed/remaining time is computed against (typically "today," but may be a specific past or future date for review purposes).
- **Explain-This-Date View:** The UI/API surface rendering every timeline segment of a calculation version with full source/rule/reviewer attribution.

**Sub-features:**
- Elapsed/excluded/remaining time calculation from confirmed events and exclusions
- "Explain this date" view: event, rule reference, period, status, reviewer, reason per segment
- Full calculation versioning — every recalculation retains prior version, inputs, rule package, and approvals
- No silent overwrite of a prior approved result; overrides require documented rationale

**Process:**
1. Calculation is triggered either by a scheduled recompute (e.g., nightly), an event affecting the tracker (new confirmed exclusion, trigger confirmation), or an explicit user-requested recalculation.
2. System gathers all inputs as of the calculation moment: the tracker's confirmed start context (F26), all `confirmed` exclusions (F30 — never `candidate` ones), and the currently effective rule-package version (F03) for the court's Speedy Trial plan.
3. System computes the timeline as a sequence of segments: included (counting toward the statutory limit) and excluded (per confirmed exclusions), each segment carrying its date range, its classification (included/excluded), and — for excluded segments — the linked confirmed exclusion record (which itself links to triggering event and rule reference).
4. System computes `elapsed_includable_time`, `total_excluded_time`, and `remaining_time` as of the calculation date, and a resulting non-binding status indicator (e.g., "within limit," "approaching threshold," "limit reached") — explicitly labeled as decision support, never as a legal determination.
5. The complete result — segments, computed totals, rule-package version reference, calculation date, and triggering reason (scheduled | event-driven | manual) — is persisted as a new, immutable **calculation version** row. The tracker's "current" pointer advances to this new version; the prior version remains fully retrievable, never deleted or edited.
6. The "explain this date" view renders the current (or any selected historical) calculation version's segments, each showing: contributing event, rule reference, period, review status (confirmed/candidate — though only confirmed exclusions ever feed a calculation), reviewing user, and reason/rationale where an override was involved.
7. Any override of a calculation result (e.g., chambers determines the automated figure should be adjusted) is captured as a distinct, mandatory-rationale action that itself produces a new calculation version referencing the override — it never edits the automated version in place (see F30 for the override/confirmation mechanics in detail).
8. All calculation version creation and override events are audit-logged (F02) with full lineage.

**Inputs:**
- `tracker_id` (required)
- `calculation_date` (optional, defaults to current date; may be set to a past/future date for review purposes)
- Implicit: confirmed start context (F26), all confirmed exclusions (F30), effective rule-package version (F03) — all system-gathered, not user-supplied per calculation request

**Outputs:**
- New immutable `calculation_version` record: `{elapsed_time, excluded_time, remaining_time, status_indicator, calculation_date, rule_version_ref, triggering_reason, segments[]}`
- "Explain this date" rendered breakdown (segments with full attribution)
- Updated "current version" pointer on the tracker

**Validation:**
- A calculation version, once created, is immutable — no update or delete operation against a calculation_version row is permitted at the application layer; database grants enforce this identically to the audit_events table (F02).
- Only `confirmed` exclusions (never `candidate`) may contribute an excluded segment to a calculation — a candidate exclusion pending review must never silently reduce the computed elapsed time.
- Every excluded segment must link to a specific confirmed exclusion record, which itself links to a specific triggering event and rule reference — a segment with no traceable source is a system defect, consistent with F28's explainability guarantee.
- The resulting status indicator must carry a persistent, non-dismissable UI label clarifying it is decision support, not a legal determination (per NFR "Human-in-command" and vision document's "persistent decision-support labeling" risk mitigation).
- Recalculation triggered by a configuration change (F03) does not happen automatically and silently — a configuration change never, by itself, mutates an existing calculation version; a new calculation must be explicitly or schedule-triggered, and it produces a new version, never retroactively alters the old one's stored result.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Calculation attempted for tracker with unconfirmed start context | 422 | CALC_START_NOT_CONFIRMED | "Cannot calculate: tracker start context is not yet confirmed" |
| Attempt to edit/delete a calculation version | 403 (internal guard) | CALC_VERSION_IMMUTABLE | "Calculation versions cannot be modified after creation" |
| Segment generated referencing a non-confirmed exclusion | 500 (internal guard, should never occur) | CALC_UNCONFIRMED_EXCLUSION_USED | "System defect: unconfirmed exclusion used in calculation" |
| Calculation requested for a date before tracker start | 422 | CALC_DATE_BEFORE_START | "Calculation date cannot precede the tracker's confirmed start date" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Clock Calculation for `/speedytrial/trackers/{id}/calculate`, `/speedytrial/trackers/{id}/calculation-versions`, `/speedytrial/calculation-versions/{id}/explain` endpoints.

**Schema Surface (this feature):** uses tables `calculation_versions`, `timeline_segments` — see `Y0c-schema-speedytrial.md` §Clock Calculation & Explainability.
## F30: Review and Approval Workflow

**Description:** Separates proposed/candidate information from confirmed/approved information across the Speedy Trial module, recording who approved what and why. This feature is the shared mechanics layer underlying F26's start-context confirmation, F28's candidate exclusion review, and F29's calculation overrides — a single, consistent proposed-vs-confirmed pattern rather than three separately implemented approval flows.

**Terminology:**
- **Proposed State:** Any system-generated or unreviewed suggestion (candidate exclusion, candidate trigger event, candidate calculation adjustment) not yet acted on by an authorized human.
- **Confirmed State:** The result of an explicit accept action by an authorized reviewer, after which the record feeds downstream calculations (F29).
- **Override:** A reviewer's deliberate departure from the system-suggested value, requiring mandatory rationale and producing its own versioned record rather than editing the original suggestion.

**Sub-features:**
- Explicit proposed-vs-confirmed state distinction for events, exclusions, and calculations
- Reviewer attribution and timestamp on every confirmation
- Override capture with mandatory rationale
- Integration with shared work queue (F06)

**Process:**
1. A reviewable item (candidate exclusion from F28, proposed start context from F26, a flagged calculation needing override consideration from F29/F33) is created in `proposed`/`candidate` state and a corresponding task (F06) is generated for the role configured (F03) to review that item type.
2. Reviewer opens the task, examines the item's full context (triggering event, rule reference, proposed values) via the linked detail view.
3. Reviewer takes one of three actions:
   - **Accept:** the proposed value is adopted as-is; system creates a `confirmed` record referencing the original proposal, reviewer identity, and timestamp.
   - **Modify:** reviewer adjusts the proposed value (e.g., changes an exclusion's end date) and the system creates a `confirmed` record reflecting the modified value, with the original proposed value preserved alongside it for comparison, plus mandatory rationale for the modification.
   - **Reject:** the proposed value is not adopted; system creates a `rejected` record with mandatory rationale, and the item does not feed any downstream calculation.
4. Every accept/modify/reject action is logged as a distinct audit event (F02), and the associated task (F06) is marked complete with a reference to that audit event.
5. For overrides specifically (reviewer departs from what the engine suggested, or chambers adjusts an already-confirmed value after the fact), the system never edits the prior confirmed record in place — it creates a new version with an explicit `override` flag, mandatory rationale, and full linkage back to the record it supersedes, preserving complete history (feeding F32's "what changed" comparison).

**Inputs:**
- `reviewable_item_id` (required): reference to a candidate exclusion, proposed trigger context, or calculation needing override
- `action` (enum, required): accept | modify | reject | override
- `modified_value` (conditional, required when action = modify or override)
- `rationale` (string, required when action = modify, reject, or override)
- `reviewing_user_id` (system-resolved from session, never client-supplied)

**Outputs:**
- Confirmed/rejected/overridden record, versioned and linked to its source proposal
- Completed task (F06) with audit event reference
- Updated downstream state (e.g., F29 recalculation triggered if a confirmed exclusion changed)

**Validation:**
- Accept/modify/reject/override actions require the `exclusion_reviewer`-equivalent entitlement configured per F03 workflow roles for the specific item type and court — this entitlement is distinct from general operational access and may be restricted to chambers/judge roles for certain item types (e.g., continuance-related exclusions) per court policy.
- Modify, reject, and override actions all require a non-empty rationale meeting the shared minimum-quality bar (same pattern as F07); accept (adopting the system's own suggestion unchanged) does not require rationale beyond the explicit accept action itself, since no departure from the suggestion occurred.
- A reviewer may not confirm/override a record they themselves created as a manual proposal in certain configurable cases (`[ASSUMPTION]`: court-configurable whether self-review is permitted for manually entered events vs. system-generated candidates — defaults to requiring a second reviewer for self-entered proposals, consistent with separation-of-duties principles, to be validated during pilot).
- Once a record reaches `confirmed` state, no further change may occur except through a new override cycle (new version, full lineage) — never an in-place edit, identical in spirit to F29's calculation-version immutability.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Review action by user lacking entitlement for this item type | 403 | REVIEW_DENIED | "You are not authorized to review this item" |
| Modify/reject/override submitted without rationale | 422 | REVIEW_RATIONALE_REQUIRED | "A rationale is required for this action" |
| Self-review of own manual proposal attempted (where disallowed) | 403 | REVIEW_SELF_REVIEW_DENIED | "A second reviewer is required for self-submitted proposals" |
| Attempt to edit an already-confirmed record in place | 409 (internal guard) | REVIEW_CONFIRMED_IMMUTABLE | "Confirmed records cannot be edited directly; use override" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Review & Approval for `/speedytrial/review-items/{id}/accept`, `/speedytrial/review-items/{id}/modify`, `/speedytrial/review-items/{id}/reject`, `/speedytrial/review-items/{id}/override` endpoints.

**Schema Surface (this feature):** uses tables `confirmed_exclusions`, `review_actions` (polymorphic reference to candidate_exclusions, trigger confirmations, calculation overrides) — see `Y0c-schema-speedytrial.md` §Review & Approval Workflow.
## F31: Configurable Threshold Alerts and Escalation

**Description:** Generates alerts as remaining time crosses court-defined thresholds or as unresolved events persist, with court control over recipients, cadence, and threshold values. Per the vision document's explicit principle, alerts are tied to explanation context, "not merely a date" — every alert links back to the full F29 explain-this-date view, never presenting a bare number without its supporting detail.

**Terminology:**
- **Threshold Tier:** A court-configured remaining-time boundary (e.g., "30 days remaining," "10 days remaining") at which an alert fires.
- **Persistent Unresolved Event:** A docket event or candidate exclusion that has remained unreviewed/unmapped beyond a configured age, independently alertable from remaining-time thresholds.

**Sub-features:**
- Court-configurable thresholds (e.g., remaining-time tiers)
- Configurable recipients and escalation cadence
- Alerts tied to explanation context, not a bare date
- Delivery via shared Notifications Service (F04)

**Process:**
1. After each new calculation version is produced (F29), the system compares the new `remaining_time` value against the court's configured threshold tiers (F03).
2. If the remaining time has newly crossed a tier boundary (compared to the prior calculation version) or an unresolved event (F07/F27) has exceeded its configured age threshold, the system triggers an alert via the Notifications Service (F04), specifying the triggering tracker/event, severity (mapped from tier), and a deep link to the F29 explain-this-date view — never embedding the bare remaining-time number alone in the alert body, consistent with the vision document's explicit design note.
3. Notifications Service resolves configured recipients/channels for this alert type and court (F03) and delivers per F04's process.
4. Recipient acknowledges the alert (F04 acknowledgment tracking); unacknowledged alerts beyond the configured escalation cadence trigger escalation to a secondary recipient (e.g., supervising judge or court administrator).
5. Alert and acknowledgment events are logged; threshold-crossing alert acknowledgment specifically feeds the audit trail (F02) since it is evidence a human reviewed a risk signal for a legally significant deadline.

**Inputs:**
- New calculation version's `remaining_time` (from F29) and prior version's `remaining_time` (for crossing detection)
- Threshold tier definitions (F03): `{tier_name, remaining_time_boundary, severity}`
- Escalation cadence config (F03): `{max_unacknowledged_duration, secondary_recipient_role}`

**Outputs:**
- Alert record referencing the triggering calculation version / unresolved event
- Delivered notification (via F04) with deep link to explain-this-date view
- Escalation record if unacknowledged beyond cadence

**Validation:**
- An alert must never be generated or delivered without a working deep link to its full explanatory context (F29 view); an alert lacking this linkage is a system defect, not an acceptable minimal-viable alert.
- Threshold crossing detection compares consecutive calculation versions, not merely a point-in-time check, so a tier crossing is detected exactly once per crossing event, not re-fired on every subsequent calculation that remains below the same tier.
- Per the PRD's stated success metric, 100% of cases crossing a configured threshold must generate a delivered, acknowledged alert — failure to deliver (channel failure) must itself raise an exception (F07), not fail silently.
- Escalation cadence must have a defined maximum unacknowledged duration per severity tier; critical-severity alerts (e.g., limit-reached tier) must have the shortest escalation window.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Alert generation attempted with no deep-link context available | 500 (internal guard) | ALERT_MISSING_CONTEXT | "Alert blocked: explanatory context unavailable (system defect)" |
| No threshold tiers configured for court | 422 | ALERT_NO_TIERS_CONFIGURED | "No Speedy Trial alert thresholds are configured for this court" |
| Alert delivery failure | 502 (routes to F07) | ALERT_DELIVERY_FAILED | "Threshold alert could not be delivered" (see F04) |
| Unacknowledged alert exceeds escalation cadence | n/a (triggers escalation, not a request error) | ALERT_ESCALATED | "Alert escalated due to lack of acknowledgment" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Threshold Alerts for `/speedytrial/trackers/{id}/alerts`, `/speedytrial/alerts/{id}/acknowledge` endpoints.

**Schema Surface (this feature):** uses tables `threshold_alerts`, `alert_escalations` — see `Y0c-schema-speedytrial.md` §Threshold Alerts & Escalation.
## F32: Calculation Version History ("What Changed")

**Description:** Compares the current calculation version against a prior version and highlights added events, changed periods, and overrides, making recalculations understandable rather than opaque. This feature builds directly on F29's versioning foundation to answer the specific question "why did this number change since last time?"

**Terminology:**
- **Version Diff:** A structured comparison between two calculation versions highlighting additions, removals, and modifications to timeline segments.
- **Change Driver:** The specific underlying cause of a difference between versions — a newly confirmed exclusion, a newly ingested event, an override, or a rule-package version change.

**Sub-features:**
- Version-to-version comparison view
- Highlighted diffs: added/removed events, changed exclusion periods, new overrides
- Full override rationale displayed inline with the relevant version

**Process:**
1. User selects two calculation versions for a tracker to compare — typically "current" vs. "prior," but any two historical versions may be selected.
2. System performs a structured diff over each version's `segments[]`: segments present in the newer version but not the older (additions), segments present in the older but not the newer (removals — rare, generally only via override/correction), and segments present in both but with changed boundaries or review status (modifications).
3. For each diff entry, system attributes a change driver by inspecting the underlying confirmed exclusion/event/override record's creation timestamp relative to the two calculation versions' timestamps.
4. Any override-driven change displays its mandatory rationale (captured in F30) inline, directly alongside the diff entry it explains — a user viewing "what changed" never has to separately navigate to find why.
5. The comparison view is rendered as a human-readable summary (e.g., "Remaining time decreased by 12 days due to: 1 new confirmed exclusion [motion filed 2024-03-01, confirmed by J. Smith], 1 override [chambers extended exclusion end date, rationale: ...]").

**Inputs:**
- `tracker_id` (required)
- `version_a_id`, `version_b_id` (required; typically current and immediately-prior, but any two valid versions for the tracker)

**Outputs:**
- Structured diff result: `{additions[], removals[], modifications[]}`, each with change driver attribution and rationale where applicable
- Human-readable summary rendering

**Validation:**
- Comparison must only be performed between calculation versions belonging to the same tracker; cross-tracker comparison is rejected as meaningless.
- Every diff entry must resolve to a specific change driver (confirmed exclusion, event, override, or rule-package version change) — an unattributable diff entry is a system defect, violating the explainability requirement that underlies this entire module.
- Access to the comparison view requires the same entitlement as viewing the underlying calculation versions (F29) — no separate, looser access path for version comparison.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Comparison requested across different trackers | 422 | DIFF_CROSS_TRACKER | "Calculation versions must belong to the same tracker to compare" |
| Diff entry with no resolvable change driver | 500 (internal guard) | DIFF_UNATTRIBUTED_CHANGE | "System defect: unattributed change detected in comparison" |
| Requested version not found for tracker | 404 | DIFF_VERSION_NOT_FOUND | "Calculation version not found for this tracker" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Version Comparison for `/speedytrial/trackers/{id}/calculation-versions/compare` endpoint.

**Schema Surface (this feature):** read-only computation over `calculation_versions`, `timeline_segments`, `review_actions` — no dedicated writable table; see `Y0c-schema-speedytrial.md` §Calculation Version History.
## F33: Continuance Findings Check

**Description:** Flags continuance records that lack required structured findings or supporting order references, leaving legal sufficiency determination entirely to the judge and chambers. This feature is a pure completeness check — it never evaluates whether findings are legally adequate, only whether the structural prerequisites (a findings field populated, an order reference present) exist for chambers to make that judgment.

**Terminology:**
- **Continuance Record:** A docket-event-derived or manually entered record of a continuance request/grant, linked to a candidate or confirmed exclusion (F28/F30).
- **Structured Findings:** The court's required documentation (per its Speedy Trial plan) that specific statutory findings (e.g., "ends of justice" findings under 18 U.S.C. § 3161(h)(7)) were made and recorded — the presence of the field, not its legal content, is what this feature checks.

**Sub-features:**
- Structured-completeness check on continuance records (findings present, order reference present)
- Flag-only behavior — system never determines legal sufficiency
- Routed to chambers/judge review queue when incomplete

**Process:**
1. When a docket event categorized (F27) as a continuance-related event is ingested, or a candidate/confirmed exclusion (F28) is linked to a continuance category, the system checks whether the associated record has: (a) a populated structured-findings field reference, and (b) a linked order document reference (F01).
2. If either is missing, the system flags the continuance record `incomplete` and routes it to the chambers/judge review queue (F06) as a `continuance_findings_incomplete` task — distinct from, but feeding into, the general Exception Queue (F07) given its chambers-specific routing.
3. The flag is purely structural — the system does not and cannot evaluate whether the findings, once present, are legally sufficient; that determination remains with the judge/chambers.
4. Chambers/judge reviews the flagged continuance, either supplies the missing findings/order reference (if merely a data-entry gap) or confirms the legal record independently (outside this system) and updates the reference accordingly.
5. Once complete, the continuance record's completeness flag clears and the associated exclusion can proceed through normal F30 review/confirmation.
6. The flag-and-resolution cycle is audit-logged (F02).

**Inputs:**
- Continuance-categorized docket event or exclusion record
- `structured_findings_ref` (nullable at ingestion, required for completeness)
- `order_document_ref` (nullable at ingestion, required for completeness)

**Outputs:**
- Continuance record with `complete`/`incomplete` completeness flag
- `continuance_findings_incomplete` task (F06) when incomplete

**Validation:**
- The completeness check evaluates only field presence (is there a findings reference, is there an order reference) — it must never attempt to parse, evaluate, or score the *content* of findings for legal sufficiency; any such evaluation would violate the human-in-command NFR and the explicit PRD/vision scope boundary.
- An exclusion linked to an incomplete continuance record may still exist in `candidate` state (F28) but should carry a visible warning in its review UI; whether it may be confirmed (F30) while incomplete is a court-configurable policy (`[ASSUMPTION]`: default behavior blocks confirmation until complete, but courts may configure allowing confirmation with an acknowledged-incomplete flag, to be validated during pilot).
- Resolution of the completeness flag (supplying missing references) requires chambers/judge-equivalent entitlement per F03 workflow configuration, not general clerk access.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Confirmation of exclusion attempted while continuance incomplete (court policy blocks this) | 409 | CONTINUANCE_INCOMPLETE_BLOCKS_CONFIRM | "This exclusion cannot be confirmed until continuance findings are complete" |
| Completeness resolution attempted by unauthorized user | 403 | CONTINUANCE_RESOLVE_DENIED | "You are not authorized to resolve continuance findings completeness" |
| System attempts content-level sufficiency evaluation (should never occur) | 500 (internal guard) | CONTINUANCE_SCOPE_VIOLATION | "System defect: sufficiency evaluation is out of scope" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Continuance Findings for `/speedytrial/continuances/{id}/completeness`, `/speedytrial/continuances/{id}/supply-references` endpoints.

**Schema Surface (this feature):** uses table `continuance_records` (extends exclusion/event model with findings/order reference fields) — see `Y0c-schema-speedytrial.md` §Continuance Findings Check.
## F34: Multi-Defendant Separation

**Description:** Maintains independent Speedy Trial clocks per defendant in multi-defendant matters, with relationship visibility so related cases aren't collapsed into one misleading result. This directly addresses the vision document's "avoids oversimplification" principle — a joint motion or severance event affecting multiple defendants must be visible across all affected trackers without merging their individual clock results.

**Terminology:**
- **Co-Defendant Relationship:** A recorded association between two or more defendant trackers within the same case, reflecting joint proceedings, joint motions, or severance events.
- **Joint Event:** A docket event (e.g., a joint motion for continuance) that may generate candidate exclusions across multiple co-defendant trackers simultaneously.
- **Severance:** An event that splits a previously joint case-defendant relationship, after which affected trackers' subsequent clocks no longer share joint-event propagation.

**Sub-features:**
- Per-defendant independent clock calculation within a shared matter
- Cross-defendant relationship visibility (joint motions, severance events)
- Avoids result collapsing/oversimplification across co-defendants

**Process:**
1. When a case has multiple defendant parties, each defendant receives their own independent tracker (F26) — the system never creates a single shared tracker across defendants, even when they share a case.
2. A docket event categorized (F27) as affecting multiple defendants (e.g., a joint motion) generates linked candidate exclusions (F28) on each affected defendant's tracker, each exclusion carrying a `joint_event_group_id` linking them as siblings — but each remains a distinct record subject to independent review/confirmation (F30) per defendant.
3. A reviewer may accept, modify, or reject a joint-origin candidate exclusion differently per defendant (e.g., confirmed for defendant A but modified for defendant B due to a defendant-specific circumstance) — the system never forces identical review outcomes across co-defendants merely because the originating event was joint.
4. A severance event, once confirmed, is recorded and from that point forward, subsequent docket events affecting only one defendant do not propagate as joint candidates to the severed co-defendant(s).
5. The case conference view (F35) and portfolio dashboards (F36) display co-defendant relationships explicitly (e.g., "3 defendants in this matter; 2 are jointly tracked, 1 severed as of [date]"), never presenting a single collapsed "the case's" Speedy Trial status when multiple independent defendant clocks exist.

**Inputs:**
- `case_id` with multiple `defendant_party_id` associations (F01)
- Joint docket event with multiple affected `defendant_party_id` references
- `severance_event` with `severed_defendant_ids[]`, `severance_date`

**Outputs:**
- Independent tracker + calculation version per defendant (F26/F29)
- Linked candidate exclusions sharing a `joint_event_group_id` but independently reviewable
- Co-defendant relationship record, updated on severance

**Validation:**
- No UI or API surface may present a single aggregate "Speedy Trial status" for a multi-defendant case without explicit per-defendant breakdown — any case-level summary must clearly enumerate each defendant's independent status, never averaging or collapsing them.
- A joint-origin candidate exclusion's independent review per defendant must not be blocked or forced to a uniform outcome by the system — each defendant's tracker's F30 review workflow operates independently even when the source event was shared.
- Severance must be an explicit, confirmed, audit-logged event (not inferred) before joint-event propagation to severed defendants stops; absent an explicit severance record, the system continues treating defendants in the case as jointly affected by shared events by default.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Attempt to create a single shared tracker for multiple defendants | 422 (internal guard) | MULTIDEF_SHARED_TRACKER_DENIED | "Each defendant requires an independent tracker" |
| UI/report attempts to render collapsed case-level status | 500 (internal guard) | MULTIDEF_COLLAPSED_VIEW_VIOLATION | "System defect: case-level status must not collapse per-defendant results" |
| Severance recorded without confirmation/audit | 403 (internal guard) | MULTIDEF_SEVERANCE_UNCONFIRMED | "Severance must be explicitly confirmed before taking effect" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Multi-Defendant for `/speedytrial/cases/{id}/defendant-trackers`, `/speedytrial/cases/{id}/severance` endpoints.

**Schema Surface (this feature):** uses tables `codefendant_relationships`, `severance_events`, extends `candidate_exclusions.joint_event_group_id` — see `Y0c-schema-speedytrial.md` §Multi-Defendant Separation.
## F35: Case Conference View

**Description:** A concise, chambers-oriented chronology showing upcoming hearings, current clock state, pending motions, continuance history, and open issues to support conference and hearing preparation. This feature packages information already modeled elsewhere (F08 timeline, F29 calculation, F28 candidates, F33 continuance checks) into a single, review-optimized screen for the specific moment chambers needs it most: before a conference, continuance decision, pretrial conference, or trial setting.

**Terminology:**
- **Review Packet:** A pre-conference export summarizing the case conference view's content for offline/printed review.
- **Open Issue:** Any item requiring chambers attention before the upcoming proceeding (unresolved candidate exclusion, incomplete continuance findings, unacknowledged threshold alert).

**Sub-features:**
- Single-screen summary: clock state, pending motions, continuance history, open issues
- Pre-conference review-packet generation (status conferences, continuance decisions, pretrial conferences, trial settings)
- Deep links into underlying event/exclusion detail

**Process:**
1. Chambers staff or judge opens the case conference view for a defendant tracker ahead of a scheduled proceeding.
2. System assembles: current calculation version summary (F29, remaining time, status indicator), all `candidate` (unreviewed) exclusions pending decision (F28), continuance history (confirmed exclusions of continuance category, F30, with F33 completeness flags), and any open issues (unresolved exceptions F07, unacknowledged alerts F31 relevant to this tracker).
3. Each summarized item deep-links to its full detail view (e.g., clicking a pending candidate exclusion opens the F30 review screen).
4. On request, system generates a review packet (printable/exportable) containing the same content, timestamped at generation, for use at status conferences, continuance decisions, pretrial conferences, or trial settings per the vision document's named use occasions.
5. The view defaults to the single defendant in context but, for multi-defendant matters (F34), surfaces an explicit co-defendant summary panel rather than merging statuses.

**Inputs:**
- `tracker_id` (required)
- `proceeding_context` (optional, e.g., which upcoming hearing this conference view supports)

**Outputs:**
- Composed case conference view (read-only aggregate)
- Review packet export artifact

**Validation:**
- The view must only ever reflect confirmed data as the "current state" (current calculation version, confirmed exclusions) while clearly distinguishing pending/candidate items as not-yet-decided — consistent with F08's rule against presenting unconfirmed data as settled.
- Review packet generation is itself a lightweight, non-legally-significant export (unlike F19/F24 certified exports) and does not require certification, but the packet is timestamped and, if later referenced in a hearing, its generation event may be logged for traceability (`[ASSUMPTION]`: review packet generation is logged as an operational event, not necessarily a full F02 material-action audit entry, since it does not itself change any record — subject to pilot validation on whether courts want this treated more formally).
- Access to the case conference view requires at minimum the same entitlement as viewing the underlying tracker/calculation (F29), with no looser access path.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Tracker not found or not authorized | 404 | CONFERENCE_TRACKER_NOT_FOUND | "Tracker not found or not accessible" |
| Review packet generation fails (underlying data partially unavailable) | 206 (partial) | CONFERENCE_PACKET_PARTIAL | "Some conference view data was unavailable; packet is incomplete" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Case Conference View for `/speedytrial/trackers/{id}/conference-view`, `/speedytrial/trackers/{id}/conference-view/export` endpoints.

**Schema Surface (this feature):** read-only aggregation over `calculation_versions`, `candidate_exclusions`, `confirmed_exclusions`, `continuance_records`, `exceptions`, `threshold_alerts` — no dedicated writable table; see `Y0c-schema-speedytrial.md` §Case Conference View.
## F36: Speedy Trial Portfolio Dashboard

**Description:** Court-level and personal dashboards identifying cases nearing thresholds, data gaps, or conflicting interpretations across a judge's or clerk's full caseload. This gives chambers and court administrators the proactive, caseload-wide risk visibility the PRD identifies as a core root-cause fix, rather than requiring staff to check each tracker individually.

**Terminology:**
- **Personal Dashboard:** A judge/clerk-scoped view limited to trackers within that individual's assigned caseload.
- **Court-Level Dashboard:** An administrator-scoped aggregate view across the full court's tracked defendants.
- **Risk Indicator:** A caseload-level signal (approaching threshold, data gap, unreviewed candidate, stale calculation) surfaced to prioritize attention.

**Sub-features:**
- Personal dashboard (judge/clerk-scoped caseload view)
- Court-level aggregate dashboard (administrator-scoped)
- Risk indicators: approaching thresholds, data gaps, unresolved exclusions

**Process:**
1. User opens their personal dashboard (judge/clerk) or, if entitled, the court-level aggregate dashboard (court administrator).
2. System aggregates across the viewer's authorized tracker scope: trackers with remaining time within a configurable "approaching" band of the next threshold (F31), trackers with open `missing_trigger_event` or `unmapped_docket_event` exceptions (F07/F26/F27), trackers with unreviewed candidate exclusions aged beyond a configurable staleness threshold (F28/F30), and trackers whose current calculation version is stale (no recalculation since a configurable period despite new docket activity).
3. Each risk indicator links through to the relevant tracker's case conference view (F35) or review queue (F06) for immediate action.
4. Court-level dashboard additionally aggregates counts/trends across the full court (e.g., "14 trackers approaching threshold this week," "3 trackers with data gaps older than 10 days") without exposing defendant-identifying detail in the aggregate summary tier, consistent with F09's de-identification approach for administrator-facing metrics — though court administrators with case-access entitlements may still drill through to individual tracker detail where authorized, distinct from the stricter de-identified reporting feed (F09) intended for AO-level review.
5. Dashboards refresh on a near-real-time basis as new calculation versions, exceptions, or confirmations occur.

**Inputs:**
- `scope` (personal — viewer's assigned caseload; or court-level — administrator's authorized court/division)
- `risk_filters` (optional): approaching_threshold | data_gap | unresolved_exclusion | stale_calculation

**Outputs:**
- Dashboard view: list of flagged trackers with risk indicator type, age/severity, and deep link

**Validation:**
- Personal dashboard scope is strictly limited to trackers the viewing judge/clerk is assigned to (via F01 proceeding/case assignment) — it must never surface trackers outside their caseload, even in aggregate count form.
- Court-level dashboard access requires `court_admin` entitlement; a routine clerk/judge role does not receive court-level aggregate access merely by having a large personal caseload.
- Staleness/approaching-threshold band widths are court-configurable (F03), not hardcoded, so courts can tune sensitivity to their own risk tolerance.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Personal dashboard query attempts to include out-of-scope trackers | 403 (internal guard) | PORTFOLIO_SCOPE_VIOLATION | "Dashboard scope restricted to your assigned caseload" |
| Court-level dashboard access by non-admin | 403 | PORTFOLIO_ADMIN_DENIED | "Court-level dashboard requires administrator access" |
| No risk-indicator configuration found for court | 422 | PORTFOLIO_NO_CONFIG | "Risk indicator thresholds are not configured for this court" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Portfolio Dashboard for `/speedytrial/dashboard/personal`, `/speedytrial/dashboard/court` endpoints.

**Schema Surface (this feature):** read-only aggregation over `defendant_trackers`, `calculation_versions`, `exceptions`, `candidate_exclusions` — no dedicated writable table; see `Y0c-schema-speedytrial.md` §Portfolio Dashboard.
## F37: Cross-Court Governance and National Configuration

**Description:** Formal governance tooling distinguishing centrally-governed national configuration from court/division-level modification authority, supporting multi-court/national deployment. This is a Scale-increment feature not required for single-court pilot operation but necessary before the system can responsibly scale across many federal districts without each court silently diverging in ungoverned ways.

**Terminology:**
- **National Baseline:** The centrally-governed configuration (base numbering patterns, base event-category catalog, base security-designation policy) that all courts inherit unless explicitly permitted to override.
- **Local Override Scope:** The subset of configuration fields a given court/division is permitted to modify independently, as defined by national governance policy.
- **Governance Workflow:** The approval process by which a court's proposed local configuration change is reviewed against national policy before taking effect.

**Sub-features:**
- National configuration baseline with controlled override scope
- Governance workflow for proposing/approving local configuration changes
- Cross-court configuration consistency reporting

**`[ASSUMPTION]`:** The PRD/vision document explicitly leaves the national-vs-local governance split undecided (PRD §9.3). This FRD assumes a baseline-plus-override model (national defaults, explicitly enumerated court-overridable fields) as the simplest workable governance pattern, to be substantially revisited once AOUSC/national-governance stakeholders are engaged — this feature is lower-confidence than P0/P1 features given its reliance on an unresolved policy question.

**Process:**
1. A national governance administrator defines the national baseline configuration (via F03's configuration engine, scoped at a "national" level above individual court profiles) and designates which fields each court/division may locally override versus which remain centrally fixed.
2. A court administrator proposing a local configuration change that falls within their permitted override scope follows F03's standard maker-checker process, scoped to their court.
3. A court administrator proposing a change outside their permitted override scope (e.g., attempting to alter a nationally-fixed field) submits a governance request, routed to the national governance administrator for review/approval before it can take effect.
4. Cross-court configuration consistency reporting (for F09/F38 consumption) flags courts whose active configuration has diverged from the national baseline in fields not within their designated override scope (which should be structurally impossible if enforced correctly, but the reporting exists as a defense-in-depth consistency check).
5. All national baseline changes and governance approvals are audit-logged (F02) with the approving national administrator's identity.

**Inputs:**
- National baseline definition: `{field, default_value, court_overridable (boolean)}`
- Governance request: `court_id`, `requested_field`, `requested_value`, `rationale`

**Outputs:**
- Published national baseline configuration
- Court-specific effective configuration (baseline + permitted local overrides)
- Governance request approval/denial record
- Cross-court consistency report

**Validation:**
- A court/division may never directly modify a field designated non-overridable at the national level; any such attempt is rejected at the API layer, not merely flagged after the fact.
- Governance requests require a distinct `national_governance_admin` entitlement to approve, separate from any individual court's `config_admin` role.
- Cross-court consistency reports must never expose one court's local configuration detail to another court's administrators — visibility is limited to the national governance administrator and the court's own administrators for their own configuration.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Court attempts to modify a non-overridable national field | 403 | GOVERNANCE_FIELD_LOCKED | "This configuration field is governed nationally and cannot be modified locally" |
| Governance request approval by non-national-admin | 403 | GOVERNANCE_APPROVAL_DENIED | "National governance approval requires national administrator access" |
| Cross-court report requested by court-scoped admin | 403 | GOVERNANCE_REPORT_SCOPE_DENIED | "Cross-court reporting requires national governance access" |

**API Surface (this feature):** see `Y1a-api-shared.md` §National Governance for `/governance/national-baseline`, `/governance/requests`, `/governance/consistency-report` endpoints.

**Schema Surface (this feature):** uses tables `national_baseline_config`, `governance_requests` — see `Y0a-schema-shared.md` §National Governance.
## F38: Advanced Analytics

**Description:** Deeper operational and risk analytics across courts/dockets beyond the baseline reporting feed (F09), supporting AO-level program management with cross-court trend analysis — strictly bounded to inform program management, never judicial determinations.

**Terminology:**
- **Trend Analysis:** Multi-court, multi-period comparison of operational metrics (discrepancy rates, reconciliation effort, alert effectiveness) to identify systemic patterns.

**Sub-features:**
- Cross-court trend analysis (discrepancy rates, reconciliation effort, alert effectiveness)
- De-identified / role-limited analytics exports
- Explicit guardrail: analytics inform program management only, never judicial determinations

**Process:**
1. AO program manager (or equivalent cross-court analytics role) requests a trend analysis across a selected set of courts and a time period, choosing from available metric categories (discrepancy rate trends from F18, reconciliation effort trends, alert effectiveness/acknowledgment-rate trends from F31).
2. System aggregates the requested metrics at court-level granularity across the selected courts/period, applying the same de-identification discipline as F09 (no case- or defendant-level detail, ever, in this cross-court context).
3. System renders trend visualizations (charts, period-over-period comparisons) and supports export.
4. Every analytics surface carries the same persistent guardrail labeling as F09: "Administrative/program metrics — not for use in case determinations," reinforced here because cross-court trend data could otherwise tempt interpretation as implying judicial performance evaluation, which is explicitly out of scope.

**Inputs:**
- `court_ids[]` (selected courts, within requester's authorized cross-court scope)
- `metric_categories[]`
- `period` (date range, comparison granularity)

**Outputs:**
- Trend visualization/dashboard
- Export artifact (de-identified, court-level granularity minimum)

**Validation:**
- No individual case, defendant, or named exhibit may appear in any advanced analytics output, regardless of requester's underlying case-level entitlements elsewhere in the system — this surface is strictly aggregate-only, with no drill-through path (distinguishing it from F36's court-level dashboard, which does permit authorized drill-through).
- Access requires a distinct `ao_program_analytics` entitlement, separate from both routine operational roles and the F09 baseline reporting role.
- Any proposed metric that could function as a proxy for judicial decision evaluation (e.g., ruling outcome rates by judge) is explicitly excluded from the available metric catalog by design, not merely by policy — the metric catalog structurally does not include judge-attributed outcome metrics.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Requester lacks ao_program_analytics entitlement | 403 | ANALYTICS_ACCESS_DENIED | "You do not have advanced analytics access" |
| Attempt to request a judge-outcome-attributed metric | 422 (structurally unavailable) | ANALYTICS_METRIC_OUT_OF_SCOPE | "This metric is not available; judicial outcome evaluation is out of scope" |
| Cross-court scope exceeds requester's authorization | 403 | ANALYTICS_SCOPE_DENIED | "One or more requested courts are outside your authorized scope" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Advanced Analytics for `/analytics/trends`, `/analytics/export` endpoints.

**Schema Surface (this feature):** read-only aggregation over F09's reporting views plus historical trend storage in `analytics_trend_snapshots` — see `Y0a-schema-shared.md` §Advanced Analytics.
## F39: Broader Courtroom Technology Integration

**Description:** Deeper integration with courtroom display and secure jury-review hardware beyond the basic restricted digital package delivered in F22. This Scale-increment feature extends the controlled jury package concept into live, in-courtroom display/streaming scenarios while preserving the same no-uncontrolled-copying, no-public-access controls.

**Terminology:**
- **Secure Display Integration:** A controlled connection between JudicialSync and courtroom display hardware, authorized to render specific admitted exhibits during proceedings.
- **Controlled Stream:** An outbound package or stream to jury-review hardware, access-bounded and monitored, distinct from a downloadable file.

**Sub-features:**
- Secure display/streaming integration for authorized admitted evidence
- Controlled outbound package/stream with no uncontrolled copying or public access
- Integration monitoring and incident support

**Process:**
1. Courtroom technology (display hardware, secure jury-review terminal) authenticates to JudicialSync via a dedicated, narrowly-scoped integration credential (distinct from user-facing F00 sessions).
2. An authorized user (judge/deputy) initiates a secure display session for a specific admitted exhibit (F16) or an assembled jury package (F22), explicitly authorizing which hardware endpoint may receive the stream.
3. System streams or renders the controlled content to the authorized endpoint only, with the stream bounded to the session duration and exhibit scope explicitly authorized — no general file access is exposed to the display hardware beyond what was specifically authorized for that session.
4. All display/streaming sessions are logged (session start/end, exhibit(s) shown, authorizing user) feeding the audit trail (F02), consistent with F22's package-access logging but extended to live display scenarios.
5. Integration health (connection status, error rates) is monitored, with incidents (failed connections, unauthorized connection attempts) surfaced to system administrators and, for repeated unauthorized attempts, escalated as a security exception (F07).

**Inputs:**
- `exhibit_id` or `jury_package_id` (required)
- `authorized_endpoint_id` (required, registered courtroom hardware identifier)
- `session_duration` or `proceeding_id` (session bound to proceeding by default)

**Outputs:**
- Active controlled display/stream session
- Session access log (feeding F02)
- Integration health/incident record

**Validation:**
- Courtroom hardware integration credentials must be scoped narrowly (display/stream only, no general API access) and are managed with the same separation-of-duties discipline as other privileged integration credentials (F13).
- A display session must never expose content beyond the specific exhibit(s)/package explicitly authorized for that session — no general ledger browsing from courtroom display hardware.
- Sealed/restricted exhibits (F21) follow identical inclusion rules for display sessions as for F22 jury packages — excluded by default, requiring the same explicit per-instance judge authorization to include.
- Unauthorized connection attempts from unregistered hardware endpoints must be rejected and logged as a security exception, not merely a connection failure.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Unregistered hardware endpoint attempts connection | 403 | COURTTECH_UNREGISTERED_ENDPOINT | "This display endpoint is not registered" |
| Display session requested for sealed exhibit without specific authorization | 422 | COURTTECH_SEALED_DENIED | "This exhibit is sealed and not authorized for display" |
| Session requested outside an active proceeding | 409 | COURTTECH_NO_ACTIVE_PROCEEDING | "No active proceeding is associated with this session request" |
| Integration connection failure | 502 | COURTTECH_CONNECTION_FAILED | "Courtroom display connection failed" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Courtroom Technology for `/evidentiary/courtroom-display/sessions`, `/evidentiary/courtroom-display/endpoints` endpoints.

**Schema Surface (this feature):** uses tables `courtroom_display_sessions`, `registered_display_endpoints` — see `Y0b-schema-evidentiary.md` §Courtroom Technology Integration.
## Y0a: Database Schema — Shared Foundation

Full DDL for entities underlying the Shared Platform Foundation features (F00–F13). All tables use UUIDv4 primary keys (`id`), `created_at`/`updated_at` timestamptz columns (omitted below for brevity except where semantically significant), and `snake_case` naming. No table listed here permits application-level `DELETE` except where explicitly noted.

### §Identity (F00)

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

CREATE TABLE scope_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('court','division','case','proceeding','party_role','security_designation')),
  scope_value UUID, -- nullable for party_role/security_designation enum-type scopes
  scope_enum_value TEXT -- used for party_role/security_designation
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  refresh_token_hash TEXT NOT NULL,
  mfa_satisfied BOOLEAN NOT NULL DEFAULT false,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
```

### §Case Model (F01)

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

CREATE TABLE proceedings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  proceeding_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  presiding_judge_id UUID REFERENCES users(id)
);

CREATE TABLE hearings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceeding_id UUID NOT NULL REFERENCES proceedings(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  held_at TIMESTAMPTZ,
  hearing_type TEXT NOT NULL
);

CREATE TABLE parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  party_name TEXT NOT NULL,
  party_role TEXT NOT NULL CHECK (party_role IN ('defendant','government','plaintiff','counsel','pro_se')),
  external_id TEXT, -- CM/ECF party identifier
  source_system TEXT NOT NULL DEFAULT 'manual'
);

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

CREATE TABLE document_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  source_system TEXT NOT NULL,
  source_identifier TEXT,
  document_title TEXT,
  storage_pointer TEXT -- reference to object store / repository location
);

CREATE TABLE security_designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL, -- 'case' | 'document_reference' | 'exhibit'
  object_id UUID NOT NULL,
  designation TEXT NOT NULL CHECK (designation IN ('sealed','restricted','grand_jury','juvenile','pii')),
  applied_by UUID NOT NULL REFERENCES users(id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### §Audit (F02)

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
-- No UPDATE/DELETE grants on this table for the application role at the DB level.
```

### §Configuration (F03)

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

CREATE TABLE workflow_state_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_package_version_id UUID NOT NULL REFERENCES rule_package_versions(id),
  object_type TEXT NOT NULL,
  state_name TEXT NOT NULL,
  allowed_transitions TEXT[] NOT NULL DEFAULT '{}',
  required_role TEXT
);

CREATE TABLE threshold_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_package_version_id UUID NOT NULL REFERENCES rule_package_versions(id),
  threshold_type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL
);

CREATE TABLE event_mapping_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_package_version_id UUID NOT NULL REFERENCES rule_package_versions(id),
  source_event_code TEXT,
  source_event_description_pattern TEXT,
  internal_category TEXT NOT NULL
);
```

### §Notifications (F04)

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

CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id),
  recipient_user_id UUID NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','failed','acknowledged')),
  sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ
);

CREATE TABLE notification_recipients_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id),
  notification_type TEXT NOT NULL,
  recipient_role TEXT NOT NULL,
  channel TEXT NOT NULL,
  escalation_cadence_minutes INTEGER
);
```

### §Work Queue (F06)

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
```

### §Exception Queue (F07)

```sql
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
```

### §Search Index (F05)

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
-- Access-scoping is applied as a mandatory predicate at query time using the
-- requester's court/division/case/security-designation entitlements (F00).
```

### §CM/ECF Integration (F10)

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

CREATE TABLE adapter_health_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_successful_sync_at TIMESTAMPTZ,
  error_count INTEGER NOT NULL DEFAULT 0,
  backlog_count INTEGER NOT NULL DEFAULT 0
);
```

### §External Portal (F12)

```sql
CREATE TABLE external_principals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_idp_subject TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bar_number TEXT
);
```

### §Security & Retention (F13)

```sql
CREATE TABLE file_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_pointer TEXT NOT NULL,
  file_type TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  declared_purpose TEXT NOT NULL,
  scan_status TEXT NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','rejected'))
);

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
```

### §National Governance (F37)

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
```

### §Advanced Analytics (F38)

```sql
CREATE TABLE analytics_trend_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id),
  metric_category TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  aggregate_value NUMERIC NOT NULL
);
```
## Y0b: Database Schema — Evidentiary Tracking

Full DDL for entities underlying the Evidentiary Tracking module features (F14–F25, F39).

### §Case Setup (F14)

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

### §Pretrial Intake (F15)

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
```

### §Exhibit Ledger (F16, F23)

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
-- No UPDATE/DELETE grants on exhibit_versions for the application role.
```

### §Courtroom Logging (F17)

```sql
CREATE TABLE courtroom_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceeding_id UUID NOT NULL REFERENCES proceedings(id),
  opened_by UUID NOT NULL REFERENCES users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))
);

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
```

### §Reconciliation (F18)

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
```

### §Basic Closeout (F19)

```sql
CREATE TABLE exhibit_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceeding_id UUID NOT NULL REFERENCES proceedings(id),
  status_filter TEXT[] NOT NULL,
  snapshot_version_refs JSONB NOT NULL, -- {exhibit_id: exhibit_version_id, ...}
  certified_by UUID REFERENCES users(id),
  certified_at TIMESTAMPTZ
);
```

### §Custody & Location (F20)

```sql
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
```

### §Sealing & Restricted Handling (F21)

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
```

### §Jury Package (F22)

```sql
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

CREATE TABLE jury_package_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jury_package_id UUID NOT NULL REFERENCES jury_packages(id),
  accessed_by UUID REFERENCES users(id),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL -- open | view_exhibit | session_end
);
```

### §Post-Trial Closeout (F24)

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

CREATE TABLE disposition_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disposition_record_id UUID NOT NULL REFERENCES disposition_records(id),
  receipt_document_ref UUID REFERENCES document_references(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### §Portfolio & Templates (F25)

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
```

### §Courtroom Technology Integration (F39)

```sql
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
```
## Y0c: Database Schema — Speedy Trial Tracker

Full DDL for entities underlying the Speedy Trial Tracker module features (F26–F36).

### §Tracker Initialization (F26)

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
  current_calculation_version_id UUID, -- FK added after calculation_versions defined
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, defendant_party_id)
);
```

### §Event Ingestion (F27)

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

CREATE TABLE event_category_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_package_version_id UUID NOT NULL REFERENCES rule_package_versions(id),
  source_code_pattern TEXT NOT NULL,
  event_category TEXT NOT NULL
);
```

### §Candidate Exclusion Engine (F28)

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
```

### §Review & Approval Workflow (F30)

```sql
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
-- No UPDATE/DELETE grants; corrections create a new row with supersedes_confirmed_exclusion_id set.

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
```

### §Clock Calculation & Explainability (F29)

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
-- No UPDATE/DELETE grants on this table for the application role.

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

ALTER TABLE defendant_trackers
  ADD CONSTRAINT fk_current_calc_version
  FOREIGN KEY (current_calculation_version_id) REFERENCES calculation_versions(id);
```

### §Threshold Alerts & Escalation (F31)

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

CREATE TABLE alert_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threshold_alert_id UUID NOT NULL REFERENCES threshold_alerts(id),
  escalated_to_role TEXT NOT NULL,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### §Continuance Findings Check (F33)

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
```

### §Multi-Defendant Separation (F34)

```sql
CREATE TABLE codefendant_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  tracker_ids UUID[] NOT NULL,
  relationship_status TEXT NOT NULL DEFAULT 'joint' CHECK (relationship_status IN ('joint','severed'))
);

CREATE TABLE severance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  severed_defendant_tracker_ids UUID[] NOT NULL,
  severance_date DATE NOT NULL,
  confirmed_by UUID NOT NULL REFERENCES users(id),
  audit_event_id UUID NOT NULL REFERENCES audit_events(id)
);
```

### §Case Conference View (F35) / §Portfolio Dashboard (F36)

No dedicated writable tables — both are read-only aggregations over `defendant_trackers`, `calculation_versions`, `candidate_exclusions`, `confirmed_exclusions`, `continuance_records`, `exceptions`, and `threshold_alerts` defined above.
## Y1a: API Endpoints — Shared Platform

All endpoints are prefixed `/api/v1` (omitted below for brevity). All require a valid session token (F00) except where noted as part of the authentication flow itself. All mutating endpoints emit an audit event (F02) unless explicitly marked read-only.

### §Identity & Access (F00)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/auth/login` | `{identity_assertion}` | `{session_token, refresh_token, entitlements}` | IdP-assertion exchange |
| POST | `/auth/mfa-challenge` | `{mfa_challenge_response}` | `{session_token}` | Conditional second step |
| POST | `/auth/refresh` | `{refresh_token}` | `{session_token}` | Rotates refresh token |
| POST | `/auth/logout` | — | `204` | Revokes session |
| GET | `/auth/entitlements` | — | `{roles[], scopes[]}` | Current user's computed entitlements |

### §Case & Docket Model (F01)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/cases` | `{case_number, court_id, division_id, case_caption, case_type, party[]}` | `201 {case}` | Manual creation fallback |
| GET | `/cases/{id}` | — | `{case}` | — |
| GET | `/cases/{id}/proceedings` | — | `{proceedings[]}` | — |
| POST | `/cases/{id}/proceedings` | `{proceeding_type}` | `201 {proceeding}` | — |
| GET | `/cases/{id}/parties` | — | `{parties[]}` | — |
| GET | `/cases/{id}/docket-events` | query: date range, category | `{docket_events[]}` | — |
| PATCH | `/cases/{id}/security-designations` | `{designations[]}` | `200` | Requires `case_security_admin` |

### §Audit (F02)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/audit/events` | (internal service-to-service only) | `201` | Not user-invokable |
| GET | `/audit/explorer` | query: `case_id, user_id, date_range, object_type` | `{audit_events[]}` | Requires `audit_reader` entitlement |

### §Configuration (F03)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/config/court-profiles/{court_id}` | — | `{court_profile}` | — |
| POST | `/config/rule-packages` | `{numbering_scheme, workflow_states[], thresholds[], event_mappings[]}` | `201 {rule_package_version (draft)}` | — |
| POST | `/config/rule-packages/{id}/publish` | `{approving_user_id}` | `200` | Maker-checker: approver ≠ drafter |
| GET | `/config/rule-packages/{court_id}/effective` | — | `{rule_package_version}` | Currently effective version |

### §Notifications (F04)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/notifications` | `{recipient_role\|recipient_user_id, notification_type, severity, object_reference, court_id}` | `201` | Internal trigger |
| GET | `/notifications/my` | — | `{notifications[]}` | User's inbox |
| POST | `/notifications/{id}/acknowledge` | — | `200` | — |

### §Search (F05)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/search` | query: `query_text, identifier, party_name, witness_name, status, date_from, date_to, proceeding_id` | `{results[]}` | Access-scoped pre-filtered |

### §Work Queue (F06)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/tasks` | `{task_type, owner_role\|owner_user_id, object_reference, priority}` | `201` | Internal trigger |
| GET | `/tasks/my-queue` | query: filters | `{tasks[]}` | Role-scoped |
| POST | `/tasks/{id}/complete` | `{completing_audit_event_id}` | `200` | — |
| POST | `/tasks/{id}/dismiss` | `{rationale}` | `200` | Rationale required for legally significant tasks |

### §Exception Queue (F07)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/exceptions` | query: `module, type, severity, age` | `{exceptions[]}` | — |
| POST | `/exceptions/{id}/resolve` | `{resolution_action, rationale}` | `200` | Rationale min-length enforced |

### §Case Timeline (F08)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/cases/{id}/timeline` | query: `event_type[], date_from, date_to, module[]` | `{timeline_entries[]}` | Access-scoped merge |

### §Reporting (F09)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/reporting/dashboard` | query: `scope, metric_set[]` | `{metrics}` | Requires `reporting_viewer` |
| GET | `/reporting/export` | query: same | file | De-identified |

### §CM/ECF Adapter (F10)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/integrations/cmecf/sync` | CM/ECF payload | `200/409` | Inbound webhook/poll target |
| GET | `/integrations/cmecf/status` | — | `{last_sync, error_rate, backlog}` | — |
| POST | `/integrations/cmecf/outbound` | `{filing_payload}` | `201` | Requires `docket_outbound` entitlement |

### §UI Workspaces (F11)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| PATCH | `/users/me/workspace-preference` | `{workspace_preference}` | `200` | — |

### §External Portal (F12)
*Separate base path `/portal/v1`, distinct auth middleware.*
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/portal/submissions` | exhibit metadata | `201` | `submitted_via='external_portal'` |
| GET | `/portal/trackers/{id}/summary` | — | `{remaining_time, next_threshold, confirmed_periods[]}` | Read-only, scoped visibility |

### §Security Baseline (F13)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/files/upload` | multipart file | `201/422` | Malware scan + allowlist gate |
| POST | `/security/policy-evaluate` | `{object_type, object_id, requester_scope}` | `{allow\|deny}` | Internal |
| GET | `/retention/schedules` | query: `court_id` | `{schedules[]}` | — |
| GET | `/retention/due-for-disposition` | query: `court_id` | `{records[]}` | Feeds F06 tasks |

### §National Governance (F37)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET/POST | `/governance/national-baseline` | `{field, default_value, court_overridable}` | `{baseline}` | Requires `national_governance_admin` |
| POST | `/governance/requests` | `{court_id, requested_field, requested_value, rationale}` | `201` | — |
| GET | `/governance/consistency-report` | — | `{divergences[]}` | — |

### §Advanced Analytics (F38)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/analytics/trends` | query: `court_ids[], metric_categories[], period` | `{trends}` | Requires `ao_program_analytics` |
| GET | `/analytics/export` | same | file | De-identified, court-level min |
## Y1b: API Endpoints — Evidentiary Tracking

All endpoints prefixed `/api/v1/evidentiary` (shown relative below). All mutating endpoints emit audit events (F02) unless noted.

### §Case Setup (F14)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/cases/{id}/setup` | `{proceeding_id, numbering_scheme_id, party_ids[], security_designations[]}` | `201 {exhibit_tracking_context}` | Idempotent re-run |

### §Pretrial Intake (F15)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/intake` | `{description, offering_party_id, proceeding_id, exhibit_type, proposed_number, file}` | `201 {submission}` | File via F13 scan gate |
| GET | `/intake` | query: `proceeding_id, status` | `{submissions[]}` | — |
| POST | `/intake/{id}/accept` | — | `200 {exhibit}` | Promotes to ledger |
| POST | `/intake/{id}/reject` | `{reason}` | `200` | — |
| POST | `/intake/{id}/request-correction` | `{deficiency_detail}` | `200` | — |

### §Exhibit Ledger (F16)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/exhibits` | query: filters | `{exhibits[]}` | — |
| GET | `/exhibits/{id}` | — | `{exhibit}` | — |
| POST | `/exhibits/{id}/transition` | `{status_transition, proceeding_id, ruling_actor_id?, notes}` | `200 {exhibit, new_version}` | Workflow-validated |
| GET | `/exhibits/{id}/versions` | — | `{versions[]}` | Immutable history |

### §Courtroom Logging (F17)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/sessions` | `{proceeding_id}` | `201 {session}` | Opens logging session |
| POST | `/sessions/{id}/log-action` | `{exhibit_id, action, objection_category?, ruling_outcome?, notes?}` | `200` | Judge attribution auto-resolved |
| POST | `/sessions/{id}/close` | — | `200/409` | Triggers F18 reconciliation |

### §Reconciliation (F18)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/reconciliation/runs` | `{proceeding_id, checkpoint_type}` | `201 {run}` | — |
| GET | `/reconciliation/runs/{id}/discrepancies` | — | `{discrepancies[]}` | — |
| POST | `/reconciliation/discrepancies/{id}/resolve` | `{resolved_value, rationale}` | `200` | — |

### §Basic Closeout (F19)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/exports` | `{proceeding_id, status_filter[], export_format}` | `201 {export}` | — |
| POST | `/exports/{id}/certify` | — | `200` | Distinct confirmation action |

### §Custody (F20)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/exhibits/{id}/custody-transfers` | `{recipient_custodian_id, purpose, location, condition_note}` | `201 {transfer}` | — |
| POST | `/custody-transfers/{id}/acknowledge` | `{condition_confirmed}` | `200` | Recipient-only |

### §Sealing (F21)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/exhibits/{id}/seal` | `{designation_category, authorizing_judge_id, permitted_entitlement_scope}` | `200` | Judge-only |
| POST | `/exhibits/{id}/release` | `{release_authorizing_judge_id, release_reason}` | `200` | — |

### §Jury Package (F22)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/proceedings/{id}/jury-packages` | `{authorizing_judge_id, inclusion_scope, session_window}` | `201 {package}` | Auto-excludes sealed/non-admitted |
| GET | `/jury-packages/{id}/session` | — | `{access_token, expires_at}` | Session-scoped |

### §Exhibit Types (F23)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/exhibit-types` | query: `court_id` | `{types[]}` | Catalog |
| POST | `/exhibits/{id}/reclassify` | `{new_type, reason}` | `200` | Audit-logged |

### §Full Closeout (F24)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/proceedings/{id}/closeout` | — | `201 {closeout_package}` | Requires completed reconciliation |
| POST | `/closeout/{id}/dispositions` | `{exhibit_id, disposition_action, executing_custodian_id}` | `200` | — |
| POST | `/closeout/{id}/certify` | — | `200` | — |

### §Portfolio & Templates (F25)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/portfolio/dashboard` | query: `scope` | `{metrics}` | Caseload-scoped |
| POST | `/templates` | `{source_court_id, template_name}` | `201` | Requires `system_admin` |
| POST | `/templates/{id}/apply` | `{target_court_id, approving_user_id}` | `200` | Maker-checker |

### §Courtroom Technology (F39)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/courtroom-display/sessions` | `{exhibit_id\|jury_package_id, authorized_endpoint_id, proceeding_id}` | `201` | — |
| GET | `/courtroom-display/endpoints` | query: `court_id` | `{endpoints[]}` | — |
## Y1c: API Endpoints — Speedy Trial Tracker

All endpoints prefixed `/api/v1/speedytrial` (shown relative below). All mutating endpoints emit audit events (F02) unless noted.

### §Tracker Initialization (F26)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/trackers` | `{defendant_party_id, case_id, trigger_event_id\|trigger_event_type+trigger_date}` | `201 {tracker (proposed)}` | Auto or manual path |
| POST | `/trackers/{id}/confirm` | — | `200 {tracker (confirmed)}` | Requires reviewer entitlement |
| POST | `/trackers/{id}/reject` | `{reason}` | `200` | Routes to exception |

### §Event Ingestion (F27)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/events` | `{source_identifier, source_code, source_description, event_date, case_id, defendant_party_id}` | `201/200 (idempotent)` | Duplicate-safe |
| POST | `/events/{id}/resolve-mapping` | `{event_category}` or `{new_mapping_rule_request}` | `200` | Requires reviewer entitlement |

### §Candidate Exclusions (F28)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/trackers/{id}/candidate-exclusions` | query: `state` | `{candidates[]}` | Read/list only; generation is system-triggered |

### §Clock Calculation (F29)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/trackers/{id}/calculate` | `{calculation_date?}` | `201 {calculation_version}` | Creates new immutable version |
| GET | `/trackers/{id}/calculation-versions` | — | `{versions[]}` | Full history |
| GET | `/calculation-versions/{id}/explain` | — | `{segments[]}` | "Explain this date" view |

### §Review & Approval (F30)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/review-items/{id}/accept` | — | `200 {confirmed_record}` | — |
| POST | `/review-items/{id}/modify` | `{modified_value, rationale}` | `200` | — |
| POST | `/review-items/{id}/reject` | `{rationale}` | `200` | — |
| POST | `/review-items/{id}/override` | `{modified_value, rationale}` | `200 {new_version}` | Never edits in place |

### §Threshold Alerts (F31)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/trackers/{id}/alerts` | — | `{alerts[]}` | — |
| POST | `/alerts/{id}/acknowledge` | — | `200` | Feeds audit trail |

### §Version Comparison (F32)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/trackers/{id}/calculation-versions/compare` | query: `version_a_id, version_b_id` | `{additions[], removals[], modifications[]}` | Same-tracker only |

### §Continuance Findings (F33)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/continuances/{id}/completeness` | — | `{status, missing_fields[]}` | Structural check only |
| POST | `/continuances/{id}/supply-references` | `{structured_findings_ref, order_document_ref}` | `200` | Chambers/judge entitlement |

### §Multi-Defendant (F34)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/cases/{id}/defendant-trackers` | — | `{trackers[], relationships[]}` | No collapsed view |
| POST | `/cases/{id}/severance` | `{severed_defendant_ids[], severance_date}` | `201 {severance_event}` | Explicit confirmation required |

### §Case Conference View (F35)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/trackers/{id}/conference-view` | query: `proceeding_context?` | `{summary}` | Deep-linked |
| GET | `/trackers/{id}/conference-view/export` | — | file (packet) | — |

### §Portfolio Dashboard (F36)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/dashboard/personal` | — | `{flagged_trackers[]}` | Caseload-scoped |
| GET | `/dashboard/court` | query: `court_id` | `{aggregate_metrics}` | Requires `court_admin` |
## Y2: Cross-Feature Error Catalog

This catalog consolidates error scenarios that recur across multiple features (rather than being specific to exactly one feature, which are instead documented in that feature's own Error States table). Feature-specific error codes remain in their respective `F{nn}-*.md` chunks; this catalog exists so implementers have a single reference for shared/systemic error handling conventions and codes used by more than one feature.

### Conventions
- Error codes follow the pattern `{DOMAIN}_{CONDITION}`, where `DOMAIN` identifies the owning feature area (AUTH, CASE, AUDIT, CONFIG, NOTIFY, SEARCH, TASK, EXCEPTION, TIMELINE, REPORT, CMECF, UI, PORTAL, SECURITY, EXHIBIT_SETUP, INTAKE, LEDGER, COURTROOM, RECONCILE, EXPORT, CUSTODY, SEAL, JURY, TYPE, CLOSEOUT, PORTFOLIO, TRACKER, EVENT, EXCLUSION, CALC, REVIEW, ALERT, DIFF, CONTINUANCE, MULTIDEF, CONFERENCE, GOVERNANCE, ANALYTICS, COURTTECH).
- All error responses return a JSON body: `{error_code, message, detail?}`.
- `403` is used for authorization/entitlement denials; `422` for validation/business-rule failures; `409` for state-conflict failures; `404` for not-found (including existence-hiding cases per F21/F05); `502/503` for upstream/dependency failures; `500` reserved for internal-guard violations that should structurally never occur (these indicate a defect, not a user error, and must be alerted to system administrators, not merely returned to the client).

### Shared Systemic Error Scenarios

| Scenario | HTTP Status | Error Code | Message | Applicable Features |
|----------|-------------|------------|---------|----------------------|
| Requester lacks required entitlement for the action | 403 | `*_ACCESS_DENIED` / `*_DENIED` | "You are not authorized to perform this action" | All features (F00 ABAC gate) |
| Requester's security-designation entitlement insufficient for a sealed/restricted object | 403 or 404 (existence-hiding per context) | `*_DESIGNATION_DENIED` | "This record requires additional authorization" (or "not found") | F00, F01, F05, F08, F12, F21 |
| Rationale required but missing/too short on a legally significant action | 422 | `*_RATIONALE_REQUIRED` / `*_RATIONALE_TOO_SHORT` | "A rationale is required" / "Rationale must be at least 10 characters" | F07, F18, F28, F30 |
| Attempt to edit/delete an immutable append-only record | 403 (internal guard) | `*_IMMUTABLE` | "This record cannot be modified after creation" | F02 (audit_events), F16 (exhibit_versions), F29 (calculation_versions), F30 (confirmed_exclusions) |
| Separation-of-duties violation (self-approval, maker=checker) | 403 | `*_SOD_VIOLATION` | "A second approver is required" / "Cannot approve your own request" | F00, F03, F25, F37 |
| Upstream/dependent service unavailable | 503 | `*_UNAVAILABLE` | "{Service} is temporarily unavailable" | F00 (IdP), F05 (index), F10 (CM/ECF), F13 (policy engine) |
| Duplicate submission/delivery detected (idempotent handling) | 200 or 409 (context-dependent) | `*_DUPLICATE*` | "Duplicate ignored" / "This appears to be a duplicate" | F10, F15, F27 |
| Attempt to perform an action requiring human confirmation without it | 403 (internal guard) | `*_UNCONFIRMED` / `*_AUTOMATED_DENIED` | "This action requires human confirmation" | F13 (disposition), F16 (ruling attribution), F26 (tracker confirm), F28/F29/F30 (no auto-finalization) |
| File upload fails malware scan or file-type allowlist | 422 | `SECURITY_MALWARE_DETECTED` / `SECURITY_FILE_TYPE_DENIED` | "File rejected: failed security scan" / "This file type is not permitted" | F13, F15, F20 |
| Resource not found or not within requester's authorized scope | 404 | `*_NOT_FOUND` | "{Resource} not found or not accessible" | All features with read endpoints |
| Status/workflow transition not permitted from current state | 409 | `*_INVALID_TRANSITION` / `*_INVALID_ACTION` | "This action cannot be performed from the current state" | F03 (workflow states), F16, F17, F26 |
| System-defect guard: output missing required explainability linkage | 500 (internal guard) | `*_MISSING_CONTEXT` / `*_UNATTRIBUTED_*` | "System defect: {detail}" — escalated to engineering/security, not shown as ordinary user error | F28, F29, F31, F32, F34 |

### Error Handling Principles (binding across all features)

1. **Fail closed, not open:** Any ambiguity in an access-control or policy-evaluation check (e.g., F13's policy engine unavailable) must deny the action (503/403) rather than default-allow.
2. **No silent partial success:** Where an operation has multiple required side effects (e.g., a domain action + its audit event, per F02's transactional-outbox requirement), failure of any required side effect must roll back the entire operation, returning a clear error rather than leaving an inconsistent state.
3. **Existence-hiding for sealed/restricted records:** Where an object's mere existence may itself be sensitive (sealed cases/exhibits, F05/F21), unauthorized access attempts return `404 Not Found` rather than `403 Forbidden`, to avoid confirming the object's existence to an unauthorized requester.
4. **Human-readable + machine-readable:** Every error response carries both a stable `error_code` for programmatic handling and a `message` suitable for direct display to court staff (never a raw stack trace or internal exception string).
5. **Legally significant actions never fail silently:** Any error blocking a ruling, exclusion confirmation, override, or finding must be surfaced immediately and distinctly in the relevant UI workspace (F11) — these are never queued for later retry without explicit user awareness.
## Y3: Integration Points

This chunk catalogs external system dependencies and integration contracts referenced across feature chunks. Exact transport mechanisms, SDKs, and protocol versions are TechArch decisions; this document specifies the functional contract each integration must satisfy.

### CM/ECF (or Successor Case-Management Platform)

- **Purpose:** Case, party, docket-event, order, and document-reference synchronization (F10).
- **Direction:** Primarily inbound; controlled outbound references/filings only where explicitly authorized (F10 §Process step 7).
- **Authoritative-source discipline:** CM/ECF data always wins in a conflict unless a human explicitly overrides via F07 exception resolution; JudicialSync never silently overwrites a locally-modified field (F10 §Validation).
- **`[ASSUMPTION]`:** Exact mechanism (polling vs. webhook), schema, event availability, and latency are unresolved per PRD/vision §9.3. This FRD assumes a mechanism that:
  - Delivers case, party, docket-event, order, and document-reference records, each carrying a stable CM/ECF-native `source_identifier`.
  - Supports idempotent redelivery (same `source_identifier` + payload does not create duplicate records, per F10/F27 duplicate-detection rules).
  - Surfaces delivery/sync health metrics consumable by F10's adapter health log and F09's reporting feed.
- **Consumed by:** F01 (case/docket model), F10 (adapter itself), F14 (case setup sync), F26/F27 (Speedy Trial trigger/event ingestion).

### Identity Provider (IdP)

- **Purpose:** Single sign-on and multifactor authentication for internal court users (F00) and a separately-scoped flow for external attorneys (F12).
- **Direction:** Bidirectional — JudicialSync redirects to the IdP for authentication and receives signed assertions back; session/entitlement checks occur on every subsequent request.
- **Protocol:** SAML or OIDC (`[ASSUMPTION]`: exact protocol is a TechArch decision; this FRD assumes the IdP can carry role/court-context claims or that JudicialSync resolves role/scope independently of the IdP's own claims, per F00 §Process step 4).
- **Separation requirement:** The external attorney portal (F12) uses a structurally distinct token issuer/audience from internal SSO, even if the underlying IdP technology is shared, so that no internal API inadvertently accepts a portal-scoped token.
- **Consumed by:** F00 (core), F12 (external portal), F11 (workspace routing depends on resolved role).

### Document / Object Repository

- **Purpose:** Secure storage or reference layer for electronic exhibits, generated packages, and other file artifacts (F13, F15, F22, F24).
- **Direction:** Bidirectional (upload and retrieval).
- **Design note:** Sealed and restricted content must be separable from general storage per F13/F21 policy — `[ASSUMPTION]`: the exhibit file storage model (store vs. reference vs. both) is unresolved per PRD/vision §9.3; this FRD specifies the security controls (encryption, malware scanning, allowlisting, per F13) applicable regardless of which model TechArch selects, and assumes at minimum a reference-layer (`storage_pointer` field on `document_references`/`file_references`, see `Y0a-schema-shared.md`) exists.
- **Consumed by:** F13 (controls), F15 (intake upload), F20 (custody condition-note attachments), F22 (jury package electronic content), F24 (closeout receipts/audit package).

### Notification Channels (Email, In-App, Other Approved Channels)

- **Purpose:** Outbound delivery of alerts and notices (F04), consumed by F18 (reconciliation), F20 (custody escalation), F31 (threshold alerts), F07 (exception escalation).
- **Direction:** Outbound, with delivery status (sent/failed/acknowledged) tracked inbound back to JudicialSync.
- **Design note:** Content policy (F04 §Validation) strictly limits what may appear in notification bodies/previews — no sensitive case/defendant/exhibit detail, only generic descriptions plus secure deep links requiring re-authentication.
- **Consumed by:** F04 (core), F07, F18, F20, F31.

### Courtroom Technology (Display / Jury-Review Hardware)

- **Purpose:** Secure display or jury review of authorized admitted evidence (F22 baseline; F39 broader integration).
- **Direction:** Controlled outbound package or stream; no uncontrolled copying or public access.
- **Design note:** Integration credentials are narrowly scoped (display/stream only), distinct from general API access, per F39 §Validation. Health/incident monitoring surfaces to system administrators, with repeated unauthorized connection attempts escalated as security exceptions (F07).
- **Consumed by:** F22 (baseline package delivery), F39 (deeper display/streaming integration).

### Reporting / Analytics Consumers

- **Purpose:** Operational metrics, backlog, data quality, adoption, and support reporting for court administrators and AO program managers (F09 baseline; F38 advanced).
- **Direction:** Outbound, de-identified or role-limited.
- **Design note:** Explicit guardrail — aggregate analytics must never be positioned or usable to alter judicial determinations (F09/F38 §Validation); no judge-outcome-attributed metrics are structurally available in the metric catalog.
- **Consumed by:** F09 (core), F38 (cross-court trend extension), F25 (portfolio dashboard, distinct from de-identified reporting — operational, case-identified, viewer-scoped).

### Integration Monitoring (Cross-Cutting)

- Every external integration above must surface health/status metrics (last successful sync, error rate, backlog where applicable) to system administrators via the admin dashboard (F11) and, for sustained failures, must trigger a critical alert (F04) and/or an exception (F07) rather than failing silently.
- No integration failure may block a user's ability to perform the manual-fallback procedures specified in F13 (e.g., deputies must be able to continue real-time courtroom logging even if the CM/ECF sync or notification channel is down).
