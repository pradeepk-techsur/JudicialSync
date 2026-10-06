import { Injectable, Logger } from '@nestjs/common';

import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { fileTypeFromBuffer } from './esm-import';

/** The outcome of a successful allowlist check. */
export interface AllowlistDecision {
  /** The content-sniffed MIME type the decision was made on. */
  sniffedType: string;
  /** The client-declared `Content-Type`, recorded for the audit event. */
  declaredType: string | null;
  /** True when the sniffed type disagrees with the declared one. */
  mismatch: boolean;
  /** Size of the inspected body, in bytes. */
  sizeBytes: number;
}

/** Fields read out of `config_snapshot`. Everything else is ignored here. */
interface FileConfigSnapshot {
  file_type_allowlist?: unknown;
  max_upload_bytes?: unknown;
}

/**
 * ============================================================================
 * THE FILE-TYPE ALLOWLIST — content-sniffed, configuration-driven, fail-first
 * ============================================================================
 *
 * `FRD/F13` Process step 3: the allowlist is "enforced at upload; disallowed
 * types are rejected **before scanning is even attempted**." This service is
 * the first gate in `FilesService.upload`, and its rejection happens before any
 * scan and before any byte reaches storage.
 *
 * Two properties it holds, each the thing a weaker implementation gets wrong:
 *
 * ## 1. The allowlist comes from the database, never from a TypeScript constant
 *
 * CONTEXT: "Features must read configuration from the database from day one,
 * never from hardcoded constants." The permitted set is read from the caller's
 * court's effective `rule_package_versions.config_snapshot.file_type_allowlist`
 * — the same row a court administrator will eventually edit through Phase 2's
 * admin surface. A hardcoded list here would be exactly the thing Phase 2 then
 * has to hunt down, and it would make "change the allowlist" a code deploy
 * rather than a configuration change.
 *
 * ## 2. The decision is made on the SNIFFED type, not the declared one
 *
 * `TechArch/04-security.md` §7.5: enforcement is "independent of
 * client-supplied MIME type (content-sniffed, not trusted from the
 * `Content-Type` header)." An attacker renaming `evil.exe` to `report.pdf` and
 * sending `Content-Type: application/pdf` is the whole threat (T-01-40). We
 * sniff the magic bytes with `file-type` and decide on that; the declared type
 * is recorded for the audit event but never trusted. `text/plain` has no magic
 * number, so a buffer that `file-type` cannot identify is accepted as
 * `text/plain` **only** if it is valid UTF-8 and `text/plain` is itself in the
 * allowlist — anything else is treated as not-allowed rather than guessed.
 */
@Injectable()
export class AllowlistService {
  private readonly logger = new Logger(AllowlistService.name);

  /**
   * A conservative upper bound used only when the court has no configured
   * `max_upload_bytes`. It is the same 50 MiB the seed writes, so the fallback
   * is equivalent rather than permissive; a court that has loaded configuration
   * always overrides it.
   */
  private static readonly DEFAULT_MAX_UPLOAD_BYTES = 52_428_800;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The court's configured maximum upload size, for the multipart parser's own
   * limit.
   *
   * Configuring the parser to this value means an oversized body is aborted
   * *at the parser*, before it is fully buffered — closing threat T-01-44
   * (unbounded buffering before the size check). `check` re-enforces the same
   * bound on the buffer it is handed, so the control holds even if a caller
   * forgets to wire the parser limit.
   */
  async maxUploadBytes(courtId: string | null): Promise<number> {
    const snapshot = await this.configSnapshot(courtId);
    const configured = snapshot?.max_upload_bytes;
    if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
      return configured;
    }
    return AllowlistService.DEFAULT_MAX_UPLOAD_BYTES;
  }

  /**
   * Decide whether a buffer may proceed to scanning and storage.
   *
   * @throws {ApiException} 422 `SECURITY_FILE_TOO_LARGE` when the body exceeds
   *   the court's configured limit.
   * @throws {ApiException} 422 `SECURITY_FILE_TYPE_DENIED` when the sniffed type
   *   is absent from the court's allowlist.
   */
  async check(
    buffer: Buffer,
    declaredContentType: string | null,
    courtId: string | null,
  ): Promise<AllowlistDecision> {
    const snapshot = await this.configSnapshot(courtId);

    const maxBytes =
      typeof snapshot?.max_upload_bytes === 'number' &&
      Number.isFinite(snapshot.max_upload_bytes) &&
      snapshot.max_upload_bytes > 0
        ? snapshot.max_upload_bytes
        : AllowlistService.DEFAULT_MAX_UPLOAD_BYTES;

    // Size is checked FIRST: there is no reason to sniff or scan a body that is
    // already over the limit, and the parser limit (maxUploadBytes) means an
    // honest client is aborted even earlier. The exact code and message are
    // from FRD/F13 Error States.
    if (buffer.length > maxBytes) {
      throw new ApiException(
        422,
        'SECURITY_FILE_TOO_LARGE',
        'This file exceeds the maximum permitted size',
      );
    }

    const allowlist = this.readAllowlist(snapshot);
    const declaredType = normaliseType(declaredContentType);
    const sniffedType = await this.sniff(buffer, allowlist);

    if (sniffedType === null || !allowlist.includes(sniffedType)) {
      // The exact code and message from FRD/F13 Error States. The sniffed type
      // is deliberately NOT echoed in the message (Y2 principle 4 — a display
      // message must not carry attacker-influenced content); it is recorded in
      // the audit event's after_state instead.
      throw new ApiException(
        422,
        'SECURITY_FILE_TYPE_DENIED',
        'This file type is not permitted',
      );
    }

    return {
      sniffedType,
      declaredType,
      mismatch: declaredType !== null && declaredType !== sniffedType,
      sizeBytes: buffer.length,
    };
  }

  /**
   * The sniffed MIME type, or `null` when the content cannot be identified as
   * an allowed type.
   *
   * `file-type` reads the magic bytes and names a MIME type for anything with a
   * signature. For a buffer it cannot identify — which includes `text/plain`,
   * since plain text has no magic number — we fall back to a UTF-8 validity
   * check over the WHOLE buffer, and only then only if `text/plain` is itself
   * permitted. Treating "unidentified" as `text/plain` unconditionally would
   * let an arbitrary binary through as text; requiring valid UTF-8 and an
   * explicit allowlist entry is the fail-closed reading of §7.5.
   */
  private async sniff(buffer: Buffer, allowlist: string[]): Promise<string | null> {
    const detected = await fileTypeFromBuffer(buffer);
    if (detected !== undefined) {
      return detected.mime;
    }

    // No magic number. The only type this can legitimately be is text, and we
    // say so only when text is permitted AND the bytes are valid UTF-8.
    if (allowlist.includes('text/plain') && isValidUtf8(buffer)) {
      return 'text/plain';
    }
    return null;
  }

  /**
   * The court's effective `file_type_allowlist`, as a list of MIME strings.
   *
   * An absent, empty or malformed allowlist yields `[]`, which denies every
   * type — the fail-closed direction. A court whose configuration has not
   * loaded must not become a court that accepts anything.
   */
  private readAllowlist(snapshot: FileConfigSnapshot | null): string[] {
    const raw = snapshot?.file_type_allowlist;
    if (!Array.isArray(raw)) {
      if (snapshot !== null) {
        this.logger.warn(
          'Effective configuration carries no usable file_type_allowlist; ' +
            'denying all uploads for this court until it is configured.',
        );
      }
      return [];
    }
    return raw.filter((value): value is string => typeof value === 'string');
  }

  /**
   * The effective `config_snapshot` for the caller's court.
   *
   * Reads the latest published, in-effect `rule_package_versions` row for the
   * court — the same selection `ResourceLoaderService.effectiveSecurityConfig`
   * makes for designation policy, so the allowlist and the designation map come
   * from one version rather than drifting apart. Plan 01-11 owns the general
   * configuration read path; this is the narrow direct read the files module
   * needs until then.
   */
  private async configSnapshot(
    courtId: string | null,
  ): Promise<FileConfigSnapshot | null> {
    if (courtId === null) return null;

    const version = await this.prisma.rule_package_versions.findFirst({
      where: {
        court_id: courtId,
        published_at: { not: null },
        OR: [{ effective_from: null }, { effective_from: { lte: new Date() } }],
      },
      orderBy: [{ effective_from: 'desc' }, { version_number: 'desc' }],
      select: { config_snapshot: true },
    });
    if (version === null || version.config_snapshot === null) return null;

    if (
      typeof version.config_snapshot !== 'object' ||
      Array.isArray(version.config_snapshot)
    ) {
      return null;
    }
    return version.config_snapshot as FileConfigSnapshot;
  }
}

/** Lower-cased, parameter-stripped MIME type, or `null`. */
function normaliseType(contentType: string | null): string | null {
  if (contentType === null) return null;
  const base = contentType.split(';')[0].trim().toLowerCase();
  return base === '' ? null : base;
}

/**
 * Is the whole buffer valid UTF-8?
 *
 * `TextDecoder` with `fatal: true` throws on any invalid sequence, which is the
 * cheapest correct check — it validates the entire buffer rather than a prefix,
 * so a file that is text for its first bytes and binary afterwards is rejected.
 */
function isValidUtf8(buffer: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}
