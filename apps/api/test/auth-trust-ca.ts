/**
 * Install Caddy's internal root CA into **this worker's** TLS trust store.
 *
 * Runs as a Jest `setupFiles` entry, i.e. inside every worker process before
 * any test module loads.
 *
 * ## Why this file exists separately from `auth-setup.ts`
 *
 * `NODE_EXTRA_CA_CERTS` is read by Node exactly once, at process startup.
 * Setting it from `globalSetup` therefore configures only the setup process —
 * the worker processes that actually run the tests inherit the variable but
 * have already built their trust store without it.
 *
 * The symptom was not a failure. Every TLS request quietly failed with
 * `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, the suites' own `requireStack()` probe
 * concluded the stack was down, and all fourteen tests **skipped while
 * reporting green**. A security suite that silently tests nothing is strictly
 * worse than one that fails, because nothing downstream distinguishes it from
 * a real pass.
 *
 * So the certificate is pushed into the trust store from inside the worker,
 * via the documented `tls` extra-certificates hook, and
 * `auth-harness.requireStack()` additionally reports the reason whenever it
 * does skip.
 *
 * This is a trust ANCHOR, not a verification bypass. `NODE_TLS_REJECT_UNAUTHORIZED`
 * is never set and `rejectUnauthorized: false` appears nowhere — the suites
 * verify the real certificate chain, exactly as the API container does.
 */
import { existsSync, readFileSync } from 'node:fs';
import tls from 'node:tls';

const CA_PATH = process.env.TEST_CADDY_CA ?? '/tmp/judicialsync-caddy-root.crt';

if (existsSync(CA_PATH)) {
  const pem = readFileSync(CA_PATH, 'utf8');

  // Append to the bundled roots rather than replacing them: the suites also
  // talk to the public npm/registry-free world via localhost, and discarding
  // the default roots would be a surprising global side effect.
  const existing = tls.rootCertificates;
  const combined = [...existing, pem];

  const original = tls.createSecureContext;
  tls.createSecureContext = (
    options: tls.SecureContextOptions = {},
  ): tls.SecureContext =>
    original({ ...options, ca: options.ca ?? combined });

  process.env.NODE_EXTRA_CA_CERTS = CA_PATH;
}
