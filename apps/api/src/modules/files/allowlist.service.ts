import { Injectable, Logger } from '@nestjs/common';

import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * The outcome of an allowlist check on a clean-shaped request.
 *
 * `declaredContentType` is kept alongside the sniffed value so the caller can
 * record BOTH on the audit event. A file whose header claimed `application/pdf`
 * while its bytes say `application/x-msdownload` is worth seeing even on the
 * (impossible, here) path where it is allowed.
 */
export interface AllowlistDecision {
  /** The content type derived from the file's own bytes. */
  sniffedType: string;
  /** The `Content-Type` the client asserted. Never the basis of a decision. */
  declaredType: string | null;
  /** True when the two disagree — a signal, recorded, never a decision. */
  mismatch: boolean;
  /** The court's configured allowlist that decided, for the audit record. */
  allowlist: string[];
}

/** What the caller needs to know before it buffers or scans anything. */
export interface UploadLimits {
  maxUploadBytes: number;
  allowlist: string[];
  /** `rule_package_versions.id` that supplied the values, for audit linkage. */
  rulePackageVersionId: string | null;
}

/**
 * The fallback used when a court has NO published rule package.
 *
 * Empty on purpose, and this is the one place the distinction matters enough
 * to spell out. An absent configuration means "this court's file policy has
 * not loaded", and the safe reading of that is **nothing is permitted**, not
 * "everything a developer once listed in TypeScript is permitted". A
 * non-empty default here would also quietly satisfy the configuration read —
 * the system would appear to be reading the database while actually running on
 * a constant, which is precisely what the CONTEXT rule ("never from hardcoded
 * constants") exists to prevent.
 */
const NO_CONFIGURATION: readonly string[] = [];

/**
 * Parser guard only. The EFFECTIVE limit always comes from the court's
 * `config_snapshot.max_upload_bytes`; this bounds how much an unconfigured or
 * misconfigured request can buffer before that check can run.
 */
const DEFAULT_MAX_UPLOAD_BYTES = 52_428_800;

/**
 * `file-type` is ESM-only and this application compiles to CommonJS, so it is
 * resolved through a runtime `require` of the transformed module rather than a
 * static `import`.
 *
 * Both consumers are satisfied by the same shape: Jest transforms the package
 * (see `jest.files.config.js`'s `transformIgnorePatterns`), and the Node
 * runtime reaches it through `createRequire`-equivalent resolution. A static
 * `import` would be rewritten to `require()` by `tsc` and fail at runtime with
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`; a bare dynamic `import()` would likewise be
 * downlevelled to `require()`. Hence the indirection, which `tsc` cannot see
 * through and therefore cannot rewrite.
 */
type FileTypeModule = {
  fileTypeFromBuffer: (
    buffer: Uint8Array,
  ) => Promise<{ ext: string; mime: string } | undefined>;
};

let fileTypeModule: FileTypeModule | undefined;

async function loadFileType(): Promise<FileTypeModule> {
  if (fileTypeModule !== undefined) return fileTypeModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fileTypeModule = require('file-type') as FileTypeModule;
  } catch {
    const dynamicImport = new Function(
      'specifier',
      'return import(specifier)',
    ) as (specifier: string) => Promise<FileTypeModule>;
    fileTypeModule = await dynamicImport('file-type');
  }

  return fileTypeModule;
}

/**
 * ============================================================================
 * THE FILE-TYPE ALLOWLIST — CONTENT-SNIFFED, COURT-CONFIGURED, FIRST
 * ============================================================================
 *
 * Two independent requirements meet in this file, and both are easy to satisfy
 * in a way that looks right and is not.
 *
 * ## 1. The decision uses the file's BYTES, never its `Content-Type` header
 *
 * `TechArch/04-security.md` §7.5: the allowlist is "enforced server-side
 * against a configurable allowlist per court profile, **independent of
 * client-supplied MIME type (content-sniffed, not trusted from the
 * `Content-Type` header)**."
 *
 * The header is attacker-controlled. A Windows executable uploaded as
 * `Content-Type: application/pdf` with a `.pdf` filename is the entire attack,
 * and a check that reads the header passes it. So `file-type` reads the magic
 * bytes and the decision is made on that value alone. The declared type is
 * still captured — a disagreement is a useful signal — but it never decides.
 *
 * `text/plain` has no magic number, which is a real gap rather than an
 * oversight in the library: there is nothing in a text file to recognise. It
 * is resolved by VALIDATING rather than guessing — the buffer must decode as
 * UTF-8 and contain no NUL or C0 control bytes outside tab/CR/LF. Anything
 * failing that is treated as an unknown type and therefore not allowed. The
 * alternative ("if we cannot sniff it, call it text") would admit every
 * unrecognised binary format in existence through the one allowlist entry that
 * cannot be checked.
 *
 * ## 2. The allowlist comes from the DATABASE, per court
 *
 * The Phase 1 CONTEXT: "Features must read configuration from the database
 * from day one, never from hardcoded constants." The list lives in
 * `rule_package_versions.config_snapshot.file_type_allowlist`, seeded by plan
 * 01-04 and eventually edited through Phase 2's configuration surface. There
 * is no MIME list in this file, and `jest`/`grep` verification asserts that.
 *
 * ## 3. This runs BEFORE the scanner, and that ordering is itself the spec
 *
 * `FRD/F13` Process step 3: "disallowed types are rejected **before scanning
 * is even attempted**." `FilesService.upload` calls this first and the scanner
 * second; `files-upload.e2e-spec.ts` proves the ordering by asserting that a
 * disallowed-type rejection leaves NO `malware_scan_results` row, which is
 * only true if the scan never ran.
 */
@Injectable()
export class AllowlistService {
  private readonly logger = new Logger(AllowlistService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The court's effective upload limits.
   *
   * Read ahead of buffering so the multipart parser can be bounded by the same
   * number the check later enforces (threat T-01-44) — a limit applied only
   * after the whole body is in memory is not a limit on memory.
   */
  async limitsFor(courtId: string | null): Promise<UploadLimits> {
    const snapshot = await this.configSnapshot(courtId);

    const allowlist = Array.isArray(snapshot?.file_type_allowlist)
      ? snapshot.file_type_allowlist.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      : [...NO_CONFIGURATION];

    const configured = snapshot?.max_upload_bytes;
    const maxUploadBytes =
      typeof configured === 'number' &&
      Number.isSafeInteger(configured) &&
      configured > 0
        ? configured
        : DEFAULT_MAX_UPLOAD_BYTES;

    if (allowlist.length === 0) {
      this.logger.warn(
        `No file_type_allowlist is configured for court ${courtId ?? '(none)'}. ` +
          `Every upload will be refused SECURITY_FILE_TYPE_DENIED until a rule ` +
          `package is published. This is deliberate: an unloaded file policy ` +
          `permits nothing rather than defaulting to a built-in list.`,
      );
    }

    return {
      allowlist,
      maxUploadBytes,
      rulePackageVersionId: snapshot?.__rule_package_version_id ?? null,
    };
  }

  /**
   * Decide whether this file may proceed to the scanner.
   *
   * @throws {ApiException} 422 `SECURITY_FILE_TOO_LARGE` when the body exceeds
   *   the court's configured `max_upload_bytes`.
   * @throws {ApiException} 422 `SECURITY_FILE_TYPE_DENIED` when the SNIFFED
   *   content type is absent from the court's allowlist — the exact code and
   *   message from `FRD/F13` Error States.
   */
  async check(
    buffer: Buffer,
    declaredContentType: string | null,
    limits: UploadLimits,
  ): Promise<AllowlistDecision> {
    // Size first. Checked here as well as at the parser because the two guard
    // different things: the parser bounds memory, this bounds POLICY — the
    // court's configured maximum, which can be lower than the parser's.
    if (buffer.length > limits.maxUploadBytes) {
      throw new ApiException(
        422,
        'SECURITY_FILE_TOO_LARGE',
        'This file exceeds the maximum permitted upload size',
      );
    }

    const sniffed = await this.sniff(buffer);
    const declared = this.normalize(declaredContentType);

    if (sniffed === undefined || !limits.allowlist.includes(sniffed)) {
      throw new ApiException(
        422,
        'SECURITY_FILE_TYPE_DENIED',
        'This file type is not permitted',
      );
    }

    const mismatch = declared !== null && declared !== sniffed;
    if (mismatch) {
      // Not a rejection — the bytes are of an allowed type, which is the only
      // thing that governs. Logged and carried onto the audit event because a
      // client asserting one type while sending another is worth seeing even
      // when the outcome is "allowed".
      this.logger.warn(
        `Upload declared Content-Type '${declared}' but its content sniffs as ` +
          `'${sniffed}'. Deciding on the sniffed value (TechArch §7.5).`,
      );
    }

    return {
      sniffedType: sniffed,
      declaredType: declared,
      mismatch,
      allowlist: limits.allowlist,
    };
  }

  /**
   * The content type derived from the file's own bytes, or `undefined` when it
   * cannot be established.
   *
   * `undefined` means NOT ALLOWED at the call site. That is the important
   * property: an unidentifiable file is refused rather than given the benefit
   * of the doubt.
   */
  private async sniff(buffer: Buffer): Promise<string | undefined> {
    // An empty body has no content to identify and no legitimate purpose.
    if (buffer.length === 0) return undefined;

    const { fileTypeFromBuffer } = await loadFileType();

    let detected: { mime: string } | undefined;
    try {
      detected = await fileTypeFromBuffer(buffer);
    } catch (error) {
      // A truncated or malformed container can make the parser throw. That is
      // a file whose type could not be established, which is exactly the
      // `undefined` case — not a 500.
      this.logger.warn(
        `Content sniffing raised on a ${buffer.length}-byte upload: ` +
          `${error instanceof Error ? error.message : String(error)}. ` +
          `Treating the type as unidentifiable (not allowed).`,
      );
      return undefined;
    }

    if (detected !== undefined) return detected.mime;

    // No magic number. The ONLY type this is permitted to resolve to is
    // text/plain, and only on positive evidence — see the class comment.
    return this.isUtf8Text(buffer) ? 'text/plain' : undefined;
  }

  /**
   * Is this buffer genuinely UTF-8 text?
   *
   * Validation, not detection. `TextDecoder` with `fatal: true` rejects any
   * invalid sequence, and the control-character sweep rejects the binary files
   * that happen to be valid UTF-8 by coincidence (a run of ASCII-range bytes
   * inside a proprietary format). Both halves are needed: the decoder alone
   * admits a NUL-laden binary, and the sweep alone admits invalid UTF-8.
   */
  private isUtf8Text(buffer: Buffer): boolean {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      return false;
    }

    for (const byte of buffer) {
      const isAllowedControl = byte === 0x09 || byte === 0x0a || byte === 0x0d;
      if (byte < 0x20 && !isAllowedControl) return false;
      if (byte === 0x7f) return false;
    }

    return true;
  }

  /** Strips any parameters: `<type>/<subtype>; charset=…` → `<type>/<subtype>`. */
  private normalize(contentType: string | null): string | null {
    if (contentType === null) return null;
    const base = contentType.split(';')[0].trim().toLowerCase();
    return base === '' ? null : base;
  }

  /**
   * The court's effective `config_snapshot`, plus the version id that carried
   * it.
   *
   * Selected exactly the way `ResourceLoaderService.effectiveSecurityConfig`
   * selects its rule package — published, effective now, highest version — so
   * the file policy and the designation policy in force are drawn from the
   * same row rather than from two queries that could disagree.
   */
  private async configSnapshot(
    courtId: string | null,
  ): Promise<
    | (Record<string, unknown> & {
        file_type_allowlist?: unknown[];
        max_upload_bytes?: number;
        __rule_package_version_id?: string;
      })
    | undefined
  > {
    if (courtId === null) return undefined;

    const version = await this.prisma.rule_package_versions.findFirst({
      where: {
        court_id: courtId,
        published_at: { not: null },
        OR: [{ effective_from: null }, { effective_from: { lte: new Date() } }],
      },
      orderBy: [{ effective_from: 'desc' }, { version_number: 'desc' }],
      select: { id: true, config_snapshot: true },
    });
    if (version === null) return undefined;

    const snapshot = version.config_snapshot;
    if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) {
      return undefined;
    }

    return {
      ...(snapshot as Record<string, unknown>),
      __rule_package_version_id: version.id,
    };
  }
}
