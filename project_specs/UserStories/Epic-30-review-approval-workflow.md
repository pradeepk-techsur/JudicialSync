## Epic 30: Review and Approval Workflow (F30)

### US-30.1: Accept, Modify, or Reject a Candidate Exclusion
**As a** judge (Judge Robert Hale), **I want to** explicitly accept, modify, or reject each candidate exclusion period, **so that** only a reviewed, human-approved value ever feeds the clock calculation.

**Acceptance Criteria:**
- [ ] Accept adopts the proposed value as-is, creating a `confirmed` record referencing the original proposal, reviewer identity, and timestamp
- [ ] Modify requires a mandatory rationale and preserves the original proposed value alongside the modified confirmed record for comparison
- [ ] Reject requires a mandatory rationale and the item never feeds any downstream calculation
- [ ] A review action by a user lacking entitlement for the item type returns `REVIEW_DENIED` (403); modify/reject without rationale returns `REVIEW_RATIONALE_REQUIRED` (422)

**Priority:** P0 | **Feature Ref:** F30

---

### US-30.2: Override a Confirmed Record with Mandatory Rationale
**As a** judge (Judge Robert Hale), **I want to** override an already-confirmed value when chambers determines an adjustment is needed, **so that** the change is fully versioned and explained rather than a silent edit.

**Acceptance Criteria:**
- [ ] An override creates a new version with an explicit `override` flag, mandatory rationale, and full linkage back to the superseded record
- [ ] Attempting to edit an already-confirmed record in place returns `REVIEW_CONFIRMED_IMMUTABLE` (409, internal guard)
- [ ] Self-review of a manually entered proposal by its own creator is blocked by default (court-configurable), returning `REVIEW_SELF_REVIEW_DENIED` (403) where disallowed
- [ ] Every accept/modify/reject/override action is logged as a distinct audit event, and its associated task is marked complete with a reference to that event

**Priority:** P0 | **Feature Ref:** F30

---
