import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

import { GrantsService } from '../src/modules/entitlements/grants.service';
import { EntitlementResolverService } from '../src/modules/identity/entitlement-resolver.service';
import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import { SessionService } from '../src/modules/identity/session.service';
import {
  bootApp,
  loginAs,
  requireStack,
  testAdminDatabaseUrl,
  testDatabaseUrl,
} from './auth-harness';

/**
 * ============================================================================
 * SEPARATION OF DUTIES, PROVEN AT EVERY LAYER THAT CLAIMS TO ENFORCE IT
 * ============================================================================
 *
 * The Phase 1 CONTEXT is unusually specific, and it rules out the easy version
 * of this control:
 *
 * > "A grant is a record with a requester and a distinct approver; the API
 * > rejects any approval where `approver == requester` with
 * > `403 AUTH_SOD_VIOLATION`. **'The audit trail will catch it' is explicitly
 * > not sufficient — the API must refuse.**"
 *
 * "Refuses" is a claim about what did NOT happen, so the central test here
 * (case 2) asserts the **absence of the grant row**, not merely the status
 * code. A system that returned 403 and wrote the grant anyway would pass a
 * status-code assertion while being precisely the system CONTEXT forbids.
 *
 * ## Three layers, exercised separately and on purpose
 *
 * `TechArch/04-security.md` §7.2 requires SoD be "enforced as a policy rule …
 * not an application-layer `if` statement that a future refactor could drop",
 * and the implementation answers that with defence in depth. Each layer is
 * therefore tested **through its own door**, because a test that only drives
 * the HTTP path cannot tell three working layers from one working layer and
 * two that have quietly rotted:
 *
 *   | case | layer | door |
 *   |---|---|---|
 *   | 2, 3 | the stack as a user meets it | `POST …/approve`, `POST …/deny` |
 *   | 3b | the service check alone | `GrantsService.approve()` out of the DI container, no guard |
 *   | 4 | the Rego bundle alone | `POST /security/policy-evaluate` (service token) |
 *   | 5 | the table CHECK alone | raw SQL as `app_rw` |
 *
 * Case 3b is the one that is easy to leave out and expensive to be without.
 * Cases 2 and 3 go over HTTP, where `AbacGuard` evaluates `sod.rego` *before*
 * the handler runs — so the service-layer check is never reached on that path
 * and those cases would pass unchanged if it had been deleted. Without 3b the
 * "three independent layers" claim is two layers and a comment.
 *
 * Nothing here is mocked. The PDP is the OPA container evaluating the bundle
 * that ships, the database is the migrated PostgreSQL with its real grants,
 * and every session comes from a real password + TOTP sign-in against the real
 * Keycloak.
 *
 * ## A seed fixture this suite works around, and pins
 *
 * Both seeded holders of `access_admin` (`system_admin`, `security_officer`)
 * are in **SDNY**, while eight of the ten seeded users — including every
 * plausible grant subject — are in **NDCA**. Revocation resolves its court
 * from the *subject* (`resource-loader.service.ts` → `courtOfUser`), so out of
 * the box neither administrator can revoke a grant held by an NDCA user: the
 * request is refused `AUTH_SCOPE_DENIED` by the court check, which is the
 * multi-tenancy boundary working exactly as designed over a fixture that
 * cannot exercise it.
 *
 * `addCourtScope` below adds the missing NDCA scope in-test, and case 8b
 * asserts the denial that occurs *without* it — so the workaround cannot
 * quietly become a way of not noticing if the court semantics ever change.
 * Logged as DEF-03 in the phase's `deferred-items.md` with the one-row seed
 * fix, which belongs to plan 01-04's file and is recommended to 01-14.
 */

jest.setTimeout(600_000);

/** Seeded ids, from `prisma/seed/ids.ts`. */
const USERS = {
  clerk_case_admin: '0a000004-0000-4000-8000-000000000004',
  court_admin: '0a000004-0000-4000-8000-000000000007',
  system_admin: '0a000004-0000-4000-8000-000000000009',
  security_officer: '0a000004-0000-4000-8000-00000000000a',
} as const;

const COURTS = {
  NDCA: '0a000001-0000-4000-8000-000000000001',
  SDNY: '0a000001-0000-4000-8000-000000000002',
} as const;

/** The service secret for the direct-PDP case. Must match the booted app's. */
const SERVICE_TOKEN = 'grants-sod-suite-token';

/**
 * The two entitlements this suite grants, neither of which `court_admin` holds
 * in the seed (`case_read`, `retention_viewer`, `disposition_confirm`).
 *
 * Kept distinct so the approved path and the refused path never collide on the
 * duplicate check — a second request for something already granted is a 409,
 * which would mask the 403 the refusal case is actually asserting.
 */
const APPROVED_KEY = 'audit_reader';
const REFUSED_KEY = 'key_custodian';

interface AuditRow {
  action_type: string;
  object_type: string;
  object_id: string;
  after_state: Record<string, unknown>;
}

/**
 * Supertest types `response.body` as `any`, which the project's eslint config
 * rightly refuses. These narrow it at the single point of use rather than
 * scattering casts through the assertions.
 */
const bodyOf = <T>(response: request.Response): T => response.body as T;

interface RequestBody {
  request: {
    id: string;
    status: string;
    requested_by: string;
    decided_by: string | null;
    object_reference: { object_type: string; object_id: string };
    priority: string;
    task_type: string;
    task_status: string;
  };
}
interface GrantBody {
  grant: {
    id: string;
    granted_by: string;
    granted_at: string;
    revoked_by: string | null;
    revoked_at: string | null;
  };
}
interface ListBody {
  requests: RequestBody['request'][];
}
interface EntitlementsBody {
  entitlements: string[];
  roles: { role_name: string }[];
}

describe('grants-sod: the API refuses self-approval at three independent layers (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  /**
   * Administrative connection (`app_dba`).
   *
   * Required for teardown only. `app_rw` holds **no DELETE grant on any table
   * in `platform`** (plan 01-03), which is the append-only posture working
   * rather than an obstacle — the rows this suite creates can only be removed
   * by the role that owns the schema.
   */
  let adminDb: Client;
  let available = false;

  /** Session tokens, established once and reused. */
  let systemAdminToken = '';
  let securityOfficerToken = '';
  let clerkToken = '';
  /** `court_admin`'s token from BEFORE the approval — case 6 needs it stale. */
  let courtAdminTokenBeforeGrant = '';

  /** Ids created as the suite runs. */
  let approvedRequestId = '';
  let approvedGrantId = '';
  let pendingRequestId = '';

  // =========================================================================
  // Fixtures
  // =========================================================================

  /** Remove everything this suite creates, so it is re-runnable. */
  const cleanup = async (): Promise<void> => {
    await adminDb.query(
      `DELETE FROM platform.entitlement_grants
        WHERE user_id = $1 AND entitlement_key = ANY($2::text[])`,
      [USERS.court_admin, [APPROVED_KEY, REFUSED_KEY]],
    );
    await adminDb.query(
      `DELETE FROM platform.access_grant_requests
        WHERE subject_user_id = $1 AND entitlement_key = ANY($2::text[])`,
      [USERS.court_admin, [APPROVED_KEY, REFUSED_KEY]],
    );
  };

  /** See the suite comment — the DEF-03 workaround. */
  const addCourtScope = async (
    userId: string,
    courtId: string,
  ): Promise<void> => {
    await db.query(
      `INSERT INTO platform.scope_assignments (user_id, scope_type, scope_value)
       VALUES ($1, 'court', $2)`,
      [userId, courtId],
    );
    // The cached principal must be dropped or the new scope is invisible for
    // up to `claim_cache_seconds` (seeded at 300) — and signing in again does
    // NOT help, because a new session resolves from the same per-user cache.
    // `revokeAllForUser` invalidates as part of its contract.
    await app.get(SessionService).revokeAllForUser(userId);
  };

  const removeCourtScope = async (
    userId: string,
    courtId: string,
  ): Promise<void> => {
    await adminDb.query(
      `DELETE FROM platform.scope_assignments
        WHERE user_id = $1 AND scope_type = 'court' AND scope_value = $2`,
      [userId, courtId],
    );
    await app.get(SessionService).revokeAllForUser(userId);
  };

  const post = (
    path: string,
    token: string,
    body: Record<string, unknown> = {},
  ): request.Test =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const get = (path: string, token: string): request.Test =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`);

  const auditEventsFor = async (objectId: string): Promise<AuditRow[]> => {
    const { rows } = await db.query<AuditRow>(
      `SELECT action_type, object_type, object_id, after_state
         FROM platform.audit_events
        WHERE object_id = $1
        ORDER BY occurred_at ASC, id ASC`,
      [objectId],
    );
    return rows;
  };

  const liveGrantsFor = async (
    userId: string,
    entitlementKey: string,
  ): Promise<{ id: string; granted_by: string; request_id: string | null }[]> => {
    const { rows } = await db.query<{
      id: string;
      granted_by: string;
      request_id: string | null;
    }>(
      `SELECT id, granted_by, request_id
         FROM platform.entitlement_grants
        WHERE user_id = $1 AND entitlement_key = $2 AND revoked_at IS NULL`,
      [userId, entitlementKey],
    );
    return rows;
  };

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

    await cleanup();

    // The without-the-scope denial (case 8b) is asserted BEFORE the scope is
    // added, since adding it is irreversible within a single login.
    clerkToken = (await loginAs(app, 'clerk_case_admin')).session_token;
    securityOfficerToken = (await loginAs(app, 'security_officer')).session_token;
  });

  afterAll(async () => {
    if (available) {
      await cleanup();
      await removeCourtScope(USERS.system_admin, COURTS.NDCA);
    }
    await adminDb?.end();
    await db?.end();
    await app?.close();
    restoreEnv?.();
  });

  // =========================================================================
  // CASE 8 — LEAST PRIVILEGE. Run first: it needs no fixture state.
  // =========================================================================

  describe('least privilege', () => {
    it('clerk_case_admin, holding no access_admin, is refused every grant route', async () => {
      if (!available) return;

      const create = await post('/api/v1/entitlements/requests', clerkToken, {
        grant_type: 'entitlement',
        subject_user_id: USERS.court_admin,
        entitlement_key: APPROVED_KEY,
        court_id: COURTS.NDCA,
        justification: 'Attempting a grant without the administering entitlement.',
      });
      expect(create.status).toBe(403);
      expect(create.body.error_code).toBe('AUTH_SCOPE_DENIED');

      const list = await get('/api/v1/entitlements/requests', clerkToken);
      expect(list.status).toBe(403);

      const catalog = await get('/api/v1/entitlements/catalog', clerkToken);
      // Knowing WHICH entitlements exist is privileged reconnaissance: the
      // catalog names `designation_grand_jury`, and learning that entitlement
      // exists is learning this system holds grand-jury material.
      expect(catalog.status).toBe(403);
    });

    it('and the clerk never reaches a handler — no request row was written', async () => {
      if (!available) return;

      const { rows } = await db.query(
        `SELECT id FROM platform.access_grant_requests WHERE requested_by = $1`,
        [USERS.clerk_case_admin],
      );
      expect(rows).toHaveLength(0);
    });
  });

  // =========================================================================
  // CASE 8b — the court boundary, BEFORE the DEF-03 workaround is applied.
  // =========================================================================

  describe('the court boundary on revocation (DEF-03)', () => {
    it('an SDNY administrator cannot administer an NDCA user, before the scope is added', async () => {
      if (!available) return;

      const token = (await loginAs(app, 'system_admin')).session_token;

      // A request whose administrative court is NDCA — a court this
      // SDNY-scoped administrator is not affiliated to.
      const response = await post('/api/v1/entitlements/requests', token, {
        grant_type: 'entitlement',
        subject_user_id: USERS.court_admin,
        entitlement_key: APPROVED_KEY,
        court_id: COURTS.NDCA,
        justification: 'Cross-court administration attempt, expected to be refused.',
      });

      expect(response.status).toBe(403);
      expect(response.body.error_code).toBe('AUTH_SCOPE_DENIED');

      // Now add the missing scope. Everything after this point runs with an
      // administrator who is legitimately affiliated to both courts.
      await addCourtScope(USERS.system_admin, COURTS.NDCA);
      systemAdminToken = (await loginAs(app, 'system_admin')).session_token;
    });
  });

  // =========================================================================
  // CASE 1 — THE HAPPY PATH: two people, one grant.
  // =========================================================================

  describe('a grant made by two distinct people', () => {
    it('records the request as pending, creating no grant', async () => {
      if (!available) return;

      // `court_admin` signs in BEFORE the grant exists, so case 6 can show
      // both that the entitlement was absent and that this very token stops
      // working the moment the grant lands.
      const before = await loginAs(app, 'court_admin');
      courtAdminTokenBeforeGrant = before.session_token;

      const entitlementsBefore = await get(
        '/api/v1/auth/entitlements',
        courtAdminTokenBeforeGrant,
      );
      expect(entitlementsBefore.status).toBe(200);
      expect(entitlementsBefore.body.entitlements).not.toContain(APPROVED_KEY);

      const response = await post(
        '/api/v1/entitlements/requests',
        systemAdminToken,
        {
          grant_type: 'entitlement',
          subject_user_id: USERS.court_admin,
          entitlement_key: APPROVED_KEY,
          // The ADMINISTRATIVE court — where the request is made and decided,
          // not what the grant confers. SDNY, so the SDNY-scoped approver can
          // act on it.
          court_id: COURTS.SDNY,
          justification:
            'Court administrator requires audit explorer access for quarterly review.',
        },
      );

      expect(response.status).toBe(201);
      expect(response.body.request).toMatchObject({
        status: 'pending',
        requested_by: USERS.system_admin,
        subject_user_id: USERS.court_admin,
        entitlement_key: APPROVED_KEY,
        decided_by: null,
      });

      approvedRequestId = bodyOf<RequestBody>(response).request.id;

      // Nothing has been granted yet. Step one creates a record of an ASK.
      expect(await liveGrantsFor(USERS.court_admin, APPROVED_KEY)).toHaveLength(0);
    });

    it('is approved by a DIFFERENT person, materializing a grant that names its grantor', async () => {
      if (!available) return;

      const response = await post(
        `/api/v1/entitlements/requests/${approvedRequestId}/approve`,
        securityOfficerToken,
      );

      expect(response.status).toBe(200);
      expect(response.body.grant).toMatchObject({
        user_id: USERS.court_admin,
        entitlement_key: APPROVED_KEY,
        granted_by: USERS.security_officer,
        request_id: approvedRequestId,
        revoked_at: null,
      });
      expect(bodyOf<GrantBody>(response).grant.granted_at).toEqual(
        expect.any(String),
      );

      approvedGrantId = bodyOf<GrantBody>(response).grant.id;

      const live = await liveGrantsFor(USERS.court_admin, APPROVED_KEY);
      expect(live).toHaveLength(1);
      expect(live[0].granted_by).toBe(USERS.security_officer);
      expect(live[0].request_id).toBe(approvedRequestId);
    });

    it('leaves two audit events, and the approval names BOTH the requester and the approver', async () => {
      if (!available) return;

      const events = await auditEventsFor(approvedRequestId);

      // `US-0.3`: "All role-grant creation and approval actions are captured
      // as audit events, including both the requester and approver
      // identities."
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        action_type: 'approval',
        object_type: 'access_grant_requests',
      });
      expect(events[0].after_state).toMatchObject({
        event: 'grant_requested',
        requested_by: USERS.system_admin,
      });

      expect(events[1].after_state).toMatchObject({
        event: 'grant_approved',
        // Both identities, distinctly. An approval event naming only the
        // approver would make the maker/checker pair unreconstructable from
        // the audit trail — which is the record this control exists to make.
        requested_by: USERS.system_admin,
        approved_by: USERS.security_officer,
        subject_user_id: USERS.court_admin,
      });
      expect(events[1].after_state.requested_by).not.toBe(
        events[1].after_state.approved_by,
      );
    });
  });

  // =========================================================================
  // CASE 2 — THE CONTROL.
  // =========================================================================

  describe('self-approval', () => {
    it('records a second request, by system_admin, for a different entitlement', async () => {
      if (!available) return;

      const response = await post(
        '/api/v1/entitlements/requests',
        systemAdminToken,
        {
          grant_type: 'entitlement',
          subject_user_id: USERS.court_admin,
          entitlement_key: REFUSED_KEY,
          court_id: COURTS.SDNY,
          justification:
            'Deliberate fixture: this request is never lawfully approved.',
        },
      );

      expect(response.status).toBe(201);
      pendingRequestId = bodyOf<RequestBody>(response).request.id;
    });

    it('the API refuses self-approval — not merely audits it', async () => {
      if (!available) return;

      // The same person who requested it, approving it.
      const response = await post(
        `/api/v1/entitlements/requests/${pendingRequestId}/approve`,
        systemAdminToken,
      );

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error_code: 'AUTH_SOD_VIOLATION',
        // Verbatim from `FRD/F00` Error States.
        message:
          'Separation-of-duties violation: cannot approve your own request',
      });

      // ===================================================================
      // THE ASSERTION THAT MAKES THIS TEST MEAN WHAT ITS NAME SAYS.
      //
      // "The API refuses" is a claim that NOTHING HAPPENED — not that an
      // error was also returned. A system that wrote the grant and then
      // returned 403 would satisfy the status assertion above and be exactly
      // the system CONTEXT rejects ("'the audit trail will catch it' is
      // explicitly not sufficient").
      // ===================================================================
      expect(await liveGrantsFor(USERS.court_admin, REFUSED_KEY)).toHaveLength(0);

      // …and the request is untouched, still awaiting a second person.
      const { rows } = await db.query<{ status: string; decided_by: string | null }>(
        `SELECT status, decided_by FROM platform.access_grant_requests WHERE id = $1`,
        [pendingRequestId],
      );
      expect(rows[0]).toEqual({ status: 'pending', decided_by: null });
    });
  });

  // =========================================================================
  // CASE 3 — self-DENIAL is refused too.
  // =========================================================================

  describe('self-denial', () => {
    it('is refused with the same AUTH_SOD_VIOLATION', async () => {
      if (!available) return;

      // Not symmetry for its own sake. A requester who could quietly deny
      // their own request would remove it from the queue a reviewer reads,
      // erasing the only visible sign that the ask was ever made. The route
      // declares `action: 'approve'` precisely so `sod.rego`'s single
      // `action == "approve"` rule binds this path too.
      const response = await post(
        `/api/v1/entitlements/requests/${pendingRequestId}/deny`,
        systemAdminToken,
        { rationale: 'Withdrawing my own request before anyone sees it.' },
      );

      expect(response.status).toBe(403);
      expect(response.body.error_code).toBe('AUTH_SOD_VIOLATION');

      const { rows } = await db.query<{ status: string }>(
        `SELECT status FROM platform.access_grant_requests WHERE id = $1`,
        [pendingRequestId],
      );
      expect(rows[0].status).toBe('pending');
    });
  });

  // =========================================================================
  // CASE 3b — THE SERVICE LAYER, ALONE.
  // =========================================================================

  describe('the service check, with no guard in front of it', () => {
    it('refuses a direct in-process approve() that never passed AbacGuard', async () => {
      if (!available) return;

      // ===================================================================
      // WHY THIS CASE EXISTS, AND WHY CASES 2 AND 3 DO NOT COVER IT.
      //
      // Cases 2 and 3 go over HTTP, so `AbacGuard` evaluates `sod.rego`
      // BEFORE the handler runs and refuses them there. The service check in
      // `GrantsService.approve` is therefore never reached on that path —
      // meaning those cases would pass identically if the service check had
      // been deleted, and the "three independent layers" claim would be two
      // layers and a comment.
      //
      // This case calls the service directly out of the DI container, which
      // is exactly the failure mode the service layer exists to cover: a
      // route that loses its `@Resource()` descriptor, a future non-HTTP
      // entry point, a background job. No guard runs; the refusal has to
      // come from the service itself.
      // ===================================================================
      const service = app.get(GrantsService);

      const principal = await app
        .get(EntitlementResolverService)
        .resolveUncached(USERS.system_admin);

      await expect(
        service.approve(principal, pendingRequestId),
      ).rejects.toMatchObject({
        errorCode: 'AUTH_SOD_VIOLATION',
      });

      // And, again, nothing happened.
      expect(await liveGrantsFor(USERS.court_admin, REFUSED_KEY)).toHaveLength(0);
    });

    it('and deny() refuses the same direct call', async () => {
      if (!available) return;

      const service = app.get(GrantsService);
      const principal = await app
        .get(EntitlementResolverService)
        .resolveUncached(USERS.system_admin);

      await expect(
        service.deny(principal, pendingRequestId, 'Closing my own request directly.'),
      ).rejects.toMatchObject({ errorCode: 'AUTH_SOD_VIOLATION' });
    });

    it('while a different administrator succeeds through the same direct path', async () => {
      if (!available) return;

      // Without this, a service that threw AUTH_SOD_VIOLATION unconditionally
      // would pass both cases above. The control must discriminate on WHO is
      // approving, not merely refuse approvals.
      //
      // Rolled back below so the fixture stays pending for cases 5 and 10.
      const service = app.get(GrantsService);
      const principal = await app
        .get(EntitlementResolverService)
        .resolveUncached(USERS.security_officer);

      const grant = await service.approve(principal, pendingRequestId);
      expect(grant.granted_by).toBe(USERS.security_officer);

      // Undo: `app_rw` holds no DELETE anywhere in `platform`, so this is
      // `app_dba` work — the append-only posture applies to tests too.
      await adminDb.query(
        `DELETE FROM platform.entitlement_grants WHERE id = $1`,
        [grant.id],
      );
      await adminDb.query(
        `UPDATE platform.access_grant_requests
            SET status = 'pending', decided_by = NULL, decided_at = NULL
          WHERE id = $1`,
        [pendingRequestId],
      );
    });
  });

  // =========================================================================
  // CASE 4 — THE POLICY LAYER, ALONE.
  // =========================================================================

  describe('the Rego bundle, asked directly', () => {
    it('independently returns deny / AUTH_SOD_VIOLATION for the requester', async () => {
      if (!available) return;

      // Through `POST /security/policy-evaluate` with a service token — no
      // session, no handler, no TypeScript check. If this passes while case 2
      // fails, the service check is carrying the control alone; if it fails
      // while case 2 passes, the policy rule has rotted behind a working
      // application. Neither is visible from the HTTP path alone.
      const response = await request(app.getHttpServer())
        .post('/api/v1/security/policy-evaluate')
        .set('x-service-token', SERVICE_TOKEN)
        .set('x-service-actor-id', USERS.system_admin)
        .send({
          object_type: 'access_grant_request',
          object_id: pendingRequestId,
          action: 'approve',
          requester_scope: [],
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        decision: 'deny',
        reason_code: 'AUTH_SOD_VIOLATION',
      });
    });

    it('and allows the same action for a different administrator', async () => {
      if (!available) return;

      // The control is specific to the requester, not a blanket denial of the
      // approve action. Without this, a bundle that denied everything would
      // pass the case above.
      const response = await request(app.getHttpServer())
        .post('/api/v1/security/policy-evaluate')
        .set('x-service-token', SERVICE_TOKEN)
        .set('x-service-actor-id', USERS.security_officer)
        .send({
          object_type: 'access_grant_request',
          object_id: pendingRequestId,
          action: 'approve',
          requester_scope: [],
        });

      expect(response.status).toBe(200);
      expect(response.body.decision).toBe('allow');
    });
  });

  // =========================================================================
  // CASE 5 — THE DATABASE LAYER, ALONE.
  // =========================================================================

  describe('the table CHECK constraint, bypassing the application entirely', () => {
    it('rejects a self-approval written as raw SQL by app_rw', async () => {
      if (!available) return;

      // This is the layer that holds even if every line of application code is
      // replaced — a future ORM, a migration script, an operator at a psql
      // prompt. `app_rw` is the role the running application uses, so this is
      // the most privileged thing the application could possibly attempt.
      await expect(
        db.query(
          `UPDATE platform.access_grant_requests
              SET status = 'approved',
                  decided_by = requested_by,
                  decided_at = now()
            WHERE id = $1`,
          [pendingRequestId],
        ),
      ).rejects.toMatchObject({
        // 23514 — check_violation.
        code: '23514',
      });

      const { rows } = await db.query<{ status: string; decided_by: string | null }>(
        `SELECT status, decided_by FROM platform.access_grant_requests WHERE id = $1`,
        [pendingRequestId],
      );
      expect(rows[0]).toEqual({ status: 'pending', decided_by: null });
    });

    it('and accepts the same write naming a DIFFERENT decider', async () => {
      if (!available) return;

      // Proves the constraint discriminates rather than blocking every
      // approval — then rolls it back, leaving the fixture pending for the
      // listing case below.
      await db.query('BEGIN');
      await db.query(
        `UPDATE platform.access_grant_requests
            SET status = 'approved', decided_by = $2, decided_at = now()
          WHERE id = $1`,
        [pendingRequestId, USERS.security_officer],
      );
      await db.query('ROLLBACK');

      const { rows } = await db.query<{ status: string }>(
        `SELECT status FROM platform.access_grant_requests WHERE id = $1`,
        [pendingRequestId],
      );
      expect(rows[0].status).toBe('pending');
    });
  });

  // =========================================================================
  // CASE 6 — AN APPROVAL TAKES EFFECT IMMEDIATELY.
  // =========================================================================

  describe('the effect of an approval on the subject', () => {
    it('invalidates the session the subject held when the grant landed', async () => {
      if (!available) return;

      // `FRD/F00` Process step 7: "On role or scope-attribute change … active
      // sessions are invalidated and the user must re-authenticate to receive
      // updated entitlements." This token was obtained BEFORE the approval in
      // case 1 and has not been used since.
      const response = await get(
        '/api/v1/auth/entitlements',
        courtAdminTokenBeforeGrant,
      );

      expect(response.status).toBe(401);
      expect(response.body.error_code).toBe('AUTH_SESSION_EXPIRED');
    });

    it('and the new entitlement appears only after re-authenticating', async () => {
      if (!available) return;

      const fresh = await loginAs(app, 'court_admin');
      const response = await get('/api/v1/auth/entitlements', fresh.session_token);

      expect(response.status).toBe(200);
      const body = bodyOf<EntitlementsBody>(response);
      expect(body.entitlements).toContain(APPROVED_KEY);
      // Still no role was conferred — the entitlement is its own record.
      expect(body.roles.map((role) => role.role_name)).toEqual(['court_admin']);
    });
  });

  // =========================================================================
  // CASE 9 — AN ENTITLEMENT THAT DOES NOT EXIST IS NOT INVENTED.
  // =========================================================================

  describe('a request for an undefined entitlement', () => {
    it('is refused 422 GRANT_UNKNOWN_ENTITLEMENT, and writes nothing', async () => {
      if (!available) return;

      const response = await post(
        '/api/v1/entitlements/requests',
        systemAdminToken,
        {
          grant_type: 'entitlement',
          subject_user_id: USERS.court_admin,
          entitlement_key: 'not_a_real_entitlement',
          court_id: COURTS.SDNY,
          justification:
            'Requesting an entitlement the catalog has never heard of.',
        },
      );

      expect(response.status).toBe(422);
      expect(response.body.error_code).toBe('GRANT_UNKNOWN_ENTITLEMENT');

      // Silently creating it would produce an access right that looks real to
      // every human reading the record and authorizes nothing, because the
      // policy bundle's `action_entitlement_map` has never heard of it either.
      const { rows } = await db.query(
        `SELECT id FROM platform.access_grant_requests WHERE entitlement_key = $1`,
        ['not_a_real_entitlement'],
      );
      expect(rows).toHaveLength(0);
    });
  });

  // =========================================================================
  // CASE 10 — THE PENDING LIST PHASE 3 CONSUMES.
  // =========================================================================

  describe('the pending-grant list', () => {
    it('returns entries in the Task shape the Work Queue (F06) expects', async () => {
      if (!available) return;

      const response = await get(
        '/api/v1/entitlements/requests?status=pending',
        systemAdminToken,
      );

      expect(response.status).toBe(200);

      const entry = bodyOf<ListBody>(response).requests.find(
        (row) => row.id === pendingRequestId,
      );
      if (entry === undefined) throw new Error('pending request not listed');

      // `TechArch/03a-api-shared.md` §6.6 `Task`. CONTEXT requires pending
      // grants "plug into the Work Queue in Phase 3 without rework"; matching
      // the field names now is the cheapest way to make that true.
      expect(entry.object_reference).toEqual({
        object_type: 'access_grant_request',
        object_id: pendingRequestId,
      });
      expect(['low', 'normal', 'high', 'urgent']).toContain(entry.priority);
      expect(entry.task_type).toBe('approval_request');
      expect(entry.task_status).toBe('open');
    });

    it('and no Work Queue table was created to serve it', async () => {
      if (!available) return;

      // CONTEXT: "Do not build the Work Queue (F06)." Expose the list, build
      // no queue. A `tasks` table appearing in Phase 1 would be Phase 3's work
      // done early, from a Phase 1 reading of a Phase 3 specification.
      const { rows } = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'platform' AND table_name IN ('tasks','work_queue','exceptions')`,
      );
      expect(rows).toHaveLength(0);
    });
  });

  // =========================================================================
  // CASE 7 — REVOCATION. Single-step by design.
  // =========================================================================

  describe('revocation', () => {
    it('is single-step — SoD deliberately does not fire on removing access', async () => {
      if (!available) return;

      // The asymmetry with approval is intentional. Two-person control exists
      // to stop one person ACQUIRING authority; removing authority is the safe
      // direction, and requiring a second approver would keep a compromised
      // credential live while one is found. `resource-loader.service.ts`
      // leaves `requested_by` null for an `entitlement_grant`, which is how
      // `sod.rego` is given nothing to compare rather than special-casing the
      // action inside the policy.
      const response = await post(
        `/api/v1/entitlements/grants/${approvedGrantId}/revoke`,
        systemAdminToken,
        { rationale: 'Quarterly review complete; standing access no longer required.' },
      );

      expect(response.status).toBe(200);
      expect(response.body.grant.revoked_by).toBe(USERS.system_admin);
      expect(response.body.grant.revoked_at).toEqual(expect.any(String));
    });

    it('keeps the grant row, marked revoked — the access was once held, and that is a fact', async () => {
      if (!available) return;

      const { rows } = await db.query<{
        id: string;
        revoked_at: Date | null;
        revoked_by: string | null;
        granted_by: string;
      }>(
        `SELECT id, revoked_at, revoked_by, granted_by
           FROM platform.entitlement_grants WHERE id = $1`,
        [approvedGrantId],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].revoked_at).not.toBeNull();
      expect(rows[0].revoked_by).toBe(USERS.system_admin);
      // The original grantor is untouched. `app_rw` holds UPDATE only on
      // revoked_at/revoked_by, so rewriting it is not merely discouraged.
      expect(rows[0].granted_by).toBe(USERS.security_officer);
    });

    it('revokes the subject\u2019s sessions and removes the entitlement on re-authentication', async () => {
      if (!available) return;

      const fresh = await loginAs(app, 'court_admin');
      const response = await get('/api/v1/auth/entitlements', fresh.session_token);

      expect(response.status).toBe(200);
      expect(response.body.entitlements).not.toContain(APPROVED_KEY);
    });

    it('and a second revocation of the same grant is a 409, not a silent success', async () => {
      if (!available) return;

      const response = await post(
        `/api/v1/entitlements/grants/${approvedGrantId}/revoke`,
        systemAdminToken,
        { rationale: 'Attempting to revoke an already-revoked grant.' },
      );

      expect(response.status).toBe(409);
      expect(response.body.error_code).toBe('GRANT_INVALID_TRANSITION');
    });
  });
});
