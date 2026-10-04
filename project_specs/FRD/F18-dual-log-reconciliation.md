## F18: Dual-Log and Source Reconciliation

**Description:** Compares the live exhibit ledger against party lists, deputy logs, admitted lists, jury packages, and disposition records to surface discrepancies for resolution, at scheduled checkpoints (recess, day-end, trial-close) and on demand. This feature operationalizes the PRD's "no reconciliation discipline" root-cause fix for Evidentiary Tracking.

**Terminology:**
- **Reconciliation Checkpoint:** A defined point (recess, day-end, trial-close, on-demand) at which the live ledger is compared against one or more source lists.
- **Discrepancy:** A detected mismatch between two authoritative-for-comparison sources (e.g., deputy log shows "admitted," attorney's submitted list shows "withdrawn") for the same exhibit.

**Sub-features:**
- Scheduled and on-demand comparison across source lists and the live ledger
- Discrepancy highlighting with required resolution rationale
- Recess / day-end / trial-close reconciliation checkpoints
- Resolved exceptions logged to the audit trail

**Process:**
1. At a reconciliation checkpoint (triggered automatically at session close per F17, or manually on demand by a clerk/deputy), the system gathers the current F16 ledger state and all available comparison sources for the proceeding: party-submitted exhibit lists (F15), the deputy's session log (F17), any previously assembled jury package manifest (F22), and disposition records (F24, if post-trial).
2. System performs a field-by-field and status-by-status comparison per exhibit across all available sources.
3. Any mismatch (status disagreement, an exhibit present in one source but absent in another, conflicting metadata) generates a discrepancy record, routed to the Exception Queue (F07) as `reconciliation_mismatch`, with both/all conflicting values preserved for review.
4. Assigned clerk/deputy reviews each discrepancy, selects (or manually enters) the correct resolved value, and supplies a mandatory rationale.
5. Resolution updates the F16 ledger if the resolved value differs from current ledger state (itself a new exhibit version + audit event), and marks the discrepancy `resolved` with full audit trail (F02).
6. A reconciliation checkpoint cannot be marked `complete` while unresolved high-severity discrepancies remain open, absent an explicit, separately logged override by an authorized supervisory role.
7. Reconciliation run history (checkpoint type, time, discrepancy count, resolution time) feeds F09 operational reporting metrics.

**Inputs:**
- `proceeding_id` / `session_id` (required)
- `checkpoint_type` (enum, required): recess | day_end | trial_close | on_demand
- Comparison sources (system-gathered, not user-supplied): ledger state, session logs, submitted lists, jury package manifest, disposition records
- Resolution input: `exhibit_id`, `resolved_value`, `rationale` (string, required)

**Outputs:**
- Reconciliation run record with discrepancy count and status
- Discrepancy exception records (F07) for each mismatch
- Updated F16 ledger entries where resolution changed the authoritative value

**Validation:**
- A reconciliation run cannot be marked `complete` with open high-severity discrepancies unresolved, except via a logged supervisory override requiring its own rationale (double-gated, since this bypasses the core quality-control mechanism).
- Every discrepancy resolution requires a non-empty rationale meeting the same minimum-quality bar as F07's general exception resolution rule.
- Comparison must include every source available for the proceeding at the time of the checkpoint — a reconciliation run that silently skips an available source list (e.g., because it failed to load) must itself raise a `reconciliation_partial` exception rather than reporting a false "no discrepancies" result.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Checkpoint completion attempted with open high-severity discrepancies | 409 | RECONCILE_UNRESOLVED_HIGH_SEVERITY | "Cannot complete: unresolved high-severity discrepancies remain" |
| Resolution submitted without rationale | 422 | RECONCILE_RATIONALE_REQUIRED | "A resolution rationale is required" |
| A comparison source fails to load during the run | 206 (partial, routes to exception) | RECONCILE_SOURCE_UNAVAILABLE | "One or more comparison sources were unavailable; reconciliation is incomplete" |
| Supervisory override attempted by non-supervisory role | 403 | RECONCILE_OVERRIDE_DENIED | "You are not authorized to override an unresolved reconciliation" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Reconciliation for `/evidentiary/reconciliation/runs`, `/evidentiary/reconciliation/runs/{id}/discrepancies`, `/evidentiary/reconciliation/discrepancies/{id}/resolve` endpoints.

**Schema Surface (this feature):** uses tables `reconciliation_runs`, `reconciliation_discrepancies` — see `Y0b-schema-evidentiary.md` §Reconciliation.
