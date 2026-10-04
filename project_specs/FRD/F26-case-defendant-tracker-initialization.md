## F26: Case and Defendant Tracker Initialization

**Description:** Establishes a defendant-specific Speedy Trial tracking context from configured trigger events (automatic detection or manual clerk action), flagging missing trigger information for review. This is the Speedy Trial module's entry point — a tracker's existence and starting context is the foundation every later exclusion, calculation, and alert depends on.

**Terminology:**
- **Defendant Tracker:** The per-defendant Speedy Trial tracking context — one tracker per defendant per applicable charge context, not one per case (see F34 for multi-defendant handling).
- **Trigger Event:** A configured docket-event category (e.g., indictment, arraignment, initial appearance) whose occurrence starts or restarts a Speedy Trial clock per the applicable statute/plan.
- **Start Context:** The specific trigger event and date an authorized user confirms as the clock's applicable starting point.

**Sub-features:**
- Automatic tracker creation on configured trigger-event detection
- Manual tracker creation by clerk staff
- Missing-trigger-event detection and flagging
- Authorized-user confirmation of the applicable start context

**Process:**
1. When a docket event matching a court-configured trigger-event category (F03/F27) arrives for a defendant via CM/ECF (F10) or manual entry, the system automatically proposes creation of a new defendant tracker in `proposed` state, with a candidate start context (trigger event + date) pre-populated.
2. Alternatively, clerk staff manually open a tracker for a defendant when no automatic trigger was detected or when correcting a gap, entering the trigger event and date manually.
3. If the system detects a defendant with case activity but no corresponding trigger event found in the docket feed (e.g., an expected arraignment event never arrived), it flags a `missing_trigger_event` exception (F07) rather than silently leaving no tracker, or silently guessing a start date.
4. An authorized reviewer (clerk or chambers staff, per F03 workflow role configuration) reviews the proposed start context and explicitly confirms it — this confirmation is the human-approval gate; no tracker's start date becomes "confirmed" without it.
5. Confirmation creates the tracker's initial **calculation version** (see F29) using the confirmed start date as the basis for subsequent elapsed-time calculation.
6. Tracker creation/confirmation is audit-logged (F02), including which rule-package version's trigger-event mapping was in effect.

**Inputs:**
- `defendant_party_id` (required, must be a F01 party with role `defendant`)
- `case_id` (required)
- `trigger_event_id` (docket event reference, required for automatic path) or manually entered `trigger_event_type` + `trigger_date` (manual path)
- Confirmation input: `confirming_user_id` (system-resolved), `confirmed` (boolean) or `rejected` with `reason`

**Outputs:**
- Defendant tracker record in state `proposed` or `confirmed`
- Initial calculation version (post-confirmation) — see F29
- `missing_trigger_event` exception (F07) when applicable

**Validation:**
- A tracker cannot enter `confirmed` state without an explicit reviewer confirmation action — automatic trigger detection alone only reaches `proposed` state, never `confirmed`, regardless of how clear-cut the triggering event appears (human-in-command gate, non-negotiable per NFR).
- The confirming reviewer must hold a role with the `exclusion_reviewer`-equivalent entitlement per F03 workflow configuration for trackers (i.e., this is not necessarily the same as general clerk-edit rights — it is a specifically designated review authority).
- A defendant must have a resolvable party record with role `defendant` (F01) before a tracker may be created for them; attempting tracker creation for a non-defendant party is rejected.
- Rejection of a proposed start context requires a rationale and routes to a `missing_trigger_event` or `trigger_event_dispute` exception for further resolution, never a silent discard.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Tracker creation attempted for non-defendant party | 422 | TRACKER_NOT_DEFENDANT | "Tracker can only be created for a defendant party" |
| Confirmation attempted by user lacking review entitlement | 403 | TRACKER_CONFIRM_DENIED | "You are not authorized to confirm a tracker start context" |
| No trigger event found for case with defendant activity | n/a (exception, not request error) | TRACKER_MISSING_TRIGGER | "No trigger event was found for this defendant; manual review required" |
| Rejection submitted without reason | 422 | TRACKER_REJECT_REASON_REQUIRED | "A reason is required to reject the proposed start context" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Tracker Initialization for `/speedytrial/trackers`, `/speedytrial/trackers/{id}/confirm`, `/speedytrial/trackers/{id}/reject` endpoints.

**Schema Surface (this feature):** uses table `defendant_trackers` — see `Y0c-schema-speedytrial.md` §Tracker Initialization.
