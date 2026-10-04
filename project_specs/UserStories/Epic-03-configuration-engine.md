## Epic 3: Configuration Engine (F3)

### US-3.1: Configure Court Profile, Numbering, and Workflow States
**As a** clerk/case administrator (David Okafor), **I want to** configure my court's numbering scheme, workflow states, and approval roles through structured screens, **so that** I can make configuration changes directly without filing an IT ticket.

**Acceptance Criteria:**
- [ ] Configuration edits require `config_admin` entitlement, distinct from both `system_admin` and routine operational roles
- [ ] Draft configuration is validated for structural errors (no orphaned workflow states, no negative thresholds) before publish, returning `CONFIG_INVALID_STRUCTURE` (422) on failure
- [ ] Workflow state sets must have at least one terminal state and no unreachable states
- [ ] Non-admins attempting a config edit receive `CONFIG_EDIT_DENIED` (403)

**Priority:** P0 | **Feature Ref:** F3

---

### US-3.2: Require a Second Approver to Publish Rule Package Changes
**As a** system administrator (Priya Nandan), **I want to** require a distinct second approver before a new rule-package version takes effect, **so that** a single person cannot silently alter configuration that affects an entire court's Speedy Trial calculations.

**Acceptance Criteria:**
- [ ] The same user who drafted a configuration change cannot also publish it; attempting to do so returns `CONFIG_SOD_VIOLATION` (403)
- [ ] Publishing creates a new immutable `rule_package_version` with an effective-from timestamp; the prior version remains retrievable for explainability
- [ ] Every configuration change is logged to the audit trail with a before/after diff and both drafter and approver identities
- [ ] In-flight calculations referencing a prior rule-package version are never retroactively recalculated merely because configuration changed

**Priority:** P0 | **Feature Ref:** F3

---

### US-3.3: Configure Thresholds and Docket-Event Mappings Without Code Changes
**As a** clerk/case administrator (David Okafor), **I want to** configure remaining-time threshold tiers and docket-event-category mappings for my court, **so that** Speedy Trial alerts and event classification reflect local practice without a developer or new deployment.

**Acceptance Criteria:**
- [ ] Threshold tiers must be non-negative and contiguous/non-overlapping; a gap or overlap returns `CONFIG_THRESHOLD_GAP` (422)
- [ ] An event mapping cannot map one source event code to two different internal categories within the same rule-package version, returning `CONFIG_AMBIGUOUS_MAPPING` (422)
- [ ] Dependent services (F27 event mapping, F28 exclusion rules, F31 alert thresholds, F16 numbering) read the currently-effective rule package at the moment they act
- [ ] Every threshold/mapping change is versioned and audit-logged

**Priority:** P0 | **Feature Ref:** F3

---
