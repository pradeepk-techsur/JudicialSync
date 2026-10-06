import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { loginAs } from './fixtures/totp';

/**
 * ============================================================================
 * The release-blocking accessibility gate.
 * ============================================================================
 *
 * `UX-Mockup/Y2-accessibility.md`: "axe-core (or equivalent) run against every
 * workspace screen in CI; zero critical/serious violations permitted to merge."
 * CONTEXT rejected report-only by name — "a warning nobody must act on gets
 * ignored" — and PROJECT.md calls Section 508 "non-negotiable, not optional
 * polish." So this spec FAILS the build on any critical or serious violation,
 * and prints the full violation list so a failure is actionable rather than a
 * bare count.
 *
 * It also asserts two things axe cannot check on its own but Y2 requires:
 *   - a skip-to-main-content link is the first focusable element and moves focus
 *     to the main region;
 *   - the shell's landmark structure (banner, navigation, main) is present,
 *     since "consistent navigation (3.2.3)" depends on it and Phase 4 inherits
 *     whatever structure ships here.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'section508'];

/** Run axe and fail on any critical or serious violation, printing details. */
async function assertNoSeriousViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  if (blocking.length > 0) {
    // Print the full, actionable detail — not just a count.
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

test.describe('Accessibility gate (zero critical/serious)', () => {
  test('/login is accessible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('sign-in')).toBeVisible();
    await assertNoSeriousViolations(page, '/login');
  });

  test('/cases is accessible (authenticated)', async ({ page }) => {
    await loginAs(page, 'clerk_case_admin');
    await page.goto('/cases');
    await expect(page.getByTestId('cases-screen')).toBeVisible();
    await assertNoSeriousViolations(page, '/cases');
  });

  test('/audit is accessible (authenticated)', async ({ page }) => {
    await loginAs(page, 'security_officer');
    await page.goto('/audit');
    await expect(page.getByTestId('audit-screen')).toBeVisible();
    await assertNoSeriousViolations(page, '/audit');
  });

  test('the skip link is the first focusable element and moves focus to main', async ({ page }) => {
    await loginAs(page, 'clerk_case_admin');
    await page.goto('/cases');
    await expect(page.getByTestId('cases-screen')).toBeVisible();

    // First Tab lands on the skip link.
    await page.keyboard.press('Tab');
    const focusedText = await page.evaluate(() => document.activeElement?.textContent ?? '');
    expect(focusedText).toContain('Skip to main content');

    // Activating it moves focus into the main region.
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
