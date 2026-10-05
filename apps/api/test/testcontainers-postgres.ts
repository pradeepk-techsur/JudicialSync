import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

/**
 * Shared PostgreSQL test harness for the whole Phase 1 integration suite.
 *
 * Every later plan's integration tests reuse this helper rather than standing
 * up their own container, so that every test runs against **the same database
 * a deployment gets**: the real role init script, and all migrations applied
 * in order through the real migration files. A test fixture that built its
 * schema some other way — `prisma db push`, a hand-written CREATE TABLE — would
 * quietly stop testing the migrations, which is where this phase's entire
 * guarantee lives.
 *
 * In particular, the tests must connect as **`app_rw`**, not as the superuser.
 * The grants are the thing under test; a superuser connection would pass every
 * assertion in `schema-grants.e2e-spec.ts` while proving nothing.
 */

const POSTGRES_IMAGE = 'postgres:15.7-alpine';
const DATABASE_NAME = 'judicialsync';

/** Repo root, from `apps/api/test/`. */
const REPO_ROOT = join(__dirname, '..', '..', '..');
const API_ROOT = join(__dirname, '..');

const ROLE_INIT_SQL = join(REPO_ROOT, 'infra', 'db', 'init', '01-roles.sql');

/**
 * Applied in order. These are the real migration files — if one of them is
 * broken, the whole integration suite fails here rather than passing against a
 * schema nobody deploys.
 */
const MIGRATIONS = [
  '20260101000000_platform_schema',
  '20260101000100_append_only_grants',
  '20260101000200_audit_hash_chain',
  '20260101000300_audit_hash_search_path',
] as const;

/** Local-development credentials from `infra/db/init/01-roles.sql`. */
const APP_RW_PASSWORD = 'app_rw_local_dev';

export interface PlatformDb {
  container: StartedPostgreSqlContainer;
  /** Superuser connection — owns the schema. Use for setup/teardown only. */
  ownerUrl: string;
  /**
   * The application role. **Use this for anything asserting on behaviour**,
   * because it is the role the grants apply to.
   */
  appRwUrl: string;
}

/** `psql` inside the container — the sandbox host has no PostgreSQL client. */
function psql(
  container: StartedPostgreSqlContainer,
  sql: string,
  label: string,
): void {
  try {
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        container.getId(),
        'psql',
        '-U',
        container.getUsername(),
        '-d',
        DATABASE_NAME,
        '-v',
        'ON_ERROR_STOP=1',
        '-q',
        '-f',
        '-',
      ],
      { input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const err = error as { stderr?: Buffer; stdout?: Buffer };
    throw new Error(
      `Failed applying ${label}:\n${err.stderr?.toString() ?? ''}${err.stdout?.toString() ?? ''}`,
    );
  }
}

/**
 * Start PostgreSQL 15, create the two roles, and apply every migration in
 * order.
 *
 * The role script normally runs from `/docker-entrypoint-initdb.d/` at cluster
 * init (plan 01-04 wires that mount for Compose). Here it is executed
 * explicitly against the started container instead, which is equivalent for
 * test purposes and keeps the helper independent of Testcontainers' bind-mount
 * behaviour — but it is the *same file*, so the roles and their grants cannot
 * drift from what a deployment creates.
 */
export async function startPlatformDb(): Promise<PlatformDb> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase(DATABASE_NAME)
    .start();

  psql(container, readFileSync(ROLE_INIT_SQL, 'utf8'), '01-roles.sql');

  for (const migration of MIGRATIONS) {
    const file = join(API_ROOT, 'prisma', 'migrations', migration, 'migration.sql');
    psql(container, readFileSync(file, 'utf8'), migration);
  }

  const host = container.getHost();
  const port = container.getMappedPort(5432);

  return {
    container,
    ownerUrl: container.getConnectionUri(),
    appRwUrl: `postgresql://app_rw:${APP_RW_PASSWORD}@${host}:${port}/${DATABASE_NAME}?schema=platform`,
  };
}

export async function stopPlatformDb(db: PlatformDb | undefined): Promise<void> {
  await db?.container.stop();
}

/**
 * Insert a minimal `users` row and return its id.
 *
 * Nearly every integration test needs an actor: `audit_events.actor_id` is NOT
 * NULL with an FK to `users`, so there is no way to exercise the audit chain
 * without one.
 */
export async function seedActor(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: { id: string }[] }> },
  subject = `test-subject-${Date.now()}-${Math.random().toString(36).slice(2)}`,
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO platform.users (external_idp_subject, display_name, email)
     VALUES ($1, $2, $3) RETURNING id`,
    [subject, 'Test Actor', 'test.actor@example.gov'],
  );
  return rows[0].id;
}
