import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * The application's PrismaClient, with a managed Nest lifecycle.
 *
 * The datasource URL comes from `DATABASE_URL`, which resolves to the
 * **`app_rw`** role. That role is the point of this phase: it holds no UPDATE
 * and no DELETE grant on `audit_events`, and no DELETE grant on any table in
 * the `platform` schema. Nothing in this class enforces that — PostgreSQL
 * does. This class's one security responsibility is to make sure the
 * application is actually *using* that role.
 *
 * ## Why the `current_user` assertion exists
 *
 * Migrations run as `app_dba` through `MIGRATION_DATABASE_URL` (the
 * `db:migrate` script). `app_dba` owns the schema and holds DDL rights, which
 * means it can freely UPDATE and DELETE audit rows.
 *
 * So a deployment that pointed `DATABASE_URL` at `app_dba` — a copy-paste in a
 * secrets manager, a Compose file that reused one connection string, an
 * operator debugging a migration who never changed it back — would void the
 * entire immutability guarantee, and **every test would still pass**. The
 * application would work perfectly. Audit writes would succeed. Nothing would
 * look wrong until someone needed the audit trail to be trustworthy and
 * discovered it never had been.
 *
 * That is precisely the failure class worth a startup assertion: silent,
 * total, and invisible to every other check in the system. `TechArch/04-security.md`
 * §7.3 names it directly — the `app_dba` role "is never used by running
 * request-handling code."
 *
 * ## Why it only throws in production
 *
 * In development and test the database frequently *is* owned by whoever
 * created it (a Testcontainers instance, a local `docker compose up` before
 * the role init script has run). Hard-failing there would make the assertion
 * an obstacle people route around — and a check that gets disabled is worth
 * less than no check, because it also carries false assurance. Outside
 * production the mismatch is logged as a warning, loudly enough to notice and
 * cheaply enough to ignore when it is expected.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /** The database role the running application must connect as. */
  static readonly REQUIRED_RUNTIME_ROLE = 'app_rw';

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.assertRuntimeRole();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Verify the connection is the least-privileged application role, not the
   * schema owner.
   *
   * Exposed (rather than inlined into `onModuleInit`) so the assurance suite
   * can call it against a deliberately-misconfigured connection and prove it
   * throws, instead of trusting that it would.
   */
  async assertRuntimeRole(): Promise<void> {
    const rows =
      await this.$queryRaw<{ current_user: string }[]>`SELECT current_user`;
    const actual = rows[0]?.current_user;

    if (actual === PrismaService.REQUIRED_RUNTIME_ROLE) {
      return;
    }

    const message =
      `Database connection is authenticated as '${actual}', not ` +
      `'${PrismaService.REQUIRED_RUNTIME_ROLE}'. The append-only audit grants ` +
      `and the no-hard-delete posture apply to '${PrismaService.REQUIRED_RUNTIME_ROLE}' ` +
      `only — running as any other role silently voids them. Check DATABASE_URL ` +
      `(migrations use MIGRATION_DATABASE_URL and app_dba; the application must not).`;

    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    }

    this.logger.warn(`${message} (not fatal outside production)`);
  }
}
