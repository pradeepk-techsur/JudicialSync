
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
