### JRN-04.2: Governing a Privileged Configuration Change and CM/ECF Conflict

**Persona:** PER-04 (Priya Nandan)
**Scenario:** David requests a new exclusion-category mapping and numbering-scheme adjustment for a court profile (following on from his recurring-issue discovery in JRN-03.2). At the same time, the CM/ECF adapter flags a sync conflict where an inbound docket update disagrees with a locally entered exhibit record. Priya must approve the privileged configuration change under separation-of-duties controls and resolve the CM/ECF conflict without ever letting it silently overwrite data.
**Related Jobs:** JTBD-04.5, JTBD-04.3, JTBD-03.5

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| Configuration Change Requested | David submits a request to adjust a court profile's event-category mapping and numbering scheme | Configuration Engine (F3), Work Queue (F6) | "This is a privileged change — I want to see exactly who's authorized to approve it before it goes live" | Procedural, careful | Privileged and routine administrative actions historically lacked clean segregation, creating audit exposure | Separation-of-duties enforcement ensures David's routine clerk role can request but not unilaterally approve a privileged change |
| CM/ECF Conflict Flagged | The CM/ECF adapter detects an inbound docket update conflicting with a locally entered record and routes it to Priya's human-review queue instead of overwriting either side | CM/ECF Integration Adapter (F10), Exception Queue (F7) | "Good — it didn't just pick one and overwrite the other. Now I actually get to look at this" | Reassured, aware of the time cost | A silent overwrite here would be a serious integrity and compliance risk if it ever happened | Guaranteed routing to human review with source identifiers preserved on both the inbound and local record |
| Conflict Resolution | Reviews both versions, confirms which reflects the authoritative docket, and resolves the conflict while preserving source lineage | CM/ECF Integration Adapter (F10), Audit Trail (F2) | "CM/ECF has to win here unless there's a clear reason it doesn't — that's the whole principle this platform is built on" | Deliberate, principled | Without enforced source-identifier preservation, resolving this cleanly would be hard to justify later | Source-identifier preservation on all imported records makes the resolution traceable and defensible after the fact |
| Configuration Change Approved | Reviews David's request, confirms it doesn't conflict with national core constraints, and approves it under the governed, versioned change process | Configuration Engine (F3), Audit Trail (F2) | "This needs to be versioned, not quietly edited — if someone asks what changed and why next year, I need an answer" | Methodical, satisfied the process has teeth | Undocumented configuration edits in the old world created long-term audit and compliance exposure | Versioned configuration changes with a full audit trail mean every change is explainable indefinitely |
| Verification via Audit Explorer | Later verifies in the audit explorer that both the configuration change and the CM/ECF conflict resolution are fully attributed, versioned, and segregated from routine operational actions | Audit Trail and Audit Explorer (F2) | "If anyone ever questions either of these actions, I can answer immediately" | Confident, in control | None in the clean-resolution case | A single audit view confirms separation-of-duties compliance is real, not just a policy on paper |

#### Key Moments
- **Decision Point:** CM/ECF Conflict Flagged — Priya's resolution determines which record is treated as authoritative; getting this wrong undermines the platform's entire authoritative-source discipline.
- **Risk of Abandonment:** Configuration Change Requested — if separation-of-duties controls are clunky or slow David down too much for routine changes, pressure builds to bypass them informally.
- **Delight Opportunity:** Verification via Audit Explorer — confirming, in minutes, that governance controls actually held, rather than hoping they did.

#### Success Outcome
Privileged administrative actions remain fully segregated from routine operational roles and verifiable via the audit explorer (JTBD-04.5); zero instances of CM/ECF docket data being silently overwritten occur — the conflict routed to human review as designed (JTBD-04.3); and David's underlying configuration need is met without an IT ticket (JTBD-03.5).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| Configuration Change Requested | F3, F6 |
| CM/ECF Conflict Flagged | F10, F7 |
| Conflict Resolution | F10, F2 |
| Configuration Change Approved | F3, F2 |
| Verification via Audit Explorer | F2 |

---
