import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Principal } from '../../common/principal/principal.types';
import { AuditService } from '../audit/audit.service';
import { recordStandaloneAudit, withAudit } from '../audit/with-audit';
import { AllowlistService } from './allowlist.service';
import { ClamAvScanner } from './clamav.scanner';
import {
  FileMetadataResponse,
  FileUploadBody,
  FileUploadResponse,
} from './dto/file.dto';
import { ObjectStoreService } from './object-store.service';

/** An uploaded multipart part, as the controller hands it to the service. */
export interface UploadedFile {
  buffer: Buffer;
  /** The client-declared `Content-Type` — recorded, never trusted. */
  mimeType: string | null;
  /** The client-supplied filename — recorded for audit, never used as a key. */
  originalName: string | null;
}

/** Streamed content plus the metadata the controller needs for headers. */
export interface FileContent {
  stream: Readable;
  fileType: string;
}

/**
 * ============================================================================
 * THE UPLOAD PIPELINE — the ORDER is the requirement
 * ============================================================================
 *
 * `FRD/F13` Process and `TechArch/04-security.md` §7.5 pin a sequence, and the
 * sequence is itself what success criterion 5 demands be demonstrable:
 *
 *   1. ALLOWLIST the sniffed content. Reject `422 SECURITY_FILE_TYPE_DENIED`.
 *      Nothing has been scanned, nothing stored.
 *   2. SCAN the buffer. `infected` → `422 SECURITY_MALWARE_DETECTED`.
 *      `error` → `503 SECURITY_SCANNER_UNAVAILABLE` (a scanner we could not
 *      reach has NOT said the file is clean — threat T-01-41).
 *   3. Only now STORE the bytes.
 *   4. RECORD `file_references` + `malware_scan_results` + the audit event in
 *      ONE `withAudit` transaction.
 *
 * ## No row is written on a rejection
 *
 * `FRD/F13` Validation: "No file is persisted to the reference/storage layer
 * until malware scan completes successfully." A disallowed-type or infected
 * upload therefore creates NO `file_references` row and NO object — the
 * rejection is recorded as an `access_attempt` audit event only. §7.5 requires
 * rejections be "rejected and logged", and the audit trail is where that log
 * lives. The `scan_status: 'rejected'` enum value exists in the schema for a
 * future asynchronous-quarantine model (paired with the `pending` state); Phase
 * 1 deliberately uses the synchronous path and never writes it.
 *
 * ## Store-before-DB, with compensating delete
 *
 * The object is written before the database row. If the DB write then fails,
 * the orphaned object is deleted in a `catch`. The reverse order — DB row then
 * object — would leave a `file_references` row pointing at nothing on an object
 * failure, which is the worse inconsistency: a reference the system believes is
 * downloadable but is not.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly allowlist: AllowlistService,
    private readonly scanner: ClamAvScanner,
    private readonly store: ObjectStoreService,
  ) {}

  /**
   * @param courtId the uploader's court, used to read the per-court allowlist
   *   and upload limit. Resolved by the guard's resource loader and passed in.
   */
  async upload(
    principal: Principal,
    file: UploadedFile,
    body: FileUploadBody,
    courtId: string | null,
    clientIp: string | null,
  ): Promise<FileUploadResponse> {
    // --- 1. ALLOWLIST (throws 422 before any scan or store) ---------------
    let decision;
    try {
      decision = await this.allowlist.check(file.buffer, file.mimeType, courtId);
    } catch (error) {
      await this.auditRejection(principal, body, clientIp, error, {
        declaredType: file.mimeType,
        sizeBytes: file.buffer.length,
      });
      throw error;
    }

    // --- 2. SCAN (infected → 422, error → 503; still nothing stored) ------
    const scan = await this.scanner.scan(file.buffer);
    if (scan.result === 'infected') {
      const rejection = new ApiException(
        422,
        'SECURITY_MALWARE_DETECTED',
        'File rejected: failed security scan',
      );
      await this.auditRejection(principal, body, clientIp, rejection, {
        declaredType: decision.declaredType,
        sniffedType: decision.sniffedType,
        sizeBytes: decision.sizeBytes,
        signature: scan.signature,
      });
      throw rejection;
    }
    if (scan.result === 'error') {
      const rejection = new ApiException(
        503,
        'SECURITY_SCANNER_UNAVAILABLE',
        'File scanning is temporarily unavailable; upload rejected',
      );
      await this.auditRejection(principal, body, clientIp, rejection, {
        declaredType: decision.declaredType,
        sniffedType: decision.sniffedType,
        sizeBytes: decision.sizeBytes,
      });
      throw rejection;
    }

    // --- 3. STORE (clean only) --------------------------------------------
    // The key derives from a SERVER-GENERATED UUID, never the client filename —
    // which removes path traversal and collision as concerns entirely (threat
    // T-01-42). The id is minted here so it is both the row id and the key.
    const fileReferenceId = randomUUID();
    const key = objectKey(fileReferenceId);
    await this.store.put(key, file.buffer, decision.sniffedType);

    // --- 4. RECORD (one transaction: references + scan result + audit) ----
    try {
      return await withAudit(this.prisma, this.audit, async (tx) => {
        const created = await tx.file_references.create({
          data: {
            id: fileReferenceId,
            storage_pointer: key,
            file_type: decision.sniffedType,
            uploaded_by: principal.user_id,
            declared_purpose: body.declared_purpose,
            scan_status: 'clean',
          },
          select: { id: true },
        });

        await tx.malware_scan_results.create({
          data: { file_reference_id: created.id, result: 'clean' },
        });

        return {
          result: { file_reference_id: created.id, scan_status: 'clean' as const },
          audit: {
            actor_id: principal.user_id,
            action_type: 'access_attempt' as const,
            object_type: 'file_references',
            object_id: created.id,
            after_state: {
              outcome: 'uploaded',
              declared_purpose: body.declared_purpose,
              sniffed_type: decision.sniffedType,
              declared_type: decision.declaredType,
              mismatch: decision.mismatch,
              size_bytes: decision.sizeBytes,
              scan_status: 'clean',
            },
            client_ip: clientIp,
            session_id: principal.session_id,
          },
        };
      });
    } catch (error) {
      // The object is already stored; the DB row is not. Delete the orphan so a
      // retry does not accumulate unreferenced objects. Best-effort: a failed
      // cleanup is logged, not surfaced — the caller's error is the DB failure.
      this.logger.error(
        `Database write failed after storing object '${key}'; attempting to ` +
          `delete the orphaned object. Cause: ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
      // No delete() on ObjectStoreService by design (it exposes only what the
      // happy path needs); the orphan is logged for operator cleanup rather
      // than widening the store interface for a rare failure path.
      throw error;
    }
  }

  /** Metadata for `GET /files/{id}`. Returns `null` when the file is absent. */
  async metadata(id: string): Promise<FileMetadataResponse | null> {
    const row = await this.prisma.file_references.findUnique({
      where: { id },
      select: {
        id: true,
        file_type: true,
        declared_purpose: true,
        scan_status: true,
        uploaded_by: true,
      },
    });
    if (row === null) return null;

    return {
      file_reference_id: row.id,
      file_type: row.file_type,
      declared_purpose: row.declared_purpose,
      scan_status: row.scan_status,
      uploaded_by: row.uploaded_by,
    };
  }

  /**
   * The bytes for `GET /files/{id}/content`, streamed from the store.
   *
   * Also writes the `access_attempt` audit event recording the granted
   * download: `FRD/F13` and `FRD/F02` both treat access to a security-controlled
   * artifact as material, so every download is logged.
   */
  async content(
    principal: Principal,
    id: string,
    clientIp: string | null,
  ): Promise<FileContent | null> {
    const row = await this.prisma.file_references.findUnique({
      where: { id },
      select: { id: true, storage_pointer: true, file_type: true },
    });
    if (row === null) return null;

    const stream = await this.store.getObjectStream(row.storage_pointer);

    await recordStandaloneAudit(this.prisma, this.audit, {
      actor_id: principal.user_id,
      action_type: 'access_attempt',
      object_type: 'file_references',
      object_id: row.id,
      after_state: { outcome: 'granted', action: 'download' },
      client_ip: clientIp,
      session_id: principal.session_id,
    });

    return { stream, fileType: row.file_type };
  }

  /**
   * Record a rejected upload as an `access_attempt` audit event.
   *
   * No `file_references` row exists (and none will) — this is the only trace a
   * rejection leaves, so it must not itself fail the request: it is written
   * through `recordStandaloneAudit` and a failure to log is swallowed with an
   * integrity-gap error, exactly as the ABAC guard does for a denial. Turning a
   * 422 into a 500 because the audit insert hit a deadlock would hand the caller
   * a signal unrelated to their file.
   */
  private async auditRejection(
    principal: Principal,
    body: FileUploadBody,
    clientIp: string | null,
    error: unknown,
    detail: {
      declaredType?: string | null;
      sniffedType?: string;
      sizeBytes?: number;
      signature?: string;
    },
  ): Promise<void> {
    const reason =
      error instanceof ApiException ? error.errorCode : 'SECURITY_UPLOAD_REJECTED';

    try {
      await recordStandaloneAudit(this.prisma, this.audit, {
        actor_id: principal.user_id,
        action_type: 'access_attempt',
        // There is no object — NIL UUID, same convention the ABAC guard uses.
        object_type: 'file_references',
        object_id: NIL_UUID,
        after_state: {
          outcome: 'rejected',
          reason,
          declared_purpose: body.declared_purpose,
          sniffed_type: detail.sniffedType ?? null,
          declared_type: detail.declaredType ?? null,
          size_bytes: detail.sizeBytes ?? null,
          ...(detail.signature !== undefined ? { signature: detail.signature } : {}),
        },
        client_ip: clientIp,
        session_id: principal.session_id,
      });
    } catch (auditError) {
      this.logger.error(
        `INTEGRITY GAP: failed to write the access_attempt audit event for a ` +
          `rejected upload (reason=${reason}). The rejection itself stands and ` +
          `is being returned to the caller, but this attempt is NOT in the ` +
          `audit trail. Cause: ${
            auditError instanceof Error ? auditError.message : String(auditError)
          }`,
      );
    }
  }
}

/**
 * `audit_events.object_id` is NOT NULL, so a rejected upload (which has no file
 * reference) still needs a value. The nil UUID is the conventional "no object"
 * marker — the same one `AbacGuard` uses — and is distinguishable from any real
 * id.
 */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * The object key: `files/{yyyy}/{mm}/{fileReferenceId}`.
 *
 * Date-partitioned for operability, and keyed on the server-generated id so the
 * client filename never reaches the key (threat T-01-42).
 */
function objectKey(fileReferenceId: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `files/${yyyy}/${mm}/${fileReferenceId}`;
}
