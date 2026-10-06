import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

import type Redis from 'ioredis';

import { CourtConfigService } from '../src/modules/config/court-config.service';
import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import { REDIS_CLIENT } from '../src/modules/identity/redis.provider';
import { ApiException } from '../src/common/errors/api-error';
import {
  bootApp,
  loginAs,
  requireStack,
  testAdminDatabaseUrl,
} from './auth-harness';

/**
 * ============================================================================
 * THE CONFIGURATION READ PATH, AGAINST THE REAL STACK
 * ============================================================================
 *
 * Phase 1's configuration contract is that every configurable value is read
 * from the database and nothing falls back to a hardcoded constant. This suite
 * proves that over HTTP (the two read endpoints) and at the service seam
 * (`CourtConfigService.getEffective`), against the real seeded rows and the
 * real guard chain — a mocked configuration would prove nothing about the
 * property that matters.
 *
 * ## The constants test, and a deviation from the plan it is worth stating
 *
 * The plan's constants test drives `/files/upload` to show that changing the
 * seeded `file_type_allowlist` changes what the upload endpoint accepts. On
 * this branch the File/Malware Scanning Service (plan 01-10) is still a stub —
 * `/files/upload` does not exist — so that exact assertion cannot run here.
 *
 * It is replaced with the strongest equivalent this plan can own: change the
 * seeded snapshot through the administrative connection, invalidate the cache,
 * and assert that `CourtConfigService.getEffective` returns the NEW value. That
 * is the same property — configuration is genuinely read from the database
 * rather than mirrored into a constant — observed at the read path every
 * consumer (including the future `/files/upload`) goes through, rather than at
 * one consumer that does not exist yet. The original value is restored
 * afterwards so the seed converges on a second boot.
 */

jest.setTimeout(300_000);

const NDCA_COURT_ID = '0a000001-0000-4000-8000-000000000001';
const SDNY_COURT_ID = '0a000001-0000-4000-8000-000000000002';
const NDCA_RULE_PACKAGE_ID = '0a000008-0000-4000-8000-000000000001';

/**
 * Close Node's global `fetch` (undici) connection pool.
 *
 * The real-IdP harness probes the stack with the global `fetch`, which pools
 * its TLS socket. Under the hermetic jest config — which, unlike the policy and
 * auth configs, does not set `forceExit` — that lingering socket keeps the
 * process alive after the tests pass. Closing the dispatcher releases it.
 */
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

describe('config-read-path: configuration is read from the database (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let adminDb: Client;
  let configService: CourtConfigService;
  let available = false;

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;

    ({ app, restoreEnv } = await bootApp());

    const provider = app.get(OidcProvider);
    for (let i = 0; i < 60 && !provider.isReady(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // The configuration tables are SELECT-only for app_rw; writing a seeded
    // value for the constants test is an administrative act, performed as
    // app_dba exactly as the seed does.
    adminDb = new Client({ connectionString: testAdminDatabaseUrl() });
    await adminDb.connect();

    configService = app.get(CourtConfigService);
  });

  afterAll(async () => {
    await adminDb?.end();
    // This suite runs under the HERMETIC jest config (no `forceExit`, unlike
    // the policy/auth configs), so the shared ioredis connection must be
    // closed explicitly or the process hangs after the run.
    try {
      const redis = app?.get<Redis>(REDIS_CLIENT, { strict: false });
      await redis?.quit();
    } catch {
      /* no redis in this run */
    }
    await app?.close();
    // Node's global `fetch` (undici) keeps a pooled TLS connection alive after
    // the `requireStack()` probe, which would hang this suite under the
    // hermetic jest config (no `forceExit`). Close the global dispatcher so the
    // process can exit cleanly on the plan's literal verify command.
    await closeGlobalFetch();
    restoreEnv?.();
  });

  const get = (path: string, token: string): request.Test =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`);

  it('returns the effective rule package for the caller\'s own court', async () => {
    if (!available) return;

    const { session_token } = await loginAs(app, 'clerk_case_admin');

    const res = await get(
      `/api/v1/config/rule-packages/${NDCA_COURT_ID}/effective`,
      session_token,
    );

    expect(res.status).toBe(200);
    const pkg = res.body.rule_package_version;
    expect(pkg.version_number).toBe(1);
    expect(pkg.config_snapshot.file_type_allowlist).toEqual(
      expect.arrayContaining(['application/pdf']),
    );
    expect(pkg.config_snapshot.session.claim_cache_seconds).toBe(300);
    expect(pkg.config_snapshot.max_upload_bytes).toBeGreaterThan(0);
  });

  it('denies a configuration read for another court (cross-court isolation)', async () => {
    if (!available) return;

    // clerk_case_admin belongs to NDCA. Reading SDNY's configuration must be
    // refused by the same multi-tenancy boundary that protects a case.
    const { session_token } = await loginAs(app, 'clerk_case_admin');

    const res = await get(
      `/api/v1/config/rule-packages/${SDNY_COURT_ID}/effective`,
      session_token,
    );

    expect(res.status).toBe(403);
  });

  it('getEffective returns all five designation→entitlement mappings', async () => {
    if (!available) return;

    const effective = await configService.getEffective(NDCA_COURT_ID);

    const designations = effective.security_policies
      .map((p) => p.designation)
      .sort();
    expect(designations).toEqual([
      'grand_jury',
      'juvenile',
      'pii',
      'restricted',
      'sealed',
    ]);
    expect(
      effective.security_policies.find((p) => p.designation === 'sealed')
        ?.required_entitlement,
    ).toBe('designation_sealed');
  });

  it('reads a changed seeded value from the database, not a constant', async () => {
    if (!available) return;

    // Baseline through the read path.
    const before = await configService.getEffective(NDCA_COURT_ID);
    expect(before.session.claim_cache_seconds).toBe(300);
    expect(before.file_type_allowlist).toContain('image/png');

    const originalSnapshot = JSON.stringify(
      (
        await adminDb.query(
          `SELECT config_snapshot FROM platform.rule_package_versions WHERE id = $1`,
          [NDCA_RULE_PACKAGE_ID],
        )
      ).rows[0].config_snapshot,
    );

    try {
      // Change the seeded snapshot: a different cache window and a narrower
      // allowlist (image/png removed).
      const mutated = {
        file_type_allowlist: ['application/pdf', 'text/plain'],
        session: {
          access_token_ttl_seconds: 900,
          refresh_token_ttl_seconds: 604800,
          idle_timeout_minutes: 30,
          claim_cache_seconds: 42,
          concurrent_session_limit: 3,
        },
        max_upload_bytes: 52428800,
      };
      await adminDb.query(
        `UPDATE platform.rule_package_versions SET config_snapshot = $1 WHERE id = $2`,
        [JSON.stringify(mutated), NDCA_RULE_PACKAGE_ID],
      );

      // The cache is the only thing that could mask the change — Phase 2's
      // publish flow would call invalidate(); here the test does.
      await configService.invalidate(NDCA_COURT_ID);

      const after = await configService.getEffective(NDCA_COURT_ID);
      // The BEHAVIORAL change: the value the system reads has actually changed,
      // which is only true if it is genuinely read from the database.
      expect(after.session.claim_cache_seconds).toBe(42);
      expect(after.file_type_allowlist).not.toContain('image/png');
      expect(after.file_type_allowlist).toEqual([
        'application/pdf',
        'text/plain',
      ]);
    } finally {
      await adminDb.query(
        `UPDATE platform.rule_package_versions SET config_snapshot = $1 WHERE id = $2`,
        [originalSnapshot, NDCA_RULE_PACKAGE_ID],
      );
      await configService.invalidate(NDCA_COURT_ID);
    }
  });

  it('raises CONFIG_INVALID_SNAPSHOT for a corrupted snapshot, not a default', async () => {
    if (!available) return;

    const originalSnapshot = JSON.stringify(
      (
        await adminDb.query(
          `SELECT config_snapshot FROM platform.rule_package_versions WHERE id = $1`,
          [NDCA_RULE_PACKAGE_ID],
        )
      ).rows[0].config_snapshot,
    );

    try {
      // A snapshot missing its required fields entirely.
      await adminDb.query(
        `UPDATE platform.rule_package_versions SET config_snapshot = $1 WHERE id = $2`,
        [JSON.stringify({ nonsense: true }), NDCA_RULE_PACKAGE_ID],
      );
      await configService.invalidate(NDCA_COURT_ID);

      await expect(configService.getEffective(NDCA_COURT_ID)).rejects.toThrow(
        ApiException,
      );
      await expect(
        configService.getEffective(NDCA_COURT_ID),
      ).rejects.toMatchObject({ errorCode: 'CONFIG_INVALID_SNAPSHOT' });
    } finally {
      await adminDb.query(
        `UPDATE platform.rule_package_versions SET config_snapshot = $1 WHERE id = $2`,
        [originalSnapshot, NDCA_RULE_PACKAGE_ID],
      );
      await configService.invalidate(NDCA_COURT_ID);
    }
  });

  it('does not expose POST /config/rule-packages (Phase 2 authoring)', async () => {
    if (!available) return;

    const { session_token } = await loginAs(app, 'court_admin');

    const res = await request(app.getHttpServer())
      .post('/api/v1/config/rule-packages')
      .set('Authorization', `Bearer ${session_token}`)
      .send({ court_id: NDCA_COURT_ID });

    // The route does not exist in Phase 1. Nest answers an unrouted path with
    // 404; what matters is that there is no authoring handler, not the exact
    // status.
    expect([404, 405]).toContain(res.status);
  });
});
