
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
