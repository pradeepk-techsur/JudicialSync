## Epic 28: Candidate Exclusion Engine (F28)

### US-28.1: Generate Candidate Exclusion Periods for Review
**As a** judge (Judge Robert Hale), **I want to** have the system suggest candidate excludable time periods from mapped events (motions, competency proceedings, continuances, interlocutory matters), **so that** I review well-formed candidates instead of calculating exclusions from scratch.

**Acceptance Criteria:**
- [ ] A categorized docket event matching a configured exclusion-triggering category generates a candidate exclusion with a proposed start date, and a proposed end date where determinable
- [ ] The engine has no authority to transition a candidate to `confirmed` — that transition exists only in the review workflow (F30) and always requires a human actor
- [ ] A later disposing event updates an open-ended candidate's proposed end date only while still in `candidate` state — never after review

**Priority:** P0 | **Feature Ref:** F28

---

### US-28.2: See Every Candidate Linked to Its Source Event and Rule Version
**As a** judge (Judge Robert Hale), **I want to** see each candidate exclusion explicitly linked to its triggering event(s) and the exact rule-package version that generated it, **so that** I can trust and explain every suggestion rather than treating it as a black box.

**Acceptance Criteria:**
- [ ] A candidate exclusion must always carry a non-null `triggering_event_refs` and `rule_version_ref`; an exclusion with no traceable source is treated as a system defect (`EXCLUSION_NO_SOURCE_EVENT`, 500 internal guard)
- [ ] Once a candidate has been reviewed, the generation engine must not further mutate that specific record, returning `EXCLUSION_ALREADY_REVIEWED` (409, internal guard) if attempted
- [ ] An exclusion category with no configuration in the active rule package returns `EXCLUSION_CATEGORY_UNDEFINED` (422)

**Priority:** P0 | **Feature Ref:** F28

---
