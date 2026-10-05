import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { ApiException } from '../../common/errors/api-error';
import {
  Principal,
  RequestWithPrincipal,
} from '../../common/principal/principal.types';
import { Resource } from '../policy/resource-descriptor.decorator';
import {
  CreateGrantRequestSchema,
  DecisionSchema,
  EntitlementCatalogEntry,
  GrantRequestView,
  GrantView,
  ListRequestsQuerySchema,
} from './dto/grant.dto';
import { GrantsService } from './grants.service';

/**
 * `/api/v1/entitlements/*` — the grant lifecycle.
 *
 * ## Every route carries exactly one descriptor, and every pair is already in
 * the policy map
 *
 * `AbacGuard` is global and denies an unmarked route with 503 (plan 01-07), so
 * the descriptor is not optional. Beyond that, the `(type, action)` pair must
 * have a row in `action_entitlement_map` in
 * `policy/judicialsync/authz/abac.rego` — an unmapped pair denies **silently**,
 * which looks like a permissions problem and is actually a missing table row.
 * Plan 01-02 owns that file; all five pairs below were declared there in
 * advance and are listed in `policy/README.md`:
 *
 * | route | descriptor |
 * |---|---|
 * | `POST   /entitlements/requests`            | `access_grant_request` / `create` |
 * | `GET    /entitlements/requests`            | `access_grant_request` / `read` |
 * | `GET    /entitlements/catalog`             | `access_grant_request` / `read` |
 * | `POST   /entitlements/requests/:id/approve`| `access_grant_request` / `approve` |
 * | `POST   /entitlements/requests/:id/deny`   | `access_grant_request` / `approve` |
 * | `POST   /entitlements/grants/:id/revoke`   | `entitlement_grant` / `revoke` |
 *
 * Three of those rows deserve their reasoning restated here, because each
 * looks like a mistake until you know why:
 *
 * **The catalog is `read` on `access_grant_request`, not public.** Knowing
 * which entitlements exist is privileged reconnaissance: the catalog names
 * `designation_grand_jury`, and learning that entitlement exists is learning
 * this system holds grand-jury material.
 *
 * **Deny is declared as `approve`, not as a `deny` action.** `sod.rego` keys
 * on `action == "approve"`. A requester quietly denying their own request
 * removes it from the queue a reviewer reads — erasing the only visible trace
 * that the ask was made — and must be refused exactly as self-approval is. A
 * separate action value would escape the policy rule entirely, and the
 * resource-descriptor union deliberately has no `deny` member so it cannot be
 * written by accident.
 *
 * **Revoke targets `entitlement_grant`, a different type.** The object is the
 * materialized grant, not the request that produced it, so it resolves through
 * a different loader path — one that leaves `requested_by` null. That is what
 * makes `sod.rego` inapplicable to revocation, which is intended: removing
 * access is not the dangerous direction, and requiring a second approver to
 * revoke would keep a compromised credential live while one is found.
 *
 * ## No Work Queue is built here
 *
 * `GET /entitlements/requests` returns pending grants in the `Task` field
 * shape from `TechArch/03a-api-shared.md` §6.6 so Phase 3's Work Queue (F06)
 * can consume it unchanged. That is the whole of the Phase 1 obligation —
 * CONTEXT asks only that pending grants be "listable via API in Phase 1".
 * There is no task table, no assignment and no ownership here.
 */
@Controller('entitlements')
export class GrantsController {
  constructor(private readonly grants: GrantsService) {}

  /** Step one: ask. Creates no grant. */
  @Resource({ type: 'access_grant_request', action: 'create' })
  @Post('requests')
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<{ request: GrantRequestView }> {
    const parsed = CreateGrantRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'The request failed validation',
        // Field paths only. Zod messages echo submitted values, and this body
        // carries user identifiers (`FRD/Y2-errors.md` principle 4).
        { fields: parsed.error.issues.map((issue) => issue.path.join('.')) },
      );
    }

    return {
      request: await this.grants.request(principalOf(request), parsed.data),
    };
  }

  /**
   * The pending-grant list Phase 3's Work Queue consumes.
   *
   * `?status=` defaults to `pending`; `?is_bootstrap=true` narrows to rows the
   * bootstrap path created, which is how an auditor lists exactly what was
   * granted outside the normal two-person flow.
   */
  @Resource({ type: 'access_grant_request', action: 'read' })
  @Get('requests')
  async list(
    @Query() query: unknown,
    @Req() request: Request,
  ): Promise<{ requests: GrantRequestView[] }> {
    const parsed = ListRequestsQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'The request failed validation',
        { fields: parsed.error.issues.map((issue) => issue.path.join('.')) },
      );
    }

    return {
      requests: await this.grants.listRequests(principalOf(request), {
        status: parsed.data.status,
        isBootstrap: parsed.data.is_bootstrap,
      }),
    };
  }

  /** The entitlement catalog. Privileged — see the class comment. */
  @Resource({ type: 'access_grant_request', action: 'read' })
  @Get('catalog')
  async catalog(): Promise<{ entitlements: EntitlementCatalogEntry[] }> {
    return { entitlements: await this.grants.catalog() };
  }

  /**
   * Step two: a **different person** approves.
   *
   * Refused with `403 AUTH_SOD_VIOLATION` when the approver is the requester —
   * by `sod.rego` in the guard before this handler runs, and again by
   * `GrantsService.approve` if anything ever bypasses the guard.
   */
  @Resource({ type: 'access_grant_request', action: 'approve', idParam: 'id' })
  @Post('requests/:id/approve')
  @HttpCode(200)
  async approve(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<{ grant: GrantView }> {
    return { grant: await this.grants.approve(principalOf(request), id) };
  }

  /** Refuse a request. `approve` action by design — see the class comment. */
  @Resource({ type: 'access_grant_request', action: 'approve', idParam: 'id' })
  @Post('requests/:id/deny')
  @HttpCode(200)
  async deny(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<{ request: GrantRequestView }> {
    return {
      request: await this.grants.deny(
        principalOf(request),
        id,
        rationaleOf(body),
      ),
    };
  }

  /** Withdraw a grant. Single-step by design — see the class comment. */
  @Resource({ type: 'entitlement_grant', action: 'revoke', idParam: 'id' })
  @Post('grants/:id/revoke')
  @HttpCode(200)
  async revoke(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<{ grant: GrantView }> {
    return {
      grant: await this.grants.revoke(
        principalOf(request),
        id,
        rationaleOf(body),
      ),
    };
  }
}

/**
 * The rationale from a decision body.
 *
 * Shape validation only — the LENGTH rule lives in `GrantsService`, so that a
 * direct service call gets the same `GRANT_RATIONALE_TOO_SHORT` as an HTTP
 * one rather than a silently weaker check.
 */
function rationaleOf(body: unknown): string {
  const parsed = DecisionSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new ApiException(
      422,
      'GRANT_RATIONALE_REQUIRED',
      'A rationale is required',
    );
  }
  return parsed.data.rationale;
}

/**
 * The principal attached by `SessionAuthGuard`.
 *
 * Absent means the guard did not run, which can only happen if a route lost
 * its marking. Throwing beats a non-null assertion: the failure becomes a 401
 * rather than a 500 reading `Cannot read properties of undefined`.
 */
function principalOf(request: Request): Principal {
  const principal = (request as Request & RequestWithPrincipal).principal;
  if (principal === undefined) {
    throw new ApiException(
      401,
      'AUTH_SESSION_EXPIRED',
      'Session expired; please sign in again',
    );
  }
  return principal;
}
