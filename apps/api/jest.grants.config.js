/**
 * Jest configuration for the **grant-workflow and bootstrap integration
 * suites** (`test/grants-*.e2e-spec.ts`, `test/bootstrap.e2e-spec.ts`, plan
 * 01-08).
 *
 * ## Why these are not in `jest.config.js`
 *
 * Same reason as `jest.auth.config.js` (01-06) and `jest.policy.config.js`
 * (01-07), and the reason is sharper here than for either of them.
 *
 * `grants-sod.e2e-spec.ts` proves separation of duties at **three independent
 * layers**, and two of those layers do not exist inside this process: the Rego
 * `sod_deny` rule lives in the OPA container, and the
 * `CHECK (decided_by <> requested_by)` constraint lives in PostgreSQL. A
 * mocked PDP would be a second implementation of the policy agreeing with the
 * guard by construction, and there is no way at all to mock a table CHECK —
 * the only honest test of "the database refuses this write" is to issue the
 * write to a database.
 *
 * So these suites need `docker compose up`, and they need
 * `NODE_EXTRA_CA_CERTS` pointing at Caddy's internal CA *before the process
 * starts*, which only a `globalSetup` can arrange. Folding that into the
 * hermetic config would make every unit test depend on a running stack.
 *
 * Run with: `npm run test:grants --workspace @judicialsync/api`
 * (requires `docker compose up -d`).
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'test/(grants-.*|bootstrap)\\.e2e-spec\\.ts$',
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
  // and Keycloak's one-time-use enforcement on TOTP codes can cost a 30-second
  // window wait between consecutive logins of the same user.
  testTimeout: 300_000,
  // The sandbox has 2 cores and these suites share one Keycloak, one database
  // and one OPA — and they mutate grant state for shared seeded users, so
  // parallel workers would race each other's fixtures as well as contend for
  // the containers.
  maxWorkers: 1,
  // The identity module's Redis client (`redis.provider.ts`) is a plain ioredis
  // instance with no shutdown hook, so its socket stays open after
  // `app.close()` and Jest waits on it indefinitely — the run reports "Jest did
  // not exit one second after the test run has completed" and then hangs until
  // something kills it, which in CI is an un-timed-out job rather than a test
  // failure. Pinned here for the same reason plans 01-06 and 01-07 pinned it.
  //
  // Every assertion has already run and been reported by the time this applies,
  // so it suppresses no result — it only declines to wait on a connection
  // nothing is going to close.
  forceExit: true,
};
