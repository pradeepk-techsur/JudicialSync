/**
 * Playwright global setup — clear Keycloak brute-force state before the suite.
 *
 * The seeded realm runs with `bruteForceProtected: true` and an aggressive
 * `failureFactor` (5). That is correct for a court IdP, but a browser E2E suite
 * logs the same seeded users in many times in quick succession, and any single
 * transient (an OTP that crosses a 30s window boundary) counts as a failure.
 * Enough of those and an account is temporarily locked, which stalls later tests
 * on the Keycloak form for reasons unrelated to the code under test.
 *
 * Clearing attack-detection state once, up front, makes the gate measure the
 * application rather than the IdP's rate limiter. It is a TEST concern only — it
 * uses the admin credentials the local stack already exposes, touches nothing in
 * the app, and is a no-op if the admin API is unreachable (the suite then simply
 * runs without the pre-clear).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Read a var from the process env, falling back to the repo-root .env file. */
function envVar(name: string): string | undefined {
  if (process.env[name] !== undefined && process.env[name] !== '') {
    return process.env[name];
  }
  try {
    const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
    const contents = readFileSync(envPath, 'utf8');
    const line = contents.split('\n').find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim();
  } catch {
    return undefined;
  }
}

async function globalSetup(): Promise<void> {
  const baseURL = 'https://judicialsync.localhost:8443';
  const adminUser = envVar('KEYCLOAK_ADMIN') ?? 'admin';
  const adminPassword = envVar('KEYCLOAK_ADMIN_PASSWORD');

  // Accept Caddy's internal CA for this Node-side fetch (the browser context
  // uses ignoreHTTPSErrors; this setup runs in Node).
  const prevTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    if (adminPassword === undefined || adminPassword === '') {
      return;
    }
    const tokenRes = await fetch(
      `${baseURL}/auth/realms/master/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: 'admin-cli',
          username: adminUser,
          password: adminPassword,
        }),
      },
    );
    if (!tokenRes.ok) {
      return;
    }
    const { access_token: token } = (await tokenRes.json()) as { access_token: string };
    await fetch(
      `${baseURL}/auth/admin/realms/judicialsync/attack-detection/brute-force/users`,
      { method: 'DELETE', headers: { authorization: `Bearer ${token}` } },
    );
  } catch {
    // Best-effort: if the admin API is unreachable, run the suite anyway.
  } finally {
    if (prevTlsReject === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTlsReject;
    }
  }
}

export default globalSetup;
