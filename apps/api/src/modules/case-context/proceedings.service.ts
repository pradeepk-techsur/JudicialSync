import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ApiException } from '../../common/errors/api-error';
import { Principal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { withAudit } from '../audit/with-audit';
import {
  DocketEventResponse,
  DocumentReferenceResponse,
  HearingResponse,
  ListDocketEventsQuerySchema,
  PartyResponse,
  ProceedingResponse,
  ProceedingStatus,
} from './dto/docket.dto';
import {
  PROCEEDING_ACTIVITY_PROBE,
  ProceedingActivityProbe,
} from './proceeding-activity.probe';
import { z } from 'zod';

/**
 * ============================================================================
 * THE CASE-CHILD WRITE SERVICE
 * ============================================================================
 *
 * Owns proceedings, hearings, parties, docket events and document references —
 * everything that hangs off a case. The controllers are thin; this service
 * holds the rules CONTEXT and `FRD/F01` require:
 *
 *  - full provenance on every sync-eligible record (`source_system`,
 *    `source_identifier`, `locally_modified`), correctly set for manual entry
 *    and flipped on a local edit of a synced record;
 *  - proceedings are **closed, not deleted**, and a proceeding with activity
 *    cannot even be deleted — only closed (the rule is written in final form
 *    now; its data arrives in Phases 5 and 7);
 *  - every mutation emits exactly one audit event via {@link withAudit}.
 *
 * No conflict detection, no conflict-table write, and no review-queue code
 * lives here — Phase 3 owns all of that (CONTEXT). Provenance columns ship now;
 * nothing reads them for conflict purposes.
 */
@Injectable()
export class ProceedingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(PROCEEDING_ACTIVITY_PROBE)
    private readonly activity: ProceedingActivityProbe,
  ) {}

  // =========================================================================
  // Proceedings
  // =========================================================================

  async listProceedings(caseId: string): Promise<ProceedingResponse[]> {
    await this.requireCase(caseId);
    const rows = await this.prisma.proceedings.findMany({ where: { case_id: caseId } });
    return rows.map((r) => this.toProceeding(r));
  }

  async createProceeding(
    principal: Principal,
    caseId: string,
    dto: { proceeding_type: string; presiding_judge_id?: string },
  ): Promise<ProceedingResponse> {
    await this.requireCase(caseId);

    return withAudit(this.prisma, this.audit, async (tx) => {
      const created = await tx.proceedings.create({
        data: {
          case_id: caseId,
          proceeding_type: dto.proceeding_type,
          status: 'open',
          presiding_judge_id: dto.presiding_judge_id ?? null,
        },
      });
      return {
        result: this.toProceeding(created),
        audit: this.event(principal, 'proceedings', created.id, null, {
          status: 'open',
          proceeding_type: created.proceeding_type,
          case_id: caseId,
        }),
      };
    });
  }

  /**
   * Transition a proceeding's status.
   *
   * `closed` always succeeds. A **delete-style** transition — anything that
   * would remove the proceeding — is forbidden once the proceeding has activity
   * (`409 CASE_PROCEEDING_IN_USE`). In Phase 1 there is no delete transition in
   * the status enum, so the way this path is reached and tested is a request to
   * mark a proceeding `closed` whose activity probe reports `true` while a
   * stronger removal is attempted; the probe-backed guard exists so Phase 5
   * inherits it. `closed` itself is always permitted — closure is the sanctioned
   * terminal state.
   */
  async updateProceedingStatus(
    principal: Principal,
    caseId: string,
    proceedingId: string,
    status: ProceedingStatus,
  ): Promise<ProceedingResponse> {
    await this.requireCase(caseId);
    const before = await this.prisma.proceedings.findFirst({
      where: { id: proceedingId, case_id: caseId },
    });
    if (before === null) {
      throw new ApiException(
        404,
        'PROCEEDING_NOT_FOUND',
        'Proceeding not found or not accessible',
      );
    }

    // The activity rule. `closed` is the sanctioned transition and is always
    // allowed. The forbidden case is a removal of a proceeding that has
    // accumulated activity — reachable in tests via a stubbed probe returning
    // true, and the FRD's final-form rule that Phase 5 inherits.
    if (status !== 'closed' && (await this.activity.hasActivity(proceedingId))) {
      throw new ApiException(
        409,
        'CASE_PROCEEDING_IN_USE',
        'This proceeding has associated activity and may only be marked closed',
      );
    }

    return withAudit(this.prisma, this.audit, async (tx) => {
      const after = await tx.proceedings.update({
        where: { id: proceedingId },
        data: { status },
      });
      return {
        result: this.toProceeding(after),
        audit: this.event(
          principal,
          'proceedings',
          proceedingId,
          { status: before.status },
          { status: after.status },
        ),
      };
    });
  }

  // =========================================================================
  // Hearings
  // =========================================================================

  async listHearings(caseId: string, proceedingId: string): Promise<HearingResponse[]> {
    await this.requireProceeding(caseId, proceedingId);
    const rows = await this.prisma.hearings.findMany({
      where: { proceeding_id: proceedingId },
    });
    return rows.map((r) => this.toHearing(r));
  }

  async createHearing(
    principal: Principal,
    caseId: string,
    proceedingId: string,
    dto: { scheduled_at: string; hearing_type: string },
  ): Promise<HearingResponse> {
    await this.requireProceeding(caseId, proceedingId);

    return withAudit(this.prisma, this.audit, async (tx) => {
      const created = await tx.hearings.create({
        data: {
          proceeding_id: proceedingId,
          scheduled_at: new Date(dto.scheduled_at),
          hearing_type: dto.hearing_type,
        },
      });
      return {
        result: this.toHearing(created),
        audit: this.event(principal, 'hearings', created.id, null, {
          status: 'scheduled',
          hearing_type: created.hearing_type,
          proceeding_id: proceedingId,
        }),
      };
    });
  }

  async updateHearing(
    principal: Principal,
    caseId: string,
    proceedingId: string,
    hearingId: string,
    dto: { held_at: string },
  ): Promise<HearingResponse> {
    await this.requireProceeding(caseId, proceedingId);
    const before = await this.prisma.hearings.findFirst({
      where: { id: hearingId, proceeding_id: proceedingId },
    });
    if (before === null) {
      throw new ApiException(404, 'HEARING_NOT_FOUND', 'Hearing not found or not accessible');
    }

    return withAudit(this.prisma, this.audit, async (tx) => {
      const after = await tx.hearings.update({
        where: { id: hearingId },
        data: { held_at: new Date(dto.held_at) },
      });
      return {
        result: this.toHearing(after),
        audit: this.event(
          principal,
          'hearings',
          hearingId,
          { held_at: before.held_at?.toISOString() ?? null },
          { held_at: after.held_at?.toISOString() ?? null },
        ),
      };
    });
  }

  // =========================================================================
  // Parties
  // =========================================================================

  async listParties(caseId: string): Promise<PartyResponse[]> {
    await this.requireCase(caseId);
    const rows = await this.prisma.parties.findMany({ where: { case_id: caseId } });
    return rows.map((r) => this.toParty(r));
  }

  async createParty(
    principal: Principal,
    caseId: string,
    dto: { party_name: string; party_role: string; external_id?: string },
  ): Promise<PartyResponse> {
    await this.requireCase(caseId);

    return withAudit(this.prisma, this.audit, async (tx) => {
      const created = await tx.parties.create({
        data: {
          case_id: caseId,
          party_name: dto.party_name,
          party_role: dto.party_role,
          external_id: dto.external_id ?? null,
          source_system: 'manual',
          source_identifier: `manual:${caseId}:${randomUUID()}`,
          locally_modified: false,
          status: 'active',
        },
      });
      return {
        result: this.toParty(created),
        audit: this.event(principal, 'parties', created.id, null, {
          status: 'active',
          party_role: created.party_role,
          case_id: caseId,
        }),
      };
    });
  }

  async updatePartyStatus(
    principal: Principal,
    caseId: string,
    partyId: string,
    status: string,
  ): Promise<PartyResponse> {
    await this.requireCase(caseId);
    const before = await this.prisma.parties.findFirst({
      where: { id: partyId, case_id: caseId },
    });
    if (before === null) {
      throw new ApiException(404, 'PARTY_NOT_FOUND', 'Party not found or not accessible');
    }

    return withAudit(this.prisma, this.audit, async (tx) => {
      const after = await tx.parties.update({
        where: { id: partyId },
        data: {
          status,
          // A local edit of a synced record flips the flag. A manual record
          // stays false — nothing to reconcile with an upstream source.
          ...(before.source_system !== 'manual' ? { locally_modified: true } : {}),
        },
      });
      return {
        result: this.toParty(after),
        audit: this.event(
          principal,
          'parties',
          partyId,
          { status: before.status },
          { status: after.status },
        ),
      };
    });
  }

  // =========================================================================
  // Docket events
  // =========================================================================

  async listDocketEvents(
    caseId: string,
    query: z.infer<typeof ListDocketEventsQuerySchema>,
  ): Promise<DocketEventResponse[]> {
    await this.requireCase(caseId);
    const rows = await this.prisma.docket_events.findMany({
      where: {
        case_id: caseId,
        ...(query.event_code ? { event_code: query.event_code } : {}),
        ...(query.date_from || query.date_to
          ? {
              event_date: {
                ...(query.date_from ? { gte: new Date(query.date_from) } : {}),
                ...(query.date_to ? { lte: new Date(query.date_to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { event_date: 'desc' },
    });
    return rows.map((r) => this.toDocketEvent(r));
  }

  async createDocketEvent(
    principal: Principal,
    caseId: string,
    dto: {
      source_system?: string;
      source_identifier?: string;
      event_code?: string;
      event_description?: string;
      event_date: string;
    },
  ): Promise<DocketEventResponse> {
    await this.requireCase(caseId);

    const sourceSystem = dto.source_system ?? 'manual';

    // A non-manual event MUST carry a source identifier — the rule exists for
    // Phase 3's adapter; enforced now so the adapter inherits it.
    if (sourceSystem !== 'manual' && (dto.source_identifier ?? '') === '') {
      throw new ApiException(
        422,
        'CASE_EVENT_MISSING_SOURCE',
        'Imported docket events must include a source identifier',
      );
    }

    // Manual events generate a deterministic source_identifier of the form
    // manual:{caseId}:{uuid}. docket_events carries UNIQUE (source_system,
    // source_identifier) and the column is NOT NULL, so a manual event still
    // needs one.
    const sourceIdentifier =
      sourceSystem === 'manual'
        ? dto.source_identifier ?? `manual:${caseId}:${randomUUID()}`
        : (dto.source_identifier as string);

    try {
      return await withAudit(this.prisma, this.audit, async (tx) => {
        const created = await tx.docket_events.create({
          data: {
            case_id: caseId,
            source_system: sourceSystem,
            source_identifier: sourceIdentifier,
            event_code: dto.event_code ?? null,
            event_description: dto.event_description ?? null,
            event_date: new Date(dto.event_date),
            locally_modified: false,
          },
        });
        return {
          result: this.toDocketEvent(created),
          audit: this.event(principal, 'docket_events', created.id, null, {
            source_system: created.source_system,
            event_code: created.event_code,
            case_id: caseId,
          }),
        };
      });
    } catch (error) {
      // 409 on the UNIQUE (source_system, source_identifier) violation.
      if (this.isUniqueViolation(error)) {
        throw new ApiException(
          409,
          'CASE_EVENT_DUPLICATE_SOURCE',
          'A docket event with this source identifier already exists',
        );
      }
      throw error;
    }
  }

  async updateDocketEvent(
    principal: Principal,
    caseId: string,
    eventId: string,
    dto: { event_code?: string; event_description?: string },
  ): Promise<DocketEventResponse> {
    await this.requireCase(caseId);
    const before = await this.prisma.docket_events.findFirst({
      where: { id: eventId, case_id: caseId },
    });
    if (before === null) {
      throw new ApiException(
        404,
        'DOCKET_EVENT_NOT_FOUND',
        'Docket event not found or not accessible',
      );
    }

    return withAudit(this.prisma, this.audit, async (tx) => {
      const after = await tx.docket_events.update({
        where: { id: eventId },
        data: {
          ...(dto.event_code !== undefined ? { event_code: dto.event_code } : {}),
          ...(dto.event_description !== undefined
            ? { event_description: dto.event_description }
            : {}),
          // Editing a synced record flips locally_modified; editing a manual
          // one leaves it false. docket_events carries all three provenance
          // columns, so it exercises the rule end to end.
          ...(before.source_system !== 'manual' ? { locally_modified: true } : {}),
        },
      });
      return {
        result: this.toDocketEvent(after),
        audit: this.event(
          principal,
          'docket_events',
          eventId,
          { event_code: before.event_code, event_description: before.event_description },
          { event_code: after.event_code, event_description: after.event_description },
        ),
      };
    });
  }

  // =========================================================================
  // Document references
  // =========================================================================

  async listDocumentReferences(caseId: string): Promise<DocumentReferenceResponse[]> {
    await this.requireCase(caseId);
    const rows = await this.prisma.document_references.findMany({
      where: { case_id: caseId },
    });
    return rows.map((r) => this.toDocumentReference(r));
  }

  async createDocumentReference(
    principal: Principal,
    caseId: string,
    dto: {
      document_title: string;
      storage_pointer?: string;
      source_system?: string;
      source_identifier?: string;
    },
  ): Promise<DocumentReferenceResponse> {
    await this.requireCase(caseId);

    const sourceSystem = dto.source_system ?? 'manual';
    if (sourceSystem !== 'manual' && (dto.source_identifier ?? '') === '') {
      throw new ApiException(
        422,
        'CASE_EVENT_MISSING_SOURCE',
        'Imported document references must include a source identifier',
      );
    }

    return withAudit(this.prisma, this.audit, async (tx) => {
      const created = await tx.document_references.create({
        data: {
          case_id: caseId,
          source_system: sourceSystem,
          source_identifier:
            sourceSystem === 'manual'
              ? dto.source_identifier ?? `manual:${caseId}:${randomUUID()}`
              : (dto.source_identifier as string),
          document_title: dto.document_title,
          storage_pointer: dto.storage_pointer ?? null,
          locally_modified: false,
        },
      });
      return {
        result: this.toDocumentReference(created),
        audit: this.event(principal, 'document_references', created.id, null, {
          document_title: created.document_title,
          source_system: created.source_system,
          case_id: caseId,
        }),
      };
    });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /** A single audit event in the shape withAudit expects. */
  private event(
    principal: Principal,
    objectType: string,
    objectId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
  ) {
    return {
      actor_id: principal.user_id,
      action_type: 'status_change' as const,
      object_type: objectType,
      object_id: objectId,
      before_state: before,
      after_state: after,
      session_id: principal.session_id,
    };
  }

  private async requireCase(caseId: string): Promise<void> {
    const found = await this.prisma.cases.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (found === null) {
      throw new ApiException(404, 'CASE_NOT_FOUND', 'Case not found or not accessible');
    }
  }

  private async requireProceeding(caseId: string, proceedingId: string): Promise<void> {
    const found = await this.prisma.proceedings.findFirst({
      where: { id: proceedingId, case_id: caseId },
      select: { id: true },
    });
    if (found === null) {
      throw new ApiException(
        404,
        'PROCEEDING_NOT_FOUND',
        'Proceeding not found or not accessible',
      );
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  private toProceeding(r: {
    id: string;
    case_id: string;
    proceeding_type: string;
    status: string;
    presiding_judge_id: string | null;
  }): ProceedingResponse {
    return {
      id: r.id,
      case_id: r.case_id,
      proceeding_type: r.proceeding_type,
      status: r.status,
      presiding_judge_id: r.presiding_judge_id,
    };
  }

  private toHearing(r: {
    id: string;
    proceeding_id: string;
    scheduled_at: Date;
    held_at: Date | null;
    hearing_type: string;
  }): HearingResponse {
    return {
      id: r.id,
      proceeding_id: r.proceeding_id,
      scheduled_at: r.scheduled_at.toISOString(),
      held_at: r.held_at === null ? null : r.held_at.toISOString(),
      hearing_type: r.hearing_type,
    };
  }

  private toParty(r: {
    id: string;
    case_id: string;
    party_name: string;
    party_role: string;
    external_id: string | null;
    source_system: string;
    source_identifier: string | null;
    status: string;
  }): PartyResponse {
    return {
      id: r.id,
      case_id: r.case_id,
      party_name: r.party_name,
      party_role: r.party_role,
      external_id: r.external_id,
      source_system: r.source_system,
      source_identifier: r.source_identifier,
      status: r.status,
    };
  }

  private toDocketEvent(r: {
    id: string;
    case_id: string;
    source_system: string;
    source_identifier: string;
    event_code: string | null;
    event_description: string | null;
    event_date: Date;
    locally_modified: boolean;
  }): DocketEventResponse {
    return {
      id: r.id,
      case_id: r.case_id,
      source_system: r.source_system,
      source_identifier: r.source_identifier,
      event_code: r.event_code,
      event_description: r.event_description,
      event_date: r.event_date.toISOString(),
      locally_modified: r.locally_modified,
    };
  }

  private toDocumentReference(r: {
    id: string;
    case_id: string;
    source_system: string;
    source_identifier: string | null;
    document_title: string | null;
    storage_pointer: string | null;
    locally_modified: boolean;
  }): DocumentReferenceResponse {
    return {
      id: r.id,
      case_id: r.case_id,
      source_system: r.source_system,
      source_identifier: r.source_identifier,
      document_title: r.document_title,
      storage_pointer: r.storage_pointer,
      locally_modified: r.locally_modified,
    };
  }
}
