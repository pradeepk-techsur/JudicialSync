import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { ApiException } from '../../common/errors/api-error';
import {
  Principal,
  RequestWithPrincipal,
} from '../../common/principal/principal.types';
import { Resource } from '../policy/resource-descriptor.decorator';
import {
  AuditExplorerQuerySchema,
  AuditExplorerResponse,
} from './dto/explorer.dto';
import { AuditExplorerService } from './explorer.service';

/**
 * ============================================================================
 * `GET /api/v1/audit/explorer` — THE AUDIT EXPLORER READ API
 * ============================================================================
 *
 * `FRD/Y1a-api-shared.md` §Audit · `TechArch/03a-api-shared.md` §6.3 ·
 * `Screen-17`.
 *
 * ## Separation of duties is the PDP's, declared once here
 *
 * `@Resource({type:'audit_event', action:'read'})` is the entire access
 * control. Plan 01-02's `action_entitlement_map` binds `(audit_event, read)`
 * to `audit_reader`, so `AbacGuard` denies a caller without it **before this
 * controller runs** — surfacing as `403 AUDIT_READ_DENIED` via plan 01-07's
 * reason-code table. There is no second entitlement check in the service; one
 * enforcement point, and it is the PDP. `US-2.3`'s "operational edit rights do
 * not imply audit read access" is a property of that single binding plus the
 * seed's grant distribution, proven by the named e2e test.
 *
 * ## This controller is read-only, structurally
 *
 * `US-2.3`: "Audit Explorer is read-only; no edit or delete affordance exists
 * anywhere in the UI." The controller exposes ONLY `@Get` handlers — no
 * `@Post`, `@Patch`, `@Put` or `@Delete` — and the plan's `<verify>` greps this
 * file to keep it that way. A write verb here would be a contradiction in
 * terms: there is no lawful way to edit an append-only, hash-chained log, and
 * an endpoint that pretended otherwise would be a liability even if it only
 * ever returned 405.
 */
@Controller()
export class AuditExplorerController {
  constructor(private readonly explorer: AuditExplorerService) {}

  /**
   * Filter the audit history.
   *
   * `idParam: 'case_id'` lets `AbacGuard` and the resource loader see the named
   * case when the caller filters by one — the same path a per-record read uses
   * — while an unfiltered call resolves to the collection form (`audit_event`
   * with no id), whose only gate is `audit_reader`. The per-row designation
   * exclusion is the service's own, applied as a SQL pre-filter.
   */
  @Get('audit/explorer')
  @Resource({ type: 'audit_event', action: 'read', idParam: 'case_id' })
  async explore(
    @Query() rawQuery: unknown,
    @Req() request: Request,
  ): Promise<AuditExplorerResponse> {
    const parsed = AuditExplorerQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'The request failed validation',
        // Field paths only — zod messages can echo submitted values, and this
        // query carries case identifiers (FRD/Y2-errors.md principle 4).
        { fields: parsed.error.issues.map((issue) => issue.path.join('.')) },
      );
    }

    return this.explorer.query(principalOf(request), parsed.data, {
      clientIp: clientIp(request),
    });
  }
}

/** The principal attached by `SessionAuthGuard`; a 401 if somehow absent. */
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

/** Best-effort client address for the access-attempt audit record. */
function clientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    return forwarded.split(',')[0].trim();
  }
  return request.ip ?? request.socket?.remoteAddress ?? null;
}
