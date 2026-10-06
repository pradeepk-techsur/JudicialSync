import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Resource } from '../policy/resource-descriptor.decorator';
import { validationError } from './cases.controller';
import {
  CreateHearingSchema,
  CreateProceedingSchema,
  HearingResponse,
  ProceedingResponse,
  UpdateHearingSchema,
  UpdateProceedingStatusSchema,
} from './dto/docket.dto';
import { principalOf } from './principal-of';
import { ProceedingsService } from './proceedings.service';

/**
 * ============================================================================
 * `/cases/{id}/proceedings` and `/.../hearings`
 * ============================================================================
 *
 * Every route carries one `@Resource` descriptor from plan 01-09's table,
 * each pair present in plan 01-02's `action_entitlement_map`. The `caseIdParam`
 * is what lets the ABAC loader resolve a child's attributes through its owning
 * case — so a sealed case's proceedings and hearings inherit its protection
 * automatically. `AbacGuard` decides; nothing here re-checks authorization.
 */
@Controller('cases/:id')
export class ProceedingsController {
  constructor(private readonly svc: ProceedingsService) {}

  @Resource({ type: 'proceeding', action: 'read', caseIdParam: 'id' })
  @Get('proceedings')
  async listProceedings(@Param('id') caseId: string): Promise<{ proceedings: ProceedingResponse[] }> {
    return { proceedings: await this.svc.listProceedings(caseId) };
  }

  @Resource({ type: 'proceeding', action: 'create', caseIdParam: 'id' })
  @Post('proceedings')
  async createProceeding(
    @Req() request: Request,
    @Param('id') caseId: string,
    @Body() body: unknown,
  ): Promise<ProceedingResponse> {
    const parsed = CreateProceedingSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error);
    return this.svc.createProceeding(principalOf(request), caseId, parsed.data);
  }

  @Resource({ type: 'proceeding', action: 'update', idParam: 'pid', caseIdParam: 'id' })
  @Patch('proceedings/:pid/status')
  async updateProceedingStatus(
    @Req() request: Request,
    @Param('id') caseId: string,
    @Param('pid') proceedingId: string,
    @Body() body: unknown,
  ): Promise<ProceedingResponse> {
    const parsed = UpdateProceedingStatusSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error);
    return this.svc.updateProceedingStatus(
      principalOf(request),
      caseId,
      proceedingId,
      parsed.data.status,
    );
  }

  @Resource({ type: 'hearing', action: 'read', caseIdParam: 'id' })
  @Get('proceedings/:pid/hearings')
  async listHearings(
    @Param('id') caseId: string,
    @Param('pid') proceedingId: string,
  ): Promise<{ hearings: HearingResponse[] }> {
    return { hearings: await this.svc.listHearings(caseId, proceedingId) };
  }

  @Resource({ type: 'hearing', action: 'create', caseIdParam: 'id' })
  @Post('proceedings/:pid/hearings')
  async createHearing(
    @Req() request: Request,
    @Param('id') caseId: string,
    @Param('pid') proceedingId: string,
    @Body() body: unknown,
  ): Promise<HearingResponse> {
    const parsed = CreateHearingSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error);
    return this.svc.createHearing(principalOf(request), caseId, proceedingId, parsed.data);
  }

  @Resource({ type: 'hearing', action: 'update', idParam: 'hid', caseIdParam: 'id' })
  @Patch('proceedings/:pid/hearings/:hid')
  async updateHearing(
    @Req() request: Request,
    @Param('id') caseId: string,
    @Param('pid') proceedingId: string,
    @Param('hid') hearingId: string,
    @Body() body: unknown,
  ): Promise<HearingResponse> {
    const parsed = UpdateHearingSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error);
    return this.svc.updateHearing(
      principalOf(request),
      caseId,
      proceedingId,
      hearingId,
      parsed.data,
    );
  }
}
