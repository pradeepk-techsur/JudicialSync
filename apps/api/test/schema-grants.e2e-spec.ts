import { Client } from 'pg';

import {
  PlatformDb,
  seedActor,
  startPlatformDb,
  stopPlatformDb,
} from './testcontainers-postgres';

/**
 * ============================================================================
 * THE PROOF OF PHASE 1 SUCCESS CRITERION 3
 * ============================================================================
 *
 * "An attempt to UPDATE or DELETE a past audit row fails **at the database
 * grant level**, not merely via application convention."
 *
 * Two deliberate choices about how this suite is written, both of which matter
 * more than they look:
 *
 * 1. **Raw `pg`, never Prisma.** If these assertions went through the ORM, a
 *    passing run would be consistent with Prisma declining to issue the
 *    statement, with a Prisma middleware intercepting it, or with the model
 *    being read-only in the client. None of those is the guarantee. Going
 *    through a raw driver means the statement definitely reached PostgreSQL
 *    and PostgreSQL definitely refused it.
 *
 * 2. **Assert on SQLSTATE, not message text.** `42501` (insufficient_privilege)
 *    is the contract. Message strings are localisable and version-dependent;
 *    a test matching on them passes for the wrong reason the day someone
 *    upgrades Postgres. More importantly, `42501` distinguishes "the database
 *    refused on privilege grounds" from "something else went wrong and the
 *    row happened not to change" — only the former is the guarantee.
 *
 * The connection is **`app_rw`**. Running these as the superuser would make
 * every assertion pass trivially while proving nothing at all.
 */

/** PostgreSQL: insufficient_privilege. The contract for every grant denial. */
const INSUFFICIENT_PRIVILEGE = '42501';

jest.setTimeout(180_000); // container pull + start + migrations

interface PgError extends Error {
  code?: string;
}

async function expectPgError(
  promise: Promise<unknown>,
): Promise<PgError> {
  try {
    await promise;
  } catch (error) {
    return error as PgError;
  }
  throw new Error(
    'Expected the statement to be rejected by PostgreSQL, but it succeeded.',
  );
}

describe('schema-grants: database-level immutability (e2e)', () => {
  let db: PlatformDb;
  let appRw: Client;
  let owner: Client;

  let actorId: string;
  let caseId: string;

  beforeAll(async () => {
    db = await startPlatformDb();

    owner = new Client({ connectionString: db.ownerUrl });
    await owner.connect();

    appRw = new Client({ connectionString: db.appRwUrl });
    await appRw.connect();

    // Fixtures are created as the OWNER. app_rw could create most of them, but
    // seeding through the role under test would conflate "the fixture could be
    // written" with "the assertion holds", and would fail outright for tables
    // app_rw can only read.
    actorId = await seedActor(owner);

    const { rows: courtRows } = await owner.query(
      `INSERT INTO platform.courts (court_name, court_code)
       VALUES ('Test District Court', 'TXTD') RETURNING id`,
    );
    const { rows: divisionRows } = await owner.query(
      `INSERT INTO platform.divisions (court_id, division_name)
       VALUES ($1, 'Austin') RETURNING id`,
      [courtRows[0].id],
    );
    const { rows: caseRows } = await owner.query<{ id: string }>(
      `INSERT INTO platform.cases
         (court_id, division_id, case_number, case_caption, case_type)
       VALUES ($1, $2, '1:24-cr-00001', 'United States v. Test', 'criminal')
       RETURNING id`,
      [courtRows[0].id, divisionRows[0].id],
    );
    caseId = caseRows[0].id;
  });

  afterAll(async () => {
    await appRw?.end();
    await owner?.end();
    await stopPlatformDb(db);
  });

  /**
   * Insert a valid audit row as app_rw, chaining correctly onto the current
   * head. Returns the new row's id.
   *
   * This doubles as the reference implementation of a correct audit write: ask
   * the database for the current head, ask it to compute the hash, then insert
   * with both. Plan 01-05's TypeScript writer does exactly this.
   */
  async function insertValidAuditEvent(
    actionType = 'test.action',
  ): Promise<string> {
    const { rows: headRows } = await appRw.query<{ last_row_hash: string }>(
      `SELECT last_row_hash FROM platform.audit_chain_head WHERE id`,
    );
    const prevHash = headRows[0].last_row_hash;
    const occurredAt = new Date().toISOString();

    const { rows: hashRows } = await appRw.query<{ row_hash: string }>(
      `SELECT platform.compute_audit_row_hash(
         $1::uuid, $2::text, $3::text, $4::uuid,
         NULL::jsonb, NULL::jsonb, NULL::uuid, NULL::uuid,
         NULL::text, NULL::uuid, $5::timestamptz, $6::text) AS row_hash`,
      [actorId, actionType, 'case', caseId, occurredAt, prevHash],
    );

    const { rows } = await appRw.query<{ id: string }>(
      `INSERT INTO platform.audit_events
         (actor_id, action_type, object_type, object_id, occurred_at, prev_hash, row_hash)
       VALUES ($1, $2, 'case', $3, $4, $5, $6)
       RETURNING id`,
      [
        actorId,
        actionType,
        caseId,
        occurredAt,
        prevHash,
        hashRows[0].row_hash,
      ],
    );
    return rows[0].id;
  }

  // ---------------------------------------------------------------------------
  // Precondition: the suite is actually running as the role under test.
  // Without this, a misconfigured connection string would make every assertion
  // below meaningless in a way that looks like a pass.
  // ---------------------------------------------------------------------------

  it('connects as app_rw, the role the grants apply to', async () => {
    const { rows } = await appRw.query('SELECT current_user');
    expect(rows[0].current_user).toBe('app_rw');
  });

  // ---------------------------------------------------------------------------
  // 1. A correct audit write succeeds.
  //
  // This matters as much as the denials: a guarantee that also blocks the
  // legitimate path is not a working system, and every denial below would be
  // trivially satisfiable by a table nobody can write to at all.
  // ---------------------------------------------------------------------------

  it('1. permits a correctly-hashed audit INSERT and advances the chain head', async () => {
    const id = await insertValidAuditEvent('audit.write.valid');

    const { rows } = await appRw.query(
      `SELECT ae.row_hash, ch.last_row_hash, ch.last_audit_event_id
         FROM platform.audit_events ae, platform.audit_chain_head ch
        WHERE ae.id = $1 AND ch.id`,
      [id],
    );

    expect(rows).toHaveLength(1);
    // The head advanced to this row, atomically with the insert.
    expect(rows[0].last_row_hash).toBe(rows[0].row_hash);
    expect(rows[0].last_audit_event_id).toBe(id);
  });

  // ---------------------------------------------------------------------------
  // 2-3. The core of criterion 3: a past audit row cannot be altered or removed.
  // ---------------------------------------------------------------------------

  it('2. refuses UPDATE on audit_events with SQLSTATE 42501', async () => {
    const id = await insertValidAuditEvent('audit.write.for-update-attempt');

    const error = await expectPgError(
      appRw.query(
        `UPDATE platform.audit_events SET action_type = 'tampered' WHERE id = $1`,
        [id],
      ),
    );

    expect(error.code).toBe(INSUFFICIENT_PRIVILEGE);

    // And the row is genuinely untouched — the denial is not a no-op that
    // happened to report an error after writing.
    const { rows } = await owner.query(
      `SELECT action_type FROM platform.audit_events WHERE id = $1`,
      [id],
    );
    expect(rows[0].action_type).toBe('audit.write.for-update-attempt');
  });

  it('3. refuses DELETE on audit_events with SQLSTATE 42501', async () => {
    const id = await insertValidAuditEvent('audit.write.for-delete-attempt');

    const error = await expectPgError(
      appRw.query(`DELETE FROM platform.audit_events WHERE id = $1`, [id]),
    );

    expect(error.code).toBe(INSUFFICIENT_PRIVILEGE);

    const { rows } = await owner.query(
      `SELECT count(*)::int AS n FROM platform.audit_events WHERE id = $1`,
      [id],
    );
    expect(rows[0].n).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 4. CONTEXT: "No hard deletes anywhere in the case model ... the application
  //    database role holds no DELETE grant on these tables."
  // ---------------------------------------------------------------------------

  it('4. refuses DELETE on a case-model table with SQLSTATE 42501', async () => {
    const error = await expectPgError(
      appRw.query(`DELETE FROM platform.cases WHERE id = $1`, [caseId]),
    );

    expect(error.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('4b. holds no DELETE grant on ANY table in the platform schema', async () => {
    // The generalisation of assertion 4. A new table added by a later plan
    // with a careless GRANT ALL fails here, which is the point: the rule is
    // schema-wide, so the test is too.
    const { rows } = await appRw.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.role_table_grants
        WHERE grantee = 'app_rw' AND table_schema = 'platform'
          AND privilege_type = 'DELETE'
        ORDER BY table_name`,
    );

    expect(rows.map((r) => r.table_name)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 5-6. Tamper evidence. These are rejected by the TRIGGER, not by a grant —
  // app_rw legitimately holds INSERT here. The distinguishing marker is the
  // AUDIT_CHAIN_BROKEN message rather than a 42501.
  // ---------------------------------------------------------------------------

  it('5. rejects an audit INSERT whose row_hash is forged (AUDIT_CHAIN_BROKEN)', async () => {
    const { rows: headRows } = await appRw.query<{ last_row_hash: string }>(
      `SELECT last_row_hash FROM platform.audit_chain_head WHERE id`,
    );

    const error = await expectPgError(
      appRw.query(
        `INSERT INTO platform.audit_events
           (actor_id, action_type, object_type, object_id, occurred_at, prev_hash, row_hash)
         VALUES ($1, 'forged.hash', 'case', $2, now(), $3, $4)`,
        [actorId, caseId, headRows[0].last_row_hash, 'f'.repeat(64)],
      ),
    );

    expect(error.message).toContain('AUDIT_CHAIN_BROKEN');
    // Specifically the recomputation branch, not the continuity branch.
    expect(error.message).toContain('does not match server recomputation');
  });

  it('6. rejects an audit INSERT whose prev_hash is stale (AUDIT_CHAIN_BROKEN)', async () => {
    // A self-consistent row — its row_hash genuinely matches its payload — but
    // chained onto the genesis hash rather than the current head. This is the
    // shape a compromised writer would produce trying to splice history, and
    // it is why continuity is checked separately from correctness.
    const staleHash = '0'.repeat(64);
    const occurredAt = new Date().toISOString();

    const { rows: hashRows } = await appRw.query<{ row_hash: string }>(
      `SELECT platform.compute_audit_row_hash(
         $1::uuid, 'stale.prev'::text, 'case'::text, $2::uuid,
         NULL::jsonb, NULL::jsonb, NULL::uuid, NULL::uuid,
         NULL::text, NULL::uuid, $3::timestamptz, $4::text) AS row_hash`,
      [actorId, caseId, occurredAt, staleHash],
    );

    const error = await expectPgError(
      appRw.query(
        `INSERT INTO platform.audit_events
           (actor_id, action_type, object_type, object_id, occurred_at, prev_hash, row_hash)
         VALUES ($1, 'stale.prev', 'case', $2, $3, $4, $5)`,
        [actorId, caseId, occurredAt, staleHash, hashRows[0].row_hash],
      ),
    );

    expect(error.message).toContain('AUDIT_CHAIN_BROKEN');
    expect(error.message).toContain('does not match chain head');
  });

  // ---------------------------------------------------------------------------
  // 7. Column-level grants: revocation is writable, substance is not.
  // ---------------------------------------------------------------------------

  describe('7. column-scoped UPDATE on grant records', () => {
    let grantId: string;

    beforeAll(async () => {
      await owner.query(
        `INSERT INTO platform.entitlement_definitions (entitlement_key, description)
         VALUES ('case_reader', 'Read case records'), ('audit_reader', 'Read the audit trail')
         ON CONFLICT (entitlement_key) DO NOTHING`,
      );
      const { rows } = await owner.query<{ id: string }>(
        `INSERT INTO platform.entitlement_grants (user_id, entitlement_key, granted_by)
         VALUES ($1, 'case_reader', $1) RETURNING id`,
        [actorId],
      );
      grantId = rows[0].id;
    });

    it('refuses to rewrite the substance of a grant (42501)', async () => {
      const error = await expectPgError(
        appRw.query(
          `UPDATE platform.entitlement_grants SET entitlement_key = 'audit_reader' WHERE id = $1`,
          [grantId],
        ),
      );

      expect(error.code).toBe(INSUFFICIENT_PRIVILEGE);

      const { rows } = await owner.query(
        `SELECT entitlement_key FROM platform.entitlement_grants WHERE id = $1`,
        [grantId],
      );
      expect(rows[0].entitlement_key).toBe('case_reader');
    });

    it('permits recording a revocation', async () => {
      await appRw.query(
        `UPDATE platform.entitlement_grants
            SET revoked_at = now(), revoked_by = $2
          WHERE id = $1`,
        [grantId, actorId],
      );

      const { rows } = await owner.query(
        `SELECT revoked_at, revoked_by FROM platform.entitlement_grants WHERE id = $1`,
        [grantId],
      );
      expect(rows[0].revoked_at).not.toBeNull();
      expect(rows[0].revoked_by).toBe(actorId);
    });

    it('applies the same posture to security_designations — a sealing order cannot be retitled', async () => {
      const { rows: designation } = await owner.query<{ id: string }>(
        `INSERT INTO platform.security_designations
           (object_type, object_id, designation, applied_by)
         VALUES ('case', $1, 'sealed', $2) RETURNING id`,
        [caseId, actorId],
      );

      const error = await expectPgError(
        appRw.query(
          `UPDATE platform.security_designations SET designation = 'pii' WHERE id = $1`,
          [designation[0].id],
        ),
      );
      expect(error.code).toBe(INSUFFICIENT_PRIVILEGE);

      // But lifting it is lawful, and is what the lifecycle columns are for.
      await appRw.query(
        `UPDATE platform.security_designations
            SET revoked_at = now(), revoked_by = $2 WHERE id = $1`,
        [designation[0].id, actorId],
      );

      const { rows } = await owner.query(
        `SELECT designation, revoked_at FROM platform.security_designations WHERE id = $1`,
        [designation[0].id],
      );
      expect(rows[0].designation).toBe('sealed');
      expect(rows[0].revoked_at).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // The no-DELETE assertion block is itself a control, so it is itself tested.
  //
  // In `20260101000100` the block cannot fail, because the `REVOKE ALL` at the
  // top of that file has already cleared everything. Its value is as a template
  // for later grant migrations, which will NOT start from zero. An untested
  // template that nobody has ever seen fire is indistinguishable from a comment.
  // ---------------------------------------------------------------------------

  it('the no-DELETE assertion block fires when a DELETE grant is planted', async () => {
    const assertionBlock = `
      DO $$
      DECLARE bad TEXT;
      BEGIN
        SELECT string_agg(DISTINCT table_name, ', ') INTO bad
        FROM information_schema.role_table_grants
        WHERE grantee = 'app_rw' AND table_schema = 'platform' AND privilege_type = 'DELETE';
        IF bad IS NOT NULL THEN
          RAISE EXCEPTION 'app_rw must hold no DELETE grant in schema platform, found on: %', bad;
        END IF;
      END $$;`;

    // Clean schema: the block passes.
    await expect(owner.query(assertionBlock)).resolves.toBeDefined();

    await owner.query(`GRANT DELETE ON platform.cases TO app_rw`);
    try {
      const error = await expectPgError(owner.query(assertionBlock));
      expect(error.message).toContain('must hold no DELETE grant');
      expect(error.message).toContain('cases');
    } finally {
      await owner.query(`REVOKE DELETE ON platform.cases FROM app_rw`);
    }

    // Restored.
    await expect(owner.query(assertionBlock)).resolves.toBeDefined();
  });
});
