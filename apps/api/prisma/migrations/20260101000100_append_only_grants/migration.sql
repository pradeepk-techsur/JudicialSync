-- =============================================================================
-- 20260101000100_append_only_grants
-- =============================================================================
--
-- This migration is where Phase 1 success criterion 3 is actually satisfied:
-- "an attempt to UPDATE or DELETE a past audit row fails at the database grant
-- level, not merely via application convention."
--
-- `TechArch/02a-data-shared.md` §5 opens with that as a BINDING statement, and
-- `TechArch/04-security.md` §7.3 explains the threat it answers: PostgreSQL
-- "will reject the statement regardless of which code path generated it,
-- including a compromised application process or an operator using the
-- application's own credentials." CONTEXT extends the same posture to the case
-- model: "the application database role holds no DELETE grant on these tables
-- — the same enforcement posture as the audit table."
--
-- ORDER MATTERS. This file starts from a default of NOTHING (`REVOKE ALL`) and
-- then grants deliberately, table by table. The opposite order — grant broadly,
-- then revoke the dangerous bits — is how an accidental DELETE grant survives
-- review: the reviewer has to notice an ABSENT revoke, which is far harder than
-- noticing a present grant.
--
-- Every statement here is a security control under `TechArch/04-security.md`
-- §7.7, which requires that changes to these grants be version-controlled and
-- carry security-officer sign-off before merge.
-- =============================================================================

GRANT USAGE ON SCHEMA platform TO app_rw;

-- Start from zero. Everything app_rw can do is granted explicitly below.
REVOKE ALL ON ALL TABLES IN SCHEMA platform FROM app_rw;


-- -----------------------------------------------------------------------------
-- 1. APPEND-ONLY TABLES — SELECT + INSERT, nothing else.
--
-- These record facts about a point in time. A fact does not change; a later
-- fact supersedes it. The REVOKE lines are redundant after the REVOKE ALL above
-- and are kept deliberately: they are the literal statements TechArch §5 and
-- §7.3 name, so a reader comparing this file against the spec finds them, and a
-- future edit that reorders this file cannot drop them silently.
-- -----------------------------------------------------------------------------

GRANT SELECT, INSERT ON platform.audit_events TO app_rw;
REVOKE UPDATE, DELETE ON platform.audit_events FROM app_rw;

GRANT SELECT, INSERT ON platform.disposition_log TO app_rw;
REVOKE UPDATE, DELETE ON platform.disposition_log FROM app_rw;

GRANT SELECT, INSERT ON platform.malware_scan_results TO app_rw;
REVOKE UPDATE, DELETE ON platform.malware_scan_results FROM app_rw;


-- -----------------------------------------------------------------------------
-- 2. GRANT RECORDS — append-only EXCEPT revocation, which is a column-level
--    UPDATE.
--
-- This lets a grant be revoked without ever permitting its substance (who,
-- which entitlement, which scope, granted by whom) to be rewritten. A
-- table-wide UPDATE would permit silently changing what a grant conferred
-- while keeping its original grantor and timestamp — a forged authorization
-- with a credible provenance, which is strictly worse than an obviously
-- missing one.
-- -----------------------------------------------------------------------------

GRANT SELECT, INSERT ON platform.entitlement_grants TO app_rw;
GRANT UPDATE (revoked_at, revoked_by) ON platform.entitlement_grants TO app_rw;

GRANT SELECT, INSERT ON platform.user_roles TO app_rw;
GRANT UPDATE (revoked_at, revoked_by) ON platform.user_roles TO app_rw;

-- 2b. Security designations get the same treatment, and for the same reason: a
--     designation's substance (which designation, applied to what, by whom,
--     when) is a historical fact about a judicial act. Only its revocation —
--     the lifting of the order — may be recorded. Table-wide UPDATE here would
--     silently permit retitling a sealing order.
GRANT SELECT, INSERT ON platform.security_designations TO app_rw;
GRANT UPDATE (revoked_at, revoked_by) ON platform.security_designations TO app_rw;


-- -----------------------------------------------------------------------------
-- 3. CASE-MODEL TABLES — SELECT, INSERT, UPDATE. No DELETE grant at all.
--
-- CONTEXT: "No hard deletes anywhere in the case model ... the application
-- database role holds no DELETE grant on these tables." Removal is a status
-- transition, which is an UPDATE to a status column.
--
-- security_designations is deliberately ABSENT from this list — it is covered
-- by 2b above with a column-scoped UPDATE instead. Adding it here would widen
-- it to table-wide UPDATE and undo that.
-- -----------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON platform.courts, platform.divisions, platform.cases,
  platform.proceedings, platform.hearings, platform.parties, platform.docket_events,
  platform.document_references TO app_rw;


-- -----------------------------------------------------------------------------
-- 4. OPERATIONAL TABLES that legitimately mutate.
-- -----------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON platform.users, platform.roles, platform.scope_assignments,
  platform.sessions, platform.access_grant_requests, platform.entitlement_definitions,
  platform.file_references, platform.integrity_alerts, platform.bootstrap_state,
  platform.audit_chain_head TO app_rw;


-- -----------------------------------------------------------------------------
-- 5. CONFIGURATION — read-only in Phase 1.
--
-- Phase 2's Configuration Engine widens these when it builds the maker-checker
-- publish flow. Until then the application can read configuration and cannot
-- author it, which is the correct posture for a table whose contents will
-- eventually require two-person approval to change.
-- -----------------------------------------------------------------------------

GRANT SELECT ON platform.court_profiles, platform.rule_package_versions,
  platform.security_policies, platform.retention_schedules TO app_rw;


-- -----------------------------------------------------------------------------
-- 6. THE ASSERTION. app_rw holds no DELETE grant on ANY table in platform.
--
-- This makes the no-DELETE rule self-enforcing at migration time rather than a
-- convention someone has to remember. If a migration grants DELETE — directly,
-- or via a careless GRANT ALL on a new table — the deploy fails and names the
-- offending table, instead of the posture widening silently and the failure
-- surfacing years later as a missing row nobody can account for.
--
-- Note honestly what it does and does not do HERE: in this file the `REVOKE
-- ALL` at the top has already cleared every privilege, so this block cannot
-- fail no matter what preceded it. Its value is as a TEMPLATE. Later grant
-- migrations will not start from zero — they will add a grant to a live
-- schema — and there the same block is a real gate.
--
-- EVERY FUTURE GRANT MIGRATION MUST REPEAT THIS BLOCK AS ITS FINAL STATEMENT.
-- That instruction is recorded in docs/SCHEMA-NOTES.md §4. The block is
-- verified to fire against a planted DELETE grant in
-- apps/api/test/schema-grants.e2e-spec.ts, so it is a tested control rather
-- than an untested assertion that happens never to have run.
-- -----------------------------------------------------------------------------

DO $$
DECLARE bad TEXT;
BEGIN
  SELECT string_agg(DISTINCT table_name, ', ') INTO bad
  FROM information_schema.role_table_grants
  WHERE grantee = 'app_rw' AND table_schema = 'platform' AND privilege_type = 'DELETE';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'app_rw must hold no DELETE grant in schema platform, found on: %', bad;
  END IF;
END $$;


-- Sequences: the schema uses gen_random_uuid() throughout so there are none
-- today, but a future identity/serial column would otherwise make INSERT fail
-- in a way that reads as a permission bug rather than a missing grant.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA platform TO app_rw;

-- A backstop for tables that do not exist yet. Note it is only a backstop:
-- default privileges apply to objects created by the role that set them, so
-- the assertion block above remains the control that actually catches a
-- mistake.
ALTER DEFAULT PRIVILEGES IN SCHEMA platform REVOKE DELETE ON TABLES FROM app_rw;
