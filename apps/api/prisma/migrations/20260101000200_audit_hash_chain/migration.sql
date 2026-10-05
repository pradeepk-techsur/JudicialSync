-- =============================================================================
-- 20260101000200_audit_hash_chain
-- =============================================================================
--
-- Tamper EVIDENCE, as distinct from the tamper PREVENTION in the previous
-- migration. The grants stop `app_rw` from rewriting history. This file makes
-- a forged history detectable even by a writer that could somehow insert
-- freely — including, per `TechArch/04-security.md` §7.3, "a compromised
-- application instance ... forging a consistent-looking chain."
--
-- §7.3 defines the chain as:
--
--     row_hash[n] = SHA-256( canonical_json(row[n] minus row_hash) || row_hash[n-1] )
--
-- and requires that "A BEFORE INSERT trigger recomputes the expected hash
-- server-side and rejects the insert if the application-supplied hash doesn't
-- match."
--
-- Note what that means about trust: the application is NOT trusted to produce
-- correct hashes. It is only trusted to produce a hash that the database
-- independently agrees with. The server-side recomputation is the control; the
-- application-supplied value is the claim being checked.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- The canonical payload.
--
-- An ORDERED, PIPE-DELIMITED string over an explicitly pinned field list — not
-- `to_jsonb(NEW)`. Two reasons, both of which would be expensive to discover
-- later:
--
--   1. A whole-row conversion includes `id` and `row_hash` themselves, which
--      makes the hash self-referential and the definition circular.
--
--   2. More seriously, it would silently change meaning the moment any later
--      phase adds a column to audit_events. Every historical row would then
--      fail verification at once, and the integrity job would report a total
--      chain break that is actually a schema change. A tamper-evidence scheme
--      whose alarm fires on routine migrations is one whose alarm gets ignored.
--
-- THE FIELD LIST BELOW IS FROZEN. A later phase adding a column to
-- audit_events must NOT add it here without a deliberate, documented chain
-- migration (docs/SCHEMA-NOTES.md §5).
--
-- `coalesce(..., '')` makes NULL and empty-string hash identically. That is
-- acceptable here because every nullable field is a typed column (UUID, JSONB)
-- whose empty-string rendering is not a legal value, so no two DISTINCT real
-- payloads can collide through it.
--
-- The timestamp is rendered explicitly at microsecond precision in UTC rather
-- than via the default `::text` cast, because that cast is sensitive to the
-- session `TimeZone` and `DateStyle` settings — the same row would hash
-- differently for two clients with different session settings, which would
-- produce phantom chain breaks that depend on who is connected.
--
-- IMMUTABLE is correct and load-bearing: the result depends only on the
-- arguments. `to_char` with an explicit `AT TIME ZONE 'UTC'` is itself
-- immutable, which is exactly why the conversion is written that way.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION platform.compute_audit_row_hash(
  p_actor_id UUID, p_action_type TEXT, p_object_type TEXT, p_object_id UUID,
  p_before_state JSONB, p_after_state JSONB, p_rule_version_ref UUID,
  p_calculation_version_ref UUID, p_client_ip TEXT, p_session_id UUID,
  p_occurred_at TIMESTAMPTZ, p_prev_hash TEXT
) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
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


-- -----------------------------------------------------------------------------
-- The guard trigger. Enforces three things:
--
--   1. CHAIN CONTINUITY — the supplied prev_hash is the current chain head.
--   2. HASH CORRECTNESS — the supplied row_hash matches server recomputation.
--   3. HEAD ADVANCEMENT — the head moves to this row, atomically with the
--      insert.
--
-- All three happen under a transaction-scoped advisory lock. Without it, two
-- concurrent writers would both read the same head, both validate, and both
-- commit — forking the chain into two branches that each verify correctly in
-- isolation. That is the exact failure a tamper-evidence scheme exists to
-- rule out, and it would appear under ordinary load rather than under attack.
--
-- The lock is transaction-scoped (`_xact_`), so it releases on COMMIT or
-- ROLLBACK with no unlock call and no leak on an aborted transaction. This
-- serialises audit writes, which is a deliberate throughput trade: a totally
-- ordered audit log is the product requirement (TechArch 04 §7.3 — suitable
-- for appellate review), and a partially ordered one is not merely slower,
-- it is not the thing being asked for.
--
-- BEFORE INSERT, not AFTER: a rejection must prevent the row, and
-- `TechArch/04-security.md` §7.3 specifies BEFORE INSERT by name. Note the
-- consequence for the transactional outbox pattern in that same section — the
-- domain write and the audit write share a transaction, so a rejected audit
-- insert rolls back the domain change too. "The action happened but wasn't
-- audited" stays structurally impossible.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION platform.audit_events_hash_chain_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

CREATE TRIGGER trg_audit_events_hash_chain
  BEFORE INSERT ON platform.audit_events
  FOR EACH ROW EXECUTE FUNCTION platform.audit_events_hash_chain_guard();


-- -----------------------------------------------------------------------------
-- app_rw must be able to COMPUTE a hash, so it can supply one to be checked.
--
-- Granting EXECUTE here does not weaken the control. Knowing the hash function
-- is not the secret — there is no secret. The guarantee is that the database
-- independently recomputes and compares, so a writer can only ever supply the
-- one correct answer for the payload it is actually inserting.
--
-- Two callers: plan 01-05's TypeScript audit writer (obtains the hash it then
-- supplies) and plan 01-12's verification job (re-walks the chain
-- independently and raises an integrity_alert on any break).
-- -----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION platform.compute_audit_row_hash(
  UUID, TEXT, TEXT, UUID, JSONB, JSONB, UUID, UUID, TEXT, UUID, TIMESTAMPTZ, TEXT
) TO app_rw;
