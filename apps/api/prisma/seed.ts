/**
 * Seed entry point — `npm run db:seed` (`tsx prisma/seed.ts`).
 *
 * ## This runs on EVERY container boot
 *
 * The Compose `command` is `migrate → seed → serve`, and the named volume
 * persists across restarts. So this is not a one-shot fixture loader: it is a
 * convergence step that must leave the database in the same state whether it
 * is the first run or the fiftieth.
 *
 * Every write is therefore an upsert keyed on a stable `SEED_IDS` UUID. For
 * `user_roles`, `entitlement_grants` and `security_designations` the upsert
 * additionally carries an **empty `update: {}`**, because `app_rw` holds only
 * column-scoped UPDATE on those three tables and a substance-column payload
 * would raise PostgreSQL `42501` on the SECOND boot — meaning
 * `docker compose up` would succeed once and then break. See the headers of
 * `seed/identity.ts` and `seed/courts.ts`.
 *
 * =============================================================================
 * ## TWO ROLES, BECAUSE TWO DIFFERENT KINDS OF WRITE
 * =============================================================================
 *
 * The seed opens **two** connections, and which one writes what is a security
 * property rather than a convenience:
 *
 *   - **`app_rw`** (DATABASE_URL) writes the operational data the running
 *     application also writes: courts, cases, parties, docket events, users,
 *     roles, scopes, grants, designations. Seeding these as `app_rw` is the
 *     point — it proves the append-only grant posture tolerates the seed, so a
 *     second boot cannot fail with `42501`.
 *
 *   - **`app_dba`** (MIGRATION_DATABASE_URL) writes the four CONFIGURATION
 *     tables: `court_profiles`, `rule_package_versions`, `security_policies`,
 *     `retention_schedules`. Plan 01-03 grants `app_rw` **SELECT only** on
 *     these, deliberately: CONTEXT gives Phase 1 "seeded per-court defaults …
 *     and a read path", and Phase 2's Configuration Engine adds authoring
 *     behind maker-checker approval. The application can read configuration
 *     and must not be able to author it.
 *
 * So establishing the defaults is an **administrative** act, not an
 * application one, and it is performed by the administrative role — the same
 * role that just ran the migrations, in the same boot step.
 *
 * The alternative would have been to widen `app_rw`'s grant to cover the
 * configuration tables. That was rejected: it would hand the running
 * application the ability to rewrite the designation→entitlement map that the
 * policy engine reads, which is the one piece of data that decides who may see
 * a sealed record. A seed's convenience is not worth that.
 * =============================================================================
 *
 * ## The order below is a dependency order, not a preference
 *
 *   1. `seedCaseModel`     — courts, divisions, cases, parties, docket events.
 *                            References no users.
 *   2. `seedIdentity`      — roles, users, role assignments, scopes, grants.
 *                            `user_roles.court_id` points at (1).
 *   3. `seedDesignations`  — `applied_by` points at a user from (2); the cases
 *                            it designates come from (1). Hence the split.
 *   4. `seedConfiguration` — rule packages carry a drafter and approver from
 *                            (2). Runs on the administrative connection.
 */
import { PrismaClient } from '@prisma/client';

import { seedConfiguration } from './seed/configuration';
import { seedCaseModel, seedDesignations } from './seed/courts';
import { seedIdentity } from './seed/identity';
import { resolverFromEnv, type SubjectResolver } from './seed/keycloak';

export interface SeedOptions {
  /**
   * Client for the operational tables — must be connected as **`app_rw`**.
   * A client supplied here is not disconnected by `runSeed`.
   */
  prisma?: PrismaClient;
  /**
   * Client for the four read-only-to-the-application configuration tables —
   * must be connected as **`app_dba`**. Defaults to a client built from
   * `MIGRATION_DATABASE_URL`.
   */
  adminPrisma?: PrismaClient;
  /** Override the Keycloak subject lookup. Tests pass `fixtureSubjects()`. */
  resolveSubject?: SubjectResolver;
}

export async function runSeed(options: SeedOptions = {}): Promise<void> {
  const prisma = options.prisma ?? new PrismaClient();
  const ownsClient = options.prisma === undefined;

  const adminUrl = process.env.MIGRATION_DATABASE_URL;
  const adminPrisma =
    options.adminPrisma ??
    (adminUrl
      ? new PrismaClient({ datasources: { db: { url: adminUrl } } })
      : // No separate administrative URL configured — fall back to the same
        // connection. Correct for a superuser-owned local database; against
        // the Compose stack MIGRATION_DATABASE_URL is always set, so this
        // branch does not silently downgrade the posture there.
        prisma);
  const ownsAdminClient = options.adminPrisma === undefined && adminPrisma !== prisma;

  const resolveSubject = options.resolveSubject ?? resolverFromEnv();

  try {
    await seedCaseModel(prisma);
    await seedIdentity(prisma, resolveSubject);
    await seedDesignations(prisma);
    await seedConfiguration(adminPrisma);
  } finally {
    if (ownsAdminClient) await adminPrisma.$disconnect();
    if (ownsClient) await prisma.$disconnect();
  }
}

// Executed directly by `npm run db:seed`.
if (require.main === module) {
  runSeed()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log('seed: complete');
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('seed: FAILED', error);
      process.exit(1);
    });
}
