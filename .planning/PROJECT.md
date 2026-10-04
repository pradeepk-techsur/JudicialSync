# JudicialSync

## What This Is

JudicialSync is a Court Operations Modernization Suite for federal district courts, built from two interoperable modules on a shared platform foundation: an **Evidentiary Tracking System** for real-time courtroom exhibit control (offer/objection/ruling, custody, jury packages, post-trial disposition) and a **Speedy Trial Tracker** for transparent, versioned deadline monitoring (trigger events, candidate exclusions, clock calculation, continuance findings, threshold alerts). Both modules share identity/access, audit, configuration, notification, search, and case-context services, and are designed to integrate with CM/ECF (or a successor case-management platform) without replacing it as the authoritative docket.

Primary users: judges, law clerks/judicial assistants, courtroom deputies, clerks/case administrators, authorized attorneys (restricted portal), jury administrators, court administrators/AO program managers, and system administrators/security officers.

## Core Value

Give courts one current, auditable, explainable record for exhibits and speedy-trial deadlines — reducing manual paper/spreadsheet reconciliation and discrepancies — while keeping judges and authorized staff in command of every ruling, finding, override, and final determination. The system never makes legal/judicial determinations; it tracks, calculates candidates, explains, and surfaces risk.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Shared platform foundation: identity/auth (SSO + MFA), role-based + attribute-based access by court/division/case/proceeding/party-role/security-designation, case/division/proceeding/party/docket-event model, audit trail (tamper-evident, separated from operational editing), configuration engine (court profiles, local rules, numbering, thresholds, workflow states), notifications, search, task/work-queue, reporting feed
- [ ] Evidentiary Tracking: case/proceeding setup with parties, numbering, security designations
- [ ] Evidentiary Tracking: pretrial exhibit intake (structured lists + optional file upload) with validation and exception queue
- [ ] Evidentiary Tracking: exhibit ledger with identifiers, status (proposed/offered/admitted/rejected/withdrawn/substituted/sealed/returned), party, description, proceeding, confidentiality, location
- [ ] Evidentiary Tracking: real-time courtroom logging — offer, objection, ruling, withdrawal, substitution, timestamps, notes
- [ ] Evidentiary Tracking: custody and location tracking — transfer, return, storage, receipts, responsible custodian, confirmation by authorized user
- [ ] Evidentiary Tracking: dual-log / reconciliation comparison across party lists, deputy logs, admitted lists, jury packages, disposition records with exception resolution + rationale
- [ ] Evidentiary Tracking: restricted jury review package assembly (admitted electronic exhibits only, access/session controls, court authorization)
- [ ] Evidentiary Tracking: post-trial closeout — exportable exhibit list, return/retention tasks, receipts, appeal-ready audit package
- [ ] Evidentiary Tracking: search and chronology by identifier/party/witness/status/date/description/proceeding
- [ ] Speedy Trial: case/defendant tracker initialization from trigger events (manual or automatic), missing-trigger detection
- [ ] Speedy Trial: docket event ingestion (CM/ECF or structured entry) with configurable event-category mapping and unmapped-event resolution queue
- [ ] Speedy Trial: candidate exclusion engine (motions, competency, continuances, interlocutory matters, configurable categories) with accept/modify/reject review workflow
- [ ] Speedy Trial: versioned clock calculation — elapsed includable time, excluded periods, remaining time, calculation date, full "explain this date" breakdown (event, rule reference, period, status, reviewer, reason)
- [ ] Speedy Trial: continuance findings check — flag continuances missing required structured findings or order references
- [ ] Speedy Trial: configurable threshold alerts/escalation (recipients, cadence, thresholds set per court)
- [ ] Speedy Trial: calculation version history — "what changed" comparison between versions, overrides with rationale, no silent overwrite of prior approved results
- [ ] Speedy Trial: multi-defendant separation — independent clocks per defendant with relationship visibility
- [ ] Speedy Trial: case conference view — chronology, clock state, pending motions, continuance history, open issues
- [ ] Cross-cutting: work queue, case timeline (docket + hearings + evidence + clock + decisions), exception queue, review/approval workflow distinguishing proposed vs. confirmed, audit explorer (who/what/when/which rule version)
- [ ] Cross-cutting: restricted external attorney portal for structured exhibit metadata submission and authorized deadline visibility
- [ ] Role-specific UI workspaces: judge/chambers, clerk operations console, courtroom deputy interface, attorney portal, admin dashboard
- [ ] UI built on the U.S. Web Design System (USWDS, https://designsystem.digital.gov/) for federal-grade accessibility (Section 508) and visual consistency
- [ ] CM/ECF integration adapter (inbound case/party/docket-event/order sync; docket remains authoritative, no silent overwrite)
- [ ] Security/compliance: encryption in transit and at rest, malware scanning, approved file-type controls, sealed/restricted/grand-jury/juvenile/PII handling via explicit policy configuration, retention/disposition schedules

### Out of Scope

- Judicial decision-making / admissibility rulings / legal findings — the system supports, never decides; all rulings and findings remain human-authored and human-approved
- Replacing CM/ECF or any official docket/case-management system as the authoritative record
- Autonomous AI rulings or final legal conclusions — AI features (if built) are assistive only: classification suggestions, discrepancy detection, summarization, always requiring human confirmation
- Mobile native apps — web-first for this MVP; mobile considered post-MVP ("Scale" increment per vision doc)
- Defender-organization or non-federal-court deployments — initial market is federal district courts; broader adaptation is a later increment
- Full national configuration governance / cross-court administration tooling — targeted at "Scale" increment, not MVP
- Direct courtroom-technology streaming integrations (secure display/jury-review hardware integration) beyond a basic restricted digital package — deeper integration deferred to "Pilot hardening"/"Scale" increments

## Context

- Source material: `project_specs/ref_docs/Court_Operations_Trackers_Vision.txt` — a vision document prepared for TechSur Solutions describing two interoperable modules (Evidentiary Tracking, Speedy Trial Tracker) for federal district courts. It is explicitly a vision document, not a final legal/policy/security/acquisition spec — downstream specs should treat its architecture, roles, and workflows as strong design direction requiring the usual spec-generation rigor, not as literal engineering requirements.
- Grounded pain points behind the vision: courtroom deputies today commonly track exhibits on paper/spreadsheets, post-trial reconciliation is manual, and Speedy Trial calculations are manual, error-prone, and lack proactive alerts (per TechSur's pain-points research referenced in the source document).
- The vision document explicitly identifies "Decisions Required Before Detailed Design" (exhibit file storage model, custody categories, user authority matrix, CM/ECF event availability, local Speedy Trial plan variability, external counsel access scope, national vs. local governance split, continuity/retention requirements) — these are open design questions the spec suite (FRD/TechArch) should surface as explicit assumptions where the vision doesn't resolve them, since no stakeholder validation round has occurred yet.
- Design system constraint: UI must use the U.S. Web Design System (USWDS) at https://designsystem.digital.gov/ — this is a federal government design system oriented around accessibility (Section 508) and consistent federal web UX patterns. This is specified directly by the user and is binding for the TechArch/UX-Mockup generation.
- Recommended build sequence per the vision document: Foundation (shared platform + basic ledger/timeline) → Operational MVP (status updates, rulings, reconciliation, calculation+alerts+review) → Pilot hardening (custody transfers, sealing, jury package, multi-defendant, continuance findings) → Scale (templates, cross-court governance, advanced analytics). This ordering should inform phase/roadmap sequencing.
- Both modules are designed to operate independently but share identity, audit, configuration, notification, search, and case-context services — architecture should treat "shared platform services" as its own layer, not duplicate logic per module.

## Constraints

- **Design system**: Must use USWDS (https://designsystem.digital.gov/) for all UI — explicit user requirement, also aligns with Section 508 accessibility expectations for federal court software.
- **Domain/compliance**: Federal district court context implies strict security, auditability (tamper-evident audit trail), sealed/restricted-record handling, and accessibility (Section 508) are non-negotiable, not optional polish.
- **Authoritative source discipline**: The official docket/case-management system (CM/ECF or successor) remains authoritative; JudicialSync must never silently overwrite docket data — imported data retains source identifiers and discrepancies route to human review.
- **Human-in-command**: Every legally significant determination (rulings, findings, exclusions, overrides, final speedy-trial status) requires explicit human review/approval; no feature may auto-finalize these.
- **Vision-stage source material**: The uploaded vision doc is explicitly non-final ("vision document, not a final legal, policy, security, or acquisition specification") — spec generation should flag assumptions clearly rather than treat every vision-doc detail as a locked requirement.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build both Evidentiary Tracking and Speedy Trial Tracker on one shared platform (identity, audit, config, notifications, search, case context) rather than as separate siloed apps | Vision doc explicitly calls for shared foundation so courts can adopt one module first and add the second without duplicating core services | — Pending |
| Use USWDS as the UI design system | Explicit user instruction; also satisfies Section 508 accessibility expectations for a federal judiciary audience | — Pending |
| Treat the vision document as directional input requiring a full generated spec suite (PRD/FRD/TechArch/UserStories/RTM/etc.), not as a substitute for them | Vision doc self-identifies as non-final and the framework's spec-generation step requires templated outputs with IDs/traceability the raw vision doc doesn't have | — Pending |
| Scope MVP to "Foundation + Operational MVP" build-sequence content from the vision doc (core ledger, courtroom logging, reconciliation, calculation engine, alerts, review workflow) and defer "Pilot hardening"/"Scale" items (sealing, jury package, multi-defendant, cross-court governance) to later phases/v2 | Matches the vision document's own recommended build sequence and keeps v1 scope achievable | — Pending |

---
*Last updated: 2026-10-04 after initialization*
