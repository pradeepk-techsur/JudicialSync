-- =============================================================================
-- 20260101000000_platform_schema
-- =============================================================================
--
-- The entire `platform` schema for Phase 1: identity (F00), the shared case
-- model (F01), the append-only audit trail (F02), and the security/retention
-- subset of F13.
--
-- SOURCE OF TRUTH: `project_specs/TechArch/02a-data-shared.md` §5.2, §5.3,
-- §5.4, and the §5.5/§5.9 subsets. Every table below that appears in those
-- sections is copied column-for-column, CHECK-for-CHECK, index-for-index; the
-- only edit is the `platform.` schema qualifier.
--
-- Where this migration goes BEYOND TechArch it does so because a locked Phase 1
-- CONTEXT decision requires it. Every such addition is enumerated — with the
-- decision that forces it — in `docs/SCHEMA-NOTES.md`. Nothing here is additive
-- for convenience.
--
-- NOT CREATED HERE (Phase 2+ per CONTEXT): workflow_state_defs, threshold_defs,
-- event_mapping_defs, tasks, exceptions, notifications, sync_conflicts.
-- `rule_package_versions` IS created, table only, solely because
-- `security_policies.rule_package_version_id` carries a NOT NULL FK to it.
--
-- Ordering note: statements are ordered so that forward references resolve
-- without a deferred constraint — courts/divisions, then users, then
-- roles/user_roles, then everything that depends on them.
-- =============================================================================

-- `gen_random_uuid()` lives in pgcrypto on PostgreSQL 15; TechArch §5 names the
-- extension explicitly ("All primary keys are UUIDv4 (gen_random_uuid(),
-- pgcrypto extension)"). `digest()` for the audit hash chain comes from the
-- same extension, so the later hash-chain migration depends on this line too.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS platform;

SET search_path TO platform, public;


-- -----------------------------------------------------------------------------
-- §5.3 Case model — organisational spine (created first: user_roles references
-- both courts and divisions).
-- -----------------------------------------------------------------------------

CREATE TABLE platform.courts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_name TEXT NOT NULL,
  court_code TEXT NOT NULL UNIQUE
);

CREATE TABLE platform.divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES platform.courts(id),
  division_name TEXT NOT NULL,
  UNIQUE (court_id, division_name)
);


-- -----------------------------------------------------------------------------
-- §5.2 Identity (F00)
-- -----------------------------------------------------------------------------

CREATE TABLE platform.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_idp_subject TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  workspace_preference TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- `role_name` deliberately carries NO CHECK constraint, exactly as TechArch
-- §5.2 writes it: the role catalog is seeded reference data (plan 01-04), not a
-- type. TechArch's inline comment names nine roles and omits `ao_program_manager`;
-- FRD/Y0a §Identity, FRD/F00 and CONTEXT all name ten. Phase 1 seeds ten — see
-- docs/SCHEMA-NOTES.md and ASM-05 in docs/ASSUMPTIONS.md.
CREATE TABLE platform.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE platform.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES platform.users(id),
  role_id UUID NOT NULL REFERENCES platform.roles(id),
  court_id UUID REFERENCES platform.courts(id),
  division_id UUID REFERENCES platform.divisions(id),
  granted_by UUID NOT NULL REFERENCES platform.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id, court_id, division_id)
);
CREATE INDEX idx_user_roles_user ON platform.user_roles(user_id);
CREATE INDEX idx_user_roles_court ON platform.user_roles(court_id);

CREATE TABLE platform.scope_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES platform.users(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('court','division','case','proceeding','party_role','security_designation')),
  scope_value UUID,          -- nullable for party_role/security_designation enum-type scopes
  scope_enum_value TEXT      -- used for party_role/security_designation
);
CREATE INDEX idx_scope_assignments_user ON platform.scope_assignments(user_id);
CREATE INDEX idx_scope_assignments_value ON platform.scope_assignments(scope_value);

CREATE TABLE platform.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES platform.users(id),
  refresh_token_hash TEXT NOT NULL,
  mfa_satisfied BOOLEAN NOT NULL DEFAULT false,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_sessions_user ON platform.sessions(user_id);


-- -----------------------------------------------------------------------------
-- §5.3 Case model (F01) — remainder
-- -----------------------------------------------------------------------------

CREATE TABLE platform.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES platform.courts(id),
  division_id UUID NOT NULL REFERENCES platform.divisions(id),
  case_number TEXT NOT NULL,
  case_caption TEXT NOT NULL,
  case_type TEXT NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'manual',
  source_identifier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (division_id, case_number)
);
CREATE INDEX idx_cases_court ON platform.cases(court_id);
CREATE INDEX idx_cases_source ON platform.cases(source_system, source_identifier);

CREATE TABLE platform.proceedings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES platform.cases(id),
  proceeding_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  presiding_judge_id UUID REFERENCES platform.users(id)
);
CREATE INDEX idx_proceedings_case ON platform.proceedings(case_id);

CREATE TABLE platform.hearings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceeding_id UUID NOT NULL REFERENCES platform.proceedings(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  held_at TIMESTAMPTZ,
  hearing_type TEXT NOT NULL
);
CREATE INDEX idx_hearings_proceeding ON platform.hearings(proceeding_id);

CREATE TABLE platform.parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES platform.cases(id),
  party_name TEXT NOT NULL,
  party_role TEXT NOT NULL CHECK (party_role IN ('defendant','government','plaintiff','counsel','pro_se')),
  external_id TEXT,  -- CM/ECF party identifier
  source_system TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX idx_parties_case ON platform.parties(case_id);

CREATE TABLE platform.docket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES platform.cases(id),
  source_system TEXT NOT NULL,
  source_identifier TEXT NOT NULL,
  event_code TEXT,
  event_description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  locally_modified BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (source_system, source_identifier)
);
CREATE INDEX idx_docket_events_case ON platform.docket_events(case_id);
CREATE INDEX idx_docket_events_date ON platform.docket_events(event_date);

CREATE TABLE platform.document_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES platform.cases(id),
  source_system TEXT NOT NULL,
  source_identifier TEXT,
  document_title TEXT,
  storage_pointer TEXT  -- reference to object store / repository location
);
CREATE INDEX idx_document_references_case ON platform.document_references(case_id);

CREATE TABLE platform.security_designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,  -- 'case' | 'document_reference' | 'exhibit'
  object_id UUID NOT NULL,
  designation TEXT NOT NULL CHECK (designation IN ('sealed','restricted','grand_jury','juvenile','pii')),
  applied_by UUID NOT NULL REFERENCES platform.users(id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_security_designations_object ON platform.security_designations(object_type, object_id);


-- -----------------------------------------------------------------------------
-- §5.4 Audit (F02) — append-only, hash-chained.
--
-- The grant posture that makes this table immutable lives in the NEXT migration
-- (20260101000100_append_only_grants); the hash-chain trigger lives in the one
-- after. Creating the table, the grants, and the chain as three ordered
-- migrations keeps each guarantee independently reviewable — TechArch 04 §7.7
-- requires the REVOKE statements themselves to be version-controlled artifacts
-- carrying security-officer sign-off.
-- -----------------------------------------------------------------------------

CREATE TABLE platform.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES platform.users(id),
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
CREATE INDEX idx_audit_events_object ON platform.audit_events(object_type, object_id);
CREATE INDEX idx_audit_events_actor ON platform.audit_events(actor_id);
CREATE INDEX idx_audit_events_occurred ON platform.audit_events(occurred_at);

-- PHASE 1 ADDITION (see docs/SCHEMA-NOTES.md). A single-row chain head, so
-- `prev_hash` sequencing is serialisable under a lock rather than racing on
-- `MAX(occurred_at)` — two concurrent writers reading the same "latest" row
-- would otherwise fork the chain into two branches that both look valid in
-- isolation, which is precisely the condition a tamper-evidence scheme must not
-- permit. `id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id)` makes a second row
-- impossible at the type level.
CREATE TABLE platform.audit_chain_head (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  last_row_hash TEXT NOT NULL,
  last_audit_event_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The 64-zero genesis hash is the chain's first `prev_hash`.
INSERT INTO platform.audit_chain_head (id, last_row_hash)
VALUES (true, repeat('0', 64)) ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- §5.5 Configuration (F03) — Phase 1 subset ONLY.
--
-- `court_profiles` and `rule_package_versions` are created as tables and
-- nothing else: no publish workflow, no version comparison, no admin surface.
-- CONTEXT: "Phase 2 adds rule-package versioning, the maker-checker approval
-- flow, and the admin UI on top of these tables."
-- -----------------------------------------------------------------------------

CREATE TABLE platform.court_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES platform.courts(id) UNIQUE
);

CREATE TABLE platform.rule_package_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES platform.courts(id),
  version_number INTEGER NOT NULL,
  drafted_by UUID NOT NULL REFERENCES platform.users(id),
  approved_by UUID REFERENCES platform.users(id),
  effective_from TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  config_snapshot JSONB NOT NULL,
  UNIQUE (court_id, version_number)
);
CREATE INDEX idx_rule_package_versions_court ON platform.rule_package_versions(court_id, effective_from);


-- -----------------------------------------------------------------------------
-- §5.9 Security & retention subset (F13)
-- -----------------------------------------------------------------------------

CREATE TABLE platform.file_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_pointer TEXT NOT NULL,
  file_type TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES platform.users(id),
  declared_purpose TEXT NOT NULL,
  scan_status TEXT NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','rejected'))
);
CREATE INDEX idx_file_references_scan_status ON platform.file_references(scan_status);

CREATE TABLE platform.malware_scan_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_reference_id UUID NOT NULL REFERENCES platform.file_references(id),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result TEXT NOT NULL CHECK (result IN ('clean','infected','error'))
);

CREATE TABLE platform.security_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_package_version_id UUID NOT NULL REFERENCES platform.rule_package_versions(id),
  designation TEXT NOT NULL,
  required_entitlement TEXT NOT NULL
);

CREATE TABLE platform.retention_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES platform.courts(id),
  record_category TEXT NOT NULL,
  retention_period_days INTEGER NOT NULL,
  disposition_action TEXT NOT NULL
);

CREATE TABLE platform.disposition_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  disposition_action TEXT NOT NULL,
  confirmed_by UUID NOT NULL REFERENCES platform.users(id),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_disposition_log_object ON platform.disposition_log(object_type, object_id);


-- =============================================================================
-- PHASE 1 ADDITIONS BEYOND TechArch
--
-- Each is required by a locked CONTEXT decision and is traced to that decision
-- in docs/SCHEMA-NOTES.md. Nothing below is speculative.
-- =============================================================================

-- CONTEXT: "Entitlements are first-class and grantable independently of roles."
CREATE TABLE platform.entitlement_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  is_designation_entitlement BOOLEAN NOT NULL DEFAULT false
);

-- CONTEXT: "Two-step request -> approve, enforced server-side at the API layer."
--
-- The second table-level CHECK is the point of this table: separation of duties
-- is asserted by PostgreSQL, so a self-approval is impossible even for a code
-- path that forgot to check — the same posture as the audit grants.
CREATE TABLE platform.access_grant_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_type TEXT NOT NULL CHECK (grant_type IN ('role','entitlement')),
  subject_user_id UUID NOT NULL REFERENCES platform.users(id),
  role_id UUID REFERENCES platform.roles(id),
  entitlement_key TEXT REFERENCES platform.entitlement_definitions(entitlement_key),
  court_id UUID REFERENCES platform.courts(id),
  division_id UUID REFERENCES platform.divisions(id),
  scope_type TEXT CHECK (scope_type IN ('court','division','case','proceeding','party_role','security_designation')),
  scope_value UUID,
  scope_enum_value TEXT,
  justification TEXT NOT NULL,
  requested_by UUID NOT NULL REFERENCES platform.users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  decided_by UUID REFERENCES platform.users(id),
  decided_at TIMESTAMPTZ,
  is_bootstrap BOOLEAN NOT NULL DEFAULT false,
  CHECK ((grant_type = 'role' AND role_id IS NOT NULL) OR (grant_type = 'entitlement' AND entitlement_key IS NOT NULL)),
  CHECK (decided_by IS NULL OR decided_by <> requested_by)   -- separation of duties, at the table level
);
CREATE INDEX idx_access_grant_requests_status ON platform.access_grant_requests(status, requested_at);
CREATE INDEX idx_access_grant_requests_subject ON platform.access_grant_requests(subject_user_id);

-- CONTEXT: "Every grant carries its own record, grantor, timestamp, and audit event."
CREATE TABLE platform.entitlement_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES platform.access_grant_requests(id),
  user_id UUID NOT NULL REFERENCES platform.users(id),
  entitlement_key TEXT NOT NULL REFERENCES platform.entitlement_definitions(entitlement_key),
  scope_type TEXT CHECK (scope_type IN ('court','division','case','proceeding','party_role','security_designation')),
  scope_value UUID,
  scope_enum_value TEXT,
  granted_by UUID NOT NULL REFERENCES platform.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_bootstrap BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES platform.users(id)
);
CREATE INDEX idx_entitlement_grants_user ON platform.entitlement_grants(user_id) WHERE revoked_at IS NULL;

-- CONTEXT: "A detected break writes a persistent integrity_alert record ...
-- Phase 3 routes these existing records into the Exception Queue."
-- Phase 1 must NOT create the F07 `exceptions` table.
CREATE TABLE platform.integrity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL DEFAULT 'audit_integrity_break',
  severity TEXT NOT NULL DEFAULT 'critical' CHECK (severity IN ('low','medium','high','critical')),
  audit_event_id UUID,
  expected_hash TEXT,
  actual_hash TEXT,
  detail JSONB NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged')),
  acknowledged_by UUID REFERENCES platform.users(id),
  acknowledged_at TIMESTAMPTZ
);
CREATE INDEX idx_integrity_alerts_status ON platform.integrity_alerts(status, detected_at);

-- CONTEXT: "An explicit bootstrap-completion step must disable or rotate them
-- before normal operation."
CREATE TABLE platform.bootstrap_state (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES platform.users(id)
);
INSERT INTO platform.bootstrap_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- Additive columns on TechArch tables.
--
-- PROVENANCE (CONTEXT: "Full provenance fields ship in Phase 1: source_system,
-- source_identifier, and locally_modified on every sync-eligible record").
-- TechArch already carries all three on docket_events, two on cases and
-- document_references, and one on parties. Only the gaps are filled.
-- Conflict-detection and review-queue columns are deliberately NOT added —
-- CONTEXT defers those to Phase 3.
-- -----------------------------------------------------------------------------

ALTER TABLE platform.cases ADD COLUMN locally_modified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE platform.parties ADD COLUMN source_identifier TEXT;
ALTER TABLE platform.parties ADD COLUMN locally_modified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE platform.document_references ADD COLUMN locally_modified BOOLEAN NOT NULL DEFAULT false;

-- STATUS TRANSITION TARGETS (CONTEXT: "No hard deletes anywhere in the case
-- model ... Removal is always a status transition (closed, superseded,
-- withdrawn)"). `proceedings.status` already exists in TechArch §5.3. Soft-delete
-- columns were explicitly rejected as "a competing second meaning of 'gone'" —
-- these are lifecycle states, not deletion markers.
ALTER TABLE platform.cases
  ADD COLUMN status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','superseded'));
ALTER TABLE platform.parties
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn'));

-- DESIGNATION LIFECYCLE. A sealing order can be lifted. With no DELETE grant and
-- no lifecycle column, the only ways to express that would be a hard delete
-- (forbidden) or leaving the record permanently sealed (wrong) — so the table
-- needs a revocation shape, and it is the same one already used by user_roles
-- and entitlement_grants rather than a one-off.
--
-- These columns MUST exist in this migration, not a later one: plan 01-07's
-- ResourceLoaderService (wave 5) filters every security_designations read on
-- `revoked_at IS NULL` when assembling the PDP input. The partial index below
-- matches that loader predicate exactly, because it sits on the hot path of
-- every authorization decision.
ALTER TABLE platform.security_designations ADD COLUMN revoked_at TIMESTAMPTZ;
ALTER TABLE platform.security_designations ADD COLUMN revoked_by UUID REFERENCES platform.users(id);
CREATE INDEX idx_security_designations_active
  ON platform.security_designations(object_type, object_id) WHERE revoked_at IS NULL;

-- ROLE-GRANT TRACEABILITY. A role grant goes through the same request→approve
-- flow as an entitlement grant, and must be revocable without a hard delete.
ALTER TABLE platform.user_roles ADD COLUMN request_id UUID REFERENCES platform.access_grant_requests(id);
ALTER TABLE platform.user_roles ADD COLUMN is_bootstrap BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE platform.user_roles ADD COLUMN revoked_at TIMESTAMPTZ;
ALTER TABLE platform.user_roles ADD COLUMN revoked_by UUID REFERENCES platform.users(id);
