import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Principal } from '../../common/principal/principal.types';
import { PdpClient } from '../policy/pdp.client';
import { PdpInput } from '../policy/pdp.types';
import { ResourceLoaderService } from '../policy/resource-loader.service';
import { AuditService } from './audit.service';
import { AuditActionType } from './audit.types';
import {
  AuditExplorerEvent,
  AuditExplorerQuery,
  AuditExplorerResponse,
} from './dto/explorer.dto';
import { recordStandaloneAudit } from './with-audit';

/**
 * `audit_events.object_id` is NOT NULL, so an `access_attempt` written for a
 * query that named no particular case still needs a value. Same convention as
 * `AbacGuard`.
 */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * The built-in designation → entitlement mapping, used only for a designation
 * no court's `security_policies` rows mention.
 *
 * Byte-identical to `default_designation_entitlement` in
 * `policy/judicialsync/authz/designation.rego`. It is duplicated here, and the
 * duplication is bounded and deliberate — see the class comment's
 * "Why a designation map exists in TypeScript at all".
 */
const DEFAULT_DESIGNATION_ENTITLEMENT: Readonly<Record<string, string>> = {
  sealed: 'designation_sealed',
  restricted: 'designation_restricted',
  grand_jury: 'designation_grand_jury',
  juvenile: 'designation_juvenile',
  pii: 'designation_pii',
};

/** A decoded keyset cursor. */
interface Cursor {
  occurredAt: Date;
  id: string;
}

/** The raw shape the Explorer query returns, before DTO mapping. */
interface ExplorerRow {
  id: string;
  actor_id: string;
  action_type: string;
  object_type: string;
  object_id: string;
  before_state: Prisma.JsonValue | null;
  after_state: Prisma.JsonValue | null;
  rule_version_ref: string | null;
  calculation_version_ref: string | null;
  client_ip: string | null;
  session_id: string | null;
  occurred_at: Date;
  prev_hash: string;
  row_hash: string;
  rule_version_number: number | null;
}

/**
 * ============================================================================
 * THE AUDIT EXPLORER — THE READ HALF OF F02
 * ============================================================================
 *
 * `FRD/F02` Process step 3: an audit entry "is immediately queryable via the
 * Audit Explorer API, **scoped by the requester's access rights to the
 * underlying case/object** (an auditor cannot see sealed-case audit entries
 * without the sealed-record entitlement)."
 *
 * Two separate access controls meet here and they are deliberately not the
 * same control:
 *
 *  1. **Separation of duties** — may this caller read audit history *at all*?
 *     Enforced **solely** by the route's
 *     `@Resource({type:'audit_event', action:'read'})`, which plan 01-02's
 *     `action_entitlement_map` binds to `audit_reader`. There is deliberately
 *     **no second entitlement check in this service**: one enforcement point,
 *     and it is the PDP. A duplicate check here would be a second policy,
 *     free to diverge from the first with no test covering the disagreement.
 *
 *  2. **Designation scoping** — of the history this caller may read, which
 *     rows are withheld because the underlying matter is sealed, restricted,
 *     grand jury, juvenile or PII?
 *
 * ## Why (2) cannot be delegated to the PDP row by row
 *
 * The PDP decides about **one** resource at a time. A page of 50 audit rows
 * spanning 50 cases would be 50 PDP round trips per page, and — far worse —
 * the exclusion would happen *after* the page was fetched. `TechArch/04-security.md`
 * §7.6 requires the access-scope filter be "pre-ranking … not a post-hoc
 * redaction", precisely so that "result counts, ranking positions, and
 * response timing cannot be used to infer the existence of a sealed matter."
 * A post-filter over a fetched page also silently breaks pagination in a
 * privilege-dependent way: `limit=50` would return 43 rows for one caller and
 * 50 for another, and the cursor would skip differently for each.
 *
 * So the exclusion is a **SQL pre-filter** — part of the `WHERE` clause, ahead
 * of `ORDER BY` and `LIMIT`.
 *
 * ## Why a designation map exists in TypeScript at all
 *
 * A SQL pre-filter has to know, inside the database, which designations this
 * caller may see. That is the one piece of policy knowledge this file holds,
 * and it is scoped as narrowly as possible:
 *
 *  - it is read from the **same `security_policies` rows** the PDP is handed
 *    (`FRD/F13`: designation policy is configuration-driven), with the Rego
 *    bundle's built-in defaults used only where configuration is silent;
 *  - it can only ever **remove** rows from a result set, never add one; and
 *  - every *single-resource* decision in this file — the 403-vs-404 branch
 *    below — is still made by the PDP, not here.
 *
 * It fails closed in the same direction the bundle does: a designation with no
 * mapping maps to no entitlement, is therefore not held, and excludes the row.
 *
 * ## The explicit `case_id` filter: 403 or an empty page?
 *
 * `FRD/Y2-errors.md` principle 3 draws the line, and `designation.rego`
 * already encodes it — so this service **asks the PDP** rather than
 * re-deciding:
 *
 *  - the caller already has a legitimate path to know the case exists and
 *    lacks only the designation entitlement → `403 AUDIT_DESIGNATION_DENIED`
 *    ("This case's audit history requires additional authorization");
 *  - the caller has no such path (blind discovery) → an **empty result set**,
 *    byte-identical to the response for a case id that does not exist.
 *
 * A scope denial on that probe is deliberately **not** blocking. The seeded
 * `security_officer` holds `audit_reader` and *not* `case_read` — that pairing
 * is the whole point of `US-2.3` — so evaluating `case`/`read` for them denies
 * `AUTH_SCOPE_DENIED` on every case. Treating that as a refusal would mean an
 * auditor with the audit entitlement and nothing else could never filter by
 * case, which inverts the separation of duties F02 exists to create.
 * `audit_reader` is the authority to read audit history; the designation
 * entitlement is the additional gate `FRD/F02` names on top of it.
 *
 * ## Denied attempts are rows, not omissions
 *
 * `Screen-17` States: a denied access attempt is "shown with 'denied' Tag,
 * **not omitted** … Distinguishes 'tried and was told no' from records that
 * simply don't exist." `access_attempt` events are therefore ordinary results,
 * included by default, and reachable precisely via `action_type`.
 */
@Injectable()
export class AuditExplorerService {
  private readonly logger = new Logger(AuditExplorerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pdp: PdpClient,
    private readonly resources: ResourceLoaderService,
  ) {}

  /**
   * Run one Explorer query.
   *
   * @throws {ApiException} 403 `AUDIT_DESIGNATION_DENIED` when the caller
   *   named a specific case whose designation they lack *and* already has a
   *   legitimate path to know that case exists.
   */
  async query(
    principal: Principal,
    filter: AuditExplorerQuery,
    context: { route: string; method: string; clientIp: string | null },
  ): Promise<AuditExplorerResponse> {
    const held = await this.heldDesignations(principal);

    // --- the explicit case_id branch, decided by the PDP ------------------
    if (filter.case_id !== undefined) {
      const verdict = await this.probeCase(principal, filter.case_id, context);

      if (verdict === 'hidden') {
        // Blind discovery. The response must be indistinguishable from a case
        // id that does not exist, so fall through to the ordinary query with
        // the designation pre-filter in place: a nonexistent id matches no
        // rows, and a sealed id's rows are all excluded. Both produce
        // `{audit_events: []}`. Returning a special-cased empty body here
        // would risk the two diverging.
        await this.auditAttempt(principal, filter, context, {
          outcome: 'denied',
          reason_code: 'RESOURCE_NOT_FOUND',
          hide_existence: true,
        });
      } else if (verdict === 'designation_denied') {
        await this.auditAttempt(principal, filter, context, {
          outcome: 'denied',
          reason_code: 'AUDIT_DESIGNATION_DENIED',
          hide_existence: false,
        });
        throw new ApiException(
          403,
          'AUDIT_DESIGNATION_DENIED',
          "This case's audit history requires additional authorization",
        );
      }
    }

    const cursor = decodeCursor(filter.cursor);

    // One extra row, purely to learn whether a further page exists without a
    // second COUNT query over an append-only table that only grows.
    const rows = await this.select(filter, cursor, held, filter.limit + 1);

    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;

    // --- did the designation pre-filter actually withhold anything? -------
    //
    // `FRD/F02` Validation: "the *attempt* to view a sealed audit entry
    // without entitlement is itself logged as an audit event
    // (access_attempt)." The unfiltered case needs this as much as the
    // explicit one — an auditor sweeping a date range across a sealed matter
    // is making exactly that attempt.
    //
    // One event per QUERY, not per withheld row: the record needs to show
    // that this caller's query reached into withheld history, and a row-level
    // event would both flood the log and leak the withheld count's precision
    // into it. The count is recorded as a number because an operator
    // investigating needs to know whether one row or ten thousand were
    // involved.
    if (filter.case_id === undefined) {
      const withheld = await this.withheldCount(filter, cursor, held);
      if (withheld > 0) {
        await this.auditAttempt(principal, filter, context, {
          outcome: 'denied',
          reason_code: 'AUDIT_DESIGNATION_DENIED',
          hide_existence: false,
          withheld_row_count: withheld,
        });
      }
    }

    const response: AuditExplorerResponse = {
      audit_events: page.map(toDto),
    };

    const last = page[page.length - 1];
    if (hasMore && last !== undefined) {
      response.next_cursor = encodeCursor({
        occurredAt: last.occurred_at,
        id: last.id,
      });
    }

    return response;
  }

  // =========================================================================
  // The query itself
  // =========================================================================

  /**
   * Build and run the keyset-paginated, designation-pre-filtered select.
   *
   * Written as raw SQL rather than through the Prisma query builder for one
   * reason: the designation exclusion is a correlated `NOT EXISTS` over a
   * polymorphic `(object_type, object_id)` join that Prisma's relational model
   * cannot express — `audit_events` has no foreign key to `cases`, by design,
   * because it references every table in the system.
   *
   * **Every value is bound.** `object_type` reaches this statement from a
   * query string (threat T-01-18); `Prisma.sql`'s tagged template
   * parameterises each `${}`. The string-interpolating raw variants are not
   * used anywhere in this module.
   */
  private async select(
    filter: AuditExplorerQuery,
    cursor: Cursor | undefined,
    held: string[],
    limit: number,
  ): Promise<ExplorerRow[]> {
    const where = this.conditions(filter, cursor, held);

    return this.prisma.$queryRaw<ExplorerRow[]>(Prisma.sql`
      SELECT ae.id,
             ae.actor_id,
             ae.action_type,
             ae.object_type,
             ae.object_id,
             ae.before_state,
             ae.after_state,
             ae.rule_version_ref,
             ae.calculation_version_ref,
             ae.client_ip,
             ae.session_id,
             ae.occurred_at,
             ae.prev_hash,
             ae.row_hash,
             rpv.version_number AS rule_version_number
        FROM platform.audit_events ae
        LEFT JOIN platform.rule_package_versions rpv
               ON rpv.id = ae.rule_version_ref
       WHERE ${Prisma.join(where, ' AND ')}
       ORDER BY ae.occurred_at DESC, ae.id DESC
       LIMIT ${limit}
    `);
  }

  /**
   * How many rows the designation pre-filter removed from this query's window.
   *
   * Deliberately a separate, bounded count rather than something derived from
   * the page: the page is a window, and "did this query reach into withheld
   * history" is a question about the whole filter, not about the first 50
   * matches. Capped so a sweeping query cannot turn one Explorer call into a
   * full-table count.
   */
  private async withheldCount(
    filter: AuditExplorerQuery,
    cursor: Cursor | undefined,
    held: string[],
  ): Promise<number> {
    const base = this.conditions(filter, cursor, null);
    const excluded = this.designationExclusion(held);

    const rows = await this.prisma.$queryRaw<{ withheld: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS withheld
        FROM (
          SELECT 1
            FROM platform.audit_events ae
           WHERE ${Prisma.join(base, ' AND ')}
             AND NOT (${excluded})
           LIMIT 10000
        ) sample
    `);

    return Number(rows[0]?.withheld ?? 0n);
  }

  /**
   * The `WHERE` fragments shared by both queries.
   *
   * @param held the designations the caller may see, or `null` to omit the
   *   designation exclusion entirely (used by {@link withheldCount}, which
   *   needs the *complement*).
   */
  private conditions(
    filter: AuditExplorerQuery,
    cursor: Cursor | undefined,
    held: string[] | null,
  ): Prisma.Sql[] {
    const where: Prisma.Sql[] = [Prisma.sql`TRUE`];

    if (filter.user_id !== undefined) {
      where.push(Prisma.sql`ae.actor_id = ${filter.user_id}::uuid`);
    }
    if (filter.object_type !== undefined) {
      // Matched verbatim against the stored value. `audit_events.object_type`
      // holds whatever the writing call site passed — `AbacGuard` writes the
      // resource type (`case`), `withAudit`'s documented usage writes the
      // table name (`cases`) — so both spellings occur, and a client filtering
      // for one should not silently receive the other.
      where.push(Prisma.sql`ae.object_type = ${filter.object_type}`);
    }
    if (filter.action_type !== undefined) {
      where.push(Prisma.sql`ae.action_type = ${filter.action_type}`);
    }
    if (filter.date_from !== undefined) {
      where.push(
        Prisma.sql`ae.occurred_at >= ${new Date(filter.date_from)}::timestamptz`,
      );
    }
    if (filter.date_to !== undefined) {
      where.push(
        Prisma.sql`ae.occurred_at <= ${new Date(filter.date_to)}::timestamptz`,
      );
    }
    if (filter.case_id !== undefined) {
      where.push(this.caseFilter(filter.case_id));
    }
    if (cursor !== undefined) {
      // Row-value comparison, which is what makes this a KEYSET scan: the
      // planner can satisfy `(a, b) < (x, y)` from an index on `(a, b)`
      // directly, where the equivalent `a < x OR (a = x AND b < y)` often
      // degenerates into a filter.
      where.push(
        Prisma.sql`(ae.occurred_at, ae.id) < (${cursor.occurredAt}::timestamptz, ${cursor.id}::uuid)`,
      );
    }
    if (held !== null) {
      where.push(this.designationExclusion(held));
    }

    return where;
  }

  /**
   * Restrict to audit rows concerning one case, directly or through one of its
   * children.
   *
   * An audit row names its subject polymorphically (`object_type`,
   * `object_id`), so "about this case" means the row is the case itself, or a
   * proceeding / hearing / party / docket event / document reference /
   * security designation belonging to it. Matching only `object_type='case'`
   * would answer a case-history question with the handful of rows that touched
   * the case record itself and silently omit everything that happened *in* it.
   */
  private caseFilter(caseId: string): Prisma.Sql {
    return Prisma.sql`(
         (ae.object_type IN ('case','cases') AND ae.object_id = ${caseId}::uuid)
      OR (ae.object_type IN ('proceeding','proceedings')
          AND EXISTS (SELECT 1 FROM platform.proceedings p
                       WHERE p.id = ae.object_id AND p.case_id = ${caseId}::uuid))
      OR (ae.object_type IN ('hearing','hearings')
          AND EXISTS (SELECT 1 FROM platform.hearings h
                       JOIN platform.proceedings hp ON hp.id = h.proceeding_id
                      WHERE h.id = ae.object_id AND hp.case_id = ${caseId}::uuid))
      OR (ae.object_type IN ('party','parties')
          AND EXISTS (SELECT 1 FROM platform.parties pa
                       WHERE pa.id = ae.object_id AND pa.case_id = ${caseId}::uuid))
      OR (ae.object_type IN ('docket_event','docket_events')
          AND EXISTS (SELECT 1 FROM platform.docket_events de
                       WHERE de.id = ae.object_id AND de.case_id = ${caseId}::uuid))
      OR (ae.object_type IN ('document_reference','document_references')
          AND EXISTS (SELECT 1 FROM platform.document_references dr
                       WHERE dr.id = ae.object_id AND dr.case_id = ${caseId}::uuid))
      OR (ae.object_type IN ('security_designation','security_designations')
          AND EXISTS (SELECT 1 FROM platform.security_designations sd
                       WHERE sd.id = ae.object_id
                         AND sd.object_type = 'case'
                         AND sd.object_id = ${caseId}::uuid))
    )`;
  }

  /**
   * The designation pre-filter: keep a row only if the matter it concerns
   * carries no designation this caller lacks.
   *
   * `revoked_at IS NULL` is not optional. A designation can be lawfully lifted
   * (plan 01-03 added the revocation columns for exactly that), and a read
   * path that ignores the filter keeps withholding history that is no longer
   * restricted — a **false denial**, which users report as "I must be missing
   * an entitlement" rather than as a bug, and which can therefore persist for
   * the life of the record.
   *
   * Both halves of a document reference's designation set are checked: a
   * single filing can be sealed inside an otherwise-open case
   * (`security_designations.object_type = 'document_reference'`), and looking
   * only at the owning case would publish exactly those filings.
   */
  private designationExclusion(held: string[]): Prisma.Sql {
    // `<> ALL (empty array)` is TRUE in SQL, which is the correct fail-closed
    // behaviour for a caller holding no designation entitlements: every
    // designated row is excluded.
    const heldArray = Prisma.sql`${held}::text[]`;

    return Prisma.sql`NOT EXISTS (
      SELECT 1
        FROM platform.security_designations sd
       WHERE sd.revoked_at IS NULL
         AND sd.designation <> ALL (${heldArray})
         AND (
              -- the audit row IS a case, or hangs off one
              (sd.object_type = 'case' AND sd.object_id = (
                 CASE
                   WHEN ae.object_type IN ('case','cases') THEN ae.object_id
                   WHEN ae.object_type IN ('proceeding','proceedings')
                     THEN (SELECT p.case_id FROM platform.proceedings p WHERE p.id = ae.object_id)
                   WHEN ae.object_type IN ('hearing','hearings')
                     THEN (SELECT hp.case_id FROM platform.hearings h
                             JOIN platform.proceedings hp ON hp.id = h.proceeding_id
                            WHERE h.id = ae.object_id)
                   WHEN ae.object_type IN ('party','parties')
                     THEN (SELECT pa.case_id FROM platform.parties pa WHERE pa.id = ae.object_id)
                   WHEN ae.object_type IN ('docket_event','docket_events')
                     THEN (SELECT de.case_id FROM platform.docket_events de WHERE de.id = ae.object_id)
                   WHEN ae.object_type IN ('document_reference','document_references')
                     THEN (SELECT dr.case_id FROM platform.document_references dr WHERE dr.id = ae.object_id)
                   WHEN ae.object_type IN ('security_designation','security_designations')
                     THEN (SELECT sd2.object_id FROM platform.security_designations sd2
                            WHERE sd2.id = ae.object_id AND sd2.object_type = 'case')
                   ELSE NULL
                 END))
           OR -- a filing sealed inside an otherwise-open case
              (sd.object_type = 'document_reference'
               AND ae.object_type IN ('document_reference','document_references')
               AND sd.object_id = ae.object_id)
         )
    )`;
  }

  // =========================================================================
  // Policy knowledge
  // =========================================================================

  /**
   * Which designations may this caller see?
   *
   * Configuration first (`security_policies` rows attached to published rule
   * packages — `FRD/F13` requires designation policy be configuration-driven),
   * the Rego bundle's built-in defaults only where configuration is silent.
   *
   * ## Why a designation configured differently in two courts is withheld
   *
   * The Explorer spans courts, and a designation's required entitlement is
   * per-rule-package. A caller is treated as holding a designation only if
   * they hold the required entitlement under **every** configured mapping for
   * it. The alternative — "held under any one court's mapping" — would let a
   * court that configured `sealed` loosely act as a skeleton key for every
   * other court's sealed matters.
   *
   * Conservative in the direction that withholds, which is the only direction
   * a mistake here is recoverable in.
   */
  private async heldDesignations(principal: Principal): Promise<string[]> {
    const configured = await this.prisma.security_policies.findMany({
      where: {
        rule_package_version: {
          published_at: { not: null },
        },
      },
      select: { designation: true, required_entitlement: true },
    });

    const requirements = new Map<string, Set<string>>();
    for (const row of configured) {
      const set = requirements.get(row.designation) ?? new Set<string>();
      set.add(row.required_entitlement);
      requirements.set(row.designation, set);
    }

    // Designations with no configuration row anywhere fall back to the
    // bundle's defaults, so the two sides agree when configuration is silent.
    for (const [designation, entitlement] of Object.entries(
      DEFAULT_DESIGNATION_ENTITLEMENT,
    )) {
      if (!requirements.has(designation)) {
        requirements.set(designation, new Set([entitlement]));
      }
    }

    const entitlements = new Set(principal.entitlements);
    const held: string[] = [];
    for (const [designation, required] of requirements) {
      if ([...required].every((key) => entitlements.has(key))) {
        held.push(designation);
      }
    }

    return held.sort();
  }

  /**
   * Ask the PDP whether this caller may read the named case, and translate the
   * answer into the Explorer's three outcomes.
   *
   * The decision — including the 403-vs-404 discriminator — is the policy's.
   * This method assembles the input exactly as `AbacGuard` does and reads the
   * verdict; it decides nothing.
   */
  private async probeCase(
    principal: Principal,
    caseId: string,
    context: { route: string; method: string },
  ): Promise<'open' | 'designation_denied' | 'hidden'> {
    const resource = await this.resources.load('case', caseId, null, {
      actorUserId: principal.user_id,
    });

    // The case does not exist. Indistinguishable, by construction, from one
    // the caller may not learn about: both produce an empty page.
    if (resource === null) return 'hidden';

    const config = await this.resources.effectiveSecurityConfig(
      resource.court_id,
    );

    const input: PdpInput = {
      principal: {
        user_id: principal.user_id,
        mfa_satisfied: principal.mfa_satisfied,
        roles: principal.roles.map((role) => ({
          role_name: role.role_name,
          court_id: role.court_id ?? null,
          division_id: role.division_id ?? null,
        })),
        scopes: principal.scopes.map((scope) => ({
          scope_type: scope.scope_type,
          scope_value: scope.scope_value ?? null,
          scope_enum_value: scope.scope_enum_value ?? null,
        })),
        entitlements: principal.entitlements,
      },
      action: 'read',
      resource: {
        type: resource.type,
        id: resource.id,
        court_id: resource.court_id,
        division_id: resource.division_id,
        case_id: resource.case_id,
        proceeding_id: resource.proceeding_id,
        designations: resource.designations,
        requested_by: resource.requested_by,
      },
      context,
      // Omitted, never sent empty — the bundle REPLACES its defaults with
      // whatever arrives, so `[]` would map every designation to nothing and
      // withhold every designated record in a court whose configuration had
      // not loaded. (Same reasoning as `AbacGuard`.)
      ...(config.policies.length > 0
        ? { security_policies: config.policies }
        : {}),
    };

    const decision = await this.pdp.evaluate(input);

    if (decision.allow) return 'open';
    if (decision.hide_existence) return 'hidden';
    if (decision.reason_code === 'AUTH_DESIGNATION_DENIED') {
      return 'designation_denied';
    }

    // Any other denial — overwhelmingly `AUTH_SCOPE_DENIED`, because an
    // auditor holding `audit_reader` and not `case_read` is denied every case
    // read by design. See the class comment: that pairing IS the separation of
    // duties, so it must not also block the audit query. The row-level
    // designation pre-filter still applies.
    return 'open';
  }

  // =========================================================================
  // The attempt record
  // =========================================================================

  /**
   * Write the `access_attempt` event for a withheld or refused query.
   *
   * `FRD/F02` Validation: "the *attempt* to view a sealed audit entry without
   * entitlement is itself logged as an audit event (access_attempt)." And
   * `Screen-17`: "this very attempt appears as a new row next time anyone
   * queries" — which is only true because `access_attempt` rows are ordinary
   * Explorer results.
   *
   * **A failure here must never change the response.** Same rule, and the same
   * reasoning, as `AbacGuard.auditDenial`: on the blind-discovery path a 500
   * raised by the audit insert would itself disclose that something exists to
   * fail about, and on the 403 path it would hand the caller a different
   * signal for a reason unrelated to their access. So the failure is logged as
   * an integrity gap and swallowed.
   *
   * Note what is recorded: the **filter**, never any content from the rows
   * that were withheld. Writing the withheld ids into the audit trail would
   * make the trail itself the disclosure.
   */
  private async auditAttempt(
    principal: Principal,
    filter: AuditExplorerQuery,
    context: { route: string; method: string; clientIp: string | null },
    outcome: Record<string, unknown>,
  ): Promise<void> {
    try {
      await recordStandaloneAudit(this.prisma, this.audit, {
        actor_id: principal.user_id,
        action_type: 'access_attempt' satisfies AuditActionType,
        object_type: 'audit_event',
        object_id: filter.case_id ?? NIL_UUID,
        after_state: {
          ...outcome,
          action: 'read',
          route: context.route,
          method: context.method,
          // The attempted filter, so an investigator can see what was reached
          // for. Values are ids and enum members, never record content.
          filter: {
            case_id: filter.case_id ?? null,
            user_id: filter.user_id ?? null,
            date_from: filter.date_from ?? null,
            date_to: filter.date_to ?? null,
            object_type: filter.object_type ?? null,
            action_type: filter.action_type ?? null,
          },
        },
        client_ip: context.clientIp,
        session_id: principal.session_id,
      });
    } catch (error) {
      this.logger.error(
        `INTEGRITY GAP: failed to write the access_attempt audit event for an ` +
          `Audit Explorer query by ${principal.user_id}. The query result ` +
          `itself stands and is being returned, but this attempt is NOT in ` +
          `the audit trail. Cause: ${
            error instanceof Error ? error.message : String(error)
          }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}

// ===========================================================================
// Pure helpers
// ===========================================================================

/**
 * Render a row for the wire, adding the two derived fields `Screen-17` needs.
 */
function toDto(row: ExplorerRow): AuditExplorerEvent {
  return {
    id: row.id,
    actor_id: row.actor_id,
    action_type: row.action_type as AuditActionType,
    object_type: row.object_type,
    object_id: row.object_id,
    before_state: asRecord(row.before_state),
    after_state: asRecord(row.after_state),
    rule_version_ref: row.rule_version_ref,
    calculation_version_ref: row.calculation_version_ref,
    client_ip: row.client_ip,
    session_id: row.session_id,
    occurred_at: row.occurred_at.toISOString(),
    prev_hash: row.prev_hash,
    row_hash: row.row_hash,
    before_after_summary: summarise(
      asRecord(row.before_state),
      asRecord(row.after_state),
    ),
    rule_version_label:
      row.rule_version_number === null ? null : `v${row.rule_version_number}`,
  };
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * The "Before→After" column: a compact, bounded summary of what changed.
 *
 * Bounded deliberately. The column is one line in a dense table, and an
 * unbounded render of a large `after_state` would both break the layout and
 * push record content into contexts (logs, exports, notification previews)
 * where the full before/after pair is available anyway through the expandable
 * row detail.
 */
function summarise(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string | null {
  if (before === null && after === null) return null;

  const keys = [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ].sort();

  const parts: string[] = [];
  for (const key of keys) {
    const from = before?.[key];
    const to = after?.[key];
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    parts.push(`${key}: ${scalarise(from)} → ${scalarise(to)}`);
    if (parts.length === 4) {
      const remaining = keys.length - keys.indexOf(key) - 1;
      if (remaining > 0) parts.push(`+${remaining} more`);
      break;
    }
  }

  if (parts.length === 0) {
    // Both states present and identical, or an event that carries only one
    // side (an `access_attempt` has `after_state` alone). Render the side that
    // exists rather than claiming nothing happened.
    if (before === null && after !== null) {
      return keys
        .slice(0, 4)
        .map((key) => `${key}: ${scalarise(after[key])}`)
        .join(', ');
    }
    return null;
  }

  return parts.join(', ');
}

/** A short, display-safe rendering of one value. */
function scalarise(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return value.length > 40 ? `${value.slice(0, 37)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return Array.isArray(value) ? `[${value.length}]` : '{…}';
}

/**
 * Encode a keyset cursor.
 *
 * Opaque to clients by intent — base64 of `occurred_at|id`. It is not a
 * secret and is not treated as one: it carries only values the caller already
 * received in the page it came from, and {@link decodeCursor} re-validates it
 * rather than trusting it. The opacity is so that the pagination key can
 * change without breaking clients that stored a cursor.
 */
function encodeCursor(cursor: Cursor): string {
  return Buffer.from(
    `${cursor.occurredAt.toISOString()}|${cursor.id}`,
    'utf8',
  ).toString('base64url');
}

/**
 * Decode a client-supplied cursor.
 *
 * A malformed cursor is a 422, not a silent reset to page one. Silently
 * restarting would make a paging client loop forever over the first page with
 * nothing to indicate why.
 */
function decodeCursor(raw: string | undefined): Cursor | undefined {
  if (raw === undefined) return undefined;

  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  const separator = decoded.indexOf('|');
  const occurredAt = new Date(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);

  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (separator < 0 || Number.isNaN(occurredAt.getTime()) || !uuid.test(id)) {
    throw new ApiException(
      422,
      'REQUEST_VALIDATION_FAILED',
      'The pagination cursor is not valid',
    );
  }

  return { occurredAt, id };
}
