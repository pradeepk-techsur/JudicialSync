# Phase 4: Role-Specific UI Workspaces & External Attorney Portal - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 delivers the role-facing surface of the platform: **four internal workspaces** (F11 — judge/
chambers, clerk operations, courtroom deputy, administrative) built from shared USWDS components,
and a **structurally separate external attorney portal** (F12) that can submit and read but can
never touch the official record.

**In scope:** F11, F12.

**Not in scope — these belong to other phases and must not be built here:**
- All Evidentiary Tracking and Speedy Trial features (F14+ — Phases 5–8). Phase 4 declares the
  workspace slots those phases will fill; it does not build their panels.
- v2-excluded features: portfolio dashboards (F25/F36) and custody tracking (F20), **even though
  Screen-10 and F11 steps 3–4 depict them**. See decisions.
- Keyboard-interaction machinery for courtroom logging — Phase 5 designs that with F17.
- Any mechanism to authorize a security-designated case into the portal.

**The structural fact that shapes this entire phase:** F11 defines each workspace as a *composition*
of features, and most of those features arrive in Phases 5–8. Admin composes fully from Phases 1–3;
Judge and Clerk get roughly two panels each; **Deputy has zero fillable slots** because F17 (its
primary full-screen surface) is Phase 5. Both portal capabilities also depend on later phases —
submissions route into F15 intake (Phase 5), and the Speedy Trial summary reads F29 (Phase 7).

The success criteria are calibrated for this: criterion 1 says *"workspace **shell**"*, and
criterion 2's emphasis is on the write attempt being *"rejected at the API layer"*. Phase 4 builds
the frames, the boundaries, and the registration seams — not the content that fills them.

**Scope anchor:** Phase 4 makes each role land somewhere purpose-built, makes every panel's presence
a function of entitlement rather than role, and makes the external boundary provable. Anything
beyond those three sentences is another phase.

</domain>

<decisions>
## Implementation Decisions

### Workspace composition — the slot registry

- **A workspace slot registry**, following the same inversion-of-control pattern as Phase 2's search
  object-type registry and Phase 3's timeline provider registry. Each workspace declares named
  slots; a module registers a panel component into a slot **together with the entitlement required
  to see it**.
- Phase 4 registers what exists: **Admin** (configuration, identity/entitlement admin, reporting,
  adapter health), **Judge/Chambers** (case timeline, approval-type tasks), **Clerk** (exception
  queue, work queue), **Deputy** (nothing).
- **Phases 5–8 register their panels as pure additions** — Phase 5 the exhibit ledger and intake
  panels, Phase 7 the explain-this-date panel, Phase 8 the conference view — with **no edit to Phase
  4 files**. This is the whole reason for the registry: the four workspace files must not become a
  merge point four later phases all have to touch.
- **Entitlement gating lives on the slot registration**, so a panel cannot appear for a user who
  lacks the entitlement to use it. This is how F11's *"component visibility reflects entitlement,
  not just role label"* is satisfied structurally rather than by discipline.

### Slot catalogue ownership

- **Phase 4 declares the COMPLETE slot catalogue** for all four workspaces, taken straight from F11
  process steps 2–5, each slot tagged with its owning feature (F16, F29, F35…) and the phase
  expected to fill it. Phases 5–8 **fill declared slots** rather than inventing them.
- Three payoffs: the design intent is captured once while the spec is in front of us; coverage
  becomes measurable (a build-time report of which slots are empty); and **a later phase registering
  an undeclared slot is a detectable deviation** rather than silent drift.
- Declaring a slot costs a line. This is the "structural decision early, machinery later" rule the
  project has applied repeatedly — unlike a placeholder component, which costs a build and a 508
  test.

### Unfilled slots

- **An unfilled slot renders no DOM at all.** The workspace lays out from the panels it actually has.
- **No "coming soon", no greyed box, no phase numbers.** This is a federal judiciary application and
  developer roadmap language has no place in its UI, even pre-release. (Phase 4 is not a release —
  v1 ships after Phase 8 — so the audience for the intermediate state is UAT, demo and internal
  review.)
- The registry still holds the full catalogue, so **a build-time coverage report** answers "which
  slots are empty" for the team, and **the assurance suite asserts the expected empty set**, making
  Deputy's emptiness a recorded, tested fact rather than something a reviewer has to notice.

### v2-excluded slots

- **Declare them, tagged `v2_excluded`** — Portfolio Snapshot (F25/F36) in the Clerk Console, and
  custody access (F20) in the Deputy workspace. They never render and **never count as missing
  coverage**.
- This gives the registry three distinct states — *filled* / *awaiting Phase N* / *excluded from v1*
  — which is what makes the coverage report trustworthy, since "empty because v2" and "empty because
  Phase 5 hasn't run" are completely different facts.
- **Record the divergence from Screen-10 and F11 steps 3–4 in the deviation register**, so the
  mockup's Portfolio Snapshot card and the deputy's custody access are visibly accounted for rather
  than silently dropped.
- **Rejected:** building a reduced portfolio snapshot from Phase 3's reporting data. That is scope
  creep into a deliberately excluded feature, and Phase 3's reporting payload carries **no object
  identifiers** by design so it cannot drill into cases anyway.

### The courtroom deputy workspace

- **Shell only.** Build the route, the distinct full-bleed layout, nav access, and a passing 508
  check — with the F17 slot declared and empty.
- **Do NOT build the keyboard-shortcut registry, focus-management harness, or touch-target system.**
  That is interaction machinery for a task that does not exist. Phase 2 refused exactly this bet
  when it declined per-designation fan-out, on the grounds that *"untested-in-anger machinery tends
  to be wrong when it finally matters"* — and courtroom keyboard flow is precisely the kind of thing
  that gets designed wrong without a real task to design against.
- **Phase 5 designs the keyboard model against real offer/objection/ruling entry** and registers
  into the declared slot.
- Satisfies criterion 1 without pre-committing interaction decisions that can only be validated
  against the live task.

### Shell variants — what makes a workspace "distinct"

- **Two shell variants, not four bespoke ones.** Chrome density is the distinguishing axis.
  - **Side-nav shell** — persistent nav, standard header, content column. Used by Judge, Clerk,
    Admin, and every non-workspace route.
  - **Full-bleed shell** — no side nav, collapsed header, maximum content area. Used by the Deputy
    workspace route only. This is what *"minimal chrome"* means in shell terms: a courtroom session
    is one task held for hours.
- **The variant is selected by ROUTE, not by user.** Only the Deputy *workspace route* is full-bleed;
  everything else — including all eleven pre-Phase-4 screens and the other three workspaces —
  renders in the side-nav shell.
  - **Why:** if the variant were per-user, a deputy following a notification deep link to
    `/exceptions` would land in full-bleed chrome with no navigation and no way out. Dead-ending the
    role most likely to be working under time pressure.
- The assurance suite asserts the Deputy route renders no side nav and a collapsed header — which is
  how criterion 1's "distinct shell" is demonstrable even with Deputy carrying no content.

### Empty-workspace state

- **A workspace whose slots are all empty renders a real USWDS empty state** — heading plus a
  corrective next step, mirroring `UI_NO_WORKSPACE_ASSIGNED`'s *"contact an administrator"* guidance
  — returned **200**, not 403.
- This is **not** the per-slot placeholder that was rejected. That would have been a development
  artifact; **this is a genuine production condition**, reachable by any user whose entitlements
  don't cover their workspace's registered panels — because slot registration is entitlement-gated.
- Copy carries no phase numbers or roadmap language. Same class as the Phase 2 search empty state.
- The assurance suite covers both the entitlement-driven case and the Phase-4 Deputy case.

### Portal — exhibit submission with F15 unbuilt

- **A portal-local staging table, drained by Phase 5's F15 intake.** Fourth use of the project's
  "write the durable record now, the consumer arrives later" pattern (Phase 1's `integrity_alert`,
  Phase 2's `exceptions` rows, Phase 3's `cmecf_delivery_log`).
- The attorney genuinely submits; the record lands durably with `submitted_via = 'external_portal'`,
  status `pending_review`, the submitting identity, and a full F02 audit entry.
- **Phase 5's F15 DRAINS it** rather than replacing it, so nothing is rewritten and Phase 5 inherits
  populated real data instead of an empty path.
- The file-upload half **reuses Phase 1's existing pipeline**: allowlist → ClamAV → encrypted
  storage. Screen-19's "malware-scanned, allowlisted types only" messaging is therefore truthful.
- **Rejected:** writing directly into Phase 5's `exhibits` table — that table does not exist and
  Phase 5 owns its schema; defining it here is the single-owner violation that produced blockers in
  both Phase 2 and Phase 3 planning.

### Portal — Speedy Trial summary with F29 unbuilt

- **Build the endpoint and Screen-20 for real**, with the full access-control path live and provable
  now: party-of-record check, designation default-deny, portal-audience guard.
- With no tracker data in the system the endpoint returns an empty result and the screen renders
  *"No deadline information is available for this case"* — which is **literally true**: the system
  holds no Speedy Trial calculation because none has been created.
- **Phase 7 registers the data source and the screen fills; no rewrite.**
- **Rejected:** a 503 until Phase 7. `503` means *temporarily unavailable*, and this is not
  temporary — it is unbuilt, a different fact. It would also park the access rules behind an error
  path so the one genuinely risky part of this endpoint goes unexercised for three phases.

### Portal — rejection from internal endpoints

- **The internal guard validates the token's audience/issuer BEFORE any route-specific logic.** A
  portal token is therefore rejected from every internal endpoint that exists **or will ever
  exist** — Phase 5's ledger and Phase 7's calculations inherit the rejection the moment they are
  written, with nobody needing to remember.
- **The proof enumerates the application's live internal route table at runtime** and fires a portal
  token at every route, asserting 403 on all. This makes criterion 2 provable now despite most of
  its named target endpoints not existing yet.
- **Rejected:** explicit deny lists on ledger/docket/calculation endpoints. That is per-route opt-in,
  which Phase 1 rejected by name: *"a route that forgets the decorator is silently open."*

### Portal separation — identity

- **A separate Keycloak realm for external principals.** Different **issuer** as well as audience,
  its own user store, its own password and MFA policy, no shared session or SSO state with internal
  users.
- Criterion 3's wording is literally *"cross-realm"*, and F12's defense-in-depth clause — safe *"even
  if an endpoint's authorization check were misconfigured"* — is only fully true when a
  misconfiguration inside one realm cannot mint a token the other accepts.
- Phase 1 already runs Keycloak in Compose, so this is a realm definition plus seed users, not new
  infrastructure. Attorneys also need a different enrolment path from court staff, which a separate
  realm models honestly.

### Portal separation — backend

- **Same NestJS application, `/portal/v1` prefix, distinct auth middleware**, portal controllers in
  their own module. Matches `Y1a` literally.
- The **global audience guard is the structural boundary**; combined with the separate realm and the
  full-route-table assertion, defense in depth is genuine — an attacker needs a flaw in the guard
  itself, not in any one route.
- The portal reuses party-of-record lookup, the audit service and the upload pipeline **directly**
  rather than duplicating them or calling them over the wire.
- **Considered and rejected:** a separate portal process. Strictly stronger on F12's misconfiguration
  clause (topological rather than conditional isolation), but it costs a second deployable and
  forces the three services the portal depends on to be duplicated, extracted, or reached over an
  internal HTTP hop — disproportionate to the gain over a global guard.

### Portal separation — frontend

- **A separate `apps/portal` build** alongside `apps/web`, sharing the USWDS design system and the
  generated OpenAPI client types through the monorepo — but shipping **no internal shell, no
  internal routes and no internal copy** in the external bundle.
- The portal already has entirely its own chrome per Screen-19 (`.gov` Banner, own header, no side
  nav, persistent restricted-access Site Alert), so almost nothing is duplicated — and
  *"structurally separate"* becomes true of the artifact an external user can actually download and
  inspect, not just of the token it carries.
- **Rejected:** a separate domain. Phase 1 deliberately put the whole stack behind one TLS origin,
  and no court has specified a hostname — baking one in would be a deployment assumption.

### Portal separation — sessions

- **Internal and portal sessions may coexist in one browser.** Two separately-named session cookies;
  the portal's is **path-scoped to `/portal`** so it is never transmitted to internal routes at all.
- **The audience guard remains authoritative** regardless of what arrives — authorization never
  depends on which cookie was sent, so coexistence weakens nothing.
- Required by the criterion-3 test itself, which must hold a portal token while hitting internal
  routes, and by UAT and demo flows.

### Workspace routing

- **Role selects the frame; entitlement fills it.** Role determines *which workspace layout* you land
  in — a presentation choice about working pattern — and **grants nothing**. Entitlement determines
  every panel that appears and every control that is enabled, via the slot registry.
- **State this explicitly in the implementation:** role selects a frame, never a capability. This is
  consistent with Phase 1's *"role existence must never imply access"* (choosing a layout is not
  access) and with Phase 3's entitlement-based task routing (the capability check is unchanged),
  while still matching F11 step 1 and the `users.workspace_preference` column `Y0a` ships.

### Multi-role users

- On login: route to the stored `workspace_preference` **if set AND still mapped to one of the user's
  current roles**; otherwise fall back to the default for their primary role, **silently rather than
  erroring**.
- **The validate-on-read step is the load-bearing part** — without it, a user whose roles change is
  stranded on a workspace they can no longer use, and the stale value needs an administrator to
  clear.
- **A workspace switcher in the shell header** lists the workspaces their roles map to; changing it
  writes the preference via `PATCH /users/me/workspace-preference`.

### Cross-workspace viewing

- **Not permitted in v1.** The switcher shows only workspaces the user's roles map to, and navigating
  directly to an unmapped workspace is refused rather than rendered empty.
- F11's *"a clerk viewing the judge workspace layout, **if permitted** read-only access…"* is
  conditional, and exists to make a point about entitlement gating rather than to require
  cross-viewing. No identified user need calls for it.
- **Record explicitly that this is SAFE to relax later** — the slot registry's entitlement gating
  already makes cross-viewing harmless — so a later phase can enable it as a configuration change
  rather than a redesign.

### Role → workspace map

Phase 4 writes the **complete map for every role Phase 1 created**, so no role's landing behaviour is
accidental:

| Role | Workspace |
|---|---|
| `judge`, `law_clerk` | Judge/Chambers |
| `clerk_case_admin` | Clerk Operations |
| `courtroom_deputy` | Deputy (full-bleed) |
| `court_admin`, `system_admin`, `security_officer`, `ao_program_manager` | Admin |
| `attorney_external` | Portal only — never an internal workspace |
| `jury_admin` | **NO v1 workspace** — its only feature (F22 jury review package) is v2-excluded |

- The API returns F11's `403 UI_NO_WORKSPACE_ASSIGNED`, but **the user gets a properly rendered page**
  carrying the *"contact an administrator"* path — not a raw error.
- **`jury_admin` is a real, reachable case on day one**, not a hypothetical edge case. The assurance
  suite covers it specifically as the known-unmapped role.

### The eleven existing screens

- **Routes and components are unchanged.** A workspace slot registration **points at** an existing
  component (or a panel-sized wrapper of it). Phase 4 is purely additive here — no route changes, no
  Playwright URL rewrites, no axe regressions on screens that already passed.
- **Decisive argument:** Phase 2 locked that notification deep links are **plain application URLs**,
  already potentially in recipients' inboxes, and Phase 3 built timeline deep links into underlying
  records. Re-parenting routes would break links already emitted.
- By-reference composition also handles the same screen appearing in two workspaces (Work Queue in
  both Clerk and Judge) for free.

### The generic shell

- **Phase 1's `AppShell` becomes the side-nav workspace shell.** There is no third "generic" shell.
- Variant selected by route (above). Exactly two shells to build and 508-test.
- **Phase 4 modifies Phase 1's `AppShell`** — that file needs a single declared Phase 4 owner.

### Navigation

- **The side nav lists the current workspace's registered panels**, entitlement-gated, plus the
  workspace switcher — matching Screen-10's role-tailored nav and falling out of the slot registry
  for free.
- **Cross-role surfaces stay in the HEADER** and are reachable from every workspace regardless of
  role: Phase 2's search input (already there by decision), the notification inbox via a header
  control, and account/session.
- **"Workspace panel" vs "global chrome" becomes an explicit property each surface declares**, rather
  than an accident of where it was built.

### Navigation consolidation

- **The registry subsumes the existing nav mechanisms.** Every existing screen registers as a panel
  carrying its own nav metadata (label, icon, required entitlement, workspace).
  `phase3-nav.tsx` is **deleted**, its entries migrating into registrations; `SideNav.tsx` renders
  purely from the registry.
- One mechanism, one source of truth — and Phases 5–8 get nav for free when they register a panel
  rather than having to remember a second file.
- **Phase 4 owns the deletion and the migration, so both need declaring.** This is the one genuinely
  migratory act in an otherwise additive phase, so **the assurance suite must assert every
  pre-Phase-4 nav entry is still reachable afterwards.**

### Portal visibility scope

- **Court-configurable downward only.** Scope reads through `ConfigResolver` so a court may NARROW
  what the portal exposes, but the floor is **not waivable by configuration**:
  - party-of-record association is always required;
  - security-designated cases are always denied;
  - the Speedy Trial view never exceeds the confirmed-calculation summary (remaining time, next
    threshold, confirmed periods) — **never** explainability detail, **never** override history.
- A rule package attempting to widen past the floor is **rejected at publish**, exactly like Phase
  2's rationale bar and Phase 3's small-cell threshold.
- Satisfies F12 assumption (c)'s configurability and (b)'s limit simultaneously. **All three
  `[ASSUMPTION]` parts preserved verbatim.**

### Security-designation default-deny

- **Absolute in v1. The per-case override is NOT built.** No entitlement, flag or endpoint can lift
  the deny. Third use of *"build the refusal, not the capability."*
- Proven with the hardest case: **an attorney who IS a recorded party-of-record on a sealed case
  still receives `403 PORTAL_DESIGNATION_DENIED`.**
- F12's *"unless explicitly and individually authorized by the court"* escape hatch is recorded as
  **deferred**, with the `[ASSUMPTION]` carried verbatim. When a court needs it, it arrives with a
  validated policy and a maker-checker flow rather than a guessed one.

### Portal denial semantics — a correction to F12

**F12's error table gives both denials as 403. That leaks existence to the most adversarial
population in the system.** `Y2` Principle 3 — which Phase 1 called binding and told implementers not
to re-litigate — requires 404 where the requester has no legitimate path to learn the object exists.

- **`PORTAL_NOT_PARTY_OF_RECORD` → 404**, indistinguishable in response shape and timing from a case
  that does not exist. An external attorney probing case identifiers has no legitimate path to learn
  an unassociated case exists.
- **`PORTAL_DESIGNATION_DENIED` → 403.** Correct under Principle 3: a recorded party-of-record
  already knows the case exists; only the designation blocks them.
- **THE CHECK ORDER IS LOAD-BEARING.** Party-of-record is evaluated **first** — fail it and the
  response is 404. Only if that passes is designation evaluated. **Reversing the order would leak
  sealed-case existence to non-parties**, the worst outcome available here.
- Shape and timing must match a genuinely-nonexistent case, the same discipline as Phase 2's
  byte-identical search empty state.
- **DEVIATION from F12's error table — register it.**

### Party-of-record resolution

- **Strictly from party records synced through Phase 3's CM/ECF adapter. Fail closed.**
- **No manual portal grant exists in v1** — there is no path by which a human can assert an
  association the docket does not record. F12 is explicit: *"not self-asserted by the attorney."*
- A newly-added attorney gains access on the next successful poll.
- **The portal's case list shows the last successful sync time**, turning "my new case is missing"
  from an opaque failure into something the attorney and the clerk they call can both reason about.
  Sync freshness is operational state, not case data, so it discloses nothing.
- **Rejected:** caching associations with a TTL — a cached association outlives the docket change
  that should end it, which is the stale-permission failure Phase 1's immediate-revocation
  requirement exists to prevent.

### Named Phase 4 assurance suite

**An explicit, named deliverable** — fourth in the series after `01-14`, `02-16` (7 proofs) and
`03-18` (11 proofs). Two of Phase 4's three criteria are *rejection* claims, which is exactly what
quietly stops being true. Must prove at minimum:

1. **A portal token is rejected by EVERY internal route**, enumerated from the live route table at
   runtime rather than from a maintained list.
2. **A portal write against ledger/docket/calculation endpoints is refused at the API layer**, not
   merely absent from navigation.
3. **Not-party-of-record returns 404** indistinguishable in shape and timing from a nonexistent case,
   **AND the check order holds** — a non-party never receives 403 for a sealed case.
4. **A party-of-record attorney on a sealed case receives 403**, and no override mechanism exists
   anywhere in the codebase.
5. **Four distinct workspace shells each pass axe**, and the Deputy route renders full-bleed with no
   side nav.
6. **A panel does not render for a user lacking its entitlement** — F11's core validation.
7. **Unfilled slots emit no DOM**, and the expected empty set (including Deputy's) is asserted.
8. **`jury_admin` gets a rendered `UI_NO_WORKSPACE_ASSIGNED` page**, not a raw error.
9. **Every pre-Phase-4 nav entry is still reachable** after the registry subsumes the aggregators.
10. **Phase 2 notification deep links and Phase 3 timeline deep links still resolve unchanged.**
11. **A rule package widening portal scope past the floor is rejected at publish.**
12. **A submission lands durably** with `submitted_via = 'external_portal'` and an audit entry.
13. **Internal and portal sessions coexist**, and the portal cookie is never sent to internal routes.
14. **The `apps/portal` bundle contains no internal route definitions or internal copy.**

### Claude's Discretion

Raised during discussion but not pressed; left to planning judgment, constrained by the canonical
refs below:

- How "primary role" is determined when a user holds several.
- Whether the role→workspace map is court-configurable or fixed (fixed is the safe default).
- What happens to an open session when a role is revoked mid-session (Phase 1's immediate-revocation
  guarantee presumably governs).
- Whether a panel renders differently in-workspace (compact) versus at its standalone route (full).
- How F11's `UI_COMPONENT_UNAVAILABLE` (206) behaves per panel — note Phase 3 already solved the
  analogous problem for the timeline with a per-provider status block.
- Whether the workspace landing page is its own route or a redirect to the first panel.
- Slot ordering and layout weight; whether a slot may hold more than one panel.
- Attorney enrolment, credentialing and MFA policy in the external realm; external session timeout.
- What the attorney sees after submitting — tracking, withdrawal, outcome notification.
- How deficiency corrections reference a prior submission.
- Retention of the portal staging table.
- Whether the switcher is keyboard-reachable from the full-bleed Deputy shell.
- Responsive rules for the full-bleed variant.
- Seed content for demo attorney principals with party-of-record associations.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 4 feature requirements
- `project_specs/FRD/F11-role-specific-ui-workspaces.md` — The four workspaces and exactly what each
  composes (process steps 2–5 are the source of the slot catalogue); the entitlement-not-role
  validation; the 508 release gate; `UI_NO_WORKSPACE_ASSIGNED` and `UI_COMPONENT_UNAVAILABLE`.
- `project_specs/FRD/F12-restricted-external-attorney-portal.md` — External principal model, proposed
  submissions, read-only Speedy Trial visibility, token distinctness, party-of-record sourcing,
  designation default-deny. **Contains the three-part `[ASSUMPTION]` that must be preserved
  verbatim, and the error table Phase 4 deliberately corrects (403 → 404 for not-party-of-record).**

### Binding error and access semantics
- `project_specs/FRD/Y2-errors.md` — **Principle 3 is binding and governs the portal's denial
  semantics.** 404 on blind-discovery paths; 403 where the requester already has legitimate access
  to the parent object. Phase 1 recorded this as settled — do not re-litigate, apply it.
- `project_specs/TechArch/04-security.md` §7.6 — Existence-hiding, including that response shape and
  timing must not leak existence. Governs the portal's 404 being indistinguishable from a
  nonexistent case.
- `project_specs/TechArch/04-security.md` §7.2 — PDP invocation and session claim caching.

### Schema and API contracts (with Phase 4 deviations noted)
- `project_specs/FRD/Y0a-schema-shared.md` §Identity — `users.workspace_preference` (line 13), the
  column backing multi-role landing.
- `project_specs/FRD/Y0a-schema-shared.md` §External Portal — `external_principals` (line 324).
  **DEVIATION: Phase 4 adds a portal-local submission staging table drained by Phase 5's F15.**
- `project_specs/FRD/Y1a-api-shared.md` §UI Workspaces — `PATCH /users/me/workspace-preference`.
- `project_specs/FRD/Y1a-api-shared.md` §External Portal — `/portal/v1` base path with distinct auth
  middleware; `POST /portal/submissions`; `GET /portal/trackers/{id}/summary`.
- `project_specs/TechArch/02a-data-shared.md` — Authoritative DDL and conventions; no hard deletes;
  UTC `timestamptz`; UUIDv4.
- `project_specs/TechArch/03a-api-shared.md` — Shared service API contracts.

### Architecture and stack
- `project_specs/TechArch/05-tech-stack.md` — **Binding frontend stack**: React 18,
  `@trussworks/react-uswds`, `@uswds/uswds` 3.x, TanStack Query 5, React Router 6, Vite,
  axe-core/Pa11y CI gate.
- `project_specs/TechArch/01-components.md` — Component boundaries; which FRD features map to which
  service module.
- `project_specs/FRD/Y3-integrations.md` §Identity Provider — External IdP registration/scope,
  relevant to the separate Keycloak realm.
- `project_specs/TechArch/06-integrations.md` §9.1 — CM/ECF sync, the source of party-of-record
  associations the portal depends on.

### Acceptance criteria and traceability
- `project_specs/UserStories/Epic-11-role-specific-ui-workspaces.md` — F11 acceptance criteria.
- `project_specs/UserStories/Epic-12-restricted-external-attorney-portal.md` — F12 acceptance criteria
  (US-12.1, US-12.3).
- `project_specs/RTM-JudicialSync.md` — Requirements traceability matrix.

### UI — primary design references
- **`.planning/phases/02-platform-configuration-communication-services/02-UI-SPEC.md` — APPROVED
  design contract (status: approved, 6/6 dimensions PASS). BINDING on Phase 4's UI.** Its USWDS
  spacing scale, type tokens, colour budget, Tag foreground pairings with computed ratios, one-primary
  accent rule, copywriting contract and component inventory all apply to the workspaces and the
  portal. **Also note its finding that USWDS 3.x ships no Tabs component** (D-1) and its
  `aria-disabled` requirement for conditionally-blocked controls (D-2/D-11) — both still awaiting
  human adjudication; Phase 4 must not assume an outcome for either.
- `project_specs/UX-Mockup/Screen-04-chambers-oversight-home.md` — Judge/Chambers workspace.
- `project_specs/UX-Mockup/Screen-10-clerk-console-home.md` — Clerk Console, including the
  role-tailored side nav and the **Portfolio Snapshot card that Phase 4 declares as v2-excluded**.
- `project_specs/UX-Mockup/Screen-15-admin-dashboard-home.md` — Administrative Dashboard.
- `project_specs/UX-Mockup/Screen-19-attorney-portal-home.md` — **Primary portal reference.** `.gov`
  Banner, own header, persistent restricted-access Site Alert, party-of-record case list, submission
  form with allowlist/scan messaging, "enters standard review" disclosure.
- `project_specs/UX-Mockup/Screen-20-attorney-speedy-trial-summary.md` — Portal Speedy Trial view.
- `project_specs/UX-Mockup/Flow-08-attorney-portal-submission.md` — End-to-end submission flow.
- `project_specs/UX-Mockup/Y0-patterns.md` — Shared USWDS interaction patterns.
- `project_specs/UX-Mockup/Y2-accessibility.md` — Section 508 / WCAG 2.1 AA expectations for the
  blocking axe gate.
- `project_specs/UX-Mockup/00-overview.md` — Workspace structure and design conventions.
- **Read for boundary awareness, do NOT build in Phase 4:**
  `project_specs/UX-Mockup/Screen-00-deputy-pre-session-checklist.md`,
  `Screen-01-deputy-realtime-logging.md`, `Screen-02-deputy-session-close-reconciliation.md`
  (Phases 5–6), `Screen-03-deputy-custody-transfer.md` (v2),
  `Screen-14-portfolio-dashboards.md` (v2).

### Prior phase context (binding — do not re-litigate)
- `.planning/phases/01-core-identity-case-model-audit-security-baseline/01-CONTEXT.md` — **Read in
  full.** The ten-role catalogue; entitlements first-class and separately grantable;
  **"role existence must never imply access"**; sessions with immediate revocation; the OIDC/IdP
  abstraction explicitly sized so Phase 4 can add a separate client/audience; the generic USWDS
  shell Phase 4 evolves; the blocking axe gate; the upload pipeline the portal reuses; `Y2`
  Principle 3 recorded as settled.
- `.planning/phases/02-platform-configuration-communication-services/02-CONTEXT.md` — **Read in
  full.** `ConfigResolver` as the only config read path; configurable-with-a-hard-floor as the
  pattern Phase 4 reuses for portal scope; **notification deep links are plain application URLs
  carrying zero authority** (the reason Phase 4 does not re-parent routes); the search object-type
  registry (the pattern the slot registry follows); the three screens in the generic shell; the
  deviation and assumption registers Phase 4 appends to.
- `.planning/phases/03-workflow-aggregation-cm-ecf-sync/03-CONTEXT.md` — **Read in full.** The
  timeline provider registry (second instance of the registry pattern); **entitlement-not-role task
  ownership** (the precedent Phase 4's routing decision follows); "build the refusal, not the
  capability" for CM/ECF outbound; database-level enforcement for "never" guarantees; the five
  screens and the `phase3-nav.tsx` aggregator Phase 4 deletes; the CM/ECF adapter that sources
  party-of-record.

### Project-level governance
- `.planning/PROJECT.md` — **USWDS binding**; Section 508 non-negotiable; human-in-command; CM/ECF
  authoritative with no silent overwrite; external attorney portal has no write access to the
  official record; vision-stage source material means assumptions are flagged, not locked.
- `.planning/REQUIREMENTS.md` — v1 scope; F11/F12 rows; **F20, F22, F25, F36 explicitly v2-excluded**.
- `.planning/ROADMAP.md` — Phase 4 goal and its three success criteria.

</canonical_refs>

<code_context>
## Existing Code Insights

**The repository contains no source code.** Root holds only `README.md`, `opencode.json`,
`project_specs/` and `.planning/`. Phases 1, 2 and 3 are fully planned — 15, 16 and 18 plans
respectively — but none has executed.

Everything below is the **contract** those phases committed to, not scouted code. The researcher
**must re-scout actual Phase 1–3 output before planning** and treat any divergence as authoritative
over this document.

### Reusable assets (from Phase 1–3 plan contracts)

- **`apps/web` generic USWDS shell** (`shell/AppShell.tsx`, `shell/SideNav.tsx`, `routes.tsx`,
  `styles/uswds.scss`, `api/client.ts`, `auth/`) — Phase 4 evolves `AppShell` into the side-nav
  workspace shell and replaces `SideNav`'s content source with the registry.
- **Eleven existing screens** across Phases 1–3 — composed by reference into workspace slots, routes
  unchanged.
- **`phase3-nav.tsx`** — Phase 3's nav aggregator, **deleted** by Phase 4 with entries migrated.
- **Global ABAC guard + OPA PDP** (`01-07`) — extended with the audience/issuer pre-check.
- **OPA Rego bundle** (`01-02`, extended `02-07`, `03-02`) — Phase 4 adds portal-principal rules;
  note Phase 3 learned that a new deny rule must be composed into `decision.rego`'s `all_denials`
  union or it is inert.
- **Identity, sessions with immediate revocation, entitlement resolution** (`01-06`) — the external
  realm plugs into the same OIDC abstraction.
- **Keycloak in Compose** (`01-04`) — Phase 4 adds a second realm plus seeded attorney principals.
- **File upload pipeline** — allowlist → ClamAV → encrypted storage (`01-10`), reused by portal
  submissions.
- **Audit service and `with-audit.ts`** (`01-05`) — portal submissions emit through it.
- **`ConfigResolver`** (`02-06`) — portal scope and any Phase 4 thresholds read through it.
- **`@judicialsync/config-schema`** (`02-02`) — Phase 4 adds its policy schemas and validators here.
- **Search object-type registry** (`02-05`) and **timeline provider registry** (`03-06`) — the two
  precedents the workspace slot registry follows.
- **Deviation and assumption registers** (`docs/SPEC-DEVIATIONS.md`, `docs/ASSUMPTIONS.md`, from
  `02-12` / `03-14`) — Phase 4 appends.
- **`@judicialsync/fixtures`** (`03-04`) — shared constants package; Phase 4's portal seed data can
  live alongside.
- **CM/ECF adapter and synced party records** (`03-07`, `03-10`) — the authoritative source of
  party-of-record associations.
- **Idempotent seed** (`01-04`, extended `02-06`, `03-13`) — Phase 4 adds attorney principals with
  party-of-record associations, a sealed case the attorney is party to (for proof 4), and a
  `jury_admin` user (for proof 8).
- **Blocking axe-core CI gate** — extended to four workspaces and the portal.

### Established patterns (binding)

- Registry/inversion-of-control so later phases add rather than edit (now third use).
- Policy in Rego, never duplicated in application code; fail closed.
- Enforce "never" structurally — at the database or the guard, not by convention.
- "Build the refusal, not the capability" (now third use).
- "Write the durable record now, the consumer arrives later" (now fourth use).
- Configurable with a hard floor that tightens but never weakens (now third use).
- No stubs, no bypasses — real protocol, local backend.
- `[ASSUMPTION]` markers carried verbatim into code and docs.
- Deviating from spec is fine; deviating **silently** is not — correct the contract and register it.
- Ambiguity is a correctness bug in a judicial system.
- Named negative-path assurance suites are deliverables, not developer discretion.

### Integration points created by Phase 4

- **Workspace slot registry** — Phase 5 registers exhibit ledger and intake panels, Phase 7 the
  explain-this-date panel, Phase 8 the conference view. Declared slots exist for each.
- **Portal submission staging table** — Phase 5's F15 intake drains it.
- **Portal Speedy Trial summary endpoint** — Phase 7 registers the data source behind the existing
  access-control path.
- **Audience/issuer pre-check** — every route any later phase adds inherits portal rejection
  automatically.
- **External Keycloak realm** — future external principal types plug in here, not into the internal
  realm.
- **Two shell variants** — later phases choose by route rather than adding a third.

</code_context>

<specifics>
## Specific Ideas

- The user opted into **all seven** gray areas and chose the recommended option on **every one of the
  twenty-six questions** — the same pattern as Phases 1–3. Planning should favour structural
  correctness and provability over minimising Phase 4's size.
- **"Role selects a frame, never a capability."** The sentence that resolves the central tension
  between F11's role-based routing and Phase 1's "role existence must never imply access." Worth
  carrying into the code as a comment, not just into this document.
- **Don't build interaction machinery ahead of the interaction.** The Deputy keyboard harness was
  declined on exactly the reasoning Phase 2 used to decline fan-out — unexercised machinery tends to
  be wrong when it finally matters. The shell is structure; the keyboard model is interaction, and
  interaction needs a task.
- **Per-route, not per-user, shell selection.** Chosen because the per-user reading dead-ends a
  deputy who follows a deep link — the role most likely to be working under time pressure, stranded
  in chrome with no exit.
- **Deep links already sent are a constraint on refactoring.** The decisive argument against
  re-parenting routes: Phase 2's notification deep links are plain URLs that may already be in
  inboxes. A URL you have emailed is a contract.
- **The check order is the security control.** On the portal's 404/403 split, the ordering —
  party-of-record first, designation second — matters more than either status code, because
  reversing it leaks sealed-case existence to non-parties.
- **F12's error table is wrong and we corrected it.** Both denials as 403 lets an external party
  enumerate case identifiers. This is the one place in the system facing a population with no court
  employment, no training and no audit relationship, and it had the weakest existence-hiding in the
  spec.
- **Three states, not two.** On v2-excluded slots: "empty because v2" and "empty because Phase 5
  hasn't run" are different facts, and a coverage report that conflates them is not trustworthy.
- **`jury_admin` has nowhere to go.** Surfaced by actually mapping all ten Phase 1 roles against
  F11's four workspaces rather than assuming the four named roles were the whole population. Its only
  feature is v2-excluded, so the unmapped case is real on day one.

</specifics>

<deferred>
## Deferred Ideas

Raised or implied during discussion, deliberately out of scope for Phase 4:

- **Deputy keyboard-interaction harness** — Phase 5, designed with F17 against real offer/objection/
  ruling entry.
- **Portfolio dashboards (F25/F36)** — v2-excluded. Slot declared and tagged; Screen-10's Portfolio
  Snapshot card is accounted for in the deviation register, not built.
- **Custody access in the Deputy workspace (F20)** — v2-excluded. Slot declared and tagged.
- **Per-case authorization of a security-designated case into the portal** — F12's *"unless
  explicitly and individually authorized by the court"* escape hatch. Deferred with the
  `[ASSUMPTION]` preserved; when a court needs it, it arrives with a validated policy and a
  maker-checker flow.
- **Cross-workspace viewing** — refused in v1, but explicitly recorded as **safe to relax**, since
  entitlement gating already makes it harmless. A later phase can enable it as configuration.
- **A separate portal process** — considered and rejected as disproportionate; the global audience
  guard plus separate realm carries the boundary. Revisit if a threat model demands topological
  isolation.
- **A separate portal domain** — rejected; Phase 1 put the stack behind one TLS origin and no court
  has specified a hostname.
- **Manual clerk grant of portal association** — rejected; it would make association assertable by a
  human, contradicting F12's "not self-asserted".
- **Exhibit ledger, intake, explain-this-date and conference-view panels** — Phases 5, 7 and 8
  register into declared slots.
- **Attorney submission tracking, withdrawal, and outcome notification** — not specified for v1;
  revisit when F15 intake exists and there is a review outcome to report.
- **Court-configurable role→workspace map** — left to planning; fixed is the safe default and nobody
  has asked for it.
- **F12's three-part `[ASSUMPTION]`** (party-of-record submission scope, confirmed-calculation-only
  Speedy Trial visibility, court-configurable scope) — implemented with a floor, remains an
  assumption requiring pre-pilot stakeholder validation.
- **Security-designation default-deny `[ASSUMPTION]`** — implemented as absolute; the override
  remains unvalidated policy.

</deferred>

---

*Phase: 04-role-specific-ui-workspaces-external-attorney-portal*
*Context gathered: 2026-10-06*
