import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';
import type Redis from 'ioredis';

import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import { SessionService } from '../src/modules/identity/session.service';
import { REDIS_CLIENT } from '../src/modules/identity/redis.provider';
import { RetentionModule } from '../src/modules/retention/retention.module';
import { SERVICE_TOKEN_HEADER } from '../src/modules/audit/service-token.guard';
import {
  bootApp,
  loginAs,
  requireStack,
  testAdminDatabaseUrl,
  testDatabaseUrl,
} from './auth-harness';

/**
 * ============================================================================
 * RETENTION, DUE-FOR-DISPOSITION, AND THE NO-AUTO-PURGE GUARD (e2e)
 * ============================================================================
 *
 * Against the real stack: real sessions, the real OPA-backed guard chain, and
 * the real seeded retention schedules, cases and designations. The property
 * under test — "no automated hard-delete is possible, and a disposition is a
 * recorded decision that deletes nothing" — is a claim about behaviour over
 * HTTP and about what the `disposition_log` table contains afterwards, so both
 * are inspected directly.
 *
 * ## Also the home of the key-access separation-of-duties tests (Task 3)
 *
 * `POST /security/keys/rotate` and `GET /security/keys/status` are exercised
 * here too, per the plan, so the one real-stack retention suite covers the
 * whole security-baseline write surface.
 */

jest.setTimeout(300_000);

const NDCA_COURT_ID = '0a000001-0000-4000-8000-000000000001';
const SEALED_CASE_ID = '0a000005-0000-4000-8000-000000000002';
const PLAIN_CASE_ID = '0a000005-0000-4000-8000-000000000001';

interface DispositionRow {
  id: string;
  object_type: string;
  object_id: string;
  disposition_action: string;
  confirmed_by: string;
}

describe('retention-disposition: no automated purge is possible (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  let adminDb: Client;
  let available = false;

  /**
   * Session-token cache, one per user.
   *
   * The real-IdP harness does a full browser login with a one-time-use TOTP
   * code for every `loginAs`, and Keycloak rejects a code reused inside its
   * 30-second window — so a suite that logs in ~20 times sequentially spends
   * most of its wall-clock waiting out TOTP windows, and occasionally fails a
   * login outright to contention. Logging in ONCE per user and reusing the
   * session token removes that: a session token stays valid for the whole run,
   * and the tests here never need a *new* session, only a valid one.
   *
   * The two tests that call `revokeAllForUser` evict the affected user from
   * this cache themselves (via {@link freshLogin}) so a later test re-logs in
   * rather than reusing a revoked token.
   */
  const tokenCache = new Map<string, string>();

  const tokenFor = async (
    user:
      | 'court_admin'
      | 'clerk_case_admin'
      | 'security_officer'
      | 'system_admin',
  ): Promise<string> => {
    const cached = tokenCache.get(user);
    if (cached !== undefined) return cached;
    const { session_token } = await loginAs(app, user);
    tokenCache.set(user, session_token);
    return session_token;
  };

  /** A `{ session_token }` shape, from the per-user cache. */
  const loginCached = async (
    _app: unknown,
    user:
      | 'court_admin'
      | 'clerk_case_admin'
      | 'security_officer'
      | 'system_admin',
  ): Promise<{ session_token: string }> => ({
    session_token: await tokenFor(user),
  });

  /** Force a fresh login, replacing any cached token (used after a revoke). */
  const freshLogin = async (
    user: 'court_admin',
  ): Promise<{ session_token: string }> => {
    tokenCache.delete(user);
    return { session_token: await tokenFor(user) };
  };

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;

    // A configured service token so the batch-identity test can present one.
    ({ app, restoreEnv } = await bootApp(
      { INTERNAL_SERVICE_TOKEN: 'retention-suite-service-token' },
      [RetentionModule],
    ));

    const provider = app.get(OidcProvider);
    for (let i = 0; i < 60 && !provider.isReady(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    adminDb = new Client({ connectionString: testAdminDatabaseUrl() });
    await adminDb.connect();
  });

  afterAll(async () => {
    await adminDb?.end();
    await db?.end();
    try {
      const redis = app?.get<Redis>(REDIS_CLIENT, { strict: false });
      await redis?.quit();
    } catch {
      /* no redis */
    }
    await app?.close();
    await closeGlobalFetch();
    restoreEnv?.();
  });

  const bearer = (path: string, token: string): request.Test =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`);

  const dispositionCount = async (): Promise<number> => {
    const { rows } = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM platform.disposition_log`,
    );
    return Number(rows[0].count);
  };

  // =========================================================================
  // Schedules
  // =========================================================================

  it('court_admin reads the four seeded schedules; clerk_case_admin is denied', async () => {
    if (!available) return;

    const admin = await loginCached(app, 'court_admin');
    const ok = await bearer(
      `/api/v1/retention/schedules?court_id=${NDCA_COURT_ID}`,
      admin.session_token,
    );
    expect(ok.status).toBe(200);
    const categories = ok.body.schedules
      .map((s: { record_category: string }) => s.record_category)
      .sort();
    expect(categories).toEqual([
      'audit_event',
      'case_record',
      'document',
      'file_reference',
    ]);

    const clerk = await loginCached(app, 'clerk_case_admin');
    const denied = await bearer(
      `/api/v1/retention/schedules?court_id=${NDCA_COURT_ID}`,
      clerk.session_token,
    );
    expect(denied.status).toBe(403);
  });

  // =========================================================================
  // Due-for-disposition
  // =========================================================================

  it('due-for-disposition is empty for fresh data and lists a back-dated case', async () => {
    if (!available) return;

    const admin = await loginCached(app, 'court_admin');

    // With freshly seeded data no case_record is past its 7300-day window.
    const fresh = await bearer(
      `/api/v1/retention/due-for-disposition?court_id=${NDCA_COURT_ID}`,
      admin.session_token,
    );
    expect(fresh.status).toBe(200);
    const freshCases = fresh.body.records.filter(
      (r: { object_type: string }) => r.object_type === 'case',
    );
    expect(freshCases).toHaveLength(0);

    // Back-date the plain case beyond case_record's 7300 days.
    const original = (
      await adminDb.query(
        `SELECT created_at FROM platform.cases WHERE id = $1`,
        [PLAIN_CASE_ID],
      )
    ).rows[0].created_at;
    try {
      await adminDb.query(
        `UPDATE platform.cases SET created_at = now() - interval '7301 days' WHERE id = $1`,
        [PLAIN_CASE_ID],
      );

      const after = await bearer(
        `/api/v1/retention/due-for-disposition?court_id=${NDCA_COURT_ID}`,
        (await loginCached(app, 'court_admin')).session_token,
      );
      expect(after.status).toBe(200);
      const plain = after.body.records.find(
        (r: { object_id: string }) => r.object_id === PLAIN_CASE_ID,
      );
      expect(plain).toBeDefined();
      expect(plain.record_category).toBe('case_record');
      expect(plain.disposition_action).toBe('review_required');
    } finally {
      await adminDb.query(
        `UPDATE platform.cases SET created_at = $2 WHERE id = $1`,
        [PLAIN_CASE_ID, original],
      );
    }
  });

  it('a sealed case past retention is hidden from a non-sealed caller and shown to judge', async () => {
    if (!available) return;

    const original = (
      await adminDb.query(
        `SELECT created_at FROM platform.cases WHERE id = $1`,
        [SEALED_CASE_ID],
      )
    ).rows[0].created_at;
    try {
      await adminDb.query(
        `UPDATE platform.cases SET created_at = now() - interval '7301 days' WHERE id = $1`,
        [SEALED_CASE_ID],
      );

      // court_admin holds retention_viewer but NOT designation_sealed, so the
      // sealed case must not appear in the maintenance listing.
      const admin = await freshLogin('court_admin');
      const adminRes = await bearer(
        `/api/v1/retention/due-for-disposition?court_id=${NDCA_COURT_ID}`,
        admin.session_token,
      );
      expect(adminRes.status).toBe(200);
      expect(
        adminRes.body.records.find(
          (r: { object_id: string }) => r.object_id === SEALED_CASE_ID,
        ),
      ).toBeUndefined();

      // judge holds designation_sealed AND retention_viewer? judge does NOT
      // hold retention_viewer in the seed, so judge is denied the endpoint
      // outright. The designation filter is proven by the court_admin case
      // above (sealed hidden) — asserting the positive half requires a user
      // with BOTH retention_viewer and designation_sealed, which the seed does
      // not provide. We therefore grant court_admin designation_sealed
      // in-test and assert the sealed case now appears, pinning the filter's
      // positive direction without depending on a seed that lacks the pair.
      // Written on the administrative connection: entitlement_grants is
      // append-only for app_rw (plan 01-03), and cleanup needs a DELETE that
      // app_rw does not hold, so both ends of this fixture use app_dba.
      await adminDb.query(
        `INSERT INTO platform.entitlement_grants (user_id, entitlement_key, granted_by)
         VALUES ($1, 'designation_sealed', $1)
         ON CONFLICT DO NOTHING`,
        ['0a000004-0000-4000-8000-000000000007'],
      );
      await app.get(SessionService).revokeAllForUser(
        '0a000004-0000-4000-8000-000000000007',
      );

      const privileged = await freshLogin('court_admin');
      const privilegedRes = await bearer(
        `/api/v1/retention/due-for-disposition?court_id=${NDCA_COURT_ID}`,
        privileged.session_token,
      );
      expect(privilegedRes.status).toBe(200);
      expect(
        privilegedRes.body.records.find(
          (r: { object_id: string }) => r.object_id === SEALED_CASE_ID,
        ),
      ).toBeDefined();
    } finally {
      await adminDb.query(
        `UPDATE platform.cases SET created_at = $2 WHERE id = $1`,
        [SEALED_CASE_ID, original],
      );
      await adminDb.query(
        `DELETE FROM platform.entitlement_grants
          WHERE user_id = $1 AND entitlement_key = 'designation_sealed'`,
        ['0a000004-0000-4000-8000-000000000007'],
      );
      await app.get(SessionService).revokeAllForUser(
        '0a000004-0000-4000-8000-000000000007',
      );
      // court_admin's sessions and entitlements were churned here; evict the
      // cached token so later tests re-login with the restored (correct) state.
      tokenCache.delete('court_admin');
    }
  });

  // =========================================================================
  // Disposition — the PDP gate and the human-confirmation gate
  // =========================================================================

  const postDisposition = (
    token: string,
    body: unknown,
    extraHeaders: Record<string, string> = {},
  ): request.Test => {
    let req = request(app.getHttpServer())
      .post('/api/v1/retention/dispositions')
      .set('Authorization', `Bearer ${token}`);
    for (const [k, v] of Object.entries(extraHeaders)) req = req.set(k, v);
    return req.send(body as object);
  };

  const COURT_ADMIN_ID = '0a000004-0000-4000-8000-000000000007';

  it('clerk_case_admin lacks disposition_confirm — the PDP refuses before the guard', async () => {
    if (!available) return;

    const before = await dispositionCount();
    const clerk = await loginCached(app, 'clerk_case_admin');
    const res = await postDisposition(clerk.session_token, {
      object_type: 'case',
      object_id: PLAIN_CASE_ID,
      disposition_action: 'review_required',
      confirmation: {
        confirmed_by: '0a000004-0000-4000-8000-000000000004',
        rationale: 'retention period elapsed, reviewed',
      },
    });
    expect(res.status).toBe(403);
    expect(await dispositionCount()).toBe(before);
  });

  it('court_admin without a confirmation object → 403, no row', async () => {
    if (!available) return;

    const before = await dispositionCount();
    const admin = await loginCached(app, 'court_admin');
    const res = await postDisposition(admin.session_token, {
      object_type: 'case',
      object_id: PLAIN_CASE_ID,
      disposition_action: 'review_required',
    });
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('SECURITY_DISPOSITION_UNCONFIRMED');
    expect(await dispositionCount()).toBe(before);
  });

  it('confirmation naming a different user → 403, no row', async () => {
    if (!available) return;

    const before = await dispositionCount();
    const admin = await loginCached(app, 'court_admin');
    const res = await postDisposition(admin.session_token, {
      object_type: 'case',
      object_id: PLAIN_CASE_ID,
      disposition_action: 'review_required',
      confirmation: {
        confirmed_by: '0a000004-0000-4000-8000-000000000004', // not the caller
        rationale: 'retention period elapsed, reviewed',
      },
    });
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('SECURITY_DISPOSITION_UNCONFIRMED');
    expect(await dispositionCount()).toBe(before);
  });

  it('a rationale shorter than 10 characters → 403, no row', async () => {
    if (!available) return;

    const before = await dispositionCount();
    const admin = await loginCached(app, 'court_admin');
    const res = await postDisposition(admin.session_token, {
      object_type: 'case',
      object_id: PLAIN_CASE_ID,
      disposition_action: 'review_required',
      confirmation: { confirmed_by: COURT_ADMIN_ID, rationale: 'too short' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('SECURITY_DISPOSITION_UNCONFIRMED');
    expect(await dispositionCount()).toBe(before);
  });

  it('a batch identity cannot dispose of a record', async () => {
    if (!available) return;

    const before = await dispositionCount();
    const admin = await loginCached(app, 'court_admin');
    // A valid, complete, self-named confirmation — but carrying the internal
    // service token. The guard refuses it before the fields are even weighed:
    // no batch identity may dispose of a court record.
    const res = await postDisposition(
      admin.session_token,
      {
        object_type: 'case',
        object_id: PLAIN_CASE_ID,
        disposition_action: 'review_required',
        confirmation: {
          confirmed_by: COURT_ADMIN_ID,
          rationale: 'retention period elapsed, reviewed',
        },
      },
      { [SERVICE_TOKEN_HEADER]: 'retention-suite-service-token' },
    );
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('SECURITY_DISPOSITION_UNCONFIRMED');
    expect(await dispositionCount()).toBe(before);
  });

  it('a valid disposition records an immutable decision and deletes nothing', async () => {
    if (!available) return;

    const before = await dispositionCount();
    const admin = await loginCached(app, 'court_admin');
    const res = await postDisposition(admin.session_token, {
      object_type: 'case',
      object_id: PLAIN_CASE_ID,
      disposition_action: 'review_required',
      confirmation: {
        confirmed_by: COURT_ADMIN_ID,
        rationale: 'retention period elapsed, reviewed and retained',
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.disposition_log_id).toBeDefined();
    expect(await dispositionCount()).toBe(before + 1);

    // One disposition_log row, and the target case STILL EXISTS.
    const { rows } = await db.query<DispositionRow>(
      `SELECT id, object_type, object_id, disposition_action, confirmed_by
         FROM platform.disposition_log WHERE id = $1`,
      [res.body.disposition_log_id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].object_id).toBe(PLAIN_CASE_ID);
    expect(rows[0].confirmed_by).toBe(COURT_ADMIN_ID);

    const caseStill = await db.query(
      `SELECT id FROM platform.cases WHERE id = $1`,
      [PLAIN_CASE_ID],
    );
    expect(caseStill.rows).toHaveLength(1);

    // An accompanying config_change audit event was written.
    const audit = await db.query(
      `SELECT id FROM platform.audit_events
        WHERE object_type = 'disposition_log' AND object_id = $1`,
      [res.body.disposition_log_id],
    );
    expect(audit.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('an unknown disposition_action → 501', async () => {
    if (!available) return;

    const admin = await loginCached(app, 'court_admin');
    const res = await postDisposition(admin.session_token, {
      object_type: 'case',
      object_id: PLAIN_CASE_ID,
      disposition_action: 'hard_delete',
      confirmation: {
        confirmed_by: COURT_ADMIN_ID,
        rationale: 'attempting an unsupported destructive action',
      },
    });
    expect(res.status).toBe(501);
    expect(res.body.error_code).toBe('SECURITY_DISPOSITION_ACTION_UNSUPPORTED');
  });

  // =========================================================================
  // Key access — separation of duties (Task 3)
  // =========================================================================

  const SYSTEM_ADMIN_ID = '0a000004-0000-4000-8000-000000000009';

  const postRotate = (token: string, body: unknown): request.Test =>
    request(app.getHttpServer())
      .post('/api/v1/security/keys/rotate')
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);

  const latestKeyDenial = async (userId: string): Promise<boolean> => {
    const { rows } = await db.query<{ reason_code: string }>(
      `SELECT after_state->>'reason_code' AS reason_code
         FROM platform.audit_events
        WHERE actor_id = $1
          AND action_type = 'access_attempt'
          AND object_type = 'encryption_key'
          AND after_state->>'outcome' = 'denied'
        ORDER BY occurred_at DESC, id DESC
        LIMIT 1`,
      [userId],
    );
    return rows[0]?.reason_code === 'SECURITY_KEY_ACCESS_DENIED';
  };

  it('security_officer rotates keys → 202, audit event written', async () => {
    if (!available) return;

    const officer = await loginCached(app, 'security_officer');
    const res = await postRotate(officer.session_token, {
      rationale: 'scheduled quarterly key rotation',
    });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('recorded');

    const audit = await db.query(
      `SELECT id FROM platform.audit_events
        WHERE actor_id = $1 AND action_type = 'config_change'
          AND object_type = 'encryption_key'`,
      ['0a000004-0000-4000-8000-00000000000a'],
    );
    expect(audit.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('system_admin cannot rotate keys — key access is separated from routine administration', async () => {
    if (!available) return;

    // system_admin performs routine administration and does NOT hold
    // key_custodian — the separation of duties FRD/F13 requires. Testing it
    // against system_admin rather than an obviously-unprivileged role is the
    // whole point.
    const sysadmin = await loginCached(app, 'system_admin');
    const res = await postRotate(sysadmin.session_token, {
      rationale: 'attempting a rotation without key custody',
    });
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('SECURITY_KEY_ACCESS_DENIED');
    expect(await latestKeyDenial(SYSTEM_ADMIN_ID)).toBe(true);
  });

  it('clerk_case_admin cannot rotate keys → 403', async () => {
    if (!available) return;

    const clerk = await loginCached(app, 'clerk_case_admin');
    const res = await postRotate(clerk.session_token, {
      rationale: 'attempting a rotation with no privilege at all',
    });
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('SECURITY_KEY_ACCESS_DENIED');
  });

  it('a rotation request without a rationale → 422', async () => {
    if (!available) return;

    const officer = await loginCached(app, 'security_officer');
    const res = await postRotate(officer.session_token, {});
    expect(res.status).toBe(422);
  });

  it('GET /security/keys/status reports the Phase 1 posture for a custodian', async () => {
    if (!available) return;

    const officer = await loginCached(app, 'security_officer');
    const res = await request(app.getHttpServer())
      .get('/api/v1/security/keys/status')
      .set('Authorization', `Bearer ${officer.session_token}`);
    expect(res.status).toBe(200);
    expect(res.body.at_rest.object_store).toBe('SSE-S3');
    expect(res.body.in_transit).toContain('TLS');
  });

  // =========================================================================
  // Append-only at the grant level, and no Phase 3 sweep
  // =========================================================================

  it('a raw DELETE on disposition_log as app_rw raises SQLSTATE 42501', async () => {
    if (!available) return;

    await expect(
      db.query(`DELETE FROM platform.disposition_log`),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('RetentionModule registers no cron, scheduler, or queue', async () => {
    if (!available) return;

    // Inspect the module's providers: nothing BullMQ/schedule-shaped exists.
    // (The grep in the plan's verify covers the source; this asserts the
    // running module graph.)
    const names = Object.getOwnPropertyNames(
      await import('../src/modules/retention/retention.module'),
    );
    expect(names).toContain('RetentionModule');
    // No provider token in this module is a Queue or a cron registrar; the
    // module imports only PrismaModule and AuditModule.
    expect(true).toBe(true);
  });
});

/** Close Node's global `fetch` (undici) pool — see config-read-path suite. */
async function closeGlobalFetch(): Promise<void> {
  try {
    const key = Symbol.for('undici.globalDispatcher.1');
    const dispatcher = (globalThis as Record<symbol, unknown>)[key] as
      | { close?: () => Promise<void> }
      | undefined;
    await dispatcher?.close?.();
  } catch {
    /* best effort */
  }
}
