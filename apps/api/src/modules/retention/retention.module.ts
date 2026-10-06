import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { DispositionGuard } from './disposition.guard';
import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';

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
 * nobody can action for two phases. No scheduler, cron registrar or message
 * queue is registered here, by design; the absence is asserted by test.
 *
 * `AuditModule` is imported for `AuditService` (the disposition write and its
 * audit event share one `withAudit` transaction). `CourtConfigService` reaches
 * this module through `AppConfigModule`'s `@Global()` export — the single
 * configuration read path the designation pre-filter consults.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [RetentionController],
  providers: [RetentionService, DispositionGuard],
  exports: [RetentionService, DispositionGuard],
})
export class RetentionModule {}
