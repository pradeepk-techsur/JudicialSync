import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { authenticator } from 'otplib';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common/errors/api-exception.filter';

/**
 * ============================================================================
 * THE REAL-IDP TEST HARNESS
 * ============================================================================
 *
 * Every authentication test in this phase drives **the actual Keycloak** from
 * `docker-compose.yml`, through the actual browser flow, with a TOTP code
 * computed from the seeded secret. Nothing here mocks the IdP.
 *
 * That is a deliberate cost. A mocked IdP would make these tests faster and
 * hermetic, and it would also make them prove nothing about the thing most
 * likely to be wrong — the integration itself. The Phase 1 CONTEXT rejected a
 * stub login path on exactly this reasoning, and a stubbed *test* IdP
 * reintroduces the same blind spot one layer down: it is precisely how a
 * system ends up with an authentication layer nobody has ever exercised
 * against a real provider.
 *
 * The concrete payoff was immediate. Driving the real flow is what revealed
 * that Keycloak emits `acr: "otp"` with no `amr` claim, where the planned MFA
 * formula expected a number — a bug a mock built from the same expectation
 * would have happily confirmed.
 *
 * ## Skipping
 *
 * When the stack is not up these suites SKIP rather than fail, so a developer
 * running `npm test` without Docker gets a clean run. CI brings the stack up.
 * {@link requireStack} reports *why* it skipped, so a skip is never silent.
 */

export const ISSUER =
  process.env.TEST_OIDC_ISSUER_URL ??
  'https://judicialsync.localhost:8443/auth/realms/judicialsync';
export const CLIENT_ID = process.env.TEST_OIDC_CLIENT_ID ?? 'judicialsync-internal';
export const CLIENT_SECRET =
  process.env.TEST_OIDC_CLIENT_SECRET ?? 'judicialsync-local-dev-client-secret';
export const REDIRECT_URI =
  process.env.TEST_OIDC_REDIRECT_URI ??
  'https://judicialsync.localhost:8443/api/v1/auth/callback';

/**
 * Addresses for the Compose datastores, discovered at run time.
 *
 * The Compose file publishes **only** `proxy:8443` — that is the point of its
 * single-TLS-origin design, and widening it for tests would weaken the very
 * property `docker-compose.yml` is built to demonstrate ("no plaintext path",
 * threat T-01-12). So the suites reach `db` and `redis` on their Compose
 * network addresses instead, which the sandbox host can route to directly.
 *
 * Resolved once, lazily, via `docker inspect`, and overridable by env for a
 * CI runner whose networking differs.
 */
let discovered: { database: string; admin: string; redis: string } | undefined;

function serviceIp(container: string): string | undefined {
  try {
    const out = execFileSync(
      'docker',
      [
        'inspect',
        container,
        '--format',
        '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return out === '' ? undefined : out;
  } catch {
    return undefined;
  }
}

function endpoints(): { database: string; admin: string; redis: string } {
  if (discovered !== undefined) return discovered;

  const dbIp = serviceIp('judicialsync-db-1') ?? '127.0.0.1';
  const redisIp = serviceIp('judicialsync-redis-1') ?? '127.0.0.1';

  discovered = {
    database:
      process.env.TEST_DATABASE_URL ??
      `postgresql://app_rw:app_rw_local_dev@${dbIp}:5432/judicialsync?schema=platform`,
    admin:
      process.env.TEST_MIGRATION_DATABASE_URL ??
      `postgresql://app_dba:app_dba_local_dev@${dbIp}:5432/judicialsync?schema=platform`,
    redis: process.env.TEST_REDIS_URL ?? `redis://${redisIp}:6379`,
  };
  return discovered;
}

export const testDatabaseUrl = (): string => endpoints().database;

/**
 * The **administrative** connection (`app_dba`).
 *
 * Needed only to write the four configuration tables, on which `app_rw`
 * deliberately holds SELECT alone (plan 01-03): the running application may
 * read configuration and must not be able to author it. A test that wants to
 * change a seeded config value is performing an administrative act and uses
 * the administrative role, exactly as `prisma/seed.ts` does.
 *
 * Discovered the honest way — the first version of the cache-TTL test used
 * `app_rw` and got `permission denied for table rule_package_versions`,
 * which is the grant posture working correctly.
 */
export const testAdminDatabaseUrl = (): string => endpoints().admin;

export const testRedisUrl = (): string => endpoints().redis;

/**
 * Seeded users and their TOTP secrets, from `docs/SEED-CREDENTIALS.md`.
 * Local-development credentials only — see that file's warning.
 */
export const SEED_USERS = {
  judge: { password: 'judge_local_dev!1', totp: 'GYZVMWCGIFDFMTKWIFETOU2XKVCEOQSQ' },
  law_clerk: { password: 'law_clerk_local_dev!1', totp: 'JZNFOTRTIFHU6WSUGJJFMWSKJM2UWNCD' },
  courtroom_deputy: {
    password: 'courtroom_deputy_local_dev!1',
    totp: 'G5DUISCEKNGTOS2EK5MVAVZVJ5CE2VSL',
  },
  clerk_case_admin: {
    password: 'clerk_case_admin_local_dev!1',
    totp: 'JY3EKWKCIZFUYVBUJBKDORSRIFFVCVSV',
  },
  attorney_external: {
    password: 'attorney_external_local_dev!1',
    totp: 'GNBU4UKHIMZVMQSDINLEISRTIQZEKTZW',
  },
  jury_admin: { password: 'jury_admin_local_dev!1', totp: 'KJLFKS2PJJGECS2KJZMFEVSYKRHVEN2E' },
  court_admin: { password: 'court_admin_local_dev!1', totp: 'KY3TITKNKJIFQNKUJJGE6MSCIZFTIR2N' },
  ao_program_manager: {
    password: 'ao_program_manager_local_dev!1',
    totp: 'GJMECQ2EKJGEKV2XJBATEV2DJVHEIWCR',
  },
  system_admin: {
    password: 'system_admin_local_dev!1',
    totp: 'LBGUKTKWJJFUOWCFI5DDKM2YLFDU2SST',
  },
  security_officer: {
    password: 'security_officer_local_dev!1',
    totp: 'KRCUUTCVKBMFOSRWJFBU4RCQKZJTEV2T',
  },
} as const;

export type SeedUsername = keyof typeof SEED_USERS;

/**
 * Trust the Caddy internal CA, the same way the API container does.
 *
 * `NODE_EXTRA_CA_CERTS` must be set before the process starts to affect
 * Node's default agent, so the suites set `ca` explicitly on the fetch agent
 * instead. What is NOT done, here or anywhere, is disabling verification —
 * these tests exercise the real TLS path, and a test that turns verification
 * off stops testing the thing the deployment depends on.
 */
export function caddyRootCa(): string | undefined {
  const path = process.env.TEST_CADDY_CA ?? '/tmp/judicialsync-caddy-root.crt';
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** Is the Compose stack reachable? */
export async function stackAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ISSUER}/.well-known/openid-configuration`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Skip a suite with a stated reason when the stack is down.
 *
 * Returns `true` when the suite should run. A skip prints why, because a
 * silently skipped security test is indistinguishable from a passing one.
 */
export async function requireStack(): Promise<boolean> {
  if (await stackAvailable()) return true;
  // eslint-disable-next-line no-console
  console.warn(
    `SKIPPING: the Compose stack is not reachable at ${ISSUER}. ` +
      `Run \`docker compose up -d\` to exercise these tests.`,
  );
  return false;
}

/** A browser-flow login result: the authorization code plus its PKCE state. */
export interface AuthorizationCode {
  code: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  /**
   * Every query parameter the IdP put on the redirect, including the `iss`
   * that Keycloak returns because the realm advertises
   * `authorization_response_iss_parameter_supported`. RFC 9207 requires the
   * relying party validate it, so it must be forwarded rather than dropped.
   */
  callbackParams: Record<string, string>;
}

const b64u = (b: Buffer): string => b.toString('base64url');

/**
 * The last TOTP code this process used, per user.
 *
 * ## Why this bookkeeping is necessary
 *
 * Keycloak enforces **one-time use** of a TOTP code: presenting the same
 * code twice fails with `invalid_grant` even while it is still inside its
 * 30-second validity window. That is correct and desirable — it is replay
 * protection on the second factor, and an IdP without it would be the weaker
 * system — but it means consecutive logins inside one window cannot reuse a
 * code.
 *
 * These suites log in many times in quick succession, so without this the
 * failures look like broken authentication rather than like the test harness
 * presenting a spent credential. Verified directly against the running
 * realm: the first use returns 200, the second and third return
 * `invalid_grant`.
 *
 * {@link freshTotp} therefore waits for the next window whenever it would
 * otherwise repeat a code. It costs wall-clock time and buys a suite whose
 * failures mean what they say.
 */
/**
 * Kept on `globalThis`, NOT in a module-level `const`.
 *
 * Jest gives every test FILE its own module registry, so a module-level map
 * is reset between suites while the Keycloak container — which is what
 * actually remembers spent codes — is not. The symptom was suites that each
 * passed alone and failed when run together, with four logins rejected
 * because a sibling suite had already spent that window's code seconds
 * earlier. `globalThis` is per worker process, which is the scope that
 * matches the shared IdP.
 */
const totpState: Map<string, string> = ((
  globalThis as { __judicialsyncTotp?: Map<string, string> }
).__judicialsyncTotp ??= new Map<string, string>());

/** TOTP step, in milliseconds. The RFC 6238 default Keycloak uses. */
const TOTP_STEP_MS = 30_000;

/** Sleep into the next TOTP window, plus margin for container clock skew. */
async function waitForNextWindow(): Promise<void> {
  const msIntoWindow = Date.now() % TOTP_STEP_MS;
  await new Promise((resolve) =>
    setTimeout(resolve, TOTP_STEP_MS - msIntoWindow + 1_000),
  );
}

async function freshTotp(username: string, secret: string): Promise<string> {
  let code = authenticator.generate(secret);

  if (totpState.get(username) === code) {
    await waitForNextWindow();
    code = authenticator.generate(secret);
  }

  totpState.set(username, code);
  return code;
}

/**
 * Drive the **real** Keycloak browser flow: authorize → password → TOTP →
 * authorization code.
 *
 * This is a genuine multi-factor sign-in. The OTP code is computed from the
 * seeded secret with `otplib`, which is the same credential a human scans
 * into an authenticator app — not a simulation of one.
 */
export async function browserLogin(
  username: SeedUsername,
  options: { acrValues?: string; authorizationUrl?: string; state?: string } = {},
): Promise<AuthorizationCode> {
  const { password, totp } = SEED_USERS[username];

  const codeVerifier = b64u(randomBytes(32));
  const codeChallenge = b64u(
    createHash('sha256').update(codeVerifier).digest(),
  );
  const state = options.state ?? b64u(randomBytes(16));
  const nonce = b64u(randomBytes(16));

  const jar = new Map<string, string>();
  const store = (res: Response): void => {
    const cookies =
      (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
      [];
    for (const raw of cookies) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };
  const cookieHeader = (): string =>
    [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

  // When the caller supplies an authorization URL, it came from the
  // application's own `GET /auth/authorize-url` — meaning the state, nonce
  // and PKCE verifier are the ones the APP generated and holds in Redis.
  // That is the only way a subsequent `POST /auth/login` can succeed, and it
  // is what makes this a true end-to-end exercise of the app's flow rather
  // than of a parallel one the test invented.
  let authorizeUrl: string;
  if (options.authorizationUrl !== undefined) {
    authorizeUrl = options.authorizationUrl;
  } else {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile email',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    if (options.acrValues !== undefined) params.set('acr_values', options.acrValues);
    authorizeUrl = `${ISSUER}/protocol/openid-connect/auth?${params.toString()}`;
  }

  let res = await fetch(authorizeUrl, { redirect: 'manual' });
  store(res);

  let body = await res.text();
  let action = extractFormAction(body);
  if (action === undefined) {
    throw new Error(`Keycloak returned no login form (status ${res.status}).`);
  }

  // --- password ---
  res = await fetch(action, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cookieHeader(),
    },
    body: new URLSearchParams({ username, password }),
  });
  store(res);

  // --- TOTP, which the realm always demands for the browser flow ---
  if (res.status === 200) {
    body = await res.text();
    action = extractFormAction(body);
    if (action === undefined) {
      throw new Error('Keycloak returned no OTP form after the password step.');
    }
    const submitOtp = async (code: string): Promise<Response> => {
      const submitted = await fetch(action as string, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: cookieHeader(),
        },
        body: new URLSearchParams({ otp: code, totp: code }),
      });
      store(submitted);
      return submitted;
    };

    res = await submitOtp(await freshTotp(username, totp));

    // A 200 here means Keycloak re-rendered the OTP form instead of
    // redirecting — it rejected the code. The overwhelmingly likely cause is
    // that this window's code was already spent (Keycloak enforces one-time
    // use), so wait out the window and present a genuinely new one.
    //
    // Retrying rather than failing is right because the rejection is an
    // artefact of tests sharing one IdP, not a property of the system under
    // test. It is bounded to a single retry so a real authentication failure
    // still surfaces as one rather than looping.
    if (res.status === 200) {
      const retryBody = await res.text();
      const retryAction = extractFormAction(retryBody);
      if (retryAction !== undefined) {
        action = retryAction;
        await waitForNextWindow();
        res = await submitOtp(await freshTotp(username, totp));
      }
    }
  }

  const location = res.headers.get('location');
  if (location === null) {
    throw new Error(
      `Keycloak did not redirect after authentication (status ${res.status}).`,
    );
  }

  const redirected = new URL(location);
  const code = redirected.searchParams.get('code');
  if (code === null) {
    throw new Error(`No authorization code in redirect: ${location}`);
  }

  const callbackParams: Record<string, string> = {};
  redirected.searchParams.forEach((value, key) => {
    callbackParams[key] = value;
  });

  return { code, state, nonce, codeVerifier, callbackParams };
}

/** The body of `GET /auth/authorize-url`. */
interface AuthorizeUrlBody {
  authorization_url: string;
  state: string;
}

/** What a completed end-to-end login yields. */
export interface LoggedIn {
  session_token: string;
  refresh_token: string;
  entitlements: {
    user_id: string;
    roles: { role_name: string }[];
    scopes: unknown[];
    entitlements: string[];
    mfa_satisfied: boolean;
  };
}

/**
 * The complete, honest login: the app starts the flow, the real IdP
 * authenticates with password + TOTP, and the app exchanges the result.
 *
 * Critically, the `state`, `nonce` and PKCE verifier all come from the
 * **application's** `GET /auth/authorize-url` and live in its Redis. A test
 * that generated its own would be exercising a flow the app does not
 * implement, and would pass or fail for reasons unrelated to the app's
 * replay protection.
 */
export async function loginAs(
  app: INestApplication,
  username: SeedUsername,
): Promise<LoggedIn> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const request = require('supertest') as typeof import('supertest');

  const started = await request(app.getHttpServer())
    .get('/api/v1/auth/authorize-url')
    .expect(200);
  const authorize = started.body as AuthorizeUrlBody;

  const { code, callbackParams } = await browserLogin(username, {
    authorizationUrl: authorize.authorization_url,
    state: authorize.state,
  });

  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({
      identity_assertion: code,
      state: authorize.state,
      callback_params: callbackParams,
    });

  if (response.status !== 200) {
    throw new Error(
      `loginAs(${username}) failed: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return response.body as LoggedIn;
}

/**
 * Start a login and return the pieces, without completing it.
 *
 * Used by the replay test, which needs to present the same code and state
 * twice.
 */
export async function startLogin(
  app: INestApplication,
  username: SeedUsername,
): Promise<{ code: string; state: string; callbackParams: Record<string, string> }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const request = require('supertest') as typeof import('supertest');

  const started = await request(app.getHttpServer())
    .get('/api/v1/auth/authorize-url')
    .expect(200);
  const authorize = started.body as AuthorizeUrlBody;

  const { code, callbackParams } = await browserLogin(username, {
    authorizationUrl: authorize.authorization_url,
    state: authorize.state,
  });

  return { code, state: authorize.state, callbackParams };
}

/**
 * A **password + TOTP direct-access-grant** token.
 *
 * Deliberately exposed as the NON-MFA fixture. The direct grant verifies the
 * TOTP as a credential but never runs the browser flow's LoA-conditioned OTP
 * step, so the resulting token reports `acr: "1"` — below the level that
 * evidences multi-factor authentication.
 *
 * It is the right negative fixture precisely because it is a *real,
 * correctly signed* token from the *real* IdP for a *real* user who did
 * supply a second factor. Rejecting it proves the MFA check reads the
 * authentication-context claim rather than merely checking that a valid
 * token exists.
 */
export async function directGrantIdToken(username: SeedUsername): Promise<string> {
  const { password, totp } = SEED_USERS[username];
  const res = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'openid',
      username,
      password,
      totp: await freshTotp(username, totp),
    }),
  });
  const body = (await res.json()) as { id_token?: string; error?: string };
  if (body.id_token === undefined) {
    throw new Error(`Direct grant failed: ${body.error ?? res.status}`);
  }
  return body.id_token;
}

/** Decode a JWT payload without verifying — test introspection only. */
export function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  return JSON.parse(Buffer.from(part, 'base64url').toString()) as Record<
    string,
    unknown
  >;
}

function extractFormAction(html: string): string | undefined {
  const match = /action="([^"]+)"/.exec(html);
  return match?.[1].replace(/&amp;/g, '&');
}

/**
 * Boot the real `AppModule` against the Compose stack.
 *
 * The full guard chain, the global exception filter and the real DI graph are
 * all in play — the same idiom every other suite in this project uses.
 */
export async function bootApp(
  env: Record<string, string | undefined> = {},
): Promise<{ app: INestApplication; restoreEnv: () => void }> {
  const previous: Record<string, string | undefined> = {};
  const applied: Record<string, string | undefined> = {
    DATABASE_URL: testDatabaseUrl(),
    REDIS_URL: testRedisUrl(),
    OIDC_ISSUER_URL: ISSUER,
    OIDC_CLIENT_ID: CLIENT_ID,
    OIDC_CLIENT_SECRET: CLIENT_SECRET,
    OIDC_REDIRECT_URI: REDIRECT_URI,
    SESSION_TOKEN_SECRET: 'test-session-signing-secret',
    NODE_ENV: 'test',
    ...env,
  };

  for (const [key, value] of Object.entries(applied)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();

  return {
    app,
    restoreEnv: () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}
