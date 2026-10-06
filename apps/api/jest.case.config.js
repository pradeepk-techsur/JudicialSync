/**
 * Jest configuration for the **case & docket model integration suites**
 * (`test/cases-api.e2e-spec.ts`, `test/designations-api.e2e-spec.ts`,
 * `test/case-no-delete.e2e-spec.ts`, plan 01-09).
 *
 * ## Why these are not in `jest.config.js`
 *
 * They drive the real stack: real Keycloak sign-ins (password + TOTP), the
 * real OPA/PDP deciding every `@Resource()` route, the real hash-chained audit
 * trail, and — for `case-no-delete` — a raw `pg` connection as `app_rw` to
 * prove the database itself refuses a `DELETE`. None of that can be asserted
 * against a mock.
 *
 * So, exactly like plan 01-06's `jest.auth.config.js` and plan 01-07's
 * `jest.policy.config.js`, they need `docker compose up` and they need
 * `NODE_EXTRA_CA_CERTS` pointing at Caddy's internal CA **before the process
 * starts** — which only a `globalSetup` can arrange. Node reads that variable
 * once at startup, so folding these into the hermetic `jest.config.js` would
 * make every unit test depend on a running Docker stack, and running them there
 * without the CA would make them SKIP while reporting green (the exact silent
 * failure `auth-trust-ca.ts` documents).
 *
 * The CA helpers are plan 01-06's, reused verbatim rather than copied — the
 * `globalSetup`/`setupFiles` split is load-bearing and documented in those
 * files.
 *
 * Run with: `npm run test:case --workspace @judicialsync/api`
 * (requires `docker compose up -d`).
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'test/(cases-api|designations-api|case-no-delete)\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  globalSetup: '<rootDir>/test/auth-setup.ts',
  setupFiles: ['<rootDir>/test/auth-trust-ca.ts'],
  testTimeout: 300_000,
  // The sandbox shares one Keycloak, one database and one OPA across suites;
  // parallel workers would contend on all three. Serial, as the auth and
  // policy suites are.
  maxWorkers: 1,
  // The identity Redis client has no shutdown hook, so its socket keeps Jest
  // alive after app.close(). Every assertion has already run and reported by
  // the time this applies — it only declines to wait on a connection nothing
  // closes. Same reason plans 01-06/01-07 pinned it.
  forceExit: true,
};
