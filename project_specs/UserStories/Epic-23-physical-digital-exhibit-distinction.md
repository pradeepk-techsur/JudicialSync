## Epic 23: Physical and Digital Exhibit Distinction (F23)

### US-23.1: Classify Exhibit Type at Intake
**As a** clerk/case administrator (David Okafor), **I want to** assign an exhibit type (file reference, physical, demonstrative, contraband, special-storage) during intake, **so that** downstream custody, storage, and jury-package eligibility rules apply correctly.

**Acceptance Criteria:**
- [ ] `exhibit_type` must be one of the court-configured catalog values; an unrecognized value returns `TYPE_UNRECOGNIZED` (422)
- [ ] Only `file_reference` exhibits are eligible for electronic jury package inclusion; other types attempting package eligibility return `TYPE_NOT_ELIGIBLE_FOR_PACKAGE` (422)
- [ ] Type-specific required fields (per court configuration) are enforced at intake validation

**Priority:** P2 | **Feature Ref:** F23

---

### US-23.2: Enforce Type-Specific Custody Requirements
**As a** courtroom deputy (Maria Santos), **I want to** have custody transfers blocked until type-specific required fields are present, **so that** sensitive item types (e.g., contraband) always carry the additional documentation the court requires.

**Acceptance Criteria:**
- [ ] A custody transfer attempted without a type-specific required field returns `TYPE_MISSING_REQUIRED_FIELD` (422)
- [ ] Re-classification of an exhibit's type is a distinct, audit-logged action requiring the same entitlement as a ledger status transition, returning `TYPE_RECLASSIFY_DENIED` (403) for unauthorized attempts
- [ ] Re-classification never occurs via a generic field-edit path that bypasses audit logging

**Priority:** P2 | **Feature Ref:** F23

---
