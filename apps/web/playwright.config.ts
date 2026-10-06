import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for the real browser E2E suite.
 *
 * The suite drives the LIVE Compose stack — the whole point is to exercise the
 * real OIDC + TOTP path against real Keycloak, not a mock. So there is no
 * `webServer` block: `docker compose up` brings the stack up before the suite
 * runs (locally and in `.github/workflows/e2e.yml`).
 *
 *   - `baseURL` is the single TLS origin the proxy serves.
 *   - `ignoreHTTPSErrors` because that origin uses Caddy's internal CA.
 *   - `workers: 1` — each worker is a browser, and the sandbox has only a couple
 *     of cores; more workers OOM or thrash.
 *   - generous `timeout` because a real IdP redirect round-trip is slower than
 *     an in-process assertion.
 */
export default defineConfig({
  testDir: './e2e',
  // Clear Keycloak brute-force state once before the suite so the gate measures
  // the app, not the IdP rate limiter (see e2e/global-setup.ts).
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'https://judicialsync.localhost:8443',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
