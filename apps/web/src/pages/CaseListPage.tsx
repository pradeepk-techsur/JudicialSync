import { Alert, Table, Tag } from '@trussworks/react-uswds';
import { useQuery } from '@tanstack/react-query';

import { ApiError, casesControllerList } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { ApiErrorAlert } from '../components/ApiErrorAlert';
import styles from './CaseListPage.module.scss';

/**
 * ============================================================================
 * CaseListPage — the clickable proof that the same screen shows different data.
 * ============================================================================
 *
 * CONTEXT names this surface exactly: "a case list whose contents visibly differ
 * by role/entitlement". Two users open the same `/cases` screen and see
 * different rows, because `GET /api/v1/cases` (plan 01-09's
 * `CaseContextService.listCasesForPrincipal`) pre-filters by the caller's scope
 * AND excludes any case carrying a designation the caller's entitlements do not
 * cover. This is Phase 1 success criteria 1 and 4, made clickable.
 *
 * ## The omission is TOTAL, by construction — and must stay that way
 *
 * `UX-Mockup/Y0-patterns.md` "Non-Disclosure of Sealed/Restricted Existence":
 * a record the viewer may not see is "omitted entirely — never shown as a
 * greyed-out row, a 'restricted' placeholder, or a count that includes it."
 *
 * This component renders EXACTLY the rows the API returned and a count derived
 * from `cases.length`. There is deliberately no "N hidden" row, no placeholder,
 * and no separate total that could include an omitted case. DO NOT add one: a
 * placeholder for a sealed case leaks that a sealed matter exists to someone the
 * per-record gate would refuse, which is the precise disclosure Y0 forbids.
 */

/**
 * The case shape as rendered. `CaseResponse` (TechArch §6.2) carries no
 * designation field — because the API already omits any case the viewer may not
 * see, a visible row's designations are by definition ones the viewer is
 * entitled to. If a future API revision adds `security_designations` to the
 * response, the Tag column below surfaces it; until then the column is simply
 * empty, which is correct.
 */
interface CaseRow {
  id: string;
  court_id?: string;
  court_name?: string;
  division_id?: string;
  division_name?: string;
  case_number: string;
  case_caption?: string;
  case_type?: string;
  status?: string;
  security_designations?: string[];
}

interface CaseListPayload {
  cases: CaseRow[];
  total: number;
}

export function CaseListPage(): JSX.Element {
  const { hasEntitlement } = useAuth();

  // UI-gating only (the server re-validates every call). A user without
  // `case_read` has no "Cases" nav link, but a direct URL visit must still land
  // somewhere coherent — the not-entitled alert below, not an error page.
  const entitled = hasEntitlement('case_read');

  const query = useQuery({
    queryKey: ['cases'],
    enabled: entitled,
    queryFn: async (): Promise<CaseListPayload> => {
      const { data, error } = await casesControllerList();
      if (error !== undefined || data === undefined) {
        // The response interceptor already threw an ApiError for a non-2xx;
        // this guards the generated client's data/error envelope.
        throw error instanceof Error
          ? error
          : new ApiError('UNKNOWN_ERROR', 'Could not load cases', 0);
      }
      return data as unknown as CaseListPayload;
    },
  });

  if (!entitled) {
    return (
      <section data-testid="cases-screen">
        <h1>Cases</h1>
        <Alert
          type="info"
          headingLevel="h2"
          heading="Case access has not been granted"
          data-testid="cases-not-entitled"
        >
          Your account does not have case access. This is expected for an account that has
          not been granted the case-read entitlement. Contact your court administrator to
          request access.
        </Alert>
      </section>
    );
  }

  if (query.isLoading) {
    return (
      <section data-testid="cases-screen">
        <h1>Cases</h1>
        {/* A real loading indicator, not a blank table. */}
        <p role="status" aria-live="polite" data-testid="cases-loading">
          <span className="usa-sr-only">Loading cases</span>
          Loading cases&hellip;
        </p>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section data-testid="cases-screen">
        <h1>Cases</h1>
        <ApiErrorAlert error={query.error} heading="Could not load cases" />
      </section>
    );
  }

  const cases = query.data?.cases ?? [];
  // The count is derived from the rendered rows — NEVER a separate server total
  // that could include an omitted case (Y0 non-disclosure).
  const count = cases.length;

  return (
    <section data-testid="cases-screen">
      <h1>Cases</h1>

      <p data-testid="case-count" className="text-bold">
        {count} {count === 1 ? 'case' : 'cases'}
      </p>

      {count === 0 ? (
        <Alert
          type="info"
          headingLevel="h2"
          heading="No cases match your access scope"
          data-testid="cases-empty"
        >
          There are no cases visible to your account right now.
        </Alert>
      ) : (
        <div className={styles.responsiveTable}>
          <Table bordered fullWidth className={styles.caseTable}>
            <thead>
              <tr>
                <th scope="col">Court</th>
                <th scope="col">Division</th>
                <th scope="col">Case number</th>
                <th scope="col">Caption</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">Designations</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} data-testid="case-row">
                  <td data-label="Court">{c.court_name ?? c.court_id ?? '—'}</td>
                  <td data-label="Division">{c.division_name ?? c.division_id ?? '—'}</td>
                  <td data-label="Case number">{c.case_number}</td>
                  <td data-label="Caption">{c.case_caption ?? '—'}</td>
                  <td data-label="Type">{c.case_type ?? '—'}</td>
                  <td data-label="Status">{c.status ?? '—'}</td>
                  <td data-label="Designations">
                    {/* Only designations of VISIBLE cases appear — the API has
                        already omitted any case the viewer may not see, so there
                        is nothing to hide here. Do NOT add a placeholder row for
                        omitted cases (Y0 non-disclosure). */}
                    {(c.security_designations ?? []).map((d) => (
                      <Tag key={d} className="margin-right-05">
                        {d}
                      </Tag>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </section>
  );
}
