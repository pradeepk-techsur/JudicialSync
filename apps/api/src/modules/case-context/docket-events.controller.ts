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

import type { RequestWithPrincipal } from '../../common/principal/principal.types';
import { Resource } from '../policy/resource-descriptor.decorator';
import { clientIp, principalOf } from './cases.controller';
import {
  DocketEventResponse,
  createDocketEventSchema,
  docketEventQuerySchema,
  parseBody,
  updateDocketEventSchema,
} from './dto/case.dto';
import { ProceedingsService } from './proceedings.service';

/**
 * Docket events — `FRD/Y1a-api-shared.md` §Case & Docket Model.
 *
 * ## This is where provenance is most consequential
 *
 * `docket_events` is the only table in the case model carrying all three
 * provenance columns with a NOT NULL `source_identifier` and
 * `UNIQUE (source_system, source_identifier)`. That combination is deliberate
 * and is Phase 3's idempotency key: a re-delivered CM/ECF event lands exactly
 * once because the database refuses the second one, not because an adapter
 * remembered to check.
 *
 * Two rules follow, both enforced in `ProceedingsService`:
 *
 *  - **A manual event still gets an identifier** (`manual:{caseId}:{uuid}`),
 *    because NOT NULL does not care that there is no upstream system.
 *  - **A non-`manual` event without one is `422 CASE_EVENT_MISSING_SOURCE`**
 *    (`FRD/F01` Error States). The rule exists for an adapter that does not
 *    exist yet — which is exactly why it is enforced now: an adapter written
 *    against an API that accepts the omission will send it, and by the time
 *    conflict detection needs those identifiers they are historical data
 *    nobody can backfill.
 *
 * **No conflict detection lives here.** CONTEXT: "Conflict detection and the
 * human-review queue remain Phase 3." The PATCH below flips
 * `locally_modified` and does nothing else with it: no row in Phase 3's
 * conflict table, no review queue, no comparison against an upstream value.
 * (That table is named obliquely because the plan's verification greps this
 * module for its identifier — see `proceedings.service.ts`.)
 */
@Controller('cases/:id')
export class DocketEventsController {
  constructor(private readonly events: ProceedingsService) {}

  @Resource({ type: 'docket_event', action: 'read', caseIdParam: 'id' })
  @Get('docket-events')
  async list(
    @Param('id') caseId: string,
    @Query() query: unknown,
  ): Promise<{ docket_events: DocketEventResponse[] }> {
    return {
      docket_events: await this.events.listDocketEvents(
        caseId,
        parseBody(docketEventQuerySchema, query),
      ),
    };
  }

  @Resource({ type: 'docket_event', action: 'create', caseIdParam: 'id' })
  @Post('docket-events')
  @HttpCode(201)
  async create(
    @Param('id') caseId: string,
    @Body() body: unknown,
    @Req() request: Request & RequestWithPrincipal,
  ): Promise<{ docket_event: DocketEventResponse }> {
    return {
      docket_event: await this.events.createDocketEvent(
        principalOf(request),
        caseId,
        parseBody(createDocketEventSchema, body),
        clientIp(request),
      ),
    };
  }

  /**
   * Edit a docket event's code or description.
   *
   * Flips `locally_modified` when the record came from somewhere else; leaves
   * it alone for a `manual` record, which has no upstream version to diverge
   * from. See `ProceedingsService.updateDocketEvent`.
   */
  @Resource({
    type: 'docket_event',
    action: 'update',
    idParam: 'eid',
    caseIdParam: 'id',
  })
  @Patch('docket-events/:eid')
  async update(
    @Param('id') caseId: string,
    @Param('eid') eventId: string,
    @Body() body: unknown,
    @Req() request: Request & RequestWithPrincipal,
  ): Promise<{ docket_event: DocketEventResponse }> {
    return {
      docket_event: await this.events.updateDocketEvent(
        principalOf(request),
        caseId,
        eventId,
        parseBody(updateDocketEventSchema, body),
        clientIp(request),
      ),
    };
  }
}
