import { execFileSync } from 'node:child_process';

import { Client } from 'pg';

/**
 * ============================================================================
 * RAW DATABASE CLIENTS FOR THE ASSURANCE SUITE (plan 01-14)
 * ============================================================================
 *
 * Criterion 3 is a claim about the DATABASE GRANT LEVEL — "an attempt to UPDATE
 * or DELETE a past audit row fails at the database grant level, not merely via
 * application convention." Proving that requires talking to Postgres as the
 * application's own role, `app_rw`, through a raw `pg` client — NOT through
 * Prisma, whose own behaviour could mask or imitate a grant. If the ORM is in
 * the path, a passing test proves the ORM declined, which is exactly the
 * "application convention" the criterion rules out as insufficient.
 *
 * Two roles are exposed:
 *
 *  - {@link appRwClient} — `DATABASE_URL`, the role the running application uses.
 *    This is the attacker position for criterion 3: a compromised application
 *    process, or an operator wielding the application's own credentials. It is
 *    what must be refused the UPDATE/DELETE/TRUNCATE/trigger-tamper.
 *  - {@link appDbaClient} — `MIGRATION_DATABASE_URL`, the owner role. Used only
 *    to perform the deliberate out-of-band corruption criterion 3 requires
 *    AFTER proving `app_rw` cannot, and to restore the chain in teardown.
 *
 * Each client **asserts its effective `current_user` on connect**. A connection
 * string pointed at the wrong role would silently turn criterion 3's proof into
 * a tautology — `app_dba` can of course delete, so a test that corrupted "as
 * app_rw" over an `app_dba` connection would pass while proving nothing. The
 * assertion makes that misconfiguration a loud failure instead.
 *
 * ## Addressing
 *
 * The Compose file publishes only `proxy:8443` (its single-TLS-origin design),
 * so `db` is reached on its Compose-network address, discovered via
 * `docker inspect` exactly as `auth-harness` and `files-harness` do. Overridable
 * by `ASSURANCE_DATABASE_URL` / `ASSURANCE_MIGRATION_DATABASE_URL` for a CI
 * runner whose networking differs.
 */

const DB_CONTAINER = process.env.ASSURANCE_DB_CONTAINER ?? 'judicialsync-db-1';

function serviceIp(container: string): string | undefined {
  try {
    const out = execFileSync(
      'docker',
      [
        'inspect',
        container,
        '--format',
        '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return out === '' ? undefined : out;
  } catch {
    return undefined;
  }
}

let cachedDbIp: string | undefined;

function dbIp(): string {
  if (cachedDbIp !== undefined) return cachedDbIp;
  cachedDbIp = serviceIp(DB_CONTAINER) ?? '127.0.0.1';
  return cachedDbIp;
}

/** The `app_rw` connection string — the role the running application uses. */
export function appRwUrl(): string {
  return (
    process.env.ASSURANCE_DATABASE_URL ??
    `postgresql://app_rw:app_rw_local_dev@${dbIp()}:5432/judicialsync?schema=platform`
  );
}

/** The `app_dba` connection string — the owner/migration role. */
export function appDbaUrl(): string {
  return (
    process.env.ASSURANCE_MIGRATION_DATABASE_URL ??
    `postgresql://app_dba:app_dba_local_dev@${dbIp()}:5432/judicialsync?schema=platform`
  );
}

async function connectAssertingRole(url: string, expected: string): Promise<Client> {
  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ current_user: string }>(
    'SELECT current_user',
  );
  const actual = rows[0]?.current_user;
  if (actual !== expected) {
    await client.end();
    throw new Error(
      `Assurance DB client misconfigured: expected to connect as "${expected}" ` +
        `but SELECT current_user returned "${actual}". Criterion 3's proof would ` +
        `be a tautology over the wrong role — refusing to proceed.`,
    );
  }
  return client;
}

/**
 * A `pg.Client` connected as `app_rw`, asserted on connect.
 *
 * The caller owns the connection and must `end()` it.
 */
export function appRwClient(): Promise<Client> {
  return connectAssertingRole(appRwUrl(), 'app_rw');
}

/**
 * A `pg.Client` connected as `app_dba`, asserted on connect.
 *
 * The caller owns the connection and must `end()` it.
 */
export function appDbaClient(): Promise<Client> {
  return connectAssertingRole(appDbaUrl(), 'app_dba');
}
