import { z } from 'zod';

/**
 * The three declared purposes a file may be uploaded for.
 *
 * Verbatim from `FRD/F13` Inputs. The upload pipeline records which one the
 * caller declared on the `file_references` row and in the audit event; it does
 * not infer purpose from content.
 */
export const DECLARED_PURPOSES = [
  'exhibit',
  'custody_condition_note',
  'package_artifact',
] as const;

export type DeclaredPurpose = (typeof DECLARED_PURPOSES)[number];

/**
 * The multipart form fields that accompany an upload.
 *
 * The file bytes themselves arrive as the multipart `file` part and are
 * handled by the multipart parser, not this schema — this validates the
 * *metadata* fields. `case_id` is optional: a file may be uploaded first and
 * associated with a case later (the Phase 1 `file_references` schema carries no
 * `case_id`; see `resource-loader.service.ts`).
 */
export const FileUploadBodySchema = z
  .object({
    declared_purpose: z.enum(DECLARED_PURPOSES),
    case_id: z.string().uuid().optional(),
  })
  .strict();

export type FileUploadBody = z.infer<typeof FileUploadBodySchema>;

/**
 * The success response shape.
 *
 * `TechArch/03a-api-shared.md` §6.9:
 * `interface FileUploadResponse { file_reference_id: string; scan_status:
 * "pending" | "clean" | "rejected" }`. Phase 1 runs the scan synchronously, so
 * a `201` always carries `scan_status: "clean"` — the `pending` state exists in
 * the schema for a future asynchronous-quarantine model and is never returned
 * here (a file that would be `pending` or `rejected` instead produces a 4xx/5xx
 * error, never a persisted reference).
 */
export interface FileUploadResponse {
  file_reference_id: string;
  scan_status: 'pending' | 'clean' | 'rejected';
}

/** The metadata-only response for `GET /files/{id}`. */
export interface FileMetadataResponse {
  file_reference_id: string;
  file_type: string;
  declared_purpose: string;
  scan_status: string;
  uploaded_by: string;
}
