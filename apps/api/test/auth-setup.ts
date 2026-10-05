/**
 * Jest setup for the authentication suites.
 *
 * Extracts Caddy's internal root CA from the Compose volume and points
 * `NODE_EXTRA_CA_CERTS` at it, so the test process trusts the local TLS
 * origin **the same way the API container does** — Node reads that variable
 * once at startup, which is why this runs in `globalSetup` rather than in a
 * `beforeAll`.
 *
 * This is a trust ANCHOR, not a verification bypass. The tests exercise the
 * real TLS path end to end; `NODE_TLS_REJECT_UNAUTHORIZED` is never set and
 * `rejectUnauthorized: false` appears nowhere. A test that disabled
 * verification would stop testing the thing the deployment depends on, and
 * would quietly keep passing if the certificate chain broke.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const CA_PATH = '/tmp/judicialsync-caddy-root.crt';
const CA_IN_VOLUME = '/d/caddy/pki/authorities/local/root.crt';

export default function globalSetup(): void {
  if (!existsSync(CA_PATH)) {
    try {
      const pem = execFileSync(
        'docker',
        [
          'run',
          '--rm',
          '-v',
          'judicialsync_caddydata:/d',
          'alpine',
          'cat',
          CA_IN_VOLUME,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
      if (pem.includes('BEGIN CERTIFICATE')) {
        writeFileSync(CA_PATH, pem, 'utf8');
      }
    } catch {
      // The stack is not up. The suites detect that themselves via
      // `requireStack()` and skip with a stated reason, so there is nothing
      // to fail here.
    }
  }

  if (existsSync(CA_PATH)) {
    process.env.NODE_EXTRA_CA_CERTS = CA_PATH;
  }

  // Surface, once, whether the stack is reachable — so a skipped suite is
  // traceable to a missing stack rather than looking like a pass.
  const probe = spawnSync(
    'curl',
    [
      '-ksSf',
      '-o',
      '/dev/null',
      'https://judicialsync.localhost:8443/api/v1/health',
    ],
    { stdio: 'ignore' },
  );
  if (probe.status !== 0) {
    // eslint-disable-next-line no-console
    console.warn(
      '[auth-setup] Compose stack not reachable — authentication suites will skip.',
    );
  }
}
