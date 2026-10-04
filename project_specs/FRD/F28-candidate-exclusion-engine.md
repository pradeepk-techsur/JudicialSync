## F28: Candidate Exclusion Engine

**Description:** Suggests candidate excludable time periods associated with motions, competency proceedings, continuances, interlocutory matters, and other configurable categories, strictly for human review rather than automatic application. This is the clearest expression of the system's "human-in-command" principle within the Speedy Trial module — the engine only ever produces *candidates*; a confirmed exclusion requires an explicit human decision (F30).

**Terminology:**
- **Candidate Exclusion:** A rule-suggested excludable time period, linked to its triggering event(s) and the rule reference that generated it, existing in `candidate` state until reviewed.
- **Confirmed Exclusion:** The result of a reviewer's accept/modify action on a candidate exclusion — only confirmed exclusions feed the clock calculation (F29).
- **Exclusion Category:** A configurable classification of excludable-time reason (motion pending, competency evaluation, continuance, interlocutory appeal, other per court plan) per F03.

**Sub-features:**
- Rule-driven candidate exclusion-period generation from mapped events (F27)
- Configurable exclusion categories per court/plan (F03)
- Explicit accept / modify / reject review workflow per candidate period (shared with F30)
- Every candidate period linked to its triggering event and rule reference

**Process:**
1. When a categorized docket event (F27) matches a configured exclusion-triggering category (e.g., "motion filed"), the engine generates a candidate exclusion period, calculating a proposed start date (from the triggering event) and, where determinable by rule, a proposed end date (e.g., from a corresponding "motion disposed" event) or leaving the end date open pending a future disposing event.
2. Candidate exclusion is created in `candidate` state, with explicit linkage to: the triggering event(s), the exclusion category, and the exact rule-package version (F03) whose configuration produced this suggestion.
3. Candidate appears in the reviewer's work queue (F06) for accept/modify/reject action (F30 governs the review mechanics in detail; this feature governs *generation*).
4. If a later docket event closes an open-ended candidate (e.g., a disposing order arrives), the engine updates the candidate's proposed end date — but only while still in `candidate` state; once a reviewer has confirmed/modified the period, a later event does not silently re-open or alter the confirmed record (a new candidate/override cycle would be required, per F29/F30's no-silent-overwrite rule).
5. Every candidate generation, update-while-candidate, and eventual review decision is audit-logged (F02), including the rule-package version reference for explainability (F29).

**Inputs:**
- Categorized docket event(s) (from F27) matching an exclusion-triggering category
- `exclusion_category` (resolved from F03 configuration)
- Rule-package version in effect at generation time (system-resolved, not user-supplied)

**Outputs:**
- Candidate exclusion record: `{category, proposed_start, proposed_end (nullable), triggering_event_refs[], rule_version_ref, state: candidate}`
- Updated candidate (still in `candidate` state) when a later event affects an open-ended proposal

**Validation:**
- A candidate exclusion must always carry a non-null `triggering_event_refs` and `rule_version_ref` — an exclusion period with no traceable source event or rule reference is a system defect, not a valid output (explainability is not optional).
- The engine itself has no authority to transition a candidate to `confirmed` — this transition exists only in F30 and always requires a human actor.
- Once a candidate has been reviewed (accepted, modified, or rejected per F30), the generation engine must not further mutate that specific exclusion record; any new information triggers a new candidate or an explicit override cycle, never a silent update to an already-reviewed record.
- Exclusion category definitions (which docket event categories trigger which exclusion category, and how start/end dates are derived) must be expressible entirely through F03 configuration — no court-specific exclusion logic may be hardcoded.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Candidate generated with no resolvable triggering event | 500 (internal guard, should never occur) | EXCLUSION_NO_SOURCE_EVENT | "Candidate exclusion generated without a source event (system defect)" |
| Attempt to auto-update an already-reviewed exclusion | 409 (internal guard) | EXCLUSION_ALREADY_REVIEWED | "This exclusion has already been reviewed and cannot be auto-updated" |
| Exclusion category not found in active rule package | 422 | EXCLUSION_CATEGORY_UNDEFINED | "No exclusion category is configured for this event type" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Candidate Exclusions for `/speedytrial/trackers/{id}/candidate-exclusions` (read/list; generation is system-triggered, not a direct user-invoked write).

**Schema Surface (this feature):** uses table `candidate_exclusions` — see `Y0c-schema-speedytrial.md` §Candidate Exclusion Engine.
