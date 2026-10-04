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
