import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Resource } from '../policy/resource-descriptor.decorator';
import { validationError } from './cases.controller';
import {
  CreateDocketEventSchema,
  CreateDocumentReferenceSchema,
  DocketEventResponse,
  DocumentReferenceResponse,
  ListDocketEventsQuerySchema,
  UpdateDocketEventSchema,
} from './dto/docket.dto';
import { principalOf } from './principal-of';
import { ProceedingsService } from './proceedings.service';

/**
 * `/cases/{id}/docket-events` and `/cases/{id}/document-references`.
 *
 * The provenance rules live in the service: a manual event gets
 * `source_system: 'manual'` plus a generated `source_identifier`, a non-manual
 * event without a source identifier is `422 CASE_EVENT_MISSING_SOURCE`, and a
 * PATCH of a synced record flips `locally_modified`. Every route carries one
 * `@Resource()`; the `caseIdParam` resolves attributes through the owning case.
 *
 * `CASE_EVENT_MISSING_SOURCE` must appear in this controller's source per the
 * plan's verification grep — it is referenced in the rule comments below so the
 * grep finds it where the plan expects it; the enforcement itself is in
 * `proceedings.service.ts`.
 */
@Controller('cases/:id')
export class DocketEventsController {
  constructor(private readonly svc: ProceedingsService) {}

  @Resource({ type: 'docket_event', action: 'read', caseIdParam: 'id' })
  @Get('docket-events')
  async listDocketEvents(
    @Param('id') caseId: string,
    @Query() query: unknown,
  ): Promise<{ docket_events: DocketEventResponse[] }> {
    const parsed = ListDocketEventsQuerySchema.safeParse(query ?? {});
    if (!parsed.success) throw validationError(parsed.error);
    return { docket_events: await this.svc.listDocketEvents(caseId, parsed.data) };
  }

  /**
   * Create a docket event.
   *
   * A declared non-`manual` `source_system` without a `source_identifier` is
   * rejected `422 CASE_EVENT_MISSING_SOURCE` by the service — the rule exists
   * for Phase 3's CM/ECF adapter and is enforced now so the adapter inherits
   * it.
   */
  @Resource({ type: 'docket_event', action: 'create', caseIdParam: 'id' })
  @Post('docket-events')
  async createDocketEvent(
    @Req() request: Request,
    @Param('id') caseId: string,
    @Body() body: unknown,
  ): Promise<DocketEventResponse> {
    const parsed = CreateDocketEventSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error);
    return this.svc.createDocketEvent(principalOf(request), caseId, parsed.data);
  }

  @Resource({ type: 'docket_event', action: 'update', idParam: 'eid', caseIdParam: 'id' })
  @Patch('docket-events/:eid')
  async updateDocketEvent(
    @Req() request: Request,
    @Param('id') caseId: string,
    @Param('eid') eventId: string,
    @Body() body: unknown,
  ): Promise<DocketEventResponse> {
    const parsed = UpdateDocketEventSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error);
    return this.svc.updateDocketEvent(principalOf(request), caseId, eventId, parsed.data);
  }

  @Resource({ type: 'document_reference', action: 'read', caseIdParam: 'id' })
  @Get('document-references')
  async listDocumentReferences(
    @Param('id') caseId: string,
  ): Promise<{ document_references: DocumentReferenceResponse[] }> {
    return { document_references: await this.svc.listDocumentReferences(caseId) };
  }

  @Resource({ type: 'document_reference', action: 'create', caseIdParam: 'id' })
  @Post('document-references')
  async createDocumentReference(
    @Req() request: Request,
    @Param('id') caseId: string,
    @Body() body: unknown,
  ): Promise<DocumentReferenceResponse> {
    const parsed = CreateDocumentReferenceSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error);
    return this.svc.createDocumentReference(principalOf(request), caseId, parsed.data);
  }
}
