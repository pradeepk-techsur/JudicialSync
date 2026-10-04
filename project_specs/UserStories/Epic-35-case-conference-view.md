## Epic 35: Case Conference View (F35)

### US-35.1: View a Consolidated Case Conference Summary
**As a** judge (Judge Robert Hale), **I want to** see clock state, pending motions, continuance history, and open issues on a single screen before a conference or hearing, **so that** I don't have to reconstruct the case's status from the docket by hand.

**Acceptance Criteria:**
- [ ] View assembles the current calculation version summary, all unreviewed candidate exclusions, continuance history with completeness flags, and open issues (unresolved exceptions, unacknowledged alerts) relevant to the tracker
- [ ] The view reflects only confirmed data as "current state," clearly distinguishing pending/candidate items as not-yet-decided
- [ ] Each summarized item deep-links to its full detail/review view
- [ ] A tracker not found or not authorized returns `CONFERENCE_TRACKER_NOT_FOUND` (404)
- [ ] For multi-defendant matters, the view surfaces an explicit co-defendant summary panel rather than merging statuses

**Priority:** P1 | **Feature Ref:** F35

---

### US-35.2: Generate a Pre-Conference Review Packet
**As a** judge's law clerk (Ana Ibarra), **I want to** generate a printable/exportable review packet summarizing the case conference view, **so that** I can prepare materials ahead of status conferences, continuance decisions, pretrial conferences, or trial settings.

**Acceptance Criteria:**
- [ ] Packet content mirrors the on-screen case conference view, timestamped at generation
- [ ] If some underlying data is unavailable, the packet is generated as partial (`CONFERENCE_PACKET_PARTIAL`, 206) rather than failing outright
- [ ] Packet generation does not require certification, since it changes no record, but remains timestamped for traceability
- [ ] Access to generate a packet requires at minimum the same entitlement as viewing the underlying tracker/calculation

**Priority:** P1 | **Feature Ref:** F35

---
