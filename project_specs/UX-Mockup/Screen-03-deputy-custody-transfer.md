### Screen 03: Deputy Custody Transfer

**Purpose:** Lets the deputy initiate a custody transfer (recipient, purpose, location, condition) inline, without leaving the courtroom logging context, replacing the paper sign-out sheet.
**User Stories:** US-20.1, US-20.2, US-20.3, US-23.2
**Workspace:** Courtroom Deputy Interface

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Modal / Side panel: "Transfer Custody — Exhibit 7 (Firearm)"  [X] │
├──────────────────────────────────────────────────────────────────┤
│  Exhibit type: Contraband  [Tag: special handling]                │
│                                                                     │
│  Recipient (Combo Box, searches registered custodians):            │
│  [ Evidence Custodian — J. Reyes                           ▾ ]     │
│                                                                     │
│  Purpose:        ( ) Overnight storage  ( ) Lab transfer  ( ) Other│
│  Location:       [ Evidence Room B-14                       ]      │
│  Condition note: [ Intact, bagged, tagged                   ]      │
│                                                                     │
│  ⚠ Contraband authorization reference (required for this type):    │
│  [ CA-2026-0417                                              ]      │
│                                                                     │
│  Transferor acknowledgment: initiating this transfer constitutes    │
│  your release acknowledgment (M. Santos, 10:58 AM)                  │
│                                                                     │
│                        [ Cancel ]   [ Initiate Transfer ]           │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Modal, Tag, Combo Box, Radio buttons, Text input, Alert (warning, inline for type-specific requirement), Button group.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Recipient selection + type-specific required field | Upper half, cannot submit without both |
| Secondary | Purpose, location, condition note | Middle |
| Tertiary | Transferor acknowledgment statement (informational, not an input) | Bottom, above actions |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Default | Form empty, submit disabled | — |
| Unknown recipient entered | Combo Box shows "No match found" | "Recipient must be a registered custodian" (CUSTODY_UNKNOWN_CUSTODIAN) |
| Type-specific field missing | Red outline + inline error on auth-reference field | "Contraband transfers require an authorization reference" (CUSTODY_MISSING_TYPE_FIELD) |
| Valid, ready | "Initiate Transfer" enabled | — |
| Submitted | Modal closes, exhibit row shows "Pending — awaiting J. Reyes" Tag | Toast: "Transfer initiated — recipient notified" |
| SLA approaching | Tag turns amber with countdown | "Acknowledgment due in 2h" |
| SLA breached | Tag turns red: "Escalated" | Notification sent to supervisory role automatically |
| Acknowledged | Tag turns green: "Completed — confirmed by J. Reyes, 11:40 AM" | Custody history entry added, visible in exhibit detail |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Recipient Combo Box | USWDS Combo Box | Autocomplete against registered custodian directory only — no free text accepted |
| Purpose radio group | Radio buttons | Determines which type-specific fields render below |
| Contraband auth reference | Text input, conditionally required | Rendered only for contraband/special-storage types (US-23.2) |
| "Initiate Transfer" | Button, primary | Disabled until all required fields valid; submission = transferor's acknowledgment of release |
| "Cancel" | Button, secondary | Closes modal, no record created |
