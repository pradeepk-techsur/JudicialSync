import { execFileSync } from 'node:child_process';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import {
  bootApp,
  loginAs,
  requireStack,
  testOpaUrl,
} from './auth-harness';
import { AbacProbeModule, CASE_IDS } from './abac-probe.controller';

/**
 * ============================================================================
 * THE PROOF THAT THE SYSTEM FAILS CLOSED
 * ============================================================================
 *
 * `FRD/Y2-errors.md` principle 1 — "Fail closed, not open: any ambiguity in
 * an access-control or policy-evaluation check (e.g., F13's policy engine
 * unavailable) must deny the action (503/403) rather than default-allow" —
 * and `FRD/F13`'s `SECURITY_POLICY_UNAVAILABLE` row are the two requirements
 * this file exists to discharge.
 *
 * ## Why the OPA container is genuinely stopped
 *
 * The decisive case below runs `docker compose stop opa` and asserts that a
 * request which returned **200 moments earlier** now returns **503**, then
 * restarts the container and asserts the same request returns 200 again.
 *
 * Both halves matter. Without the restart the test would pass equally well if
 * something unrelated had broken the request — the round trip is what pins
 * the 503 to the PDP's absence rather than to any other cause. And the
 * preceding 200 is what makes it a *change* rather than a route that never
 * worked.
 *
 * ## Why the other cases use a stub rather than the real container
 *
 * A PDP that is *reachable but wrong* — answering `{"result": {}}`, or
 * answering too slowly — cannot be produced by stopping a container, and
 * those are the failure modes most likely to be mishandled: an unreachable
 * host throws loudly, while a 200 carrying a malformed body looks like a
 * successful evaluation and is exactly what a misconfigured bundle emits. So
 * those cases point `OPA_URL` at a local stub that misbehaves deliberately.
 */

jest.setTimeout(300_000);

const SERVICE_TOKEN = 'policy-evaluate-suite-token';

/** Seeded user ids, from `prisma/seed/ids.ts`. */
const USERS = {
  clerk_case_admin: '0a000004-0000-4000-8000-000000000004',
  jury_admin: '0a000004-0000-4000-8000-000000000006',
} as const;

const compose = (...args: string[]): void => {
  execFileSync('docker', ['compose', ...args], {
    cwd: `${__dirname}/../../..`,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
};

/** Wait until OPA answers its health endpoint again. */
const waitForOpa = async (timeoutMs = 120_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${testOpaUrl()}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('OPA did not become healthy again within the timeout.');
};

describe('abac-fail-closed: an unevaluable request is denied, never allowed (e2e)', () => {
  let available = false;

  beforeAll(async () => {
    available = await requireStack();
  });

  /**
   * Boot an app whose PDP points wherever the case needs.
   *
   * Each case gets its own app because `OPA_URL` is read per evaluation but
   * the module graph is built once, and because a suite that mutated one
   * shared app's environment would leak state between cases in a file whose
   * whole subject is failure handling.
   */
  const bootWith = async (
    env: Record<string, string | undefined>,
  ): Promise<{ app: INestApplication; restoreEnv: () => void }> => {
    const booted = await bootApp(
      { INTERNAL_SERVICE_TOKEN: SERVICE_TOKEN, ...env },
      [AbacProbeModule],
    );
    const provider = booted.app.get(OidcProvider);
    for (let i = 0; i < 60 && !provider.isReady(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return booted;
  };

  /** A stub PDP that responds however the case requires. */
  const stubPdp = async (
    handler: (respond: (status: number, body: string) => void) => void,
  ): Promise<{ url: string; close: () => Promise<void> }> => {
    const server: Server = createServer((_req, res) => {
      handler((status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(body);
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve()),
    );
    const { port } = server.address() as AddressInfo;
    return {
      url: `http://127.0.0.1:${port}`,
      close: () =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    };
  };

  // =========================================================================
  // THE DECISIVE CASE — the real container, genuinely stopped
  // =========================================================================

  describe('with the OPA container stopped', () => {
    it('turns a 200 into a 503 SECURITY_POLICY_UNAVAILABLE, and back again', async () => {
      if (!available) return;

      const { app, restoreEnv } = await bootWith({});
      const { session_token } = await loginAs(app, 'clerk_case_admin');
      const path = `/api/v1/abac-probe/cases/${CASE_IDS.plain}`;
      const call = (): request.Test =>
        request(app.getHttpServer())
          .get(path)
          .set('Authorization', `Bearer ${session_token}`);

      try {
        // 1. The request works.
        expect((await call()).status).toBe(200);

        // 2. The PDP goes away.
        compose('stop', 'opa');
        try {
          const denied = await call();

          // Not 200. Not 500. The specified fail-closed response.
          expect(denied.status).toBe(503);
          expect(denied.body).toEqual({
            error_code: 'SECURITY_POLICY_UNAVAILABLE',
            message: 'Access cannot be evaluated at this time; request denied',
          });
          expect(denied.body).not.toHaveProperty('reached');
        } finally {
          compose('start', 'opa');
          await waitForOpa();
        }

        // 3. The SAME request works again. This is what pins the 503 to the
        //    PDP's absence rather than to anything else that might have
        //    broken in between.
        expect((await call()).status).toBe(200);
      } finally {
        await app.close();
        restoreEnv();
      }
    });
  });

  // =========================================================================
  // REACHABLE BUT WRONG — the cases a stopped container cannot produce
  // =========================================================================

  describe('with a PDP that is reachable but misbehaving', () => {
    it('denies 503 on a malformed body with no allow key', async () => {
      if (!available) return;

      // `{"result": {}}` with a 200 is precisely what OPA returns for an
      // undefined document — the most likely shape of a bundle that failed to
      // load, and the one where "the policy said nothing" could most easily
      // be misread as "the policy said yes".
      const stub = await stubPdp((respond) => respond(200, '{"result":{}}'));
      const { app, restoreEnv } = await bootWith({ OPA_URL: stub.url });

      try {
        const { session_token } = await loginAs(app, 'clerk_case_admin');
        const response = await request(app.getHttpServer())
          .get(`/api/v1/abac-probe/cases/${CASE_IDS.plain}`)
          .set('Authorization', `Bearer ${session_token}`);

        expect(response.status).toBe(503);
        expect(response.body.error_code).toBe('SECURITY_POLICY_UNAVAILABLE');
      } finally {
        await app.close();
        restoreEnv();
        await stub.close();
      }
    });

    it('denies 503 when the PDP is slower than PDP_TIMEOUT_MS, without hanging', async () => {
      if (!available) return;

      // Never responds. Without a bounded timeout the request would hang
      // until some other layer gave up — and a hung authorization check is
      // its own availability failure, on top of leaving the outcome
      // undefined.
      const stub = await stubPdp(() => undefined);
      const { app, restoreEnv } = await bootWith({
        OPA_URL: stub.url,
        PDP_TIMEOUT_MS: '1000',
      });

      try {
        const { session_token } = await loginAs(app, 'clerk_case_admin');

        const started = Date.now();
        const response = await request(app.getHttpServer())
          .get(`/api/v1/abac-probe/cases/${CASE_IDS.plain}`)
          .set('Authorization', `Bearer ${session_token}`);
        const elapsed = Date.now() - started;

        expect(response.status).toBe(503);
        expect(response.body.error_code).toBe('SECURITY_POLICY_UNAVAILABLE');
        // Bounded, not merely eventual.
        expect(elapsed).toBeLessThan(15_000);
      } finally {
        await app.close();
        restoreEnv();
        await stub.close();
      }
    });

    it('denies 503 on a non-200 status from the PDP', async () => {
      if (!available) return;

      const stub = await stubPdp((respond) => respond(500, '{"error":"boom"}'));
      const { app, restoreEnv } = await bootWith({ OPA_URL: stub.url });

      try {
        const { session_token } = await loginAs(app, 'clerk_case_admin');
        const response = await request(app.getHttpServer())
          .get(`/api/v1/abac-probe/cases/${CASE_IDS.plain}`)
          .set('Authorization', `Bearer ${session_token}`);

        expect(response.status).toBe(503);
      } finally {
        await app.close();
        restoreEnv();
        await stub.close();
      }
    });
  });

  // =========================================================================
  // POST /security/policy-evaluate
  // =========================================================================

  describe('POST /security/policy-evaluate', () => {
    let app: INestApplication;
    let restoreEnv: () => void;

    beforeAll(async () => {
      if (!available) return;
      ({ app, restoreEnv } = await bootWith({}));
    });

    afterAll(async () => {
      await app?.close();
      restoreEnv?.();
    });

    /**
     * `omitToken` is a separate flag rather than `token?: string` with a
     * default, and the distinction is not stylistic.
     *
     * A default parameter applies when the argument is `undefined` —
     * including when `undefined` is passed EXPLICITLY. So
     * `evaluate(user, body, undefined)`, written to mean "send no token",
     * silently sent the valid one, and the no-token case asserted 403 against
     * a fully authenticated request and got 200.
     *
     * That failure looked exactly like a missing guard. It was worth ruling
     * that out directly (the guard is `ServiceTokenGuard`, applied at the
     * controller and covered by the Authorization-header case below) before
     * concluding the test was at fault — a test bug and an authorization hole
     * present identically here, and assuming the former is how a real one
     * gets written off.
     */
    const evaluate = (
      subjectId: string,
      body: Record<string, unknown>,
      options: { omitToken?: boolean } = {},
    ): request.Test => {
      const req = request(app.getHttpServer())
        .post('/api/v1/security/policy-evaluate')
        .set('x-service-actor-id', subjectId)
        .send(body);
      return options.omitToken === true
        ? req
        : req.set('x-service-token', SERVICE_TOKEN);
    };

    it('refuses a call with no service token → 403', async () => {
      if (!available) return;

      const response = await evaluate(
        USERS.clerk_case_admin,
        { object_type: 'case', object_id: CASE_IDS.plain, requester_scope: [] },
        { omitToken: true },
      );

      // An unauthenticated caller must not learn anything at all — least of
      // all whether the id they guessed exists.
      expect(response.status).toBe(403);
      expect(response.body).not.toHaveProperty('decision');
    });

    it('returns {decision:"deny", reason_code} for a subject who lacks the entitlement', async () => {
      if (!available) return;

      // `jury_admin` holds a role and zero entitlements.
      const response = await evaluate(USERS.jury_admin, {
        object_type: 'case',
        object_id: CASE_IDS.plain,
        requester_scope: [],
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        decision: 'deny',
        reason_code: 'AUTH_SCOPE_DENIED',
      });
    });

    it('returns {decision:"allow"} for a subject who is entitled and in scope', async () => {
      if (!available) return;

      const response = await evaluate(USERS.clerk_case_admin, {
        object_type: 'case',
        object_id: CASE_IDS.plain,
        requester_scope: [],
      });

      expect(response.status).toBe(200);
      expect(response.body.decision).toBe('allow');
      expect(response.body.reason_code).toBeUndefined();
    });

    /**
     * The authorization-bypass case, and the reason `requester_scope` is
     * accepted-but-ignored rather than simply honoured.
     */
    it('ignores a caller-supplied requester_scope claiming access the subject lacks', async () => {
      if (!available) return;

      const response = await evaluate(USERS.jury_admin, {
        object_type: 'case',
        object_id: CASE_IDS.plain,
        // A fabricated claim to every scope that might help.
        requester_scope: [
          { scope_type: 'court', scope_value: '0a000001-0000-4000-8000-000000000001' },
          { scope_type: 'case', scope_value: CASE_IDS.plain },
          { scope_type: 'case', scope_value: CASE_IDS.sealed },
        ],
      });

      // Still denied. The decision came from scope resolved server-side.
      expect(response.status).toBe(200);
      expect(response.body.decision).toBe('deny');

      // And the disagreement is reported rather than silently dropped, so a
      // caller whose scope assembly has drifted can see that it has.
      expect(response.body.detail?.supplied_scope_ignored).toEqual(
        expect.arrayContaining([`case:${CASE_IDS.sealed}`]),
      );
    });

    it('collapses a hidden resource into deny + RESOURCE_NOT_FOUND', async () => {
      if (!available) return;

      const response = await evaluate(USERS.clerk_case_admin, {
        object_type: 'case',
        object_id: '0a000005-0000-4000-8000-0000000000ff',
        requester_scope: [],
      });

      // Callers here are services: they need the reason, not an HTTP status.
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        decision: 'deny',
        reason_code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('refuses a request carrying an end-user Authorization header', async () => {
      if (!available) return;

      // ServiceTokenGuard refuses the COMBINATION even with a valid service
      // token, so a header-forwarding proxy cannot launder a user credential
      // into a service call (threat T-01-16).
      const response = await request(app.getHttpServer())
        .post('/api/v1/security/policy-evaluate')
        .set('x-service-token', SERVICE_TOKEN)
        .set('x-service-actor-id', USERS.clerk_case_admin)
        .set('Authorization', 'Bearer some-user-token')
        .send({
          object_type: 'case',
          object_id: CASE_IDS.plain,
          requester_scope: [],
        });

      expect(response.status).toBe(403);
    });
  });
});
