import { expect, test } from '@playwright/test';

import { loginAs, passwordOf, submitKeycloakPassword } from './fixtures/totp';

/**
 * The behaviors THIS plan adds — not a smoke test. Each case proves one of the
 * must-have truths: a real OIDC + TOTP round-trip, MFA being genuinely required,
 * the unauthenticated redirect, entitlement-driven navigation across three
 * different users, logout, and that both shipped routes are reachable from nav.
 *
 * The suite logs in several DIFFERENT users (one login each), which is also why
 * it does not trip Keycloak's brute-force protection the way repeated single-user
 * iteration does.
 */

test.describe('Login and the generic shell', () => {
  test('1. full OIDC + TOTP login round-trip lands in the shell', async ({ page }) => {
    await loginAs(page, 'clerk_case_admin');

    // Back on our origin.
    expect(page.url()).toContain('judicialsync.localhost:8443');
    // Header shows the user's display name and their role as a USWDS Tag.
    await expect(page.getByTestId('display-name')).toContainText(/.+/);
    await expect(page.getByTestId('role-tag').filter({ hasText: 'clerk_case_admin' })).toBeVisible();
  });

  test('2. password WITHOUT TOTP never reaches the shell', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/login$/);
    await page.getByTestId('sign-in').click();

    // Fill the password form and submit, then STOP — do not supply the OTP.
    await submitKeycloakPassword(page, 'law_clerk', passwordOf('law_clerk'));

    // Keycloak presents the OTP step and the browser never reaches the shell.
    await expect(page.locator('#otp')).toBeVisible({ timeout: 60_000 });
    expect(page.url()).toContain('/auth/realms/judicialsync/');
    await expect(page.getByTestId('display-name')).toHaveCount(0);
  });

  test('3. an unauthenticated protected route redirects to login', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForURL(/\/login$/, { timeout: 30_000 });
    // Not a blank or partially-rendered shell — the login button is present.
    await expect(page.getByTestId('sign-in')).toBeVisible();
    await expect(page.getByTestId('display-name')).toHaveCount(0);
  });

  test('4. navigation differs by entitlement (separation of duties)', async ({ page }) => {
    // clerk_case_admin: case_read, NO audit_reader.
    await loginAs(page, 'clerk_case_admin');
    await expect(page.getByRole('link', { name: 'Cases' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Audit Explorer' })).toHaveCount(0);
  });

  test('4b. the inverse user sees the inverse navigation', async ({ page }) => {
    // security_officer: audit_reader, NO case_read.
    await loginAs(page, 'security_officer');
    await expect(page.getByRole('link', { name: 'Audit Explorer' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cases' })).toHaveCount(0);
  });

  test('5. a no-entitlement user sees the explanatory alert and no module nav', async ({ page }) => {
    // jury_admin: a real role, ZERO entitlements — "role existence never implies access".
    await loginAs(page, 'jury_admin');
    await expect(page.getByRole('link', { name: 'Cases' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Audit Explorer' })).toHaveCount(0);
    await expect(page.getByText('No modules granted yet')).toBeVisible();
  });

  test('6. logout ends the session and it does not come back', async ({ page }) => {
    // A different case_read user (court_admin) so no single seeded account is
    // logged in enough times in one run to approach the realm's brute-force
    // failure factor.
    await loginAs(page, 'court_admin');
    await page.getByTestId('sign-out').click();
    await page.waitForURL(/\/login$/, { timeout: 30_000 });

    // Navigating back to a protected route does not restore the session: plan
    // 01-06 revoked it server-side, so RequireSession sends us to /login again.
    // The goto is deliberately raced by that client-side redirect, so don't wait
    // for the /cases load to settle — just assert where we land.
    await page.goto('/cases', { waitUntil: 'commit' }).catch(() => undefined);
    await page.waitForURL(/\/login$/, { timeout: 30_000 });
    await expect(page.getByTestId('sign-in')).toBeVisible();
  });

  test('7. the Cases nav link navigates (no orphan route)', async ({ page }) => {
    // law_clerk also holds case_read; spreads login load across accounts.
    await loginAs(page, 'law_clerk');
    await page.getByRole('link', { name: 'Cases' }).click();
    await page.waitForURL(/\/cases$/, { timeout: 30_000 });
    await expect(page.getByTestId('cases-screen')).toBeVisible();
  });

  test('7b. the Audit Explorer nav link navigates (no orphan route)', async ({ page }) => {
    await loginAs(page, 'security_officer');
    await page.getByRole('link', { name: 'Audit Explorer' }).click();
    await page.waitForURL(/\/audit$/, { timeout: 30_000 });
    await expect(page.getByTestId('audit-screen')).toBeVisible();
  });
});
