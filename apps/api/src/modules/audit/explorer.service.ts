import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Principal } from '../../common/principal/principal.types';
import { ResourceLoaderService } from '../policy/resource-loader.service';
import { AuditEvent } from './audit.types';
import { recordStandaloneAudit } from './with-audit';
import { AuditService } from './audit.service';
import {
  AuditExplorerEvent,
  AuditExplorerQuery,
  AuditExplorerResponse,
  BeforeAfterChange,
  BeforeAfterSummary,
  decodeCursor,
  encodeCursor,
} from './dto/explorer.dto';

/**
 * The built-in designation → entitlement map, the Phase 1 defaults.
 *
 * Kept byte-identical to `designation.rego`'s `default_designation_entitlement`
 * and `policy/README.md`'s table. The Explorer must make the SAME exclusion the
 * PDP would make on a per-record read — otherwise the Explorer becomes a side
 * channel reporting a sealed case's history to someone the per-record gate
 * would refuse. A court's `security_policies` rows OVERRIDE this wholesale (not
 * merge), exactly as the Rego does, so a configured mapping genuinely changes
 * what the Explorer hides.
 */
const DEFAULT_DESIGNATION_ENTITLEMENT: Readonly<Record<string, string>> = {
  sealed: 'designation_sealed',
  restricted: 'designation_restricted',
  grand_jury: 'designation_grand_jury',
  juvenile: 'designation_juvenile',
  pii: 'designation_pii',
};

/** The nil UUID the guard uses for an `access_attempt` with no real object. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Cap on how many changed fields the Before→After column carries per row. */
const MAX_DIFF_FIELDS = 12;

/** The raw shape returned by the keyset query. */
interface AuditRow {
  id: string;
  actor_id: string;
  action_type: string;
  object_type: string;
  object_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  rule_version_ref: string | null;
  calculation_version_ref: string | null;
  client_ip: string | null;
  session_id: string | null;
  occurred_at: Date;
  prev_hash: string;
  row_hash: string;
  rule_version_label: number | null;
}

/**
 * ============================================================================
 * THE AUDIT EXPLORER QUERY — ACCESS-SCOPED, DESIGNATION PRE-FILTERED
 * ============================================================================
 *
 * `FRD/F02` · `TechArch/03a-api-shared.md` §6.3 · `Screen-17`.
 *
 * This service answers `GET /audit/explorer`. Two access controls shape every
 * query it runs, and they are deliberately in different places:
 *
 * ## 1. Separation of duties lives in the PDP, not here
 *
 * The route carries `@Resource({type:'audit_event', action:'read'})`, which
 * plan 01-02's map binds to `audit_reader`. A caller without that entitlement
 * never reaches this service — `AbacGuard` has already denied them 403
 * `AUDIT_READ_DENIED`. There is deliberately **no** second entitlement check
 * here: one enforcement point, and it is the PDP (`TechArch/04-security.md`
 * §7.2, "enforced in policy, not scattered across handler code"). A duplicate
 * `if principal.entitlements.includes('audit_reader')` would be a second,
 * silently-divergeable policy.
 *
 * `US-2.3` — "a clerk with broad edit rights must not thereby read the audit
 * trail" — is satisfied by the seed's grant distribution (`security_officer`
 * holds `audit_reader` without `case_read`; `clerk_case_admin` holds edit
 * entitlements without `audit_reader`) plus the named test in
 * `audit-explorer.e2e-spec.ts`.
 *
 * ## 2. Designation scoping IS here, because it is per-row, not per-route
 *
 * `FRD/F02` Validation: "Sealed/restricted-case audit entries are themselves
 * access-restricted — viewing them requires the same security-designation
 * entitlement as viewing the underlying record." The PDP decides a SINGLE
 * resource; the Explorer returns a filtered collection, so the per-row
 * exclusion is the query's own job.
 *
 * It is a **SQL pre-filter**, applied before pagination and ranking, not a
 * post-filter over a fetched page. `TechArch/04-security.md` §7.6 requires the
 * exclusion be pre-ranking so counts and timing cannot leak existence, and a
 * post-filter would also break keyset pagination in a privilege-dependent way
 * (a page of 50 fetched rows could yield 3 visible ones, with no correct
 * cursor to continue from).
 *
 * ## 3. The denied attempt is itself logged, and appears as a row
 *
 * When a caller filters by a `case_id` they cannot fully see, the attempt is
 * written as an `access_attempt` audit event (`FRD/F02` Validation: "the
 * *attempt* to view a sealed audit entry without entitlement is itself logged
 * as an audit event"). And because `access_attempt` rows are first-class
 * results (`Screen-17`: "Row shown with 'denied' Tag, **not omitted**"), they
 * are NOT excluded from the default view — they are the record of "tried and
 * was told no", which is distinct from "no such record".
 */
@Injectable()
export class AuditExplorerService {
  private readonly logger = new Logger(AuditExplorerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resources: ResourceLoaderService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Run one Explorer query for `principal`.
   *
   * @throws ApiException 422 on a malformed cursor; 403 `AUDIT_DESIGNATION_DENIED`
   *   when the caller explicitly filtered by a sealed `case_id` to which they
   *   hold case-level access but lack the designation entitlement.
   */
  async query(
    principal: Principal,
    filter: AuditExplorerQuery,
    context: { clientIp: string | null } = { clientIp: null },
  ): Promise<AuditExplorerResponse> {
    const cursor = this.parseCursor(filter.cursor);

    // When the caller NAMES a specific case, resolve the 403-vs-404 question
    // for that case up front — before running the collection query — because
    // the two outcomes are completely different responses (`FRD/Y2-errors.md`
    // principle 3, mirrored from designation.rego and the AbacGuard).
    if (filter.case_id !== undefined) {
      await this.enforceNamedCaseAccess(principal, filter.case_id, context);
    }

    // The set of designation entitlements the principal does NOT hold, resolved
    // against this request's effective configuration. The SQL pre-filter below
    // excludes any audit row whose underlying case/object carries one of these.
    const forbidden = await this.forbiddenDesignations(principal);

    const rows = await this.fetchPage(principal, filter, cursor, forbidden);

    // One extra row was requested so we can tell whether a further page exists
    // without a second COUNT query.
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;

    const events = page.map((row) => this.toExplorerEvent(row));

    const response: AuditExplorerResponse = { audit_events: events };
    if (hasMore) {
      const last = page[page.length - 1];
      response.next_cursor = encodeCursor({
        occurred_at: last.occurred_at.toISOString(),
        id: last.id,
      });
    }
    return response;
  }

  /**
   * Resolve a caller's access to a specifically-named case, and decide the
   * 403-vs-404 branch from `FRD/Y2-errors.md` principle 3.
   *
   * - **Parent access held, designation entitlement missing** → the caller can
   *   already see the case exists, so hiding its existence would leak nothing
   *   and help no one: return **403 `AUDIT_DESIGNATION_DENIED`**. The attempt
   *   is logged.
   * - **No access path to the case at all (blind discovery)** → returning 403
   *   would confirm a sealed matter exists to someone with no right to know it
   *   does. So this method returns normally and the collection query yields an
   *   empty, indistinguishable result. The attempt is still logged.
   */
  private async enforceNamedCaseAccess(
    principal: Principal,
    caseId: string,
    context: { clientIp: string | null },
  ): Promise<void> {
    const caseRow = await this.prisma.cases.findUnique({
      where: { id: caseId },
      select: { id: true, court_id: true },
    });

    // A nonexistent case id is byte-identical, by construction, to a sealed
    // case the caller may not discover: both fall through to the empty-result
    // path below. Nothing here distinguishes them.
    if (caseRow === null) {
      await this.logAccessAttempt(principal, caseId, context, 'case_not_found');
      return;
    }

    const designations = await this.caseDesignations(caseId);
    const forbidden = await this.forbiddenDesignations(principal);
    const blockingDesignation = designations.find((d) => forbidden.has(d));

    // The case carries no designation the caller lacks — ordinary access,
    // nothing to enforce here. (Whether the caller may see the case at all is
    // the PDP's business for the per-record route; the Explorer's own gate is
    // only `audit_reader` plus this designation pre-filter.)
    if (blockingDesignation === undefined) {
      return;
    }

    // The case IS designated beyond the caller's entitlements. Which branch?
    const hasParentAccess = this.hasCaseLevelAccess(
      principal,
      caseRow.court_id,
      caseId,
    );

    await this.logAccessAttempt(principal, caseId, context, 'designation_denied', {
      designation: blockingDesignation,
      parent_access: hasParentAccess,
    });

    if (hasParentAccess) {
      // Existence already known to them → 403 is more actionable and leaks
      // nothing. `FRD/Y2-errors.md` principle 3, parent-access branch.
      throw new ApiException(
        403,
        'AUDIT_DESIGNATION_DENIED',
        "This case's audit history requires additional authorization",
      );
    }

    // Blind discovery → fall through to an empty result set indistinguishable
    // from "no matching events". No throw.
  }

  /**
   * Does the principal hold general, legitimate access to the parent case —
   * `case_read` plus a scope that reaches this case (court-wide, or this case
   * specifically)?
   *
   * This is the "already has an access path that confirms the object exists"
   * test from `FRD/Y2-errors.md` principle 3. It deliberately mirrors the
   * narrowing scope semantics plan 01-02 established: a principal holding a
   * `case` scope row is confined to exactly the cases named, while one holding
   * only a `court` scope reaches every case in that court.
   */
  private hasCaseLevelAccess(
    principal: Principal,
    courtId: string,
    caseId: string,
  ): boolean {
    if (!principal.entitlements.includes('case_read')) return false;

    const caseScopes = principal.scopes.filter((s) => s.scope_type === 'case');
    if (caseScopes.length > 0) {
      // Narrowed to specific cases: access only if this case is named.
      return caseScopes.some((s) => s.scope_value === caseId);
    }

    // No case-level narrowing: a court scope covering this case suffices.
    return principal.scopes.some(
      (s) => s.scope_type === 'court' && s.scope_value === courtId,
    );
  }

  // =========================================================================
  // Designation resolution
  // =========================================================================

  /**
   * The designations whose entitlement the principal does NOT hold, under the
   * effective designation→entitlement map.
   *
   * The map defaults to the five Phase 1 mappings and is REPLACED wholesale by
   * any `security_policies` rows (not merged) — identical semantics to
   * `designation.rego`. A designation absent from a supplied set maps to
   * nothing, so no entitlement can satisfy it, so it is forbidden: the same
   * fail-closed consequence the Rego documents.
   *
   * Resolved from the principal's own court scope. A principal scoped to
   * multiple courts gets the union of each court's forbidden set, which is the
   * safe direction: a designation forbidden in any of their courts is hidden.
   */
  private async forbiddenDesignations(
    principal: Principal,
  ): Promise<Set<string>> {
    const map = await this.effectiveDesignationMap(principal);
    const forbidden = new Set<string>();
    for (const [designation, entitlement] of Object.entries(map)) {
      if (!principal.entitlements.includes(entitlement)) {
        forbidden.add(designation);
      }
    }
    // Designations present in the schema's CHECK but absent from the effective
    // map are forbidden outright (nothing can satisfy them), mirroring the
    // Rego's fail-closed branch.
    for (const designation of Object.keys(DEFAULT_DESIGNATION_ENTITLEMENT)) {
      if (!(designation in map)) forbidden.add(designation);
    }
    return forbidden;
  }

  /**
   * The effective designation→entitlement map for this principal's court(s).
   *
   * Reuses {@link ResourceLoaderService.effectiveSecurityConfig}, the same read
   * the guard uses, so the Explorer and the per-record gate cannot drift on
   * which policy is in effect.
   */
  private async effectiveDesignationMap(
    principal: Principal,
  ): Promise<Record<string, string>> {
    const courtIds = new Set<string>();
    for (const scope of principal.scopes) {
      if (scope.scope_type === 'court' && scope.scope_value !== undefined) {
        courtIds.add(scope.scope_value);
      }
    }
    for (const role of principal.roles) {
      if (role.court_id !== undefined) courtIds.add(role.court_id);
    }

    if (courtIds.size === 0) {
      return { ...DEFAULT_DESIGNATION_ENTITLEMENT };
    }

    // Merge each court's configured policies. In the overwhelmingly common
    // single-court case this is one lookup; a multi-court principal's effective
    // map is the union, with a configured override winning over the default.
    let anyConfigured = false;
    const merged: Record<string, string> = {};
    for (const courtId of courtIds) {
      const config = await this.resources.effectiveSecurityConfig(courtId);
      if (config.policies.length > 0) {
        anyConfigured = true;
        for (const policy of config.policies) {
          merged[policy.designation] = policy.required_entitlement;
        }
      }
    }

    return anyConfigured ? merged : { ...DEFAULT_DESIGNATION_ENTITLEMENT };
  }

  /** Active designations on a case (revocation-filtered). */
  private async caseDesignations(caseId: string): Promise<string[]> {
    const rows = await this.prisma.security_designations.findMany({
      where: { object_type: 'case', object_id: caseId, revoked_at: null },
      select: { designation: true },
    });
    return [...new Set(rows.map((r) => r.designation))];
  }

  // =========================================================================
  // The keyset query
  // =========================================================================

  /**
   * Fetch one page of audit events, newest first, with the designation
   * pre-filter applied in SQL.
   *
   * ## The pre-filter, in words
   *
   * An audit row is EXCLUDED when its underlying case (resolved through
   * `object_type`/`object_id` → the case graph) carries an active designation
   * in `forbidden`. The exclusion is expressed as a `NOT EXISTS` against
   * `security_designations`, so PostgreSQL applies it before `ORDER BY` and
   * `LIMIT` — the pre-ranking property §7.6 requires. The subquery resolves the
   * audit row's object to a case id by the same rules the resource loader uses:
   * a `cases`/`case` row is its own case; a child object (`document_references`,
   * `proceedings`, …) inherits its owning case's designations, and a
   * `document_reference` additionally carries its own.
   *
   * ## Why raw SQL
   *
   * The pre-filter is a correlated `NOT EXISTS` over a UNION of designation
   * sources with a parameterised forbidden-set — not expressible through the
   * Prisma query builder without fetching and post-filtering, which is the
   * exact thing §7.6 forbids. Every value is BOUND via Prisma's tagged-template
   * parameterisation; nothing is interpolated.
   */
  private async fetchPage(
    principal: Principal,
    filter: AuditExplorerQuery,
    cursor: { occurred_at: string; id: string } | null,
    forbidden: Set<string>,
  ): Promise<AuditRow[]> {
    const conditions: Prisma.Sql[] = [];

    if (filter.case_id !== undefined) {
      // A case filter restricts to audit rows whose underlying object resolves
      // to that case. Direct case rows, plus children owned by it.
      conditions.push(this.caseFilterSql(filter.case_id));
    }
    if (filter.user_id !== undefined) {
      conditions.push(Prisma.sql`ae.actor_id = ${filter.user_id}::uuid`);
    }
    if (filter.object_type !== undefined) {
      conditions.push(Prisma.sql`ae.object_type = ${filter.object_type}`);
    }
    if (filter.action_type !== undefined) {
      conditions.push(Prisma.sql`ae.action_type = ${filter.action_type}`);
    }
    if (filter.date_from !== undefined) {
      conditions.push(Prisma.sql`ae.occurred_at >= ${filter.date_from}::timestamptz`);
    }
    if (filter.date_to !== undefined) {
      conditions.push(Prisma.sql`ae.occurred_at <= ${filter.date_to}::timestamptz`);
    }

    // Keyset: strictly older than the cursor in (occurred_at, id) order.
    if (cursor !== null) {
      conditions.push(
        Prisma.sql`(ae.occurred_at, ae.id) < (${cursor.occurred_at}::timestamptz, ${cursor.id}::uuid)`,
      );
    }

    // The designation pre-filter. Excludes any row whose underlying case
    // carries a forbidden designation. Empty forbidden set → no exclusion.
    const forbiddenList = [...forbidden];
    if (forbiddenList.length > 0) {
      conditions.push(this.designationExclusionSql(forbiddenList));
    }

    const where =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    // `limit + 1` so we can detect a further page without a COUNT.
    const take = filter.limit + 1;

    return this.prisma.$queryRaw<AuditRow[]>`
      SELECT
        ae.id, ae.actor_id, ae.action_type, ae.object_type, ae.object_id,
        ae.before_state, ae.after_state, ae.rule_version_ref,
        ae.calculation_version_ref, ae.client_ip, ae.session_id,
        ae.occurred_at, ae.prev_hash, ae.row_hash,
        rpv.version_number AS rule_version_label
      FROM platform.audit_events ae
      LEFT JOIN platform.rule_package_versions rpv
        ON rpv.id = ae.rule_version_ref
      ${where}
      ORDER BY ae.occurred_at DESC, ae.id DESC
      LIMIT ${take}
    `;
  }

  /**
   * SQL restricting to audit rows whose underlying object resolves to `caseId`.
   *
   * Covers the direct case row and every child type that hangs off a case, so a
   * `case_id` filter catches a status change on the case AND a ruling on one of
   * its proceedings.
   */
  private caseFilterSql(caseId: string): Prisma.Sql {
    return Prisma.sql`(
      (ae.object_type IN ('case','cases') AND ae.object_id = ${caseId}::uuid)
      OR EXISTS (
        SELECT 1 FROM platform.proceedings p
         WHERE p.case_id = ${caseId}::uuid AND p.id = ae.object_id
      )
      OR EXISTS (
        SELECT 1 FROM platform.parties pa
         WHERE pa.case_id = ${caseId}::uuid AND pa.id = ae.object_id
      )
      OR EXISTS (
        SELECT 1 FROM platform.docket_events de
         WHERE de.case_id = ${caseId}::uuid AND de.id = ae.object_id
      )
      OR EXISTS (
        SELECT 1 FROM platform.document_references dr
         WHERE dr.case_id = ${caseId}::uuid AND dr.id = ae.object_id
      )
    )`;
  }

  /**
   * The designation exclusion subquery.
   *
   * Excludes an audit row when the case it resolves to carries an active
   * (`revoked_at IS NULL`) designation in the forbidden set, OR when the row's
   * object is itself a `document_reference` carrying its own forbidden
   * designation. Resolution mirrors the resource loader: an audit row's object
   * is mapped to a case id through the child tables, then that case's
   * designations are checked.
   *
   * `access_attempt` rows pointing at the nil UUID (a denial with no real
   * object) resolve to no case and are therefore never excluded — which is
   * correct: a denied attempt is a record about the *attempt*, visible to an
   * authorized auditor regardless of what was attempted.
   */
  private designationExclusionSql(forbidden: string[]): Prisma.Sql {
    const forbiddenArray = Prisma.sql`ARRAY[${Prisma.join(
      forbidden.map((d) => Prisma.sql`${d}`),
    )}]::text[]`;

    return Prisma.sql`NOT EXISTS (
      SELECT 1
        FROM platform.security_designations sd
       WHERE sd.revoked_at IS NULL
         AND sd.designation = ANY(${forbiddenArray})
         AND (
           -- the audit row's object IS the designated case
           (sd.object_type = 'case' AND sd.object_id = ${this.resolvedCaseIdExpr()})
           -- or the audit row's object IS a designated document reference
           OR (sd.object_type = 'document_reference' AND sd.object_id = ae.object_id)
         )
    )`;
  }

  /**
   * SQL expression resolving an audit row's object to its owning case id.
   *
   * A scalar subquery: for a direct case row it is the object id; for a child
   * it is the child's `case_id`; for anything else it is NULL (no case, so the
   * case-designation branch cannot match).
   */
  private resolvedCaseIdExpr(): Prisma.Sql {
    return Prisma.sql`(
      CASE
        WHEN ae.object_type IN ('case','cases') THEN ae.object_id
        ELSE COALESCE(
          (SELECT p.case_id FROM platform.proceedings p WHERE p.id = ae.object_id),
          (SELECT pa.case_id FROM platform.parties pa WHERE pa.id = ae.object_id),
          (SELECT de.case_id FROM platform.docket_events de WHERE de.id = ae.object_id),
          (SELECT dr.case_id FROM platform.document_references dr WHERE dr.id = ae.object_id)
        )
      END
    )`;
  }

  // =========================================================================
  // Row shaping
  // =========================================================================

  private toExplorerEvent(row: AuditRow): AuditExplorerEvent {
    const base: AuditEvent = {
      id: row.id,
      actor_id: row.actor_id,
      action_type: row.action_type as AuditEvent['action_type'],
      object_type: row.object_type,
      object_id: row.object_id,
      before_state: row.before_state,
      after_state: row.after_state,
      rule_version_ref: row.rule_version_ref,
      calculation_version_ref: row.calculation_version_ref,
      client_ip: row.client_ip,
      session_id: row.session_id,
      occurred_at: row.occurred_at.toISOString(),
      prev_hash: row.prev_hash,
      row_hash: row.row_hash,
    };

    return {
      ...base,
      before_after_summary: this.summariseDiff(
        row.before_state,
        row.after_state,
      ),
      rule_version_label:
        row.rule_version_label === null ? null : `v${row.rule_version_label}`,
    };
  }

  /**
   * A compact before/after diff for `Screen-17`'s "Before→After" column.
   *
   * Only the fields that actually changed, capped at {@link MAX_DIFF_FIELDS} so
   * one large state change cannot make a table row enormous. The full
   * `before_state`/`after_state` remain on the event for a detail view.
   */
  private summariseDiff(
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): BeforeAfterSummary | null {
    if (before === null && after === null) return null;

    const keys = new Set<string>([
      ...Object.keys(before ?? {}),
      ...Object.keys(after ?? {}),
    ]);

    const changes: BeforeAfterChange[] = [];
    for (const field of keys) {
      const b = before?.[field];
      const a = after?.[field];
      if (!this.deepEqual(b, a)) {
        changes.push({ field, before: b ?? null, after: a ?? null });
      }
    }

    if (changes.length === 0) return null;

    changes.sort((x, y) => x.field.localeCompare(y.field));
    const truncated = changes.length > MAX_DIFF_FIELDS;
    return {
      changes: truncated ? changes.slice(0, MAX_DIFF_FIELDS) : changes,
      truncated,
    };
  }

  /** Structural equality by JSON serialisation — adequate for audit state. */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private parseCursor(
    raw: string | undefined,
  ): { occurred_at: string; id: string } | null {
    if (raw === undefined) return null;
    const decoded = decodeCursor(raw);
    if (decoded === null) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'The pagination cursor is malformed',
        { fields: ['cursor'] },
      );
    }
    return decoded;
  }

  /**
   * Write the `access_attempt` audit event for a denied/blind Explorer query.
   *
   * Like the guard's denial write, this must never change the response: a
   * failure here is logged as an integrity gap and swallowed. The row records
   * that this user probed this case id and the outcome — which is exactly what
   * an investigation of "who tried to look at the sealed matter" needs, and
   * what `Screen-17` surfaces as a `denied` row to the next authorized auditor.
   */
  private async logAccessAttempt(
    principal: Principal,
    caseId: string,
    context: { clientIp: string | null },
    outcome: 'designation_denied' | 'case_not_found',
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await recordStandaloneAudit(this.prisma, this.audit, {
        actor_id: principal.user_id,
        action_type: 'access_attempt',
        object_type: 'audit_event',
        // The probed case id is NOT the object id — the object of this attempt
        // is "the audit explorer". The case probed goes in after_state so the
        // nil-UUID convention for an attempt with no concrete object holds and
        // the designation pre-filter never excludes the attempt row itself.
        object_id: NIL_UUID,
        after_state: {
          outcome: 'denied',
          surface: 'audit_explorer',
          attempted_case_id: caseId,
          reason: outcome,
          ...extra,
        },
        client_ip: context.clientIp,
        session_id: principal.session_id,
      });
    } catch (error) {
      this.logger.error(
        `INTEGRITY GAP: failed to write the access_attempt audit event for a ` +
          `denied Audit Explorer query by ${principal.user_id} on case ` +
          `${caseId}. The denial itself stands, but this attempt is NOT in the ` +
          `audit trail. Cause: ${
            error instanceof Error ? error.message : String(error)
          }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
