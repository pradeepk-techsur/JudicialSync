import { execSync } from 'node:child_process';

import { expect, test } from '@playwright/test';

import { loginAs } from './fixtures/totp';

/**
 * ============================================================================
 * The Case List — the clickable proof of Phase 1 criteria 1 and 4.
 * ============================================================================
 *
 * CONTEXT: "a case list whose contents visibly differ by role/entitlement". These
 * cases drive the real OIDC + TOTP login as different seeded users and assert the
 * SAME `/cases` screen shows different data to each — and, critically, that a
 * sealed case is absent ENTIRELY (not placeheld, not counted) for a user without
 * the sealing designation.
 *
 * ## The DEF-01 fixture adjustment, done honestly in-test
 *
 * The seed gives `judge` a `case`-type scope on the PLAIN case, which under plan
 * 01-02's narrowing semantics confines it to exactly that one case — so the
 * seeded `judge` sees FEWER cases than the court-wide `clerk_case_admin`, not
 * more, and cannot reach the sealed case at all (DEF-01, recorded across 01-07
 * and 01-14; the seed fix is owed to a later seed-owning plan). To demonstrate
 * criterion 4 cleanly — two users on the SAME screen differing ONLY by the
 * sealing designation, the entitled one seeing strictly more — this suite
 * removes judge's `case`-type narrowing for the run (restoring court-wide
 * visibility) while keeping its `designation_sealed`. Judge then sees exactly
 * what the court-wide clerk sees PLUS the sealed case: strictly greater by
 * construction, regardless of how many other cases the shared dev DB holds.
 *
 * The narrowing rows are captured and RESTORED in afterAll. The suite does not
 * change the narrowing SEMANTICS (that is load-bearing — removing it in
 * production would let every case-scoped principal reach every case in their
 * court); it only adjusts one fixture user's scope rows for the duration of the
 * run, then puts them back exactly as seeded.
 */

// Seeded identifiers (prisma/seed/ids.ts). Stable by contract.
const JUDGE_USER_ID = '0a000004-0000-4000-8000-000000000001';
const SEALED_CASE_NUMBER = '3:24-cr-00102';

/** Run one SQL statement against the compose `db` service as the superuser. */
function sql(statement: string): string {
  return execSync(
    `docker compose exec -T db psql -U postgres -d judicialsync -v ON_ERROR_STOP=1 -tAc "${statement.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' },
  ).trim();
}

/**
 * Drop a user's cached principal so the next login resolves scopes fresh.
 *
 * The API caches the resolved principal (roles + scopes + entitlements) in Redis
 * keyed by user id for a short window (plan 01-06, default 5 min), invalidated
 * only through the grants workflow. A raw SQL scope change bypasses that
 * invalidation, so a fresh login would otherwise still see the cached scopes.
 * Flushing the key here is the test-harness equivalent of the invalidation the
 * grants service performs in production.
 */
function flushPrincipalCache(userId: string): void {
  execSync(`docker compose exec -T redis redis-cli DEL principal:${userId}`, {
    encoding: 'utf8',
  });
}

/** The judge's seeded case-narrowing rows, captured so they can be restored. */
let judgeCaseScopes: Array<{ id: string; scope_value: string }> = [];

test.beforeAll(() => {
  // Capture, then remove, judge's `case`-type scope rows so its court scope
  // governs and it sees every NDCA case (plus the sealed one via its
  // designation). Restored verbatim in afterAll.
  const rows = sql(
    `SELECT id || '|' || scope_value FROM platform.scope_assignments ` +
      `WHERE user_id = '${JUDGE_USER_ID}' AND scope_type = 'case';`,
  );
  judgeCaseScopes = rows
    .split('\n')
    .filter((line) => line.includes('|'))
    .map((line) => {
      const [id, scope_value] = line.split('|');
      return { id, scope_value };
    });
  sql(
    `DELETE FROM platform.scope_assignments ` +
      `WHERE user_id = '${JUDGE_USER_ID}' AND scope_type = 'case';`,
  );
  // Invalidate any cached principal so the next judge login resolves the new,
  // court-wide scope set rather than a stale cached one.
  flushPrincipalCache(JUDGE_USER_ID);
});

test.afterAll(() => {
  // Put judge's seeded narrowing rows back exactly as they were.
  for (const row of judgeCaseScopes) {
    sql(
      `INSERT INTO platform.scope_assignments (id, user_id, scope_type, scope_value) ` +
        `VALUES ('${row.id}', '${JUDGE_USER_ID}', 'case', '${row.scope_value}') ` +
        `ON CONFLICT (id) DO NOTHING;`,
    );
  }
  // Clear the cache again so later suites see the restored (narrowed) judge.
  flushPrincipalCache(JUDGE_USER_ID);
});

test.describe('Case List — entitlement-differentiated rows', () => {
  test('clerk_case_admin sees NDCA cases and NOT the sealed case', async ({ page }) => {
    await loginAs(page, 'clerk_case_admin');
    await page.goto('/cases');
    await expect(page.getByTestId('cases-screen')).toBeVisible();

    const rows = page.getByTestId('case-row');
    await expect(rows.first()).toBeVisible();
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Every visible row is in the viewer's court (NDCA) — no SDNY row.
    for (let i = 0; i < rowCount; i += 1) {
      const court = await rows.nth(i).locator('td[data-label="Court"]').innerText();
      expect(court).not.toContain('Southern District of New York');
    }

    // The sealed case number is absent from the ENTIRE page — not placeheld,
    // not greyed out, not counted. Y0 non-disclosure of existence.
    await expect(page.locator('body')).not.toContainText(SEALED_CASE_NUMBER);
  });

  test('judge (designation_sealed) sees the sealed case — more rows than the clerk', async ({
    browser,
  }) => {
    // Each login gets its OWN browser context: a second loginAs in the same
    // context would find the first user's session still in sessionStorage and
    // never be redirected to /login.
    const clerkCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const clerkPage = await clerkCtx.newPage();
    await loginAs(clerkPage, 'clerk_case_admin');
    await clerkPage.goto('/cases');
    await expect(clerkPage.getByTestId('cases-screen')).toBeVisible();
    await expect(clerkPage.getByTestId('case-row').first()).toBeVisible();
    const clerkRowCount = await clerkPage.getByTestId('case-row').count();
    await clerkCtx.close();

    const judgeCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const judgePage = await judgeCtx.newPage();
    await loginAs(judgePage, 'judge');
    await judgePage.goto('/cases');
    await expect(judgePage.getByTestId('cases-screen')).toBeVisible();
    await expect(judgePage.getByTestId('case-row').first()).toBeVisible();

    // The sealed case number IS present, and the row set is strictly larger —
    // same screen, different data.
    await expect(judgePage.locator('body')).toContainText(SEALED_CASE_NUMBER);
    const judgeRowCount = await judgePage.getByTestId('case-row').count();
    expect(judgeRowCount).toBeGreaterThan(clerkRowCount);
    await judgeCtx.close();
  });

  test('security_officer (audit_reader, no case_read) sees the not-entitled alert', async ({
    page,
  }) => {
    await loginAs(page, 'security_officer');
    await page.goto('/cases');
    await expect(page.getByTestId('cases-screen')).toBeVisible();

    // No table, an explanatory alert, and no "Cases" nav link.
    await expect(page.getByTestId('cases-not-entitled')).toBeVisible();
    await expect(page.getByTestId('case-row')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Cases' })).toHaveCount(0);
  });

  test('jury_admin (role, zero entitlements) sees the not-entitled alert', async ({ page }) => {
    await loginAs(page, 'jury_admin');
    await page.goto('/cases');
    await expect(page.getByTestId('cases-screen')).toBeVisible();
    await expect(page.getByTestId('cases-not-entitled')).toBeVisible();
    await expect(page.getByTestId('case-row')).toHaveCount(0);
  });

  test('the displayed count equals the number of rendered rows', async ({ page }) => {
    await loginAs(page, 'clerk_case_admin');
    await page.goto('/cases');
    await expect(page.getByTestId('cases-screen')).toBeVisible();
    await expect(page.getByTestId('case-row').first()).toBeVisible();

    const rowCount = await page.getByTestId('case-row').count();
    const countText = await page.getByTestId('case-count').innerText();
    expect(countText).toContain(String(rowCount));
  });

  test('at 375px the table degrades to stacked cards with no body horizontal scroll', async ({
    page,
  }) => {
    await loginAs(page, 'clerk_case_admin');
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/cases');
    await expect(page.getByTestId('cases-screen')).toBeVisible();
    await expect(page.getByTestId('case-row').first()).toBeVisible();

    // No horizontal scrollbar on the document body at mobile width (1.4.10).
    const hasHorizontalScroll = await page.evaluate(
      () => document.body.scrollWidth > document.body.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);

    // The stacked layout surfaces each cell's column label via data-label.
    const firstCell = page.getByTestId('case-row').first().locator('td[data-label="Case number"]');
    await expect(firstCell).toBeVisible();
  });
});
