## User Flows

### Flow 0: Courtroom Real-Time Logging & Session Close

**Trigger:** Deputy arrives before the judge takes the bench and opens today's proceeding.
**User Stories:** US-11.2, US-17.1, US-17.2, US-17.3, US-16.3, US-18.1, US-18.2, US-18.3
**Journey:** JRN-01.1 (Pre-Session Setup → Trial Closeout)

```
[Deputy Pre-Session Checklist]
   │  (confirms proceeding, parties, exhibit list, open exceptions)
   ▼
[Open Courtroom Session] ──▶ [Deputy Real-Time Logging — full screen]
   │
   ├── Exhibit Offered ──▶ tap/keystroke "Offer" ──▶ status = offered (≤1 action)
   │
   ├── Objection Raised ──▶ select category (short list) ──▶ status = objected (≤2 actions)
   │
   ├── Judge Rules (verbal, from bench) ──▶ deputy records "ruling occurred: admit/reject"
   │        │
   │        ├── Proceeding has assigned judge ──▶ F16 transition attributed to presiding judge,
   │        │        visible instantly on Chambers Live Status (no refresh)
   │        │
   │        └── No judge assigned on proceeding ──▶ COURTROOM_NO_JUDGE_ASSIGNED (422)
   │                 ──▶ blocked, routed to Exception Queue
   │
   ├── Connectivity Disruption (any point) ──▶ entries persist to local draft buffer
   │        │
   │        └── Reconnect ──▶ auto-resync
   │                 ├── Clean ──▶ ledger updated, no user action needed
   │                 └── Conflict with concurrent update ──▶ COURTROOM_RESYNC_CONFLICT (409)
   │                          ──▶ routed to Exception Queue, both versions preserved
   │
   └── Recess / Day-End / Trial-Close ──▶ [Close Session] button
            │
            ▼
      [Deputy Session Close & Reconciliation]
            │
            ├── No discrepancies ──▶ session closes, F19 export available
            │
            ├── Discrepancies found (F18) ──▶ discrepancy list with conflicting values
            │        │
            │        ├── Resolved with rationale (≥required) ──▶ ledger updated as new version
            │        │
            │        └── Left open, high-severity ──▶ RECONCILE_UNRESOLVED_HIGH_SEVERITY (409)
            │                 ──▶ blocks close UNLESS supervisory override
            │                          ──▶ override requires its own separately logged rationale
            │
            └── Session closed ──▶ [Exportable Exhibit List] (F19) ready for certification
```

**Steps:**
1. **Pre-session checklist** (Screen-00) surfaces today's proceeding, confirms exhibit list loaded from accepted intake, and flags any open F7 exceptions tied to the proceeding before the judge takes the bench.
2. **Open session** transitions the deputy into the full-screen Real-Time Logging surface (Screen-01) — the single primary surface for the entire session.
3. Each offer/objection/ruling/withdrawal/substitution is logged in a bounded number of interactions; ruling attribution is always system-resolved to the proceeding's assigned judge, never deputy-selected (US-16.3).
4. A **connectivity disruption** at any point triggers local draft buffering; on reconnect, entries resync automatically; true conflicts route to the Exception Queue rather than silently discarding either version (US-17.2).
5. **Session close** is only reachable via the mandatory F18 reconciliation checkpoint (Screen-02) — the deputy cannot skip reconciliation without a logged supervisory override.
6. A clean close unlocks the one-click F19 export, explicitly labeled as an interim (non-final) record pending full closeout (F24).

**States covered:** default (list loaded), active-logging, offline/draft-buffer, resync-conflict, reconciliation-open, reconciliation-blocked, session-closed.
