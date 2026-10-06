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
  type LoggedIn,
  type SeedUsername,
} from './auth-harness';

/**
 * Log in, tolerating the shared-IdP TOTP one-time-use contention.
 *
 * These suites share one Keycloak with the auth and policy suites, and a TOTP
 * code already spent in the current 30-second window is rejected with
 * `invalid_grant` / a re-rendered OTP form. The harness retries once inside a
 * single login; this adds a second, window-spaced retry at the suite level so a
 * code spent by a sibling run just before `beforeAll` does not fail the whole
 * suite. It is purely about the test harness's credential presentation — the
 * system under test is unaffected either way.
 */
async function loginResilient(
  app: INestApplication,
  username: SeedUsername,
): Promise<LoggedIn> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await loginAs(app, username);
    } catch (error) {
      if (attempt === 2) throw error;
      // Wait out the current TOTP window plus margin, then try a fresh code.
      await new Promise((resolve) => setTimeout(resolve, 31_000));
    }
  }
  // Unreachable — the loop either returns or throws on the last attempt.
  throw new Error('loginResilient exhausted its retries');
}

/**
 * ============================================================================
 * SEPARATION OF DUTIES, PROVEN AT EVERY LAYER (e2e)
 * ============================================================================
 *
 * The control CONTEXT places above all others in this plan: a privileged grant
 * requires two distinct people, and **the API refuses** a self-approval rather
 * than merely recording it. "'the audit trail will catch it' is explicitly not
 * sufficient — the API must refuse."
 *
 * So this suite does not stop at the HTTP 403. It asserts the three independent
 * layers that enforce SoD each refuse a self-approval on their own:
 *
 *   - the API/service layer (cases 2, 3),
 *   - the Rego policy, called directly via `POST /security/policy-evaluate`
 *     (case 4), and
 *   - the database CHECK constraint, written as raw SQL by `app_rw` (case 5).
 *
 * Everything runs against the real Compose stack — real Keycloak logins with
 * real TOTP, the real OPA container deciding, the real `access_grant_requests`
 * table. Nothing is mocked, for the same reason plans 01-06 and 01-07 mock
 * nothing: a mocked PDP would be a second copy of the policy agreeing with the
 * guard by construction.
 *
 * ## The pairing the tests need
 *
 * Both `system_admin` and `security_officer` are seeded holding `access_admin`,
 * so either can request and either can approve — which is exactly the two-person
 * pairing SoD requires. `court_admin` (NDCA) is the grant *subject*: it does not
 * hold `audit_reader`, so a successful grant is observable as a new entitlement
 * it did not have before.
 */

jest.setTimeout(300_000);

/** Seeded ids, from `prisma/seed/ids.ts`. */
const USERS = {
  system_admin: '0a000004-0000-4000-8000-000000000009',
  security_officer: '0a000004-0000-4000-8000-00000000000a',
  court_admin: '0a000004-0000-4000-8000-000000000007',
  clerk_case_admin: '0a000004-0000-4000-8000-000000000004',
} as const;

/**
 * The court the access administrators operate in.
 *
 * Both seeded `access_admin` holders — `system_admin` and `security_officer` —
 * are scoped to SDNY, and `AbacGuard` evaluates the approver's scope against the
 * request's `court_id`. So every request this suite opens names SDNY as its
 * court: that is the court the two-person workflow actually takes place in. The
 * grant's *subject* (`court_admin`, an NDCA user) is just the recipient — a
 * grant's subject and the court its approval is authorized in are independent,
 * which is the realistic shape (an access admin in one court grading access that
 * lands on a user elsewhere). Leaving `court_id` unset made the resource loader
 * fall back to the subject's court (NDCA), which neither SDNY approver is scoped
 * to — a correct `AUTH_SCOPE_DENIED` that had nothing to do with SoD.
 */
const SDNY_COURT_ID = '0a000001-0000-4000-8000-000000000002';

/** The service token this suite configures, for the direct PDP call (case 4). */
const SERVICE_TOKEN = 'grants-sod-suite-token';

const api = (app: INestApplication) => request(app.getHttpServer());

interface GrantRow {
  id: string;
  granted_by: string;
  request_id: string | null;
  revoked_at: Date | null;
}

describe('grants-sod: separation of duties at every layer (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  /**
   * Administrative connection. `app_rw` holds no DELETE on
   * `access_grant_requests` / `entitlement_grants` (plan 01-03's append-only
   * posture), so the rows this suite creates can only be cleaned up as
   * `app_dba`. Case 5 also uses it to confirm the table CHECK fires for a raw
   * self-approval `UPDATE`.
   */
  let adminDb: Client;
  let available = false;

  /**
   * The two access administrators are signed in ONCE and their tokens reused
   * across the whole suite.
   *
   * This is not merely tidiness. Each `loginAs` is a real password + TOTP
   * browser flow, and Keycloak enforces one-time use of a TOTP code — so
   * logging the same user in repeatedly forces 30-second window waits that,
   * multiplied across ten tests, push the suite past its timeout. The
   * requester and approver sessions are never revoked by this workflow (a grant
   * revokes the *subject's* sessions, not the admins'), so one login each holds
   * for the suite. Only `court_admin` — the grant subject — must re-login after
   * an approval or revocation, because those deliberately revoke its sessions.
   */
  let requesterToken: string;
  let approverToken: string;

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;

    ({ app, restoreEnv } = await bootApp({
      INTERNAL_SERVICE_TOKEN: SERVICE_TOKEN,
    }));

    const provider = app.get(OidcProvider);
    for (let i = 0; i < 60 && !provider.isReady(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    adminDb = new Client({ connectionString: testAdminDatabaseUrl() });
    await adminDb.connect();

    requesterToken = (await loginResilient(app, 'system_admin')).session_token;
    approverToken = (await loginResilient(app, 'security_officer')).session_token;
  });

  /**
   * Delete every row this suite created, as `app_dba`.
   *
   * Run after EACH test, not just at the end. Several tests create a live
   * `audit_reader` grant on `court_admin`; left in place, the next test's
   * identical request is correctly refused `409 GRANT_DUPLICATE` by the
   * duplicate check — a real behaviour of the system, but one that would make
   * the tests order-dependent. Resetting to the seeded baseline between tests
   * keeps each case independent. `app_rw` holds no DELETE on these append-only
   * tables (plan 01-03), so cleanup runs on the administrative connection.
   */
  const cleanupSuiteRows = async (): Promise<void> => {
    await adminDb.query(
      `DELETE FROM platform.entitlement_grants
        WHERE request_id IN (
          SELECT id FROM platform.access_grant_requests
           WHERE justification LIKE 'SOD-SUITE:%')`,
    );
    await adminDb.query(
      `DELETE FROM platform.access_grant_requests
        WHERE justification LIKE 'SOD-SUITE:%'`,
    );
  };

  afterEach(async () => {
    if (available) await cleanupSuiteRows();
  });

  afterAll(async () => {
    if (available) await cleanupSuiteRows();
    await adminDb?.end();
    await db?.end();
    await app?.close();
    restoreEnv?.();
  });

  /**
   * Open an entitlement grant request, as `requester`.
   *
   * Defaults to `audit_reader` on `court_admin`, always naming SDNY as the
   * court the approval is authorized in (the court the seeded access admins are
   * scoped to). Pass an options object to vary the subject, entitlement or
   * justification — the revocation test needs an SDNY subject so the revoker is
   * in scope for the resulting grant.
   */
  const openRequest = async (
    token: string,
    options:
      | string
      | {
          subjectUserId?: string;
          entitlementKey?: string;
          justification?: string;
        } = {},
  ): Promise<string> => {
    const opts = typeof options === 'string' ? { justification: options } : options;
    const res = await api(app)
      .post('/api/v1/entitlements/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        grant_type: 'entitlement',
        subject_user_id: opts.subjectUserId ?? USERS.court_admin,
        entitlement_key: opts.entitlementKey ?? 'audit_reader',
        court_id: SDNY_COURT_ID,
        justification:
          opts.justification ??
          'SOD-SUITE: court_admin needs audit_reader for review duties',
      });
    expect(res.status).toBe(201);
    return (res.body as { request: { id: string } }).request.id;
  };

  const grantsForRequest = async (requestId: string): Promise<GrantRow[]> => {
    const { rows } = await db.query<GrantRow>(
      `SELECT id, granted_by, request_id, revoked_at
         FROM platform.entitlement_grants
        WHERE request_id = $1`,
      [requestId],
    );
    return rows;
  };

  // =========================================================================
  // 1. HAPPY PATH — two distinct people
  // =========================================================================

  it('two distinct people: system_admin requests, security_officer approves → 200', async () => {
    if (!available) return;

    const requestId = await openRequest(requesterToken);

    const approve = await api(app)
      .post(`/api/v1/entitlements/requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({});
    expect(approve.status).toBe(200);

    // A non-revoked grant exists, granted BY the approver, carrying request_id.
    const grants = await grantsForRequest(requestId);
    expect(grants).toHaveLength(1);
    expect(grants[0].granted_by).toBe(USERS.security_officer);
    expect(grants[0].request_id).toBe(requestId);
    expect(grants[0].revoked_at).toBeNull();

    // Two audit events — the request and the approval — and the approval names
    // BOTH the requester and the approver (US-0.3).
    const { rows: audits } = await db.query<{
      after_state: Record<string, unknown>;
    }>(
      `SELECT after_state
         FROM platform.audit_events
        WHERE object_type = 'access_grant_request' AND object_id = $1
        ORDER BY occurred_at ASC, id ASC`,
      [requestId],
    );
    expect(audits.length).toBeGreaterThanOrEqual(2);
    const events = audits.map((a) => a.after_state.event);
    expect(events).toContain('grant_requested');
    expect(events).toContain('grant_approved');
    const approval = audits.find(
      (a) => a.after_state.event === 'grant_approved',
    );
    expect(approval?.after_state.requester).toBe(USERS.system_admin);
    expect(approval?.after_state.approver).toBe(USERS.security_officer);
  });

  // =========================================================================
  // 2. SELF-APPROVAL REFUSED — the headline control
  // =========================================================================

  it('the API refuses self-approval — not merely audits it', async () => {
    if (!available) return;

    // Same token requests AND approves — the requester is the approver.
    const requestId = await openRequest(requesterToken);

    const approve = await api(app)
      .post(`/api/v1/entitlements/requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({});

    expect(approve.status).toBe(403);
    expect(approve.body).toMatchObject({ error_code: 'AUTH_SOD_VIOLATION' });

    // "The API refuses" means NOTHING HAPPENED. Assert the absence of the grant
    // row, not merely the status code — the whole point of the control is that
    // no access was materialized, not that an error was also returned.
    const grants = await grantsForRequest(requestId);
    expect(grants).toHaveLength(0);

    // And the request is still pending, not quietly flipped to approved.
    const { rows } = await db.query<{ status: string }>(
      `SELECT status FROM platform.access_grant_requests WHERE id = $1`,
      [requestId],
    );
    expect(rows[0].status).toBe('pending');
  });

  // =========================================================================
  // 3. SELF-DENIAL REFUSED — the deny route is SoD-bound exactly as approve is
  // =========================================================================

  it('a requester cannot deny their own request → 403 AUTH_SOD_VIOLATION', async () => {
    if (!available) return;

    const requestId = await openRequest(requesterToken);

    const deny = await api(app)
      .post(`/api/v1/entitlements/requests/${requestId}/deny`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({ rationale: 'SOD-SUITE: withdrawing my own request' });

    expect(deny.status).toBe(403);
    expect(deny.body).toMatchObject({ error_code: 'AUTH_SOD_VIOLATION' });

    const { rows } = await db.query<{ status: string }>(
      `SELECT status FROM platform.access_grant_requests WHERE id = $1`,
      [requestId],
    );
    expect(rows[0].status).toBe('pending');
  });

  // =========================================================================
  // 4. THE POLICY LAYER REFUSES INDEPENDENTLY — proving the Rego rule is live
  // =========================================================================

  it('the Rego sod_deny rule independently returns AUTH_SOD_VIOLATION', async () => {
    if (!available) return;

    const requestId = await openRequest(requesterToken);

    // Ask the PDP directly, with the REQUESTER as the subject and the request
    // as the resource. This exercises the policy, not the TypeScript check.
    const evaluation = await api(app)
      .post('/api/v1/security/policy-evaluate')
      .set('x-service-token', SERVICE_TOKEN)
      .set('x-service-actor-id', USERS.system_admin)
      .send({
        object_type: 'access_grant_request',
        object_id: requestId,
        action: 'approve',
        requester_scope: [],
      });

    expect(evaluation.status).toBe(200);
    expect(evaluation.body).toMatchObject({
      decision: 'deny',
      reason_code: 'AUTH_SOD_VIOLATION',
    });
  });

  // =========================================================================
  // 5. THE DATABASE LAYER REFUSES INDEPENDENTLY — the layer that outlives code
  // =========================================================================

  it('the table CHECK rejects a raw self-approval UPDATE by app_rw', async () => {
    if (!available) return;

    const requestId = await openRequest(requesterToken);

    // As app_rw — the role the running application uses — attempt to approve the
    // request with decided_by = requested_by. This is the path that holds even
    // if application code is replaced: PostgreSQL itself refuses it.
    await expect(
      db.query(
        `UPDATE platform.access_grant_requests
            SET status = 'approved',
                decided_by = requested_by,
                decided_at = now()
          WHERE id = $1`,
        [requestId],
      ),
    ).rejects.toThrow(/check constraint|23514/i);

    const { rows } = await db.query<{ status: string }>(
      `SELECT status FROM platform.access_grant_requests WHERE id = $1`,
      [requestId],
    );
    expect(rows[0].status).toBe('pending');
  });

  // =========================================================================
  // 6. EFFECT OF APPROVAL — sessions revoked, entitlement appears after re-auth
  // =========================================================================

  it('approval revokes the subject sessions and the new entitlement appears only after re-auth', async () => {
    if (!available) return;

    // The subject logs in FIRST and confirms it does not yet hold audit_reader.
    const subjectBefore = await loginResilient(app, 'court_admin');
    expect(subjectBefore.entitlements.entitlements).not.toContain(
      'audit_reader',
    );

    const before = await api(app)
      .get('/api/v1/auth/entitlements')
      .set('Authorization', `Bearer ${subjectBefore.session_token}`);
    expect(before.status).toBe(200);

    // Two distinct admins request and approve (shared suite tokens).
    const requestId = await openRequest(requesterToken);
    const approve = await api(app)
      .post(`/api/v1/entitlements/requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({});
    expect(approve.status).toBe(200);

    // The subject's previously valid token is now rejected — approval revoked
    // their sessions (FRD/F00 Process step 7).
    const afterRevoke = await api(app)
      .get('/api/v1/auth/entitlements')
      .set('Authorization', `Bearer ${subjectBefore.session_token}`);
    expect(afterRevoke.status).toBe(401);
    expect(afterRevoke.body).toMatchObject({
      error_code: 'AUTH_SESSION_EXPIRED',
    });

    // After re-authenticating, the entitlement is present.
    const subjectAfter = await loginResilient(app, 'court_admin');
    expect(subjectAfter.entitlements.entitlements).toContain('audit_reader');
  });

  // =========================================================================
  // 7. REVOCATION — single-step by design, removes access, keeps the record
  // =========================================================================

  it('revocation removes the entitlement, revokes sessions, and keeps the row', async () => {
    if (!available) return;

    // Revocation is SINGLE-STEP by design: removing access is not the dangerous
    // direction, so a second approver is not a safety requirement. That
    // asymmetry with approval is deliberate — SoD does not fire on revoke.
    //
    // The SUBJECT here is `security_officer`, not `court_admin`, and the choice
    // is forced by the court-scope boundary rather than cosmetic: the revoke
    // route resolves the grant's court from the SUBJECT's court (the
    // `entitlement_grant` loader uses `courtOfUser(grant.user_id)`), and the
    // revoker must be scoped to that court. Both seeded `access_admin` holders
    // are SDNY, so revoking a grant on the NDCA `court_admin` would be a correct
    // `AUTH_SCOPE_DENIED` — an access admin may only revoke within their own
    // court. `security_officer` is an SDNY subject that does not hold
    // `retention_viewer`, so the grant is observable and the revoker (SDNY
    // `system_admin`) is in scope.
    const requestId = await openRequest(requesterToken, {
      subjectUserId: USERS.security_officer,
      entitlementKey: 'retention_viewer',
      justification: 'SOD-SUITE: grant to be revoked',
    });
    await api(app)
      .post(`/api/v1/entitlements/requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({})
      .expect(200);

    const grants = await grantsForRequest(requestId);
    const grantId = grants[0].id;

    // The subject's sessions were revoked by the approval; after re-auth it
    // holds the entitlement. (This re-login replaces the now-dead approverToken,
    // which is not used again after this test.)
    const subjectAfter = await loginResilient(app, 'security_officer');
    expect(subjectAfter.entitlements.entitlements).toContain('retention_viewer');

    const revoke = await api(app)
      .post(`/api/v1/entitlements/grants/${grantId}/revoke`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({ rationale: 'SOD-SUITE: review complete, access no longer needed' });
    expect(revoke.status).toBe(200);

    // After revocation the subject's sessions are revoked again, and on re-auth
    // the entitlement is gone.
    const afterRevoke = await loginResilient(app, 'security_officer');
    expect(afterRevoke.entitlements.entitlements).not.toContain(
      'retention_viewer',
    );

    // The grant row still EXISTS, with revoked_at set — the historical fact
    // that access was once held is part of the record.
    const after = await grantsForRequest(requestId);
    expect(after).toHaveLength(1);
    expect(after[0].revoked_at).not.toBeNull();
  });

  // =========================================================================
  // 8. LEAST PRIVILEGE — a user without access_admin is refused every route
  // =========================================================================

  it('clerk_case_admin (no access_admin) is refused the grant routes → 403', async () => {
    if (!available) return;

    const clerk = await loginResilient(app, 'clerk_case_admin');

    const create = await api(app)
      .post('/api/v1/entitlements/requests')
      .set('Authorization', `Bearer ${clerk.session_token}`)
      .send({
        grant_type: 'entitlement',
        subject_user_id: USERS.court_admin,
        entitlement_key: 'audit_reader',
        justification: 'SOD-SUITE: clerk attempting a grant',
      });
    expect(create.status).toBe(403);

    const list = await api(app)
      .get('/api/v1/entitlements/requests')
      .set('Authorization', `Bearer ${clerk.session_token}`);
    expect(list.status).toBe(403);
  });

  // =========================================================================
  // 9. UNKNOWN ENTITLEMENT — 422, and no row created
  // =========================================================================

  it('a request for an entitlement not in the catalog → 422 GRANT_UNKNOWN_ENTITLEMENT', async () => {
    if (!available) return;

    const res = await api(app)
      .post('/api/v1/entitlements/requests')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({
        grant_type: 'entitlement',
        subject_user_id: USERS.court_admin,
        entitlement_key: 'not_a_real_entitlement',
        court_id: SDNY_COURT_ID,
        justification: 'SOD-SUITE: this entitlement does not exist',
      });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      error_code: 'GRANT_UNKNOWN_ENTITLEMENT',
    });

    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM platform.access_grant_requests
        WHERE entitlement_key = 'not_a_real_entitlement'`,
    );
    expect(rows[0].count).toBe('0');
  });

  // =========================================================================
  // 10. PENDING LIST SHAPE — consumable by Phase 3's Work Queue unchanged
  // =========================================================================

  it('GET /entitlements/requests?status=pending carries object_reference and priority', async () => {
    if (!available) return;

    // A distinct entitlement (`key_custodian`, which `court_admin` does not hold
    // and no other case grants) so this pending request cannot collide with a
    // live grant left by another test — the list shape is all this case needs.
    await openRequest(requesterToken, {
      entitlementKey: 'key_custodian',
      justification: 'SOD-SUITE: a pending request for the list shape',
    });

    const list = await api(app)
      .get('/api/v1/entitlements/requests?status=pending')
      .set('Authorization', `Bearer ${requesterToken}`);
    expect(list.status).toBe(200);

    const requests = (list.body as { requests: Array<Record<string, unknown>> })
      .requests;
    expect(requests.length).toBeGreaterThan(0);
    for (const entry of requests) {
      expect(entry.object_reference).toMatchObject({
        object_type: 'access_grant_request',
        object_id: entry.id,
      });
      expect(entry).toHaveProperty('priority');
    }
  });
});
