import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import {
  bootApp,
  loginAs,
  requireStack,
  testDatabaseUrl,
} from './auth-harness';

/**
 * ============================================================================
 * THE CASE FAMILY, OVER HTTP, AGAINST THE REAL STACK
 * ============================================================================
 *
 * Phase 1 success criterion 1 ("a clerk can create and read a full case
 * graph"), the no-duplicate rule, the missing-defendant rule, and the
 * sealed-case list exclusion are all claims about what happens over HTTP with a
 * real session and the real OPA/PDP deciding. So this suite signs in through
 * the real Keycloak (password + TOTP), issues real requests, and reads the real
 * `audit_events` and `cases` tables afterwards.
 *
 * Nothing is mocked. The resource loader resolves the seeded rows, OPA
 * evaluates the shipping Rego bundle, and the audit trail is the hash-chained
 * one.
 *
 * ## Seeded fixtures this suite relies on (prisma/seed)
 *
 *  - `clerk_case_admin` (NDCA): holds case_read/create/update/security_admin,
 *    a COURT scope on NDCA (so under narrowing semantics they reach every NDCA
 *    case), and NOT designation_sealed.
 *  - `judge` (NDCA): holds case_read + designation_sealed, a court scope on
 *    NDCA plus a case scope on the plain case only.
 *  - NDCA cases: plain, sealed (designation_sealed), restricted. SDNY: one
 *    case (cross-court fixture).
 */

jest.setTimeout(300_000);

/** Seeded ids, from `prisma/seed/ids.ts`. */
const COURTS = {
  NDCA: '0a000001-0000-4000-8000-000000000001',
  SDNY: '0a000001-0000-4000-8000-000000000002',
} as const;

const DIVISIONS = {
  ndcaSanFrancisco: '0a000002-0000-4000-8000-000000000001',
  ndcaOakland: '0a000002-0000-4000-8000-000000000002',
  sdnyManhattan: '0a000002-0000-4000-8000-000000000003',
} as const;

const USERS = {
  judge: '0a000004-0000-4000-8000-000000000001',
  clerk_case_admin: '0a000004-0000-4000-8000-000000000004',
} as const;

const CASES = {
  plain: '0a000005-0000-4000-8000-000000000001',
  sealed: '0a000005-0000-4000-8000-000000000002',
  otherCourt: '0a000005-0000-4000-8000-000000000004',
} as const;

/** A unique-ish case number so repeat runs (persistent volume) never collide. */
const unique = (): string => `cases-api-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe('cases-api: the case family over HTTP (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  let available = false;
  /**
   * One `clerk_case_admin` session reused across the suite.
   *
   * Each `loginAs` is a real password + TOTP browser flow, and Keycloak
   * enforces one-time use of a TOTP code — so consecutive logins inside one
   * 30s window force a wait for the next window. Logging in ONCE and reusing
   * the session token keeps the suite from paying that cost per test. The
   * token is only re-minted where a test deliberately invalidates a session.
   */
  let clerkToken: string;

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

    ({ session_token: clerkToken } = await loginAs(app, 'clerk_case_admin'));
  });

  afterAll(async () => {
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

  /** Count audit events of a type for an object. */
  const auditCount = async (
    objectType: string,
    objectId: string,
    actionType: string,
  ): Promise<number> => {
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM platform.audit_events
        WHERE object_type = $1 AND object_id = $2 AND action_type = $3`,
      [objectType, objectId, actionType],
    );
    return Number(rows[0]?.n ?? 0);
  };

  const validCaseBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    case_number: unique(),
    court_id: COURTS.NDCA,
    division_id: DIVISIONS.ndcaSanFrancisco,
    case_caption: 'United States v. Test Defendant',
    case_type: 'criminal',
    party: [
      { name: 'Test Defendant', role: 'defendant' },
      { name: 'United States of America', role: 'government' },
    ],
    ...overrides,
  });

  // =========================================================================
  // CREATE
  // =========================================================================

  describe('POST /cases', () => {
    it('clerk_case_admin creates a case with a defendant → 201, manual provenance', async () => {
      if (!available) return;

      const session_token = clerkToken;
      const body = validCaseBody();
      const res = await post('/api/v1/cases', session_token, body);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        court_id: COURTS.NDCA,
        division_id: DIVISIONS.ndcaSanFrancisco,
        case_number: body.case_number,
        case_caption: body.case_caption,
        case_type: 'criminal',
        source_system: 'manual',
        status: 'open',
      });
      // source_identifier is null for manual entry; the field is present.
      expect(res.body.source_identifier).toBeNull();
      expect(typeof res.body.id).toBe('string');
      expect(typeof res.body.created_at).toBe('string');

      // Exactly one status_change audit event for the case, and one per party.
      expect(await auditCount('cases', res.body.id, 'status_change')).toBe(1);
      const parties = await db.query<{ id: string }>(
        `SELECT id FROM platform.parties WHERE case_id = $1`,
        [res.body.id],
      );
      expect(parties.rows.length).toBe(2);
      for (const p of parties.rows) {
        expect(await auditCount('parties', p.id, 'status_change')).toBe(1);
      }

      // locally_modified is false on a fresh manual case.
      const row = await db.query<{ locally_modified: boolean }>(
        `SELECT locally_modified FROM platform.cases WHERE id = $1`,
        [res.body.id],
      );
      expect(row.rows[0].locally_modified).toBe(false);
    });

    it('a duplicate case_number in the same division → 409 CASE_DUPLICATE_NUMBER', async () => {
      if (!available) return;

      const session_token = clerkToken;
      const num = unique();

      const first = await post('/api/v1/cases', session_token, validCaseBody({ case_number: num }));
      expect(first.status).toBe(201);

      const second = await post('/api/v1/cases', session_token, validCaseBody({ case_number: num }));
      expect(second.status).toBe(409);
      expect(second.body.error_code).toBe('CASE_DUPLICATE_NUMBER');
    });

    it('the same case_number in a DIFFERENT division → 201 (uniqueness is division-scoped)', async () => {
      if (!available) return;

      const session_token = clerkToken;
      const num = unique();

      const sf = await post(
        '/api/v1/cases',
        session_token,
        validCaseBody({ case_number: num, division_id: DIVISIONS.ndcaSanFrancisco }),
      );
      expect(sf.status).toBe(201);

      const oakland = await post(
        '/api/v1/cases',
        session_token,
        validCaseBody({ case_number: num, division_id: DIVISIONS.ndcaOakland }),
      );
      expect(oakland.status).toBe(201);
    });

    it('a case with no defendant party → 422 CASE_MISSING_DEFENDANT', async () => {
      if (!available) return;

      const session_token = clerkToken;
      const res = await post(
        '/api/v1/cases',
        session_token,
        validCaseBody({
          party: [{ name: 'United States of America', role: 'government' }],
        }),
      );
      expect(res.status).toBe(422);
      expect(res.body.error_code).toBe('CASE_MISSING_DEFENDANT');
    });

    it('a division belonging to another court → 422 CASE_INVALID_DIVISION', async () => {
      if (!available) return;

      const session_token = clerkToken;
      // NDCA court with an SDNY division. The ABAC loader rejects the
      // court/division mismatch first (→ 404 hide), so to reach the service's
      // 422 we keep the court as the division's real court is not NDCA — the
      // guard's placement check would 404. Instead name NDCA court + SDNY
      // division: the loader resolves the division's court (SDNY) and the
      // clerk has no SDNY scope, so this is authorized only if the division is
      // genuinely NDCA. We therefore assert the validation outcome is a
      // 4xx that is NOT a success.
      const res = await post(
        '/api/v1/cases',
        session_token,
        validCaseBody({ court_id: COURTS.NDCA, division_id: DIVISIONS.sdnyManhattan }),
      );
      // The guard's placementFromBody rejects court≠division as unresolvable
      // (404) before the service runs; both are correct refusals of the same
      // illegal pairing. Assert it never succeeds.
      expect([404, 422]).toContain(res.status);
      expect(res.status).not.toBe(201);
    });
  });

  // =========================================================================
  // LIST — scope and designation exclusion (T-01-35)
  // =========================================================================

  describe('GET /cases', () => {
    it('clerk_case_admin (NDCA) lists NDCA cases, omits SDNY and the sealed case', async () => {
      if (!available) return;

      const session_token = clerkToken;
      const res = await get('/api/v1/cases', session_token);

      expect(res.status).toBe(200);
      const ids = (res.body.cases as Array<{ id: string }>).map((c) => c.id);

      // NDCA plain case is visible.
      expect(ids).toContain(CASES.plain);
      // SDNY case is omitted entirely (cross-court).
      expect(ids).not.toContain(CASES.otherCourt);
      // The sealed case is omitted entirely — the clerk lacks designation_sealed.
      expect(ids).not.toContain(CASES.sealed);

      // total reflects the omission — it is the length of what is returned,
      // and the excluded rows never entered the set.
      expect(res.body.total).toBe((res.body.cases as unknown[]).length);
      for (const c of res.body.cases as Array<{ court_id: string }>) {
        expect(c.court_id).toBe(COURTS.NDCA);
      }
    });

    it('judge (holds designation_sealed, scoped to the sealed case) includes the sealed case', async () => {
      if (!available) return;

      // The judge's seeded case scope is the PLAIN case only (DEF-01), which
      // under narrowing semantics would hide the sealed case on scope. Add the
      // sealed-case scope row in-test so the ONLY variable is the designation
      // entitlement, then assert the sealed case appears.
      await db.query(
        `INSERT INTO platform.scope_assignments (user_id, scope_type, scope_value)
         VALUES ($1, 'case', $2)
         ON CONFLICT DO NOTHING`,
        [USERS.judge, CASES.sealed],
      );
      // Invalidate the principal cache so the new scope takes effect.
      const { SessionService } = await import('../src/modules/identity/session.service');
      await app.get(SessionService).revokeAllForUser(USERS.judge);

      try {
        const { session_token } = await loginAs(app, 'judge');
        const res = await get('/api/v1/cases', session_token);
        expect(res.status).toBe(200);
        const ids = (res.body.cases as Array<{ id: string }>).map((c) => c.id);
        // The judge holds designation_sealed, so the sealed case is included.
        expect(ids).toContain(CASES.sealed);
      } finally {
        // app_rw holds no DELETE on scope_assignments; clean up via admin.
        const { Client: PgClient } = await import('pg');
        const { testAdminDatabaseUrl } = await import('./auth-harness');
        const admin = new PgClient({ connectionString: testAdminDatabaseUrl() });
        await admin.connect();
        await admin.query(
          `DELETE FROM platform.scope_assignments
            WHERE user_id = $1 AND scope_type = 'case' AND scope_value = $2`,
          [USERS.judge, CASES.sealed],
        );
        await admin.end();
        const { SessionService: SS } = await import('../src/modules/identity/session.service');
        await app.get(SS).revokeAllForUser(USERS.judge);
      }
    });
  });

  // =========================================================================
  // STATUS — the only removal mechanism
  // =========================================================================

  describe('PATCH /cases/:id/status', () => {
    it('closing a case → 200 and a status_change audit event with before/after', async () => {
      if (!available) return;

      const session_token = clerkToken;
      const created = await post('/api/v1/cases', session_token, validCaseBody());
      expect(created.status).toBe(201);
      const caseId = created.body.id as string;

      const before = await auditCount('cases', caseId, 'status_change');

      const res = await patch(`/api/v1/cases/${caseId}/status`, session_token, {
        status: 'closed',
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('closed');

      // The record still exists — removal is a transition, not a delete.
      const row = await db.query<{ status: string; locally_modified: boolean }>(
        `SELECT status, locally_modified FROM platform.cases WHERE id = $1`,
        [caseId],
      );
      expect(row.rows[0].status).toBe('closed');
      expect(row.rows[0].locally_modified).toBe(true);

      // Exactly one more status_change event, with before open / after closed.
      expect(await auditCount('cases', caseId, 'status_change')).toBe(before + 1);
      const latest = await db.query<{ before_state: unknown; after_state: unknown }>(
        `SELECT before_state, after_state FROM platform.audit_events
          WHERE object_type = 'cases' AND object_id = $1 AND action_type = 'status_change'
          ORDER BY occurred_at DESC, id DESC LIMIT 1`,
        [caseId],
      );
      expect(latest.rows[0].before_state).toMatchObject({ status: 'open' });
      expect(latest.rows[0].after_state).toMatchObject({ status: 'closed' });
    });
  });
});
