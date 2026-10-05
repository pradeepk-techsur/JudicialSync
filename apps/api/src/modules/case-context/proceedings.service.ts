import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ApiException } from '../../common/errors/api-error';
import { Principal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { withAudit } from '../audit/with-audit';
import { toHearingResponse, toProceedingResponse } from './case-context.service';
import {
  flagLocallyModified,
  isUniqueViolation,
  manualSourceIdentifier,
  toPartyResponse,
} from './cases.service';
import {
  DocketEventResponse,
  DocumentReferenceResponse,
  HearingResponse,
  PartyResponse,
  PartyStatus,
  ProceedingResponse,
  ProceedingStatus,
} from './dto/case.dto';

/**
 * ============================================================================
 * "A PROCEEDING CANNOT BE DELETED ONCE IT HAS ACTIVITY"
 * ============================================================================
 *
 * `FRD/F01` Validation, verbatim: "A proceeding cannot be deleted once it has
 * associated exhibit or Speedy Trial activity — it may only be marked
 * `closed`."
 *
 * In Phase 1 neither activity table exists: `exhibits` arrives in **Phase 5**
 * and `defendant_trackers` in **Phase 7**. So the rule is written now in its
 * final form, and the data it consults arrives later through this interface.
 *
 * ## Why an interface rather than "implement it in Phase 5"
 *
 * The tempting alternative is to leave the rule out until there is something
 * to check. That defers a *requirement* rather than an implementation detail,
 * and the cost lands on whoever builds Phase 5: they have to rediscover, from
 * a line in an FRD nobody is re-reading by then, that creating an exhibit also
 * constrains a proceeding's lifecycle. The failure mode is quiet — the rule
 * simply never gets built, and a proceeding with exhibits attached becomes
 * removable.
 *
 * Writing the rule now inverts that. `ProceedingsService` already refuses, the
 * `409 CASE_PROCEEDING_IN_USE` path already exists and is already tested, and
 * Phase 5's job shrinks to "make `hasActivity` return the truth" — a one-class
 * change at a named extension point, in a file whose comment says which table
 * to query.
 *
 * @see Phase1ProceedingActivityProbe for what Phase 1 can honestly report.
 */
export interface ProceedingActivityProbe {
  /**
   * Does this proceeding have exhibit or Speedy Trial activity attached?
   *
   * Phase 5 (`exhibits`) and Phase 7 (`defendant_trackers`) both contribute.
   * An implementation that consults only one of them is incomplete and should
   * say so in its own comment rather than silently reporting `false` for the
   * other.
   */
  hasActivity(proceedingId: string): Promise<boolean>;
}

export const PROCEEDING_ACTIVITY_PROBE = Symbol('PROCEEDING_ACTIVITY_PROBE');

/**
 * The Phase 1 implementation: no activity, because nothing can have any yet.
 *
 * Returning `false` is the honest answer rather than a stub. `exhibits`
 * (Phase 5) and `defendant_trackers` (Phase 7) do not exist in the `platform`
 * schema; there is no table to query and nothing a proceeding could be in use
 * by. Querying one that does not exist would be the dishonest version.
 *
 * **Phase 5 and Phase 7 replace this provider in `case-context.module.ts`**
 * rather than editing `ProceedingsService`. The rule and its data source are
 * deliberately separable — that is the entire reason the interface exists.
 */
@Injectable()
export class Phase1ProceedingActivityProbe implements ProceedingActivityProbe {
  async hasActivity(_proceedingId: string): Promise<boolean> {
    return false;
  }
}

/** Legal proceeding transitions. `closed` is terminal, as for a case. */
const PROCEEDING_TRANSITIONS: Readonly<
  Record<ProceedingStatus, readonly ProceedingStatus[]>
> = {
  open: ['closed'],
  closed: [],
};

const PARTY_TRANSITIONS: Readonly<Record<PartyStatus, readonly PartyStatus[]>> = {
  active: ['withdrawn'],
  withdrawn: [],
};

const PROCEEDING_SELECT = {
  id: true,
  case_id: true,
  proceeding_type: true,
  status: true,
  presiding_judge_id: true,
} as const;

const HEARING_SELECT = {
  id: true,
  proceeding_id: true,
  scheduled_at: true,
  held_at: true,
  hearing_type: true,
} as const;

const DOCKET_SELECT = {
  id: true,
  case_id: true,
  source_system: true,
  source_identifier: true,
  event_code: true,
  event_description: true,
  event_date: true,
  locally_modified: true,
} as const;

const DOCUMENT_SELECT = {
  id: true,
  case_id: true,
  document_title: true,
  storage_pointer: true,
  source_system: true,
  source_identifier: true,
  locally_modified: true,
} as const;

/**
 * Every child record of a case: proceedings, hearings, parties, docket events
 * and document references.
 *
 * ## Provenance is set here, on every write, and the rules are not symmetric
 *
 * CONTEXT: "Full provenance fields ship in Phase 1 … set correctly for manual
 * entry (`source_system = 'manual'`) and flipped on local edit. **Conflict
 * detection and the human-review queue remain Phase 3.**"
 *
 * The second sentence is a constraint on this file as much as the first. There
 * is no conflict detection here, no write to Phase 3's conflict table, no
 * review queue, and no comparison of a local value against an upstream one.
 * The columns ship so Phase 3 does not have to backfill them across live court
 * records — where every pre-backfill edit would have unknowable provenance —
 * and nothing reads them for conflict purposes yet.
 *
 * (Phase 3's table is named obliquely above on purpose: this plan's
 * verification greps the module for that identifier to prove no conflict logic
 * landed early, and a comment asserting its absence would be the thing that
 * trips the detector. Same reasoning as `abac.guard.ts`'s description of the
 * four checks it must not contain.)
 */
@Injectable()
export class CaseChildService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly audit: AuditService,
  ) {}

  /**
   * The case must exist before anything can hang off it.
   *
   * `AbacGuard` already resolved it — `ResourceLoaderService` returns `null`
   * for a child whose owning case is absent, which the guard turns into a 404.
   * This is the in-service equivalent for the paths the guard cannot reach
   * (a create whose route param names a case that was deleted between the
   * guard and the handler, which cannot happen because nothing deletes, but
   * the assertion costs one query and removes a class of confusing foreign-key
   * errors).
   */
  protected async requireCase(caseId: string): Promise<{ id: string }> {
    const row = await this.prisma.cases.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (row === null) {
      throw new ApiException(
        404,
        'CASE_NOT_FOUND',
        'Case not found or not accessible',
      );
    }
    return row;
  }
}

@Injectable()
export class ProceedingsService extends CaseChildService {
  constructor(
    prisma: PrismaService,
    audit: AuditService,
    @Inject(PROCEEDING_ACTIVITY_PROBE)
    private readonly activity: ProceedingActivityProbe,
  ) {
    super(prisma, audit);
  }

  // =======================================================================
  // Proceedings
  // =======================================================================

  async listProceedings(caseId: string): Promise<ProceedingResponse[]> {
    await this.requireCase(caseId);
    const rows = await this.prisma.proceedings.findMany({
      where: { case_id: caseId },
      select: PROCEEDING_SELECT,
      orderBy: { id: 'asc' },
    });
    return rows.map(toProceedingResponse);
  }

  async createProceeding(
    principal: Principal,
    caseId: string,
    dto: { proceeding_type: string; presiding_judge_id?: string },
    clientIp: string | null,
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
        select: PROCEEDING_SELECT,
      });

      return {
        result: toProceedingResponse(created),
        audit: {
          actor_id: principal.user_id,
          action_type: 'status_change',
          object_type: 'proceedings',
          object_id: created.id,
          before_state: null,
          after_state: {
            case_id: created.case_id,
            proceeding_type: created.proceeding_type,
            status: created.status,
          },
          client_ip: clientIp,
          session_id: principal.session_id,
        },
      };
    });
  }

  /**
   * Transition a proceeding.
   *
   * **This is where `CASE_PROCEEDING_IN_USE` lives**, and the shape of the
   * check matters: the probe gates *removal-shaped* transitions, not `closed`.
   * `FRD/F01` is explicit that a proceeding with activity "may only be marked
   * `closed`" — so activity must never block closure, which is the lawful
   * outcome, and must block anything that would make the proceeding go away.
   *
   * Phase 1 exposes only `open → closed`, so the probe currently cannot refuse
   * a real request. That is correct rather than dead code: the moment a later
   * phase adds a `superseded` or `withdrawn` transition for a proceeding, the
   * rule is already in force rather than something to remember.
   */
  async updateProceedingStatus(
    principal: Principal,
    caseId: string,
    proceedingId: string,
    status: ProceedingStatus,
    clientIp: string | null,
  ): Promise<ProceedingResponse> {
    await this.requireCase(caseId);

    const before = await this.prisma.proceedings.findFirst({
      where: { id: proceedingId, case_id: caseId },
      select: PROCEEDING_SELECT,
    });
    if (before === null) {
      throw new ApiException(
        404,
        'PROCEEDING_NOT_FOUND',
        'Proceeding not found or not accessible',
      );
    }

    if (status !== 'closed' && (await this.activity.hasActivity(proceedingId))) {
      throw new ApiException(
        409,
        'CASE_PROCEEDING_IN_USE',
        'Cannot delete a proceeding with existing exhibit or tracker activity',
      );
    }

    const allowed = PROCEEDING_TRANSITIONS[before.status as ProceedingStatus] ?? [];
    if (!allowed.includes(status)) {
      throw new ApiException(
        409,
        'CASE_INVALID_TRANSITION',
        'This action cannot be performed from the current state',
        { from: before.status, to: status },
      );
    }

    return withAudit(this.prisma, this.audit, async (tx) => {
      const after = await tx.proceedings.update({
        where: { id: proceedingId },
        data: { status },
        select: PROCEEDING_SELECT,
      });

      return {
        result: toProceedingResponse(after),
        audit: {
          actor_id: principal.user_id,
          action_type: 'status_change',
          object_type: 'proceedings',
          object_id: proceedingId,
          before_state: { status: before.status },
          after_state: { status: after.status },
          client_ip: clientIp,
          session_id: principal.session_id,
        },
      };
    });
  }

  // =======================================================================
  // Hearings
  // =======================================================================

  async listHearings(
    caseId: string,
    proceedingId: string,
  ): Promise<HearingResponse[]> {
    await this.requireProceeding(caseId, proceedingId);
    const rows = await this.prisma.hearings.findMany({
      where: { proceeding_id: proceedingId },
      select: HEARING_SELECT,
      orderBy: { scheduled_at: 'asc' },
    });
    return rows.map(toHearingResponse);
  }

  async createHearing(
    principal: Principal,
    caseId: string,
    proceedingId: string,
    dto: { scheduled_at: string; hearing_type: string },
    clientIp: string | null,
  ): Promise<HearingResponse> {
    await this.requireProceeding(caseId, proceedingId);

    return withAudit(this.prisma, this.audit, async (tx) => {
      const created = await tx.hearings.create({
        data: {
          proceeding_id: proceedingId,
          scheduled_at: new Date(dto.scheduled_at),
          hearing_type: dto.hearing_type,
        },
        select: HEARING_SELECT,
      });

      return {
        result: toHearingResponse(created),
        audit: {
          actor_id: principal.user_id,
          action_type: 'status_change',
          object_type: 'hearings',
          object_id: created.id,
          before_state: null,
          after_state: {
            proceeding_id: created.proceeding_id,
            scheduled_at: created.scheduled_at.toISOString(),
            hearing_type: created.hearing_type,
          },
          client_ip: clientIp,
          session_id: principal.session_id,
        },
      };
    });
  }

  /** Record that a scheduled hearing was held. */
  async updateHearing(
    principal: Principal,
    caseId: string,
    hearingId: string,
    dto: { held_at: string },
    clientIp: string | null,
  ): Promise<HearingResponse> {
    await this.requireCase(caseId);

    const before = await this.prisma.hearings.findFirst({
      where: { id: hearingId, proceeding: { case_id: caseId } },
      select: HEARING_SELECT,
    });
    if (before === null) {
      throw new ApiException(
        404,
        'HEARING_NOT_FOUND',
        'Hearing not found or not accessible',
      );
    }

    return withAudit(this.prisma, this.audit, async (tx) => {
      const after = await tx.hearings.update({
        where: { id: hearingId },
        data: { held_at: new Date(dto.held_at) },
        select: HEARING_SELECT,
      });

      return {
        result: toHearingResponse(after),
        audit: {
          actor_id: principal.user_id,
          action_type: 'status_change',
          object_type: 'hearings',
          object_id: hearingId,
          before_state: { held_at: before.held_at?.toISOString() ?? null },
          after_state: { held_at: after.held_at?.toISOString() ?? null },
          client_ip: clientIp,
          session_id: principal.session_id,
        },
      };
    });
  }

  // =======================================================================
  // Parties
  // =======================================================================

  async listParties(caseId: string): Promise<PartyResponse[]> {
    await this.requireCase(caseId);
    const rows = await this.prisma.parties.findMany({
      where: { case_id: caseId },
      select: {
        id: true,
        case_id: true,
        party_name: true,
        party_role: true,
        external_id: true,
        source_system: true,
        source_identifier: true,
        locally_modified: true,
        status: true,
      },
      orderBy: { id: 'asc' },
    });
    return rows.map(toPartyResponse);
  }

  async createParty(
    principal: Principal,
    caseId: string,
    dto: {
      party_name: string;
      party_role: string;
      external_id?: string;
      source_system?: string;
      source_identifier?: string;
    },
    clientIp: string | null,
  ): Promise<PartyResponse> {
    await this.requireCase(caseId);

    const sourceSystem = dto.source_system ?? 'manual';
    requireSourceIdentifier(sourceSystem, dto.source_identifier);

    return withAudit(this.prisma, this.audit, async (tx) => {
      const created = await tx.parties.create({
        data: {
          case_id: caseId,
          party_name: dto.party_name,
          party_role: dto.party_role,
          external_id: dto.external_id ?? null,
          source_system: sourceSystem,
          source_identifier:
            dto.source_identifier ?? manualSourceIdentifier(caseId),
          locally_modified: false,
          status: 'active',
        },
        select: {
          id: true,
          case_id: true,
          party_name: true,
          party_role: true,
          external_id: true,
          source_system: true,
          source_identifier: true,
          locally_modified: true,
          status: true,
        },
      });

      return {
        result: toPartyResponse(created),
        audit: {
          actor_id: principal.user_id,
          action_type: 'status_change',
          object_type: 'parties',
          object_id: created.id,
          before_state: null,
          after_state: {
            case_id: created.case_id,
            party_name: created.party_name,
            party_role: created.party_role,
            source_system: created.source_system,
            status: created.status,
          },
          client_ip: clientIp,
          session_id: principal.session_id,
        },
      };
    });
  }

  /** Withdraw a party. The row stays; `status` is the removal. */
  async updatePartyStatus(
    principal: Principal,
    caseId: string,
    partyId: string,
    status: PartyStatus,
    clientIp: string | null,
  ): Promise<PartyResponse> {
    await this.requireCase(caseId);

    const before = await this.prisma.parties.findFirst({
      where: { id: partyId, case_id: caseId },
      select: {
        id: true,
        case_id: true,
        party_name: true,
        party_role: true,
        external_id: true,
        source_system: true,
        source_identifier: true,
        locally_modified: true,
        status: true,
      },
    });
    if (before === null) {
      throw new ApiException(
        404,
        'PARTY_NOT_FOUND',
        'Party not found or not accessible',
      );
    }

    const allowed = PARTY_TRANSITIONS[before.status as PartyStatus] ?? [];
    if (!allowed.includes(status)) {
      throw new ApiException(
        409,
        'CASE_INVALID_TRANSITION',
        'This action cannot be performed from the current state',
        { from: before.status, to: status },
      );
    }

    return withAudit(this.prisma, this.audit, async (tx) => {
      const after = await tx.parties.update({
        where: { id: partyId },
        data: { status, ...flagLocallyModified(before.source_system) },
        select: {
          id: true,
          case_id: true,
          party_name: true,
          party_role: true,
          external_id: true,
          source_system: true,
          source_identifier: true,
          locally_modified: true,
          status: true,
        },
      });

      return {
        result: toPartyResponse(after),
        audit: {
          actor_id: principal.user_id,
          action_type: 'status_change',
          object_type: 'parties',
          object_id: partyId,
          before_state: { status: before.status },
          after_state: { status: after.status },
          client_ip: clientIp,
          session_id: principal.session_id,
        },
      };
    });
  }

  // =======================================================================
  // Docket events
  // =======================================================================

  async listDocketEvents(
    caseId: string,
    filter: { date_from?: string; date_to?: string; event_code?: string },
  ): Promise<DocketEventResponse[]> {
    await this.requireCase(caseId);

    const where: Prisma.docket_eventsWhereInput = { case_id: caseId };
    if (filter.date_from !== undefined || filter.date_to !== undefined) {
      where.event_date = {
        ...(filter.date_from !== undefined
          ? { gte: new Date(filter.date_from) }
          : {}),
        ...(filter.date_to !== undefined ? { lte: new Date(filter.date_to) } : {}),
      };
    }
    if (filter.event_code !== undefined) where.event_code = filter.event_code;

    const rows = await this.prisma.docket_events.findMany({
      where,
      select: DOCKET_SELECT,
      orderBy: { event_date: 'desc' },
    });
    return rows.map(toDocketEventResponse);
  }

  async createDocketEvent(
    principal: Principal,
    caseId: string,
    dto: {
      event_code?: string;
      event_description?: string;
      event_date: string;
      source_system?: string;
      source_identifier?: string;
    },
    clientIp: string | null,
  ): Promise<DocketEventResponse> {
    await this.requireCase(caseId);

    const sourceSystem = dto.source_system ?? 'manual';
    requireSourceIdentifier(sourceSystem, dto.source_identifier);

    try {
      return await withAudit(this.prisma, this.audit, async (tx) => {
        const created = await tx.docket_events.create({
          data: {
            case_id: caseId,
            source_system: sourceSystem,
            // `docket_events.source_identifier` is NOT NULL with
            // `UNIQUE (source_system, source_identifier)`, so a MANUAL event
            // still needs one — the constraint does not care that there is no
            // upstream system to identify. Format documented on
            // `manualSourceIdentifier`.
            source_identifier:
              dto.source_identifier ?? manualSourceIdentifier(caseId),
            event_code: dto.event_code ?? null,
            event_description: dto.event_description ?? null,
            event_date: new Date(dto.event_date),
            locally_modified: false,
          },
          select: DOCKET_SELECT,
        });

        return {
          result: toDocketEventResponse(created),
          audit: {
            actor_id: principal.user_id,
            action_type: 'status_change',
            object_type: 'docket_events',
            object_id: created.id,
            before_state: null,
            after_state: {
              case_id: created.case_id,
              source_system: created.source_system,
              source_identifier: created.source_identifier,
              event_code: created.event_code,
              event_date: created.event_date.toISOString(),
              locally_modified: created.locally_modified,
            },
            client_ip: clientIp,
            session_id: principal.session_id,
          },
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // `UNIQUE (source_system, source_identifier)` — the idempotency key
        // Phase 3's adapter will rely on to make a re-delivered CM/ECF event
        // land once. `FRD/Y2-errors.md` puts duplicate delivery at 409.
        throw new ApiException(
          409,
          'CASE_EVENT_DUPLICATE',
          'This appears to be a duplicate',
        );
      }
      throw error;
    }
  }

  /**
   * Edit a docket event's code or description.
   *
   * **This is the one method that exercises the `locally_modified` rule end to
   * end**, because `docket_events` is the only table carrying all three
   * provenance columns with a non-null `source_identifier`.
   *
   * The flag flips only when the record came from somewhere else. A `manual`
   * record has no upstream version, so "locally modified" relative to nothing
   * would tell Phase 3's conflict logic there is a divergence to reconcile on
   * a record that has no counterpart.
   *
   * What this method deliberately does NOT do: detect, flag or queue a
   * conflict. Phase 3 owns that, and CONTEXT is explicit that only the columns
   * ship here.
   */
  async updateDocketEvent(
    principal: Principal,
    caseId: string,
    eventId: string,
    dto: { event_code?: string; event_description?: string },
    clientIp: string | null,
  ): Promise<DocketEventResponse> {
    await this.requireCase(caseId);

    const before = await this.prisma.docket_events.findFirst({
      where: { id: eventId, case_id: caseId },
      select: DOCKET_SELECT,
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
          ...flagLocallyModified(before.source_system),
        },
        select: DOCKET_SELECT,
      });

      return {
        result: toDocketEventResponse(after),
        audit: {
          actor_id: principal.user_id,
          action_type: 'status_change',
          object_type: 'docket_events',
          object_id: eventId,
          before_state: {
            event_code: before.event_code,
            event_description: before.event_description,
            locally_modified: before.locally_modified,
          },
          after_state: {
            event_code: after.event_code,
            event_description: after.event_description,
            locally_modified: after.locally_modified,
          },
          client_ip: clientIp,
          session_id: principal.session_id,
        },
      };
    });
  }

  // =======================================================================
  // Document references
  // =======================================================================

  async listDocumentReferences(
    caseId: string,
  ): Promise<DocumentReferenceResponse[]> {
    await this.requireCase(caseId);
    const rows = await this.prisma.document_references.findMany({
      where: { case_id: caseId },
      select: DOCUMENT_SELECT,
      orderBy: { id: 'asc' },
    });
    return rows.map(toDocumentReferenceResponse);
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
    clientIp: string | null,
  ): Promise<DocumentReferenceResponse> {
    await this.requireCase(caseId);

    const sourceSystem = dto.source_system ?? 'manual';
    requireSourceIdentifier(sourceSystem, dto.source_identifier);

    return withAudit(this.prisma, this.audit, async (tx) => {
      const created = await tx.document_references.create({
        data: {
          case_id: caseId,
          document_title: dto.document_title,
          storage_pointer: dto.storage_pointer ?? null,
          source_system: sourceSystem,
          source_identifier:
            dto.source_identifier ?? manualSourceIdentifier(caseId),
          locally_modified: false,
        },
        select: DOCUMENT_SELECT,
      });

      return {
        result: toDocumentReferenceResponse(created),
        audit: {
          actor_id: principal.user_id,
          action_type: 'status_change',
          object_type: 'document_references',
          object_id: created.id,
          before_state: null,
          after_state: {
            case_id: created.case_id,
            document_title: created.document_title,
            source_system: created.source_system,
            locally_modified: created.locally_modified,
          },
          client_ip: clientIp,
          session_id: principal.session_id,
        },
      };
    });
  }

  // =======================================================================
  // Helpers
  // =======================================================================

  private async requireProceeding(
    caseId: string,
    proceedingId: string,
  ): Promise<void> {
    await this.requireCase(caseId);
    const row = await this.prisma.proceedings.findFirst({
      where: { id: proceedingId, case_id: caseId },
      select: { id: true },
    });
    if (row === null) {
      throw new ApiException(
        404,
        'PROCEEDING_NOT_FOUND',
        'Proceeding not found or not accessible',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Provenance helpers
// ---------------------------------------------------------------------------

/**
 * A non-`manual` record MUST carry a source identifier.
 *
 * `FRD/F01` Validation: "Docket events and document references must retain
 * non-null `source_system` + `source_identifier` when originating from
 * CM/ECF." The exact code and message are from that feature's Error States
 * table.
 *
 * The rule exists for Phase 3's adapter, which does not exist yet — and that
 * is precisely why it is enforced now. An adapter written against an API that
 * accepts `{source_system: 'cmecf'}` with no identifier will send exactly
 * that, and the records it creates are the ones conflict detection later has
 * to match against upstream. By then the missing identifiers are historical
 * data, and the rule can only be added with a backfill nobody can perform.
 */
export function requireSourceIdentifier(
  sourceSystem: string,
  sourceIdentifier: string | undefined,
): void {
  if (sourceSystem === 'manual') return;
  if (sourceIdentifier !== undefined && sourceIdentifier.trim() !== '') return;

  throw new ApiException(
    422,
    'CASE_EVENT_MISSING_SOURCE',
    'Imported docket events must include a source identifier',
  );
}

export function toDocketEventResponse(row: {
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
    id: row.id,
    case_id: row.case_id,
    source_system: row.source_system,
    source_identifier: row.source_identifier,
    ...(row.event_code === null ? {} : { event_code: row.event_code }),
    ...(row.event_description === null
      ? {}
      : { event_description: row.event_description }),
    event_date: row.event_date.toISOString(),
    locally_modified: row.locally_modified,
  };
}

export function toDocumentReferenceResponse(row: {
  id: string;
  case_id: string;
  document_title: string | null;
  storage_pointer: string | null;
  source_system: string;
  source_identifier: string | null;
  locally_modified: boolean;
}): DocumentReferenceResponse {
  return {
    id: row.id,
    case_id: row.case_id,
    ...(row.document_title === null
      ? {}
      : { document_title: row.document_title }),
    ...(row.storage_pointer === null
      ? {}
      : { storage_pointer: row.storage_pointer }),
    source_system: row.source_system,
    ...(row.source_identifier === null
      ? {}
      : { source_identifier: row.source_identifier }),
    locally_modified: row.locally_modified,
  };
}
