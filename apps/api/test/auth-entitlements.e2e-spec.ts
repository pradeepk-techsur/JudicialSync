import { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import { Client } from 'pg';
import request from 'supertest';

import { EntitlementResolverService } from '../src/modules/identity/entitlement-resolver.service';
import { SessionConfigService } from '../src/modules/identity/session-config.service';
import { SessionService } from '../src/modules/identity/session.service';
import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import {
  bootApp,
  loginAs,
  requireStack,
  testAdminDatabaseUrl,
  testDatabaseUrl,
  testRedisUrl,
} from './auth-harness';

/**
 * ============================================================================
 * ENTITLEMENT RESOLUTION — and the constraint it exists to protect
 * ============================================================================
 *
 * CONTEXT states a hard constraint:
 *
 *   > "Role existence must never imply access. This is a hard constraint, and
 *   > must be proven by test, not merely asserted in a document."
 *
 * This file is that proof at the API level. The `jury_admin` case below is
 * its sharpest form: a user who authenticates successfully, carries a
 * legitimate seeded role, and resolves to an empty `entitlements[]`.
 *
 * The constraint is easy to assert and easy to violate by accident — the
 * usual way is a sensible-looking default bundle attached to each role, which
 * turns *having a role* into *having access* without anyone deciding to grant
 * it. A fixture that holds a role and nothing else is what makes the claim
 * falsifiable rather than decorative.
 *
 * The separation-of-duties pair (`security_officer` vs `clerk_case_admin`) is
 * the same idea applied to FRD/F02: it is observable through the API that a
 * clerk with edit rights has no audit access, and an auditor has no case
 * access.
 */

jest.setTimeout(240_000);

describe('auth-entitlements: grants only, never roles (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  /**
   * Administrative connection (`app_dba`), used ONLY to change the seeded
   * configuration row. `app_rw` holds SELECT alone on the configuration
   * tables by design, so writing them is an administrative act.
   */
  let adminDb: Client;
  let redis: Redis;
  let resolver: EntitlementResolverService;
  let sessions: SessionService;
  let available = false;

  /** `users.id` by seeded role name. */
  const userIds = new Map<string, string>();

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;

    ({ app, restoreEnv } = await bootApp());

    const provider = app.get(OidcProvider);
    for (let i = 0; i < 60 && !provider.isReady(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    resolver = app.get(EntitlementResolverService);
    sessions = app.get(SessionService);

    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    adminDb = new Client({ connectionString: testAdminDatabaseUrl() });
    await adminDb.connect();
    redis = new Redis(testRedisUrl());

    const { rows } = await db.query<{ role_name: string; user_id: string }>(
      `SELECT r.role_name, ur.user_id
         FROM platform.user_roles ur
         JOIN platform.roles r ON r.id = ur.role_id
        WHERE ur.revoked_at IS NULL`,
    );
    for (const row of rows) userIds.set(row.role_name, row.user_id);
  });

  afterAll(async () => {
    redis?.disconnect();
    await adminDb?.end();
    await db?.end();
    await app?.close();
    restoreEnv?.();
  });

  /** Resolve straight from the database, bypassing the cache. */
  const entitlementsOf = async (role: string): Promise<string[]> => {
    const id = userIds.get(role);
    if (id === undefined) throw new Error(`No seeded user for role ${role}`);
    return (await resolver.resolveUncached(id)).entitlements;
  };

  describe('THE HARD CONSTRAINT', () => {
    /**
     * The name of this test is deliberate and is specified by the plan. If it
     * ever fails, the correct response is to remove whatever granted
     * `jury_admin` an entitlement — not to grant it something and update the
     * expectation.
     */
    it('role existence does not imply access: jury_admin holds a role and zero entitlements', async () => {
      if (!available) return;

      const userId = userIds.get('jury_admin');
      expect(userId).toBeDefined();

      const principal = await resolver.resolveUncached(userId as string);

      // A legitimate, seeded role...
      expect(principal.roles.map((r) => r.role_name)).toContain('jury_admin');
      // ...and nothing whatsoever that it authorises.
      expect(principal.entitlements).toEqual([]);
    });

    it('is visible through the API, not just the service', async () => {
      if (!available) return;

      const { session_token } = await loginAs(app, 'jury_admin');
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/entitlements')
        .set('Authorization', `Bearer ${session_token}`);

      expect(response.status).toBe(200);
      const body = response.body as {
        roles: { role_name: string }[];
        entitlements: string[];
      };
      expect(body.roles.map((r) => r.role_name)).toContain('jury_admin');
      expect(body.entitlements).toEqual([]);
    });

    it('no entitlement any user holds is derivable from their role alone', async () => {
      if (!available) return;

      // Every entitlement held by any user must trace to a grant row. If a
      // role bundle existed anywhere, some user would hold an entitlement
      // with no corresponding grant.
      for (const [role, userId] of userIds) {
        const principal = await resolver.resolveUncached(userId);
        const { rows } = await db.query<{ entitlement_key: string }>(
          `SELECT entitlement_key FROM platform.entitlement_grants
            WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        );
        const granted = [...new Set(rows.map((r) => r.entitlement_key))].sort();

        expect({ role, entitlements: principal.entitlements }).toEqual({
          role,
          entitlements: granted,
        });
      }
    });
  });

  describe('separation of duties (FRD/F02), observable through the API', () => {
    it('clerk_case_admin has edit entitlements and NOT audit_reader', async () => {
      if (!available) return;

      const entitlements = await entitlementsOf('clerk_case_admin');

      expect(entitlements).toEqual(
        expect.arrayContaining([
          'case_read',
          'case_create',
          'case_update',
          'case_security_admin',
          'file_upload',
        ]),
      );
      expect(entitlements).not.toContain('audit_reader');
    });

    it('security_officer has audit_reader and NOT case_read', async () => {
      if (!available) return;

      const entitlements = await entitlementsOf('security_officer');

      expect(entitlements).toContain('audit_reader');
      // "a clerk with exhibit-ledger write access does not automatically gain
      // audit-explorer read access, and vice versa."
      expect(entitlements).not.toContain('case_read');
      expect(entitlements).not.toContain('case_update');
    });

    it('attorney_external holds no internal entitlements (US-0.2)', async () => {
      if (!available) return;

      const entitlements = await entitlementsOf('attorney_external');
      expect(entitlements).toEqual([]);
    });
  });

  describe('least privilege for a new account', () => {
    it('a first-time user has zero roles AND zero entitlements', async () => {
      if (!available) return;

      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO platform.users (external_idp_subject, display_name, email)
         VALUES ($1, 'Newcomer', 'newcomer@judicialsync.invalid') RETURNING id`,
        [`newcomer-${Date.now()}`],
      );

      const principal = await resolver.resolveUncached(rows[0].id);
      expect(principal.roles).toEqual([]);
      expect(principal.entitlements).toEqual([]);
    });
  });

  describe('the response shape', () => {
    it('GET /auth/entitlements returns user_id, roles, scopes, entitlements, mfa_satisfied', async () => {
      if (!available) return;

      const { session_token } = await loginAs(app, 'clerk_case_admin');
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/entitlements')
        .set('Authorization', `Bearer ${session_token}`);

      expect(response.status).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual([
        'entitlements',
        'mfa_satisfied',
        'roles',
        'scopes',
        'user_id',
      ]);
      expect(response.body.mfa_satisfied).toBe(true);
      expect(response.body.scopes.length).toBeGreaterThan(0);
    });
  });

  describe('the claim cache', () => {
    it('caches the resolved principal under principal:{userId}', async () => {
      if (!available) return;

      const userId = userIds.get('court_admin') as string;
      await resolver.invalidate(userId);
      expect(await redis.exists(`principal:${userId}`)).toBe(0);

      await resolver.resolve(userId);
      expect(await redis.exists(`principal:${userId}`)).toBe(1);
    });

    /**
     * The cache TTL must come from the database, not a constant. Proved by
     * CHANGING the seeded value and observing the new TTL — a hardcoded 300
     * would survive this test unchanged, which is exactly what makes it
     * worth writing this way rather than asserting `=== 300`.
     */
    it('reads claim_cache_seconds from the database (changing it changes the TTL)', async () => {
      if (!available) return;

      const userId = userIds.get('law_clerk') as string;
      const config = app.get(SessionConfigService);

      const original = await db.query<{ session: { claim_cache_seconds: number } }>(
        `SELECT config_snapshot->'session' AS session
           FROM platform.rule_package_versions
          WHERE published_at IS NOT NULL
          ORDER BY published_at DESC LIMIT 1`,
      );
      const seededTtl = original.rows[0].session.claim_cache_seconds;

      await resolver.invalidate(userId);
      config.reset();
      await resolver.resolve(userId);
      const ttlBefore = await redis.ttl(`principal:${userId}`);
      expect(ttlBefore).toBeGreaterThan(0);
      expect(ttlBefore).toBeLessThanOrEqual(seededTtl);

      // Change the configuration through the ADMINISTRATIVE role. `app_rw`
      // holds SELECT only on the configuration tables (plan 01-03) — the
      // running application reads configuration and must not author it — so
      // this write uses `app_dba`, exactly as `prisma/seed.ts` does.
      // Attempting it as `app_rw` raises `permission denied`, which is the
      // grant posture working rather than an obstacle to route around.
      const changed = 77;
      await adminDb.query(
        `UPDATE platform.rule_package_versions
            SET config_snapshot = jsonb_set(
                  config_snapshot, '{session,claim_cache_seconds}', $1::jsonb)
          WHERE published_at IS NOT NULL`,
        [String(changed)],
      );

      try {
        config.reset();
        await resolver.invalidate(userId);
        await resolver.resolve(userId);

        const ttlAfter = await redis.ttl(`principal:${userId}`);
        expect(ttlAfter).toBeGreaterThan(0);
        expect(ttlAfter).toBeLessThanOrEqual(changed);
        // The decisive assertion: the window genuinely tracks the database.
        expect(ttlAfter).toBeLessThan(seededTtl);
      } finally {
        await adminDb.query(
          `UPDATE platform.rule_package_versions
              SET config_snapshot = jsonb_set(
                    config_snapshot, '{session,claim_cache_seconds}', $1::jsonb)
            WHERE published_at IS NOT NULL`,
          [String(seededTtl)],
        );
        config.reset();
        await resolver.invalidate(userId);
      }
    });
  });

  describe('revoking a grant', () => {
    /**
     * The pairing rule: invalidate the cache AND revoke the sessions.
     * Doing only one leaves a window in which a revoked entitlement is still
     * honoured, and this test shows both halves of that.
     */
    it('is not visible until the cache is invalidated — which is why the two are paired', async () => {
      if (!available) return;

      const userId = userIds.get('ao_program_manager') as string;

      // Warm the cache with the current entitlements.
      await resolver.invalidate(userId);
      const before = await resolver.resolve(userId);
      expect(before.entitlements).toContain('retention_viewer');

      const { rows } = await db.query<{ id: string }>(
        `SELECT id FROM platform.entitlement_grants
          WHERE user_id = $1 AND entitlement_key = 'retention_viewer'
            AND revoked_at IS NULL
          LIMIT 1`,
        [userId],
      );
      const grantId = rows[0].id;

      await db.query(
        `UPDATE platform.entitlement_grants
            SET revoked_at = now(), revoked_by = $2
          WHERE id = $1`,
        [grantId, userIds.get('system_admin')],
      );

      try {
        // WITHOUT invalidation the stale value persists — the window the
        // pairing rule exists to close.
        const stale = await resolver.resolve(userId);
        expect(stale.entitlements).toContain('retention_viewer');

        // WITH invalidation (+ session revocation, as plan 01-08 must do)
        // the next resolution reflects reality.
        await sessions.revokeAllForUser(userId);
        const fresh = await resolver.resolve(userId);
        expect(fresh.entitlements).not.toContain('retention_viewer');
      } finally {
        await db.query(
          `UPDATE platform.entitlement_grants
              SET revoked_at = NULL, revoked_by = NULL WHERE id = $1`,
          [grantId],
        );
        await resolver.invalidate(userId);
      }
    });

    it('a revoked grant is gone from the API response on the next request', async () => {
      if (!available) return;

      const userId = userIds.get('court_admin') as string;
      const { session_token } = await loginAs(app, 'court_admin');

      const before = await request(app.getHttpServer())
        .get('/api/v1/auth/entitlements')
        .set('Authorization', `Bearer ${session_token}`);
      expect(before.body.entitlements).toContain('disposition_confirm');

      const { rows } = await db.query<{ id: string }>(
        `SELECT id FROM platform.entitlement_grants
          WHERE user_id = $1 AND entitlement_key = 'disposition_confirm'
            AND revoked_at IS NULL LIMIT 1`,
        [userId],
      );
      const grantId = rows[0].id;

      await db.query(
        `UPDATE platform.entitlement_grants
            SET revoked_at = now(), revoked_by = $2 WHERE id = $1`,
        [grantId, userIds.get('system_admin')],
      );

      try {
        await resolver.invalidate(userId);

        const after = await request(app.getHttpServer())
          .get('/api/v1/auth/entitlements')
          .set('Authorization', `Bearer ${session_token}`);

        expect(after.status).toBe(200);
        expect(after.body.entitlements).not.toContain('disposition_confirm');
      } finally {
        await db.query(
          `UPDATE platform.entitlement_grants
              SET revoked_at = NULL, revoked_by = NULL WHERE id = $1`,
          [grantId],
        );
        await resolver.invalidate(userId);
      }
    });
  });
});
