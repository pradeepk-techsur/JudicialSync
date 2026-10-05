import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import { SessionService } from '../src/modules/identity/session.service';
import {
  bootApp,
  loginAs,
  requireStack,
  testAdminDatabaseUrl,
  testDatabaseUrl,
} from './auth-harness';
import {
  AbacProbeModule,
  CASE_IDS,
  COURT_IDS,
} from './abac-probe.controller';

/**
 * ============================================================================
 * THE ABAC GUARD, AGAINST A REAL OPA CONTAINER AND REAL SESSIONS
 * ============================================================================
 *
 * Phase 1 success criterion 1 — "an unauthorized resource request is denied
 * server-side (403), not merely hidden in the UI" — and criterion 4 — "the
 * denied attempt itself is logged as an audit event" — are both claims about
 * what happens over HTTP. So this suite makes real sign-ins against the real
 * Keycloak (password + TOTP), issues real requests, and reads the real
 * `audit_events` table afterwards.
 *
 * Nothing here is mocked. The PDP is the actual OPA container evaluating the
 * actual Rego bundle, and the resource attributes come from the actual seeded
 * rows. A mocked PDP would be a second implementation of the policy, agreeing
 * with the guard by construction and proving nothing about the bundle that
 * ships.
 *
 * ## Why there is a probe controller
 *
 * Plans 01-08 through 01-12 add the real routes. None exists yet, so this
 * suite registers its own small controller (`abac-probe.controller.ts`)
 * carrying `@Resource()` descriptors — plus, deliberately, one route with NO
 * descriptor at all, which is the only way to exercise the
 * forgot-the-decorator path. That route cannot live in application code,
 * because application code with a missing descriptor is the bug.
 *
 * ## A fixture divergence this suite works around, and pins
 *
 * The seed's own comment says the sealed case is "visible to [judge] and
 * denied to [clerk]". It is not: 01-04 gives `judge` a `case` scope row on the
 * PLAIN case only, and under 01-02's narrowing-scope semantics a single
 * case-scope row confines the principal to exactly the cases named — so the
 * judge is denied the sealed case on SCOPE, before designation is considered.
 *
 * Both halves are correct in isolation; they were never checked against each
 * other. Logged as DEF-01 in `deferred-items.md` with the one-row seed fix,
 * which belongs to plan 01-04's file and is recommended to 01-14.
 *
 * This suite asserts BOTH states — the unscoped judge's 403 AND, after adding
 * the missing scope row, the 200 — so the workaround cannot quietly become a
 * way of not noticing if the narrowing semantics ever change.
 */

jest.setTimeout(300_000);

/** Seeded ids, from `prisma/seed/ids.ts`. */
const USERS = {
  judge: '0a000004-0000-4000-8000-000000000001',
  clerk_case_admin: '0a000004-0000-4000-8000-000000000004',
  jury_admin: '0a000004-0000-4000-8000-000000000006',
  security_officer: '0a000004-0000-4000-8000-00000000000a',
} as const;

/** A well-formed UUID that is deliberately not any row in the database. */
const NONEXISTENT_CASE = '0a000005-0000-4000-8000-0000000000ff';

interface AuditRow {
  action_type: string;
  object_type: string;
  object_id: string;
  after_state: Record<string, unknown>;
  client_ip: string | null;
  session_id: string | null;
  rule_version_ref: string | null;
}

describe('abac-guard: OPA decides, the guard enforces (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  /**
   * Administrative connection. `app_rw` holds no DELETE on
   * `scope_assignments` (plan 01-03's no-hard-delete posture), so the
   * temporary scope row this suite adds for the judge can only be cleaned up
   * as `app_dba`. Discovered the honest way: `permission denied for table
   * scope_assignments`, which is the grant posture working correctly.
   */
  let adminDb: Client;
  let available = false;

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;

    ({ app, restoreEnv } = await bootApp({}, [AbacProbeModule]));

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
    await app?.close();
    restoreEnv?.();
  });

  /**
   * The most recent **authorization-denial** `access_attempt` for a user.
   *
   * The `outcome = 'denied'` filter is load-bearing, not tidying.
   * `action_type = 'access_attempt'` is shared with plan 01-06's
   * `AuthService`, which writes `login_success`, `logout`,
   * `refresh_rotated` and friends under the same type — and every test here
   * signs in first, so the newest row for a user is reliably that login
   * rather than the denial under test.
   *
   * Without the filter this helper silently asserted against a
   * `login_success` row. Found by running it: the failure read
   * `Expected reason_code: "RESOURCE_NOT_FOUND", Received: {"outcome":
   * "login_success"}`.
   */
  const latestAccessAttempt = async (
    userId: string,
  ): Promise<AuditRow | undefined> => {
    const { rows } = await db.query<AuditRow>(
      `SELECT action_type, object_type, object_id, after_state,
              client_ip, session_id, rule_version_ref
         FROM platform.audit_events
        WHERE actor_id = $1
          AND action_type = 'access_attempt'
          AND after_state->>'outcome' = 'denied'
        ORDER BY occurred_at DESC, id DESC
        LIMIT 1`,
      [userId],
    );
    return rows[0];
  };

  const get = async (
    path: string,
    token: string,
  ): Promise<request.Response> =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  /**
   * Add a case scope to a user and make it take effect immediately.
   *
   * **The cache invalidation is the whole subtlety here**, and plan 01-06
   * documented it before this test rediscovered it:
   * `EntitlementResolverService` caches the resolved principal — roles,
   * scopes AND entitlements — under `principal:{userId}` for
   * `claim_cache_seconds` (seeded at 300). So a scope row written directly to
   * the database is invisible for up to five minutes, and signing in again
   * does NOT help: a new session resolves from the same per-user cache.
   *
   * That is exactly the "revoke without invalidate" half of the pairing rule
   * in `entitlement-resolver.service.ts`, which calls it "the worse of the
   * two because it looks like it worked". It looked like a policy bug here
   * too: the scope row was present, the entitlement was held, and the request
   * was still denied `AUTH_SCOPE_DENIED` — with the stale principal the guard
   * was handed being entirely correct about a state five minutes old.
   *
   * `revokeAllForUser` invalidates the cache as part of its contract, so one
   * call covers both halves. The login must come AFTER it.
   */
  const grantCaseScope = async (
    userId: string,
    caseId: string,
  ): Promise<void> => {
    await db.query(
      `INSERT INTO platform.scope_assignments (user_id, scope_type, scope_value)
       VALUES ($1, 'case', $2)`,
      [userId, caseId],
    );
    await app.get(SessionService).revokeAllForUser(userId);
  };

  /**
   * Remove it again.
   *
   * `app_rw` holds no DELETE on `scope_assignments` — plan 01-03's
   * no-hard-delete posture — so this runs as `app_dba`. Attempting it as
   * `app_rw` raises `permission denied for table scope_assignments`, which is
   * the grant posture working rather than an obstacle to route around.
   */
  const revokeCaseScope = async (
    userId: string,
    caseId: string,
  ): Promise<void> => {
    await adminDb.query(
      `DELETE FROM platform.scope_assignments
        WHERE user_id = $1 AND scope_type = 'case' AND scope_value = $2`,
      [userId, caseId],
    );
    await app.get(SessionService).revokeAllForUser(userId);
  };

  // =========================================================================
  // ALLOW
  // =========================================================================

  describe('an in-scope, entitled request reaches the handler', () => {
    it('clerk_case_admin (NDCA) reads an NDCA case → 200', async () => {
      if (!available) return;

      const { session_token } = await loginAs(app, 'clerk_case_admin');
      const response = await get(
        `/api/v1/abac-probe/cases/${CASE_IDS.plain}`,
        session_token,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ reached: true });
    });
  });

  // =========================================================================
  // CROSS-COURT ISOLATION — Phase 1 success criterion 1
  // =========================================================================

  describe('cross-court isolation', () => {
    it('clerk_case_admin (NDCA) reading an SDNY case → 403 AUTH_SCOPE_DENIED', async () => {
      if (!available) return;

      const { session_token } = await loginAs(app, 'clerk_case_admin');
      const response = await get(
        `/api/v1/abac-probe/cases/${CASE_IDS.otherCourt}`,
        session_token,
      );

      // 403, not 404: the clerk holds `case_read` and is legitimately a user
      // of the system, so the denial is a scope denial rather than
      // existence-hiding. The case is not sealed; nothing about it is secret.
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error_code: 'AUTH_SCOPE_DENIED',
        message: 'You do not have access to this record',
      });
      expect(response.body).not.toHaveProperty('reached');
    });

    it('writes an access_attempt audit row carrying the reason and route', async () => {
      if (!available) return;

      const { session_token } = await loginAs(app, 'clerk_case_admin');
      await get(
        `/api/v1/abac-probe/cases/${CASE_IDS.otherCourt}`,
        session_token,
      );

      const row = await latestAccessAttempt(USERS.clerk_case_admin);
      expect(row).toBeDefined();
      expect(row?.object_type).toBe('case');
      expect(row?.object_id).toBe(CASE_IDS.otherCourt);
      expect(row?.after_state).toMatchObject({
        outcome: 'denied',
        reason_code: 'AUTH_SCOPE_DENIED',
        hide_existence: false,
        method: 'GET',
      });
      expect(String(row?.after_state.route)).toContain('/abac-probe/cases');
      expect(row?.session_id).not.toBeNull();
      // FRD/F02: every entry links to the rule-package version in effect at
      // action time.
      expect(row?.rule_version_ref).not.toBeNull();
    });
  });

  // =========================================================================
  // ROLE EXISTENCE NEVER IMPLIES ACCESS
  // =========================================================================

  describe('a role with zero entitlements', () => {
    it('jury_admin reading a case in their OWN court → 403', async () => {
      if (!available) return;

      // `jury_admin` is seeded holding a legitimate role, a court scope, and
      // nothing else. It is in scope for this case and still denied, which is
      // the whole point of the fixture: the entitlement is what authorizes,
      // and no role supplies one.
      const { session_token } = await loginAs(app, 'jury_admin');
      const response = await get(
        `/api/v1/abac-probe/cases/${CASE_IDS.plain}`,
        session_token,
      );

      expect(response.status).toBe(403);
      expect(response.body.error_code).toBe('AUTH_SCOPE_DENIED');
    });

    it('and the attempt is audited against that user', async () => {
      if (!available) return;

      const { session_token } = await loginAs(app, 'jury_admin');
      await get(`/api/v1/abac-probe/cases/${CASE_IDS.plain}`, session_token);

      const row = await latestAccessAttempt(USERS.jury_admin);
      expect(row?.after_state).toMatchObject({
        outcome: 'denied',
        reason_code: 'AUTH_SCOPE_DENIED',
      });
    });
  });

  // =========================================================================
  // DESIGNATIONS — the 403-vs-404 decision (FRD/Y2 principle 3)
  // =========================================================================

  describe('a sealed record', () => {
    it('denies clerk_case_admin 403 AUTH_DESIGNATION_DENIED — parent access is known', async () => {
      if (!available) return;

      // The clerk holds `case_read` and a COURT scope, so under the narrowing
      // semantics they legitimately reach every case in NDCA — including
      // knowing this one exists. They lack only `designation_sealed`. That is
      // exactly Y2 principle 3's 403 case: the existence is already known, so
      // 403 leaks nothing and is the more actionable answer.
      const { session_token } = await loginAs(app, 'clerk_case_admin');
      const response = await get(
        `/api/v1/abac-probe/cases/${CASE_IDS.sealed}`,
        session_token,
      );

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error_code: 'AUTH_DESIGNATION_DENIED',
        message: 'This record requires additional authorization',
      });
    });

    it('denies a requester from another court with 404 — blind discovery', async () => {
      if (!available) return;

      // `security_officer` is seeded into SDNY. They have no legitimate path
      // to learn an NDCA sealed case exists, so a 403 would itself be the
      // leak. The response must be indistinguishable from "no such id".
      const { session_token } = await loginAs(app, 'security_officer');
      const response = await get(
        `/api/v1/abac-probe/cases/${CASE_IDS.sealed}`,
        session_token,
      );

      expect(response.status).toBe(404);
      expect(response.body.error_code).toBe('CASE_NOT_FOUND');
    });

    /**
     * The decisive test in this file.
     *
     * `TechArch/04-security.md` §7.6 requires that an existence-hidden denial
     * be indistinguishable from a genuine not-found. Asserting each status
     * separately would not prove that — two 404s can differ in body, and a
     * difference is all an attacker needs. So the two responses are compared
     * to each other, byte for byte.
     */
    it('returns a byte-identical body to a genuinely nonexistent id', async () => {
      if (!available) return;

      const { session_token } = await loginAs(app, 'security_officer');

      const hidden = await get(
        `/api/v1/abac-probe/cases/${CASE_IDS.sealed}`,
        session_token,
      );
      const absent = await get(
        `/api/v1/abac-probe/cases/${NONEXISTENT_CASE}`,
        session_token,
      );

      expect(hidden.status).toBe(absent.status);
      expect(JSON.stringify(hidden.body)).toBe(JSON.stringify(absent.body));
    });

    it('audits the hidden attempt with hide_existence true', async () => {
      if (!available) return;

      const { session_token } = await loginAs(app, 'security_officer');
      await get(`/api/v1/abac-probe/cases/${CASE_IDS.sealed}`, session_token);

      // The 404 path must audit as surely as the 403 path. An attempt hidden
      // behind a not-found is exactly the attempt an investigation wants.
      const row = await latestAccessAttempt(USERS.security_officer);
      expect(row?.after_state).toMatchObject({
        outcome: 'denied',
        hide_existence: true,
        reason_code: 'RESOURCE_NOT_FOUND',
      });
    });

    /**
     * The positive half of Phase 1 success criterion 4.
     *
     * See the file header and DEF-01: the seeded judge carries a case-scope
     * row for the PLAIN case only, which narrows them to that one case and
     * denies the sealed case on scope before designation is reached. The
     * missing row is added here and removed afterwards.
     *
     * Both states are asserted, so this is a workaround that still pins the
     * behaviour rather than hiding it.
     */
    it('allows a judge who holds designation_sealed AND is in scope → 200', async () => {
      if (!available) return;

      const { session_token } = await loginAs(app, 'judge');

      // Before: denied on SCOPE, not on designation. This assertion is what
      // keeps the narrowing semantics honest.
      const before = await get(
        `/api/v1/abac-probe/cases/${CASE_IDS.sealed}`,
        session_token,
      );
      expect(before.status).toBe(403);
      expect(before.body.error_code).toBe('AUTH_SCOPE_DENIED');

      await grantCaseScope(USERS.judge, CASE_IDS.sealed);

      try {
        // A fresh sign-in, because `grantCaseScope` revokes this user's
        // sessions to clear the principal cache — and revocation takes effect
        // on the NEXT request (TechArch §7.1), so the token above is now
        // deliberately dead. Signing in again is the honest way to pick up
        // the new scope, and it exercises the pairing rule rather than
        // sidestepping it.
        const fresh = await loginAs(app, 'judge');
        const after = await get(
          `/api/v1/abac-probe/cases/${CASE_IDS.sealed}`,
          fresh.session_token,
        );

        // Now in scope AND holding `designation_sealed` → the sealed record
        // opens. Nothing but the scope row changed.
        expect(after.status).toBe(200);
        expect(after.body).toMatchObject({ reached: true });
      } finally {
        await revokeCaseScope(USERS.judge, CASE_IDS.sealed);
      }
    });
  });

  // =========================================================================
  // THE FORGOT-THE-DECORATOR CASE — threat T-01-26
  // =========================================================================

  describe('a route with no @Resource() descriptor', () => {
    it('is denied 503 SECURITY_POLICY_UNAVAILABLE, never allowed', async () => {
      if (!available) return;

      // An authenticated, broadly-entitled caller. The denial is not about
      // who they are — it is that nobody declared what this route touches, so
      // there is genuinely no decision available.
      const { session_token } = await loginAs(app, 'clerk_case_admin');
      const response = await get(
        '/api/v1/abac-probe/undeclared',
        session_token,
      );

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        error_code: 'SECURITY_POLICY_UNAVAILABLE',
        message: 'Access cannot be evaluated at this time; request denied',
      });
      expect(response.body).not.toHaveProperty('reached');
    });
  });

  // =========================================================================
  // THE EXEMPTIONS STILL WORK
  // =========================================================================

  describe('exempt routes', () => {
    it('@SelfScoped() reaches the handler without a resource', async () => {
      if (!available) return;

      const { session_token } = await loginAs(app, 'jury_admin');
      const response = await get(
        '/api/v1/abac-probe/self-scoped',
        session_token,
      );

      // `jury_admin` holds zero entitlements and is still allowed here —
      // correct, because the endpoint's only subject is the caller.
      expect(response.status).toBe(200);
    });

    it('@SelfScoped() still requires a session', async () => {
      if (!available) return;

      const response = await request(app.getHttpServer()).get(
        '/api/v1/abac-probe/self-scoped',
      );

      // SelfScoped exempts ABAC, never authentication.
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // DESIGNATION POLICY IS CONFIGURATION-DRIVEN (FRD/F13)
  // =========================================================================

  describe('security_policies drive the designation mapping', () => {
    /**
     * Proves the mapping genuinely comes from the database rather than from
     * the Rego defaults, by CHANGING it and observing the outcome change.
     *
     * Asserting against the default mapping would pass identically whether
     * the rows were being read or ignored, which is what makes the
     * mutate-and-observe shape worth the setup cost.
     */
    it('remapping sealed to an entitlement nobody holds denies a previously-allowed read', async () => {
      if (!available) return;

      const ndca = COURT_IDS.NDCA;
      const { rows } = await adminDb.query<{ id: string }>(
        `SELECT sp.id
           FROM platform.security_policies sp
           JOIN platform.rule_package_versions rpv
             ON rpv.id = sp.rule_package_version_id
          WHERE rpv.court_id = $1 AND sp.designation = 'sealed'`,
        [ndca],
      );
      expect(rows.length).toBeGreaterThan(0);

      // Give the judge the scope they need, so the only variable under test
      // is the designation mapping (see DEF-01). The helper invalidates the
      // principal cache, so the login below sees the new scope.
      await grantCaseScope(USERS.judge, CASE_IDS.sealed);

      try {
        const baseline = await loginAs(app, 'judge');
        expect(
          (
            await get(
              `/api/v1/abac-probe/cases/${CASE_IDS.sealed}`,
              baseline.session_token,
            )
          ).status,
        ).toBe(200);

        // Configuration tables are SELECT-only for `app_rw`: the running
        // application reads configuration and must not author it.
        await adminDb.query(
          `UPDATE platform.security_policies
              SET required_entitlement = 'designation_nobody_holds_this'
            WHERE id = $1`,
          [rows[0].id],
        );

        const after = await get(
          `/api/v1/abac-probe/cases/${CASE_IDS.sealed}`,
          baseline.session_token,
        );

        // Same user, same session, same record — only the configuration row
        // changed, and the sealed case closed.
        expect(after.status).toBe(403);
        expect(after.body.error_code).toBe('AUTH_DESIGNATION_DENIED');
      } finally {
        await adminDb.query(
          `UPDATE platform.security_policies
              SET required_entitlement = 'designation_sealed'
            WHERE id = $1`,
          [rows[0].id],
        );
        await revokeCaseScope(USERS.judge, CASE_IDS.sealed);
      }
    });
  });
});
