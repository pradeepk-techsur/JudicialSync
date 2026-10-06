import { Alert, Icon, Tag } from '@trussworks/react-uswds';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { integrityControllerGetAlerts, integrityControllerGetStatus } from '../../api/client';

/**
 * ============================================================================
 * ChainIntegrityBadge — the live hash-chain verification indicator (Screen-17).
 * ============================================================================
 *
 * Top-right, always visible. It polls `GET /audit/integrity/status` every 30s
 * and shows one of two faces:
 *
 *  - **Verified** → a Tag reading "Chain verified" with a check Icon and the
 *    `last_verified_at` timestamp. Colour is NEVER the only signal
 *    (`Y2-accessibility.md` 1.4.1): the text and the glyph carry the meaning too.
 *  - **Broken** → the badge is REPLACED by a critical, NON-dismissable Alert
 *    reading the exact Screen-17 copy, "Audit integrity check failed — escalated
 *    to security officer" (the UI face of `AUDIT_CHAIN_BROKEN`). It sits in an
 *    `aria-live="assertive"` region so a screen-reader user is told immediately,
 *    and it has no close control — a broken audit chain is not something a user
 *    may dismiss. The specific break(s) are inspectable in an expandable region
 *    fed by `GET /audit/integrity/alerts`, because CONTEXT requires a detected
 *    break "surfaces in the Audit Explorer."
 *
 * The 30s poll means a break that appears while the auditor is on the page turns
 * the badge into the alert without a manual refresh.
 */

interface IntegrityStatus {
  chain_verified: boolean;
  last_verified_at: string | null;
  open_alert_count: number;
}

interface IntegrityAlert {
  id: string;
  alert_type: string;
  severity: string;
  audit_event_id: string | null;
  expected_hash: string | null;
  actual_hash: string | null;
  detected_at: string;
  status: string;
}

const POLL_INTERVAL_MS = 30_000;

export function ChainIntegrityBadge(): JSX.Element | null {
  const [showBreakDetail, setShowBreakDetail] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['audit', 'integrity', 'status'],
    refetchInterval: POLL_INTERVAL_MS,
    queryFn: async (): Promise<IntegrityStatus> => {
      const { data, error } = await integrityControllerGetStatus();
      if (error !== undefined || data === undefined) {
        throw new Error('Could not read integrity status');
      }
      return data as IntegrityStatus;
    },
  });

  // The specific break(s) — fetched only once the chain is reported broken, so an
  // ordinary verified page makes no extra call.
  const broken = statusQuery.data?.chain_verified === false;
  const alertsQuery = useQuery({
    queryKey: ['audit', 'integrity', 'alerts'],
    enabled: broken,
    queryFn: async (): Promise<IntegrityAlert[]> => {
      const { data, error } = await integrityControllerGetAlerts();
      if (error !== undefined || data === undefined) {
        throw new Error('Could not read integrity alerts');
      }
      return (data as { alerts: IntegrityAlert[] }).alerts;
    },
  });

  // While the first status read is in flight, show nothing rather than flashing a
  // misleading state. A failed status read is treated like a verified badge is
  // NOT shown — but it must never be read as "broken", so render a neutral note.
  if (statusQuery.isLoading) {
    return (
      <span data-testid="integrity-badge-loading" aria-live="polite">
        Checking chain integrity&hellip;
      </span>
    );
  }

  if (statusQuery.isError || statusQuery.data === undefined) {
    return (
      <span data-testid="integrity-badge-unknown" aria-live="polite">
        Chain integrity status unavailable
      </span>
    );
  }

  if (broken) {
    return (
      // Assertive so a screen reader announces the break without the user having
      // to look. NO dismiss control — a broken chain is not dismissable.
      <div aria-live="assertive" data-testid="integrity-broken">
        <Alert type="error" headingLevel="h2" heading="Audit integrity check failed" role="alert">
          <p className="margin-top-0">Audit integrity check failed — escalated to security officer</p>
          <button
            type="button"
            className="usa-button usa-button--unstyled"
            aria-expanded={showBreakDetail}
            onClick={() => setShowBreakDetail((v) => !v)}
            data-testid="integrity-break-toggle"
          >
            {showBreakDetail ? 'Hide details' : 'View details'}
          </button>
          {showBreakDetail ? (
            <div data-testid="integrity-break-detail" className="margin-top-1">
              {alertsQuery.isLoading ? (
                <p>Loading break details&hellip;</p>
              ) : (alertsQuery.data ?? []).length === 0 ? (
                <p>No specific break records are available.</p>
              ) : (
                <ul className="usa-list">
                  {(alertsQuery.data ?? []).map((a) => (
                    <li key={a.id}>
                      <strong>{a.alert_type}</strong> ({a.severity}) detected{' '}
                      {new Date(a.detected_at).toLocaleString()}
                      {a.audit_event_id !== null ? ` — event ${a.audit_event_id}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </Alert>
      </div>
    );
  }

  // Verified: colour + text + glyph (1.4.1).
  const verifiedAt = statusQuery.data.last_verified_at;
  return (
    <div data-testid="integrity-verified" className="display-flex flex-align-center">
      <Tag>
        <Icon.CheckCircle aria-hidden className="margin-right-05" />
        Chain verified
      </Tag>
      {verifiedAt !== null ? (
        <span className="font-body-3xs text-base margin-left-1">
          Last verified {new Date(verifiedAt).toLocaleString()}
        </span>
      ) : null}
    </div>
  );
}
