import { Module } from '@nestjs/common';

/**
 * **Retention & Disposition Engine** —
 * `TechArch/01-components.md` §4.1 · FRD F13.
 *
 * Responsibility: configurable retention schedules, the `disposition_log`,
 * and the hard no-auto-purge guard.
 *
 * Phase 1 owner: plan **01-11** — schema, seeded defaults per record category,
 * and the `403 SECURITY_DISPOSITION_UNCONFIRMED` internal guard. The dangerous
 * capability is built first on purpose: anything that could auto-delete must
 * be impossible from day one, so the guard ships before the convenience.
 *
 * The scheduled sweep that GENERATES due-for-disposition tasks waits for the
 * Work Queue in Phase 3 — building it now would only accumulate a backlog
 * nobody can action for two phases.
 */
@Module({})
export class RetentionModule {}
