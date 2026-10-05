/**
 * Jest configuration for the **ABAC / policy-enforcement integration suites**
 * (`test/abac-*.e2e-spec.ts`, plan 01-07).
 *
 * ## Why these are not in `jest.config.js`
 *
 * They drive the real OPA container, the real Keycloak and the real database:
 * the point of `abac-guard.e2e-spec.ts` is that the decision comes from the
 * Rego bundle that actually ships, and the point of
 * `abac-fail-closed.e2e-spec.ts` is that stopping that container turns a 200
 * into a 503. Neither claim can be made against a mock — a mocked PDP is a
 * second implementation of the policy, agreeing with the guard by
 * construction.
 *
 * So they need `docker compose up`, and they need `NODE_EXTRA_CA_CERTS`
 * pointing at Caddy's internal CA *before the process starts*, which only a
 * `globalSetup` can arrange. Folding that into the hermetic config would make
 * every unit test depend on a running Docker stack.
 *
 * This mirrors the split `jest.assurance.config.js` (plan 01-14) and
 * `jest.auth.config.js` (plan 01-06) already established: the fast suite stays
 * fast and hermetic, and suites that need the real stack declare it.
 *
 * A separate config from `jest.auth.config.js` rather than a widened regex,
 * because `jest.auth.config.js` is plan 01-06's file and these are plan
 * 01-07's suites — the same single-owner discipline the rest of the phase
 * follows.
 *
 * Run with: `npm run test:policy --workspace @judicialsync/api`
 * (requires `docker compose up -d`).
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  // Only the abac-* suites. `abac-probe.controller.ts` is a fixture, not a
  // suite, and carries no `.e2e-spec` suffix so it is not matched.
  testRegex: 'test/abac-.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  // Reuses plan 01-06's CA helpers verbatim rather than copying them. The
  // split between the two is load-bearing and documented in those files:
  // Node reads NODE_EXTRA_CA_CERTS once at process start, so `globalSetup`
  // alone configures only the setup process and leaves every worker without
  // the CA — which made an earlier auth run skip all fourteen suites while
  // reporting green. `setupFiles` installs it inside each worker.
  globalSetup: '<rootDir>/test/auth-setup.ts',
  setupFiles: ['<rootDir>/test/auth-trust-ca.ts'],
  // Real IdP round trips (each `loginAs` is a password + TOTP browser flow,
  // and TOTP one-time-use can cost a 30s window wait), plus container
  // stop/start in the fail-closed suite.
  testTimeout: 300_000,
  // The sandbox has 2 cores and these suites share one Keycloak, one database
  // and one OPA. Parallel workers would contend on all three — and the
  // fail-closed suite STOPS the OPA container, which would fail every
  // concurrently-running test in the guard suite for a reason that has
  // nothing to do with them.
  maxWorkers: 1,
  // The identity module's Redis client (`redis.provider.ts`) is a plain
  // ioredis instance with no shutdown hook, so its socket stays open after
  // `app.close()` and Jest waits on it indefinitely — the run reports "Jest
  // did not exit one second after the test run has completed" and then hangs
  // until something kills it, which in CI is an un-timed-out job rather than
  // a test failure. Pinned here for the same reason plan 01-06 pinned it.
  //
  // Every assertion has already run and been reported by the time this
  // applies, so it suppresses no result — it only declines to wait on a
  // connection nothing is going to close.
  forceExit: true,
};
