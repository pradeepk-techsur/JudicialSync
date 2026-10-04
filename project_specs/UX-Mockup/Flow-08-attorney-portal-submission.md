### Flow 8: Attorney Portal — Submission & Deadline Visibility

**Trigger:** An authorized external attorney needs to submit exhibit metadata or check a client's Speedy Trial status.
**User Stories:** US-12.1, US-12.2, US-12.3
**Journey:** Supports JRN-03.2 (Attorney Submission Received, from the clerk's receiving side)

```
[Attorney Portal Login] (external IdP, structurally distinct token issuer/audience)
   │
   ▼
[Attorney Portal Home] (Screen-19)
   │  shows only cases where attorney holds active, CM/ECF-sourced party-of-record association
   │
   ├── Submit Exhibit Metadata
   │        │
   │        ▼
   │  [Attorney Submission Form]
   │        │
   │        ├── No party-of-record association for case ──▶ PORTAL_NOT_PARTY_OF_RECORD (403)
   │        │
   │        └── Valid ──▶ submission enters `proposed`, submitted_via = 'external_portal'
   │                 ──▶ routes into standard F15 intake queue (Flow 4) — identical review path
   │                 ──▶ attorney CANNOT self-accept (INTAKE_EXTERNAL_ACCEPT_DENIED, 403 — no such control exists in this UI)
   │
   └── View Speedy Trial Summary
            │
            ▼
      [Attorney Speedy Trial Summary] (Screen-20) — read-only
            │
            ├── Case has a security designation ──▶ PORTAL_DESIGNATION_DENIED (403)
            │        unless individually authorized by the court
            │
            └── Authorized ──▶ remaining time, next threshold, confirmed trigger/exclusion periods ONLY
                     (no explainability detail, no override history, no write affordance anywhere)
```

**Steps:**
1. The portal's entire visible case list is pre-filtered to the attorney's party-of-record associations — there is no search box that could be used to probe for other cases' existence (consistent with F5 sealed-record non-disclosure principle).
2. The submission form is visually and structurally identical to the internal intake form clerks use, *minus* any status/review controls — reinforcing that external submissions receive identical validation, not a lesser or different path (US-12.1, US-12.3).
3. The Speedy Trial Summary screen has **zero interactive controls beyond read/export** — no edit icons, no status dropdowns — because the external token's audience claim cannot invoke any write endpoint even if a control were mistakenly rendered (US-12.2).
4. A security-designated case is never shown in degraded/greyed form — it is absent from the attorney's case list entirely, consistent with the platform-wide non-disclosure-of-existence principle.

**States covered:** portal-authenticated, case-list-scoped, submission-pending-review, submission-denied-not-party, summary-visible, summary-denied-designation.
