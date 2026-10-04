## Epic 17: Real-Time Courtroom Logging (F17)

### US-17.1: Log Exhibit Offers, Objections, and Rulings in Real Time
**As a** courtroom deputy (Maria Santos), **I want to** record an exhibit offer, objection, or ruling in a small number of taps or keystrokes during live proceedings, **so that** I never have to revert to paper to keep up with the courtroom.

**Acceptance Criteria:**
- [ ] Logging a single offer/objection/ruling cycle is completable in a bounded number of UI interactions (target: ≤3 actions)
- [ ] Every action is operable fully via keyboard shortcuts, supporting both courtroom speed and accessibility
- [ ] Objection entries select from a short, courtroom-relevant, configurable category list with one additional action
- [ ] Entries are automatically timestamped (not user-editable) with optional free-text notes
- [ ] A ruling attempted with no assigned judge on the proceeding is blocked and routed to an exception, returning `COURTROOM_NO_JUDGE_ASSIGNED` (422)

**Priority:** P0 | **Feature Ref:** F17

---

### US-17.2: Resume Logging After a Connectivity Disruption Without Data Loss
**As a** courtroom deputy (Maria Santos), **I want to** have my in-progress entries persisted locally and resynced automatically if the system disconnects mid-session, **so that** a courtroom disruption never costs me lost data or a reversion to paper.

**Acceptance Criteria:**
- [ ] The interface persists entries in a local draft buffer during disruption and resyncs automatically on reconnection
- [ ] A resync conflict with a concurrent update routes to the Exception Queue, returning `COURTROOM_RESYNC_CONFLICT` (409) rather than silently discarding one version
- [ ] No entry is lost due to a connectivity interruption during an active session
- [ ] Chambers' live status view reflects logged actions in real time once resynced, without a manual refresh step

**Priority:** P0 | **Feature Ref:** F17

---

### US-17.3: Close a Session and Trigger Mandatory Reconciliation
**As a** courtroom deputy (Maria Santos), **I want to** trigger the recess/day-end/trial-close reconciliation checkpoint directly from the logging interface when I close a session, **so that** discrepancies are caught immediately rather than discovered later.

**Acceptance Criteria:**
- [ ] Session close triggers the F18 reconciliation checkpoint automatically
- [ ] A session cannot be marked closed while leaving the ledger un-reconciled, without an explicit, logged override by an authorized user, returning `COURTROOM_UNRECONCILED_CLOSE` (409) otherwise
- [ ] An action attempted on an exhibit in a terminal/incompatible status returns `COURTROOM_INVALID_ACTION` (409)
- [ ] A quick-added unlisted exhibit still requires minimum required fields before it can be saved, routing to the Exception Queue if incomplete at session close

**Priority:** P0 | **Feature Ref:** F17

---
