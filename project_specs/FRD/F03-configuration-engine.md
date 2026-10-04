## F03: Configuration Engine

**Description:** Allows each court to configure local rules, numbering conventions, thresholds, workflow states, and docket-event-category mappings without requiring separate code branches or deployments. This feature is what makes "national core, local configuration" achievable — every other feature reads its court-specific behavior from here rather than hardcoding it.

**Terminology:**
- **Court Profile:** The named configuration bundle for one court (numbering scheme, local rules reference, security policy, thresholds, workflow states, event mappings).
- **Workflow State Set:** The court-configurable set of named statuses and allowed transitions for a given object type (e.g., exhibit status lifecycle, exclusion review states).
- **Event Mapping:** A court-configurable rule translating a raw CM/ECF docket-event code/description into a normalized internal event category consumed by F27/F28.
- **Rule Package:** A versioned, point-in-time snapshot of a court's active configuration (thresholds + mappings + workflow states) referenced by audit entries and calculation versions for explainability.

**Sub-features:**
- Court profile management (local numbering schemes, local rules references, security policy defaults)
- Configurable workflow states and approval roles per court (which role may transition an object from state A to state B)
- Configurable thresholds and notification rules (consumed by F31, F04)
- Configurable docket-event-category mappings (consumed by F27)
- Versioned configuration changes with full audit trail (every config change is itself a material action per F02)

**Process:**
1. An authorized `court_admin` or `system_admin` opens the Configuration Engine UI, scoped to their assigned court(s).
2. Admin edits a configuration section (numbering scheme, thresholds, workflow states, event mappings) in a draft state.
3. On save, system validates the draft against structural rules (no orphaned workflow states, no threshold with negative value, no event mapping pointing to a non-existent category).
4. System creates a new immutable **rule package version** incorporating the change, with effective-from timestamp; the prior version remains retrievable (never overwritten) for calculation/audit explainability.
5. Change is logged to the audit trail (F02) with before/after diff and the admin's identity.
6. Dependent services (F27 event mapping, F28 exclusion rules, F31 alert thresholds, F16 exhibit numbering) read the currently-effective rule package version at the moment they act, and any new calculation references that version ID.
7. In-flight calculations/trackers that referenced a prior rule-package version are **not** retroactively recalculated automatically — recalculation is an explicit, separately triggered action (see F29) so no silent recalculation occurs purely because configuration changed.

**Inputs:**
- `court_id` (UUID, required, scopes the edit)
- `numbering_scheme` (object: prefix pattern, sequence reset rules)
- `workflow_states[]` (array of {object_type, state_name, allowed_transitions[], required_role})
- `thresholds[]` (array of {threshold_type, value, unit})
- `event_mappings[]` (array of {source_event_code, source_event_description_pattern, internal_category})
- `effective_from` (timestamp, optional — defaults to immediate)

**Outputs:**
- New `rule_package_version` record (immutable once published)
- Updated "currently effective" pointer per court
- Audit event capturing the full diff

**Validation:**
- Workflow state sets must have at least one terminal state and no unreachable states.
- Thresholds must be non-negative and, where tiered (e.g., remaining-time tiers), must be internally ordered without gaps that would leave a value range unclassified.
- Event mappings must not map a single source event code to two different internal categories within the same rule package version (deterministic mapping required).
- Configuration edits require `config_admin` entitlement (distinct from both `system_admin` privileged-admin role and routine operational roles — separation of duties per NFR).
- Publishing a new rule package version requires a second approving user (`[ASSUMPTION]`: maker-checker pattern for configuration changes, since config errors can silently affect Speedy Trial calculations across an entire court's caseload) distinct from the drafting admin.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Draft config fails structural validation | 422 | CONFIG_INVALID_STRUCTURE | "Configuration draft has structural errors: {detail}" |
| Ambiguous event mapping (one code, two categories) | 422 | CONFIG_AMBIGUOUS_MAPPING | "Event code {code} is mapped to multiple categories" |
| Non-admin attempts config edit | 403 | CONFIG_EDIT_DENIED | "You do not have configuration administration access" |
| Same user attempts draft + approval (maker-checker) | 403 | CONFIG_SOD_VIOLATION | "A second approver is required to publish this configuration" |
| Threshold tier gap/overlap detected | 422 | CONFIG_THRESHOLD_GAP | "Threshold tiers must be contiguous and non-overlapping" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Configuration for `/config/court-profiles`, `/config/rule-packages`, `/config/rule-packages/{id}/publish` endpoints.

**Schema Surface (this feature):** uses tables `court_profiles`, `rule_package_versions`, `workflow_state_defs`, `threshold_defs`, `event_mapping_defs` — see `Y0a-schema-shared.md` §Configuration.
