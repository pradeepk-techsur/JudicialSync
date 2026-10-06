import { Body, Controller, Param, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import { ApiException } from '../../common/errors/api-error';
import { Principal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { withAudit } from '../audit/with-audit';
import { Resource } from '../policy/resource-descriptor.decorator';
import { validationError } from './cases.controller';
import { principalOf } from './principal-of';

/** The five designation values — CHECK (designation IN (...)). */
const DESIGNATIONS = ['sealed', 'restricted', 'grand_jury', 'juvenile', 'pii'] as const;

const UpdateDesignationsSchema = z
  .object({
    designations: z.array(z.enum(DESIGNATIONS)),
  })
  .strict();

interface SecurityDesignationResponse {
  id: string;
  object_type: string;
  object_id: string;
  designation: string;
  applied_by: string;
  applied_at: string;
}

/**
 * ============================================================================
 * `PATCH /cases/{id}/security-designations` — apply or lift a designation
 * ============================================================================
 *
 * `FRD/Y1a-api-shared.md`: request `{designations: [...]}`, response
 * `200 {designations: SecurityDesignation[]}`, "Requires `case_security_admin`."
 *
 * ## Authorization is the PDP's, named by the guard — not checked here
 *
 * The single `@Resource` descriptor (`security_designation` / `update`)
 * is the whole access control. Plan 01-02's `action_entitlement_map`
 * binds that pair to `case_security_admin`, so the PDP enforces `FRD/F01`
 * ("courtroom deputies may view but not alter designations") with **no
 * handler-level check**. The denial is relabelled `403 CASE_DESIGNATION_DENIED`
 * by `abac.guard.ts`'s resource-type override table — registered there rather
 * than special-cased in this controller, so the mapping lives with every other
 * feature's denial code.
 *
 * And because the resource loader resolves this target to the CASE with its
 * current designations, lifting a seal is itself an action on a sealed record:
 * a caller who lacks `designation_sealed` cannot unseal a case they may not
 * read. That too is the PDP's decision, not this file's.
 *
 * ## Set-replacement semantics, within the grant the database allows
 *
 * The request is the DESIRED active set. The handler diffs it against the
 * current active rows and:
 *   - `INSERT`s a row for each **added** designation, and
 *   - sets `revoked_at`/`revoked_by` on each **removed** designation's active row.
 *
 * It never rewrites which designation a row carries or who applied it — and it
 * *could not* if it tried. Plan 01-03 grants `app_rw` only
 * `UPDATE (revoked_at, revoked_by)` on `security_designations` (no table-wide
 * UPDATE, no DELETE), so Postgres physically refuses anything but the
 * revocation. A designation's substance is a historical fact; only its lifting
 * is new information. **This plan writes no migration and does not touch
 * `docs/SCHEMA-NOTES.md`** — the columns, the partial index and the
 * column-scoped grant all ship in plan 01-03 (wave 2).
 *
 * ## Audited, one event per change
 *
 * Each added or removed designation emits one `designation_change` audit event
 * with `object_type: 'case'`, `object_id: caseId`, and before/after listing the
 * full designation set (`US-1.2`: "Each designation change produces an audit
 * event with before/after state and actor").
 */
@Controller('cases/:id/security-designations')
export class DesignationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Resource({ type: 'security_designation', action: 'update', caseIdParam: 'id' })
  @Patch()
  async update(
    @Req() request: Request,
    @Param('id') caseId: string,
    @Body() body: unknown,
  ): Promise<{ designations: SecurityDesignationResponse[] }> {
    const parsed = UpdateDesignationsSchema.safeParse(body);
    if (!parsed.success) {
      // An unknown designation value is a 422 before any write — the CHECK
      // constraint would also reject it, but a clean 422 is the better contract.
      throw validationError(parsed.error);
    }

    const principal = principalOf(request);
    const desired: string[] = [...new Set<string>(parsed.data.designations)].sort();

    // The case must exist. (The guard's loader would already 404 an id the
    // caller cannot see; this covers a genuinely absent id reaching the handler.)
    const found = await this.prisma.cases.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (found === null) {
      throw new ApiException(404, 'CASE_NOT_FOUND', 'Case not found or not accessible');
    }

    const current = await this.prisma.security_designations.findMany({
      where: { object_type: 'case', object_id: caseId, revoked_at: null },
    });
    const currentSet = [...new Set(current.map((d) => d.designation))].sort();

    const added = desired.filter((d) => !currentSet.includes(d));
    const removed = currentSet.filter((d) => !desired.includes(d));

    // Nothing to do — return the current active set rather than writing a
    // no-op audit event (an audit event records a material action; this is not
    // one).
    if (added.length === 0 && removed.length === 0) {
      return { designations: current.map((r) => this.toResponse(r)) };
    }

    await withAudit(this.prisma, this.audit, async (tx) => {
      const events = [];

      // A running set threaded through every change, so each event's
      // before_state is the set immediately BEFORE that single change and its
      // after_state the set immediately AFTER it. Computing every event from the
      // original `currentSet` instead would make a two-add patch record
      // after={…,X} then after={…,Y} — neither showing the true cumulative
      // {…,X,Y}, and the per-event before/after not forming a consistent chain
      // (US-1.2: each change produces an event with before/after state).
      let runningSet = currentSet;

      for (const designation of added) {
        await tx.security_designations.create({
          data: {
            object_type: 'case',
            object_id: caseId,
            designation,
            applied_by: principal.user_id,
          },
        });
        const event = this.changeEvent(
          principal,
          caseId,
          runningSet,
          designation,
          'applied',
        );
        events.push(event);
        runningSet = event.after_state.designations;
      }

      for (const designation of removed) {
        const row = current.find((d) => d.designation === designation);
        if (row === undefined) continue;
        // Only revoked_at/revoked_by — the only UPDATE the grant permits.
        await tx.security_designations.update({
          where: { id: row.id },
          data: { revoked_at: new Date(), revoked_by: principal.user_id },
        });
        const event = this.changeEvent(
          principal,
          caseId,
          runningSet,
          designation,
          'revoked',
        );
        events.push(event);
        runningSet = event.after_state.designations;
      }

      return { result: undefined, audit: events };
    });

    const after = await this.prisma.security_designations.findMany({
      where: { object_type: 'case', object_id: caseId, revoked_at: null },
    });
    return { designations: after.map((r) => this.toResponse(r)) };
  }

  /**
   * One `designation_change` event with the full before/after set.
   *
   * `beforeSet` is the active-designation set immediately BEFORE this single
   * change (the caller threads a running set through a multi-change patch, so
   * successive events chain: event n's `after_state` is event n+1's
   * `before_state`).
   */
  private changeEvent(
    principal: Principal,
    caseId: string,
    beforeSet: string[],
    designation: string,
    action: 'applied' | 'revoked',
  ) {
    const afterSet =
      action === 'applied'
        ? [...new Set([...beforeSet, designation])].sort()
        : beforeSet.filter((d) => d !== designation);
    return {
      actor_id: principal.user_id,
      action_type: 'designation_change' as const,
      object_type: 'case',
      object_id: caseId,
      before_state: { designations: beforeSet },
      after_state: { designations: afterSet, changed: designation, change: action },
      session_id: principal.session_id,
    };
  }

  private toResponse(r: {
    id: string;
    object_type: string;
    object_id: string;
    designation: string;
    applied_by: string;
    applied_at: Date;
  }): SecurityDesignationResponse {
    return {
      id: r.id,
      object_type: r.object_type,
      object_id: r.object_id,
      designation: r.designation,
      applied_by: r.applied_by,
      applied_at: r.applied_at.toISOString(),
    };
  }
}
