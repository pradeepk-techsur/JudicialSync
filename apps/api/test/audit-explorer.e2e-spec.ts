import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { recordStandaloneAudit } from '../src/modules/audit/with-audit';
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
 * THE AUDIT EXPLORER, AGAINST REAL SESSIONS AND SEEDED DATA
 * ============================================================================
 *
 * `FRD/F02` · `US-2.3` · `Screen-17` · `TechArch/04-security.md` §7.6.
 *
 * Every assertion here is a claim about an HTTP response from the real
 * application, decided by the real OPA container, against real seeded rows —
 * the same posture as `abac-guard.e2e-spec.ts`. The separation-of-duties split
 * and the sealed-case designation gating are the whole point of the Explorer,
 * and neither can be proven against a mock.
 *
 * The suite seeds a handful of audit events through the real write path
 * (`recordStandaloneAudit`, the single documented standalone writer), so there
 * is a chain to query, then exercises the filters, pagination, SoD denial, and
 * the three designation branches `FRD/Y2-errors.md` principle 3 distinguishes.
 */

jest.setTimeout(300_000);

const USERS = {
  judge: '0a000004-0000-4000-8000-000000000001',
  clerk_case_admin: '0a000004-0000-4000-8000-000000000004',
  court_admin: '0a000004-0000-4000-8000-000000000007',
  security_officer: '0a000004-0000-4000-8000-00000000000a',
} as const;

const CASES = {
  plain: '0a000005-0000-4000-8000-000000000001',
  sealed: '0a000005-0000-4000-8000-000000000002',
} as const;

const RULE_PACKAGE_NDCA = '0a000008-0000-4000-8000-000000000001';

/** A well-formed UUID that is deliberately no row in the database. */
const NONEXISTENT_CASE = '0a000005-0000-4000-8000-0000000000ee';

interface ExplorerEvent {
  id: string;
  actor_id: string;
  action_type: string;
  object_type: string;
  object_id: string;
  before_after_summary: unknown;
  rule_version_label: string | null;
  occurred_at: string;
}

interface ExplorerBody {
  audit_events: ExplorerEvent[];
  next_cursor?: string;
}

describe('audit-explorer: access-scoped audit query (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  let adminDb: Client;
  let audit: AuditService;
  let prisma: PrismaService;
  let available = false;

  /** Audit event ids this suite created, for targeted cleanup. */
  const createdEventIds: string[] = [];
  /** (user_id, case_id) scope rows this suite granted, for cleanup. */
  const grantedScopes: Array<{ userId: string; caseId: string }> = [];
  /** entitlement_grant ids this suite created, for cleanup. */
  const grantedEntitlements: string[] = [];

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

    audit = app.get(AuditService);
    prisma = app.get(PrismaService);

    await seedAuditEvents();
  });

  afterAll(async () => {
    if (available) {
      // Clean up in-test grants (app_dba — no DELETE for app_rw on these).
      for (const { userId, caseId } of grantedScopes) {
        await adminDb.query(
          `DELETE FROM platform.scope_assignments
            WHERE user_id = $1 AND scope_type = 'case' AND scope_value = $2`,
          [userId, caseId],
        );
      }
      for (const id of grantedEntitlements) {
        await adminDb.query(
          `DELETE FROM platform.entitlement_grants WHERE id = $1`,
          [id],
        );
      }
      // Audit events are append-only even for app_dba's grant posture? No —
      // app_dba owns the schema and may DELETE for test teardown. Leaving the
      // test rows would otherwise accumulate across runs and skew pagination.
      if (createdEventIds.length > 0) {
        await adminDb.query(
          `DELETE FROM platform.audit_events WHERE id = ANY($1::uuid[])`,
          [createdEventIds],
        );
        // Re-point the chain head at the latest surviving row so later suites
        // (and the integrity job) see a consistent head. The write path never
        // deletes, so this fix-up is a test-teardown concern only.
        await resetChainHead(adminDb);
      }
    }
    await adminDb?.end();
    await db?.end();
    await app?.close();
    restoreEnv?.();
  });

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Log each user in AT MOST ONCE and reuse the session token.
   *
   * Every `loginAs` is a real password + TOTP browser flow, and Keycloak
   * enforces TOTP one-time-use — consecutive logins inside one 30s window make
   * the harness wait for the next window, which it must share with the other
   * plans' suites running against the same Keycloak. Logging in once per user
   * and reusing the (long-lived) session token removes almost all of that
   * contention; the SoD/designation properties under test depend on the
   * principal's entitlements, not on a fresh login per assertion.
   *
   * The one place a fresh login is still required is after an in-test grant,
   * because the session's cached principal must be re-resolved — those call
   * `freshLogin` explicitly.
   */
  const sessionCache = new Map<string, string>();
  const token = async (
    user: 'security_officer' | 'clerk_case_admin' | 'court_admin',
  ): Promise<string> => {
    const cached = sessionCache.get(user);
    if (cached !== undefined) return cached;
    const { session_token } = await loginAs(app, user);
    sessionCache.set(user, session_token);
    return session_token;
  };
  const freshLogin = async (
    user: 'security_officer' | 'clerk_case_admin' | 'court_admin',
  ): Promise<string> => {
    const { session_token } = await loginAs(app, user);
    sessionCache.set(user, session_token);
    return session_token;
  };

  const get = (path: string, tok: string): request.Test =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${tok}`);

  /**
   * Seed audit events across the plain and sealed cases, plus one carrying a
   * rule-package ref so `rule_version_label` has something to resolve.
   */
  async function seedAuditEvents(): Promise<void> {
    const events = [
      {
        actor_id: USERS.judge,
        action_type: 'status_change' as const,
        object_type: 'cases',
        object_id: CASES.plain,
        before_state: { status: 'open' },
        after_state: { status: 'closed' },
        rule_version_ref: RULE_PACKAGE_NDCA,
      },
      {
        actor_id: USERS.clerk_case_admin,
        action_type: 'config_change' as const,
        object_type: 'cases',
        object_id: CASES.plain,
        before_state: { case_caption: 'Old' },
        after_state: { case_caption: 'New' },
      },
      {
        actor_id: USERS.judge,
        action_type: 'ruling' as const,
        object_type: 'cases',
        object_id: CASES.sealed,
        after_state: { ruling: 'granted' },
        rule_version_ref: RULE_PACKAGE_NDCA,
      },
      {
        actor_id: USERS.judge,
        action_type: 'status_change' as const,
        object_type: 'cases',
        object_id: CASES.sealed,
        before_state: { status: 'open' },
        after_state: { status: 'closed' },
      },
    ];

    for (const event of events) {
      const [written] = await recordStandaloneAudit(prisma, audit, event);
      createdEventIds.push(written.id);
    }
  }

  /** Grant `audit_reader` (+ optionally more) to a user and invalidate cache. */
  async function grantEntitlement(
    userId: string,
    entitlementKey: string,
  ): Promise<void> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO platform.entitlement_grants (user_id, entitlement_key, granted_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [userId, entitlementKey, USERS.security_officer],
    );
    grantedEntitlements.push(rows[0].id);
    await app.get(SessionService).revokeAllForUser(userId);
  }

  async function grantCaseScope(userId: string, caseId: string): Promise<void> {
    await db.query(
      `INSERT INTO platform.scope_assignments (user_id, scope_type, scope_value)
       VALUES ($1, 'case', $2)`,
      [userId, caseId],
    );
    grantedScopes.push({ userId, caseId });
    await app.get(SessionService).revokeAllForUser(userId);
  }

  // =========================================================================
  // 1. The authorized auditor sees results with derived fields
  // =========================================================================

  it('security_officer (holds audit_reader) queries the Explorer and sees derived fields', async () => {
    if (!available) return;

    const session_token = await token('security_officer');
    const response = await get('/api/v1/audit/explorer', session_token);

    expect(response.status).toBe(200);
    const body = response.body as ExplorerBody;
    expect(body.audit_events.length).toBeGreaterThan(0);

    // Every result carries the AuditEvent fields plus the two derived ones.
    for (const event of body.audit_events) {
      expect(event).toHaveProperty('actor_id');
      expect(event).toHaveProperty('action_type');
      expect(event).toHaveProperty('before_after_summary');
      expect(event).toHaveProperty('rule_version_label');
    }

    // The rule-driven event resolves its label to "v{version_number}".
    const ruling = body.audit_events.find((e) => e.action_type === 'ruling');
    // (ruling is on the sealed case; security_officer lacks designation_sealed,
    //  so it is pre-filtered out — assert the label shape on a visible row.)
    const labelled = body.audit_events.find(
      (e) => e.rule_version_label !== null,
    );
    if (labelled !== undefined) {
      expect(labelled.rule_version_label).toMatch(/^v\d+$/);
    }
    expect(ruling).toBeUndefined(); // sealed row excluded; see case 7
  });

  // =========================================================================
  // 2. Separation of duties — US-2.3, the whole point of the entitlement split
  // =========================================================================

  it('operational edit rights do not imply audit read access', async () => {
    if (!available) return;

    // clerk_case_admin holds case_read/create/update/security_admin/file_upload
    // and NO audit_reader. The PDP denies at the guard, before the service runs.
    const session_token = await token('clerk_case_admin');
    const response = await get('/api/v1/audit/explorer', session_token);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error_code: 'AUDIT_READ_DENIED' });
  });

  // =========================================================================
  // 3. Filtering narrows the result set
  // =========================================================================

  describe('filters narrow results', () => {
    it('object_type and action_type each narrow correctly', async () => {
      if (!available) return;

      const session_token = await token('security_officer');

      const byAction = await get(
        '/api/v1/audit/explorer?action_type=config_change',
        session_token,
      );
      expect(byAction.status).toBe(200);
      for (const event of (byAction.body as ExplorerBody).audit_events) {
        expect(event.action_type).toBe('config_change');
      }

      const byType = await get(
        '/api/v1/audit/explorer?object_type=cases',
        session_token,
      );
      expect(byType.status).toBe(200);
      for (const event of (byType.body as ExplorerBody).audit_events) {
        expect(event.object_type).toBe('cases');
      }
    });

    it('user_id and a date range each narrow correctly', async () => {
      if (!available) return;

      const session_token = await token('security_officer');

      const byUser = await get(
        `/api/v1/audit/explorer?user_id=${USERS.clerk_case_admin}`,
        session_token,
      );
      expect(byUser.status).toBe(200);
      for (const event of (byUser.body as ExplorerBody).audit_events) {
        expect(event.actor_id).toBe(USERS.clerk_case_admin);
      }

      const future = new Date(Date.now() + 86_400_000).toISOString();
      const byDate = await get(
        `/api/v1/audit/explorer?date_from=${future}`,
        session_token,
      );
      expect(byDate.status).toBe(200);
      expect((byDate.body as ExplorerBody).audit_events).toHaveLength(0);
    });
  });

  // =========================================================================
  // 4. Keyset pagination
  // =========================================================================

  it('keyset pagination returns disjoint, ordered pages', async () => {
    if (!available) return;

    const session_token = await token('security_officer');

    const first = await get('/api/v1/audit/explorer?limit=5', session_token);
    expect(first.status).toBe(200);
    const firstBody = first.body as ExplorerBody;
    expect(firstBody.audit_events.length).toBeLessThanOrEqual(5);

    if (firstBody.next_cursor === undefined) {
      // Fewer than 6 rows total — pagination has nothing to demonstrate.
      return;
    }

    const second = await get(
      `/api/v1/audit/explorer?limit=5&cursor=${encodeURIComponent(
        firstBody.next_cursor,
      )}`,
      session_token,
    );
    expect(second.status).toBe(200);
    const secondBody = second.body as ExplorerBody;

    // Disjoint.
    const firstIds = new Set(firstBody.audit_events.map((e) => e.id));
    for (const event of secondBody.audit_events) {
      expect(firstIds.has(event.id)).toBe(false);
    }

    // Ordered: the last of page 1 is strictly newer-or-equal than the first of
    // page 2 (DESC on occurred_at, then id).
    const lastOfFirst = firstBody.audit_events[firstBody.audit_events.length - 1];
    const firstOfSecond = secondBody.audit_events[0];
    if (firstOfSecond !== undefined) {
      expect(
        new Date(lastOfFirst.occurred_at).getTime(),
      ).toBeGreaterThanOrEqual(new Date(firstOfSecond.occurred_at).getTime());
    }
  });

  // =========================================================================
  // 5. Sealed case, parent access held → 403 AUDIT_DESIGNATION_DENIED
  // =========================================================================

  it('sealed-case audit with parent access but no designation → 403, attempt logged', async () => {
    if (!available) return;

    // court_admin: grant audit_reader + case_read + a case scope on the sealed
    // case, but NOT designation_sealed. They can see the case exists, so hiding
    // it would leak nothing — the specified response is 403.
    await grantEntitlement(USERS.court_admin, 'audit_reader');
    await grantEntitlement(USERS.court_admin, 'case_read');
    await grantCaseScope(USERS.court_admin, CASES.sealed);

    const session_token = await freshLogin('court_admin');
    const response = await get(
      `/api/v1/audit/explorer?case_id=${CASES.sealed}`,
      session_token,
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error_code: 'AUDIT_DESIGNATION_DENIED',
    });

    const attempt = await latestExplorerAttempt(USERS.court_admin);
    expect(attempt).toBeDefined();
    expect(attempt?.after_state).toMatchObject({
      surface: 'audit_explorer',
      attempted_case_id: CASES.sealed,
    });
  });

  // =========================================================================
  // 6. Sealed case, blind discovery → empty, indistinguishable from nonexistent
  // =========================================================================

  it('sealed-case audit, blind discovery → empty result identical to a nonexistent case', async () => {
    if (!available) return;

    // security_officer holds audit_reader but has NO access path to the sealed
    // case (no case_read, no scope). A case_id filter must yield an empty set
    // byte-identical to the one for a random nonexistent UUID.
    const session_token = await token('security_officer');

    const sealed = await get(
      `/api/v1/audit/explorer?case_id=${CASES.sealed}`,
      session_token,
    );
    const nonexistent = await get(
      `/api/v1/audit/explorer?case_id=${NONEXISTENT_CASE}`,
      session_token,
    );

    expect(sealed.status).toBe(200);
    expect(nonexistent.status).toBe(200);
    expect(sealed.body).toEqual({ audit_events: [] });
    // Byte-identical bodies — no existence oracle.
    expect(sealed.body).toEqual(nonexistent.body);

    const attempt = await latestExplorerAttempt(USERS.security_officer);
    expect(attempt).toBeDefined();
    expect(attempt?.after_state).toMatchObject({ surface: 'audit_explorer' });
  });

  // =========================================================================
  // 7. Unfiltered query excludes sealed rows
  // =========================================================================

  it('an unfiltered query returns zero rows belonging to the sealed case', async () => {
    if (!available) return;

    // security_officer (audit_reader, no designation_sealed) — the sealed case's
    // audit rows must not appear in the default view.
    const session_token = await token('security_officer');
    const response = await get(
      '/api/v1/audit/explorer?limit=200',
      session_token,
    );

    expect(response.status).toBe(200);
    const body = response.body as ExplorerBody;
    const sealedRows = body.audit_events.filter(
      (e) => e.object_id === CASES.sealed,
    );
    expect(sealedRows).toHaveLength(0);
  });

  // =========================================================================
  // 8. Denied attempts are visible to an authorized auditor
  // =========================================================================

  it('an authorized auditor sees denied attempts as rows', async () => {
    if (!available) return;

    // After cases 5 and 6, access_attempt rows exist. A security_officer
    // (audit_reader) filtering by action_type=access_attempt sees them.
    const session_token = await token('security_officer');
    const response = await get(
      '/api/v1/audit/explorer?action_type=access_attempt&limit=200',
      session_token,
    );

    expect(response.status).toBe(200);
    const body = response.body as ExplorerBody;
    const explorerAttempts = body.audit_events.filter(
      (e) => e.action_type === 'access_attempt',
    );
    expect(explorerAttempts.length).toBeGreaterThan(0);
  });

  // =========================================================================
  // 9. The Explorer is read-only
  // =========================================================================

  describe('the Explorer is read-only', () => {
    it('POST/PATCH/DELETE on /audit/explorer are not routed', async () => {
      if (!available) return;

      const session_token = await token('security_officer');
      const auth = { Authorization: `Bearer ${session_token}` };

      const post = await request(app.getHttpServer())
        .post('/api/v1/audit/explorer')
        .set(auth);
      const patch = await request(app.getHttpServer())
        .patch('/api/v1/audit/explorer')
        .set(auth);
      const del = await request(app.getHttpServer())
        .delete('/api/v1/audit/explorer')
        .set(auth);

      // No write handler exists → 404 (unrouted) or 405. Never 2xx.
      for (const res of [post, patch, del]) {
        expect(res.status).toBeGreaterThanOrEqual(404);
      }
    });
  });

  // =========================================================================
  // Query helpers
  // =========================================================================

  interface AttemptRow {
    after_state: Record<string, unknown>;
  }

  async function latestExplorerAttempt(
    userId: string,
  ): Promise<AttemptRow | undefined> {
    const { rows } = await db.query<AttemptRow>(
      `SELECT after_state
         FROM platform.audit_events
        WHERE actor_id = $1
          AND action_type = 'access_attempt'
          AND after_state->>'surface' = 'audit_explorer'
        ORDER BY occurred_at DESC, id DESC
        LIMIT 1`,
      [userId],
    );
    return rows[0];
  }
});

/**
 * Re-point `audit_chain_head` at the latest surviving audit row after
 * test-teardown deletions, so the chain head matches the tail for any suite
 * that runs afterward. Test-only — the application never deletes audit rows.
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
