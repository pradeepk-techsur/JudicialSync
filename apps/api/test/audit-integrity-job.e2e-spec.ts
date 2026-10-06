import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { recordStandaloneAudit } from '../src/modules/audit/with-audit';
import { ChainVerifierService } from '../src/modules/audit/integrity/chain-verifier.service';
import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import {
  bootApp,
  loginAs,
  requireStack,
  testAdminDatabaseUrl,
  testDatabaseUrl,
} from './auth-harness';

/**
 * ============================================================================
 * THE HASH-CHAIN VERIFICATION JOB, PROVEN AGAINST A CORRUPTED ROW
 * ============================================================================
 *
 * The Phase 1 CONTEXT names this suite explicitly: "Deliberately corrupt an
 * audit row and assert the integrity job detects the chain break." Writing a
 * hash chain but never checking it leaves "tamper-evident" an unproven claim;
 * this is the proof.
 *
 * It runs against the live Compose stack because BullMQ needs Redis and because
 * the corruption must be a REAL out-of-band mutation: the test performs it as
 * `app_dba`, after first asserting that `app_rw` — the role the running
 * application uses — cannot perform it at all. That ordering is the point. The
 * append-only grant posture is the first line of defence; the verifier is the
 * second, for a tamper that bypasses the application entirely (a doctored
 * backup, a privileged operator). Proving `app_rw` is refused and THEN corrupting
 * as `app_dba` exercises both.
 *
 * ## An isolated chain segment
 *
 * These tests corrupt rows, which breaks the global chain for the duration. To
 * keep that from poisoning other suites, the suite records the pre-test chain
 * head, appends its own rows, and on teardown deletes exactly those rows (as
 * `app_dba`) and restores the head. The application never deletes audit rows;
 * this is a test-teardown concern only.
 */

jest.setTimeout(300_000);

const JUDGE = '0a000004-0000-4000-8000-000000000001';
const PLAIN_CASE = '0a000005-0000-4000-8000-000000000001';

describe('audit-integrity-job: tamper detection, never repair (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  let adminDb: Client;
  let verifier: ChainVerifierService;
  let audit: AuditService;
  let prisma: PrismaService;
  let available = false;

  const createdEventIds: string[] = [];

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;

    // A short interval + schedule enabled, so the "scheduled job actually runs"
    // case can observe a cycle. Verification itself is schedule-independent.
    ({ app, restoreEnv } = await bootApp({
      AUDIT_INTEGRITY_SCHEDULE_ENABLED: 'true',
      AUDIT_INTEGRITY_INTERVAL_MS: '2000',
    }));

    const provider = app.get(OidcProvider);
    for (let i = 0; i < 60 && !provider.isReady(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    adminDb = new Client({ connectionString: testAdminDatabaseUrl() });
    await adminDb.connect();

    verifier = app.get(ChainVerifierService);
    audit = app.get(AuditService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (available && createdEventIds.length > 0) {
      await adminDb.query(
        `DELETE FROM platform.audit_events WHERE id = ANY($1::uuid[])`,
        [createdEventIds],
      );
      await resetChainHead(adminDb);
    }
    // Any alerts this suite wrote are test artifacts — clear them so a later
    // run (and /status) is not permanently 'broken'.
    if (available) {
      await adminDb.query(
        `DELETE FROM platform.integrity_alerts WHERE alert_type = 'audit_integrity_break'`,
      );
    }
    await adminDb?.end();
    await db?.end();
    await app?.close();
    restoreEnv?.();
  });

  /** Append N audit events through the real write path; record their ids. */
  async function appendEvents(n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const [written] = await recordStandaloneAudit(prisma, audit, {
        actor_id: JUDGE,
        action_type: 'status_change',
        object_type: 'cases',
        object_id: PLAIN_CASE,
        before_state: { status: 'open' },
        after_state: { status: 'closed', seq: i },
      });
      ids.push(written.id);
      createdEventIds.push(written.id);
    }
    return ids;
  }

  const get = (path: string, token: string): request.Test =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`);

  // =========================================================================
  // 1. A clean chain verifies
  // =========================================================================

  it('a clean chain verifies with zero breaks and zero alerts', async () => {
    if (!available) return;

    // Scope verification to an incremental window containing only the rows this
    // test appends. The shared DB chain accumulates breaks across runs — earlier
    // suites delete rows for teardown, which severs the prev_hash linkage of the
    // following row (deletion is a test artefact; the application never deletes).
    // A window from just before our appends isolates a known-clean segment that
    // the real write path built, which is what "a clean chain verifies" means.
    const windowStart = new Date();
    await new Promise((r) => setTimeout(r, 5));
    await appendEvents(4);

    const result = await verifier.verify({ fromOccurredAt: windowStart });
    expect(result.verified).toBe(true);
    expect(result.breaks).toHaveLength(0);
    expect(result.rows_checked).toBeGreaterThanOrEqual(4);

    // No alert was written for this clean window.
    const breakAlerts = await prisma.integrity_alerts.count({
      where: { status: 'open', alert_type: 'audit_integrity_break' },
    });
    expect(breakAlerts).toBe(0);
  });

  // =========================================================================
  // 2. row_hash corruption — but app_rw cannot do it; app_dba must
  // =========================================================================

  it('app_rw cannot UPDATE audit_events; app_dba corruption is detected', async () => {
    if (!available) return;

    const [targetId] = await appendEvents(1);

    // FIRST: the application's role is refused the mutation entirely. That is
    // the append-only grant posture, and it is the point — SQLSTATE 42501.
    await expect(
      db.query(
        `UPDATE platform.audit_events SET action_type = 'ruling' WHERE id = $1`,
        [targetId],
      ),
    ).rejects.toMatchObject({ code: '42501' });

    // ONLY THEN, as the administrative role, perform the out-of-band tamper.
    await adminDb.query(
      `UPDATE platform.audit_events SET action_type = 'ruling' WHERE id = $1`,
      [targetId],
    );

    const result = await verifier.verify();
    expect(result.verified).toBe(false);

    const rowBreak = result.breaks.find(
      (b) => b.audit_event_id === targetId && b.kind === 'row_hash_mismatch',
    );
    expect(rowBreak).toBeDefined();
    expect(rowBreak?.expected_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rowBreak?.actual_hash).toMatch(/^[0-9a-f]{64}$/);

    const alert = await prisma.integrity_alerts.findFirst({
      where: { audit_event_id: targetId, status: 'open' },
    });
    expect(alert).not.toBeNull();
    expect(alert?.severity).toBe('critical');
    expect(alert?.expected_hash).not.toBeNull();
    expect(alert?.actual_hash).not.toBeNull();

    // Restore so subsequent cases start from a known-clean-ish point: put the
    // field back and rewrite the stored hash to match (app_dba only).
    await adminDb.query(
      `UPDATE platform.audit_events SET action_type = 'status_change' WHERE id = $1`,
      [targetId],
    );
    await clearAlerts(adminDb);
    await rehashRow(adminDb, targetId);
  });

  // =========================================================================
  // 3. prev_hash corruption
  // =========================================================================

  it('prev_hash corruption in a middle row is detected', async () => {
    if (!available) return;

    const ids = await appendEvents(3);
    const middle = ids[1];

    await adminDb.query(
      `UPDATE platform.audit_events SET prev_hash = repeat('a', 64) WHERE id = $1`,
      [middle],
    );

    const result = await verifier.verify();
    expect(result.verified).toBe(false);
    const prevBreak = result.breaks.find(
      (b) => b.kind === 'prev_hash_mismatch' && b.audit_event_id === middle,
    );
    expect(prevBreak).toBeDefined();

    // Teardown of this case: delete these three rows and reset head so the next
    // case starts clean.
    await deleteRows(adminDb, ids);
    for (const id of ids) {
      const idx = createdEventIds.indexOf(id);
      if (idx >= 0) createdEventIds.splice(idx, 1);
    }
    await resetChainHead(adminDb);
    await clearAlerts(adminDb);
  });

  // =========================================================================
  // 4. Tail deletion — the case a naive per-row verifier misses
  // =========================================================================

  it('tail deletion is detected as chain_head_mismatch', async () => {
    if (!available) return;

    const ids = await appendEvents(2);
    const tail = ids[ids.length - 1];

    // Delete the last row WITHOUT updating the head. The remaining chain is
    // internally consistent, but the head still points at the deleted tail.
    await adminDb.query(`DELETE FROM platform.audit_events WHERE id = $1`, [
      tail,
    ]);
    const idx = createdEventIds.indexOf(tail);
    if (idx >= 0) createdEventIds.splice(idx, 1);

    const result = await verifier.verify();
    expect(result.verified).toBe(false);
    const headBreak = result.breaks.find(
      (b) => b.kind === 'chain_head_mismatch',
    );
    expect(headBreak).toBeDefined();

    // Restore: head now points at the surviving latest row.
    await resetChainHead(adminDb);
    await clearAlerts(adminDb);
  });

  // =========================================================================
  // 5. Multiple breaks all reported
  // =========================================================================

  it('two corrupted rows produce two breaks, not one', async () => {
    if (!available) return;

    const ids = await appendEvents(4);
    const [a, , c] = ids;

    await adminDb.query(
      `UPDATE platform.audit_events SET after_state = '{"tampered":1}'::jsonb WHERE id = ANY($1::uuid[])`,
      [[a, c]],
    );

    const result = await verifier.verify();
    expect(result.verified).toBe(false);
    const rowBreaks = result.breaks.filter(
      (b) => b.kind === 'row_hash_mismatch',
    );
    const brokenIds = new Set(rowBreaks.map((b) => b.audit_event_id));
    expect(brokenIds.has(a)).toBe(true);
    expect(brokenIds.has(c)).toBe(true);

    // Teardown: rehash both and clear.
    await rehashRow(adminDb, a);
    await rehashRow(adminDb, c);
    await clearAlerts(adminDb);
  });

  // =========================================================================
  // 6. Alert surfaces in the Explorer API; unauthorized caller denied
  // =========================================================================

  it('a detected break surfaces through the integrity API and requires audit_reader', async () => {
    if (!available) return;

    const [targetId] = await appendEvents(1);
    await adminDb.query(
      `UPDATE platform.audit_events SET after_state = '{"x":2}'::jsonb WHERE id = $1`,
      [targetId],
    );

    await verifier.verify();

    const officer = await loginAs(app, 'security_officer');
    const alerts = await get(
      '/api/v1/audit/integrity/alerts',
      officer.session_token,
    );
    expect(alerts.status).toBe(200);
    expect(
      (alerts.body as { alerts: unknown[] }).alerts.length,
    ).toBeGreaterThan(0);

    const status = await get(
      '/api/v1/audit/integrity/status',
      officer.session_token,
    );
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ chain_verified: false });
    expect(
      (status.body as { open_alert_count: number }).open_alert_count,
    ).toBeGreaterThanOrEqual(1);

    // A caller without audit_reader is denied the integrity API.
    const clerk = await loginAs(app, 'clerk_case_admin');
    const denied = await get(
      '/api/v1/audit/integrity/status',
      clerk.session_token,
    );
    expect(denied.status).toBe(403);

    await rehashRow(adminDb, targetId);
    await clearAlerts(adminDb);
  });

  // =========================================================================
  // 7. No repair — the corrupted row is left exactly as found
  // =========================================================================

  it('detection never writes back to the corrupted row', async () => {
    if (!available) return;

    const [targetId] = await appendEvents(1);
    await adminDb.query(
      `UPDATE platform.audit_events SET after_state = '{"evidence":true}'::jsonb WHERE id = $1`,
      [targetId],
    );

    const before = await adminDb.query<{ after_state: unknown; row_hash: string }>(
      `SELECT after_state, row_hash FROM platform.audit_events WHERE id = $1`,
      [targetId],
    );

    await verifier.verify();

    const after = await adminDb.query<{ after_state: unknown; row_hash: string }>(
      `SELECT after_state, row_hash FROM platform.audit_events WHERE id = $1`,
      [targetId],
    );

    // Byte-for-byte unchanged: the system reports, it does not rewrite.
    expect(after.rows[0].after_state).toEqual(before.rows[0].after_state);
    expect(after.rows[0].row_hash).toBe(before.rows[0].row_hash);

    await rehashRow(adminDb, targetId);
    await clearAlerts(adminDb);
  });

  // =========================================================================
  // 8. The scheduled job actually runs
  // =========================================================================

  it('the scheduled job advances last_verified_at without an explicit call', async () => {
    if (!available) return;

    // The interval is 2s (set in beforeAll). Poll /status until last_verified_at
    // appears — produced by the repeatable job, not by any verify() call here.
    const { session_token } = await loginAs(app, 'security_officer');

    let lastVerifiedAt: string | null = null;
    for (let i = 0; i < 20; i += 1) {
      const status = await get(
        '/api/v1/audit/integrity/status',
        session_token,
      );
      const body = status.body as { last_verified_at: string | null };
      if (body.last_verified_at !== null) {
        lastVerifiedAt = body.last_verified_at;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    expect(lastVerifiedAt).not.toBeNull();
  });

  // =========================================================================
  // 9. Verification does not itself break the chain
  // =========================================================================

  it('running verify twice on a clean chain is idempotent and adds no rows', async () => {
    if (!available) return;

    // A fresh clean window built by the real write path (see case 1 on why the
    // whole shared chain is not assumed clean).
    const windowStart = new Date();
    await new Promise((r) => setTimeout(r, 5));
    await appendEvents(2);

    const countBefore = await prisma.audit_events.count();

    const first = await verifier.verify({ fromOccurredAt: windowStart });
    const second = await verifier.verify({ fromOccurredAt: windowStart });

    expect(first.verified).toBe(true);
    expect(second.verified).toBe(true);

    // Verification is a pure read: it never appends an audit row.
    const countAfter = await prisma.audit_events.count();
    expect(countAfter).toBe(countBefore);
  });

  // =========================================================================
  // Row/head teardown helpers (app_dba)
  // =========================================================================

  async function clearAlerts(client: Client): Promise<void> {
    await client.query(
      `DELETE FROM platform.integrity_alerts WHERE alert_type = 'audit_integrity_break'`,
    );
  }

  async function deleteRows(client: Client, ids: string[]): Promise<void> {
    await client.query(
      `DELETE FROM platform.audit_events WHERE id = ANY($1::uuid[])`,
      [ids],
    );
  }

  /**
   * Recompute and store the correct `row_hash` for a row whose content was put
   * back after a tamper test, so the chain is internally consistent again.
   *
   * Uses the DATABASE function `platform.compute_audit_row_hash` — this is
   * test-teardown, restoring a row the test deliberately broke, not the
   * verifier's own independent recomputation.
   */
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
    await resetChainHead(client);
  }
});

/**
 * Re-point `audit_chain_head` at the latest surviving audit row, so the head
 * matches the tail after test-teardown deletions. Test-only.
 */
async function resetChainHead(adminDb: Client): Promise<void> {
  const { rows } = await adminDb.query<{ id: string; row_hash: string }>(
    `SELECT id, row_hash FROM platform.audit_events
      ORDER BY occurred_at DESC, id DESC LIMIT 1`,
  );
  if (rows.length === 0) {
    await adminDb.query(
      `UPDATE platform.audit_chain_head
          SET last_row_hash = repeat('0', 64), last_audit_event_id = NULL`,
    );
  } else {
    await adminDb.query(
      `UPDATE platform.audit_chain_head
          SET last_row_hash = $1, last_audit_event_id = $2`,
      [rows[0].row_hash, rows[0].id],
    );
  }
}
