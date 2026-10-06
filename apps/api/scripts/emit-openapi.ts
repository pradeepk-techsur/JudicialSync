import 'reflect-metadata';

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Emit `openapi/openapi.json` from the running application.
 *
 * This is the implementation behind the `openapi:emit` script plan 01-01
 * declared (`tsx scripts/emit-openapi.ts`).
 *
 * ## Why it runs against the COMPILED output, not the TypeScript source
 *
 * `@nestjs/swagger`'s explorer reads route-parameter types from the
 * `design:paramtypes` reflection metadata that TypeScript's
 * `emitDecoratorMetadata` produces. `tsx` transpiles with **esbuild**, which
 * does not emit that metadata (a documented esbuild limitation), so running the
 * document builder directly under `tsx` crashes inside the explorer with
 * `Cannot read properties of undefined (reading '0')`. The seed script gets
 * away with `tsx` because it never needs paramtypes; the Swagger explorer does.
 *
 * So this script — itself run under `tsx` — compiles the API with `nest build`
 * (the project's own tsc-based build, which DOES emit the metadata) and then
 * loads `AppModule` and `buildOpenApiDocument` from `dist/`. The build output is
 * required anyway: the Compose `api` service runs `dist/src/main.js`.
 *
 * The app is created WITHOUT `app.init()`: `NestFactory.create` instantiates
 * controllers (which the explorer introspects) but does not run lifecycle
 * hooks, so no `onModuleInit` fires, nothing connects to the database/IdP/PDP,
 * and no live infrastructure is required to emit the contract.
 *
 * CI runs this then `git diff --exit-code openapi/openapi.json`; an uncommitted
 * change means a controller drifted from the contract and the build fails. That
 * check is what makes "one source of truth" real rather than aspirational.
 */

// apps/api/scripts -> apps/api
const apiDir = resolve(__dirname, '..');
// apps/api -> apps -> <repo root> -> openapi/openapi.json
const outPath = resolve(apiDir, '..', '..', 'openapi', 'openapi.json');
const distOpenApi = resolve(apiDir, 'dist', 'src', 'openapi.js');
const distAppModule = resolve(apiDir, 'dist', 'src', 'app.module.js');

// PrismaClient (PrismaService's superclass) validates its datasource URL at
// construction time — which happens when NestFactory instantiates providers —
// even though it only CONNECTS in `onModuleInit`, which this tool never runs.
// Supply a syntactically-valid placeholder so construction succeeds; no
// connection is ever opened, so the value is never used. Any real env wins.
process.env.DATABASE_URL ??=
  'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder?schema=platform';
process.env.MIGRATION_DATABASE_URL ??= process.env.DATABASE_URL;

async function emit(): Promise<void> {
  // Ensure the compiled output exists (and is current). `nest build` is the
  // project's own build and produces the decorator metadata esbuild cannot.
  if (!existsSync(distOpenApi) || !existsSync(distAppModule) || process.env.OPENAPI_FORCE_BUILD === '1') {
    buildApi();
  } else {
    // A build may be stale relative to source. Rebuild unless explicitly told
    // the dist is fresh (CI sets OPENAPI_SKIP_BUILD after its own build step).
    if (process.env.OPENAPI_SKIP_BUILD !== '1') {
      buildApi();
    }
  }

  // Load from compiled output — these carry the paramtypes metadata the
  // Swagger explorer needs. Dynamic require so the build runs first.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { NestFactory } = require('@nestjs/core') as typeof import('@nestjs/core');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppModule } = require(distAppModule) as { AppModule: unknown };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildOpenApiDocument } = require(distOpenApi) as typeof import('../src/openapi');

  const app = await NestFactory.create(AppModule as never, {
    logger: false,
    abortOnError: false,
  });

  const document = buildOpenApiDocument(app);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  await app.close();

  // eslint-disable-next-line no-console
  console.log(
    `OpenAPI ${document.openapi} contract (${Object.keys(document.paths).length} paths) written to ${outPath}`,
  );
}

function buildApi(): void {
  // eslint-disable-next-line no-console
  console.log('Building API (nest build) so the OpenAPI explorer has decorator metadata…');
  execFileSync('npm', ['run', 'build'], {
    cwd: apiDir,
    stdio: 'inherit',
  });
}

void emit().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to emit OpenAPI contract:', error);
  process.exit(1);
});
