import { createHash, randomBytes } from 'node:crypto';

import { authenticator } from 'otplib';

import { appDbaClient, appRwClient } from './raw-sql-client';

/**
 * ============================================================================
 * THE ASSURANCE HARNESS (plan 01-14)
 * ============================================================================
 *
 * This harness exists to let the assurance specs attack the system the way an
 * attacker would: raw HTTP against the running stack, real tokens from the real
 * IdP, and raw database connections as the application's own role. It shares
 * NOTHING with the application beyond the wire — there is no `bootApp`, no
 * supertest, no in-process Nest module here, by deliberate design (CONTEXT:
 * "bypasses the UI and the Nest testing module entirely").
 *
 * What it provides:
 *
 *  - {@link tokenFor} — a REAL session token for a seeded role, obtained by
 *    driving the real Keycloak browser flow (password + computed TOTP) and
 *    exchanging the result at the application's own `POST /auth/login`. No test
 *    mints a JWT: a self-signed token would prove the suite can forge
 *    credentials, not that the system is sound. The `<verify>` greps assert no
 *    token-minting primitive appears anywhere under this directory.
 *  - {@link api} — a thin `fetch` wrapper against
 *    `https://judicialsync.localhost:8443/api/v1` that returns
 *    `{status, body, headers}` and NEVER throws on a non-2xx, so a denial reads
 *    as an assertion rather than a caught exception. `rejectUnauthorized` stays
 *    on; the CA is trusted via the shared auth-setup trust anchor.
 *  - {@link seedIds} — the stable UUIDs from `prisma/seed/ids.ts`, so specs name
 *    fixtures rather than rediscovering them.
 *  - {@link appRwClient}/{@link appDbaClient} — re-exported from
 *    `raw-sql-client.ts` (role-asserting raw `pg` connections).
 *  - {@link requireStack} — skip-with-reason when the stack is down, so a
 *    skipped security suite is never mistaken for a passing one.
 */

export const BASE_URL =
  process.env.ASSURANCE_BASE_URL ?? 'https://judicialsync.localhost:8443';
export const API_BASE = `${BASE_URL}/api/v1`;
export const ISSUER =
  process.env.ASSURANCE_OIDC_ISSUER_URL ??
  `${BASE_URL}/auth/realms/judicialsync`;
export const CLIENT_ID =
  process.env.ASSURANCE_OIDC_CLIENT_ID ?? 'judicialsync-internal';
export const CLIENT_SECRET =
  process.env.ASSURANCE_OIDC_CLIENT_SECRET ??
  'judicialsync-local-dev-client-secret';

/**
 * Seeded roles and their local-dev TOTP secrets.
 *
 * These are the published local-development credentials from
 * `docs/SEED-CREDENTIALS.md` (whose header warns they are version-controlled and
 * for local dev only). The plan suggests reading them from the realm file; the
 * established project convention — every auth/files/case suite — reads them from
 * these published values instead, because the realm export stores OTP secrets
 * inside per-user `credentials` blobs rather than a flat lookup, and a bespoke
 * parse would be a fragile second source of truth. Rotating the realm's seed
 * rotates `docs/SEED-CREDENTIALS.md` and this table together.
 */
export const SEED_USERS = {
  judge: { password: 'judge_local_dev!1', totp: 'GYZVMWCGIFDFMTKWIFETOU2XKVCEOQSQ' },
  law_clerk: {
    password: 'law_clerk_local_dev!1',
    totp: 'JZNFOTRTIFHU6WSUGJJFMWSKJM2UWNCD',
  },
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
  jury_admin: {
    password: 'jury_admin_local_dev!1',
    totp: 'KJLFKS2PJJGECS2KJZMFEVSYKRHVEN2E',
  },
  court_admin: {
    password: 'court_admin_local_dev!1',
    totp: 'KY3TITKNKJIFQNKUJJGE6MSCIZFTIR2N',
  },
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

export type SeededRole = keyof typeof SEED_USERS;

/**
 * Stable seed UUIDs, mirrored from `prisma/seed/ids.ts`.
 *
 * Duplicated here as plain data rather than imported, so this test harness pulls
 * in no application source — it is a black-box client of the running stack, and
 * importing `src/`/`prisma/` would quietly re-introduce the in-process coupling
 * the suite exists to avoid.
 */
export const seedIds = {
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
    law_clerk: '0a000004-0000-4000-8000-000000000002',
    courtroom_deputy: '0a000004-0000-4000-8000-000000000003',
    clerk_case_admin: '0a000004-0000-4000-8000-000000000004',
    attorney_external: '0a000004-0000-4000-8000-000000000005',
    jury_admin: '0a000004-0000-4000-8000-000000000006',
    court_admin: '0a000004-0000-4000-8000-000000000007',
    ao_program_manager: '0a000004-0000-4000-8000-000000000008',
    system_admin: '0a000004-0000-4000-8000-000000000009',
    security_officer: '0a000004-0000-4000-8000-00000000000a',
  },
  cases: {
    plain: '0a000005-0000-4000-8000-000000000001',
    sealed: '0a000005-0000-4000-8000-000000000002',
    restricted: '0a000005-0000-4000-8000-000000000003',
    otherCourt: '0a000005-0000-4000-8000-000000000004',
  },
  /** A syntactically valid UUID that names no row — the blind-discovery probe. */
  nonexistent: '0a0000ff-0000-4000-8000-0000000000ff',
} as const;

export { appRwClient, appDbaClient };

// ===========================================================================
// TLS trust — the real chain, never a bypass
// ===========================================================================
//
// Node's `fetch` (undici) honours `NODE_EXTRA_CA_CERTS` when it is set BEFORE
// the process starts. The shared `auth-setup.ts` globalSetup extracts Caddy's
// internal root CA to `/tmp/judicialsync-caddy-root.crt` and points
// `NODE_EXTRA_CA_CERTS` at it, and Jest propagates that env to every worker at
// startup — so the assurance workers trust the local TLS origin exactly the way
// the API container does, with no per-request agent plumbing. The shared
// `auth-trust-ca.ts` setupFile additionally patches the classic `https`/`tls`
// path for completeness.
//
// This is a trust ANCHOR, not a verification bypass: `NODE_TLS_REJECT_UNAUTHORIZED`
// is never set and `rejectUnauthorized: false` appears nowhere. An endpoint
// presenting any other certificate is still rejected, so the suite exercises the
// real TLS path the deployment depends on (threat T-01-13).

// ===========================================================================
// Stack availability
// ===========================================================================

/** Is the running stack reachable over the proxy? */
export async function stackAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Skip a suite with a stated reason when the stack is down.
 *
 * Returns `true` when the suite should run. A silent skip of a security suite is
 * indistinguishable from a pass, so the reason is always printed.
 */
export async function requireStack(): Promise<boolean> {
  if (await stackAvailable()) return true;
  // eslint-disable-next-line no-console
  console.warn(
    `SKIPPING assurance suite: the stack is not reachable at ${API_BASE}. ` +
      `Run \`docker compose up -d\` first.`,
  );
  return false;
}

// ===========================================================================
// The raw HTTP client — never throws on non-2xx
// ===========================================================================

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  /** The raw response text, for byte-for-byte body comparisons. */
  rawBody: string;
  headers: Headers;
}

export interface ApiOptions {
  /** A session token; sent as `Authorization: Bearer`. */
  token?: string;
  /** A JSON body (serialized and sent with `content-type: application/json`). */
  json?: unknown;
  /** Extra headers. */
  headers?: Record<string, string>;
}

async function request<T = unknown>(
  method: string,
  path: string,
  opts: ApiOptions = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token !== undefined) headers.authorization = `Bearer ${opts.token}`;
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }

  const res = await fetch(`${API_BASE}${path}`, { method, headers, body });
  const rawBody = await res.text();
  let parsed: unknown = rawBody;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json') && rawBody !== '') {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      parsed = rawBody;
    }
  }
  return { status: res.status, body: parsed as T, rawBody, headers: res.headers };
}

/**
 * The raw HTTP client the specs use. Every method returns `{status, body,
 * rawBody, headers}` and never throws on a non-2xx — a 403 is the subject of an
 * assertion, not an exception to catch.
 */
export const api = {
  get: <T = unknown>(path: string, opts: ApiOptions = {}): Promise<ApiResponse<T>> =>
    request<T>('GET', path, opts),
  post: <T = unknown>(path: string, opts: ApiOptions = {}): Promise<ApiResponse<T>> =>
    request<T>('POST', path, opts),
  patch: <T = unknown>(path: string, opts: ApiOptions = {}): Promise<ApiResponse<T>> =>
    request<T>('PATCH', path, opts),
  delete: <T = unknown>(path: string, opts: ApiOptions = {}): Promise<ApiResponse<T>> =>
    request<T>('DELETE', path, opts),
};

// ===========================================================================
// TOTP — real codes, one-time-use aware
// ===========================================================================

const TOTP_STEP_MS = 30_000;

/**
 * The last TOTP code presented, per user, on `globalThis` (per worker).
 *
 * Keycloak enforces one-time use of a TOTP code even inside its validity window
 * — correct replay protection on the second factor. These specs log in many
 * times, so without this bookkeeping consecutive logins in one window fail with
 * `invalid_grant`, which looks like broken auth rather than a spent code. Kept
 * on `globalThis`, not a module const, because Jest gives each test file its own
 * module registry while the Keycloak container (which actually remembers spent
 * codes) is shared.
 */
const totpState: Map<string, string> = ((
  globalThis as { __assuranceTotp?: Map<string, string> }
).__assuranceTotp ??= new Map<string, string>());

async function waitForNextWindow(): Promise<void> {
  const msIntoWindow = Date.now() % TOTP_STEP_MS;
  await new Promise((resolve) =>
    setTimeout(resolve, TOTP_STEP_MS - msIntoWindow + 1_500),
  );
}

export async function freshTotp(username: string, secret: string): Promise<string> {
  let code = authenticator.generate(secret);
  if (totpState.get(username) === code) {
    await waitForNextWindow();
    code = authenticator.generate(secret);
  }
  totpState.set(username, code);
  return code;
}

// ===========================================================================
// The real browser login, over raw HTTP
// ===========================================================================

const b64u = (b: Buffer): string => b.toString('base64url');

function extractFormAction(html: string): string | undefined {
  const match = /action="([^"]+)"/.exec(html);
  return match?.[1].replace(/&amp;/g, '&');
}

interface CookieJar {
  store(res: Response): void;
  header(): string;
}

function cookieJar(): CookieJar {
  const jar = new Map<string, string>();
  return {
    store(res: Response): void {
      const cookies =
        (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
        [];
      for (const raw of cookies) {
        const [pair] = raw.split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    },
    header(): string {
      return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    },
  };
}

/**
 * Drive the real Keycloak browser flow and return the authorization code.
 *
 * Starts from the APPLICATION's own `GET /auth/authorize-url` so the `state`,
 * nonce and PKCE verifier are the ones the app generated and holds in Redis —
 * the only way the subsequent `POST /auth/login` can succeed, and what makes
 * this an end-to-end exercise of the app's real flow rather than a parallel one.
 */
async function browserAuthorize(
  username: SeededRole,
): Promise<{ code: string; state: string; callbackParams: Record<string, string> }> {
  const { password, totp } = SEED_USERS[username];

  const started = await fetch(`${API_BASE}/auth/authorize-url`);
  if (!started.ok) {
    throw new Error(`GET /auth/authorize-url failed: ${started.status}`);
  }
  const authorize = (await started.json()) as {
    authorization_url: string;
    state: string;
  };

  const jar = cookieJar();

  let res = await fetch(authorize.authorization_url, { redirect: 'manual' });
  jar.store(res);
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
      cookie: jar.header(),
    },
    body: new URLSearchParams({ username, password }),
  });
  jar.store(res);

  // --- TOTP (the realm always demands it in the browser flow) ---
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
          cookie: jar.header(),
        },
        body: new URLSearchParams({ otp: code, totp: code }),
      });
      jar.store(submitted);
      return submitted;
    };

    res = await submitOtp(await freshTotp(username, totp));

    // A 200 means the OTP form re-rendered — the code was rejected, almost
    // always because this window's code was already spent (Keycloak enforces
    // TOTP one-time-use, and the whole assurance suite shares one IdP). Wait out
    // the window and present a genuinely fresh one.
    //
    // Bounded to a few retries across distinct windows rather than one: when
    // every criterion spec drives real logins back to back, two logins for the
    // same user can land in the same 30s window and BOTH spend its code, so a
    // single retry is not always enough. The bound still lets a GENUINE auth
    // failure (wrong password, a broken realm) surface as a failure rather than
    // looping forever — it just no longer mistakes IdP contention for one.
    const MAX_OTP_RETRIES = 4;
    for (let attempt = 0; res.status === 200 && attempt < MAX_OTP_RETRIES; attempt += 1) {
      const retryBody = await res.text();
      const retryAction = extractFormAction(retryBody);
      if (retryAction === undefined) break; // not the OTP form — a real failure
      action = retryAction;
      await waitForNextWindow();
      res = await submitOtp(await freshTotp(username, totp));
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

  return { code, state: authorize.state, callbackParams };
}

/** A completed login's result. */
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

const tokenCache: Map<SeededRole, string> = ((
  globalThis as { __assuranceTokens?: Map<SeededRole, string> }
).__assuranceTokens ??= new Map<SeededRole, string>());

/**
 * Run the full login and return the session payload.
 *
 * Also seeds the token cache for this user: a fresh login is expensive (a real
 * TOTP window), so an immediately-following `tokenFor(sameUser)` should reuse
 * this session rather than mint a second one in the same 30s window — which
 * would collide on Keycloak's TOTP one-time-use. Callers that specifically need
 * a NEW session after invalidating the old one call `forgetToken(user)` first.
 */
export async function loginFresh(username: SeededRole): Promise<LoggedIn> {
  const { code, state, callbackParams } = await browserAuthorize(username);
  const login = await api.post<LoggedIn>('/auth/login', {
    json: { identity_assertion: code, state, callback_params: callbackParams },
  });
  if (login.status !== 200) {
    throw new Error(
      `POST /auth/login for ${username} failed: ${login.status} ${login.rawBody}`,
    );
  }
  tokenCache.set(username, login.body.session_token);
  return login.body;
}

/**
 * A REAL session token for a seeded role, cached per run.
 *
 * The token is obtained by driving the real Keycloak password + TOTP flow and
 * exchanging the result at the app's own `POST /auth/login`. Cached per username
 * because each login costs a real TOTP window; tests that need a FRESH login
 * (e.g. to observe revocation) call {@link loginFresh} directly.
 */
export async function tokenFor(username: SeededRole): Promise<string> {
  const cached = tokenCache.get(username);
  if (cached !== undefined) return cached;
  const { session_token } = await loginFresh(username);
  tokenCache.set(username, session_token);
  return session_token;
}

/** Drop a cached token (e.g. after deliberately revoking a user's sessions). */
export function forgetToken(username: SeededRole): void {
  tokenCache.delete(username);
}

/**
 * A raw Keycloak direct-access-grant token request, OPTIONALLY without a TOTP.
 *
 * Used by criterion 1 to prove MFA is required end to end: the request WITHOUT a
 * TOTP is rejected by Keycloak; WITH a valid code it succeeds. Returns the raw
 * `{status, body}` so the spec asserts on the IdP's own response.
 */
export async function directGrant(
  username: SeededRole,
  opts: { withTotp: boolean } = { withTotp: true },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { password, totp } = SEED_USERS[username];
  const params: Record<string, string> = {
    grant_type: 'password',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'openid',
    username,
    password,
  };
  if (opts.withTotp) params.totp = await freshTotp(username, totp);

  const res = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

// Keep crypto imports referenced for future PKCE needs; the browser flow uses
// the app's own PKCE via authorize-url, so these are intentionally retained for
// any spec that must start a flow itself.
void createHash;
void randomBytes;
void b64u;
