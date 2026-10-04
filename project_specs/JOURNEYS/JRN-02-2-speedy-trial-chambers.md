### JRN-02.2: Criminal Case Monitoring from Chambers — Speedy Trial Oversight

**Persona:** PER-02 (Judge Robert Hale, with Ana Ibarra)
**Scenario:** Over the life of a criminal case, Judge Hale and Ana monitor the Speedy Trial clock as motions are filed and a continuance is requested, ultimately confirming the clock status ahead of a status conference and trial setting — mirroring David's clerk-side lifecycle in JRN-03.1 from the chambers side of the same case.
**Related Jobs:** JTBD-02.2, JTBD-02.3, JTBD-02.4, JTBD-02.1

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| Threshold Alert Received | Ana receives a proactive alert that a defendant's remaining includable time is approaching a configured risk threshold | Configurable Threshold Alerts (F31), Notifications Service (F4) | (Ana) "I need to get this in front of Judge Hale today, not let it sit in an inbox" | Alert, urgent | Approaching deadlines were previously discovered through periodic manual docket review, often too late | Alert content links directly into the explanation context so she doesn't have to reconstruct why the threshold was crossed |
| Explain This Date Review | Opens "explain this date" to see the full breakdown of elapsed time, exclusions, and the current remaining-time calculation | Versioned Clock Calculation and Explainability (F29) | "Before I do anything, I need to see exactly why the clock says what it says" | Methodical, wary of trusting an unverifiable number | The calculation was historically manual and difficult to audit; any explanation gap would undermine confidence | Every segment links to its triggering event and rule version, so the full chain of reasoning is visible on demand |
| Motion Filed — Candidate Exclusion Review | Reviews a continuance motion mapped to a candidate exclusion period and accepts, modifies, or rejects it with documented rationale | Candidate Exclusion Engine (F28), Review and Approval Workflow (F30) | "This is my call — I want to see the motion and order reference, not just take the system's suggestion" | Deliberate, authoritative | Relying on an incomplete record without noticing if a required finding or order reference is missing | Continuance Findings Check flags incomplete records before the calculation relies on them |
| Continuance Findings Flagged | The system flags this continuance record as missing a required structured finding; Ana routes it back to the filing party before Judge Hale finalizes his decision | Continuance Findings Check (F33), Work Queue (F6) | (Ana) "Better to catch this now than have it challenged later" | Vigilant, relieved | Missing findings were previously "caught late or not at all" | Flag-only behavior keeps legal-sufficiency determination entirely with chambers while surfacing the gap automatically |
| Status Conference Preparation | Ana opens the case conference view to review clock state, pending motions, and continuance history in one screen | Case Conference View (F35), Case Timeline View (F8) | "I want Judge Hale walking in already knowing where things stand, not reconstructing it from the docket" | Prepared, efficient | Conference prep was previously manually compiled docket excerpts and notes | Single consolidated view with deep links into underlying event and exclusion detail, available as a pre-conference packet |
| Trial Setting / Disposition Confirmation | Confirms the current Speedy Trial status at the conference and sets a trial date, referencing the explained calculation directly | Versioned Clock Calculation (F29), Multi-Defendant Separation (F34) | "I can state this date with full confidence because I can see exactly how it was built" | Confident, in command | In a multi-defendant matter, co-defendant clocks must stay clearly separated or the ruling risks misrepresenting one defendant's status | Clearly separated per-defendant clocks with relationship visibility prevent any one case's result from being collapsed |

#### Key Moments
- **Decision Point:** Motion Filed — Candidate Exclusion Review — his accept/modify/reject decision is the sole point where a period becomes legally excludable; the system never decides this for him.
- **Risk of Abandonment:** Explain This Date Review — if the explanation ever has a gap or an unlinked segment, Judge Hale stops trusting the calculated date entirely and reverts to manual recalculation.
- **Delight Opportunity:** Status Conference Preparation — walking into a conference fully briefed from one screen instead of Ana's manual compilation.

#### Success Outcome
Judge Hale can produce a complete, defensible explanation for any Speedy Trial date within minutes (JTBD-02.1); every candidate exclusion is explicitly reviewed with incomplete findings caught before reliance (JTBD-02.2); the threshold alert was delivered and acknowledged before risk materialized (JTBD-02.3); and the conference packet required no manual reconstruction (JTBD-02.4).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| Threshold Alert Received | F31, F4 |
| Explain This Date Review | F29 |
| Motion Filed — Candidate Exclusion Review | F28, F30 |
| Continuance Findings Flagged | F33, F6 |
| Status Conference Preparation | F35, F8 |
| Trial Setting / Disposition Confirmation | F29, F34 |

---
