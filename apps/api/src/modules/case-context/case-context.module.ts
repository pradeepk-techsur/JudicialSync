import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { CaseContextService } from './case-context.service';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';

/**
 * **Case & Docket Context Service** —
 * `TechArch/01-components.md` §4.1 · FRD F01.
 *
 * Responsibility: the court / division / case / proceeding / hearing / party /
 * docket-event / document-reference model — the SINGLE source of case context
 * for the whole system. No module may maintain a shadow copy; Phases 5–8 read
 * case context exclusively through {@link CaseContextService}, and Phase 3's
 * CM/ECF adapter writes through this same model rather than beside it.
 *
 * Phase 1 owner: plan **01-09** (full manual create/read/update API). Manual
 * clerk entry is a PERMANENT fallback per F01 — "when sync is unavailable or
 * the case predates sync" — not temporary scaffolding.
 *
 * Two structural rules this module holds:
 *   - **No hard deletes, anywhere.** No DELETE endpoints exist; removal is a
 *     status transition (`closed` / `superseded` / `withdrawn`) that emits an
 *     audit event, and the application database role holds no DELETE grant.
 *     Proven by `apps/api/test/case-no-delete.e2e-spec.ts` at both layers.
 *   - **Full provenance ships in Phase 1**: `source_system`,
 *     `source_identifier` and `locally_modified` on every sync-eligible
 *     record. Conflict detection is Phase 3, but deferring the COLUMNS would
 *     force a backfill across live court records with unknowable provenance.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [CasesController],
  providers: [CasesService, CaseContextService],
  // Exported for Phases 5–8. `CaseContextService` is the shared read surface
  // FRD/F01 step 8 requires those modules consume; nothing else in this module
  // is part of that contract.
  exports: [CaseContextService],
})
export class CaseContextModule {}
