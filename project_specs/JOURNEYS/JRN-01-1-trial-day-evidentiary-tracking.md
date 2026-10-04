## PER-01: Maria Santos

### JRN-01.1: Trial Day: Evidentiary Tracking

**Persona:** PER-01 (Maria Santos)
**Scenario:** Maria is the courtroom deputy for a multi-day federal evidentiary hearing. From the moment she sets up her station before the judge takes the bench through the moment she hands off a certified closeout package, she is the single point of real-time accuracy for every exhibit action — while Judge Hale rules live from the bench, chambers watches the shared status, and the jury ultimately reviews only what was properly admitted.
**Related Jobs:** JTBD-01.1, JTBD-01.2, JTBD-01.3, JTBD-01.4

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| Pre-Session Setup | Opens the courtroom deputy workspace and confirms today's proceeding, parties, and exhibit numbering are loaded before the judge takes the bench | Case & Proceeding Setup (F14), Exhibit Ledger (F16) | "Is the exhibit list from last night's submission actually loaded, or am I scrambling at 9am?" | Anxious, focused | Inherits an incomplete list if an overnight intake exception wasn't resolved before court opens | Surface any open pretrial intake exceptions tied to today's proceeding directly in her pre-session checklist |
| Exhibit Offered | Attorney offers an exhibit; Maria taps it from the pre-loaded list and marks it "offered" in two taps | Real-Time Courtroom Logging (F17), Exhibit Ledger (F16) | "I need this logged before counsel finishes their sentence or I'll fall behind" | Focused, mild time pressure | Scrolling or typing a full exhibit number by hand breaks her rhythm and risks a logging gap | Large touch-target quick-offer buttons keyed to the pre-loaded list, with full keyboard shortcuts as fallback |
| Objection & Ruling Logged | Logs opposing counsel's objection, then logs the judge's verbal ruling the instant it's spoken, explicitly attributed to the judge | Real-Time Courtroom Logging (F17), Role-Specific UI Workspaces (F11) | "This has to show it was Judge Hale's call, not something I decided or the system inferred" | Careful, tense | Any ambiguity about who made the ruling is unacceptable and breaks trust instantly | Explicit judge-attributed ruling capture with a visible "entered by judge via deputy" trail, live to chambers |
| Recess Reconciliation | At recess, runs dual-log reconciliation against attorneys' exhibit lists and the admitted-items list | Dual-Log and Source Reconciliation (F18), Exception Queue (F7) | "Please let this come back clean — I don't want detective work during lunch" | Hopeful, braced for friction | Historically hours of highlighter cross-referencing eating into a short recess window | Automatic checkpoint comparison surfaces only real discrepancies with a one-click rationale-and-resolve flow |
| Custody Handoff | Records a physical exhibit's transfer to evidence storage overnight and waits for custodian acknowledgment | Custody and Location Tracking (F20) | "If this doesn't get signed back in, it's my name on the missing-exhibit problem tomorrow" | Mildly anxious until confirmed | Paper sign-out sheets let an unacknowledged transfer go unnoticed for a full day | Automatic alert if the recipient hasn't acknowledged receipt within the court's SLA window |
| Jury Review Package Assembly | Assembles the jury review package, confirming only admitted electronic exhibits are included | Jury Review Package Assembly (F22) | "One rejected or sealed exhibit slipping into this package would be a serious problem" | Careful, slightly relieved | Manually cross-checking admitted-vs-not status under time pressure was a major risk under the old process | Automatic exclusion of rejected/withdrawn/sealed items with package-access logging |
| Trial Closeout | Generates the certified exhibit export and full post-trial closeout package — exhibit list, custody receipts, audit package | Exportable Exhibit List (F19), Post-Trial Closeout (F24) | "This used to take the rest of the week — if it's actually minutes, I can go home" | Relieved, satisfied | Previously required manually re-assembling spreadsheets from three different sources | One-click certified export with no re-typing, ready for the clerk's office and appellate record |

#### Key Moments
- **Decision Point:** Recess Reconciliation — whether a discrepancy is resolved immediately with rationale or escalated to David's exception queue determines whether it compounds by day-end.
- **Risk of Abandonment:** Exhibit Offered / Objection & Ruling Logged — if logging ever takes more than a few seconds or more than minimal taps, Maria reverts to her shadow paper log, defeating the system entirely.
- **Delight Opportunity:** Trial Closeout — watching a certified, ready-to-file package assemble in minutes instead of the multi-day post-trial scramble she's used to.

#### Success Outcome
Maria completes a full trial day with zero reversion to paper (JTBD-01.1), zero unresolved discrepancies open at trial close (JTBD-01.2), zero unacknowledged custody transfers beyond SLA (JTBD-01.3), and a certified export produced in minutes rather than hours (JTBD-01.4).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| Pre-Session Setup | F14, F16, F7 |
| Exhibit Offered | F17, F16 |
| Objection & Ruling Logged | F17, F11 |
| Recess Reconciliation | F18, F7 |
| Custody Handoff | F20, F4 |
| Jury Review Package Assembly | F22 |
| Trial Closeout | F19, F24 |

---
