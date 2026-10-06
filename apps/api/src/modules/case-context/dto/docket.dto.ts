import { z } from 'zod';

/**
 * ============================================================================
 * PROCEEDING / HEARING / PARTY / DOCKET-EVENT / DOCUMENT-REFERENCE CONTRACTS
 * ============================================================================
 *
 * Request and response shapes transcribed from `FRD/Y1a-api-shared.md`
 * §Case & Docket Model and `TechArch/03a-api-shared.md` §6.2, in snake_case.
 * The Phase 3 CM/ECF adapter writes through these same records, so the field
 * names are a contract.
 */

// --- Proceedings -------------------------------------------------------------

/** `Proceeding` status — CHECK (status IN ('open','closed')). */
export const PROCEEDING_STATUSES = ['open', 'closed'] as const;
export type ProceedingStatus = (typeof PROCEEDING_STATUSES)[number];

export const CreateProceedingSchema = z
  .object({
    proceeding_type: z.string().min(1).max(128),
    presiding_judge_id: z.string().uuid().optional(),
  })
  .strict();

export const UpdateProceedingStatusSchema = z
  .object({
    status: z.enum(PROCEEDING_STATUSES),
  })
  .strict();

export interface ProceedingResponse {
  id: string;
  case_id: string;
  proceeding_type: string;
  status: string;
  presiding_judge_id: string | null;
}

// --- Hearings ----------------------------------------------------------------

export const CreateHearingSchema = z
  .object({
    scheduled_at: z.string().datetime(),
    hearing_type: z.string().min(1).max(128),
  })
  .strict();

export const UpdateHearingSchema = z
  .object({
    held_at: z.string().datetime(),
  })
  .strict();

export interface HearingResponse {
  id: string;
  proceeding_id: string;
  scheduled_at: string;
  held_at: string | null;
  hearing_type: string;
}

// --- Parties -----------------------------------------------------------------

export const PARTY_ROLES = [
  'defendant',
  'government',
  'plaintiff',
  'counsel',
  'pro_se',
] as const;

export const PARTY_STATUSES = ['active', 'withdrawn'] as const;

export const CreatePartyInlineSchema = z
  .object({
    party_name: z.string().min(1).max(512),
    party_role: z.enum(PARTY_ROLES),
    external_id: z.string().min(1).max(256).optional(),
  })
  .strict();

export const UpdatePartyStatusSchema = z
  .object({
    status: z.enum(PARTY_STATUSES),
  })
  .strict();

export interface PartyResponse {
  id: string;
  case_id: string;
  party_name: string;
  party_role: string;
  external_id: string | null;
  source_system: string;
  source_identifier: string | null;
  status: string;
}

// --- Docket events -----------------------------------------------------------

/**
 * `POST /cases/{id}/docket-events`.
 *
 * `source_system` defaults to `manual` — a manual entry needs no source. A
 * request declaring a NON-manual source (`cmecf`, …) MUST carry a
 * `source_identifier`; the service enforces that with `CASE_EVENT_MISSING_SOURCE`
 * (the rule exists for Phase 3's adapter, enforced now so the adapter inherits
 * it).
 */
export const CreateDocketEventSchema = z
  .object({
    source_system: z.string().min(1).max(128).optional(),
    source_identifier: z.string().min(1).max(256).optional(),
    event_code: z.string().min(1).max(64).optional(),
    event_description: z.string().min(1).max(4096).optional(),
    event_date: z.string().datetime(),
  })
  .strict();

export const UpdateDocketEventSchema = z
  .object({
    event_code: z.string().min(1).max(64).optional(),
    event_description: z.string().min(1).max(4096).optional(),
  })
  .strict()
  .refine((v) => v.event_code !== undefined || v.event_description !== undefined, {
    message: 'At least one of event_code or event_description is required',
  });

export const ListDocketEventsQuerySchema = z
  .object({
    date_from: z.string().datetime().optional(),
    date_to: z.string().datetime().optional(),
    event_code: z.string().min(1).max(64).optional(),
  })
  .strict();

export interface DocketEventResponse {
  id: string;
  case_id: string;
  source_system: string;
  source_identifier: string;
  event_code: string | null;
  event_description: string | null;
  event_date: string;
  locally_modified: boolean;
}

// --- Document references ------------------------------------------------------

export const CreateDocumentReferenceSchema = z
  .object({
    document_title: z.string().min(1).max(1024),
    storage_pointer: z.string().min(1).max(2048).optional(),
    source_system: z.string().min(1).max(128).optional(),
    source_identifier: z.string().min(1).max(256).optional(),
  })
  .strict();

export interface DocumentReferenceResponse {
  id: string;
  case_id: string;
  source_system: string;
  source_identifier: string | null;
  document_title: string | null;
  storage_pointer: string | null;
  locally_modified: boolean;
}
