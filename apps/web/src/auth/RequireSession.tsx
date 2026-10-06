import { GridContainer } from '@trussworks/react-uswds';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from './AuthProvider';

/**
 * Wraps protected routes.
 *
 * With no session, it redirects to `/login`, preserving the intended path so
 * the user lands where they were headed after signing in. While the session
 * exists but entitlements are still loading it shows a USWDS loading state —
 * NEVER a blank authenticated frame, which reads as broken.
 */
export function RequireSession({ children }: { children: ReactNode }): JSX.Element {
  const { principal, loading } = useAuth();
  const location = useLocation();

  const hasToken =
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem('judicialsync.session_token') !== null;

  if (!hasToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (loading || principal === null) {
    return (
      <main id="main-content">
        <GridContainer>
          <p aria-live="polite">Loading your workspace…</p>
        </GridContainer>
      </main>
    );
  }

  return <>{children}</>;
}
