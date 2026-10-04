### JRN-03.2: Pretrial Exhibit Intake and Case Setup

**Persona:** PER-03 (David Okafor)
**Scenario:** Ahead of an upcoming trial, David configures the new proceeding's exhibit numbering scheme and processes a batch of attorney-submitted exhibit lists through the restricted portal, catching missing metadata and duplicates before Maria ever encounters them in the courtroom (feeding directly into JRN-01.1's Pre-Session Setup stage).
**Related Jobs:** JTBD-03.1, JTBD-03.3, JTBD-03.5

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| New Case Setup | Creates/syncs the new proceeding from CM/ECF and configures the court's exhibit numbering scheme and security designations | Case and Proceeding Setup for Exhibits (F14) | "If I get the numbering scheme wrong here, every downstream deputy inherits the problem" | Careful, deliberate | Getting this wrong creates rework that ripples through the entire trial | CM/ECF sync pre-populates parties and case data so he's only configuring what's actually local |
| Attorney Submission Received | Both parties submit pretrial exhibit lists through the restricted attorney portal; David reviews the incoming batch | Pretrial Exhibit Intake (F15), Restricted External Attorney Portal (F12) | "Let's see how many of these need a correction request before I can accept them" | Businesslike, resigned to routine friction | Missing-metadata and duplicate-submission issues from attorneys are historically caught late | Required-metadata validation and duplicate detection run automatically at intake |
| Exception Triage | Flagged submissions land in David's exception queue; he accepts, rejects, or requests correction on each | Exception Queue (F7), Pretrial Exhibit Intake (F15) | "I'd rather send this back to counsel today than have Maria discover it's incomplete mid-trial" | Protective, efficient | These issues previously surfaced only when a deputy was already mid-trial | Aging indicators prioritize the oldest unresolved submissions so nothing slips past the pretrial window |
| Configuration Adjustment | Notices the same metadata gap recurring across several attorneys' submissions and adjusts the required-field configuration for this court's profile | Configuration Engine (F3) | "I can fix this myself right now instead of filing a ticket and waiting on a deployment" | Empowered, satisfied | Configuration changes historically required IT involvement and a deployment cycle | Self-service, versioned configuration changes with full audit trail, no code change required |
| Clean Handoff to Courtroom | Confirms the exhibit list is clean and accepted, ready for Maria's pre-session load the morning of trial | Exhibit Ledger (F16), Case Timeline View (F8) | "This is one less thing Maria has to discover the hard way at 9am" | Relieved, confident | None at this clean-state outcome | Clear hand-off status visible in Maria's pre-session checklist |

#### Key Moments
- **Decision Point:** Exception Triage — accept/reject/request-correction decisions here determine whether problems reach the courtroom at all.
- **Risk of Abandonment:** Attorney Submission Received — if validation misses too many real issues, David reverts to manually spot-checking every submission, losing the efficiency gain entirely.
- **Delight Opportunity:** Configuration Adjustment — fixing a recurring root cause himself, same day, without an IT ticket.

#### Success Outcome
Missing-required-metadata exceptions in pretrial intake drop to a low single-digit percentage of submissions (JTBD-03.1); new case/proceeding setups avoid downstream rework (JTBD-03.3); and configuration changes are made directly by David without filing an IT ticket (JTBD-03.5).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| New Case Setup | F14 |
| Attorney Submission Received | F15, F12 |
| Exception Triage | F7, F15 |
| Configuration Adjustment | F3 |
| Clean Handoff to Courtroom | F16, F8 |

---
