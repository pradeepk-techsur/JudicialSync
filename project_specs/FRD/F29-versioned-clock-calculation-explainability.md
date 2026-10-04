## F29: Versioned Clock Calculation and Explainability

**Description:** Calculates elapsed includable time, excluded periods, and remaining time as of a given calculation date, and exposes a full "explain this date" breakdown of every contributing segment. This is the Speedy Trial module's centerpiece — the PRD's core "explainability" promise and the feature with the strictest versioning/immutability requirements in the entire system, since a prior approved result must never be silently replaced.

**Terminology:**
- **Calculation Version:** A complete, immutable snapshot of a clock calculation — inputs (confirmed trigger, confirmed exclusions as of that moment), rule-package version, computed elapsed/excluded/remaining time, and resulting status — produced at a specific point in time. Every recalculation creates a new version; none overwrites a prior one.
- **Timeline Segment:** A single contiguous period (included or excluded) within a calculation version's breakdown, each linked to its source event(s), rule reference, review status, and reviewer.
- **Calculation Date:** The as-of date the elapsed/remaining time is computed against (typically "today," but may be a specific past or future date for review purposes).
- **Explain-This-Date View:** The UI/API surface rendering every timeline segment of a calculation version with full source/rule/reviewer attribution.

**Sub-features:**
- Elapsed/excluded/remaining time calculation from confirmed events and exclusions
- "Explain this date" view: event, rule reference, period, status, reviewer, reason per segment
- Full calculation versioning — every recalculation retains prior version, inputs, rule package, and approvals
- No silent overwrite of a prior approved result; overrides require documented rationale

**Process:**
1. Calculation is triggered either by a scheduled recompute (e.g., nightly), an event affecting the tracker (new confirmed exclusion, trigger confirmation), or an explicit user-requested recalculation.
2. System gathers all inputs as of the calculation moment: the tracker's confirmed start context (F26), all `confirmed` exclusions (F30 — never `candidate` ones), and the currently effective rule-package version (F03) for the court's Speedy Trial plan.
3. System computes the timeline as a sequence of segments: included (counting toward the statutory limit) and excluded (per confirmed exclusions), each segment carrying its date range, its classification (included/excluded), and — for excluded segments — the linked confirmed exclusion record (which itself links to triggering event and rule reference).
4. System computes `elapsed_includable_time`, `total_excluded_time`, and `remaining_time` as of the calculation date, and a resulting non-binding status indicator (e.g., "within limit," "approaching threshold," "limit reached") — explicitly labeled as decision support, never as a legal determination.
5. The complete result — segments, computed totals, rule-package version reference, calculation date, and triggering reason (scheduled | event-driven | manual) — is persisted as a new, immutable **calculation version** row. The tracker's "current" pointer advances to this new version; the prior version remains fully retrievable, never deleted or edited.
6. The "explain this date" view renders the current (or any selected historical) calculation version's segments, each showing: contributing event, rule reference, period, review status (confirmed/candidate — though only confirmed exclusions ever feed a calculation), reviewing user, and reason/rationale where an override was involved.
7. Any override of a calculation result (e.g., chambers determines the automated figure should be adjusted) is captured as a distinct, mandatory-rationale action that itself produces a new calculation version referencing the override — it never edits the automated version in place (see F30 for the override/confirmation mechanics in detail).
8. All calculation version creation and override events are audit-logged (F02) with full lineage.

**Inputs:**
- `tracker_id` (required)
- `calculation_date` (optional, defaults to current date; may be set to a past/future date for review purposes)
- Implicit: confirmed start context (F26), all confirmed exclusions (F30), effective rule-package version (F03) — all system-gathered, not user-supplied per calculation request

**Outputs:**
- New immutable `calculation_version` record: `{elapsed_time, excluded_time, remaining_time, status_indicator, calculation_date, rule_version_ref, triggering_reason, segments[]}`
- "Explain this date" rendered breakdown (segments with full attribution)
- Updated "current version" pointer on the tracker

**Validation:**
- A calculation version, once created, is immutable — no update or delete operation against a calculation_version row is permitted at the application layer; database grants enforce this identically to the audit_events table (F02).
- Only `confirmed` exclusions (never `candidate`) may contribute an excluded segment to a calculation — a candidate exclusion pending review must never silently reduce the computed elapsed time.
- Every excluded segment must link to a specific confirmed exclusion record, which itself links to a specific triggering event and rule reference — a segment with no traceable source is a system defect, consistent with F28's explainability guarantee.
- The resulting status indicator must carry a persistent, non-dismissable UI label clarifying it is decision support, not a legal determination (per NFR "Human-in-command" and vision document's "persistent decision-support labeling" risk mitigation).
- Recalculation triggered by a configuration change (F03) does not happen automatically and silently — a configuration change never, by itself, mutates an existing calculation version; a new calculation must be explicitly or schedule-triggered, and it produces a new version, never retroactively alters the old one's stored result.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Calculation attempted for tracker with unconfirmed start context | 422 | CALC_START_NOT_CONFIRMED | "Cannot calculate: tracker start context is not yet confirmed" |
| Attempt to edit/delete a calculation version | 403 (internal guard) | CALC_VERSION_IMMUTABLE | "Calculation versions cannot be modified after creation" |
| Segment generated referencing a non-confirmed exclusion | 500 (internal guard, should never occur) | CALC_UNCONFIRMED_EXCLUSION_USED | "System defect: unconfirmed exclusion used in calculation" |
| Calculation requested for a date before tracker start | 422 | CALC_DATE_BEFORE_START | "Calculation date cannot precede the tracker's confirmed start date" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Clock Calculation for `/speedytrial/trackers/{id}/calculate`, `/speedytrial/trackers/{id}/calculation-versions`, `/speedytrial/calculation-versions/{id}/explain` endpoints.

**Schema Surface (this feature):** uses tables `calculation_versions`, `timeline_segments` — see `Y0c-schema-speedytrial.md` §Clock Calculation & Explainability.
