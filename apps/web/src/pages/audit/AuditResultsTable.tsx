import { Button, Table, Tag } from '@trussworks/react-uswds';
import { Fragment, useState } from 'react';

import { AuditRowDetail } from './AuditRowDetail';

/**
 * ============================================================================
 * AuditResultsTable — the read-only Screen-17 results table.
 * ============================================================================
 *
 * READ-ONLY, STRUCTURALLY. There is no edit, delete, create, or export-with-write
 * control anywhere in this file or its siblings — `US-2.3`: "Audit Explorer is
 * read-only; no edit or delete affordance exists anywhere in the UI." No write
 * hook and no non-GET request exists anywhere under the audit pages directory,
 * which the plan's verify step asserts by grep. The append-only, hash-chained
 * log has no lawful edit path, so the UI exposes none.
 *
 * Columns per Screen-17: Timestamp, Actor, Action, Before→After, Rule. Rows are
 * EXPANDABLE (Accordion semantics) — a click/Enter reveals {@link AuditRowDetail}
 * below the row, it does not navigate.
 *
 * Denied attempts are ROWS, not omissions (Screen-17: "Row shown with 'denied'
 * Tag, not omitted … Distinguishes 'tried and was told no' from records that
 * simply don't exist"). An `access_attempt` row carries a Tag whose TEXT reads
 * "denied" or "granted" from `after_state.outcome` — not colour alone (1.4.1).
 *
 * Keyset pagination: a "Load more" button appears when the parent has a
 * `next_cursor`, driving the next page.
 */

/** One row as the Explorer returns it (apps/api explorer.dto.ts). */
export interface AuditExplorerEvent {
  id: string;
  actor_id: string;
  action_type: string;
  object_type: string;
  object_id: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  rule_version_ref?: string | null;
  rule_version_label?: string | null;
  occurred_at: string;
  before_after_summary?: {
    changes: Array<{ field: string; before: unknown; after: unknown }>;
    truncated: boolean;
  } | null;
}

/** The access-attempt outcome Tag's TEXT — never colour alone (1.4.1). */
function outcomeTag(event: AuditExplorerEvent): JSX.Element | null {
  if (event.action_type !== 'access_attempt') return null;
  const outcome = event.after_state?.outcome;
  const text = outcome === 'denied' ? 'denied' : outcome === 'granted' ? 'granted' : 'attempt';
  return (
    <Tag data-testid="access-attempt-tag" className="margin-left-1">
      {text}
    </Tag>
  );
}

/** A one-line Before→After summary for the table cell (full detail is in the row). */
function summaryText(event: AuditExplorerEvent): string {
  const summary = event.before_after_summary;
  if (summary === null || summary === undefined || summary.changes.length === 0) {
    return '—';
  }
  const parts = summary.changes.map(
    (c) => `${c.field}: ${renderScalar(c.before)}→${renderScalar(c.after)}`,
  );
  return parts.join(', ') + (summary.truncated ? ' …' : '');
}

function renderScalar(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'object') return '{…}';
  return String(value);
}

export function AuditResultsTable({
  events,
  hasMore,
  onLoadMore,
  loadingMore,
}: {
  events: AuditExplorerEvent[];
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
}): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  return (
    <div>
      <Table bordered fullWidth data-testid="audit-results-table">
        <thead>
          <tr>
            <th scope="col">Timestamp</th>
            <th scope="col">Actor</th>
            <th scope="col">Action</th>
            <th scope="col">Before→After</th>
            <th scope="col">Rule</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const isOpen = expanded.has(event.id);
            return (
              <Fragment key={event.id}>
                <tr
                  data-testid="audit-row"
                  data-action-type={event.action_type}
                  tabIndex={0}
                  aria-expanded={isOpen}
                  aria-controls={`audit-detail-${event.id}`}
                  role="button"
                  onClick={() => toggle(event.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle(event.id);
                    }
                  }}
                >
                  <td>{new Date(event.occurred_at).toLocaleString()}</td>
                  <td>{event.actor_id}</td>
                  <td>
                    {event.action_type}
                    {outcomeTag(event)}
                  </td>
                  <td>{summaryText(event)}</td>
                  <td>{event.rule_version_label ?? '—'}</td>
                </tr>
                {isOpen ? (
                  <tr id={`audit-detail-${event.id}`}>
                    <td colSpan={5} className="padding-0">
                      <AuditRowDetail event={event} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </Table>

      {hasMore ? (
        <Button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          data-testid="audit-load-more"
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  );
}
