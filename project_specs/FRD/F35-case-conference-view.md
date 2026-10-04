## F35: Case Conference View

**Description:** A concise, chambers-oriented chronology showing upcoming hearings, current clock state, pending motions, continuance history, and open issues to support conference and hearing preparation. This feature packages information already modeled elsewhere (F08 timeline, F29 calculation, F28 candidates, F33 continuance checks) into a single, review-optimized screen for the specific moment chambers needs it most: before a conference, continuance decision, pretrial conference, or trial setting.

**Terminology:**
- **Review Packet:** A pre-conference export summarizing the case conference view's content for offline/printed review.
- **Open Issue:** Any item requiring chambers attention before the upcoming proceeding (unresolved candidate exclusion, incomplete continuance findings, unacknowledged threshold alert).

**Sub-features:**
- Single-screen summary: clock state, pending motions, continuance history, open issues
- Pre-conference review-packet generation (status conferences, continuance decisions, pretrial conferences, trial settings)
- Deep links into underlying event/exclusion detail

**Process:**
1. Chambers staff or judge opens the case conference view for a defendant tracker ahead of a scheduled proceeding.
2. System assembles: current calculation version summary (F29, remaining time, status indicator), all `candidate` (unreviewed) exclusions pending decision (F28), continuance history (confirmed exclusions of continuance category, F30, with F33 completeness flags), and any open issues (unresolved exceptions F07, unacknowledged alerts F31 relevant to this tracker).
3. Each summarized item deep-links to its full detail view (e.g., clicking a pending candidate exclusion opens the F30 review screen).
4. On request, system generates a review packet (printable/exportable) containing the same content, timestamped at generation, for use at status conferences, continuance decisions, pretrial conferences, or trial settings per the vision document's named use occasions.
5. The view defaults to the single defendant in context but, for multi-defendant matters (F34), surfaces an explicit co-defendant summary panel rather than merging statuses.

**Inputs:**
- `tracker_id` (required)
- `proceeding_context` (optional, e.g., which upcoming hearing this conference view supports)

**Outputs:**
- Composed case conference view (read-only aggregate)
- Review packet export artifact

**Validation:**
- The view must only ever reflect confirmed data as the "current state" (current calculation version, confirmed exclusions) while clearly distinguishing pending/candidate items as not-yet-decided — consistent with F08's rule against presenting unconfirmed data as settled.
- Review packet generation is itself a lightweight, non-legally-significant export (unlike F19/F24 certified exports) and does not require certification, but the packet is timestamped and, if later referenced in a hearing, its generation event may be logged for traceability (`[ASSUMPTION]`: review packet generation is logged as an operational event, not necessarily a full F02 material-action audit entry, since it does not itself change any record — subject to pilot validation on whether courts want this treated more formally).
- Access to the case conference view requires at minimum the same entitlement as viewing the underlying tracker/calculation (F29), with no looser access path.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Tracker not found or not authorized | 404 | CONFERENCE_TRACKER_NOT_FOUND | "Tracker not found or not accessible" |
| Review packet generation fails (underlying data partially unavailable) | 206 (partial) | CONFERENCE_PACKET_PARTIAL | "Some conference view data was unavailable; packet is incomplete" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Case Conference View for `/speedytrial/trackers/{id}/conference-view`, `/speedytrial/trackers/{id}/conference-view/export` endpoints.

**Schema Surface (this feature):** read-only aggregation over `calculation_versions`, `candidate_exclusions`, `confirmed_exclusions`, `continuance_records`, `exceptions`, `threshold_alerts` — no dedicated writable table; see `Y0c-schema-speedytrial.md` §Case Conference View.
