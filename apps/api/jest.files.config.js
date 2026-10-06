/**
 * Jest configuration for the **file-upload pipeline integration suites**
 * (`test/files-*.e2e-spec.ts`, plan 01-10).
 *
 * ## Why these are not in `jest.config.js`
 *
 * They drive the real ClamAV and the real MinIO from `docker-compose.yml`, plus
 * the real Keycloak and database — the whole point of `files-upload.e2e-spec.ts`
 * is that a disallowed-type file and an EICAR-infected file are rejected
 * *before storage* by a real scanner, and the whole point of
 * `files-roundtrip.e2e-spec.ts` is that bytes come back byte-identical from a
 * real object store. Neither claim can be made against a mock: a mocked scanner
 * is exactly the placeholder CONTEXT rejected, reintroduced one layer down.
 *
 * So they need `docker compose up`, and they need `NODE_EXTRA_CA_CERTS` pointing
 * at Caddy's internal CA *before the process starts* (every `loginAs` is a real
 * TLS browser flow). Folding that into the hermetic `jest.config.js` would make
 * every unit test depend on a running Docker stack.
 *
 * This mirrors the split `jest.auth.config.js` (01-06), `jest.policy.config.js`
 * (01-07) and `jest.assurance.config.js` (01-14) already established: the fast
 * suite stays fast and hermetic, and suites that need the real stack declare it.
 * A separate config rather than a widened regex keeps the same single-owner
 * discipline the rest of the phase follows — these suites belong to plan 01-10.
 *
 * Run with: `npm run test:files --workspace @judicialsync/api`
 * (requires `docker compose up -d`).
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'test/files-.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  // Reuses plan 01-06's CA helpers verbatim — see jest.policy.config.js for why
  // both globalSetup AND setupFiles are needed (Node reads NODE_EXTRA_CA_CERTS
  // once at process start, so globalSetup alone leaves every worker without it).
  globalSetup: '<rootDir>/test/auth-setup.ts',
  setupFiles: ['<rootDir>/test/auth-trust-ca.ts'],
  // Real IdP round trips (password + TOTP, one-time-use codes may cost a 30s
  // window wait), real ClamAV scans, and a case 5 that STOPS and RESTARTS the
  // ClamAV container — the restart plus signature reload can take minutes.
  testTimeout: 900_000,
  // Single worker: the suites share one Keycloak, one database, one MinIO and
  // one ClamAV, and the fail-closed case stops the ClamAV container, which
  // would fail every concurrently-running upload for an unrelated reason.
  maxWorkers: 1,
  // The identity module's ioredis client has no shutdown hook, so its socket
  // keeps the process alive after app.close(); every assertion has already run
  // by the time this applies. Same reason 01-06/01-07 set it.
  forceExit: true,
};
