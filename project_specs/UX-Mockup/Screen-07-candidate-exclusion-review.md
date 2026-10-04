### Screen 07: Candidate Exclusion Review

**Purpose:** Lets Judge Hale explicitly accept, modify, or reject each candidate exclusion period — the sole point where a period becomes legally excludable. The system never decides this; it only proposes well-formed candidates for review.
**User Stories:** US-28.1, US-28.2, US-30.1, US-30.2, US-33.1, US-33.2
**Workspace:** Judge/Chambers Workspace

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Candidate Exclusion Review — U.S. v. Reyes            [Tag: P0]   │
├──────────────────────────────────────────────────────────────────┤
│  Triggering event: Defense continuance motion, Doc #44             │
│  Category: Continuance (18 U.S.C. §3161(h)(7))                     │
│  Rule package version: v4.2 (effective 2026-06-01)                 │
│  Proposed period: Feb 3, 2026 – Mar 10, 2026 (open-ended: no)       │
│                                                                      │
│  ⚠ Alert (warning): "Continuance findings incomplete — missing      │
│     structured findings reference. Confirming this exclusion is    │
│     blocked until resolved." (CONTINUANCE_INCOMPLETE_BLOCKS_CONFIRM)│
│     [ Supply Findings Reference → ]                                │
│                                                                      │
│  Decision:                                                          │
│  ( ) Accept as proposed                                             │
│  ( ) Modify         → end date: [ Mar 18, 2026 ▾ ]                  │
│  ( ) Reject                                                         │
│                                                                      │
│  Rationale (required for Modify/Reject):                            │
│  [________________________________________________]                 │
│                                                                      │
│                              [ Cancel ]   [ Submit Decision ]        │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Tag (priority badge), Alert (warning, blocking), Radio buttons (decision), Date picker (modify end date), Textarea (rationale), Button group.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Blocking continuance-findings warning (if present) | Top, impossible to miss, blocks Accept path |
| Primary | Accept / Modify / Reject decision control | Center |
| Secondary | Triggering event + rule version + proposed period detail | Upper section, read-only context |
| Tertiary | Rationale field | Appears only when Modify/Reject selected |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Clean candidate, no findings issue | No warning Alert | Accept/Modify/Reject all available |
| Continuance findings incomplete | Blocking warning Alert, "Accept"/"Submit" disabled for confirm path | Court-configurable: some courts may allow override — tooltip explains |
| Modify selected | Date picker + rationale Textarea appear | "Submit Decision" disabled until rationale ≥ minimum length |
| Reject selected | Rationale Textarea appears, no date picker | Same validation pattern |
| Self-review blocked | Entire form replaced with Alert | "You cannot review a proposal you entered yourself" (REVIEW_SELF_REVIEW_DENIED) where court-configured |
| Submitted — Accept | Confirmation toast | "Exclusion confirmed — now feeds calculation" + audit event reference shown |
| Submitted — Modify | Confirmation toast + comparison view | Shows original proposed value alongside modified confirmed value, side by side |
| Submitted — Reject | Confirmation toast | "Exclusion rejected — excluded from any future calculation" |
| Already reviewed (race condition) | Read-only banner | "This candidate has already been reviewed — further changes require an override" (EXCLUSION_ALREADY_REVIEWED) |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Decision radio group | Radio buttons | Determines which secondary fields render |
| "Supply Findings Reference →" | Button/Link | Opens inline mini-form to attach findings/order reference (US-33.2); clears the blocking flag automatically once both references present |
| Rationale Textarea | Required conditional on Modify/Reject | Character-count helper; submit disabled until valid |
| "Submit Decision" | Button, primary | Creates a new `confirmed` record referencing original proposal, reviewer identity, timestamp; logged as distinct audit event; associated task marked complete with audit reference |
