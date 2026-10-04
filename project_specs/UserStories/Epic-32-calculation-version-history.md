## Epic 32: Calculation Version History ("What Changed") (F32)

### US-32.1: Compare Two Calculation Versions to See What Changed
**As a** judge (Judge Robert Hale), **I want to** compare the current calculation version against a prior one and see exactly what changed — added events, changed periods, new overrides — with rationale displayed inline, **so that** a recalculation is understandable rather than opaque.

**Acceptance Criteria:**
- [ ] Comparison performs a structured diff over segments: additions, removals, and modifications, each attributed to a specific change driver (new confirmed exclusion, new event, override, or rule-package version change)
- [ ] Any override-driven change displays its mandatory rationale inline alongside the diff entry it explains
- [ ] Comparison across different trackers is rejected, returning `DIFF_CROSS_TRACKER` (422)
- [ ] A diff entry with no resolvable change driver is treated as a system defect (`DIFF_UNATTRIBUTED_CHANGE`, 500 internal guard)
- [ ] A requested version not found for the tracker returns `DIFF_VERSION_NOT_FOUND` (404)

**Priority:** P1 | **Feature Ref:** F32

---
