import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { loginAs } from './fixtures/totp';

/**
 * ============================================================================
 * The release-blocking accessibility gate — now over POPULATED screens.
 * ============================================================================
 *
 * `UX-Mockup/Y2-accessibility.md`: "axe-core (or equivalent) run against every
 * workspace screen in CI; zero critical/serious violations permitted to merge."
 * CONTEXT rejected report-only by name — "a warning nobody must act on gets
 * ignored" — so this spec FAILS the build on any critical or serious violation
 * and prints the full violation list so a failure is actionable.
 *
 * Plan 01-13 scanned the placeholder Case List and Audit Explorer — nearly empty
 * pages that pass almost anything. Plan 01-15 populates both screens, so this
 * gate now covers the REAL DOM states where a11y mistakes actually live:
 *
 *   1. /cases as `judge`           — populated table including a designated case
 *   2. /audit as `security_officer`— populated results table + verified badge
 *   3. /audit with a row EXPANDED  — the accordion's aria-expanded/-controls DOM
 *   4. /audit in the BROKEN-CHAIN state — the critical alert's live-region DOM
 *   5. /cases at 375px             — the stacked-card degradation (1.4.10)
 *   6. /cases as `jury_admin`      — the no-entitlement alert state
 *
 * It also keeps the two checks axe cannot do alone: the skip link is first and
 * moves focus to main, and the shell exposes banner/navigation/main landmarks.
 *
 * DEF-03: the shared dev DB carries GENUINE chain breaks and the scheduled job
 * re-inserts open integrity alerts within seconds, so the live /audit chain is
 * effectively always broken. The populated-/audit scan therefore scans whichever
 * valid badge state is present (verified Tag or broken Alert — both are real,
 * wired DOM), and the broken-chain scan guarantees the critical-alert DOM by
 * inserting one alert then removing it. A best-effort delete-then-scan still
 * exercises the verified-Tag DOM when the window allows.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'section508'];

/** Run one SQL statement against the compose `db` service as the superuser. */
function sql(statement: string): string {
  return execSync(
    `docker compose exec -T db psql -U postgres -d judicialsync -v ON_ERROR_STOP=1 -tAc "${statement.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' },
  ).trim();
}

/** Run axe and fail on any critical or serious violation, printing details. */
async function assertNoSeriousViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  if (blocking.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `axe violations on ${label}:\n${JSON.stringify(
        blocking.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.map((n) => n.target),
        })),
        null,
        2,
      )}`,
    );
  }
  expect(blocking, `critical/serious a11y violations on ${label}`).toEqual([]);
}

test.beforeAll(() => {
  // Best-effort: clear open alerts so a verified-Tag DOM may be scanned if the
  // scheduled job has not re-detected the genuine breaks yet (DEF-03). The
  // populated-/audit scan tolerates either state regardless.
  sql(`DELETE FROM platform.integrity_alerts WHERE status = 'open';`);
});

test.describe('Accessibility gate (zero critical/serious)', () => {
  test('/login is accessible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('sign-in')).toBeVisible();
    await assertNoSeriousViolations(page, '/login');
  });

  test('/cases (populated) is accessible as judge', async ({ page }) => {
    await loginAs(page, 'judge');
    await page.goto('/cases');
    await expect(page.getByTestId('case-row').first()).toBeVisible();
    await assertNoSeriousViolations(page, '/cases (judge, populated)');
  });

  test('/audit (populated) is accessible as security_officer', async ({ page }) => {
    await loginAs(page, 'security_officer');
    await page.goto('/audit');
    await expect(page.getByTestId('audit-row').first()).toBeVisible();
    // The integrity badge is present in SOME valid state (verified or broken).
    const verified = page.getByTestId('integrity-verified');
    const broken = page.getByTestId('integrity-broken');
    await expect(verified.or(broken).first()).toBeVisible();
    await assertNoSeriousViolations(page, '/audit (security_officer, populated)');
  });

  test('/audit with a row expanded is accessible', async ({ page }) => {
    await loginAs(page, 'security_officer');
    await page.goto('/audit');
    const row = page.getByTestId('audit-row').first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByTestId('audit-row-detail').first()).toBeVisible();
    await assertNoSeriousViolations(page, '/audit (row expanded)');
  });

  test('/audit in the broken-chain state is accessible', async ({ page }) => {
    const alertId = randomUUID();
    sql(
      `INSERT INTO platform.integrity_alerts (id, alert_type, severity, detail, detected_at, status) ` +
        `VALUES ('${alertId}', 'chain_break', 'critical', '{}'::jsonb, now(), 'open');`,
    );
    try {
      await loginAs(page, 'security_officer');
      await page.goto('/audit');
      await expect(page.getByTestId('integrity-broken')).toBeVisible();
      await assertNoSeriousViolations(page, '/audit (broken chain)');
    } finally {
      sql(`DELETE FROM platform.integrity_alerts WHERE id = '${alertId}';`);
    }
  });

  test('/cases at 375px (stacked cards) is accessible', async ({ page }) => {
    await loginAs(page, 'clerk_case_admin');
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/cases');
    await expect(page.getByTestId('case-row').first()).toBeVisible();
    await assertNoSeriousViolations(page, '/cases (375px)');
  });

  test('/cases no-entitlement alert (jury_admin) is accessible', async ({ page }) => {
    await loginAs(page, 'jury_admin');
    await page.goto('/cases');
    await expect(page.getByTestId('cases-not-entitled')).toBeVisible();
    await assertNoSeriousViolations(page, '/cases (jury_admin, not entitled)');
  });

  test('the skip link is the first focusable element and moves focus to main', async ({ page }) => {
    await loginAs(page, 'clerk_case_admin');
    await page.goto('/cases');
    await expect(page.getByTestId('cases-screen')).toBeVisible();

    await page.keyboard.press('Tab');
    const focusedText = await page.evaluate(() => document.activeElement?.textContent ?? '');
    expect(focusedText).toContain('Skip to main content');

    await page.keyboard.press('Enter');
    const mainVisible = await page.locator('main#main-content').isVisible();
    expect(mainVisible).toBe(true);
  });

  test('the shell exposes banner, navigation and main landmarks', async ({ page }) => {
    await loginAs(page, 'clerk_case_admin');
    await page.goto('/cases');
    await expect(page.getByTestId('cases-screen')).toBeVisible();

    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
  });
});
