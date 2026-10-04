### Screen 09: Sealing & Jury Package Authorization

**Purpose:** The single, deliberate judge-only control point for sealing/releasing an individual exhibit and for authorizing a jury review package — both actions requiring explicit judge credentials, never a clerk's self-authorization.
**User Stories:** US-21.1, US-21.2, US-22.1, US-22.2
**Workspace:** Judge/Chambers Workspace

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Tabs: [ Seal / Release ]   [ Jury Package Authorization ]          │
├──────────────────────────────────────────────────────────────────┤
│ SEAL / RELEASE TAB                                                  │
│  Exhibit 9 — Medical record excerpt                                 │
│  Current status: Not sealed                                        │
│                                                                       │
│  Authorizing judge: Robert Hale (resolved from session — not        │
│  editable)                                                           │
│                                                                       │
│  ( ) Seal this exhibit     ( ) Release (if currently sealed)        │
│  Release reason (required if releasing): __________________         │
│                                                                       │
│                                      [ Authorize ]                   │
│                                                                       │
│  ┌─ Sealed-Access Log (if sealed) ─────────────────────────────┐    │
│  │ Table: Timestamp | User | Result | Entitlement checked       │    │
│  │ 10:15 AM | M. Santos | Denied (no entitlement) | sealed_view  │    │
│  │ 10:20 AM | J. Hale    | Granted                | sealed_view  │    │
│  └─────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────┤
│ JURY PACKAGE AUTHORIZATION TAB                                      │
│  Proceeding: Trial Day 3 — admitted electronic exhibits only         │
│  ┌─ Eligible for package (auto-filtered) ───────────────────────┐  │
│  │ ✓ Exhibit 1 — Lease agreement (admitted, file_reference)      │  │
│  │ ✓ Exhibit 2 — Photo scene A (admitted, file_reference)        │  │
│  │ ✗ Exhibit 9 — SEALED, excluded unless individually authorized │  │
│  │    [ Authorize this instance only ]                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                [ Authorize Package v1 ]              │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Tabs (Side nav/In-page nav pattern used as tab set), Radio buttons, Text input, Table, Tag (status: sealed/not-sealed/denied/granted), Alert (for ineligible/sealed exclusions), Button.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Authorizing judge identity (non-editable, system-resolved) | Always visible, both tabs |
| Primary | Seal/Release action + Jury Package authorize action | Center, each tab |
| Secondary | Sealed-Access Log table | Below seal action, sealed exhibits only |
| Secondary | Eligible-for-package list with automatic exclusions | Main content, package tab |
| Tertiary | Per-instance override for a sealed item | Inline within the ineligible row |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Non-judge attempts action | Entire Authorize control disabled/absent | "Sealing requires judge authorization" (SEAL_AUTHORIZATION_DENIED) — control never renders enabled for a clerk |
| Sealed successfully | Status badge updates to "Sealed" (red Tag) | Confirmation + audit event shown inline |
| Release without reason | "Authorize" disabled | Inline validation: "Release reason is required" |
| Jury package: ineligible type attempted | Row shows disabled checkbox + Alert | "This exhibit type is not eligible for electronic jury review" (JURY_INELIGIBLE_EXHIBIT) |
| Jury package: sealed item, no per-instance auth | Excluded by default, greyed with override link | "Authorize this instance only" requires the same judge credentials re-confirmed |
| Package authorized | Tab shows "Package v1 — Authorized, session-scoped" | Package becomes immutable; a later ruling change does NOT silently update it (JURY_PACKAGE_IMMUTABLE on edit attempts) |
| Session expired (jury viewing) | N/A on this screen (surfaced in delivery context) | — |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Authorize" (seal/release) | Button, primary | Writes `authorizing_judge_id`, `release_reason` (if applicable); audit-logged distinctly |
| "Authorize this instance only" | Button, per-row | One-time per-package override for an otherwise-excluded sealed item |
| "Authorize Package v1" | Button, primary | Creates immutable package version; any future composition change requires a new version number, never an in-place edit |
| Sealed-Access Log rows | Read-only table | Every access attempt (granted or denied) shown as its own row — never aggregated |
