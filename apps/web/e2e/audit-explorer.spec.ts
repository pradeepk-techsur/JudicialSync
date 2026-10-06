import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { loginAs } from './fixtures/totp';

/**
 * ============================================================================
 * The Audit Explorer — the clickable proof of criterion 3 and the UI half of 4.
 * ============================================================================
 *
 * These cases drive the real OIDC + TOTP login and exercise Screen-17 against the
 * live stack: the authorized view, filtering with URL reflection, denied attempts
 * rendered as tagged rows, row-detail expansion with the disabled rule-package
 * link, the server-driven no-entitlement alert, the broken-chain critical alert,
 * structural read-only-ness, and keyboard operability.
 *
 * ## The DEF-03 shared-DB reality, handled honestly
 *
 * The `chain_verified` flag is GLOBAL: `/audit/integrity/status` reports verified
 * only when zero `integrity_alerts` rows are open. The shared dev DB carries
 * GENUINE chain breaks accumulated across suites (recorded as DEF-03 across 01-09
 * and 01-14), and the scheduled integrity job re-detects them and re-inserts open
 * alerts within seconds of any delete — so a globally-"verified" chain is not a
 * state this suite can reliably force on the live shared stack, and asserting it
 * would be asserting the absence of other suites' artifacts.
 *
 * So this suite does NOT assert the verified flag. It asserts what is actually
 * true and in this component's control:
 *   - the integrity badge REGION renders and reflects the server's real state
 *     (verified Tag or broken Alert) — the badge is wired to /status either way;
 *   - the BROKEN-chain state renders the exact Screen-17 critical, non-dismissable
 *     alert, which the suite guarantees by inserting one open alert (on top of the
 *     genuine breaks) and removes afterward.
 * The verified-Tag DOM is still exercised by the accessibility gate via a
 * best-effort delete-then-scan (axe.spec.ts), where a racy verified state is
 * acceptable because the scan runs against whichever valid state is present.
 */

/** Run one SQL statement against the compose `db` service as the superuser. */
function sql(statement: string): string {
  return execSync(
    `docker compose exec -T db psql -U postgres -d judicialsync -v ON_ERROR_STOP=1 -tAc "${statement.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' },
  ).trim();
}

test.describe('Audit Explorer — Screen-17', () => {
  test('authorized view: toolbar, a populated table, and the live integrity badge', async ({
    page,
  }) => {
    await loginAs(page, 'security_officer');
    await page.goto('/audit');
    await expect(page.getByTestId('audit-screen')).toBeVisible();

    // Filter toolbar present.
    await expect(page.getByTestId('audit-filters')).toBeVisible();

    // At least one row, with non-empty Actor and Action cells — proving the
    // actor/action linkage reaches the screen.
    const rows = page.getByTestId('audit-row');
    await expect(rows.first()).toBeVisible();
    const actor = await rows.first().locator('td').nth(1).innerText();
    const action = await rows.first().locator('td').nth(2).innerText();
    expect(actor.trim().length).toBeGreaterThan(0);
    expect(action.trim().length).toBeGreaterThan(0);

    // The integrity badge reflects the server's REAL state — a verified Tag or
    // the broken-chain critical Alert. On the shared dev DB the chain is
    // genuinely broken (DEF-03), so either is a correct, wired rendering.
    const verified = page.getByTestId('integrity-verified');
    const broken = page.getByTestId('integrity-broken');
    await expect(verified.or(broken).first()).toBeVisible();
  });

  test('filtering works end to end and is reflected in the URL', async ({ page }) => {
    await loginAs(page, 'security_officer');
    await page.goto('/audit');
    await expect(page.getByTestId('audit-row').first()).toBeVisible();

    // Filter by object type = case, then Search.
    await page.getByTestId('audit-filters').locator('#filter-object-type').selectOption('cases');
    await page.getByTestId('audit-search').click();

    await expect.poll(() => new URL(page.url()).searchParams.get('object_type')).toBe('cases');

    // A date range that excludes everything → the empty state.
    await page.getByTestId('audit-filters').locator('#filter-object-type').selectOption('');
    await page.getByTestId('audit-filters').locator('#filter-date-from').fill('01/01/1990');
    await page.getByTestId('audit-filters').locator('#filter-date-to').fill('01/02/1990');
    await page.getByTestId('audit-search').click();

    await expect(page.getByTestId('audit-empty')).toBeVisible();
    await expect(page.getByTestId('audit-empty')).toContainText('No audit events match these filters');
    await expect.poll(() => new URL(page.url()).searchParams.get('date_from')).toContain('1990');
  });

  test('denied access attempts appear as rows carrying a "denied" Tag', async ({ browser }) => {
    const SEALED_CASE_ID = '0a000005-0000-4000-8000-000000000002';
    const CLERK_USER_ID = '0a000004-0000-4000-8000-000000000004';

    // First, as clerk_case_admin (no designation_sealed), deliberately request the
    // sealed case through the authenticated API from within the page. The ABAC
    // guard denies it and logs an `access_attempt` with outcome "denied".
    const clerkCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const clerkPage = await clerkCtx.newPage();
    await loginAs(clerkPage, 'clerk_case_admin');
    await clerkPage.evaluate(async (caseId) => {
      const token = window.sessionStorage.getItem('judicialsync.session_token');
      await fetch(`/api/v1/cases/${caseId}`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
    }, SEALED_CASE_ID);
    await clerkCtx.close();

    // Now as security_officer, filter to clerk's access_attempt rows. Scoping to
    // the clerk's user_id isolates the denied attempt from the login_success
    // access_attempts every other login writes (which would otherwise dominate the
    // newest page and push the denied row off it).
    const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
    await loginAs(page, 'security_officer');
    await page.goto(`/audit?user_id=${CLERK_USER_ID}&action_type=access_attempt`);
    await expect(page.getByTestId('audit-screen')).toBeVisible();
    await expect(page.getByTestId('audit-row').first()).toBeVisible();

    // At least one of clerk's access_attempt rows carries a Tag whose TEXT reads
    // "denied" — tried-and-told-no, surfaced not omitted (Screen-17). The URL
    // reflects the filters.
    expect(new URL(page.url()).searchParams.get('action_type')).toBe('access_attempt');
    const deniedTags = page.getByTestId('access-attempt-tag').filter({ hasText: 'denied' });
    await expect(deniedTags.first()).toBeVisible();
  });

  test('a row expands to show before/after and a DISABLED rule-package link', async ({ page }) => {
    await loginAs(page, 'security_officer');
    await page.goto('/audit');

    // A status_change row has a before/after diff.
    await page.getByTestId('audit-filters').locator('#filter-action-type').selectOption('status_change');
    await page.getByTestId('audit-search').click();

    const row = page.getByTestId('audit-row').first();
    await expect(row).toBeVisible();
    await row.click();

    await expect(page.getByTestId('audit-row-detail').first()).toBeVisible();
    // The rule-package link is present and DISABLED with its tooltip wrapper.
    const ruleLink = page.getByTestId('rule-package-link').first();
    await expect(ruleLink).toBeVisible();
    await expect(ruleLink).toBeDisabled();
  });

  test('no-entitlement: clerk_case_admin sees the AUDIT_READ_DENIED alert, no table, no nav link', async ({
    page,
  }) => {
    await loginAs(page, 'clerk_case_admin');
    await page.goto('/audit');
    await expect(page.getByTestId('audit-screen')).toBeVisible();

    await expect(page.getByTestId('audit-read-denied')).toBeVisible();
    await expect(page.getByTestId('audit-read-denied')).toContainText(
      'You do not have audit explorer access',
    );
    await expect(page.getByTestId('audit-results-table')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Audit Explorer' })).toHaveCount(0);
  });

  test('broken chain: the badge is replaced by a non-dismissable critical alert', async ({ page }) => {
    const alertId = randomUUID();
    // Insert exactly one open integrity alert so the global chain_verified flips
    // to false. Removed in the finally so the suite leaves zero open alerts.
    sql(
      `INSERT INTO platform.integrity_alerts (id, alert_type, severity, detail, detected_at, status) ` +
        `VALUES ('${alertId}', 'chain_break', 'critical', '{}'::jsonb, now(), 'open');`,
    );
    try {
      await loginAs(page, 'security_officer');
      await page.goto('/audit');
      await expect(page.getByTestId('audit-screen')).toBeVisible();

      // The critical alert replaces the badge, with the exact Screen-17 copy.
      const broken = page.getByTestId('integrity-broken');
      await expect(broken).toBeVisible();
      await expect(broken).toContainText('Audit integrity check failed — escalated to security officer');

      // No dismiss/close control anywhere in the alert.
      await expect(broken.locator('button[aria-label*="lose" i], button:has-text("Close")')).toHaveCount(
        0,
      );

      // The verified badge is NOT shown in this state.
      await expect(page.getByTestId('integrity-verified')).toHaveCount(0);
    } finally {
      sql(`DELETE FROM platform.integrity_alerts WHERE id = '${alertId}';`);
    }
  });

  test('read-only, structurally: no Edit/Delete control and no input in the results table', async ({
    page,
  }) => {
    await loginAs(page, 'security_officer');
    await page.goto('/audit');
    await expect(page.getByTestId('audit-row').first()).toBeVisible();

    await expect(page.locator('button:has-text("Delete")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Edit")')).toHaveCount(0);
    // No input element inside the results table (filters live outside it).
    await expect(page.getByTestId('audit-results-table').locator('input')).toHaveCount(0);
  });

  test('keyboard operability: skip link, filters, Search, then a row expands on Enter', async ({
    page,
  }) => {
    await loginAs(page, 'security_officer');
    await page.goto('/audit');
    await expect(page.getByTestId('audit-row').first()).toBeVisible();

    // First Tab lands on the skip link.
    await page.keyboard.press('Tab');
    const firstFocus = await page.evaluate(() => document.activeElement?.textContent ?? '');
    expect(firstFocus).toContain('Skip to main content');

    // Focus can reach the first expandable row, and Enter expands it.
    const row = page.getByTestId('audit-row').first();
    await row.focus();
    await expect(row).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('audit-row-detail').first()).toBeVisible();
  });
});
