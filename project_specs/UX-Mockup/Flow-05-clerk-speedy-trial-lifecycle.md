### Flow 5: Clerk Speedy Trial Lifecycle — Tracker Init → Event Mapping → Portfolio

**Trigger:** New defendant enters the clerk's caseload via CM/ECF arraignment event.
**User Stories:** US-26.1, US-26.2, US-26.3, US-27.1, US-27.2, US-6.1, US-36.2
**Journey:** JRN-03.1 (Tracker Opened → Trial or Disposition Closeout)

```
[CM/ECF arraignment event detected] (F10 → F27)
   │
   ▼
Tracker auto-proposed, `proposed` state, candidate start context pre-populated
   │
   ├── No matching trigger event found for a defendant with case activity
   │        ──▶ TRACKER_MISSING_TRIGGER exception ──▶ clerk creates tracker manually (fallback)
   │
   └── Chambers reviewer confirms start context (see Flow 3) ──▶ tracker = `confirmed`
   │
   ▼
[Docket event ingested] ──▶ auto-mapped to configured category
   │
   ├── Matches configured rule ──▶ event_category assigned automatically, no clerk action needed
   │
   └── No matching rule ──▶ EVENT_UNMAPPED ──▶ routed to Exception Queue with raw source code preserved
            │
            ▼
      Clerk classifies the individual event immediately (entitlement: exclusion_reviewer-equivalent)
            │
            └── Pattern recurs ──▶ clerk requests a new standing mapping rule
                     ──▶ routes through Configuration Engine maker-checker (F3)
   │
   ▼
[My Work Queue] (shared F6 component, clerk-scoped)
   │  cross-module tasks: exception resolution, exclusion review hand-offs, config approvals
   │
   ▼
[Portfolio Dashboards — Speedy Trial] (Screen-14)
   │  which of 40 cases needs attention today: approaching thresholds, data gaps, unreviewed exclusions
   │
   └── Drill-through ──▶ Case Conference View (Screen-08) for the specific tracker
```

**Steps:**
1. Automatic tracker proposal never reaches `confirmed` on its own — the clerk sees a **"Pending chambers confirmation"** tag until a judge/exclusion-reviewer acts (US-26.1, US-26.2).
2. A defendant with case activity but no detected trigger produces a visible exception rather than silence — the clerk's queue shows "Missing trigger event" as its own exception type, never an absent row (US-26.3).
3. The event mapping screen shows a running tally ("12 of 480 events unmapped this month") so the clerk can see the unmapped rate trending down over time, directly supporting the PRD success metric.
4. Portfolio Dashboard risk indicators (approaching-threshold, data-gap, unreviewed-exclusion, stale-calculation) are each their own filter chip — the clerk never has to open cases one-by-one to triage (US-36.1 analog for clerk-accessible scope; court-level view is US-36.2, admin-gated).

**States covered:** tracker-proposed, tracker-missing-trigger, tracker-confirmed, event-auto-mapped, event-unmapped-open, event-resolved, portfolio-clean, portfolio-risk-flagged.
