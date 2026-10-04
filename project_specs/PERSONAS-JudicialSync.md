# Personas
## JudicialSync

| Field | Value |
|-------|-------|
| **Product Name** | JudicialSync |
| **Date** | 2026-10-04 |
| **Related PRD** | PRD-JudicialSync.md |

---

## Persona Summary

| ID | Name | Role | Primary Goal |
|----|------|------|-------------|
| PER-01 | Maria Santos | Courtroom Deputy | Log every exhibit action in real time, in seconds, without reverting to paper |
| PER-02 | Judge Robert Hale (with Law Clerk Ana Ibarra) | Article III Judge / Chambers | Trust and act on an explainable Speedy Trial clock and exhibit record without the system ever deciding for them |
| PER-03 | David Okafor | Clerk / Case Administrator | Keep exhibit and Speedy Trial data clean, reconciled, and configured correctly across an entire caseload |
| PER-04 | Priya Nandan | System Administrator / Security Officer | Guarantee access control, audit integrity, and CM/ECF data discipline across both modules |
| PER-05 | Carla Jimenez | Jury Administrator | Confirm an assembled jury package matches the judge's authorization before any admitted evidence reaches a jury review session |
| PER-06 | Thomas Reyes | Court Administrator / AO Program Manager | See and share de-identified operational and Speedy Trial risk metrics at the court level without ever touching case-level detail |

---

## PER-01: Maria Santos

**Role & Context:**
Maria is a courtroom deputy for a federal district judge, working inside the courtroom during trials and evidentiary hearings. She sits at the clerk's station a few feet from the bench, operating a single laptop or tablet while the judge, attorneys, and witnesses are actively speaking — there is no time to stop proceedings while she works. Outside of trial days she also supports her judge's chambers with case setup and post-session cleanup, splitting her time between live courtroom support and administrative reconciliation. She reports informally to the judge for in-session matters and to the clerk of court's office for case-record procedures, and she is the primary point of accountability when an exhibit list, a custody chain, or a reconciliation report doesn't match what actually happened in the room.

Today, Maria tracks exhibit offers, objections, and rulings by hand on paper logs or in a running spreadsheet, then spends hours after each session reconciling that log against the attorneys' exhibit lists, the admitted-items list, and disposition records — a process she describes as "re-living the whole trial with a highlighter." Any custody handoff (an exhibit leaving the courtroom for storage, or coming back for a hearing) is tracked on a sign-out sheet that is easy to lose track of during a multi-day trial.

**Goals:**
- Record exhibit offers, objections, rulings, withdrawals, and substitutions in real time with minimal taps/keystrokes, without disrupting courtroom flow (F17)
- Maintain one authoritative, always-current exhibit ledger instead of a personal shadow spreadsheet (F16)
- Catch and resolve discrepancies between her live log and attorney/jury/disposition lists before they pile up into a post-trial crisis (F18)
- Track custody transfers (who has an exhibit, where, and why) with confirmation from whoever receives it, so nothing goes missing mid-trial (F20)
- Produce a clean, certified exhibit export at recess, day-end, and trial close without re-typing anything (F19, F24)

**Pain Points:**
- Keeps a parallel paper or spreadsheet log because there is no real-time digital system fast enough for courtroom use — exactly the manual, fragmented tooling problem the PRD identifies
- Post-trial reconciliation across party lists, her own log, admitted-items lists, and disposition records is manual, slow, and error-prone, with no structured way to show why a discrepancy exists
- Custody handoffs for physical exhibits are tracked on paper sign-out sheets with no alerting when a transfer is never acknowledged
- When a judge or appellate reviewer later questions an exhibit's status, Maria has no fast way to reconstruct the full history — she has to dig through paper

**Technical Expertise:** Intermediate — comfortable with everyday office and case-management software, but has zero tolerance for systems that slow her down mid-proceeding; any added friction during a live session is treated as a failure, not an inconvenience.

**Top Tasks:**
1. Log exhibit offers, objections, and rulings in real time during a session (constant during trial days, critical)
2. Run dual-log reconciliation at recess, end-of-day, and trial close to catch discrepancies before they compound (daily during trial, critical)
3. Record and confirm custody transfers as exhibits move in and out of the courtroom (several times per trial day, high)
4. Export and certify the current or admitted-only exhibit list for the judge, parties, or closeout (daily to weekly, high)
5. Resolve flagged exceptions (missing metadata, duplicate submissions, unmapped entries) from the shared exception queue (daily, medium)

**Success Criteria:**
- Records a single exhibit action (offer, objection, ruling) in a small number of seconds, with zero reversion to paper during a pilot trial
- Zero unresolved discrepancies remain open at trial close
- Zero custody transfers remain unacknowledged beyond the court's defined SLA
- Can produce a certified, exportable exhibit list in minutes rather than hours after a session ends

---

## PER-02: Judge Robert Hale (with Law Clerk Ana Ibarra)

**Role & Context:**
Judge Hale presides over a federal district court docket carrying both civil and criminal matters, with primary responsibility for every ruling, finding, and final determination made in his courtroom and chambers. He personally rules on exhibit offers and objections live from the bench, and he — not any system — authorizes continuances, confirms excludable Speedy Trial periods, and signs off on final Speedy Trial status for each defendant. His law clerk, Ana Ibarra, works alongside him in chambers, preparing case conference materials, pre-screening continuance orders for completeness, and flagging approaching deadlines before hearings; together they represent the "chambers" persona that consumes oversight and decision-support views rather than performing operational data entry. Judge Hale is accountable to the parties, to appellate review, and ultimately to the Speedy Trial Act itself — a missed or miscalculated deadline is a legal, not just an administrative, failure.

He is acutely aware that any tool touching Speedy Trial calculations or exhibit status must never be allowed to look like it is making the decision for him. He wants to see a number and immediately be able to ask "why is it this number," and get a complete, source-linked answer — not a black box.

**Goals:**
- See a fully explainable Speedy Trial calculation — every contributing event, rule version, exclusion period, and reviewer decision — on demand, never just a bare date (F29)
- Review and explicitly accept, modify, or reject candidate exclusion periods rather than have the system apply them automatically (F28, F30)
- Authorize sealing and release of sensitive exhibits himself, with every access attempt logged (F21)
- Get proactive, threshold-based alerts on approaching Speedy Trial deadlines early enough to act, not after the fact (F31)
- Prepare for status conferences and continuance decisions with a single consolidated view of clock state, pending motions, and continuance history instead of reconstructing it from the docket by hand (F35)
- Have incomplete continuance findings or missing order references flagged for chambers review rather than silently accepted (F33)
- Maintain independent, clearly separated clocks for each defendant in multi-defendant matters so no case result gets collapsed or misrepresented (F34)

**Pain Points:**
- Today, Speedy Trial calculations are performed manually and are difficult to audit — when a calculation is challenged, there is no structured way to show the underlying reasoning
- Approaching or already-breached deadlines are often discovered reactively rather than flagged proactively
- Continuance records sometimes lack the structured findings or order references required to support them, and this is currently caught late or not at all
- Multi-defendant matters risk having their individual clocks blurred together, obscuring the true status for any one defendant
- Any new system risks either being ignored (too slow/opaque to trust) or over-trusted (treated as making the legal determination itself) — both outcomes are unacceptable

**Technical Expertise:** Intermediate (Judge Hale) to Advanced-user-but-non-technical (Ana Ibarra) — both are highly capable professionals who expect a polished, fast, reliable tool, but neither wants to administer configuration or troubleshoot technical issues; they consume decision-support views and take explicit approval actions.

**Top Tasks:**
1. Review and confirm or override candidate Speedy Trial exclusion periods with documented rationale (weekly to daily depending on caseload, critical)
2. Open "explain this date" to review the full calculation breakdown before a hearing or ruling (weekly, critical)
3. Review the case conference packet (clock state, pending motions, continuance history, open issues) ahead of status conferences (per conference, high)
4. Authorize sealing or release of sensitive exhibits and review sealed-access logs (as-needed, high)
5. Respond to threshold alerts on approaching Speedy Trial deadlines across the chambers caseload (ongoing, high)

**Success Criteria:**
- Can produce a complete, defensible explanation for any Speedy Trial date within minutes if challenged on appeal
- Zero instances of a prior approved calculation being silently overwritten rather than versioned
- 100% of cases crossing a configured threshold generate a delivered, acknowledged alert before the deadline is at risk
- Continuance records missing required findings are caught before they become a problem, not after

---

## PER-03: David Okafor

**Role & Context:**
David is a clerk and case administrator working in the clerk of court's office, supporting multiple judges' caseloads rather than a single courtroom. He is the person who sets up a case and proceeding in the system before exhibit activity begins, configures the court's exhibit numbering scheme and security designations, processes pretrial exhibit submissions from attorneys, and initializes Speedy Trial trackers from docket trigger events. Where Maria (PER-01) owns real-time, in-courtroom accuracy for a single trial, David owns portfolio-level data quality and configuration correctness across many cases and judges simultaneously — he is the one who notices when the same type of exception keeps recurring across cases and needs a configuration fix, not just a one-off correction.

David spends a significant part of his week resolving flagged exceptions: incomplete exhibit metadata from attorney submissions, duplicate exhibit entries, and docket events from CM/ECF that don't map cleanly to a configured Speedy Trial event category. He is also the person most likely to be asked to generate an exportable record — a certified exhibit list, a closeout package, or a portfolio status report — for a judge, a program manager, or an appellate reviewer.

**Goals:**
- Set up new cases, proceedings, parties, and numbering schemes correctly the first time, synchronized from CM/ECF wherever possible (F14)
- Process pretrial exhibit submissions efficiently, catching missing metadata and duplicates before they reach the courtroom (F15)
- Initialize Speedy Trial trackers accurately from trigger events, catching missing-trigger situations early (F26)
- Resolve docket-event mapping exceptions and keep the event-category configuration current so unmapped events stay rare (F27, F7)
- Maintain portfolio-level visibility into open exceptions, custody items outstanding, and closeout backlog across all cases he supports (F25)
- Produce certified exports and full post-trial closeout packages without manual re-assembly (F19, F24)
- Configure court-specific rules, thresholds, and workflow states without needing a developer or a new deployment (F3)

**Pain Points:**
- Exhibit and Speedy Trial status currently live across paper logs, spreadsheets, and the docket with no reconciliation discipline, making it hard to trust any single number
- Missing-metadata and duplicate-submission issues from attorneys are caught late, often not until a deputy is already mid-trial
- Unmapped CM/ECF docket events accumulate without a clear, fast path to resolution, creating downstream calculation risk
- No single portfolio view exists today showing which cases have open exceptions, outstanding custody items, or closeout backlog — he has to check case-by-case
- Configuration changes (numbering schemes, thresholds, workflow states) historically require IT involvement rather than being self-service

**Technical Expertise:** Intermediate to Advanced — comfortable configuring business rules and workflow settings in web applications, experienced with case-management systems, but not a developer; expects configuration to be achievable through structured screens, not code or direct database access.

**Top Tasks:**
1. Process pretrial exhibit intake submissions — validate, accept, reject, or request correction (daily, critical)
2. Resolve items in the shared exception queue (unmapped events, missing metadata, duplicates, reconciliation mismatches) (daily, critical)
3. Initialize and configure new case/proceeding/tracker setups (numbering, parties, security designations, trigger events) (several times weekly, high)
4. Review the portfolio dashboard for open exceptions, custody backlog, and closeout status across his caseload (daily, high)
5. Configure or adjust court profiles — local rules, thresholds, workflow states, event mappings (periodically, medium)

**Success Criteria:**
- Missing-required-metadata exceptions in pretrial intake drop to a low single-digit percentage of submissions
- Unmapped docket events in Speedy Trial ingestion drop to a low single-digit percentage of all ingested events
- Can generate a complete, certified closeout package without manual reassembly across spreadsheets
- Configuration changes (numbering, thresholds, workflow states) are made by David directly, without filing an IT ticket

---

## PER-04: Priya Nandan

**Role & Context:**
Priya is a system administrator and security officer supporting judiciary IT for one or more federal district courts. She is not involved in day-to-day case operations — she does not log exhibits, review Speedy Trial calculations, or process intake — but she owns the integrity of the platform everyone else depends on: who can access what, whether the CM/ECF integration is behaving as an authoritative, non-overwriting source, whether sealed and restricted records are actually protected, and whether the audit trail can withstand scrutiny during an incident review or appellate challenge. She works closely with the Administrative Office (AO) on compliance expectations and with local court leadership on access policy, and she is typically the first person called when something looks wrong at the infrastructure or access-control level — an unexpected access attempt on a sealed record, a stalled CM/ECF sync, or a question about who approved a privileged configuration change.

Priya's role is inherently cross-cutting: she configures and monitors the shared platform services (identity, audit, security baseline, CM/ECF adapter) that both the Evidentiary Tracking and Speedy Trial modules depend on, and she is the enforcement point for separation of duties among privileged administrative actions.

**Goals:**
- Enforce least-privilege, role- and attribute-based access scoped by court/division/case/proceeding/party-role/security-designation, with SSO and MFA in place (F0)
- Guarantee that every material action across both modules is captured in a tamper-evident audit trail, with audit access strictly separated from operational editing (F2)
- Ensure CM/ECF integration never silently overwrites docket data — all conflicts route to human review, with source identifiers preserved (F10)
- Maintain the platform-wide security baseline: encryption in transit and at rest, malware scanning, approved file-type controls, and policy-driven handling of sealed/restricted/grand-jury/juvenile/PII records (F13)
- Enforce separation of duties for privileged administrative actions — role management, rule-package changes, calculation-version controls (F3, cross-cutting NFR)
- Control and audit external attorney portal access as a separately scoped authentication boundary from internal court users (F12)
- Support governed, versioned configuration changes with a full audit trail rather than undocumented edits (F3)

**Pain Points:**
- Today there is no single system enforcing consistent, auditable access control across exhibit and Speedy Trial data — access policy is fragmented or manually enforced
- No structured way exists to reconstruct who did what, when, and under what rule version if a sealed record is improperly accessed or a calculation is disputed
- Integration risk with CM/ECF is a constant concern: incomplete or late data, or any scenario where imported data could silently overwrite docket-of-record information, is a serious integrity and compliance risk
- Privileged administrative actions (role changes, configuration changes) have historically lacked clean separation from routine operational work, creating audit and compliance exposure
- Sensitive record handling (sealed, grand jury, juvenile, PII) depends on ad hoc diligence today rather than enforced, explicit policy configuration

**Technical Expertise:** Expert — deep familiarity with identity/access management, security operations, audit systems, and integration monitoring; the primary technical user among the personas, responsible for platform-level configuration rather than case-level workflow.

**Top Tasks:**
1. Configure and review role-based/attribute-based access control scoping (court, division, case, proceeding, party-role, security designation) (ongoing, critical)
2. Monitor the audit explorer and investigate flagged or disputed access/action events (ongoing, critical)
3. Monitor CM/ECF integration health and resolve sync conflicts or discrepancies routed to human review (daily to weekly, critical)
4. Administer and review privileged configuration changes (court profiles, rule packages, calculation-version controls) with separation-of-duties checks (periodically, high)
5. Manage and audit external attorney portal access as a distinct authorization boundary (periodically, medium)

**Success Criteria:**
- 100% of material actions across both modules are captured in the tamper-evident audit trail
- Zero unauthorized-access attempts succeed against sealed/restricted records (actively monitored, not merely logged after the fact)
- Zero instances of CM/ECF docket data being silently overwritten rather than routed to human review
- Privileged administrative actions remain fully segregated from routine operational roles, verifiable via audit explorer at any time

---

## PER-05: Carla Jimenez

**Role & Context:**
Carla is a jury administrator supporting one or more courtrooms during trial. She does not touch exhibit intake, custody, or the Speedy Trial clock — her scope begins once a judge has authorized a jury review package for a proceeding. She is responsible for confirming that the package the system has assembled is correct and court-authorized before it is ever delivered into a juror-accessible review session, and for making sure that review session is properly time-bounded and access-controlled once it starts. She reports to the clerk of court's office administratively but takes her package-composition authority directly from the presiding judge's authorization for each specific proceeding — she never decides what belongs in a jury package, only confirms that what the system assembled matches what the judge authorized.

Historically, jury room evidence handling has depended on courtroom staff manually tracking which admitted exhibits were current — a sealed or withdrawn item slipping into a physical exhibit binder headed for the jury room was a real and serious risk. Carla's job is to be the last structured checkpoint before admitted evidence reaches the jury, confirming composition against the judge's authorization rather than re-deciding it herself.

**Goals:**
- Confirm that an assembled jury package contains only the admitted electronic exhibits the judge actually authorized, with rejected/withdrawn/sealed items automatically excluded (F22)
- Ensure jury review sessions are properly time-bounded and access-controlled, with every access event logged (F22)
- Catch and flag any discrepancy between the judge's stated authorization scope and the system-assembled candidate package before delivery, routing it back to chambers rather than silently adjusting it herself (F22, F7)
- Avoid ever being the one who decides what a jury may see — composition authority is the judge's, confirmation is hers (F22, F30 pattern)

**Pain Points:**
- Under the old paper/binder process, confirming that only properly admitted items reached the jury room depended entirely on her own manual cross-check against the admitted-items list, with no structured record of that confirmation
- No structured log previously existed of exactly which session accessed which exhibit and when, making it hard to answer questions after the fact about jury-room evidence handling
- A late ruling (an exhibit admitted or withdrawn after a package was already physically assembled) was a recurring, high-stress scenario with no clean mechanism to force a controlled re-assembly rather than an ad hoc fix

**Technical Expertise:** Intermediate — comfortable with structured review/confirmation screens and session-based access tools, but not a configuration user; she works entirely within the scope of a single proceeding's jury package at a time, never touching court-wide settings.

**Top Tasks:**
1. Review the system-assembled candidate jury package against the judge's stated authorization scope before confirming composition (per proceeding requiring jury review, critical)
2. Flag any discrepancy between authorized scope and assembled composition back to chambers rather than resolving it herself (as-needed, critical)
3. Open and monitor an active, time-bounded jury review session, confirming it closes properly at session end (per session, high)
4. Confirm that a re-assembly (new package version) is required and routed correctly when the admitted-exhibit set changes after a package was already authorized (as-needed, high)

**Success Criteria:**
- Zero rejected, withdrawn, or unauthorized-sealed exhibits ever reach a jury review session
- Every package composition confirmation and every session access event is fully logged and attributable to her review
- No jury package is ever silently updated in place after delivery — composition changes always produce a new, re-authorized version

---

## PER-06: Thomas Reyes

**Role & Context:**
Thomas is a court administrator supporting a single federal district court's leadership and operations, with a secondary reporting relationship to the Administrative Office of the U.S. Courts (AO) for program-management purposes. Unlike David (PER-03), who works case-by-case and portfolio-by-portfolio inside the operational data, Thomas operates one level up: he is responsible for understanding his court's overall operational health — backlog trends, data-quality rates, adoption of the new tools, and caseload-wide Speedy Trial risk — without needing or wanting access to individual defendant names, exhibit descriptions, or case-level detail. He is also the person who periodically needs to share de-identified operational metrics with AO program managers who are comparing adoption and performance trends across multiple pilot courts, never at the level of an individual case or ruling.

Thomas is distinct from Priya (PER-04): Priya owns the platform's technical integrity (access control, audit, integration health); Thomas owns the *administrative* read of what that platform is telling him and his court's leadership about operational performance. He has no stake in configuration, security policy, or privileged role grants — his access is read-only, aggregate, and explicitly walled off from case substance by design.

**Goals:**
- See court-level aggregate dashboards (backlog age, data-quality rates, adoption indicators) without any individual defendant, party, or attorney name ever appearing (F9, F36 court-level view)
- Export role-limited, de-identified operational metrics on demand to share with court leadership or AO program managers (F9)
- Trust that no aggregate metric he sees or shares could be read as, or used as, a judicial-performance proxy or case-outcome signal (F9, F38)
- Understand caseload-wide Speedy Trial risk (approaching thresholds, data gaps) at the court level, distinct from any individual judge's personal caseload view (F36)

**Pain Points:**
- No current tooling distinguishes "administrative health of the court's operations" from "case-level substance," so any useful metric today comes bundled with access he shouldn't need or want
- Sharing performance/adoption data with the AO today is a manual, ad hoc compilation exercise with no consistent de-identification discipline
- Without enforced aggregation minimums, there is a real risk that a small-caseload court's "aggregate" metric could inadvertently narrow down to an identifiable case — a risk he has no structural protection against today

**Technical Expertise:** Intermediate — comfortable with dashboards, filters, and export tools; not a configuration user and not expected to resolve exceptions or touch case data directly; his access is intentionally read-only and aggregate-scoped.

**Top Tasks:**
1. Review the court-level operational dashboard (backlog, data quality, adoption) on a recurring cadence (weekly, high)
2. Export de-identified operational metrics for court leadership or AO program-manager review (periodically, high)
3. Review the court-level Speedy Trial risk dashboard for caseload-wide approaching-threshold and data-gap patterns (weekly, medium)
4. Confirm that no exported or displayed metric exposes case-level or defendant-level detail before sharing it externally (as-needed, critical)

**Success Criteria:**
- Every court-level dashboard and export he touches carries zero individual defendant/party/attorney names and is clearly labeled as administrative-only
- No AO-level comparison across courts ever drills through to single-case detail
- He can produce a shareable operational summary for leadership or the AO without manual recompilation

---

## Persona Relationships

| Persona | Interacts With | Nature of Interaction |
|---------|---------------|----------------------|
| PER-01 (Courtroom Deputy) | PER-02 (Judge/Chambers) | Deputy records exhibit offers/objections in real time; judge's ruling is explicitly attributed to the judge and visible live to chambers during the session |
| PER-01 (Courtroom Deputy) | PER-03 (Clerk/Case Administrator) | Deputy's post-session reconciliation and resolved exceptions flow into the clerk's portfolio-level exception queue and closeout workflow |
| PER-02 (Judge/Chambers) | PER-03 (Clerk/Case Administrator) | Clerk initializes trackers and case conference materials that chambers reviews; chambers' continuance decisions and sealing authorizations drive clerk follow-up tasks |
| PER-02 (Judge/Chambers) | PER-04 (System Administrator) | Admin enforces access to sealed exhibits and audit visibility that chambers relies on for sealing authorizations and dispute resolution |
| PER-03 (Clerk/Case Administrator) | PER-04 (System Administrator) | Admin provisions clerk access and court-profile configuration scope; clerk requests configuration changes (numbering, thresholds) within admin-governed boundaries |
| PER-03 (Clerk/Case Administrator) | External Attorneys (restricted portal, not a full persona) | Clerk reviews and accepts/rejects structured exhibit metadata and corrections submitted through the restricted attorney portal |
| PER-04 (System Administrator) | All personas | Admin's access-control, audit, and CM/ECF integration decisions silently underpin every other persona's ability to trust the data they see |
| PER-02 (Judge/Chambers) | PER-05 (Jury Administrator) | Judge authorizes jury package composition and scope; jury administrator confirms the system-assembled package matches that authorization before any review session opens |
| PER-01 (Courtroom Deputy) | PER-05 (Jury Administrator) | Deputy's real-time admitted/rejected/withdrawn status directly determines what is eligible for the jury administrator's package confirmation |
| PER-03 (Clerk/Case Administrator) | PER-06 (Court Administrator/AO) | Clerk's portfolio-level exception and closeout data feeds the de-identified, aggregate metrics the court administrator reviews and shares |
| PER-04 (System Administrator) | PER-06 (Court Administrator/AO) | Admin enforces the `reporting_viewer`/`court_admin` entitlement and de-identification policy that the court administrator's dashboards and exports depend on |

---

## Feature-Persona Matrix

| Feature | PER-01 (Deputy) | PER-02 (Judge/Chambers) | PER-03 (Clerk/Admin) | PER-04 (Sys Admin) | PER-05 (Jury Admin) | PER-06 (Court Admin/AO) |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| F0: Identity and Access Management | Secondary | Secondary | Secondary | Primary | Secondary | Secondary |
| F1: Core Case and Docket Data Model | Secondary | Secondary | Primary | Secondary | — | — |
| F2: Audit Trail and Audit Explorer | Secondary | Secondary | Secondary | Primary | — | — |
| F3: Configuration Engine | — | Secondary | Primary | Primary | — | — |
| F4: Notifications Service | Secondary | Secondary | Secondary | Secondary | Secondary | — |
| F5: Search Service | Secondary | Secondary | Primary | — | — | — |
| F6: Work Queue and Task Management | Secondary | Primary | Primary | — | Secondary | — |
| F7: Exception Queue | Secondary | Secondary | Primary | — | Secondary | — |
| F8: Case Timeline View | Secondary | Primary | Primary | — | — | — |
| F9: Operational Reporting Feed | — | Secondary | Secondary | Secondary | — | Primary |
| F10: CM/ECF Integration Adapter | — | Secondary | Secondary | Primary | — | — |
| F11: Role-Specific UI Workspaces | Primary | Primary | Primary | Secondary | Secondary | Secondary |
| F12: Restricted External Attorney Portal | — | Secondary | Primary | Primary | — | — |
| F13: Security and Compliance Baseline | Secondary | Secondary | Secondary | Primary | — | — |
| F14: Case and Proceeding Setup for Exhibits | Secondary | — | Primary | — | — | — |
| F15: Pretrial Exhibit Intake | Secondary | — | Primary | — | — | — |
| F16: Exhibit Ledger | Primary | Secondary | Primary | — | — | — |
| F17: Real-Time Courtroom Logging | Primary | Secondary | — | — | — | — |
| F18: Dual-Log and Source Reconciliation | Primary | — | Primary | — | — | — |
| F19: Exportable Exhibit List and Basic Closeout | Primary | Secondary | Primary | — | — | — |
| F20: Custody and Location Tracking | Primary | — | Secondary | — | — | — |
| F21: Sealing and Restricted Exhibit Handling | Secondary | Primary | Secondary | Secondary | Secondary | — |
| F22: Jury Review Package Assembly | Secondary | Secondary | Secondary | — | Primary | — |
| F23: Physical and Digital Exhibit Distinction | Secondary | — | Primary | — | — | — |
| F24: Post-Trial Closeout (Full) | Primary | Secondary | Primary | — | — | — |
| F25: Exhibit Portfolio Dashboard and Court Templates | — | Secondary | Primary | Secondary | — | Secondary |
| F26: Case and Defendant Tracker Initialization | — | Secondary | Primary | — | — | — |
| F27: Docket Event Ingestion and Mapping | — | Secondary | Primary | Secondary | — | — |
| F28: Candidate Exclusion Engine | — | Primary | Secondary | — | — | — |
| F29: Versioned Clock Calculation and Explainability | — | Primary | Secondary | — | — | — |
| F30: Review and Approval Workflow | — | Primary | Secondary | — | — | — |
| F31: Configurable Threshold Alerts and Escalation | — | Primary | Secondary | Secondary | — | — |
| F32: Calculation Version History ("What Changed") | — | Primary | Secondary | — | — | — |
| F33: Continuance Findings Check | — | Primary | Secondary | — | — | — |
| F34: Multi-Defendant Separation | — | Primary | Secondary | — | — | — |
| F35: Case Conference View | — | Primary | Secondary | — | — | — |
| F36: Speedy Trial Portfolio Dashboard | — | Primary | Primary | Secondary | — | Primary |
| F37: Cross-Court Governance and National Configuration | — | — | Secondary | Primary | — | Secondary |
| F38: Advanced Analytics | — | Secondary | Secondary | Secondary | — | Primary |
| F39: Broader Courtroom Technology Integration | Secondary | Secondary | — | Primary | Secondary | — |

---

*Document generated by Pivota Spec Framework*
*Last updated: 2026-10-04*
