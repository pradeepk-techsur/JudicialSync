### Screen 19: Attorney Portal Home & Submission Form

**Purpose:** A scoped, restricted external entry point where an authorized attorney sees only cases where they hold an active party-of-record association, and can submit structured exhibit metadata that enters the standard intake review path — with zero direct write access to the official ledger.
**User Stories:** US-12.1, US-12.3
**Workspace:** Restricted External Attorney Portal

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ USWDS Banner (.gov) | Header: "JudicialSync — Attorney Portal"      │
│ 🔒 External, restricted access — separate from internal court users│
├──────────────────────────────────────────────────────────────────┤
│ My Associated Cases (party-of-record only)                         │
│ ┌─ Card: United States v. Alvarez ───────────────────────────┐     │
│ │ Role: Defense counsel        [ Submit Exhibit Metadata ]     │     │
│ │                               [ View Speedy Trial Summary ]  │     │
│ └──────────────────────────────────────────────────────────────┘     │
├──────────────────────────────────────────────────────────────────┤
│ SUBMISSION FORM (expands below, same structure as internal intake)  │
│  Description:        [________________________________]            │
│  Offering party:      ( ) Government  (•) Defense                   │
│  Exhibit type:        [ File reference                      ▾ ]     │
│  Attach file (optional): [ Choose file ]  (malware-scanned,          │
│                                             allowlisted types only)  │
│                                                                       │
│                                        [ Submit for Review ]          │
│  ℹ️ This submission enters standard clerk review before it becomes   │
│     part of the official record. You will be notified of the outcome│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Banner, Header, Card, Radio buttons, Select, File input (with allowlist/scan messaging), Button, Site Alert (info, persistent restricted-access notice).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Case list, pre-filtered to party-of-record associations only | Top, immediately visible |
| Primary | Submission form fields + "enters standard review" disclosure | Expanded form, always-visible info note |
| Secondary | "View Speedy Trial Summary" link | Card action, secondary to submission |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| No associated cases | Empty-state text | "No cases are currently associated with your account" |
| Submission missing required field | Inline field errors | Routes to exception queue on backend, not silent rejection (INTAKE_MISSING_METADATA) |
| File fails scan/allowlist | Inline error on file field | "File rejected: {reason}" — never silently accepted |
| Submitted | Form collapses, confirmation shown | "Submitted — pending clerk review" (status = `proposed`, `submitted_via = external_portal`) |
| No party-of-record for attempted case | Case/action simply not rendered | PORTAL_NOT_PARTY_OF_RECORD never reachable via UI since the list is pre-scoped |
| Attempt to self-accept own submission | No such control exists anywhere in this portal | Structural prevention (INTAKE_EXTERNAL_ACCEPT_DENIED) |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Submit Exhibit Metadata" | Button | Expands submission form inline |
| File input | USWDS File input | Enforces court-configured allowlist client-side (UX hint only; server re-validates + scans) |
| "Submit for Review" | Button, primary | Creates `proposed` submission, routes into standard F15 intake queue (Screen-12), identical downstream handling to internal submissions |
| "View Speedy Trial Summary" | Link | Navigates to Screen-20 |
