### JRN-01.2: Multi-Day Trial — Overnight Custody and Next-Morning Discrepancy Resolution

**Persona:** PER-01 (Maria Santos)
**Scenario:** During a four-day trial, a physical exhibit must leave the courtroom overnight for secure storage, and a reconciliation discrepancy surfaces that Maria cannot resolve alone — requiring escalation into David's portfolio-level exception queue before the next day's session begins.
**Related Jobs:** JTBD-01.3, JTBD-01.2, JTBD-03.2

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| End-of-Day Custody Transfer | Logs the transfer of a physical exhibit to the evidence custodian at day's end | Custody and Location Tracking (F20) | "I need this acknowledged before I leave the building" | Tired, wanting closure | Evidence custodian is off-site and doesn't acknowledge immediately | SLA countdown visible to Maria so she knows exactly when to escalate |
| Unacknowledged Transfer Alert | The SLA window passes without acknowledgment; an alert fires to Maria and the custody supervisor | Notifications Service (F4), Custody and Location Tracking (F20) | "Good — I didn't have to remember to chase this myself" | Relieved | Under the old paper process this would have been invisible until someone went looking for the exhibit | Escalation path auto-notifies a backup contact if the primary custodian doesn't respond |
| End-of-Day Reconciliation Mismatch | Runs day-end reconciliation and finds one admitted exhibit missing from a party's exhibit list | Dual-Log and Source Reconciliation (F18), Exception Queue (F7) | "I can't tell if this is a typo on their list or a real problem — I shouldn't guess" | Frustrated, wary | Some mismatches require portfolio-level context only David can resolve | One-click escalation routes the discrepancy into David's shared exception queue with full context attached |
| Clerk Reviews and Resolves | David picks up the escalated exception the next morning, reviews the numbering configuration, and resolves it with documented rationale | Exception Queue (F7), Configuration Engine (F3) | (David) "This is the third time this numbering mismatch has happened — I should fix the configuration, not just this case" | (David) Mildly annoyed, in control | A recurring pattern fixed one-off instead of at the root keeps happening | Exception queue surfaces recurring patterns so David can trace them to a root-cause configuration fix |
| Resolution Confirmed Before Next Session | Maria sees the exception marked resolved with rationale before the next day's session begins | Exception Queue (F7), Audit Trail (F2) | "Good — I can walk in today without a cloud hanging over yesterday's record" | Confident, relieved | None at this resolved state | Resolution and rationale automatically logged to the audit trail, closing the loop with no extra data entry |

#### Key Moments
- **Decision Point:** End-of-Day Reconciliation Mismatch — Maria must decide whether to resolve it herself or escalate; escalating the right items (rather than guessing) is what prevents downstream errors.
- **Risk of Abandonment:** Unacknowledged Transfer Alert — if alerts are unreliable or noisy, Maria stops trusting them and reverts to manually tracking custody herself.
- **Delight Opportunity:** Resolution Confirmed Before Next Session — walking into day two with yesterday's record fully clean.

#### Success Outcome
Zero custody transfers remain unacknowledged beyond SLA (JTBD-01.3) and zero unresolved discrepancies carry over past trial close (JTBD-01.2), while David's exception-queue resolution trends recurring issues toward configuration fixes (JTBD-03.2).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| End-of-Day Custody Transfer | F20 |
| Unacknowledged Transfer Alert | F4, F20 |
| End-of-Day Reconciliation Mismatch | F18, F7 |
| Clerk Reviews and Resolves | F7, F3 |
| Resolution Confirmed Before Next Session | F7, F2 |

---
