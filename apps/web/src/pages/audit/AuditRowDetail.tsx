import { Tooltip } from '@trussworks/react-uswds';

import type { AuditExplorerEvent } from './AuditResultsTable';

/**
 * ============================================================================
 * AuditRowDetail — the expanded region below a results row (Screen-17).
 * ============================================================================
 *
 * Shows Actor, Object, Rule ref, and the before/after states as readable
 * key→value pairs — NOT raw JSON blobs (Screen-17 renders "{status: proposed} →
 * {status: admitted}", a legible diff, not a serialized object).
 *
 * The two deep links — "View Rule Package {version} →" and "View Object Detail
 * →" — are DISABLED in Phase 1 with an explanatory tooltip naming the phase that
 * adds them: the Configuration Engine (Phase 2) owns the rule-package version
 * page, and most object-detail pages are Phase 4+. A link that silently 404s is
 * worse than a disabled one that says why — "View Rule Package" that lands on a
 * dead page teaches an auditor the trail is broken when it is not.
 */

/** Render a JSON scalar/object as a short, readable string. */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The union of keys across before and after, for a legible field-by-field view. */
function stateKeys(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): string[] {
  return [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
}

export function AuditRowDetail({ event }: { event: AuditExplorerEvent }): JSX.Element {
  const keys = stateKeys(event.before_state, event.after_state);
  const ruleLabel = event.rule_version_label ?? 'n/a';

  return (
    <div data-testid="audit-row-detail" className="padding-2 bg-base-lightest">
      <dl className="grid-row grid-gap">
        <div className="tablet:grid-col-4">
          <dt className="text-bold">Actor</dt>
          <dd className="margin-left-0">{event.actor_id}</dd>
        </div>
        <div className="tablet:grid-col-4">
          <dt className="text-bold">Object</dt>
          <dd className="margin-left-0">
            {event.object_type} {event.object_id}
          </dd>
        </div>
        <div className="tablet:grid-col-4">
          <dt className="text-bold">Rule ref</dt>
          <dd className="margin-left-0">{ruleLabel}</dd>
        </div>
      </dl>

      <h3 className="font-body-sm margin-bottom-05">Before → After</h3>
      {keys.length === 0 ? (
        <p className="margin-top-0">No state change recorded for this event.</p>
      ) : (
        <table className="usa-table usa-table--compact width-full" data-testid="audit-diff-table">
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                <td>{key}</td>
                <td>{renderValue(event.before_state?.[key])}</td>
                <td>{renderValue(event.after_state?.[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="margin-top-2 display-flex flex-wrap">
        {/* Disabled deep links, each with a tooltip naming the phase that adds
            the destination. NOT dead <a> tags that 404. */}
        <span className="margin-right-2">
          <Tooltip
            label={`The rule-package version page arrives with the Configuration Engine in Phase 2.`}
            position="top"
          >
            <button
              type="button"
              className="usa-button usa-button--outline"
              disabled
              aria-disabled="true"
              data-testid="rule-package-link"
            >
              View Rule Package {ruleLabel} →
            </button>
          </Tooltip>
        </span>
        <span>
          <Tooltip
            label="Object detail pages arrive with the role workspaces in Phase 4."
            position="top"
          >
            <button
              type="button"
              className="usa-button usa-button--outline"
              disabled
              aria-disabled="true"
              data-testid="object-detail-link"
            >
              View Object Detail →
            </button>
          </Tooltip>
        </span>
      </div>
    </div>
  );
}
