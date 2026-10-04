## F32: Calculation Version History ("What Changed")

**Description:** Compares the current calculation version against a prior version and highlights added events, changed periods, and overrides, making recalculations understandable rather than opaque. This feature builds directly on F29's versioning foundation to answer the specific question "why did this number change since last time?"

**Terminology:**
- **Version Diff:** A structured comparison between two calculation versions highlighting additions, removals, and modifications to timeline segments.
- **Change Driver:** The specific underlying cause of a difference between versions — a newly confirmed exclusion, a newly ingested event, an override, or a rule-package version change.

**Sub-features:**
- Version-to-version comparison view
- Highlighted diffs: added/removed events, changed exclusion periods, new overrides
- Full override rationale displayed inline with the relevant version

**Process:**
1. User selects two calculation versions for a tracker to compare — typically "current" vs. "prior," but any two historical versions may be selected.
2. System performs a structured diff over each version's `segments[]`: segments present in the newer version but not the older (additions), segments present in the older but not the newer (removals — rare, generally only via override/correction), and segments present in both but with changed boundaries or review status (modifications).
3. For each diff entry, system attributes a change driver by inspecting the underlying confirmed exclusion/event/override record's creation timestamp relative to the two calculation versions' timestamps.
4. Any override-driven change displays its mandatory rationale (captured in F30) inline, directly alongside the diff entry it explains — a user viewing "what changed" never has to separately navigate to find why.
5. The comparison view is rendered as a human-readable summary (e.g., "Remaining time decreased by 12 days due to: 1 new confirmed exclusion [motion filed 2024-03-01, confirmed by J. Smith], 1 override [chambers extended exclusion end date, rationale: ...]").

**Inputs:**
- `tracker_id` (required)
- `version_a_id`, `version_b_id` (required; typically current and immediately-prior, but any two valid versions for the tracker)

**Outputs:**
- Structured diff result: `{additions[], removals[], modifications[]}`, each with change driver attribution and rationale where applicable
- Human-readable summary rendering

**Validation:**
- Comparison must only be performed between calculation versions belonging to the same tracker; cross-tracker comparison is rejected as meaningless.
- Every diff entry must resolve to a specific change driver (confirmed exclusion, event, override, or rule-package version change) — an unattributable diff entry is a system defect, violating the explainability requirement that underlies this entire module.
- Access to the comparison view requires the same entitlement as viewing the underlying calculation versions (F29) — no separate, looser access path for version comparison.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Comparison requested across different trackers | 422 | DIFF_CROSS_TRACKER | "Calculation versions must belong to the same tracker to compare" |
| Diff entry with no resolvable change driver | 500 (internal guard) | DIFF_UNATTRIBUTED_CHANGE | "System defect: unattributed change detected in comparison" |
| Requested version not found for tracker | 404 | DIFF_VERSION_NOT_FOUND | "Calculation version not found for this tracker" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Version Comparison for `/speedytrial/trackers/{id}/calculation-versions/compare` endpoint.

**Schema Surface (this feature):** read-only computation over `calculation_versions`, `timeline_segments`, `review_actions` — no dedicated writable table; see `Y0c-schema-speedytrial.md` §Calculation Version History.
