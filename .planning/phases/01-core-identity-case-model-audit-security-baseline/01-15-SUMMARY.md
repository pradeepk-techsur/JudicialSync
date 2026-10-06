---
phase: 01-core-identity-case-model-audit-security-baseline
plan: 15
subsystem: ui
tags: [react, uswds, tanstack-query, playwright, axe-core, audit-explorer, case-list, accessibility]

# Dependency graph
requires:
  - phase: 01-13
    provides: "AppShell, AuthProvider (useAuth/hasEntitlement), typed API client (api/ApiError), loginAs TOTP fixture, entitlement-driven SideNav, release-blocking axe gate"
  - phase: 01-09
    provides: "GET /api/v1/cases (CaseContextService.listCasesForPrincipal) — scope + designation pre-filtered case list"
  - phase: 01-12
    provides: "GET /audit/explorer, GET /audit/integrity/status, /alerts, POST /verify — the Audit Explorer read + integrity API"
provides:
  - "CaseListPage — entitlement-differentiated case table mounted at /cases"
  - "AuditExplorerPage + four Screen-17 sub-components mounted at /audit"
  - "ApiErrorAlert — shared display-safe FRD-Y2 error rendering"
  - "Populated-state axe gate across six real DOM states (release-blocking)"
  - "Playwright coverage: case-list (6 cases) + audit-explorer (8 cases)"
affects: ["Phase 4 (remounts the Audit Explorer at /admin/audit inside the Admin Dashboard; inherits the shell + screens)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Screens own their own entitlement/empty/denied state; the shell always renders children"
    - "Access-denied states derived from the server's error_code (AUDIT_READ_DENIED / AUDIT_DESIGNATION_DENIED), never a client-side entitlement guess"
    - "Responsive table → stacked cards via per-cell data-label at ≤640px (1.4.10)"
    - "Keyset Load-more pagination accumulating pages, reset on filter change; filters reflected in the URL query string"

key-files:
  created:
    - apps/web/src/pages/CaseListPage.tsx
    - apps/web/src/pages/CaseListPage.module.scss
    - apps/web/src/components/ApiErrorAlert.tsx
    - apps/web/src/pages/AuditExplorerPage.tsx
    - apps/web/src/pages/audit/AuditFilters.tsx
    - apps/web/src/pages/audit/AuditResultsTable.tsx
    - apps/web/src/pages/audit/AuditRowDetail.tsx
    - apps/web/src/pages/audit/ChainIntegrityBadge.tsx
    - apps/web/e2e/case-list.spec.ts
    - apps/web/e2e/audit-explorer.spec.ts
  modified:
    - apps/web/src/routes.tsx
    - apps/web/src/shell/AppShell.tsx
    - apps/web/src/styles/uswds.scss
    - apps/web/e2e/axe.spec.ts

key-decisions:
  - "The shell no longer swallows children for zero-entitlement users; each screen renders its own not-entitled state and the no-modules message moves to the index route"
  - "Access-denied states are derived from the server's error code, not a client-side hasEntitlement guess, so the UI reflects the PDP's actual decision"
  - "The count above the case table is derived from rendered rows, never a separate server total, so an omitted sealed case can never be counted (Y0 non-disclosure)"
  - "Rule-package and object-detail deep links are rendered disabled with phase-naming tooltips rather than as links that would 404 in Phase 1"
  - "E2E adapts honestly to DEF-03 (the shared dev DB chain is genuinely broken and the scheduled job repopulates alerts): tests assert the badge reflects real state rather than forcing a global verified flag"

patterns-established:
  - "ApiErrorAlert: the single display-safe rendering of a failed call — message + error_code only, never detail (T-01-66)"
  - "Audit Explorer read-only by construction: no write hook, no non-GET request anywhere in apps/web/src/pages/audit/ (grep-enforced)"

# Metrics
duration: 3h 20m
completed: 2026-10-06
---

# Phase 1 Plan 15: Phase-1 UI Surfaces (Case List + Audit Explorer) Summary

**The two screens Phase 1 actually ships — an entitlement-differentiated case list and the read-only Audit Explorer (Screen-17) — mounted in the generic USWDS shell with 14 new Playwright cases and a release-blocking axe gate over six populated DOM states.**

## Performance

- **Duration:** ~3h 20m
- **Started:** 2026-10-06T05:30:00Z (approx)
- **Completed:** 2026-10-06T08:50:00Z (approx)
- **Tasks:** 3
- **Files created:** 10 · **Files modified:** 4

## Accomplishments
- `CaseListPage`: renders `GET /api/v1/cases` with distinct loading, empty, not-entitled and error states; a row count derived from rendered rows (never a server total that could include an omitted case); a Designations Tag column over visible cases only; responsive stacked-card degradation at 375px with no body horizontal scroll.
- `AuditExplorerPage` + four Screen-17 sub-components: always-visible chain-integrity badge (polling `/status` every 30s; a broken chain becomes a non-dismissable critical alert in an `aria-live="assertive"` region with the break inspectable), a filter toolbar (case/user ComboBox, date range, object-type and action-type Selects) whose state is reflected in the URL, a read-only results table with expandable rows and keyset Load-more pagination, and a row-detail region with readable before/after pairs and phase-tooltip'd disabled deep links.
- Denied access attempts render as rows carrying a text-bearing "denied"/"granted" Tag (colour never the only signal), never omitted.
- No-entitlement and designation-denied states derived from the server's `AUDIT_READ_DENIED` / `AUDIT_DESIGNATION_DENIED` codes.
- 14 new Playwright cases (6 case-list + 8 audit-explorer) all green against the live Compose stack; the axe gate extended from the near-empty placeholders to six real populated DOM states, zero critical/serious violations, release-blocking.

## Task Commits

1. **Task 1: entitlement-differentiated case list** — `a35f577` (feat)
2. **Task 2: read-only Audit Explorer per Screen-17** — `391ab46` (feat)
3. **Task 3: Explorer E2E + populated axe gate** — `c8a07fe` (test)

## Files Created/Modified
- `apps/web/src/pages/CaseListPage.tsx` / `.module.scss` — case table + layout-only responsive SCSS
- `apps/web/src/components/ApiErrorAlert.tsx` — shared display-safe error alert
- `apps/web/src/pages/AuditExplorerPage.tsx` — Screen-17 composition, URL-reflected filters, server-driven denied states
- `apps/web/src/pages/audit/{ChainIntegrityBadge,AuditFilters,AuditResultsTable,AuditRowDetail}.tsx` — the four sub-components
- `apps/web/src/routes.tsx` — `/cases` and `/audit` wired to the real screens; no-modules message moved to the index route
- `apps/web/src/shell/AppShell.tsx` — always renders children (no longer swallows them for zero-entitlement users)
- `apps/web/src/styles/uswds.scss` — header stacking context (layout-only)
- `apps/web/e2e/{case-list,audit-explorer}.spec.ts`, `apps/web/e2e/axe.spec.ts` — coverage

## Decisions Made
See `key-decisions` in the frontmatter. The load-bearing one: access-denied states come from the server's error code, not a client guess — the UI reflects the PDP's actual decision, and a forged client entitlement changes only what is drawn.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AppShell swallowed screen children for zero-entitlement users**
- **Found during:** Task 1 (jury_admin case-list test)
- **Issue:** `AppShell` rendered its own "No modules granted yet" alert *in place of* children whenever the viewer had no visible nav items, so a direct URL visit to `/cases` by `jury_admin` (zero entitlements) never reached `CaseListPage` and could not show the screen's own not-entitled state — contradicting the plan's requirement that a direct URL visit "land somewhere coherent."
- **Fix:** `AppShell` now always renders children; the no-modules message moved to the index route (`HomeRedirect`), which is where a user with nowhere to go actually lands.
- **Files modified:** apps/web/src/shell/AppShell.tsx, apps/web/src/routes.tsx
- **Verification:** jury_admin case-list test passes; login-shell test 5 (no-modules alert) still passes.
- **Committed in:** a35f577 (Task 1 commit)

**2. [Rule 1 - Bug] Header Sign-out button overlapped by the full-width case table**
- **Found during:** Task 3 (full E2E suite — 01-13's login-shell logout test regressed)
- **Issue:** The USWDS `basic` header positions its Sign-out control with `position: absolute`, which overflowed the banner box and was overlapped by a `<td>` of the now-populated Case List table, intercepting the click. Invisible with the old placeholder; a real regression once the table shipped.
- **Fix:** gave `.usa-header` its own stacking context (`position: relative; z-index: 100`) in the global stylesheet — layout-only, no colour or focus-ring change.
- **Files modified:** apps/web/src/styles/uswds.scss
- **Verification:** login-shell logout test passes; full 32-case E2E suite green.
- **Committed in:** c8a07fe (Task 3 commit)

**3. [Rule 3 - Blocking] E2E fixture adjustments for the shared dev DB (DEF-01, DEF-03)**
- **Found during:** Tasks 1 and 3
- **Issue:** (DEF-01) the seeded `judge` is case-narrowed to the plain case and cannot reach the sealed case, so it could not demonstrate "sealed visible to the entitled viewer, strictly more rows." (DEF-03) the shared dev DB carries genuine audit-chain breaks and the scheduled integrity job re-inserts open alerts within seconds, so a globally-"verified" chain cannot be reliably forced.
- **Fix:** the case-list suite removes judge's `case` narrowing for the run (restoring it in afterAll, invalidating the Redis principal cache so the change is seen) so judge is court-wide and sees exactly the clerk's set plus the sealed case; the audit-explorer suite asserts the badge reflects the server's *real* state and controls the broken-chain state explicitly (insert one alert, assert, remove). No production code was changed and no narrowing semantics were weakened.
- **Files modified:** apps/web/e2e/case-list.spec.ts, apps/web/e2e/audit-explorer.spec.ts, apps/web/e2e/axe.spec.ts
- **Verification:** both suites green and re-runnable (second full audit-explorer run passed).
- **Committed in:** a35f577, c8a07fe

---

**Total deviations:** 3 auto-fixed (2 bug, 1 blocking)
**Impact on plan:** Both bug fixes were necessary for correctness (a screen that never renders; a button that cannot be clicked). The fixture adjustments are test-harness-only and, far from masking DEF-01/DEF-03, demonstrate the criteria honestly on a shared DB while leaving those deferred items exactly as recorded. No scope creep; no Phase 4 workspace was built.

## Issues Encountered
- A single transient failure of `cases-api.e2e-spec.ts` (an API suite that skips when the Compose stack is unreachable) appeared once due to a stack-reachability race; a clean re-run passed all 210 API Jest tests. Not related to this plan's frontend changes.

## Known Stubs
- None found. All "placeholder" grep hits are in comments explaining why a placeholder must NOT be added (Y0 non-disclosure). No TODO/FIXME/not-implemented. The disabled rule-package/object-detail links are intentional, phase-correct affordances (destinations arrive in Phases 2/4), not stubs.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 1's two UI surfaces are complete and clickable: the case list demonstrates criteria 1 and 4 (same screen, different data; sealed cases omitted entirely), and the Audit Explorer demonstrates criterion 3 (filterable history with actor/action/before-after/rule) and the UI half of criterion 4 (denied attempts as tagged rows), with a live integrity badge and a broken-chain critical state.
- This is the LAST plan of Phase 1 (15 of 15). Phase complete, ready for transition.
- Carry-forward for later phases: the Actor/Court/Division columns currently show UUIDs because `CaseResponse`/the explorer event carry ids, not display names; a later phase can resolve names via a directory lookup. DEF-01 (judge → sealed-case seed scope) and DEF-03 (shared-DB chain breaks) remain as previously recorded; this plan neither fixed nor worsened them.

---
*Phase: 01-core-identity-case-model-audit-security-baseline*
*Completed: 2026-10-06*

## Self-Check: PASSED

- All 11 created files present on disk (verified with `[ -f ]`).
- All three task commits present (`a35f577`, `391ab46`, `c8a07fe`).
- Plan-level build ran and passed: `npm run build -w apps/web` → exit 0.
- Full web E2E suite: 32 passed (14 new this plan); axe gate: 9 passed, zero critical/serious; audit-explorer re-runnable (second run passed). API assurance: 42 passed; API Jest: 210 passed.
- `## Known Stubs` present; no blocking stubs.
