import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ApiException } from '../../common/errors/api-error';
import { Principal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { withAudit } from '../audit/with-audit';
import {
  CaseResponse,
  CaseStatus,
  CreateCaseRequest,
} from './dto/case.dto';

/**
 * ============================================================================
 * THE CASE WRITE/READ SERVICE
 * ============================================================================
 *
 * Owns the lifecycle of a `cases` row: create (with its inline parties),
 * single read, and the status transition that is the system's **only** removal
 * mechanism. `CaseContextService` is the shared READ surface for other modules;
 * this service is where cases are written.
 *
 * Every mutation goes through {@link withAudit}, so a case that was created or
 * whose status changed and the audit event that records it commit atomically
 * or not at all (`FRD/F02`).
 */
@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a case and its parties.
   *
   * The ABAC guard has already authorized the route and validated — via the
   * resource loader's `placementFromBody` — that `division_id` belongs to a
   * court the caller may write into. We re-check division↔court here anyway,
   * because the service must be correct on its own terms and the guard's check
   * exists for a different purpose (it decides *authorization*, this decides
   * *validity* with the specific `CASE_INVALID_DIVISION` code the FRD names).
   */
  async create(principal: Principal, dto: CreateCaseRequest): Promise<CaseResponse> {
    // --- division belongs to the named court → otherwise 422 ----------------
    const division = await this.prisma.divisions.findUnique({
      where: { id: dto.division_id },
      select: { id: true, court_id: true },
    });
    if (division === null || division.court_id !== dto.court_id) {
      throw new ApiException(
        422,
        'CASE_INVALID_DIVISION',
        'The division does not belong to the specified court',
      );
    }

    // --- at least one defendant → otherwise 422 -----------------------------
    // The exact code and message from FRD/F01 Error States. US-1.2 ties this
    // to the Phase 7 Speedy Trial tracker precondition: a tracker cannot exist
    // for a case with no defendant.
    const hasDefendant = dto.party.some((p) => p.role === 'defendant');
    if (!hasDefendant) {
      throw new ApiException(
        422,
        'CASE_MISSING_DEFENDANT',
        'At least one defendant party is required',
      );
    }

    try {
      return await withAudit(this.prisma, this.audit, async (tx) => {
        // Manual entry: source_system = 'manual', no source_identifier, and
        // locally_modified = false (FRD/F01 Validation).
        const created = await tx.cases.create({
          data: {
            court_id: dto.court_id,
            division_id: dto.division_id,
            case_number: dto.case_number,
            case_caption: dto.case_caption,
            case_type: dto.case_type,
            source_system: 'manual',
            source_identifier: null,
            locally_modified: false,
            status: 'open',
          },
        });

        const parties = [];
        for (const p of dto.party) {
          parties.push(
            await tx.parties.create({
              data: {
                case_id: created.id,
                party_name: p.name,
                party_role: p.role,
                external_id: p.external_id ?? null,
                source_system: 'manual',
                // A manual party still needs a source identifier shape that is
                // meaningful; the parties table does not carry the unique
                // (source_system, source_identifier) constraint docket_events
                // does, so a deterministic manual id is sufficient.
                source_identifier: `manual:${created.id}:party:${p.role}:${p.name}`,
                locally_modified: false,
                status: 'active',
              },
            }),
          );
        }

        // One status_change event for the case creation, plus one per party.
        // All in the same transaction, in order — withAudit accepts an array.
        const events = [
          {
            actor_id: principal.user_id,
            action_type: 'status_change' as const,
            object_type: 'cases',
            object_id: created.id,
            before_state: null,
            after_state: {
              status: created.status,
              case_number: created.case_number,
              court_id: created.court_id,
              division_id: created.division_id,
              source_system: created.source_system,
            },
            session_id: principal.session_id,
          },
          ...parties.map((party) => ({
            actor_id: principal.user_id,
            action_type: 'status_change' as const,
            object_type: 'parties',
            object_id: party.id,
            before_state: null,
            after_state: {
              status: party.status,
              party_role: party.party_role,
              case_id: party.case_id,
            },
            session_id: principal.session_id,
          })),
        ];

        return { result: this.toResponse(created), audit: events };
      });
    } catch (error) {
      // 409 on the division-scoped unique (division_id, case_number). Caught
      // from the constraint violation rather than pre-checked: a pre-check
      // races between SELECT and INSERT; the constraint cannot.
      if (this.isDuplicateCaseNumber(error)) {
        throw new ApiException(
          409,
          'CASE_DUPLICATE_NUMBER',
          'A case with this number already exists in this division',
        );
      }
      throw error;
    }
  }

  /**
   * One case by id.
   *
   * The ABAC guard has already authorized this read. The service deliberately
   * does **not** re-filter by court: a scope rule enforced in two places is a
   * scope rule that can disagree with itself, and the PDP is the one authority
   * (`abac.guard.ts`). A `null` here is a genuine not-found, which the
   * controller surfaces — though the guard's loader would already have 404'd an
   * id the caller may not see.
   */
  async get(id: string): Promise<CaseResponse> {
    const row = await this.prisma.cases.findUnique({ where: { id } });
    if (row === null) {
      throw new ApiException(404, 'CASE_NOT_FOUND', 'Case not found or not accessible');
    }
    return this.toResponse(row);
  }

  /**
   * Transition a case's status — the only removal path.
   *
   * ## Court/division are immutable; this method proves it by having no way to
   * change them.
   *
   * `FRD/F01` Process step 2: "Court/division association is assigned at case
   * creation and is immutable thereafter (a case does not move between
   * courts)." There is no endpoint that changes them and this method writes
   * only `status` and `locally_modified`. The natural next feature request is
   * "move this case to another division" — and the answer is no, so the guard
   * below rejects any attempt that reaches here with a court/division delta.
   */
  async updateStatus(
    principal: Principal,
    id: string,
    status: CaseStatus,
  ): Promise<CaseResponse> {
    const before = await this.prisma.cases.findUnique({ where: { id } });
    if (before === null) {
      throw new ApiException(404, 'CASE_NOT_FOUND', 'Case not found or not accessible');
    }

    // Reject a no-op / illegal transition. A 'superseded' case cannot reopen,
    // and transitioning to the same status is not a material action.
    if (!this.isValidTransition(before.status, status)) {
      throw new ApiException(
        409,
        'CASE_INVALID_TRANSITION',
        `A case cannot transition from '${before.status}' to '${status}'`,
      );
    }

    return withAudit(this.prisma, this.audit, async (tx) => {
      const after = await tx.cases.update({
        where: { id },
        data: {
          status,
          // Any local edit of a sync-eligible record flips the flag. Phase 3's
          // conflict logic reads it; a status change made locally must be
          // distinguishable from one that arrived from CM/ECF.
          locally_modified: true,
        },
      });

      return {
        result: this.toResponse(after),
        audit: {
          actor_id: principal.user_id,
          action_type: 'status_change' as const,
          object_type: 'cases',
          object_id: id,
          before_state: { status: before.status },
          after_state: { status: after.status },
          session_id: principal.session_id,
        },
      };
    });
  }

  /**
   * Legal status transitions.
   *
   * `open ↔ closed` both ways (a closed case may reopen), `open → superseded`
   * and `closed → superseded`, but `superseded` is terminal — a superseded
   * case has been replaced and does not come back. Transitioning to the current
   * status is not a transition.
   */
  private isValidTransition(from: string, to: string): boolean {
    if (from === to) return false;
    if (from === 'superseded') return false;
    return to === 'open' || to === 'closed' || to === 'superseded';
  }

  private toResponse(row: {
    id: string;
    court_id: string;
    division_id: string;
    case_number: string;
    case_caption: string;
    case_type: string;
    source_system: string;
    source_identifier: string | null;
    status: string;
    created_at: Date;
  }): CaseResponse {
    return {
      id: row.id,
      court_id: row.court_id,
      division_id: row.division_id,
      case_number: row.case_number,
      case_caption: row.case_caption,
      case_type: row.case_type,
      source_system: row.source_system,
      source_identifier: row.source_identifier,
      status: row.status,
      created_at: row.created_at.toISOString(),
    };
  }

  /**
   * Is this error the `(division_id, case_number)` unique violation?
   *
   * Prisma raises `PrismaClientKnownRequestError` with `code === 'P2002'` for a
   * unique-constraint violation, carrying the constraint's fields in
   * `meta.target`. The underlying PostgreSQL SQLSTATE is `23505`. We match on
   * the Prisma code and confirm the target is the case-number constraint, so a
   * future unrelated unique constraint on this table does not get mistranslated
   * into `CASE_DUPLICATE_NUMBER`.
   */
  private isDuplicateCaseNumber(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== 'P2002') return false;
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
    return fields.some((f) => f.includes('case_number') || f.includes('division_id'));
  }
}
