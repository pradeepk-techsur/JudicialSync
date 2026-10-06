# Phase 2: Platform Configuration & Communication Services - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers the three shared platform services that sit between Phase 1's trusted substrate
and everything that follows: the **Configuration Engine** (F3 — court profiles, versioned rule
packages, maker-checker publish), the **Notifications Service** (F4 — multi-channel delivery,
content-policy-constrained bodies, delivery-status tracking, escalation), and the **Search
Service** (F5 — cross-module, access-scoped, pre-filtered retrieval).

**In scope:** F3, F4, F5.

**Not in scope — these belong to other phases and must not be built here:**
- Work Queue, Exception Queue *workflow*, Case Timeline, Reporting Feed, CM/ECF Adapter
  (F6–F10 — Phase 3). Phase 2 creates the `exceptions` **table and a narrow write path only**;
  the queue UI, triage, aging, severity-based auto-close prohibition, and rationale-gated
  resolution are all Phase 3.
- Role-specific USWDS workspaces, External Attorney Portal (F11, F12 — Phase 4). Phase 2 adds
  *screens* to the existing generic shell; Phase 4 builds the *workspaces*.
- All Evidentiary Tracking and Speedy Trial features (F14+ — Phases 5–8). Phase 2 builds the
  configuration, notification, and search seams those phases consume; it does not anticipate
  their content.
- National/cross-court configuration governance (F37 — out of MVP scope per PROJECT.md).

**Scope anchor:** Phase 2 makes local variation possible without a code fork, makes risk signals
reach a human without exposing sensitive content, and makes authorized records findable without
leaking the existence of unauthorized ones. Anything beyond those three sentences is another phase.

</domain>

<decisions>
## Implementation Decisions

### Configuration: package scope and layering

- **One generic "versioned config package + maker-checker publish" primitive**, instantiated for
  **two distinct package types**:
  - **Operational rule package** — numbering schemes, workflow state definitions, thresholds,
    docket-event-category mappings. Approver requires `config_admin`.
  - **Security/retention package** — `security_policies`, `retention_schedules`, file-type
    allowlist, session timeout (the tables Phase 1 created and seeded). Approver requires
    `security_officer`.
- Rationale: Phase 1 explicitly handed off *"Phase 2 adds rule-package versioning, the
  maker-checker approval flow, and the admin UI **on top of these tables**"*, so leaving security
  and retention config on an unversioned write path contradicts that handoff. But a single
  all-encompassing package would force either a security officer to approve numbering tweaks or a
  config admin to approve sealed-record policy. Two package types over one primitive resolves both.
- **No configuration may be changed through an unversioned, non-maker-checkered path.** If a
  config value exists, it belongs to a package type.

### Configuration: read path

- **A single `ConfigResolver` service is the only read path.** `configResolver.get(courtId, key)`
  returns `{ value, rule_package_version_id }`.
- **The immutable published snapshot is the single source of truth.** Phase 1's flat config tables
  are either dropped or demoted to resolver-owned internals — they must not remain an independently
  writable second representation.
- **Phase 2 migrates Phase 1's seeded defaults into a published v1 package per court per package
  type.** The seed script must produce this state idempotently.
- Rejected: a denormalized "currently effective" projection written alongside the snapshot (two
  representations that can silently diverge), and consumers querying the snapshot JSONB directly
  (copy-pasted effective-version logic — the same failure shape Phase 1 refused when it kept ABAC
  out of per-module code).

### Configuration: version stamping and explainability

- **Add a nullable `rule_package_version_id` column to `audit_events` in Phase 2**, while the
  system is pre-pilot and no live court records exist. This follows Phase 1's provenance-column
  reasoning verbatim: *"deferring the columns would force a later migration and backfill across
  live court records."* Phase 2 is the last moment before Phases 5–8 begin producing records that
  need this.
- **Every durable derived artifact also carries the stamp** as later phases create them —
  exclusion candidates, calculations, exhibit numbers, notification instances. The resolver
  returns the version ID, so stamping is a one-liner at every call site.
- **Hash-chain constraint the researcher/planner MUST solve:** `audit_events` is hash-chained.
  The canonical hashed field list must be made **explicit and itself versioned**, rather than
  implicitly "all columns", or the Phase 1 integrity-verification job will report a false chain
  break across the migration boundary. Pre-existing rows must continue to verify under the field
  list in force when they were written.
- Satisfies F03 process step 6 (consumers reference the version they acted under) and keeps step 7
  enforceable (no silent retroactive recalculation).

### Configuration: separation of duties on publish

- **The approver must act in their own authenticated session.** The drafter calls
  "submit for approval"; the publish endpoint derives the approver **solely from the authenticated
  session** and **rejects** any `approving_user_id` supplied in the request body.
- **This is a deliberate, reasoned deviation from `Y1a-api-shared.md`**, which documents
  `POST /config/rule-packages/{id}/publish` with body `{approving_user_id}`. That signature permits
  a single person to publish by naming a colleague — attestation, not separation — leaving an audit
  entry crediting someone who never acted. It contradicts `Screen-16`'s *"enabled only for the
  selected distinct approver's own session"* and *"structurally blocked, not just rejected after
  click."* Phase 1's stance was **"prefer 'the API refuses' over 'the audit catches it'."**
  **Correct the OpenAPI contract and record the deviation explicitly — do not deviate silently.**
- Self-approval attempts return `403 CONFIG_SOD_VIOLATION`.
- **Not decided:** whether Phase 1's entitlement-grant request→approve flow is refactored onto this
  shared approval primitive. See Claude's Discretion.

### Search: engine and provider interface

- **Postgres full-text search + `pg_trgm` is the Phase 2 primary**, implemented behind a
  `SearchProvider` interface sized so OpenSearch drops in by configuration, not code change.
- **This is not a stub.** `TechArch/05-tech-stack.md` line 40 names `pg_trgm` as a required
  production fallback *"when OpenSearch is unavailable"* — it is a component that must work
  regardless. The spec therefore already mandates two implementations behind one interface; Phase 2
  chooses which is primary first.
- **OpenSearch is deferred, not cancelled.** It remains the binding production primary
  (`TechArch/05` line 41). Rationale for deferring: in Phase 2 the only searchable objects are
  cases, parties, proceedings, docket events and document references — `exhibits` and
  `defendant_trackers` do not exist until Phases 5–8 — so there is no corpus justifying a search
  cluster, and Phase 1's Compose stack (Postgres, Redis, OPA, Keycloak, ClamAV, MinIO) is already
  heavy enough that a ~2GB JVM container materially threatens `docker compose up` remaining usable.
- The provider interface must be honest: no Postgres-only semantics may leak through it, or the
  later swap will be a rewrite.

### Search: index shape and maintenance

- **A real access-tagged index table, not a materialized view.** This is a **deliberate deviation
  from `Y0a-schema-shared.md`**, which defines `search_index` as a `MATERIALIZED VIEW` unioning
  `exhibits`, `defendant_trackers` and `docket_events`. Two of those three tables do not exist in
  Phase 2, and a materialized view requires full `REFRESH` — which cannot satisfy F05 step 5's
  per-change index-update events and near-real-time bounded staleness. Record the deviation.
- **An object-type registry**: each module declares how its entity projects into the index.
  Phase 2 registers `case`, `party`, `proceeding`, `docket_event`, `document_reference`.
  Phases 5–8 register `exhibit` and `defendant_tracker` as an **addition**, with no schema
  migration and no reindex of existing records.
- **Maintenance is incremental via the transactional outbox Phase 1 already built** for audit.
  Reuse it; do not build a second eventing mechanism.

### Search: filter surface

- **The API always accepts F05's complete documented filter set** — `identifier`, `party_name`,
  `witness_name`, `status`, `date_from`, `date_to`, `proceeding_id` — so the request contract never
  changes across phases and generated clients never disagree with the server.
- **When a requested filter has no registered backing object type, the response carries a
  machine-readable `unsupported_filters[]` notice** alongside results, and the UI surfaces it
  plainly. This is an addition to the F05 response shape — record it as a deviation.
- Rationale: F05 says *"zero results (not an error)"*, but in a judicial system a clerk filtering
  by `witness_name` and receiving zero hits would reasonably conclude *"no such witness"* rather
  than *"that filter isn't wired up yet."* A zero-result set must never be ambiguous between
  "nothing matched" and "not implemented." Rejected: a `400` on unsupported filters (breaks the
  contract between phases) and silent zero-hits (the ambiguity above).

### Search: index staleness, split by risk

- **Security-designation and scope changes update the index access tags in the SAME transaction as
  the source change, and fail closed** — if the tag write fails, the designation change fails. The
  index can therefore never be more permissive than reality.
- **Content and summary changes ride the async outbox** with a bounded staleness SLA.
- Rationale: content staleness means a slightly out-of-date result; designation staleness means a
  just-sealed record is still discoverable by someone who must not know it exists, which
  `TechArch/04-security.md` §7.6 treats as a hard existence-hiding violation. The two risks do not
  warrant the same mechanism. This is transactionally feasible because the index table is in the
  same Postgres instance.

### Search: access-scope enforcement

- **The pre-filter predicate comes from OPA partial evaluation.** Call OPA's Compile API
  (`POST /v1/compile`) with the resource attributes declared as unknowns; OPA partially evaluates
  **the same Rego policy the Phase 1 global guard uses** and returns residual conditions, which the
  `SearchProvider` compiles into a query predicate (a SQL `WHERE` clause now, an OpenSearch filter
  later — the provider interface makes this clean).
- **One policy source of truth. No second ABAC implementation in TypeScript or SQL.** This is the
  Phase 1 constraint applied to search, and it is the reason the simpler "resolve the scope set
  from Identity and filter on tags" option was rejected despite being easier.
- **Scope is applied as a mandatory pre-filter before relevance ranking**, per F05 — never
  post-filtered on a ranked page, which F05 rules out by name because dropped items shrink pages
  and perturb counts (the §7.6 ranking side-channel).
- **The residual-AST-to-query translator needs its own dedicated test suite.** It is the single
  most security-critical new component in this phase.

### Search: residual caching

- **Compiled residuals are cached in Redis**, keyed by
  `(resolved-scope fingerprint, OPA bundle revision, object-type set)`.
- **TTL is bounded by the same `TechArch/04-security.md` §7.2 session claim-cache window Phase 1
  already reasoned about** — do not invent a new staleness budget.
- **Explicit invalidation on entitlement grant/revoke, designation change, and policy bundle
  update**, inheriting Phase 1's immediate-revocation guarantee rather than weakening it. Every
  entitlement mutation path must be wired to invalidation; a missed hook is a silent
  over-permission, so this needs test coverage, not just care.
- **Fail closed**: if OPA is unreachable and no valid residual is cached, return
  `503 SECURITY_POLICY_UNAVAILABLE`, matching the Phase 1 global guard.

### Search: designation granularity

- **Each index row carries a SET of designation tags, never a scalar.** A row is visible only if
  the requester holds **all** of its tags — conservative and fail-safe. Records genuinely carry
  multiple designations (sealed AND PII, restricted AND juvenile); a scalar would force a lossy
  precedence rule and changing it later would be a migration plus full reindex of live records.
- **The registry explicitly permits an entity to declare MULTIPLE projections at different
  designation levels.** Phase 2's object types each need exactly one, so **no fan-out is built
  now**. Phase 5 registers an exhibit as an open-description row plus a sealed-content row — an
  addition, not a migration. This is what satisfies F05's content-granularity rule (*"a user
  authorized for 'restricted' but not 'grand_jury' must not have grand-jury content searchable"*)
  when it actually bites.

### Search: audit of search activity

- **Every search is recorded as a lightweight operational `search_query` record** — requester,
  filters, applied scope, rule package version, result count, timestamp. This is an operational
  record, not an F02 audit event.
- **`access_attempt` F02 audit events remain reserved for actual denied object access** — deep-link
  follow-through and direct fetch — which Phase 1's global guard already emits.
- Rationale: partial evaluation makes "attempted to return a sealed result" nearly unobservable
  (the residual simply doesn't match). Detecting it would require a second unscoped query, which
  doubles cost **and materializes a count of sealed matter the requester has no entitlement to** —
  itself a side channel. Reading F05's *"attempt to return"* as the deep-link follow-through
  captures the observable, meaningful event. Operational query logs still give an investigator a
  full trail of probing behaviour.

### Notifications: channels

- **Email is real SMTP via `nodemailer` into a Mailpit container in the Compose stack.** This is
  the MinIO-for-S3 and Keycloak-for-court-IdP pattern Phase 1 established: the SMTP client,
  template render, retry and failure paths are all genuine; only the final hop is local, and
  pointing at a court's relay is a configuration change.
- **Mailpit must be used to induce failures**, so retry, backoff, delivery-status transitions and
  escalation are *proven* rather than asserted. Its web UI also makes rendered bodies inspectable
  by eye for content-policy review.
- **In-app is the second channel**, via an extensible channel registry per §9.4.
- Rejected: a real transactional provider (credentials cannot exist yet, won't run in CI or a
  sandbox, so it becomes a disabled path) and in-app-only (email is the channel that actually
  fails, so deferring it means criteria 2 and 3 are demonstrated only against a channel that
  essentially cannot fail).

### Notifications: escalation and the absent Exception Queue

- **Phase 2 creates `Y0a`'s real `exceptions` table and a narrow service-internal write path**, and
  emits exception records for (a) persistent delivery failure after retries and (b) a notification
  type with no configured recipient for a court.
- **Explicitly NOT built here:** the queue UI, triage workflow, aging, the critical-severity
  auto-close prohibition, and rationale-gated resolution. All F07, all Phase 3.
- This is directly parallel to Phase 1 creating config tables with a read path and leaving
  versioning and UI to Phase 2. Phase 3 then builds F07 on **populated real data** rather than an
  empty table, and Phase 1's `integrity_alert` records route into the same place rather than a
  second one.
- Phase 1 considered and **rejected log-only** for exactly this situation: *"too easy to miss and
  leaving no audit-visible trace of detection."* That reasoning carries forward — a court's alerts
  failing silently for weeks must leave a durable, queryable record.

### Notifications: escalation trigger

- **A periodic BullMQ sweeper over durable Postgres state** — the same shape as Phase 1's
  hash-chain verification job. It scans `notification_deliveries` for rows unacknowledged past
  their court-configured `escalation_cadence_minutes` and escalates to the configured secondary
  recipient.
- Rationale: criterion 3 requires that *"an alert is never silently dropped."* A sweeper's decision
  is derivable from durable Postgres rows at any instant, so a Redis flush, worker crash or
  multi-hour outage loses nothing — the next sweep catches every overdue alert. A per-notification
  delayed BullMQ job would hold the pending escalation only in Redis, where losing it is precisely
  the "silently dropped" outcome.
- Idempotent and self-healing. Escalation fires within one sweep interval rather than exactly on
  the second, which is immaterial against minute-to-hour cadences.
- **Testable by backdating rows or injecting a clock** — this is how ROADMAP Phase 8 criterion 2
  (*"confirmed by simulating an unacknowledged alert past its window, not merely confirming the
  first send occurred"*) will later be satisfied.

### Notifications: which acknowledgments reach the audit trail

- **Audit any acknowledgment where `severity = critical`, UNION every `threshold_crossed`
  acknowledgment regardless of tier.**
- Rationale: severity-driven coverage means alert types introduced in Phases 5–8 are captured
  automatically, with no list for someone to forget to update. The `threshold_crossed` union
  closes the warning-tier gap that F04's literal wording misses, since Screen-16 defines tiered
  info/warning/critical thresholds — so "threshold alerts" and "critical alerts" overlap rather
  than coincide. Audit over-inclusion is cheap; under-inclusion is unrecoverable.
- All other delivery lifecycle events remain **operational** records, per F04's deliberate
  separation of delivery logs from the legal-significance audit trail.
- **Carry F04 step 8's `[ASSUMPTION]` marker verbatim into code and docs.** The
  operational-versus-audit boundary is exactly the kind of decision a court's records officer must
  ratify, and Phase 1 required that such markers *"be preserved as explicit assumptions requiring
  stakeholder validation"* rather than quietly resolved.

### Notifications: content policy enforcement

- **Make the leak structurally impossible first; keep a runtime tripwire behind it.**
- **The Notifications Service never dereferences `object_reference` and has no read path to case,
  party, or exhibit content.** It holds a type and an ID and builds a link. F04's input contract
  already excludes content (*"used to build the deep link, never embedded content"*) — honour that
  literally, and there is no sensitive data in the process to leak.
- **Templates render against a CLOSED, typed context**: `notification_type`, `severity`, generic
  type description, deep link, court name. Sensitive fields are not merely discouraged — they are
  not in scope and will not compile.
- **A CI check asserts no template references anything outside that context.**
- **The runtime assertion raising `NOTIFY_CONTENT_POLICY_VIOLATION` (500, blocks send) stays as
  defense in depth** — a tripwire that should be unreachable, and whose firing is itself a
  critical alert.
- Rejected: a runtime content scanner as the *primary* control, because it would require the
  notification service to **load** the sensitive data in order to check for it, inverting the
  structural protection, and pattern matching fails open on anything it doesn't recognise.

### Notifications: template ownership

- **Templates are versioned code assets in the repo**, reviewed through normal code review and
  released with the application. **Identical across courts.**
- Courts configure recipients, channels, cadence and thresholds via F3 — **not wording**. F03's
  configurable surface is explicitly numbering schemes, workflow states, thresholds and event
  mappings; templates are not on it. This matches F04's *"reviewed/approved assets, not free-text."*
- Court-configurable templates were considered and deferred: even though the closed render context
  would make court-authored text structurally safe, it is genuinely new capability that F03 never
  asked for, and PROJECT.md puts cross-court configuration governance outside MVP.

### Notifications: deep links

- **The deep link is a plain application URL carrying zero authority.** Clicking it enters the
  normal authenticated flow: Phase 1's session check plus the global OPA guard decide everything,
  an unauthenticated click goes to Keycloak login with TOTP, and an unauthorized click is denied
  and audited as an `access_attempt` like any other request.
- *"Requiring re-authentication"* is satisfied because the link conveys no access by itself. **A
  forwarded or intercepted email grants nothing.**
- Rejected: signed single-use token links, which place a bearer credential in an email inbox — the
  one place content policy says sensitive things must not go — and add issuance, expiry,
  single-use enforcement and revocation as new attack surface to save one login.

### Phase 2 visible surface

- **Three screens are added to Phase 1's existing generic USWDS shell**, gated by entitlement
  rather than by role layout:
  1. **Configuration Engine editor** — `Screen-16` content (tabs, editable tables, inline
     validation, approver selection, structurally-blocked Publish).
  2. **Notification inbox** — list and acknowledge.
  3. **Search** — header input plus a results page with the full filter panel.
- **This does not violate Phase 1's "no role-specific layouts" rule.** Phase 1 itself shipped the
  Audit Explorer (`Screen-17`), which is specified as an Admin Dashboard screen. Phase 4 builds the
  **workspaces**; Phase 2 builds **screens** inside the generic shell. Phase 4 then reorganises
  proven screens rather than building them from nothing.
- The axe-core CI gate extends to all three new screens and continues to **block the build**.

### Phase 2 UI: validation rules

- **Structural validation lives once, in a shared `zod` schema package in the monorepo**, imported
  by both the NestJS server and the React client. Threshold tier contiguity, at-least-one-terminal-
  state, no-unreachable-states and deterministic event mapping are pure functions over the draft
  and are expressed as `zod` refinements.
- Error codes (`CONFIG_THRESHOLD_GAP`, `CONFIG_AMBIGUOUS_MAPPING`, `CONFIG_INVALID_STRUCTURE`) are
  defined alongside the rule that raises them.
- `Screen-16` asks for *"client-side pre-validation [that] mirrors server rules"* — "mirrors" is
  the two-implementations-that-drift shape Phase 1 refused. Sharing the schema gives immediate
  inline feedback with no possibility of the editor and the server disagreeing at publish time.
- The shared package must stay free of server-only dependencies.

### Phase 2 UI: search presentation

- **A persistent USWDS search input in the shell header**, plus a dedicated results page carrying
  the full filter panel.
- **The zero-results empty state renders identical text, layout and count regardless of whether
  records were scope-excluded.** No "some results hidden", no count discrepancy, no differing
  wording. **This identity is asserted by the assurance suite**, per §7.6.
- **Entirely separate from it**, a USWDS Alert states which requested filters are not searchable in
  this deployment. This leaks nothing — it is a property of the query shape, not of the data. The
  two notices must be visually distinct enough that nobody reads the capability notice as "results
  were withheld."

### Phase 2 UI: inbox transport

- **Polling via TanStack Query** (already in the stack from Phase 1), **behind a thin transport
  abstraction**. No new infrastructure, no connection lifecycle, no sticky-session or proxy
  concerns. §9.4 names poll-based as a sanctioned option.
- **WebSocket push is deferred to Phase 5**, where *"chambers sees the live status update during
  the same session"* is a genuine requirement. The abstraction means Phase 5 introduces push
  without rewriting the inbox.
- Poll latency is irrelevant against minute-scale escalation cadences.

### Named Phase 2 assurance suite

**An explicit, named deliverable — not left to developer discretion**, mirroring Phase 1's
negative-path suite. Phase 2's guarantees are all negative ones, and negative guarantees are
precisely what quietly stop being true. The suite must at minimum prove:

1. **Content policy** — every notification type, rendered for a case with a distinctive party name,
   leaks none of it. Asserted against **the message Mailpit actually received**, not the in-memory
   render, and covering subject, body and preview text for every channel.
2. **Search existence-hiding** — an unauthorized user searching for a sealed record's distinctive
   term returns zero hits, with result count, response shape and empty-state text
   **indistinguishable** from a genuinely empty search.
3. **Cross-court search isolation** — proven using Phase 1's two seeded courts.
4. **Config separation of duties** — a drafter cannot publish their own draft (`403
   CONFIG_SOD_VIOLATION`), and publication succeeds **only** when a second user acts in their own
   authenticated session. An `approving_user_id` in the request body is rejected, not honoured.
5. **Config immutability and no silent recalculation** — a prior rule package version remains
   retrievable after a new publish, and in-flight artifacts referencing it are not retroactively
   recalculated.
6. **Delivery failure handling** — an induced SMTP failure retries with the configured backoff,
   transitions to `failed`, writes an `exceptions` record, and escalates to a secondary recipient
   once the cadence is backdated past its window.
7. **Immediate revocation** — revoking an entitlement immediately invalidates the cached search
   residual; the next query reflects the revocation.

### Claude's Discretion

Not discussed; left to research/planning judgment, constrained by the canonical refs below:

- Whether Phase 1's entitlement-grant request→approve flow is refactored onto the shared approval
  primitive, or merely mirrors its shape. (Raised and consciously left open — the stronger
  long-term answer is one primitive feeding Phase 3's Work Queue with a single pending-approval
  shape, but it means Phase 2 modifying working Phase 1 code.)
- Config draft lifecycle: concurrent drafts per court, draft autosave semantics, draft discard, and
  whether more than one draft may exist per package type at a time.
- `effective_from` scheduling versus immediate publish, and how a future-dated package interacts
  with the "currently effective" resolution.
- Retry backoff parameters (count, base, jitter, ceiling) as configuration versus code, and which
  package type owns them if configuration.
- Recipient resolution when `recipient_role` matches many holders — all, round-robin, or a
  court-configured designee — and whether per-user channel preferences exist alongside court-level
  config.
- Search pagination design, relevance ranking approach, and `summary_snippet` generation.
- What `SEARCH_INDEX_UNAVAILABLE` (503) means operationally now that Postgres is the primary
  provider rather than a separate cluster.
- Index rebuild/backfill procedure and how it is made safe to run against live data.
- Response-timing uniformity measures for §7.6, beyond the pre-filter design itself.
- Sweep interval for the escalation job, and the generic per-type description strings in templates.
- Module/service decomposition for the three new services within the NestJS structure Phase 1
  establishes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 2 feature requirements
- `project_specs/FRD/F03-configuration-engine.md` — Court profiles, rule package versioning,
  workflow states, thresholds, event mappings, maker-checker publish, process steps 6–7 (version
  referencing, no silent retroactive recalculation). Contains the `[ASSUMPTION]` on the
  maker-checker pattern that must be preserved.
- `project_specs/FRD/F04-notifications-service.md` — Multi-channel delivery, content policy,
  delivery status, retry/backoff, escalation. Contains the `[ASSUMPTION]` in step 8 on the
  operational-versus-audit boundary that must be preserved.
- `project_specs/FRD/F05-search-service.md` — Access-scoped pre-filtering before ranking, filter
  surface, index freshness, content-granularity designation rule. Contains the `[ASSUMPTION]` on
  existence-of-record sensitivity for sealed cases that must be preserved.

### Binding error and denial semantics
- `project_specs/FRD/Y2-errors.md` — Canonical HTTP status taxonomy and error codes. **Principle 3
  is binding** (403-vs-404 existence hiding). Note: search is a pure blind-discovery surface, so it
  is always zero-hits, never 403 — F05 forbids placeholder results outright.
- `project_specs/TechArch/04-security.md` §7.6 — Existence-hiding for sealed records: result
  counts, ranking and response timing must not leak existence; denied/hidden attempts are logged as
  `access_attempt`. **Directly governs the search design.**
- `project_specs/TechArch/04-security.md` §7.2 — PDP invocation and the session short-cache window
  that bounds the residual cache TTL.

### Schema and API contracts (with Phase 2 deviations noted)
- `project_specs/FRD/Y0a-schema-shared.md` §Configuration — `court_profiles`,
  `rule_package_versions`, `workflow_state_defs`, `threshold_defs`, `event_mapping_defs`.
- `project_specs/FRD/Y0a-schema-shared.md` §Notifications — `notifications`,
  `notification_deliveries`, `notification_recipients_config`.
- `project_specs/FRD/Y0a-schema-shared.md` §Exception Queue — `exceptions`. **Phase 2 creates this
  table and a write path only; F07's workflow is Phase 3.**
- `project_specs/FRD/Y0a-schema-shared.md` §Search Index — **DEVIATION: implemented as a real
  access-tagged table with an object-type registry, not as the specified `MATERIALIZED VIEW`.** The
  view cannot satisfy F05 step 5 and unions two tables that do not exist until Phases 5–8.
- `project_specs/FRD/Y0a-schema-shared.md` §Audit — **DEVIATION: `audit_events` gains a nullable
  `rule_package_version_id`, and the canonical hashed field list becomes explicit and versioned.**
- `project_specs/FRD/Y1a-api-shared.md` §Configuration — **DEVIATION: the publish endpoint derives
  the approver from the authenticated session and rejects `approving_user_id` in the body.**
- `project_specs/FRD/Y1a-api-shared.md` §Notifications — `/notifications`, `/notifications/my`,
  `/notifications/{id}/acknowledge`.
- `project_specs/FRD/Y1a-api-shared.md` §Search — `/search`. **DEVIATION: response gains
  `unsupported_filters[]`.**
- `project_specs/TechArch/02a-data-shared.md` — Authoritative DDL and schema conventions: three
  schemas, UUIDv4 via `pgcrypto`, UTC `timestamptz`, no hard deletes on audit-feeding or
  docket-sourced tables.
- `project_specs/TechArch/03a-api-shared.md` — Shared service API contracts.

### Architecture, stack and integrations
- `project_specs/TechArch/05-tech-stack.md` — **Binding stack.** Line 40: `pg_trgm` as the
  documented search fallback. Line 41: OpenSearch 2.x as production primary (deferred in Phase 2).
  Line 32: BullMQ for notification delivery retries. Also `zod`, TanStack Query 5,
  `@trussworks/react-uswds`, axe-core/Pa11y CI gate.
- `project_specs/TechArch/01-components.md` — Configuration Engine, Notifications Service and
  Search Service component boundaries and their declared dependencies.
- `project_specs/TechArch/06-integrations.md` §9.4 — Notification channel registry; email
  (SMTP/transactional provider) and in-app (WebSocket/poll-based inbox) at MVP. Also the rule that
  sustained integration failure must raise both a critical notification and an exception entry
  rather than failing silently.
- `project_specs/FRD/Y3-integrations.md` §Notification Channels — Content policy design note on
  secure deep links.
- `project_specs/TechArch/00-overview.md` §159 — Court-level multi-tenancy by `court_id` enforced
  at the ABAC/row-level-security layer.

### Acceptance criteria and traceability
- `project_specs/UserStories/Epic-03-configuration-engine.md` — F3 acceptance criteria (US-3.1,
  US-3.2, US-3.3).
- `project_specs/UserStories/Epic-04-notifications-service.md` — F4 acceptance criteria.
- `project_specs/UserStories/Epic-05-search-service.md` — F5 acceptance criteria.
- `project_specs/RTM-JudicialSync.md` — Requirements traceability matrix.

### UI
- `project_specs/UX-Mockup/Screen-16-configuration-engine.md` — **The Phase 2 UI reference.** Tabs,
  editable tables, inline validation placement, approver Select excluding the current user, Publish
  structurally blocked rather than rejected on click, published/version-history states, and the
  explicit "existing calculations are not retroactively recalculated" note.
- `project_specs/UX-Mockup/Y0-patterns.md` — Shared USWDS interaction patterns.
- `project_specs/UX-Mockup/Y2-accessibility.md` — Section 508 / WCAG 2.1 AA expectations for the
  axe-core gate.
- `project_specs/UX-Mockup/Screen-17-audit-explorer.md` — Precedent for an Admin Dashboard screen
  shipping inside the generic shell ahead of Phase 4.
- **Read for boundary awareness, do NOT build in Phase 2:**
  `project_specs/UX-Mockup/Screen-15-admin-dashboard-home.md`,
  `project_specs/UX-Mockup/Screen-13-exception-queue.md` (Phase 3),
  `project_specs/UX-Mockup/Flow-06-admin-config-cmecf-conflict.md` (the CM/ECF half is Phase 3).
- U.S. Web Design System — https://designsystem.digital.gov/ (binding per PROJECT.md).

### Prior phase context (binding — do not re-litigate)
- `.planning/phases/01-core-identity-case-model-audit-security-baseline/01-CONTEXT.md` — **Read in
  full.** Establishes: OPA/Rego as the sole policy implementation, the global guard, fail-closed
  behaviour, entitlements as first-class and grantable independently of roles, the two-step
  request→approve SoD pattern, no-stub/no-bypass discipline, the `integrity_alert`
  write-now-consume-later precedent, the config tables and read path this phase builds on, the
  transactional outbox, the generic USWDS shell, the seeded two-court fixture set, and the
  build-blocking axe-core gate.

### Project-level governance
- `.planning/PROJECT.md` — USWDS binding; human-in-command; CM/ECF authoritative with no silent
  overwrite; vision-stage source material means assumptions are flagged, not locked; cross-court
  configuration governance explicitly out of MVP scope.
- `.planning/REQUIREMENTS.md` — v1 scope and the F3/F4/F5 traceability rows.
- `.planning/ROADMAP.md` — Phase 2 goal and its four success criteria.

</canonical_refs>

<code_context>
## Existing Code Insights

**Phase 1 is in progress and not yet executed** — at the time of this discussion the repository
still contains no source files. Everything below describes what Phase 1 **will have established**
by the time Phase 2 plans and executes. The researcher must re-scout the actual Phase 1 output
before planning, and treat any divergence from this list as authoritative over this document.

### Reusable Assets (from Phase 1)

- **Global NestJS ABAC guard + OPA PDP integration** — extend for the new endpoints; do not add
  per-route authorization logic.
- **OPA Rego policy bundle** — the same bundle must serve search's partial-evaluation path. Rego
  may need authoring in a partial-eval-friendly style.
- **Transactional outbox** (built for audit) — reuse for incremental search index updates. Do not
  build a second eventing mechanism.
- **BullMQ + Redis worker setup** (hash-chain verification job) — the escalation sweeper is the
  same shape; Redis also hosts the residual cache.
- **Audit Service with hash-chained append-only writes** — all Phase 2 material actions emit
  through it. Note the hashed-field-list constraint above.
- **Config tables with seeded per-court defaults and a read path** — Phase 2 migrates these into
  published v1 packages and replaces the read path with `ConfigResolver`.
- **Entitlement grant model with server-side SoD** — `config_admin` and `security_officer` plug in
  as first-class entitlements; the approval primitive mirrors (or absorbs) this flow.
- **Identity/session with immediate revocation** — the residual cache must not weaken it.
- **Generic USWDS shell, generated OpenAPI TS client, TanStack Query, axe-core CI gate** — all
  three new screens extend these.
- **Idempotent seed script with two courts, sealed and restricted cases, one user per role** —
  Phase 2 extends it with per-court notification recipient config, published v1 rule packages, and
  a distinctively-named party for the content-policy leak test.
- **Docker Compose stack** — Phase 2 adds exactly one container: Mailpit.

### Established Patterns (from Phase 1, binding)

- Policy logic in Rego, never duplicated in application code.
- Fail closed on policy unavailability (`503 SECURITY_POLICY_UNAVAILABLE`).
- Prefer "the API refuses" over "the audit catches it."
- No stubs, no dev bypasses, no no-op adapters — real protocol implementations with local backends.
- Write the durable record now even when its consumer is phases away; never log-only.
- `[ASSUMPTION]` markers are carried into code and docs, never silently resolved.
- Dangerous guard first, convenience later.
- Three PostgreSQL schemas; UUIDv4 via `pgcrypto`; UTC `timestamptz`; no hard deletes.
- `Y2-errors.md` taxonomy conformance on every endpoint.
- Negative-path proofs are named deliverables, not developer discretion.

### Integration Points created by Phase 2

Build these as real extension points — later phases plug in, they do not rewrite:

- **`ConfigResolver`** — F16 exhibit numbering, F27 event mapping, F28 exclusion rules, F31 alert
  thresholds all read through it and stamp the returned version ID.
- **Rule package types** — a later phase adding configurable surface registers a package type; it
  does not invent a parallel config mechanism.
- **Search object-type registry** — Phase 5 registers `exhibit`, Phase 7 registers
  `defendant_tracker`, each as an addition with no migration.
- **`SearchProvider` interface** — the OpenSearch implementation lands behind it unchanged.
- **Notifications Service** — F07, F18, F20, F31 all route through it; none implements its own
  delivery.
- **`exceptions` table** — Phase 3's F07 builds the queue over it; Phase 1's `integrity_alert`
  records and Phase 2's delivery failures already populate it.
- **Channel registry** — additional court-approved channels register without code changes
  elsewhere.
- **Inbox transport abstraction** — Phase 5 introduces WebSocket push behind it.
- **Shared `zod` validation package** — later phases add schemas rather than duplicating rules
  client-side.

</code_context>

<specifics>
## Specific Ideas

- The user opted into **all six** gray areas and selected the recommended, more rigorous option on
  **every one of the twenty-four** questions — continuing the Phase 1 pattern of *"I want to
  perfectly execute the phase as it's the building block."* Planning should favour structural
  correctness and provability over minimising Phase 2's size.
- **"Make it impossible, then put a tripwire behind it."** Chosen explicitly on content policy, and
  the clearest statement of this phase's preferred shape: remove the capability to do the wrong
  thing, then detect the removal failing.
- **"One rule, one place"** — applied consistently and at real cost: OPA partial evaluation rather
  than a convenient scope-set filter; a shared `zod` package rather than mirrored client
  validation; one `ConfigResolver` rather than a fast denormalised projection. Every time the
  cheaper option meant two implementations that could drift, it was rejected.
- **"A second human must actually authenticate and act."** Chosen over the documented API
  signature. Attestation is not separation.
- **Structural decisions get made early, machinery does not.** Shown twice: designation **tag sets**
  plus registry support for multi-projection now, but **no fan-out built**; `rule_package_version_id`
  on `audit_events` now, before live court records exist. The rule being applied is Phase 1's — take
  the migration while it is free, but don't build unexercised machinery.
- **Durability beats precision on anything that must never be dropped.** Chosen on the escalation
  sweeper: a Redis-held delayed job is more precise and can vanish; Postgres-derived state cannot.
- **Ambiguity is a correctness bug in a judicial system.** Chosen twice: `unsupported_filters[]` so
  a zero-hit result never reads as "no such witness", and a byte-identical empty state so it never
  reads as "results were withheld." The same instinct, pointed in opposite directions.
- **Four spec deviations were accepted, each explicitly and with a recorded reason.** The user's
  consistent position is that deviating is fine and deviating *silently* is not — the OpenAPI
  contract and schema docs must be corrected, not quietly diverged from.

</specifics>

<deferred>
## Deferred Ideas

Raised or implied during discussion, deliberately out of scope for Phase 2:

- **OpenSearch 2.x as the search primary** — remains the binding production choice per
  `TechArch/05-tech-stack.md`. Revisit when a real corpus exists (Phases 5–8 add `exhibits` and
  `defendant_trackers`) or before pilot. The `SearchProvider` interface exists so this is a
  configuration change.
- **WebSocket push transport** — Phase 5, where live courtroom status is a stated requirement. The
  inbox transport abstraction exists so this is an addition.
- **Per-designation index row fan-out** — Phase 5, when exhibits introduce genuinely
  mixed-designation content. The registry already permits multiple projections per entity.
- **Exception Queue UI, triage workflow, aging, rationale-gated resolution, critical-severity
  auto-close prohibition (F07)** — Phase 3. Phase 2 ships only the table and a write path.
- **Work Queue (F06)** — Phase 3. Pending config publications should surface there alongside
  Phase 1's pending entitlement grants.
- **Refactoring Phase 1's entitlement-grant flow onto the shared approval primitive** — consciously
  left open rather than deferred; see Claude's Discretion. If not done in Phase 2, Phase 3 should
  revisit it when the Work Queue needs one pending-approval shape.
- **Court-configurable notification templates** — F03 never asked for it and PROJECT.md puts
  cross-court configuration governance outside MVP. The closed render context means this could be
  added safely later if a court requires local wording.
- **Signed single-use deep-link tokens / step-up re-authentication** — rejected for Phase 2;
  revisit only if a court demands one-click access from email, and only with a security review.
- **Real transactional email provider (SES/SendGrid)** — deferred until a deployment target and
  credentials exist. Mailpit proves the SMTP path; the channel adapter makes the swap configuration.
- **National/cross-court configuration governance (F37)** — explicitly out of v1 scope.
- **Search type-ahead** — rejected on §7.6 timing-side-channel grounds and OPA cost per keystroke.
  Revisit only with a measured, constant-time query path.
- **Maker-checker pattern for configuration (`FRD/F03` `[ASSUMPTION]`)** — implemented, but remains
  an assumption requiring stakeholder validation before production.
- **Operational-versus-audit boundary for notification events (`FRD/F04` step 8 `[ASSUMPTION]`)** —
  decided for v1, requires a court records officer's ratification.
- **Existence-of-record sensitivity for sealed matters (`FRD/F05` `[ASSUMPTION]`)** — Phase 2
  implements the conservative reading (zero hits, no placeholder); flagged for pilot validation per
  PRD §9.3.

</deferred>

---

*Phase: 02-platform-configuration-communication-services*
*Context gathered: 2026-10-06*
