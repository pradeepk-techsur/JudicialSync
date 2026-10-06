import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { ConfigController } from './config.controller';
import { CourtConfigService } from './court-config.service';

/**
 * **Configuration read path** — the Phase 1 subset of the Configuration
 * Engine. `TechArch/01-components.md` §4.1 · FRD F13 / F03.
 *
 * Responsibility: the configuration TABLES with seeded per-court defaults —
 * `security_policies`, `retention_schedules`, the file-type allowlist, session
 * timeout — and a read path over them.
 *
 * Phase 1 owner: plan **01-11**.
 *
 * The constraint that makes this worth building now: **features must read
 * configuration from the database from day one, never from hardcoded
 * constants.** F13 requires designation policy to live in the configuration
 * engine rather than ad hoc code paths, and constants would force revisiting
 * every call site in Phase 2.
 *
 * Phase 2 adds rule-package versioning, the maker-checker approval flow and
 * the admin UI ON TOP of these tables. Pulling the whole Configuration Engine
 * forward into Phase 1 was explicitly rejected as scope creep.
 *
 * NOTE: this is JudicialSync's own configuration domain, distinct from
 * `@nestjs/config`'s `ConfigModule`, which reads process environment. Import
 * order in `app.module.ts` disambiguates the two by aliasing.
 *
 * ## Why `@Global()` and `exports: [CourtConfigService]`
 *
 * {@link CourtConfigService} is the single configuration read path every other
 * Phase 1 module is meant to use (plans 01-06, 01-07 and 01-10 each currently
 * read `rule_package_versions` directly as a stopgap; the SUMMARY records that
 * those should switch to this service). Exporting it and marking the module
 * `@Global()` makes it injectable everywhere without any consumer importing
 * this module explicitly — the same mechanism `IdentityModule` and
 * `PolicyModule` use so that `app.module.ts` (owned by plan 01-01) need not
 * change to wire a new dependency in.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ConfigController],
  providers: [CourtConfigService],
  exports: [CourtConfigService],
})
export class AppConfigModule {}
