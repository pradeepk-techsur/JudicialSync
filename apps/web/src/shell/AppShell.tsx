import {
  Button,
  GovBanner,
  GridContainer,
  Header,
  Tag,
  Title,
} from '@trussworks/react-uswds';
import type { ReactNode } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { SideNav } from './SideNav';

/**
 * ============================================================================
 * AppShell — ONE generic frame for EVERY role.
 * ============================================================================
 *
 * Per CONTEXT: "One generic shell — no role-specific layouts. A single USWDS
 * header/nav/content shell used by everyone; what differs by role is only which
 * data and nav items appear, driven by entitlements. Per-role workspace designs
 * stay entirely in Phase 4."
 *
 * PHASE 4 OWNS ROLE-SPECIFIC WORKSPACES (F11). Do NOT branch this layout by role
 * here. If a screen needs a different frame, that belongs in Phase 4, not in a
 * `role === …` check added to this component.
 *
 * The landmark structure — a skip link, `banner` (Header), `navigation`
 * (SideNav) and `main` — is deliberate: `UX-Mockup/Y2-accessibility.md`'s
 * "consistent navigation (3.2.3)" depends on it, and Phase 4 inherits whatever
 * structure ships here.
 *
 * ## The shell always renders its children
 *
 * The shell does NOT decide whether the viewer may see a given screen — each
 * screen owns its own entitlement state (the Case List shows a not-entitled
 * alert for a user without `case_read`; the Audit Explorer surfaces the server's
 * `AUDIT_READ_DENIED`). A direct URL visit by a least-privilege user (e.g.
 * `jury_admin`, zero entitlements) must therefore land on that screen's own
 * coherent empty/denied state, not be swallowed by the shell. The
 * "no modules granted" message for such a user lives on the index route
 * (`HomeRedirect` in `routes.tsx`), which is where a user with nowhere to go
 * actually lands.
 */
export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const { principal, logout } = useAuth();

  return (
    <>
      {/* First focusable element: skip straight to the main content region. */}
      <a className="usa-skipnav" href="#main-content">
        Skip to main content
      </a>

      <GovBanner />

      <Header basic role="banner">
        <div className="usa-nav-container">
          <div className="usa-navbar">
            <Title>JudicialSync Platform Core</Title>
          </div>
          <div className="usa-nav__secondary">
            {principal !== null ? (
              <>
                <span data-testid="display-name">{principal.display_name}</span>{' '}
                {principal.roles.map((role) => (
                  <Tag key={`${role.role_name}-${role.court_id ?? ''}`} data-testid="role-tag">
                    {role.role_name}
                  </Tag>
                ))}{' '}
                <Button type="button" onClick={() => void logout()} data-testid="sign-out" unstyled>
                  Sign out
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </Header>

      <GridContainer>
        <div className="grid-row grid-gap">
          <div className="desktop:grid-col-3">
            <SideNav />
          </div>
          <main id="main-content" className="desktop:grid-col-9">
            {children}
          </main>
        </div>
      </GridContainer>
    </>
  );
}
