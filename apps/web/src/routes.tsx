import { Alert } from '@trussworks/react-uswds';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/AuthProvider';
import { CallbackPage } from './auth/CallbackPage';
import { LoginPage } from './auth/LoginPage';
import { RequireSession } from './auth/RequireSession';
import { AppShell } from './shell/AppShell';
import { visibleNavItems } from './shell/SideNav';

/**
 * The Phase 1 route table.
 *
 * Routes: `/login`, `/auth/callback`, `/cases`, `/audit`, and `/` redirecting to
 * the first nav item the viewer can see (or showing the no-modules alert).
 *
 * `/cases` and `/audit` ship here as PLACEHOLDER regions already wired into the
 * navigation — plan 01-15 mounts the real Case List and Audit Explorer screens.
 * Shipping them wired-in now means neither is ever an orphan route
 * (UX-Mockup/00-overview.md invariant: "No screen is reachable only by typing a
 * URL.").
 *
 * NO PHASE 4 ROUTES. `/clerk/*`, `/chambers/*`, `/admin/*`, `/deputy/*` and
 * `/portal/*` must not exist in this phase (CONTEXT Deferred Ideas). The mockup
 * places the Audit Explorer at `/admin/audit`; Phase 1 has no role workspaces,
 * so it lives at `/audit` in the generic shell and Phase 4 remounts it.
 */
export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<CallbackPage />} />

      <Route
        path="/"
        element={
          <RequireSession>
            <AppShell>
              <HomeRedirect />
            </AppShell>
          </RequireSession>
        }
      />
      <Route
        path="/cases"
        element={
          <RequireSession>
            <AppShell>
              <CasesPlaceholder />
            </AppShell>
          </RequireSession>
        }
      />
      <Route
        path="/audit"
        element={
          <RequireSession>
            <AppShell>
              <AuditPlaceholder />
            </AppShell>
          </RequireSession>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** `/` sends the viewer to the first module they can see, or shows the alert. */
function HomeRedirect(): JSX.Element {
  const { hasEntitlement } = useAuth();
  const first = visibleNavItems(hasEntitlement)[0];
  if (first !== undefined) {
    return <Navigate to={first.to} replace />;
  }
  // No modules: AppShell already renders the explanatory alert in place of
  // children, so nothing more is needed here.
  return <></>;
}

/** Placeholder for the Case List screen plan 01-15 mounts. */
function CasesPlaceholder(): JSX.Element {
  return (
    <section data-testid="cases-screen">
      <h1>Cases</h1>
      <Alert type="info" headingLevel="h2" heading="Case list">
        The case list is mounted here in plan 01-15.
      </Alert>
    </section>
  );
}

/** Placeholder for the Audit Explorer screen plan 01-15 mounts. */
function AuditPlaceholder(): JSX.Element {
  return (
    <section data-testid="audit-screen">
      <h1>Audit Explorer</h1>
      <Alert type="info" headingLevel="h2" heading="Audit Explorer">
        The Audit Explorer is mounted here in plan 01-15.
      </Alert>
    </section>
  );
}
