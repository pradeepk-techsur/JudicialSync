import { z } from 'zod';

/**
 * Request/response shapes for `/api/v1/files/*`.
 *
 * Sources: `FRD/F13` Inputs (the `declared_purpose` vocabulary),
 * `FRD/Y1a-api-shared.md` §Security Baseline, and
 * `TechArch/03a-api-shared.md` §6.9 (the response interface, reproduced
 * verbatim below).
 */

/**
 * The three purposes `FRD/F13` Inputs names, and no others.
 *
 * A closed enum rather than a free string. The value is recorded on the file
 * reference and later drives which workflows may attach the file — Phase 5's
 * exhibit intake (F15) looks for `exhibit`, not for whatever text an uploader
 * typed. A free-text field here would make that a string comparison against
 * user input, which is how two spellings of "exhibit" end up in a court
 * record.
 */
export const DECLARED_PURPOSES = [
  'exhibit',
  'custody_condition_note',
  'package_artifact',
] as const;

export type DeclaredPurpose = (typeof DECLARED_PURPOSES)[number];

/**
 * The multipart form FIELDS accompanying the file part.
 *
 * `.strict()` so an unrecognised field is a 422 rather than silently dropped.
 * A caller sending `case_id` as `caseId` believed it was binding the upload to
 * a case; accepting the request and ignoring the field produces a file
 * reference that is quietly unattached.
 */
export const FileUploadFieldsSchema = z
  .object({
    declared_purpose: z.enum(DECLARED_PURPOSES, {
      errorMap: () => ({
        message: `declared_purpose must be one of: ${DECLARED_PURPOSES.join(', ')}`,
      }),
    }),
    /**
     * Optional owning case.
     *
     * `file_references` carries no `case_id` column in the Phase 1 schema — a
     * file is uploaded first and associated afterwards (ASM-02's unresolved
     * storage model is why). When supplied it is used for AUTHORIZATION: the
     * ABAC guard resolves the file against that case, so uploading into a
     * sealed case requires the sealed entitlement.
     */
    case_id: z.string().uuid().optional(),
  })
  .strict();

export type FileUploadFields = z.infer<typeof FileUploadFieldsSchema>;

/**
 * `POST /files/upload` → 201.
 *
 * Verbatim from `TechArch/03a-api-shared.md` §6.9:
 *
 * ```typescript
 * interface FileUploadResponse {
 *   file_reference_id: string;
 *   scan_status: "pending" | "clean" | "rejected";
 * }
 * ```
 *
 * Phase 1 only ever returns `clean` on a 201, because the scan is synchronous
 * and both other outcomes are rejections with no file reference to report.
 * The wider union is kept because it is the shared contract every other
 * module types against, and because `pending` is the state an asynchronous
 * quarantine model would use — see the note in `files.service.ts` on why Phase
 * 1 deliberately takes the synchronous path.
 */
export interface FileUploadResponseDto {
  file_reference_id: string;
  scan_status: 'pending' | 'clean' | 'rejected';
}

/**
 * `GET /files/{id}` → 200.
 *
 * Metadata only. The bytes come from `GET /files/{id}/content`, and
 * **neither response ever carries a storage pointer**: `storage_pointer` is
 * an internal object key whose only use is server-side retrieval, and
 * publishing it would hand a client the shape of the store's namespace for no
 * benefit it can act on.
 */
export interface FileMetadataResponseDto {
  file_reference_id: string;
  file_type: string;
  declared_purpose: string;
  scan_status: string;
  uploaded_by: string;
}
