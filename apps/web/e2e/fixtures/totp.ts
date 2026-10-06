import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, type Page } from '@playwright/test';
import { authenticator } from 'otplib';

/**
 * ============================================================================
 * The real-browser TOTP login fixture — the most reused artifact in the FE work.
 * ============================================================================
 *
 * `loginAs(page, username)` performs the FULL real OIDC + MFA flow in the
 * browser: open the app, land on /login, click Sign in, get redirected to
 * Keycloak, fill username + password, submit, fill the OTP, submit, and land
 * back in the authenticated shell. Every later Playwright spec in Phases 4–8
 * reuses this, and it exercises the real path on every run — no IdP mock.
 *
 * ## Where the secrets come from
 *
 * Both the password and the TOTP secret are read from the seeded realm,
 * `infra/keycloak/realm-judicialsync.json` — the single source the stack itself
 * imports, so the fixture cannot drift from what Keycloak actually accepts.
 *
 * ## The one non-obvious detail
 *
 * Keycloak stores the OTP secret in `credentials[].secretData.value` as the RAW
 * secret, but the TOTP algorithm (and otplib) operate on its BASE32 encoding.
 * `docs/SEED-CREDENTIALS.md` publishes the Base32 form; this fixture derives it
 * from the raw realm value so there is exactly one source of truth. Verified: a
 * direct-grant token request succeeds with the Base32-encoded value and fails
 * ("Invalid user credentials") with the raw value.
 */

interface SeededUser {
  username: string;
  password: string;
  /** Base32 TOTP secret, ready for `authenticator.generate`. */
  totpSecret: string;
}

const realmPath = fileURLToPath(
  new URL('../../../../infra/keycloak/realm-judicialsync.json', import.meta.url),
);

interface RealmCredential {
  type: string;
  value?: string;
  secretData?: string;
}
interface RealmUser {
  username: string;
  credentials: RealmCredential[];
}
interface Realm {
  users: RealmUser[];
}

/** Base32-encode raw bytes (RFC 4648, no padding) — Keycloak's OTP encoding. */
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

let cachedRealm: Realm | null = null;

function loadUser(username: string): SeededUser {
  if (cachedRealm === null) {
    cachedRealm = JSON.parse(readFileSync(realmPath, 'utf8')) as Realm;
  }
  const user = cachedRealm.users.find((u) => u.username === username);
  if (user === undefined) {
    throw new Error(`Seeded user not found in realm: ${username}`);
  }
  const password = user.credentials.find((c) => c.type === 'password')?.value;
  const otp = user.credentials.find((c) => c.type === 'otp')?.secretData;
  if (password === undefined || otp === undefined) {
    throw new Error(`Seeded user ${username} is missing password or otp credentials`);
  }
  const rawSecret = (JSON.parse(otp) as { value: string }).value;
  return {
    username,
    password,
    totpSecret: base32Encode(Buffer.from(rawSecret, 'utf8')),
  };
}

/** Compute the current TOTP for a seeded user. */
export function currentTotp(username: string): string {
  return authenticator.generate(loadUser(username).totpSecret);
}

/** Return the seeded password for a user (for the no-TOTP negative test). */
export function passwordOf(username: string): string {
  return loadUser(username).password;
}

/**
 * Fill the Keycloak username/password form.
 *
 * Keycloak's login form uses `#username` and `#password` with `#kc-login` as the
 * submit button. Shared by {@link loginAs} and the no-TOTP negative test.
 */
export async function submitKeycloakPassword(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.waitForURL(/\/auth\/realms\/judicialsync\//, { timeout: 60_000 });
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#kc-login');
}

/** The 30s TOTP window index for the current time. */
function currentWindowIndex(): number {
  return Math.floor(Date.now() / 1000 / 30);
}

/** Milliseconds until the next 30s TOTP window begins. */
function msUntilNextWindow(): number {
  return (30 - (Math.floor(Date.now() / 1000) % 30)) * 1000 + 250;
}

/**
 * The last TOTP window each user consumed. TOTP codes are SINGLE-USE: Keycloak
 * rejects a code it has already accepted (replay protection). Two logins of the
 * same seeded user inside one 30s window would otherwise submit the identical
 * code, and the second would be rejected — the dominant cause of a login stuck on
 * the Keycloak form in a suite that reuses accounts. Tracking the last window per
 * user lets {@link submitKeycloakOtp} wait for a fresh one.
 */
const lastOtpWindow = new Map<string, number>();

/**
 * Fill the Keycloak OTP form with a FRESH, not-yet-used code.
 *
 * Waits for a new 30s window if this user already consumed the current one (TOTP
 * replay protection) or if the current window is about to expire mid-flight.
 */
export async function submitKeycloakOtp(page: Page, username: string): Promise<void> {
  await page.waitForSelector('#otp', { timeout: 60_000 });

  const used = lastOtpWindow.get(username);
  const secondsLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (used === currentWindowIndex() || secondsLeft < 3) {
    await page.waitForTimeout(msUntilNextWindow());
  }

  lastOtpWindow.set(username, currentWindowIndex());
  await page.fill('#otp', currentTotp(username));
  await page.click('#kc-login');
}

/**
 * Perform the full real login round-trip and assert arrival in the shell.
 *
 * Keycloak's realm runs with brute-force protection and an aggressive failure
 * factor. A single OTP-window race (above) is enough to count a failure, and a
 * suite doing many logins can accumulate them, so a locked attempt stalls on the
 * Keycloak form. This retries the OTP leg once with a fresh code from a new
 * window, which clears the one realistic transient without masking a genuine
 * auth failure (a wrong password still never gets past the password form).
 */
export async function loginAs(page: Page, username: string): Promise<void> {
  const user = loadUser(username);

  await page.goto('/');
  // Unauthenticated: RequireSession sends us to /login.
  await page.waitForURL(/\/login$/, { timeout: 30_000 });
  await page.getByTestId('sign-in').click();

  await submitKeycloakPassword(page, user.username, user.password);
  await submitKeycloakOtp(page, user.username);

  // If the OTP step is still showing (a rejected code), retry once — always from
  // a fresh window so the resubmitted code is genuinely new.
  try {
    await page.waitForURL(/judicialsync\.localhost:8443\/(cases|audit)?$/, { timeout: 20_000 });
  } catch {
    if ((await page.locator('#otp').count()) > 0) {
      await submitKeycloakOtp(page, user.username);
    }
    await page.waitForURL(/judicialsync\.localhost:8443\/(cases|audit)?$/, { timeout: 60_000 });
  }

  await expect(page.getByTestId('display-name')).toBeVisible({ timeout: 30_000 });
}
