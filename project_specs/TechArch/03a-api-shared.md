
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
