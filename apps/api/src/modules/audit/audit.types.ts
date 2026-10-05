/**
 * Shared types for the Audit Service write path.
 *
 * The `AuditEvent` shape below is copied from `TechArch/03a-api-shared.md`
 * §6.3 and the `action_type` union from `FRD/F02` Inputs. Both are reproduced
 * verbatim rather than paraphrased, because every later phase's audit calls
 * are typed against this union and a value invented here would be a value the
 * Audit Explorer's filters (plan 01-12) do not know about.
 */

/**
 * The eight material-action categories from `FRD/F02` Inputs.
 *
 * Note `access_attempt` in particular. `TechArch/04-security.md` §7.6 requires
 * that "Every such denied/hidden attempt is itself logged as an
 * `access_attempt` audit event" — that is the second half of Phase 1 success
 * criterion 4, and plan 01-07's ABAC guard emits it through `AuditService`.
 * It is the one action type that records something that did **not** happen,
 * which is exactly why it is easy to leave out of an enum written from the
 * happy path.
 */
export type AuditActionType =
  | 'status_change'
  | 'ruling'
  | 'custody_transfer'
  | 'calculation_override'
  | 'approval'
  | 'designation_change'
  | 'config_change'
  | 'access_attempt';

/** Runtime companion to {@link AuditActionType}, for zod/validation use. */
export const AUDIT_ACTION_TYPES = [
  'status_change',
  'ruling',
  'custody_transfer',
  'calculation_override',
  'approval',
  'designation_change',
  'config_change',
  'access_attempt',
] as const satisfies readonly AuditActionType[];

/**
 * The chain's first `prev_hash`, seeded into `platform.audit_chain_head` by
 * migration `20260101000000_platform_schema`.
 */
export const AUDIT_GENESIS_HASH = '0'.repeat(64);

/**
 * What a caller supplies to {@link AuditService.record}.
 *
 * ## `actor_id` is system-supplied, always
 *
 * `FRD/F02` Inputs is unambiguous: "`actor_id` (UUID, required, system-supplied
 * from session — **never client-supplied**)." In-process callers pass the
 * session-derived principal id; the one HTTP entry point
 * (`audit-internal.controller.ts`) takes it from the `x-service-actor-id`
 * header of an authenticated service call and **rejects any request body
 * containing an `actor_id` key at all** (threat T-01-15).
 *
 * A field that looks like this one is exactly how attribution gets forged, so
 * the rule is enforced at the boundary rather than documented and hoped for.
 *
 * ## `before_state` / `after_state` are hashed, so their encoding is pinned
 *
 * These end up inside the row hash via Postgres' `jsonb::text` rendering. The
 * TypeScript side reproduces that rendering exactly (see
 * `canonical-payload.ts`), which imposes two restrictions worth knowing before
 * you hit them at runtime:
 *
 *   - every `number` must be a **safe integer**; a fraction, a `NaN`, an
 *     `Infinity` or a value past `Number.MAX_SAFE_INTEGER` throws with a
 *     message telling you to pass a string instead;
 *   - strings may not contain `\u0000` or an unpaired surrogate, neither of
 *     which PostgreSQL `jsonb` can store.
 */
export interface AuditWriteInput {
  /** UUID of the acting user. **From the session. Never from a request body.** */
  actor_id: string;
  action_type: AuditActionType;
  /** Logical table/entity name, e.g. `"cases"`, `"security_designations"`. */
  object_type: string;
  /** UUID of the affected object. */
  object_id: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  /** UUID of the rule package version in effect, when the action is rule-driven. */
  rule_version_ref?: string | null;
  /** UUID of the calculation version in effect, when the action is calculation-driven. */
  calculation_version_ref?: string | null;
  client_ip?: string | null;
  session_id?: string | null;
}

/**
 * A persisted audit row, as returned by the Audit Explorer (plan 01-12).
 * Mirrors `TechArch/03a-api-shared.md` §6.3.
 */
export interface AuditEvent {
  id: string;
  actor_id: string;
  action_type: AuditActionType;
  object_type: string;
  object_id: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  rule_version_ref?: string | null;
  calculation_version_ref?: string | null;
  client_ip?: string | null;
  session_id?: string | null;
  occurred_at: string;
  prev_hash: string;
  /** `sha256(canonical_payload(row_without_hash) || prev_hash)` — see `canonical-payload.ts`. */
  row_hash: string;
}
