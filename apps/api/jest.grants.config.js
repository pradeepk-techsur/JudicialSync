/**
 * Jest configuration for the **grant-workflow integration suites**
 * (`test/grants-sod.e2e-spec.ts`, `test/bootstrap.e2e-spec.ts`, plan 01-08).
 *
 * ## Why these are not in `jest.config.js`
 *
 * They drive the real Compose stack: real Keycloak logins (password + TOTP),
 * the real OPA container deciding the SoD rule, and the real
 * `access_grant_requests` / `entitlement_grants` tables — including a raw
 * `UPDATE` as `app_rw` to prove the table CHECK constraint refuses a
 * self-approval, and a direct `POST /security/policy-evaluate` to prove the
 * Rego rule refuses it too. None of those claims can be made against a mock: a
 * mocked PDP would be a second copy of the policy agreeing with the guard by
 * construction, and a mocked database could not exercise the constraint.
 *
 * So they need `docker compose up`, and they need `NODE_EXTRA_CA_CERTS`
 * pointing at Caddy's internal CA *before the process starts*, which only a
 * `globalSetup` can arrange. Folding that into the hermetic config would make
 * every unit test depend on a running Docker stack.
 *
 * This mirrors the splits plan 01-06 (`jest.auth.config.js`) and plan 01-07
 * (`jest.policy.config.js`) already established, and reuses their CA helpers
 * verbatim rather than copying them — Node reads `NODE_EXTRA_CA_CERTS` once at
 * process start, so `globalSetup` alone configures only the setup process and
 * leaves every worker without the CA; `setupFiles` installs it inside each
 * worker.
 *
 * A separate config from `jest.policy.config.js` rather than a widened regex,
 * because that is plan 01-07's file and these are plan 01-08's suites — the
 * same single-owner discipline the rest of the phase follows.
 *
 * Run with: `npm run test:grants --workspace @judicialsync/api`
 * (requires `docker compose up -d`).
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'test/(grants-sod|bootstrap)\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  globalSetup: '<rootDir>/test/auth-setup.ts',
  setupFiles: ['<rootDir>/test/auth-trust-ca.ts'],
  // Real IdP round trips (each `loginAs` is a password + TOTP browser flow, and
  // TOTP one-time-use can cost a 30s window wait). The bootstrap suite also
  // boots several app instances with different env, each running startup
  // bootstrap against the live database.
  testTimeout: 300_000,
  // One Keycloak, one database, one OPA, shared. Parallel workers would contend
  // on all three. The bootstrap suite additionally restarts the app with
  // different env, which must not race another suite's logins.
  maxWorkers: 1,
  // The identity module's Redis client is a plain ioredis instance with no
  // shutdown hook, so its socket stays open after `app.close()` and Jest would
  // otherwise hang waiting on it. Pinned here for the same reason plans 01-06
  // and 01-07 pinned it; every assertion has already run by the time it applies.
  forceExit: true,
};
