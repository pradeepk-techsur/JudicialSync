import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ApiException } from '../../common/errors/api-error';
import { Principal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditWriteInput } from '../audit/audit.types';
import { withAudit } from '../audit/with-audit';
import { EntitlementResolverService } from '../identity/entitlement-resolver.service';
import { SessionService } from '../identity/session.service';
import {
  CreateGrantRequestDto,
  EntitlementCatalogEntry,
  GrantRequestView,
  GrantView,
  MIN_RATIONALE_LENGTH,
} from './dto/grant.dto';

/**
 * The columns this service locks and reads from `access_grant_requests`.
 *
 * Declared explicitly rather than `SELECT *` because the row is loaded through
 * raw SQL (`FOR UPDATE`, which Prisma's query builder cannot express), and a
 * `*` would silently start returning any column a later migration adds —
 * including ones this code would then be free to misinterpret.
 */
interface GrantRequestRow {
  id: string;
  grant_type: string;
  subject_user_id: string;
  role_id: string | null;
  entitlement_key: string | null;
  court_id: string | null;
  division_id: string | null;
  scope_type: string | null;
  scope_value: string | null;
  scope_enum_value: string | null;
  justification: string;
  requested_by: string;
  requested_at: Date;
  status: string;
  decided_by: string | null;
  decided_at: Date | null;
  is_bootstrap: boolean;
}

/** The 404 wording, byte-identical to `AbacGuard.notFound`. See `notFound`. */
const NOT_FOUND_LABELS: Readonly<Record<string, string>> = {
  access_grant_request: 'Access request',
  entitlement_grant: 'Entitlement grant',
};

/**
 * ============================================================================
 * THE TWO-STEP GRANT LIFECYCLE — AND THE CONTROL THAT MAKES IT TWO-STEP
 * ============================================================================
 *
 * `request → approve`, where the approver is a **different person** from the
 * requester. The Phase 1 CONTEXT states the rule and, unusually, also states
 * the thing that is *not* acceptable as an implementation of it:
 *
 * > "Two-step request → approve, enforced server-side at the API layer. A
 * > grant is a record with a requester and a distinct approver; the API
 * > rejects any approval where `approver == requester` with
 * > `403 AUTH_SOD_VIOLATION`. **'The audit trail will catch it' is explicitly
 * > not sufficient — the API must refuse.**"
 *
 * This is the control that keeps one compromised administrator from granting
 * themselves the entire system, so it is implemented three times over, in
 * three different technologies, by three different plans:
 *
 *   | layer | artifact | catches |
 *   |---|---|---|
 *   | policy  | `policy/judicialsync/authz/sod.rego` (01-02), evaluated by `AbacGuard` | the ordinary HTTP path |
 *   | service | {@link GrantsService.approve} below (this plan)        | a direct in-process call that never passed a guard |
 *   | data    | `CHECK (decided_by IS NULL OR decided_by <> requested_by)` (01-03) | raw SQL, a future ORM, a migration script |
 *
 * **None of the three may be removed on the grounds that the others exist.**
 * They are not redundant; they cover disjoint failure modes, and the one most
 * likely to be deleted as "defensive duplication" — the service check — is the
 * only one that survives a route losing its `@Resource()` descriptor.
 *
 * `TechArch/04-security.md` §7.2 specifically warns against the inverse
 * mistake: SoD must be "enforced as a policy rule … **not** an
 * application-layer `if` statement that a future refactor could drop." That is
 * why the Rego rule is the primary and this check is the backstop — not the
 * other way round.
 *
 * ## What this service is NOT
 *
 * It is not a Work Queue. CONTEXT: pending grants are "listable via API in
 * Phase 1 and must plug into the Work Queue in Phase 3 without rework". So
 * {@link listRequests} emits the `Task` field names from
 * `TechArch/03a-api-shared.md` §6.6 and stops there — there is no task table,
 * no assignment, no ownership, and building one here would be Phase 3's work
 * done early and wrong.
 */
@Injectable()
export class GrantsService {
  private readonly logger = new Logger(GrantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly entitlements: EntitlementResolverService,
  ) {}

  // =========================================================================
  // REQUEST
  // =========================================================================

  /**
   * Record a request for a role or entitlement. Step one of two.
   *
   * Creates nothing but the request: no grant exists until a *different*
   * person approves it. The request itself is audited, so an administrator who
   * asks for sweeping authority and is refused leaves a trace — which is half
   * the value of making the ask explicit.
   */
  async request(
    principal: Principal,
    dto: CreateGrantRequestDto,
  ): Promise<GrantRequestView> {
    this.requireRationale(dto.justification, 'justification');

    // --- the subject must exist and be able to hold access -----------------
    const subject = await this.prisma.users.findUnique({
      where: { id: dto.subject_user_id },
      select: { id: true, status: true },
    });
    if (subject === null || subject.status !== 'active') {
      // 422 rather than 404: the caller holds `access_admin` and is entitled
      // to know that the user they named is not a grantable subject. Hiding
      // that would send an administrator hunting a policy problem over a typo.
      throw new ApiException(
        422,
        'GRANT_SUBJECT_NOT_FOUND',
        'The subject user does not exist or is not active',
      );
    }

    // --- the thing being granted must exist in the catalog -----------------
    //
    // A request naming an entitlement that is not defined must FAIL, never
    // quietly define one. `entitlement_definitions` is the catalog the policy
    // bundle's `action_entitlement_map` is checked against; an entitlement
    // invented at grant time would be grantable, resolvable into a Principal,
    // and authorize absolutely nothing — an access right that looks real to
    // every human reading the record and is inert in the one place it matters.
    if (dto.grant_type === 'entitlement') {
      if (dto.entitlement_key === undefined) {
        throw new ApiException(
          422,
          'REQUEST_VALIDATION_FAILED',
          'entitlement_key is required when grant_type is "entitlement"',
        );
      }
      const definition = await this.prisma.entitlement_definitions.findUnique({
        where: { entitlement_key: dto.entitlement_key },
        select: { entitlement_key: true },
      });
      if (definition === null) {
        throw new ApiException(
          422,
          'GRANT_UNKNOWN_ENTITLEMENT',
          'No such entitlement is defined in the catalog',
        );
      }
    } else {
      if (dto.role_id === undefined) {
        throw new ApiException(
          422,
          'REQUEST_VALIDATION_FAILED',
          'role_id is required when grant_type is "role"',
        );
      }
      const role = await this.prisma.roles.findUnique({
        where: { id: dto.role_id },
        select: { id: true },
      });
      if (role === null) {
        throw new ApiException(
          422,
          'GRANT_UNKNOWN_ROLE',
          'No such role is defined in the catalog',
        );
      }
    }

    // --- don't stack a second grant of something already held --------------
    await this.assertNotDuplicate(dto);

    const courtId = this.administrativeCourt(principal, dto);

    const created = await withAudit(this.prisma, this.audit, async (tx) => {
      const row = await tx.access_grant_requests.create({
        data: {
          grant_type: dto.grant_type,
          subject_user_id: dto.subject_user_id,
          role_id: dto.role_id ?? null,
          entitlement_key: dto.entitlement_key ?? null,
          court_id: courtId,
          division_id: dto.division_id ?? null,
          scope_type: dto.scope_type ?? null,
          scope_value: dto.scope_value ?? null,
          scope_enum_value: dto.scope_enum_value ?? null,
          justification: dto.justification,
          requested_by: principal.user_id,
          status: 'pending',
          is_bootstrap: false,
        },
      });

      return {
        result: row,
        audit: {
          actor_id: principal.user_id,
          action_type: 'approval',
          object_type: 'access_grant_requests',
          object_id: row.id,
          before_state: null,
          after_state: {
            event: 'grant_requested',
            status: 'pending',
            grant_type: row.grant_type,
            subject_user_id: row.subject_user_id,
            role_id: row.role_id,
            entitlement_key: row.entitlement_key,
            court_id: row.court_id,
            division_id: row.division_id,
            scope_type: row.scope_type,
            scope_value: row.scope_value,
            scope_enum_value: row.scope_enum_value,
            justification: row.justification,
            requested_by: row.requested_by,
            is_bootstrap: false,
          },
          session_id: principal.session_id === '' ? null : principal.session_id,
        } satisfies AuditWriteInput,
      };
    });

    return this.toRequestView(created as unknown as GrantRequestRow);
  }

  // =========================================================================
  // APPROVE — the control
  // =========================================================================

  /**
   * Approve a pending request, materializing the grant. Step two of two.
   *
   * @throws {ApiException} 403 `AUTH_SOD_VIOLATION` when the approver is the
   *   requester. See the class comment for why this check exists even though
   *   the Rego rule has already run and the table CHECK will run after.
   */
  async approve(principal: Principal, requestId: string): Promise<GrantView> {
    const { grant, subjectUserId } = await withAudit(
      this.prisma,
      this.audit,
      async (tx) => {
        // 1. Lock the row. Two approvers clicking at the same moment must not
        //    both succeed: without the lock both read `pending`, both pass the
        //    transition check, and both insert a grant — two records of the
        //    same authority with different grantors, which is exactly the kind
        //    of ambiguity an appellate record cannot have.
        const request = await this.lockRequest(tx, requestId);

        // 2. ===============================================================
        //    SEPARATION OF DUTIES. THE API REFUSES; IT DOES NOT MERELY AUDIT.
        //    ===============================================================
        //
        //    DELIBERATELY REDUNDANT with `sod.rego` (evaluated by `AbacGuard`
        //    before this handler ran) and with the table-level
        //    `CHECK (decided_by IS NULL OR decided_by <> requested_by)`.
        //
        //    Do not delete this because "the policy already covers it". The
        //    three layers cover different failure modes:
        //
        //      - the Rego rule covers the HTTP path, and is bypassed by a
        //        route that loses its `@Resource()` descriptor, by an
        //        in-process caller, and by any future non-HTTP entry point;
        //      - THIS check covers every caller of this service, however it
        //        arrived, and is the only one that produces the exact
        //        `FRD/F00` error code and message to the client;
        //      - the table CHECK covers raw SQL, a migration script, and a
        //        future ORM — and is the only one that survives this file
        //        being rewritten.
        //
        //    `apps/api/test/grants-sod.e2e-spec.ts` exercises all three
        //    separately, so removing any one of them fails a named test
        //    rather than quietly reducing three defences to two.
        if (request.requested_by === principal.user_id) {
          throw new ApiException(
            403,
            'AUTH_SOD_VIOLATION',
            // Verbatim from `FRD/F00` Error States.
            'Separation-of-duties violation: cannot approve your own request',
          );
        }

        // 3. Only a pending request can be decided. A second approval of an
        //    already-approved request would otherwise mint a second grant.
        this.assertPending(request);

        // 4. Decide it.
        const decidedAt = new Date();
        await tx.access_grant_requests.update({
          where: { id: request.id },
          data: {
            status: 'approved',
            decided_by: principal.user_id,
            decided_at: decidedAt,
          },
        });

        // 5. Materialize. Both target tables are append-only apart from
        //    `revoked_at`/`revoked_by` (plan 01-03's column-scoped grants), so
        //    this is an INSERT and there is no update path to reach for.
        const grant = await this.materialize(tx, request, {
          grantedBy: principal.user_id,
          grantedAt: decidedAt,
          isBootstrap: request.is_bootstrap,
        });

        return {
          result: { grant, subjectUserId: request.subject_user_id },
          // 6. ONE event naming BOTH identities. `US-0.3`: "All role-grant
          //    creation and approval actions are captured as audit events,
          //    including both the requester and approver identities." An
          //    approval event that recorded only the approver would make the
          //    maker/checker pair unreconstructable from the audit trail —
          //    which is the record this whole control exists to produce.
          audit: {
            actor_id: principal.user_id,
            action_type: 'approval',
            object_type: 'access_grant_requests',
            object_id: request.id,
            before_state: {
              status: 'pending',
              decided_by: null,
              requested_by: request.requested_by,
            },
            after_state: {
              event: 'grant_approved',
              status: 'approved',
              // Both identities, named explicitly and distinctly.
              requested_by: request.requested_by,
              approved_by: principal.user_id,
              decided_by: principal.user_id,
              subject_user_id: request.subject_user_id,
              grant_type: request.grant_type,
              role_id: request.role_id,
              entitlement_key: request.entitlement_key,
              scope_type: request.scope_type,
              scope_value: request.scope_value,
              scope_enum_value: request.scope_enum_value,
              granted_object_type: grant.entitlement_key !== null
                ? 'entitlement_grants'
                : 'user_roles',
              granted_object_id: grant.id,
              is_bootstrap: request.is_bootstrap,
            },
            session_id:
              principal.session_id === '' ? null : principal.session_id,
          } satisfies AuditWriteInput,
        };
      },
    );

    await this.propagate(subjectUserId);
    return grant;
  }

  // =========================================================================
  // DENY
  // =========================================================================

  /**
   * Refuse a pending request.
   *
   * The SoD check applies here too, and that is not symmetry for its own sake.
   * Without it a requester could quietly close their own request — removing it
   * from the pending list a reviewer reads, and with it the only visible sign
   * that the ask was ever made. The route's descriptor is `action: 'approve'`
   * for the same reason: `sod.rego` keys on `action == "approve"`, and a
   * distinct `deny` action would escape the policy rule entirely.
   */
  async deny(
    principal: Principal,
    requestId: string,
    rationale: string,
  ): Promise<GrantRequestView> {
    this.requireRationale(rationale, 'rationale');

    const decided = await withAudit(this.prisma, this.audit, async (tx) => {
      const request = await this.lockRequest(tx, requestId);

      // Same control, same reasoning as `approve` — see step 2 there.
      if (request.requested_by === principal.user_id) {
        throw new ApiException(
          403,
          'AUTH_SOD_VIOLATION',
          'Separation-of-duties violation: cannot approve your own request',
        );
      }

      this.assertPending(request);

      const row = await tx.access_grant_requests.update({
        where: { id: request.id },
        data: {
          status: 'denied',
          decided_by: principal.user_id,
          decided_at: new Date(),
        },
      });

      return {
        result: row,
        audit: {
          actor_id: principal.user_id,
          action_type: 'approval',
          object_type: 'access_grant_requests',
          object_id: request.id,
          before_state: { status: 'pending', decided_by: null },
          after_state: {
            event: 'grant_denied',
            status: 'denied',
            requested_by: request.requested_by,
            denied_by: principal.user_id,
            decided_by: principal.user_id,
            subject_user_id: request.subject_user_id,
            rationale,
            is_bootstrap: request.is_bootstrap,
          },
          session_id: principal.session_id === '' ? null : principal.session_id,
        } satisfies AuditWriteInput,
      };
    });

    return this.toRequestView(decided as unknown as GrantRequestRow);
  }

  // =========================================================================
  // REVOKE
  // =========================================================================

  /**
   * Withdraw a materialized grant.
   *
   * **Single-step by design, and the asymmetry with approval is deliberate.**
   * Two-person control exists to stop one person *acquiring* authority;
   * removing authority is the safe direction, and requiring a second approver
   * to revoke would mean a compromised credential stays live while a second
   * administrator is found. `sod.rego` is given nothing to compare on this
   * path — `resource-loader.service.ts` leaves `requested_by` null for an
   * `entitlement_grant` — so the rule cannot fire, which is the intended
   * behaviour rather than an omission.
   *
   * **The row is never removed.** `revoked_at`/`revoked_by` are the only
   * columns `app_rw` may update on these tables, and there is no DELETE grant
   * at all. That the subject once held this access is part of the record: an
   * investigation into what someone could see last March needs the grant that
   * was revoked in April.
   */
  async revoke(
    principal: Principal,
    grantId: string,
    rationale: string,
  ): Promise<GrantView> {
    this.requireRationale(rationale, 'rationale');

    const { grant, subjectUserId } = await withAudit(
      this.prisma,
      this.audit,
      async (tx) => {
        const existing = await tx.entitlement_grants.findUnique({
          where: { id: grantId },
        });

        if (existing === null) {
          // A role grant lives in `user_roles` and carries the same shape of
          // identifier. Checked second so the common case costs one query.
          //
          // NOTE: over HTTP this branch is currently unreachable —
          // `resource-loader.service.ts` (plan 01-07) resolves the
          // `entitlement_grant` resource type against `entitlement_grants`
          // only, so a `user_roles` id 404s at the guard before arriving
          // here. The service supports it because the *lifecycle* is the
          // same and a half-implemented revoke is worse than an unreachable
          // one; making it reachable needs a loader branch in 01-07's file.
          const role = await tx.user_roles.findUnique({ where: { id: grantId } });
          if (role === null) throw this.notFound('entitlement_grant');
          if (role.revoked_at !== null) {
            throw new ApiException(
              409,
              'GRANT_INVALID_TRANSITION',
              'This action cannot be performed from the current state',
            );
          }

          const revokedAt = new Date();
          const updated = await tx.user_roles.update({
            where: { id: role.id },
            data: { revoked_at: revokedAt, revoked_by: principal.user_id },
          });

          return {
            result: {
              grant: this.toRoleGrantView(updated),
              subjectUserId: role.user_id,
            },
            audit: this.revocationEvent(principal, {
              objectType: 'user_roles',
              objectId: role.id,
              subjectUserId: role.user_id,
              what: { role_id: role.role_id, entitlement_key: null },
              rationale,
              isBootstrap: role.is_bootstrap,
            }),
          };
        }

        if (existing.revoked_at !== null) {
          throw new ApiException(
            409,
            'GRANT_INVALID_TRANSITION',
            'This action cannot be performed from the current state',
          );
        }

        const revokedAt = new Date();
        const updated = await tx.entitlement_grants.update({
          where: { id: existing.id },
          data: { revoked_at: revokedAt, revoked_by: principal.user_id },
        });

        return {
          result: {
            grant: this.toEntitlementGrantView(updated),
            subjectUserId: existing.user_id,
          },
          audit: this.revocationEvent(principal, {
            objectType: 'entitlement_grants',
            objectId: existing.id,
            subjectUserId: existing.user_id,
            what: {
              role_id: null,
              entitlement_key: existing.entitlement_key,
            },
            rationale,
            isBootstrap: existing.is_bootstrap,
          }),
        };
      },
    );

    await this.propagate(subjectUserId);
    return grant;
  }

  // =========================================================================
  // LIST
  // =========================================================================

  /**
   * Grant requests the caller is scoped to see, in the shape Phase 3's Work
   * Queue consumes.
   *
   * The court filter is a second line behind the guard, not a substitute for
   * it: `AbacGuard` evaluates the *collection* route against the caller's own
   * court, which cannot express "and every row in the result belongs to that
   * court too". A collection endpoint that returned cross-court rows would be
   * the multi-tenancy boundary leaking through the one shape of request the
   * PDP cannot see inside (`TechArch/00-overview.md` §159).
   *
   * Rows with a null `court_id` are court-independent and visible to any
   * `access_admin`; in practice only a request created before this service
   * learned to default the column can be in that state.
   */
  async listRequests(
    principal: Principal,
    filters: { status: 'pending' | 'approved' | 'denied'; isBootstrap?: boolean },
  ): Promise<GrantRequestView[]> {
    const courtIds = this.courtsOf(principal);

    const rows = await this.prisma.access_grant_requests.findMany({
      where: {
        status: filters.status,
        ...(filters.isBootstrap === undefined
          ? {}
          : { is_bootstrap: filters.isBootstrap }),
        ...(courtIds.length > 0
          ? { OR: [{ court_id: { in: courtIds } }, { court_id: null }] }
          : {}),
      },
      orderBy: [{ requested_at: 'asc' }],
      take: 500,
    });

    return rows.map((row) => this.toRequestView(row as unknown as GrantRequestRow));
  }

  /** Convenience wrapper preserving the name used in the plan's contract. */
  async listPending(principal: Principal): Promise<GrantRequestView[]> {
    return this.listRequests(principal, { status: 'pending' });
  }

  /**
   * The entitlement catalog.
   *
   * Gated on `access_admin` like every other route here, because knowing which
   * entitlements exist — in particular which ones unlock which security
   * designations — is reconnaissance in its own right. A reader who learns
   * that `designation_grand_jury` exists learns that grand-jury material is in
   * this system.
   */
  async catalog(): Promise<EntitlementCatalogEntry[]> {
    const rows = await this.prisma.entitlement_definitions.findMany({
      orderBy: [{ entitlement_key: 'asc' }],
      select: {
        entitlement_key: true,
        description: true,
        is_designation_entitlement: true,
      },
    });
    return rows;
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /**
   * Load one request with a row lock, inside the caller's transaction.
   *
   * Raw SQL because Prisma's query builder has no `FOR UPDATE`. The parameter
   * is bound, never interpolated.
   */
  private async lockRequest(
    tx: Prisma.TransactionClient,
    requestId: string,
  ): Promise<GrantRequestRow> {
    const rows = await tx.$queryRaw<GrantRequestRow[]>`
      SELECT id, grant_type, subject_user_id, role_id, entitlement_key,
             court_id, division_id, scope_type, scope_value, scope_enum_value,
             justification, requested_by, requested_at, status, decided_by,
             decided_at, is_bootstrap
        FROM platform.access_grant_requests
       WHERE id = ${requestId}::uuid
         FOR UPDATE
    `;

    const row = rows[0];
    if (row === undefined) throw this.notFound('access_grant_request');
    return row;
  }

  /** Insert the grant row a decided request calls for. */
  private async materialize(
    tx: Prisma.TransactionClient,
    request: GrantRequestRow,
    meta: { grantedBy: string; grantedAt: Date; isBootstrap: boolean },
  ): Promise<GrantView> {
    try {
      if (request.grant_type === 'entitlement') {
        const row = await tx.entitlement_grants.create({
          data: {
            request_id: request.id,
            user_id: request.subject_user_id,
            entitlement_key: request.entitlement_key as string,
            scope_type: request.scope_type,
            scope_value: request.scope_value,
            scope_enum_value: request.scope_enum_value,
            granted_by: meta.grantedBy,
            granted_at: meta.grantedAt,
            is_bootstrap: meta.isBootstrap,
          },
        });
        return this.toEntitlementGrantView(row);
      }

      const row = await tx.user_roles.create({
        data: {
          user_id: request.subject_user_id,
          role_id: request.role_id as string,
          court_id: request.court_id,
          division_id: request.division_id,
          granted_by: meta.grantedBy,
          granted_at: meta.grantedAt,
          request_id: request.id,
          is_bootstrap: meta.isBootstrap,
        },
      });
      return this.toRoleGrantView(row);
    } catch (error) {
      // `user_roles` carries UNIQUE (user_id, role_id, court_id, division_id),
      // which a REVOKED row still occupies — there is no DELETE grant, so the
      // historical row stays. Re-granting the same role at the same scope
      // therefore collides. Reported as a duplicate rather than a 500, because
      // that is what it is, and the operator's next move (grant at a different
      // scope, or reinstate deliberately) depends on knowing so.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ApiException(
          409,
          'GRANT_DUPLICATE',
          'An equivalent grant already exists for this subject',
        );
      }
      throw error;
    }
  }

  /**
   * Make an approval or revocation take effect **now**.
   *
   * Ordering is load-bearing and the two calls are a documented pair
   * (`entitlement-resolver.service.ts`): invalidate the cached principal
   * FIRST, then revoke the sessions. The reverse order leaves a window in
   * which a request racing the revocation re-populates the cache from
   * pre-change data and the stale entitlement set survives the very operation
   * meant to change it.
   *
   * `revokeAllForUser` invalidates again as part of its own contract; the
   * duplicate call is deliberate and cheap. Relying on it alone would couple
   * this ordering guarantee to another service's implementation detail.
   *
   * `FRD/F00` Process step 7 requires the session revocation: "On role or
   * scope-attribute change … active sessions are invalidated and the user must
   * re-authenticate to receive updated entitlements."
   *
   * Runs **after** the transaction commits. Running it inside would invalidate
   * a cache against a change that might still roll back, briefly restoring the
   * old entitlements from the database on the next read — harmless, but it
   * would also mean a Redis outage could abort a committed court action.
   */
  private async propagate(subjectUserId: string): Promise<void> {
    await this.entitlements.invalidate(subjectUserId);
    const revoked = await this.sessions.revokeAllForUser(subjectUserId);
    this.logger.log(
      `Entitlement change for ${subjectUserId}: cache invalidated, ` +
        `${revoked} active session(s) revoked; re-authentication required.`,
    );
  }

  /** The shared revocation audit event. */
  private revocationEvent(
    principal: Principal,
    args: {
      objectType: 'entitlement_grants' | 'user_roles';
      objectId: string;
      subjectUserId: string;
      what: { role_id: string | null; entitlement_key: string | null };
      rationale: string;
      isBootstrap: boolean;
    },
  ): AuditWriteInput {
    return {
      actor_id: principal.user_id,
      action_type: 'approval',
      object_type: args.objectType,
      object_id: args.objectId,
      before_state: { revoked_at: null, revoked_by: null },
      after_state: {
        event: 'grant_revoked',
        revoked_by: principal.user_id,
        subject_user_id: args.subjectUserId,
        role_id: args.what.role_id,
        entitlement_key: args.what.entitlement_key,
        rationale: args.rationale,
        is_bootstrap: args.isBootstrap,
      },
      session_id: principal.session_id === '' ? null : principal.session_id,
    };
  }

  /**
   * Refuse a request for something the subject already holds.
   *
   * Scoped to NON-revoked grants only: a previously revoked grant is history,
   * and re-granting after a lawful revocation is a legitimate act that must
   * not be blocked by the record of the earlier one.
   */
  private async assertNotDuplicate(dto: CreateGrantRequestDto): Promise<void> {
    if (dto.grant_type === 'entitlement') {
      const held = await this.prisma.entitlement_grants.findFirst({
        where: {
          user_id: dto.subject_user_id,
          entitlement_key: dto.entitlement_key as string,
          scope_type: dto.scope_type ?? null,
          scope_value: dto.scope_value ?? null,
          scope_enum_value: dto.scope_enum_value ?? null,
          revoked_at: null,
        },
        select: { id: true },
      });
      if (held !== null) {
        throw new ApiException(
          409,
          'GRANT_DUPLICATE',
          'An equivalent grant already exists for this subject',
        );
      }
    } else {
      const held = await this.prisma.user_roles.findFirst({
        where: {
          user_id: dto.subject_user_id,
          role_id: dto.role_id as string,
          court_id: dto.court_id ?? null,
          division_id: dto.division_id ?? null,
          revoked_at: null,
        },
        select: { id: true },
      });
      if (held !== null) {
        throw new ApiException(
          409,
          'GRANT_DUPLICATE',
          'An equivalent grant already exists for this subject',
        );
      }
    }

    // A second PENDING request for the same thing is also a duplicate. Letting
    // two stand would let two different approvers each approve one, producing
    // two grants of the same authority with different grantors — the outcome
    // the `FOR UPDATE` in `approve` prevents for a single request, arriving by
    // a different road.
    const pending = await this.prisma.access_grant_requests.findFirst({
      where: {
        status: 'pending',
        subject_user_id: dto.subject_user_id,
        grant_type: dto.grant_type,
        role_id: dto.role_id ?? null,
        entitlement_key: dto.entitlement_key ?? null,
        scope_type: dto.scope_type ?? null,
        scope_value: dto.scope_value ?? null,
      },
      select: { id: true },
    });
    if (pending !== null) {
      throw new ApiException(
        409,
        'GRANT_DUPLICATE',
        'An equivalent request is already pending a decision',
      );
    }
  }

  /**
   * The administrative court of a request.
   *
   * Defaults to the requester's own court when the body does not name one.
   * This is what `resource-loader.service.ts` reads back as the request's
   * `court_id`, so it determines who may later approve: an approver must be
   * scoped to that court. Leaving it null would fall back to the SUBJECT's
   * court, which is the wrong boundary — a grant *to* someone in another court
   * is still an administrative act performed *in* the requester's.
   */
  private administrativeCourt(
    principal: Principal,
    dto: CreateGrantRequestDto,
  ): string | null {
    if (dto.court_id !== undefined) return dto.court_id;
    const courts = this.courtsOf(principal);
    return courts[0] ?? null;
  }

  /** Every court the principal is affiliated to, via roles or court scopes. */
  private courtsOf(principal: Principal): string[] {
    const ids = new Set<string>();
    for (const role of principal.roles) {
      if (role.court_id !== undefined) ids.add(role.court_id);
    }
    for (const scope of principal.scopes) {
      if (scope.scope_type === 'court' && scope.scope_value !== undefined) {
        ids.add(scope.scope_value);
      }
    }
    return [...ids];
  }

  private assertPending(request: GrantRequestRow): void {
    if (request.status !== 'pending') {
      throw new ApiException(
        409,
        'GRANT_INVALID_TRANSITION',
        'This action cannot be performed from the current state',
      );
    }
  }

  /** `FRD/Y2-errors.md`'s shared rationale convention. */
  private requireRationale(value: unknown, field: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ApiException(
        422,
        'GRANT_RATIONALE_REQUIRED',
        'A rationale is required',
        { field },
      );
    }
    if (value.trim().length < MIN_RATIONALE_LENGTH) {
      throw new ApiException(
        422,
        'GRANT_RATIONALE_TOO_SHORT',
        `Rationale must be at least ${MIN_RATIONALE_LENGTH} characters`,
        { field },
      );
    }
  }

  /**
   * The 404 for a grant object.
   *
   * Byte-identical in code, status and message to `AbacGuard.notFound` for the
   * same resource type. The guard's 404 is also what a caller sees for a
   * request they may not know exists; if this one read differently, the pair
   * would form an existence oracle over exactly the records whose existence is
   * most sensitive (`TechArch/04-security.md` §7.6).
   */
  private notFound(type: 'access_grant_request' | 'entitlement_grant'): ApiException {
    return new ApiException(
      404,
      `${type.toUpperCase()}_NOT_FOUND`,
      `${NOT_FOUND_LABELS[type]} not found or not accessible`,
    );
  }

  // ---- projections --------------------------------------------------------

  private toRequestView(row: GrantRequestRow): GrantRequestView {
    return {
      id: row.id,
      grant_type: row.grant_type as 'role' | 'entitlement',
      subject_user_id: row.subject_user_id,
      role_id: row.role_id,
      entitlement_key: row.entitlement_key,
      court_id: row.court_id,
      division_id: row.division_id,
      scope_type: row.scope_type,
      scope_value: row.scope_value,
      scope_enum_value: row.scope_enum_value,
      justification: row.justification,
      requested_by: row.requested_by,
      requested_at: new Date(row.requested_at).toISOString(),
      status: row.status as 'pending' | 'approved' | 'denied',
      decided_by: row.decided_by,
      decided_at:
        row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
      is_bootstrap: row.is_bootstrap,

      // ---- the Work Queue projection (TechArch 03a §6.6 `Task`) ----
      task_type: 'approval_request',
      object_reference: {
        object_type: 'access_grant_request',
        object_id: row.id,
      },
      priority: this.priorityOf(row),
      task_status:
        row.status === 'pending'
          ? 'open'
          : row.status === 'approved'
            ? 'completed'
            : 'dismissed',
      created_at: new Date(row.requested_at).toISOString(),
    };
  }

  /**
   * How urgently a human should look at this request.
   *
   * Not cosmetic. Two kinds of grant deserve to surface above routine ones in
   * a reviewer's queue, because approving them carelessly is the most
   * expensive mistake available on this endpoint:
   *
   *   - `access_admin` itself — approving it hands the recipient the authority
   *     to approve further grants, so one inattentive click compounds; and
   *   - a security-designation entitlement (sealed, grand jury, juvenile, …),
   *     which opens material a court has specifically ordered restricted.
   *
   * Everything else is `normal`. Phase 3 may reweigh this; the field exists
   * now so the Work Queue has something real to sort on rather than a
   * constant.
   */
  private priorityOf(row: GrantRequestRow): GrantRequestView['priority'] {
    if (row.entitlement_key === 'access_admin') return 'high';
    if (row.entitlement_key?.startsWith('designation_') === true) return 'high';
    if (row.grant_type === 'role') return 'high';
    return 'normal';
  }

  private toEntitlementGrantView(row: {
    id: string;
    request_id: string | null;
    user_id: string;
    entitlement_key: string;
    scope_type: string | null;
    scope_value: string | null;
    scope_enum_value: string | null;
    granted_by: string;
    granted_at: Date;
    is_bootstrap: boolean;
    revoked_at: Date | null;
    revoked_by: string | null;
  }): GrantView {
    return {
      id: row.id,
      request_id: row.request_id,
      user_id: row.user_id,
      entitlement_key: row.entitlement_key,
      role_id: null,
      scope_type: row.scope_type,
      scope_value: row.scope_value,
      scope_enum_value: row.scope_enum_value,
      granted_by: row.granted_by,
      granted_at: row.granted_at.toISOString(),
      is_bootstrap: row.is_bootstrap,
      revoked_at: row.revoked_at === null ? null : row.revoked_at.toISOString(),
      revoked_by: row.revoked_by,
    };
  }

  private toRoleGrantView(row: {
    id: string;
    request_id: string | null;
    user_id: string;
    role_id: string;
    court_id: string | null;
    division_id: string | null;
    granted_by: string;
    granted_at: Date;
    is_bootstrap: boolean;
    revoked_at: Date | null;
    revoked_by: string | null;
  }): GrantView {
    return {
      id: row.id,
      request_id: row.request_id,
      user_id: row.user_id,
      entitlement_key: null,
      role_id: row.role_id,
      scope_type: row.court_id !== null ? 'court' : null,
      scope_value: row.court_id,
      scope_enum_value: null,
      granted_by: row.granted_by,
      granted_at: row.granted_at.toISOString(),
      is_bootstrap: row.is_bootstrap,
      revoked_at: row.revoked_at === null ? null : row.revoked_at.toISOString(),
      revoked_by: row.revoked_by,
    };
  }
}
