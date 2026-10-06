/**
 * Jest configuration for the JudicialSync Platform Core API.
 *
 * The project-wide test idiom is **Jest + supertest against the Nest
 * application instance** (`Test.createTestingModule(...).compile()`), not a
 * separately-launched HTTP server. Every later Phase 1 plan uses this same
 * idiom so that the guard chain, the global exception filter and dependency
 * injection are all exercised exactly as they are in production.
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      // `isolatedModules` is set in tsconfig.json, not here: the ts-jest
      // option of that name is deprecated and removed in ts-jest v30.
      { tsconfig: '<rootDir>/tsconfig.json' },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  coverageDirectory: './coverage',
  // The assurance suite (plan 01-14) runs under jest.assurance.config.js and is
  // excluded here so the fast unit/e2e run never depends on a live database.
  //
  // The `auth-*` suites (plan 01-06) are excluded for the same reason and run
  // under jest.auth.config.js. They drive the REAL Keycloak from the Compose
  // stack rather than a mock — deliberately, since a mocked IdP would prove
  // nothing about the integration — which means they need `docker compose up`
  // and a globalSetup that installs Caddy's CA before the process starts.
  // Keeping them out of this config is what lets `npm test` stay hermetic.
  //
  // The `abac-*` suites (plan 01-07) are excluded on identical grounds and
  // run under jest.policy.config.js: they evaluate against the real OPA
  // container, and one of them STOPS it to prove the system fails closed.
  // Note that the policy module's own hermetic unit tests
  // (`src/modules/policy/policy-contract.spec.ts`) deliberately stay in THIS
  // config — they stub the PDP over loopback and need no stack, so the
  // properties they pin are checked on every commit.
  //
  // The `grants-sod` and `bootstrap` suites (plan 01-08) are excluded for the
  // same reason and run under jest.grants.config.js: they drive the real
  // Keycloak, the real OPA (the SoD rule), and the real grant tables —
  // including a raw `app_rw` UPDATE to exercise the table CHECK constraint, and
  // startup bootstrap against the live database. None of that is hermetic.
  //
  // The case-model suites (plan 01-09) are excluded on identical grounds and
  // run under jest.case.config.js: they sign in against the real Keycloak, let
  // the real OPA decide every route, and one of them opens a raw `pg`
  // connection as `app_rw` to prove the database refuses a DELETE.
  // The `audit-explorer` and `audit-integrity-job` suites (plan 01-12) are
  // excluded on the same grounds and run under jest.integrity.config.js: they
  // drive the real Keycloak, OPA, database AND Redis (BullMQ needs it for the
  // scheduled verification job), and the integrity suite corrupts audit rows as
  // app_dba. The other `audit-*` suites (01-05) stay in THIS config — they use
  // Testcontainers and need no Compose stack.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/assurance/',
    '/test/auth-.*\\.e2e-spec\\.ts$',
    '/test/abac-.*\\.e2e-spec\\.ts$',
    '/test/audit-explorer\\.e2e-spec\\.ts$',
    '/test/audit-integrity-job\\.e2e-spec\\.ts$',
    // The `files-*` suites (plan 01-10) drive the real ClamAV and real MinIO
    // from the Compose stack — one of them even stops the ClamAV container —
    // and run under jest.files.config.js. Excluded here so `npm test` stays
    // hermetic.
    '/test/files-.*\\.e2e-spec\\.ts$',
  ],
};
