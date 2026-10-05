import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
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
import { CaseContextService } from './case-context.service';
import { CasesService } from './cases.service';
import {
  CaseContextResponse,
  CaseResponse,
  PartyResponse,
  createCaseSchema,
  listCasesQuerySchema,
  parseBody,
  updateCaseStatusSchema,
} from './dto/case.dto';

/**
 * `/api/v1/cases` — `FRD/Y1a-api-shared.md` §Case & Docket Model and
 * `TechArch/03a-api-shared.md` §6.2.
 *
 * | Method | Path | `@Resource()` |
 * |---|---|---|
 * | POST  | `/cases`              | `case / create` |
 * | GET   | `/cases`              | `case / read`   |
 * | GET   | `/cases/:id`          | `case / read`   |
 * | GET   | `/cases/:id/context`  | `case / read`   |
 * | PATCH | `/cases/:id/status`   | `case / update` |
 *
 * **There is no `@Delete`.** Not a guarded one, not a 501 stub — none. The
 * Phase 1 CONTEXT makes the absence structural: "No hard deletes anywhere in
 * the case model. No `DELETE` endpoints. Removal is always a status
 * transition." A guarded delete route would still be a delete route, and
 * `case-no-delete.e2e-spec.ts` asserts the distinction by requiring 404/405
 * rather than 403 — a 403 would mean the route exists and is merely refusing
 * this caller.
 *
 * Every route carries exactly one `@Resource()`. An unmarked route is denied
 * `503 SECURITY_POLICY_UNAVAILABLE` by plan 01-07's guard, loudly and in
 * production, which is the behaviour that makes "deny by default" true rather
 * than aspirational.
 */
@Controller('cases')
export class CasesController {
  constructor(
    private readonly cases: CasesService,
    private readonly context: CaseContextService,
  ) {}

  /** Manual case creation — a permanent fallback per `FRD/F01` step 1. */
  @Resource({ type: 'case', action: 'create' })
  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Req() request: Request & RequestWithPrincipal,
  ): Promise<{ case: CaseResponse; parties: PartyResponse[] }> {
    return this.cases.create(
      principalOf(request),
      parseBody(createCaseSchema, body),
      clientIp(request),
    );
  }

  /**
   * The case list.
   *
   * Delegates to {@link CaseContextService.listCasesForPrincipal}, which
   * excludes out-of-scope and insufficiently-entitled rows **in SQL**, before
   * the result set exists. The handler deliberately performs no filtering of
   * its own: a `.filter()` here would be the post-hoc redaction
   * `TechArch/04-security.md` §7.6 forbids, and would leave the count,
   * ordering and timing carrying the withheld record's imprint.
   */
  @Resource({ type: 'case', action: 'read' })
  @Get()
  async list(
    @Query() query: unknown,
    @Req() request: Request & RequestWithPrincipal,
  ): Promise<{ cases: CaseResponse[]; total: number }> {
    const filter = parseBody(listCasesQuerySchema, query);
    const cases = await this.context.listCasesForPrincipal(
      principalOf(request),
      filter,
      { clientIp: clientIp(request), route: '/api/v1/cases' },
    );
    // `total` is the length of what was returned, and that is the point: it
    // counts what the caller may see, not what exists. A count computed from
    // an unfiltered query would disclose the sealed matter the rows do not.
    return { cases, total: cases.length };
  }

  @Resource({ type: 'case', action: 'read', idParam: 'id' })
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<{ case: CaseResponse }> {
    return { case: await this.cases.get(id) };
  }

  /**
   * The whole case graph in one response — the shape Phases 5–8 consume.
   *
   * Beyond the §6.2 table, and deliberately so: `FRD/F01` Outputs lists a
   * "`case_context` API response consumable by Evidentiary and Speedy Trial
   * modules", and step 8 requires those modules read context "exclusively
   * through the shared case-context API". Without a route, the service would
   * be reachable only in-process, and a Phase 5 module running out-of-process
   * would have no alternative to the shadow copy F01 forbids.
   */
  @Resource({ type: 'case', action: 'read', idParam: 'id' })
  @Get(':id/context')
  async caseContext(@Param('id') id: string): Promise<CaseContextResponse> {
    return this.context.getCaseContext(id);
  }

  /**
   * The ONLY removal mechanism in the case model.
   *
   * `closed` and `superseded` are what "deleted" means here. The row remains,
   * the audit event records who transitioned it and from what, and
   * `case-no-delete.e2e-spec.ts` asserts the row still exists afterwards.
   */
  @Resource({ type: 'case', action: 'update', idParam: 'id' })
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: Request & RequestWithPrincipal,
  ): Promise<{ case: CaseResponse }> {
    const { status } = parseBody(updateCaseStatusSchema, body);
    return {
      case: await this.cases.updateStatus(
        principalOf(request),
        id,
        status,
        clientIp(request),
      ),
    };
  }
}

/**
 * The authenticated principal, or a 401.
 *
 * Unreachable in practice — `SessionAuthGuard` runs globally and `AbacGuard`
 * refuses a `@Resource()` route with no principal before any handler is
 * entered. It is written anyway because the alternative is a non-null
 * assertion, and the day that assertion is wrong the handler reads
 * `undefined.user_id` and reports a 500 instead of an authentication problem.
 */
export function principalOf(request: RequestWithPrincipal): Principal {
  const principal = request.principal;
  if (principal === undefined) {
    throw new ApiException(
      401,
      'AUTH_SESSION_EXPIRED',
      'Session expired; please sign in again',
    );
  }
  return principal;
}

export function clientIp(request: Request): string | null {
  return request.ip ?? null;
}
