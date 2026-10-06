import { Alert } from '@trussworks/react-uswds';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ApiError, auditExplorerControllerExplore } from '../api/client';
import { ApiErrorAlert } from '../components/ApiErrorAlert';
import { AuditFilters, type AuditFilterValues } from './audit/AuditFilters';
import { AuditResultsTable, type AuditExplorerEvent } from './audit/AuditResultsTable';
import { ChainIntegrityBadge } from './audit/ChainIntegrityBadge';

/**
 * ============================================================================
 * AuditExplorerPage — the read-only Audit Explorer (UX-Mockup Screen-17).
 * ============================================================================
 *
 * CONTEXT: "the Audit Explorer (F02 is genuinely a Phase 1 deliverable, not
 * Phase 4)." This is the clickable demonstration of success criterion 3 — an
 * auditor filters the full history and sees actor, action, before/after, and
 * rule version — and the UI half of criterion 4 (denied attempts appear as
 * distinctly tagged rows, never omitted).
 *
 * It composes the four Screen-17 parts: the always-visible chain-integrity badge
 * (top-right), the filter toolbar, the read-only results table, and the
 * expandable row detail (owned by AuditResultsTable/AuditRowDetail).
 *
 * ## Access state comes from the SERVER, not a client guess
 *
 * The no-entitlement state is derived from the server's `AUDIT_READ_DENIED`
 * error code, not from a client-side `hasEntitlement('audit_reader')` check, so
 * the screen reflects the server's ACTUAL authorization decision (Screen-17: the
 * entire screen is replaced with "You do not have audit explorer access"). The
 * sealed-case designation-denied state surfaces `AUDIT_DESIGNATION_DENIED` the
 * same way. A client-side guess could diverge from the PDP; the server is the
 * one authority.
 *
 * ## Navigation Map note
 *
 * `UX-Mockup`'s Navigation Map places this screen at `/admin/audit` under the
 * Phase 4 Admin Dashboard. Phase 1 has no role workspaces, so it mounts here at
 * `/audit` in the generic shell; Phase 4 remounts it at `/admin/audit`.
 */

interface ExplorerResponse {
  audit_events: AuditExplorerEvent[];
  next_cursor?: string;
}

/** The filter keys that live in the URL query string. */
const FILTER_KEYS = ['case_id', 'user_id', 'date_from', 'date_to', 'object_type', 'action_type'] as const;

/** Read the applied filters out of the URL query string. */
function filtersFromParams(params: URLSearchParams): AuditFilterValues {
  const values: AuditFilterValues = {};
  for (const key of FILTER_KEYS) {
    const v = params.get(key);
    if (v !== null && v !== '') {
      values[key] = v;
    }
  }
  return values;
}

export function AuditExplorerPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);

  // Accumulated pages for keyset "Load more". Reset whenever the filters change
  // (a new filter is a new query, not a continuation).
  const [extraPages, setExtraPages] = useState<AuditExplorerEvent[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const filtersKey = JSON.stringify(filters);

  const query = useQuery({
    queryKey: ['audit', 'explorer', filtersKey],
    queryFn: async (): Promise<ExplorerResponse> => {
      // A fresh first-page query resets any accumulated pages.
      setExtraPages([]);
      setCursor(undefined);
      const { data, error } = await auditExplorerControllerExplore({
        query: { ...filters } as Record<string, string>,
      });
      if (error !== undefined || data === undefined) {
        throw error instanceof Error
          ? error
          : new ApiError('UNKNOWN_ERROR', 'Could not load audit events', 0);
      }
      const resp = data as unknown as ExplorerResponse;
      setCursor(resp.next_cursor);
      return resp;
    },
  });

  const onSearch = useCallback(
    (values: AuditFilterValues) => {
      const next = new URLSearchParams();
      for (const key of FILTER_KEYS) {
        const v = values[key];
        if (v !== undefined && v !== '') {
          next.set(key, v);
        }
      }
      setSearchParams(next);
    },
    [setSearchParams],
  );

  const loadMore = useCallback(async () => {
    if (cursor === undefined) return;
    setLoadingMore(true);
    try {
      const { data, error } = await auditExplorerControllerExplore({
        query: { ...filters, cursor } as Record<string, string>,
      });
      if (error !== undefined || data === undefined) {
        throw error instanceof Error ? error : new Error('Could not load more');
      }
      const resp = data as unknown as ExplorerResponse;
      setExtraPages((prev) => [...prev, ...resp.audit_events]);
      setCursor(resp.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, filters]);

  // The no-entitlement / designation-denied states, derived from the SERVER's code.
  if (query.isError && query.error instanceof ApiError) {
    const code = query.error.error_code;
    if (code === 'AUDIT_READ_DENIED') {
      return (
        <section data-testid="audit-screen">
          <h1>Audit Explorer</h1>
          <Alert
            type="error"
            headingLevel="h2"
            heading="Audit access not granted"
            role="alert"
            data-testid="audit-read-denied"
          >
            You do not have audit explorer access.
          </Alert>
        </section>
      );
    }
    if (code === 'AUDIT_DESIGNATION_DENIED') {
      return (
        <section data-testid="audit-screen">
          <h1>Audit Explorer</h1>
          <ChainIntegrityBadge />
          <Alert
            type="warning"
            headingLevel="h2"
            heading="Additional authorization required"
            role="alert"
            data-testid="audit-designation-denied"
          >
            This case&rsquo;s audit history requires additional authorization. This attempt is
            itself recorded and will appear as a row the next time anyone queries the Audit
            Explorer.
          </Alert>
        </section>
      );
    }
  }

  const firstPage = query.data?.audit_events ?? [];
  const events = [...firstPage, ...extraPages];
  const hasMore = cursor !== undefined;

  return (
    <section data-testid="audit-screen">
      <div className="display-flex flex-justify flex-align-center flex-wrap">
        <h1 className="margin-bottom-0">Audit Explorer</h1>
        {/* Top-right, always visible. */}
        <ChainIntegrityBadge />
      </div>

      <AuditFilters
        initial={filters}
        caseOptions={caseOptionsFrom(events)}
        userOptions={userOptionsFrom(events)}
        onSearch={onSearch}
      />

      {query.isLoading ? (
        <p role="status" aria-live="polite" data-testid="audit-loading">
          Loading audit events&hellip;
        </p>
      ) : query.isError ? (
        <ApiErrorAlert error={query.error} heading="Could not load audit events" />
      ) : events.length === 0 ? (
        <Alert type="info" headingLevel="h2" heading="No results" data-testid="audit-empty">
          No audit events match these filters.
        </Alert>
      ) : (
        <AuditResultsTable
          events={events}
          hasMore={hasMore}
          onLoadMore={() => void loadMore()}
          loadingMore={loadingMore}
        />
      )}
    </section>
  );
}

/**
 * Build Case ComboBox options from the loaded events. Phase 1 has no dedicated
 * "list every case/user I can see" endpoint for the filters, so the options are
 * seeded from the object/actor ids present in the current result set — enough to
 * refine a view, and it grows as more pages load. (A later phase can back these
 * with a directory endpoint.)
 */
function caseOptionsFrom(events: AuditExplorerEvent[]): { value: string; label: string }[] {
  const ids = new Set<string>();
  for (const e of events) {
    if (e.object_type === 'case' || e.object_type === 'cases') {
      ids.add(e.object_id);
    }
  }
  return [...ids].map((id) => ({ value: id, label: id }));
}

function userOptionsFrom(events: AuditExplorerEvent[]): { value: string; label: string }[] {
  const ids = new Set<string>(events.map((e) => e.actor_id));
  return [...ids].map((id) => ({ value: id, label: id }));
}
