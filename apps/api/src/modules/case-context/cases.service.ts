import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ApiException } from '../../common/errors/api-error';
import { Principal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditWriteInput } from '../audit/audit.types';
import { withAudit } from '../audit/with-audit';
import {
  CaseResponse,
  CaseStatus,
  CreateCaseRequest,
  PartyResponse,
} from './dto/case.dto';

/** PostgreSQL unique-violation SQLSTATE, and Prisma's wrapper code for it. */
const PG_UNIQUE_VIOLATION = '23505';
const PRISMA_UNIQUE_VIOLATION = 'P2002';

/**
 * Legal case status transitions.
 *
 * `closed` and `superseded` are terminal. There is no transition back to
 * `open`: reopening a closed matter is a judicial act with its own record, not
 * an undo of a clerical one, and nothing in Phase 1 is authorized to perform
 * it. A request to do so is a `409 CASE_INVALID_TRANSITION` rather than a
 * silent no-op.
 */
const CASE_TRANSITIONS: Readonly<Record<CaseStatus, readonly CaseStatus[]>> = {
  open: ['closed', 'superseded'],
  closed: [],
  superseded: [],
};

/** A `cases` row as this service selects it. */
type CaseRow = {
  id: string;
  court_id: string;
  division_id: string;
  case_number: string;
  case_caption: string;
  case_type: string;
  source_system: string;
  source_identifier: string | null;
  locally_modified: boolean;
  created_at: Date;
  status: string;
};

/**
 * ============================================================================
 * CASE CREATION, RETRIEVAL AND THE ONE REMOVAL MECHANISM
 * ============================================================================
 *
 * `FRD/F01` Process step 1 makes manual clerk entry a **permanent** fallback —
 * "when sync is unavailable or case predates sync" — not scaffolding to be
 * replaced by Phase 3's CM/ECF adapter. The adapter writes through these same
 * records.
 *
 * ## There is no delete, here or anywhere in this module
 *
 * The Phase 1 CONTEXT: "No hard deletes anywhere in the case model. No
 * `DELETE` endpoints. Removal is always a status transition … Soft-delete
 * columns were rejected as a competing second meaning of 'gone.'"
 *
 * {@link updateStatus} is that transition and the only one. Plan 01-03 already
 * removed the capability from the database — `app_rw` holds no DELETE grant on
 * any table in `platform` — so a delete written here would fail at the
 * database with SQLSTATE 42501 rather than succeed. This file makes sure the
 * API never offers one in the first place, which is the difference between a
 * refusal and an absence.
 *
 * `apps/api/test/case-no-delete.e2e-spec.ts` asserts both halves.
 */
@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // =========================================================================
  // Create
  // =========================================================================

  /**
   * Create a case with its parties.
   *
   * `AbacGuard` has already decided the caller may create a case in the named
   * division — and, critically, plan 01-07's `ResourceLoaderService` validated
   * the body-supplied `division_id` against the database and handed the PDP
   * the court that division *actually* belongs to, never the one the body
   * claimed (threat T-01-36). The `CASE_INVALID_DIVISION` check below is
   * therefore not the authorization control; it is the user-facing 422 that
   * tells an honest caller they mistyped, instead of leaving them with the
   * guard's 404.
   */
  async create(
    principal: Principal,
    dto: CreateCaseRequest,
    clientIp: string | null,
  ): Promise<{ case: CaseResponse; parties: PartyResponse[] }> {
    // --- division belongs to court -----------------------------------------
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

    // --- at least one defendant --------------------------------------------
    //
    // `FRD/F01` Validation: "A case must have at least one associated party
    // with role `defendant` before a Speedy Trial tracker (F26) may be
    // initialized against it." `US-1.2` ties the Phase 7 tracker precondition
    // to this exact code, so enforcing it at creation is what stops Phase 7
    // inheriting cases it can never track.
    if (!dto.party.some((party) => party.role === 'defendant')) {
      throw new ApiException(
        422,
        'CASE_MISSING_DEFENDANT',
        'At least one defendant party is required',
      );
    }

    try {
      return await withAudit(this.prisma, this.audit, async (tx) => {
        const created = (await tx.cases.create({
          data: {
            court_id: dto.court_id,
            division_id: dto.division_id,
            case_number: dto.case_number,
            case_caption: dto.case_caption,
            case_type: dto.case_type,
            // `FRD/F01` Validation: "manually entered events are flagged
            // `source_system = 'manual'`." A manual case has no upstream
            // identifier to preserve, and inventing one would make a
            // locally-authored record indistinguishable from an imported one
            // to Phase 3's adapter.
            source_system: 'manual',
            source_identifier: null,
            locally_modified: false,
            status: 'open',
          },
          select: CASE_SELECT,
        })) as CaseRow;

        const parties: PartyResponse[] = [];
        for (const party of dto.party) {
          const row = await tx.parties.create({
            data: {
              case_id: created.id,
              party_name: party.name,
              party_role: party.role,
              external_id: party.external_id ?? null,
              source_system: 'manual',
              source_identifier: `manual:${created.id}:${randomSuffix()}`,
              locally_modified: false,
              status: 'active',
            },
            select: PARTY_SELECT,
          });
          parties.push(toPartyResponse(row));
        }

        // One event for the case plus one per party, all in this transaction.
        // `withAudit` accepts the array; splitting them across calls would put
        // the party events in a second transaction and break the atomicity
        // guarantee for exactly the rows that make the case usable.
        const events: AuditWriteInput[] = [
          {
            actor_id: principal.user_id,
            action_type: 'status_change',
            object_type: 'cases',
            object_id: created.id,
            before_state: null,
            after_state: caseAuditState(created),
            client_ip: clientIp,
            session_id: principal.session_id,
          },
          ...parties.map(
            (party): AuditWriteInput => ({
              actor_id: principal.user_id,
              action_type: 'status_change',
              object_type: 'parties',
              object_id: party.id,
              before_state: null,
              after_state: partyAuditState(party),
              client_ip: clientIp,
              session_id: principal.session_id,
            }),
          ),
        ];

        return {
          result: { case: toCaseResponse(created), parties },
          audit: events,
        };
      });
    } catch (error) {
      // `UNIQUE (division_id, case_number)`.
      //
      // Caught rather than pre-checked, deliberately. A `SELECT … WHERE
      // case_number = …` before the INSERT races: two clerks filing the same
      // number in the same second both see no row and both proceed. The
      // constraint does not race — it is evaluated by the one component that
      // can see both transactions. So the check IS the insert, and this is
      // where its failure gets a human-readable name.
      if (isUniqueViolation(error)) {
        throw new ApiException(
          409,
          'CASE_DUPLICATE_NUMBER',
          'A case with this number already exists in this division',
        );
      }
      throw error;
    }
  }

  // =========================================================================
  // Read
  // =========================================================================

  /**
   * One case.
   *
   * **This method does not re-filter by court, division or designation, and
   * must not start.** `AbacGuard` has already evaluated this exact object
   * against the PDP using the row's real attributes. A second, independently
   * written check here would be a second policy: it would agree with the first
   * most of the time, diverge silently when it did not, and — worse — mask a
   * scope bug in the guard behind a redundant filter, so the bug would live on
   * in every other route that lacks the redundancy.
   */
  async get(id: string): Promise<CaseResponse> {
    const row = (await this.prisma.cases.findUnique({
      where: { id },
      select: CASE_SELECT,
    })) as CaseRow | null;

    if (row === null) throw notFound();
    return toCaseResponse(row);
  }

  // =========================================================================
  // Status transition — the only removal mechanism
  // =========================================================================

  /**
   * Move a case to `closed` or `superseded`.
   *
   * ## Court and division are immutable, and this method is where that is held
   *
   * `FRD/F01` Process step 2: "Court/division association is assigned at case
   * creation and is **immutable** thereafter (a case does not move between
   * courts)." There is deliberately no endpoint that changes them.
   *
   * The reason to say so here, rather than to rely on the absence of a route,
   * is that "move this case to the right division" is the single most natural
   * next feature request against this module, and an UPDATE adding
   * `division_id` to the `data` below would look entirely reasonable in
   * review. It would also silently relocate a case out of the scope of every
   * principal authorized on it and into the scope of principals who were
   * never authorized on anything — authorization in this system is derived
   * from court and division, so mutating them rewrites the access-control
   * answer for every past and future request about the record.
   *
   * If a case was genuinely filed in the wrong division, the lawful remedy is
   * `superseded` plus a new case — which leaves both records and a reason.
   */
  async updateStatus(
    principal: Principal,
    id: string,
    status: CaseStatus,
    clientIp: string | null,
  ): Promise<CaseResponse> {
    return withAudit(this.prisma, this.audit, async (tx) => {
      const before = (await tx.cases.findUnique({
        where: { id },
        select: CASE_SELECT,
      })) as CaseRow | null;
      if (before === null) throw notFound();

      const allowed = CASE_TRANSITIONS[before.status as CaseStatus] ?? [];
      if (!allowed.includes(status)) {
        throw new ApiException(
          409,
          'CASE_INVALID_TRANSITION',
          'This action cannot be performed from the current state',
          { from: before.status, to: status },
        );
      }

      const after = (await tx.cases.update({
        where: { id },
        data: {
          status,
          // Provenance. CONTEXT requires `locally_modified` be "flipped on
          // local edit", because Phase 3's conflict logic reads it to tell an
          // imported value from one a clerk changed here. A record that was
          // never synced has nothing to conflict with, so the flag stays
          // false for `manual` rows — see `flagLocallyModified`.
          ...flagLocallyModified(before.source_system),
          // NOTE: `court_id` and `division_id` are absent from this payload on
          // purpose. See the method comment before adding them.
        },
        select: CASE_SELECT,
      })) as CaseRow;

      return {
        result: toCaseResponse(after),
        audit: {
          actor_id: principal.user_id,
          action_type: 'status_change',
          object_type: 'cases',
          object_id: id,
          before_state: { status: before.status },
          after_state: { status: after.status },
          client_ip: clientIp,
          session_id: principal.session_id,
        },
      };
    });
  }
}

// ===========================================================================
// Shared selects, mappers and helpers — used by every service in this module
// ===========================================================================

export const CASE_SELECT = {
  id: true,
  court_id: true,
  division_id: true,
  case_number: true,
  case_caption: true,
  case_type: true,
  source_system: true,
  source_identifier: true,
  locally_modified: true,
  created_at: true,
  status: true,
} as const;

export const PARTY_SELECT = {
  id: true,
  case_id: true,
  party_name: true,
  party_role: true,
  external_id: true,
  source_system: true,
  source_identifier: true,
  locally_modified: true,
  status: true,
} as const;

export function toCaseResponse(row: CaseRow): CaseResponse {
  return {
    id: row.id,
    court_id: row.court_id,
    division_id: row.division_id,
    case_number: row.case_number,
    case_caption: row.case_caption,
    case_type: row.case_type,
    source_system: row.source_system,
    ...(row.source_identifier === null
      ? {}
      : { source_identifier: row.source_identifier }),
    created_at: row.created_at.toISOString(),
    status: row.status as CaseStatus,
    locally_modified: row.locally_modified,
  };
}

export function toPartyResponse(row: {
  id: string;
  case_id: string;
  party_name: string;
  party_role: string;
  external_id: string | null;
  source_system: string;
  source_identifier: string | null;
  locally_modified: boolean;
  status: string;
}): PartyResponse {
  return {
    id: row.id,
    case_id: row.case_id,
    party_name: row.party_name,
    party_role: row.party_role as PartyResponse['party_role'],
    ...(row.external_id === null ? {} : { external_id: row.external_id }),
    source_system: row.source_system,
    ...(row.source_identifier === null
      ? {}
      : { source_identifier: row.source_identifier }),
    locally_modified: row.locally_modified,
    status: row.status as PartyResponse['status'],
  };
}

/**
 * The provenance flag, set only on a record that came from somewhere else.
 *
 * CONTEXT: `locally_modified` must be "set correctly for manual entry
 * (`source_system = 'manual'`) and flipped on local edit". The two halves read
 * as one rule but are not: a `manual` record has no upstream version, so
 * "locally modified" relative to nothing is meaningless, and setting it would
 * tell Phase 3's conflict logic there is a divergence to reconcile on a record
 * that has no counterpart. A synced record edited here genuinely has one.
 */
export function flagLocallyModified(
  sourceSystem: string,
): { locally_modified: true } | Record<string, never> {
  return sourceSystem === 'manual' ? {} : { locally_modified: true };
}

/**
 * The manual-entry `source_identifier` format: `manual:{caseId}:{random}`.
 *
 * `docket_events` carries `UNIQUE (source_system, source_identifier)` with the
 * column `NOT NULL`, so a manually created event still needs one — the
 * constraint does not care that there is no upstream system to identify. The
 * case id is embedded so a value read out of the database is traceable to its
 * case without a join, and the random tail is what makes it unique across the
 * table rather than merely within the case.
 */
export function manualSourceIdentifier(caseId: string): string {
  return `manual:${caseId}:${randomSuffix()}`;
}

function randomSuffix(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return randomUUID();
}

/**
 * The case 404.
 *
 * Byte-identical to the one `AbacGuard` produces for a hidden record (see
 * `abac.guard.ts`'s `notFound`). The two must not diverge: a caller who can
 * tell "no such case" from "a case you may not know about" has an existence
 * oracle for sealed matters, which is exactly what
 * `TechArch/04-security.md` §7.6 forbids.
 */
export function notFound(): ApiException {
  return new ApiException(
    404,
    'CASE_NOT_FOUND',
    'Case not found or not accessible',
  );
}

export function isUniqueViolation(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === PRISMA_UNIQUE_VIOLATION
  ) {
    return true;
  }
  const code = (error as { code?: unknown } | null)?.code;
  return code === PG_UNIQUE_VIOLATION;
}

/** JSON-safe audit state for a case. */
export function caseAuditState(row: CaseRow): Record<string, unknown> {
  return {
    court_id: row.court_id,
    division_id: row.division_id,
    case_number: row.case_number,
    case_caption: row.case_caption,
    case_type: row.case_type,
    source_system: row.source_system,
    source_identifier: row.source_identifier,
    locally_modified: row.locally_modified,
    status: row.status,
  };
}

/** JSON-safe audit state for a party. */
export function partyAuditState(party: PartyResponse): Record<string, unknown> {
  return {
    case_id: party.case_id,
    party_name: party.party_name,
    party_role: party.party_role,
    source_system: party.source_system,
    locally_modified: party.locally_modified,
    status: party.status,
  };
}
