import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

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
 * SECURITY-DESIGNATION CHANGES — Phase 1 success criterion 4
 * ============================================================================
 *
 * `PATCH /cases/{id}/security-designations` requires `case_security_admin`,
 * audits every change with before/after state, and a designation it applies
 * takes effect immediately on the caller's own access.
 *
 * Seeded fixtures (prisma/seed):
 *  - `clerk_case_admin` holds `case_security_admin` and a COURT scope on NDCA,
 *    but NOT `designation_sealed`.
 *  - `courtroom_deputy` holds `case_read` and a COURT scope on NDCA, but NOT
 *    `case_security_admin` — the "may view but not alter" fixture.
 *
 * Two logins only (clerk + deputy); each is a real password + TOTP sign-in.
 */

jest.setTimeout(300_000);

const COURTS = { NDCA: '0a000001-0000-4000-8000-000000000001' } as const;
const DIVISIONS = { ndcaSanFrancisco: '0a000002-0000-4000-8000-000000000001' } as const;
const USERS = {
  clerk_case_admin: '0a000004-0000-4000-8000-000000000004',
  courtroom_deputy: '0a000004-0000-4000-8000-000000000003',
  system_admin: '0a000004-0000-4000-8000-000000000009',
} as const;

const unique = (): string => `desig-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe('designations-api: security designation changes (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  let adminDb: Client;
  let available = false;
  let clerkToken: string;
  let deputyToken: string;

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;

    ({ app, restoreEnv } = await bootApp());

    const provider = app.get(OidcProvider);
    for (let i = 0; i < 60 && !provider.isReady(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    adminDb = new Client({ connectionString: testAdminDatabaseUrl() });
    await adminDb.connect();

    ({ session_token: clerkToken } = await loginAs(app, 'clerk_case_admin'));
    ({ session_token: deputyToken } = await loginAs(app, 'courtroom_deputy'));
  });

  afterAll(async () => {
    await adminDb?.end();
    await db?.end();
    await app?.close();
    restoreEnv?.();
  });

  const post = (path: string, token: string, body: unknown): request.Test =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);

  const get = (path: string, token: string): request.Test =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  const patch = (path: string, token: string, body: unknown): request.Test =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);

  /** Create an unsealed NDCA case owned by the clerk. */
  const freshCase = async (): Promise<string> => {
    const res = await post('/api/v1/cases', clerkToken, {
      case_number: unique(),
      court_id: COURTS.NDCA,
      division_id: DIVISIONS.ndcaSanFrancisco,
      case_caption: 'United States v. Designation Test',
      case_type: 'criminal',
      party: [{ name: 'Designation Defendant', role: 'defendant' }],
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  const designationAuditCount = async (caseId: string): Promise<number> => {
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM platform.audit_events
        WHERE object_type = 'case' AND object_id = $1 AND action_type = 'designation_change'`,
      [caseId],
    );
    return Number(rows[0]?.n ?? 0);
  };

  const latestDenied = async (userId: string): Promise<{ after_state: Record<string, unknown> } | undefined> => {
    const { rows } = await db.query<{ after_state: Record<string, unknown> }>(
      `SELECT after_state FROM platform.audit_events
        WHERE actor_id = $1 AND action_type = 'access_attempt'
          AND after_state->>'outcome' = 'denied'
        ORDER BY occurred_at DESC, id DESC LIMIT 1`,
      [userId],
    );
    return rows[0];
  };

  /**
   * Grant an entitlement to a user, append-only.
   *
   * `app_rw` holds INSERT on `entitlement_grants`; `request_id` is nullable, so
   * a test grant needs no `access_grant_requests` row. `granted_by` is a seeded
   * administrator. The caller must invalidate the principal cache afterwards
   * (`revokeAllForUser`) and re-login, per plan 01-06's pairing rule.
   */
  const grantEntitlement = async (userId: string, key: string): Promise<void> => {
    await db.query(
      `INSERT INTO platform.entitlement_grants
         (user_id, entitlement_key, scope_type, scope_value, granted_by)
       VALUES ($1, $2, 'court', $3, $4)`,
      [userId, key, COURTS.NDCA, USERS.system_admin],
    );
  };

  /** Revoke it again — column-scoped UPDATE (revoked_at, revoked_by), the only one app_rw may do. */
  const revokeEntitlement = async (userId: string, key: string): Promise<void> => {
    await db.query(
      `UPDATE platform.entitlement_grants
          SET revoked_at = now(), revoked_by = $3
        WHERE user_id = $1 AND entitlement_key = $2 AND revoked_at IS NULL`,
      [userId, key, USERS.system_admin],
    );
  };

  it('clerk_case_admin adds restricted to an unsealed case → 200 + designation_change audit', async () => {
    if (!available) return;

    const caseId = await freshCase();
    const before = await designationAuditCount(caseId);

    const res = await patch(
      `/api/v1/cases/${caseId}/security-designations`,
      clerkToken,
      { designations: ['restricted'] },
    );
    expect(res.status).toBe(200);
    expect((res.body.designations as Array<{ designation: string }>).map((d) => d.designation)).toContain(
      'restricted',
    );

    // The row exists and is active.
    const rows = await db.query(
      `SELECT designation FROM platform.security_designations
        WHERE object_type='case' AND object_id=$1 AND revoked_at IS NULL`,
      [caseId],
    );
    expect(rows.rows.map((r: { designation: string }) => r.designation)).toContain('restricted');

    // One designation_change event with before [] / after ['restricted'].
    expect(await designationAuditCount(caseId)).toBe(before + 1);
    const ev = await db.query<{ before_state: Record<string, unknown>; after_state: Record<string, unknown> }>(
      `SELECT before_state, after_state FROM platform.audit_events
        WHERE object_type='case' AND object_id=$1 AND action_type='designation_change'
        ORDER BY occurred_at DESC, id DESC LIMIT 1`,
      [caseId],
    );
    expect(ev.rows[0].before_state).toMatchObject({ designations: [] });
    expect((ev.rows[0].after_state as { designations: string[] }).designations).toContain('restricted');
  });

  it('courtroom_deputy (no case_security_admin) → 403 CASE_DESIGNATION_DENIED, no row, audited', async () => {
    if (!available) return;

    const caseId = await freshCase();

    const res = await patch(
      `/api/v1/cases/${caseId}/security-designations`,
      deputyToken,
      { designations: ['restricted'] },
    );
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('CASE_DESIGNATION_DENIED');

    // No designation row was written.
    const rows = await db.query(
      `SELECT 1 FROM platform.security_designations
        WHERE object_type='case' AND object_id=$1 AND revoked_at IS NULL`,
      [caseId],
    );
    expect(rows.rows.length).toBe(0);

    // The denial itself is audited as an access_attempt.
    const denied = await latestDenied(USERS.courtroom_deputy);
    expect(denied?.after_state).toMatchObject({ outcome: 'denied' });
  });

  it('applying sealed immediately excludes the clerk who lacks designation_sealed → 403 on GET', async () => {
    if (!available) return;

    const caseId = await freshCase();

    // The clerk can read it before sealing.
    expect((await get(`/api/v1/cases/${caseId}`, clerkToken)).status).toBe(200);

    // Seal it (clerk holds case_security_admin).
    const sealed = await patch(
      `/api/v1/cases/${caseId}/security-designations`,
      clerkToken,
      { designations: ['sealed'] },
    );
    expect(sealed.status).toBe(200);

    // Now the designation the clerk just applied excludes them: they retain
    // parent-case access (court scope), so per FRD/Y2 principle 3 it is a 403,
    // not a 404.
    const after = await get(`/api/v1/cases/${caseId}`, clerkToken);
    expect(after.status).toBe(403);
    expect(after.body.error_code).toBe('AUTH_DESIGNATION_DENIED');
  });

  it('removing a designation sets revoked_at rather than deleting the row', async () => {
    if (!available) return;

    const caseId = await freshCase();

    // Apply restricted (clerk holds case_security_admin; the case is unsealed).
    const applied = await patch(
      `/api/v1/cases/${caseId}/security-designations`,
      clerkToken,
      { designations: ['restricted'] },
    );
    expect(applied.status).toBe(200);

    // LIFTING a restriction is an action ON a restricted record — the resource
    // loader resolves the target with its current designations, so the PDP now
    // additionally requires `designation_restricted`. The clerk holds
    // case_security_admin but not that designation entitlement, so grant it
    // in-test (the correct security property, proven by the 403 without it).
    const { SessionService } = await import('../src/modules/identity/session.service');
    await grantEntitlement(USERS.clerk_case_admin, 'designation_restricted');
    await app.get(SessionService).revokeAllForUser(USERS.clerk_case_admin);
    const fresh = await loginAs(app, 'clerk_case_admin');

    let removed;
    try {
      removed = await patch(
        `/api/v1/cases/${caseId}/security-designations`,
        fresh.session_token,
        { designations: [] },
      );
    } finally {
      await revokeEntitlement(USERS.clerk_case_admin, 'designation_restricted');
      await app.get(SessionService).revokeAllForUser(USERS.clerk_case_admin);
      // The revoke above killed every clerk session, including the shared
      // clerkToken. Re-mint it so later tests still have a live session.
      ({ session_token: clerkToken } = await loginAs(app, 'clerk_case_admin'));
    }
    expect(removed.status).toBe(200);
    expect(removed.body.designations).toEqual([]);

    // The row is still there — revoked, not deleted.
    const rows = await db.query<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM platform.security_designations
        WHERE object_type='case' AND object_id=$1 AND designation='restricted'`,
      [caseId],
    );
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].revoked_at).not.toBeNull();

    // The removal was audited too.
    const ev = await db.query<{ after_state: Record<string, unknown> }>(
      `SELECT after_state FROM platform.audit_events
        WHERE object_type='case' AND object_id=$1 AND action_type='designation_change'
        ORDER BY occurred_at DESC, id DESC LIMIT 1`,
      [caseId],
    );
    expect(ev.rows[0].after_state).toMatchObject({ change: 'revoked', changed: 'restricted' });
  });

  it('an unknown designation value → 422', async () => {
    if (!available) return;

    const caseId = await freshCase();
    const res = await patch(
      `/api/v1/cases/${caseId}/security-designations`,
      clerkToken,
      { designations: ['not_a_real_designation'] },
    );
    expect(res.status).toBe(422);
  });
});
