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
