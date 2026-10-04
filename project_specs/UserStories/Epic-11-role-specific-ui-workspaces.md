## Epic 11: Role-Specific UI Workspaces (F11)

### US-11.1: Land on a Judge/Chambers Oversight Workspace
**As a** judge (Judge Robert Hale), **I want to** land on a workspace composing the case timeline, pending approvals, exhibit oversight, and explain-this-date view, **so that** I can review and act on what needs my attention without hunting across screens.

**Acceptance Criteria:**
- [ ] Workspace composes case timeline (F8), pending ruling/exclusion/finding tasks (F6), exhibit status oversight (F16), and explain-this-date (F29)
- [ ] No control is enabled unless the user's entitlement permits the action, even if the component is visible (e.g., a read-only viewer never sees an enabled "confirm ruling" button)
- [ ] Workspace is built entirely on USWDS components and passes automated Section 508 accessibility checks as a release gate
- [ ] A user with no role mapped to any workspace receives `UI_NO_WORKSPACE_ASSIGNED` (403)

**Priority:** P0 | **Feature Ref:** F11

---

### US-11.2: Use a Fast, Keyboard-Operable Courtroom Deputy Interface
**As a** courtroom deputy (Maria Santos), **I want to** use a full-screen, low-chrome logging interface with large touch targets and keyboard shortcuts, **so that** I can log exhibit actions in real time without slowing down the proceeding.

**Acceptance Criteria:**
- [ ] Real-time courtroom logging (F17) is the primary full-screen surface, with secondary access to custody recording (F20) and session-end reconciliation (F18)
- [ ] All offer/objection/ruling entry interactions are completable via keyboard alone, without requiring mouse/touch
- [ ] Interface passes a manual screen-reader accessibility pass in addition to automated checks before release
- [ ] If a dependent component fails to load, the interface degrades to partial availability (`UI_COMPONENT_UNAVAILABLE`, 206) rather than blocking all logging

**Priority:** P0 | **Feature Ref:** F11

---

### US-11.3: Operate a Clerk Operations Console
**As a** clerk/case administrator (David Okafor), **I want to** use a console composing case setup, intake queue, exception queue, reconciliation actions, and portfolio dashboards, **so that** I can manage my full caseload's operational quality from one place.

**Acceptance Criteria:**
- [ ] Console composes case/proceeding setup (F14), pretrial intake queue (F15), exception queue (F7), reconciliation checkpoint actions (F18), and portfolio dashboards (F25/F36)
- [ ] Every action surfaced reflects the viewer's actual entitlement, not merely their role label
- [ ] Console is built on USWDS components and meets the same Section 508 release gate as every other workspace

**Priority:** P0 | **Feature Ref:** F11

---

### US-11.4: Operate an Administrative Dashboard
**As a** system administrator (Priya Nandan), **I want to** use a dashboard composing configuration, identity/role management, reporting feed, and adapter health, **so that** I can manage platform-wide settings and monitor integration health from one place.

**Acceptance Criteria:**
- [ ] Dashboard composes the Configuration Engine (F3), identity/role management (F0), operational reporting feed (F9), and CM/ECF adapter health (F10)
- [ ] All privileged actions surfaced require the correct entitlement and are subject to separation-of-duties enforcement where applicable
- [ ] Dashboard is accessible via keyboard and passes the same Section 508 release gate as other workspaces

**Priority:** P0 | **Feature Ref:** F11

---
