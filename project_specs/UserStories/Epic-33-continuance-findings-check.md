## Epic 33: Continuance Findings Check (F33)

### US-33.1: Flag a Continuance Missing Required Findings or Order Reference
**As a** judge (Judge Robert Hale, with Law Clerk Ana Ibarra), **I want to** be alerted when a continuance record lacks a structured findings reference or linked order document, **so that** incompleteness is caught before it becomes a problem, without the system ever judging legal sufficiency itself.

**Acceptance Criteria:**
- [ ] A continuance-categorized event or linked exclusion missing a populated findings reference or order document reference is flagged `incomplete` and routed to the chambers/judge review queue as `continuance_findings_incomplete`
- [ ] The check evaluates only field presence — it never parses, evaluates, or scores the content of findings for legal sufficiency
- [ ] An exclusion linked to an incomplete continuance carries a visible warning in its review UI
- [ ] Confirmation of an exclusion while the continuance is incomplete is blocked by default court policy, returning `CONTINUANCE_INCOMPLETE_BLOCKS_CONFIRM` (409) unless the court configures otherwise

**Priority:** P2 | **Feature Ref:** F33

---

### US-33.2: Supply Missing Findings or Order References
**As a** judge (Judge Robert Hale, with Law Clerk Ana Ibarra), **I want to** supply the missing structured-findings reference or order document reference once I've confirmed the legal record independently, **so that** the completeness flag clears and the exclusion can proceed through normal review.

**Acceptance Criteria:**
- [ ] Resolution requires chambers/judge-equivalent entitlement, returning `CONTINUANCE_RESOLVE_DENIED` (403) for unauthorized attempts
- [ ] Once both references are present, the completeness flag clears automatically
- [ ] The flag-and-resolution cycle is fully audit-logged
- [ ] The system never attempts content-level sufficiency evaluation; any such attempt is treated as a system defect (`CONTINUANCE_SCOPE_VIOLATION`, 500 internal guard)

**Priority:** P2 | **Feature Ref:** F33

---
