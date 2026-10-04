## Epic 8: Case Timeline View (F8)

### US-8.1: View a Unified Chronological Case History
**As a** judge (Judge Robert Hale), **I want to** see docket events, hearings, exhibit actions, and Speedy Trial clock segments merged into one chronological timeline for a case, **so that** I see case history in context instead of switching between module-specific screens.

**Acceptance Criteria:**
- [ ] Timeline merges docket events, hearings, exhibit status changes, and confirmed Speedy Trial segments in true chronological order, with same-day entries ordered by creation sequence
- [ ] Timeline reflects only confirmed Speedy Trial state by default, with an explicit toggle for authorized reviewers to additionally show pending/candidate items
- [ ] Entries bearing a security designation the viewer lacks entitlement for are fully excluded, not shown as a redacted placeholder
- [ ] An unauthorized or non-existent case request returns `TIMELINE_CASE_NOT_FOUND` (404)

**Priority:** P0 | **Feature Ref:** F8

---

### US-8.2: Filter the Timeline and Deep-Link to Underlying Detail
**As a** clerk/case administrator (David Okafor), **I want to** filter the case timeline by event type, date range, or module and click through to the full detail record, **so that** I can quickly navigate to the specific exhibit or calculation record I need.

**Acceptance Criteria:**
- [ ] Filters support `event_type[]`, `date_from`, `date_to`, and `module[]` (evidentiary | speedy_trial | docket)
- [ ] An invalid date range (`from` > `to`) returns `TIMELINE_INVALID_RANGE` (400)
- [ ] Each timeline entry deep-links into its full underlying detail view (e.g., exhibit detail with the ruling highlighted)
- [ ] If an underlying module service is unavailable, the timeline returns partial content (`TIMELINE_PARTIAL_DATA`, 206) rather than a silent empty result

**Priority:** P0 | **Feature Ref:** F8

---
