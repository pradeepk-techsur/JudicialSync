## F08: Case Timeline View

**Description:** A unified chronological view combining docket events, hearings, evidentiary actions, Speedy Trial clock periods, and key decisions for a given case, so judges, chambers, and clerks see case history in context rather than switching between module-specific screens.

**Terminology:**
- **Timeline Entry:** A single chronologically-placed item sourced from docket events, hearings, exhibit status changes, or Speedy Trial timeline segments.
- **Deep Link:** A navigational link from a timeline entry to the full underlying detail record (exhibit detail, calculation version detail).

**Sub-features:**
- Chronological merge of docket events, hearings, exhibit actions, and Speedy Trial clock segments
- Filterable by event type, date range, or module
- Deep links into underlying exhibit or Speedy Trial detail records

**Process:**
1. User opens the Case Timeline view for a case they are authorized to access.
2. Service queries the shared case-context (F01) for docket events and hearings, the Evidentiary module for exhibit status changes (F16/F17), and the Speedy Trial module for timeline segments and confirmed exclusions (F29).
3. Service merges all sourced entries into a single chronologically ordered list, each tagged with its originating module and entry type.
4. User applies optional filters (event type, date range, module) to narrow the view.
5. User selects an entry to deep-link into its full detail record (e.g., clicking an exhibit ruling entry opens the F16 exhibit detail with the ruling highlighted).
6. Entries bearing a security designation the user lacks entitlement for are excluded from the merged view entirely (not shown as a redacted placeholder), consistent with F05's access-scoped result handling.

**Inputs:**
- `case_id` (UUID, required)
- `filters` (optional): `event_type[]`, `date_from`, `date_to`, `module[]` (evidentiary | speedy_trial | docket)

**Outputs:**
- Merged, chronologically ordered timeline entry list, each with `{source_module, entry_type, timestamp, summary, deep_link}`

**Validation:**
- Timeline merge must preserve true chronological order across sources with differing timestamp precision (docket events may carry only a date, exhibit/clock events carry full timestamps) — same-day entries are secondarily ordered by entry creation sequence.
- Security-designation filtering is applied identically to the F05 search access-scoping rule: unauthorized entries are fully excluded, not redacted.
- Timeline view must reflect the currently confirmed state of Speedy Trial segments (not proposed/candidate exclusions) by default, with an explicit toggle to additionally show pending/candidate items for authorized reviewers (avoids presenting unconfirmed data as settled fact in a judge-facing view).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Case not found or not authorized | 404 | TIMELINE_CASE_NOT_FOUND | "Case not found or not accessible" |
| Invalid date range filter (from > to) | 400 | TIMELINE_INVALID_RANGE | "Date range is invalid" |
| Underlying module service unavailable (partial timeline) | 206 (partial content) | TIMELINE_PARTIAL_DATA | "Some timeline sources are temporarily unavailable" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Case Timeline for `/cases/{id}/timeline` endpoint.

**Schema Surface (this feature):** read-only aggregation view over `docket_events`, `hearings`, `exhibits` status history, `timeline_segments` (Speedy Trial) — no dedicated table; see `Y0a-schema-shared.md` §Case Timeline (view definition).
