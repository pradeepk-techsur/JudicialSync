import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Database access for the whole application.
 *
 * Declared `@Global()` deliberately. `app.module.ts` is owned exclusively by
 * plan 01-01 and no later plan may edit it (see the banner in that file), but
 * nearly every Phase 1 feature module needs database access. A global module
 * resolves that without a composition-root edit: any provider in any module
 * can inject `PrismaService` without importing `PrismaModule` first.
 *
 * `@Global()` is normally worth resisting — it hides a dependency that an
 * explicit import would document. The exception is justified here on the same
 * grounds Nest's own docs give for it: a single, stateless, application-wide
 * infrastructure concern with exactly one instance. One connection pool is
 * also the correct shape operationally; a per-module Prisma client would open
 * a pool per module against a database whose connection count is finite.
 *
 * A feature module that wants the dependency visible in its own file may still
 * `imports: [PrismaModule]` — that is a no-op at runtime and reads better.
 *
 * ---
 *
 * ## IMPORTANT FOR LATER PLANS: `@Global()` still needs ONE import
 *
 * `@Global()` does not mean "automatically registered". Nest registers a
 * global module the first time **some** module imports it; from that point its
 * exports are visible everywhere, including to modules that never imported it.
 * Until that first import happens, `PrismaModule` is inert and injecting
 * `PrismaService` fails with an unresolved-dependency error at boot.
 *
 * Phase 1 wave 2 is where this file lands and **no module imports it yet** —
 * the feature modules created in plan 01-01 are empty shells. That is expected,
 * not an oversight: `app.module.ts` is single-owner and must not be edited
 * here.
 *
 * So the first feature module that needs the database (plan 01-05's audit
 * writer, 01-06's identity module, whichever lands first) must declare
 * `imports: [PrismaModule]` in its own `@Module({...})`. Every module after it
 * gets `PrismaService` for free. One import, in a file that plan owns, with no
 * composition-root change.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
