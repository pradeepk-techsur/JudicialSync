import { SideNav as UswdsSideNav } from '@trussworks/react-uswds';
import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';

/**
 * ============================================================================
 * SideNav — driven by COMPUTED ENTITLEMENTS, not by role labels.
 * ============================================================================
 *
 * This is `UX-Mockup/Y0-patterns.md`'s "Entitlement-Gated Control Rendering
 * (not just role-gated)" pattern: components check the viewer's COMPUTED
 * ENTITLEMENT, not merely their role label. There is deliberately NO role-label
 * comparison anywhere in this file — the e2e verify greps for role-equality and
 * role-membership checks and fails the build if one appears.
 *
 * Each row is shown only when the viewer holds the entitlement. A user with
 * neither sees no module links at all (the AppShell renders the explanatory
 * alert in that case), which is exactly what a least-privilege account should
 * see — "role existence must never imply access."
 */

interface NavDef {
  label: string;
  to: string;
  entitlement: string;
}

/**
 * The Phase 1 navigation. Plan 01-15 mounts the real Case List and Audit
 * Explorer screens at these routes; this plan already wires both into the nav so
 * neither is ever an orphan route (UX-Mockup/00-overview.md: "every screen has
 * at least one inbound path").
 */
const NAV_ITEMS: NavDef[] = [
  { label: 'Cases', to: '/cases', entitlement: 'case_read' },
  { label: 'Audit Explorer', to: '/audit', entitlement: 'audit_reader' },
];

/** The nav items the current viewer is entitled to see. */
export function visibleNavItems(hasEntitlement: (key: string) => boolean): NavDef[] {
  return NAV_ITEMS.filter((item) => hasEntitlement(item.entitlement));
}

export function SideNav(): JSX.Element | null {
  const { hasEntitlement } = useAuth();
  const location = useLocation();

  const items = visibleNavItems(hasEntitlement);
  if (items.length === 0) {
    return null;
  }

  const links = items.map((item) => (
    <Link
      key={item.to}
      to={item.to}
      className="usa-sidenav__link"
      aria-current={location.pathname === item.to ? 'page' : undefined}
    >
      {item.label}
    </Link>
  ));

  return (
    <nav aria-label="Primary navigation">
      <UswdsSideNav items={links} />
    </nav>
  );
}
