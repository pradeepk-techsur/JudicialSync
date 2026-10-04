## PER-04: Priya Nandan

### JRN-04.1: Investigating a Disputed Sealed-Record Access

**Persona:** PER-04 (Priya Nandan)
**Scenario:** A defense attorney disputes that a sealed exhibit — the same category of record Judge Hale authorized sealing for in JRN-02.1 — was improperly viewed by an unauthorized party. Priya must reconstruct exactly who accessed it, when, and under what authorization, using the audit explorer and access-control configuration, to produce a defensible answer for the court.
**Related Jobs:** JTBD-04.2, JTBD-04.1, JTBD-04.4

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| Dispute Reported | Receives a report that a sealed exhibit's access history is being questioned | Role-Specific UI Workspaces — Admin Dashboard (F11) | "I need every access attempt on this exhibit, successful or denied, not just a summary" | Focused, aware of the stakes | Fragmented legacy tooling offered no structured way to reconstruct this kind of history at all | A single audit explorer entry point scoped directly to the disputed object |
| Audit Explorer Query | Queries the audit explorer by case, object, and date range to pull every access event tied to the sealed exhibit | Audit Trail and Audit Explorer (F2) | "This needs to be tamper-evident — if I can't prove the log wasn't altered, this investigation is worthless" | Methodical, confident in the tool | A log that could plausibly be edited after the fact would be useless as evidence | Tamper-evident/immutable logging with audit access strictly separated from operational editing |
| Access Control Cross-Check | Cross-references the access log against the role/attribute scope configured for each user who touched the record at the time | Identity and Access Management (F0) | "Did this person's access match their authorized role and security designation at that moment, or was there a scoping gap?" | Analytical, thorough | Inconsistent or fragmented access-policy enforcement turns this cross-check into guesswork | RBAC/ABAC scoping by court/division/case/proceeding/party-role/security-designation gives a precise, queryable record to compare against |
| Rule-Version Linkage Review | Confirms which sealing policy and judge authorization were in effect at the time of each access attempt | Sealing and Restricted Exhibit Handling (F21), Audit Trail (F2) | "I need to show this access either matched an authorized sealing/release action or it didn't — no gray area" | Rigorous, protective of court credibility | Without linkage between the audit entry and the policy/authorization in effect, no definitive answer is possible | Audit entries link directly to the rule package or authorization version in effect at the time of the action |
| Findings Delivered | Delivers a structured, defensible findings report to court leadership and Judge Hale confirming whether unauthorized access occurred | Audit Trail and Audit Explorer (F2), Operational Reporting Feed (F9) | "This has to hold up if it's challenged again later — on appeal, in an IG review, anywhere" | Confident, vindicated by a clean process | None in the clean-resolution case; a real violation shifts the pain point to incident response, out of this journey's scope | A reusable, repeatable investigation pattern that shortens every future response time |

#### Key Moments
- **Decision Point:** Access Control Cross-Check — this is where Priya determines whether the access was policy-compliant or a genuine violation.
- **Risk of Abandonment:** Audit Explorer Query — if the log has gaps or isn't genuinely tamper-evident, the entire investigation loses credibility and the court's trust in the platform erodes.
- **Delight Opportunity:** Findings Delivered — producing a complete, defensible answer in a single investigation session rather than a multi-week reconstruction effort.

#### Success Outcome
100% of material actions are captured in the tamper-evident audit trail (JTBD-04.2); zero unauthorized-access attempts are found to have succeeded against the sealed record (JTBD-04.1); and sensitive-record policy enforcement is confirmed to have applied consistently (JTBD-04.4).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| Dispute Reported | F11 |
| Audit Explorer Query | F2 |
| Access Control Cross-Check | F0 |
| Rule-Version Linkage Review | F21, F2 |
| Findings Delivered | F2, F9 |

---
