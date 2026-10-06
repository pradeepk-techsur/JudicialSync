import { z } from 'zod';

/**
 * ============================================================================
 * THE CASE WIRE CONTRACT
 * ============================================================================
 *
 * These schemas transcribe `TechArch/03a-api-shared.md` §6.2 **exactly**, in
 * snake_case. The field names are a contract, not a convenience:
 *
 *  - plan 01-13's generated TypeScript client binds to them, and
 *  - Phase 3's CM/ECF adapter (F10) writes through these same records.
 *
 * Renaming `case_number` to `caseNumber` on the wire would quietly break both,
 * so the DTOs keep the snake_case spelling end to end rather than camel-casing
 * at the boundary.
 */

/**
 * `FRD/F01` §Entities: a party's role is one of five fixed values. The CHECK
 * constraint on `parties.party_role` enforces the same set in the database; the
 * enum here turns a bad value into a clean 422 before any write.
 */
export const PARTY_ROLES = [
  'defendant',
  'government',
  'plaintiff',
  'counsel',
  'pro_se',
] as const;

export type PartyRole = (typeof PARTY_ROLES)[number];

/**
 * A party supplied inline with a case creation.
 *
 * `external_id` is the CM/ECF party identifier — optional for manual entry,
 * populated by the Phase 3 adapter.
 */
export const CreatePartySchema = z
  .object({
    name: z.string().min(1).max(512),
    role: z.enum(PARTY_ROLES),
    external_id: z.string().min(1).max(256).optional(),
  })
  .strict();

/**
 * `POST /cases` request body, verbatim from §6.2.
 *
 * `.strict()` rejects unknown keys. A client that misspells a field discovers
 * it immediately rather than having the value silently dropped — and a field
 * the wire contract does not define has no business reaching a write.
 *
 * At least one party is required at the schema level; the stronger rule — at
 * least one **defendant** — lives in the service, because its error code
 * (`CASE_MISSING_DEFENDANT`) is a domain rule from `FRD/F01` Error States and
 * `US-1.2` ties it to the Phase 7 tracker precondition.
 */
export const CreateCaseSchema = z
  .object({
    case_number: z.string().min(1).max(128),
    court_id: z.string().uuid(),
    division_id: z.string().uuid(),
    case_caption: z.string().min(1).max(1024),
    case_type: z.string().min(1).max(128),
    party: z.array(CreatePartySchema).min(1),
  })
  .strict();

export type CreateCaseRequest = z.infer<typeof CreateCaseSchema>;

/**
 * `PATCH /cases/{id}/status` — the **only** removal mechanism.
 *
 * `FRD/F01` / CONTEXT: "No hard deletes anywhere in the case model … Removal is
 * always a status transition." The three target states are the full lifecycle:
 * `closed` and `superseded` are the two "gone" transitions, `open` is the
 * reopen. There is no `deleted` and no soft-delete column — CONTEXT rejected
 * both as "a competing second meaning of 'gone.'"
 */
export const CASE_STATUSES = ['open', 'closed', 'superseded'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const UpdateCaseStatusSchema = z
  .object({
    status: z.enum(CASE_STATUSES),
  })
  .strict();

export type UpdateCaseStatusRequest = z.infer<typeof UpdateCaseStatusSchema>;

/**
 * The `Case` response shape, §6.2.
 *
 * `source_identifier` is nullable — a manually entered case has none — and
 * `created_at` is an ISO-8601 UTC string. `status` is included because the
 * lifecycle is observable: a caller listing cases needs to know which are
 * closed.
 */
export interface CaseResponse {
  id: string;
  court_id: string;
  division_id: string;
  case_number: string;
  case_caption: string;
  case_type: string;
  source_system: string;
  source_identifier: string | null;
  status: string;
  created_at: string;
}

/**
 * Query parameters for `GET /cases`.
 *
 * All optional filters, applied on top of the principal's own scope and
 * designation exclusions (which are not optional and not client-controlled —
 * see `CaseContextService.listCasesForPrincipal`).
 */
export const ListCasesQuerySchema = z
  .object({
    court_id: z.string().uuid().optional(),
    division_id: z.string().uuid().optional(),
    case_type: z.string().min(1).max(128).optional(),
    status: z.enum(CASE_STATUSES).optional(),
  })
  .strict();

export type ListCasesQuery = z.infer<typeof ListCasesQuerySchema>;
