import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

import { BootstrapService } from '../src/modules/entitlements/bootstrap.service';
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
 * THE CONSTRAINED, SELF-CLOSING BOOTSTRAP (e2e)
 * ============================================================================
 *
 * Bootstrap is the one hole CONTEXT permits in the two-person rule — an empty
 * system has no second person — so every constraint it places on that hole is
 * exercised here against the real stack:
 *
 *   - identities come ONLY from `BOOTSTRAP_ADMIN_SUBJECTS` /
 *     `BOOTSTRAP_APPROVER_SUBJECTS`, never from the first authenticated user
 *     (cases 1, 4);
 *   - the two lists must be disjoint or the application fails to start (case 3);
 *   - bootstrap supplies the second person rather than bypassing SoD —
 *     `decided_by` is drawn from the approver list and differs from
 *     `requested_by` (case 1);
 *   - startup is idempotent (case 2);
 *   - the path closes permanently via an explicit completion step that a
 *     bootstrap-granted principal cannot invoke (cases 5, 6);
 *   - SoD still holds for every grant made after completion (case 7);
 *   - every bootstrap action is audited with `after_state.bootstrap === true`
 *     (case 8).
 *
 * Bootstrap runs in `BootstrapService.onModuleInit`, so each case boots an app
 * instance with the env it wants to test. `bootstrap_state` is a shared
 * singleton row, so the suite resets it (and deletes the synthetic bootstrap
 * users it creates) after every test to leave the stack as it found it.
 */

jest.setTimeout(300_000);

/** Synthetic IdP subjects for bootstrap — distinct from any seeded user. */
const ADMIN_A = 'bootstrap-test:admin-a';
const ADMIN_B = 'bootstrap-test:admin-b';
const APPROVER = 'bootstrap-test:approver';

const api = (app: INestApplication) => request(app.getHttpServer());

/** Seeded SDNY access-admin ids, from `prisma/seed/ids.ts`. */
const USERS = {
  system_admin: '0a000004-0000-4000-8000-000000000009',
  security_officer: '0a000004-0000-4000-8000-00000000000a',
  court_admin: '0a000004-0000-4000-8000-000000000007',
} as const;

const SDNY_COURT_ID = '0a000001-0000-4000-8000-000000000002';

describe('bootstrap: environment-sourced, non-self-approving, self-closing (e2e)', () => {
  let db: Client;
  let adminDb: Client;
  let available = false;

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    adminDb = new Client({ connectionString: testAdminDatabaseUrl() });
    await adminDb.connect();
  });

  afterAll(async () => {
    await adminDb?.end();
    await db?.end();
  });

  /**
   * Reset the shared singleton and remove the grants/requests a test created.
   *
   * `bootstrap_state` is reopened via `app_rw` (which holds UPDATE on it). The
   * synthetic grants and requests are deleted as `app_dba`, because `app_rw`
   * holds no DELETE on those append-only tables.
   *
   * The synthetic `users` rows are deliberately **left in place**: their
   * bootstrap grants produced `audit_events` whose `actor_id` references them,
   * `audit_events` is append-only (no DELETE grant by design), so the user rows
   * cannot be removed without violating that FK — nor should they be, since the
   * audit trail is the point. Leaving a handful of inert IdP-subject rows is
   * harmless, and `ensureUser` upserts them on the next run.
   */
  const resetBootstrapState = async (): Promise<void> => {
    await db.query(
      `UPDATE platform.bootstrap_state
          SET completed_at = NULL, completed_by = NULL
        WHERE id = true`,
    );
    await adminDb.query(
      `DELETE FROM platform.entitlement_grants
        WHERE user_id IN (
          SELECT id FROM platform.users
           WHERE external_idp_subject LIKE 'bootstrap-test:%')
           OR request_id IN (
          SELECT id FROM platform.access_grant_requests
           WHERE justification LIKE 'BOOTSTRAP-SUITE:%')`,
    );
    await adminDb.query(
      `DELETE FROM platform.access_grant_requests
        WHERE subject_user_id IN (
          SELECT id FROM platform.users
           WHERE external_idp_subject LIKE 'bootstrap-test:%')
           OR justification LIKE 'BOOTSTRAP-SUITE:%'`,
    );
  };

  afterEach(async () => {
    if (available) await resetBootstrapState();
  });

  /** Boot an app with the given bootstrap env, waiting for the IdP to be ready. */
  const boot = async (
    env: Record<string, string | undefined>,
  ): Promise<{ app: INestApplication; restoreEnv: () => void }> => {
    const booted = await bootApp(env);
    const provider = booted.app.get(OidcProvider);
    for (let i = 0; i < 60 && !provider.isReady(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return booted;
  };

  const activeBootstrapGrant = async (
    subject: string,
  ): Promise<{
    is_bootstrap: boolean;
    requested_by: string;
    decided_by: string | null;
    granted_by: string;
  } | null> => {
    const { rows } = await db.query<{
      is_bootstrap: boolean;
      requested_by: string;
      decided_by: string | null;
      granted_by: string;
    }>(
      `SELECT eg.is_bootstrap, agr.requested_by, agr.decided_by, eg.granted_by
         FROM platform.entitlement_grants eg
         JOIN platform.users u ON u.id = eg.user_id
         JOIN platform.access_grant_requests agr ON agr.id = eg.request_id
        WHERE u.external_idp_subject = $1
          AND eg.entitlement_key = 'access_admin'
          AND eg.revoked_at IS NULL`,
      [subject],
    );
    return rows[0] ?? null;
  };

  // =========================================================================
  // 1. STARTUP CREATES BOOTSTRAP GRANTS, NON-SELF-APPROVED
  // =========================================================================

  it('startup grants access_admin to each admin subject, is_bootstrap with a distinct approver', async () => {
    if (!available) return;

    const { app, restoreEnv } = await boot({
      BOOTSTRAP_ADMIN_SUBJECTS: `${ADMIN_A},${ADMIN_B}`,
      BOOTSTRAP_APPROVER_SUBJECTS: APPROVER,
    });
    try {
      for (const subject of [ADMIN_A, ADMIN_B]) {
        const grant = await activeBootstrapGrant(subject);
        expect(grant).not.toBeNull();
        expect(grant?.is_bootstrap).toBe(true);
        // decided_by is the approver and NOT the requester — SoD holds.
        expect(grant?.decided_by).not.toBeNull();
        expect(grant?.decided_by).not.toBe(grant?.requested_by);
      }
    } finally {
      await app.close();
      restoreEnv();
    }
  });

  // =========================================================================
  // 2. IDEMPOTENT — running twice creates no duplicate grants
  // =========================================================================

  it('running the startup bootstrap twice creates no duplicate grants', async () => {
    if (!available) return;

    const env = {
      BOOTSTRAP_ADMIN_SUBJECTS: ADMIN_A,
      BOOTSTRAP_APPROVER_SUBJECTS: APPROVER,
    };

    const first = await boot(env);
    await first.app.close();
    first.restoreEnv();

    const second = await boot(env);
    await second.app.close();
    second.restoreEnv();

    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM platform.entitlement_grants eg
         JOIN platform.users u ON u.id = eg.user_id
        WHERE u.external_idp_subject = $1
          AND eg.entitlement_key = 'access_admin'`,
      [ADMIN_A],
    );
    expect(rows[0].count).toBe('1');
  });

  // =========================================================================
  // 3. INTERSECTING LISTS FAIL STARTUP
  // =========================================================================

  it('intersecting admin and approver lists fail application startup', async () => {
    if (!available) return;

    await expect(
      boot({
        BOOTSTRAP_ADMIN_SUBJECTS: `${ADMIN_A},${APPROVER}`,
        BOOTSTRAP_APPROVER_SUBJECTS: APPROVER,
      }),
    ).rejects.toThrow(/disjoint/i);
  });

  // =========================================================================
  // 4. EMPTY LISTS PROMOTE NOBODY — not even the first authenticated user
  // =========================================================================

  it('with both lists empty, no bootstrap grant exists and no user is promoted', async () => {
    if (!available) return;

    const { app, restoreEnv } = await boot({
      BOOTSTRAP_ADMIN_SUBJECTS: '',
      BOOTSTRAP_APPROVER_SUBJECTS: '',
    });
    try {
      // No bootstrap grants were created for any synthetic subject. (We count
      // active access_admin GRANTS, not user rows — prior tests may have left
      // inert synthetic user rows behind, since their audit events pin them.)
      const { rows } = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM platform.entitlement_grants eg
           JOIN platform.users u ON u.id = eg.user_id
          WHERE u.external_idp_subject LIKE 'bootstrap-test:%'
            AND eg.entitlement_key = 'access_admin'
            AND eg.revoked_at IS NULL`,
      );
      expect(rows[0].count).toBe('0');

      // And — the heart of the constraint — a brand-new authenticated user is
      // NOT promoted. `law_clerk` is seeded holding exactly one entitlement
      // (`case_read`) and no admin authority; authenticating does not change
      // that, which proves authority is never derived from signing in.
      const fresh = await loginAs(app, 'law_clerk');
      expect(fresh.entitlements.entitlements).not.toContain('access_admin');
      expect(fresh.entitlements.entitlements).toEqual(['case_read']);
    } finally {
      await app.close();
      restoreEnv();
    }
  });

  // =========================================================================
  // 5 & 6. COMPLETION — only a normal admin may close it; then it stays closed
  // =========================================================================

  it('complete is refused for a bootstrap-granted principal and closes the path for a normal one', async () => {
    if (!available) return;

    // First, mint a NORMALLY-granted access_admin: the seeded admins all hold
    // access_admin with is_bootstrap=true, so none of them may close the path.
    // court_admin receives access_admin through the normal two-person flow
    // (is_bootstrap=false), and is the principal that completes the bootstrap.
    const { app, restoreEnv } = await boot({
      BOOTSTRAP_ADMIN_SUBJECTS: ADMIN_A,
      BOOTSTRAP_APPROVER_SUBJECTS: APPROVER,
    });
    try {
      const requester = await loginAs(app, 'system_admin');
      const approver = await loginAs(app, 'security_officer');

      const reqRes = await api(app)
        .post('/api/v1/entitlements/requests')
        .set('Authorization', `Bearer ${requester.session_token}`)
        .send({
          grant_type: 'entitlement',
          subject_user_id: USERS.court_admin,
          entitlement_key: 'access_admin',
          court_id: SDNY_COURT_ID,
          justification: 'BOOTSTRAP-SUITE: a normally-granted access_admin',
        });
      expect(reqRes.status).toBe(201);
      const requestId = (reqRes.body as { request: { id: string } }).request.id;

      await api(app)
        .post(`/api/v1/entitlements/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${approver.session_token}`)
        .send({})
        .expect(200);

      // A bootstrap-granted principal (system_admin's access_admin is seeded
      // is_bootstrap=true) cannot complete — otherwise the bootstrap closes
      // itself with the authority it created.
      const selfClose = await api(app)
        .post('/api/v1/bootstrap/complete')
        .set('Authorization', `Bearer ${requester.session_token}`)
        .send({});
      expect(selfClose.status).toBe(403);

      // The normally-granted admin (court_admin) completes it. court_admin's
      // sessions were revoked by the approval, so re-authenticate first.
      const normalAdmin = await loginAs(app, 'court_admin');
      const complete = await api(app)
        .post('/api/v1/bootstrap/complete')
        .set('Authorization', `Bearer ${normalAdmin.session_token}`)
        .send({});
      expect(complete.status).toBe(200);
      expect(complete.body).toMatchObject({ completed: true });

      // Status now reports completed.
      const status = await api(app)
        .get('/api/v1/bootstrap/status')
        .set('Authorization', `Bearer ${normalAdmin.session_token}`);
      expect(status.status).toBe(200);
      expect(status.body).toMatchObject({ completed: true });

      // The service refuses further operations with BOOTSTRAP_CLOSED, and a
      // restart grants nothing new.
      const service = app.get(BootstrapService);
      expect(await service.isClosed()).toBe(true);
    } finally {
      await app.close();
      restoreEnv();
    }

    // 6. After completion, re-running startup grants nothing.
    const restart = await boot({
      BOOTSTRAP_ADMIN_SUBJECTS: ADMIN_B,
      BOOTSTRAP_APPROVER_SUBJECTS: APPROVER,
    });
    try {
      const grant = await activeBootstrapGrant(ADMIN_B);
      expect(grant).toBeNull();
    } finally {
      await restart.app.close();
      restart.restoreEnv();
    }
  });

  // =========================================================================
  // 7. SoD STILL HOLDS AFTER COMPLETION
  // =========================================================================

  it('after completion, a normal self-approval is still refused 403 AUTH_SOD_VIOLATION', async () => {
    if (!available) return;

    // Close the bootstrap first (directly on the singleton — this case is about
    // the POST-completion grant path, not the completion ceremony itself).
    await db.query(
      `UPDATE platform.bootstrap_state
          SET completed_at = now(), completed_by = $1
        WHERE id = true`,
      [USERS.security_officer],
    );

    const { app, restoreEnv } = await boot({
      BOOTSTRAP_ADMIN_SUBJECTS: '',
      BOOTSTRAP_APPROVER_SUBJECTS: '',
    });
    try {
      const admin = await loginAs(app, 'system_admin');
      const reqRes = await api(app)
        .post('/api/v1/entitlements/requests')
        .set('Authorization', `Bearer ${admin.session_token}`)
        .send({
          grant_type: 'entitlement',
          subject_user_id: USERS.court_admin,
          entitlement_key: 'retention_viewer',
          court_id: SDNY_COURT_ID,
          justification: 'BOOTSTRAP-SUITE: self-approval must still be refused',
        });
      expect(reqRes.status).toBe(201);
      const requestId = (reqRes.body as { request: { id: string } }).request.id;

      // The requester attempts to approve their OWN request — still refused,
      // post-completion, exactly as before: "The bootstrap path must not bypass
      // SoD for any subsequent grant."
      const selfApprove = await api(app)
        .post(`/api/v1/entitlements/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${admin.session_token}`)
        .send({});
      expect(selfApprove.status).toBe(403);
      expect(selfApprove.body).toMatchObject({
        error_code: 'AUTH_SOD_VIOLATION',
      });
    } finally {
      await app.close();
      restoreEnv();
    }
  });

  // =========================================================================
  // 8. EVERY BOOTSTRAP ACTION IS AUDITED WITH after_state.bootstrap === true
  // =========================================================================

  it('every bootstrap grant leaves an audit event with after_state.bootstrap === true', async () => {
    if (!available) return;

    const { app, restoreEnv } = await boot({
      BOOTSTRAP_ADMIN_SUBJECTS: ADMIN_A,
      BOOTSTRAP_APPROVER_SUBJECTS: APPROVER,
    });
    try {
      const { rows } = await db.query<{ after_state: Record<string, unknown> }>(
        `SELECT ae.after_state
           FROM platform.audit_events ae
           JOIN platform.access_grant_requests agr ON agr.id = ae.object_id
           JOIN platform.users u ON u.id = agr.subject_user_id
          WHERE u.external_idp_subject = $1
            AND ae.object_type = 'access_grant_request'
          ORDER BY ae.occurred_at DESC`,
        [ADMIN_A],
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].after_state.bootstrap).toBe(true);
    } finally {
      await app.close();
      restoreEnv();
    }
  });
});
