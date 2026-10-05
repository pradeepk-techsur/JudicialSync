import { Injectable, Logger } from '@nestjs/common';

import { Principal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { recordStandaloneAudit } from '../audit/with-audit';
import { ResourceLoaderService } from '../policy/resource-loader.service';
import {
  CASE_SELECT,
  PARTY_SELECT,
  notFound,
  toCaseResponse,
  toPartyResponse,
} from './cases.service';
import {
  CaseContextResponse,
  CaseFilter,
  CaseResponse,
  DESIGNATIONS,
  Designation,
  HearingResponse,
  ProceedingResponse,
  SecurityDesignationResponse,
} from './dto/case.dto';

/**
 * The built-in designation → entitlement map.
 *
 * **A duplicate of `designation.rego`'s `default_designation_entitlement`, and
 * the duplication is the uncomfortable part of this file.** It exists for one
 * reason: a *list* cannot be a single PDP decision. The guard authorizes the
 * `GET /cases` route; it cannot authorize a thousand rows the caller has not
 * named yet, and asking OPA once per candidate row would be a thousand HTTP
 * round trips inside one request.
 *
 * Two things keep the duplication honest rather than merely tolerated:
 *
 *  - **Court configuration still wins.** When a court publishes
 *    `security_policies` rows, those replace this map wholesale — the same
 *    "replace, do not merge" rule `designation.rego` applies, read through the
 *    same {@link ResourceLoaderService.effectiveSecurityConfig} the guard
 *    uses. So the configured mapping has exactly one implementation.
 *  - **This map is only ever used to EXCLUDE.** It narrows a result set and
 *    can never admit a row; a divergence from the Rego defaults would hide
 *    records, not expose them. A fetch of any excluded row by id still goes
 *    through the guard and the real PDP.
 */
const DEFAULT_DESIGNATION_ENTITLEMENT: Readonly<Record<string, string>> = {
  sealed: 'designation_sealed',
  restricted: 'designation_restricted',
  grand_jury: 'designation_grand_jury',
  juvenile: 'designation_juvenile',
  pii: 'designation_pii',
};

/**
 * ============================================================================
 * THE SINGLE CASE-CONTEXT READ SURFACE
 * ============================================================================
 *
 * `FRD/F01` Process step 8, verbatim and binding:
 *
 * > "Both domain modules (Evidentiary, Speedy Trial) read
 * > case/proceeding/party/docket-event context **exclusively through the
 * > shared case-context API — no module maintains a shadow copy of this
 * > data**."
 *
 * Phases 5–8 read case context through this class and nothing else. Phase 1
 * success criterion 2 is the structural claim that "there is no duplicate,
 * module-specific case representation for Evidentiary vs. Speedy Trial to
 * later diverge from," and `FRD/F01` opens by naming module-specific case
 * models as "a core root cause of tool fragmentation."
 *
 * **If you are implementing Phase 5, 6, 7 or 8 and you are about to add a
 * `case_id` column to a table in your own schema that also carries a case
 * number, a caption, a court or a party name — stop.** That is the shadow copy.
 * Hold the `case_id` and call {@link getCaseContext}. A denormalised copy is
 * correct on the day it is written and wrong on the first day somebody
 * supersedes a case, and the two records will disagree without either one
 * being obviously at fault.
 *
 * ## Why this class filters, when `AbacGuard` already exists
 *
 * The guard answers "may this principal touch THIS resource" — one principal,
 * one named object, one PDP call. A collection endpoint has no named object:
 * the question is "which of these rows may they see", and the answer has to be
 * computed before the rows are counted, ranked or returned.
 *
 * So the filtering here is a **pre-filter for list endpoints**, not a second
 * authorization layer and not a substitute for the PDP. The guard authorizes
 * the route; this narrows the collection. `TechArch/04-security.md` §7.6
 * requires exactly that ordering — the exclusion must be "a pre-filter, not a
 * post-hoc redaction, so result counts, ranking positions, and response timing
 * cannot be used to infer the existence of a sealed matter" — and
 * `UX-Mockup/Y0-patterns.md` ("Non-Disclosure of Sealed/Restricted Existence")
 * says what that means for the client: the record is "omitted entirely — never
 * shown as a greyed-out row, a 'restricted' placeholder, or a count that
 * includes it."
 */
@Injectable()
export class CaseContextService {
  private readonly logger = new Logger(CaseContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resources: ResourceLoaderService,
  ) {}

  /**
   * The whole graph for one case: case + proceedings + hearings + parties +
   * active designations.
   *
   * Authorization for this call is the guard's — the route carries
   * `@Resource({type:'case', action:'read', idParam:'id'})` and the PDP has
   * already weighed the case's real court, division and designations. This
   * method deliberately performs no scope check of its own; see
   * `CasesService.get` for why a redundant one would be worse than none.
   */
  async getCaseContext(caseId: string): Promise<CaseContextResponse> {
    const caseRow = await this.prisma.cases.findUnique({
      where: { id: caseId },
      select: CASE_SELECT,
    });
    if (caseRow === null) throw notFound();

    const [proceedings, parties, designations] = await Promise.all([
      this.prisma.proceedings.findMany({
        where: { case_id: caseId },
        select: {
          id: true,
          case_id: true,
          proceeding_type: true,
          status: true,
          presiding_judge_id: true,
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.parties.findMany({
        where: { case_id: caseId },
        select: PARTY_SELECT,
        orderBy: { id: 'asc' },
      }),
      // Revocation-filtered, for the same reason `ResourceLoaderService`
      // filters: a lifted designation that still reads as applied produces a
      // false DENIAL, which users report as "I lack the entitlement" rather
      // than as a bug, so it can persist for the life of the record.
      this.prisma.security_designations.findMany({
        where: { object_type: 'case', object_id: caseId, revoked_at: null },
        select: {
          object_type: true,
          object_id: true,
          designation: true,
          applied_by: true,
          applied_at: true,
        },
        orderBy: { applied_at: 'asc' },
      }),
    ]);

    const hearings =
      proceedings.length === 0
        ? []
        : await this.prisma.hearings.findMany({
            where: { proceeding_id: { in: proceedings.map((p) => p.id) } },
            select: {
              id: true,
              proceeding_id: true,
              scheduled_at: true,
              held_at: true,
              hearing_type: true,
            },
            orderBy: { scheduled_at: 'asc' },
          });

    return {
      case: toCaseResponse(caseRow),
      proceedings: proceedings.map(toProceedingResponse),
      hearings: hearings.map(toHearingResponse),
      parties: parties.map(toPartyResponse),
      designations: designations.map(toDesignationResponse),
    };
  }

  /**
   * The cases a principal may see, with out-of-scope and insufficiently-
   * entitled rows **removed before the result set exists**.
   *
   * ## The exclusion is a SQL predicate, not a `.filter()` on the results
   *
   * That distinction is the whole security property. Fetching every case and
   * dropping the sealed ones afterwards gives the right rows and the wrong
   * everything else: the count a paginator reports, the position a row ranks
   * at, and the time the query takes all still carry the excluded record's
   * imprint. `TechArch/04-security.md` §7.6 names those three channels
   * specifically. A `NOT EXISTS` subquery leaves no imprint to read.
   *
   * ## Scope filtering mirrors `abac.rego`'s narrowing semantics
   *
   * Court scope is unconditional (the multi-tenancy boundary). Division and
   * case scopes apply **only** to a principal who actually holds scopes of
   * that type — a court-scoped judge holding no per-case rows legitimately
   * reaches every case in their court, and treating the absence of case scopes
   * as "no cases" would deny them everything. This is the same rule
   * `abac.rego` states under "Narrowing scopes", and the two must not drift:
   * if they do, a case appears in the list and 403s when opened, or vice versa.
   */
  async listCasesForPrincipal(
    principal: Principal,
    filter: CaseFilter,
    context?: { clientIp?: string | null; route?: string },
  ): Promise<CaseResponse[]> {
    const courts = scopeValues(principal, 'court');
    const divisions = scopeValues(principal, 'division');
    const cases = scopeValues(principal, 'case');

    // A role row can also carry court/division affiliation — `abac.rego`
    // honours both sources, so this must too.
    for (const role of principal.roles) {
      if (role.court_id != null) courts.add(role.court_id);
      if (role.division_id != null) divisions.add(role.division_id);
    }

    // No court affiliation at all means no tenant. Returning everything would
    // be the natural "no filter supplied" reading and is exactly backwards.
    if (courts.size === 0) return [];

    const where: Record<string, unknown> = {
      court_id: { in: [...courts] },
    };
    if (divisions.size > 0) where.division_id = { in: [...divisions] };
    if (cases.size > 0) where.id = { in: [...cases] };

    if (filter.court_id !== undefined) {
      // Intersect rather than replace: a caller-supplied filter narrows what
      // they may see, it never widens it.
      if (!courts.has(filter.court_id)) return [];
      where.court_id = filter.court_id;
    }
    if (filter.division_id !== undefined) {
      if (divisions.size > 0 && !divisions.has(filter.division_id)) return [];
      where.division_id = filter.division_id;
    }
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.case_number !== undefined) where.case_number = filter.case_number;

    // --- the designation pre-filter ---------------------------------------
    //
    // Prisma has no relation from `cases` to `security_designations` (the
    // table is polymorphic over `object_type`), so the exclusion is expressed
    // as a raw `NOT EXISTS` and the rest of the predicate is assembled
    // alongside it. Writing the whole query raw is what keeps the exclusion
    // inside the single statement that produces the rows — which is the
    // property §7.6 actually asks for. A Prisma `findMany` followed by a
    // second pass would be the post-hoc redaction it forbids.
    const withheld = await this.withheldDesignations(principal, [...courts]);

    const rows = await this.queryCases(where, withheld);

    // `TechArch/04-security.md` §7.6: the attempt is invisible to the
    // requester and must be visible later to an authorized auditor. Recorded
    // only when the filter ACTUALLY removed something — an unconditional
    // event on every list call would bury the informative ones under noise and
    // would itself be a weak signal that a sealed record exists in the court.
    if (withheld.length > 0) {
      await this.auditExclusion(principal, [...courts], withheld, where, context);
    }

    return rows.map(toCaseResponse);
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /**
   * Designations the principal does NOT hold the entitlement for.
   *
   * Resolved through the court's published `security_policies` when it has
   * any — the same rows, read through the same service, that the guard hands
   * the PDP — and through the built-in defaults otherwise. The "replace, do
   * not merge" semantics are deliberate and match `designation.rego`: a
   * designation absent from a supplied policy set maps to no entitlement,
   * nobody can hold it, and the record is withheld. Configuration that forgets
   * a designation hides records; it never exposes them.
   *
   * With several courts in scope the union of every court's withheld set is
   * used. That over-withholds in the rare case where two courts map the same
   * designation differently, which is the safe direction.
   */
  private async withheldDesignations(
    principal: Principal,
    courtIds: string[],
  ): Promise<string[]> {
    const held = new Set(principal.entitlements);
    const withheld = new Set<string>();

    for (const courtId of courtIds) {
      const config = await this.resources.effectiveSecurityConfig(courtId);
      const map: Record<string, string> =
        config.policies.length > 0
          ? Object.fromEntries(
              config.policies.map((row) => [
                row.designation,
                row.required_entitlement,
              ]),
            )
          : { ...DEFAULT_DESIGNATION_ENTITLEMENT };

      for (const designation of DESIGNATIONS) {
        const required = map[designation];
        if (required === undefined || !held.has(required)) {
          withheld.add(designation);
        }
      }
    }

    return [...withheld].sort();
  }

  /**
   * The list query, with the designation exclusion as a `NOT EXISTS`.
   *
   * Hand-written SQL rather than a Prisma `findMany`, because the exclusion
   * has to be part of the same statement that selects the rows (see
   * {@link listCasesForPrincipal}). The predicate is parameterised throughout
   * — every value below arrives as `$n`, never interpolated — so a
   * caller-supplied `case_number` cannot reach the parser as syntax.
   */
  private async queryCases(
    where: Record<string, unknown>,
    withheld: string[],
  ): Promise<
    Array<{
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
    }>
  > {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const courtFilter = where.court_id as { in?: string[] } | string;
    if (typeof courtFilter === 'string') {
      clauses.push(`c.court_id = ${bind(courtFilter)}::uuid`);
    } else if (courtFilter?.in !== undefined) {
      clauses.push(`c.court_id = ANY(${bind(courtFilter.in)}::uuid[])`);
    }

    const divisionFilter = where.division_id as { in?: string[] } | string | undefined;
    if (typeof divisionFilter === 'string') {
      clauses.push(`c.division_id = ${bind(divisionFilter)}::uuid`);
    } else if (divisionFilter?.in !== undefined) {
      clauses.push(`c.division_id = ANY(${bind(divisionFilter.in)}::uuid[])`);
    }

    const idFilter = where.id as { in?: string[] } | undefined;
    if (idFilter?.in !== undefined) {
      clauses.push(`c.id = ANY(${bind(idFilter.in)}::uuid[])`);
    }

    if (typeof where.status === 'string') {
      clauses.push(`c.status = ${bind(where.status)}`);
    }
    if (typeof where.case_number === 'string') {
      clauses.push(`c.case_number = ${bind(where.case_number)}`);
    }

    if (withheld.length > 0) {
      // The exclusion. `revoked_at IS NULL` is the same predicate
      // `ResourceLoaderService.activeDesignationsFor` applies and the same one
      // `idx_security_designations_active` indexes — a lifted seal must stop
      // withholding the record.
      clauses.push(
        `NOT EXISTS (
           SELECT 1 FROM platform.security_designations sd
            WHERE sd.object_type = 'case'
              AND sd.object_id = c.id
              AND sd.revoked_at IS NULL
              AND sd.designation = ANY(${bind(withheld)}::text[])
         )`,
      );
    }

    const sql = `
      SELECT c.id, c.court_id, c.division_id, c.case_number, c.case_caption,
             c.case_type, c.source_system, c.source_identifier,
             c.locally_modified, c.created_at, c.status
        FROM platform.cases c
       WHERE ${clauses.length > 0 ? clauses.join(' AND ') : 'TRUE'}
       ORDER BY c.created_at DESC, c.id ASC
    `;

    return this.prisma.$queryRawUnsafe(sql, ...params);
  }

  /**
   * Record that the filter withheld rows.
   *
   * Counted with a second query rather than inferred from the difference
   * between a filtered and an unfiltered fetch — the point of the pre-filter
   * is that the unfiltered set is never materialised, and reconstructing it to
   * produce a nicer audit number would undo that.
   *
   * Failure is swallowed, as in `AbacGuard.auditDenial` and for the same
   * reason: the caller asked for a list and is entitled to the rows they may
   * see. Turning a successful read into a 500 because an audit insert
   * deadlocked would hand them a different signal for a reason unrelated to
   * their access — and on this path it would signal that something was
   * withheld, which is precisely what must not be observable.
   */
  private async auditExclusion(
    principal: Principal,
    courtIds: string[],
    withheld: string[],
    where: Record<string, unknown>,
    context?: { clientIp?: string | null; route?: string },
  ): Promise<void> {
    try {
      const excluded = await this.countExcluded(where, withheld);
      if (excluded === 0) return;

      await recordStandaloneAudit(this.prisma, this.audit, {
        actor_id: principal.user_id,
        action_type: 'access_attempt',
        object_type: 'cases',
        // A collection has no single object. The nil UUID is the marker
        // `AbacGuard` already uses for the same situation, so the two agree.
        object_id: '00000000-0000-0000-0000-000000000000',
        after_state: {
          outcome: 'filtered',
          // Integer by construction — `canonical-payload.ts` rejects a
          // fractional number, and a count cannot be one.
          excluded_count: excluded,
          withheld_designations: withheld,
          court_ids: courtIds,
          route: context?.route ?? '/api/v1/cases',
          method: 'GET',
        },
        client_ip: context?.clientIp ?? null,
        session_id: principal.session_id,
      });
    } catch (error) {
      this.logger.error(
        `INTEGRITY GAP: failed to record the access_attempt event for a ` +
          `designation-filtered case list (user=${principal.user_id}). The ` +
          `list itself was returned correctly, but the exclusion is NOT in ` +
          `the audit trail. Cause: ${
            error instanceof Error ? error.message : String(error)
          }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** How many in-scope cases the designation filter removed. */
  private async countExcluded(
    where: Record<string, unknown>,
    withheld: string[],
  ): Promise<number> {
    const courtFilter = where.court_id as { in?: string[] } | string;
    const courtIds =
      typeof courtFilter === 'string' ? [courtFilter] : (courtFilter?.in ?? []);

    const rows = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count
         FROM platform.cases c
        WHERE c.court_id = ANY($1::uuid[])
          AND EXISTS (
                SELECT 1 FROM platform.security_designations sd
                 WHERE sd.object_type = 'case'
                   AND sd.object_id = c.id
                   AND sd.revoked_at IS NULL
                   AND sd.designation = ANY($2::text[])
              )`,
      courtIds,
      withheld,
    );

    return Number(rows[0]?.count ?? 0);
  }
}

// ---------------------------------------------------------------------------
// Row → response mappers shared with the child-resource services
// ---------------------------------------------------------------------------

export function toProceedingResponse(row: {
  id: string;
  case_id: string;
  proceeding_type: string;
  status: string;
  presiding_judge_id: string | null;
}): ProceedingResponse {
  return {
    id: row.id,
    case_id: row.case_id,
    proceeding_type: row.proceeding_type,
    status: row.status as ProceedingResponse['status'],
    ...(row.presiding_judge_id === null
      ? {}
      : { presiding_judge_id: row.presiding_judge_id }),
  };
}

export function toHearingResponse(row: {
  id: string;
  proceeding_id: string;
  scheduled_at: Date;
  held_at: Date | null;
  hearing_type: string;
}): HearingResponse {
  return {
    id: row.id,
    proceeding_id: row.proceeding_id,
    scheduled_at: row.scheduled_at.toISOString(),
    ...(row.held_at === null ? {} : { held_at: row.held_at.toISOString() }),
    hearing_type: row.hearing_type,
  };
}

export function toDesignationResponse(row: {
  object_type: string;
  object_id: string;
  designation: string;
  applied_by: string;
  applied_at: Date;
}): SecurityDesignationResponse {
  return {
    object_type: row.object_type as SecurityDesignationResponse['object_type'],
    object_id: row.object_id,
    designation: row.designation as Designation,
    applied_by: row.applied_by,
    applied_at: row.applied_at.toISOString(),
  };
}

function scopeValues(
  principal: Principal,
  scopeType: 'court' | 'division' | 'case',
): Set<string> {
  const values = new Set<string>();
  for (const scope of principal.scopes) {
    if (scope.scope_type === scopeType && scope.scope_value != null) {
      values.add(scope.scope_value);
    }
  }
  return values;
}
