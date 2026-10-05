import { z } from 'zod';

import { AUDIT_ACTION_TYPES, AuditEvent } from '../audit.types';

/**
 * ============================================================================
 * `GET /api/v1/audit/explorer` — QUERY AND RESULT SHAPES
 * ============================================================================
 *
 * Source: `TechArch/03a-api-shared.md` §6.3 (`AuditExplorerQuery`,
 * `AuditEvent`) and `FRD/Y1a-api-shared.md` §Audit ("query: `case_id,
 * user_id, date_range, object_type`").
 *
 * Three fields here are **not** in §6.3, and each is added for a reason
 * recorded below rather than for convenience.
 */

/** Default page size. */
export const EXPLORER_DEFAULT_LIMIT = 50;

/** Hard ceiling on a page. */
export const EXPLORER_MAX_LIMIT = 200;

/**
 * The query string, after validation.
 *
 * ## Why `action_type` exists even though the FRD does not list it
 *
 * `UX-Mockup/Screen-17-audit-explorer.md` States requires that a denied
 * access attempt appear "with 'denied' Tag, **not omitted** … Distinguishes
 * 'tried and was told no' from records that simply don't exist." An auditor
 * investigating a dispute therefore needs to ask for exactly those rows.
 *
 * `access_attempt` is an **`action_type`**, not an `object_type` — it
 * describes what was attempted, not what was touched — so the FRD's four
 * listed filters cannot express the query the screen requires. The filter is
 * added here and the gap is recorded in the plan's SUMMARY rather than
 * silently papered over.
 *
 * Note what is *not* done: `access_attempt` rows are **included by default**.
 * Filtering them out of the unfiltered view and requiring an opt-in would
 * reintroduce exactly the omission Screen-17 forbids.
 *
 * ## Why `limit` + `cursor` rather than `page` + `offset`
 *
 * `audit_events` is append-only and grows forever, and Screen-17's table is
 * the highest-volume read in the system. `OFFSET n` makes PostgreSQL walk and
 * discard `n` rows, so page 500 costs five hundred pages of work — and on an
 * append-only table a concurrent insert shifts every subsequent offset, so
 * pages silently repeat rows. Keyset pagination on `(occurred_at, id)` is
 * O(page) regardless of depth and is stable under concurrent appends.
 */
export const AuditExplorerQuerySchema = z
  .object({
    case_id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    /** Inclusive lower bound on `occurred_at`. ISO-8601. */
    date_from: z.string().datetime({ offset: true }).optional(),
    /** Inclusive upper bound on `occurred_at`. ISO-8601. */
    date_to: z.string().datetime({ offset: true }).optional(),
    object_type: z.string().min(1).max(128).optional(),
    action_type: z.enum(AUDIT_ACTION_TYPES).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(EXPLORER_MAX_LIMIT)
      .default(EXPLORER_DEFAULT_LIMIT),
    /** Opaque keyset cursor from a previous page's `next_cursor`. */
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export type AuditExplorerQuery = z.infer<typeof AuditExplorerQuerySchema>;

/**
 * One row of the Explorer result set.
 *
 * The `AuditEvent` fields are §6.3 verbatim. The two additions below are what
 * `Screen-17`'s table actually renders, and both are derived server-side so
 * that every client renders the same thing:
 *
 *  - **`before_after_summary`** backs the "Before→After" column. Computing it
 *    in the API rather than the browser keeps the diff rules in one place —
 *    the Admin Dashboard (Phase 4) and any export share one definition of
 *    "what changed".
 *
 *  - **`rule_version_label`** backs the "Rule" column and the
 *    "View Rule Package →" deep link. `FRD/F02` Sub-features require "linkage
 *    of every audit entry to the specific configuration/rule-package version
 *    … in effect at action time"; `rule_version_ref` is a bare UUID, and a
 *    UUID in a table column is a linkage nobody can read. The label is the
 *    linkage made useful.
 */
export interface AuditExplorerEvent extends AuditEvent {
  /** Compact diff, e.g. `status: proposed → admitted`. `null` when nothing changed. */
  before_after_summary: string | null;
  /** e.g. `"v4"`. `null` when the action was not rule-driven. */
  rule_version_label: string | null;
}

/** `GET /audit/explorer` → 200 */
export interface AuditExplorerResponse {
  audit_events: AuditExplorerEvent[];
  /** Present only when another page exists. */
  next_cursor?: string;
}

/** `GET /audit/integrity/status` → 200 */
export interface IntegrityStatusResponse {
  chain_verified: boolean;
  /** ISO-8601, or `null` when no verification has run in this deployment. */
  last_verified_at: string | null;
  open_alert_count: number;
  /** Rows walked by the last verification. `null` when none has run. */
  rows_checked: number | null;
}

/** One `platform.integrity_alerts` row, as the API returns it. */
export interface IntegrityAlertDto {
  id: string;
  alert_type: string;
  severity: string;
  audit_event_id: string | null;
  expected_hash: string | null;
  actual_hash: string | null;
  detail: Record<string, unknown>;
  detected_at: string;
  status: string;
}

/** `GET /audit/integrity/alerts` → 200 */
export interface IntegrityAlertsResponse {
  alerts: IntegrityAlertDto[];
}
