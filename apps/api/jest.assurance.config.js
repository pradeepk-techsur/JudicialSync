/**
 * Jest configuration for the **negative-path assurance suite** (plan 01-14).
 *
 * ## Why this is a SEPARATE runner, and why that is the whole point
 *
 * CONTEXT names a dedicated negative-path suite a Phase 1 deliverable in its
 * own right — "not left to developer discretion" — and closes with "These
 * tests are the evidence for success criteria 1, 3, 4, and 5." A reviewer
 * answering "is the foundation sound?" runs *this* suite, on its own, and reads
 * *its* result. A result folded into the general test run would not be that
 * artifact; it would be a line in a larger log. So the suite is invocable and
 * reportable alone, via `npm run test:assurance -w apps/api` (the script plan
 * 01-01 declared, pointing here).
 *
 * ## How it differs from every other suite in the project
 *
 * Every other live-stack suite (`auth-*`, `abac-*`, `files-*`, `cases-*`,
 * `audit-*`) boots the Nest `AppModule` IN PROCESS via
 * `Test.createTestingModule(...)` and drives it with supertest. That exercises
 * the real guard chain, but it is still the application running inside the test
 * process. This suite does the opposite on purpose: it issues **raw `fetch`
 * against the running `api` container** through the TLS proxy at
 * `https://judicialsync.localhost:8443/api/v1`, exactly as an attacker on the
 * network would — no in-process module, no supertest, no UI. The only thing it
 * shares with the app is the database (reached as `app_rw`/`app_dba` through a
 * raw `pg` client) and the real Keycloak (reached for real password + TOTP
 * tokens). Nothing the app does can be mistaken for a guarantee here, because
 * the app is a black box on the far side of the proxy.
 *
 * ## Mechanics
 *
 *  - `globalSetup`/`setupFiles` are shared with the auth suites: they extract
 *    Caddy's internal CA and install it into each worker's TLS trust store, so
 *    `rejectUnauthorized` stays ON and the real certificate chain is verified
 *    (never a bypass). The harness additionally sets `ca` on its fetch agent.
 *  - `runInBand` / `maxWorkers: 1`: the destructive criterion-3 cases corrupt
 *    the shared audit chain and restore it; parallel workers would race on the
 *    chain and on the one shared Keycloak (TOTP one-time-use).
 *  - A long `testTimeout`: the suite drives real Keycloak logins (with TOTP
 *    window waits), real ClamAV scans, real OPA evaluations, and a scanner
 *    stop/restart cycle.
 *  - `forceExit`: the identity module's ioredis client has no shutdown hook, so
 *    its socket keeps the process alive after the suite finishes (same reason
 *    as `jest.auth.config.js`). Every assertion has already run by then.
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  // Only the assurance specs. `harness.ts` and `raw-sql-client.ts` are helpers
  // with no `.assurance-spec` suffix, so they are not matched as suites.
  testRegex: 'test/assurance/.*\\.assurance-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  // Caddy CA extraction + per-worker trust-store install — identical plumbing
  // to the auth suites, and for the identical reason (NODE_EXTRA_CA_CERTS is
  // read once at process start).
  globalSetup: '<rootDir>/test/auth-setup.ts',
  setupFiles: ['<rootDir>/test/auth-trust-ca.ts'],
  // Real Keycloak logins (with TOTP window waits), real ClamAV scans, a scanner
  // stop/restart, and a full chain re-walk all happen inside single tests.
  testTimeout: 900_000,
  // The destructive audit cases mutate one shared chain; the one Keycloak
  // enforces TOTP one-time-use. Both forbid parallelism.
  maxWorkers: 1,
  // See the header: the identity module's Redis socket has no close hook.
  forceExit: true,
};
