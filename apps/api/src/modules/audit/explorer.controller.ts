import {
  ArgumentsHost,
  Catch,
  Controller,
  Get,
  Query,
  Req,
  UseFilters,
} from '@nestjs/common';
import type { Request } from 'express';

import { ApiException } from '../../common/errors/api-error';
import { ApiExceptionFilter } from '../../common/errors/api-exception.filter';
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
 * Re-code the PDP's generic entitlement denial into the audit-specific one.
 *
 * `AbacGuard` denies a missing `audit_reader` with `403 AUTH_SCOPE_DENIED` —
 * correct, and deliberately generic: the guard is shared by every protected
 * route in the system and does not know which one it just refused.
 *
 * `FRD/F02` Error States specifies something more precise for *this* route:
 * `403 AUDIT_READ_DENIED` / "You do not have audit explorer access", which
 * `Screen-17` renders as a whole-screen Alert ("Entire screen replaced with
 * Alert") rather than as an inline access message. A client cannot pick that
 * branch from `AUTH_SCOPE_DENIED`, because that same code also means "wrong
 * court" on fifty other routes.
 *
 * The translation is scoped to this controller rather than added to
 * `AbacGuard`'s shared reason table, where it would relabel every other
 * route's scope denial as an audit failure.
 *
 * **It only ever narrows.** Status stays 403, the denial stays a denial, and
 * every other error — including the 404 existence-hiding path, which must stay
 * byte-identical to a genuine not-found — passes through untouched. A filter
 * that changed a status or turned a deny into anything else would be a
 * security change; this one changes a string.
 *
 * Extending `ApiExceptionFilter` rather than reimplementing it keeps the
 * `{error_code, message, detail?}` envelope and the "never leak an internal
 * message" rule in one place (`FRD/Y2-errors.md` principle 4).
 */
@Catch()
export class AuditReadDeniedFilter extends ApiExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (
      exception instanceof ApiException &&
      exception.getStatus() === 403 &&
      exception.errorCode === 'AUTH_SCOPE_DENIED'
    ) {
      super.catch(
        new ApiException(
          403,
          'AUDIT_READ_DENIED',
          'You do not have audit explorer access',
        ),
        host,
      );
      return;
    }

    super.catch(exception, host);
  }
}

/**
 * ============================================================================
 * `GET /api/v1/audit/explorer` — THE READ-ONLY ACCOUNTABILITY SURFACE
 * ============================================================================
 *
 * `FRD/Y1a-api-shared.md` §Audit: "`GET /audit/explorer` · query: `case_id,
 * user_id, date_range, object_type` · `{audit_events[]}` · **Requires
 * `audit_reader` entitlement**."
 *
 * ## There is exactly one `@Get` here, and that is a structural guarantee
 *
 * `US-2.3`: "Audit Explorer is read-only; no edit or delete affordance exists
 * anywhere in the UI." A UI without an edit button is a presentation choice; a
 * controller without a write handler is a property of the system. The plan's
 * verification greps this file for `@Post`, `@Patch`, `@Put` and `@Delete` and
 * fails if any appears — so a later plan cannot add "just a small annotation
 * endpoint" here without the gate firing.
 *
 * The only write path into `audit_events` is `POST /audit/events`
 * (service-to-service only, plan 01-05), and beneath that the database holds
 * no UPDATE or DELETE grant for `app_rw` at all.
 *
 * ## `audit_reader` is enforced by the descriptor below, and nowhere else
 *
 * `@Resource({type:'audit_event', action:'read'})` is bound in
 * `policy/judicialsync/authz/abac.rego`'s `action_entitlement_map` to
 * `audit_reader`. `AbacGuard` loads, asks OPA, and denies — so an operational
 * editor holding `case_update` and not `audit_reader` is refused here before
 * the handler runs. The seeded distribution makes that falsifiable rather than
 * asserted: `clerk_case_admin` holds five edit entitlements and no
 * `audit_reader`; `security_officer` holds `audit_reader` and no `case_read`.
 *
 * `AuditExplorerService` deliberately contains **no second entitlement check**.
 * One enforcement point, and it is the PDP.
 *
 * ## Why the 403 is re-coded
 *
 * The PDP reports `AUTH_SCOPE_DENIED` for a missing entitlement — it is a
 * generic policy verdict and does not know which route it denied. `FRD/F02`
 * Error States specifies the audit-specific code and wording for this route:
 * `403 AUDIT_READ_DENIED` / "You do not have audit explorer access", which
 * `Screen-17` renders as a whole-screen Alert. The translation happens here,
 * on the one route it applies to, rather than in the guard's shared reason
 * table where it would mislabel every other route's scope denial.
 */
@Controller('audit')
@UseFilters(AuditReadDeniedFilter)
export class AuditExplorerController {
  constructor(private readonly explorer: AuditExplorerService) {}

  @Resource({ type: 'audit_event', action: 'read' })
  @Get('explorer')
  async query(
    @Req() request: Request,
    @Query() query: unknown,
  ): Promise<AuditExplorerResponse> {
    const parsed = AuditExplorerQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'The request failed validation',
        // Field paths only. Zod messages can echo submitted values, and a
        // `case_id` is itself sensitive (FRD/Y2-errors.md principle 4).
        { fields: parsed.error.issues.map((issue) => issue.path.join('.')) },
      );
    }

    return this.explorer.query(principalOf(request), parsed.data, {
      route: routeOf(request),
      method: request.method ?? 'GET',
      clientIp: clientIp(request),
    });
  }
}

/**
 * The principal attached by `SessionAuthGuard`.
 *
 * Absent means the guard did not run, which can only happen if this route lost
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

/**
 * The matched route pattern, for the audit record.
 *
 * The pattern rather than the concrete URL, for the same reason `AbacGuard`
 * prefers it: a concrete Explorer URL carries the filter's case id in its
 * query string, and writing that into `after_state.route` would duplicate what
 * the structured `filter` field already records while widening what a log line
 * discloses.
 */
function routeOf(request: Request): string {
  const base = request.baseUrl ?? '';
  const pattern = (request.route as { path?: string } | undefined)?.path;
  if (typeof pattern === 'string' && pattern !== '') {
    return `${base}${pattern}`;
  }
  return (request.originalUrl ?? request.url ?? '').split('?')[0];
}

/** Best-effort client address for the audit record. */
function clientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    return forwarded.split(',')[0].trim();
  }
  return request.ip ?? request.socket?.remoteAddress ?? null;
}
