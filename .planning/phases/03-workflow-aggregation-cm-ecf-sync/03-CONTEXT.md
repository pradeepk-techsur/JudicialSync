# Phase 3: Workflow Aggregation & CM/ECF Sync - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 delivers the aggregation layer that makes the platform usable as a daily working surface,
plus the one inbound path from the authoritative docket: the **Work Queue** (F6), the **Exception
Queue** (F7), the **Case Timeline** (F8), the **Operational Reporting Feed** (F9), and the **CM/ECF
Integration Adapter** (F10).

**In scope:** F6, F7, F8, F9, F10 — plus one deliberately inherited item, below.

**Deliberately inherited (not scope creep — a named handoff):**
- **The retention disposition sweep (F13).** Phase 1 built `retention_schedules`, seeded defaults,
  and the no-auto-purge guard, then wrote: *"The scheduled sweep that generates due-for-disposition
  tasks waits for the Work Queue in Phase 3. Building it now would only accumulate a backlog nobody
  can action for two phases."* The Work Queue now exists, so the stated precondition is satisfied.
  Phase 3 builds the sweep.

**Not in scope — these belong to later phases and must not be built here:**
- Role-specific USWDS workspaces and the External Attorney Portal (F11, F12 — Phase 4). Phase 3 adds
  *screens* to the existing generic shell; Phase 4 builds the *workspaces*.
- All Evidentiary Tracking and Speedy Trial features (F14+ — Phases 5–8). Phase 3 builds the
  registries and seams those phases plug into; it does not anticipate their content.
- Outbound docket filing as a working capability (see decisions — Phase 3 ships the refusal).
- National/cross-court governance (F37 — out of MVP per PROJECT.md).

**Scope anchor:** Phase 3 makes "what needs my attention" answerable in one place, makes a case's
history readable in one view, makes operational health visible without exposing case substance, and
makes the docket flow in without ever being silently overwritten. Anything beyond those four
sentences is another phase.

</domain>

<decisions>
## Implementation Decisions

### Queue architecture: Work Queue and Exception Queue

- **Two tables, as `Y0a` specifies — `tasks` and `exceptions` — joined 1:1.** Every exception raises
  exactly one linked task of type `exception_resolution`.
- **The Work Queue is the single entry point.** It is the one place a user looks; an
  exception-backed task renders as a pointer that deep-links into the Exception Queue's expanded
  triage row (Screen-13). This is what satisfies the phase goal's *"one place to see what needs
  their attention"* without discarding the specialist triage surface the spec designed.
- **Resolving an exception completes its linked task automatically**, via the resolution's audit
  event. The user never completes it by hand.
- Rejected: collapsing to one table (contradicts `Y0a`, discards Phase 2's already-built
  `exceptions` with its `dedupe_key`/`occurrence_count`, and makes Screen-13's per-type resolution
  actions polymorphic JSON). Rejected: two unlinked queues (contradicts the phase goal and F07
  step 2).

### Task completion integrity

- **There is no user-facing task-completion endpoint.** `POST /tasks/{id}/complete` sits behind
  Phase 1's existing `service-token.guard.ts`, exactly like the audit write API.
- **The source feature completes the task inside the SAME transaction that writes its audit event**,
  passing the event it just created. Producers: exception resolve, config publish, grant approval,
  retention disposition, and later phases' review/approval actions.
- Rationale: `Y1a` documents `{completing_audit_event_id}` in the request body, which is a
  client-supplied value standing in for a guarantee — the same shape Phase 2 rejected on config
  publish (`approving_user_id`). Phase 1's stance was **"prefer 'the API refuses' over 'the audit
  catches it'."** A "quiet completion" becomes structurally impossible rather than merely detected,
  and F06's `TASK_MISSING_AUDIT_REF` becomes the unreachable 500 tripwire it reads like.
- **DEVIATION from `Y1a`** — record it, correct the OpenAPI contract.
- **Consequence worth planning for:** an open task whose underlying object is already resolved is now
  a detectable inconsistency. A reconciliation sweeper should surface it rather than let it sit.

### Rationale quality bar

- **Court-configurable through the operational rule package, read via `ConfigResolver`, with a hard
  floor the configuration cannot go below: ≥10 characters AND ≥2 words.** A court may tighten; a
  rule package attempting to weaken below the floor is rejected at publish time by the same
  structural validation that catches threshold gaps.
- **ONE shared validator in `@judicialsync/config-schema`** serves both exception resolution
  (`EXCEPTION_RATIONALE_REQUIRED`, `EXCEPTION_RATIONALE_TOO_SHORT`) and task dismissal
  (`TASK_RATIONALE_REQUIRED`), so the two cannot drift.
- Rejected: hardcoding (contradicts Phase 2's locked *"never from hardcoded constants"*). Rejected:
  unbounded configurability (a court setting 1 character silently neuters the control ROADMAP
  criterion 2 depends on).
- **Carry F07's `[ASSUMPTION]` marker verbatim** — the threshold is explicitly a pre-pilot policy
  decision, already listed in STATE.md's Blockers/Concerns.

### Critical-severity auto-close prohibition

- **Enforced by a database trigger, with the application guard as the front door.** The trigger
  rejects any transition of a critical-severity exception to `resolved` unless the row carries an
  individual human reviewer id and a rationale. No code path can close one — not a future phase's
  batch job, not a migration, not a direct SQL fix.
- Rationale: follows Phase 1's append-only precedent, where criterion 3 demanded the property *"at
  the database grant level, not merely via application convention."* ROADMAP criterion 2 says a
  critical exception *"can never be auto-closed by a batch process"* — and "any batch process"
  includes code from Phases 5–8 that this phase cannot see. An application guard binds only code
  that goes through the service.
- `EXCEPTION_CRITICAL_MANUAL_ONLY` (403) remains the application-level response.
- **Proven the way Phase 1 proved its audit grants:** the assurance suite attempts the close as
  `app_rw` and asserts a *database* error.

### Deferred-producer backfill

- **Extend `ExceptionsService.raise()` to create the linked task in the same transaction.** ONE edit.
  Every existing Phase 1/2 producer — `integrity_alert`, notification delivery failures, missing
  recipient configuration, content-policy violations, search projection failures — and every future
  Phase 5–8 producer gets a task automatically, with no producer code change. This is precisely what
  Phase 2's narrow single write path was for.
- **The three task-only producers get a direct `TaskService.create()` at their own call site**, each
  owned by exactly one Phase 3 plan:
  - Pending entitlement grants (Phase 1, `01-08`)
  - Pending config publishes (Phase 2, `02-08`)
  - Retention due-for-disposition (the sweep Phase 3 now builds)
- **A one-time idempotent backfill** creates tasks for exception rows already in the database. It
  must be safe to re-run.
- Rejected: scheduled projectors per producer (projection lag on urgent items, a second
  representation that can drift, and the task no longer created in the same transaction as the
  condition — so a crash between them loses it). Rejected: editing every producer (forgoes the
  chokepoint `raise()` already provides, and every future exception producer would have to remember).

### Retention disposition sweep (inherited from Phase 1)

- **Phase 3 builds it.** A scheduled job detects due items against the existing `retention_schedules`
  and creates tasks; the existing no-auto-purge guard
  (`403 SECURITY_DISPOSITION_UNCONFIRMED`) still gates the destructive action.
- Rationale: Phase 1 deferred it to Phase 3 **by name**, for a stated reason that is now satisfied.
  Leaving it out means a court has retention schedules, a disposition guard, and a legal retention
  obligation, with nothing that ever tells anyone an item is due — a compliance control that
  silently does nothing.

### Task ownership resolution

- **Eligibility resolves by required ENTITLEMENT, not by role.** Each `task_type` declares the
  entitlement needed to action it (`config_approval` → `config_admin`; `exception_resolution` → the
  exception type's required entitlement; and so on). `owner_role` remains a grouping and display
  hint.
- Rationale: F06 says *"resolve to at least one user with that role"*, but Phase 1 locked **"role
  existence must never imply access"** and made entitlements first-class and separately grantable.
  Resolving by role routes tasks to people the global guard will then deny — the task sits open, age
  metrics degrade, and the user cannot discharge it.
- **DEVIATION from F06's wording** — record it.
- **Loop guard (mandatory):** `TASK_NO_ELIGIBLE_OWNER` raises an exception, and exceptions now create
  tasks — which could itself have no eligible owner. The no-eligible-owner exception is therefore
  raised **without a linked task** and surfaced on a guaranteed-staffed `system_admin` surface. This
  must be explicitly tested.

### CM/ECF: what the adapter talks to

- **A fixture-driven mock CM/ECF service container in the Compose stack, spoken to over real HTTP.**
  The adapter uses its real `CmecfSyncProvider` HTTP implementation with real polling, pagination,
  transport auth, and idempotency keys. Nothing in the adapter is faked — only the system on the
  other end is local.
- **The container must be drivable** to emit: a field-level conflict, a duplicate `source_identifier`
  redelivery, malformed records, and a total outage. This is how ROADMAP criterion 5 and the
  health/backlog metrics get *proven* rather than asserted.
- Pointing at a court's real endpoint is a provider + mapper swap, not a rewrite.
- **The contract we define is itself an `[ASSUMPTION]`** — no real CM/ECF schema is available
  (F10 and `TechArch` §9.1 both flag this). Document the fixture contract as an assumption requiring
  validation against a real court interface.
- Rejected: file-drop ingestion (leaves the polling loop, pagination, transport auth, retry and
  backoff — the parts most likely to be wrong against a real endpoint — unbuilt). Rejected: an
  in-process test double (the stub Phases 1 and 2 refused five times; it becomes the only exercised
  path).

### CM/ECF: transport

- **Polling is primary and is the only path authoritative data enters.** Interval is court-configured
  and read through `ConfigResolver`.
- **`POST /integrations/cmecf/sync` exists but is a WAKE-UP signal.** It enqueues a poll; its body is
  never trusted as records.
- Rationale: exactly ONE ingestion code path to secure, test and reason about, so idempotency,
  conflict detection, `locally_modified_fields` checking and source-lineage stamping cannot diverge
  between two implementations. An inbound endpoint accepting authoritative docket records would be
  the highest-value injection target in a system whose first principle is that the docket is
  authoritative and never silently overwritten. Works against deployments exposing no webhook, while
  still getting near-real-time latency where one exists.
- Matches `TechArch` §9.1 (*"polling adapter... with webhook support where the court's CM/ECF
  deployment exposes one"*) and reinterprets `Y1a`'s *"inbound webhook/poll target"* — **record as a
  deviation** in how the endpoint's body is treated.

### CM/ECF: outbound

- **Build the refusal, not the capability.** `POST /integrations/cmecf/outbound` exists and always
  returns `403 CMECF_OUTBOUND_DENIED`, because **no `docket_outbound` entitlement is grantable in
  v1**. Screen-18 shows *"Outbound filings: disabled (no entitlement granted)"* truthfully.
- Rationale: "build the dangerous guard first, the convenience later" (Phase 1's retention pattern).
  Writing to a federal court's authoritative docket is the most dangerous capability in the system,
  and its only named consumers are F24 (v2, excluded) and partly F19 (Phase 6) — there is no v1
  consumer and no court-validated contract. Consistent with Phase 1, where roles exist carrying no
  entitlements until a phase gives them something to do.
- **The assurance suite proves the refusal.** "Nothing can write to the docket in v1" becomes a
  provable property rather than an absence.

### CM/ECF: idempotency and delivery record

- **A bounded `cmecf_delivery_log` table.** Every inbound delivery writes one row:
  `source_identifier`, `object_type`, payload hash, `received_at`, and `disposition`
  (`created` | `updated` | `no_op_duplicate` | `conflict_raised`).
- A redelivery whose hash matches the last recorded hash for that `source_identifier` is a no-op
  returning `CMECF_DUPLICATE_IGNORED` (200).
- Rationale: gives Screen-18's "Duplicate Delivery Log" panel real data, gives `adapter_health_log`'s
  backlog and error counts a source, makes replay debuggable, and makes *"no duplicate conflict
  exception was created"* **provable**. "Duplicate ignored" as a log line is the log-only shape
  Phase 1 and Phase 2 rejected three times.
- **DEVIATION — new table not in `Y0a`.** Record it. Bounded by a retention schedule, which now has a
  sweep to action it.

### CM/ECF: conflict granularity and the provenance model

- **Add field-level modification tracking: `locally_modified_fields`** (a text array, or a per-field
  provenance side table), populated by the Phase 1 case-context write path whenever a local edit
  touches a field.
- **Phase 1's `locally_modified` boolean stays in the API as a DERIVED value** (array is non-empty),
  so nothing downstream breaks.
- Conflict detection then does what F10 steps 4–5 and `sync_conflicts` actually describe: *this field
  changed* AND *this field was locally edited*.
- Rationale: a row-level flag breaks both ways. A clerk correcting a party's phone number flags the
  whole row, so a later CM/ECF correction to the party *name* raises a false conflict; ignoring the
  flag per-field silently overwrites the phone correction. False conflicts compound into alert
  fatigue, which trains staff to click through and defeats the control. Phase 1's own argument for
  shipping provenance early — *"deferring the columns would force a later migration and backfill
  across live court records"* — now points the same way for the richer version, and the system is
  still pre-pilot.
- **Requires a narrow edit to Phase 1's case-context write path** — an established pattern (Phase 2
  extended `canonical-payload.ts` and `resource-loader.service.ts` the same way). **DEVIATION
  extending Phase 1's provenance model** — record it.

### CM/ECF: conflict resolution semantics

- **Resolution records which CM/ECF value was seen and decided against.**
  - *Accept CM/ECF* → write the authoritative value, clear that field from
    `locally_modified_fields`; the field returns to normal automatic sync.
  - *Keep local* → retain the local value, keep the field flagged, **and record the rejected CM/ECF
    value**.
- **A conflict re-raises only when CM/ECF presents a genuinely NEW value.** The next poll seeing the
  already-rejected value is a no-op.
- Rationale: without this, keep-local loops forever — every poll sees a differing field on a
  locally-modified field and re-raises. Merging via `dedupe_key` would only make the counter climb;
  that is not resolution, and it turns `resolved` into a status that doesn't mean resolved. Clearing
  the flag on keep-local would let the next CM/ECF change silently overwrite the clerk's deliberate
  choice — the exact outcome criterion 5 exists to prevent.
- `sync_conflicts.resolved_source` records `'CM/ECF'` or `'manual_override'` per F10 step 6; both
  values are logged to the audit trail.

### Case Timeline: composition

- **A timeline PROVIDER registry, queried at request time.** Each module registers a provider the
  timeline service calls per request, returning
  `{source_module, entry_type, timestamp, summary, deep_link, designation_tags}` for a case.
- Phase 3 registers **docket-event** and **hearing** providers. Phase 5 registers exhibits and
  Phase 7 registers clock segments as **pure additions**, with no edit to Phase 3 code.
- Takes Phase 2's inversion-of-control registry pattern — later modules declare themselves rather
  than Phase 3 naming them — while matching F08 step 2's *"query each source"* process literally.
- **No denormalized timeline store.** A timeline is a low-frequency single-case read; the cost of a
  second index to maintain, backfill and reconcile is not justified, and a briefly-stale timeline
  misrepresents a case history to a judge — a worse failure than a slightly slow page.
- **DEVIATION:** `Y0a` §Case Timeline describes a view definition; this is a provider registry
  instead. Record it.

### Case Timeline: two absence semantics (do not conflate)

This is the subtlest decision in the phase. The timeline has two kinds of missing data pointing in
**opposite** directions:

- **Designation-excluded entries are SILENT.** Per F08 validation and F05, unauthorized entries are
  *"fully excluded, not redacted"* — no placeholder, no count, no hint. Security.
- **Provider-unavailable entries are LOUD.** `206 TIMELINE_PARTIAL_DATA` with an explicit
  **per-provider status block** naming exactly which sources answered and which did not, rendered as
  a prominent USWDS Alert naming the missing ones (e.g. *"Speedy Trial entries unavailable — this
  timeline is incomplete"*). Safety.
- An authorized user must never mistake a partial timeline for a complete one; an unauthorized user
  must never learn that something was withheld.
- **The assurance suite asserts both** — partial is loud, excluded is invisible.
- This is the same fork Phase 2 resolved with `unsupported_filters[]` (loud, about capability)
  alongside a byte-identical empty state (silent, about data). Rejected: `503` on any provider
  failure (one flaky module kills the whole view during a live proceeding). Rejected: `200` with a
  footnote (a 200 tells every client the response is complete).

### Reporting: de-identification enforcement

- **Database-level.** Reporting queries run as a **dedicated database role** holding `SELECT` only on
  purpose-built **aggregate-only views** returning counts, rates and ages — and **no grant whatsoever
  on base tables** holding names, captions or party detail.
- A leaking join does not get caught in review; it fails with a Postgres permission error.
- The runtime assertion stays as an unreachable tripwire.
- Rationale: Phase 2's structural content policy plus Phase 1's grant-level enforcement, combined.
  Rejected: query discipline plus review (the *"developer discipline alone"* standard F04 explicitly
  refused for the analogous case). Rejected: post-query redaction (requires loading the identifying
  data in order to remove it — the inverted control Phase 2 rejected).
- **Proven like Phase 1's audit grants:** the assurance suite attempts a base-table `SELECT` as the
  reporting role and asserts a database error.

### Reporting: no drill-through

- **The reporting payload carries NO object identifiers at all** — no case id, defendant id, exhibit
  id, or docket number. Only counts, rates, ages and trends.
- Drill-through is not blocked by a guard; **there is nothing to drill through.** This satisfies
  ROADMAP criterion 4's stronger *"contains no path back to an individual judicial determination"*
  directly, and falls out of the aggregate-only views above.
- F09's parenthetical is still honoured: a user with genuine case access reaches that case through
  their normal authorized surfaces — the reporting feed simply is not the route.
- Rejected: identifiers plus guard-denied links (pairs ids with metrics; a `reporting_viewer` without
  case access receives ids they have no entitlement to, and id-plus-metric correlation is itself
  re-identifying even if every link 403s). Rejected: a second identified tier (reintroduces the
  base-table access just removed).

### Reporting: small-cell suppression (an addition beyond the spec)

- **Any aggregate cell below a minimum count is suppressed or rolled up**, and **ages render as
  buckets** (0–2d, 3–7d, 8–30d, 30d+) rather than exact values in the de-identified tier.
- Threshold is court-configurable through `ConfigResolver` **with a hard floor** — tighten yes,
  weaken no — exactly like the rationale bar.
- Rationale: F09 forbids names and permits *"only counts, rates, and ages"*, but a count of 1 is
  identifying ("Division 3, one open reconciliation mismatch, aged 18h"), and exact ages are
  quasi-identifiers. `reporting_viewer` is separately grantable and does **not** imply case access,
  so a within-court viewer may hold no case entitlements at all — which is exactly the person
  small-cell inference leaks to. Without this, "de-identified" is a label rather than a property.
- Enforced **inside the aggregate views**, in the same place as the grants.
- **DEVIATION — an addition F09 never specified.** Record it, and carry a **new `[ASSUMPTION]`
  marker on the default *k* value**, since no stakeholder has validated it.

### Reporting: the human-in-command label

- The label *"Administrative metrics — not for use in case determinations"* renders persistently in
  the dashboard UI **AND is embedded in every export artifact** — a preamble/header row in CSV, a
  metadata field in structured output — plus a filename convention marking it administrative.
- Rationale: an exported CSV forwarded into a chambers email has left the UI and lost the label, and
  the export is the artifact most likely to travel. The scenario the label exists to prevent is far
  likelier downstream of an export than in front of the dashboard. PROJECT.md calls human-in-command
  non-negotiable.
- **The assurance suite asserts the label is present in generated export BYTES**, not just in the DOM.
- **DEVIATION — F09 step 5 says "UI label".** Record the extension.

### Phase 3 visible surface

- **Five surfaces, added to Phase 1's existing generic USWDS shell, entitlement-gated:**
  1. **Work Queue** — role-scoped, sorted oldest-first, age-flagged, dismissal with rationale
  2. **Exception Queue** (Screen-13) — cross-module, filterable by module/type/severity/age, per-type
     resolution actions with the rationale gate
  3. **Case Timeline** — merged chronological view with filters and deep links
  4. **Reporting Dashboard** — de-identified aggregates with the persistent label
  5. **CM/ECF Adapter Health** (Screen-18) — a thin health-and-duplicate-log panel
- **Sync-conflict resolution is built ONCE**, as an exception `resolution_action` rendered in the
  Exception Queue. Screen-18's conflict list is a filtered view that **deep-links into that same
  resolution UI**. F10 step 5 routes conflicts into F07, so this is the spec's own structure — not a
  shortcut. Four real screens plus one small panel, with no duplicated resolution logic.
- Precedent: Phase 1 shipped the Audit Explorer and Phase 2 the Configuration Engine, both *Admin
  Dashboard* screens, into the generic shell. Phase 4 reorganises proven screens into workspaces
  rather than building them from nothing.
- **The axe-core CI gate extends to all five and continues to BLOCK the build.**
- Severity and age use **icon + text label + colour, never colour alone** (Screen-13's explicit
  requirement and WCAG 1.4.1).

### Aging and escalation

- **One periodic BullMQ sweeper over durable Postgres state** scans open tasks *and* exceptions past
  their court-configured age threshold, sets the aging flag, and raises an escalation through
  **Phase 2's Notifications Service** to the configured supervisory recipient.
- Thresholds and supervisory recipients read through `ConfigResolver`.
- Rationale: the same shape Phase 2 proved for notification escalation and chose explicitly because
  *"an alert is never silently dropped"* — idempotent, self-healing across restarts, testable by
  backdating rows or injecting a clock. Makes Phase 3 a proper **consumer** of Phase 2's service
  rather than inventing a parallel alerting path.
- Applies to both queues, not just exceptions — F06 step 6 says "optionally", but a signal that
  reaches no one is close to a signal that does not exist (Phase 1 rejected that shape twice).

### Named Phase 3 assurance suite

**An explicit, named deliverable — not left to developer discretion**, mirroring Phase 1's `01-14`
and Phase 2's `02-16`. Phase 3's guarantees are almost entirely *"never"* claims, which are exactly
what quietly stop being true. The suite must at minimum prove:

1. **Critical exception cannot be batch-closed** — attempted as `app_rw` via raw SQL, asserting a
   **database** error, not an application error.
2. **No exception resolves without a rationale meeting the floor**, AND a rule package attempting to
   set the floor below the hard minimum is rejected at publish.
3. **A legally-significant task cannot be dismissed without a rationale.**
4. **There is no user-facing task-completion path** — a user citing a valid audit event cannot close
   a task.
5. **A deliberately conflicting CM/ECF field lands in the conflict queue and the local value is
   unchanged** — ROADMAP criterion 5's own wording.
6. **Duplicate redelivery creates no duplicate record and no duplicate conflict exception.**
7. **A kept-local resolution does not re-raise on the next poll**, but a genuinely new CM/ECF value
   does.
8. **Timeline shows both absence semantics** — designation-excluded entries invisible, provider
   unavailable loudly flagged with a per-source status block.
9. **Reporting:** the reporting role gets a Postgres permission error on any base table; the payload
   carries no identifier; small cells are suppressed; the label is present in exported **bytes**.
10. **Outbound returns 403** with no grantable `docket_outbound` entitlement.

Additionally worth covering: the no-eligible-owner path does not recurse, and the backfill is
idempotent across re-runs.

### Claude's Discretion

Raised during discussion but not pressed; left to planning judgment, constrained by the canonical
refs below:

- Whether the "legally significant" task-type list (which types require a dismissal rationale) is
  hardcoded or config-driven via the rule package.
- Completed-task retention window, and whether a resolved exception can be reopened.
- Priority assignment per producer, and default sort within equal priority.
- F08's confirmed-vs-candidate toggle for Speedy Trial segments (the mechanism exists in Phase 3; its
  content arrives in Phase 7).
- Chronological ordering when docket events carry only a date (F08 validation requires same-day
  entries be secondarily ordered by creation sequence).
- Deep-link construction conventions across modules.
- Whether `reporting_viewer` is mutually exclusive with operational entitlements or merely separately
  granted (F09 says "separate from", not "exclusive of"; Phase 1's model says separately granted and
  never role-bundled).
- Which metric sets ship in v1, given `reconciliation_runs` does not exist until Phase 6.
- Reporting refresh cadence and whether metrics are precomputed.
- Export format, size limits, and pagination.
- Sync backlog catch-up behaviour after an outage, and what counts as "sustained failure" for the
  critical alert.
- Poll interval bounds, and how `source_identifier` collisions across courts are handled.
- How CM/ECF record deletion or supersession is handled (no-delete is a Phase 1 invariant).
- The fixture contract's exact shape and how a court's real schema maps in via the provider.
- Which entitlement governs sync-conflict resolution.
- Module decomposition within the NestJS structure.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 3 feature requirements
- `project_specs/FRD/F06-work-queue-task-management.md` — Task lifecycle, role-scoped queues,
  completion-requires-audit-reference rule, dismissal rationale, aging, `TASK_NO_ELIGIBLE_OWNER`.
- `project_specs/FRD/F07-exception-queue.md` — Exception lifecycle, rationale gate, critical
  auto-close prohibition, aging escalation, type-appropriate resolution actions. Contains the
  `[ASSUMPTION]` on the rationale minimum length that must be preserved.
- `project_specs/FRD/F08-case-timeline-view.md` — Chronological merge, filters, deep links,
  designation exclusion (not redaction), confirmed-vs-candidate toggle, `206 TIMELINE_PARTIAL_DATA`.
- `project_specs/FRD/F09-operational-reporting-feed.md` — De-identification rules, no drill-through,
  `reporting_viewer` entitlement, the mandatory human-in-command label.
- `project_specs/FRD/F10-cmecf-integration-adapter.md` — Inbound sync, source-identifier
  preservation, the no-silent-overwrite rule, field-level conflict routing, idempotency, outbound
  gating, health monitoring. Contains the `[ASSUMPTION]` on CM/ECF interface availability and schema.

### Binding error and access semantics
- `project_specs/FRD/Y2-errors.md` — Canonical HTTP status taxonomy and error codes. Principle 3
  (403-vs-404 existence hiding) is binding. Phase 3 introduces several new codes — register them as
  Phase 2 did (`docs/SPEC-DEVIATIONS.md`).
- `project_specs/TechArch/04-security.md` §7.6 — Existence-hiding; governs the timeline's
  designation-exclusion semantics (silent) as distinct from provider-unavailable (loud).
- `project_specs/TechArch/04-security.md` §7.3/§7.4 — Append-only grants and the hash chain; the
  precedent for Phase 3's database-level critical-auto-close trigger and reporting-role grants.

### Schema and API contracts (with Phase 3 deviations noted)
- `project_specs/FRD/Y0a-schema-shared.md` §Work Queue — `tasks`.
- `project_specs/FRD/Y0a-schema-shared.md` §Exception Queue — `exceptions`. **Created in Phase 2
  (`02-01`) with a narrow write path; Phase 3 builds the queue, triage, aging, rationale gate and
  auto-close prohibition on top.**
- `project_specs/FRD/Y0a-schema-shared.md` §CM/ECF Integration — `sync_conflicts`,
  `adapter_health_log`. **DEVIATION: Phase 3 adds a bounded `cmecf_delivery_log` table.**
- `project_specs/FRD/Y0a-schema-shared.md` §Case Timeline — **DEVIATION: implemented as a provider
  registry queried at request time, not a view definition.**
- `project_specs/FRD/Y0a-schema-shared.md` §Reporting — **DEVIATION: aggregate-only views owned by a
  dedicated restricted database role, with small-cell suppression.**
- `project_specs/FRD/Y1a-api-shared.md` §Work Queue — **DEVIATION: `/tasks/{id}/complete` is
  service-internal, behind the service-token guard; there is no user-facing completion path.**
- `project_specs/FRD/Y1a-api-shared.md` §Exception Queue, §Case Timeline, §Reporting.
- `project_specs/FRD/Y1a-api-shared.md` §CM/ECF Adapter — **DEVIATION: `/integrations/cmecf/sync` is
  a zero-data wake-up signal; its body is never trusted as records.**
- `project_specs/TechArch/02a-data-shared.md` — Authoritative DDL and conventions: three schemas,
  UUIDv4 via `pgcrypto`, UTC `timestamptz`, **no hard deletes on audit-feeding or docket-sourced
  tables**, and the `locally_modified` provenance flag Phase 3 extends to field granularity.
- `project_specs/TechArch/03a-api-shared.md` — Shared service API contracts.

### Integration architecture
- `project_specs/TechArch/06-integrations.md` §9.1 — CM/ECF: polling with optional webhook, the
  abstract `CmecfSyncProvider` with pluggable transport, idempotency by `source_identifier`,
  conflict routing to F07, `adapter_health_log`, critical alert on sustained failure. **Binding.**
- `project_specs/TechArch/06-integrations.md` §9.4 — Notification channels; Phase 3's aging
  escalation routes through this service.
- `project_specs/FRD/Y3-integrations.md` — Integration assumptions and manual-fallback requirements.
- `project_specs/TechArch/01-components.md` — Work Queue, Exception Queue, Reporting Feed, CM/ECF
  Adapter component boundaries and declared dependencies.
- `project_specs/TechArch/05-tech-stack.md` — **Binding stack.** BullMQ/Redis for the aging sweeper
  and sync polling; `zod`; TanStack Query 5; `@trussworks/react-uswds`; axe-core/Pa11y CI gate.
- `project_specs/TechArch/00-overview.md` §159 — Court-level multi-tenancy by `court_id`.

### Acceptance criteria and traceability
- `project_specs/UserStories/Epic-06-work-queue-task-management.md`
- `project_specs/UserStories/Epic-07-exception-queue.md`
- `project_specs/UserStories/Epic-08-case-timeline-view.md`
- `project_specs/UserStories/Epic-09-operational-reporting-feed.md`
- `project_specs/UserStories/Epic-10-cmecf-integration-adapter.md`
- `project_specs/RTM-JudicialSync.md` — Requirements traceability matrix.

### UI
- `project_specs/UX-Mockup/Screen-13-exception-queue.md` — **Primary Phase 3 UI reference.** Filters,
  sortable table, severity as colour + glyph (never colour alone), the expanded per-type resolution
  row, rationale field with character count, and the "also create a standing mapping rule" path that
  routes through the Configuration Engine's maker-checker.
- `project_specs/UX-Mockup/Screen-18-cmecf-adapter-health.md` — Health summary box, open sync
  conflicts with accept/keep radios, duplicate delivery log panel, outbound-disabled indicator.
- `project_specs/UX-Mockup/Y0-patterns.md` — Shared USWDS interaction patterns.
- `project_specs/UX-Mockup/Y2-accessibility.md` — Section 508 / WCAG 2.1 AA expectations for the
  blocking axe gate.
- `project_specs/UX-Mockup/Flow-06-admin-config-cmecf-conflict.md` — The admin conflict-resolution
  flow end to end.
- `project_specs/UX-Mockup/Flow-04-pretrial-intake-exception-triage.md` — Exception triage flow
  (its intake half is Phase 5; read for the triage half).
- **Read for boundary awareness, do NOT build in Phase 3:**
  `project_specs/UX-Mockup/Screen-10-clerk-console-home.md`,
  `Screen-15-admin-dashboard-home.md`, `Screen-04-chambers-oversight-home.md`,
  `Screen-14-portfolio-dashboards.md` — Phase 4 (and `Screen-14` is partly v2).
- U.S. Web Design System — https://designsystem.digital.gov/ (binding per PROJECT.md).

### Prior phase context (binding — do not re-litigate)
- `.planning/phases/01-core-identity-case-model-audit-security-baseline/01-CONTEXT.md` — **Read in
  full.** OPA/Rego as sole policy implementation; global guard; fail-closed; entitlements first-class
  and separately grantable with "role existence must never imply access"; two-person
  request→approve SoD; no-stub discipline; `integrity_alert` write-now-consume-later; the
  transactional outbox; the generic USWDS shell; the two-court seed fixtures; the blocking axe gate;
  the `service-token.guard.ts` pattern; append-only enforcement at the database grant level; the
  retention guard and its deferred sweep.
- `.planning/phases/02-platform-configuration-communication-services/02-CONTEXT.md` — **Read in
  full.** `ConfigResolver` as the only config read path; the two rule-package types and their
  approver entitlements; own-session approval; `ExceptionsService.raise()` as the single narrow
  exceptions write path with `dedupe_key`/`occurrence_count`; the escalation sweeper shape; the
  structural content policy; the shared `zod` package; the search object-type registry (the pattern
  Phase 3's timeline provider registry follows); the deviation and assumption registers
  (`docs/SPEC-DEVIATIONS.md`, `docs/ASSUMPTIONS.md`) that Phase 3 extends.

### Project-level governance
- `.planning/PROJECT.md` — USWDS binding; **human-in-command on every legally significant
  determination** (the reporting label's reason for existing); **CM/ECF authoritative with no silent
  overwrite**; vision-stage source material means assumptions are flagged, not locked.
- `.planning/REQUIREMENTS.md` — v1 scope and the F6–F10 traceability rows.
- `.planning/ROADMAP.md` — Phase 3 goal and its five success criteria.

</canonical_refs>

<code_context>
## Existing Code Insights

**The repository still contains no source code.** Phases 1 and 2 are both fully planned (15 and 16
plans respectively) but neither has executed — root holds only `README.md`, `opencode.json`,
`project_specs/` and `.planning/`.

Everything below is therefore the **contract** Phases 1 and 2 committed to, not scouted code. The
researcher **must re-scout actual Phase 1 and Phase 2 output before planning** and treat any
divergence as authoritative over this document.

### Reusable assets (from Phase 1 and Phase 2 plan contracts)

- **`ExceptionsService.raise()`** (`02-01`) — the single narrow write path into `platform.exceptions`,
  with `dedupe_key` merging and `occurrence_count`. **Phase 3's highest-leverage extension point.**
- **Global NestJS ABAC guard + OPA PDP** (`01-07`) — extend for new endpoints; add no per-route
  authorization logic.
- **`service-token.guard.ts`** (`01-05`) — the existing pattern for service-only endpoints; Phase 3's
  task-completion route sits behind it.
- **Audit Service with hash-chained writes and `with-audit.ts`** (`01-05`) — Phase 3 completes tasks
  inside the same transaction as the audit write.
- **Transactional outbox** (`01-05`) — available, though the timeline deliberately does not use it.
- **BullMQ + Redis workers** (`01-12`, `02-11`) — the aging sweeper and CM/ECF polling follow the
  established periodic-job-over-durable-state shape.
- **`ConfigResolver`** (`02-06`) — the only config read path; Phase 3 reads rationale floor, age
  thresholds, poll interval, escalation recipients, and the small-cell *k* through it.
- **Rule-package types and `@judicialsync/config-schema`** (`02-02`, `02-08`) — Phase 3 adds its
  thresholds to the operational package and its validators to the shared zod package.
- **Notifications Service + channel registry** (`02-10`, `02-11`) — Phase 3's aging escalation is a
  consumer; it must not build a parallel alerting path.
- **Case & docket context API with provenance** (`01-09`) — Phase 3 extends its write path with
  field-level modification tracking.
- **Search object-type registry** (`02-05`) — the pattern the timeline provider registry follows.
- **Generic USWDS shell, generated OpenAPI client, TanStack Query, blocking axe gate**
  (`01-13`, `02-13`–`02-15`) — all five Phase 3 screens extend these.
- **Deviation and assumption registers** (`02-12`, `docs/SPEC-DEVIATIONS.md`, `docs/ASSUMPTIONS.md`)
  — Phase 3 appends its deviations and the new small-cell `[ASSUMPTION]` here.
- **Idempotent seed with two courts, sealed/restricted cases, one user per role** (`01-04`) — Phase 3
  extends it with CM/ECF fixtures, a locally-modified field for conflict demonstration, aged
  tasks/exceptions for the sweeper, and enough volume for small-cell suppression to be observable.
- **Docker Compose stack** — Phase 3 adds exactly one container: the mock CM/ECF service.

### Established patterns (binding)

- Policy in Rego, never duplicated in application code; fail closed.
- "Prefer 'the API refuses' over 'the audit catches it'."
- **Enforce "never" at the database level**, not by application convention (Phase 1 audit grants →
  Phase 3 critical-auto-close trigger and reporting-role grants).
- "Make it structurally impossible, then put a tripwire behind it."
- No stubs, no bypasses, no no-op adapters — real protocol, local backend.
- Write the durable record now even when its consumer is phases away; never log-only.
- Build the dangerous guard first, the convenience later.
- `[ASSUMPTION]` markers carried into code and docs, never silently resolved.
- Deviating from spec is fine; deviating **silently** is not — correct the contract and register it.
- Ambiguity is a correctness bug in a judicial system.
- Three PostgreSQL schemas; UUIDv4; UTC `timestamptz`; no hard deletes.
- Named negative-path assurance suites are deliverables, not developer discretion.

### Integration points created by Phase 3

- **`TaskService`** — Phases 5–8 create review/approval tasks through it; `raise()` already covers
  anything exception-backed.
- **Timeline provider registry** — Phase 5 registers exhibit status changes, Phase 7 registers clock
  segments, as additions requiring no Phase 3 edit.
- **Exception resolution-action registry** — new exception types (F15 intake, F18 reconciliation,
  F27 unmapped events) register their type-appropriate resolution actions.
- **`CmecfSyncProvider`** — a court's real transport and schema mapper lands behind it unchanged;
  F26/F27 consume synced docket events.
- **Reporting aggregate views** — Phase 6 adds `reconciliation_runs` metrics, Phase 8 adds alert
  effectiveness, each as a new view under the same restricted role.
- **`locally_modified_fields`** — all later write paths must maintain it, or conflict detection
  silently degrades.
- **Aging sweeper** — later task and exception types inherit aging and escalation automatically.

</code_context>

<specifics>
## Specific Ideas

- The user opted into **all seven** gray areas and chose the recommended, more rigorous option on
  **every one of the twenty questions** — the same pattern as Phases 1 and 2. Planning should favour
  structural correctness and provability over minimising Phase 3's size, while recognising this is
  already the largest phase (five requirements, five screens).
- **"Never" means the database says no.** Chosen three separate times this phase — the critical
  auto-close trigger, the reporting role's missing grants, and service-only task completion. The
  consistent reasoning: an application guard binds only code that goes through the service, and
  Phases 5–8 will add producers and batch jobs this phase cannot see.
- **Two absence semantics, deliberately opposite.** The sharpest decision in the phase: in the same
  timeline view, a designation-excluded entry is invisible (security) while an unavailable provider
  is loudly announced (safety). The instinct is the same one that produced Phase 2's
  `unsupported_filters[]` and its byte-identical empty state — ambiguity is the bug, and which way
  you resolve it depends on who is being protected from what.
- **Alert fatigue defeats the control.** The decisive argument against row-level conflict detection:
  a queue full of conflicts that are almost always "accept CM/ECF" trains staff to click through, so
  a technically-correct conservative design produces a worse real outcome than a precise one.
- **A resolution that re-litigates itself is not a resolution.** Chosen on keep-local conflict
  handling — `resolved` must mean resolved, or every other item in the queue loses credibility.
- **Make de-identification true, not nominal.** Small-cell suppression was an addition beyond F09,
  accepted because `reporting_viewer` does not imply case access and a count of 1 is a case.
- **The warning must travel with the artifact.** Chosen on the reporting label: a control that works
  on screen and not in the exported CSV protects the wrong location.
- **Build the refusal, not the capability.** Chosen on CM/ECF outbound — the most dangerous
  capability in the system, with no v1 consumer and no court-validated contract, ships as a provable
  403.
- **Honour named handoffs.** The retention sweep was taken on deliberately: it was deferred once *to
  this phase by name*, for a reason that no longer applies, and a second deferral with no named
  destination is how a control quietly never gets built.
- **Five deviations accepted, each explicitly and with a recorded reason.** Consistent with Phase 2:
  deviating is fine, deviating silently is not — the OpenAPI contract and schema docs must be
  corrected, not quietly diverged from.

</specifics>

<deferred>
## Deferred Ideas

Raised or implied during discussion, deliberately out of scope for Phase 3:

- **Outbound docket filing as a working capability** — Phase 3 ships the refusal and makes no
  `docket_outbound` entitlement grantable. Revisit when F19 (Phase 6) or F24 (v2) needs it, and only
  against a contract a court has validated.
- **A second, identified reporting tier** for viewers holding both `reporting_viewer` and case
  access — rejected for v1 because it reintroduces the base-table access the aggregate-only design
  removes. Revisit if administrators demonstrate a real need.
- **Denormalized timeline store** — rejected in favour of request-time providers. Revisit only if
  measurement shows the fan-out is a real problem, which is unlikely for a single-case read.
- **Role-specific workspaces (F11)** — Phase 4. Phase 3's five screens live in the generic shell and
  Phase 4 reorganises them.
- **External Attorney Portal (F12)** — Phase 4.
- **Reconciliation metrics in the reporting feed** — `reconciliation_runs` does not exist until
  Phase 6; the aggregate view is added then, under the same restricted role.
- **Alert-effectiveness metrics** — Phase 8.
- **Exhibit and Speedy Trial timeline providers** — Phases 5 and 7 register their own.
- **CM/ECF webhook as a data-carrying path** — rejected on injection-surface and
  two-ingestion-paths-diverge grounds. Revisit only with a court-specified authenticated contract.
- **Real CM/ECF endpoint integration** — deferred until a court interface is available; the fixture
  contract and `CmecfSyncProvider` exist so this is a provider + mapper swap.
- **Mutual exclusivity between `reporting_viewer` and operational entitlements** — F09 says
  "separate from", not "exclusive of". Left to planning; a hard SoD constraint would need
  stakeholder validation and would hurt small courts where staff legitimately dual-hat.
- **Rationale minimum-length threshold (`FRD/F07` `[ASSUMPTION]`)** — implemented with a floor,
  remains an assumption requiring pre-pilot stakeholder validation (already tracked in STATE.md).
- **CM/ECF interface schema, transport and latency (`FRD/F10` `[ASSUMPTION]`)** — the fixture
  contract is a documented assumption requiring validation against a real court deployment.
- **Small-cell suppression threshold (new `[ASSUMPTION]`)** — the default *k* has no stakeholder
  validation; flagged for pilot.

</deferred>

---

*Phase: 03-workflow-aggregation-cm-ecf-sync*
*Context gathered: 2026-10-06*
