
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
