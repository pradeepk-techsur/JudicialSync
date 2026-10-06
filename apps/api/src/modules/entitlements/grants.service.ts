import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ApiException } from '../../common/errors/api-error';
import { Principal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { withAudit } from '../audit/with-audit';
import { EntitlementResolverService } from '../identity/entitlement-resolver.service';
import { SessionService } from '../identity/session.service';
import {
  CatalogEntryDto,
  CreateGrantRequestDto,
  PendingGrantRequestDto,
} from './dto/grant.dto';

/**
 * ============================================================================
 * THE GRANT LIFECYCLE — request → approve → (grant), plus deny and revoke
 * ============================================================================
 *
 * The control this class exists to hold is a single sentence from CONTEXT:
 * **a privileged grant requires two distinct people, and the API refuses an
 * approval where `approver == requester` with `403 AUTH_SOD_VIOLATION`.** The
 * same sentence adds the reason the refusal must happen *here* rather than
 * being left to the audit trail: "'the audit trail will catch it' is explicitly
 * not sufficient — the API must refuse."
 *
 * ## Three independent layers, and why none may be removed
 *
 * Separation of duties is enforced in THREE places, each covering a failure
 * mode the others cannot:
 *
 *   1. the Rego `sod_deny` rule (plan 01-02), evaluated by `AbacGuard` BEFORE
 *      this service runs — catches an approval that reaches the HTTP boundary;
 *   2. the explicit check in {@link approve} below — catches a path that
 *      bypassed the guard (a direct service call, an internal caller, a future
 *      route that forgot its descriptor);
 *   3. the table-level `CHECK (decided_by IS NULL OR decided_by <> requested_by)`
 *      on `platform.access_grant_requests` (plan 01-03) — catches a raw SQL
 *      path, including a compromised process using the application's own
 *      credentials.
 *
 * `TechArch/04-security.md` §7.2 requires SoD be "enforced as a policy rule …
 * not an application-layer `if` statement that a future refactor could drop."
 * The service check here does not weaken that — it is defense in depth *behind*
 * the policy rule, because this is the control that keeps a single compromised
 * administrator from granting themselves the entire system. **None of the three
 * may be removed.**
 *
 * ## The invalidation pairing is not optional either
 *
 * Every approval and every revocation calls
 * `EntitlementResolverService.invalidate` then
 * `SessionService.revokeAllForUser`, in that order, AFTER the transaction
 * commits. `FRD/F00` Process step 7 requires the session invalidation; the
 * cache invalidation is its necessary partner (see
 * `EntitlementResolverService`'s class comment). Cache first, so a request
 * racing the revocation cannot repopulate the cache from pre-change data.
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

  /**
   * `POST /entitlements/requests` — open a grant request.
   *
   * Writes an `access_grant_requests` row with `requested_by =
   * principal.user_id`, `status = 'pending'`, `is_bootstrap = false`, and its
   * `approval`-type audit event, atomically through {@link withAudit}.
   */
  async request(
    principal: Principal,
    dto: CreateGrantRequestDto,
  ): Promise<{ id: string }> {
    // --- the subject must exist and be active ------------------------------
    const subject = await this.prisma.users.findUnique({
      where: { id: dto.subject_user_id },
      select: { id: true, status: true },
    });
    if (subject === null || subject.status !== 'active') {
      throw new ApiException(
        422,
        'GRANT_SUBJECT_INVALID',
        'The subject user does not exist or is not active',
      );
    }

    // --- the target role or entitlement must resolve in its catalog --------
    if (dto.grant_type === 'role') {
      const role = await this.prisma.roles.findUnique({
        where: { id: dto.role_id },
        select: { id: true },
      });
      if (role === null) {
        throw new ApiException(
          422,
          'GRANT_UNKNOWN_ROLE',
          'The requested role does not exist',
        );
      }
    } else {
      // An entitlement absent from the catalog is a 422, never a silently
      // created definition — a request for a capability nobody defined is a
      // typo or an attack, not an instruction to invent the capability.
      const definition = await this.prisma.entitlement_definitions.findUnique({
        where: { entitlement_key: dto.entitlement_key },
        select: { entitlement_key: true },
      });
      if (definition === null) {
        throw new ApiException(
          422,
          'GRANT_UNKNOWN_ENTITLEMENT',
          'The requested entitlement is not in the catalog',
        );
      }
    }

    // --- an identical non-revoked grant must not already exist -------------
    await this.assertNoDuplicateActiveGrant(dto);

    const outcome = await withAudit(this.prisma, this.audit, async (tx) => {
      const created = await tx.access_grant_requests.create({
        data: {
          grant_type: dto.grant_type,
          subject_user_id: dto.subject_user_id,
          role_id: dto.grant_type === 'role' ? dto.role_id : null,
          entitlement_key:
            dto.grant_type === 'entitlement' ? dto.entitlement_key : null,
          court_id: dto.court_id ?? null,
          division_id: dto.division_id ?? null,
          scope_type: dto.scope_type ?? null,
          scope_value: dto.scope_value ?? null,
          scope_enum_value: dto.scope_enum_value ?? null,
          justification: dto.justification,
          requested_by: principal.user_id,
          status: 'pending',
          is_bootstrap: false,
        },
        select: { id: true },
      });

      return {
        result: created,
        audit: {
          actor_id: principal.user_id,
          action_type: 'approval' as const,
          object_type: 'access_grant_request',
          object_id: created.id,
          after_state: {
            event: 'grant_requested',
            subject_user_id: dto.subject_user_id,
            grant_type: dto.grant_type,
            role_id: dto.grant_type === 'role' ? dto.role_id : null,
            entitlement_key:
              dto.grant_type === 'entitlement' ? dto.entitlement_key : null,
            scope_type: dto.scope_type ?? null,
            scope_value: dto.scope_value ?? null,
            scope_enum_value: dto.scope_enum_value ?? null,
            justification: dto.justification,
            requested_by: principal.user_id,
          },
        },
      };
    });

    return { id: outcome.id };
  }

  /**
   * `POST /entitlements/requests/{id}/approve` — the control that matters.
   *
   * Materializes the grant only if the approver is a DIFFERENT person from the
   * requester. See the class comment for why the check below is deliberately
   * redundant with the Rego rule and the table CHECK, and why none of the three
   * may be removed.
   */
  async approve(
    principal: Principal,
    requestId: string,
  ): Promise<{ grant_id: string; subject_user_id: string }> {
    const result = await withAudit(this.prisma, this.audit, async (tx) => {
      // 1. Load FOR UPDATE inside the transaction. Two approvers clicking at
      //    once must not both succeed: the row lock makes the second wait, and
      //    it then sees status='approved' and is rejected at step 3.
      const rows = await tx.$queryRaw<
        {
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
          status: string;
          requested_by: string;
          is_bootstrap: boolean;
        }[]
      >`
        SELECT id, grant_type, subject_user_id, role_id, entitlement_key,
               court_id, division_id, scope_type, scope_value, scope_enum_value,
               status, requested_by, is_bootstrap
          FROM platform.access_grant_requests
         WHERE id = ${requestId}::uuid
           FOR UPDATE
      `;
      const req = rows[0];
      if (req === undefined) {
        throw new ApiException(
          404,
          'ACCESS_GRANT_REQUEST_NOT_FOUND',
          'Access request not found or not accessible',
        );
      }

      // 2. SEPARATION OF DUTIES. This check is DELIBERATELY REDUNDANT with the
      //    Rego `sod_deny` rule (plan 01-02) and the table CHECK
      //    (decided_by <> requested_by, plan 01-03). The three are not
      //    duplication to be consolidated — each covers a different failure
      //    mode: a bypassed guard, a direct service call, a raw SQL path.
      //    NONE OF THE THREE MAY BE REMOVED. The message and code are verbatim
      //    from FRD/F00 Error States.
      if (req.requested_by === principal.user_id) {
        throw new ApiException(
          403,
          'AUTH_SOD_VIOLATION',
          'Separation-of-duties violation: cannot approve your own request',
        );
      }

      // 3. Only a pending request may be decided.
      if (req.status !== 'pending') {
        throw new ApiException(
          409,
          'GRANT_INVALID_TRANSITION',
          `Request is ${req.status}; only a pending request may be approved`,
        );
      }

      // 4. Record the decision.
      await tx.access_grant_requests.update({
        where: { id: req.id },
        data: {
          status: 'approved',
          decided_by: principal.user_id,
          decided_at: new Date(),
        },
      });

      // 5. Materialize the grant. Both tables are append-only except for
      //    revoked_at/revoked_by, so this is an INSERT.
      const grantId = await this.materialize(tx, req, principal.user_id);

      // 6. Audit, naming BOTH identities (US-0.3: "including both the requester
      //    and approver identities").
      return {
        result: { grant_id: grantId, subject_user_id: req.subject_user_id },
        audit: {
          actor_id: principal.user_id,
          action_type: 'approval' as const,
          object_type: 'access_grant_request',
          object_id: req.id,
          after_state: {
            event: 'grant_approved',
            requester: req.requested_by,
            approver: principal.user_id,
            subject_user_id: req.subject_user_id,
            grant_type: req.grant_type,
            role_id: req.role_id,
            entitlement_key: req.entitlement_key,
            grant_id: grantId,
            is_bootstrap: req.is_bootstrap,
          },
        },
      };
    });

    // 7. AFTER COMMIT — cache first, then sessions. See the class comment.
    await this.applyAccessChange(result.subject_user_id);

    return result;
  }

  /**
   * `POST /entitlements/requests/{id}/deny`.
   *
   * The same SoD check as {@link approve}: a requester must not be able to
   * quietly withdraw-by-denying their own request to mask it. The route
   * declares `action: 'approve'` precisely so `sod.rego`'s single
   * `action == "approve"` rule binds denial exactly as it binds approval; this
   * service check is the behind-the-guard partner.
   */
  async deny(
    principal: Principal,
    requestId: string,
    rationale: string,
  ): Promise<void> {
    await withAudit(this.prisma, this.audit, async (tx) => {
      const rows = await tx.$queryRaw<
        {
          id: string;
          status: string;
          requested_by: string;
          subject_user_id: string;
        }[]
      >`
        SELECT id, status, requested_by, subject_user_id
          FROM platform.access_grant_requests
         WHERE id = ${requestId}::uuid
           FOR UPDATE
      `;
      const req = rows[0];
      if (req === undefined) {
        throw new ApiException(
          404,
          'ACCESS_GRANT_REQUEST_NOT_FOUND',
          'Access request not found or not accessible',
        );
      }

      if (req.requested_by === principal.user_id) {
        throw new ApiException(
          403,
          'AUTH_SOD_VIOLATION',
          'Separation-of-duties violation: cannot approve your own request',
        );
      }

      if (req.status !== 'pending') {
        throw new ApiException(
          409,
          'GRANT_INVALID_TRANSITION',
          `Request is ${req.status}; only a pending request may be denied`,
        );
      }

      await tx.access_grant_requests.update({
        where: { id: req.id },
        data: {
          status: 'denied',
          decided_by: principal.user_id,
          decided_at: new Date(),
        },
      });

      return {
        result: undefined,
        audit: {
          actor_id: principal.user_id,
          action_type: 'approval' as const,
          object_type: 'access_grant_request',
          object_id: req.id,
          after_state: {
            event: 'grant_denied',
            requester: req.requested_by,
            decided_by: principal.user_id,
            subject_user_id: req.subject_user_id,
            rationale,
          },
        },
      };
    });
  }

  /**
   * `POST /entitlements/grants/{id}/revoke`.
   *
   * Sets `revoked_at`/`revoked_by` — the only columns `app_rw` may UPDATE on
   * `entitlement_grants` — and never deletes the row: the historical fact that
   * access was once held is part of the record. Followed by the same
   * invalidate + revoke-sessions pair as approval.
   *
   * Revocation is SINGLE-STEP by design — removing access is not the dangerous
   * direction, so SoD deliberately does not fire on it (the route's
   * `entitlement_grant`/`revoke` descriptor leaves `requested_by` null, so
   * `sod.rego` has nothing to compare).
   */
  async revoke(
    principal: Principal,
    grantId: string,
    rationale: string,
  ): Promise<void> {
    const subjectUserId = await withAudit(
      this.prisma,
      this.audit,
      async (tx) => {
        const rows = await tx.$queryRaw<
          {
            id: string;
            user_id: string;
            entitlement_key: string;
            revoked_at: Date | null;
          }[]
        >`
          SELECT id, user_id, entitlement_key, revoked_at
            FROM platform.entitlement_grants
           WHERE id = ${grantId}::uuid
             FOR UPDATE
        `;
        const grant = rows[0];
        if (grant === undefined) {
          throw new ApiException(
            404,
            'ENTITLEMENT_GRANT_NOT_FOUND',
            'Entitlement grant not found or not accessible',
          );
        }

        if (grant.revoked_at !== null) {
          throw new ApiException(
            409,
            'GRANT_INVALID_TRANSITION',
            'This grant is already revoked',
          );
        }

        await tx.entitlement_grants.update({
          where: { id: grant.id },
          data: { revoked_at: new Date(), revoked_by: principal.user_id },
        });

        return {
          result: grant.user_id,
          audit: {
            actor_id: principal.user_id,
            action_type: 'approval' as const,
            object_type: 'entitlement_grant',
            object_id: grant.id,
            after_state: {
              event: 'grant_revoked',
              revoked_by: principal.user_id,
              subject_user_id: grant.user_id,
              entitlement_key: grant.entitlement_key,
              rationale,
            },
          },
        };
      },
    );

    await this.applyAccessChange(subjectUserId);
  }

  /**
   * Pending requests, shaped for Phase 3's Work Queue.
   *
   * Scope narrowing of *which* pending requests a caller may see is the PDP's
   * job via the `access_grant_request`/`read` descriptor on the route; by the
   * time control reaches here the caller has already been authorized to read
   * the collection. The shape — `object_reference` + `priority` — mirrors the
   * `Task` shape in `TechArch/03a-api-shared.md` §6.6 so the queue consumes it
   * unchanged (CONTEXT: "without rework"). No queue, task row or assignment is
   * created.
   */
  async listPending(
    _principal: Principal,
  ): Promise<PendingGrantRequestDto[]> {
    const rows = await this.prisma.access_grant_requests.findMany({
      where: { status: 'pending' },
      orderBy: { requested_at: 'asc' },
      select: {
        id: true,
        grant_type: true,
        subject_user_id: true,
        role_id: true,
        entitlement_key: true,
        court_id: true,
        division_id: true,
        scope_type: true,
        scope_value: true,
        scope_enum_value: true,
        justification: true,
        requested_by: true,
        requested_at: true,
        is_bootstrap: true,
      },
    });

    return rows.map((row) => ({
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
      requested_at: row.requested_at.toISOString(),
      is_bootstrap: row.is_bootstrap,
      object_reference: {
        object_type: 'access_grant_request',
        object_id: row.id,
      },
      priority: 'normal',
    }));
  }

  /** `GET /entitlements/catalog` — the defined entitlements. */
  async catalog(): Promise<CatalogEntryDto[]> {
    const rows = await this.prisma.entitlement_definitions.findMany({
      orderBy: { entitlement_key: 'asc' },
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
   * Insert the materialized grant for an approved request.
   *
   * `entitlement` → `entitlement_grants`; `role` → `user_roles`. Both carry
   * `granted_by`, `granted_at` (the column default) and `request_id` for
   * traceability back to the approving request. Exposed as a `tx`-taking
   * method so it participates in the approval transaction — the grant and its
   * audit event commit together or not at all.
   */
  private async materialize(
    tx: Prisma.TransactionClient,
    req: {
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
      is_bootstrap: boolean;
    },
    grantedBy: string,
  ): Promise<string> {
    if (req.grant_type === 'entitlement') {
      if (req.entitlement_key === null) {
        // Unreachable: the table CHECK guarantees an entitlement request has a
        // key. Asserted rather than `!`-ed so a schema change that broke the
        // invariant fails loudly here rather than inserting a null key.
        throw new ApiException(
          409,
          'GRANT_INVALID_TRANSITION',
          'Entitlement request has no entitlement_key',
        );
      }
      const grant = await tx.entitlement_grants.create({
        data: {
          request_id: req.id,
          user_id: req.subject_user_id,
          entitlement_key: req.entitlement_key,
          scope_type: req.scope_type,
          scope_value: req.scope_value,
          scope_enum_value: req.scope_enum_value,
          granted_by: grantedBy,
          is_bootstrap: req.is_bootstrap,
        },
        select: { id: true },
      });
      return grant.id;
    }

    if (req.role_id === null) {
      throw new ApiException(
        409,
        'GRANT_INVALID_TRANSITION',
        'Role request has no role_id',
      );
    }
    const userRole = await tx.user_roles.create({
      data: {
        user_id: req.subject_user_id,
        role_id: req.role_id,
        court_id: req.court_id,
        division_id: req.division_id,
        granted_by: grantedBy,
        request_id: req.id,
        is_bootstrap: req.is_bootstrap,
      },
      select: { id: true },
    });
    return userRole.id;
  }

  /**
   * The post-commit access change: drop the cached principal, then revoke the
   * subject's sessions.
   *
   * `SessionService.revokeAllForUser` already calls `invalidate` internally, so
   * calling `invalidate` first here is belt-and-braces that also fixes the
   * ordering: the cache is cleared before sessions are revoked, so a request
   * racing the revocation cannot repopulate the cache from pre-change data.
   */
  private async applyAccessChange(subjectUserId: string): Promise<void> {
    await this.entitlements.invalidate(subjectUserId);
    await this.sessions.revokeAllForUser(subjectUserId);
  }

  /**
   * Reject a request that duplicates a live grant.
   *
   * "Identical" is the same subject and the same role/entitlement at the same
   * scope with a non-revoked materialized grant. A second request for a
   * privilege the subject already holds is noise at best and a confusion attack
   * at worst (approve the duplicate, revoke the original, access survives). It
   * is a `409 GRANT_DUPLICATE`, not a silent no-op.
   */
  private async assertNoDuplicateActiveGrant(
    dto: CreateGrantRequestDto,
  ): Promise<void> {
    if (dto.grant_type === 'entitlement') {
      const existing = await this.prisma.entitlement_grants.findFirst({
        where: {
          user_id: dto.subject_user_id,
          entitlement_key: dto.entitlement_key,
          scope_type: dto.scope_type ?? null,
          scope_value: dto.scope_value ?? null,
          scope_enum_value: dto.scope_enum_value ?? null,
          revoked_at: null,
        },
        select: { id: true },
      });
      if (existing !== null) {
        throw new ApiException(
          409,
          'GRANT_DUPLICATE',
          'The subject already holds this entitlement at this scope',
        );
      }
      return;
    }

    const existing = await this.prisma.user_roles.findFirst({
      where: {
        user_id: dto.subject_user_id,
        role_id: dto.role_id,
        court_id: dto.court_id ?? null,
        division_id: dto.division_id ?? null,
        revoked_at: null,
      },
      select: { id: true },
    });
    if (existing !== null) {
      throw new ApiException(
        409,
        'GRANT_DUPLICATE',
        'The subject already holds this role at this scope',
      );
    }
  }
}
