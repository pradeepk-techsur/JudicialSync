import { z } from 'zod';

import { SCOPE_TYPES } from '../../../common/principal/principal.types';

/**
 * Request and response shapes for `/api/v1/entitlements/*`.
 *
 * Source: `TechArch/03a-api-shared.md` §6.1 (the grant tables),
 * `FRD/F00-identity-access-management.md` Error States, and the Phase 1
 * CONTEXT section "Grant workflow and separation of duties".
 */

/**
 * The rationale minimum, from `FRD/Y2-errors.md`'s shared convention:
 * "Rationale required but missing/too short on a legally significant action →
 * 422 `*_RATIONALE_REQUIRED` / `*_RATIONALE_TOO_SHORT` … 'Rationale must be at
 * least 10 characters'."
 *
 * Y2 lists the convention against F07/F18/F28/F30, none of which is this
 * feature. It is applied here anyway, deliberately: a grant of standing
 * authority over sealed court records is the paradigm case of a "legally
 * significant action", and a one-character justification on the record of who
 * gave whom access to a sealed matter is worth no more than an empty one. The
 * convention is reused rather than invented so the code and message match
 * every other rationale gate in the system.
 */
export const MIN_RATIONALE_LENGTH = 10;

/** `POST /api/v1/entitlements/requests` */
export const CreateGrantRequestSchema = z
  .object({
    grant_type: z.enum(['role', 'entitlement']),
    subject_user_id: z.string().uuid(),
    role_id: z.string().uuid().optional(),
    entitlement_key: z.string().min(1).max(128).optional(),
    /**
     * The ADMINISTRATIVE court of the request — the court in which this grant
     * is requested and approved, and therefore the court a requester or
     * approver must be scoped to in order to act on it.
     *
     * Distinct from `scope_value`, which narrows what the resulting grant
     * *confers*. Omitted, it defaults to the requester's own court (see
     * `GrantsService.administrativeCourt`), which is both the common case and
     * the only value the requester is certain to be scoped to.
     */
    court_id: z.string().uuid().optional(),
    division_id: z.string().uuid().optional(),
    scope_type: z.enum(SCOPE_TYPES).optional(),
    scope_value: z.string().uuid().optional(),
    scope_enum_value: z.string().min(1).max(128).optional(),
    /**
     * Why this access is being requested. Validated for length separately
     * from the schema so the failure carries `GRANT_RATIONALE_TOO_SHORT`
     * rather than a generic validation code — see `MIN_RATIONALE_LENGTH`.
     */
    justification: z.string(),
  })
  .strict();

export type CreateGrantRequestDto = z.infer<typeof CreateGrantRequestSchema>;

/** `POST …/requests/{id}/deny` and `POST …/grants/{id}/revoke`. */
export const DecisionSchema = z
  .object({
    rationale: z.string(),
  })
  .strict();

export type DecisionDto = z.infer<typeof DecisionSchema>;

/** `GET /api/v1/entitlements/requests` query string. */
export const ListRequestsQuerySchema = z
  .object({
    status: z.enum(['pending', 'approved', 'denied']).default('pending'),
    /** Restrict to rows created by the bootstrap path — see `BootstrapService`. */
    is_bootstrap: z
      .union([z.literal('true'), z.literal('false')])
      .optional()
      .transform((value) =>
        value === undefined ? undefined : value === 'true',
      ),
  })
  .passthrough();

/**
 * A pending grant request, shaped so Phase 3's Work Queue (F06) consumes it
 * unchanged.
 *
 * CONTEXT requires pending grants be "listable via API in Phase 1 and … plug
 * into the Work Queue in Phase 3 **without rework**". The cheapest way to make
 * that true is to emit the field names `TechArch/03a-api-shared.md` §6.6's
 * `Task` already uses — `task_type`, `object_reference`, `priority` — rather
 * than a bespoke shape that a later phase would have to translate.
 *
 * `status` deliberately keeps the GRANT lifecycle value (`pending` /
 * `approved` / `denied`), because that is what a reader of this endpoint is
 * asking about. `task_status` carries the `Task` projection of it, so a Work
 * Queue consumer reads one field and a grant-workflow client reads the other,
 * and neither has to know about the other's vocabulary.
 */
export interface GrantRequestView {
  id: string;
  grant_type: 'role' | 'entitlement';
  subject_user_id: string;
  role_id: string | null;
  entitlement_key: string | null;
  court_id: string | null;
  division_id: string | null;
  scope_type: string | null;
  scope_value: string | null;
  scope_enum_value: string | null;
  justification: string;
  requested_by: string;
  requested_at: string;
  status: 'pending' | 'approved' | 'denied';
  decided_by: string | null;
  decided_at: string | null;
  is_bootstrap: boolean;

  // ---- Work Queue (F06) compatibility — TechArch 03a §6.6 `Task` ----
  task_type: 'approval_request';
  object_reference: { object_type: 'access_grant_request'; object_id: string };
  priority: 'low' | 'normal' | 'high' | 'urgent';
  task_status: 'open' | 'completed' | 'dismissed';
  created_at: string;
}

/** A materialized entitlement grant, as returned by approve/revoke. */
export interface GrantView {
  id: string;
  request_id: string | null;
  user_id: string;
  /** Present for an entitlement grant; `null` for a role grant. */
  entitlement_key: string | null;
  /** Present for a role grant; `null` for an entitlement grant. */
  role_id: string | null;
  scope_type: string | null;
  scope_value: string | null;
  scope_enum_value: string | null;
  granted_by: string;
  granted_at: string;
  is_bootstrap: boolean;
  revoked_at: string | null;
  revoked_by: string | null;
}

/** One row of `GET /api/v1/entitlements/catalog`. */
export interface EntitlementCatalogEntry {
  entitlement_key: string;
  description: string;
  is_designation_entitlement: boolean;
}
