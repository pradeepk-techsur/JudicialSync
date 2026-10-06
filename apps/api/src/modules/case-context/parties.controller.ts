import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Resource } from '../policy/resource-descriptor.decorator';
import { validationError } from './cases.controller';
import {
  CreatePartyInlineSchema,
  PartyResponse,
  UpdatePartyStatusSchema,
} from './dto/docket.dto';
import { principalOf } from './principal-of';
import { ProceedingsService } from './proceedings.service';

/**
 * `/cases/{id}/parties` — party read, manual create, and status transition.
 *
 * A party is removed by transitioning its status to `withdrawn`, never by a
 * DELETE. Each route carries one `@Resource()`; the `caseIdParam` resolves the
 * party's attributes through its owning case, so a sealed case's parties
 * inherit its protection.
 */
@Controller('cases/:id/parties')
export class PartiesController {
  constructor(private readonly svc: ProceedingsService) {}

  @Resource({ type: 'party', action: 'read', caseIdParam: 'id' })
  @Get()
  async list(@Param('id') caseId: string): Promise<{ parties: PartyResponse[] }> {
    return { parties: await this.svc.listParties(caseId) };
  }

  @Resource({ type: 'party', action: 'create', caseIdParam: 'id' })
  @Post()
  async create(
    @Req() request: Request,
    @Param('id') caseId: string,
    @Body() body: unknown,
  ): Promise<PartyResponse> {
    const parsed = CreatePartyInlineSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error);
    return this.svc.createParty(principalOf(request), caseId, parsed.data);
  }

  @Resource({ type: 'party', action: 'update', idParam: 'pid', caseIdParam: 'id' })
  @Patch(':pid/status')
  async updateStatus(
    @Req() request: Request,
    @Param('id') caseId: string,
    @Param('pid') partyId: string,
    @Body() body: unknown,
  ): Promise<PartyResponse> {
    const parsed = UpdatePartyStatusSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error);
    return this.svc.updatePartyStatus(principalOf(request), caseId, partyId, parsed.data.status);
  }
}
