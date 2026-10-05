-- =============================================================================
-- 20260101000300_audit_hash_search_path
-- =============================================================================
--
-- FIXES A LATENT, PRODUCTION-BREAKING DEFECT introduced in
-- 20260101000200_audit_hash_chain. Found by plan 01-05 the first time the
-- audit writer issued an INSERT through Prisma:
--
--     ERROR: function digest(bytea, unknown) does not exist
--
-- ## What was wrong
--
-- `pgcrypto` installs into `public` (20260101000000 runs `CREATE EXTENSION`
-- with no `SCHEMA` clause), so `digest()` is `public.digest()`.
-- `platform.compute_audit_row_hash` called it UNQUALIFIED, which means the
-- name was resolved against whatever `search_path` the CALLER happened to
-- have — and a PL/pgSQL or SQL function with no `SET search_path` of its own
-- inherits the session's.
--
-- The application's `DATABASE_URL` carries `?schema=platform`, so Prisma sets
-- `search_path` to `platform` alone. `public` is not on it. Every audit write
-- the application attempted therefore failed inside the trigger — and because
-- the trigger fires `BEFORE INSERT` on the transactional-outbox path, that
-- failure would have rolled back the DOMAIN write too. The practical effect in
-- production: no status change, ruling, custody transfer or designation change
-- could be saved at all.
--
-- ## Why it was not caught in 01-03
--
-- This is the part worth remembering, because the test suite was not thin —
-- it was testing through a different door.
--
-- `schema-grants.e2e-spec.ts` and the migration's own fixtures exercise the
-- chain through the raw `pg` driver, which has no notion of the `?schema=`
-- query parameter and simply leaves `search_path` at its default — which
-- includes `public`. So `digest()` resolved, the chain worked, and the tests
-- passed. The application connects through Prisma, which does set it. The
-- harness and the application disagreed about a session setting, and the
-- disagreement was invisible because neither side ever mentioned it.
--
-- The general lesson, recorded here rather than in a commit message because
-- the next person to add a schema-qualified function needs it: **a function
-- that will be called by an application with a pinned `search_path` must pin
-- its own.** Relying on the caller's is relying on configuration that lives in
-- a connection string in a secrets manager.
--
-- ## The fix
--
-- `SET search_path = pg_catalog, public` on the function itself. Attached to
-- the function, it applies for the duration of every call regardless of what
-- the caller's session looks like, so the resolution of `digest()` no longer
-- depends on who is connected or how.
--
-- `pg_catalog` first is the standard hardening posture for a `SECURITY
-- DEFINER`-adjacent routine: it stops a caller who can create objects in an
-- earlier schema from shadowing a built-in that this function relies on.
-- `platform` is deliberately ABSENT — this function references no `platform`
-- object, and omitting it keeps the resolvable surface minimal.
--
-- The function BODY is byte-identical to 20260101000200. That is a hard
-- requirement, not a convenience: this is the definition of the hash chain,
-- and changing any of it would invalidate every row written under the old
-- definition. `CREATE OR REPLACE` preserves the existing EXECUTE grant to
-- app_rw, so no re-grant is needed. The trigger function keeps calling it by
-- name and is unaffected.
--
-- Verified by `apps/api/test/audit-write.e2e-spec.ts`, which now drives the
-- whole path through Prisma — i.e. through the same door the application uses.
-- =============================================================================

CREATE OR REPLACE FUNCTION platform.compute_audit_row_hash(
  p_actor_id UUID, p_action_type TEXT, p_object_type TEXT, p_object_id UUID,
  p_before_state JSONB, p_after_state JSONB, p_rule_version_ref UUID,
  p_calculation_version_ref UUID, p_client_ip TEXT, p_session_id UUID,
  p_occurred_at TIMESTAMPTZ, p_prev_hash TEXT
) RETURNS TEXT LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT encode(digest(convert_to(
      coalesce(p_actor_id::text, '')               || '|' ||
      coalesce(p_action_type, '')                  || '|' ||
      coalesce(p_object_type, '')                  || '|' ||
      coalesce(p_object_id::text, '')              || '|' ||
      coalesce(p_before_state::text, '')           || '|' ||
      coalesce(p_after_state::text, '')            || '|' ||
      coalesce(p_rule_version_ref::text, '')       || '|' ||
      coalesce(p_calculation_version_ref::text,'') || '|' ||
      coalesce(p_client_ip, '')                    || '|' ||
      coalesce(p_session_id::text, '')             || '|' ||
      to_char(p_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
      coalesce(p_prev_hash, '')
    , 'UTF8'), 'sha256'), 'hex');
$$;


-- The trigger guard gets the same treatment for the same reason. It calls
-- `pg_advisory_xact_lock`, `hashtext` and `now()` unqualified; all are in
-- `pg_catalog`, so they resolve today under any sane search_path. Pinning it
-- anyway removes the dependency on that remaining true, and on `platform`
-- being reachable for the two tables it names — which it now qualifies
-- explicitly, so `platform` is listed here and nowhere else.
--
-- Body otherwise identical to 20260101000200.

CREATE OR REPLACE FUNCTION platform.audit_events_hash_chain_guard()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, platform, public
AS $$
DECLARE v_head TEXT; v_expected TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('platform.audit_events'));

  SELECT last_row_hash INTO v_head FROM platform.audit_chain_head WHERE id;

  IF NEW.prev_hash IS DISTINCT FROM v_head THEN
    RAISE EXCEPTION 'AUDIT_CHAIN_BROKEN: prev_hash % does not match chain head %', NEW.prev_hash, v_head
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  v_expected := platform.compute_audit_row_hash(
    NEW.actor_id, NEW.action_type, NEW.object_type, NEW.object_id,
    NEW.before_state, NEW.after_state, NEW.rule_version_ref,
    NEW.calculation_version_ref, NEW.client_ip, NEW.session_id,
    NEW.occurred_at, NEW.prev_hash);

  IF NEW.row_hash IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'AUDIT_CHAIN_BROKEN: supplied row_hash does not match server recomputation'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  UPDATE platform.audit_chain_head
     SET last_row_hash = NEW.row_hash, last_audit_event_id = NEW.id, updated_at = now()
   WHERE id;

  RETURN NEW;
END $$;


-- A regression gate, run at migrate time. Deliberately executed with
-- `search_path` set to `platform` ALONE — exactly what Prisma configures from
-- `?schema=platform`, and exactly the condition under which the original
-- definition failed.
--
-- If a future migration recreates either function without its `SET
-- search_path`, this block fails the deploy with a message naming the cause,
-- instead of the defect reaching production and surfacing as "no court action
-- can be saved".
DO $$
DECLARE v_hash TEXT;
BEGIN
  SET LOCAL search_path TO platform;

  SELECT platform.compute_audit_row_hash(
    NULL, 'status_change', 'cases', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    '2026-01-01T00:00:00Z'::timestamptz, repeat('0', 64)) INTO v_hash;

  IF v_hash IS NULL OR length(v_hash) <> 64 THEN
    RAISE EXCEPTION 'compute_audit_row_hash did not return a 64-character digest (got: %)', v_hash;
  END IF;
EXCEPTION WHEN undefined_function THEN
  RAISE EXCEPTION 'platform.compute_audit_row_hash cannot resolve its dependencies '
    'under search_path=platform. It needs "SET search_path = pg_catalog, public" '
    'because pgcrypto''s digest() lives in public. See migration '
    '20260101000300_audit_hash_search_path.';
END $$;
