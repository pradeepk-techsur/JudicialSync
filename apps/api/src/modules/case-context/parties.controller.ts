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
  PartyResponse,
  createPartySchema,
  parseBody,
  updatePartyStatusSchema,
} from './dto/case.dto';
import { ProceedingsService } from './proceedings.service';

/**
 * Parties on a case — `FRD/Y1a-api-shared.md` §Case & Docket Model.
 *
 * `FRD/F01` Process step 4: parties are associated with a role designation
 * (`defendant`, `government`, `plaintiff`, `counsel`, `pro_se`), "sourced from
 * CM/ECF where available" — hence the provenance fields on the create body.
 *
 * **Removing a party is `PATCH .../status` to `withdrawn`.** Counsel
 * withdrawing from a matter is a docket fact with a date and a reason, not the
 * erasure of their ever having appeared; a hard delete would make the case
 * history read as though the representation never happened. This is CONTEXT's
 * "removal is always a status transition" applied to the entity where the
 * difference between the two is most visible.
 */
@Controller('cases/:id')
export class PartiesController {
  constructor(private readonly parties: ProceedingsService) {}

  @Resource({ type: 'party', action: 'read', caseIdParam: 'id' })
  @Get('parties')
  async list(@Param('id') caseId: string): Promise<{ parties: PartyResponse[] }> {
    return { parties: await this.parties.listParties(caseId) };
  }

  @Resource({ type: 'party', action: 'create', caseIdParam: 'id' })
  @Post('parties')
  @HttpCode(201)
  async create(
    @Param('id') caseId: string,
    @Body() body: unknown,
    @Req() request: Request & RequestWithPrincipal,
  ): Promise<{ party: PartyResponse }> {
    return {
      party: await this.parties.createParty(
        principalOf(request),
        caseId,
        parseBody(createPartySchema, body),
        clientIp(request),
      ),
    };
  }

  @Resource({
    type: 'party',
    action: 'update',
    idParam: 'pid',
    caseIdParam: 'id',
  })
  @Patch('parties/:pid/status')
  async updateStatus(
    @Param('id') caseId: string,
    @Param('pid') partyId: string,
    @Body() body: unknown,
    @Req() request: Request & RequestWithPrincipal,
  ): Promise<{ party: PartyResponse }> {
    const { status } = parseBody(updatePartyStatusSchema, body);
    return {
      party: await this.parties.updatePartyStatus(
        principalOf(request),
        caseId,
        partyId,
        status,
        clientIp(request),
      ),
    };
  }
}
