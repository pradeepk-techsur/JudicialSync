## F25: Exhibit Portfolio Dashboard and Court Templates

**Description:** Aggregate, cross-case visibility into exhibit operations for clerks/administrators, plus reusable court-specific configuration templates to accelerate onboarding of additional courts. This is a Scale-increment feature supporting multi-court growth rather than single-court pilot operation.

**Terminology:**
- **Portfolio Dashboard:** A cross-case aggregate view of exhibit operational health (open exceptions, outstanding custody items, closeout backlog) for a clerk's or administrator's full caseload.
- **Court Template:** A reusable, versioned bundle of exhibit-specific configuration (numbering scheme, type catalog, custody rules) that can be applied to a newly onboarded court as a starting point.

**Sub-features:**
- Portfolio-level dashboard (open exceptions, custody items outstanding, closeout backlog)
- Court-specific exhibit-rule templates for faster new-court onboarding
- Template versioning and governance

**Process:**
1. Clerk/administrator opens the portfolio dashboard, which aggregates across all cases/proceedings within their authorized court/division scope: count and age of open F07 exceptions related to exhibits, count of outstanding (unacknowledged or pending) F20 custody transfers, count and age of proceedings pending F24 closeout.
2. Dashboard supports drill-through to the underlying case/proceeding detail (distinct from F09's de-identified reporting feed — this is operational, case-identified, access-scoped to the viewer's own authorized caseload, not an anonymized administrative export).
3. System administrator creates a court template by exporting a court's current exhibit configuration (numbering scheme, type catalog, custody field rules) as a versioned, named template artifact.
4. When onboarding a new court, administrator selects a template as a starting configuration, which is then applied via F03's configuration engine (producing a new rule-package version scoped to the new court) and may be locally adjusted thereafter.
5. Template versions are themselves governed (who may publish/modify a template) and audit-logged, consistent with F03's configuration change discipline.

**Inputs:**
- `scope` (court_id/division_id, from requester's authorization)
- Template creation: `source_court_id`, `template_name`
- Template application: `target_court_id`, `template_id`, `template_version`

**Outputs:**
- Portfolio dashboard view with aggregate operational counts and drill-through links
- Court template artifact (versioned, named)
- New court's initial configuration (via F03) derived from the applied template

**Validation:**
- Portfolio dashboard access is scoped to the viewer's authorized court/division caseload — it is not a cross-court aggregate (that is F09/F38's purpose); a clerk never sees another court's portfolio.
- Template creation requires `system_admin` entitlement; template application to a new court requires the same configuration maker-checker approval pattern as F03.
- A template, once published and applied to at least one court, is immutable — further changes create a new template version, preserving which exact template version each court was onboarded from for audit purposes.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Dashboard access requested outside authorized scope | 403 | PORTFOLIO_SCOPE_DENIED | "This portfolio view is not available to your role" |
| Template creation by non-admin | 403 | TEMPLATE_CREATE_DENIED | "You are not authorized to create configuration templates" |
| Template application without second approver | 403 | TEMPLATE_SOD_VIOLATION | "A second approver is required to apply this template" |
| Attempt to edit an already-applied template version | 409 | TEMPLATE_VERSION_IMMUTABLE | "This template version has already been applied and cannot be edited" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Portfolio & Templates for `/evidentiary/portfolio/dashboard`, `/evidentiary/templates`, `/evidentiary/templates/{id}/apply` endpoints.

**Schema Surface (this feature):** uses tables `exhibit_config_templates`, `exhibit_config_template_versions` — see `Y0b-schema-evidentiary.md` §Portfolio & Templates.
