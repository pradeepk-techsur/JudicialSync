### Flow 4: Pretrial Exhibit Intake & Exception Triage

**Trigger:** Clerk sets up a new proceeding ahead of trial and processes attorney-submitted exhibit lists (internal and external-portal submissions alike).
**User Stories:** US-14.1, US-14.2, US-15.1, US-15.2, US-15.3, US-12.1, US-12.3, US-7.1, US-7.2
**Journey:** JRN-03.2 (New Case Setup → Clean Handoff to Courtroom)

```
[Case & Proceeding Setup] (Screen-11)
   │  numbering scheme (must be active/published), security designations, parties bound
   │
   ├── No proceeding exists yet ──▶ EXHIBIT_SETUP_NO_PROCEEDING (422) — blocked
   │
   └── Setup complete ──▶ exhibit-tracking "active"; F15 intake + F16 ledger unlocked
   │
   ▼
[Pretrial Intake Queue] (Screen-12)
   │  submissions from internal staff AND external attorney portal (submitted_via tag visible)
   │
   ├── Missing required field ──▶ INTAKE_MISSING_METADATA (422) ──▶ routed to Exception Queue
   │
   ├── File fails malware scan / disallowed type ──▶ INTAKE_FILE_REJECTED / INTAKE_UNSUPPORTED_FORMAT (422)
   │
   ├── Exact file-hash duplicate ──▶ INTAKE_DUPLICATE (409) ──▶ both/all versions preserved for review
   │
   └── Clean submission ──▶ clerk Accept / Reject / Request Correction
            │
            ├── Accept ──▶ promoted to F16 ledger entry in `proposed` status
            │
            ├── Reject / Request Correction ──▶ reason relayed to submitter (never a bare rejection)
            │
            └── External submitter attempts self-accept ──▶ INTAKE_EXTERNAL_ACCEPT_DENIED (403) — structurally blocked
   │
   ▼
[Exception Queue — Clerk view] (Screen-13)
   │  filterable by module/type/severity/age; aging indicator visible
   │
   ├── Resolve with rationale (≥10 chars) ──▶ EXCEPTION_RATIONALE_REQUIRED/TOO_SHORT (422) if insufficient
   │
   └── Recurring pattern noticed ──▶ deep link to [Configuration Engine] to fix root cause
   │
   ▼
[Clean Handoff] ──▶ ledger status visible in Deputy Pre-Session Checklist (Screen-00)
```

**Steps:**
1. Numbering scheme selection is locked once any exhibit is assigned (`EXHIBIT_SETUP_SCHEME_LOCKED`) — the setup screen makes this consequence visible via a warning Alert before the first exhibit is accepted.
2. The Intake Queue shows **internal and external-portal submissions side by side**, distinguished only by a `submitted_via` Tag — never a separate queue, so nothing requires a second review surface (US-12.3).
3. Duplicate detection surfaces both conflicting submissions in one comparison view rather than silently picking one (US-15.2).
4. Accept/Reject/Request-Correction are three explicit buttons; rejection or correction always opens a required-reason Textarea before submission completes (US-15.3).
5. Exception resolution is structurally identical to F18 reconciliation resolution (same required-rationale pattern) so clerks learn one interaction, not several.
6. A clerk noticing a **recurring** exception pattern can jump directly to the Configuration Engine from the exception detail panel — closing the loop from symptom to root cause same-day, no IT ticket (US-3.3, JRN-03.2 delight moment).

**States covered:** setup-incomplete, setup-locked-scheme, intake-pending-review, intake-duplicate-flagged, intake-accepted, intake-rejected, exception-open, exception-aging-warning, exception-resolved.
