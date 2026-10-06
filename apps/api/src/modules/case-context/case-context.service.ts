import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { Principal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { recordStandaloneAudit } from '../audit/with-audit';
import { CaseResponse, ListCasesQuery } from './dto/case.dto';

/**
 * The five designation values and the entitlement each requires by default.
 *
 * This mirrors the seeded `security_policies` and the Rego defaults. It is used
 * ONLY for the list pre-filter's exclusion set — the authoritative per-record
 * decision is still the PDP's (via `AbacGuard`) on single reads. A court can
 * reconfigure the mapping through `security_policies`, but the list exclusion
 * errs toward *more* exclusion: if a court remapped a designation to an
 * entitlement the principal lacks, the default here still excludes it, so a
 * sealed record is never leaked into a collection by a stale mapping.
 */
const DESIGNATION_ENTITLEMENT: Readonly<Record<string, string>> = {
  sealed: 'designation_sealed',
  restricted: 'designation_restricted',
  grand_jury: 'designation_grand_jury',
  juvenile: 'designation_juvenile',
  pii: 'designation_pii',
};

/** A case plus its full context, as the shared read surface returns it. */
export interface CaseContext {
  case: CaseResponse;
  proceedings: ProceedingContext[];
  hearings: HearingContext[];
  parties: PartyContext[];
  designations: string[];
}

export interface ProceedingContext {
  id: string;
  case_id: string;
  proceeding_type: string;
  status: string;
  presiding_judge_id: string | null;
}

export interface HearingContext {
  id: string;
  proceeding_id: string;
  scheduled_at: string;
  held_at: string | null;
  hearing_type: string;
}

export interface PartyContext {
  id: string;
  case_id: string;
  party_name: string;
  party_role: string;
  external_id: string | null;
  status: string;
}

/**
 * ============================================================================
 * THE SINGLE SHARED CASE-CONTEXT READ SURFACE
 * ============================================================================
 *
 * `FRD/F01` Process step 8: "Both domain modules read case/proceeding/party/
 * docket-event context exclusively through the shared case-context API — no
 * module maintains a shadow copy of this data."
 *
 * This service is the structural answer to Phase 1 success criterion 2 —
 * "there is no duplicate, module-specific case representation for Evidentiary
 * vs. Speedy Trial to later diverge from." Phases 5–8 read case context through
 * {@link getCaseContext} and {@link listCasesForPrincipal} and nowhere else;
 * Phase 3's CM/ECF adapter writes through the same `cases` rows these read.
 *
 * ## Why list filtering lives here and single-read authorization does not
 *
 * A single read is one PDP decision — `AbacGuard` makes it. A LIST cannot be a
 * single decision: it is a collection, and the authorization question is "which
 * of these may the caller see?" That is a pre-filter on the query, built from
 * the principal's scopes and designation entitlements. The guard still
 * authorizes the *route* (`case:read` entitlement + court scope); this filters
 * the *collection* underneath it.
 *
 * ## The exclusion is a pre-filter, never a post-hoc redaction
 *
 * `TechArch/04-security.md` §7.6 and `UX-Mockup/Y0-patterns.md`
 * ("Non-Disclosure of Sealed/Restricted Existence") are explicit: an excluded
 * case is "omitted entirely — never shown as a greyed-out row, a 'restricted'
 * placeholder, or a count that includes it," so that "result counts, ranking
 * positions, and response timing cannot be used to infer the existence of a
 * sealed matter." The exclusion is therefore a SQL predicate that keeps the row
 * out of the result set and out of the count, not a filter applied after
 * fetching.
 */
@Injectable()
export class CaseContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * One case with its proceedings, hearings, parties and active designations.
   *
   * Returns `null` when the case does not exist. Authorization of the read is
   * the guard's job; this assembles the context once access is granted.
   */
  async getCaseContext(caseId: string): Promise<CaseContext | null> {
    const row = await this.prisma.cases.findUnique({ where: { id: caseId } });
    if (row === null) return null;

    const [proceedings, parties, designationRows] = await Promise.all([
      this.prisma.proceedings.findMany({ where: { case_id: caseId } }),
      this.prisma.parties.findMany({ where: { case_id: caseId } }),
      this.prisma.security_designations.findMany({
        where: { object_type: 'case', object_id: caseId, revoked_at: null },
        select: { designation: true },
      }),
    ]);

    const hearings = await this.prisma.hearings.findMany({
      where: { proceeding_id: { in: proceedings.map((p) => p.id) } },
    });

    return {
      case: {
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
      },
      proceedings: proceedings.map((p) => ({
        id: p.id,
        case_id: p.case_id,
        proceeding_type: p.proceeding_type,
        status: p.status,
        presiding_judge_id: p.presiding_judge_id,
      })),
      hearings: hearings.map((h) => ({
        id: h.id,
        proceeding_id: h.proceeding_id,
        scheduled_at: h.scheduled_at.toISOString(),
        held_at: h.held_at === null ? null : h.held_at.toISOString(),
        hearing_type: h.hearing_type,
      })),
      parties: parties.map((p) => ({
        id: p.id,
        case_id: p.case_id,
        party_name: p.party_name,
        party_role: p.party_role,
        external_id: p.external_id,
        status: p.status,
      })),
      designations: [
        ...new Set(designationRows.map((d) => d.designation)),
      ].sort(),
    };
  }

  /**
   * The cases a principal may see, as a pre-filtered, pre-excluded collection.
   *
   * Three layers, all in one query so nothing excluded ever enters the result:
   *
   *  1. **Court scope** — the multi-tenancy boundary, always applied. The
   *     principal sees only cases in courts they hold a court scope for.
   *  2. **Case scope narrowing** — if the principal holds any `case` scope
   *     rows, they are confined to exactly those cases (plan 01-02's narrowing
   *     semantics: a case-scope row is a whitelist, not an addition). A
   *     principal with only court scopes sees the whole court.
   *  3. **Designation exclusion** — a case carrying an active designation the
   *     principal lacks the entitlement for is removed from the set entirely,
   *     by a `NOT EXISTS` subquery that keeps it out of both rows and count.
   *
   * When the exclusion actually removes rows, an `access_attempt` audit event
   * records how many — the attempt is invisible to the requester (they never
   * learn a sealed matter was omitted) but visible later to an authorized
   * auditor.
   */
  async listCasesForPrincipal(
    principal: Principal,
    filter: ListCasesQuery,
  ): Promise<CaseResponse[]> {
    const courtScopes = principal.scopes
      .filter((s) => s.scope_type === 'court' && s.scope_value)
      .map((s) => s.scope_value as string);
    const caseScopes = principal.scopes
      .filter((s) => s.scope_type === 'case' && s.scope_value)
      .map((s) => s.scope_value as string);

    // A principal with no court scope at all sees nothing. Court scope is the
    // multi-tenancy boundary; its absence is not "all courts", it is "no
    // court" (plan 01-02: the court check is unconditional).
    if (courtScopes.length === 0) {
      return [];
    }

    // Designations the principal MAY see — anything not here is excluded.
    const allowedDesignations = Object.entries(DESIGNATION_ENTITLEMENT)
      .filter(([, ent]) => principal.entitlements.includes(ent))
      .map(([designation]) => designation);

    const conditions: Prisma.Sql[] = [
      Prisma.sql`c.court_id IN (${Prisma.join(courtScopes.map((id) => Prisma.sql`${id}::uuid`))})`,
    ];

    // Case-scope narrowing. Only when the principal holds case scopes at all.
    if (caseScopes.length > 0) {
      conditions.push(
        Prisma.sql`c.id IN (${Prisma.join(caseScopes.map((id) => Prisma.sql`${id}::uuid`))})`,
      );
    }

    // Optional client filters.
    if (filter.court_id) {
      conditions.push(Prisma.sql`c.court_id = ${filter.court_id}::uuid`);
    }
    if (filter.division_id) {
      conditions.push(Prisma.sql`c.division_id = ${filter.division_id}::uuid`);
    }
    if (filter.case_type) {
      conditions.push(Prisma.sql`c.case_type = ${filter.case_type}`);
    }
    if (filter.status) {
      conditions.push(Prisma.sql`c.status = ${filter.status}`);
    }

    // Designation exclusion as a NOT EXISTS pre-filter. A case is excluded if
    // it carries ANY active designation the principal is not entitled to see.
    // The `allowedDesignations` set is the escape hatch: a designation the
    // principal CAN see does not trigger exclusion.
    const allowedClause =
      allowedDesignations.length > 0
        ? Prisma.sql`AND sd.designation NOT IN (${Prisma.join(
            allowedDesignations.map((d) => Prisma.sql`${d}`),
          )})`
        : Prisma.empty;

    conditions.push(
      Prisma.sql`NOT EXISTS (
        SELECT 1 FROM platform.security_designations sd
         WHERE sd.object_type = 'case'
           AND sd.object_id = c.id
           AND sd.revoked_at IS NULL
           ${allowedClause}
      )`,
    );

    const where = Prisma.join(conditions, ' AND ');

    const rows = await this.prisma.$queryRaw<
      Array<{
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
      }>
    >(Prisma.sql`
      SELECT c.id, c.court_id, c.division_id, c.case_number, c.case_caption,
             c.case_type, c.source_system, c.source_identifier, c.status,
             c.created_at
        FROM platform.cases c
       WHERE ${where}
       ORDER BY c.created_at DESC, c.id
    `);

    // Did the designation exclusion actually remove anything? Count the cases
    // the scope filters admit WITHOUT the exclusion, and compare. A positive
    // delta is an invisible-to-requester omission worth auditing.
    await this.auditExclusionIfAny(principal, courtScopes, caseScopes, filter, rows.length);

    return rows.map((row) => ({
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
    }));
  }

  /**
   * Record an `access_attempt` when the designation pre-filter excluded rows.
   *
   * Counts the scope-admitted cases without the designation exclusion and
   * compares to the returned count. A positive difference is the number of
   * sealed/restricted matters omitted from this caller's view — invisible to
   * them, but a record an authorized auditor can later see. The write is
   * best-effort: a failure here must never change the (successful) list
   * response, so it is logged and swallowed, exactly as the guard's denial
   * audit is.
   */
  private async auditExclusionIfAny(
    principal: Principal,
    courtScopes: string[],
    caseScopes: string[],
    filter: ListCasesQuery,
    returnedCount: number,
  ): Promise<void> {
    try {
      const conditions: Prisma.Sql[] = [
        Prisma.sql`c.court_id IN (${Prisma.join(courtScopes.map((id) => Prisma.sql`${id}::uuid`))})`,
      ];
      if (caseScopes.length > 0) {
        conditions.push(
          Prisma.sql`c.id IN (${Prisma.join(caseScopes.map((id) => Prisma.sql`${id}::uuid`))})`,
        );
      }
      if (filter.court_id) conditions.push(Prisma.sql`c.court_id = ${filter.court_id}::uuid`);
      if (filter.division_id) conditions.push(Prisma.sql`c.division_id = ${filter.division_id}::uuid`);
      if (filter.case_type) conditions.push(Prisma.sql`c.case_type = ${filter.case_type}`);
      if (filter.status) conditions.push(Prisma.sql`c.status = ${filter.status}`);

      const where = Prisma.join(conditions, ' AND ');
      const totalRows = await this.prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS n FROM platform.cases c WHERE ${where}
      `);
      const scopeAdmitted = Number(totalRows[0]?.n ?? 0);
      const excluded = scopeAdmitted - returnedCount;

      if (excluded > 0) {
        await recordStandaloneAudit(this.prisma, this.audit, {
          actor_id: principal.user_id,
          action_type: 'access_attempt',
          object_type: 'case',
          // No single object — the event is about a filtered collection.
          object_id: '00000000-0000-0000-0000-000000000000',
          after_state: {
            outcome: 'filtered',
            excluded_count: excluded,
            returned_count: returnedCount,
            reason_code: 'AUTH_DESIGNATION_DENIED',
            route: '/api/v1/cases',
            method: 'GET',
          },
          session_id: principal.session_id,
        });
      }
    } catch {
      // Best-effort: a successful list must not be turned into a 500 because
      // the exclusion-audit write failed. The list is the response; this is a
      // record of what it omitted. (Same posture as AbacGuard.auditDenial.)
    }
  }
}
