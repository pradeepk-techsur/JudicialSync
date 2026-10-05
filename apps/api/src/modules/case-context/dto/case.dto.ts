import { z } from 'zod';

import { ApiException } from '../../../common/errors/api-error';

/**
 * ============================================================================
 * THE WIRE CONTRACT FOR THE SHARED CASE MODEL
 * ============================================================================
 *
 * Every shape below is copied from `TechArch/03a-api-shared.md` §6.2 and
 * `FRD/Y1a-api-shared.md` §Case & Docket Model. They are reproduced
 * **field-for-field in snake_case** rather than translated to the camelCase a
 * TypeScript codebase would otherwise prefer, and that is deliberate:
 *
 *  - plan 01-13 generates the frontend TypeScript client from the OpenAPI
 *    document this API emits, and
 *  - Phase 3's CM/ECF adapter (F10) writes through these same endpoints.
 *
 * Both bind to the published names. A rename here is a silent breaking change
 * to two consumers that do not exist yet and therefore cannot fail loudly.
 *
 * ## Two fields appear here that §6.2's `Case` interface does not list
 *
 * `status` and `locally_modified` are returned on every case. Neither is
 * decoration:
 *
 *  - `status` is the WHOLE removal mechanism in this system. CONTEXT: "No hard
 *    deletes anywhere in the case model … Removal is always a status
 *    transition." A client that cannot read `status` cannot tell a live case
 *    from a closed one, which would make the no-delete design unusable rather
 *    than merely invisible.
 *  - `locally_modified` is provenance Phase 3's conflict logic reads. Shipping
 *    the column (plan 01-03) while hiding the value would leave the flag
 *    unverifiable from outside the database.
 *
 * Both are additive, so a consumer written against §6.2 is unaffected.
 */

// ---------------------------------------------------------------------------
// Enumerations — each mirrors a CHECK constraint in migration
// `20260101000000_platform_schema`. Validating here turns what would be an
// opaque SQLSTATE 23514 into a 422 naming the offending field.
// ---------------------------------------------------------------------------

export const PARTY_ROLES = [
  'defendant',
  'government',
  'plaintiff',
  'counsel',
  'pro_se',
] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const CASE_STATUSES = ['open', 'closed', 'superseded'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const PROCEEDING_STATUSES = ['open', 'closed'] as const;
export type ProceedingStatus = (typeof PROCEEDING_STATUSES)[number];

export const PARTY_STATUSES = ['active', 'withdrawn'] as const;
export type PartyStatus = (typeof PARTY_STATUSES)[number];

export const DESIGNATIONS = [
  'sealed',
  'restricted',
  'grand_jury',
  'juvenile',
  'pii',
] as const;
export type Designation = (typeof DESIGNATIONS)[number];

const uuid = z.string().uuid();
const nonEmpty = z.string().trim().min(1);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** `POST /cases` — `TechArch/03a-api-shared.md` §6.2 `CreateCaseRequest`. */
export const createCaseSchema = z
  .object({
    case_number: nonEmpty.max(100),
    court_id: uuid,
    division_id: uuid,
    case_caption: nonEmpty.max(500),
    case_type: nonEmpty.max(100),
    party: z
      .array(
        z.object({
          name: nonEmpty.max(300),
          role: z.enum(PARTY_ROLES),
          external_id: z.string().trim().max(200).optional(),
        }),
      )
      // `FRD/F01` Inputs: "required at least one". The *defendant* rule is a
      // business rule with its own error code and lives in `CasesService`, not
      // here — a 422 saying "at least one party is required" would be the
      // wrong, less actionable message for a request that supplied two
      // non-defendant parties.
      .min(1),
  })
  .strict();
export type CreateCaseRequest = z.infer<typeof createCaseSchema>;

/** `PATCH /cases/{id}/status`. */
export const updateCaseStatusSchema = z
  .object({ status: z.enum(CASE_STATUSES) })
  .strict();

/** `POST /cases/{id}/proceedings`. */
export const createProceedingSchema = z
  .object({
    proceeding_type: nonEmpty.max(100),
    presiding_judge_id: uuid.optional(),
  })
  .strict();

/** `PATCH /cases/{id}/proceedings/{pid}/status`. */
export const updateProceedingStatusSchema = z
  .object({ status: z.enum(PROCEEDING_STATUSES) })
  .strict();

/** `POST /cases/{id}/proceedings/{pid}/hearings`. */
export const createHearingSchema = z
  .object({
    scheduled_at: z.string().datetime({ offset: true }),
    hearing_type: nonEmpty.max(100),
  })
  .strict();

/** `PATCH /cases/{id}/proceedings/{pid}/hearings/{hid}`. */
export const updateHearingSchema = z
  .object({ held_at: z.string().datetime({ offset: true }) })
  .strict();

/** `POST /cases/{id}/parties`. */
export const createPartySchema = z
  .object({
    party_name: nonEmpty.max(300),
    party_role: z.enum(PARTY_ROLES),
    external_id: z.string().trim().max(200).optional(),
    source_system: nonEmpty.max(50).optional(),
    source_identifier: z.string().trim().max(200).optional(),
  })
  .strict();

/** `PATCH /cases/{id}/parties/{pid}/status`. */
export const updatePartyStatusSchema = z
  .object({ status: z.enum(PARTY_STATUSES) })
  .strict();

/** `POST /cases/{id}/docket-events`. */
export const createDocketEventSchema = z
  .object({
    event_code: z.string().trim().max(50).optional(),
    event_description: z.string().trim().max(2000).optional(),
    event_date: z.string().datetime({ offset: true }),
    source_system: nonEmpty.max(50).optional(),
    source_identifier: z.string().trim().max(200).optional(),
  })
  .strict();

/** `PATCH /cases/{id}/docket-events/{eid}`. */
export const updateDocketEventSchema = z
  .object({
    event_code: z.string().trim().max(50).optional(),
    event_description: z.string().trim().max(2000).optional(),
  })
  .strict();

/** `GET /cases/{id}/docket-events` query parameters. */
export const docketEventQuerySchema = z
  .object({
    date_from: z.string().datetime({ offset: true }).optional(),
    date_to: z.string().datetime({ offset: true }).optional(),
    event_code: z.string().trim().max(50).optional(),
  })
  .strip();

/** `POST /cases/{id}/document-references`. */
export const createDocumentReferenceSchema = z
  .object({
    document_title: nonEmpty.max(500),
    storage_pointer: z.string().trim().max(2000).optional(),
    source_system: nonEmpty.max(50).optional(),
    source_identifier: z.string().trim().max(200).optional(),
  })
  .strict();

/** `PATCH /cases/{id}/security-designations`. */
export const updateDesignationsSchema = z
  .object({ designations: z.array(z.enum(DESIGNATIONS)) })
  .strict();

/** `GET /cases` query parameters. */
export const listCasesQuerySchema = z
  .object({
    court_id: uuid.optional(),
    division_id: uuid.optional(),
    status: z.enum(CASE_STATUSES).optional(),
    case_number: z.string().trim().max(100).optional(),
  })
  .strip();
export type CaseFilter = z.infer<typeof listCasesQuerySchema>;

// ---------------------------------------------------------------------------
// Responses — `TechArch/03a-api-shared.md` §6.2, verbatim where it defines a
// shape, and the table columns where it does not (`Hearing`, `Party`,
// `DocumentReference`).
// ---------------------------------------------------------------------------

export interface CaseResponse {
  id: string;
  court_id: string;
  division_id: string;
  case_number: string;
  case_caption: string;
  case_type: string;
  source_system: string;
  source_identifier?: string;
  created_at: string;
  /** Beyond §6.2 — see the file header. */
  status: CaseStatus;
  /** Beyond §6.2 — see the file header. */
  locally_modified: boolean;
}

export interface ProceedingResponse {
  id: string;
  case_id: string;
  proceeding_type: string;
  status: ProceedingStatus;
  presiding_judge_id?: string;
}

export interface HearingResponse {
  id: string;
  proceeding_id: string;
  scheduled_at: string;
  held_at?: string;
  hearing_type: string;
}

export interface PartyResponse {
  id: string;
  case_id: string;
  party_name: string;
  party_role: PartyRole;
  external_id?: string;
  source_system: string;
  source_identifier?: string;
  locally_modified: boolean;
  status: PartyStatus;
}

export interface DocketEventResponse {
  id: string;
  case_id: string;
  source_system: string;
  source_identifier: string;
  event_code?: string;
  event_description?: string;
  event_date: string;
  locally_modified: boolean;
}

export interface DocumentReferenceResponse {
  id: string;
  case_id: string;
  document_title?: string;
  storage_pointer?: string;
  source_system: string;
  source_identifier?: string;
  locally_modified: boolean;
}

export interface SecurityDesignationResponse {
  object_type: 'case' | 'document_reference' | 'exhibit';
  object_id: string;
  designation: Designation;
  applied_by: string;
  applied_at: string;
}

/** The full graph returned by `CaseContextService.getCaseContext`. */
export interface CaseContextResponse {
  case: CaseResponse;
  proceedings: ProceedingResponse[];
  hearings: HearingResponse[];
  parties: PartyResponse[];
  designations: SecurityDesignationResponse[];
}

// ---------------------------------------------------------------------------
// Validation entry point
// ---------------------------------------------------------------------------

/**
 * Validate a request payload, or throw the shared 422 envelope.
 *
 * Every controller in this module parses through here rather than reading
 * `body.whatever` directly. Two reasons, and the second is the security one:
 *
 *  1. `FRD/Y2-errors.md` reserves 422 for "validation/business-rule failures",
 *     and a single translation point is what keeps the `detail` shape uniform
 *     across fourteen endpoints.
 *  2. The schemas are `.strict()`, so an UNKNOWN key is rejected rather than
 *     ignored. A caller who sent `{..., source_system: 'cmecf'}` to an endpoint
 *     that does not accept it believed they were setting provenance; silently
 *     dropping the field would record the opposite of what they asked for —
 *     the same reasoning plan 01-05 applied to a body-supplied `actor_id`.
 */
export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): z.infer<T> {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;

  return failValidation(result.error);
}

function failValidation(error: z.ZodError): never {
  const issues = error.issues.slice(0, 20).map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  throw new ApiException(
    422,
    'REQUEST_VALIDATION_FAILED',
    'The request body failed validation',
    { issues },
  );
}
