# UX Mockup

**Project:** JudicialSync
**Generated:** 2026-10-04
**Based on:** UserStories-JudicialSync.md, PRD-JudicialSync.md, FRD-JudicialSync.md, JOURNEYS-JudicialSync.md, PERSONAS-JudicialSync.md, .planning/PROJECT.md

---

## Overview

JudicialSync's UI is built entirely on the **U.S. Web Design System (USWDS, https://designsystem.digital.gov/)**. USWDS is not a visual skin applied after the fact — it is the structural basis for every screen: layout grid, typography scale, form controls, tables, banners, and navigation all come from the USWDS component library and pattern guidance, so Section 508 conformance is inherited by construction rather than retrofitted. Every screen in this document names the specific USWDS component(s) used, and the Accessibility Notes chunk (`Y2-accessibility.md`) maps each Section 508 success criterion to the USWDS pattern that satisfies it.

The product is **four purpose-built, role-scoped workspaces** over one shared component set (work queue, exception queue, timeline, search, notifications) — never a single generic screen reskinned per role (US-11.1–US-11.4):

| Workspace | Primary User | Design Center of Gravity | Governing Principle |
|---|---|---|---|
| **Courtroom Deputy Interface** | Maria Santos (PER-01) | Speed — full-screen, low-chrome, large touch targets, keyboard-complete | "Courtroom speed": ≤3 actions per offer/ruling cycle (US-17.1); never slower than paper |
| **Judge/Chambers Workspace** | Judge Hale + law clerk Ana (PER-02) | Review & explainability — "why does the clock say this," explicit ruling/exclusion/sealing authorization | "Explain every consequential result"; human-in-command on every legally significant action |
| **Clerk/Case Administrator Console** | David Okafor (PER-03) | Configuration + portfolio operations — intake, exceptions, numbering, caseload-wide risk | Self-service configuration without IT tickets; nothing silently slips past the pretrial window |
| **Restricted External Attorney Portal** | Authorized external attorney | Narrow, read-mostly, structurally separated — no path to the official ledger | Default-deny; structurally distinct token issuer/audience so no internal write API is ever reachable |

### Design Principles (carried from PRD §4 binding architectural principles)

1. **Human-in-command, visibly.** Every ruling, exclusion confirmation, override, sealing action, and finding carries an explicit, named human actor on-screen at the moment it is recorded — never a bare status change. The deputy's UI literally reads "Judge Hale ruled: Admitted," never "Admitted." (US-16.3, US-17.1, US-21.1)
2. **Explain, don't just display.** Any calculated or suggested value (Speedy Trial date, candidate exclusion, mapped event) is one click away from its full source chain: event → rule version → period → reviewer → reason. A bare number or status pill without a drill-through is a design defect. (US-29.1, US-28.2)
3. **Courtroom speed is non-negotiable.** The deputy interface is evaluated against a ≤3-action budget per logging cycle and 100% keyboard operability before any other UX concern. Every other workspace may trade a little speed for more context; this one may not. (US-11.2, US-17.1)
4. **Proposed vs. confirmed is always visually distinct.** Pending/candidate/proposed data uses a distinct Tag/Badge style (outline, "Proposed" label) from confirmed data (solid, "Confirmed" label) everywhere it appears — ledger, timeline, calculation segments, tracker status. Never pixel-identical. (US-15.1, US-28.1, US-30.1)
5. **Nothing is silently hidden; unauthorized things simply don't exist.** Sealed/restricted records the viewer cannot access are omitted entirely from lists and search — never shown as a greyed-out or "restricted" placeholder row, which would itself leak the record's existence. (US-5.2, US-21.2)
6. **Zero orphan screens.** Every screen is reachable from its workspace's Side navigation or a parent screen's row/card click — see Navigation Map below.

---

## Navigation Map

| Screen | Route | Reached from | Nav element |
|--------|-------|--------------|-------------|
| Deputy Pre-Session Checklist | `/deputy/session/pre-check` | App shell (post-login landing for `courtroom_deputy` role) | Default landing route |
| Deputy Real-Time Logging | `/deputy/session/{sessionId}/log` | Deputy Pre-Session Checklist | Primary button: "Open Courtroom Session" |
| Deputy Session Close & Reconciliation | `/deputy/session/{sessionId}/close` | Deputy Real-Time Logging | Header action: "Close Session" |
| Deputy Custody Transfer | `/deputy/custody/{exhibitId}/transfer` | Deputy Real-Time Logging | Exhibit row action menu: "Transfer Custody" |
| Chambers Oversight Home | `/chambers/home` | App shell (default landing for `judge`/`law_clerk` role) | Default landing route |
| Live Courtroom Status (Chambers) | `/chambers/session/{sessionId}/live` | Chambers Oversight Home | Card: "Today's Proceeding — Live Status" |
| Explain This Date | `/chambers/trackers/{trackerId}/explain` | Chambers Oversight Home; Case Conference View; Threshold alert deep link; Clerk ST Portfolio | Side nav: "Speedy Trial" → tracker row → "Explain This Date" button |
| Candidate Exclusion Review | `/chambers/trackers/{trackerId}/exclusions/{exclusionId}/review` | Chambers Oversight Home (task queue); Explain This Date (segment drill-through) | Work queue task row; segment "Review" link |
| Case Conference View | `/chambers/trackers/{trackerId}/conference` | Chambers Oversight Home; Case Timeline | Side nav: "Case Conference"; Timeline card action |
| Sealing & Jury Package Authorization | `/chambers/exhibits/{exhibitId}/seal` and `/chambers/proceedings/{id}/jury-package` | Chambers Oversight Home (exhibit oversight panel) | Exhibit row action: "Seal/Release"; "Authorize Jury Package" |
| Clerk Console Home | `/clerk/home` | App shell (default landing for `clerk_case_admin` role) | Default landing route |
| Case & Proceeding Setup | `/clerk/cases/{caseId}/setup` | Clerk Console Home | Side nav: "Case Setup"; "New Case" button |
| Pretrial Intake Queue | `/clerk/intake` | Clerk Console Home | Side nav: "Intake Queue" |
| Exception Queue (Clerk view) | `/clerk/exceptions` | Clerk Console Home; Deputy/Chambers escalation links | Side nav: "Exceptions" |
| Portfolio Dashboards | `/clerk/portfolio` | Clerk Console Home | Side nav: "Portfolio" |
| Admin Dashboard Home | `/admin/home` | App shell (default landing for `system_admin`/`security_officer` role) | Default landing route |
| Configuration Engine | `/admin/config/{courtId}` | Admin Dashboard Home | Side nav: "Configuration" |
| Audit Explorer | `/admin/audit` | Admin Dashboard Home | Side nav: "Audit Explorer" |
| CM/ECF Adapter Health & Conflicts | `/admin/integrations/cmecf` | Admin Dashboard Home | Side nav: "Integrations" |
| Attorney Portal Home | `/portal/home` | External portal login | Default landing route (external auth domain) |
| Attorney Submission Form | `/portal/submissions/new` | Attorney Portal Home | Button: "Submit Exhibit Metadata" |
| Attorney Speedy Trial Summary | `/portal/trackers/{trackerId}/summary` | Attorney Portal Home | Card: associated defendant row → "View Summary" |

**Invariant check:** every screen above has at least one inbound path from its workspace's app-shell landing route or a parent screen's nav element. No screen is reachable only by typing a URL.

---

## Document Map

This document is assembled from chunk files in `project_specs/UX-Mockup/` in the following order:

1. `00-overview.md` — this file
2. `Flow-00` … `Flow-08` — user flows per major journey
3. `Screen-00` … `Screen-20` — per-screen wireframes, hierarchy, states, interactions
4. `Y0-patterns.md` — shared interaction patterns
5. `Y1-responsive.md` — responsive considerations
6. `Y2-accessibility.md` — Section 508 / USWDS accessibility notes
## User Flows

### Flow 0: Courtroom Real-Time Logging & Session Close

**Trigger:** Deputy arrives before the judge takes the bench and opens today's proceeding.
**User Stories:** US-11.2, US-17.1, US-17.2, US-17.3, US-16.3, US-18.1, US-18.2, US-18.3
**Journey:** JRN-01.1 (Pre-Session Setup → Trial Closeout)

```
[Deputy Pre-Session Checklist]
   │  (confirms proceeding, parties, exhibit list, open exceptions)
   ▼
[Open Courtroom Session] ──▶ [Deputy Real-Time Logging — full screen]
   │
   ├── Exhibit Offered ──▶ tap/keystroke "Offer" ──▶ status = offered (≤1 action)
   │
   ├── Objection Raised ──▶ select category (short list) ──▶ status = objected (≤2 actions)
   │
   ├── Judge Rules (verbal, from bench) ──▶ deputy records "ruling occurred: admit/reject"
   │        │
   │        ├── Proceeding has assigned judge ──▶ F16 transition attributed to presiding judge,
   │        │        visible instantly on Chambers Live Status (no refresh)
   │        │
   │        └── No judge assigned on proceeding ──▶ COURTROOM_NO_JUDGE_ASSIGNED (422)
   │                 ──▶ blocked, routed to Exception Queue
   │
   ├── Connectivity Disruption (any point) ──▶ entries persist to local draft buffer
   │        │
   │        └── Reconnect ──▶ auto-resync
   │                 ├── Clean ──▶ ledger updated, no user action needed
   │                 └── Conflict with concurrent update ──▶ COURTROOM_RESYNC_CONFLICT (409)
   │                          ──▶ routed to Exception Queue, both versions preserved
   │
   └── Recess / Day-End / Trial-Close ──▶ [Close Session] button
            │
            ▼
      [Deputy Session Close & Reconciliation]
            │
            ├── No discrepancies ──▶ session closes, F19 export available
            │
            ├── Discrepancies found (F18) ──▶ discrepancy list with conflicting values
            │        │
            │        ├── Resolved with rationale (≥required) ──▶ ledger updated as new version
            │        │
            │        └── Left open, high-severity ──▶ RECONCILE_UNRESOLVED_HIGH_SEVERITY (409)
            │                 ──▶ blocks close UNLESS supervisory override
            │                          ──▶ override requires its own separately logged rationale
            │
            └── Session closed ──▶ [Exportable Exhibit List] (F19) ready for certification
```

**Steps:**
1. **Pre-session checklist** (Screen-00) surfaces today's proceeding, confirms exhibit list loaded from accepted intake, and flags any open F7 exceptions tied to the proceeding before the judge takes the bench.
2. **Open session** transitions the deputy into the full-screen Real-Time Logging surface (Screen-01) — the single primary surface for the entire session.
3. Each offer/objection/ruling/withdrawal/substitution is logged in a bounded number of interactions; ruling attribution is always system-resolved to the proceeding's assigned judge, never deputy-selected (US-16.3).
4. A **connectivity disruption** at any point triggers local draft buffering; on reconnect, entries resync automatically; true conflicts route to the Exception Queue rather than silently discarding either version (US-17.2).
5. **Session close** is only reachable via the mandatory F18 reconciliation checkpoint (Screen-02) — the deputy cannot skip reconciliation without a logged supervisory override.
6. A clean close unlocks the one-click F19 export, explicitly labeled as an interim (non-final) record pending full closeout (F24).

**States covered:** default (list loaded), active-logging, offline/draft-buffer, resync-conflict, reconciliation-open, reconciliation-blocked, session-closed.
### Flow 1: Custody Transfer & Escalation

**Trigger:** Deputy needs to transfer a physical exhibit to evidence storage/custodian (overnight, recess, or post-trial).
**User Stories:** US-20.1, US-20.2, US-20.3
**Journey:** JRN-01.2 (End-of-Day Custody Transfer → Resolution Confirmed Before Next Session)

```
[Deputy Real-Time Logging] ──▶ exhibit row action: "Transfer Custody"
   │
   ▼
[Deputy Custody Transfer form] (Screen-03)
   │  recipient, purpose, location, condition note
   │
   ├── Recipient unregistered/unknown ──▶ CUSTODY_UNKNOWN_CUSTODIAN (422) — blocked
   │
   ├── Type-specific field missing (e.g., contraband auth ref) ──▶ CUSTODY_MISSING_TYPE_FIELD (422) — blocked
   │
   └── Valid submission ──▶ transferor's initiation = acknowledgment of release
            │
            ▼
      Transfer record enters `pending` ──▶ notification to designated recipient
            │
            ├── Recipient acknowledges within SLA ──▶ transfer = `completed`,
            │        custodian/location fields update, custody history entry added
            │
            └── SLA window elapses without acknowledgment
                     │
                     ▼
               CUSTODY_SLA_BREACH ──▶ escalation alert to supervisory role (F4)
                     │
                     ▼
               Supervisor/deputy follows up ──▶ acknowledgment still required (never auto-completes)
```

**Steps:**
1. From the active logging screen, the deputy opens the custody transfer form inline (no navigation away from the session).
2. Form enforces type-specific required fields (US-23.2) before submission is allowed — contraband and special-storage types block submission until satisfied.
3. The transfer sits in `pending` with a visible SLA countdown badge; only the designated recipient's explicit acknowledgment (never a timeout) completes it (US-20.2).
4. If the SLA elapses, an escalation notification fires automatically to a supervisory role — the deputy sees a visual "Escalated" tag rather than being left to notice the silence herself.

**States covered:** form-validation-error, pending-awaiting-ack, sla-warning (approaching), sla-breached-escalated, completed.
### Flow 2: Judge Live Ruling & Mid-Trial Sealing Authorization

**Trigger:** Judge is on the bench during the same session Maria is logging (Flow 0); a sensitive exhibit requires sealing.
**User Stories:** US-16.3, US-17.1, US-21.1, US-22.1
**Journey:** JRN-02.1 (Pre-Session Briefing → Post-Trial Record Review)

```
[Chambers Oversight Home] ──▶ "Today's Proceeding" card
   │
   ▼
[Live Courtroom Status panel] (read-mostly, mirrors Deputy screen in real time)
   │
   ├── Judge rules verbally from the bench (no system interaction required to rule —
   │        the deputy logs it; chambers SEES "Ruling entered: Judge Hale — Admitted"
   │        appear instantly, with timestamp, no refresh needed)
   │
   └── Counsel/deputy flags an exhibit as sensitive
            │
            ▼
      [Sealing & Jury Package Authorization] (Screen-09)
            │
            ├── Judge authorizes seal ──▶ requires authorizing_judge_id = actual judge role holder
            │        │        (a clerk cannot self-authorize — SEAL_AUTHORIZATION_DENIED, 403)
            │        ▼
            │   Exhibit sealed; excluded from jury package by default;
            │   every subsequent access attempt (success or denial) logged individually
            │
            └── Later: Release requested ──▶ symmetric judge-authorized action,
                     requires documented release_reason
   │
   ▼
[Jury Review Authorization] (same screen, package tab)
   │  Judge confirms package = admitted, non-sealed electronic exhibits only
   │
   ▼
[Post-Trial Record Review]
   │  Judge reviews certified export (F19) + sealed-access log (F21/F2) before sign-off
```

**Steps:**
1. Chambers' Live Courtroom Status panel is a **read-mostly mirror** of the deputy's logging screen — rulings appear the instant the deputy records them, explicitly attributed, with zero manual refresh (US-11.1, "live to chambers").
2. The judge never "clicks a ruling" in this flow — the deputy's entry, attributed to the judge, is what the system persists. The judge's only *write* action here is the sealing authorization, which is structurally distinct and requires his own credentials.
3. Sealing/release is a dedicated, deliberate action — never bundled into a general "edit exhibit" affordance — with a mandatory rationale on release (US-21.1).
4. Jury package authorization structurally excludes sealed/rejected/withdrawn items; the judge confirms scope rather than manually cross-checking a raw ledger (US-22.1).
5. Post-trial, the judge reviews a reviewable sealed-access log attached directly to the sealing decision — every access attempt, successful or denied, appears individually (US-21.2).

**States covered:** live-mirrored-ruling, seal-pending-authorization, sealed-active, release-pending-rationale, package-authorized, access-log-clean, access-log-flagged.
### Flow 3: Speedy Trial Threshold Alert → Explain This Date → Exclusion Review

**Trigger:** A defendant's remaining includable time crosses a configured risk threshold.
**User Stories:** US-31.1, US-31.2, US-29.1, US-29.2, US-29.3, US-28.1, US-28.2, US-30.1, US-30.2, US-33.1, US-33.2, US-35.1, US-35.2, US-34.1
**Journey:** JRN-02.2 (Threshold Alert Received → Trial Setting / Disposition Confirmation)

```
[Notification: threshold crossed] (F4, F31)
   │  generic text only — no defendant/party name; secure deep link
   ▼
[Explain This Date] (Screen-06)
   │  every segment: event → rule reference → period → status → reviewer → reason
   │
   ├── Segment uses only CONFIRMED exclusions (never candidate) — guaranteed by construction
   │
   └── Open candidate exclusion found in the chain
            │
            ▼
      [Candidate Exclusion Review] (Screen-07)
            │
            ├── Accept as-is ──▶ confirmed record references original proposal + reviewer + timestamp
            │
            ├── Modify ──▶ mandatory rationale; original proposed value preserved alongside modified record
            │
            ├── Reject ──▶ mandatory rationale; item never feeds calculation
            │
            └── Continuance-linked exclusion missing findings/order ref
                     │
                     ▼
               [Continuance Findings Flag] (inline warning banner on review screen)
                     │
                     ├── Confirm blocked by default ──▶ CONTINUANCE_INCOMPLETE_BLOCKS_CONFIRM (409)
                     │
                     └── Law clerk supplies missing reference ──▶ flag clears automatically
                              ──▶ exclusion can now proceed through normal review
   │
   ▼
[Case Conference View] (Screen-08)
   │  clock state + pending motions + continuance history + open issues, one screen
   │  multi-defendant matters: explicit per-defendant panel, never collapsed
   │
   ▼
[Trial Setting / Disposition Confirmation]
   │  judge states the date, referencing the explained calculation directly
```

**Steps:**
1. Alert content is generic ("A Speedy Trial threshold has been reached for a case on your docket") with a secure deep link requiring re-authentication — never defendant-identifying detail in the body/preview (US-4.1).
2. **Explain This Date** is the trust-anchor screen: every timeline segment shows its contributing event, rule reference, period, review status, reviewing user, and reason — with a persistent, non-dismissable "decision support, not a legal determination" label (US-29.1).
3. Any segment traceable to an **unreviewed candidate** surfaces a direct "Review" link into the Candidate Exclusion Review screen — the judge never has to hunt for what's pending.
4. Accept/Modify/Reject are three structurally distinct actions, not one dropdown with a free-text box — Modify and Reject both force a rationale field to appear and block submission until populated (US-30.1).
5. **Continuance Findings Check** never evaluates legal sufficiency — it only checks field presence and shows a flag-only warning banner; resolution is a simple "attach reference" action, not a legal judgment screen (US-33.1).
6. Case Conference View assembles confirmed state only by default, with pending/candidate items clearly separated under an "Open Items" heading — never merged into "current state" (US-35.1).
7. Multi-defendant matters always render a **co-defendant panel** — the system structurally cannot present one collapsed case-level status (US-34.1).

**States covered:** alert-unacknowledged, alert-acknowledged, explain-clean, explain-with-pending-segment, exclusion-review-pending, exclusion-accepted, exclusion-modified, exclusion-rejected, continuance-incomplete-blocked, continuance-resolved, conference-packet-partial.
### Flow 4: Pretrial Exhibit Intake & Exception Triage

**Trigger:** Clerk sets up a new proceeding ahead of trial and processes attorney-submitted exhibit lists (internal and external-portal submissions alike).
**User Stories:** US-14.1, US-14.2, US-15.1, US-15.2, US-15.3, US-12.1, US-12.3, US-7.1, US-7.2
**Journey:** JRN-03.2 (New Case Setup → Clean Handoff to Courtroom)

```
[Case & Proceeding Setup] (Screen-11)
   │  numbering scheme (must be active/published), security designations, parties bound
   │
   ├── No proceeding exists yet ──▶ EXHIBIT_SETUP_NO_PROCEEDING (422) — blocked
   │
   └── Setup complete ──▶ exhibit-tracking "active"; F15 intake + F16 ledger unlocked
   │
   ▼
[Pretrial Intake Queue] (Screen-12)
   │  submissions from internal staff AND external attorney portal (submitted_via tag visible)
   │
   ├── Missing required field ──▶ INTAKE_MISSING_METADATA (422) ──▶ routed to Exception Queue
   │
   ├── File fails malware scan / disallowed type ──▶ INTAKE_FILE_REJECTED / INTAKE_UNSUPPORTED_FORMAT (422)
   │
   ├── Exact file-hash duplicate ──▶ INTAKE_DUPLICATE (409) ──▶ both/all versions preserved for review
   │
   └── Clean submission ──▶ clerk Accept / Reject / Request Correction
            │
            ├── Accept ──▶ promoted to F16 ledger entry in `proposed` status
            │
            ├── Reject / Request Correction ──▶ reason relayed to submitter (never a bare rejection)
            │
            └── External submitter attempts self-accept ──▶ INTAKE_EXTERNAL_ACCEPT_DENIED (403) — structurally blocked
   │
   ▼
[Exception Queue — Clerk view] (Screen-13)
   │  filterable by module/type/severity/age; aging indicator visible
   │
   ├── Resolve with rationale (≥10 chars) ──▶ EXCEPTION_RATIONALE_REQUIRED/TOO_SHORT (422) if insufficient
   │
   └── Recurring pattern noticed ──▶ deep link to [Configuration Engine] to fix root cause
   │
   ▼
[Clean Handoff] ──▶ ledger status visible in Deputy Pre-Session Checklist (Screen-00)
```

**Steps:**
1. Numbering scheme selection is locked once any exhibit is assigned (`EXHIBIT_SETUP_SCHEME_LOCKED`) — the setup screen makes this consequence visible via a warning Alert before the first exhibit is accepted.
2. The Intake Queue shows **internal and external-portal submissions side by side**, distinguished only by a `submitted_via` Tag — never a separate queue, so nothing requires a second review surface (US-12.3).
3. Duplicate detection surfaces both conflicting submissions in one comparison view rather than silently picking one (US-15.2).
4. Accept/Reject/Request-Correction are three explicit buttons; rejection or correction always opens a required-reason Textarea before submission completes (US-15.3).
5. Exception resolution is structurally identical to F18 reconciliation resolution (same required-rationale pattern) so clerks learn one interaction, not several.
6. A clerk noticing a **recurring** exception pattern can jump directly to the Configuration Engine from the exception detail panel — closing the loop from symptom to root cause same-day, no IT ticket (US-3.3, JRN-03.2 delight moment).

**States covered:** setup-incomplete, setup-locked-scheme, intake-pending-review, intake-duplicate-flagged, intake-accepted, intake-rejected, exception-open, exception-aging-warning, exception-resolved.
### Flow 5: Clerk Speedy Trial Lifecycle — Tracker Init → Event Mapping → Portfolio

**Trigger:** New defendant enters the clerk's caseload via CM/ECF arraignment event.
**User Stories:** US-26.1, US-26.2, US-26.3, US-27.1, US-27.2, US-6.1, US-36.2
**Journey:** JRN-03.1 (Tracker Opened → Trial or Disposition Closeout)

```
[CM/ECF arraignment event detected] (F10 → F27)
   │
   ▼
Tracker auto-proposed, `proposed` state, candidate start context pre-populated
   │
   ├── No matching trigger event found for a defendant with case activity
   │        ──▶ TRACKER_MISSING_TRIGGER exception ──▶ clerk creates tracker manually (fallback)
   │
   └── Chambers reviewer confirms start context (see Flow 3) ──▶ tracker = `confirmed`
   │
   ▼
[Docket event ingested] ──▶ auto-mapped to configured category
   │
   ├── Matches configured rule ──▶ event_category assigned automatically, no clerk action needed
   │
   └── No matching rule ──▶ EVENT_UNMAPPED ──▶ routed to Exception Queue with raw source code preserved
            │
            ▼
      Clerk classifies the individual event immediately (entitlement: exclusion_reviewer-equivalent)
            │
            └── Pattern recurs ──▶ clerk requests a new standing mapping rule
                     ──▶ routes through Configuration Engine maker-checker (F3)
   │
   ▼
[My Work Queue] (shared F6 component, clerk-scoped)
   │  cross-module tasks: exception resolution, exclusion review hand-offs, config approvals
   │
   ▼
[Portfolio Dashboards — Speedy Trial] (Screen-14)
   │  which of 40 cases needs attention today: approaching thresholds, data gaps, unreviewed exclusions
   │
   └── Drill-through ──▶ Case Conference View (Screen-08) for the specific tracker
```

**Steps:**
1. Automatic tracker proposal never reaches `confirmed` on its own — the clerk sees a **"Pending chambers confirmation"** tag until a judge/exclusion-reviewer acts (US-26.1, US-26.2).
2. A defendant with case activity but no detected trigger produces a visible exception rather than silence — the clerk's queue shows "Missing trigger event" as its own exception type, never an absent row (US-26.3).
3. The event mapping screen shows a running tally ("12 of 480 events unmapped this month") so the clerk can see the unmapped rate trending down over time, directly supporting the PRD success metric.
4. Portfolio Dashboard risk indicators (approaching-threshold, data-gap, unreviewed-exclusion, stale-calculation) are each their own filter chip — the clerk never has to open cases one-by-one to triage (US-36.1 analog for clerk-accessible scope; court-level view is US-36.2, admin-gated).

**States covered:** tracker-proposed, tracker-missing-trigger, tracker-confirmed, event-auto-mapped, event-unmapped-open, event-resolved, portfolio-clean, portfolio-risk-flagged.
### Flow 6: Admin Configuration Change (Maker-Checker) & CM/ECF Conflict Resolution

**Trigger:** Clerk requests a configuration change; concurrently the CM/ECF adapter flags a sync conflict.
**User Stories:** US-3.1, US-3.2, US-3.3, US-10.1, US-10.2, US-0.3
**Journey:** JRN-04.2 (Configuration Change Requested → Verification via Audit Explorer)

```
[Clerk drafts config change] ──▶ Work Queue task: "config_approval" created
   │
   ▼
[Configuration Engine — Draft Review] (Screen-16)
   │
   ├── Same user who drafted attempts to publish ──▶ CONFIG_SOD_VIOLATION (403) — structurally blocked
   │        (publish button is disabled with tooltip, not merely re-rejected server-side)
   │
   ├── Draft fails structural validation (orphaned state, threshold gap) ──▶ CONFIG_INVALID_STRUCTURE (422)
   │
   └── Distinct second approver reviews + publishes
            │
            ▼
      New immutable rule_package_version created, effective-from timestamp set
      Prior version remains retrievable; in-flight calculations NOT retroactively recalculated
            │
            ▼
      Audit event: before/after diff + drafter + approver identities

[CM/ECF Adapter Health & Conflicts] (Screen-18) — concurrent thread
   │
   ▼
Inbound docket update conflicts with a locally modified field
   │
   ├── Field never locally modified ──▶ auto-updated silently (not a conflict)
   │
   └── Field WAS locally modified ──▶ CMECF_SYNC_CONFLICT (409, internal)
            │
            ▼
      [Sync Conflict Resolution panel] — both values shown side by side,
      source_identifier preserved on each
            │
            ├── Admin selects CM/ECF value ──▶ marked source_system, audit-logged
            │
            └── Admin selects local value ──▶ marked manual_override, audit-logged
                     (never a silent pick — both paths require explicit selection + are logged)
   │
   ▼
[Verification via Audit Explorer] (Screen-17)
   │  confirms both actions attributed, versioned, segregated from routine operational actions
```

**Steps:**
1. The **publish** control for a drafted configuration is rendered disabled (with an inline USWDS Tooltip: "A second approver is required") whenever the viewing user is also the drafter — separation of duties is visible in the UI, not just enforced server-side as a rejected request (US-3.2, US-0.3).
2. Draft validation errors appear inline, field-by-field (e.g., a red Alert under the specific threshold tier row showing the gap), never as a single generic failure banner.
3. CM/ECF conflicts are never auto-resolved toward either side — the resolution panel always requires an explicit admin click on one of the two preserved values, each visibly labeled with its `source_identifier` (US-10.1).
4. The Audit Explorer provides a single filtered view (object = this rule_package_version OR this docket record) so Priya can confirm, within the same investigation session, that both the configuration publish and the conflict resolution were properly attributed and segregated (US-2.1).

**States covered:** draft-editing, draft-validation-error, publish-blocked-sod, published, sync-auto-updated, sync-conflict-open, sync-conflict-resolved.
### Flow 7: Sealed-Record Access Investigation via Audit Explorer

**Trigger:** A defense attorney disputes that a sealed exhibit was improperly viewed.
**User Stories:** US-2.1, US-2.2, US-2.3, US-21.2, US-0.2
**Journey:** JRN-04.1 (Dispute Reported → Findings Delivered)

```
[Admin Dashboard Home] ──▶ "Dispute Reported" — admin opens Audit Explorer scoped to the exhibit
   │
   ▼
[Audit Explorer] (Screen-17)
   │  filters: case_id, user_id, date_range, object_type = exhibit
   │
   ├── Requester lacks audit_reader entitlement ──▶ AUDIT_READ_DENIED (403)
   │
   └── Authorized query ──▶ chronological list: actor, action_type, before/after diff,
            rule/calculation version link — EVERY access attempt (success + denied) shown individually
   │
   ▼
[Access Control Cross-Check]
   │  for each access row, admin opens the user's role/attribute scope AS IT WAS at that timestamp
   │  (Identity & Role Management screen, point-in-time view)
   │
   ▼
[Rule-Version Linkage Review]
   │  confirms which sealing authorization (F21) was in effect at the moment of each access
   │  — every audit row links directly to the authorizing judge action, no gray area
   │
   ▼
[Findings Delivered]
   │  structured report exported: every access row + authorization linkage + conclusion
   │  (uses same export pattern as F9 reporting — de-identified where appropriate, role-limited)
```

**Steps:**
1. The Audit Explorer is **strictly read-only** — no edit/delete affordance exists anywhere in its UI, and the underlying write API is service-to-service only, never reachable from this screen (US-2.3).
2. Hash-chain integrity is visually confirmed via a persistent "Chain verified ✓" Summary Box at the top of any query result; a detected break would instead surface as a blocking critical Alert, never a quiet log line (US-2.2).
3. An attempt to view sealed-case audit entries without the matching security-designation entitlement returns a 403 that is **itself** logged as a new audit row — visible the next time anyone queries this same object (US-2.1, recursive accountability).
4. Direct-ID access attempts against a sealed exhibit by an unauthorized party return "not found," never "access denied" — the investigation screen reflects this by showing denied attempts as their own distinct row type so Priya can distinguish "tried and was told no" from "tried and the system said it doesn't exist" (US-21.2).

**States covered:** query-unauthorized, query-authorized-clean, query-shows-denied-attempts, chain-verified, chain-broken-escalated, findings-exported.
### Flow 8: Attorney Portal — Submission & Deadline Visibility

**Trigger:** An authorized external attorney needs to submit exhibit metadata or check a client's Speedy Trial status.
**User Stories:** US-12.1, US-12.2, US-12.3
**Journey:** Supports JRN-03.2 (Attorney Submission Received, from the clerk's receiving side)

```
[Attorney Portal Login] (external IdP, structurally distinct token issuer/audience)
   │
   ▼
[Attorney Portal Home] (Screen-19)
   │  shows only cases where attorney holds active, CM/ECF-sourced party-of-record association
   │
   ├── Submit Exhibit Metadata
   │        │
   │        ▼
   │  [Attorney Submission Form]
   │        │
   │        ├── No party-of-record association for case ──▶ PORTAL_NOT_PARTY_OF_RECORD (403)
   │        │
   │        └── Valid ──▶ submission enters `proposed`, submitted_via = 'external_portal'
   │                 ──▶ routes into standard F15 intake queue (Flow 4) — identical review path
   │                 ──▶ attorney CANNOT self-accept (INTAKE_EXTERNAL_ACCEPT_DENIED, 403 — no such control exists in this UI)
   │
   └── View Speedy Trial Summary
            │
            ▼
      [Attorney Speedy Trial Summary] (Screen-20) — read-only
            │
            ├── Case has a security designation ──▶ PORTAL_DESIGNATION_DENIED (403)
            │        unless individually authorized by the court
            │
            └── Authorized ──▶ remaining time, next threshold, confirmed trigger/exclusion periods ONLY
                     (no explainability detail, no override history, no write affordance anywhere)
```

**Steps:**
1. The portal's entire visible case list is pre-filtered to the attorney's party-of-record associations — there is no search box that could be used to probe for other cases' existence (consistent with F5 sealed-record non-disclosure principle).
2. The submission form is visually and structurally identical to the internal intake form clerks use, *minus* any status/review controls — reinforcing that external submissions receive identical validation, not a lesser or different path (US-12.1, US-12.3).
3. The Speedy Trial Summary screen has **zero interactive controls beyond read/export** — no edit icons, no status dropdowns — because the external token's audience claim cannot invoke any write endpoint even if a control were mistakenly rendered (US-12.2).
4. A security-designated case is never shown in degraded/greyed form — it is absent from the attorney's case list entirely, consistent with the platform-wide non-disclosure-of-existence principle.

**States covered:** portal-authenticated, case-list-scoped, submission-pending-review, submission-denied-not-party, summary-visible, summary-denied-designation.
## Screen Designs

### Screen 00: Deputy Pre-Session Checklist

**Purpose:** Confirms today's proceeding, parties, and exhibit list are correctly loaded before the judge takes the bench; surfaces any open exceptions tied to the proceeding so Maria never walks in blind.
**User Stories:** US-11.2, US-14.1, US-6.1, US-7.2
**Workspace:** Courtroom Deputy Interface

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ USWDS Banner (.gov identifier)                                    │
│ USWDS Header (basic) — Court seal, "JudicialSync", user menu      │
├──────────────────────────────────────────────────────────────────┤
│  Proceeding: United States v. Alvarez — Trial Day 1               │
│  Dept. 4 — Judge Robert Hale                    [Step Indicator]   │
│  ●───●───○───○   Setup → Verify → Open Session → Log              │
├──────────────────────────────────────────────────────────────────┤
│  ┌─ Summary Box ───────────────────────────────────────────────┐  │
│  │ Exhibit list: 24 proposed, 24 accepted, 0 pending intake     │  │
│  │ Parties bound: Government, Defense ✓                         │  │
│  │ Numbering scheme: USDC-EDNY-2026 ✓                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ⚠ Alert (warning, standard): "1 open exception tied to this        │
│     proceeding — duplicate submission flagged last night."          │
│     [Review Exception →]                                            │
│                                                                      │
│  ┌─ Card: Accepted Exhibit List (preview) ─────────────────────┐    │
│  │ Table (USWDS Table, borderless, compact)                    │    │
│  │ # | Description          | Party       | Status             │    │
│  │ 1 | Signed lease agree.  | Government  | Proposed           │    │
│  │ 2 | Photograph — scene A | Government  | Proposed           │    │
│  │ ...                                                          │    │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│              [ Open Courtroom Session ]  ← USWDS Button (big, primary) │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Banner, Header (basic), Step Indicator, Summary Box, Alert (warning), Card, Table (borderless/compact), Button (big, primary action).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | "Open Courtroom Session" button + open-exception warning | Bottom-center button; top Alert |
| Secondary | Exhibit list readiness summary box | Upper-center |
| Tertiary | Full accepted-exhibit preview table | Scrollable card below summary |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Default (clean) | Summary Box all green checks, no Alert | None needed — button enabled |
| Open exception present | Warning Alert banner above summary | "1 open exception tied to this proceeding" + deep link |
| Exhibit list incomplete | Summary Box row shows "3 pending intake" in amber | Button remains enabled (session can open; list loads what's accepted) |
| No proceeding assigned judge | Error Alert, blocking | "This proceeding has no presiding judge assigned — rulings cannot be logged until assigned" (COURTROOM_NO_JUDGE_ASSIGNED risk surfaced proactively) |
| Loading | USWDS Skeleton-style placeholder rows | "Loading today's proceeding…" |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Open Courtroom Session" | USWDS Button, primary, large | Navigates to Screen-01, binds session to proceeding |
| "Review Exception →" | USWDS Link (within Alert) | Deep-links to Exception Queue (Screen-13), pre-filtered to this proceeding |
| Exhibit table rows | Read-only | No action — preview only; full interaction happens in Screen-01 |
### Screen 01: Deputy Real-Time Logging (Courtroom Speed Surface)

**Purpose:** The single, full-screen, low-chrome surface for logging exhibit offers, objections, rulings, withdrawals, and substitutions during live proceedings — the make-or-break screen for the entire product per PRD/vision "courtroom speed" principle.
**User Stories:** US-11.2, US-17.1, US-17.2, US-16.3, US-20.1
**Workspace:** Courtroom Deputy Interface

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Minimal Header: session clock 00:42:17 | Dept 4 | ● LIVE | [Close]│
├──────────────────────────────────────────────────────────────────┤
│ Quick-filter tags: [All] [Pending] [Offered] [Objected] [Ruled]    │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────┐  ┌─────────────────────────────┐  │
│ │ EXHIBIT LIST (large rows)  │  │ ACTIVE EXHIBIT PANEL         │  │
│ │                             │  │                               │  │
│ │ ① Lease agreement   [Tag:  │  │  Exhibit 1 — Lease agreement  │  │
│ │    Govt]  Proposed         │  │  Offered by: Government       │  │
│ │  ┌────────┐                │  │                               │  │
│ │  │ OFFER  │ ← big touch    │  │  [ OFFER ]   [ WITHDRAW ]      │  │
│ │  └────────┘   target       │  │                               │  │
│ │                             │  │  Objection category:          │  │
│ │ ② Photo — scene A  [Tag:   │  │  (•) None  ( ) Relevance       │  │
│ │    Govt]  Offered           │  │  ( ) Hearsay ( ) Foundation    │  │
│ │  ┌─────────┐┌────────────┐ │  │  ( ) Other (+note)             │  │
│ │  │ OBJECT  ││ (awaiting   │ │  │                                │  │
│ │  └─────────┘│  ruling)    │ │  │  Ruling (judge spoken aloud):  │  │
│ │              └────────────┘ │  │  [ ADMIT ]      [ REJECT ]     │  │
│ │ ③ Video clip       Pending │  │                                │  │
│ │  ┌────────┐                │  │  Notes (optional): __________  │  │
│ │  │ OFFER  │                │  │                                │  │
│ │  └────────┘                │  │  Last action: 10:42:03 AM —    │  │
│ │                             │  │  "Ruling entered: Judge Hale   │  │
│ │ [+ Quick-add unlisted]      │  │   — Admitted" ✓ saved          │  │
│ └────────────────────────────┘  └─────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│  ⚠ Offline — entries saving locally, will resync (if disconnected)│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Header (minimal/custom extended per USWDS guidance for application shells), Tag (status filter chips + exhibit status Tags), Card, Button (big touch-target, keyboard-accessible, `aria-keyshortcuts`), Radio buttons (objection category, large), Site Alert (offline banner), Text input (notes), Icon (status glyphs).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | OFFER / OBJECT / ADMIT / REJECT action buttons for the selected exhibit | Right-hand Active Exhibit Panel, large and central |
| Primary | Exhibit list with current status Tag | Left column, persistent |
| Secondary | Objection category selector | Right panel, appears only when relevant |
| Secondary | Last-action confirmation line ("Ruling entered: Judge Hale") | Bottom of right panel |
| Tertiary | Optional free-text notes | Collapsed/small, right panel |
| Tertiary | Offline/sync status | Bottom banner, only shown when relevant |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Default (exhibit selected) | Action buttons enabled, large | None — ready for input |
| Offer submitted | Exhibit Tag updates to "Offered" instantly | Brief inline checkmark animation, timestamp shown |
| Objection recorded | Tag → "Objected"; ruling buttons become primary focus | Category shown as sub-tag |
| Ruling recorded | Tag → "Admitted"/"Rejected" (solid, judge-attributed) | "Ruling entered: Judge Hale — Admitted ✓" confirmation line, live-pushed to Chambers |
| No judge assigned | ADMIT/REJECT buttons disabled, Alert shown inline | "Cannot record ruling: no presiding judge assigned" (COURTROOM_NO_JUDGE_ASSIGNED) + "Flag for clerk" link |
| Invalid transition | Button shows disabled + tooltip | "This exhibit's status does not allow this action" (COURTROOM_INVALID_ACTION) |
| Offline/draft-buffer | Persistent amber Site Alert banner at bottom | "Working offline — entries saved locally and will sync automatically" |
| Resync conflict | Exhibit row gets a Tag: "Needs Review" | Routed to Exception Queue; deputy sees non-blocking badge, keeps logging |
| Quick-add unlisted exhibit | Inline mini-form expands below list | Required fields (description, offering party) must be completed before save; incomplete entries flagged at session close |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| OFFER | Button, primary, ≥44px target, keyboard shortcut `O` | Single action marks exhibit `offered`, auto-timestamped |
| OBJECT | Button, secondary, shortcut `J` | Opens objection-category radio group (one more action to complete, total ≤2 for this cycle) |
| ADMIT / REJECT | Button, primary (judge-ruling color convention), shortcuts `A` / `R` | Records ruling as occurring; system auto-resolves `presiding_judge_id`; never deputy-selectable |
| WITHDRAW / SUBSTITUTE | Button, tertiary, shortcut `W` / `S` | Same single-action pattern, timestamped, optional note |
| Quick-add unlisted | Link/Button, shortcut `N` | Expands minimal inline form; routes to Exception Queue at close if incomplete |
| Notes field | Text input, optional | Free text, never required, never auto-populated |
| Close (header) | Button, top-right | Navigates to Screen-02 (Session Close & Reconciliation) — mandatory checkpoint |
| Exhibit row "⋯" menu | Icon button | "Transfer Custody" → Screen-03 |

**Keyboard operability:** every action above (offer/object/rule/withdraw/substitute/quick-add/close) is reachable via a documented single-key shortcut with visible `aria-keyshortcuts` hints, satisfying US-17.1's "fully operable via keyboard shortcuts" acceptance criterion without requiring mouse/touch.
### Screen 02: Deputy Session Close & Reconciliation Checkpoint

**Purpose:** Mandatory F18 reconciliation gate triggered by session close — compares the live ledger against party lists, session log, jury package manifest, and disposition records, surfacing discrepancies before the session can be marked closed.
**User Stories:** US-17.3, US-18.1, US-18.2, US-18.3
**Workspace:** Courtroom Deputy Interface

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Header: "Close Session — Trial Day 1"           [Back to Logging] │
├──────────────────────────────────────────────────────────────────┤
│ Step Indicator:  ●Gathering sources → ●Comparing → ○Resolve → ○Done│
├──────────────────────────────────────────────────────────────────┤
│  ┌─ Summary Box ───────────────────────────────────────────────┐  │
│  │ Sources compared: Ledger ✓ | Session log ✓ | Party lists ✓  │  │
│  │                   Jury manifest — (none yet this trial)      │  │
│  │ Discrepancies found: 2 (1 high severity, 1 medium)           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ Accordion: Discrepancy #1 (HIGH) — Exhibit 14 ─────────────┐   │
│  │  Session log says: "Admitted"                                │   │
│  │  Government's list says: "Withdrawn"                         │   │
│  │  ( ) Accept session log value   ( ) Accept party list value  │   │
│  │  ( ) Enter different value: ______________                   │   │
│  │  Rationale (required): _______________________________       │   │
│  │                                        [ Resolve Discrepancy ]│  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ Accordion: Discrepancy #2 (MEDIUM) — Exhibit 9 ────────────┐   │
│  │  (collapsed — click to expand)                                │   │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  🛑 Alert (error): "1 high-severity discrepancy remains unresolved.  │
│     Session cannot close." [Supervisory Override →] (if entitled)   │
│                                                                      │
│                            [ Close Session ]  ← disabled until clear│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Step Indicator, Summary Box, Accordion (one per discrepancy, bordered variant), Radio buttons, Textarea (rationale, required), Alert (error, blocking), Button (disabled state with explanatory tooltip).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Blocking Alert + disabled "Close Session" button when high-severity items remain | Bottom, impossible to miss |
| Primary | Discrepancy Accordion list, high severity first | Center, sorted by severity then age |
| Secondary | Source-comparison Summary Box | Top |
| Tertiary | Supervisory override link | Only visible to supervisory role, inside the blocking Alert |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Gathering sources | Step 1 active, spinner-style progress | "Comparing ledger against all available sources…" |
| Source unavailable | Summary Box row shows amber "⚠ Unavailable" | "Jury package manifest could not be loaded — reconciliation is partial" (RECONCILE_SOURCE_UNAVAILABLE, 206) |
| Clean (no discrepancies) | Summary Box: "0 discrepancies found" in green | "Close Session" button enabled immediately |
| Discrepancies open | Accordion list populated, severity Tags (red=high, amber=medium) | Button disabled; blocking Alert shown |
| Resolving | Accordion expanded, Resolve button enabled only once rationale ≥ required length | Inline character-count helper (USWDS Character count component) |
| Resolved | Accordion collapses, row shows green check + "Resolved by M. Santos — [rationale snippet]" | Audit event reference displayed |
| All resolved | Blocking Alert disappears | "Close Session" button becomes enabled |
| Supervisory override | Confirmation Modal requiring its own rationale | "This bypasses the reconciliation gate — provide justification" (double-gated per US-18.3) |
| Closed | Step 4 complete | Redirect to F19 export screen with "Session closed — export ready" Alert (success) |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Discrepancy Accordion header | USWDS Accordion trigger | Expands/collapses; severity Tag always visible even collapsed |
| Radio group (accept value) | Radio buttons | Selecting a value enables the rationale field |
| Rationale Textarea | Required, min-length enforced (10 chars) | "Resolve Discrepancy" disabled until valid (EXCEPTION_RATIONALE_TOO_SHORT prevented client-side, re-validated server-side) |
| "Resolve Discrepancy" | Button, per-accordion | Submits resolution; updates ledger as new exhibit version + audit event if value changed |
| "Supervisory Override →" | Link, role-gated (only rendered for supervisory entitlement) | Opens Modal requiring separate rationale; logs RECONCILE_OVERRIDE as its own audit event |
| "Close Session" | Button, primary | Disabled (with tooltip "Resolve all high-severity discrepancies first") until gate clears |
### Screen 03: Deputy Custody Transfer

**Purpose:** Lets the deputy initiate a custody transfer (recipient, purpose, location, condition) inline, without leaving the courtroom logging context, replacing the paper sign-out sheet.
**User Stories:** US-20.1, US-20.2, US-20.3, US-23.2
**Workspace:** Courtroom Deputy Interface

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Modal / Side panel: "Transfer Custody — Exhibit 7 (Firearm)"  [X] │
├──────────────────────────────────────────────────────────────────┤
│  Exhibit type: Contraband  [Tag: special handling]                │
│                                                                     │
│  Recipient (Combo Box, searches registered custodians):            │
│  [ Evidence Custodian — J. Reyes                           ▾ ]     │
│                                                                     │
│  Purpose:        ( ) Overnight storage  ( ) Lab transfer  ( ) Other│
│  Location:       [ Evidence Room B-14                       ]      │
│  Condition note: [ Intact, bagged, tagged                   ]      │
│                                                                     │
│  ⚠ Contraband authorization reference (required for this type):    │
│  [ CA-2026-0417                                              ]      │
│                                                                     │
│  Transferor acknowledgment: initiating this transfer constitutes    │
│  your release acknowledgment (M. Santos, 10:58 AM)                  │
│                                                                     │
│                        [ Cancel ]   [ Initiate Transfer ]           │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Modal, Tag, Combo Box, Radio buttons, Text input, Alert (warning, inline for type-specific requirement), Button group.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Recipient selection + type-specific required field | Upper half, cannot submit without both |
| Secondary | Purpose, location, condition note | Middle |
| Tertiary | Transferor acknowledgment statement (informational, not an input) | Bottom, above actions |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Default | Form empty, submit disabled | — |
| Unknown recipient entered | Combo Box shows "No match found" | "Recipient must be a registered custodian" (CUSTODY_UNKNOWN_CUSTODIAN) |
| Type-specific field missing | Red outline + inline error on auth-reference field | "Contraband transfers require an authorization reference" (CUSTODY_MISSING_TYPE_FIELD) |
| Valid, ready | "Initiate Transfer" enabled | — |
| Submitted | Modal closes, exhibit row shows "Pending — awaiting J. Reyes" Tag | Toast: "Transfer initiated — recipient notified" |
| SLA approaching | Tag turns amber with countdown | "Acknowledgment due in 2h" |
| SLA breached | Tag turns red: "Escalated" | Notification sent to supervisory role automatically |
| Acknowledged | Tag turns green: "Completed — confirmed by J. Reyes, 11:40 AM" | Custody history entry added, visible in exhibit detail |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Recipient Combo Box | USWDS Combo Box | Autocomplete against registered custodian directory only — no free text accepted |
| Purpose radio group | Radio buttons | Determines which type-specific fields render below |
| Contraband auth reference | Text input, conditionally required | Rendered only for contraband/special-storage types (US-23.2) |
| "Initiate Transfer" | Button, primary | Disabled until all required fields valid; submission = transferor's acknowledgment of release |
| "Cancel" | Button, secondary | Closes modal, no record created |
### Screen 04: Chambers Oversight Home

**Purpose:** The judge/chambers landing workspace composing case timeline, pending approvals, exhibit status oversight, and a pre-session briefing — so Judge Hale and Ana see what needs attention without hunting across screens.
**User Stories:** US-11.1, US-8.1, US-6.1, US-6.2
**Workspace:** Judge/Chambers Workspace

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Header | Side Navigation: Home · Timeline · Speedy Trial ·        │
│         Case Conference · Exhibits · Audit (if entitled)          │
├────────────┬───────────────────────────────────────────────────┤
│            │  Today's Proceeding — United States v. Alvarez       │
│  Side Nav  │  ┌─ Card: Live Courtroom Status ──────────────────┐  │
│  (persist) │  │ ● LIVE — Exhibit 2 ruled: "Admitted" (Judge Hale│  │
│            │  │   via deputy, 10:42:03 AM)      [View Live →]   │  │
│            │  └──────────────────────────────────────────────────┘  │
│            │                                                       │
│            │  ┌─ Pending Approvals (Work Queue, this role) ──────┐ │
│            │  │ ⚠ Candidate exclusion — U.S. v. Reyes  [Review]  │ │
│            │  │ ⚠ Continuance findings incomplete — U.S. v. Cho  │ │
│            │  │   [Review]                                        │ │
│            │  │ ○ Config approval needed (n/a — not chambers role)│ │
│            │  └────────────────────────────────────────────────────┘ │
│            │                                                       │
│            │  ┌─ Exhibit Status Oversight (read + ruling action) ─┐│
│            │  │ Table: # | Description | Status | Last action     ││
│            │  │ (ruling controls only enabled if entitled + live)  ││
│            │  └────────────────────────────────────────────────────┘ │
│            │                                                       │
│            │  [Explain This Date] quick card for 3 active trackers │
└────────────┴───────────────────────────────────────────────────┘
```

**USWDS components:** Side navigation, Header (extended), Card, Table (compact), Tag (status), Icon (alert glyphs), Button (links styled as secondary buttons for "Review"/"View Live").

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Live Courtroom Status card (if a session is active today) | Top of content area |
| Primary | Pending Approvals queue (exclusion review, continuance findings, ruling-adjacent tasks) | Upper-middle, sorted by age/priority |
| Secondary | Exhibit status oversight table | Mid-page |
| Tertiary | Quick-access Explain-This-Date cards for active trackers | Lower section |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| No session today | Live Courtroom Status card hidden/replaced | "No proceeding scheduled today" |
| Session live | Card pulses subtly with "● LIVE" indicator, updates without refresh | Real-time ruling text appears the instant deputy logs it |
| Pending approvals present | Queue populated, aged items visually flagged (border-left accent) | Oldest-first ordering |
| No pending approvals | Empty-state illustration + text | "Nothing needs your review right now" |
| Component unavailable | Card shows partial-availability Alert | "Part of this workspace is temporarily unavailable" (UI_COMPONENT_UNAVAILABLE, 206) — rest of page still usable |
| No workspace assigned (edge case) | Full-page Alert | "No workspace is configured for your account; contact an administrator" (UI_NO_WORKSPACE_ASSIGNED) |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "View Live →" | Link/Button | Opens Live Courtroom Status full panel (mirrors Screen-01, read-mostly) |
| "Review" (per task) | Button | Deep-links to Screen-07 (Candidate Exclusion Review) or continuance-flag detail |
| Exhibit table "Ruling" control | Button, conditionally rendered/enabled | **Only enabled** if viewer holds judge entitlement AND exhibit is in a ruleable state — read-only viewers never see this control enabled, even though the row is visible (US-11.1 entitlement-not-role-label rule) |
| "Explain This Date" card | Card, clickable | Navigates to Screen-06 for that tracker |
### Screen 05: Live Courtroom Status (Chambers Mirror)

**Purpose:** A read-mostly, real-time mirror of the deputy's logging screen so Judge Hale (from the bench, on a secondary display) and Ana (from chambers) see every offer/objection/ruling the instant it's recorded, with explicit attribution — without ever appearing to let the system decide anything.
**User Stories:** US-17.2, US-16.3, US-11.1
**Workspace:** Judge/Chambers Workspace

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ ● LIVE — United States v. Alvarez — Dept. 4            [Minimize] │
├──────────────────────────────────────────────────────────────────┤
│  Activity stream (reverse-chronological, auto-scrolling):          │
│                                                                      │
│  10:42:03 AM  Ruling entered: Judge Hale — Admitted                │
│               Exhibit 2 — Photograph, scene A                       │
│                                                                      │
│  10:41:40 AM  Objection recorded — Relevance                       │
│               Exhibit 2 — Photograph, scene A                       │
│                                                                      │
│  10:41:15 AM  Offered — Exhibit 2 — Photograph, scene A            │
│                                                                      │
│  10:38:02 AM  Ruling entered: Judge Hale — Admitted                 │
│               Exhibit 1 — Lease agreement                           │
├──────────────────────────────────────────────────────────────────┤
│  Current exhibit snapshot (Table): #1 Admitted · #2 Admitted ·     │
│  #3 Pending                                                         │
│                                                                      │
│  🛑 Sensitive item flagged — Exhibit 9     [ Review Sealing → ]     │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Site Alert ("● LIVE" indicator styled via Tag), Table (snapshot), Card (activity stream container), Icon (status glyphs), Link styled as Button for sealing review.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Most recent ruling/action, explicitly judge-attributed | Top of activity stream |
| Primary | Sensitive-item flag requiring sealing decision | Persistent banner until addressed |
| Secondary | Full activity stream (offers, objections) | Scrollable list below |
| Tertiary | Current exhibit-status snapshot table | Bottom |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Live, updating | New entries slide in at top, no manual refresh | Subtle highlight animation on newest entry (respects prefers-reduced-motion) |
| No session active | Empty state | "No live session is currently running for this proceeding" |
| Sensitive item flagged | Red banner, persistent until resolved | "Exhibit 9 flagged sensitive — sealing decision required" |
| Deputy offline/resyncing | Stream shows a gap marker | "Reconnecting… entries will appear once synced" (never silently frozen without indication) |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Review Sealing →" | Button | Opens Screen-09 (Sealing & Jury Package Authorization) |
| "Minimize" | Button | Collapses to a small persistent status chip in the Chambers Home header, stream continues updating in background |
| Activity stream rows | Read-only, clickable | Clicking an entry deep-links to the exhibit's full ledger detail (via Case Timeline, F8) |
### Screen 06: Explain This Date

**Purpose:** Renders the full "explain this date" breakdown of a Speedy Trial calculation — every contributing segment with its event, rule reference, period, review status, reviewer, and reason — so Judge Hale can produce a complete, defensible explanation if the number is ever challenged on appeal. The single most important explainability screen in the product.
**User Stories:** US-29.1, US-29.2, US-29.3, US-32.1
**Workspace:** Judge/Chambers Workspace

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ United States v. Reyes — Defendant Tracker            [Compare ▾] │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Summary Box ───────────────────────────────────────────────┐   │
│ │ Remaining includable time: 23 days   Calculation date: today │   │
│ │ Status: ⚠ Approaching threshold                               │   │
│ │ ──────────────────────────────────────────────────────────── │   │
│ │ "This is decision support, not a legal determination."        │   │
│ │  (persistent, non-dismissable label)                          │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Timeline (visual segment bar — included = solid teal,             │
│  excluded = diagonal-hatched gray):                                 │
│  ████████████░░░░░░████████████░░░░░████████                        │
│                                                                      │
│  ┌─ Accordion: Segment 1 — Included (Jan 5 – Feb 2) ─────────┐      │
│  │ Event: Arraignment (confirmed trigger)                      │     │
│  │ Rule reference: 18 U.S.C. §3161(c)(1), Rule Package v4.2     │     │
│  │ Status: Confirmed   Reviewer: Judge Hale   2026-01-05        │     │
│  └────────────────────────────────────────────────────────────┘      │
│                                                                      │
│  ┌─ Accordion: Segment 2 — Excluded (Feb 3 – Mar 18) ────────┐      │
│  │ Event: Defense continuance motion, Doc #44                   │     │
│  │ Rule reference: 18 U.S.C. §3161(h)(7), Rule Package v4.2     │     │
│  │ Status: Confirmed (Modified)  Reviewer: Judge Hale            │     │
│  │ Reason/rationale: "Granted per ends-of-justice finding,       │     │
│  │  end date adjusted to match signed order."      [View Order] │     │
│  └────────────────────────────────────────────────────────────┘      │
│                                                                      │
│  ┌─ Accordion: Segment 3 — Pending review (unconfirmed) ──────┐     │
│  │ ⚠ This candidate is NOT included in the calculation above.  │     │
│  │  Event: Competency motion, Doc #51   [ Review Candidate → ]  │     │
│  └────────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Summary Box, Tag (status: confirmed/pending/approaching-threshold color-coded), Accordion (one per segment, bordered), Icon, Link styled as Button, custom data-visualization segment bar built from USWDS color tokens (per USWDS data visualization guidance — accessible color pairings, pattern fill not color-alone for included/excluded distinction).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Remaining time + status + persistent decision-support label | Top Summary Box, always visible |
| Primary | Visual segment timeline | Immediately below summary |
| Secondary | Per-segment Accordion detail (event, rule, reviewer, reason) | Main scroll area |
| Tertiary | "Compare versions" control | Top-right, secondary action |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Clean (all segments confirmed) | All Accordions show green "Confirmed" Tag | No pending-review callouts |
| Pending segment present | Distinct amber Accordion with warning Icon, clearly separated from confirmed segments | "This candidate is NOT included in the calculation" — prevents any ambiguity about what counts |
| Override present | Segment shows "Confirmed (Modified)" Tag + rationale text inline | Rationale always visible, never requires an extra click to find |
| System defect (should never occur) | Full-page blocking Alert, not a silent fallback | "System defect: unconfirmed exclusion used in calculation" (CALC_UNCONFIRMED_EXCLUSION_USED) — surfaced loudly, routed to Exception Queue automatically |
| Calculation pre-start-confirmation | Entire screen replaced with blocking message | "Cannot calculate: tracker start context is not yet confirmed" (CALC_START_NOT_CONFIRMED) + link to confirm start context |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Compare ▾" | Button, opens dropdown/select | Navigates to version-to-version diff (F32, "what changed") |
| Segment Accordion | USWDS Accordion | Expand/collapse; pending segments default-expanded to force visibility |
| "Review Candidate →" | Button | Opens Screen-07 for that specific candidate exclusion |
| "View Order" | Link | Deep-links to the linked document reference (F1 document_reference, CM/ECF-sourced) |
### Screen 07: Candidate Exclusion Review

**Purpose:** Lets Judge Hale explicitly accept, modify, or reject each candidate exclusion period — the sole point where a period becomes legally excludable. The system never decides this; it only proposes well-formed candidates for review.
**User Stories:** US-28.1, US-28.2, US-30.1, US-30.2, US-33.1, US-33.2
**Workspace:** Judge/Chambers Workspace

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Candidate Exclusion Review — U.S. v. Reyes            [Tag: P0]   │
├──────────────────────────────────────────────────────────────────┤
│  Triggering event: Defense continuance motion, Doc #44             │
│  Category: Continuance (18 U.S.C. §3161(h)(7))                     │
│  Rule package version: v4.2 (effective 2026-06-01)                 │
│  Proposed period: Feb 3, 2026 – Mar 10, 2026 (open-ended: no)       │
│                                                                      │
│  ⚠ Alert (warning): "Continuance findings incomplete — missing      │
│     structured findings reference. Confirming this exclusion is    │
│     blocked until resolved." (CONTINUANCE_INCOMPLETE_BLOCKS_CONFIRM)│
│     [ Supply Findings Reference → ]                                │
│                                                                      │
│  Decision:                                                          │
│  ( ) Accept as proposed                                             │
│  ( ) Modify         → end date: [ Mar 18, 2026 ▾ ]                  │
│  ( ) Reject                                                         │
│                                                                      │
│  Rationale (required for Modify/Reject):                            │
│  [________________________________________________]                 │
│                                                                      │
│                              [ Cancel ]   [ Submit Decision ]        │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Tag (priority badge), Alert (warning, blocking), Radio buttons (decision), Date picker (modify end date), Textarea (rationale), Button group.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Blocking continuance-findings warning (if present) | Top, impossible to miss, blocks Accept path |
| Primary | Accept / Modify / Reject decision control | Center |
| Secondary | Triggering event + rule version + proposed period detail | Upper section, read-only context |
| Tertiary | Rationale field | Appears only when Modify/Reject selected |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Clean candidate, no findings issue | No warning Alert | Accept/Modify/Reject all available |
| Continuance findings incomplete | Blocking warning Alert, "Accept"/"Submit" disabled for confirm path | Court-configurable: some courts may allow override — tooltip explains |
| Modify selected | Date picker + rationale Textarea appear | "Submit Decision" disabled until rationale ≥ minimum length |
| Reject selected | Rationale Textarea appears, no date picker | Same validation pattern |
| Self-review blocked | Entire form replaced with Alert | "You cannot review a proposal you entered yourself" (REVIEW_SELF_REVIEW_DENIED) where court-configured |
| Submitted — Accept | Confirmation toast | "Exclusion confirmed — now feeds calculation" + audit event reference shown |
| Submitted — Modify | Confirmation toast + comparison view | Shows original proposed value alongside modified confirmed value, side by side |
| Submitted — Reject | Confirmation toast | "Exclusion rejected — excluded from any future calculation" |
| Already reviewed (race condition) | Read-only banner | "This candidate has already been reviewed — further changes require an override" (EXCLUSION_ALREADY_REVIEWED) |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Decision radio group | Radio buttons | Determines which secondary fields render |
| "Supply Findings Reference →" | Button/Link | Opens inline mini-form to attach findings/order reference (US-33.2); clears the blocking flag automatically once both references present |
| Rationale Textarea | Required conditional on Modify/Reject | Character-count helper; submit disabled until valid |
| "Submit Decision" | Button, primary | Creates a new `confirmed` record referencing original proposal, reviewer identity, timestamp; logged as distinct audit event; associated task marked complete with audit reference |
### Screen 08: Case Conference View

**Purpose:** A concise, single-screen chronology for conference/hearing preparation — clock state, pending motions, continuance history, and open issues — so Ana and Judge Hale don't reconstruct case status from the raw docket by hand.
**User Stories:** US-35.1, US-35.2, US-34.1, US-34.2
**Workspace:** Judge/Chambers Workspace

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Case Conference — United States v. Alvarez & Reyes (joint)        │
│                                         [ Generate Packet (PDF) ]  │
├──────────────────────────────────────────────────────────────────┤
│  ┌─ Co-Defendant Summary Panel (always shown if multi-defendant) ─┐│
│  │ Defendant: Alvarez   Remaining: 41 days   Status: On track      ││
│  │ Defendant: Reyes     Remaining: 23 days   Status: ⚠ Approaching ││
│  │ Relationship: 2 jointly tracked · 0 severed                     ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─ Clock State (confirmed only) ──────┐ ┌─ Pending Motions ──────┐│
│  │ Elapsed: 47 days  Excluded: 21 days  │ │ • Competency eval (new)││
│  │ [Explain This Date →]                │ │ • Suppression motion   ││
│  └───────────────────────────────────────┘ └──────────────────────┘│
│                                                                      │
│  ┌─ Continuance History ──────────────┐ ┌─ Open Issues ───────────┐│
│  │ ✓ Mar 10 — granted, findings clean │ │ ⚠ 1 unreviewed exclusion││
│  │ ⚠ Jan 22 — findings incomplete     │ │ ⚠ 1 unacknowledged alert││
│  └──────────────────────────────────────┘ └──────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Card (grid of panels), Tag (status), Summary Box, Icon list (continuance history), Button ("Generate Packet").

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Co-Defendant Summary Panel (multi-defendant matters only) | Top, full-width, never collapsed into a single status |
| Primary | Open Issues panel | Right column, top |
| Secondary | Clock state + pending motions + continuance history | Two-column grid, equal weight |
| Tertiary | "Generate Packet" action | Top-right, secondary button |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Single defendant | Co-Defendant panel omitted entirely | Standard single-column layout |
| Multi-defendant, all jointly tracked | Co-Defendant panel shows all rows, "N jointly tracked · 0 severed" | — |
| Multi-defendant, some severed | Panel shows severed defendants with distinct Tag + date | "3 defendants; 2 jointly tracked, 1 severed as of [date]" |
| Tracker not found/unauthorized | Full-page Alert | "Case conference not found or not authorized" (CONFERENCE_TRACKER_NOT_FOUND, 404) |
| Packet generation — partial data | Generated PDF carries a visible partial-data watermark/banner | "Some data was unavailable at generation time" (CONFERENCE_PACKET_PARTIAL, 206) |
| Clean | All sections populated, no warning Tags | — |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Generate Packet (PDF)" | Button | Produces a timestamped, printable packet mirroring on-screen content; no certification required since it changes no record |
| "Explain This Date →" | Link/Button | Opens Screen-06 for the relevant tracker |
| Continuance History rows | Clickable list items | Deep-link to the underlying continuance/exclusion detail |
| Open Issues rows | Clickable list items | Deep-link to Exception Queue or Candidate Exclusion Review as appropriate |
### Screen 09: Sealing & Jury Package Authorization

**Purpose:** The single, deliberate judge-only control point for sealing/releasing an individual exhibit and for authorizing a jury review package — both actions requiring explicit judge credentials, never a clerk's self-authorization.
**User Stories:** US-21.1, US-21.2, US-22.1, US-22.2
**Workspace:** Judge/Chambers Workspace

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Tabs: [ Seal / Release ]   [ Jury Package Authorization ]          │
├──────────────────────────────────────────────────────────────────┤
│ SEAL / RELEASE TAB                                                  │
│  Exhibit 9 — Medical record excerpt                                 │
│  Current status: Not sealed                                        │
│                                                                       │
│  Authorizing judge: Robert Hale (resolved from session — not        │
│  editable)                                                           │
│                                                                       │
│  ( ) Seal this exhibit     ( ) Release (if currently sealed)        │
│  Release reason (required if releasing): __________________         │
│                                                                       │
│                                      [ Authorize ]                   │
│                                                                       │
│  ┌─ Sealed-Access Log (if sealed) ─────────────────────────────┐    │
│  │ Table: Timestamp | User | Result | Entitlement checked       │    │
│  │ 10:15 AM | M. Santos | Denied (no entitlement) | sealed_view  │    │
│  │ 10:20 AM | J. Hale    | Granted                | sealed_view  │    │
│  └─────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────┤
│ JURY PACKAGE AUTHORIZATION TAB                                      │
│  Proceeding: Trial Day 3 — admitted electronic exhibits only         │
│  ┌─ Eligible for package (auto-filtered) ───────────────────────┐  │
│  │ ✓ Exhibit 1 — Lease agreement (admitted, file_reference)      │  │
│  │ ✓ Exhibit 2 — Photo scene A (admitted, file_reference)        │  │
│  │ ✗ Exhibit 9 — SEALED, excluded unless individually authorized │  │
│  │    [ Authorize this instance only ]                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                [ Authorize Package v1 ]              │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Tabs (Side nav/In-page nav pattern used as tab set), Radio buttons, Text input, Table, Tag (status: sealed/not-sealed/denied/granted), Alert (for ineligible/sealed exclusions), Button.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Authorizing judge identity (non-editable, system-resolved) | Always visible, both tabs |
| Primary | Seal/Release action + Jury Package authorize action | Center, each tab |
| Secondary | Sealed-Access Log table | Below seal action, sealed exhibits only |
| Secondary | Eligible-for-package list with automatic exclusions | Main content, package tab |
| Tertiary | Per-instance override for a sealed item | Inline within the ineligible row |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Non-judge attempts action | Entire Authorize control disabled/absent | "Sealing requires judge authorization" (SEAL_AUTHORIZATION_DENIED) — control never renders enabled for a clerk |
| Sealed successfully | Status badge updates to "Sealed" (red Tag) | Confirmation + audit event shown inline |
| Release without reason | "Authorize" disabled | Inline validation: "Release reason is required" |
| Jury package: ineligible type attempted | Row shows disabled checkbox + Alert | "This exhibit type is not eligible for electronic jury review" (JURY_INELIGIBLE_EXHIBIT) |
| Jury package: sealed item, no per-instance auth | Excluded by default, greyed with override link | "Authorize this instance only" requires the same judge credentials re-confirmed |
| Package authorized | Tab shows "Package v1 — Authorized, session-scoped" | Package becomes immutable; a later ruling change does NOT silently update it (JURY_PACKAGE_IMMUTABLE on edit attempts) |
| Session expired (jury viewing) | N/A on this screen (surfaced in delivery context) | — |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Authorize" (seal/release) | Button, primary | Writes `authorizing_judge_id`, `release_reason` (if applicable); audit-logged distinctly |
| "Authorize this instance only" | Button, per-row | One-time per-package override for an otherwise-excluded sealed item |
| "Authorize Package v1" | Button, primary | Creates immutable package version; any future composition change requires a new version number, never an in-place edit |
| Sealed-Access Log rows | Read-only table | Every access attempt (granted or denied) shown as its own row — never aggregated |
### Screen 10: Clerk Console Home

**Purpose:** David's landing workspace composing case setup access, intake queue, exception queue, reconciliation actions, and portfolio dashboards — his full operational caseload from one place.
**User Stories:** US-11.3, US-6.1, US-7.2
**Workspace:** Clerk/Case Administrator Console

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Header | Side Navigation: Home · Case Setup · Intake Queue ·       │
│         Exceptions · Portfolio · (Configuration, if entitled)      │
├────────────┬───────────────────────────────────────────────────┤
│  Side Nav  │  ┌─ My Work Queue (role-scoped, cross-module) ─────┐ │
│            │  │ [All] [Exhibits] [Speedy Trial]        Sort: Age │ │
│            │  │ ⚠ (3d) Unmapped docket event — U.S. v. Cho       │ │
│            │  │ ⚠ (1d) Intake: missing metadata — U.S. v. Diaz   │ │
│            │  │ ○ (2h) Custody ack pending — Exhibit 14          │ │
│            │  └────────────────────────────────────────────────────┘ │
│            │                                                       │
│            │  ┌─ Open Exceptions Summary ──┐ ┌─ Portfolio Snapshot ┐│
│            │  │ Critical: 0  High: 1         │ │ 6 cases nearing    ││
│            │  │ Medium: 4    Low: 2          │ │ ST threshold       ││
│            │  │          [View Queue →]      │ │ 2 closeout backlog ││
│            │  │                               │ │   [View Portfolio →]││
│            │  └───────────────────────────────┘ └────────────────────┘│
│            │                                                       │
│            │  ┌─ Recent Case Setups ────────────────────────────┐  │
│            │  │ U.S. v. Alvarez — exhibit tracking active        │  │
│            │  └────────────────────────────────────────────────────┘ │
└────────────┴───────────────────────────────────────────────────┘
```

**USWDS components:** Side navigation, Tag (filter chips), Card, Table/List, Icon (priority glyphs), Summary Box (exception counts), Button.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | My Work Queue, cross-module, age-sorted | Top-left, largest card |
| Secondary | Open Exceptions Summary + Portfolio Snapshot | Side-by-side cards below queue |
| Tertiary | Recent Case Setups list | Bottom |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Empty queue | Illustration + text | "Nothing needs your attention right now" |
| Items aged beyond threshold | Red left-border accent on the row | Visual aging flag (shared pattern with Exception Queue) |
| Critical exception present | Exceptions Summary "Critical" count in red, pulsing dot | Cannot be dismissed from this summary view — must open queue |
| Filter applied | Selected Tag chip shows solid fill | Queue list updates in place |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Module filter Tags | Toggle Tag/Button group | Filters "My Work Queue" list by module |
| Task row | Clickable | Deep-links directly to the underlying object's detail/review view (per F6 requirement) |
| "View Queue →" | Button | Navigates to Screen-13 (Exception Queue) |
| "View Portfolio →" | Button | Navigates to Screen-14 (Portfolio Dashboards) |
### Screen 11: Case & Proceeding Setup for Exhibits

**Purpose:** Lets David create/sync a case's proceeding, bind parties, select a numbering scheme, and apply security designations before exhibit tracking activates — getting this right once prevents rework rippling through the entire trial.
**User Stories:** US-14.1, US-14.2, US-1.1, US-1.2
**Workspace:** Clerk/Case Administrator Console

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Case Setup — United States v. Alvarez               [Step 2 of 3] │
├──────────────────────────────────────────────────────────────────┤
│ Step Indicator: ●Case/Proceeding → ●Numbering & Parties → ○Activate│
├──────────────────────────────────────────────────────────────────┤
│  Court/Division: EDNY / Brooklyn  (synced from CM/ECF, immutable)   │
│  Case number: 1:26-cr-00042  (from CM/ECF)                          │
│                                                                      │
│  Numbering scheme:  [ USDC-EDNY-2026 (active, published)        ▾]  │
│  ⚠ Once any exhibit is assigned, this selection locks              │
│    (EXHIBIT_SETUP_SCHEME_LOCKED)                                    │
│                                                                      │
│  Parties bound to proceeding:                                       │
│  ☑ Government (prosecution)     ☑ Defense                           │
│  ☐ Additional party...                                              │
│                                                                      │
│  Security designations (if applicable):                             │
│  ☐ Sealed  ☐ Restricted  ☐ Grand jury  ☐ Juvenile  ☐ PII            │
│  (requires case_security_admin — view-only if not entitled)         │
│                                                                      │
│                       [ Back ]        [ Activate Exhibit Tracking ] │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Step Indicator, Select (numbering scheme), Checkbox (parties, designations), Alert (lock warning), Button group.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Numbering scheme selection + lock warning | Upper-center |
| Primary | "Activate Exhibit Tracking" action | Bottom, disabled until prerequisites met |
| Secondary | Party binding checkboxes | Middle |
| Tertiary | Security designation checkboxes (view-only for most users) | Lower section |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| No proceeding exists | "Activate" disabled, Alert shown | "A proceeding must exist before exhibit tracking can be activated" (EXHIBIT_SETUP_NO_PROCEEDING) |
| Scheme not yet locked | Select enabled, editable | — |
| Scheme locked (exhibits assigned) | Select disabled, padlock icon + tooltip | "Numbering scheme is locked — exhibits have already been assigned" (EXHIBIT_SETUP_SCHEME_LOCKED) |
| Invalid/unpublished scheme selected | Inline error | "This scheme is not active/published" (EXHIBIT_SETUP_INVALID_SCHEME) |
| Designation checkbox, no entitlement | Checkboxes rendered disabled/view-only | Tooltip: "Changing security designations requires case_security_admin" |
| Non-admin attempts activation | Action denied | "You do not have exhibit setup access" (EXHIBIT_SETUP_DENIED) |
| Already active (idempotent re-run) | Banner | "Exhibit tracking is already active for this case — no changes made" |
| Activated | Step indicator completes, redirect | Toast: "Exhibit tracking active — intake and ledger unlocked" |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Numbering scheme Select | USWDS Select, disables post-assignment | Pulls only active/published schemes from Configuration Engine |
| Party checkboxes | Checkbox | At least prosecution + defense (or equivalent) required before activation |
| Designation checkboxes | Checkbox, conditionally editable | Edits produce an audit event with before/after state |
| "Activate Exhibit Tracking" | Button, primary | Idempotent — re-running never resets/duplicates existing exhibit records |
### Screen 12: Pretrial Intake Queue

**Purpose:** Receives structured exhibit list submissions (internal staff and external-portal attorneys alike), validates metadata, flags duplicates, and lets David accept/reject/request-correction before anything reaches the courtroom.
**User Stories:** US-15.1, US-15.2, US-15.3, US-12.3
**Workspace:** Clerk/Case Administrator Console

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Pretrial Intake Queue — United States v. Alvarez                  │
│ Filters: [Status ▾] [Source: Internal/External ▾] [Date ▾]        │
├──────────────────────────────────────────────────────────────────┤
│ Table (USWDS Table, sortable)                                      │
│ # | Description      | Party | Source            | Status | Age   │
│ — | Signed lease      | Govt  | Internal           | Pending| 2h    │
│ — | Photo — scene B   | Def.  | 🌐 External portal  | Pending| 5h    │
│ — | Witness list v2   | Govt  | Internal           | ⚠ Dup. | 1d    │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Expanded row: "Witness list v2" ─────────────────────────────┐  │
│ │ ⚠ Flagged duplicate — file hash matches existing submission    │  │
│ │ Conflicting submissions preserved side by side:                │  │
│ │  (A) Witness list v2 — submitted 10:02 AM, Govt                │  │
│ │  (B) Witness list — submitted yesterday 4:15 PM, Govt          │  │
│ │                                                                   │  │
│ │ [ Accept A ]  [ Accept B ]  [ Reject Both ]  [ Request Correction]│  │
│ │ Reason/detail (required for reject/correction):                 │  │
│ │ [_______________________________________________]               │  │
│ └───────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Table (sortable, expandable rows), Tag (status + source badges), Select (filters), Alert (duplicate flag, inline), Textarea (reason), Button group.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Status + Source Tag per row (Pending/Duplicate/Accepted/Rejected; Internal/External) | First visible columns |
| Primary | Accept/Reject/Request-Correction actions | Expanded row, prominent buttons |
| Secondary | Age column, sortable | Table, supports oldest-first prioritization |
| Tertiary | Filter controls | Top toolbar |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Missing required metadata | Row Tag: "Incomplete" (amber) | "Missing: offering_party_id" detail shown on expand (INTAKE_MISSING_METADATA) |
| File fails malware scan | Row Tag: "Rejected — file" | "File rejected: {reason}" (INTAKE_FILE_REJECTED), never silent acceptance |
| Unsupported format | Row Tag: "Unsupported format" | INTAKE_UNSUPPORTED_FORMAT shown inline |
| Exact duplicate (file hash) | Row Tag: "Duplicate" (red), expandable | Both conflicting submissions preserved, side-by-side comparison forced |
| External submission | 🌐 globe icon + "External portal" Tag | Visually distinguished but identical review controls to internal |
| External submitter attempts self-accept | N/A — no such control ever renders for external principals | Structural prevention, not a runtime error shown to clerk |
| Accepted | Row Tag: "Accepted → Ledger" (green) | Promoted to F16 ledger entry in `proposed` status; submitter notified |
| Rejected/Correction requested | Row Tag updates; reason stored | Submitter notified with the reason/detail — never a bare rejection |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Filter Selects | USWDS Select | Status, Source (internal/external), date range |
| Row expand | Click/Enter | Reveals full detail + action buttons |
| "Accept A" / "Accept B" | Button | Only one path possible — accepting one auto-marks the conflicting alternative as superseded, both remain in history |
| "Reject Both" / "Request Correction" | Button | Opens required reason Textarea before submission enabled |
| Row action buttons | Entitlement-gated | Only rendered enabled for `clerk_case_admin`/`courtroom_deputy`; otherwise INTAKE_REVIEW_DENIED path never reachable from UI |
### Screen 13: Exception Queue (Shared Component, Clerk-Focused View)

**Purpose:** A cross-module queue of flagged discrepancies, missing metadata, and unmapped events, filterable by module/type/severity/age, with required rationale on every resolution — the convergence point where Maria, David, Priya, and chambers escalations all meet.
**User Stories:** US-7.1, US-7.2, US-18.2
**Workspace:** Clerk/Case Administrator Console (also surfaced, access-scoped, in other workspaces)

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Exception Queue                                                    │
│ Filters: [Module ▾] [Type ▾] [Severity ▾]      Sort: [Age ▾]       │
├──────────────────────────────────────────────────────────────────┤
│ Table                                                               │
│ Severity | Type                  | Object           | Age | Status │
│ 🔴 High   | reconciliation_mismatch| Exhibit 14       | 18h | Open   │
│ 🟠 Medium | unmapped_docket_event  | U.S. v. Cho       | 3d  | Open   │
│ 🟡 Low    | missing_metadata       | Exhibit list (ext)| 5h  | Open   │
│ ⚫ Critical| audit_integrity_break  | Audit chain       | 2m  | Open   │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Expanded: unmapped_docket_event — U.S. v. Cho ─────────────┐    │
│ │ Raw source code: "MOT-CONT-AMD"  Description: "Amended       │    │
│ │  Motion for Continuance"  Detected: F27, 2026-10-01 09:14     │    │
│ │                                                                 │    │
│ │ Map to category: [ Continuance                            ▾ ] │    │
│ │ ☐ Also create a standing mapping rule for this code            │    │
│ │   (routes through Configuration Engine maker-checker)          │    │
│ │                                                                 │    │
│ │ Rationale (required, ≥10 chars):                                │    │
│ │ [_____________________________________________]                 │    │
│ │                                           [ Resolve Exception ] │    │
│ └─────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Table (sortable/filterable), Tag/Icon (severity color + glyph, never color-alone), Select (category mapping, filters), Checkbox, Textarea, Button, Character count (rationale helper).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Severity + age (sorted oldest/highest-severity first by default) | Leftmost columns |
| Primary | Required rationale field on resolution | Expanded row, cannot submit without it |
| Secondary | Type-appropriate resolution action (category select, value-accept radio, etc.) | Expanded row, varies per exception_type |
| Tertiary | "Create standing mapping rule" checkbox | Expanded row, optional |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Critical severity | Black/dark Tag, cannot be resolved via any batch action | "Critical exceptions require individual manual review" (EXCEPTION_CRITICAL_MANUAL_ONLY) — no bulk-resolve checkbox ever appears next to it |
| Aging beyond threshold | Row gets a left-border accent + clock icon | Visual aging indicator, sortable |
| Resolution without rationale | Submit disabled | "A resolution rationale is required" (EXCEPTION_RATIONALE_REQUIRED) |
| Rationale too short | Inline error on blur | "Rationale must be at least 10 characters" (EXCEPTION_RATIONALE_TOO_SHORT) |
| Wrong resolution type for exception | Submit blocked | "Resolution action does not match exception type" (EXCEPTION_ACTION_TYPE_MISMATCH) |
| Legally significant exception, wrong reviewer role | Resolution controls disabled | Routed instead to the role with appropriate review authority (e.g., chambers) |
| Resolved | Row moves to "Resolved" filter, strikethrough removed from view by default | Audit event reference shown in exception detail history |
| Escalated (age threshold) | Row Tag: "Escalated" | Notification sent to supervisory role automatically |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Filter Selects | USWDS Select | Module, type, severity |
| Sort control | Select/Button | Age (default), severity |
| Row expand | Click/Enter | Reveals type-specific resolution UI |
| "Resolve Exception" | Button, primary | Disabled until rationale valid and resolution type-appropriate |
| "Also create a standing mapping rule" checkbox | Checkbox | Routes a *separate* request through Configuration Engine maker-checker while still resolving this individual instance immediately |
### Screen 14: Portfolio Dashboards (Exhibit + Speedy Trial)

**Purpose:** Aggregate, cross-case visibility into exhibit operations and Speedy Trial risk across David's full caseload — "which of these forty cases actually needs my attention today" — without opening cases one by one.
**User Stories:** US-25.1, US-36.1, US-36.2
**Workspace:** Clerk/Case Administrator Console (Speedy Trial personal view also appears in Judge/Chambers Workspace; court-level aggregate is Admin-gated)

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Portfolio — My Caseload (EDNY / Brooklyn)        Tabs: [Exhibits] │
│                                                    [Speedy Trial]  │
├──────────────────────────────────────────────────────────────────┤
│ SPEEDY TRIAL TAB                                                    │
│ Risk filter chips: [Approaching threshold (6)] [Data gap (2)]      │
│                    [Unreviewed exclusion (4)] [Stale calc (1)]     │
│                                                                      │
│ Table (sortable)                                                    │
│ Case              | Defendant | Remaining | Risk           | Last   │
│ U.S. v. Reyes     | Reyes     | 23 days   | ⚠ Approaching  | today  │
│ U.S. v. Cho       | Cho       | —         | ⚠ Data gap     | 3d ago │
│ U.S. v. Patel     | Patel     | 61 days   | ✓ On track     | today  │
├──────────────────────────────────────────────────────────────────┤
│ EXHIBITS TAB                                                        │
│ Open exceptions: 7   Outstanding custody: 2   Closeout backlog: 3   │
│ Table: Case | Open exceptions | Custody pending | Closeout status   │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Tabs, Tag (filter chips, risk indicators), Table (sortable, drill-through), Summary Box (aggregate counts).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Risk filter chips (counts visible at a glance) | Top of Speedy Trial tab |
| Primary | Case-level risk table | Main content |
| Secondary | Exhibit-side aggregate counts (exceptions/custody/closeout) | Exhibits tab equivalent |
| Tertiary | "Last" activity column | Rightmost, supports staleness sorting |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Out-of-scope access attempted | Entire dashboard blocked | "You do not have access to this portfolio" (PORTFOLIO_SCOPE_DENIED) — a clerk never sees another court's portfolio |
| No risk configuration | Empty-state Alert | "No risk-indicator configuration exists for this court" (PORTFOLIO_NO_CONFIG) + link to Configuration Engine (if entitled) |
| Risk chip selected | Chip shows solid fill, table filters | — |
| Clean caseload | All rows "✓ On track" | Reassuring green state, no action needed |
| Stale calculation flagged | Row Tag: "Stale calc" (grey/amber) | Indicates calculation hasn't run recently — prompts explicit recalculation request |
| Court-level aggregate (admin-only) | Additional "Court-Wide" tab appears only for `court_admin` entitlement | A routine clerk/judge role never sees this tab merely from a large personal caseload (PORTFOLIO_ADMIN_DENIED) |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Risk filter chips | Toggle Tag | Filters table; multiple chips combine as OR filter |
| Table row | Clickable | Drill-through to Case Conference View (Screen-08) or Exception Queue, scoped to viewer's authorized entitlements |
| Tabs | USWDS Tabs | Switches between Exhibits and Speedy Trial aggregate views |
### Screen 15: Admin Dashboard Home

**Purpose:** Priya's landing workspace composing configuration, identity/role management, operational reporting feed, and CM/ECF adapter health — platform-wide settings and integration monitoring from one place.
**User Stories:** US-11.4, US-0.2, US-0.3
**Workspace:** Admin Dashboard

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Header | Side Navigation: Home · Configuration · Identity & Roles ·│
│         Audit Explorer · Integrations · Reporting                  │
├────────────┬───────────────────────────────────────────────────┤
│  Side Nav  │  ┌─ System Health Summary ─────────────────────────┐ │
│            │  │ CM/ECF adapter: ✓ Healthy (last sync 4m ago)     │ │
│            │  │ Audit chain: ✓ Verified   Pending approvals: 3   │ │
│            │  └────────────────────────────────────────────────────┘ │
│            │                                                       │
│            │  ┌─ Pending Privileged Approvals ──────────────────┐ │
│            │  │ Config: Event mapping update — drafted by D.O.  │ │
│            │  │   [Cannot self-approve — requires 2nd approver] │ │
│            │  │   [Review & Approve →]                           │ │
│            │  └────────────────────────────────────────────────────┘ │
│            │                                                       │
│            │  ┌─ Operational Reporting Feed (de-identified) ────┐ │
│            │  │ "Administrative metrics — not for use in case    │ │
│            │  │  determinations" (persistent label)              │ │
│            │  │ Backlog age ↓12%  Data quality 97%  Adoption 88%│ │
│            │  └────────────────────────────────────────────────────┘ │
└────────────┴───────────────────────────────────────────────────┘
```

**USWDS components:** Side navigation, Card, Summary Box, Tag (health status), Icon, Button, persistent disclaimer banner (Site Alert, info).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | System Health Summary (adapter, audit chain integrity) | Top |
| Primary | Pending Privileged Approvals, with SoD explanation visible inline | Upper-middle |
| Secondary | Operational Reporting Feed snapshot, persistent disclaimer label | Lower section |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| All systems healthy | Green Tags throughout | — |
| Adapter unhealthy | Red Tag + banner | "CM/ECF feed unavailable" (CMECF_UNAVAILABLE, 503) — persistent until resolved |
| Audit chain break detected | Full-width critical Alert, cannot be dismissed | "Audit integrity check failed — escalated" (AUDIT_CHAIN_BROKEN) — routes to a P0 exception automatically |
| Self-drafted approval pending | "Review & Approve" explicitly disabled for the drafter | Tooltip explains separation-of-duties requirement |
| No pending approvals | Empty-state text | "No privileged actions awaiting approval" |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Review & Approve →" | Button, SoD-gated | Only enabled for a user who is NOT the drafter; navigates to Screen-16 |
| System Health rows | Clickable | Deep-link to Screen-18 (Integrations) or Screen-17 (Audit Explorer) |
| Reporting Feed card | Clickable | Navigates to full reporting view (F09), same de-identification rules apply |
### Screen 16: Configuration Engine

**Purpose:** Lets authorized admins configure numbering schemes, workflow states, thresholds, and event mappings per court — and enforces maker-checker (separation of duties) before any change takes effect, since configuration errors can silently affect an entire court's Speedy Trial calculations.
**User Stories:** US-3.1, US-3.2, US-3.3
**Workspace:** Admin Dashboard

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Configuration — EDNY Court Profile              [Tag: Draft v4.3] │
│ Tabs: [Numbering] [Workflow States] [Thresholds] [Event Mappings]  │
├──────────────────────────────────────────────────────────────────┤
│ THRESHOLDS TAB                                                      │
│ Table (editable rows)                                               │
│ Tier         | Min (days) | Max (days) | Severity                   │
│ Safe         | 31         | ∞          | info                       │
│ Approaching  | 15         | 30         | warning                    │
│ Critical     | 0          | 14         | critical                   │
│ ⚠ Gap detected: 30–31 unclassified          [Fix: adjust Approaching max]│
│                                                                      │
│ [ Save Draft ]                                                      │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Publish ─────────────────────────────────────────────────────┐  │
│ │ Drafted by: David Okafor (you)                                  │  │
│ │ [ Publish ]  ← disabled: "A second approver is required"        │  │
│ │ Approver: [ Select a different user to approve ▾ ]              │  │
│ └───────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Tabs, Table (editable), Alert (inline validation, blocking), Tooltip, Select (approver picker), Button (disabled state with tooltip).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Structural validation errors (gaps, orphaned states, ambiguous mappings) | Inline, directly under the offending row |
| Primary | Publish control + SoD enforcement | Bottom panel, always visible |
| Secondary | Tab content (numbering/workflow/thresholds/mappings) | Main editing area |
| Tertiary | Draft version Tag | Header |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Editing draft | Tag: "Draft v4.3", autosave indicator | — |
| Structural validation failure | Red inline Alert per offending row | "Threshold tiers must be contiguous and non-overlapping" (CONFIG_THRESHOLD_GAP) |
| Ambiguous event mapping | Red inline Alert on mapping row | "Event code {code} is mapped to multiple categories" (CONFIG_AMBIGUOUS_MAPPING) |
| Orphaned workflow state | Red Alert on Workflow States tab | "Workflow state sets must have at least one terminal state and no unreachable states" |
| Non-admin viewing | Entire edit surface read-only | "You do not have configuration administration access" (CONFIG_EDIT_DENIED) |
| Same-user publish attempt | Publish button disabled + Tooltip | "A second approver is required to publish this configuration" (CONFIG_SOD_VIOLATION) — structurally blocked, not just rejected after click |
| Published | Tag updates to "Published v4.3 — effective 2026-10-05" | Prior version (v4.2) remains retrievable via version history link |
| In-flight calculations | No automatic effect shown | Explicit note: "Existing calculations referencing v4.2 are not retroactively recalculated" |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Tab set | USWDS Tabs | Numbering / Workflow States / Thresholds / Event Mappings |
| Editable Table rows | Inline edit | Client-side pre-validation mirrors server rules, surfaces errors immediately |
| "Save Draft" | Button | Persists draft without publishing; no effect on live rule package |
| Approver Select | USWDS Select, excludes current user | Populates only with users holding `config_admin` other than the drafter |
| "Publish" | Button, primary, conditionally disabled | Enabled only for the selected distinct approver's own session; creates new immutable `rule_package_version` |
### Screen 17: Audit Explorer

**Purpose:** A strictly read-only surface to filter and reconstruct the full history of actions by case, user, date range, or object — the system's core accountability mechanism, used to investigate disputes and verify separation-of-duties compliance.
**User Stories:** US-2.1, US-2.2, US-2.3
**Workspace:** Admin Dashboard

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Audit Explorer                            🔒 Chain verified ✓     │
├──────────────────────────────────────────────────────────────────┤
│ Filters: Case [________▾]  User [________▾]  Date range [___–___] │
│          Object type [Exhibit ▾]                     [ Search ]    │
├──────────────────────────────────────────────────────────────────┤
│ Table (read-only, no edit/delete affordance anywhere)               │
│ Timestamp        | Actor      | Action         | Before→After | Rule│
│ 10:20:14 AM      | J. Hale    | access (granted)| —            | v4.2│
│ 10:15:02 AM      | M. Santos  | access (denied) | —            | v4.2│
│ 09:58:40 AM      | D. Okafor  | status_change    | proposed→admitted│ v4.2│
│ 09:40:11 AM      | (config)   | config_change    | threshold diff   | v4.1→v4.2│
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Row detail: status_change ───────────────────────────────────┐ │
│ │ Actor: David Okafor   Object: Exhibit 14   Rule ref: v4.2       │ │
│ │ Before: {status: proposed}  After: {status: admitted}           │ │
│ │ [ View Rule Package v4.2 → ]  [ View Object Detail → ]           │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Summary Box/Tag ("Chain verified ✓" integrity badge), Combo Box (case/user filters), Date range picker, Select, Table (read-only), Accordion/expandable row for detail.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Chain integrity status badge | Top-right, always visible |
| Primary | Filter controls | Top toolbar |
| Secondary | Chronological result table, including denied access attempts as distinct rows | Main content |
| Tertiary | Expanded row detail with rule/calculation version deep links | Below selected row |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| No `audit_reader` entitlement | Entire screen replaced with Alert | "You do not have audit explorer access" (AUDIT_READ_DENIED, 403) |
| Sealed-case query, no designation entitlement | Query returns no sealed rows + logs the attempt itself | "This case's audit history requires additional authorization" (AUDIT_DESIGNATION_DENIED) — and this very attempt appears as a new row next time anyone queries |
| Chain verified | Green badge, "Chain verified ✓" | — |
| Chain broken | Badge replaced with critical red Alert, non-dismissable | "Audit integrity check failed — escalated to security officer" (AUDIT_CHAIN_BROKEN) |
| Denied access attempt in results | Row shown with "denied" Tag, not omitted | Distinguishes "tried and was told no" from records that simply don't exist |
| Empty result | Standard empty state | "No audit events match these filters" |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Filter controls | Combo Box, Date range picker, Select | `case_id`, `user_id`, `date_range`, `object_type` |
| "Search" | Button | Executes filtered query |
| Row click | Expand | Reveals before/after diff + rule/calculation version link |
| "View Rule Package v4.2 →" | Link | Deep-links to Configuration Engine's version history (read-only for non-admins) |
| **No edit/delete control exists anywhere on this screen** | — | Structural guarantee per US-2.3 — write API is service-to-service only |
### Screen 18: CM/ECF Adapter Health & Sync Conflicts

**Purpose:** Monitors CM/ECF sync health (last sync time, error rate, backlog) and lets Priya resolve routed conflicts without ever silently overwriting local edits or docket data.
**User Stories:** US-10.1, US-10.2
**Workspace:** Admin Dashboard

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ CM/ECF Integration Health                                           │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Summary Box ───────────────────────────────────────────────┐    │
│ │ Last successful sync: 4 minutes ago   Error rate: 0.2%        │    │
│ │ Backlog: 0 pending   Outbound filings: disabled (no entitlement│    │
│ │ granted)                                                        │    │
│ └───────────────────────────────────────────────────────────────┘    │
│                                                                      │
│ ┌─ Open Sync Conflicts (3) ───────────────────────────────────┐    │
│ │ Record: Exhibit 14 location field                             │    │
│ │  CM/ECF value: "Evidence Room B-14"  (source_identifier: DKT-1102)│
│ │  Local value:  "Evidence Room A-02"  (locally modified 2026-10-02)│
│ │  ( ) Accept CM/ECF value   ( ) Keep local value (manual_override) │
│ │                                          [ Resolve Conflict ]     │
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│ ┌─ Duplicate Delivery Log (informational, no action needed) ───┐    │
│ │ source_identifier DKT-1099 — duplicate delivery, auto-ignored  │    │
│ └───────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Summary Box, Table/Card (conflict list), Radio buttons, Button, Tag (health status), Alert (for prolonged failure).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Open Sync Conflicts, each requiring explicit admin selection | Center, cannot be bulk-resolved |
| Primary | Adapter health metrics | Top Summary Box |
| Secondary | Duplicate-delivery log (informational only) | Lower section |
| Tertiary | Outbound filing entitlement status | Summary Box, read-only unless `docket_outbound` granted |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Healthy | Green Tags, "Last successful sync: 4 minutes ago" | — |
| Prolonged failure | Critical red Alert, non-dismissable | Triggers an alert automatically; feed unavailability shows "Feed temporarily unavailable" (CMECF_UNAVAILABLE, 503) |
| No conflicts open | Empty-state text | "No sync conflicts currently require review" |
| Conflict open | Both values shown side by side, neither pre-selected | Admin must make an explicit choice — no default/auto-selected radio |
| Conflict resolved | Row moves to resolved history, tagged `source_system` or `manual_override` | Logged to audit trail with both values preserved |
| Unauthorized outbound filing attempt | Action simply absent from UI for non-entitled users | CMECF_OUTBOUND_DENIED never surfaces as a clickable-then-rejected control |
| Duplicate delivery | Shown in informational log only, no action required | CMECF_DUPLICATE_IGNORED — idempotent, no duplicate record created |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Conflict radio group | Radio buttons | Forces one explicit selection before "Resolve Conflict" enables |
| "Resolve Conflict" | Button, primary | Logs resolution with both CM/ECF and chosen value, explicitly marked `source_system` or `manual_override` |
| Health Summary Box | Read-only | Links to a more detailed sync-log view if needed |
### Screen 19: Attorney Portal Home & Submission Form

**Purpose:** A scoped, restricted external entry point where an authorized attorney sees only cases where they hold an active party-of-record association, and can submit structured exhibit metadata that enters the standard intake review path — with zero direct write access to the official ledger.
**User Stories:** US-12.1, US-12.3
**Workspace:** Restricted External Attorney Portal

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ USWDS Banner (.gov) | Header: "JudicialSync — Attorney Portal"      │
│ 🔒 External, restricted access — separate from internal court users│
├──────────────────────────────────────────────────────────────────┤
│ My Associated Cases (party-of-record only)                         │
│ ┌─ Card: United States v. Alvarez ───────────────────────────┐     │
│ │ Role: Defense counsel        [ Submit Exhibit Metadata ]     │     │
│ │                               [ View Speedy Trial Summary ]  │     │
│ └──────────────────────────────────────────────────────────────┘     │
├──────────────────────────────────────────────────────────────────┤
│ SUBMISSION FORM (expands below, same structure as internal intake)  │
│  Description:        [________________________________]            │
│  Offering party:      ( ) Government  (•) Defense                   │
│  Exhibit type:        [ File reference                      ▾ ]     │
│  Attach file (optional): [ Choose file ]  (malware-scanned,          │
│                                             allowlisted types only)  │
│                                                                       │
│                                        [ Submit for Review ]          │
│  ℹ️ This submission enters standard clerk review before it becomes   │
│     part of the official record. You will be notified of the outcome│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Banner, Header, Card, Radio buttons, Select, File input (with allowlist/scan messaging), Button, Site Alert (info, persistent restricted-access notice).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Case list, pre-filtered to party-of-record associations only | Top, immediately visible |
| Primary | Submission form fields + "enters standard review" disclosure | Expanded form, always-visible info note |
| Secondary | "View Speedy Trial Summary" link | Card action, secondary to submission |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| No associated cases | Empty-state text | "No cases are currently associated with your account" |
| Submission missing required field | Inline field errors | Routes to exception queue on backend, not silent rejection (INTAKE_MISSING_METADATA) |
| File fails scan/allowlist | Inline error on file field | "File rejected: {reason}" — never silently accepted |
| Submitted | Form collapses, confirmation shown | "Submitted — pending clerk review" (status = `proposed`, `submitted_via = external_portal`) |
| No party-of-record for attempted case | Case/action simply not rendered | PORTAL_NOT_PARTY_OF_RECORD never reachable via UI since the list is pre-scoped |
| Attempt to self-accept own submission | No such control exists anywhere in this portal | Structural prevention (INTAKE_EXTERNAL_ACCEPT_DENIED) |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Submit Exhibit Metadata" | Button | Expands submission form inline |
| File input | USWDS File input | Enforces court-configured allowlist client-side (UX hint only; server re-validates + scans) |
| "Submit for Review" | Button, primary | Creates `proposed` submission, routes into standard F15 intake queue (Screen-12), identical downstream handling to internal submissions |
| "View Speedy Trial Summary" | Link | Navigates to Screen-20 |
### Screen 20: Attorney Speedy Trial Summary (Read-Only)

**Purpose:** Gives an authorized attorney a read-only Speedy Trial summary for their associated defendant — remaining time, next threshold, confirmed trigger/exclusion periods — without exposing full explainability detail, override history, or any write affordance.
**User Stories:** US-12.2
**Workspace:** Restricted External Attorney Portal

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Speedy Trial Summary — United States v. Alvarez (read-only)       │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Summary Box ───────────────────────────────────────────────┐   │
│ │ Remaining includable time: 41 days                            │   │
│ │ Next threshold: "Approaching" at 30 days remaining             │   │
│ │ Status: Within limit                                            │   │
│ │ (decision support only — not a legal determination)             │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                      │
│ Confirmed periods (no candidate/proposed detail shown):             │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Jan 5 – Feb 2    Included                                        │ │
│ │ Feb 3 – Mar 18    Excluded — Continuance (confirmed)              │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ℹ️ Full calculation explainability, override history, and candidate │
│    exclusions are not available through this portal. Contact the    │
│    clerk's office with questions about this calculation.             │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Summary Box, Table (simplified, read-only), Site Alert (informational scope notice, persistent).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Remaining time + next threshold + status | Top Summary Box |
| Secondary | Confirmed-only period list | Below summary |
| Tertiary | Scope-limitation disclosure | Bottom, persistent |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Security-designated case | Entire screen inaccessible, case absent from attorney's list | "This case is not available through the external portal" (PORTAL_DESIGNATION_DENIED) — only shown if attorney somehow had a direct link; default is non-listing |
| Visibility level narrower (court-configured) | Some rows omitted per court policy | No error — simply a narrower confirmed-period list, per F3 configuration |
| Clean | Full confirmed summary shown | — |
| No tracker yet initialized | Empty-state text | "A Speedy Trial tracker has not yet been established for this defendant" |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| **None beyond read/scroll** | — | This screen has zero write affordances — no edit, no override request, no candidate-review control — the external token's audience claim structurally cannot invoke F29/F30 write endpoints even if such a control were mistakenly rendered |
## Interaction Patterns

### Pattern: Proposed vs. Confirmed Tag Convention

**When to use:** Any surface displaying a candidate exclusion, proposed exhibit, proposed tracker start context, or mapped-but-unreviewed event alongside confirmed data.
**Behavior:** Proposed/candidate items always use an **outline-style USWDS Tag** reading "Proposed" or "Candidate" in a neutral/amber color. Confirmed items always use a **solid-fill Tag** reading "Confirmed" in teal/green. The two styles are never visually similar enough to be confused at a glance, and screen-reader text always announces the state explicitly (e.g., "status: candidate, not yet reviewed"), never relying on color alone.
**Examples:** Screen-06 (Explain This Date pending segment), Screen-07 (exclusion review), Screen-12 (intake queue "Pending" items), Screen-16 (draft vs. published rule package).

### Pattern: Explicit Human Attribution Line

**When to use:** Any screen recording a ruling, exclusion confirmation, sealing decision, custody acknowledgment, or configuration publish.
**Behavior:** The UI renders a literal sentence naming the actor and action — "Ruling entered: Judge Hale — Admitted," "Sealed by: Judge Hale," "Published by: P. Nandan (approver), drafted by D. Okafor" — never a bare status change. This line is rendered as plain text (not solely an icon/tooltip) so it is visible to screen readers and in printed/exported artifacts.
**Examples:** Screen-01 (ruling confirmation line), Screen-05 (live activity stream), Screen-09 (seal authorization), Screen-16 (publish panel).

### Pattern: Required-Rationale Gate

**When to use:** Any resolution action on an Exception, Reconciliation Discrepancy, Modify/Reject exclusion decision, or supervisory override.
**Behavior:** The submit/resolve control for the action is **rendered disabled** until a Textarea rationale field meets the minimum length (≥10 characters, enforced client-side as a UX courtesy and server-side as the source of truth). A USWDS Character count component shows live progress toward the minimum. The disabled state carries a Tooltip explaining why, rather than silently blocking with no explanation.
**Examples:** Screen-02 (reconciliation discrepancy), Screen-07 (modify/reject exclusion), Screen-13 (exception resolution), Screen-18 (sync conflict resolution — rationale implicit in the explicit value-selection).

### Pattern: Separation-of-Duties Visual Block

**When to use:** Any maker-checker workflow (configuration publish, privileged role grant, template application).
**Behavior:** Rather than letting the drafter click "Publish"/"Approve" and then receiving a 403 error, the control is **rendered disabled from the start** for the drafter's own session, with an inline Tooltip/helper text: "A second approver is required." The approver-selection control (if present) excludes the current user from its own option list structurally, not just via validation.
**Examples:** Screen-16 (Configuration Engine publish), Screen-15 (pending privileged approvals card).

### Pattern: Non-Disclosure of Sealed/Restricted Existence

**When to use:** Any list, search result, or direct-ID lookup against a sealed/restricted/grand-jury/juvenile record by a user lacking the matching entitlement.
**Behavior:** The record is **omitted entirely** — never shown as a greyed-out row, a "restricted" placeholder, or a count that includes it. Direct-ID access returns a "not found" response/screen state, never "access denied," so the UI never confirms the record's existence to an unauthorized viewer. Every omission/attempt is still logged server-side as an `access_attempt` audit event, invisible to the requester but visible later to an authorized auditor.
**Examples:** Screen-19 (attorney's case list), Screen-13/17 (search and audit queries), Screen-09 (sealed exhibit direct access).

### Pattern: Live, No-Refresh Status Mirroring

**When to use:** Any screen displaying a status that another user is actively changing in real time (deputy logging ↔ chambers live view).
**Behavior:** Updates push to the viewing screen without a manual refresh/reload action, using a visible "● LIVE" indicator and a brief (reduced-motion-respecting) highlight animation on newly arrived entries. A connectivity gap is shown explicitly ("Reconnecting…") rather than silently freezing with no visual signal that data may be stale.
**Examples:** Screen-05 (Live Courtroom Status), Screen-04 (Chambers Home live card), Screen-14 (near-real-time portfolio refresh).

### Pattern: Entitlement-Gated Control Rendering (not just role-gated)

**When to use:** Every control that performs a privileged or legally significant action.
**Behavior:** Components check the viewer's **computed entitlement**, not merely their role label, before rendering a control as enabled. A read-only viewer sees the same layout/components as an authorized actor (so the screen's information architecture is consistent across roles) but never sees an *enabled* action button they cannot actually invoke — the control either renders disabled-with-tooltip or is omitted, per screen convention documented in each screen's States table.
**Examples:** Screen-04 (exhibit ruling control), Screen-09 (seal/authorize controls), Screen-11 (security designation checkboxes).

### Pattern: Partial-Availability Degradation

**When to use:** Any workspace where a dependent component/service fails to load.
**Behavior:** The affected card/panel shows a contained Alert ("Part of this workspace is temporarily unavailable") while the rest of the page remains fully usable — never a full-page failure for a partial dependency outage. Courtroom logging specifically continues accepting entries into the local draft buffer even if a secondary component (e.g., live chambers mirror) is unavailable.
**Examples:** Screen-04 (UI_COMPONENT_UNAVAILABLE), Screen-01 (offline/draft-buffer banner), Screen-08 (CONFERENCE_PACKET_PARTIAL).
## Responsive Considerations

JudicialSync is web-first for MVP (mobile native apps are explicitly out of scope per PROJECT.md). All workspaces nonetheless follow USWDS's responsive grid (`usa-grid`/`usa-layout-grid`) and breakpoints so courtroom tablets, chambers laptops, and administrative desktops all receive a correctly adapted — not merely shrunk — layout.

### Desktop (>1024px) — primary target for Chambers, Clerk Console, Admin Dashboard

- Side navigation persists expanded at all times (USWDS Side navigation, full width).
- Multi-column Card grids (e.g., Screen-08 Case Conference View's four-panel grid, Screen-04's Chambers Home) render at full 2–3 column width.
- Tables show all columns; no column hiding required.
- Explain This Date (Screen-06) renders the full visual segment timeline bar at full width with all Accordion detail visible without horizontal scroll.

### Tablet (768px–1024px) — primary target for Courtroom Deputy Interface

- The **Deputy Real-Time Logging screen (Screen-01) is designed tablet-first**, not desktop-first-then-shrunk: large touch targets (≥44×44px per USWDS/WCAG 2.5.5 guidance), the two-column exhibit-list/active-panel layout collapses to a single column with the Active Exhibit Panel becoming a bottom sheet that stays anchored and reachable with one thumb.
- Side navigation collapses to a hamburger/menu-button pattern (USWDS Header mobile menu) in all workspaces except the Deputy interface, which has no persistent side nav at all by design (low-chrome, full-screen logging surface takes priority per US-11.2).
- Custody Transfer (Screen-03) renders as a full-screen takeover rather than a modal at this breakpoint, so form fields remain large and unambiguous under courtroom time pressure.

### Mobile (<768px) — supported for read-mostly/notification-driven use only

- Judge/Chambers and Clerk Console workspaces remain functional at mobile width for **reviewing** notifications and work-queue items (e.g., Ana checking a threshold alert from a hallway), but data-entry-heavy screens (Configuration Engine, Case Setup) show a Site Alert recommending a larger viewport for editing — they are not blocked, only advised, since accessibility requires a functional (if dense) fallback.
- Cards stack to single column; Tables convert to a stacked card-per-row pattern (USWDS-recommended responsive table technique: each row becomes a labeled key/value card) rather than horizontal scroll, since horizontal scroll on data tables is a common accessibility and usability failure point.
- Attorney Portal (Screen-19/20) is explicitly designed to be fully usable at mobile width, since external attorneys are the most likely to access the portal from varied devices outside a court building.

### Cross-cutting responsive rules

- No information available at desktop width is ever silently dropped at smaller widths — it is reordered, stacked, or placed behind a documented "View more" disclosure, never removed.
- Breakpoint behavior for the Courtroom Deputy interface is treated as a release-gate test case (per US-11.2's "large touch targets" acceptance criterion), validated on the actual tablet hardware class used in pilot courtrooms, not just browser emulation.
- All breakpoints use USWDS's standard token set (`mobile`, `mobile-lg`, `tablet`, `desktop`, `widescreen`) rather than custom breakpoints, so the design system's built-in accessibility and spacing guarantees carry through unmodified.
## Accessibility Notes

Section 508 conformance is a **release gate**, not a backlog item, per PRD §6 NFRs and US-11.1/US-11.2/US-11.3/US-11.4 acceptance criteria. Every workspace must pass automated checks (axe-core or equivalent) **and** a manual screen-reader pass before shipping. The table below maps each relevant Section 508/WCAG 2.1 AA success criterion to the specific USWDS pattern JudicialSync relies on to satisfy it, plus the screen(s) where it is most load-bearing.

| Section 508 / WCAG Concern | USWDS Pattern Used | Where It Matters Most |
|---|---|---|
| **Keyboard operability (2.1.1, 2.1.2)** | USWDS Button, Accordion, Tabs, and form components are all natively keyboard-operable with visible focus states (`usa-focus`); custom `aria-keyshortcuts` hints documented per action | Screen-01 (Deputy Real-Time Logging) — US-17.1 requires **100% keyboard completion** of offer/objection/ruling with no mouse/touch dependency; validated via manual screen-reader pass, not automated checks alone (US-11.2) |
| **Focus order and visible focus indicator (2.4.3, 2.4.7)** | USWDS default focus-ring styling preserved, never overridden by custom CSS; logical DOM order matches visual order in all Card/Grid layouts | All screens, especially Screen-02 (sequential reconciliation Accordion flow) and Screen-16 (tabbed configuration editor) |
| **Color is never the only indicator (1.4.1)** | Every status Tag pairs color with text label and/or Icon glyph (e.g., severity Tags in Screen-13 use color + 🔴/🟠/🟡/⚫ glyph + text "High"/"Medium"/etc.) | Screen-13 (Exception Queue severity), Screen-18 (health status Tags), Screen-06 (included/excluded segment bar uses solid vs. diagonal-hatch fill, not color alone) |
| **Text contrast (1.4.3, 1.4.11)** | USWDS default color tokens (`usa-*` theme palette) meet AA contrast ratios out of the box; no custom color overrides permitted outside the approved theme | All screens — enforced via automated axe-core contrast checks as part of CI release gate |
| **Name, Role, Value for custom components (4.1.2)** | Live-updating regions (Screen-05 activity stream, Screen-04 live card) use `aria-live="polite"` regions so screen readers announce new entries without interrupting the user's current focus; status changes never rely on visual-only animation | Screen-05 (Live Courtroom Status) — critical since a screen-reader user in chambers must hear "Ruling entered: Judge Hale — Admitted" exactly as a sighted user sees it |
| **Error identification and suggestion (3.3.1, 3.3.3)** | USWDS Alert (error/warning) always paired with the specific offending field/row and a corrective instruction, never a generic "an error occurred" | Screen-16 (Configuration Engine inline validation), Screen-03 (Custody Transfer type-specific field errors), Screen-12 (intake metadata errors) |
| **Required-field / rationale gating communicated accessibly (3.3.2)** | USWDS Character count component announces remaining-characters-to-minimum via `aria-live`; disabled submit buttons carry `aria-disabled` + visible Tooltip text (not title-attribute-only) | Screen-02, Screen-07, Screen-13 (required-rationale gate pattern) |
| **Non-text content / icons (1.1.1)** | Every Icon (status glyphs, lock icons, live indicators) carries an `aria-label` or adjacent visible text equivalent; decorative icons marked `aria-hidden` | Screen-09 (sealed/lock icon), Screen-15 (health check icons) |
| **Consistent navigation (3.2.3)** | USWDS Side navigation structure and labeling kept identical in pattern (though content differs) across all four workspaces, so users who move between roles (e.g., a judge who also holds a reporting-viewer entitlement) retain a predictable mental model | Navigation Map (see `00-overview.md`) |
| **Timing adjustable / no unexpected timeouts without warning (2.2.1)** | SLA countdowns (custody acknowledgment, Screen-03) are informational displays only — they never auto-submit or auto-dismiss a form; session timeout warnings use a USWDS Modal with an explicit "extend session" action before expiry | Screen-03 (custody SLA), all authenticated workspaces (session re-validation per F00, every 5 minutes on privileged actions) |
| **Reduced motion respected (2.3.3)** | Live-update highlight animations (Screen-05) and step-indicator transitions honor `prefers-reduced-motion`, falling back to an instant state change with no animation | Screen-05, Screen-02 (Step Indicator) |
| **Responsive reflow without loss of content/function (1.4.10)** | Tables degrade to stacked card-per-row at mobile widths (see `Y1-responsive.md`) rather than requiring two-dimensional scrolling | Screen-13, Screen-14, Screen-17, Screen-18 (all data-table-heavy screens) |
| **Printed/exported artifact accessibility** | Generated packets (Screen-08 "Generate Packet," Screen-17 audit export, Screen-09 jury package manifest) use tagged, accessible PDF structures consistent with Section 508 document requirements, not flattened images of the screen | Screen-08, Screen-19 (submission confirmation receipts) |

### Process gates (carried from F11 acceptance criteria)

- **Automated gate:** axe-core (or equivalent) run against every workspace screen in CI; zero critical/serious violations permitted to merge.
- **Manual gate:** a full screen-reader pass (NVDA/JAWS or VoiceOver, per pilot court's assistive-technology baseline) specifically exercising the **Courtroom Deputy Interface's** offer/objection/ruling cycle end-to-end with no mouse — this is called out as a distinct, non-automatable release gate in US-11.2, over and above the Section 508 baseline applied to the other three workspaces.
- **No workspace ships** without both gates passing; this is a binding NFR per PRD §6, not a nice-to-have.
