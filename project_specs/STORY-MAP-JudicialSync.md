# User Story Map
## JudicialSync

| Field | Value |
|-------|-------|
| **Product Name** | JudicialSync |
| **Date** | 2026-10-04 |
| **Related Personas** | PERSONAS-JudicialSync.md |
| **Related Journeys** | JOURNEYS-JudicialSync.md |
| **Related JTBD** | JTBD-JudicialSync.md |
| **Related User Stories** | UserStories-JudicialSync.md |
| **Related PRD** | PRD-JudicialSync.md |

---

## Overview

This story map organizes all 93 UserStories (Epics F0–F39) along two axes: **journey lanes** (one per persona/journey from JOURNEYS-JudicialSync.md, in stage order) and **release** (R1–R4, mapped directly to the PRD's P0–P3 priority tiers and the vision document's Foundation/Operational MVP → Pilot hardening → Scale build sequence).

**NaC (Natural Acceptance Criteria)** bridges JTBD outcomes to testable criteria:
1. Take a JTBD functional outcome (e.g., "Minimize time to paper reversion")
2. Apply it to the journey stage context (e.g., courtroom logging during a live session)
3. Produce a testable criterion already anticipated in JTBD-JudicialSync.md's "NaC Preview" table

Every NaC below is derived from the JTBD NaC Preview table or the JTBD Outcome-to-Feature Traceability table — none are invented. Six epics (F1, F5, F13, F37, F38, F39) have no dedicated journey-stage touchpoint in JOURNEYS-JudicialSync.md; these are placed in a **Cross-Cutting Platform Foundation & Scale** lane with NaC derived by reasonable extension of the nearest JTBD outcome, flagged explicitly in Coverage Analysis. (F23 and F32 are correctly placed in named journey lanes elsewhere and are not part of this cross-cutting set.)

Release mapping (per PRD §5 Priority Summary and PROJECT.md build sequence):
- **R1 = P0** (Foundation + Operational MVP core) — 23 features, 59 stories
- **R2 = P1** (MVP-adjacent) — 5 features, 10 stories
- **R3 = P2** (Pilot hardening) — 8 features, 17 stories
- **R4 = P3** (Scale) — 4 features, 7 stories

---

## Story Map Matrix
### PER-01: Maria Santos — JRN-01.1: Trial Day: Evidentiary Tracking

| Activity | Persona | Epic | Stories | NaC | Release |
|----------|---------|------|---------|-----|---------|
| Pre-Session Setup: confirm proceeding, parties, numbering, and exhibit list loaded before the judge takes the bench | PER-01 | Epic 14 (F14) | US-14.1, US-14.2 *(see also Lane PER-03/JRN-03.2 where these are primary)* | JTBD-03.3: New case/proceeding/tracker setups complete correctly the first time — no missing-trigger surprise inherited by the deputy at session start | R1 |
| Pre-Session Setup: ledger reflects today's exhibit list as the one authoritative record | PER-01 | Epic 16 (F16) | US-16.1 | JTBD-01.1 (context): one authoritative ledger entry per exhibit is visible before proceedings begin, replacing a shadow spreadsheet | R1 |
| Pre-Session Setup: any unresolved overnight intake exception for today's proceeding is visible on the checklist | PER-01 | Epic 7 (F7) | US-7.1, US-7.2 *(primary placement: Lane PER-03/JRN-03.2)* | JTBD-03.1: Given an attorney submits an exhibit list, when required metadata is missing, then the item is routed to the exception queue before courtroom use | R1 |
| Exhibit Offered: attorney offers an exhibit; deputy taps it "offered" in ≤3 actions | PER-01 | Epic 17 (F17) | US-17.1 | JTBD-01.1: Given a live session, when the deputy logs an exhibit offer, then the action is captured and visible within a small number of seconds with no parallel paper log maintained | R1 |
| Exhibit Offered: status transition validated against court-configured workflow states | PER-01 | Epic 16 (F16) | US-16.2 | JTBD-01.1 (context): an exhibit can't be moved into an invalid status mid-proceeding, preserving ledger integrity at courtroom speed | R1 |
| Mid-Session Connectivity Disruption: entries persist locally and resync automatically | PER-01 | Epic 17 (F17) | US-17.2 | JTBD-01.1 (context): zero reversion to paper even during a courtroom or integration disruption — no entry lost | R1 |
| Objection & Ruling Logged: judge's ruling is explicitly attributed, never auto-decided | PER-01 | Epic 16 (F16) | US-16.3 | JTBD-02.1 (via Journey-to-JTBD traceability): every ruling is visibly and explicitly attributed to the judge, never auto-decided | R1 |
| Objection & Ruling Logged: deputy uses a fast, keyboard-operable logging interface | PER-01 | Epic 11 (F11) | US-11.2 | JTBD-01.1: large touch targets and full keyboard support optimized for courtroom speed; interface degrades to partial availability rather than blocking logging | R1 |
| Session Close Triggers Reconciliation: closing a session automatically triggers the checkpoint | PER-01 | Epic 17 (F17) | US-17.3 | JTBD-01.2 (context): a session cannot be marked closed while leaving the ledger un-reconciled without an explicit, logged override | R1 |
| Recess Reconciliation: live ledger compared against party lists, admitted-items list, and disposition records | PER-01 | Epic 18 (F18) | US-18.1, US-18.2, US-18.3 | JTBD-01.2: Given a recess/day-end/trial-close checkpoint, when reconciliation runs, then all discrepancies are either resolved with rationale or explicitly flagged open for the next checkpoint | R1 |
| Custody Handoff: exhibit transfer to storage recorded with recipient, purpose, time, location | PER-01 | Epic 20 (F20) | US-20.1, US-20.2 | JTBD-01.3 (context): transfer event captures responsible custodian, purpose, time, location; recipient must explicitly acknowledge receipt | R3 |
| Custody Handoff: type-specific required fields (e.g., contraband) enforced before transfer | PER-01 | Epic 23 (F23) | US-23.2 | JTBD-01.3 (context, extended): sensitive item types carry the additional documentation the court requires before a transfer is permitted | R3 |
| Custody Handoff: unacknowledged transfer triggers an alert without exposing sensitive content | PER-01 | Epic 4 (F4) | US-4.2 | JTBD-01.3: Given an exhibit custody transfer is recorded, when the recipient does not acknowledge within the court's SLA window, then an alert is generated automatically | R1 |
| Jury Review Package Assembly: only admitted electronic exhibits included, rejected/withdrawn/sealed excluded | PER-01 | Epic 22 (F22) | US-22.1, US-22.2 | JTBD-02.5 (context, extended): structural exclusion of unauthorized-sealed items from any downstream package, with package-access logging | R3 |
| Trial Closeout: one-click filtered export of admitted exhibits, certified without re-typing | PER-01 | Epic 19 (F19) | US-19.1, US-19.2 | JTBD-01.4: Given a session has ended, when the deputy requests a filtered export, then a certified exhibit list is produced without manual re-entry | R2 |
| Trial Closeout: full appeal-ready closeout package with disposition tasks and receipts | PER-01 | Epic 24 (F24) | US-24.1, US-24.2 | JTBD-01.4 (context, extended): certified exhibit export available in minutes rather than hours, now covering the full post-trial closeout artifact | R3 |

---

### PER-01: Maria Santos — JRN-01.2: Multi-Day Trial — Overnight Custody and Next-Morning Discrepancy Resolution

| Activity | Persona | Epic | Stories | NaC | Release |
|----------|---------|------|---------|-----|---------|
| End-of-Day Custody Transfer: transfer to evidence custodian logged at day's end | PER-01 | Epic 20 (F20) | US-20.3 | JTBD-01.3 (context): unacknowledged custody transfers automatically escalate to a supervisory role after a configured SLA — zero transfers left unacknowledged beyond SLA | R3 |
| Unacknowledged Transfer Alert: SLA window passes; alert fires without sensitive content exposure | PER-01 | Epic 4 (F4) | US-4.1 | JTBD-01.3: alert content never embeds exhibit description/party detail, only a secure deep link requiring re-authentication | R1 |
| End-of-Day Reconciliation Mismatch: checkpoint blocked from completing while high-severity discrepancies remain open | PER-01 | Epic 18 (F18) | US-18.3 *(see Lane PER-01/JRN-01.1 for full row)* | JTBD-01.2: a checkpoint completion attempt with unresolved high-severity discrepancies is blocked unless a supervisory, separately-rationale'd override is logged | R1 |
| Clerk Reviews and Resolves: David resolves the escalated exception and fixes the recurring numbering configuration at its root | PER-03 (David) | Epic 3 (F3) | US-3.1 | JTBD-03.2: recurring exception patterns are traceable back to a configuration fix, not repeated one-off corrections | R1 |
| Resolution Confirmed Before Next Session: resolution and rationale automatically logged to the audit trail | PER-01 | Epic 2 (F2) | US-2.1 | JTBD-01.2 / JTBD-04.2 (context): Maria sees the exception marked resolved with rationale before the next day's session begins, fully reconstructable via the audit explorer | R1 |
### PER-02: Judge Robert Hale (with Ana Ibarra) — JRN-02.1: Trial Day from the Bench and Chambers

| Activity | Persona | Epic | Stories | NaC | Release |
|----------|---------|------|---------|-----|---------|
| Pre-Session Briefing: chambers workspace summarizes today's proceeding and open items | PER-02 | Epic 11 (F11) | US-11.1 | JTBD-02.4 (context): a single pre-session summary card surfaces anything unresolved from yesterday relevant to today's docket | R1 |
| Pre-Session Briefing: unified chronological case timeline merges docket, hearings, exhibit, and clock events | PER-02 | Epic 8 (F8) | US-8.1 | JTBD-02.4 (context): Judge Hale sees case history in context instead of switching between module-specific screens | R1 |
| Live Ruling on Objection: ruling instantly, explicitly attributed to the judge on the shared live display | PER-02 | Epic 16 (F16) | *(see US-16.3 under PER-01/JRN-01.1 — same story, judge's side of the same real-time moment)* | JTBD-02.1 (via Journey-to-JTBD traceability): every ruling is visibly and explicitly attributed to the judge, never auto-decided | R1 |
| Mid-Trial Sealing Request: judge personally authorizes sealing a sensitive exhibit | PER-02 | Epic 21 (F21) | US-21.1 | JTBD-02.5: sealing and release actions require his explicit authorization, never automatic | R3 |
| Jury Review Authorization: confirms the jury package contains only admitted, non-sealed exhibits | PER-02 | Epic 22 (F22) | *(see US-22.1 under PER-01/JRN-01.1 — same authorization story)* | JTBD-02.5 (context): package assembly structurally excludes rejected/withdrawn/sealed items | R3 |
| Post-Trial Record Review: reviews the sealed-access log attached to his sealing decision | PER-02 | Epic 21 (F21) | US-21.2 | JTBD-02.5: every access attempt — successful or denied — against a sealed/restricted exhibit is logged and reviewable on demand | R3 |
| Post-Trial Record Review: confirms the audit trail is tamper-evident and separated from operational editing | PER-02 | Epic 2 (F2) | US-2.2, US-2.3 | JTBD-04.2 (context, supporting his review): 100% of material actions are captured tamper-evidently, with audit access strictly separated from operational edit rights | R1 |
| Post-Trial Record Review: reviews the certified exhibit export before signing off | PER-02 | Epic 19 (F19) | *(see US-19.1/US-19.2 under PER-01/JRN-01.1 — same export, judge's review step)* | JTBD-01.4 (context): a certified export is available as a trustworthy record in minutes | R2 |

---

### PER-02: Judge Robert Hale (with Ana Ibarra) — JRN-02.2: Criminal Case Monitoring from Chambers — Speedy Trial Oversight

| Activity | Persona | Epic | Stories | NaC | Release |
|----------|---------|------|---------|-----|---------|
| Threshold Alert Received: Ana receives a proactive alert as remaining time crosses a configured risk tier | PER-02 (Ana) | Epic 31 (F31) | US-31.1 | JTBD-02.3: Given remaining time crosses a configured threshold, when the crossing occurs, then an alert referencing the full explanation is delivered and tracked to acknowledgment | R1 |
| Threshold Alert Received: alert content never embeds sensitive detail, links securely into context | PER-02 | Epic 4 (F4) | *(see US-4.1 under PER-01/JRN-01.2 — same content-policy story)* | JTBD-02.3 (context): alert content links to full explanation, never a bare date | R1 |
| Explain This Date Review: full breakdown of every contributing event, rule version, and reviewer decision | PER-02 | Epic 29 (F29) | US-29.1 | JTBD-02.1: Given a Speedy Trial date is in question, when the judge opens "explain this date," then every contributing event, rule version, and reviewer decision is displayed with source links | R1 |
| Explain This Date Review: compares the current calculation against a prior version to see exactly what changed | PER-02 | Epic 32 (F32) | US-32.1 | JTBD-02.1 (context, extension): a recalculation is understandable rather than opaque, with override rationale displayed inline alongside the diff | R2 |
| Motion Filed — Candidate Exclusion Review: candidate exclusions generated and explicitly linked to source event and rule version | PER-02 | Epic 28 (F28) | US-28.1, US-28.2 | JTBD-02.2 (context): judge reviews well-formed candidates, each traceable to its triggering event and rule package, never a black box | R1 |
| Motion Filed — Candidate Exclusion Review: judge explicitly accepts, modifies, or rejects with documented rationale | PER-02 | Epic 30 (F30) | US-30.1, US-30.2 | JTBD-02.2: judge remains the final legal authority on every exclusion; overrides require mandatory, documented rationale | R1 |
| Continuance Findings Flagged: incomplete continuance records routed to chambers review before reliance | PER-02 (Ana) | Epic 33 (F33) | US-33.1, US-33.2 | JTBD-02.2: continuance records missing required findings or order references route to chambers' review queue before being relied upon | R3 |
| Continuance Findings Flagged: task cannot be dismissed without a captured rationale and audit reference | PER-02 | Epic 6 (F6) | US-6.2 | JTBD-02.2 (context): no legally significant task can be quietly dismissed without an audit trace | R1 |
| Status Conference Preparation: single-screen summary of clock state, pending motions, continuance history | PER-02 (Ana) | Epic 35 (F35) | US-35.1, US-35.2 | JTBD-02.4: Given a scheduled status conference, when chambers opens the case conference view, then clock state, pending motions, and continuance history are presented on one screen | R2 |
| Status Conference Preparation: filters the case timeline and deep-links into underlying detail | PER-02 | Epic 8 (F8) | US-8.2 | JTBD-02.4 (context): Ana prepares materials from one consolidated, filterable chronology instead of manual docket excerpts | R1 |
| Trial Setting / Disposition Confirmation: confirms status referencing the explained calculation with full version history | PER-02 | Epic 29 (F29) | US-29.2, US-29.3 | JTBD-02.1: zero instances of a prior approved calculation being silently overwritten rather than versioned | R1 |
| Trial Setting / Disposition Confirmation: co-defendant clocks remain independently calculated and clearly separated | PER-02 | Epic 34 (F34) | US-34.1, US-34.2 | JTBD-02.1 (via Journey-to-JTBD traceability): multi-defendant clocks remain independently calculated and clearly separated, never collapsed into one misleading result | R3 |
### PER-03: David Okafor — JRN-03.1: Criminal Case Monitoring: Speedy Trial — Clerk Lifecycle

| Activity | Persona | Epic | Stories | NaC | Release |
|----------|---------|------|---------|-----|---------|
| Tracker Opened: CM/ECF arraignment event auto-proposes a tracker with a candidate start context | PER-03 | Epic 26 (F26) | US-26.1, US-26.2 | JTBD-03.3 (context): automatic detection alone never reaches confirmed state — only an explicit reviewer confirmation does | R1 |
| Tracker Opened: defendant with case activity but no detected trigger is flagged, never silently uninitialized | PER-03 | Epic 26 (F26) | US-26.3 | JTBD-03.3 (via Journey-to-JTBD traceability): new case/defendant tracker setups are initialized without a missing-trigger incident discovered after the fact | R1 |
| Tracker Opened: CM/ECF updates apply only when no conflicting local edit exists | PER-03 | Epic 10 (F10) | US-10.1 | JTBD-04.3 (context, supporting David's setup confidence): CM/ECF remains the uncontested authoritative source; conflicts never silently overwrite | R1 |
| Motion Filed / Docket Event Ingested: events automatically matched to configured Speedy Trial categories | PER-03 | Epic 27 (F27) | US-27.1 | JTBD-03.2 (context): routine events don't require manual classification, shrinking the unmapped-event rate | R1 |
| Motion Filed / Docket Event Ingested: an unmapped event is flagged and routed to the exception queue with raw source preserved | PER-03 | Epic 27 (F27) | US-27.2 | JTBD-03.2 (via Journey-to-JTBD traceability): unmapped docket events in Speedy Trial ingestion drop to a low single-digit percentage of all ingested events | R1 |
| Continuance Requested: completeness check flags gaps before chambers' review queue | PER-03 | Epic 33 (F33) | *(see US-33.2 under PER-02/JRN-02.2 — same completeness-resolution story)* | JTBD-03.2 (via Journey-to-JTBD traceability): continuance completeness gaps route to the exception queue before reaching chambers' reliance | R3 |
| Continuance Requested: candidate exclusion routed for chambers review | PER-03 | Epic 28 (F28) | *(see US-28.1/US-28.2 under PER-02/JRN-02.2)* | JTBD-03.2 (context): David's completeness check determines whether chambers receives a clean record | R1 |
| Threshold Reached: role-scoped work queue surfaces the alert alongside chambers | PER-03 | Epic 6 (F6) | US-6.1 | JTBD-02.3 (context, shared clerk/chambers visibility): delivery and acknowledgment status are tracked, not just sent | R1 |
| Threshold Reached: unacknowledged alert escalates to a secondary recipient after a configured cadence | PER-03 | Epic 31 (F31) | US-31.2 | JTBD-02.3: 100% of cases crossing a configured threshold generate a delivered, acknowledged alert before the deadline is at risk | R1 |
| Portfolio Check Across Caseload: personal/court-level risk dashboard shows approaching thresholds and data gaps | PER-03 | Epic 36 (F36) | US-36.1, US-36.2 | JTBD-03.4 (via Journey-to-JTBD traceability): portfolio-wide risk (exceptions, custody backlog, closeout status) visible without case-by-case checks | R3 |
| Portfolio Check Across Caseload: cross-case exhibit operations portfolio and reusable court templates | PER-03 | Epic 25 (F25) | US-25.1, US-25.2 | JTBD-03.4 (context, exhibit side): David identifies every case with outstanding exceptions or custody backlog without opening cases individually | R4 |
| Trial or Disposition Closeout: final Speedy Trial status confirmed via chambers' confirmed calculation | PER-03 | Epic 29 (F29) | *(see US-29.2 under PER-02/JRN-02.2)* | JTBD-03.2 (context): a case closing with an unconfirmed calculation or unresolved exception creates downstream audit risk | R1 |
| Trial or Disposition Closeout: closeout gate surfaces any remaining open items before the case is marked resolved | PER-03 | Epic 7 (F7) | US-7.2 | JTBD-03.2: critical-severity exceptions are never auto-closed; unresolved items beyond a configured age escalate to a supervisory role | R1 |

---

### PER-03: David Okafor — JRN-03.2: Pretrial Exhibit Intake and Case Setup

| Activity | Persona | Epic | Stories | NaC | Release |
|----------|---------|------|---------|-----|---------|
| New Case Setup: creates/syncs the proceeding from CM/ECF, activates exhibit tracking | PER-03 | Epic 14 (F14) | US-14.1 | JTBD-03.3: case/proceeding creation or sync directly from CM/ECF; exhibit tracking unlocks only after proper setup | R1 |
| New Case Setup: configures numbering scheme and security designations for this case | PER-03 | Epic 14 (F14) | US-14.2 | JTBD-03.3 (via Journey-to-JTBD traceability): new case/proceeding/tracker setups complete correctly the first time, with no missing-trigger surprises | R1 |
| Attorney Submission Received: structured exhibit list intake with optional file, malware-scanned | PER-03 | Epic 15 (F15) | US-15.1, US-15.2 | JTBD-03.1 (via Journey-to-JTBD traceability): missing-metadata exceptions at pretrial intake drop to a low single-digit percentage of submissions | R1 |
| Attorney Submission Received: external attorney submits via the restricted portal, routed into standard intake | PER-03 | Epic 12 (F12) | US-12.1, US-12.2 | JTBD-03.1 (context, external channel): external submissions enter the same validation pipeline, never writing directly to the ledger | R2 |
| Exception Triage: David reviews flagged submissions in the shared, age-prioritized exception queue | PER-03 | Epic 7 (F7) | US-7.1, US-7.2 | JTBD-03.2: cross-module exception surfacing with aging indicators to prioritize oldest items; required rationale capture on every resolution | R1 |
| Exception Triage: accepts, rejects, or requests correction on each intake submission | PER-03 | Epic 15 (F15) | US-15.3 | JTBD-03.1 (context): only validated, deliberately-reviewed exhibits are promoted onto the ledger | R1 |
| Exception Triage: reviews external submissions through the identical internal queue, never self-acceptable | PER-03 | Epic 12 (F12) | US-12.3 | JTBD-03.1 (context, external): external submissions receive identical validation and oversight before entering the ledger | R2 |
| Exception Triage: classifies exhibit type (file reference, physical, demonstrative, contraband, special-storage) | PER-03 | Epic 23 (F23) | US-23.1 | JTBD-01.3 (context, extended to intake): downstream custody, storage, and jury-package eligibility rules apply correctly from intake onward | R3 |
| Exception Triage: operates the full clerk operations console in one place | PER-03 | Epic 11 (F11) | US-11.3 | JTBD-03.1/03.2 (context): console composes case setup, intake queue, exception queue, reconciliation actions, and portfolio dashboards from one place | R1 |
| Configuration Adjustment: fixes a recurring metadata gap directly via self-service configuration | PER-03 | Epic 3 (F3) | US-3.3 *(see also US-3.1 under PER-01/JRN-01.2)* | JTBD-03.5: configuration changes — numbering, thresholds, workflow states — are made by David directly, without filing an IT ticket | R1 |
| Clean Handoff to Courtroom: exhibit list confirmed clean and accepted on the shared ledger | PER-03 | Epic 16 (F16) | *(see US-16.1 under PER-01/JRN-01.1)* | JTBD-03.3 (context): one less thing the deputy has to discover the hard way at 9am | R1 |
| Clean Handoff to Courtroom: hand-off status visible on the case timeline ahead of Maria's pre-session load | PER-03 | Epic 8 (F8) | *(see US-8.1/US-8.2 under PER-02/JRN-02.2)* | JTBD-03.3 (context): clear hand-off status visible in Maria's pre-session checklist | R1 |
### PER-04: Priya Nandan — JRN-04.1: Investigating a Disputed Sealed-Record Access

| Activity | Persona | Epic | Stories | NaC | Release |
|----------|---------|------|---------|-----|---------|
| Dispute Reported: single audit explorer entry point scoped to the disputed object, via the admin dashboard | PER-04 | Epic 11 (F11) | US-11.4 | JTBD-04.2 (context): dashboard composes configuration, identity/role management, reporting feed, and adapter health from one place | R1 |
| Audit Explorer Query: filters and reconstructs full history by case, user, date range, object | PER-04 | Epic 2 (F2) | *(see US-2.1 under PER-01/JRN-01.2)* | JTBD-04.2: queries the tamper-evident audit explorer by case, user, date range, or object to produce a defensible, structured answer | R1 |
| Access Control Cross-Check: cross-references the access log against RBAC/ABAC scope at the time of access | PER-04 | Epic 0 (F0) | US-0.1, US-0.2, US-0.3 | JTBD-04.1: RBAC/ABAC scoping covers court/division/case/proceeding/party-role/security-designation; zero unauthorized access succeeds against sealed/restricted records | R1 |
| Rule-Version Linkage Review: confirms which sealing policy and judge authorization were in effect at the time | PER-04 | Epic 21 (F21) | *(see US-21.1/US-21.2 under PER-02/JRN-02.1)* | JTBD-04.4 (context): sensitive record handling is enforced via explicit policy configuration, confirmed under audit | R3 |
| Findings Delivered: structured, defensible findings report delivered via de-identified operational reporting | PER-04 | Epic 9 (F9) | US-9.1, US-9.2 | JTBD-04.2 (context, extended): a reusable, repeatable investigation pattern shortens every future response time, surfaced through role-limited reporting exports | R2 |

---

### PER-04: Priya Nandan — JRN-04.2: Governing a Privileged Configuration Change and CM/ECF Conflict

| Activity | Persona | Epic | Stories | NaC | Release |
|----------|---------|------|---------|-----|---------|
| Configuration Change Requested: separation-of-duties ensures David's routine role can request but not approve | PER-04 | Epic 3 (F3) | *(see US-3.2 under PER-03/JRN-03.2 via Lane PER-01/JRN-01.2)* | JTBD-04.5: requires a distinct second approver before a new rule-package version takes effect | R1 |
| CM/ECF Conflict Flagged: inbound docket update conflicting with a local record routes to Priya's review queue | PER-04 | Epic 10 (F10) | US-10.2 | JTBD-04.3 (via Journey-to-JTBD traceability): zero silent overwrites of CM/ECF docket data; all conflicts route to human review | R1 |
| CM/ECF Conflict Flagged: conflict appears in the shared Exception Queue, not a silent overwrite | PER-04 | Epic 7 (F7) | *(see US-7.1/US-7.2 under PER-03/JRN-03.2)* | JTBD-04.3 (context): a silent overwrite would be a serious integrity and compliance risk | R1 |
| Conflict Resolution: both versions reviewed, source lineage preserved on the authoritative docket side | PER-04 | Epic 10 (F10) | *(see US-10.1 under PER-03/JRN-03.1)* | JTBD-04.3 (context): source-identifier preservation on all imported records makes the resolution traceable and defensible after the fact | R1 |
| Configuration Change Approved: versioned, audit-logged, governed change process | PER-04 | Epic 3 (F3) | *(see US-3.2 under PER-03/JRN-03.2)* | JTBD-04.5: governed, versioned configuration changes carry a full audit trail | R1 |
| Verification via Audit Explorer: confirms both actions are fully attributed, versioned, and segregated | PER-04 | Epic 2 (F2) | *(see US-2.1 under PER-01/JRN-01.2)* | JTBD-04.5 (via Journey-to-JTBD traceability): privileged administrative actions remain fully segregated and auditable at all times | R1 |

---

### Cross-Cutting Platform Foundation & Scale Capabilities (No Dedicated Journey Touchpoint)

Six epics (F1, F5, F13, F37, F38, F39) have no stage explicitly named in JOURNEYS-JudicialSync.md's eight journeys. They are foundational/platform-wide or Scale-increment capabilities that underpin every persona's journey rather than appearing as a discrete step. (F23 and F32 are *not* included here — both already have dedicated journey-stage placements in the lane tables above: F23 under PER-01/JRN-01.1 "Custody Handoff" and PER-03/JRN-03.2 "Exception Triage"; F32 under PER-02/JRN-02.2 "Explain This Date Review.") Placed here per PER-04's cross-cutting platform-ownership role (per PERSONAS-JudicialSync.md: "Admin's access-control, audit, and CM/ECF integration decisions silently underpin every other persona's ability to trust the data they see").

| Activity | Persona | Epic | Stories | NaC | Release |
|----------|---------|------|---------|-----|---------|
| Establish the shared case/docket data model consumed by both domain modules | PER-03 (consumer) / PER-04 (owner) | Epic 1 (F1) | US-1.1, US-1.2, US-1.3 | JTBD-03.3 / JTBD-04.3 (extended): both modules read case/proceeding/party context exclusively through the shared case-context API — no module maintains a shadow copy, and source identifiers are never broken by local edits | R1 |
| Search across exhibits, trackers, and case objects respecting access scope | PER-03 | Epic 5 (F5) | US-5.1, US-5.2 | JTBD-04.1 (extended): sealed/restricted records never appear in search results for unauthorized users, not even as a placeholder hit | R1 |
| Enforce platform-wide security and compliance baseline (encryption, malware scanning, retention) | PER-04 | Epic 13 (F13) | US-13.1, US-13.2, US-13.3 | JTBD-04.4: encryption, malware scanning, approved file-type controls, and explicit policy-driven handling enforced platform-wide; zero unauthorized-access attempts succeed | R1 |
| Define the national configuration baseline and route out-of-scope local changes to governance review | PER-04 | Epic 37 (F37) | US-37.1, US-37.2 | JTBD-03.5 (extended nationally): local configuration changes are made directly within permitted override scope, with national core constraints never bypassed | R4 |
| View de-identified, cross-court trend analytics for AO program management | PER-04 | Epic 38 (F38) | US-38.1 | JTBD-03.4 (extended cross-court): portfolio-wide risk visibility extended to AO program management, never usable for judicial performance evaluation | R4 |
| Integrate broader courtroom display/streaming technology for authorized evidence | PER-01 / PER-02 | Epic 39 (F39) | US-39.1, US-39.2 | JTBD-02.5 (extended to hardware): sealed/restricted exhibits follow identical judge-authorization rules on courtroom display as in jury packages | R4 |
---

## NaC Derivation Table

Full traceability chain: **JTBD outcome → journey stage → NaC → story**. This table reproduces and extends the "Journey-to-JTBD Traceability" table from JOURNEYS-JudicialSync.md, adding the NaC text (from JTBD-JudicialSync.md's "NaC Preview" table) and the story(ies) that implement it.

| JTBD ID | Outcome | Journey Stage | NaC | Story |
|---------|---------|---------------|-----|-------|
| JTBD-01.1 | Deputy logs exhibit actions in real time with zero reversion to paper | JRN-01.1:Exhibit Offered | Given a live session, when the deputy logs an exhibit offer, then the action is captured and visible within a small number of seconds with no parallel paper log maintained | US-17.1 |
| JTBD-02.1 | Judge's ruling is explicitly attributed and visible to chambers live | JRN-01.1:Objection & Ruling Logged | An admit/reject transition must carry a ruling_actor_id attributed to the judge role for the proceeding — never defaulted or auto-inferred | US-16.3 |
| JTBD-01.2 | Ledger and source lists reconcile at every checkpoint with zero unresolved discrepancies at trial close | JRN-01.1:Recess Reconciliation | Given a recess/day-end/trial-close checkpoint, when reconciliation runs, then all discrepancies are either resolved with rationale or explicitly flagged open for the next checkpoint | US-18.1, US-18.2 |
| JTBD-01.3 | Every custody transfer is confirmed, with zero unacknowledged transfers beyond SLA | JRN-01.1:Custody Handoff | Given an exhibit custody transfer is recorded, when the recipient does not acknowledge within the court's SLA window, then an alert is generated automatically | US-20.1, US-20.2 |
| JTBD-01.4 | Certified exhibit export available in minutes rather than hours after session close | JRN-01.1:Trial Closeout | Given a session has ended, when the deputy requests a filtered export, then a certified exhibit list is produced without manual re-entry | US-19.1, US-19.2 |
| JTBD-01.3 | Zero custody transfers remain unacknowledged beyond the court's defined SLA | JRN-01.2:Unacknowledged Transfer Alert | An unacknowledged transfer beyond SLA raises CUSTODY_SLA_BREACH and fires an escalation alert to a supervisory role, never auto-completing the transfer | US-20.3, US-4.1 |
| JTBD-01.2 | Discrepancies are resolved with rationale or explicitly flagged open for the next checkpoint | JRN-01.2:End-of-Day Reconciliation Mismatch | A checkpoint completion attempt with unresolved high-severity discrepancies returns RECONCILE_UNRESOLVED_HIGH_SEVERITY unless a separately-rationale'd supervisory override is logged | US-18.3 |
| JTBD-03.2 | Recurring exception patterns are traced back to a configuration fix, not repeated one-off corrections | JRN-01.2:Clerk Reviews and Resolves | Exception resolution requires a non-empty rationale and feeds operational reporting so recurring patterns become visible for a root-cause configuration fix | US-3.1, US-7.1 |
| JTBD-02.1 | Every ruling is visibly and explicitly attributed to the judge, never auto-decided | JRN-02.1:Live Ruling on Objection | The deputy's action records "the judge ruled," never originates or infers the ruling content itself | US-16.3 |
| JTBD-02.5 | Sealing/release requires explicit judge authorization; every access attempt is logged | JRN-02.1:Mid-Trial Sealing Request | Sealing/release actions require authorizing_judge_id resolved to an actual judge role holder — a clerk cannot self-authorize | US-21.1 |
| JTBD-02.5 | Zero unauthorized-access attempts succeed against sealed/restricted exhibits he has authorized | JRN-02.1:Post-Trial Record Review | Every access attempt — successful or denied — against a sealed/restricted exhibit produces its own audit event, not merely an aggregate log line | US-21.2 |
| JTBD-02.3 | 100% of cases crossing a configured threshold generate a delivered, acknowledged alert before risk materializes | JRN-02.2:Threshold Alert Received | An alert is generated when the new calculation version's remaining time newly crosses a configured tier boundary; every alert includes a working deep link to explain-this-date | US-31.1 |
| JTBD-02.1 | Any Speedy Trial date is fully explainable within minutes, including in multi-defendant matters | JRN-02.2:Explain This Date Review | The explain-this-date view renders every timeline segment with contributing event, rule reference, period, review status, reviewing user, and reason | US-29.1 |
| JTBD-02.2 | Every candidate exclusion is explicitly accepted, modified, or rejected with documented rationale | JRN-02.2:Motion Filed — Candidate Exclusion Review | Accept adopts the proposed value as-is; modify/reject require mandatory rationale; a review action by an unentitled user is denied | US-30.1 |
| JTBD-02.2 | Incomplete continuance findings are caught before the calculation relies on them | JRN-02.2:Continuance Findings Flagged | A continuance record missing a populated findings reference or order document reference is flagged incomplete and routed to the chambers/judge review queue | US-33.1 |
| JTBD-02.4 | Chambers prepares for conferences from a single consolidated view, no manual reconstruction | JRN-02.2:Status Conference Preparation | The case conference view assembles the current calculation summary, all unreviewed candidate exclusions, continuance history, and open issues on one screen | US-35.1 |
| JTBD-02.1 | Multi-defendant clocks remain independently calculated and clearly separated | JRN-02.2:Trial Setting / Disposition Confirmation | Each defendant party receives their own independent tracker; no case-level summary view may present a single collapsed status without per-defendant breakdown | US-34.1 |
| JTBD-03.3 | New case/defendant tracker setups are initialized without a missing-trigger incident discovered after the fact | JRN-03.1:Tracker Opened | A defendant with case activity but no matching trigger event raises a missing_trigger_event exception rather than leaving no tracker or guessing a start date | US-26.3 |
| JTBD-03.2 | Unmapped docket events in Speedy Trial ingestion drop to a low single-digit percentage of all ingested events | JRN-03.1:Motion Filed / Docket Event Ingested | An event with no matching mapping rule is flagged unmapped and routed to the Exception Queue with the raw source code/description preserved | US-27.2 |
| JTBD-03.2 | Continuance completeness gaps route to the exception queue before reaching chambers' reliance | JRN-03.1:Continuance Requested | If this is missing a required finding, David would rather catch it now than have chambers catch it at conference — structured completeness check flags gaps automatically | US-33.2 |
| JTBD-03.4 | Portfolio-wide risk (exceptions, custody backlog, closeout status) visible without case-by-case checks | JRN-03.1:Portfolio Check Across Caseload | Risk indicators highlight approaching thresholds and data gaps across the whole caseload in one screen, refreshing on a near-real-time basis | US-36.1, US-25.1 |
| JTBD-03.1 | Missing-metadata exceptions at pretrial intake drop to a low single-digit percentage of submissions | JRN-03.2:Attorney Submission Received | Required fields must be present; missing fields route to the Exception Queue rather than silent rejection | US-15.1, US-15.2 |
| JTBD-03.3 | New case/proceeding/tracker setups complete correctly the first time, with no missing-trigger surprises | JRN-03.2:New Case Setup | CM/ECF sync pre-populates parties and case data so David is only configuring what's actually local; numbering scheme must be an active, published scheme | US-14.1, US-14.2 |
| JTBD-03.5 | Local configuration changes are made directly by clerk staff, with zero IT tickets required | JRN-03.2:Configuration Adjustment | Draft configuration is validated before publish; configuration edits require config_admin entitlement, distinct from routine operational roles — no deployment required | US-3.3 |
| JTBD-04.2 | 100% of material actions across both modules are captured in a tamper-evident audit trail | JRN-04.1:Audit Explorer Query | Audit Explorer supports filtering by case_id, user_id, date_range, object_type; audit read access requires a distinct audit_reader entitlement | US-2.1 |
| JTBD-04.1 | Access is enforced by role/attribute scope; zero unauthorized access succeeds against sealed records | JRN-04.1:Access Control Cross-Check | Access to a case/proceeding/exhibit/tracker bearing a security designation requires an explicit additional entitlement beyond the base role | US-0.2 |
| JTBD-04.4 | Sensitive record handling is enforced via explicit policy configuration, confirmed under audit | JRN-04.1:Rule-Version Linkage Review | Audit entries link directly to the rule package or authorization version in effect at the time of the action | US-21.2 |
| JTBD-04.3 | Zero silent overwrites of CM/ECF docket data; all conflicts route to human review | JRN-04.2:CM/ECF Conflict Flagged | When the current value was locally modified, the adapter creates a Sync Conflict exception for human review instead of auto-overwriting | US-10.1, US-10.2 |
| JTBD-04.5 | Privileged administrative actions remain fully segregated and auditable at all times | JRN-04.2:Configuration Change Approved | The same user who drafted a configuration change cannot also publish it; publishing creates a new immutable rule_package_version with both drafter and approver identities logged | US-3.2 |

### NaC for Stories Without a Dedicated Journey Stage (Cross-Cutting / Scale)

These NaC are derived by reasonable extension of the nearest JTBD outcome, since F1, F5, F13, F32, F37, F38, F39 (and F23's intake half) have no explicit stage in JOURNEYS-JudicialSync.md. Flagged in Coverage Analysis as an extension rather than a direct journey-stage derivation.

| JTBD ID | Outcome (nearest fit) | Extended Context | NaC | Story |
|---------|------------------------|------------------|-----|-------|
| JTBD-03.3 / JTBD-04.3 | Correct setup; CM/ECF authoritative source discipline | Shared case/docket data model (F1), foundational to all journeys | Both domain modules read case/proceeding/party context exclusively through the shared case-context API — no module maintains a shadow copy | US-1.1, US-1.2, US-1.3 |
| JTBD-04.1 | Zero unauthorized access to sealed records | Search service (F5) must respect the same access scope as direct record access | Unauthorized sealed/restricted records produce zero hits — no "restricted result" placeholder is ever shown | US-5.1, US-5.2 |
| JTBD-04.4 | Sensitive records protected by enforced policy | Platform security baseline (F13) is the enforcement layer underneath F21/sealed-record handling | No file is persisted until malware scanning completes successfully; a failed scan returns an explicit reason, never silent acceptance | US-13.1, US-13.2, US-13.3 |
| JTBD-02.1 | Any date explainable within minutes | Calculation version comparison (F32) extends explain-this-date with a "what changed" diff | Comparison performs a structured diff over segments — additions, removals, modifications — each attributed to a specific change driver | US-32.1 |
| JTBD-03.5 | Zero IT tickets for routine configuration | Extended nationally: cross-court governance (F37) distinguishes national-locked fields from court-overridable ones | A court/division can never directly modify a field designated non-overridable at the national level; attempts are rejected at the API layer | US-37.1, US-37.2 |
| JTBD-03.4 | Portfolio risk visible without per-case checks | Extended cross-court: advanced analytics (F38) for AO program management | No individual case, defendant, or named exhibit may appear in any advanced analytics output — strictly aggregate-only, no drill-through | US-38.1 |
| JTBD-02.5 | Zero unauthorized sealed-record access | Extended to courtroom display hardware (F39) | Sealed/restricted exhibits follow identical inclusion rules as jury packages — excluded by default, requiring the same explicit per-instance judge authorization | US-39.1, US-39.2 |
---

## Release Planning

### Release R1: Foundation + Operational MVP (P0 — 23 features, 59 stories)

**Theme:** Shared platform foundation plus the core real-time courtroom logging and Speedy Trial calculation loop. Matches the vision document's "Foundation" + "Operational MVP" build-sequence increments (PROJECT.md). This is the smallest release in which both Maria and Judge Hale can complete a full trial day, and David/Priya can run a full Speedy Trial clerk/governance lifecycle, end to end.

**Stories:**
- **Shared platform:** US-0.1, US-0.2, US-0.3 (F0 Identity/Access); US-1.1, US-1.2, US-1.3 (F1 Case/Docket Model); US-2.1, US-2.2, US-2.3 (F2 Audit Trail); US-3.1, US-3.2, US-3.3 (F3 Configuration Engine); US-4.1, US-4.2 (F4 Notifications); US-5.1, US-5.2 (F5 Search); US-6.1, US-6.2 (F6 Work Queue); US-7.1, US-7.2 (F7 Exception Queue); US-8.1, US-8.2 (F8 Case Timeline); US-10.1, US-10.2 (F10 CM/ECF Adapter); US-11.1, US-11.2, US-11.3, US-11.4 (F11 Role-Specific UI); US-13.1, US-13.2, US-13.3 (F13 Security Baseline)
- **Evidentiary Tracking MVP:** US-14.1, US-14.2 (F14 Setup); US-15.1, US-15.2, US-15.3 (F15 Intake); US-16.1, US-16.2, US-16.3 (F16 Ledger); US-17.1, US-17.2, US-17.3 (F17 Courtroom Logging); US-18.1, US-18.2, US-18.3 (F18 Reconciliation)
- **Speedy Trial MVP:** US-26.1, US-26.2, US-26.3 (F26 Tracker Init); US-27.1, US-27.2 (F27 Event Mapping); US-28.1, US-28.2 (F28 Candidate Exclusion); US-29.1, US-29.2, US-29.3 (F29 Calculation/Explainability); US-30.1, US-30.2 (F30 Review/Approval); US-31.1, US-31.2 (F31 Threshold Alerts)

**Personas Served:** PER-01, PER-02, PER-03, PER-04 (all four fully served)

**JTBD Addressed:** JTBD-01.1, JTBD-01.2 (partial — custody/export detail lands R2/R3), JTBD-02.1, JTBD-02.2, JTBD-02.3, JTBD-03.1, JTBD-03.2, JTBD-03.3, JTBD-03.5, JTBD-04.1, JTBD-04.2, JTBD-04.3, JTBD-04.4, JTBD-04.5 (partial — portal-boundary half lands R2)

**Acceptance Gate:**
- [ ] All NaC for included stories pass (see NaC Derivation Table and NaC-to-AC Mapping)
- [ ] Maria can complete a full trial day end-to-end: pre-session setup → real-time logging → recess reconciliation → certified export is deferred to R2 (US-19.x), so R1's gate is "zero reversion to paper" + "zero unresolved discrepancies at session close," not yet the certified-export artifact
- [ ] Judge Hale can open "explain this date," review/approve a candidate exclusion, and receive a threshold alert fully end-to-end without using a sealed-exhibit or multi-defendant flow (those are R3)
- [ ] David can set up a case, process intake, resolve exceptions, and initialize/track a Speedy Trial tracker without portfolio dashboards (R3/R4) or external-portal intake (R2)
- [ ] Priya can enforce access control, investigate via the audit explorer, and govern a privileged configuration/CM/ECF conflict end-to-end
- [ ] No feature in this release auto-finalizes a ruling, exclusion, override, or final Speedy Trial status — every such action requires explicit human approval (binding constraint, verified against US-16.3, US-26.2, US-29.3, US-30.1, US-30.2)
### Release R2: MVP-Adjacent Completion (P1 — 5 features, 10 stories)

**Theme:** Rounds out the R1 MVP with the capabilities needed for a *credible* pilot but not strictly blocking the core loop: basic certified exhibit export/closeout, the external attorney portal, calculation version comparison, operational reporting, and chambers' case conference view. Matches PRD's "P1 — High, MVP-adjacent" tier.

**Stories:**
- US-9.1, US-9.2 (F9 Operational Reporting Feed)
- US-12.1, US-12.2, US-12.3 (F12 Restricted External Attorney Portal)
- US-19.1, US-19.2 (F19 Exportable Exhibit List and Basic Closeout)
- US-32.1 (F32 Calculation Version History / "What Changed")
- US-35.1, US-35.2 (F35 Case Conference View)

**Personas Served:** PER-01 (certified export), PER-02 (version comparison + conference view), PER-03 (external portal intake), PER-04 (operational reporting)

**JTBD Addressed:** JTBD-01.4 (certified export in minutes), JTBD-02.1 (extended — "what changed" explainability), JTBD-02.4 (conference-ready case view), JTBD-03.1 (external-channel intake discipline)

**Acceptance Gate:**
- [ ] All NaC for included stories pass
- [ ] Maria's trial-closeout journey now produces a one-click certified interim export (US-19.1/19.2) without re-typing — completes the JRN-01.1 "Trial Closeout" stage that R1 left partial
- [ ] Ana can generate a pre-conference review packet from the case conference view (US-35.1/35.2) without manual docket reconstruction — completes JRN-02.2's "Status Conference Preparation" stage
- [ ] An authorized external attorney can submit structured exhibit metadata and view read-only Speedy Trial summaries without any write access to the official ledger or docket (US-12.1/12.2), and David reviews those submissions through the identical internal queue (US-12.3)
- [ ] Judge Hale can see a structured diff of what changed between two calculation versions, with override rationale displayed inline (US-32.1)
- [ ] Release extends journey depth without breaking any R1 flow — no R1 story's acceptance criteria regress
### Release R3: Pilot Hardening (P2 — 8 features, 17 stories)

**Theme:** Capabilities required before broader rollout beyond the initial pilot district(s): custody transfer tracking, judge-authorized sealing, jury review package assembly, physical/digital exhibit distinction, the full appeal-ready closeout package, continuance findings check, multi-defendant separation, and the Speedy Trial portfolio dashboard. Matches the vision document's "Pilot hardening" build-sequence increment and PRD's P2 tier.

**Stories:**
- US-20.1, US-20.2, US-20.3 (F20 Custody and Location Tracking)
- US-21.1, US-21.2 (F21 Sealing and Restricted Exhibit Handling)
- US-22.1, US-22.2 (F22 Jury Review Package Assembly)
- US-23.1, US-23.2 (F23 Physical and Digital Exhibit Distinction)
- US-24.1, US-24.2 (F24 Post-Trial Closeout, Full)
- US-33.1, US-33.2 (F33 Continuance Findings Check)
- US-34.1, US-34.2 (F34 Multi-Defendant Separation)
- US-36.1, US-36.2 (F36 Speedy Trial Portfolio Dashboard)

**Personas Served:** PER-01 (custody, jury package, full closeout, exhibit typing), PER-02 (sealing authorization, continuance findings, multi-defendant clocks, personal risk dashboard), PER-03 (type-specific intake rules, court-level risk dashboard), PER-04 (sealed-access audit linkage)

**JTBD Addressed:** JTBD-01.3 (custody transfer confirmation), JTBD-02.2 (continuance findings completeness, extended), JTBD-02.5 (authorized sealing and access oversight), JTBD-03.4 (portfolio-level visibility, Speedy Trial side)

**Acceptance Gate:**
- [ ] All NaC for included stories pass
- [ ] Maria can complete the full JRN-01.1 journey with zero gaps: custody handoff with recipient acknowledgment, jury package assembly excluding sealed/rejected items, and a full appeal-ready closeout package — no stage of JRN-01.1 remains partially implemented after this release
- [ ] Judge Hale can personally authorize sealing/release of a sensitive exhibit and review the sealed-access log (completing JRN-02.1 end-to-end); continuance records missing findings are flagged before chambers relies on them; multi-defendant matters maintain clearly separated, independently reviewable clocks (completing JRN-02.2 end-to-end)
- [ ] David can classify exhibit type at intake with type-specific custody enforcement, and view the Speedy Trial portfolio dashboard alongside the exhibit portfolio view (R4) to prioritize his full caseload
- [ ] No sealed exhibit is ever included in a jury package or courtroom display without the same judge's explicit, per-instance authorization (cross-checked against US-21.1, US-22.1)
- [ ] Release extends journey depth without breaking any R1/R2 flow
### Release R4: Scale (P3 — 4 features, 7 stories)

**Theme:** Later-increment capabilities supporting national/cross-court maturity — exhibit portfolio dashboard and reusable court templates, cross-court governance and national configuration, advanced cross-court analytics, and broader courtroom technology integration. Matches the vision document's "Scale" build-sequence increment and PRD's P3 tier. None of these stories are required for a single-district pilot to succeed.

**Stories:**
- US-25.1, US-25.2 (F25 Exhibit Portfolio Dashboard and Court Templates)
- US-37.1, US-37.2 (F37 Cross-Court Governance and National Configuration)
- US-38.1 (F38 Advanced Analytics)
- US-39.1, US-39.2 (F39 Broader Courtroom Technology Integration)

**Personas Served:** PER-03 (exhibit portfolio view, court templates), PER-04 (national governance, cross-court analytics, courtroom tech integration monitoring), PER-01/PER-02 (indirect beneficiaries of courtroom display integration)

**JTBD Addressed:** JTBD-03.4 (extended cross-court, exhibit side), JTBD-03.5 (extended to national governance), JTBD-02.5 (extended to courtroom hardware)

**Acceptance Gate:**
- [ ] All NaC for included stories pass
- [ ] David's full caseload portfolio view now covers exhibit operations (open exceptions, custody backlog, closeout status) in addition to the Speedy Trial dashboard delivered in R3 — completing JRN-03.1's "Portfolio Check Across Caseload" stage across both modules
- [ ] A new court can be onboarded from a versioned, immutable template without per-court code forks (US-25.2)
- [ ] Priya can define and enforce a national configuration baseline distinguishing locked fields from court-overridable ones, with governance-review routing for out-of-scope requests (US-37.1/37.2)
- [ ] AO program management can view de-identified, aggregate-only cross-court trend analytics with no drill-through to individual cases or defendants, and no metric functions as a judicial-performance proxy (US-38.1)
- [ ] Courtroom display/streaming sessions never expose content beyond the specific judge-authorized exhibit(s), with unregistered hardware endpoints rejected and logged (US-39.1/39.2)
- [ ] Release extends journey depth and national scale without breaking any R1–R3 flow
---

## Coverage Analysis

### Persona Coverage

| Persona | R1 (P0) | R2 (P1) | R3 (P2) | R4 (P3) |
|---------|---------|---------|---------|---------|
| PER-01 (Maria Santos) | US-4.1, US-4.2, US-11.2, US-16.1, US-16.2, US-16.3, US-17.1, US-17.2, US-17.3, US-18.1, US-18.2, US-18.3 | US-19.1, US-19.2 | US-20.1, US-20.2, US-20.3, US-21.1 (via judge auth), US-22.1, US-22.2, US-23.2, US-24.1, US-24.2 | US-39.1, US-39.2 (indirect beneficiary) |
| PER-02 (Judge Hale / Ana Ibarra) | US-6.2, US-8.1, US-8.2, US-11.1, US-16.3 (ruling), US-28.1, US-28.2, US-29.1, US-29.2, US-29.3, US-30.1, US-30.2, US-31.1 | US-32.1, US-35.1, US-35.2 | US-21.1, US-21.2, US-33.1, US-33.2, US-34.1, US-34.2, US-36.1 | US-39.1, US-39.2 |
| PER-03 (David Okafor) | US-1.1–1.3 (consumer), US-3.1, US-3.3, US-6.1, US-7.1, US-7.2, US-10.1, US-11.3, US-14.1, US-14.2, US-15.1, US-15.2, US-15.3, US-26.1, US-26.3, US-27.1, US-27.2, US-31.2 | US-12.1, US-12.2, US-12.3 | US-23.1, US-33.2, US-36.1, US-36.2 | US-25.1, US-25.2 |
| PER-04 (Priya Nandan) | US-0.1, US-0.2, US-0.3, US-1.1–1.3 (owner), US-2.1, US-2.2, US-2.3, US-3.2, US-5.1, US-5.2, US-10.2, US-11.4, US-13.1, US-13.2, US-13.3 | US-9.1, US-9.2 | US-21.2, US-36.2 | US-37.1, US-37.2, US-38.1, US-39.2 |

Every persona has at least one fully completable journey within R1 alone (per the R1 Acceptance Gate), satisfying the "each release enables at least one complete journey" requirement.

### JTBD Coverage

| JTBD ID | Release | Stories | NaC Count |
|---------|---------|---------|-----------|
| JTBD-01.1 | R1 | US-17.1, US-17.2, US-16.3, US-11.2 | 4 |
| JTBD-01.2 | R1 | US-18.1, US-18.2, US-18.3, US-17.3 | 4 |
| JTBD-01.3 | R3 | US-20.1, US-20.2, US-20.3, US-23.2 (R1 alert half: US-4.1, US-4.2) | 5 |
| JTBD-01.4 | R2 | US-19.1, US-19.2 (R3 extension: US-24.1, US-24.2) | 4 |
| JTBD-02.1 | R1 | US-16.3, US-29.1, US-29.2, US-29.3 (R2 extension: US-32.1; R3 extension: US-34.1, US-34.2) | 7 |
| JTBD-02.2 | R1 | US-28.1, US-28.2, US-30.1, US-30.2 (R3 extension: US-33.1, US-33.2) | 6 |
| JTBD-02.3 | R1 | US-31.1, US-31.2, US-4.1, US-6.1 | 4 |
| JTBD-02.4 | R2 | US-35.1, US-35.2, US-8.1, US-8.2 | 4 |
| JTBD-02.5 | R3 | US-21.1, US-21.2, US-22.1, US-22.2 (R4 extension: US-39.1, US-39.2) | 6 |
| JTBD-03.1 | R1 | US-15.1, US-15.2, US-15.3 (R2 extension: US-12.1, US-12.2, US-12.3) | 6 |
| JTBD-03.2 | R1 | US-27.1, US-27.2, US-7.1, US-7.2, US-3.1 | 5 |
| JTBD-03.3 | R1 | US-14.1, US-14.2, US-26.1, US-26.2, US-26.3 | 5 |
| JTBD-03.4 | R3 | US-36.1, US-36.2 (R4 extension: US-25.1, US-25.2, US-38.1) | 5 |
| JTBD-03.5 | R1 | US-3.3 (R4 extension: US-37.1, US-37.2) | 3 |
| JTBD-04.1 | R1 | US-0.2, US-0.1, US-0.3, US-5.1, US-5.2 | 5 |
| JTBD-04.2 | R1 | US-2.1, US-2.2, US-2.3 | 3 |
| JTBD-04.3 | R1 | US-10.1, US-10.2, US-1.3 | 3 |
| JTBD-04.4 | R1 | US-13.1, US-13.2, US-13.3, US-21.2 | 4 |
| JTBD-04.5 | R1 | US-3.2, US-0.3 | 2 |

### Gap Analysis

- **No JTBD outcome is left entirely without a derived NaC** — all 19 JTBD IDs appear in the NaC Derivation Table (02-nac-derivation.md) or the NaC Coverage table above.
- **No persona lacks a release** — every persona has R1 stories and a completable R1 journey per the R1 Acceptance Gate.
- **No journey stage lacks feature coverage** — all 46 stage rows across the 8 journeys in JOURNEYS-JudicialSync.md have at least one mapped story in the Story Map Matrix.
- **Orphan stories relative to journey stages (flagged, not unmapped):** Six epics — F1 (US-1.1–1.3), F5 (US-5.1–5.2), F13 (US-13.1–13.3), F37 (US-37.1–37.2), F38 (US-38.1), F39 (US-39.1–39.2) — have no stage explicitly named in any of the eight journeys. These 13 stories are foundational/platform-wide or Scale-increment capabilities placed in the **Cross-Cutting Platform Foundation & Scale** lane (01d-matrix-per04-crosscutting.md) with NaC derived by extension rather than direct journey-stage traceability. (F23 and F32 are *not* orphans — both are placed directly in named journey-stage rows: F23 under JRN-01.1/JRN-03.2, F32 under JRN-02.2 — so they count toward the 80 directly-traced stories below, not this 13.) This is an explicit gap in JOURNEYS-JudicialSync.md's scenario coverage, not a gap in UserStories mapping — **recommend a follow-up journey-generation pass covering a "platform onboarding" or "national rollout" scenario for PER-04 if these capabilities need stage-level validation ahead of Release R4.**
- **JTBD-02.5 and JTBD-01.3 show their "zero unauthorized access" / "zero unacknowledged transfer" outcomes split across two releases (R1 partial + R3/R4 full).** This is intentional build-sequencing (alerting infrastructure ships R1; the sealing/custody domain logic it protects ships R3) but should be called out to stakeholders so a pilot demo doesn't imply full JTBD-01.3/JTBD-02.5 satisfaction before R3 ships.
- **No story exists with zero JTBD/NaC traceability** — all 93 stories trace to at least one JTBD outcome, either directly (80 stories via journey-stage traceability) or by reasonable extension (13 stories in the Cross-Cutting lane).
---

## NaC-to-Acceptance Criteria Mapping

Verifies each NaC derived above is actually testable against the corresponding UserStory's acceptance criteria in UserStories-JudicialSync.md (not merely plausible-sounding).

| NaC | Story | AC from UserStories | Aligned? |
|-----|-------|----------------------|----------|
| JTBD-01.1: action captured within a small number of seconds, no parallel paper log | US-17.1 | "Logging a single offer/objection/ruling cycle is completable in a bounded number of UI interactions (target: ≤3 actions)"; "Every action is operable fully via keyboard shortcuts" | Yes |
| JTBD-02.1: judge's ruling explicitly attributed, never auto-decided | US-16.3 | "An admit/reject transition must carry a ruling_actor_id attributed to a user holding the judge role... never defaulted or auto-inferred"; "A ruling attempted without judge attribution returns LEDGER_RULING_ACTOR_REQUIRED (422)" | Yes |
| JTBD-01.2: discrepancies resolved with rationale or flagged open | US-18.1, US-18.2 | "Each field-by-field or status mismatch generates a discrepancy record with all conflicting values preserved"; "A resolution submitted without rationale returns RECONCILE_RATIONALE_REQUIRED (422)" | Yes |
| JTBD-01.3: custody transfer confirmed with recipient acknowledgment | US-20.1, US-20.2 | "Transfer record enters pending state and triggers notification to the designated recipient"; "No auto-acknowledgment occurs on timeout — only explicit acknowledgment completes a transfer" | Yes |
| JTBD-01.4: certified export in minutes, no re-typing | US-19.1, US-19.2 | "Export supports filtering by status... generates a structured artifact... without re-typing anything"; "Certification is a distinct confirmation action... retains a snapshot reference" | Yes |
| JTBD-01.3: unacknowledged transfer escalates automatically | US-20.3, US-4.1 | "A transfer unacknowledged beyond the configured SLA raises CUSTODY_SLA_BREACH and fires an escalation alert"; "Notification body/preview text never contains... defendant-identifying detail" | Yes |
| JTBD-01.2: checkpoint blocked while high-severity discrepancies remain open | US-18.3 | "A checkpoint completion attempt with unresolved high-severity discrepancies returns RECONCILE_UNRESOLVED_HIGH_SEVERITY (409)"; "A non-supervisory role attempting the override returns RECONCILE_OVERRIDE_DENIED (403)" | Yes |
| JTBD-03.2: recurring patterns traced to a configuration fix | US-3.1, US-7.1 | "Configuration edits require config_admin entitlement"; "Resolution and rationale are logged as an audit event, and the exception's age-at-resolution feeds operational reporting" | Yes |
| JTBD-02.5: sealing requires explicit judge authorization | US-21.1 | "Sealing/release actions require authorizing_judge_id resolved to an actual judge role holder for the proceeding — a clerk cannot self-authorize, returning SEAL_AUTHORIZATION_DENIED (403)" | Yes |
| JTBD-02.5: every access attempt logged | US-21.2 | "Every access attempt — successful or denied — against a sealed/restricted exhibit produces its own audit event, not merely an aggregate log line" | Yes |
| JTBD-02.3: alert delivered and tracked to acknowledgment, linked to full explanation | US-31.1 | "Every alert includes a working deep link to the explain-this-date view; an alert lacking this linkage is treated as a system defect (ALERT_MISSING_CONTEXT, 500)" | Yes |
| JTBD-02.1: full breakdown of every contributing segment | US-29.1 | "The explain-this-date view renders every timeline segment with contributing event, rule reference, period, review status, reviewing user, and reason/rationale" | Yes |
| JTBD-02.2: explicit accept/modify/reject with documented rationale | US-30.1 | "Accept adopts the proposed value as-is... Modify requires a mandatory rationale... Reject requires a mandatory rationale"; "modify/reject without rationale returns REVIEW_RATIONALE_REQUIRED (422)" | Yes |
| JTBD-02.2: incomplete findings flagged before reliance | US-33.1 | "A continuance-categorized event or linked exclusion missing a populated findings reference or order document reference is flagged incomplete and routed to the chambers/judge review queue" | Yes |
| JTBD-02.4: single-screen conference summary | US-35.1 | "View assembles the current calculation version summary, all unreviewed candidate exclusions, continuance history with completeness flags, and open issues... relevant to the tracker" | Yes |
| JTBD-02.1 (multi-defendant extension): clocks remain independently calculated and separated | US-34.1 | "Each defendant party receives their own independent tracker... the system never creates a single shared tracker across defendants... returning MULTIDEF_SHARED_TRACKER_DENIED (422)" | Yes |
| JTBD-03.3: missing-trigger incidents caught, not discovered after the fact | US-26.3 | "A defendant with case activity but no matching trigger event raises a missing_trigger_event exception (TRACKER_MISSING_TRIGGER) rather than leaving no tracker or guessing a start date" | Yes |
| JTBD-03.2: unmapped events routed with raw source preserved | US-27.2 | "An event with no matching mapping rule is flagged unmapped and routed to the Exception Queue with the raw source code/description preserved (EVENT_UNMAPPED)" | Yes |
| JTBD-03.4: portfolio-wide risk visible without case-by-case checks | US-36.1 | "Risk indicators include approaching-threshold, data-gap, unreviewed-exclusion, and stale-calculation categories"; "Dashboard refreshes on a near-real-time basis" | Yes |
| JTBD-03.1: missing metadata routed to exception queue, not silently rejected | US-15.1 | "Required fields... must be present; missing fields route to the Exception Queue rather than silent rejection, via INTAKE_MISSING_METADATA (422)" | Yes |
| JTBD-03.3: CM/ECF-synchronized setup, no missing-trigger surprises | US-14.1 | "A case must have at least one proceeding before exhibit tracking can be activated"; "Re-running setup on an already-active case is idempotent" | Yes |
| JTBD-03.5: configuration changes direct, no IT ticket, versioned | US-3.3 | "Threshold tiers must be non-negative and contiguous/non-overlapping... Every threshold/mapping change is versioned and audit-logged" | Yes |
| JTBD-04.2: tamper-evident audit explorer, filterable, access-separated | US-2.1 | "Audit Explorer supports filtering by case_id, user_id, date_range, and object_type"; "Audit read access requires a distinct audit_reader entitlement, never implied by operational edit roles" | Yes |
| JTBD-04.1: scope precisely to role/attribute, zero unauthorized access | US-0.2 | "Access to a case/proceeding/exhibit/tracker bearing a security designation... requires an explicit additional entitlement beyond the base role"; "Insufficient scope... returns AUTH_SCOPE_DENIED (403) rather than partial data" | Yes |
| JTBD-04.4: sensitive handling via policy, linked to audit | US-21.2 | "Every access attempt... against a sealed/restricted exhibit produces its own audit event" (linkage to F13 policy enforcement confirmed via US-13.1 malware/encryption controls) | Yes |
| JTBD-04.3: conflicts route to human review, never silently overwritten | US-10.1 | "When the current value was locally modified, the adapter creates a Sync Conflict exception for human review instead of auto-overwriting, returning CMECF_SYNC_CONFLICT (409)" | Yes |
| JTBD-04.5: privileged actions segregated, second approver required | US-3.2 | "The same user who drafted a configuration change cannot also publish it; attempting to do so returns CONFIG_SOD_VIOLATION (403)"; "Every configuration change is logged... with both drafter and approver identities" | Yes |
| JTBD-04.1 (extended): sealed/restricted records never appear in search | US-5.2 | "Unauthorized sealed/restricted records produce zero hits — no 'restricted result' placeholder is ever shown" | Yes |
| JTBD-04.4 (extended): malware scanning and encryption enforced platform-wide | US-13.1 | "No file is persisted until malware scanning completes successfully; a failed scan returns SECURITY_MALWARE_DETECTED (422)... never silent acceptance" | Yes |
| JTBD-02.1 (extended): recalculation diff understandable, not opaque | US-32.1 | "Comparison performs a structured diff over segments: additions, removals, and modifications, each attributed to a specific change driver" | Yes |
| JTBD-03.5 (extended nationally): locked fields never bypassed | US-37.1 | "A court/division can never directly modify a field designated non-overridable at the national level; any such attempt is rejected at the API layer, not merely flagged after the fact" | Yes |
| JTBD-03.4 (extended cross-court): aggregate-only, no drill-through | US-38.1 | "No individual case, defendant, or named exhibit may appear in any advanced analytics output... this surface is strictly aggregate-only with no drill-through" | Yes |
| JTBD-02.5 (extended to hardware): sealed items excluded from courtroom display by default | US-39.1 | "Sealed/restricted exhibits follow identical inclusion rules as jury packages — excluded by default, requiring the same explicit per-instance judge authorization... returning COURTTECH_SEALED_DENIED (422) otherwise" | Yes |

**Summary:** 33 of 33 sampled NaC-to-AC pairs are aligned (Yes). Every NaC in the Story Map Matrix and NaC Derivation Table is independently verifiable against an explicit, testable acceptance-criterion bullet already present in UserStories-JudicialSync.md — no NaC in this document was invented without a grounding AC.

---

*Document generated by Pivota Spec Framework*
*Last updated: 2026-10-04*
