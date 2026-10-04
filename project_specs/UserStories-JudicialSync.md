# User Stories
## JudicialSync

| Field | Value |
|-------|-------|
| **Product Name** | JudicialSync |
| **Date** | 2026-10-04 |
| **Related PRD** | PRD-JudicialSync.md |
| **Related FRD** | FRD-JudicialSync.md |
| **Related Personas** | PERSONAS-JudicialSync.md |

---

## Story Format

Each story follows: **As a [persona], I want to [action], so that [outcome].**

Acceptance criteria are listed beneath each story. Stories are grouped by epic (one epic per PRD/FRD feature, F0–F39) and prioritized P0–P3 per the PRD Feature Index.

**Personas referenced throughout (see `PERSONAS-JudicialSync.md`):**
- **PER-01 Maria Santos** — Courtroom Deputy
- **PER-02 Judge Robert Hale** (chambers, with Law Clerk Ana Ibarra) — Article III Judge / Chambers
- **PER-03 David Okafor** — Clerk / Case Administrator
- **PER-04 Priya Nandan** — System Administrator / Security Officer
- **PER-05 Carla Jimenez** — Jury Administrator
- **PER-06 Thomas Reyes** — Court Administrator / AO Program Manager
- **External Attorney** — Restricted-portal user (F12 only; not a full persona per PERSONAS doc)

**Human-in-command reminder:** No story in this document implies the system auto-finalizes a ruling, finding, exclusion, override, or final Speedy Trial status. Every such action requires an explicit, attributed human approval step, consistent with the PRD/FRD binding constraints.

---
## Epic 0: Identity and Access Management (F0)

### US-0.1: Secure SSO and MFA Login
**As a** courtroom deputy (Maria Santos), **I want to** log in through the court's SSO identity provider with multifactor authentication, **so that** I can access only the records my role permits without delaying courtroom work.

**Acceptance Criteria:**
- [ ] Login accepts a valid SAML/OIDC assertion from the court-configured IdP and rejects invalid or expired assertions with error `AUTH_INVALID_ASSERTION`
- [ ] MFA challenge is enforced for all internal roles unless already satisfied by the IdP assertion
- [ ] A successful login issues a short-lived session token plus a rotation-enabled refresh token carrying role and scope claims
- [ ] Session token scope claims are re-validated against current role/attribute state at least every 5 minutes on privileged actions
- [ ] Every login, MFA outcome, and session termination is captured as an audit event

**Priority:** P0 | **Feature Ref:** F0

---

### US-0.2: Scope Access by Court, Case, and Security Designation
**As a** system administrator (Priya Nandan), **I want to** assign roles and attribute-based scope (court/division/case/proceeding/party-role/security-designation) to each user, **so that** no one can see or act on records outside their authorized scope.

**Acceptance Criteria:**
- [ ] A new account starts with zero module access until a role is explicitly assigned (least-privilege default)
- [ ] Access to a case/proceeding/exhibit/tracker bearing a security designation (sealed, restricted, grand jury, juvenile) requires an explicit additional entitlement beyond the base role
- [ ] An `attorney_external` principal never receives entitlements scoped to internal-only resources (ledger write, calculation override, audit explorer), regardless of case association
- [ ] Insufficient scope on any resource request returns `AUTH_SCOPE_DENIED` (403) rather than partial data
- [ ] Role or scope-attribute changes invalidate active sessions, forcing re-authentication to receive updated entitlements

**Priority:** P0 | **Feature Ref:** F0

---

### US-0.3: Enforce Separation of Duties on Privileged Role Grants
**As a** system administrator (Priya Nandan), **I want to** be blocked from approving a privileged role grant I created myself, **so that** separation of duties is enforced for every privileged administrative action.

**Acceptance Criteria:**
- [ ] A `system_admin` or `security_officer` cannot self-approve a role-grant request they created, returning `AUTH_SOD_VIOLATION` (403)
- [ ] A second, distinct approver is required to finalize any privileged role grant
- [ ] All role-grant creation and approval actions are captured as audit events, including both the requester and approver identities
- [ ] IdP unavailability returns `AUTH_IDP_UNAVAILABLE` (503) rather than silently granting degraded access

**Priority:** P0 | **Feature Ref:** F0

---
## Epic 1: Core Case and Docket Data Model (F1)

### US-1.1: Establish Shared Case, Proceeding, and Party Context
**As a** clerk/case administrator (David Okafor), **I want to** create or sync a case's court, division, proceeding, hearing, and party records in one shared model, **so that** both the Evidentiary Tracking and Speedy Trial modules work from the same case context instead of duplicating it.

**Acceptance Criteria:**
- [ ] A case can be created via CM/ECF sync (F10) or manual entry when sync is unavailable or the case predates sync
- [ ] `case_number` is unique within its court+division scope; a duplicate returns `CASE_DUPLICATE_NUMBER` (409)
- [ ] Court/division association is set at creation and is immutable thereafter
- [ ] A proceeding with existing exhibit or Speedy Trial activity cannot be deleted, only marked `closed`, returning `CASE_PROCEEDING_IN_USE` (409) on delete attempts
- [ ] Both domain modules read case/proceeding/party context exclusively through the shared case-context API — no module maintains a shadow copy

**Priority:** P0 | **Feature Ref:** F1

---

### US-1.2: Apply Security Designations at Case and Document Level
**As a** clerk/case administrator (David Okafor), **I want to** tag a case or document as sealed, restricted, grand jury, juvenile, or PII, **so that** access control and notification content are enforced consistently everywhere that record is referenced.

**Acceptance Criteria:**
- [ ] Security designation changes require a `case_security_admin` entitlement; courtroom deputies may view but not alter designations
- [ ] Unauthorized designation-change attempts return `CASE_DESIGNATION_DENIED` (403)
- [ ] Each designation change produces an audit event with before/after state and actor
- [ ] A case must have at least one `defendant` party before a Speedy Trial tracker (F26) may be initialized against it, enforced via `CASE_MISSING_DEFENDANT` (422)

**Priority:** P0 | **Feature Ref:** F1

---

### US-1.3: Preserve Source Identifiers on Imported Docket Events
**As a** clerk/case administrator (David Okafor), **I want to** have every CM/ECF-sourced docket event and document reference retain its originating source identifier, **so that** authoritative-source discipline is never broken by local edits.

**Acceptance Criteria:**
- [ ] Docket events/document references originating from CM/ECF carry non-null `source_system` and `source_identifier` fields
- [ ] A docket event missing a source identifier is rejected with `CASE_EVENT_MISSING_SOURCE` (422)
- [ ] Manually entered events are explicitly flagged `source_system = 'manual'` for later explainability
- [ ] Document references never embed authoritative content unless the storage model explicitly calls for it, preserving a pointer-based reference by default

**Priority:** P0 | **Feature Ref:** F1

---
## Epic 2: Audit Trail and Audit Explorer (F2)

### US-2.1: Reconstruct Case or User History via Audit Explorer
**As a** system administrator (Priya Nandan), **I want to** filter and reconstruct the full history of actions by case, user, date range, or object, **so that** I can answer who did what, when, and under which rule or calculation version during an incident review or appellate challenge.

**Acceptance Criteria:**
- [ ] Audit Explorer supports filtering by `case_id`, `user_id`, `date_range`, and `object_type`
- [ ] Each result shows actor, action type, before/after diff summary, and a link to the relevant rule-package or calculation version
- [ ] Audit read access requires a distinct `audit_reader` entitlement, never implied by operational edit roles
- [ ] A query without `audit_reader` entitlement returns `AUDIT_READ_DENIED` (403)
- [ ] Sealed/restricted-case audit entries require the same security-designation entitlement as the underlying record; unauthorized attempts return `AUDIT_DESIGNATION_DENIED` (403) and are themselves logged

**Priority:** P0 | **Feature Ref:** F2

---

### US-2.2: Guarantee Tamper-Evident, Hash-Chained Audit Logging
**As a** system administrator (Priya Nandan), **I want to** have every material action captured as an append-only, hash-chained audit entry, **so that** any retroactive edit to the audit trail is detectable.

**Acceptance Criteria:**
- [ ] Every status change, ruling, custody transfer, calculation override, and approval emits an audit event that commits atomically with the domain action (transactional outbox) — if the audit write fails, the domain action rolls back with `AUDIT_WRITE_FAILED` (500)
- [ ] Each audit row stores `prev_hash` and `row_hash`; no UPDATE/DELETE grants exist on the audit table for the application role
- [ ] A periodic integrity-verification job re-walks the hash chain and raises a critical (P0) exception-queue item on any detected break, not merely a log line
- [ ] Hash-chain break detection returns/escalates `AUDIT_CHAIN_BROKEN` to the security officer

**Priority:** P0 | **Feature Ref:** F2

---

### US-2.3: Separate Audit Read Access from Operational Editing
**As a** system administrator (Priya Nandan), **I want to** ensure a user with ledger-edit or calculation-edit rights does not automatically receive audit-read rights (and vice versa), **so that** separation of duties holds for the system's core accountability mechanism.

**Acceptance Criteria:**
- [ ] `audit_reader` is a distinct entitlement from any operational edit role
- [ ] The audit write API (`/audit/events`) is service-to-service only and never directly callable by end-user clients
- [ ] Audit Explorer is read-only; no edit or delete affordance exists anywhere in the UI
- [ ] Attempted direct access/delete calls against audit rows are rejected at the database-permission layer, not merely the application layer

**Priority:** P0 | **Feature Ref:** F2

---
## Epic 3: Configuration Engine (F3)

### US-3.1: Configure Court Profile, Numbering, and Workflow States
**As a** clerk/case administrator (David Okafor), **I want to** configure my court's numbering scheme, workflow states, and approval roles through structured screens, **so that** I can make configuration changes directly without filing an IT ticket.

**Acceptance Criteria:**
- [ ] Configuration edits require `config_admin` entitlement, distinct from both `system_admin` and routine operational roles
- [ ] Draft configuration is validated for structural errors (no orphaned workflow states, no negative thresholds) before publish, returning `CONFIG_INVALID_STRUCTURE` (422) on failure
- [ ] Workflow state sets must have at least one terminal state and no unreachable states
- [ ] Non-admins attempting a config edit receive `CONFIG_EDIT_DENIED` (403)

**Priority:** P0 | **Feature Ref:** F3

---

### US-3.2: Require a Second Approver to Publish Rule Package Changes
**As a** system administrator (Priya Nandan), **I want to** require a distinct second approver before a new rule-package version takes effect, **so that** a single person cannot silently alter configuration that affects an entire court's Speedy Trial calculations.

**Acceptance Criteria:**
- [ ] The same user who drafted a configuration change cannot also publish it; attempting to do so returns `CONFIG_SOD_VIOLATION` (403)
- [ ] Publishing creates a new immutable `rule_package_version` with an effective-from timestamp; the prior version remains retrievable for explainability
- [ ] Every configuration change is logged to the audit trail with a before/after diff and both drafter and approver identities
- [ ] In-flight calculations referencing a prior rule-package version are never retroactively recalculated merely because configuration changed

**Priority:** P0 | **Feature Ref:** F3

---

### US-3.3: Configure Thresholds and Docket-Event Mappings Without Code Changes
**As a** clerk/case administrator (David Okafor), **I want to** configure remaining-time threshold tiers and docket-event-category mappings for my court, **so that** Speedy Trial alerts and event classification reflect local practice without a developer or new deployment.

**Acceptance Criteria:**
- [ ] Threshold tiers must be non-negative and contiguous/non-overlapping; a gap or overlap returns `CONFIG_THRESHOLD_GAP` (422)
- [ ] An event mapping cannot map one source event code to two different internal categories within the same rule-package version, returning `CONFIG_AMBIGUOUS_MAPPING` (422)
- [ ] Dependent services (F27 event mapping, F28 exclusion rules, F31 alert thresholds, F16 numbering) read the currently-effective rule package at the moment they act
- [ ] Every threshold/mapping change is versioned and audit-logged

**Priority:** P0 | **Feature Ref:** F3

---
## Epic 4: Notifications Service (F4)

### US-4.1: Receive Policy-Compliant Alerts Without Sensitive Content Exposure
**As a** judge (Judge Robert Hale), **I want to** receive notifications that link securely to case detail rather than embedding sensitive content in the message body, **so that** defendant, party, or sealed-case information is never exposed in an email preview or unsecured channel.

**Acceptance Criteria:**
- [ ] Notification body/preview text never contains party names, exhibit descriptions, sealed-case identifiers, or defendant-identifying detail
- [ ] Notifications are rendered from reviewed, approved templates — never free text — enforcing the content policy structurally
- [ ] Each notification includes a secure deep link requiring re-authentication rather than embedded detail
- [ ] A content-policy violation detected at render time blocks the send with `NOTIFY_CONTENT_POLICY_VIOLATION` (500, internal) rather than sending a non-compliant message

**Priority:** P0 | **Feature Ref:** F4

---

### US-4.2: Track Delivery Status and Escalate Failed Notifications
**As a** clerk/case administrator (David Okafor), **I want to** see delivery status (sent/failed/acknowledged) for notifications and have persistent failures escalate automatically, **so that** a critical alert never silently fails to reach anyone.

**Acceptance Criteria:**
- [ ] Email delivery failures are retried at least 3 times with exponential backoff before being marked `failed`
- [ ] A notification type with no configured recipient for a court raises a configuration exception rather than silently failing to send (`NOTIFY_NO_RECIPIENT_CONFIGURED`, 422)
- [ ] Persistent delivery failure after retries returns `NOTIFY_DELIVERY_FAILED` (502) and escalates to the Exception Queue
- [ ] Threshold-crossed and custody-unacknowledged notifications escalate to a secondary recipient after a configured maximum unacknowledged duration

**Priority:** P0 | **Feature Ref:** F4

---
## Epic 5: Search Service (F5)

### US-5.1: Search Across Exhibits, Trackers, and Case Objects
**As a** clerk/case administrator (David Okafor), **I want to** search by identifier, party, witness, status, date, description, or proceeding across both modules, **so that** I can retrieve what I need without browsing full case hierarchies.

**Acceptance Criteria:**
- [ ] Search accepts free text and/or structured filters (`identifier`, `party_name`, `witness_name`, `status`, `date_from`, `date_to`, `proceeding_id`)
- [ ] Results are ranked with object type, summary snippet, deep link, and last-updated timestamp
- [ ] A malformed filter combination returns `SEARCH_INVALID_QUERY` (400); an unavailable index returns `SEARCH_INDEX_UNAVAILABLE` (503)
- [ ] Zero authorized matches returns an empty result set, not an error

**Priority:** P0 | **Feature Ref:** F5

---

### US-5.2: Exclude Sealed and Restricted Records from Unauthorized Search Results
**As a** system administrator (Priya Nandan), **I want to** guarantee that sealed/restricted records never appear in search results for unauthorized users, even as a placeholder hit, **so that** the existence of a sealed matter is never confirmed to someone without entitlement.

**Acceptance Criteria:**
- [ ] Index pre-filtering by access scope occurs before relevance ranking, not after
- [ ] Unauthorized sealed/restricted records produce zero hits — no "restricted result" placeholder is ever shown
- [ ] A query that returns or attempts to return sealed/restricted results is logged as an `access_attempt` audit event
- [ ] Free-text search never exposes sealed/restricted document *content* beyond what the requester's designated access level permits

**Priority:** P0 | **Feature Ref:** F5

---
## Epic 6: Work Queue and Task Management (F6)

### US-6.1: View My Role-Scoped Work Queue
**As a** clerk/case administrator (David Okafor), **I want to** see a prioritized list of pending reviews, exceptions, and approvals relevant to my role, **so that** I work from a queue instead of searching entire cases for what needs attention.

**Acceptance Criteria:**
- [ ] Queue view is scoped to the viewing user's role (deputy, clerk, chambers, admin) and sorted by priority then age
- [ ] Cross-module tasks (exhibit + Speedy Trial) can be viewed together, filterable by module
- [ ] Tasks open beyond a configured age threshold are visually flagged and optionally escalated via notification
- [ ] A task created with an unresolvable `owner_role` raises `TASK_NO_ELIGIBLE_OWNER` (422) instead of silently creating an orphaned task

**Priority:** P0 | **Feature Ref:** F6

---

### US-6.2: Complete a Task with a Captured Audit Reference
**As a** judge (Judge Robert Hale), **I want to** complete a review task directly from the queue and have it reference the resulting audit event, **so that** no legally significant task can be quietly dismissed without an audit trace.

**Acceptance Criteria:**
- [ ] A task cannot be marked `completed` without a reference to the audit event produced by the underlying action; attempting this without one returns `TASK_MISSING_AUDIT_REF` (500, internal guard)
- [ ] Tasks tied to legally significant actions (exclusion review, approval request, continuance findings review) cannot be dismissed without a captured rationale, returning `TASK_RATIONALE_REQUIRED` (422) otherwise
- [ ] Opening a task deep-links directly to the underlying object's detail/review view
- [ ] Completed tasks age out of the active queue but remain queryable in history for a configurable retention window

**Priority:** P0 | **Feature Ref:** F6

---
## Epic 7: Exception Queue (F7)

### US-7.1: Resolve a Flagged Exception with a Documented Rationale
**As a** clerk/case administrator (David Okafor), **I want to** review a flagged discrepancy, missing-metadata, or unmapped-event exception and resolve it with a required rationale, **so that** data-quality issues are fixed deliberately rather than silently cleared.

**Acceptance Criteria:**
- [ ] An exception cannot be marked `resolved` without a non-empty rationale of at least 10 characters, returning `EXCEPTION_RATIONALE_REQUIRED` or `EXCEPTION_RATIONALE_TOO_SHORT` (422) otherwise
- [ ] A resolution action must be type-appropriate to the exception (e.g., a reconciliation mismatch resolution must reference which source value was accepted), otherwise returning `EXCEPTION_ACTION_TYPE_MISMATCH` (422)
- [ ] Resolution and rationale are logged as an audit event, and the exception's age-at-resolution feeds operational reporting
- [ ] Exceptions tied to legally significant data route to a role with the appropriate review authority, not merely any available clerk

**Priority:** P0 | **Feature Ref:** F7

---

### US-7.2: Prioritize Oldest Unresolved Exceptions and Block Auto-Closing Critical Items
**As a** clerk/case administrator (David Okafor), **I want to** see exceptions sorted by age and severity, with critical exceptions never auto-closed, **so that** the oldest and highest-risk issues get attention first.

**Acceptance Criteria:**
- [ ] Exception Queue is filterable by module, type, severity, and age, with a visible aging indicator
- [ ] A critical-severity exception (e.g., `audit_integrity_break`) cannot be auto-closed by any batch process, returning `EXCEPTION_CRITICAL_MANUAL_ONLY` (403, internal guard) if attempted
- [ ] Unresolved exceptions beyond a configured age threshold escalate via notification to a supervisory role
- [ ] Exception creation captures type, severity, object reference, detected timestamp, and detecting feature for full traceability

**Priority:** P0 | **Feature Ref:** F7

---
## Epic 8: Case Timeline View (F8)

### US-8.1: View a Unified Chronological Case History
**As a** judge (Judge Robert Hale), **I want to** see docket events, hearings, exhibit actions, and Speedy Trial clock segments merged into one chronological timeline for a case, **so that** I see case history in context instead of switching between module-specific screens.

**Acceptance Criteria:**
- [ ] Timeline merges docket events, hearings, exhibit status changes, and confirmed Speedy Trial segments in true chronological order, with same-day entries ordered by creation sequence
- [ ] Timeline reflects only confirmed Speedy Trial state by default, with an explicit toggle for authorized reviewers to additionally show pending/candidate items
- [ ] Entries bearing a security designation the viewer lacks entitlement for are fully excluded, not shown as a redacted placeholder
- [ ] An unauthorized or non-existent case request returns `TIMELINE_CASE_NOT_FOUND` (404)

**Priority:** P0 | **Feature Ref:** F8

---

### US-8.2: Filter the Timeline and Deep-Link to Underlying Detail
**As a** clerk/case administrator (David Okafor), **I want to** filter the case timeline by event type, date range, or module and click through to the full detail record, **so that** I can quickly navigate to the specific exhibit or calculation record I need.

**Acceptance Criteria:**
- [ ] Filters support `event_type[]`, `date_from`, `date_to`, and `module[]` (evidentiary | speedy_trial | docket)
- [ ] An invalid date range (`from` > `to`) returns `TIMELINE_INVALID_RANGE` (400)
- [ ] Each timeline entry deep-links into its full underlying detail view (e.g., exhibit detail with the ruling highlighted)
- [ ] If an underlying module service is unavailable, the timeline returns partial content (`TIMELINE_PARTIAL_DATA`, 206) rather than a silent empty result

**Priority:** P0 | **Feature Ref:** F8

---
## Epic 9: Operational Reporting Feed (F9)

### US-9.1: View De-Identified Operational Dashboards
**As a** court administrator (Thomas Reyes), **I want to** view backlog age, data quality, and adoption metrics aggregated for my court without any defendant or party names shown, **so that** I can assess operational health without exposing case substance.

**Acceptance Criteria:**
- [ ] Court-level dashboards show only counts, rates, and ages — never individual defendant, party, or attorney names
- [ ] Every reporting surface carries a persistent label: "Administrative metrics — not for use in case determinations"
- [ ] A requester scope exceeding their authorized aggregation level returns `REPORT_SCOPE_DENIED` (403)
- [ ] Cross-court (AO-level) views aggregate at court granularity minimum, with no single-case-level detail exposed

**Priority:** P1 | **Feature Ref:** F9

---

### US-9.2: Export Role-Limited Operational Metrics
**As a** court administrator (Thomas Reyes), **I want to** generate an on-demand export of operational metrics, **so that** I can share adoption and data-quality indicators with court leadership or AO program managers.

**Acceptance Criteria:**
- [ ] Export access requires a distinct `reporting_viewer` entitlement, separate from operational edit roles
- [ ] A requester lacking `reporting_viewer` receives `REPORT_ACCESS_DENIED` (403)
- [ ] An unsupported metric combination returns `REPORT_INVALID_METRIC_SET` (422)
- [ ] Export file applies the same de-identification rules as the dashboard view

**Priority:** P1 | **Feature Ref:** F9

---
## Epic 10: CM/ECF Integration Adapter (F10)

### US-10.1: Sync Docket Data Without Overwriting Local Corrections
**As a** system administrator (Priya Nandan), **I want to** have CM/ECF updates apply automatically only when no conflicting local edit exists, **so that** JudicialSync never silently overwrites a clerk's manual correction.

**Acceptance Criteria:**
- [ ] An inbound record missing `source_identifier` is rejected with `CMECF_MISSING_SOURCE_ID` (422) and never persisted
- [ ] When a CM/ECF-authoritative field differs from a current value that was never locally modified, the adapter auto-updates the field (not an overwrite of an edit)
- [ ] When the current value *was* locally modified, the adapter creates a Sync Conflict exception for human review instead of auto-overwriting, returning `CMECF_SYNC_CONFLICT` (409, internal)
- [ ] Duplicate inbound delivery of the same `source_identifier`/payload is idempotent — no duplicate records or duplicate conflict exceptions are created, returning `CMECF_DUPLICATE_IGNORED` (200)

**Priority:** P0 | **Feature Ref:** F10

---

### US-10.2: Monitor Adapter Health and Resolve Sync Conflicts
**As a** system administrator (Priya Nandan), **I want to** monitor CM/ECF sync health and resolve routed conflicts, **so that** stale or incomplete docket data never silently degrades downstream exhibit or Speedy Trial accuracy.

**Acceptance Criteria:**
- [ ] Adapter health (last successful sync time, error rate, backlog) is visible on the admin dashboard
- [ ] A prolonged sync failure triggers a critical alert; feed unavailability returns `CMECF_UNAVAILABLE` (503)
- [ ] Resolved conflicts are logged to the audit trail with both the CM/ECF value and the chosen value, explicitly marked `source_system` or `manual_override`
- [ ] Unauthorized outbound filing attempts return `CMECF_OUTBOUND_DENIED` (403); outbound references require a distinct `docket_outbound` entitlement and are themselves audit-logged

**Priority:** P0 | **Feature Ref:** F10

---
## Epic 11: Role-Specific UI Workspaces (F11)

### US-11.1: Land on a Judge/Chambers Oversight Workspace
**As a** judge (Judge Robert Hale), **I want to** land on a workspace composing the case timeline, pending approvals, exhibit oversight, and explain-this-date view, **so that** I can review and act on what needs my attention without hunting across screens.

**Acceptance Criteria:**
- [ ] Workspace composes case timeline (F8), pending ruling/exclusion/finding tasks (F6), exhibit status oversight (F16), and explain-this-date (F29)
- [ ] No control is enabled unless the user's entitlement permits the action, even if the component is visible (e.g., a read-only viewer never sees an enabled "confirm ruling" button)
- [ ] Workspace is built entirely on USWDS components and passes automated Section 508 accessibility checks as a release gate
- [ ] A user with no role mapped to any workspace receives `UI_NO_WORKSPACE_ASSIGNED` (403)

**Priority:** P0 | **Feature Ref:** F11

---

### US-11.2: Use a Fast, Keyboard-Operable Courtroom Deputy Interface
**As a** courtroom deputy (Maria Santos), **I want to** use a full-screen, low-chrome logging interface with large touch targets and keyboard shortcuts, **so that** I can log exhibit actions in real time without slowing down the proceeding.

**Acceptance Criteria:**
- [ ] Real-time courtroom logging (F17) is the primary full-screen surface, with secondary access to custody recording (F20) and session-end reconciliation (F18)
- [ ] All offer/objection/ruling entry interactions are completable via keyboard alone, without requiring mouse/touch
- [ ] Interface passes a manual screen-reader accessibility pass in addition to automated checks before release
- [ ] If a dependent component fails to load, the interface degrades to partial availability (`UI_COMPONENT_UNAVAILABLE`, 206) rather than blocking all logging

**Priority:** P0 | **Feature Ref:** F11

---

### US-11.3: Operate a Clerk Operations Console
**As a** clerk/case administrator (David Okafor), **I want to** use a console composing case setup, intake queue, exception queue, reconciliation actions, and portfolio dashboards, **so that** I can manage my full caseload's operational quality from one place.

**Acceptance Criteria:**
- [ ] Console composes case/proceeding setup (F14), pretrial intake queue (F15), exception queue (F7), reconciliation checkpoint actions (F18), and portfolio dashboards (F25/F36)
- [ ] Every action surfaced reflects the viewer's actual entitlement, not merely their role label
- [ ] Console is built on USWDS components and meets the same Section 508 release gate as every other workspace

**Priority:** P0 | **Feature Ref:** F11

---

### US-11.4: Operate an Administrative Dashboard
**As a** system administrator (Priya Nandan), **I want to** use a dashboard composing configuration, identity/role management, reporting feed, and adapter health, **so that** I can manage platform-wide settings and monitor integration health from one place.

**Acceptance Criteria:**
- [ ] Dashboard composes the Configuration Engine (F3), identity/role management (F0), operational reporting feed (F9), and CM/ECF adapter health (F10)
- [ ] All privileged actions surfaced require the correct entitlement and are subject to separation-of-duties enforcement where applicable
- [ ] Dashboard is accessible via keyboard and passes the same Section 508 release gate as other workspaces

**Priority:** P0 | **Feature Ref:** F11

---
## Epic 12: Restricted External Attorney Portal (F12)

### US-12.1: Submit Structured Exhibit Metadata as an Authorized Attorney
**As an** authorized external attorney (restricted portal user), **I want to** submit proposed exhibit metadata or deficiency corrections for a case where I am a party of record, **so that** my submissions enter the standard intake review process without me ever writing directly to the official ledger.

**Acceptance Criteria:**
- [ ] Submission is only permitted for cases/proceedings where the attorney holds an active, CM/ECF-sourced party-of-record association — not self-asserted
- [ ] Submission enters `proposed` state tagged `submitted_via = 'external_portal'` and routes into the standard F15 intake validation flow
- [ ] An attorney with no party-of-record association for the case receives `PORTAL_NOT_PARTY_OF_RECORD` (403)
- [ ] All external submissions are immutably logged with the submitting attorney's identity, feeding the same audit trail as internal submissions

**Priority:** P1 | **Feature Ref:** F12

---

### US-12.2: View Read-Only Speedy Trial Deadline Information
**As an** authorized external attorney (restricted portal user), **I want to** view a read-only Speedy Trial summary for my associated defendant, **so that** I understand remaining time and next thresholds without accessing full explainability or override detail.

**Acceptance Criteria:**
- [ ] Portal visibility is limited to a confirmed-calculation summary (remaining time, next threshold, confirmed trigger/exclusion periods) per the court's configured visibility level
- [ ] Sealed/restricted/grand-jury/juvenile cases are never visible through the portal unless explicitly and individually authorized by the court
- [ ] Attempting to view a security-designated case returns `PORTAL_DESIGNATION_DENIED` (403)
- [ ] External principal tokens are structurally distinct (different issuer/audience claim) so no internal write API can be invoked via a portal token

**Priority:** P1 | **Feature Ref:** F12

---

### US-12.3: Review and Accept External Attorney Submissions
**As a** clerk/case administrator (David Okafor), **I want to** review attorney-submitted exhibit metadata through the same intake queue as internal submissions, **so that** external submissions receive identical validation and oversight before entering the ledger.

**Acceptance Criteria:**
- [ ] External submissions appear in the same F15 intake queue, distinguished only by `submitted_via = 'external_portal'`
- [ ] An external submitter attempting to self-accept their own submission receives `PORTAL_WRITE_DENIED` / `INTAKE_EXTERNAL_ACCEPT_DENIED` (403)
- [ ] Clerk accept/reject/request-correction decisions are logged to the audit trail identically to internally-submitted exhibits
- [ ] An expired or invalid external IdP assertion returns `PORTAL_AUTH_FAILED` (401)

**Priority:** P1 | **Feature Ref:** F12

---
## Epic 13: Security and Compliance Baseline (F13)

### US-13.1: Malware-Scan and Allowlist File Uploads
**As a** system administrator (Priya Nandan), **I want to** have every uploaded file pass malware scanning and a court-approved file-type allowlist before acceptance, **so that** no malicious or disallowed file ever enters the reference layer.

**Acceptance Criteria:**
- [ ] No file is persisted until malware scanning completes successfully; a failed scan returns `SECURITY_MALWARE_DETECTED` (422) with a user-facing reason, never silent acceptance
- [ ] File types outside the court-configured allowlist are rejected before scanning is even attempted, returning `SECURITY_FILE_TYPE_DENIED` (422)
- [ ] A policy-engine evaluation failure fails closed, returning `SECURITY_POLICY_UNAVAILABLE` (503) rather than defaulting to allow
- [ ] All data at rest and in transit is encrypted (TLS 1.2+, managed key service), with key rotation restricted to `security_officer` role

**Priority:** P0 | **Feature Ref:** F13

---

### US-13.2: Configure Retention and Disposition Schedules by Record Category
**As a** system administrator (Priya Nandan), **I want to** configure how long each record category is retained before disposition action is required, **so that** no record category is auto-purged without a human-confirmed disposition action.

**Acceptance Criteria:**
- [ ] Retention schedules are configured per record category (exhibit, document, audit event, notification) and court
- [ ] A scheduled disposition job surfaces due-for-disposition records as tasks for human action — no automated hard-delete occurs for any court-record-significant category
- [ ] A disposition action attempted without human confirmation returns `SECURITY_DISPOSITION_UNCONFIRMED` (403, internal guard)
- [ ] Security designation policy changes are rule-package-versioned and audit-logged — no designation policy may be altered via direct data edit outside the configuration engine

**Priority:** P0 | **Feature Ref:** F13

---

### US-13.3: Maintain Documented Manual-Fallback Procedures
**As a** system administrator (Priya Nandan), **I want to** have documented manual-fallback and resync procedures for courtroom or integration disruption, **so that** deputies can resume real-time logging promptly after an outage without data loss.

**Acceptance Criteria:**
- [ ] Courtroom logging interface persists entries in a local draft buffer during disruption and resyncs automatically on reconnection without data loss
- [ ] Manual-fallback runbooks are documented and exercised during pilot scenario testing
- [ ] A key-rotation attempt by a non-security-officer role returns `SECURITY_KEY_ACCESS_DENIED` (403)
- [ ] Encryption, scanning, and sensitive-record handling controls apply consistently regardless of which exhibit file storage model (store/reference/both) is ultimately selected

**Priority:** P0 | **Feature Ref:** F13

---
## Epic 14: Case and Proceeding Setup for Exhibits (F14)

### US-14.1: Activate Exhibit Tracking for a Case
**As a** clerk/case administrator (David Okafor), **I want to** activate exhibit tracking on a case once its proceeding and parties exist, **so that** intake and ledger operations are unlocked only after proper setup.

**Acceptance Criteria:**
- [ ] A case must have at least one proceeding before exhibit tracking can be activated, returning `EXHIBIT_SETUP_NO_PROCEEDING` (422) otherwise
- [ ] Only users with `clerk_case_admin` or higher entitlement may activate exhibit tracking, returning `EXHIBIT_SETUP_DENIED` (403) otherwise
- [ ] Setup completion marks the case/proceeding as "exhibit-tracking active," unlocking F15 intake and F16 ledger operations
- [ ] Re-running setup on an already-active case is idempotent — it never resets or duplicates existing exhibit records

**Priority:** P0 | **Feature Ref:** F14

---

### US-14.2: Configure Numbering Scheme and Security Designations per Case
**As a** clerk/case administrator (David Okafor), **I want to** select an active numbering scheme and apply security designations relevant to exhibits for this case, **so that** exhibit identifiers and sensitive-item handling follow the court's published configuration.

**Acceptance Criteria:**
- [ ] Numbering scheme must be an active, published scheme from the Configuration Engine; an invalid/unpublished scheme returns `EXHIBIT_SETUP_INVALID_SCHEME` (422)
- [ ] Numbering scheme cannot be changed after exhibits have already been assigned, returning `EXHIBIT_SETUP_SCHEME_LOCKED` (409)
- [ ] Setup completion and designation choices are logged to the audit trail
- [ ] Setup binds at least prosecution and defense (or equivalent) parties to the proceeding before activation

**Priority:** P0 | **Feature Ref:** F14

---
## Epic 15: Pretrial Exhibit Intake (F15)

### US-15.1: Submit a Structured Exhibit List with Optional File
**As a** clerk/case administrator (David Okafor), **I want to** submit a structured exhibit list entry with description, offering party, type, and an optional file, **so that** proposed exhibits enter a controlled intake pipeline rather than an ad hoc submission.

**Acceptance Criteria:**
- [ ] Required fields (description, offering_party_id, proceeding_id, exhibit_type) must be present; missing fields route to the Exception Queue rather than silent rejection, via `INTAKE_MISSING_METADATA` (422)
- [ ] Any attached file passes malware scanning and the file-type allowlist (F13) before further processing, returning `INTAKE_FILE_REJECTED` (422) on scan failure
- [ ] Unsupported file formats return `INTAKE_UNSUPPORTED_FORMAT` (422)
- [ ] Submission is created in `proposed` state pending clerk/deputy review

**Priority:** P0 | **Feature Ref:** F15

---

### US-15.2: Detect Duplicate Submissions Automatically
**As a** clerk/case administrator (David Okafor), **I want to** have duplicate exhibit submissions automatically flagged, **so that** I catch redundant entries before they reach the courtroom.

**Acceptance Criteria:**
- [ ] Duplicate detection compares offering party + description similarity + file hash (if present) within the same proceeding
- [ ] An exact file-hash match is always flagged as a duplicate, returning `INTAKE_DUPLICATE` (409)
- [ ] Flagged duplicates route to the shared Exception Queue with both/all conflicting submissions preserved for review
- [ ] Submitter is notified when correction or clarification is needed

**Priority:** P0 | **Feature Ref:** F15

---

### US-15.3: Accept, Reject, or Request Correction on a Submission
**As a** clerk/case administrator (David Okafor), **I want to** explicitly accept, reject, or request correction on each intake submission, **so that** only validated, deliberately-reviewed exhibits are promoted onto the ledger.

**Acceptance Criteria:**
- [ ] Only users with `clerk_case_admin` or `courtroom_deputy` entitlement may accept/reject/request-correction; unauthorized attempts return `INTAKE_REVIEW_DENIED` (403)
- [ ] Acceptance promotes the submission to a F16 ledger entry in `proposed` status
- [ ] A rejection or correction request must carry a reason/detail relayed back to the submitter — never a bare rejection
- [ ] External submitters can never self-accept their own submission, returning `INTAKE_EXTERNAL_ACCEPT_DENIED` (403)

**Priority:** P0 | **Feature Ref:** F15

---
## Epic 16: Exhibit Ledger (F16)

### US-16.1: Maintain One Authoritative Exhibit Status Record
**As a** courtroom deputy (Maria Santos), **I want to** have one current, authoritative ledger entry per exhibit instead of a personal shadow spreadsheet, **so that** every module (jury package, closeout, timeline, search) reads the same current status.

**Acceptance Criteria:**
- [ ] Ledger entries are created either from an accepted F15 intake submission (`proposed`) or directly during courtroom proceedings (F17) for unlisted items
- [ ] Each status transition creates a new append-style exhibit version rather than destructively mutating the canonical row
- [ ] Every status transition emits an audit event with before/after status, actor, and timestamp
- [ ] No prior exhibit version can be edited or deleted after creation, returning `LEDGER_VERSION_IMMUTABLE` (403, internal guard) if attempted

**Priority:** P0 | **Feature Ref:** F16

---

### US-16.2: Enforce Court-Configured Workflow Transitions
**As a** courtroom deputy (Maria Santos), **I want to** have status transitions validated against the court's configured workflow states, **so that** an exhibit can't be moved into an invalid or nonsensical status.

**Acceptance Criteria:**
- [ ] An invalid transition for the current state (e.g., `rejected` directly to `admitted` without re-offer) returns `LEDGER_INVALID_TRANSITION` (409) unless explicitly configured
- [ ] Identifier assignment must conform to the active numbering scheme; a non-conforming manual identifier returns `LEDGER_INVALID_IDENTIFIER` (422)
- [ ] Confidentiality/location changes on a security-designated exhibit require the F21 sealing entitlement, not merely general ledger-edit rights, returning `LEDGER_DESIGNATION_DENIED` (403) otherwise

**Priority:** P0 | **Feature Ref:** F16

---

### US-16.3: Attribute Every Ruling to the Presiding Judge
**As a** courtroom deputy (Maria Santos), **I want to** have admit/reject ruling transitions always attributed to the presiding judge of record, **so that** the system never appears to decide a ruling on its own.

**Acceptance Criteria:**
- [ ] An admit/reject transition must carry a `ruling_actor_id` attributed to a user holding the `judge` role for that proceeding — never defaulted or auto-inferred
- [ ] A ruling attempted without judge attribution returns `LEDGER_RULING_ACTOR_REQUIRED` (422)
- [ ] The deputy's action records "the judge ruled," never originates or infers the ruling content itself
- [ ] Ruling attribution and timestamp are part of the audit-event payload for that transition

**Priority:** P0 | **Feature Ref:** F16

---
## Epic 17: Real-Time Courtroom Logging (F17)

### US-17.1: Log Exhibit Offers, Objections, and Rulings in Real Time
**As a** courtroom deputy (Maria Santos), **I want to** record an exhibit offer, objection, or ruling in a small number of taps or keystrokes during live proceedings, **so that** I never have to revert to paper to keep up with the courtroom.

**Acceptance Criteria:**
- [ ] Logging a single offer/objection/ruling cycle is completable in a bounded number of UI interactions (target: ≤3 actions)
- [ ] Every action is operable fully via keyboard shortcuts, supporting both courtroom speed and accessibility
- [ ] Objection entries select from a short, courtroom-relevant, configurable category list with one additional action
- [ ] Entries are automatically timestamped (not user-editable) with optional free-text notes
- [ ] A ruling attempted with no assigned judge on the proceeding is blocked and routed to an exception, returning `COURTROOM_NO_JUDGE_ASSIGNED` (422)

**Priority:** P0 | **Feature Ref:** F17

---

### US-17.2: Resume Logging After a Connectivity Disruption Without Data Loss
**As a** courtroom deputy (Maria Santos), **I want to** have my in-progress entries persisted locally and resynced automatically if the system disconnects mid-session, **so that** a courtroom disruption never costs me lost data or a reversion to paper.

**Acceptance Criteria:**
- [ ] The interface persists entries in a local draft buffer during disruption and resyncs automatically on reconnection
- [ ] A resync conflict with a concurrent update routes to the Exception Queue, returning `COURTROOM_RESYNC_CONFLICT` (409) rather than silently discarding one version
- [ ] No entry is lost due to a connectivity interruption during an active session
- [ ] Chambers' live status view reflects logged actions in real time once resynced, without a manual refresh step

**Priority:** P0 | **Feature Ref:** F17

---

### US-17.3: Close a Session and Trigger Mandatory Reconciliation
**As a** courtroom deputy (Maria Santos), **I want to** trigger the recess/day-end/trial-close reconciliation checkpoint directly from the logging interface when I close a session, **so that** discrepancies are caught immediately rather than discovered later.

**Acceptance Criteria:**
- [ ] Session close triggers the F18 reconciliation checkpoint automatically
- [ ] A session cannot be marked closed while leaving the ledger un-reconciled, without an explicit, logged override by an authorized user, returning `COURTROOM_UNRECONCILED_CLOSE` (409) otherwise
- [ ] An action attempted on an exhibit in a terminal/incompatible status returns `COURTROOM_INVALID_ACTION` (409)
- [ ] A quick-added unlisted exhibit still requires minimum required fields before it can be saved, routing to the Exception Queue if incomplete at session close

**Priority:** P0 | **Feature Ref:** F17

---
## Epic 18: Dual-Log and Source Reconciliation (F18)

### US-18.1: Run a Reconciliation Checkpoint Against All Available Sources
**As a** courtroom deputy (Maria Santos), **I want to** compare the live ledger against party lists, my session log, jury package manifests, and disposition records at recess, day-end, trial-close, or on demand, **so that** discrepancies are caught before they pile up into a post-trial crisis.

**Acceptance Criteria:**
- [ ] A reconciliation run gathers every comparison source available for the proceeding at checkpoint time (ledger, session logs, submitted lists, jury package manifest, disposition records)
- [ ] A comparison source that fails to load during the run raises a `reconciliation_partial` exception rather than silently reporting "no discrepancies" (`RECONCILE_SOURCE_UNAVAILABLE`, 206)
- [ ] Each field-by-field or status mismatch generates a discrepancy record with all conflicting values preserved for review
- [ ] Reconciliation run history (checkpoint type, time, discrepancy count, resolution time) feeds operational reporting

**Priority:** P0 | **Feature Ref:** F18

---

### US-18.2: Resolve a Discrepancy with a Required Rationale
**As a** courtroom deputy (Maria Santos), **I want to** select or enter the correct resolved value for a discrepancy and provide a rationale, **so that** the ledger reflects a deliberate, documented decision rather than an unexplained correction.

**Acceptance Criteria:**
- [ ] A resolution submitted without rationale returns `RECONCILE_RATIONALE_REQUIRED` (422)
- [ ] If the resolved value differs from current ledger state, resolution updates the ledger as a new exhibit version plus audit event
- [ ] Resolution and rationale are fully audit-logged, consistent with the shared Exception Queue resolution pattern

**Priority:** P0 | **Feature Ref:** F18

---

### US-18.3: Block Checkpoint Completion on Unresolved High-Severity Discrepancies
**As a** clerk/case administrator (David Okafor), **I want to** prevent a reconciliation checkpoint from being marked complete while high-severity discrepancies remain open, **so that** the quality-control mechanism can't be bypassed without explicit, logged accountability.

**Acceptance Criteria:**
- [ ] A checkpoint completion attempt with unresolved high-severity discrepancies returns `RECONCILE_UNRESOLVED_HIGH_SEVERITY` (409)
- [ ] A supervisory override to bypass this gate requires its own separately logged rationale (double-gated)
- [ ] A non-supervisory role attempting the override returns `RECONCILE_OVERRIDE_DENIED` (403)

**Priority:** P0 | **Feature Ref:** F18

---
## Epic 19: Exportable Exhibit List and Basic Closeout (F19)

### US-19.1: Export a Filtered Exhibit List
**As a** courtroom deputy (Maria Santos), **I want to** generate a one-click export of admitted (or otherwise filtered) exhibits for a proceeding, **so that** I can produce a clean, usable record for the judge, parties, or an interim closeout without re-typing anything.

**Acceptance Criteria:**
- [ ] Export supports filtering by status (e.g., `['admitted']`) and generates a structured artifact listing identifier, description, party, status, and ruling reference
- [ ] A proceeding with no matching exhibits returns `EXPORT_NO_MATCHING_EXHIBITS` (404)
- [ ] The export is explicitly labeled as a non-final, interim record where full post-trial closeout (F24) has not yet occurred

**Priority:** P1 | **Feature Ref:** F19

---

### US-19.2: Certify an Export Against a Snapshot of Ledger State
**As a** clerk/case administrator (David Okafor), **I want to** explicitly certify a generated export as accurate at the time it was produced, **so that** later ledger changes don't retroactively alter what a previously certified export is understood to contain.

**Acceptance Criteria:**
- [ ] Certification requires `clerk_case_admin` or `courtroom_deputy` entitlement, returning `EXPORT_CERTIFY_DENIED` (403) otherwise
- [ ] Certification is a distinct confirmation action, not implied merely by generating or downloading a preview; certifying without prior generation returns `EXPORT_NOT_GENERATED` (409)
- [ ] Every certified export retains a snapshot reference to the exact exhibit version(s) included
- [ ] Certification is logged to the audit trail with the ledger state snapshot reference

**Priority:** P1 | **Feature Ref:** F19

---
## Epic 20: Custody and Location Tracking (F20)

### US-20.1: Record a Custody Transfer with Purpose and Condition
**As a** courtroom deputy (Maria Santos), **I want to** initiate a custody transfer specifying recipient, purpose, location, and condition, **so that** every change of possession is explicit and traceable instead of tracked on a paper sign-out sheet.

**Acceptance Criteria:**
- [ ] A transfer to an unregistered/unknown custodian is rejected with `CUSTODY_UNKNOWN_CUSTODIAN` (422)
- [ ] Type-specific required fields (e.g., contraband authorization reference) must be present before a transfer for that type can be initiated, returning `CUSTODY_MISSING_TYPE_FIELD` (422) otherwise
- [ ] Transferor's initiation itself constitutes their acknowledgment of release
- [ ] Transfer record enters `pending` state and triggers notification to the designated recipient

**Priority:** P2 | **Feature Ref:** F20

---

### US-20.2: Acknowledge Receipt of a Transferred Exhibit
**As a** courtroom deputy (Maria Santos), **I want to** acknowledge receipt of an exhibit, confirming condition and time, **so that** custody responsibility is only ever transferred with dual confirmation, never silently.

**Acceptance Criteria:**
- [ ] Only the designated recipient may acknowledge a transfer; others attempting to acknowledge receive `CUSTODY_ACK_DENIED` (403)
- [ ] On acknowledgment, the transfer becomes `completed`, and the exhibit's current custodian/location fields update
- [ ] No auto-acknowledgment occurs on timeout — only explicit acknowledgment completes a transfer
- [ ] Full custody history remains queryable per exhibit, feeding closeout receipts and the case timeline

**Priority:** P2 | **Feature Ref:** F20

---

### US-20.3: Escalate Unacknowledged Custody Transfers
**As a** clerk/case administrator (David Okafor), **I want to** have unacknowledged custody transfers automatically escalate to a supervisory role after a configured SLA, **so that** no exhibit goes missing mid-trial without anyone noticing.

**Acceptance Criteria:**
- [ ] A transfer unacknowledged beyond the configured SLA raises `CUSTODY_SLA_BREACH` and fires an escalation alert to a supervisory role
- [ ] Escalation never completes the transfer automatically — only explicit acknowledgment does
- [ ] The goal of zero custody transfers left unacknowledged beyond SLA is measurable via the custody history and reporting feed

**Priority:** P2 | **Feature Ref:** F20

---
## Epic 21: Sealing and Restricted Exhibit Handling (F21)

### US-21.1: Seal or Release an Individual Exhibit as the Authorizing Judge
**As a** judge (Judge Robert Hale), **I want to** seal or release a specific exhibit with a defined entitlement scope, **so that** sensitive evidence receives protection distinct from the case's general security designation.

**Acceptance Criteria:**
- [ ] Sealing/release actions require `authorizing_judge_id` resolved to an actual judge role holder for the proceeding — a clerk cannot self-authorize, returning `SEAL_AUTHORIZATION_DENIED` (403) if attempted
- [ ] Release requires an explicit, symmetric judge-authorized action with a documented `release_reason`
- [ ] A sealed exhibit is automatically excluded from jury review packages unless individually and explicitly authorized for that specific instance, returning `SEAL_JURY_PACKAGE_DENIED` (422) otherwise
- [ ] Sealing/release actions are audit-logged with the authorizing/releasing judge's attribution

**Priority:** P2 | **Feature Ref:** F21

---

### US-21.2: Log Every Access Attempt to a Sealed Exhibit
**As a** system administrator (Priya Nandan), **I want to** have every successful and denied access attempt against a sealed or restricted exhibit logged as an individual audit event, **so that** I can monitor and verify zero unauthorized access succeeds.

**Acceptance Criteria:**
- [ ] An unauthorized access attempt to a sealed exhibit by direct ID returns a "not found" response (`SEAL_NOT_FOUND`, 404), not "access denied," to avoid confirming existence
- [ ] Every access attempt — successful or denied — against a sealed/restricted exhibit produces its own audit event, not merely an aggregate log line
- [ ] This logging requirement exceeds the general platform access-logging baseline and is enforced for sealed/restricted exhibits specifically

**Priority:** P2 | **Feature Ref:** F21

---
## Epic 22: Jury Review Package Assembly (F22)

### US-22.1: Authorize Assembly of a Jury Review Package
**As a** judge (Judge Robert Hale), **I want to** authorize a jury package composed only of currently admitted electronic exhibits, **so that** jurors review a controlled, court-approved set rather than an unfiltered ledger.

**Acceptance Criteria:**
- [ ] Package composition requires `authorizing_judge_id` resolved to an actual judge for the proceeding, returning `JURY_AUTHORIZATION_DENIED` (403) otherwise
- [ ] Only `admitted`-status, electronically-reviewable exhibit types are eligible; attempts to include ineligible types return `JURY_INELIGIBLE_EXHIBIT` (422)
- [ ] Sealed exhibits are excluded unless individually authorized by the same judge for this specific package instance
- [ ] Package composition is itself distinctly audit-logged as a judicial authorization of scope

**Priority:** P2 | **Feature Ref:** F22

---

### US-22.2: Confirm Composition and Deliver a Session-Scoped, Access-Controlled Package
**As a** jury administrator (Carla Jimenez), **I want to** confirm the system-assembled package matches the judge's authorized scope and then deliver it only during an active, time-bounded review session, **so that** jury access to admitted evidence is confirmed-correct, controlled, and logged — never silently assembled or opened without my check.

**Acceptance Criteria:**
- [ ] Composition confirmation is a distinct, logged action separate from the judge's authorization (US-22.1) — the candidate package is not delivered until the jury administrator confirms it matches the authorized scope
- [ ] A composition discrepancy (candidate package does not match authorized scope) is flagged back to chambers rather than silently adjusted or confirmed as-is
- [ ] Access outside the authorized session window is denied, returning `JURY_SESSION_EXPIRED` (403)
- [ ] Every package access event (open, view individual exhibit, session end) is logged
- [ ] A delivered package is immutable; any composition change requires a new package version, returning `JURY_PACKAGE_IMMUTABLE` (409) on in-place edit attempts
- [ ] If the admitted-exhibit set changes after assembly (e.g., a late ruling), the package does not silently update — it requires a new confirmed version

**Priority:** P2 | **Feature Ref:** F22

---
## Epic 23: Physical and Digital Exhibit Distinction (F23)

### US-23.1: Classify Exhibit Type at Intake
**As a** clerk/case administrator (David Okafor), **I want to** assign an exhibit type (file reference, physical, demonstrative, contraband, special-storage) during intake, **so that** downstream custody, storage, and jury-package eligibility rules apply correctly.

**Acceptance Criteria:**
- [ ] `exhibit_type` must be one of the court-configured catalog values; an unrecognized value returns `TYPE_UNRECOGNIZED` (422)
- [ ] Only `file_reference` exhibits are eligible for electronic jury package inclusion; other types attempting package eligibility return `TYPE_NOT_ELIGIBLE_FOR_PACKAGE` (422)
- [ ] Type-specific required fields (per court configuration) are enforced at intake validation

**Priority:** P2 | **Feature Ref:** F23

---

### US-23.2: Enforce Type-Specific Custody Requirements
**As a** courtroom deputy (Maria Santos), **I want to** have custody transfers blocked until type-specific required fields are present, **so that** sensitive item types (e.g., contraband) always carry the additional documentation the court requires.

**Acceptance Criteria:**
- [ ] A custody transfer attempted without a type-specific required field returns `TYPE_MISSING_REQUIRED_FIELD` (422)
- [ ] Re-classification of an exhibit's type is a distinct, audit-logged action requiring the same entitlement as a ledger status transition, returning `TYPE_RECLASSIFY_DENIED` (403) for unauthorized attempts
- [ ] Re-classification never occurs via a generic field-edit path that bypasses audit logging

**Priority:** P2 | **Feature Ref:** F23

---
## Epic 24: Post-Trial Closeout (Full) (F24)

### US-24.1: Generate the Appeal-Ready Closeout Package
**As a** clerk/case administrator (David Okafor), **I want to** generate a complete closeout package — exhibit list, custody chain, ruling history, and reconciliation summary — once a proceeding concludes, **so that** I can produce an appeal-ready record without manually reassembling it across spreadsheets.

**Acceptance Criteria:**
- [ ] Full closeout cannot begin while reconciliation (F18) has unresolved high-severity discrepancies, returning `CLOSEOUT_UNRESOLVED_RECONCILIATION` (409)
- [ ] Every exhibit must have a determinable disposition action before the package is marked complete; undeterminable cases route to an exception rather than being silently omitted (`CLOSEOUT_NO_DISPOSITION_PATH`, 422)
- [ ] Certification requires `clerk_case_admin` entitlement, returning `CLOSEOUT_CERTIFY_DENIED` (403) otherwise
- [ ] Certification references the full snapshot of every included record's version at time of certification

**Priority:** P2 | **Feature Ref:** F24

---

### US-24.2: Generate Disposition Tasks and Receipts
**As a** courtroom deputy (Maria Santos), **I want to** receive a disposition task per exhibit requiring return, retention, transfer, or scheduled destruction, with a receipt generated for each completed action, **so that** post-trial exhibit handling is tracked as deliberately as courtroom logging.

**Acceptance Criteria:**
- [ ] Disposition action is determined per exhibit based on status, type, and the court's retention schedule
- [ ] Destruction cannot be executed before the configured retention period has elapsed, returning `CLOSEOUT_RETENTION_NOT_ELAPSED` (409) as a hard validation
- [ ] A receipt is generated for every disposition action, and the exhibit's custody record updates with the final disposition
- [ ] Disposition tasks are surfaced via the shared work queue and tracked to completion

**Priority:** P2 | **Feature Ref:** F24

---
## Epic 25: Exhibit Portfolio Dashboard and Court Templates (F25)

### US-25.1: View Cross-Case Exhibit Operations Portfolio
**As a** clerk/case administrator (David Okafor), **I want to** see a portfolio-level view of open exceptions, outstanding custody items, and closeout backlog across my full caseload, **so that** I don't have to check each case individually.

**Acceptance Criteria:**
- [ ] Dashboard aggregates across all cases/proceedings within the viewer's authorized court/division scope
- [ ] Dashboard supports drill-through to underlying case/proceeding detail, scoped to the viewer's own authorized caseload
- [ ] Access outside the viewer's authorized scope returns `PORTFOLIO_SCOPE_DENIED` (403) — a clerk never sees another court's portfolio

**Priority:** P3 | **Feature Ref:** F25

---

### US-25.2: Create and Apply Reusable Court Configuration Templates
**As a** system administrator (Priya Nandan), **I want to** export a court's exhibit configuration as a versioned template and apply it when onboarding a new court, **so that** new-court setup is faster and consistent.

**Acceptance Criteria:**
- [ ] Template creation requires `system_admin` entitlement, returning `TEMPLATE_CREATE_DENIED` (403) otherwise
- [ ] Template application to a new court requires the same maker-checker approval pattern as general configuration changes, returning `TEMPLATE_SOD_VIOLATION` (403) without a second approver
- [ ] A template, once published and applied to at least one court, is immutable — further changes create a new version, returning `TEMPLATE_VERSION_IMMUTABLE` (409) on edit attempts

**Priority:** P3 | **Feature Ref:** F25

---
## Epic 26: Case and Defendant Tracker Initialization (F26)

### US-26.1: Auto-Propose a Tracker from a Detected Trigger Event
**As a** clerk/case administrator (David Okafor), **I want to** have the system automatically propose a new defendant tracker when a configured trigger event (e.g., arraignment) is detected, **so that** I don't have to manually initiate tracking for every defendant.

**Acceptance Criteria:**
- [ ] A matching trigger-event category arriving via CM/ECF or manual entry proposes a tracker in `proposed` state with a candidate start context pre-populated
- [ ] Automatic detection alone never reaches `confirmed` state — only an explicit reviewer confirmation does
- [ ] Attempting tracker creation for a non-defendant party returns `TRACKER_NOT_DEFENDANT` (422)

**Priority:** P0 | **Feature Ref:** F26

---

### US-26.2: Confirm the Tracker's Applicable Start Context
**As a** judge (Judge Robert Hale, with Law Clerk Ana Ibarra), **I want to** explicitly confirm or reject the proposed trigger event and start date, **so that** the clock's starting point always reflects an authorized human decision, never an automatic inference.

**Acceptance Criteria:**
- [ ] A tracker cannot enter `confirmed` state without an explicit reviewer confirmation action
- [ ] The confirming reviewer must hold the `exclusion_reviewer`-equivalent entitlement configured for trackers
- [ ] Confirmation attempted by a user lacking this entitlement returns `TRACKER_CONFIRM_DENIED` (403)
- [ ] Rejection of a proposed start context requires a rationale, returning `TRACKER_REJECT_REASON_REQUIRED` (422) otherwise, and routes to a dispute/missing-trigger exception

**Priority:** P0 | **Feature Ref:** F26

---

### US-26.3: Flag a Defendant with Case Activity but No Detected Trigger Event
**As a** clerk/case administrator (David Okafor), **I want to** be alerted when a defendant has case activity but no corresponding trigger event in the docket feed, **so that** I never leave a tracker silently uninitialized or guess at a start date.

**Acceptance Criteria:**
- [ ] A defendant with case activity but no matching trigger event raises a `missing_trigger_event` exception (`TRACKER_MISSING_TRIGGER`) rather than leaving no tracker or guessing a start date
- [ ] Manual tracker creation remains available as a fallback, with the trigger event and date entered manually
- [ ] Tracker creation/confirmation is audit-logged, including which rule-package version's trigger-event mapping was in effect

**Priority:** P0 | **Feature Ref:** F26

---
## Epic 27: Docket Event Ingestion and Mapping (F27)

### US-27.1: Automatically Map Docket Events to Speedy Trial Categories
**As a** clerk/case administrator (David Okafor), **I want to** have incoming docket events automatically matched against the court's configured event-mapping rules, **so that** routine events don't require manual classification.

**Acceptance Criteria:**
- [ ] An event matching a configured mapping rule is assigned an `event_category` automatically
- [ ] Duplicate event delivery (same `source_identifier`, already ingested) is silently de-duplicated — no duplicate category assignment or downstream exclusion-candidate generation, acknowledged via `EVENT_DUPLICATE_IGNORED` (200)
- [ ] Manually entered events capture the entering user's identity and are flagged `source_system = 'manual'`

**Priority:** P0 | **Feature Ref:** F27

---

### US-27.2: Resolve an Unmapped Docket Event
**As a** clerk/case administrator (David Okafor), **I want to** classify an event that has no matching configuration rule, **so that** unmapped events don't silently corrupt downstream Speedy Trial calculations.

**Acceptance Criteria:**
- [ ] An event with no matching mapping rule is flagged `unmapped` and routed to the Exception Queue with the raw source code/description preserved (`EVENT_UNMAPPED`)
- [ ] Resolution requires `exclusion_reviewer`-equivalent entitlement, not general clerk access alone, returning `EVENT_RESOLUTION_DENIED` (403) otherwise
- [ ] Requesting a new standing mapping rule during resolution routes through the Configuration Engine's maker-checker process, while the individual event can still be classified immediately
- [ ] A manual entry missing required defendant/case association returns `EVENT_MISSING_ASSOCIATION` (422)

**Priority:** P0 | **Feature Ref:** F27

---
## Epic 28: Candidate Exclusion Engine (F28)

### US-28.1: Generate Candidate Exclusion Periods for Review
**As a** judge (Judge Robert Hale), **I want to** have the system suggest candidate excludable time periods from mapped events (motions, competency proceedings, continuances, interlocutory matters), **so that** I review well-formed candidates instead of calculating exclusions from scratch.

**Acceptance Criteria:**
- [ ] A categorized docket event matching a configured exclusion-triggering category generates a candidate exclusion with a proposed start date, and a proposed end date where determinable
- [ ] The engine has no authority to transition a candidate to `confirmed` — that transition exists only in the review workflow (F30) and always requires a human actor
- [ ] A later disposing event updates an open-ended candidate's proposed end date only while still in `candidate` state — never after review

**Priority:** P0 | **Feature Ref:** F28

---

### US-28.2: See Every Candidate Linked to Its Source Event and Rule Version
**As a** judge (Judge Robert Hale), **I want to** see each candidate exclusion explicitly linked to its triggering event(s) and the exact rule-package version that generated it, **so that** I can trust and explain every suggestion rather than treating it as a black box.

**Acceptance Criteria:**
- [ ] A candidate exclusion must always carry a non-null `triggering_event_refs` and `rule_version_ref`; an exclusion with no traceable source is treated as a system defect (`EXCLUSION_NO_SOURCE_EVENT`, 500 internal guard)
- [ ] Once a candidate has been reviewed, the generation engine must not further mutate that specific record, returning `EXCLUSION_ALREADY_REVIEWED` (409, internal guard) if attempted
- [ ] An exclusion category with no configuration in the active rule package returns `EXCLUSION_CATEGORY_UNDEFINED` (422)

**Priority:** P0 | **Feature Ref:** F28

---
## Epic 29: Versioned Clock Calculation and Explainability (F29)

### US-29.1: Open "Explain This Date" to See the Full Calculation Breakdown
**As a** judge (Judge Robert Hale), **I want to** see every contributing segment — event, rule reference, period, status, reviewer, reason — behind a calculated Speedy Trial date, **so that** I can produce a complete, defensible explanation if the number is ever challenged on appeal.

**Acceptance Criteria:**
- [ ] The explain-this-date view renders every timeline segment with contributing event, rule reference, period, review status, reviewing user, and reason/rationale where an override was involved
- [ ] Only `confirmed` exclusions (never `candidate`) contribute an excluded segment to the calculation
- [ ] A segment with no traceable source is treated as a system defect (`CALC_UNCONFIRMED_EXCLUSION_USED`, 500 internal guard)
- [ ] The resulting status indicator carries a persistent, non-dismissable label clarifying it is decision support, never a legal determination

**Priority:** P0 | **Feature Ref:** F29

---

### US-29.2: Preserve Full Calculation Version History
**As a** judge (Judge Robert Hale), **I want to** have every recalculation retained as a new, immutable calculation version rather than overwriting the prior one, **so that** I can always retrieve exactly what a prior calculation showed and why.

**Acceptance Criteria:**
- [ ] A calculation version, once created, is immutable — no update or delete is permitted at the application layer, consistent with the audit trail's immutability
- [ ] The tracker's "current" pointer advances to the new version while the prior version remains fully retrievable, never deleted or edited
- [ ] A configuration change never, by itself, silently recalculates or mutates an existing calculation version

**Priority:** P0 | **Feature Ref:** F29

---

### US-29.3: Recalculate Without Overwriting a Prior Approved Result
**As a** judge (Judge Robert Hale), **I want to** have any override of a calculated result captured as a new, mandatory-rationale version rather than an in-place edit, **so that** zero prior approved calculations are ever silently overwritten.

**Acceptance Criteria:**
- [ ] Calculation attempted for a tracker whose start context is not yet confirmed returns `CALC_START_NOT_CONFIRMED` (422)
- [ ] A calculation date before the tracker's confirmed start date returns `CALC_DATE_BEFORE_START` (422)
- [ ] Every override produces a new calculation version referencing the override and its rationale, never editing the automated version in place
- [ ] Calculation version creation and override events are fully audit-logged with lineage

**Priority:** P0 | **Feature Ref:** F29

---
## Epic 30: Review and Approval Workflow (F30)

### US-30.1: Accept, Modify, or Reject a Candidate Exclusion
**As a** judge (Judge Robert Hale), **I want to** explicitly accept, modify, or reject each candidate exclusion period, **so that** only a reviewed, human-approved value ever feeds the clock calculation.

**Acceptance Criteria:**
- [ ] Accept adopts the proposed value as-is, creating a `confirmed` record referencing the original proposal, reviewer identity, and timestamp
- [ ] Modify requires a mandatory rationale and preserves the original proposed value alongside the modified confirmed record for comparison
- [ ] Reject requires a mandatory rationale and the item never feeds any downstream calculation
- [ ] A review action by a user lacking entitlement for the item type returns `REVIEW_DENIED` (403); modify/reject without rationale returns `REVIEW_RATIONALE_REQUIRED` (422)

**Priority:** P0 | **Feature Ref:** F30

---

### US-30.2: Override a Confirmed Record with Mandatory Rationale
**As a** judge (Judge Robert Hale), **I want to** override an already-confirmed value when chambers determines an adjustment is needed, **so that** the change is fully versioned and explained rather than a silent edit.

**Acceptance Criteria:**
- [ ] An override creates a new version with an explicit `override` flag, mandatory rationale, and full linkage back to the superseded record
- [ ] Attempting to edit an already-confirmed record in place returns `REVIEW_CONFIRMED_IMMUTABLE` (409, internal guard)
- [ ] Self-review of a manually entered proposal by its own creator is blocked by default (court-configurable), returning `REVIEW_SELF_REVIEW_DENIED` (403) where disallowed
- [ ] Every accept/modify/reject/override action is logged as a distinct audit event, and its associated task is marked complete with a reference to that event

**Priority:** P0 | **Feature Ref:** F30

---
## Epic 31: Configurable Threshold Alerts and Escalation (F31)

### US-31.1: Receive a Threshold-Crossing Alert Linked to Full Explanation
**As a** judge (Judge Robert Hale), **I want to** be alerted as soon as remaining time crosses a configured threshold tier, with a direct link to the full explain-this-date view, **so that** I act on approaching deadlines early, never from a bare date alone.

**Acceptance Criteria:**
- [ ] An alert is generated when the new calculation version's remaining time newly crosses a configured tier boundary compared to the prior version
- [ ] Every alert includes a working deep link to the explain-this-date view; an alert lacking this linkage is treated as a system defect (`ALERT_MISSING_CONTEXT`, 500 internal guard)
- [ ] A tier crossing is detected exactly once per crossing event, not re-fired on every subsequent calculation remaining below the same tier
- [ ] A court with no configured threshold tiers returns `ALERT_NO_TIERS_CONFIGURED` (422)

**Priority:** P0 | **Feature Ref:** F31

---

### US-31.2: Escalate Unacknowledged Threshold Alerts
**As a** clerk/case administrator (David Okafor), **I want to** have unacknowledged threshold alerts escalate to a secondary recipient after a configured cadence, **so that** 100% of threshold crossings generate a delivered, acknowledged alert.

**Acceptance Criteria:**
- [ ] Escalation cadence has a defined maximum unacknowledged duration per severity tier, with critical (limit-reached) tiers having the shortest window
- [ ] Alert delivery failure routes to the Exception Queue rather than failing silently, returning `ALERT_DELIVERY_FAILED` (502)
- [ ] Threshold-alert acknowledgment is itself captured in the audit trail as evidence a human reviewed the risk signal
- [ ] An unacknowledged alert exceeding cadence triggers `ALERT_ESCALATED` to the configured secondary recipient role

**Priority:** P0 | **Feature Ref:** F31

---
## Epic 32: Calculation Version History ("What Changed") (F32)

### US-32.1: Compare Two Calculation Versions to See What Changed
**As a** judge (Judge Robert Hale), **I want to** compare the current calculation version against a prior one and see exactly what changed — added events, changed periods, new overrides — with rationale displayed inline, **so that** a recalculation is understandable rather than opaque.

**Acceptance Criteria:**
- [ ] Comparison performs a structured diff over segments: additions, removals, and modifications, each attributed to a specific change driver (new confirmed exclusion, new event, override, or rule-package version change)
- [ ] Any override-driven change displays its mandatory rationale inline alongside the diff entry it explains
- [ ] Comparison across different trackers is rejected, returning `DIFF_CROSS_TRACKER` (422)
- [ ] A diff entry with no resolvable change driver is treated as a system defect (`DIFF_UNATTRIBUTED_CHANGE`, 500 internal guard)
- [ ] A requested version not found for the tracker returns `DIFF_VERSION_NOT_FOUND` (404)

**Priority:** P1 | **Feature Ref:** F32

---
## Epic 33: Continuance Findings Check (F33)

### US-33.1: Flag a Continuance Missing Required Findings or Order Reference
**As a** judge (Judge Robert Hale, with Law Clerk Ana Ibarra), **I want to** be alerted when a continuance record lacks a structured findings reference or linked order document, **so that** incompleteness is caught before it becomes a problem, without the system ever judging legal sufficiency itself.

**Acceptance Criteria:**
- [ ] A continuance-categorized event or linked exclusion missing a populated findings reference or order document reference is flagged `incomplete` and routed to the chambers/judge review queue as `continuance_findings_incomplete`
- [ ] The check evaluates only field presence — it never parses, evaluates, or scores the content of findings for legal sufficiency
- [ ] An exclusion linked to an incomplete continuance carries a visible warning in its review UI
- [ ] Confirmation of an exclusion while the continuance is incomplete is blocked by default court policy, returning `CONTINUANCE_INCOMPLETE_BLOCKS_CONFIRM` (409) unless the court configures otherwise

**Priority:** P2 | **Feature Ref:** F33

---

### US-33.2: Supply Missing Findings or Order References
**As a** judge (Judge Robert Hale, with Law Clerk Ana Ibarra), **I want to** supply the missing structured-findings reference or order document reference once I've confirmed the legal record independently, **so that** the completeness flag clears and the exclusion can proceed through normal review.

**Acceptance Criteria:**
- [ ] Resolution requires chambers/judge-equivalent entitlement, returning `CONTINUANCE_RESOLVE_DENIED` (403) for unauthorized attempts
- [ ] Once both references are present, the completeness flag clears automatically
- [ ] The flag-and-resolution cycle is fully audit-logged
- [ ] The system never attempts content-level sufficiency evaluation; any such attempt is treated as a system defect (`CONTINUANCE_SCOPE_VIOLATION`, 500 internal guard)

**Priority:** P2 | **Feature Ref:** F33

---
## Epic 34: Multi-Defendant Separation (F34)

### US-34.1: Maintain Independent Clocks per Defendant in a Joint Case
**As a** judge (Judge Robert Hale), **I want to** have each defendant in a multi-defendant matter maintain their own independent Speedy Trial tracker, **so that** no defendant's result gets collapsed or misrepresented alongside a co-defendant's.

**Acceptance Criteria:**
- [ ] Each defendant party receives their own independent tracker; the system never creates a single shared tracker across defendants, even in the same case, returning `MULTIDEF_SHARED_TRACKER_DENIED` (422, internal guard) if attempted
- [ ] A joint docket event (e.g., a joint motion) generates linked candidate exclusions on each affected defendant's tracker, sharing a `joint_event_group_id` but remaining distinct, independently reviewable records
- [ ] A reviewer may accept, modify, or reject a joint-origin candidate differently per defendant — the system never forces identical review outcomes across co-defendants
- [ ] No case-level summary view may present a single collapsed "the case's" status without per-defendant breakdown, treating violations as a system defect (`MULTIDEF_COLLAPSED_VIEW_VIOLATION`, 500 internal guard)

**Priority:** P2 | **Feature Ref:** F34

---

### US-34.2: Record a Severance Event Between Co-Defendants
**As a** judge (Judge Robert Hale), **I want to** explicitly confirm a severance event splitting a joint defendant relationship, **so that** future joint-event propagation stops for the severed defendant(s) only after a deliberate, audited decision.

**Acceptance Criteria:**
- [ ] Severance must be an explicit, confirmed, audit-logged event — never inferred; an unconfirmed severance record is rejected with `MULTIDEF_SEVERANCE_UNCONFIRMED` (403, internal guard)
- [ ] Absent an explicit severance record, defendants in the case continue being treated as jointly affected by shared events by default
- [ ] Once confirmed, subsequent single-defendant docket events no longer propagate as joint candidates to the severed co-defendant(s)
- [ ] Co-defendant relationships are visibly surfaced (e.g., "3 defendants; 2 jointly tracked, 1 severed as of [date]") in case conference and portfolio views

**Priority:** P2 | **Feature Ref:** F34

---
## Epic 35: Case Conference View (F35)

### US-35.1: View a Consolidated Case Conference Summary
**As a** judge (Judge Robert Hale), **I want to** see clock state, pending motions, continuance history, and open issues on a single screen before a conference or hearing, **so that** I don't have to reconstruct the case's status from the docket by hand.

**Acceptance Criteria:**
- [ ] View assembles the current calculation version summary, all unreviewed candidate exclusions, continuance history with completeness flags, and open issues (unresolved exceptions, unacknowledged alerts) relevant to the tracker
- [ ] The view reflects only confirmed data as "current state," clearly distinguishing pending/candidate items as not-yet-decided
- [ ] Each summarized item deep-links to its full detail/review view
- [ ] A tracker not found or not authorized returns `CONFERENCE_TRACKER_NOT_FOUND` (404)
- [ ] For multi-defendant matters, the view surfaces an explicit co-defendant summary panel rather than merging statuses

**Priority:** P1 | **Feature Ref:** F35

---

### US-35.2: Generate a Pre-Conference Review Packet
**As a** judge's law clerk (Ana Ibarra), **I want to** generate a printable/exportable review packet summarizing the case conference view, **so that** I can prepare materials ahead of status conferences, continuance decisions, pretrial conferences, or trial settings.

**Acceptance Criteria:**
- [ ] Packet content mirrors the on-screen case conference view, timestamped at generation
- [ ] If some underlying data is unavailable, the packet is generated as partial (`CONFERENCE_PACKET_PARTIAL`, 206) rather than failing outright
- [ ] Packet generation does not require certification, since it changes no record, but remains timestamped for traceability
- [ ] Access to generate a packet requires at minimum the same entitlement as viewing the underlying tracker/calculation

**Priority:** P1 | **Feature Ref:** F35

---
## Epic 36: Speedy Trial Portfolio Dashboard (F36)

### US-36.1: View My Personal Caseload Risk Dashboard
**As a** judge (Judge Robert Hale), **I want to** see which of my assigned trackers are approaching a threshold, have data gaps, or have unreviewed candidate exclusions, **so that** I can prioritize attention across my full caseload instead of checking each tracker individually.

**Acceptance Criteria:**
- [ ] Dashboard is strictly limited to trackers the viewing judge/clerk is assigned to — it never surfaces out-of-scope trackers, even in aggregate count form, enforced via `PORTFOLIO_SCOPE_VIOLATION` (403, internal guard)
- [ ] Risk indicators include approaching-threshold, data-gap, unreviewed-exclusion, and stale-calculation categories
- [ ] Each risk indicator links through to the relevant tracker's case conference view or review queue
- [ ] Dashboard refreshes on a near-real-time basis as new calculation versions, exceptions, or confirmations occur

**Priority:** P2 | **Feature Ref:** F36

---

### US-36.2: View the Court-Level Aggregate Risk Dashboard
**As a** court administrator (Thomas Reyes), **I want to** see court-wide aggregate counts of trackers approaching thresholds or with data gaps, **so that** I can monitor caseload-wide Speedy Trial risk without needing case-level access myself.

**Acceptance Criteria:**
- [ ] Court-level dashboard access requires `court_admin` entitlement; a routine clerk/judge role does not receive it merely from a large personal caseload, returning `PORTFOLIO_ADMIN_DENIED` (403) otherwise
- [ ] A court with no risk-indicator configuration returns `PORTFOLIO_NO_CONFIG` (422)
- [ ] Staleness/approaching-threshold band widths are court-configurable, not hardcoded
- [ ] Authorized administrators may still drill through to individual tracker detail where their case-access entitlements permit, distinct from the stricter de-identified F09 reporting feed

**Priority:** P2 | **Feature Ref:** F36

---
## Epic 37: Cross-Court Governance and National Configuration (F37)

### US-37.1: Define the National Configuration Baseline
**As a** system administrator (Priya Nandan, acting as national governance administrator), **I want to** define a national baseline configuration and designate which fields each court may locally override, **so that** many federal districts can share one codebase without ungoverned divergence.

**Acceptance Criteria:**
- [ ] National baseline defines `{field, default_value, court_overridable}` for each configurable item
- [ ] A court/division can never directly modify a field designated non-overridable at the national level; any such attempt is rejected at the API layer, not merely flagged after the fact
- [ ] All national baseline changes are audit-logged with the approving national administrator's identity

**Priority:** P3 | **Feature Ref:** F37

---

### US-37.2: Route Out-of-Scope Local Change Requests to Governance Review
**As a** system administrator (Priya Nandan), **I want to** have a court's request to change a nationally-fixed field routed to governance review rather than applied directly, **so that** local configuration changes stay within their permitted override scope.

**Acceptance Criteria:**
- [ ] A governance request requires a distinct `national_governance_admin` entitlement to approve, separate from any court's `config_admin` role, returning `GOVERNANCE_APPROVAL_DENIED` (403) otherwise
- [ ] Attempting to modify a locked field directly returns `GOVERNANCE_FIELD_LOCKED` (403)
- [ ] Cross-court consistency reports never expose one court's local configuration detail to another court's administrators, returning `GOVERNANCE_REPORT_SCOPE_DENIED` (403) for court-scoped requesters

**Priority:** P3 | **Feature Ref:** F37

---
## Epic 38: Advanced Analytics (F38)

### US-38.1: View Cross-Court Trend Analytics for Program Management
**As a** system administrator (Priya Nandan, supporting AO program management), **I want to** view de-identified, cross-court trend analysis of discrepancy rates, reconciliation effort, and alert effectiveness, **so that** I can support program management decisions without ever evaluating judicial performance.

**Acceptance Criteria:**
- [ ] No individual case, defendant, or named exhibit may appear in any advanced analytics output, regardless of the requester's underlying case-level entitlements — this surface is strictly aggregate-only with no drill-through
- [ ] Access requires a distinct `ao_program_analytics` entitlement, separate from routine operational roles and the F09 baseline reporting role, returning `ANALYTICS_ACCESS_DENIED` (403) otherwise
- [ ] Any metric that could function as a proxy for judicial decision evaluation (e.g., ruling-outcome rates by judge) is structurally excluded from the metric catalog, returning `ANALYTICS_METRIC_OUT_OF_SCOPE` (422) if requested
- [ ] A cross-court scope exceeding the requester's authorization returns `ANALYTICS_SCOPE_DENIED` (403)
- [ ] Every analytics surface carries the persistent guardrail label: "Administrative/program metrics — not for use in case determinations"

**Priority:** P3 | **Feature Ref:** F38

---
## Epic 39: Broader Courtroom Technology Integration (F39)

### US-39.1: Authorize a Secure Courtroom Display Session
**As a** judge (Judge Robert Hale), **I want to** authorize a specific admitted exhibit or jury package to stream to a registered courtroom display endpoint, **so that** jurors and participants can view authorized evidence without exposing the full ledger to courtroom hardware.

**Acceptance Criteria:**
- [ ] A display session must never expose content beyond the specific exhibit(s)/package explicitly authorized for that session — no general ledger browsing from courtroom display hardware
- [ ] Sealed/restricted exhibits follow identical inclusion rules as jury packages — excluded by default, requiring the same explicit per-instance judge authorization to include, returning `COURTTECH_SEALED_DENIED` (422) otherwise
- [ ] A session requested outside an active proceeding returns `COURTTECH_NO_ACTIVE_PROCEEDING` (409)
- [ ] All display/streaming sessions are logged (session start/end, exhibit(s) shown, authorizing user), feeding the audit trail

**Priority:** P3 | **Feature Ref:** F39

---

### US-39.2: Monitor Courtroom Technology Integration Health and Incidents
**As a** system administrator (Priya Nandan), **I want to** monitor courtroom display/streaming integration health and respond to unauthorized connection attempts, **so that** courtroom technology incidents are caught and escalated quickly.

**Acceptance Criteria:**
- [ ] An unregistered hardware endpoint attempting connection is rejected and logged, returning `COURTTECH_UNREGISTERED_ENDPOINT` (403)
- [ ] Repeated unauthorized connection attempts escalate as a security exception, not merely a connection failure
- [ ] Courtroom hardware integration credentials are scoped narrowly (display/stream only, no general API access) with the same separation-of-duties discipline as other privileged integration credentials
- [ ] An integration connection failure returns `COURTTECH_CONNECTION_FAILED` (502) and is surfaced on the admin integration health view

**Priority:** P3 | **Feature Ref:** F39

---
## Summary Table

| Epic | Feature Area | Feature Ref | Story Count | Priority |
|------|--------------|:---:|:---:|:---:|
| Epic 0: Identity and Access Management | Shared Platform | F0 | 3 | P0 |
| Epic 1: Core Case and Docket Data Model | Shared Platform | F1 | 3 | P0 |
| Epic 2: Audit Trail and Audit Explorer | Shared Platform | F2 | 3 | P0 |
| Epic 3: Configuration Engine | Shared Platform | F3 | 3 | P0 |
| Epic 4: Notifications Service | Shared Platform | F4 | 2 | P0 |
| Epic 5: Search Service | Shared Platform | F5 | 2 | P0 |
| Epic 6: Work Queue and Task Management | Shared Platform | F6 | 2 | P0 |
| Epic 7: Exception Queue | Shared Platform | F7 | 2 | P0 |
| Epic 8: Case Timeline View | Shared Platform | F8 | 2 | P0 |
| Epic 9: Operational Reporting Feed | Shared Platform | F9 | 2 | P1 |
| Epic 10: CM/ECF Integration Adapter | Shared Platform | F10 | 2 | P0 |
| Epic 11: Role-Specific UI Workspaces | Shared Platform | F11 | 4 | P0 |
| Epic 12: Restricted External Attorney Portal | Shared Platform | F12 | 3 | P1 |
| Epic 13: Security and Compliance Baseline | Shared Platform | F13 | 3 | P0 |
| Epic 14: Case and Proceeding Setup for Exhibits | Evidentiary Tracking | F14 | 2 | P0 |
| Epic 15: Pretrial Exhibit Intake | Evidentiary Tracking | F15 | 3 | P0 |
| Epic 16: Exhibit Ledger | Evidentiary Tracking | F16 | 3 | P0 |
| Epic 17: Real-Time Courtroom Logging | Evidentiary Tracking | F17 | 3 | P0 |
| Epic 18: Dual-Log and Source Reconciliation | Evidentiary Tracking | F18 | 3 | P0 |
| Epic 19: Exportable Exhibit List and Basic Closeout | Evidentiary Tracking | F19 | 2 | P1 |
| Epic 20: Custody and Location Tracking | Evidentiary Tracking | F20 | 3 | P2 |
| Epic 21: Sealing and Restricted Exhibit Handling | Evidentiary Tracking | F21 | 2 | P2 |
| Epic 22: Jury Review Package Assembly | Evidentiary Tracking | F22 | 2 | P2 |
| Epic 23: Physical and Digital Exhibit Distinction | Evidentiary Tracking | F23 | 2 | P2 |
| Epic 24: Post-Trial Closeout (Full) | Evidentiary Tracking | F24 | 2 | P2 |
| Epic 25: Exhibit Portfolio Dashboard and Court Templates | Evidentiary Tracking | F25 | 2 | P3 |
| Epic 26: Case and Defendant Tracker Initialization | Speedy Trial Tracker | F26 | 3 | P0 |
| Epic 27: Docket Event Ingestion and Mapping | Speedy Trial Tracker | F27 | 2 | P0 |
| Epic 28: Candidate Exclusion Engine | Speedy Trial Tracker | F28 | 2 | P0 |
| Epic 29: Versioned Clock Calculation and Explainability | Speedy Trial Tracker | F29 | 3 | P0 |
| Epic 30: Review and Approval Workflow | Speedy Trial Tracker | F30 | 2 | P0 |
| Epic 31: Configurable Threshold Alerts and Escalation | Speedy Trial Tracker | F31 | 2 | P0 |
| Epic 32: Calculation Version History ("What Changed") | Speedy Trial Tracker | F32 | 1 | P1 |
| Epic 33: Continuance Findings Check | Speedy Trial Tracker | F33 | 2 | P2 |
| Epic 34: Multi-Defendant Separation | Speedy Trial Tracker | F34 | 2 | P2 |
| Epic 35: Case Conference View | Speedy Trial Tracker | F35 | 2 | P1 |
| Epic 36: Speedy Trial Portfolio Dashboard | Speedy Trial Tracker | F36 | 2 | P2 |
| Epic 37: Cross-Court Governance and National Configuration | Scale | F37 | 2 | P3 |
| Epic 38: Advanced Analytics | Scale | F38 | 1 | P3 |
| Epic 39: Broader Courtroom Technology Integration | Scale | F39 | 2 | P3 |
| **Total** | | **F0–F39** | **93** | — |

---
## Priority Breakdown

| Priority | Story Count | Epics Covered |
|----------|:---:|---|
| **P0** | 59 | Epics 0–8, 10, 11, 13–18, 26–31 (shared platform foundation, core Evidentiary MVP, core Speedy Trial MVP) |
| **P1** | 10 | Epics 9, 12, 19, 32, 35 (operational reporting, external attorney portal, basic closeout, version comparison, case conference view) |
| **P2** | 17 | Epics 20–24, 33, 34, 36 (custody, sealing, jury package, physical/digital distinction, full closeout, continuance findings, multi-defendant, ST portfolio dashboard) |
| **P3** | 7 | Epics 25, 37, 38, 39 (exhibit portfolio/templates, cross-court governance, advanced analytics, broader courtroom tech integration) |
| **Total** | **93** | Epics 0–39 |

---

## Priority Definitions

| Priority | Definition |
|----------|------------|
| **P0** | Critical — Must have for MVP (Foundation + Operational MVP build-sequence increments per PRD §5 and PROJECT.md build sequence) |
| **P1** | High — MVP-adjacent; needed for a credible MVP but secondary to P0 |
| **P2** | Medium — Pilot hardening; required before broader rollout, deferred past initial MVP |
| **P3** | Low — Scale; later increment supporting national/cross-court maturity |

---

*Document generated by Pivota Spec Framework*
*Last updated: 2026-10-04*
