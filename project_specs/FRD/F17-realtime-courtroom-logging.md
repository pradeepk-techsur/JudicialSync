## F17: Real-Time Courtroom Logging

**Description:** Lets the courtroom deputy record exhibit offers, objections, rulings, withdrawals, and substitutions in real time during proceedings, with minimal interaction steps. This is the primary "courtroom speed" surface the PRD identifies as make-or-break for adoption — if it is slow, deputies revert to paper and the entire value proposition collapses.

**Terminology:**
- **Session:** An active, time-bounded courtroom logging context tied to a specific proceeding/hearing, opened by the deputy at the start of court and closed at recess/day-end/trial-close (feeding F18 reconciliation checkpoints).
- **Offer:** The deputy's record that a party has offered an exhibit for admission.
- **Objection:** The deputy's record of an objection category raised against an offered exhibit.
- **Ruling:** The judge's determination (admit/reject), always explicitly attributed to the judge — the deputy records that a ruling occurred and its content, but never originates or infers the ruling itself.

**Sub-features:**
- Rapid offer/objection/ruling entry optimized for courtroom speed (large targets, keyboard support)
- Timestamped entries with optional notes
- Deputy records actions; judge's ruling is explicitly attributed to the judge, never auto-decided
- Live shared status visible to chambers during the session

**Process:**
1. Deputy opens a logging session for the current proceeding/hearing (F01); session is bound to the exhibit tracking context (F14).
2. As an exhibit is offered in court, deputy selects it from the pre-loaded proposed-exhibit list (F15/F16) or quick-adds a new exhibit inline if unlisted, and marks it `offered` — a single-action, large-touch-target or single-keystroke operation.
3. If an objection is raised, deputy records the objection category (from a short, courtroom-relevant, configurable list) with one additional action.
4. When the judge rules, deputy records the ruling outcome (admit/reject) as having occurred, which the system persists as an F16 status transition explicitly attributed to the presiding judge of record for that proceeding (resolved from F01 proceeding/judge assignment, not manually typed by the deputy) — the deputy's action is "record that the judge admitted/rejected," not "decide to admit/reject."
5. Withdrawal/substitution actions follow the same rapid, single-to-few-action pattern, each timestamped automatically with optional free-text notes.
6. Every logged action updates the shared F16 ledger status immediately, visible in real time to chambers' workspace (F11) without requiring a manual refresh/sync step.
7. At session close (recess/day-end/trial-close), deputy triggers the F18 reconciliation checkpoint directly from the logging interface.
8. If connectivity/system disruption occurs mid-session, the interface persists entries locally (draft buffer) and resyncs automatically on reconnection without data loss, per the F13 manual-fallback/continuity requirement.

**Inputs:**
- `exhibit_id` (selected from pre-loaded list or quick-add)
- `action` (enum, required): offer | objection | ruling | withdraw | substitute
- `objection_category` (enum, conditional — required when action = objection)
- `ruling_outcome` (enum, conditional — required when action = ruling): admit | reject
- `notes` (string, optional)
- Implicit: `timestamp` (system-generated, not user-editable), `proceeding_id`, `presiding_judge_id` (resolved from proceeding context)

**Outputs:**
- Real-time F16 ledger status update
- Session log entry (timestamped, attributed)
- Live status feed visible to chambers workspace

**Validation:**
- A ruling entry's `presiding_judge_id` is always system-resolved from the proceeding's assigned judge — the deputy cannot manually select or override which judge a ruling is attributed to; if the proceeding has no assigned judge on record, the ruling action is blocked and routed to an exception (F07) rather than allowing an unattributed ruling.
- Every logging action must complete in a bounded number of UI interactions (target: ≤3 actions per offer/ruling cycle) and must be fully operable via keyboard shortcuts, per the courtroom-speed NFR.
- Session close triggers mandatory reconciliation (F18) — a session cannot be marked closed while leaving the ledger in an un-reconciled state without an explicit, logged override by an authorized user.
- Quick-add of an unlisted exhibit mid-session still requires the minimum F16 required fields (description, offering party) before the entry can be saved, routed to F07 if incomplete at session close.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Ruling attempted with no assigned judge on proceeding | 422 | COURTROOM_NO_JUDGE_ASSIGNED | "Cannot record a ruling: no presiding judge is assigned to this proceeding" |
| Action attempted on exhibit in terminal/incompatible status | 409 | COURTROOM_INVALID_ACTION | "This action cannot be recorded for the exhibit's current status" |
| Session close attempted with unresolved reconciliation | 409 | COURTROOM_UNRECONCILED_CLOSE | "Session cannot close with unresolved reconciliation discrepancies" |
| Local draft buffer resync conflict after reconnection | 409 (routes to F07) | COURTROOM_RESYNC_CONFLICT | "An entry made offline conflicts with a concurrent update; routed for review" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Courtroom Logging for `/evidentiary/sessions`, `/evidentiary/sessions/{id}/log-action`, `/evidentiary/sessions/{id}/close` endpoints.

**Schema Surface (this feature):** uses tables `courtroom_sessions`, `session_log_entries` (feeding `exhibit_versions` in F16) — see `Y0b-schema-evidentiary.md` §Courtroom Logging.
