import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

import { SessionConfigService } from '../src/modules/identity/session-config.service';
import { SessionService, hashToken } from '../src/modules/identity/session.service';
import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import {
  bootApp,
  loginAs,
  requireStack,
  testDatabaseUrl,
} from './auth-harness';

/**
 * ============================================================================
 * SESSION LIFECYCLE — revocation, rotation, reuse, concurrency
 * ============================================================================
 *
 * Every session here is created by a **real** sign-in against the real
 * Keycloak (password + TOTP through the browser flow), so what is under test
 * is the lifecycle of a session the system would actually issue.
 *
 * The load-bearing assertion in this file is the revocation one. A JWT is a
 * statement that was true when signed; the only thing that makes revocation
 * mean anything is that `validate()` re-reads the session row on every
 * request. `TechArch/04-security.md` §7.1 requires that explicitly — "not
 * merely token expiry" — and the test proves it by revoking and then
 * immediately reusing the **same** token, with no waiting.
 */

jest.setTimeout(240_000);

describe('auth-session: issuance, revocation and rotation (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  let sessions: SessionService;
  let available = false;

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;

    ({ app, restoreEnv } = await bootApp());

    const provider = app.get(OidcProvider);
    for (let i = 0; i < 60 && !provider.isReady(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    sessions = app.get(SessionService);
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
    restoreEnv?.();
  });

  const getEntitlements = (token: string) =>
    request(app.getHttpServer())
      .get('/api/v1/auth/entitlements')
      .set('Authorization', `Bearer ${token}`);

  describe('a valid session', () => {
    it('reaches a @SelfScoped() route', async () => {
      if (!available) return;

      const { session_token } = await loginAs(app, 'clerk_case_admin');
      const response = await getEntitlements(session_token);

      expect(response.status).toBe(200);
      expect(response.body.user_id).toBeTruthy();
      expect(response.body.mfa_satisfied).toBe(true);
    });

    it('is rejected without a bearer token', async () => {
      if (!available) return;

      const response = await request(app.getHttpServer()).get(
        '/api/v1/auth/entitlements',
      );

      expect(response.status).toBe(401);
      expect(response.body.error_code).toBe('AUTH_SESSION_EXPIRED');
    });

    it('is rejected with a forged token', async () => {
      if (!available) return;

      const response = await getEntitlements(
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdHRhY2tlciIsInNpZCI6IngifQ.bogus',
      );

      expect(response.status).toBe(401);
      expect(response.body.error_code).toBe('AUTH_SESSION_EXPIRED');
    });
  });

  describe('logout revokes on the NEXT request, not at expiry', () => {
    it('the same token stops working immediately after logout', async () => {
      if (!available) return;

      const { session_token } = await loginAs(app, 'judge');

      // Works before.
      expect((await getEntitlements(session_token)).status).toBe(200);

      const logout = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${session_token}`);
      expect(logout.status).toBe(204);

      // The SAME token, immediately. No waiting for expiry — this is the
      // whole point of the per-request revocation read. The access token is
      // still cryptographically valid and still unexpired; it must be
      // rejected anyway.
      const after = await getEntitlements(session_token);
      expect(after.status).toBe(401);
      expect(after.body.error_code).toBe('AUTH_SESSION_EXPIRED');
    });
  });

  describe('revokeAllForUser forces re-authentication', () => {
    it('an active token is rejected on the next request', async () => {
      if (!available) return;

      const { session_token, entitlements } = await loginAs(app, 'court_admin');
      expect((await getEntitlements(session_token)).status).toBe(200);

      // What FRD/F00 Process step 7 requires on any role or scope change.
      const revoked = await sessions.revokeAllForUser(entitlements.user_id);
      expect(revoked).toBeGreaterThanOrEqual(1);

      const after = await getEntitlements(session_token);
      expect(after.status).toBe(401);
      expect(after.body.error_code).toBe('AUTH_SESSION_EXPIRED');
    });
  });

  describe('refresh rotation', () => {
    it('rotates: the old refresh token dies, the new one works', async () => {
      if (!available) return;

      const { refresh_token } = await loginAs(app, 'law_clerk');

      const rotated = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token });

      expect(rotated.status).toBe(200);
      expect(typeof rotated.body.session_token).toBe('string');
      expect(rotated.body.refresh_token).not.toBe(refresh_token);

      // The new access token works.
      expect((await getEntitlements(rotated.body.session_token)).status).toBe(200);

      // The new refresh token works.
      const again = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: rotated.body.refresh_token });
      expect(again.status).toBe(200);
    });

    it('the access token issued before rotation is dead afterwards', async () => {
      if (!available) return;

      const { session_token, refresh_token } = await loginAs(app, 'courtroom_deputy');
      expect((await getEntitlements(session_token)).status).toBe(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token })
        .expect(200);

      // Rotation revoked the old session, so its access token must stop
      // working — otherwise rotation would add a credential rather than
      // replace one.
      expect((await getEntitlements(session_token)).status).toBe(401);
    });
  });

  describe('refresh token reuse is treated as compromise', () => {
    it('replaying a rotated token revokes ALL of that user\u2019s sessions', async () => {
      if (!available) return;

      const first = await loginAs(app, 'system_admin');
      const userId = first.entitlements.user_id;

      const rotated = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: first.refresh_token })
        .expect(200);

      // The rotated-away token still works at this point.
      expect((await getEntitlements(rotated.body.session_token)).status).toBe(200);

      // Replay the ALREADY-SPENT token. Either an attacker is replaying a
      // stolen token or the real user is replaying one an attacker already
      // spent — indistinguishable, and both are compromise.
      const replay = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: first.refresh_token });

      expect(replay.status).toBe(401);
      expect(replay.body.error_code).toBe('AUTH_SESSION_EXPIRED');

      // EVERY session for the user is now dead, including the one the
      // legitimate rotation had just produced.
      expect((await getEntitlements(rotated.body.session_token)).status).toBe(401);

      const { rows } = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM platform.sessions
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
      expect(Number(rows[0].n)).toBe(0);
    });

    it('writes an access_attempt audit event naming the reuse', async () => {
      if (!available) return;

      const first = await loginAs(app, 'ao_program_manager');
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: first.refresh_token })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: first.refresh_token })
        .expect(401);

      const { rows } = await db.query<{ outcome: string }>(
        `SELECT after_state->>'outcome' AS outcome
           FROM platform.audit_events
          WHERE action_type = 'access_attempt'
            AND actor_id = $1
          ORDER BY occurred_at DESC
          LIMIT 5`,
        [first.entitlements.user_id],
      );

      expect(rows.map((r) => r.outcome)).toContain(
        'refresh_token_reuse_detected',
      );
    });
  });

  describe('refresh tokens are never stored in plaintext', () => {
    it('sessions.refresh_token_hash never equals the token', async () => {
      if (!available) return;

      const { refresh_token, entitlements } = await loginAs(app, 'security_officer');

      const { rows } = await db.query<{ refresh_token_hash: string }>(
        `SELECT refresh_token_hash FROM platform.sessions
          WHERE user_id = $1 AND revoked_at IS NULL
          ORDER BY issued_at DESC LIMIT 1`,
        [entitlements.user_id],
      );

      expect(rows).toHaveLength(1);
      const stored = rows[0].refresh_token_hash;

      // A database leak must not yield usable credentials.
      expect(stored).not.toBe(refresh_token);
      expect(stored).not.toContain(refresh_token);
      // SHA-256 hex.
      expect(stored).toMatch(/^[0-9a-f]{64}$/);
      expect(stored).toBe(hashToken(refresh_token));
    });
  });

  describe('the concurrent session limit', () => {
    it('issuing beyond the seeded limit of 3 revokes the oldest', async () => {
      if (!available) return;

      const config = app.get(SessionConfigService);
      const { concurrent_session_limit } = await config.get();
      expect(concurrent_session_limit).toBe(3);

      // Use the service directly: four REAL browser logins would each burn a
      // 30-second TOTP window, and the behaviour under test is the session
      // layer's, not the IdP's.
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO platform.users (external_idp_subject, display_name, email)
         VALUES ($1, 'Concurrency Probe', 'concurrency@judicialsync.invalid')
         RETURNING id`,
        [`concurrency-${Date.now()}`],
      );
      const userId = rows[0].id;

      const issued = [];
      for (let i = 0; i < 4; i += 1) {
        issued.push(await sessions.issue(userId, true));
      }

      const active = await sessions.activeSessions(userId);
      expect(active).toHaveLength(concurrent_session_limit);

      // The oldest was revoked; the newest three survive.
      const activeIds = active.map((s) => s.id);
      expect(activeIds).not.toContain(issued[0].session_id);
      expect(activeIds).toContain(issued[3].session_id);
    });
  });

  describe('session TTLs come from the database, not constants', () => {
    it('reads access and refresh TTLs from the seeded rule package', async () => {
      if (!available) return;

      const { rows } = await db.query<{ session: Record<string, number> }>(
        `SELECT config_snapshot->'session' AS session
           FROM platform.rule_package_versions
          WHERE published_at IS NOT NULL
          ORDER BY published_at DESC LIMIT 1`,
      );
      const seeded = rows[0].session;

      const config = app.get(SessionConfigService);
      config.reset();
      const loaded = await config.get();

      expect(loaded.access_token_ttl_seconds).toBe(
        seeded.access_token_ttl_seconds,
      );
      expect(loaded.refresh_token_ttl_seconds).toBe(
        seeded.refresh_token_ttl_seconds,
      );
      expect(loaded.claim_cache_seconds).toBe(seeded.claim_cache_seconds);

      // And the issued session's expiry actually reflects the configured
      // refresh TTL, rather than the value merely being read and ignored.
      const probe = await db.query<{ id: string }>(
        `INSERT INTO platform.users (external_idp_subject, display_name, email)
         VALUES ($1, 'TTL Probe', 'ttl@judicialsync.invalid') RETURNING id`,
        [`ttl-probe-${Date.now()}`],
      );
      const issued = await sessions.issue(probe.rows[0].id, true);
      expect(issued.expires_in).toBe(seeded.access_token_ttl_seconds);

      const stored = await db.query<{ seconds: string }>(
        `SELECT EXTRACT(EPOCH FROM (expires_at - issued_at))::text AS seconds
           FROM platform.sessions WHERE id = $1`,
        [issued.session_id],
      );
      expect(Math.round(Number(stored.rows[0].seconds))).toBe(
        seeded.refresh_token_ttl_seconds,
      );
    });
  });
});
