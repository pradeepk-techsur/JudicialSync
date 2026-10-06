import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { CaseContextService } from './case-context.service';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { DocketEventsController } from './docket-events.controller';
import { PartiesController } from './parties.controller';
import {
  PROCEEDING_ACTIVITY_PROBE,
  Phase1ProceedingActivityProbe,
} from './proceeding-activity.probe';
import { ProceedingsController } from './proceedings.controller';
import { ProceedingsService } from './proceedings.service';

/**
 * **Case & Docket Context Service** —
 * `TechArch/01-components.md` §4.1 · FRD F01.
 *
 * Responsibility: the court / division / case / proceeding / hearing / party /
 * docket-event / document-reference model — the SINGLE source of case context
 * for the whole system. No module may maintain a shadow copy; Phases 5–8 read
 * case context exclusively through this service, and Phase 3's CM/ECF adapter
 * writes through this same model rather than beside it.
 *
 * Phase 1 owner: plan **01-04** (full manual create/read/update API). Manual
 * clerk entry is a PERMANENT fallback per F01 — "when sync is unavailable or
 * the case predates sync" — not temporary scaffolding.
 *
 * Two structural rules this module must hold:
 *   - **No hard deletes, anywhere.** No DELETE endpoints exist; removal is a
 *     status transition (`closed` / `superseded` / `withdrawn`) that emits an
 *     audit event, and the application database role holds no DELETE grant.
 *   - **Full provenance ships in Phase 1**: `source_system`,
 *     `source_identifier` and `locally_modified` on every sync-eligible
 *     record. Conflict detection is Phase 3, but deferring the COLUMNS would
 *     force a backfill across live court records with unknowable provenance.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    CasesController,
    ProceedingsController,
    PartiesController,
    DocketEventsController,
  ],
  providers: [
    CasesService,
    CaseContextService,
    ProceedingsService,
    // The activity probe seam. Phase 1 binds the no-activity implementation;
    // Phases 5 (exhibits) and 7 (defendant trackers) rebind this token to a
    // provider that queries their tables, and ProceedingsService never changes.
    { provide: PROCEEDING_ACTIVITY_PROBE, useClass: Phase1ProceedingActivityProbe },
  ],
  // Exported so Phases 5–8 read case context through this one surface — the
  // structural answer to Phase 1 criterion 2 (no shadow copy of case data).
  exports: [CaseContextService],
})
export class CaseContextModule {}
