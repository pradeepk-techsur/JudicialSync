import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common/errors/api-exception.filter';
import { PrismaModule } from '../src/common/prisma/prisma.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  PlatformDb,
  startPlatformDb,
  stopPlatformDb,
} from './testcontainers-postgres';

/**
 * **The context-boot test.**
 *
 * This is the project's cheapest and highest-leverage test, and every later
 * Phase 1 plan is required to keep it green.
 *
 * Booting the full `AppModule` converts an entire class of failures that are
 * otherwise discovered at runtime — unresolvable dependency-injection graphs,
 * a provider missing from a module's `providers`, a circular import between
 * two feature modules, two controllers claiming the same route — into a red
 * test run, in about a second.
 *
 * It asserts against `/api/v1/health` specifically because that route
 * exercises the global prefix, the `@Public()` path through BOTH global
 * guards, and the controller layer, while depending on nothing external.
 *
 * ---
 *
 * ## Upgraded by plan 01-03: now boots against a real PostgreSQL 15
 *
 * The database is started by Testcontainers and migrated with the real
 * migration files, then `DATABASE_URL` is pointed at the **`app_rw`**
 * connection before the module compiles. That adds a second class of failure
 * to the ones above: Prisma schema-vs-database drift. A model that no longer
 * matches its table now fails here rather than at UAT, because `PrismaService`
 * actually connects during `onModuleInit`.
 *
 * `PrismaModule` is imported explicitly. It is `@Global()`, but `@Global()`
 * does not mean auto-registered — Nest registers a global module the first
 * time some module imports it, and in wave 2 no feature module does yet (they
 * are still empty shells from plan 01-01, and `app.module.ts` is single-owner
 * and must not be edited). Importing it here is what makes this test cover the
 * database path at all. Once a later plan's feature module imports it, this
 * line becomes redundant but stays harmless.
 */
jest.setTimeout(180_000); // container pull + start + migrations

describe('Application context boot (e2e)', () => {
  let app: INestApplication;
  let db: PlatformDb;
  let prisma: PrismaService;
  let originalDatabaseUrl: string | undefined;

  beforeAll(async () => {
    db = await startPlatformDb();

    // Must be set BEFORE the module compiles: PrismaClient reads the datasource
    // URL from the environment at construction.
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = db.appRwUrl;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, PrismaModule],
    }).compile();

    app = moduleRef.createNestApplication();

    // Mirror main.ts so the test exercises the same request pipeline the
    // deployed application does. Without the prefix and the filter, this test
    // would pass against a configuration nobody runs.
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());

    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
    await stopPlatformDb(db);

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('boots the full AppModule against a real PostgreSQL 15', () => {
    // Reaching this line at all means the DI graph resolved: every one of the
    // nine feature modules instantiated, both global guards were constructible
    // with their injected Reflector, and PrismaService connected during
    // onModuleInit.
    expect(app).toBeDefined();
    expect(prisma).toBeInstanceOf(PrismaService);
  });

  it('connects as app_rw, not as the schema owner', async () => {
    // The grants that make the audit trail immutable apply to app_rw only.
    // An application running as the owner would pass every other test in the
    // suite while holding the power to rewrite history — which is why
    // PrismaService asserts this at boot and why it is re-asserted here.
    const rows =
      await prisma.$queryRaw<{ current_user: string }[]>`SELECT current_user`;
    expect(rows[0].current_user).toBe(PrismaService.REQUIRED_RUNTIME_ROLE);
  });

  it('has a Prisma schema that matches the migrated database', async () => {
    // Queries one column of every model the Prisma client exposes. A model
    // whose table or column drifted from the migrations fails here with a
    // Postgres 42P01/42703 rather than silently at first use in a later phase.
    await expect(
      Promise.all([
        prisma.users.findMany({ take: 1 }),
        prisma.roles.findMany({ take: 1 }),
        prisma.courts.findMany({ take: 1 }),
        prisma.cases.findMany({ take: 1 }),
        prisma.security_designations.findMany({ take: 1 }),
        prisma.audit_events.findMany({ take: 1 }),
        prisma.entitlement_grants.findMany({ take: 1 }),
        prisma.access_grant_requests.findMany({ take: 1 }),
        prisma.integrity_alerts.findMany({ take: 1 }),
      ]),
    ).resolves.toBeDefined();
  });

  it('has an initialised audit chain head with the 64-zero genesis hash', async () => {
    const head = await prisma.audit_chain_head.findFirst();

    expect(head).not.toBeNull();
    expect(head?.last_row_hash).toBe('0'.repeat(64));
  });

  it('serves GET /api/v1/health with 200 {status: ok}', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'platform-core' });
  });

  it('applies the global /api/v1 prefix (unprefixed path is not routed)', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(404);
  });
});
