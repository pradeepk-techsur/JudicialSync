## Epic 31: Configurable Threshold Alerts and Escalation (F31)

### US-31.1: Receive a Threshold-Crossing Alert Linked to Full Explanation
**As a** judge (Judge Robert Hale), **I want to** be alerted as soon as remaining time crosses a configured threshold tier, with a direct link to the full explain-this-date view, **so that** I act on approaching deadlines early, never from a bare date alone.

**Acceptance Criteria:**
- [ ] An alert is generated when the new calculation version's remaining time newly crosses a configured tier boundary compared to the prior version
- [ ] Every alert includes a working deep link to the explain-this-date view; an alert lacking this linkage is treated as a system defect (`ALERT_MISSING_CONTEXT`, 500 internal guard)
- [ ] A tier crossing is detected exactly once per crossing event, not re-fired on every subsequent calculation remaining below the same tier
- [ ] A court with no configured threshold tiers returns `ALERT_NO_TIERS_CONFIGURED` (422)

**Priority:** P0 | **Feature Ref:** F31

---

### US-31.2: Escalate Unacknowledged Threshold Alerts
**As a** clerk/case administrator (David Okafor), **I want to** have unacknowledged threshold alerts escalate to a secondary recipient after a configured cadence, **so that** 100% of threshold crossings generate a delivered, acknowledged alert.

**Acceptance Criteria:**
- [ ] Escalation cadence has a defined maximum unacknowledged duration per severity tier, with critical (limit-reached) tiers having the shortest window
- [ ] Alert delivery failure routes to the Exception Queue rather than failing silently, returning `ALERT_DELIVERY_FAILED` (502)
- [ ] Threshold-alert acknowledgment is itself captured in the audit trail as evidence a human reviewed the risk signal
- [ ] An unacknowledged alert exceeding cadence triggers `ALERT_ESCALATED` to the configured secondary recipient role

**Priority:** P0 | **Feature Ref:** F31

---
