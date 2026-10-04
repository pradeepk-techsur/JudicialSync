## Responsive Considerations

JudicialSync is web-first for MVP (mobile native apps are explicitly out of scope per PROJECT.md). All workspaces nonetheless follow USWDS's responsive grid (`usa-grid`/`usa-layout-grid`) and breakpoints so courtroom tablets, chambers laptops, and administrative desktops all receive a correctly adapted — not merely shrunk — layout.

### Desktop (>1024px) — primary target for Chambers, Clerk Console, Admin Dashboard

- Side navigation persists expanded at all times (USWDS Side navigation, full width).
- Multi-column Card grids (e.g., Screen-08 Case Conference View's four-panel grid, Screen-04's Chambers Home) render at full 2–3 column width.
- Tables show all columns; no column hiding required.
- Explain This Date (Screen-06) renders the full visual segment timeline bar at full width with all Accordion detail visible without horizontal scroll.

### Tablet (768px–1024px) — primary target for Courtroom Deputy Interface

- The **Deputy Real-Time Logging screen (Screen-01) is designed tablet-first**, not desktop-first-then-shrunk: large touch targets (≥44×44px per USWDS/WCAG 2.5.5 guidance), the two-column exhibit-list/active-panel layout collapses to a single column with the Active Exhibit Panel becoming a bottom sheet that stays anchored and reachable with one thumb.
- Side navigation collapses to a hamburger/menu-button pattern (USWDS Header mobile menu) in all workspaces except the Deputy interface, which has no persistent side nav at all by design (low-chrome, full-screen logging surface takes priority per US-11.2).
- Custody Transfer (Screen-03) renders as a full-screen takeover rather than a modal at this breakpoint, so form fields remain large and unambiguous under courtroom time pressure.

### Mobile (<768px) — supported for read-mostly/notification-driven use only

- Judge/Chambers and Clerk Console workspaces remain functional at mobile width for **reviewing** notifications and work-queue items (e.g., Ana checking a threshold alert from a hallway), but data-entry-heavy screens (Configuration Engine, Case Setup) show a Site Alert recommending a larger viewport for editing — they are not blocked, only advised, since accessibility requires a functional (if dense) fallback.
- Cards stack to single column; Tables convert to a stacked card-per-row pattern (USWDS-recommended responsive table technique: each row becomes a labeled key/value card) rather than horizontal scroll, since horizontal scroll on data tables is a common accessibility and usability failure point.
- Attorney Portal (Screen-19/20) is explicitly designed to be fully usable at mobile width, since external attorneys are the most likely to access the portal from varied devices outside a court building.

### Cross-cutting responsive rules

- No information available at desktop width is ever silently dropped at smaller widths — it is reordered, stacked, or placed behind a documented "View more" disclosure, never removed.
- Breakpoint behavior for the Courtroom Deputy interface is treated as a release-gate test case (per US-11.2's "large touch targets" acceptance criterion), validated on the actual tablet hardware class used in pilot courtrooms, not just browser emulation.
- All breakpoints use USWDS's standard token set (`mobile`, `mobile-lg`, `tablet`, `desktop`, `widescreen`) rather than custom breakpoints, so the design system's built-in accessibility and spacing guarantees carry through unmodified.
