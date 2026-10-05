import { Module } from '@nestjs/common';

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
 */
@Module({})
export class AppConfigModule {}
