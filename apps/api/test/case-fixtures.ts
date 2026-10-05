import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

import { SessionService } from '../src/modules/identity/session.service';

/**
 * Shared fixtures for the three case-model suites (plan 01-09).
 *
 * Not a `.e2e-spec` file, so `jest.cases.config.js`'s `testRegex` does not
 * match it and Jest never runs it as a suite.
 */

/** Seeded ids, from `prisma/seed/ids.ts`. */
export const SEED = {
  courts: {
    NDCA: '0a000001-0000-4000-8000-000000000001',
    SDNY: '0a000001-0000-4000-8000-000000000002',
  },
  divisions: {
    ndcaSanFrancisco: '0a000002-0000-4000-8000-000000000001',
    ndcaOakland: '0a000002-0000-4000-8000-000000000002',
    sdnyManhattan: '0a000002-0000-4000-8000-000000000003',
  },
  users: {
    judge: '0a000004-0000-4000-8000-000000000001',
    courtroom_deputy: '0a000004-0000-4000-8000-000000000003',
    clerk_case_admin: '0a000004-0000-4000-8000-000000000004',
  },
  cases: {
    /** NDCA / San Francisco — no designation. */
    plain: '0a000005-0000-4000-8000-000000000001',
    /** NDCA / San Francisco — SEALED. */
    sealed: '0a000005-0000-4000-8000-000000000002',
    /** NDCA / Oakland — RESTRICTED. */
    restricted: '0a000005-0000-4000-8000-000000000003',
    /** SDNY / Manhattan — the cross-court isolation fixture. */
    otherCourt: '0a000005-0000-4000-8000-000000000004',
  },
} as const;

/**
 * A case number unique to this process and call.
 *
 * **These suites create rows they can never remove.** `app_rw` holds no DELETE
 * grant on `platform.cases` — that is the property `case-no-delete` exists to
 * prove — so every run accumulates cases, and a fixed case number would make
 * the second run fail with the 409 the first run was testing for.
 *
 * So the suites assert on the *presence or absence of specific ids*, never on
 * a row count or an exact collection. A test that said "the list has four
 * entries" would pass once.
 */
export function uniqueCaseNumber(prefix = '3:99-cr'): string {
  const stamp = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0');
  return `${prefix}-${stamp}${rand}`;
}

/** A minimal valid `CreateCaseRequest` body. */
export function createCaseBody(
  overrides: Partial<{
    case_number: string;
    court_id: string;
    division_id: string;
    case_caption: string;
    case_type: string;
    party: Array<{ name: string; role: string; external_id?: string }>;
  }> = {},
): Record<string, unknown> {
  return {
    case_number: uniqueCaseNumber(),
    court_id: SEED.courts.NDCA,
    division_id: SEED.divisions.ndcaSanFrancisco,
    case_caption: 'United States v. Fixture',
    case_type: 'criminal',
    party: [
      { name: 'Fixture Defendant', role: 'defendant' },
      { name: 'United States of America', role: 'government' },
    ],
    ...overrides,
  };
}

/** Authenticated request helpers. */
export const api = (app: INestApplication, token: string) => ({
  get: (path: string): request.Test =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`),
  post: (path: string, body?: unknown): request.Test =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object),
  patch: (path: string, body?: unknown): request.Test =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object),
  delete: (path: string): request.Test =>
    request(app.getHttpServer())
      .delete(path)
      .set('Authorization', `Bearer ${token}`),
});

/**
 * Add a case scope to a user and make it take effect immediately.
 *
 * **The cache invalidation is the whole subtlety**, documented by plan 01-06
 * and rediscovered by plan 01-07's suite: `EntitlementResolverService` caches
 * the resolved principal — roles, scopes AND entitlements — for
 * `claim_cache_seconds` (seeded at 300). A scope row written straight to the
 * database is invisible for up to five minutes, and signing in again does NOT
 * help, because a new session resolves from the same per-user cache.
 *
 * `revokeAllForUser` invalidates that cache as part of its contract, so one
 * call covers both halves. Any login must come AFTER it.
 */
export async function grantCaseScope(
  app: INestApplication,
  db: Client,
  userId: string,
  caseId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO platform.scope_assignments (user_id, scope_type, scope_value)
     VALUES ($1, 'case', $2)`,
    [userId, caseId],
  );
  await app.get(SessionService).revokeAllForUser(userId);
}

/**
 * Remove it again.
 *
 * Runs as `app_dba`: `app_rw` holds no DELETE on `scope_assignments` (plan
 * 01-03's no-hard-delete posture), and attempting it as `app_rw` raises
 * `permission denied for table scope_assignments` — the grant posture working
 * rather than an obstacle to route around.
 */
export async function revokeCaseScope(
  app: INestApplication,
  adminDb: Client,
  userId: string,
  caseId: string,
): Promise<void> {
  await adminDb.query(
    `DELETE FROM platform.scope_assignments
      WHERE user_id = $1 AND scope_type = 'case' AND scope_value = $2`,
    [userId, caseId],
  );
  await app.get(SessionService).revokeAllForUser(userId);
}

/**
 * Lift every designation this suite applied to a case, as `app_dba`.
 *
 * Revocation rather than deletion even in a test teardown, because that is the
 * only mutation the schema permits — `app_rw` holds a column-scoped
 * `UPDATE (revoked_at, revoked_by)` and nothing else, and `app_dba` revoking
 * keeps the teardown shaped like the production operation it mirrors. A
 * designation left applied would change what the NEXT run's principals can
 * read, which is the kind of cross-run coupling that makes a suite pass alone
 * and fail in CI.
 */
export async function liftDesignations(
  adminDb: Client,
  caseId: string,
  revokedBy: string,
): Promise<void> {
  await adminDb.query(
    `UPDATE platform.security_designations
        SET revoked_at = now(), revoked_by = $2
      WHERE object_type = 'case' AND object_id = $1 AND revoked_at IS NULL`,
    [caseId, revokedBy],
  );
}

/** Audit rows for one object, newest first. */
export async function auditEventsFor(
  db: Client,
  objectType: string,
  objectId: string,
): Promise<
  Array<{
    action_type: string;
    object_type: string;
    object_id: string;
    actor_id: string;
    before_state: Record<string, unknown> | null;
    after_state: Record<string, unknown> | null;
  }>
> {
  const { rows } = await db.query(
    `SELECT action_type, object_type, object_id, actor_id, before_state, after_state
       FROM platform.audit_events
      WHERE object_type = $1 AND object_id = $2
      ORDER BY occurred_at DESC, id DESC`,
    [objectType, objectId],
  );
  return rows;
}
