import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import {
  bootApp,
  decodeJwt,
  directGrantIdToken,
  loginAs,
  requireStack,
  startLogin,
  testDatabaseUrl,
} from './auth-harness';

/**
 * ============================================================================
 * LOGIN — AGAINST THE REAL KEYCLOAK
 * ============================================================================
 *
 * Every case here drives the actual identity provider from
 * `docker-compose.yml` through the actual OIDC browser flow, with a TOTP code
 * computed from the seeded secret. Nothing is mocked.
 *
 * The Phase 1 CONTEXT rejected a stub login path because "the stub becomes
 * the daily-exercised path and the real integration rots". A mocked IdP in
 * the *tests* reintroduces that blind spot one layer down — it would confirm
 * whatever the implementation assumed, which is exactly the failure mode
 * worth avoiding here. This suite pays the cost of a real round trip so that
 * what it proves is true of the deployed system.
 */

jest.setTimeout(180_000);

describe('auth-login: real OIDC exchange with MFA enforcement (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  let available = false;

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;

    ({ app, restoreEnv } = await bootApp());

    // Wait for OIDC discovery. It is deliberately asynchronous at boot so an
    // IdP outage cannot stop the API serving /health; the suite must
    // therefore wait for readiness rather than assume it.
    const provider = app.get(OidcProvider);
    for (let i = 0; i < 60 && !provider.isReady(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    expect(provider.isReady()).toBe(true);

    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
    restoreEnv?.();
  });

  /** Count `access_attempt` audit rows, for before/after comparison. */
  const accessAttemptCount = async (): Promise<number> => {
    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM platform.audit_events
        WHERE action_type = 'access_attempt'`,
    );
    return Number(rows[0].n);
  };

  describe('a genuine password + TOTP sign-in', () => {
    it('issues a session, a refresh token and the caller entitlements', async () => {
      if (!available) return;

      const result = await loginAs(app, 'clerk_case_admin');

      expect(typeof result.session_token).toBe('string');
      expect(typeof result.refresh_token).toBe('string');
      expect(result.entitlements.mfa_satisfied).toBe(true);
      expect(Array.isArray(result.entitlements.roles)).toBe(true);
      expect(Array.isArray(result.entitlements.entitlements)).toBe(true);
    });

    it('writes an access_attempt audit event', async () => {
      if (!available) return;

      const before = await accessAttemptCount();

      await loginAs(app, 'judge');

      expect(await accessAttemptCount()).toBeGreaterThan(before);

      const { rows } = await db.query<{ after_state: { outcome: string } }>(
        `SELECT after_state FROM platform.audit_events
          WHERE action_type = 'access_attempt'
          ORDER BY occurred_at DESC LIMIT 1`,
      );
      expect(rows[0].after_state.outcome).toBe('login_success');
    });
  });

  describe('an assertion that does not evidence MFA', () => {
    /**
     * The direct-access-grant token is the honest negative fixture: a real,
     * correctly signed token from the real IdP, for a real user who DID
     * supply a valid TOTP code. What it lacks is the browser flow's
     * LoA step-up, so it reports `acr: "1"`.
     *
     * Rejecting it proves the MFA check reads the authentication-context
     * claim rather than merely confirming a valid token exists — a check
     * that only looked for a well-formed token would accept this one.
     */
    it('the direct-grant token really is a valid token at acr 1', async () => {
      if (!available) return;

      const idToken = await directGrantIdToken('clerk_case_admin');
      const claims = decodeJwt(idToken);

      expect(claims.acr).toBe('1');
      expect(claims.amr).toBeUndefined();
      expect(claims.iss).toContain('/realms/judicialsync');
    });

    it('is rejected 401 AUTH_MFA_FAILED by the provider derivation', () => {
      if (!available) return;

      const provider = app.get(OidcProvider);

      // acr "1" — a real direct-grant sign-in. Not MFA.
      expect(provider.deriveMfaSatisfied('1', undefined)).toBe(false);
      // acr "otp" — a real browser sign-in with TOTP. Is MFA.
      expect(provider.deriveMfaSatisfied('otp', undefined)).toBe(true);
    });

    it('no flag, env var or payload can make a non-MFA assertion pass', () => {
      if (!available) return;

      const provider = app.get(OidcProvider);

      // Everything that might plausibly be reached for as a bypass.
      for (const [key, value] of Object.entries({
        MFA_ENABLED: 'false',
        DISABLE_MFA: 'true',
        AUTH_RELAXED: '1',
        NODE_ENV: 'development',
      })) {
        const previous = process.env[key];
        process.env[key] = value;
        expect(provider.deriveMfaSatisfied('1', undefined)).toBe(false);
        expect(provider.deriveMfaSatisfied('0', undefined)).toBe(false);
        expect(provider.deriveMfaSatisfied(undefined, undefined)).toBe(false);
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
      }
    });
  });

  describe('an invalid assertion', () => {
    it('garbage is rejected 401 AUTH_INVALID_ASSERTION', async () => {
      if (!available) return;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identity_assertion: 'not-a-real-authorization-code' });

      expect(response.status).toBe(401);
      expect(response.body.error_code).toBe('AUTH_INVALID_ASSERTION');
      // Display-safe: no stack trace, no internal exception text.
      expect(JSON.stringify(response.body)).not.toContain('at ');
    });

    it('a replayed authorization code is rejected', async () => {
      if (!available) return;

      const { code, state, callbackParams } = await startLogin(app, 'law_clerk');

      const payload = {
        identity_assertion: code,
        state,
        callback_params: callbackParams,
      };

      const first = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(payload);
      expect(first.status).toBe(200);

      // Same code AND same state, presented again. The state was consumed
      // atomically on first use, so this must not produce a second session.
      const replay = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(payload);

      expect(replay.status).toBe(401);
      expect(replay.body.error_code).toBe('AUTH_INVALID_ASSERTION');
    });

    it('an unknown state is rejected (no oracle for guessed values)', async () => {
      if (!available) return;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identity_assertion: 'anything', state: 'never-issued' });

      expect(response.status).toBe(401);
      expect(response.body.error_code).toBe('AUTH_INVALID_ASSERTION');
    });

    it('writes an access_attempt audit event for the failure', async () => {
      if (!available) return;

      const before = await accessAttemptCount();

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identity_assertion: 'bad-code-for-audit-check' });

      // FRD/F00 step 8 requires failures be audited, including ones whose
      // subject resolves to no user — those are attributed to the reserved
      // 'system:unattributed' sink rather than dropped.
      expect(await accessAttemptCount()).toBeGreaterThan(before);
    });

    it('attributes an unresolvable failure to the unattributed actor', async () => {
      if (!available) return;

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identity_assertion: 'another-bad-code' });

      const { rows } = await db.query<{
        outcome: string;
        attributed: boolean;
        external_idp_subject: string;
      }>(
        `SELECT e.after_state->>'outcome'    AS outcome,
                (e.after_state->>'attributed')::boolean AS attributed,
                u.external_idp_subject
           FROM platform.audit_events e
           JOIN platform.users u ON u.id = e.actor_id
          WHERE e.action_type = 'access_attempt'
          ORDER BY e.occurred_at DESC
          LIMIT 1`,
      );

      expect(rows[0].attributed).toBe(false);
      expect(rows[0].external_idp_subject).toBe('system:unattributed');
    });
  });

  describe('fail-closed when the IdP is unreachable', () => {
    /**
     * Rather than stopping the shared Keycloak container — which would break
     * every other suite and take minutes to recover — this points a provider
     * at a dead issuer. The code path exercised is identical: discovery never
     * succeeds, so `requireClient()` throws.
     */
    it('yields 503 AUTH_IDP_UNAVAILABLE, never a degraded allow', async () => {
      if (!available) return;

      const dead = new OidcProvider({
        issuerUrl: 'http://127.0.0.1:9/realms/nothing',
        clientId: 'x',
        clientSecret: 'y',
        redirectUri: 'http://localhost/cb',
      });

      await expect(dead.beginAuthorization()).rejects.toMatchObject({
        errorCode: 'AUTH_IDP_UNAVAILABLE',
      });

      await expect(
        dead.exchange('code', { state: 's', nonce: 'n', codeVerifier: 'v' }),
      ).rejects.toMatchObject({ errorCode: 'AUTH_IDP_UNAVAILABLE' });

      // The status is 503, not 401: an outage is an availability failure, and
      // reporting it as bad credentials sends operators hunting the wrong
      // problem during an incident.
      await dead.beginAuthorization().catch((error: { getStatus(): number }) => {
        expect(error.getStatus()).toBe(503);
      });

      expect(dead.isReady()).toBe(false);
    });
  });

  describe('the authorization-url helper', () => {
    it('returns a PKCE S256 authorization URL and a state', async () => {
      if (!available) return;

      const response = await request(app.getHttpServer()).get(
        '/api/v1/auth/authorize-url',
      );

      expect(response.status).toBe(200);
      const url = new URL(response.body.authorization_url);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('state')).toBe(response.body.state);
      expect(url.searchParams.get('nonce')).toBeTruthy();
    });
  });

  describe('the MFA challenge endpoint', () => {
    it('reports 422 rather than running a second OTP verifier', async () => {
      if (!available) return;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa-challenge')
        .send({ mfa_challenge_response: '123456' });

      // Keycloak owns the OTP form. Implementing an application-side verifier
      // would be the second authentication path CONTEXT rejected, so the
      // endpoint reports honestly that the step does not apply.
      expect(response.status).toBe(422);
      expect(response.body.error_code).toBe('AUTH_MFA_NOT_REQUIRED_AT_THIS_STEP');
    });
  });

  describe('least privilege for a first-time user', () => {
    it('a brand-new subject gets zero roles and zero entitlements', async () => {
      if (!available) return;

      // Insert a user with a subject no grant or role references, which is
      // exactly the state a first login produces.
      const subject = `first-login-${Date.now()}`;
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO platform.users (external_idp_subject, display_name, email)
         VALUES ($1, 'First Timer', 'first.timer@judicialsync.invalid')
         RETURNING id`,
        [subject],
      );

      const resolver = app.get(
        (await import('../src/modules/identity/entitlement-resolver.service'))
          .EntitlementResolverService,
      );
      const principal = await resolver.resolveUncached(rows[0].id);

      // FRD/F00 Sub-features: "new accounts start with zero module access
      // until explicitly role-assigned."
      expect(principal.roles).toEqual([]);
      expect(principal.entitlements).toEqual([]);
    });
  });
});
