### Screen 11: Case & Proceeding Setup for Exhibits

**Purpose:** Lets David create/sync a case's proceeding, bind parties, select a numbering scheme, and apply security designations before exhibit tracking activates — getting this right once prevents rework rippling through the entire trial.
**User Stories:** US-14.1, US-14.2, US-1.1, US-1.2
**Workspace:** Clerk/Case Administrator Console

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Case Setup — United States v. Alvarez               [Step 2 of 3] │
├──────────────────────────────────────────────────────────────────┤
│ Step Indicator: ●Case/Proceeding → ●Numbering & Parties → ○Activate│
├──────────────────────────────────────────────────────────────────┤
│  Court/Division: EDNY / Brooklyn  (synced from CM/ECF, immutable)   │
│  Case number: 1:26-cr-00042  (from CM/ECF)                          │
│                                                                      │
│  Numbering scheme:  [ USDC-EDNY-2026 (active, published)        ▾]  │
│  ⚠ Once any exhibit is assigned, this selection locks              │
│    (EXHIBIT_SETUP_SCHEME_LOCKED)                                    │
│                                                                      │
│  Parties bound to proceeding:                                       │
│  ☑ Government (prosecution)     ☑ Defense                           │
│  ☐ Additional party...                                              │
│                                                                      │
│  Security designations (if applicable):                             │
│  ☐ Sealed  ☐ Restricted  ☐ Grand jury  ☐ Juvenile  ☐ PII            │
│  (requires case_security_admin — view-only if not entitled)         │
│                                                                      │
│                       [ Back ]        [ Activate Exhibit Tracking ] │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Step Indicator, Select (numbering scheme), Checkbox (parties, designations), Alert (lock warning), Button group.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Numbering scheme selection + lock warning | Upper-center |
| Primary | "Activate Exhibit Tracking" action | Bottom, disabled until prerequisites met |
| Secondary | Party binding checkboxes | Middle |
| Tertiary | Security designation checkboxes (view-only for most users) | Lower section |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| No proceeding exists | "Activate" disabled, Alert shown | "A proceeding must exist before exhibit tracking can be activated" (EXHIBIT_SETUP_NO_PROCEEDING) |
| Scheme not yet locked | Select enabled, editable | — |
| Scheme locked (exhibits assigned) | Select disabled, padlock icon + tooltip | "Numbering scheme is locked — exhibits have already been assigned" (EXHIBIT_SETUP_SCHEME_LOCKED) |
| Invalid/unpublished scheme selected | Inline error | "This scheme is not active/published" (EXHIBIT_SETUP_INVALID_SCHEME) |
| Designation checkbox, no entitlement | Checkboxes rendered disabled/view-only | Tooltip: "Changing security designations requires case_security_admin" |
| Non-admin attempts activation | Action denied | "You do not have exhibit setup access" (EXHIBIT_SETUP_DENIED) |
| Already active (idempotent re-run) | Banner | "Exhibit tracking is already active for this case — no changes made" |
| Activated | Step indicator completes, redirect | Toast: "Exhibit tracking active — intake and ledger unlocked" |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Numbering scheme Select | USWDS Select, disables post-assignment | Pulls only active/published schemes from Configuration Engine |
| Party checkboxes | Checkbox | At least prosecution + defense (or equivalent) required before activation |
| Designation checkboxes | Checkbox, conditionally editable | Edits produce an audit event with before/after state |
| "Activate Exhibit Tracking" | Button, primary | Idempotent — re-running never resets/duplicates existing exhibit records |
