## PER-03: David Okafor

### JRN-03.1: Criminal Case Monitoring: Speedy Trial — Clerk Lifecycle

**Persona:** PER-03 (David Okafor)
**Scenario:** From the moment a new defendant enters David's caseload through trial or disposition, David initializes the Speedy Trial tracker, resolves docket-mapping exceptions, supports the continuance and exclusion workflow feeding chambers' review (JRN-02.2), and tracks the case through threshold alerts to closeout — all while managing dozens of other cases across multiple judges in parallel.
**Related Jobs:** JTBD-03.3, JTBD-03.2, JTBD-03.1, JTBD-03.4

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| Tracker Opened | A CM/ECF arraignment event triggers automatic tracker creation; David confirms the applicable start context | Case and Defendant Tracker Initialization (F26), CM/ECF Integration Adapter (F10) | "Did the trigger event actually fire correctly, or do I need to create this one manually?" | Attentive, wary of missed triggers | No systematic way previously existed to catch a missing trigger event until status was already needed | Missing-trigger-event detection flags the gap the moment a tracker should have been created, not after the fact |
| Motion Filed / Docket Event Ingested | A pretrial motion syncs in from CM/ECF; David reviews the mapping to confirm it's correctly categorized | Docket Event Ingestion and Mapping (F27) | "Is this mapped to the right exclusion category, or will it sit in my exception queue as unmapped?" | Methodical, mildly impatient | Unmapped CM/ECF events accumulate without a clear fast path to resolution, creating downstream calculation risk | Configurable event-category mapping he can adjust directly, shrinking the unmapped-event rate over time |
| Continuance Requested | Processes a defense continuance filing, checks it against the findings requirement, and routes a candidate exclusion for chambers review | Candidate Exclusion Engine (F28), Continuance Findings Check (F33), Exception Queue (F7) | "If this is missing a required finding, I'd rather catch it now than have Judge Hale catch it at conference" | Proactive, protective of chambers' time | Incomplete continuance filings were previously discovered only when challenged, often well after reliance | Structured completeness check flags gaps automatically before the record reaches chambers' review queue |
| Threshold Reached | Sees the risk-threshold alert land in the shared work queue alongside chambers as remaining includable time crosses the configured line | Configurable Threshold Alerts (F31), Work Queue (F6) | "I need to make sure chambers actually saw this, not just that it fired" | Vigilant | Risk was previously discovered only through periodic manual docket review, often reactively | Delivery and acknowledgment tracking confirms the alert didn't just send — it was seen |
| Portfolio Check Across Caseload | Opens the portfolio dashboard mid-week to see which of his many cases have open exceptions, approaching thresholds, or closeout backlog | Speedy Trial Portfolio Dashboard (F36), Exhibit Portfolio Dashboard (F25) | "Which of these forty cases actually needs my attention today?" | In control, efficient | Previously had to check case-by-case with no aggregated view of risk | Risk indicators highlight approaching thresholds and data gaps across the whole caseload in one screen |
| Trial or Disposition Closeout | Confirms the final Speedy Trial status is reflected and the case record is ready for closeout with no open exceptions outstanding | Versioned Clock Calculation (F29, via chambers), Exception Queue (F7) | "If anything's still open here, it needs resolving before this case is considered closed" | Methodical, satisfied when clean | A case closing with unresolved exceptions or unmapped events creates downstream audit risk | Closeout gate surfaces any remaining open items for this case before it's marked resolved |

#### Key Moments
- **Decision Point:** Continuance Requested — David's completeness check determines whether chambers receives a clean record or has to send it back, affecting conference efficiency.
- **Risk of Abandonment:** Motion Filed / Docket Event Ingested — if unmapped events keep piling up without a fast resolution path, David reverts to manually cross-checking the docket case-by-case.
- **Delight Opportunity:** Portfolio Check Across Caseload — seeing every at-risk case across his full caseload in one screen instead of opening cases one by one.

#### Success Outcome
New tracker setups are initialized without a missing-trigger incident discovered after the fact (JTBD-03.3); unmapped docket events trend toward a low single-digit percentage (JTBD-03.2); missing-metadata discipline holds across the caseload (JTBD-03.1); and David can identify every case with outstanding risk without opening cases individually (JTBD-03.4).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| Tracker Opened | F26, F10 |
| Motion Filed / Docket Event Ingested | F27, F7 |
| Continuance Requested | F28, F33, F7 |
| Threshold Reached | F31, F6 |
| Portfolio Check Across Caseload | F36, F25 |
| Trial or Disposition Closeout | F29, F7 |

---
