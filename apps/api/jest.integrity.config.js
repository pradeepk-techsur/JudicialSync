/**
 * Jest configuration for the **Audit Explorer and hash-chain integrity
 * integration suites** (`test/audit-explorer.e2e-spec.ts`,
 * `test/audit-integrity-job.e2e-spec.ts`, plan 01-12).
 *
 * ## Why these are not in `jest.config.js`
 *
 * They drive the real Compose stack: real Keycloak sign-ins (password + TOTP),
 * the real OPA container deciding every `@Resource()` route, the real database,
 * and — unique to this plan — the real Redis that BullMQ requires for the
 * scheduled verification job. The integrity suite also corrupts audit rows as
 * `app_dba` and asserts the verifier detects the break; none of that is
 * expressible against a mock, and a mocked verifier would be a second
 * implementation agreeing with the first by construction.
 *
 * So they need `docker compose up` and `NODE_EXTRA_CA_CERTS` pointing at
 * Caddy's internal CA *before the process starts*, which only a `globalSetup`
 * can arrange. Folding that into the hermetic config would make `npm test`
 * depend on a running Docker stack.
 *
 * Mirrors `jest.auth.config.js` (01-06) and `jest.policy.config.js` (01-07): a
 * separate config rather than a widened regex, because those are other plans'
 * files and these are 01-12's suites — the same single-owner discipline the
 * phase follows.
 *
 * Run with: `npm run test:integrity --workspace @judicialsync/api`
 * (requires `docker compose up -d`).
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  // Only this plan's two live-stack suites.
  testRegex: 'test/audit-(explorer|integrity-job)\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  // Reuses 01-06's CA helpers verbatim: `globalSetup` extracts Caddy's CA to
  // disk, `setupFiles` installs it into each worker's TLS trust store. Both are
  // needed — Node reads NODE_EXTRA_CA_CERTS once at process start, so the
  // globalSetup alone would leave the workers without the CA.
  globalSetup: '<rootDir>/test/auth-setup.ts',
  setupFiles: ['<rootDir>/test/auth-trust-ca.ts'],
  // Real IdP round trips (each `loginAs` is a password + TOTP flow with a
  // possible 30s TOTP-window wait), a full Nest boot per suite, and the
  // integrity suite's scheduled-job poll.
  testTimeout: 300_000,
  // The sandbox shares one Keycloak, one database, one OPA and one Redis across
  // suites. Parallel workers would contend on all four, and the integrity suite
  // mutates the shared audit chain — serial execution keeps the corruption in
  // each case from racing another suite's assertions.
  maxWorkers: 1,
  // BullMQ's worker and the identity Redis client keep sockets open after
  // `app.close()`, so Jest would otherwise report "did not exit one second
  // after the test run" and hang. Every assertion has already run by then;
  // forceExit only declines to wait on connections nothing is going to close.
  // Same reasoning as jest.auth.config.js and jest.policy.config.js.
  forceExit: true,
};
