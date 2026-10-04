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
