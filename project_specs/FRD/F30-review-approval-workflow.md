## F30: Review and Approval Workflow

**Description:** Separates proposed/candidate information from confirmed/approved information across the Speedy Trial module, recording who approved what and why. This feature is the shared mechanics layer underlying F26's start-context confirmation, F28's candidate exclusion review, and F29's calculation overrides — a single, consistent proposed-vs-confirmed pattern rather than three separately implemented approval flows.

**Terminology:**
- **Proposed State:** Any system-generated or unreviewed suggestion (candidate exclusion, candidate trigger event, candidate calculation adjustment) not yet acted on by an authorized human.
- **Confirmed State:** The result of an explicit accept action by an authorized reviewer, after which the record feeds downstream calculations (F29).
- **Override:** A reviewer's deliberate departure from the system-suggested value, requiring mandatory rationale and producing its own versioned record rather than editing the original suggestion.

**Sub-features:**
- Explicit proposed-vs-confirmed state distinction for events, exclusions, and calculations
- Reviewer attribution and timestamp on every confirmation
- Override capture with mandatory rationale
- Integration with shared work queue (F06)

**Process:**
1. A reviewable item (candidate exclusion from F28, proposed start context from F26, a flagged calculation needing override consideration from F29/F33) is created in `proposed`/`candidate` state and a corresponding task (F06) is generated for the role configured (F03) to review that item type.
2. Reviewer opens the task, examines the item's full context (triggering event, rule reference, proposed values) via the linked detail view.
3. Reviewer takes one of three actions:
   - **Accept:** the proposed value is adopted as-is; system creates a `confirmed` record referencing the original proposal, reviewer identity, and timestamp.
   - **Modify:** reviewer adjusts the proposed value (e.g., changes an exclusion's end date) and the system creates a `confirmed` record reflecting the modified value, with the original proposed value preserved alongside it for comparison, plus mandatory rationale for the modification.
   - **Reject:** the proposed value is not adopted; system creates a `rejected` record with mandatory rationale, and the item does not feed any downstream calculation.
4. Every accept/modify/reject action is logged as a distinct audit event (F02), and the associated task (F06) is marked complete with a reference to that audit event.
5. For overrides specifically (reviewer departs from what the engine suggested, or chambers adjusts an already-confirmed value after the fact), the system never edits the prior confirmed record in place — it creates a new version with an explicit `override` flag, mandatory rationale, and full linkage back to the record it supersedes, preserving complete history (feeding F32's "what changed" comparison).

**Inputs:**
- `reviewable_item_id` (required): reference to a candidate exclusion, proposed trigger context, or calculation needing override
- `action` (enum, required): accept | modify | reject | override
- `modified_value` (conditional, required when action = modify or override)
- `rationale` (string, required when action = modify, reject, or override)
- `reviewing_user_id` (system-resolved from session, never client-supplied)

**Outputs:**
- Confirmed/rejected/overridden record, versioned and linked to its source proposal
- Completed task (F06) with audit event reference
- Updated downstream state (e.g., F29 recalculation triggered if a confirmed exclusion changed)

**Validation:**
- Accept/modify/reject/override actions require the `exclusion_reviewer`-equivalent entitlement configured per F03 workflow roles for the specific item type and court — this entitlement is distinct from general operational access and may be restricted to chambers/judge roles for certain item types (e.g., continuance-related exclusions) per court policy.
- Modify, reject, and override actions all require a non-empty rationale meeting the shared minimum-quality bar (same pattern as F07); accept (adopting the system's own suggestion unchanged) does not require rationale beyond the explicit accept action itself, since no departure from the suggestion occurred.
- A reviewer may not confirm/override a record they themselves created as a manual proposal in certain configurable cases (`[ASSUMPTION]`: court-configurable whether self-review is permitted for manually entered events vs. system-generated candidates — defaults to requiring a second reviewer for self-entered proposals, consistent with separation-of-duties principles, to be validated during pilot).
- Once a record reaches `confirmed` state, no further change may occur except through a new override cycle (new version, full lineage) — never an in-place edit, identical in spirit to F29's calculation-version immutability.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Review action by user lacking entitlement for this item type | 403 | REVIEW_DENIED | "You are not authorized to review this item" |
| Modify/reject/override submitted without rationale | 422 | REVIEW_RATIONALE_REQUIRED | "A rationale is required for this action" |
| Self-review of own manual proposal attempted (where disallowed) | 403 | REVIEW_SELF_REVIEW_DENIED | "A second reviewer is required for self-submitted proposals" |
| Attempt to edit an already-confirmed record in place | 409 (internal guard) | REVIEW_CONFIRMED_IMMUTABLE | "Confirmed records cannot be edited directly; use override" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Review & Approval for `/speedytrial/review-items/{id}/accept`, `/speedytrial/review-items/{id}/modify`, `/speedytrial/review-items/{id}/reject`, `/speedytrial/review-items/{id}/override` endpoints.

**Schema Surface (this feature):** uses tables `confirmed_exclusions`, `review_actions` (polymorphic reference to candidate_exclusions, trigger confirmations, calculation overrides) — see `Y0c-schema-speedytrial.md` §Review & Approval Workflow.
