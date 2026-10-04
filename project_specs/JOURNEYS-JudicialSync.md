# User Journeys
## JudicialSync

| Field | Value |
|-------|-------|
| **Product Name** | JudicialSync |
| **Date** | 2026-10-04 |
| **Related Personas** | PERSONAS-JudicialSync.md |
| **Related JTBD** | JTBD-JudicialSync.md |
| **Related PRD** | PRD-JudicialSync.md |

---

## Journey Index

| ID | Persona | Scenario | Key JTBD | Stages |
|----|---------|----------|----------|--------|
| JRN-01.1 | PER-01 | Trial Day: Evidentiary Tracking — Maria logs offers, objections, and rulings in real time across a full courtroom session, reconciles at checkpoints, handles custody, and closes out | JTBD-01.1 | 7 |
| JRN-01.2 | PER-01 | Multi-Day Trial — Overnight Custody and Next-Morning Discrepancy Resolution | JTBD-01.3 | 5 |
| JRN-02.1 | PER-02 | Trial Day from the Bench and Chambers — Ruling, Oversight, and Sealing Authorization | JTBD-02.5 | 5 |
| JRN-02.2 | PER-02 | Criminal Case Monitoring from Chambers — Speedy Trial Oversight | JTBD-02.2 | 6 |
| JRN-03.1 | PER-03 | Criminal Case Monitoring: Speedy Trial — Clerk Lifecycle | JTBD-03.3 | 6 |
| JRN-03.2 | PER-03 | Pretrial Exhibit Intake and Case Setup | JTBD-03.1 | 5 |
| JRN-04.1 | PER-04 | Investigating a Disputed Sealed-Record Access | JTBD-04.2 | 5 |
| JRN-04.2 | PER-04 | Governing a Privileged Configuration Change and CM/ECF Conflict | JTBD-04.5 | 5 |

---
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
### JRN-01.2: Multi-Day Trial — Overnight Custody and Next-Morning Discrepancy Resolution

**Persona:** PER-01 (Maria Santos)
**Scenario:** During a four-day trial, a physical exhibit must leave the courtroom overnight for secure storage, and a reconciliation discrepancy surfaces that Maria cannot resolve alone — requiring escalation into David's portfolio-level exception queue before the next day's session begins.
**Related Jobs:** JTBD-01.3, JTBD-01.2, JTBD-03.2

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| End-of-Day Custody Transfer | Logs the transfer of a physical exhibit to the evidence custodian at day's end | Custody and Location Tracking (F20) | "I need this acknowledged before I leave the building" | Tired, wanting closure | Evidence custodian is off-site and doesn't acknowledge immediately | SLA countdown visible to Maria so she knows exactly when to escalate |
| Unacknowledged Transfer Alert | The SLA window passes without acknowledgment; an alert fires to Maria and the custody supervisor | Notifications Service (F4), Custody and Location Tracking (F20) | "Good — I didn't have to remember to chase this myself" | Relieved | Under the old paper process this would have been invisible until someone went looking for the exhibit | Escalation path auto-notifies a backup contact if the primary custodian doesn't respond |
| End-of-Day Reconciliation Mismatch | Runs day-end reconciliation and finds one admitted exhibit missing from a party's exhibit list | Dual-Log and Source Reconciliation (F18), Exception Queue (F7) | "I can't tell if this is a typo on their list or a real problem — I shouldn't guess" | Frustrated, wary | Some mismatches require portfolio-level context only David can resolve | One-click escalation routes the discrepancy into David's shared exception queue with full context attached |
| Clerk Reviews and Resolves | David picks up the escalated exception the next morning, reviews the numbering configuration, and resolves it with documented rationale | Exception Queue (F7), Configuration Engine (F3) | (David) "This is the third time this numbering mismatch has happened — I should fix the configuration, not just this case" | (David) Mildly annoyed, in control | A recurring pattern fixed one-off instead of at the root keeps happening | Exception queue surfaces recurring patterns so David can trace them to a root-cause configuration fix |
| Resolution Confirmed Before Next Session | Maria sees the exception marked resolved with rationale before the next day's session begins | Exception Queue (F7), Audit Trail (F2) | "Good — I can walk in today without a cloud hanging over yesterday's record" | Confident, relieved | None at this resolved state | Resolution and rationale automatically logged to the audit trail, closing the loop with no extra data entry |

#### Key Moments
- **Decision Point:** End-of-Day Reconciliation Mismatch — Maria must decide whether to resolve it herself or escalate; escalating the right items (rather than guessing) is what prevents downstream errors.
- **Risk of Abandonment:** Unacknowledged Transfer Alert — if alerts are unreliable or noisy, Maria stops trusting them and reverts to manually tracking custody herself.
- **Delight Opportunity:** Resolution Confirmed Before Next Session — walking into day two with yesterday's record fully clean.

#### Success Outcome
Zero custody transfers remain unacknowledged beyond SLA (JTBD-01.3) and zero unresolved discrepancies carry over past trial close (JTBD-01.2), while David's exception-queue resolution trends recurring issues toward configuration fixes (JTBD-03.2).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| End-of-Day Custody Transfer | F20 |
| Unacknowledged Transfer Alert | F4, F20 |
| End-of-Day Reconciliation Mismatch | F18, F7 |
| Clerk Reviews and Resolves | F7, F3 |
| Resolution Confirmed Before Next Session | F7, F2 |

---
## PER-02: Judge Robert Hale (with Law Clerk Ana Ibarra)

### JRN-02.1: Trial Day from the Bench and Chambers — Ruling, Oversight, and Sealing Authorization

**Persona:** PER-02 (Judge Robert Hale, with Ana Ibarra)
**Scenario:** During the same multi-day evidentiary hearing Maria operates from the deputy station (JRN-01.1), Judge Hale rules live on objections from the bench, monitors the shared exhibit status with chambers, and is asked mid-trial to personally authorize sealing a sensitive exhibit before confirming the jury review package and reviewing the sealed-access log after trial.
**Related Jobs:** JTBD-02.5, JTBD-02.1

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| Pre-Session Briefing | Glances at the chambers workspace summary of today's proceeding — exhibits pre-loaded, any open exceptions flagged | Role-Specific UI Workspaces (F11), Case Timeline View (F8) | "Is there anything unresolved from yesterday I need to know before we start?" | Composed, preparing | Being blindsided mid-session by an unresolved exhibit issue | A single pre-session summary card showing open items relevant to today's docket |
| Live Ruling on Objection | Rules from the bench on an exhibit objection and watches Maria's log capture the ruling in real time on the shared live display | Real-Time Courtroom Logging (F17, via F11) | "This has to show it was my ruling, recorded accurately — not something the system decided" | Attentive, protective of accuracy | Any lag or ambiguity between his spoken ruling and the recorded record undermines trust instantly | Instant, explicit on-screen attribution confirming "Ruling entered: Judge Hale" the moment it's logged |
| Mid-Trial Sealing Request | Reviews and personally authorizes sealing a sensitive exhibit flagged by counsel or Maria | Sealing and Restricted Exhibit Handling (F21) | "I'm not letting this happen automatically — sealing has to be my call, logged clearly" | Deliberate, careful | Without an explicit authorization step, sensitive material risks casual handling or loose exposure control | One clear authorize/deny action tied to his credentials, with every subsequent access attempt logged |
| Jury Review Authorization | Confirms the assembled jury review package contains only properly admitted, non-sealed electronic exhibits | Jury Review Package Assembly (F22) | "I need to be certain nothing improper reaches the jury room" | Vigilant | Manually double-checking package contents against the admitted list would be slow and risky under time pressure | Package assembly structurally excludes rejected/withdrawn/sealed items, with a simple confirmation view |
| Post-Trial Record Review | Reviews the certified exhibit export and the sealed-access log before signing off on the record | Exportable Exhibit List (F19), Audit Trail / Sealed-Access Log (F21, F2) | "Did anyone access the sealed exhibit who shouldn't have?" | Satisfied if clean, alarmed if not | Previously no structured way existed to confirm sealed-access integrity after the fact | A reviewable access log attached directly to the sealing decision, available on demand |

#### Key Moments
- **Decision Point:** Mid-Trial Sealing Request — his explicit authorize/deny decision is the entire control point for sensitive-exhibit exposure.
- **Risk of Abandonment:** Live Ruling on Objection — if the system ever appears to infer or auto-populate a ruling, Judge Hale could lose trust in the tool for the rest of the proceeding.
- **Delight Opportunity:** Post-Trial Record Review — a clean, reviewable sealed-access log confirming zero improper access without having to ask anyone to dig for it.

#### Success Outcome
Zero unauthorized-access attempts succeed against exhibits he has sealed (JTBD-02.5), and every ruling remains explicitly and visibly attributed to him in real time, preserving judicial authority throughout the proceeding (JTBD-02.1).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| Pre-Session Briefing | F11, F8 |
| Live Ruling on Objection | F17, F11 |
| Mid-Trial Sealing Request | F21 |
| Jury Review Authorization | F22 |
| Post-Trial Record Review | F19, F21, F2 |

---
### JRN-02.2: Criminal Case Monitoring from Chambers — Speedy Trial Oversight

**Persona:** PER-02 (Judge Robert Hale, with Ana Ibarra)
**Scenario:** Over the life of a criminal case, Judge Hale and Ana monitor the Speedy Trial clock as motions are filed and a continuance is requested, ultimately confirming the clock status ahead of a status conference and trial setting — mirroring David's clerk-side lifecycle in JRN-03.1 from the chambers side of the same case.
**Related Jobs:** JTBD-02.2, JTBD-02.3, JTBD-02.4, JTBD-02.1

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| Threshold Alert Received | Ana receives a proactive alert that a defendant's remaining includable time is approaching a configured risk threshold | Configurable Threshold Alerts (F31), Notifications Service (F4) | (Ana) "I need to get this in front of Judge Hale today, not let it sit in an inbox" | Alert, urgent | Approaching deadlines were previously discovered through periodic manual docket review, often too late | Alert content links directly into the explanation context so she doesn't have to reconstruct why the threshold was crossed |
| Explain This Date Review | Opens "explain this date" to see the full breakdown of elapsed time, exclusions, and the current remaining-time calculation | Versioned Clock Calculation and Explainability (F29) | "Before I do anything, I need to see exactly why the clock says what it says" | Methodical, wary of trusting an unverifiable number | The calculation was historically manual and difficult to audit; any explanation gap would undermine confidence | Every segment links to its triggering event and rule version, so the full chain of reasoning is visible on demand |
| Motion Filed — Candidate Exclusion Review | Reviews a continuance motion mapped to a candidate exclusion period and accepts, modifies, or rejects it with documented rationale | Candidate Exclusion Engine (F28), Review and Approval Workflow (F30) | "This is my call — I want to see the motion and order reference, not just take the system's suggestion" | Deliberate, authoritative | Relying on an incomplete record without noticing if a required finding or order reference is missing | Continuance Findings Check flags incomplete records before the calculation relies on them |
| Continuance Findings Flagged | The system flags this continuance record as missing a required structured finding; Ana routes it back to the filing party before Judge Hale finalizes his decision | Continuance Findings Check (F33), Work Queue (F6) | (Ana) "Better to catch this now than have it challenged later" | Vigilant, relieved | Missing findings were previously "caught late or not at all" | Flag-only behavior keeps legal-sufficiency determination entirely with chambers while surfacing the gap automatically |
| Status Conference Preparation | Ana opens the case conference view to review clock state, pending motions, and continuance history in one screen | Case Conference View (F35), Case Timeline View (F8) | "I want Judge Hale walking in already knowing where things stand, not reconstructing it from the docket" | Prepared, efficient | Conference prep was previously manually compiled docket excerpts and notes | Single consolidated view with deep links into underlying event and exclusion detail, available as a pre-conference packet |
| Trial Setting / Disposition Confirmation | Confirms the current Speedy Trial status at the conference and sets a trial date, referencing the explained calculation directly | Versioned Clock Calculation (F29), Multi-Defendant Separation (F34) | "I can state this date with full confidence because I can see exactly how it was built" | Confident, in command | In a multi-defendant matter, co-defendant clocks must stay clearly separated or the ruling risks misrepresenting one defendant's status | Clearly separated per-defendant clocks with relationship visibility prevent any one case's result from being collapsed |

#### Key Moments
- **Decision Point:** Motion Filed — Candidate Exclusion Review — his accept/modify/reject decision is the sole point where a period becomes legally excludable; the system never decides this for him.
- **Risk of Abandonment:** Explain This Date Review — if the explanation ever has a gap or an unlinked segment, Judge Hale stops trusting the calculated date entirely and reverts to manual recalculation.
- **Delight Opportunity:** Status Conference Preparation — walking into a conference fully briefed from one screen instead of Ana's manual compilation.

#### Success Outcome
Judge Hale can produce a complete, defensible explanation for any Speedy Trial date within minutes (JTBD-02.1); every candidate exclusion is explicitly reviewed with incomplete findings caught before reliance (JTBD-02.2); the threshold alert was delivered and acknowledged before risk materialized (JTBD-02.3); and the conference packet required no manual reconstruction (JTBD-02.4).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| Threshold Alert Received | F31, F4 |
| Explain This Date Review | F29 |
| Motion Filed — Candidate Exclusion Review | F28, F30 |
| Continuance Findings Flagged | F33, F6 |
| Status Conference Preparation | F35, F8 |
| Trial Setting / Disposition Confirmation | F29, F34 |

---
## PER-03: David Okafor

### JRN-03.1: Criminal Case Monitoring: Speedy Trial — Clerk Lifecycle

**Persona:** PER-03 (David Okafor)
**Scenario:** From the moment a new defendant enters David's caseload through trial or disposition, David initializes the Speedy Trial tracker, resolves docket-mapping exceptions, supports the continuance and exclusion workflow feeding chambers' review (JRN-02.2), and tracks the case through threshold alerts to closeout — all while managing dozens of other cases across multiple judges in parallel.
**Related Jobs:** JTBD-03.3, JTBD-03.2, JTBD-03.1, JTBD-03.4

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| Tracker Opened | A CM/ECF arraignment event triggers automatic tracker creation; David confirms the applicable start context | Case and Defendant Tracker Initialization (F26), CM/ECF Integration Adapter (F10) | "Did the trigger event actually fire correctly, or do I need to create this one manually?" | Attentive, wary of missed triggers | No systematic way previously existed to catch a missing trigger event until status was already needed | Missing-trigger-event detection flags the gap the moment a tracker should have been created, not after the fact |
| Motion Filed / Docket Event Ingested | A pretrial motion syncs in from CM/ECF; David reviews the mapping to confirm it's correctly categorized | Docket Event Ingestion and Mapping (F27) | "Is this mapped to the right exclusion category, or will it sit in my exception queue as unmapped?" | Methodical, mildly impatient | Unmapped CM/ECF events accumulate without a clear fast path to resolution, creating downstream calculation risk | Configurable event-category mapping he can adjust directly, shrinking the unmapped-event rate over time |
| Continuance Requested | Processes a defense continuance filing, checks it against the findings requirement, and routes a candidate exclusion for chambers review | Candidate Exclusion Engine (F28), Continuance Findings Check (F33), Exception Queue (F7) | "If this is missing a required finding, I'd rather catch it now than have Judge Hale catch it at conference" | Proactive, protective of chambers' time | Incomplete continuance filings were previously discovered only when challenged, often well after reliance | Structured completeness check flags gaps automatically before the record reaches chambers' review queue |
| Threshold Reached | Sees the risk-threshold alert land in the shared work queue alongside chambers as remaining includable time crosses the configured line | Configurable Threshold Alerts (F31), Work Queue (F6) | "I need to make sure chambers actually saw this, not just that it fired" | Vigilant | Risk was previously discovered only through periodic manual docket review, often reactively | Delivery and acknowledgment tracking confirms the alert didn't just send — it was seen |
| Portfolio Check Across Caseload | Opens the portfolio dashboard mid-week to see which of his many cases have open exceptions, approaching thresholds, or closeout backlog | Speedy Trial Portfolio Dashboard (F36), Exhibit Portfolio Dashboard (F25) | "Which of these forty cases actually needs my attention today?" | In control, efficient | Previously had to check case-by-case with no aggregated view of risk | Risk indicators highlight approaching thresholds and data gaps across the whole caseload in one screen |
| Trial or Disposition Closeout | Confirms the final Speedy Trial status is reflected and the case record is ready for closeout with no open exceptions outstanding | Versioned Clock Calculation (F29, via chambers), Exception Queue (F7) | "If anything's still open here, it needs resolving before this case is considered closed" | Methodical, satisfied when clean | A case closing with unresolved exceptions or unmapped events creates downstream audit risk | Closeout gate surfaces any remaining open items for this case before it's marked resolved |

#### Key Moments
- **Decision Point:** Continuance Requested — David's completeness check determines whether chambers receives a clean record or has to send it back, affecting conference efficiency.
- **Risk of Abandonment:** Motion Filed / Docket Event Ingested — if unmapped events keep piling up without a fast resolution path, David reverts to manually cross-checking the docket case-by-case.
- **Delight Opportunity:** Portfolio Check Across Caseload — seeing every at-risk case across his full caseload in one screen instead of opening cases one by one.

#### Success Outcome
New tracker setups are initialized without a missing-trigger incident discovered after the fact (JTBD-03.3); unmapped docket events trend toward a low single-digit percentage (JTBD-03.2); missing-metadata discipline holds across the caseload (JTBD-03.1); and David can identify every case with outstanding risk without opening cases individually (JTBD-03.4).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| Tracker Opened | F26, F10 |
| Motion Filed / Docket Event Ingested | F27, F7 |
| Continuance Requested | F28, F33, F7 |
| Threshold Reached | F31, F6 |
| Portfolio Check Across Caseload | F36, F25 |
| Trial or Disposition Closeout | F29, F7 |

---
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
## PER-04: Priya Nandan

### JRN-04.1: Investigating a Disputed Sealed-Record Access

**Persona:** PER-04 (Priya Nandan)
**Scenario:** A defense attorney disputes that a sealed exhibit — the same category of record Judge Hale authorized sealing for in JRN-02.1 — was improperly viewed by an unauthorized party. Priya must reconstruct exactly who accessed it, when, and under what authorization, using the audit explorer and access-control configuration, to produce a defensible answer for the court.
**Related Jobs:** JTBD-04.2, JTBD-04.1, JTBD-04.4

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| Dispute Reported | Receives a report that a sealed exhibit's access history is being questioned | Role-Specific UI Workspaces — Admin Dashboard (F11) | "I need every access attempt on this exhibit, successful or denied, not just a summary" | Focused, aware of the stakes | Fragmented legacy tooling offered no structured way to reconstruct this kind of history at all | A single audit explorer entry point scoped directly to the disputed object |
| Audit Explorer Query | Queries the audit explorer by case, object, and date range to pull every access event tied to the sealed exhibit | Audit Trail and Audit Explorer (F2) | "This needs to be tamper-evident — if I can't prove the log wasn't altered, this investigation is worthless" | Methodical, confident in the tool | A log that could plausibly be edited after the fact would be useless as evidence | Tamper-evident/immutable logging with audit access strictly separated from operational editing |
| Access Control Cross-Check | Cross-references the access log against the role/attribute scope configured for each user who touched the record at the time | Identity and Access Management (F0) | "Did this person's access match their authorized role and security designation at that moment, or was there a scoping gap?" | Analytical, thorough | Inconsistent or fragmented access-policy enforcement turns this cross-check into guesswork | RBAC/ABAC scoping by court/division/case/proceeding/party-role/security-designation gives a precise, queryable record to compare against |
| Rule-Version Linkage Review | Confirms which sealing policy and judge authorization were in effect at the time of each access attempt | Sealing and Restricted Exhibit Handling (F21), Audit Trail (F2) | "I need to show this access either matched an authorized sealing/release action or it didn't — no gray area" | Rigorous, protective of court credibility | Without linkage between the audit entry and the policy/authorization in effect, no definitive answer is possible | Audit entries link directly to the rule package or authorization version in effect at the time of the action |
| Findings Delivered | Delivers a structured, defensible findings report to court leadership and Judge Hale confirming whether unauthorized access occurred | Audit Trail and Audit Explorer (F2), Operational Reporting Feed (F9) | "This has to hold up if it's challenged again later — on appeal, in an IG review, anywhere" | Confident, vindicated by a clean process | None in the clean-resolution case; a real violation shifts the pain point to incident response, out of this journey's scope | A reusable, repeatable investigation pattern that shortens every future response time |

#### Key Moments
- **Decision Point:** Access Control Cross-Check — this is where Priya determines whether the access was policy-compliant or a genuine violation.
- **Risk of Abandonment:** Audit Explorer Query — if the log has gaps or isn't genuinely tamper-evident, the entire investigation loses credibility and the court's trust in the platform erodes.
- **Delight Opportunity:** Findings Delivered — producing a complete, defensible answer in a single investigation session rather than a multi-week reconstruction effort.

#### Success Outcome
100% of material actions are captured in the tamper-evident audit trail (JTBD-04.2); zero unauthorized-access attempts are found to have succeeded against the sealed record (JTBD-04.1); and sensitive-record policy enforcement is confirmed to have applied consistently (JTBD-04.4).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| Dispute Reported | F11 |
| Audit Explorer Query | F2 |
| Access Control Cross-Check | F0 |
| Rule-Version Linkage Review | F21, F2 |
| Findings Delivered | F2, F9 |

---
### JRN-04.2: Governing a Privileged Configuration Change and CM/ECF Conflict

**Persona:** PER-04 (Priya Nandan)
**Scenario:** David requests a new exclusion-category mapping and numbering-scheme adjustment for a court profile (following on from his recurring-issue discovery in JRN-03.2). At the same time, the CM/ECF adapter flags a sync conflict where an inbound docket update disagrees with a locally entered exhibit record. Priya must approve the privileged configuration change under separation-of-duties controls and resolve the CM/ECF conflict without ever letting it silently overwrite data.
**Related Jobs:** JTBD-04.5, JTBD-04.3, JTBD-03.5

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| Configuration Change Requested | David submits a request to adjust a court profile's event-category mapping and numbering scheme | Configuration Engine (F3), Work Queue (F6) | "This is a privileged change — I want to see exactly who's authorized to approve it before it goes live" | Procedural, careful | Privileged and routine administrative actions historically lacked clean segregation, creating audit exposure | Separation-of-duties enforcement ensures David's routine clerk role can request but not unilaterally approve a privileged change |
| CM/ECF Conflict Flagged | The CM/ECF adapter detects an inbound docket update conflicting with a locally entered record and routes it to Priya's human-review queue instead of overwriting either side | CM/ECF Integration Adapter (F10), Exception Queue (F7) | "Good — it didn't just pick one and overwrite the other. Now I actually get to look at this" | Reassured, aware of the time cost | A silent overwrite here would be a serious integrity and compliance risk if it ever happened | Guaranteed routing to human review with source identifiers preserved on both the inbound and local record |
| Conflict Resolution | Reviews both versions, confirms which reflects the authoritative docket, and resolves the conflict while preserving source lineage | CM/ECF Integration Adapter (F10), Audit Trail (F2) | "CM/ECF has to win here unless there's a clear reason it doesn't — that's the whole principle this platform is built on" | Deliberate, principled | Without enforced source-identifier preservation, resolving this cleanly would be hard to justify later | Source-identifier preservation on all imported records makes the resolution traceable and defensible after the fact |
| Configuration Change Approved | Reviews David's request, confirms it doesn't conflict with national core constraints, and approves it under the governed, versioned change process | Configuration Engine (F3), Audit Trail (F2) | "This needs to be versioned, not quietly edited — if someone asks what changed and why next year, I need an answer" | Methodical, satisfied the process has teeth | Undocumented configuration edits in the old world created long-term audit and compliance exposure | Versioned configuration changes with a full audit trail mean every change is explainable indefinitely |
| Verification via Audit Explorer | Later verifies in the audit explorer that both the configuration change and the CM/ECF conflict resolution are fully attributed, versioned, and segregated from routine operational actions | Audit Trail and Audit Explorer (F2) | "If anyone ever questions either of these actions, I can answer immediately" | Confident, in control | None in the clean-resolution case | A single audit view confirms separation-of-duties compliance is real, not just a policy on paper |

#### Key Moments
- **Decision Point:** CM/ECF Conflict Flagged — Priya's resolution determines which record is treated as authoritative; getting this wrong undermines the platform's entire authoritative-source discipline.
- **Risk of Abandonment:** Configuration Change Requested — if separation-of-duties controls are clunky or slow David down too much for routine changes, pressure builds to bypass them informally.
- **Delight Opportunity:** Verification via Audit Explorer — confirming, in minutes, that governance controls actually held, rather than hoping they did.

#### Success Outcome
Privileged administrative actions remain fully segregated from routine operational roles and verifiable via the audit explorer (JTBD-04.5); zero instances of CM/ECF docket data being silently overwritten occur — the conflict routed to human review as designed (JTBD-04.3); and David's underlying configuration need is met without an IT ticket (JTBD-03.5).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| Configuration Change Requested | F3, F6 |
| CM/ECF Conflict Flagged | F10, F7 |
| Conflict Resolution | F10, F2 |
| Configuration Change Approved | F3, F2 |
| Verification via Audit Explorer | F2 |

---
## Cross-Journey Patterns

- **Common Pain Points:**
  - **"Discovered too late" pattern** — missing triggers, unmapped events, missing continuance findings, and unacknowledged custody transfers all share the same root pain: problems surfacing reactively instead of being flagged proactively. Appears in JRN-01.1, JRN-01.2, JRN-02.2, JRN-03.1, JRN-03.2.
  - **"Shadow record" pattern** — reversion to paper logs, spreadsheets, or ad hoc tracking whenever the digital system feels too slow or opaque to fully trust. Appears in JRN-01.1, JRN-01.2.
  - **"Who decided this?" pattern** — need for explicit, unambiguous human attribution (judge's ruling, chambers' exclusion decision, deputy's log entry) versus any hint of system auto-decision. Appears in JRN-01.1, JRN-02.1, JRN-02.2.
  - **"Silent overwrite anxiety"** — fear that automation could silently overwrite docket data, a prior calculation, or an approved record rather than routing the conflict to a human. Appears in JRN-02.2, JRN-04.2.
  - **"No aggregated view" pattern** — case-by-case checking with no portfolio-level visibility into risk, exceptions, or backlog. Appears in JRN-03.1, JRN-03.2 (and echoed in Priya's investigation journeys, where fragmented tooling is the historical baseline).

- **Shared Opportunities:**
  - A single, consistently surfaced **exception queue (F7)** threading through courtroom, clerk, and chambers journeys so problems escalate to the right owner instead of being independently discovered.
  - Proactive, **context-linked alerts** (never a bare status or date) across custody transfers, Speedy Trial thresholds, and continuance findings.
  - **Explicit, visible attribution** of every human decision (ruling, exclusion, sealing, configuration approval) baked into the live workspace, not just reconstructable later from the audit trail.
  - **Self-service configuration (F3)** that lets clerks and admins fix root causes directly, trending recurring exceptions toward zero instead of repeatedly patching symptoms.

- **Convergence Points:**
  - **Live courtroom logging** (JRN-01.1 / JRN-02.1) is where Maria, Judge Hale, and Ana meet in real time — the deputy enters, the judge rules, chambers watches live.
  - The **shared exception queue** (JRN-01.2, JRN-03.1, JRN-03.2, JRN-04.2) is where Maria, David, and Priya converge — escalation, resolution, and root-cause configuration fixes all pass through the same surface.
  - The **Speedy Trial threshold-and-exclusion workflow** (JRN-02.2, JRN-03.1) is where David's clerk-side setup work and Judge Hale/Ana's chambers-side review work meet on the same case.
  - The **audit explorer** (JRN-04.1, JRN-04.2) is the convergence point where every other persona's actions become independently verifiable by Priya.

---
## Journey-to-JTBD Traceability

| Journey Stage | JTBD ID | Expected Outcome |
|--------------|---------|-------------------|
| JRN-01.1:Exhibit Offered | JTBD-01.1 | Deputy logs exhibit actions in real time with zero reversion to paper during pilot trials |
| JRN-01.1:Objection & Ruling Logged | JTBD-01.1 | Judge's ruling is explicitly attributed and visible to chambers live, in a small number of seconds |
| JRN-01.1:Recess Reconciliation | JTBD-01.2 | Ledger and source lists reconcile at every checkpoint with zero unresolved discrepancies at trial close |
| JRN-01.1:Custody Handoff | JTBD-01.3 | Every custody transfer is confirmed, with zero unacknowledged transfers beyond SLA |
| JRN-01.1:Trial Closeout | JTBD-01.4 | Certified exhibit export available in minutes rather than hours after session close |
| JRN-01.2:Unacknowledged Transfer Alert | JTBD-01.3 | Zero custody transfers remain unacknowledged beyond the court's defined SLA |
| JRN-01.2:End-of-Day Reconciliation Mismatch | JTBD-01.2 | Discrepancies are resolved with rationale or explicitly flagged open for the next checkpoint |
| JRN-01.2:Clerk Reviews and Resolves | JTBD-03.2 | Recurring exception patterns are traced back to a configuration fix, not repeated one-off corrections |
| JRN-02.1:Live Ruling on Objection | JTBD-02.1 | Every ruling is visibly and explicitly attributed to the judge, never auto-decided |
| JRN-02.1:Mid-Trial Sealing Request | JTBD-02.5 | Sealing/release requires explicit judge authorization; every access attempt is logged |
| JRN-02.1:Post-Trial Record Review | JTBD-02.5 | Zero unauthorized-access attempts succeed against sealed/restricted exhibits he has authorized |
| JRN-02.2:Threshold Alert Received | JTBD-02.3 | 100% of cases crossing a configured threshold generate a delivered, acknowledged alert before risk materializes |
| JRN-02.2:Explain This Date Review | JTBD-02.1 | Any Speedy Trial date is fully explainable within minutes, including in multi-defendant matters |
| JRN-02.2:Motion Filed — Candidate Exclusion Review | JTBD-02.2 | Every candidate exclusion is explicitly accepted, modified, or rejected with documented rationale |
| JRN-02.2:Continuance Findings Flagged | JTBD-02.2 | Incomplete continuance findings are caught before the calculation relies on them |
| JRN-02.2:Status Conference Preparation | JTBD-02.4 | Chambers prepares for conferences from a single consolidated view, no manual reconstruction |
| JRN-02.2:Trial Setting / Disposition Confirmation | JTBD-02.1 | Multi-defendant clocks remain independently calculated and clearly separated |
| JRN-03.1:Tracker Opened | JTBD-03.3 | New case/defendant tracker setups are initialized without a missing-trigger incident discovered after the fact |
| JRN-03.1:Motion Filed / Docket Event Ingested | JTBD-03.2 | Unmapped docket events in Speedy Trial ingestion drop to a low single-digit percentage of all ingested events |
| JRN-03.1:Continuance Requested | JTBD-03.2 | Continuance completeness gaps route to the exception queue before reaching chambers' reliance |
| JRN-03.1:Portfolio Check Across Caseload | JTBD-03.4 | Portfolio-wide risk (exceptions, custody backlog, closeout status) visible without case-by-case checks |
| JRN-03.2:Attorney Submission Received | JTBD-03.1 | Missing-metadata exceptions at pretrial intake drop to a low single-digit percentage of submissions |
| JRN-03.2:New Case Setup | JTBD-03.3 | New case/proceeding/tracker setups complete correctly the first time, with no missing-trigger surprises |
| JRN-03.2:Configuration Adjustment | JTBD-03.5 | Local configuration changes are made directly by clerk staff, with zero IT tickets required |
| JRN-04.1:Audit Explorer Query | JTBD-04.2 | 100% of material actions across both modules are captured in a tamper-evident audit trail |
| JRN-04.1:Access Control Cross-Check | JTBD-04.1 | Access is enforced by role/attribute scope; zero unauthorized access succeeds against sealed records |
| JRN-04.1:Rule-Version Linkage Review | JTBD-04.4 | Sensitive record handling is enforced via explicit policy configuration, confirmed under audit |
| JRN-04.2:CM/ECF Conflict Flagged | JTBD-04.3 | Zero silent overwrites of CM/ECF docket data; all conflicts route to human review |
| JRN-04.2:Configuration Change Approved | JTBD-04.5 | Privileged administrative actions remain fully segregated and auditable at all times |

---

*Document generated by Pivota Spec Framework*
*Last updated: 2026-10-04*
