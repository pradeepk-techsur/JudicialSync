### Flow 3: Speedy Trial Threshold Alert → Explain This Date → Exclusion Review

**Trigger:** A defendant's remaining includable time crosses a configured risk threshold.
**User Stories:** US-31.1, US-31.2, US-29.1, US-29.2, US-29.3, US-28.1, US-28.2, US-30.1, US-30.2, US-33.1, US-33.2, US-35.1, US-35.2, US-34.1
**Journey:** JRN-02.2 (Threshold Alert Received → Trial Setting / Disposition Confirmation)

```
[Notification: threshold crossed] (F4, F31)
   │  generic text only — no defendant/party name; secure deep link
   ▼
[Explain This Date] (Screen-06)
   │  every segment: event → rule reference → period → status → reviewer → reason
   │
   ├── Segment uses only CONFIRMED exclusions (never candidate) — guaranteed by construction
   │
   └── Open candidate exclusion found in the chain
            │
            ▼
      [Candidate Exclusion Review] (Screen-07)
            │
            ├── Accept as-is ──▶ confirmed record references original proposal + reviewer + timestamp
            │
            ├── Modify ──▶ mandatory rationale; original proposed value preserved alongside modified record
            │
            ├── Reject ──▶ mandatory rationale; item never feeds calculation
            │
            └── Continuance-linked exclusion missing findings/order ref
                     │
                     ▼
               [Continuance Findings Flag] (inline warning banner on review screen)
                     │
                     ├── Confirm blocked by default ──▶ CONTINUANCE_INCOMPLETE_BLOCKS_CONFIRM (409)
                     │
                     └── Law clerk supplies missing reference ──▶ flag clears automatically
                              ──▶ exclusion can now proceed through normal review
   │
   ▼
[Case Conference View] (Screen-08)
   │  clock state + pending motions + continuance history + open issues, one screen
   │  multi-defendant matters: explicit per-defendant panel, never collapsed
   │
   ▼
[Trial Setting / Disposition Confirmation]
   │  judge states the date, referencing the explained calculation directly
```

**Steps:**
1. Alert content is generic ("A Speedy Trial threshold has been reached for a case on your docket") with a secure deep link requiring re-authentication — never defendant-identifying detail in the body/preview (US-4.1).
2. **Explain This Date** is the trust-anchor screen: every timeline segment shows its contributing event, rule reference, period, review status, reviewing user, and reason — with a persistent, non-dismissable "decision support, not a legal determination" label (US-29.1).
3. Any segment traceable to an **unreviewed candidate** surfaces a direct "Review" link into the Candidate Exclusion Review screen — the judge never has to hunt for what's pending.
4. Accept/Modify/Reject are three structurally distinct actions, not one dropdown with a free-text box — Modify and Reject both force a rationale field to appear and block submission until populated (US-30.1).
5. **Continuance Findings Check** never evaluates legal sufficiency — it only checks field presence and shows a flag-only warning banner; resolution is a simple "attach reference" action, not a legal judgment screen (US-33.1).
6. Case Conference View assembles confirmed state only by default, with pending/candidate items clearly separated under an "Open Items" heading — never merged into "current state" (US-35.1).
7. Multi-defendant matters always render a **co-defendant panel** — the system structurally cannot present one collapsed case-level status (US-34.1).

**States covered:** alert-unacknowledged, alert-acknowledged, explain-clean, explain-with-pending-segment, exclusion-review-pending, exclusion-accepted, exclusion-modified, exclusion-rejected, continuance-incomplete-blocked, continuance-resolved, conference-packet-partial.
