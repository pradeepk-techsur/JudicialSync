/**
 * Jest configuration for the **case-model integration suites**
 * (`test/cases-api.e2e-spec.ts`, `test/case-no-delete.e2e-spec.ts`,
 * `test/designations-api.e2e-spec.ts`, plan 01-09).
 *
 * ## Why these are not in `jest.config.js`
 *
 * Every assertion in them is a claim about what happens over HTTP with a real
 * session, a real policy decision and a real database:
 *
 *  - `cases-api` signs in as the seeded `clerk_case_admin` and `judge` through
 *    the actual Keycloak browser flow (password + TOTP), because the list
 *    endpoint's whole security property is which rows a *particular*
 *    principal's entitlements admit;
 *  - `designations-api` proves that applying `sealed` immediately changes what
 *    a *different* principal can read, which cannot be shown without two real
 *    principals and the real PDP; and
 *  - `case-no-delete` opens a raw `pg` connection as `app_rw` to prove the
 *    DATABASE refuses a `DELETE`, which is not observable in process.
 *
 * So they need `docker compose up`, and they need `NODE_EXTRA_CA_CERTS`
 * pointing at Caddy's internal CA *before the process starts*, which only a
 * `globalSetup` can arrange. Folding that into the hermetic config would make
 * every unit test depend on a running Docker stack.
 *
 * This mirrors the split `jest.auth.config.js` (plan 01-06),
 * `jest.policy.config.js` (plan 01-07) and `jest.assurance.config.js` (plan
 * 01-14) already established: the fast suite stays fast and hermetic, and
 * suites that need the real stack declare it. A separate file rather than a
 * widened regex in one of theirs, because those are their plans' files — the
 * same single-owner discipline the rest of the phase follows.
 *
 * Run with: `npx jest --config apps/api/jest.cases.config.js --runInBand`
 * (requires `docker compose up -d`).
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  // The three case-model suites. `case-fixtures.ts` is a helper, not a suite,
  // and carries no `.e2e-spec` suffix so it is not matched.
  testRegex: 'test/(cases-api|case-no-delete|designations-api)\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  // Reuses plan 01-06's CA helpers verbatim rather than copying them. The
  // split between the two is load-bearing and documented in those files: Node
  // reads NODE_EXTRA_CA_CERTS once at process start, so `globalSetup` alone
  // configures only the setup process and leaves every worker without the CA —
  // which made an earlier auth run skip all fourteen suites while reporting
  // green. `setupFiles` installs it inside each worker.
  globalSetup: '<rootDir>/test/auth-setup.ts',
  setupFiles: ['<rootDir>/test/auth-trust-ca.ts'],
  // Real IdP round trips. Each `loginAs` is a password + TOTP browser flow,
  // and TOTP one-time-use can cost a 30-second window wait.
  testTimeout: 300_000,
  // The sandbox has 2 cores and these suites share one Keycloak, one database
  // and one OPA. Parallel workers would contend on all three, and the seeded
  // TOTP secrets are per user rather than per worker.
  maxWorkers: 1,
  // The identity module's Redis client (`redis.provider.ts`) is a plain
  // ioredis instance with no shutdown hook, so its socket stays open after
  // `app.close()` and Jest waits on it indefinitely — the run reports "Jest
  // did not exit one second after the test run has completed" and then hangs
  // until something kills it, which in CI is an un-timed-out job rather than a
  // test failure. Pinned here for the same reason plans 01-06 and 01-07
  // pinned it.
  //
  // Every assertion has already run and been reported by the time this
  // applies, so it suppresses no result — it only declines to wait on a
  // connection nothing is going to close.
  forceExit: true,
};
