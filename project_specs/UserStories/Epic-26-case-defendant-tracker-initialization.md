## Epic 26: Case and Defendant Tracker Initialization (F26)

### US-26.1: Auto-Propose a Tracker from a Detected Trigger Event
**As a** clerk/case administrator (David Okafor), **I want to** have the system automatically propose a new defendant tracker when a configured trigger event (e.g., arraignment) is detected, **so that** I don't have to manually initiate tracking for every defendant.

**Acceptance Criteria:**
- [ ] A matching trigger-event category arriving via CM/ECF or manual entry proposes a tracker in `proposed` state with a candidate start context pre-populated
- [ ] Automatic detection alone never reaches `confirmed` state — only an explicit reviewer confirmation does
- [ ] Attempting tracker creation for a non-defendant party returns `TRACKER_NOT_DEFENDANT` (422)

**Priority:** P0 | **Feature Ref:** F26

---

### US-26.2: Confirm the Tracker's Applicable Start Context
**As a** judge (Judge Robert Hale, with Law Clerk Ana Ibarra), **I want to** explicitly confirm or reject the proposed trigger event and start date, **so that** the clock's starting point always reflects an authorized human decision, never an automatic inference.

**Acceptance Criteria:**
- [ ] A tracker cannot enter `confirmed` state without an explicit reviewer confirmation action
- [ ] The confirming reviewer must hold the `exclusion_reviewer`-equivalent entitlement configured for trackers
- [ ] Confirmation attempted by a user lacking this entitlement returns `TRACKER_CONFIRM_DENIED` (403)
- [ ] Rejection of a proposed start context requires a rationale, returning `TRACKER_REJECT_REASON_REQUIRED` (422) otherwise, and routes to a dispute/missing-trigger exception

**Priority:** P0 | **Feature Ref:** F26

---

### US-26.3: Flag a Defendant with Case Activity but No Detected Trigger Event
**As a** clerk/case administrator (David Okafor), **I want to** be alerted when a defendant has case activity but no corresponding trigger event in the docket feed, **so that** I never leave a tracker silently uninitialized or guess at a start date.

**Acceptance Criteria:**
- [ ] A defendant with case activity but no matching trigger event raises a `missing_trigger_event` exception (`TRACKER_MISSING_TRIGGER`) rather than leaving no tracker or guessing a start date
- [ ] Manual tracker creation remains available as a fallback, with the trigger event and date entered manually
- [ ] Tracker creation/confirmation is audit-logged, including which rule-package version's trigger-event mapping was in effect

**Priority:** P0 | **Feature Ref:** F26

---
