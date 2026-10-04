## F11: Role-Specific UI Workspaces

**Description:** Purpose-built interfaces for each primary user type — judge/chambers, clerk operations, courtroom deputy, administrator — each optimized for that role's working pattern rather than a one-size-fits-all screen, all built on USWDS components for Section 508 accessibility and federal UX consistency.

**Terminology:**
- **Workspace:** A role-tailored composition of shared components (work queue, timeline, search, exception queue) arranged for a specific user's working pattern.
- **USWDS Component:** A U.S. Web Design System UI building block (buttons, forms, tables, banners) used for all surfaces per the binding design-system constraint.

**Sub-features:**
- Judge/chambers workspace (decision and oversight views)
- Clerk operations console (case and portfolio operations)
- Courtroom deputy interface (real-time, low-friction operational use)
- Administrative dashboard (adoption, configuration, metrics)
- All workspaces built on USWDS components

**Process:**
1. On login, the system determines the user's primary role (F00) and routes to the corresponding default workspace (configurable per user if they hold multiple roles).
2. **Judge/chambers workspace** composes: case timeline (F08), pending approval tasks (F06, scoped to ruling/exclusion/finding review), exhibit status oversight (F16 read + ruling action), Speedy Trial explain-this-date view (F29), case conference view (F35).
3. **Clerk operations console** composes: case/proceeding setup (F14), pretrial intake queue (F15), exception queue (F07), reconciliation checkpoint actions (F18), portfolio dashboards (F25/F36).
4. **Courtroom deputy interface** composes: real-time courtroom logging (F17) as the primary full-screen surface, with minimal chrome, large touch targets, and keyboard shortcuts; secondary access to custody transfer recording (F20) and session-end reconciliation (F18).
5. **Administrative dashboard** composes: configuration engine (F03), identity/role management (F00), operational reporting feed (F09), adapter health (F10).
6. Every workspace is implemented using USWDS component library and patterns; accessibility (Section 508) conformance is a release gate verified via automated and manual testing before any workspace ships.

**Inputs:**
- `user_role` (resolved from F00 session)
- `workspace_preference` (optional, for multi-role users to select a default landing workspace)

**Outputs:**
- Rendered role-specific workspace composed of shared components, each component independently access-scoped per F00/F05 rules

**Validation:**
- No workspace may expose an action the user's role/entitlement does not permit merely because the component is present (component visibility reflects entitlement, not just role label — e.g., a clerk viewing the judge workspace layout, if permitted read-only access, never sees an enabled "confirm ruling" control).
- All workspaces must pass automated Section 508 accessibility checks (axe-core or equivalent) and a manual screen-reader pass before release; this is a non-negotiable release gate, not a backlog item.
- Courtroom deputy interface interactions (offer/objection/ruling entry) must be completable via keyboard alone, without requiring mouse/touch, to support courtroom speed and accessibility simultaneously.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| User has no role mapped to any workspace | 403 | UI_NO_WORKSPACE_ASSIGNED | "No workspace is configured for your account; contact an administrator" |
| Workspace component fails to load (dependent service down) | 206 (partial) | UI_COMPONENT_UNAVAILABLE | "Part of this workspace is temporarily unavailable" |

**API Surface (this feature):** Workspaces are composition layers over the per-feature APIs already cataloged (F06, F07, F08, F14–F20, F29, F35); no dedicated workspace-only API beyond `/users/me/workspace-preference` in `Y1a-api-shared.md` §UI Workspaces.

**Schema Surface (this feature):** uses `users` table's `workspace_preference` column; no additional dedicated tables — see `Y0a-schema-shared.md` §Identity.
