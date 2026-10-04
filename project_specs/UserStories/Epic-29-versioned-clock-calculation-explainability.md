## Epic 29: Versioned Clock Calculation and Explainability (F29)

### US-29.1: Open "Explain This Date" to See the Full Calculation Breakdown
**As a** judge (Judge Robert Hale), **I want to** see every contributing segment — event, rule reference, period, status, reviewer, reason — behind a calculated Speedy Trial date, **so that** I can produce a complete, defensible explanation if the number is ever challenged on appeal.

**Acceptance Criteria:**
- [ ] The explain-this-date view renders every timeline segment with contributing event, rule reference, period, review status, reviewing user, and reason/rationale where an override was involved
- [ ] Only `confirmed` exclusions (never `candidate`) contribute an excluded segment to the calculation
- [ ] A segment with no traceable source is treated as a system defect (`CALC_UNCONFIRMED_EXCLUSION_USED`, 500 internal guard)
- [ ] The resulting status indicator carries a persistent, non-dismissable label clarifying it is decision support, never a legal determination

**Priority:** P0 | **Feature Ref:** F29

---

### US-29.2: Preserve Full Calculation Version History
**As a** judge (Judge Robert Hale), **I want to** have every recalculation retained as a new, immutable calculation version rather than overwriting the prior one, **so that** I can always retrieve exactly what a prior calculation showed and why.

**Acceptance Criteria:**
- [ ] A calculation version, once created, is immutable — no update or delete is permitted at the application layer, consistent with the audit trail's immutability
- [ ] The tracker's "current" pointer advances to the new version while the prior version remains fully retrievable, never deleted or edited
- [ ] A configuration change never, by itself, silently recalculates or mutates an existing calculation version

**Priority:** P0 | **Feature Ref:** F29

---

### US-29.3: Recalculate Without Overwriting a Prior Approved Result
**As a** judge (Judge Robert Hale), **I want to** have any override of a calculated result captured as a new, mandatory-rationale version rather than an in-place edit, **so that** zero prior approved calculations are ever silently overwritten.

**Acceptance Criteria:**
- [ ] Calculation attempted for a tracker whose start context is not yet confirmed returns `CALC_START_NOT_CONFIRMED` (422)
- [ ] A calculation date before the tracker's confirmed start date returns `CALC_DATE_BEFORE_START` (422)
- [ ] Every override produces a new calculation version referencing the override and its rationale, never editing the automated version in place
- [ ] Calculation version creation and override events are fully audit-logged with lineage

**Priority:** P0 | **Feature Ref:** F29

---
