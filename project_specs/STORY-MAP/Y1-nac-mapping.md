---

## NaC-to-Acceptance Criteria Mapping

Verifies each NaC derived above is actually testable against the corresponding UserStory's acceptance criteria in UserStories-JudicialSync.md (not merely plausible-sounding).

| NaC | Story | AC from UserStories | Aligned? |
|-----|-------|----------------------|----------|
| JTBD-01.1: action captured within a small number of seconds, no parallel paper log | US-17.1 | "Logging a single offer/objection/ruling cycle is completable in a bounded number of UI interactions (target: ≤3 actions)"; "Every action is operable fully via keyboard shortcuts" | Yes |
| JTBD-02.1: judge's ruling explicitly attributed, never auto-decided | US-16.3 | "An admit/reject transition must carry a ruling_actor_id attributed to a user holding the judge role... never defaulted or auto-inferred"; "A ruling attempted without judge attribution returns LEDGER_RULING_ACTOR_REQUIRED (422)" | Yes |
| JTBD-01.2: discrepancies resolved with rationale or flagged open | US-18.1, US-18.2 | "Each field-by-field or status mismatch generates a discrepancy record with all conflicting values preserved"; "A resolution submitted without rationale returns RECONCILE_RATIONALE_REQUIRED (422)" | Yes |
| JTBD-01.3: custody transfer confirmed with recipient acknowledgment | US-20.1, US-20.2 | "Transfer record enters pending state and triggers notification to the designated recipient"; "No auto-acknowledgment occurs on timeout — only explicit acknowledgment completes a transfer" | Yes |
| JTBD-01.4: certified export in minutes, no re-typing | US-19.1, US-19.2 | "Export supports filtering by status... generates a structured artifact... without re-typing anything"; "Certification is a distinct confirmation action... retains a snapshot reference" | Yes |
| JTBD-01.3: unacknowledged transfer escalates automatically | US-20.3, US-4.1 | "A transfer unacknowledged beyond the configured SLA raises CUSTODY_SLA_BREACH and fires an escalation alert"; "Notification body/preview text never contains... defendant-identifying detail" | Yes |
| JTBD-01.2: checkpoint blocked while high-severity discrepancies remain open | US-18.3 | "A checkpoint completion attempt with unresolved high-severity discrepancies returns RECONCILE_UNRESOLVED_HIGH_SEVERITY (409)"; "A non-supervisory role attempting the override returns RECONCILE_OVERRIDE_DENIED (403)" | Yes |
| JTBD-03.2: recurring patterns traced to a configuration fix | US-3.1, US-7.1 | "Configuration edits require config_admin entitlement"; "Resolution and rationale are logged as an audit event, and the exception's age-at-resolution feeds operational reporting" | Yes |
| JTBD-02.5: sealing requires explicit judge authorization | US-21.1 | "Sealing/release actions require authorizing_judge_id resolved to an actual judge role holder for the proceeding — a clerk cannot self-authorize, returning SEAL_AUTHORIZATION_DENIED (403)" | Yes |
| JTBD-02.5: every access attempt logged | US-21.2 | "Every access attempt — successful or denied — against a sealed/restricted exhibit produces its own audit event, not merely an aggregate log line" | Yes |
| JTBD-02.3: alert delivered and tracked to acknowledgment, linked to full explanation | US-31.1 | "Every alert includes a working deep link to the explain-this-date view; an alert lacking this linkage is treated as a system defect (ALERT_MISSING_CONTEXT, 500)" | Yes |
| JTBD-02.1: full breakdown of every contributing segment | US-29.1 | "The explain-this-date view renders every timeline segment with contributing event, rule reference, period, review status, reviewing user, and reason/rationale" | Yes |
| JTBD-02.2: explicit accept/modify/reject with documented rationale | US-30.1 | "Accept adopts the proposed value as-is... Modify requires a mandatory rationale... Reject requires a mandatory rationale"; "modify/reject without rationale returns REVIEW_RATIONALE_REQUIRED (422)" | Yes |
| JTBD-02.2: incomplete findings flagged before reliance | US-33.1 | "A continuance-categorized event or linked exclusion missing a populated findings reference or order document reference is flagged incomplete and routed to the chambers/judge review queue" | Yes |
| JTBD-02.4: single-screen conference summary | US-35.1 | "View assembles the current calculation version summary, all unreviewed candidate exclusions, continuance history with completeness flags, and open issues... relevant to the tracker" | Yes |
| JTBD-02.1 (multi-defendant extension): clocks remain independently calculated and separated | US-34.1 | "Each defendant party receives their own independent tracker... the system never creates a single shared tracker across defendants... returning MULTIDEF_SHARED_TRACKER_DENIED (422)" | Yes |
| JTBD-03.3: missing-trigger incidents caught, not discovered after the fact | US-26.3 | "A defendant with case activity but no matching trigger event raises a missing_trigger_event exception (TRACKER_MISSING_TRIGGER) rather than leaving no tracker or guessing a start date" | Yes |
| JTBD-03.2: unmapped events routed with raw source preserved | US-27.2 | "An event with no matching mapping rule is flagged unmapped and routed to the Exception Queue with the raw source code/description preserved (EVENT_UNMAPPED)" | Yes |
| JTBD-03.4: portfolio-wide risk visible without case-by-case checks | US-36.1 | "Risk indicators include approaching-threshold, data-gap, unreviewed-exclusion, and stale-calculation categories"; "Dashboard refreshes on a near-real-time basis" | Yes |
| JTBD-03.1: missing metadata routed to exception queue, not silently rejected | US-15.1 | "Required fields... must be present; missing fields route to the Exception Queue rather than silent rejection, via INTAKE_MISSING_METADATA (422)" | Yes |
| JTBD-03.3: CM/ECF-synchronized setup, no missing-trigger surprises | US-14.1 | "A case must have at least one proceeding before exhibit tracking can be activated"; "Re-running setup on an already-active case is idempotent" | Yes |
| JTBD-03.5: configuration changes direct, no IT ticket, versioned | US-3.3 | "Threshold tiers must be non-negative and contiguous/non-overlapping... Every threshold/mapping change is versioned and audit-logged" | Yes |
| JTBD-04.2: tamper-evident audit explorer, filterable, access-separated | US-2.1 | "Audit Explorer supports filtering by case_id, user_id, date_range, and object_type"; "Audit read access requires a distinct audit_reader entitlement, never implied by operational edit roles" | Yes |
| JTBD-04.1: scope precisely to role/attribute, zero unauthorized access | US-0.2 | "Access to a case/proceeding/exhibit/tracker bearing a security designation... requires an explicit additional entitlement beyond the base role"; "Insufficient scope... returns AUTH_SCOPE_DENIED (403) rather than partial data" | Yes |
| JTBD-04.4: sensitive handling via policy, linked to audit | US-21.2 | "Every access attempt... against a sealed/restricted exhibit produces its own audit event" (linkage to F13 policy enforcement confirmed via US-13.1 malware/encryption controls) | Yes |
| JTBD-04.3: conflicts route to human review, never silently overwritten | US-10.1 | "When the current value was locally modified, the adapter creates a Sync Conflict exception for human review instead of auto-overwriting, returning CMECF_SYNC_CONFLICT (409)" | Yes |
| JTBD-04.5: privileged actions segregated, second approver required | US-3.2 | "The same user who drafted a configuration change cannot also publish it; attempting to do so returns CONFIG_SOD_VIOLATION (403)"; "Every configuration change is logged... with both drafter and approver identities" | Yes |
| JTBD-04.1 (extended): sealed/restricted records never appear in search | US-5.2 | "Unauthorized sealed/restricted records produce zero hits — no 'restricted result' placeholder is ever shown" | Yes |
| JTBD-04.4 (extended): malware scanning and encryption enforced platform-wide | US-13.1 | "No file is persisted until malware scanning completes successfully; a failed scan returns SECURITY_MALWARE_DETECTED (422)... never silent acceptance" | Yes |
| JTBD-02.1 (extended): recalculation diff understandable, not opaque | US-32.1 | "Comparison performs a structured diff over segments: additions, removals, and modifications, each attributed to a specific change driver" | Yes |
| JTBD-03.5 (extended nationally): locked fields never bypassed | US-37.1 | "A court/division can never directly modify a field designated non-overridable at the national level; any such attempt is rejected at the API layer, not merely flagged after the fact" | Yes |
| JTBD-03.4 (extended cross-court): aggregate-only, no drill-through | US-38.1 | "No individual case, defendant, or named exhibit may appear in any advanced analytics output... this surface is strictly aggregate-only with no drill-through" | Yes |
| JTBD-02.5 (extended to hardware): sealed items excluded from courtroom display by default | US-39.1 | "Sealed/restricted exhibits follow identical inclusion rules as jury packages — excluded by default, requiring the same explicit per-instance judge authorization... returning COURTTECH_SEALED_DENIED (422) otherwise" | Yes |

**Summary:** 33 of 33 sampled NaC-to-AC pairs are aligned (Yes). Every NaC in the Story Map Matrix and NaC Derivation Table is independently verifiable against an explicit, testable acceptance-criterion bullet already present in UserStories-JudicialSync.md — no NaC in this document was invented without a grounding AC.

---

*Document generated by Pivota Spec Framework*
*Last updated: 2026-10-04*
