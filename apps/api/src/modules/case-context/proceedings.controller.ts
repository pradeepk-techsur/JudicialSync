import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type { RequestWithPrincipal } from '../../common/principal/principal.types';
import { Resource } from '../policy/resource-descriptor.decorator';
import { clientIp, principalOf } from './cases.controller';
import {
  HearingResponse,
  ProceedingResponse,
  createHearingSchema,
  createProceedingSchema,
  parseBody,
  updateHearingSchema,
  updateProceedingStatusSchema,
} from './dto/case.dto';
import { ProceedingsService } from './proceedings.service';

/**
 * Proceedings and hearings under a case —
 * `FRD/Y1a-api-shared.md` §Case & Docket Model and
 * `TechArch/03a-api-shared.md` §6.2.
 *
 * ## Every route declares `caseIdParam: 'id'`, and that is what makes a sealed
 * case's children sealed
 *
 * Plan 01-07's `ResourceLoaderService` resolves a `proceeding` or `hearing`
 * through its owning case and adopts that case's court, division and
 * **active designations**. So a proceeding of a sealed case is itself sealed,
 * automatically, with no per-route designation logic here.
 *
 * That inheritance is the whole reason `caseIdParam` exists. Omitting it on
 * one route would resolve the child with no owning case, which yields a
 * resource carrying no designations at all — and a sealed case's proceedings
 * would be readable by anyone holding `case_read`. The suite asserts the
 * inheritance (403 `AUTH_DESIGNATION_DENIED` on a sealed case's proceedings)
 * rather than assuming it.
 *
 * Note the entitlement asymmetry in plan 01-02's `action_entitlement_map`:
 * `proceeding/create` and `proceeding/update` both require `case_update`, not
 * a `proceeding_create`. Creating a proceeding IS editing the case, so it is
 * gated as one.
 */
@Controller('cases/:id')
export class ProceedingsController {
  constructor(private readonly proceedings: ProceedingsService) {}

  @Resource({ type: 'proceeding', action: 'read', caseIdParam: 'id' })
  @Get('proceedings')
  async list(
    @Param('id') caseId: string,
  ): Promise<{ proceedings: ProceedingResponse[] }> {
    return { proceedings: await this.proceedings.listProceedings(caseId) };
  }

  @Resource({ type: 'proceeding', action: 'create', caseIdParam: 'id' })
  @Post('proceedings')
  @HttpCode(201)
  async create(
    @Param('id') caseId: string,
    @Body() body: unknown,
    @Req() request: Request & RequestWithPrincipal,
  ): Promise<{ proceeding: ProceedingResponse }> {
    return {
      proceeding: await this.proceedings.createProceeding(
        principalOf(request),
        caseId,
        parseBody(createProceedingSchema, body),
        clientIp(request),
      ),
    };
  }

  /**
   * Close a proceeding. There is no delete — `FRD/F01` Validation: a
   * proceeding with activity "may only be marked `closed`".
   */
  @Resource({
    type: 'proceeding',
    action: 'update',
    idParam: 'pid',
    caseIdParam: 'id',
  })
  @Patch('proceedings/:pid/status')
  async updateStatus(
    @Param('id') caseId: string,
    @Param('pid') proceedingId: string,
    @Body() body: unknown,
    @Req() request: Request & RequestWithPrincipal,
  ): Promise<{ proceeding: ProceedingResponse }> {
    const { status } = parseBody(updateProceedingStatusSchema, body);
    return {
      proceeding: await this.proceedings.updateProceedingStatus(
        principalOf(request),
        caseId,
        proceedingId,
        status,
        clientIp(request),
      ),
    };
  }

  @Resource({ type: 'hearing', action: 'read', caseIdParam: 'id' })
  @Get('proceedings/:pid/hearings')
  async listHearings(
    @Param('id') caseId: string,
    @Param('pid') proceedingId: string,
  ): Promise<{ hearings: HearingResponse[] }> {
    return {
      hearings: await this.proceedings.listHearings(caseId, proceedingId),
    };
  }

  @Resource({ type: 'hearing', action: 'create', caseIdParam: 'id' })
  @Post('proceedings/:pid/hearings')
  @HttpCode(201)
  async createHearing(
    @Param('id') caseId: string,
    @Param('pid') proceedingId: string,
    @Body() body: unknown,
    @Req() request: Request & RequestWithPrincipal,
  ): Promise<{ hearing: HearingResponse }> {
    return {
      hearing: await this.proceedings.createHearing(
        principalOf(request),
        caseId,
        proceedingId,
        parseBody(createHearingSchema, body),
        clientIp(request),
      ),
    };
  }

  /** Record that a scheduled hearing was held. */
  @Resource({
    type: 'hearing',
    action: 'update',
    idParam: 'hid',
    caseIdParam: 'id',
  })
  @Patch('proceedings/:pid/hearings/:hid')
  async updateHearing(
    @Param('id') caseId: string,
    @Param('hid') hearingId: string,
    @Body() body: unknown,
    @Req() request: Request & RequestWithPrincipal,
  ): Promise<{ hearing: HearingResponse }> {
    return {
      hearing: await this.proceedings.updateHearing(
        principalOf(request),
        caseId,
        hearingId,
        parseBody(updateHearingSchema, body),
        clientIp(request),
      ),
    };
  }
}
