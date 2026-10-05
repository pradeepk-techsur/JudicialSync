/**
 * Jest configuration for the **authentication integration suites**.
 *
 * Separate from `jest.config.js` for one reason: these suites need
 * `NODE_EXTRA_CA_CERTS` set *before the process starts* in order to trust
 * Caddy's internal CA, which only a `globalSetup` can do. Folding that into
 * the main config would make every unit test depend on a running Docker
 * stack.
 *
 * The split mirrors the existing `jest.assurance.config.js` convention: the
 * fast suite stays fast and hermetic, and the suites that need the real
 * stack declare that need explicitly.
 *
 * Run with: `npm run test:auth --workspace @judicialsync/api`
 * (requires `docker compose up -d`).
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  // Only the auth-* suites. `auth-harness.ts` and `auth-setup.ts` are
  // helpers, not suites, and carry no `.spec` suffix so they are not matched.
  testRegex: 'test/auth-.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  // `globalSetup` extracts Caddy's CA to disk; `setupFiles` then installs it
  // into each worker's TLS trust store. Both are needed, and the split is the
  // whole subtlety: Node reads NODE_EXTRA_CA_CERTS once at process start, so
  // setting it inside globalSetup only affects the setup process — the
  // workers that actually run the tests never see it. Doing only that made
  // every suite skip while reporting a green run, which is the single worst
  // outcome available here: a security suite that tests nothing and says so
  // in a way nobody reads.
  globalSetup: '<rootDir>/test/auth-setup.ts',
  setupFiles: ['<rootDir>/test/auth-trust-ca.ts'],
  // Real IdP round trips, container queries and a full Nest boot per suite.
  testTimeout: 180_000,
  // The sandbox has 2 cores and these suites share one Keycloak and one
  // database; parallel workers would contend on both and on the session
  // fixtures they create.
  maxWorkers: 1,
};
