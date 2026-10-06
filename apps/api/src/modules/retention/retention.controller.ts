import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import { ApiException } from '../../common/errors/api-error';
import {
  Principal,
  RequestWithPrincipal,
} from '../../common/principal/principal.types';
import { Resource } from '../policy/resource-descriptor.decorator';
import {
  DueForDispositionDto,
  RetentionScheduleDto,
  RetentionService,
} from './retention.service';

/**
 * The `confirmation` object on a disposition request.
 *
 * Validated for SHAPE here; the SUBSTANCE check — that `confirmed_by` is the
 * caller and `rationale` is sufficient — is `DispositionGuard`'s, so that the
 * `403 SECURITY_DISPOSITION_UNCONFIRMED` the FRD specifies comes from one
 * place rather than being split between a 422 here and a 403 there.
 */
const CreateDispositionSchema = z
  .object({
    object_type: z.string().min(1).max(128),
    object_id: z.string().uuid(),
    disposition_action: z.string().min(1).max(128),
    confirmation: z
      .object({
        confirmed_by: z.string().optional(),
        rationale: z.string().optional(),
      })
      .partial()
      .optional(),
  })
  .strict();

/**
 * ============================================================================
 * THE RETENTION & DISPOSITION SURFACE
 * ============================================================================
 *
 * Two reads and one dangerous write, per `FRD/Y1a-api-shared.md` §Security
 * Baseline:
 *
 *   | GET  | /retention/schedules?court_id=            | retention_viewer |
 *   | GET  | /retention/due-for-disposition?court_id=  | retention_viewer |
 *   | POST | /retention/dispositions                   | disposition_confirm |
 *
 * ## Every route declares exactly one Resource descriptor
 *
 * Plan 01-07's guard denies any route lacking a marker with `503
 * SECURITY_POLICY_UNAVAILABLE`, so an undescriptored route is unreachable
 * rather than merely unguarded. The two reads carry a
 * retention_schedule/read descriptor (→ `retention_viewer` in plan 01-02's
 * map); the write carries a disposition/create descriptor (→
 * `disposition_confirm`).
 *
 * ## The disposition route is gated twice, deliberately
 *
 * The PDP answers *may this principal confirm dispositions at all* (the
 * `disposition_confirm` entitlement, seeded only on `court_admin` and
 * `system_admin`). `DispositionGuard`, called inside the service, answers *is
 * this specific request a genuine human confirmation*. The record-destroying
 * capability needs both, and neither subsumes the other.
 */
@Controller('retention')
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  // No `idParam`: this is a COLLECTION read scoped by the `court_id` query
  // string, not a single schedule row. Plan 01-07's loader resolves a
  // retention_schedule with a null id by reading `court_id` from the merged
  // query/body and scoping the resource to that court — which is exactly the
  // multi-tenancy check this route needs. Passing `idParam: 'court_id'` would
  // instead hand the court UUID to a `retention_schedules.findUnique({id})`
  // lookup and 404 every call.
  @Get('schedules')
  @Resource({ type: 'retention_schedule', action: 'read' })
  async schedules(
    @Query('court_id') courtId: string,
  ): Promise<{ schedules: RetentionScheduleDto[] }> {
    this.requireCourtId(courtId);
    return { schedules: await this.retention.getSchedules(courtId) };
  }

  // Same collection semantics as `schedules` above — scoped by `court_id`
  // query, resolved through the loader's null-id branch.
  @Get('due-for-disposition')
  @Resource({ type: 'retention_schedule', action: 'read' })
  async dueForDisposition(
    @Query('court_id') courtId: string,
    @Req() request: Request,
  ): Promise<{ records: DueForDispositionDto[] }> {
    this.requireCourtId(courtId);
    const principal = this.principalOf(request);
    return {
      records: await this.retention.getDueForDisposition(courtId, principal),
    };
  }

  @Post('dispositions')
  @Resource({ type: 'disposition', action: 'create' })
  async createDisposition(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<{ disposition_log_id: string }> {
    const parsed = CreateDispositionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'The request failed validation',
        // Field paths only — the body names object identifiers, and a zod
        // message can echo submitted values (FRD/Y2-errors.md principle 4).
        { fields: parsed.error.issues.map((issue) => issue.path.join('.')) },
      );
    }

    // The principal may be undefined for a service-token call; DispositionGuard
    // refuses that case explicitly, so it is passed through rather than
    // rejected here (rejecting here would be a 401, not the 403 the FRD wants).
    const principal = (request as Request & RequestWithPrincipal).principal;

    return this.retention.createDisposition(
      request as unknown as { headers: Record<string, unknown> },
      principal,
      parsed.data,
    );
  }

  /** A `court_id` query parameter is required on the two read routes. */
  private requireCourtId(courtId: string | undefined): asserts courtId {
    const ok = z.string().uuid().safeParse(courtId).success;
    if (!ok) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'court_id is required and must be a UUID',
      );
    }
  }

  private principalOf(request: Request): Principal {
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
}
