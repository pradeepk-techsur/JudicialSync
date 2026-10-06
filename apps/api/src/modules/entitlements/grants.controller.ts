import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
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
  CatalogEntryDto,
  CreateGrantRequestSchema,
  PendingGrantRequestDto,
  RationaleBodySchema,
} from './dto/grant.dto';
import { GrantsService } from './grants.service';

/**
 * ============================================================================
 * `/api/v1/entitlements/*` — THE GRANT WORKFLOW ROUTES
 * ============================================================================
 *
 * Every route carries exactly one `@Resource` descriptor, which places plan
 * 01-02's Rego `sod_deny` rule *before* the handler runs; `GrantsService`'s own
 * check then catches any path that bypassed the guard. The descriptor table
 * below is load-bearing and every pair exists in plan 01-02's
 * `action_entitlement_map` (an unmapped pair denies silently):
 *
 * | route                                  | descriptor                                        |
 * |----------------------------------------|---------------------------------------------------|
 * | `POST /entitlements/requests`          | `access_grant_request` / `create`                 |
 * | `GET  /entitlements/requests`          | `access_grant_request` / `read`                   |
 * | `GET  /entitlements/catalog`           | `access_grant_request` / `read`                   |
 * | `POST /entitlements/requests/{id}/approve` | `access_grant_request` / `approve` (idParam) |
 * | `POST /entitlements/requests/{id}/deny`    | `access_grant_request` / `approve` (idParam) |
 * | `POST /entitlements/grants/{id}/revoke`    | `entitlement_grant` / `revoke` (idParam)     |
 *
 * Two of those pairings are deliberate and must not be "corrected":
 *
 *  - **deny uses `approve`, not a `deny` action.** `sod.rego` keys on
 *    `action == "approve"`, and a requester quietly denying their own request
 *    must be refused exactly as self-approval is. A separate `deny` action
 *    value would escape the rule.
 *  - **revoke uses `entitlement_grant`, not `access_grant_request`.** The
 *    target is a materialized grant, not the request that produced it, so it
 *    resolves through a different loader path with `requested_by` null — and the
 *    SoD rule deliberately does **not** fire, because revocation is single-step
 *    by design.
 *
 * Knowing which entitlements exist is itself privileged reconnaissance, so the
 * catalog read is gated on `access_admin` exactly as the request read is.
 */
@Controller('entitlements')
export class GrantsController {
  constructor(private readonly grants: GrantsService) {}

  @Post('requests')
  @Resource({ type: 'access_grant_request', action: 'create' })
  @HttpCode(201)
  async requestGrant(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<{ request: { id: string } }> {
    const parsed = CreateGrantRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const created = await this.grants.request(principalOf(request), parsed.data);
    return { request: created };
  }

  @Get('requests')
  @Resource({ type: 'access_grant_request', action: 'read' })
  async listRequests(
    @Req() request: Request,
  ): Promise<{ requests: PendingGrantRequestDto[] }> {
    const requests = await this.grants.listPending(principalOf(request));
    return { requests };
  }

  @Get('catalog')
  @Resource({ type: 'access_grant_request', action: 'read' })
  async catalog(): Promise<{ entitlements: CatalogEntryDto[] }> {
    const entitlements = await this.grants.catalog();
    return { entitlements };
  }

  @Post('requests/:id/approve')
  @Resource({ type: 'access_grant_request', action: 'approve', idParam: 'id' })
  @HttpCode(200)
  async approve(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<{ grant: { id: string } }> {
    const result = await this.grants.approve(principalOf(request), id);
    return { grant: { id: result.grant_id } };
  }

  @Post('requests/:id/deny')
  @Resource({ type: 'access_grant_request', action: 'approve', idParam: 'id' })
  @HttpCode(200)
  async deny(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<{ ok: true }> {
    const parsed = RationaleBodySchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    await this.grants.deny(principalOf(request), id, parsed.data.rationale);
    return { ok: true };
  }

  @Post('grants/:id/revoke')
  @Resource({ type: 'entitlement_grant', action: 'revoke', idParam: 'id' })
  @HttpCode(200)
  async revoke(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<{ ok: true }> {
    const parsed = RationaleBodySchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    await this.grants.revoke(principalOf(request), id, parsed.data.rationale);
    return { ok: true };
  }
}

/**
 * The principal attached by `SessionAuthGuard`.
 *
 * Absent means the guard did not run, which can only happen if a route lost
 * its marking. Throwing beats a non-null assertion — the failure becomes a 401
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

/**
 * A zod failure as the FRD Y2 envelope.
 *
 * Field paths only — zod messages can echo submitted values, and these bodies
 * carry object identifiers and justification text (`FRD/Y2-errors.md`
 * principle 4). A `GRANT_RATIONALE_TOO_SHORT` issue is surfaced with that exact
 * code so a client can branch on it, since the rationale minimum is a specified
 * control rather than generic validation.
 */
function validationError(error: import('zod').ZodError): ApiException {
  const tooShort = error.issues.find(
    (issue) => issue.message === 'GRANT_RATIONALE_TOO_SHORT',
  );
  if (tooShort !== undefined) {
    return new ApiException(
      422,
      'GRANT_RATIONALE_TOO_SHORT',
      'Rationale must be at least 10 characters',
    );
  }
  return new ApiException(
    422,
    'REQUEST_VALIDATION_FAILED',
    'The request failed validation',
    { fields: error.issues.map((issue) => issue.path.join('.')) },
  );
}
