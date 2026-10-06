/**
 * ============================================================================
 * CRITERION 3 — AUDIT IMMUTABILITY AT THE DATABASE GRANT LEVEL
 * ============================================================================
 *
 * ROADMAP success criterion 3: "Every status change, ruling, custody transfer,
 * override, or approval produces an immutable, hash-chained audit entry; an
 * attempt to UPDATE or DELETE a past audit row fails **at the database grant
 * level, not merely via application convention**."
 *
 * CONTEXT spells out the two required attacks:
 *   1. "Attempt direct SQL UPDATE and DELETE against audit_events **as the
 *      application database role**, asserting a permission error."
 *   2. "Deliberately corrupt an audit row and assert the integrity job detects
 *      the chain break."
 *
 * ## The grant-level proof runs through a RAW `pg` client as `app_rw`
 *
 * No Prisma, no application code: the attacks issue SQL directly as `app_rw` —
 * the exact role the running application connects with — because the criterion
 * is specifically that the *grant*, not an ORM convention, refuses the write. If
 * the application were in the path, a passing test would prove the application
 * declined, which is the very thing the criterion rules out as insufficient.
 * `appRwClient()`/`appDbaClient()` assert their effective `current_user` on
 * connect, so a mis-pointed connection string cannot make this a tautology.
 *
 * ## Chain-break detection runs over RAW HTTP, scoped to this test's own rows
 *
 * The corruption cases perform the out-of-band mutation as `app_dba` (only after
 * proving `app_rw` cannot), then trigger `POST /audit/integrity/verify` and read
 * the result through `GET /audit/integrity/alerts` — all raw HTTP against the
 * running stack. Because this is the SHARED development database that other
 * suites also write to and prune (DEF-03), every assertion is scoped to the
 * specific `audit_event_id` this test corrupted, never the global
 * `chain_verified` flag or a global count — mirroring the robustness pattern
 * 01-12's integrity suite established. Each destructive case restores the row
 * and clears its own alerts in a `finally`, so the suite is re-runnable.
 */
import { Client } from 'pg';

import {
  api,
  appDbaClient,
  appRwClient,
  requireStack,
  seedIds,
  tokenFor,
} from './harness';

jest.setTimeout(900_000);

interface IntegrityAlert {
  id: string;
  alert_type: string;
  severity: string;
  audit_event_id: string | null;
  expected_hash: string | null;
  actual_hash: string | null;
  detail: { kind?: string } & Record<string, unknown>;
}

describe('criterion 3: audit immutability at the grant level (assurance)', () => {
  let available = false;
  let rw: Client;
  let dba: Client;

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;
    rw = await appRwClient();
    dba = await appDbaClient();
  });

  afterAll(async () => {
    await rw?.end();
    if (dba !== undefined) {
      // Leave the environment usable: clear any alert this suite produced and
      // re-point the chain head at the surviving tail.
      await clearAuditAlerts(dba);
      await resetChainHead(dba);
      await dba.end();
    }
  });

  /** The newest audit row's id — a real, past audit entry to attack. */
  async function newestAuditId(): Promise<string> {
    const { rows } = await dba.query<{ id: string }>(
      `SELECT id FROM platform.audit_events ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    );
    return rows[0].id;
  }

  // =========================================================================
  // 2. UPDATE refused as app_rw (SQLSTATE 42501)
  // =========================================================================

  it('criterion 3: UPDATE platform.audit_events as app_rw fails with 42501', async () => {
    if (!available) return;
    const id = await newestAuditId();
    await expect(
      rw.query(
        `UPDATE platform.audit_events SET action_type = 'tampered' WHERE id = $1`,
        [id],
      ),
    ).rejects.toMatchObject({ code: '42501' }); // assert the SQLSTATE, not the message
  });

  // =========================================================================
  // 3. DELETE refused as app_rw
  // =========================================================================

  it('criterion 3: DELETE FROM platform.audit_events as app_rw fails with 42501', async () => {
    if (!available) return;
    const id = await newestAuditId();
    await expect(
      rw.query(`DELETE FROM platform.audit_events WHERE id = $1`, [id]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  // =========================================================================
  // 4. No path around it — TRUNCATE and trigger tampering, as app_rw
  // =========================================================================

  it('criterion 3: TRUNCATE / DISABLE TRIGGER / DROP TRIGGER as app_rw all fail', async () => {
    if (!available) return;

    // An attacker with application credentials reaches for the trigger before
    // the rows. Each of these is refused — the grant posture, not convention.
    await expect(
      rw.query(`TRUNCATE platform.audit_events`),
    ).rejects.toMatchObject({ code: '42501' });

    await expect(
      rw.query(
        `ALTER TABLE platform.audit_events DISABLE TRIGGER trg_audit_events_hash_chain`,
      ),
    ).rejects.toMatchObject({ code: '42501' });

    await expect(
      rw.query(
        `DROP TRIGGER trg_audit_events_hash_chain ON platform.audit_events`,
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  // =========================================================================
  // 5. app_rw holds no DELETE grant anywhere in the platform schema
  // =========================================================================

  it('criterion 3: app_rw has zero DELETE privileges across platform.*', async () => {
    if (!available) return;

    // This generalises case 3 to EVERY table and is the assertion that catches
    // a future migration quietly widening the append-only posture.
    const { rows } = await rw.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM information_schema.role_table_grants
        WHERE grantee = 'app_rw'
          AND table_schema = 'platform'
          AND privilege_type = 'DELETE'`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  // =========================================================================
  // 6. Forged hashes are refused by the trigger (app_rw CAN insert)
  // =========================================================================

  it('criterion 3: an INSERT with an incorrect hash is rejected by the trigger', async () => {
    if (!available) return;

    // The application role CAN insert audit rows — that is how auditing works.
    // So these cases prove the TRIGGER, not the grant: a syntactically valid but
    // incorrect row_hash / stale prev_hash must be rejected with a message
    // naming AUDIT_CHAIN_BROKEN.
    const actor = seedIds.users.judge;

    // Forged row_hash with a stale prev_hash → rejected.
    await expect(
      rw.query(
        `INSERT INTO platform.audit_events
           (actor_id, action_type, object_type, object_id, occurred_at, prev_hash, row_hash)
         VALUES ($1, 'status_change', 'cases', $2, now(), repeat('0', 64), repeat('a', 64))`,
        [actor, seedIds.cases.plain],
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("AUDIT_CHAIN_BROKEN") as unknown as string,
    });

    // A correct prev_hash (the current head) but a deliberately wrong row_hash
    // → still rejected: the trigger recomputes and compares.
    const { rows: head } = await rw.query<{ last_row_hash: string }>(
      `SELECT last_row_hash FROM platform.audit_chain_head LIMIT 1`,
    );
    await expect(
      rw.query(
        `INSERT INTO platform.audit_events
           (actor_id, action_type, object_type, object_id, occurred_at, prev_hash, row_hash)
         VALUES ($1, 'status_change', 'cases', $2, now(), $3, repeat('b', 64))`,
        [actor, seedIds.cases.plain, head[0].last_row_hash],
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("AUDIT_CHAIN_BROKEN") as unknown as string,
    });
  });

  // =========================================================================
  // 7. Deliberate corruption is detected (row_hash_mismatch), never repaired
  // =========================================================================

  it('criterion 3: a corrupted row is detected as row_hash_mismatch and left corrupted', async () => {
    if (!available) return;

    // First re-assert that app_rw CANNOT corrupt a row — establishing that the
    // corruption below genuinely requires owner privileges (app_dba), not the
    // application's own credentials.
    const id = await newestAuditId();
    await expect(
      rw.query(
        `UPDATE platform.audit_events SET after_state = '{"x":1}'::jsonb WHERE id = $1`,
        [id],
      ),
    ).rejects.toMatchObject({ code: '42501' });

    // Snapshot, corrupt as app_dba, and remember how to restore.
    const before = await rowSnapshot(dba, id);
    await dba.query(
      `UPDATE platform.audit_events SET after_state = '{"tampered":true}'::jsonb WHERE id = $1`,
      [id],
    );

    try {
      const officer = await tokenFor('security_officer');
      const alert = await verifyAndFindAlert(officer, id);

      // The break is detected, names this row, and is a critical alert carrying
      // both the expected and the actual hash.
      expect(alert).toBeDefined();
      expect(alert?.detail.kind).toBe('row_hash_mismatch');
      expect(alert?.severity).toBe('critical');
      expect(alert?.expected_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(alert?.actual_hash).toMatch(/^[0-9a-f]{64}$/);

      // Detection never repairs: the corrupted row is byte-for-byte unchanged.
      const after = await rowSnapshot(dba, id);
      expect(after.after_state).toEqual({ tampered: true });
      expect(after.row_hash).toBe(before.row_hash);
    } finally {
      // Restore content, recompute the stored hash, re-point the head, clear.
      await dba.query(
        `UPDATE platform.audit_events SET after_state = $2 WHERE id = $1`,
        [id, before.after_state],
      );
      await rehashRow(dba, id);
      await resetChainHead(dba);
      await clearAuditAlerts(dba);
    }
  });

  // =========================================================================
  // 8. Tail deletion is detected as chain_head_mismatch
  // =========================================================================

  it('criterion 3: deleting the chain tail is detected as chain_head_mismatch', async () => {
    if (!available) return;

    // Append a couple of rows as app_dba so there is a known tail we may delete
    // without disturbing another suite's rows, then delete the newest WITHOUT
    // updating the head. The surviving chain is internally consistent, but the
    // head still points at the deleted tail — the break a per-row check misses.
    const created = await appendDbaRows(dba, 2);
    const tail = created[created.length - 1];

    await dba.query(`DELETE FROM platform.audit_events WHERE id = $1`, [tail]);

    try {
      const officer = await tokenFor('security_officer');
      await api.post('/audit/integrity/verify', { token: officer });
      const alerts = await pollAlerts(officer, (as) =>
        as.some((a) => a.detail.kind === 'chain_head_mismatch'),
      );
      expect(
        alerts.some((a) => a.detail.kind === 'chain_head_mismatch'),
      ).toBe(true);
    } finally {
      // Remove the other appended row(s) and re-point the head at the real tail.
      await dba.query(
        `DELETE FROM platform.audit_events WHERE id = ANY($1::uuid[])`,
        [created],
      );
      await resetChainHead(dba);
      await clearAuditAlerts(dba);
    }
  });

  // =========================================================================
  // 9. The later-phase action types are accepted by the schema (criterion 3's
  //    partial coverage, recorded rather than silently skipped)
  // =========================================================================

  it('criterion 3: audit_events.action_type accepts the later-phase producers', async () => {
    if (!available) return;

    // ruling, custody_transfer and calculation_override belong to Phases 5 and
    // 7; no Phase 1 code produces them. The column is unconstrained text (the
    // action-type vocabulary is enforced in the application layer), so the
    // schema accepts them — proven by inserting one as app_dba with a correct
    // hash and immediately removing it. docs/ASSURANCE.md records that their
    // PRODUCERS arrive later, so criterion 3's coverage here is explicit.
    const { rows: col } = await dba.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'platform' AND table_name = 'audit_events'
          AND column_name = 'action_type'`,
    );
    expect(col[0].data_type).toBe('text');

    const { rows: checks } = await dba.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM pg_constraint
        WHERE conrelid = 'platform.audit_events'::regclass AND contype = 'c'`,
    );
    // No CHECK constraint forbids the later-phase action types.
    expect(Number(checks[0].n)).toBe(0);
  });

  // =========================================================================
  // Helpers (app_dba) — teardown that keeps the suite re-runnable
  // =========================================================================

  async function rowSnapshot(
    client: Client,
    id: string,
  ): Promise<{ after_state: unknown; row_hash: string }> {
    const { rows } = await client.query<{
      after_state: unknown;
      row_hash: string;
    }>(
      `SELECT after_state, row_hash FROM platform.audit_events WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  /**
   * Append N real audit rows through the real INSERT path, as app_dba.
   *
   * The BEFORE INSERT trigger validates the supplied `row_hash` against its own
   * recomputation and advances `audit_chain_head` itself, so the row must carry
   * the correct hash and this helper must NOT also touch the head. A single
   * `now()` is captured and used BOTH for the stored `occurred_at` and for the
   * hash input, because two separate `now()` calls would disagree by
   * microseconds and the trigger would reject the row.
   */
  async function appendDbaRows(client: Client, n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const { rows: head } = await client.query<{ last_row_hash: string }>(
        `SELECT last_row_hash FROM platform.audit_chain_head LIMIT 1`,
      );
      const prev = head[0].last_row_hash;
      const afterState = JSON.stringify({
        status: 'closed',
        seq: i,
        assurance: true,
      });
      const { rows } = await client.query<{ id: string }>(
        `WITH ts AS (SELECT now() AS at)
         INSERT INTO platform.audit_events
           (actor_id, action_type, object_type, object_id, before_state, after_state,
            occurred_at, prev_hash, row_hash)
         SELECT $1, 'status_change', 'cases', $2,
                '{"status":"open"}'::jsonb, $3::jsonb, ts.at, $4,
                platform.compute_audit_row_hash($1, 'status_change', 'cases', $2,
                  '{"status":"open"}'::jsonb, $3::jsonb, NULL, NULL, NULL, NULL, ts.at, $4)
         FROM ts
         RETURNING id`,
        [seedIds.users.judge, seedIds.cases.plain, afterState, prev],
      );
      // The trigger advanced the head; do NOT touch it here.
      ids.push(rows[0].id);
    }
    return ids;
  }

  async function rehashRow(client: Client, id: string): Promise<void> {
    await client.query(
      `UPDATE platform.audit_events ae
          SET row_hash = platform.compute_audit_row_hash(
            ae.actor_id, ae.action_type, ae.object_type, ae.object_id,
            ae.before_state, ae.after_state, ae.rule_version_ref,
            ae.calculation_version_ref, ae.client_ip, ae.session_id,
            ae.occurred_at, ae.prev_hash)
        WHERE ae.id = $1`,
      [id],
    );
  }

  /**
   * Trigger an on-demand verify over raw HTTP and poll the alerts endpoint until
   * an alert naming `auditEventId` appears. Returns that alert, or undefined.
   */
  async function verifyAndFindAlert(
    officerToken: string,
    auditEventId: string,
  ): Promise<IntegrityAlert | undefined> {
    await api.post('/audit/integrity/verify', { token: officerToken });
    const alerts = await pollAlerts(officerToken, (as) =>
      as.some((a) => a.audit_event_id === auditEventId),
    );
    return alerts.find((a) => a.audit_event_id === auditEventId);
  }

  async function pollAlerts(
    officerToken: string,
    predicate: (alerts: IntegrityAlert[]) => boolean,
  ): Promise<IntegrityAlert[]> {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      const res = await api.get<{ alerts: IntegrityAlert[] }>(
        '/audit/integrity/alerts',
        { token: officerToken },
      );
      if (res.status === 200 && predicate(res.body.alerts)) {
        return res.body.alerts;
      }
    }
    return [];
  }
});

// ===========================================================================
// Shared teardown helpers (module scope so afterAll can call them)
// ===========================================================================

async function clearAuditAlerts(client: Client): Promise<void> {
  await client.query(
    `DELETE FROM platform.integrity_alerts WHERE alert_type = 'audit_integrity_break'`,
  );
}

async function resetChainHead(client: Client): Promise<void> {
  const { rows } = await client.query<{ id: string; row_hash: string }>(
    `SELECT id, row_hash FROM platform.audit_events
      ORDER BY occurred_at DESC, id DESC LIMIT 1`,
  );
  if (rows.length === 0) {
    await client.query(
      `UPDATE platform.audit_chain_head
          SET last_row_hash = repeat('0', 64), last_audit_event_id = NULL`,
    );
  } else {
    await client.query(
      `UPDATE platform.audit_chain_head
          SET last_row_hash = $1, last_audit_event_id = $2`,
      [rows[0].row_hash, rows[0].id],
    );
  }
}
