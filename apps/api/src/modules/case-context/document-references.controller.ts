import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type { RequestWithPrincipal } from '../../common/principal/principal.types';
import { Resource } from '../policy/resource-descriptor.decorator';
import { clientIp, principalOf } from './cases.controller';
import {
  DocumentReferenceResponse,
  createDocumentReferenceSchema,
  parseBody,
} from './dto/case.dto';
import { ProceedingsService } from './proceedings.service';

/**
 * Document references — `FRD/F01` Process step 6.
 *
 * A **pointer**, never the document. F01: "the model never embeds the
 * authoritative document content unless F13's storage model `[ASSUMPTION:
 * store]` applies." `storage_pointer` names a location in the object store
 * plan 01-10 owns; this module records that the filing exists and where it
 * lives, and nothing here reads or writes bytes.
 *
 * ## There is no update route, and that is the schema talking
 *
 * Plan 01-02's `action_entitlement_map` gives `document_reference` exactly two
 * actions — `read` and `create` — and no `update`. An update route here would
 * carry a descriptor with no map row, which the PDP denies silently: the route
 * would exist, compile, and 403 forever.
 *
 * The map is right. A document reference records that a specific filing was
 * made; correcting it means recording a new reference, not rewriting the
 * record of the old one. If a later phase genuinely needs mutation, the Rego
 * row comes first (plan 01-02 owns `policy/**`) and the route second.
 *
 * Note that a document reference may carry **its own** security designations
 * on top of its case's — `security_designations.object_type` admits
 * `'document_reference'` precisely so a single filing can be sealed inside an
 * otherwise-open case, and plan 01-07's loader merges both sets.
 */
@Controller('cases/:id')
export class DocumentReferencesController {
  constructor(private readonly documents: ProceedingsService) {}

  @Resource({ type: 'document_reference', action: 'read', caseIdParam: 'id' })
  @Get('document-references')
  async list(
    @Param('id') caseId: string,
  ): Promise<{ document_references: DocumentReferenceResponse[] }> {
    return {
      document_references: await this.documents.listDocumentReferences(caseId),
    };
  }

  @Resource({ type: 'document_reference', action: 'create', caseIdParam: 'id' })
  @Post('document-references')
  @HttpCode(201)
  async create(
    @Param('id') caseId: string,
    @Body() body: unknown,
    @Req() request: Request & RequestWithPrincipal,
  ): Promise<{ document_reference: DocumentReferenceResponse }> {
    return {
      document_reference: await this.documents.createDocumentReference(
        principalOf(request),
        caseId,
        parseBody(createDocumentReferenceSchema, body),
        clientIp(request),
      ),
    };
  }
}
