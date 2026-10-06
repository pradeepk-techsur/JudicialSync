import { Alert } from '@trussworks/react-uswds';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/AuthProvider';
import { CallbackPage } from './auth/CallbackPage';
import { LoginPage } from './auth/LoginPage';
import { RequireSession } from './auth/RequireSession';
import { CaseListPage } from './pages/CaseListPage';
import { AppShell } from './shell/AppShell';
import { visibleNavItems } from './shell/SideNav';

/**
 * The Phase 1 route table.
 *
 * Routes: `/login`, `/login/callback`, `/cases`, `/audit`, and `/` redirecting
 * to the first nav item the viewer can see (or showing the no-modules alert).
 *
 * The OIDC callback is `/login/callback`, NOT `/auth/callback`: the Caddy proxy
 * routes `/auth/*` to Keycloak, so a callback under `/auth/` would never reach
 * the SPA. `OIDC_REDIRECT_URI` in docker-compose.yml points at this exact path.
 *
 * `/cases` renders the entitlement-differentiated Case List and `/audit` the
 * read-only Audit Explorer (Screen-17). Both are wired into the navigation (plan
 * 01-13's SideNav), so neither is ever an orphan route
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
      {/* The OIDC callback lands HERE, in the SPA — not under /auth/*, which the
          Caddy proxy routes to Keycloak. OIDC_REDIRECT_URI must point at this
          exact path (docker-compose.yml). */}
      <Route path="/login/callback" element={<CallbackPage />} />

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
              <CaseListPage />
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
  // No modules the viewer can see: this is where a least-privilege account
  // (e.g. jury_admin, zero entitlements) lands. Explain it rather than showing
  // a blank frame. Screens reached by a direct URL render their own not-entitled
  // state (the shell no longer swallows children).
  return (
    <Alert type="info" headingLevel="h2" heading="No modules granted yet">
      Your account is active but has not been granted access to any modules. This is expected
      for a new, least-privilege account. Contact your court administrator to request access.
    </Alert>
  );
}

/** Placeholder for the Audit Explorer screen — mounted for real in Task 2. */
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
