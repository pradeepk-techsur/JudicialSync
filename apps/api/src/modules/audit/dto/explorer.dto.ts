import { z } from 'zod';

import { AUDIT_ACTION_TYPES, AuditEvent } from '../audit.types';

/**
 * ============================================================================
 * `GET /audit/explorer` — THE QUERY CONTRACT
 * ============================================================================
 *
 * The filter set is `AuditExplorerQuery` from `TechArch/03a-api-shared.md`
 * §6.3 (`case_id?`, `user_id?`, `date_from?`, `date_to?`, `object_type?`) plus
 * three additions this plan makes deliberately, each noted in the SUMMARY:
 *
 *  - **`action_type`** — `Screen-17` requires a `denied` tag column and a way
 *    to see denied attempts as rows. `access_attempt` is an `action_type`, not
 *    an `object_type`, so the FRD's listed filters cannot select them. The
 *    mockup needs this filter; the FRD omits it. Spec gap closed by the mockup.
 *  - **`limit` / `cursor`** — keyset pagination over `(occurred_at, id)`.
 *    `audit_events` is append-only and grows forever, and `Screen-17`'s table
 *    is the highest-volume read in the system; offset pagination degrades
 *    linearly with table size and double-counts rows inserted between pages.
 */

/**
 * The opaque cursor is `base64url(occurred_at_iso | id)`. Opaque because a
 * client has no business constructing one — exposing the sort key invites a
 * client to page by a value it chose, which keyset pagination cannot honour
 * correctly. The server mints it from the last row of a page and reads it back.
 */
export interface ExplorerCursor {
  occurred_at: string;
  id: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * An ISO-8601 instant. `z.coerce.date()` accepts both a full timestamp and a
 * bare `YYYY-MM-DD` (which `Screen-17`'s date pickers emit), turning either
 * into a `Date` the service binds directly.
 */
const isoDate = z.coerce.date();

export const AuditExplorerQuerySchema = z
  .object({
    case_id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    date_from: isoDate.optional(),
    date_to: isoDate.optional(),
    /** The LOGICAL table name, e.g. `"cases"` — matches `audit_events.object_type`. */
    object_type: z.string().min(1).max(128).optional(),
    action_type: z.enum(AUDIT_ACTION_TYPES).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .default(DEFAULT_LIMIT),
    cursor: z.string().min(1).optional(),
  })
  .strict();

export type AuditExplorerQuery = z.infer<typeof AuditExplorerQuerySchema>;

/**
 * One row as `Screen-17` renders it: the `AuditEvent` from §6.3 plus the two
 * derived fields the screen's columns need.
 *
 *  - **`before_after_summary`** powers the "Before→After" column — a compact,
 *    display-safe diff rather than the raw `before_state`/`after_state` blobs.
 *  - **`rule_version_label`** powers the "Rule" column and its
 *    "View Rule Package →" deep link, resolved from `rule_version_ref` →
 *    `rule_package_versions.version_number` (e.g. `"v4.2"`). `FRD/F02`
 *    Sub-features: "Linkage of every audit entry to the specific
 *    configuration/rule-package version … in effect at action time"; surfacing
 *    the label is what makes that linkage usable.
 */
export interface AuditExplorerEvent extends AuditEvent {
  /** Compact diff for the table's Before→After column. `null` when nothing changed. */
  before_after_summary: BeforeAfterSummary | null;
  /** e.g. `"v4.2"`, or `null` when the action was not rule-driven. */
  rule_version_label: string | null;
}

/** A single changed field for the Before→After column. */
export interface BeforeAfterChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface BeforeAfterSummary {
  changes: BeforeAfterChange[];
  /** True when the full diff was truncated to keep the row compact. */
  truncated: boolean;
}

export interface AuditExplorerResponse {
  audit_events: AuditExplorerEvent[];
  /** Present only when another page exists. Opaque — pass it back as `cursor`. */
  next_cursor?: string;
}

/** Encode a keyset cursor. */
export function encodeCursor(cursor: ExplorerCursor): string {
  return Buffer.from(`${cursor.occurred_at}|${cursor.id}`, 'utf8').toString(
    'base64url',
  );
}

/**
 * Decode a keyset cursor, or `null` when it is malformed.
 *
 * A malformed cursor returns `null` rather than throwing so the service can
 * reject it with a 422 naming the field, instead of a 500 — a client that
 * hand-crafts one, or one carried across a deploy that changed the format,
 * is a bad request, not a server fault.
 */
export function decodeCursor(raw: string): ExplorerCursor | null {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const sep = decoded.lastIndexOf('|');
  if (sep <= 0) return null;

  const occurred_at = decoded.slice(0, sep);
  const id = decoded.slice(sep + 1);
  if (occurred_at === '' || id === '') return null;
  if (Number.isNaN(Date.parse(occurred_at))) return null;

  return { occurred_at, id };
}
