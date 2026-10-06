import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  UploadedFile as UploadedFilePart,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

import { ApiException } from '../../common/errors/api-error';
import { Principal, RequestWithPrincipal } from '../../common/principal/principal.types';
import { Resource } from '../policy/resource-descriptor.decorator';
import {
  FileMetadataResponse,
  FileUploadBodySchema,
  FileUploadResponse,
} from './dto/file.dto';
import { FilesService, UploadedFile } from './files.service';

/** The multipart `file` part, as multer's memory storage hands it over. */
interface MulterFile {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
  size?: number;
}

/**
 * ============================================================================
 * `/files` — upload, metadata, and authenticated content streaming
 * ============================================================================
 *
 * Every route carries exactly one `@Resource()` so the global `AbacGuard` can
 * authorize it (a route with none is denied `503` by design). Upload needs
 * `file_upload`; both reads need `case_read` — `abac.rego` binds them
 * deliberately differently, because uploading and reading back a
 * security-controlled artifact are different authorities.
 *
 * ## Bytes move through the API, never via a store URL
 *
 * `GET /files/{id}/content` streams the object through this process with
 * `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`. The
 * client fetches it as a blob; no response ever contains a signed object URL or
 * the store's internal address — see `object-store.service.ts` and threat
 * T-01-43.
 */
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /**
   * `POST /files/upload` — multipart: `file`, `declared_purpose`, optional
   * `case_id`.
   *
   * `FileInterceptor` uses multer's in-memory storage: the whole part is
   * buffered so the allowlist can sniff its content and the scanner can stream
   * it to ClamAV. The size limit is set to the court-configured
   * `max_upload_bytes` on the request, so an oversized body is aborted at the
   * parser before it is fully buffered (threat T-01-44). `FilesService` also
   * re-checks the limit on the buffer it receives, so the control holds even if
   * this limit is bypassed.
   */
  @Post('upload')
  @Resource({ type: 'file', action: 'upload' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        // A hard ceiling matching the default court limit. The per-court value
        // lives in configuration and is re-enforced in AllowlistService.check;
        // this static cap stops an attacker streaming gigabytes before that
        // check runs. Kept generous enough never to reject a legitimate file
        // the configured limit would allow.
        fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 52_428_800),
      },
    }),
  )
  async upload(
    @Req() request: Request,
    @UploadedFilePart() filePart: MulterFile | undefined,
  ): Promise<FileUploadResponse> {
    const principal = principalOf(request);

    if (filePart === undefined || filePart.buffer === undefined) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'A multipart `file` part is required',
      );
    }

    const parsed = FileUploadBodySchema.safeParse({
      declared_purpose: (request.body as Record<string, unknown>)?.declared_purpose,
      ...((request.body as Record<string, unknown>)?.case_id !== undefined
        ? { case_id: (request.body as Record<string, unknown>).case_id }
        : {}),
    });
    if (!parsed.success) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'The request failed validation',
        // Field paths only — a message must not echo submitted values
        // (Y2 principle 4).
        { fields: parsed.error.issues.map((issue) => issue.path.join('.')) },
      );
    }

    const file: UploadedFile = {
      buffer: filePart.buffer,
      mimeType: filePart.mimetype ?? null,
      originalName: filePart.originalname ?? null,
    };

    return this.files.upload(
      principal,
      file,
      parsed.data,
      courtOf(principal),
      clientIp(request),
    );
  }

  /** `GET /files/{id}` — metadata only. */
  @Get(':id')
  @Resource({ type: 'file', action: 'read', idParam: 'id' })
  async getMetadata(@Param('id') id: string): Promise<FileMetadataResponse> {
    const metadata = await this.files.metadata(id);
    if (metadata === null) {
      throw new ApiException(404, 'FILE_NOT_FOUND', 'File not found or not accessible');
    }
    return metadata;
  }

  /**
   * `GET /files/{id}/content` — the bytes, streamed through the API.
   *
   * `nosniff` prevents a browser from re-interpreting the content type, and the
   * attachment disposition makes it a download. The body is the object's bytes,
   * never a redirect to the store.
   */
  @Get(':id/content')
  @Resource({ type: 'file', action: 'read', idParam: 'id' })
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Disposition', 'attachment')
  async getContent(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const principal = principalOf(request);
    const content = await this.files.content(principal, id, clientIp(request));
    if (content === null) {
      throw new ApiException(404, 'FILE_NOT_FOUND', 'File not found or not accessible');
    }

    response.setHeader('Content-Type', content.fileType);
    content.stream.on('error', () => {
      if (!response.headersSent) {
        response.status(500);
      }
      response.end();
    });
    content.stream.pipe(response);
  }
}

/** The principal attached by `SessionAuthGuard`; absent means the guard did not run. */
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
 * The uploader's court, derived from the authenticated principal.
 *
 * A court-scoped role assignment names it first (the multi-tenancy boundary a
 * user operates within); a `court` scope attribute is the fallback. This
 * mirrors `ResourceLoaderService.courtOfUser` but reads the principal already
 * on the request rather than re-querying — the allowlist and limit are
 * per-court configuration, so the court must be the caller's own.
 */
function courtOf(principal: Principal): string | null {
  const roleCourt = principal.roles.find((role) => role.court_id !== undefined);
  if (roleCourt?.court_id !== undefined) return roleCourt.court_id;

  const courtScope = principal.scopes.find(
    (scope) => scope.scope_type === 'court' && scope.scope_value !== undefined,
  );
  return courtScope?.scope_value ?? null;
}

/** Best-effort client address for the audit record. */
function clientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    return forwarded.split(',')[0].trim();
  }
  return request.ip ?? request.socket?.remoteAddress ?? null;
}
