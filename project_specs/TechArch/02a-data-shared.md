
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
