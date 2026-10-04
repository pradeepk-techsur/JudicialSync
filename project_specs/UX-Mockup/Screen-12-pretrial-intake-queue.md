### Screen 12: Pretrial Intake Queue

**Purpose:** Receives structured exhibit list submissions (internal staff and external-portal attorneys alike), validates metadata, flags duplicates, and lets David accept/reject/request-correction before anything reaches the courtroom.
**User Stories:** US-15.1, US-15.2, US-15.3, US-12.3
**Workspace:** Clerk/Case Administrator Console

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Pretrial Intake Queue — United States v. Alvarez                  │
│ Filters: [Status ▾] [Source: Internal/External ▾] [Date ▾]        │
├──────────────────────────────────────────────────────────────────┤
│ Table (USWDS Table, sortable)                                      │
│ # | Description      | Party | Source            | Status | Age   │
│ — | Signed lease      | Govt  | Internal           | Pending| 2h    │
│ — | Photo — scene B   | Def.  | 🌐 External portal  | Pending| 5h    │
│ — | Witness list v2   | Govt  | Internal           | ⚠ Dup. | 1d    │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Expanded row: "Witness list v2" ─────────────────────────────┐  │
│ │ ⚠ Flagged duplicate — file hash matches existing submission    │  │
│ │ Conflicting submissions preserved side by side:                │  │
│ │  (A) Witness list v2 — submitted 10:02 AM, Govt                │  │
│ │  (B) Witness list — submitted yesterday 4:15 PM, Govt          │  │
│ │                                                                   │  │
│ │ [ Accept A ]  [ Accept B ]  [ Reject Both ]  [ Request Correction]│  │
│ │ Reason/detail (required for reject/correction):                 │  │
│ │ [_______________________________________________]               │  │
│ └───────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Table (sortable, expandable rows), Tag (status + source badges), Select (filters), Alert (duplicate flag, inline), Textarea (reason), Button group.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Status + Source Tag per row (Pending/Duplicate/Accepted/Rejected; Internal/External) | First visible columns |
| Primary | Accept/Reject/Request-Correction actions | Expanded row, prominent buttons |
| Secondary | Age column, sortable | Table, supports oldest-first prioritization |
| Tertiary | Filter controls | Top toolbar |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Missing required metadata | Row Tag: "Incomplete" (amber) | "Missing: offering_party_id" detail shown on expand (INTAKE_MISSING_METADATA) |
| File fails malware scan | Row Tag: "Rejected — file" | "File rejected: {reason}" (INTAKE_FILE_REJECTED), never silent acceptance |
| Unsupported format | Row Tag: "Unsupported format" | INTAKE_UNSUPPORTED_FORMAT shown inline |
| Exact duplicate (file hash) | Row Tag: "Duplicate" (red), expandable | Both conflicting submissions preserved, side-by-side comparison forced |
| External submission | 🌐 globe icon + "External portal" Tag | Visually distinguished but identical review controls to internal |
| External submitter attempts self-accept | N/A — no such control ever renders for external principals | Structural prevention, not a runtime error shown to clerk |
| Accepted | Row Tag: "Accepted → Ledger" (green) | Promoted to F16 ledger entry in `proposed` status; submitter notified |
| Rejected/Correction requested | Row Tag updates; reason stored | Submitter notified with the reason/detail — never a bare rejection |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Filter Selects | USWDS Select | Status, Source (internal/external), date range |
| Row expand | Click/Enter | Reveals full detail + action buttons |
| "Accept A" / "Accept B" | Button | Only one path possible — accepting one auto-marks the conflicting alternative as superseded, both remain in history |
| "Reject Both" / "Request Correction" | Button | Opens required reason Textarea before submission enabled |
| Row action buttons | Entitlement-gated | Only rendered enabled for `clerk_case_admin`/`courtroom_deputy`; otherwise INTAKE_REVIEW_DENIED path never reachable from UI |
