import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { ApiException } from '../../common/errors/api-error';
import { Resource } from '../policy/resource-descriptor.decorator';
import { CaseContextService } from './case-context.service';
import { CasesService } from './cases.service';
import {
  CaseResponse,
  CreateCaseSchema,
  ListCasesQuerySchema,
  UpdateCaseStatusSchema,
} from './dto/case.dto';
import { principalOf } from './principal-of';

/**
 * ============================================================================
 * `/cases` — the case family
 * ============================================================================
 *
 * Every route carries exactly one `@Resource()` descriptor. `AbacGuard` reads
 * it, loads the target's real attributes, and asks OPA — there is no
 * authorization logic in this controller, by design (`TechArch/04-security.md`
 * §7.2). Each `(type, action)` pair below has a row in plan 01-02's
 * `action_entitlement_map`; an unmapped pair would be denied silently, so none
 * is invented here.
 *
 * `PATCH /cases/{id}/status` is the **only** removal mechanism. There is no
 * `@Delete` here or anywhere under this module — removal is a status
 * transition, and `case-no-delete.e2e-spec.ts` proves the route does not exist.
 */
@Controller('cases')
export class CasesController {
  constructor(
    private readonly cases: CasesService,
    private readonly context: CaseContextService,
  ) {}

  @Resource({ type: 'case', action: 'create' })
  @Post()
  async create(@Req() request: Request, @Body() body: unknown): Promise<CaseResponse> {
    const parsed = CreateCaseSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    return this.cases.create(principalOf(request), parsed.data);
  }

  @Resource({ type: 'case', action: 'read' })
  @Get()
  async list(
    @Req() request: Request,
    @Query() query: unknown,
  ): Promise<{ cases: CaseResponse[]; total: number }> {
    const parsed = ListCasesQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const cases = await this.context.listCasesForPrincipal(
      principalOf(request),
      parsed.data,
    );
    return { cases, total: cases.length };
  }

  @Resource({ type: 'case', action: 'read', idParam: 'id' })
  @Get(':id')
  async get(@Param('id') id: string): Promise<CaseResponse> {
    return this.cases.get(id);
  }

  @Resource({ type: 'case', action: 'update', idParam: 'id' })
  @Patch(':id/status')
  async updateStatus(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<CaseResponse> {
    const parsed = UpdateCaseStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    return this.cases.updateStatus(principalOf(request), id, parsed.data.status);
  }
}

/**
 * A validation failure as a 422 carrying field PATHS only.
 *
 * Zod's default messages can echo submitted values, and a case body may carry
 * sensitive content (`FRD/Y2-errors.md` principle 4). So the detail is the set
 * of failing field paths, never the values.
 */
export function validationError(error: {
  issues: Array<{ path: Array<string | number> }>;
}): ApiException {
  return new ApiException(422, 'REQUEST_VALIDATION_FAILED', 'The request failed validation', {
    fields: error.issues.map((i) => i.path.join('.')),
  });
}
