import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common/errors/api-exception.filter';

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
 * test run, in about a second, with no database and no network.
 *
 * It asserts against `/api/v1/health` specifically because that route
 * exercises the global prefix, the `@Public()` path through BOTH global
 * guards, and the controller layer, while depending on nothing external. The
 * route must work with no database: this plan predates the schema (01-03).
 *
 * Plan 01-03 upgrades this file to boot against a real Postgres via
 * Testcontainers, at which point it also covers migration validity.
 */
describe('Application context boot (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    // Mirror main.ts so the test exercises the same request pipeline the
    // deployed application does. Without the prefix and the filter, this test
    // would pass against a configuration nobody runs.
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('boots the full AppModule without a database', () => {
    // Reaching this line at all means the DI graph resolved: every one of the
    // nine feature modules instantiated, and both global guards were
    // constructible with their injected Reflector.
    expect(app).toBeDefined();
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
