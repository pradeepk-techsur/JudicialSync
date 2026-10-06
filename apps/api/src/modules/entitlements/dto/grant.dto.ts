import { z } from 'zod';

/**
 * ============================================================================
 * REQUEST BODIES FOR THE GRANT WORKFLOW — `/api/v1/entitlements/*`
 * ============================================================================
 *
 * `zod` schemas, matching the house style of `policy-evaluate.controller.ts`
 * and `audit-internal.controller.ts`. Every body is `.strict()` so an unknown
 * field is a 422 rather than a silently ignored one — a caller that sent
 * `approver_user_id` believing it would set the approver must not have that
 * belief quietly disappointed.
 *
 * ## The rationale minimum is a specified control, not a nicety
 *
 * `justification` is required and at least ten characters, from
 * `FRD/Y2-errors.md`'s rationale convention ("Rationale must be at least 10
 * characters") with code `GRANT_RATIONALE_TOO_SHORT` (422). A grant of
 * standing authority over court records is exactly the "legally significant
 * action" that convention exists for: the record of *why* a privilege was
 * conferred is part of what makes the grant auditable after the fact.
 */

/** The shared rationale rule, reused by every body that carries one. */
const justification = z
  .string({ required_error: 'justification is required' })
  .trim()
  .min(10, 'GRANT_RATIONALE_TOO_SHORT');

/** The scope-attribute fields an entitlement or role may be narrowed to. */
const scopeFields = {
  court_id: z.string().uuid().optional(),
  division_id: z.string().uuid().optional(),
  scope_type: z
    .enum([
      'court',
      'division',
      'case',
      'proceeding',
      'party_role',
      'security_designation',
    ])
    .optional(),
  scope_value: z.string().uuid().optional(),
  scope_enum_value: z.string().min(1).max(128).optional(),
};

/**
 * `POST /entitlements/requests`.
 *
 * A discriminated union on `grant_type` so the id that must be present is
 * present: a `role` request needs `role_id`, an `entitlement` request needs
 * `entitlement_key`. Mirrors the table-level
 * `CHECK ((grant_type='role' AND role_id IS NOT NULL) OR …)` so a body that
 * would violate the constraint is refused at the boundary with a field path
 * rather than as a 500 from the database.
 */
export const CreateGrantRequestSchema = z
  .discriminatedUnion('grant_type', [
    z
      .object({
        grant_type: z.literal('role'),
        subject_user_id: z.string().uuid(),
        role_id: z.string().uuid(),
        justification,
        ...scopeFields,
      })
      .strict(),
    z
      .object({
        grant_type: z.literal('entitlement'),
        subject_user_id: z.string().uuid(),
        entitlement_key: z.string().min(1).max(128),
        justification,
        ...scopeFields,
      })
      .strict(),
  ]);

export type CreateGrantRequestDto = z.infer<typeof CreateGrantRequestSchema>;

/**
 * `POST /entitlements/requests/{id}/deny` and
 * `POST /entitlements/grants/{id}/revoke`.
 *
 * Both record a decision to withhold or remove access and both demand a
 * rationale, for the same reason a grant does: the record of *why* access was
 * denied or revoked is as material as the record of why it was given.
 */
export const RationaleBodySchema = z
  .object({ rationale: justification })
  .strict();

export type RationaleBodyDto = z.infer<typeof RationaleBodySchema>;

/** The `object_reference` shape Phase 3's Work Queue consumes unchanged. */
export interface ObjectReference {
  object_type: 'access_grant_request';
  object_id: string;
}

/**
 * One pending request, shaped so Phase 3's Work Queue (F06) can surface it
 * without rework.
 *
 * `object_reference` and `priority` mirror the `Task` shape in
 * `TechArch/03a-api-shared.md` §6.6. CONTEXT requires the pending list "plug
 * into the Work Queue in Phase 3 without rework"; matching the field names now
 * is the cheapest way to make that true. No task row, assignment or queue is
 * created here — this is only the listing shape.
 */
export interface PendingGrantRequestDto {
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
  is_bootstrap: boolean;
  object_reference: ObjectReference;
  priority: 'normal';
}

/** One entitlement-catalog entry, for `GET /entitlements/catalog`. */
export interface CatalogEntryDto {
  entitlement_key: string;
  description: string;
  is_designation_entitlement: boolean;
}
