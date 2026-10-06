import { Injectable, Logger } from '@nestjs/common';

import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Principal } from '../../common/principal/principal.types';
import { AuditService } from '../audit/audit.service';
import { withAudit } from '../audit/with-audit';
import { CourtConfigService } from '../config/court-config.service';
import {
  DispositionConfirmation,
  DispositionGuard,
} from './disposition.guard';

/** A retention schedule row, as the API returns it. */
export interface RetentionScheduleDto {
  id: string;
  court_id: string;
  record_category: string;
  retention_period_days: number;
  disposition_action: string;
}

/** A record past its retention period, computed on demand. */
export interface DueForDispositionDto {
  object_type: string;
  object_id: string;
  record_category: string;
  retained_since: string;
  due_since: string;
  disposition_action: string;
}

/** The validated body of `POST /retention/dispositions`. */
export interface CreateDispositionInput {
  object_type: string;
  object_id: string;
  disposition_action: string;
  confirmation?: DispositionConfirmation;
}

/**
 * The disposition actions Phase 1 knows how to record.
 *
 * **Both are non-destructive.** `review_required` records that a human must
 * decide; `retain_permanent` records that the record is kept. There is no
 * `delete` member, by design — see {@link RetentionService.createDisposition}.
 */
const KNOWN_NON_DESTRUCTIVE_ACTIONS = new Set([
  'review_required',
  'retain_permanent',
]);

/** Milliseconds in a day, for the retention-age computation. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * ============================================================================
 * RETENTION SCHEDULES, DUE-FOR-DISPOSITION, AND THE RECORD OF A DECISION
 * ============================================================================
 *
 * `FRD/F13` and CONTEXT: Phase 1 ships the retention schema, seeded defaults,
 * an on-demand answer to "what is past its retention period", and the hard
 * no-auto-purge guard. It deliberately ships NO scheduled sweep and NO task
 * generation — those wait for the Work Queue in Phase 3, because "building it
 * now would only accumulate a backlog nobody can action for two phases."
 *
 * ## Nothing here deletes anything
 *
 * Every Phase 1 `disposition_action` is `review_required` or
 * `retain_permanent`, and `createDisposition` records the human decision
 * without acting destructively. An action outside the known non-destructive set
 * is refused with `501 SECURITY_DISPOSITION_ACTION_UNSUPPORTED` rather than
 * guessed at — introducing a destructive action must be a deliberate, reviewed
 * change, not something a new schedule row can switch on silently.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: CourtConfigService,
    private readonly dispositionGuard: DispositionGuard,
  ) {}

  /** The court's retention schedules. */
  async getSchedules(courtId: string): Promise<RetentionScheduleDto[]> {
    const rows = await this.prisma.retention_schedules.findMany({
      where: { court_id: courtId },
      orderBy: { record_category: 'asc' },
      select: {
        id: true,
        court_id: true,
        record_category: true,
        retention_period_days: true,
        disposition_action: true,
      },
    });
    return rows;
  }

  /**
   * Records past their retention period, computed on demand.
   *
   * ## The designation pre-filter is a confidentiality control, not a nicety
   *
   * A due-for-disposition listing that included a sealed case the caller cannot
   * see would leak that case's existence through a maintenance screen — exactly
   * the side channel `designation.rego` closes on the main read paths. So a
   * case-derived candidate is excluded unless the caller holds the entitlement
   * the court's `security_policies` require for each designation on it, read
   * through the one revocation-filtered path (`revoked_at IS NULL`).
   *
   * This reimplements the exclusion predicate rather than calling
   * `CaseContextService.listCasesForPrincipal` (plan 01-04), which is not built
   * on this branch. The SUMMARY records that the two must share one predicate
   * once that service exists — a divergence here would be the quiet kind, a
   * false *exposure* that nobody reports.
   *
   * ## No task is generated and no job is scheduled
   *
   * Phase 3's Work Queue (F06) is the consumer of this endpoint; it will run
   * the sweep that turns these rows into actionable tasks. Phase 1 answers the
   * question and generates nothing.
   */
  async getDueForDisposition(
    courtId: string,
    principal: Principal,
  ): Promise<DueForDispositionDto[]> {
    const schedules = await this.getSchedules(courtId);
    const now = Date.now();
    const results: DueForDispositionDto[] = [];

    // The court's designation → required-entitlement map, read once through the
    // single configuration read path.
    const effective = await this.config.getEffective(courtId);
    const requiredEntitlementFor = new Map(
      effective.security_policies.map((p) => [
        p.designation,
        p.required_entitlement,
      ]),
    );

    for (const schedule of schedules) {
      const cutoff = new Date(
        now - schedule.retention_period_days * MS_PER_DAY,
      );

      switch (schedule.record_category) {
        case 'case_record': {
          const cases = await this.prisma.cases.findMany({
            where: { court_id: courtId, created_at: { lt: cutoff } },
            select: { id: true, created_at: true },
          });
          for (const row of cases) {
            if (
              await this.callerMaySee(
                'case',
                row.id,
                principal,
                requiredEntitlementFor,
              )
            ) {
              results.push(
                this.toDto(
                  'case',
                  row.id,
                  schedule,
                  row.created_at,
                ),
              );
            }
          }
          break;
        }

        case 'audit_event': {
          // audit_event's seeded action is retain_permanent — it is listed for
          // completeness; its anchor is the event's own occurrence time.
          const events = await this.prisma.audit_events.findMany({
            where: { occurred_at: { lt: cutoff } },
            select: { id: true, occurred_at: true },
            take: 1000,
          });
          for (const row of events) {
            results.push(
              this.toDto('audit_event', row.id, schedule, row.occurred_at),
            );
          }
          break;
        }

        case 'document': {
          // Anchored on the owning case's creation time (document_references
          // carries no timestamp of its own in the Phase 1 schema). The
          // case-derived designation pre-filter applies.
          const docs = await this.prisma.document_references.findMany({
            where: { case: { court_id: courtId, created_at: { lt: cutoff } } },
            select: { id: true, case: { select: { id: true, created_at: true } } },
          });
          for (const row of docs) {
            if (
              await this.callerMaySee(
                'case',
                row.case.id,
                principal,
                requiredEntitlementFor,
              )
            ) {
              results.push(
                this.toDto(
                  'document_reference',
                  row.id,
                  schedule,
                  row.case.created_at,
                ),
              );
            }
          }
          break;
        }

        case 'file_reference': {
          // A file's retention anchor is its creation audit event
          // (file_references carries no created_at). Best-effort: resolve the
          // earliest audit event that names the file.
          const files = await this.prisma.file_references.findMany({
            select: { id: true },
            take: 1000,
          });
          for (const file of files) {
            const creation = await this.prisma.audit_events.findFirst({
              where: { object_type: 'file_references', object_id: file.id },
              orderBy: { occurred_at: 'asc' },
              select: { occurred_at: true },
            });
            if (creation !== null && creation.occurred_at < cutoff) {
              results.push(
                this.toDto(
                  'file_reference',
                  file.id,
                  schedule,
                  creation.occurred_at,
                ),
              );
            }
          }
          break;
        }

        default:
          // An unrecognised category is listed in the schedule but has no
          // anchor resolver. Log rather than silently drop — it is a schema
          // the system cannot yet answer for, not a reason to 500.
          this.logger.warn(
            `No retention anchor resolver for record_category ` +
              `'${schedule.record_category}'. Skipping it in ` +
              `due-for-disposition.`,
          );
      }
    }

    return results;
  }

  /**
   * Record a human-confirmed disposition decision. **Deletes nothing.**
   *
   * The PDP has already answered "may this principal confirm dispositions at
   * all?" via the route's `@Resource({type:'disposition'})` descriptor. This
   * method answers the separate question "is this a genuine human
   * confirmation?" through {@link DispositionGuard}, then records the decision
   * and its audit event in one transaction.
   *
   * @throws {ApiException} 403 `SECURITY_DISPOSITION_UNCONFIRMED` when the
   *   confirmation is absent, misattributed, under-reasoned, or batch-issued.
   * @throws {ApiException} 501 `SECURITY_DISPOSITION_ACTION_UNSUPPORTED` for any
   *   action outside the known non-destructive set.
   */
  async createDisposition(
    request: { headers: Record<string, unknown> },
    principal: Principal | undefined,
    input: CreateDispositionInput,
  ): Promise<{ disposition_log_id: string }> {
    // 1. The human-confirmation gate, BEFORE anything is written.
    await this.dispositionGuard.assertHumanConfirmed(
      request as never,
      principal,
      input.confirmation,
    );
    // assertHumanConfirmed has proven principal is defined; narrow for the
    // compiler.
    if (principal === undefined) {
      throw new ApiException(
        403,
        'SECURITY_DISPOSITION_UNCONFIRMED',
        'Disposition requires human confirmation',
      );
    }

    // 2. Refuse any action that is not a known non-destructive one. A
    //    destructive action must never be executed by a code path that was
    //    written when no destructive action existed — if one is ever
    //    introduced, this endpoint must be deliberately revisited.
    if (!KNOWN_NON_DESTRUCTIVE_ACTIONS.has(input.disposition_action)) {
      throw new ApiException(
        501,
        'SECURITY_DISPOSITION_ACTION_UNSUPPORTED',
        'This disposition action is not supported',
      );
    }

    // 3. Record the decision AND its audit event in one transaction. The
    //    disposition_log is append-only at the grant level (plan 01-03), so the
    //    record of the decision is itself immutable.
    //
    //    NOTE: no delete, update, drop or truncate appears anywhere below. In
    //    Phase 1 a disposition is a RECORDED DECISION, never an executed
    //    deletion.
    const logId = await withAudit(this.prisma, this.audit, async (tx) => {
      const row = await tx.disposition_log.create({
        data: {
          object_type: input.object_type,
          object_id: input.object_id,
          disposition_action: input.disposition_action,
          confirmed_by: principal.user_id,
        },
        select: { id: true },
      });

      return {
        result: row.id,
        audit: {
          actor_id: principal.user_id,
          action_type: 'config_change' as const,
          object_type: 'disposition_log',
          object_id: row.id,
          after_state: {
            object_type: input.object_type,
            object_id: input.object_id,
            disposition_action: input.disposition_action,
            confirmed_by: principal.user_id,
          },
          session_id: principal.session_id,
        },
      };
    });

    return { disposition_log_id: logId };
  }

  /**
   * May the caller see this case-derived candidate?
   *
   * Excludes a case carrying a designation the caller lacks the entitlement
   * for. The same revocation-filtered read and the same configuration-driven
   * designation map the PDP uses, so the two cannot disagree about who may see
   * a sealed matter.
   */
  private async callerMaySee(
    objectType: 'case',
    objectId: string,
    principal: Principal,
    requiredEntitlementFor: Map<string, string>,
  ): Promise<boolean> {
    const designations = await this.prisma.security_designations.findMany({
      where: {
        object_type: objectType,
        object_id: objectId,
        revoked_at: null,
      },
      select: { designation: true },
    });

    for (const { designation } of designations) {
      // A designation present on the resource but absent from the court's
      // configured map denies — the same fail-closed consequence the policy
      // bundle applies.
      const required = requiredEntitlementFor.get(designation);
      if (required === undefined) return false;
      if (!principal.entitlements.includes(required)) return false;
    }

    return true;
  }

  private toDto(
    objectType: string,
    objectId: string,
    schedule: RetentionScheduleDto,
    retainedSince: Date,
  ): DueForDispositionDto {
    const dueSince = new Date(
      retainedSince.getTime() + schedule.retention_period_days * MS_PER_DAY,
    );
    return {
      object_type: objectType,
      object_id: objectId,
      record_category: schedule.record_category,
      retained_since: retainedSince.toISOString(),
      due_since: dueSince.toISOString(),
      disposition_action: schedule.disposition_action,
    };
  }
}
