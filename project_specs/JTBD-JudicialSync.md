# Jobs to Be Done
## JudicialSync

| Field | Value |
|-------|-------|
| **Product Name** | JudicialSync |
| **Date** | 2026-10-04 |
| **Related Personas** | PERSONAS-JudicialSync.md |
| **Related PRD** | PRD-JudicialSync.md |

---

## JTBD Summary

| ID | Persona | Job Statement | Priority |
|----|---------|--------------|----------|
| JTBD-01.1 | PER-01 | When logging a live exhibit action mid-proceeding, I want to record it in a few keystrokes, so I can keep pace with the courtroom without reverting to paper. | P0 |
| JTBD-01.2 | PER-01 | When a recess, day-end, or trial-close checkpoint arrives, I want to reconcile my ledger against source lists automatically, so I can resolve discrepancies before they pile up. | P0 |
| JTBD-01.3 | PER-01 | When an exhibit leaves or returns to the courtroom, I want a confirmed custody transfer record, so I can be sure nothing goes missing mid-trial. | P2 |
| JTBD-01.4 | PER-01 | When a session or trial closes, I want a certified exhibit export without re-typing, so I can hand off a trustworthy record in minutes. | P1 |
| JTBD-02.1 | PER-02 | When a Speedy Trial date is challenged, I want a full "explain this date" breakdown, so I can defend the calculation immediately. | P0 |
| JTBD-02.2 | PER-02 | When candidate exclusion periods accumulate, I want to explicitly accept, modify, or reject each with rationale, so I can stay the final legal authority on every exclusion. | P0 |
| JTBD-02.3 | PER-02 | When remaining includable time nears a risk threshold, I want a proactive, explained alert, so I can act before the deadline is at risk. | P0 |
| JTBD-02.4 | PER-02 | When preparing for a status conference, I want a single consolidated case view, so I can walk in fully prepared without manual assembly. | P1 |
| JTBD-02.5 | PER-02 | When a sensitive exhibit needs sealing or release, I want to personally authorize it and review the access log, so I can control exposure and confirm no improper access. | P2 |
| JTBD-03.1 | PER-03 | When attorneys submit pretrial exhibit lists, I want missing metadata and duplicates caught automatically, so I can prevent deputies from inheriting intake problems mid-trial. | P0 |
| JTBD-03.2 | PER-03 | When data-quality issues accumulate across my caseload, I want a single prioritized exception queue, so I can resolve recurring issues before they cause downstream errors. | P0 |
| JTBD-03.3 | PER-03 | When a new case or defendant enters my caseload, I want correct setup and tracker initialization the first time, so I can avoid downstream rework. | P0 |
| JTBD-03.4 | PER-03 | When planning my week across many cases, I want a single portfolio dashboard, so I can prioritize around the highest-risk cases. | P2 |
| JTBD-03.5 | PER-03 | When a local rule, numbering scheme, or threshold needs to change, I want to configure it directly, so I can respond without filing an IT ticket. | P0 |
| JTBD-04.1 | PER-04 | When users across both modules need access, I want RBAC/ABAC scoped precisely to their role and case assignment, so I can guarantee no one sees or acts beyond their authority. | P0 |
| JTBD-04.2 | PER-04 | When a sealed-record access or calculation is disputed, I want a queryable tamper-evident audit explorer, so I can produce a defensible answer during review. | P0 |
| JTBD-04.3 | PER-04 | When docket data syncs inbound from CM/ECF, I want conflicts routed to human review rather than silently overwritten, so I can guarantee CM/ECF stays authoritative. | P0 |
| JTBD-04.4 | PER-04 | When sensitive records move through either module, I want enforced encryption, scanning, and policy-driven handling, so I can guarantee protection by policy, not ad hoc diligence. | P0 |
| JTBD-04.5 | PER-04 | When a privileged action occurs, I want separation of duties enforced and auditable, so I can verify no routine user performed it unchecked. | P1 |
| JTBD-05.1 | PER-05 | When a jury package is assembled, I want to confirm it matches the judge's authorized scope before any session opens, so I can be certain nothing improper reaches the jury. | P2 |
| JTBD-06.1 | PER-06 | When I need to assess or share operational health, I want de-identified, aggregate court-level metrics with no case-level detail, so I can report accurately without exposing case substance. | P1 |

---

## PER-01: Maria Santos — Jobs

### JTBD-01.1: Real-Time Exhibit Action Logging

**Job Statement:**
When I am at the clerk's station during a live trial session with the judge, attorneys, and witnesses actively speaking, I want to record an exhibit offer, objection, ruling, withdrawal, or substitution in a few keystrokes, so I can keep pace with the courtroom without disrupting proceedings or reverting to paper.

**Current Alternatives:**
- Tracks exhibit actions by hand on paper logs or a running spreadsheet during the session
- Makes a mental note and backfills the record later, risking lost detail

**Hiring Criteria:**
- Large touch targets and full keyboard support optimized for courtroom speed
- Entry completes in a small number of seconds per action
- Judge's ruling is explicitly attributed to the judge, never auto-decided
- Live status is visible to chambers during the session

**Success Measure:** Zero reversion to paper during a pilot trial, with each exhibit action recorded in a small number of seconds.

**Related Features:** F16, F17
**Priority:** P0

---

### JTBD-01.2: Dual-Log Reconciliation at Checkpoints

**Job Statement:**
When a recess, end-of-day, or trial-close checkpoint arrives, I want to compare my live ledger against the attorneys' exhibit lists, admitted-items list, and disposition records, so I can catch and resolve discrepancies before they compound into a post-trial crisis.

**Current Alternatives:**
- Manually cross-references printed lists against her own log after hours — "re-living the whole trial with a highlighter"
- Discovers mismatches only when someone else questions the record later

**Hiring Criteria:**
- Automatic comparison of the live ledger against source lists at defined checkpoints
- Required rationale capture on every resolved discrepancy
- Resolved exceptions logged to the audit trail automatically

**Success Measure:** Zero unresolved discrepancies remain open at trial close.

**Related Features:** F18, F7
**Priority:** P0

---

### JTBD-01.3: Custody Transfer Confirmation

**Job Statement:**
When an exhibit leaves the courtroom for storage or returns for a hearing during a multi-day trial, I want to record the transfer and obtain confirmation from whoever receives it, so I can know at all times who has custody and ensure nothing goes missing mid-trial.

**Current Alternatives:**
- Tracks custody handoffs on a paper sign-out sheet
- Has no alerting when a transfer is never signed back in

**Hiring Criteria:**
- Transfer event captures responsible custodian, purpose, time, and location
- Recipient must explicitly acknowledge receipt
- Unacknowledged transfers trigger an alert after a defined window

**Success Measure:** Zero custody transfers remain unacknowledged beyond the court's defined SLA.

**Related Features:** F20
**Priority:** P2

---

### JTBD-01.4: Certified Exhibit Export at Session End

**Job Statement:**
When a session, recess, or trial closes, I want to generate and certify a filtered export of the current exhibit list without re-typing anything, so I can hand off a trustworthy record to the judge, parties, or closeout process in minutes rather than hours.

**Current Alternatives:**
- Manually re-assembles an export list in a spreadsheet after each session

**Hiring Criteria:**
- One-click filter-and-export by status (e.g., admitted-only)
- Clerk/deputy certification step attached to the export
- Export is suitable as an interim closeout artifact without further rework

**Success Measure:** Certified exhibit list produced in minutes rather than hours after a session ends.

**Related Features:** F19, F24
**Priority:** P1

---

## PER-02: Judge Robert Hale (with Law Clerk Ana Ibarra) — Jobs

### JTBD-02.1: Explain This Date

**Job Statement:**
When a Speedy Trial date is challenged — by opposing counsel, at a hearing, or on appeal — I want to open a complete breakdown of every contributing event, rule version, exclusion period, and reviewer decision, so I can defend the calculation immediately rather than reconstructing it from memory.

**Current Alternatives:**
- Manually recalculates the date from docket entries after the fact
- Relies on chambers staff to reconstruct reasoning under time pressure

**Hiring Criteria:**
- Every calculated segment links to its triggering event and rule reference
- Prior approved versions are never silently overwritten — only versioned with documented overrides
- Each defendant in a multi-defendant matter has an independently calculated, clearly separated clock

**Success Measure:** Produces a complete, defensible explanation for any Speedy Trial date within minutes if challenged on appeal.

**Related Features:** F29, F34, F32
**Priority:** P0

---

### JTBD-02.2: Exclusion Review and Approval

**Job Statement:**
When candidate excludable periods from motions, continuances, or competency proceedings accumulate, I want to explicitly accept, modify, or reject each one with documented rationale — and have incomplete continuance findings flagged rather than silently accepted — so I can remain the final legal authority on every exclusion.

**Current Alternatives:**
- Manually reviews motions and orders against the docket with no structured completeness check
- Discovers missing findings or order references only when challenged later

**Hiring Criteria:**
- Clear proposed-vs-confirmed state distinction for every candidate exclusion
- Overrides require mandatory, documented rationale
- Continuance records missing required findings or order references route to his review queue before being relied upon

**Success Measure:** Continuance records missing required findings are caught before they become a problem, not after; zero instances of a prior approved calculation being silently overwritten.

**Related Features:** F28, F30, F33
**Priority:** P0

---

### JTBD-02.3: Early Threshold Alerting

**Job Statement:**
When remaining includable time on a defendant's clock approaches a court-defined risk threshold, I want a proactive alert tied to the underlying explanation, so I can act early rather than discovering the risk after it has materialized.

**Current Alternatives:**
- Relies on periodic manual docket review with no systematic early warning
- Discovers approaching or breached deadlines reactively

**Hiring Criteria:**
- Court-configurable thresholds, recipients, and escalation cadence
- Alert content links to full explanation context, never a bare date
- Delivery and acknowledgment status are tracked, not just sent

**Success Measure:** 100% of cases crossing a configured threshold generate a delivered, acknowledged alert before the deadline is at risk.

**Related Features:** F31, F4
**Priority:** P0

---

### JTBD-02.4: Conference-Ready Case View

**Job Statement:**
When preparing for a status conference or continuance decision with Ana, I want a single consolidated view of clock state, pending motions, and continuance history, so I can walk in fully prepared without reconstructing it from the docket by hand.

**Current Alternatives:**
- Ana manually compiles docket excerpts and notes ahead of each conference

**Hiring Criteria:**
- Single-screen summary of clock state, pending motions, continuance history, and open issues
- Deep links from the summary into underlying event and exclusion detail
- Review-packet generation available ahead of scheduled conferences

**Success Measure:** A case conference packet is available without manual reconstruction for every scheduled conference during pilot.

**Related Features:** F35, F8
**Priority:** P1

---

### JTBD-02.5: Authorized Sealing and Access Oversight

**Job Statement:**
When a sensitive exhibit needs to be sealed or released, I want to personally authorize that action and later review a log of every access attempt, so I can control exposure of sensitive evidence and confirm no improper access occurred.

**Current Alternatives:**
- Relies on ad hoc diligence with no structured access log tied to the sealing decision

**Hiring Criteria:**
- Sealing and release actions require his explicit authorization, never automatic
- Every access attempt — successful or denied — is logged
- Access logs are reviewable by him on demand

**Success Measure:** Zero unauthorized-access attempts succeed against sealed/restricted exhibits he has authorized.

**Related Features:** F21
**Priority:** P2 *(corrected from P1 during spec validation — F21 is scoped as P2/Pilot-hardening everywhere else in the spec suite: PRD Feature Index, UserStories Epic 21, and Story Map Release R3)*

---

## PER-03: David Okafor — Jobs

### JTBD-03.1: Clean Pretrial Exhibit Intake

**Job Statement:**
When attorneys submit exhibit lists and files ahead of trial across the cases I support, I want missing metadata and duplicate submissions caught automatically, so I can prevent courtroom deputies from inheriting intake problems mid-trial.

**Current Alternatives:**
- Manually spot-checks attorney submissions, with issues often caught late — sometimes not until a deputy is already mid-trial

**Hiring Criteria:**
- Required-metadata validation runs automatically at intake
- Duplicate and unsupported-format detection flags issues before courtroom use
- Accept, reject, or request-correction workflow routes incomplete items to the shared exception queue

**Success Measure:** Missing-required-metadata exceptions in pretrial intake drop to a low single-digit percentage of submissions.

**Related Features:** F15, F7
**Priority:** P0

---

### JTBD-03.2: Exception Queue Resolution

**Job Statement:**
When unmapped docket events, missing metadata, duplicates, and reconciliation mismatches accumulate across my caseload, I want to work from a single, age-prioritized shared queue, so I can resolve recurring data-quality issues before they cause downstream calculation or ledger errors.

**Current Alternatives:**
- Checks each case individually for anomalies with no aggregated view of what needs attention

**Hiring Criteria:**
- Cross-module exception surfacing with aging indicators to prioritize oldest items
- Required rationale capture on every resolution
- Recurring exception patterns are traceable back to a configuration fix, not repeated one-off corrections

**Success Measure:** Unmapped docket events in Speedy Trial ingestion drop to a low single-digit percentage of all ingested events.

**Related Features:** F7, F27
**Priority:** P0

---

### JTBD-03.3: Correct Case Setup and Tracker Initialization

**Job Statement:**
When a new case, proceeding, or defendant enters my caseload, I want to set up parties, numbering scheme, security designations, and trigger events correctly the first time — synchronized from CM/ECF wherever possible — so I can avoid downstream rework caused by incorrect setup.

**Current Alternatives:**
- Manually re-enters case and party data already present in CM/ECF
- Has no systematic way to catch a missing trigger event until status is already needed

**Hiring Criteria:**
- Case and proceeding creation or sync directly from CM/ECF
- Court-specific exhibit numbering scheme configuration available at setup
- Missing-trigger-event detection and flagging at the moment a tracker is created

**Success Measure:** New case/proceeding/tracker setups are initialized without a missing-trigger incident discovered after the fact.

**Related Features:** F14, F26
**Priority:** P0

---

### JTBD-03.4: Portfolio-Level Visibility

**Job Statement:**
When planning my week across every case I support, I want a single portfolio dashboard showing open exceptions, outstanding custody items, and closeout backlog, so I can prioritize my time around the highest-risk cases instead of checking case-by-case.

**Current Alternatives:**
- Manually checks each case individually with no aggregated view of risk across the portfolio

**Hiring Criteria:**
- Portfolio dashboard surfaces open exceptions, custody backlog, and closeout status across his full caseload
- Risk indicators highlight approaching thresholds and data gaps
- Dashboard updates reflect current state without manual refresh steps

**Success Measure:** Can identify every case with outstanding exceptions or custody backlog without opening cases individually.

**Related Features:** F25, F36
**Priority:** P2

---

### JTBD-03.5: Self-Service Configuration

**Job Statement:**
When a local rule, numbering scheme, threshold, or workflow state needs to change, I want to configure it directly through structured screens, so I can respond to local practice needs without filing an IT ticket or waiting on a deployment.

**Current Alternatives:**
- Files an IT ticket and waits for a code change or new deployment to adjust configuration

**Hiring Criteria:**
- Court profile management covers local rules, numbering schemes, and security policies
- Configuration changes are versioned with a full audit trail
- No code change or redeployment required for routine configuration adjustments

**Success Measure:** Configuration changes — numbering, thresholds, workflow states — are made by David directly, without filing an IT ticket.

**Related Features:** F3
**Priority:** P0

---

## PER-04: Priya Nandan — Jobs

### JTBD-04.1: Enforced Least-Privilege Access

**Job Statement:**
When users across both modules need access to case, exhibit, or Speedy Trial data, I want role- and attribute-based access control scoped precisely to their court, division, case, proceeding, party-role, and security designation, so I can guarantee no one sees or acts beyond what their assignment permits.

**Current Alternatives:**
- Enforces access policy fragmented or manually across disconnected tools with no single control point

**Hiring Criteria:**
- RBAC/ABAC scoping covers court/division/case/proceeding/party-role/security-designation
- SSO and multifactor authentication enforced for all users
- Session controls and privileged-administration safeguards are in place by default

**Success Measure:** Zero unauthorized-access attempts succeed against sealed/restricted records, actively monitored rather than only logged after the fact.

**Related Features:** F0
**Priority:** P0

---

### JTBD-04.2: Reconstructable Audit Trail

**Job Statement:**
When a sealed-record access is disputed or a calculation is challenged, I want to query a tamper-evident audit explorer by case, user, date range, or object, so I can produce a defensible, structured answer during an incident review or appellate challenge.

**Current Alternatives:**
- Has no structured way to reconstruct who did what, when, and under which rule version across fragmented logs

**Hiring Criteria:**
- Tamper-evident, immutable logging of all material actions across both modules
- Audit access is strictly separated from operational editing
- Audit entries link directly to the rule package or calculation version in effect at the time

**Success Measure:** 100% of material actions across both modules are captured in the tamper-evident audit trail.

**Related Features:** F2
**Priority:** P0

---

### JTBD-04.3: Trustworthy CM/ECF Synchronization

**Job Statement:**
When docket data syncs inbound from CM/ECF continuously, I want conflicts routed to human review rather than silently overwriting local records, with source identifiers always preserved, so I can guarantee CM/ECF remains the uncontested authoritative source.

**Current Alternatives:**
- Manages integration risk ad hoc with no systematic conflict-detection or routing discipline

**Hiring Criteria:**
- Inbound sync preserves source-system identifiers on every imported record
- No silent overwrite of docket data occurs on conflict, ever
- Conflicts route automatically to a visible human-review queue

**Success Measure:** Zero instances of CM/ECF docket data being silently overwritten rather than routed to human review.

**Related Features:** F10, F7
**Priority:** P0

---

### JTBD-04.4: Enforced Security Baseline

**Job Statement:**
When sealed, restricted, grand-jury, juvenile, or PII-bearing records move through either module, I want encryption, malware scanning, approved file-type controls, and explicit policy-driven handling enforced platform-wide, so I can guarantee sensitive records are protected by policy rather than ad hoc diligence.

**Current Alternatives:**
- Relies on informal diligence for sensitive record handling with no enforced policy layer

**Hiring Criteria:**
- Encryption in transit and at rest with secure key management
- Malware scanning and approved file-type controls applied to every upload
- Sealed/restricted/grand-jury/juvenile/PII handling expressed as explicit configured policy, not ad hoc code paths

**Success Measure:** Zero unauthorized-access attempts succeed against sealed/restricted records.

**Related Features:** F13
**Priority:** P0

---

### JTBD-04.5: Governed Privileged Administration

**Job Statement:**
When a privileged action occurs — a role change, rule-package change, or calculation-version control — I want separation of duties enforced and fully auditable, including a distinct authorization boundary for external attorney portal access, so I can verify at any time that no routine user performed a privileged action unchecked.

**Current Alternatives:**
- Mixes privileged and routine administrative actions today with no clean segregation or dedicated audit view

**Hiring Criteria:**
- Privileged actions (role management, rule-package changes, calculation-version controls) are segregated from routine operational roles
- Governed, versioned configuration changes carry a full audit trail
- External attorney portal access is managed as a separately scoped authentication boundary from internal court users

**Success Measure:** Privileged administrative actions remain fully segregated from routine operational roles, verifiable via the audit explorer at any time.

**Related Features:** F3, F12
**Priority:** P1

---

## PER-05: Carla Jimenez — Jobs

### JTBD-05.1: Confirmed Jury Package Composition

**Job Statement:**
When a judge authorizes a jury review package for a proceeding, I want to confirm the system-assembled candidate package actually matches that authorization — and flag any discrepancy back to chambers rather than resolving it myself — so I can be certain nothing improper (rejected, withdrawn, or unauthorized-sealed) ever reaches a jury review session.

**Current Alternatives:**
- Manually cross-checks physical exhibit binders against the admitted-items list with no structured confirmation record
- Discovers a composition problem only if someone notices during or after the jury session

**Hiring Criteria:**
- Candidate package composition is visible for her review before any session opens, separate from the judge's authorization action
- A composition discrepancy routes back to chambers rather than being silently resolved or silently accepted
- Package access is time-bounded and fully logged (open, view, session end)
- A delivered package is immutable; any change requires a new, re-confirmed version

**Success Measure:** Zero rejected, withdrawn, or unauthorized-sealed exhibits ever reach a jury review session; every confirmation and access event is attributable to her review.

**Related Features:** F22
**Priority:** P2

---

## PER-06: Thomas Reyes — Jobs

### JTBD-06.1: De-Identified Operational and Risk Visibility

**Job Statement:**
When I need to assess my court's operational health or share performance indicators with court leadership or the AO, I want aggregate, de-identified dashboards and exports — backlog age, data quality, adoption, and Speedy Trial risk — with zero case-level or defendant-level detail, so I can report accurately on administrative health without ever touching case substance or being read as a judicial-performance signal.

**Current Alternatives:**
- Manually compiles ad hoc operational summaries with no consistent de-identification discipline
- Has no structural protection against an "aggregate" metric inadvertently narrowing down to an identifiable case

**Hiring Criteria:**
- Court-level dashboards show only counts, rates, and ages — never individual defendant, party, or attorney names
- Cross-court (AO-level) views aggregate at court granularity minimum, with no single-case-level detail exposed
- Every reporting surface carries a persistent label clarifying it is administrative-only, never a judicial-determination input
- Export access requires a distinct `reporting_viewer`/`court_admin` entitlement, separate from operational edit roles

**Success Measure:** Every dashboard and export he touches or shares carries zero individual-level detail and is clearly labeled as administrative-only; no AO-level comparison ever drills through to single-case detail.

**Related Features:** F9, F36
**Priority:** P1

---

## Outcome-to-Feature Traceability

| JTBD ID | Feature | Expected Outcome |
|---------|---------|-----------------|
| JTBD-01.1 | F16, F17 | Deputy logs exhibit actions in real time with zero reversion to paper during pilot trials |
| JTBD-01.2 | F18, F7 | Ledger and source lists reconcile at every checkpoint with zero unresolved discrepancies at trial close |
| JTBD-01.3 | F20 | Every custody transfer is confirmed, with zero unacknowledged transfers beyond SLA |
| JTBD-01.4 | F19, F24 | Certified exhibit export available in minutes rather than hours after session close |
| JTBD-02.1 | F29, F34, F32 | Any Speedy Trial date is fully explainable within minutes, including in multi-defendant matters |
| JTBD-02.2 | F28, F30, F33 | Every candidate exclusion is explicitly reviewed; incomplete continuance findings are caught before reliance |
| JTBD-02.3 | F31, F4 | 100% of threshold-crossing cases generate a delivered, acknowledged alert before risk materializes |
| JTBD-02.4 | F35, F8 | Chambers prepares for conferences from a single consolidated view, no manual reconstruction |
| JTBD-02.5 | F21 | Sealing/release requires explicit judicial authorization; zero unauthorized access succeeds |
| JTBD-03.1 | F15, F7 | Missing-metadata exceptions at pretrial intake drop to a low single-digit percentage |
| JTBD-03.2 | F7, F27 | Unmapped docket events drop to a low single-digit percentage of all ingested events |
| JTBD-03.3 | F14, F26 | New case/tracker setups complete correctly the first time, with no missing-trigger surprises |
| JTBD-03.4 | F25, F36 | Portfolio-wide risk (exceptions, custody backlog, closeout status) visible without case-by-case checks |
| JTBD-03.5 | F3 | Local configuration changes made directly by clerk staff, with zero IT tickets required |
| JTBD-04.1 | F0 | Access is enforced by role/attribute scope; zero unauthorized access succeeds against sealed records |
| JTBD-04.2 | F2 | 100% of material actions across both modules are captured in a tamper-evident audit trail |
| JTBD-04.3 | F10, F7 | Zero silent overwrites of CM/ECF docket data; all conflicts route to human review |
| JTBD-04.4 | F13 | Sensitive record handling enforced via explicit policy configuration platform-wide |
| JTBD-04.5 | F3, F12 | Privileged administrative actions remain fully segregated and auditable at all times |
| JTBD-05.1 | F22 | Jury packages are confirmed against judicial authorization before any session opens; zero improper exhibits reach a jury |
| JTBD-06.1 | F9, F36 | Court-level and AO-level reporting is aggregate and de-identified with zero case-level detail exposed |

---

## NaC Preview

| JTBD ID | Outcome | Candidate NaC |
|---------|---------|--------------|
| JTBD-01.1 | Zero reversion to paper during pilot trials | Given a live session, when the deputy logs an exhibit offer/objection/ruling, then the action is captured and visible within a small number of seconds with no parallel paper log maintained |
| JTBD-01.2 | Zero unresolved discrepancies at trial close | Given a recess/day-end/trial-close checkpoint, when reconciliation runs, then all discrepancies are either resolved with rationale or explicitly flagged open for the next checkpoint |
| JTBD-01.3 | Zero unacknowledged custody transfers beyond SLA | Given an exhibit custody transfer is recorded, when the recipient does not acknowledge within the court's SLA window, then an alert is generated automatically |
| JTBD-01.4 | Certified export in minutes, not hours | Given a session has ended, when the deputy requests a filtered export, then a certified exhibit list is produced without manual re-entry |
| JTBD-02.1 | Any date explainable within minutes | Given a Speedy Trial date is in question, when the judge opens "explain this date," then every contributing event, rule version, and reviewer decision is displayed with source links |
| JTBD-02.2 | Incomplete findings caught before reliance | Given a continuance record lacks required findings or an order reference, when it enters the review workflow, then it is flagged to chambers before the calculation relies on it |
| JTBD-02.3 | 100% of threshold crossings alert before risk | Given remaining time crosses a configured threshold, when the crossing occurs, then an alert referencing the full explanation is delivered and tracked to acknowledgment |
| JTBD-02.4 | Conference prep without manual reconstruction | Given a scheduled status conference, when chambers opens the case conference view, then clock state, pending motions, and continuance history are presented on one screen |
| JTBD-02.5 | Zero unauthorized sealed-record access | Given a sealing/release request, when it is submitted, then it requires explicit judge authorization and every access attempt is logged |
| JTBD-03.1 | Low single-digit-percent missing-metadata rate | Given an attorney submits an exhibit list, when required metadata is missing or a duplicate is detected, then the item is routed to the exception queue before courtroom use |
| JTBD-03.2 | Low single-digit-percent unmapped-event rate | Given a docket event cannot be mapped to a configured category, when ingestion occurs, then the event routes to the shared exception queue with an aging indicator |
| JTBD-03.3 | No missing-trigger surprises post-setup | Given a new case/defendant tracker is initialized, when a required trigger event is missing, then the system flags it for clerk confirmation before the tracker goes live |
| JTBD-03.4 | Portfolio risk visible without per-case checks | Given David opens the portfolio dashboard, when exceptions, custody items, or closeout backlog exist, then they are visible in aggregate across his full caseload |
| JTBD-03.5 | Zero IT tickets for routine configuration | Given a numbering/threshold/workflow-state change is needed, when David makes it through the configuration screens, then it takes effect without a code change or deployment |
| JTBD-04.1 | Zero unauthorized access to sealed records | Given a user without matching role/attribute scope, when they attempt to access a sealed/restricted record, then access is denied and the attempt is logged |
| JTBD-04.2 | 100% of material actions audited | Given any material action (status change, ruling, custody transfer, override, approval), when it occurs, then it is captured tamper-evidently and reconstructable via the audit explorer |
| JTBD-04.3 | Zero silent CM/ECF overwrites | Given an inbound CM/ECF sync detects a conflict with local data, when the conflict is identified, then it routes to human review rather than overwriting silently |
| JTBD-04.4 | Sensitive records protected by enforced policy | Given a sealed/restricted/grand-jury/juvenile/PII-tagged record, when any user interacts with it, then platform-level policy controls (encryption, scanning, access) are enforced automatically |
| JTBD-04.5 | Privileged actions fully segregated and auditable | Given a privileged action (role change, rule-package change, calculation-version control), when it is performed, then it is restricted to privileged roles and independently visible in the audit explorer |
| JTBD-05.1 | Zero improper exhibits reach a jury | Given a judge authorizes a jury package, when the jury administrator reviews the candidate composition, then it is confirmed as matching the authorized scope (or flagged to chambers) before any review session opens |
| JTBD-06.1 | Reporting is aggregate and de-identified | Given a court-level or AO-level dashboard/export is requested, when it is rendered, then it contains only counts/rates/ages with no defendant, party, or attorney names and no single-case drill-through beyond the requester's own case-access entitlement |

---

*Document generated by Pivota Spec Framework*
*Last updated: 2026-10-04*
