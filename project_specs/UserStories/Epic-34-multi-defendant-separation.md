## Epic 34: Multi-Defendant Separation (F34)

### US-34.1: Maintain Independent Clocks per Defendant in a Joint Case
**As a** judge (Judge Robert Hale), **I want to** have each defendant in a multi-defendant matter maintain their own independent Speedy Trial tracker, **so that** no defendant's result gets collapsed or misrepresented alongside a co-defendant's.

**Acceptance Criteria:**
- [ ] Each defendant party receives their own independent tracker; the system never creates a single shared tracker across defendants, even in the same case, returning `MULTIDEF_SHARED_TRACKER_DENIED` (422, internal guard) if attempted
- [ ] A joint docket event (e.g., a joint motion) generates linked candidate exclusions on each affected defendant's tracker, sharing a `joint_event_group_id` but remaining distinct, independently reviewable records
- [ ] A reviewer may accept, modify, or reject a joint-origin candidate differently per defendant — the system never forces identical review outcomes across co-defendants
- [ ] No case-level summary view may present a single collapsed "the case's" status without per-defendant breakdown, treating violations as a system defect (`MULTIDEF_COLLAPSED_VIEW_VIOLATION`, 500 internal guard)

**Priority:** P2 | **Feature Ref:** F34

---

### US-34.2: Record a Severance Event Between Co-Defendants
**As a** judge (Judge Robert Hale), **I want to** explicitly confirm a severance event splitting a joint defendant relationship, **so that** future joint-event propagation stops for the severed defendant(s) only after a deliberate, audited decision.

**Acceptance Criteria:**
- [ ] Severance must be an explicit, confirmed, audit-logged event — never inferred; an unconfirmed severance record is rejected with `MULTIDEF_SEVERANCE_UNCONFIRMED` (403, internal guard)
- [ ] Absent an explicit severance record, defendants in the case continue being treated as jointly affected by shared events by default
- [ ] Once confirmed, subsequent single-defendant docket events no longer propagate as joint candidates to the severed co-defendant(s)
- [ ] Co-defendant relationships are visibly surfaced (e.g., "3 defendants; 2 jointly tracked, 1 severed as of [date]") in case conference and portfolio views

**Priority:** P2 | **Feature Ref:** F34

---
