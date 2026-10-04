## F37: Cross-Court Governance and National Configuration

**Description:** Formal governance tooling distinguishing centrally-governed national configuration from court/division-level modification authority, supporting multi-court/national deployment. This is a Scale-increment feature not required for single-court pilot operation but necessary before the system can responsibly scale across many federal districts without each court silently diverging in ungoverned ways.

**Terminology:**
- **National Baseline:** The centrally-governed configuration (base numbering patterns, base event-category catalog, base security-designation policy) that all courts inherit unless explicitly permitted to override.
- **Local Override Scope:** The subset of configuration fields a given court/division is permitted to modify independently, as defined by national governance policy.
- **Governance Workflow:** The approval process by which a court's proposed local configuration change is reviewed against national policy before taking effect.

**Sub-features:**
- National configuration baseline with controlled override scope
- Governance workflow for proposing/approving local configuration changes
- Cross-court configuration consistency reporting

**`[ASSUMPTION]`:** The PRD/vision document explicitly leaves the national-vs-local governance split undecided (PRD §9.3). This FRD assumes a baseline-plus-override model (national defaults, explicitly enumerated court-overridable fields) as the simplest workable governance pattern, to be substantially revisited once AOUSC/national-governance stakeholders are engaged — this feature is lower-confidence than P0/P1 features given its reliance on an unresolved policy question.

**Process:**
1. A national governance administrator defines the national baseline configuration (via F03's configuration engine, scoped at a "national" level above individual court profiles) and designates which fields each court/division may locally override versus which remain centrally fixed.
2. A court administrator proposing a local configuration change that falls within their permitted override scope follows F03's standard maker-checker process, scoped to their court.
3. A court administrator proposing a change outside their permitted override scope (e.g., attempting to alter a nationally-fixed field) submits a governance request, routed to the national governance administrator for review/approval before it can take effect.
4. Cross-court configuration consistency reporting (for F09/F38 consumption) flags courts whose active configuration has diverged from the national baseline in fields not within their designated override scope (which should be structurally impossible if enforced correctly, but the reporting exists as a defense-in-depth consistency check).
5. All national baseline changes and governance approvals are audit-logged (F02) with the approving national administrator's identity.

**Inputs:**
- National baseline definition: `{field, default_value, court_overridable (boolean)}`
- Governance request: `court_id`, `requested_field`, `requested_value`, `rationale`

**Outputs:**
- Published national baseline configuration
- Court-specific effective configuration (baseline + permitted local overrides)
- Governance request approval/denial record
- Cross-court consistency report

**Validation:**
- A court/division may never directly modify a field designated non-overridable at the national level; any such attempt is rejected at the API layer, not merely flagged after the fact.
- Governance requests require a distinct `national_governance_admin` entitlement to approve, separate from any individual court's `config_admin` role.
- Cross-court consistency reports must never expose one court's local configuration detail to another court's administrators — visibility is limited to the national governance administrator and the court's own administrators for their own configuration.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Court attempts to modify a non-overridable national field | 403 | GOVERNANCE_FIELD_LOCKED | "This configuration field is governed nationally and cannot be modified locally" |
| Governance request approval by non-national-admin | 403 | GOVERNANCE_APPROVAL_DENIED | "National governance approval requires national administrator access" |
| Cross-court report requested by court-scoped admin | 403 | GOVERNANCE_REPORT_SCOPE_DENIED | "Cross-court reporting requires national governance access" |

**API Surface (this feature):** see `Y1a-api-shared.md` §National Governance for `/governance/national-baseline`, `/governance/requests`, `/governance/consistency-report` endpoints.

**Schema Surface (this feature):** uses tables `national_baseline_config`, `governance_requests` — see `Y0a-schema-shared.md` §National Governance.
