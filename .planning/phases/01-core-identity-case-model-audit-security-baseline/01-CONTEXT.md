# Phase 1: Core Identity, Case Model, Audit & Security Baseline - Context

**Gathered:** 2026-10-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers the trusted substrate that every later phase builds on: authenticated and
scoped access (F0), the one shared court/division/case/proceeding/hearing/party/docket-event
model (F1), the tamper-evident hash-chained audit trail and Audit Explorer (F2), and the
security/compliance baseline — encryption, malware scanning, file-type allowlist, security
designations, retention schedules (F13).

**In scope:** F0, F1, F2, F13.

**Not in scope — these belong to later phases and must not be built here:**
- Configuration Engine versioning / maker-checker / admin UI (F3 — Phase 2)
- Notifications, Search (F4, F5 — Phase 2)
- Work Queue, Exception Queue, Case Timeline, Reporting Feed, CM/ECF Adapter (F6–F10 — Phase 3)
- Role-specific USWDS workspaces, External Attorney Portal (F11, F12 — Phase 4)
- All Evidentiary Tracking and Speedy Trial features (F14+ — Phases 5–8)

The codebase is greenfield (one commit, `docs: create roadmap`, zero source files). Everything
in this phase is net-new — there are no existing components to reuse and no established code
patterns to conform to. The spec suite under `project_specs/` is the sole prior art.

</domain>

<decisions>
## Implementation Decisions

### Runnable environment

- **Docker Compose is the Phase 1 deployment target.** A single `docker-compose.yml` brings up
  PostgreSQL 15, Redis 7, OPA, Keycloak, ClamAV, and MinIO. The application runs via npm against
  that stack. Anyone must be able to clone and reach a working system with `docker compose up`.
- **Kubernetes manifests and Terraform are explicitly deferred.** TechArch's AWS GovCloud / EKS /
  Kong target is correct for production but is unbuildable and unverifiable now. Do not author
  deployment IaC in this phase. See Deferred Ideas.
- The S3-compatible object store is MinIO locally; the storage interface must be S3-compatible so
  AWS S3 GovCloud / Azure Blob Government substitute by configuration, not code change.

### Authentication and identity

- **Real OIDC against a local Keycloak container.** Keycloak acts as the stand-in court IdP with a
  seeded realm. The application uses genuine `openid-client` OIDC flows — not a stub, not a
  parallel dev-login code path. Swapping in a court's real IdP must be a configuration change.
- **No stub/bypass authentication path exists.** A second "dev login" route was explicitly rejected
  because the stub becomes the daily-exercised path and the real integration rots.
- **SAML is deferred** until a court requires it. Build the IdP integration so SAML can be added
  behind the same abstraction, but do not implement `node-saml` now.
- **MFA is real TOTP, enforced in Keycloak.** The OTP policy is enabled for internal-role users;
  the application reads the `amr`/`acr` claim from the assertion and rejects sessions where MFA was
  not satisfied. No dev bypass flag. MFA must be demonstrable end-to-end with any authenticator app.

### Authorization enforcement

- **One global NestJS guard is the authoritative enforcement point**, intercepting every request,
  building the resource scope (court / division / case / proceeding / party-role /
  security-designation), and calling the OPA container for an allow/deny decision.
- Per-route opt-in guards were rejected: a route that forgets the decorator is silently open, which
  is precisely the failure mode F00 forbids.
- **Policy logic lives in Rego in OPA, not in TypeScript.** Do not reimplement ABAC in application
  code — TechArch chose OPA specifically to prevent three independently-buggy implementations.
- **Fail closed.** If OPA is unreachable or evaluation errors, deny the request and return
  `503 SECURITY_POLICY_UNAVAILABLE` (per F13).
- Gateway/WAF-layer enforcement is additive hardening for a real deployment, not a Phase 1 concern.

### Role catalog and entitlements

- **All 10 roles are defined in Phase 1** — `judge`, `law_clerk`, `courtroom_deputy`,
  `clerk_case_admin`, `attorney_external`, `jury_admin`, `court_admin`, `ao_program_manager`,
  `system_admin`, `security_officer` — so no later phase has to migrate or renumber the role
  catalog.
- **Only Phase 1 entitlements are established.** Do not invent complete cross-phase permissions.
  A role such as `jury_admin` exists with effectively no entitlements until a later phase gives it
  something to do.
- **Unresolved authority decisions must be preserved as explicit, marked assumptions requiring
  stakeholder validation** — carried forward from the `[ASSUMPTION]` in `FRD/F00`, not silently
  resolved by the implementer.
- **Role existence must never imply access.** This is a hard constraint, and must be proven by test,
  not merely asserted in a document.
- **Least privilege is the default: a new account has zero module access** until an entitlement is
  explicitly granted.
- **Entitlements are first-class and grantable independently of roles.** A user holds roles AND zero
  or more separately granted entitlements. Every grant carries its own record, grantor, timestamp,
  and audit event. This covers at minimum `audit_reader` (F02 separation of duties),
  `case_security_admin` (F01 designation changes), and per-designation access
  (sealed / restricted / grand_jury / juvenile / PII).
- Role-bundled defaults were rejected — a default bundle silently becomes implied access.

### Grant workflow and separation of duties

- **Two-step request → approve, enforced server-side at the API layer.** A grant is a record with a
  requester and a distinct approver; the API rejects any approval where `approver == requester`
  with `403 AUTH_SOD_VIOLATION`. "The audit trail will catch it" is explicitly not sufficient — the
  API must refuse.
- Pending grants are listable via API in Phase 1 and must plug into the Work Queue in Phase 3
  without rework.

### Bootstrap (empty-system exception)

A controlled bootstrap mechanism exists **only** because an empty system cannot satisfy the
two-person approval rule. It is constrained as follows:

- Bootstrap identities come from **explicit environment-supplied identities**, and must **never** be
  derived from the first authenticated user.
- Bootstrap grants are **clearly marked as bootstrap**, fully audited, and non-self-approved.
- Bootstrap credentials are **temporary**. An explicit **bootstrap-completion step** must disable or
  rotate them before normal operation.
- The bootstrap path **must not bypass SoD for any subsequent grant**.
- This is a **Phase 1 bootstrap assumption requiring stakeholder/security validation** — it must be
  documented as such and must not be treated as permanent production policy derived from a
  development constraint.

### Phase 1 visible surface

- **A thin USWDS shell ships in Phase 1:** real Keycloak login with TOTP, a case list whose contents
  visibly differ by role/entitlement, and the Audit Explorer (F02 is genuinely a Phase 1
  deliverable, not Phase 4).
- **One generic shell — no role-specific layouts.** A single USWDS header/nav/content shell used by
  everyone; what differs by role is only *which data and nav items appear*, driven by entitlements.
- **Per-role workspace designs stay entirely in Phase 4** (Clerk Console, Deputy Interface,
  Chambers, Admin). Those are already specified in `project_specs/UX-Mockup/` and must not be
  anticipated here. Building even one role-specific view as a "proof" was explicitly rejected.
- Rationale for shipping any UI at all: it establishes the USWDS build, the generated OpenAPI
  client, and the accessibility gate early, so Phase 4 extends a working shell rather than absorbing
  the entire frontend toolchain risk.

### Proving the guarantees

- **A dedicated negative-path test suite is a named Phase 1 deliverable**, not left to developer
  discretion. It must at minimum:
  - Bypass the UI entirely and issue direct API calls with lower-privileged tokens against forbidden
    resources, asserting `403` vs `404` per `FRD/Y2-errors.md` principle 3.
  - Attempt direct SQL `UPDATE` and `DELETE` against `audit_events` **as the application database
    role**, asserting a permission error — proving criterion 3's "at the database grant level, not
    merely via application convention."
  - Assert that a role without the relevant entitlement is denied (proving "role existence must not
    imply access"), and that the denied attempt is itself logged as an `access_attempt` audit event.
  - Prove cross-court isolation using the two seeded courts.
  - Deliberately corrupt an audit row and assert the integrity job detects the chain break.
- These tests are the evidence for success criteria 1, 3, 4, and 5.

### Accessibility

- **axe-core runs in CI from Phase 1 and blocks the build on violations**, against the login, case
  list, and Audit Explorer screens. Report-only was rejected — a warning nobody must act on gets
  ignored, and PROJECT.md calls Section 508 "non-negotiable, not optional polish."

### Shared case model

- **Full manual create/read/update API for the shared model** — court, division, case, proceeding,
  hearing, party, docket event, document reference. F01 describes manual clerk entry as a permanent
  fallback ("when sync is unavailable or case predates sync"), not temporary scaffolding, so this is
  Phase 1 work independent of Phase 3's CM/ECF adapter. The Phase 3 adapter writes through this
  same model.
- **No hard deletes anywhere in the case model.** No `DELETE` endpoints. Removal is always a status
  transition (`closed`, `superseded`, `withdrawn`) emitting an audit event, and the application
  database role holds **no DELETE grant** on these tables — the same enforcement posture as the
  audit table. Soft-delete columns were rejected as a competing second meaning of "gone."
- **Full provenance fields ship in Phase 1**: `source_system`, `source_identifier`, and
  `locally_modified` on every sync-eligible record, set correctly for manual entry
  (`source_system = 'manual'`) and flipped on local edit. **Conflict detection and the human-review
  queue remain Phase 3.** Deferring the columns would force a Phase 3 migration and backfill across
  live court records, leaving pre-backfill edits with unknowable provenance.

### Seed data

- **An idempotent, re-runnable seed script ships in Phase 1**, creating:
  - **Two courts** (to make multi-tenant `court_id` isolation demonstrable), with divisions
  - Several cases including **at least one sealed and one restricted**, with parties and docket
    events
  - **One Keycloak user per role** with known credentials
- This makes success criteria 1, 2, and 4 demonstrable by clicking, and gives every downstream phase
  a scenario-complete starting point instead of each phase inventing its own fixtures.

### Audit integrity with downstream dependencies absent

- **The BullMQ hash-chain verification job is built in Phase 1.** Writing a chain but never checking
  it leaves "tamper-evident" unproven for two phases.
- A detected break writes a persistent **`integrity_alert` record**, logs at critical severity, and
  surfaces in the Audit Explorer. Log-only was rejected as too easy to miss and leaving no
  audit-visible trace of detection.
- **Phase 3 routes those existing `integrity_alert` records into the Exception Queue** — an
  addition, not a rewrite.

### File upload and malware scanning

- **The full upload pipeline is built in Phase 1 with real ClamAV in the Compose stack**:
  `/files/upload` with allowlist rejection *before* scanning is attempted, ClamAV scan, encrypted
  object storage via MinIO, and `file_references` + `malware_scan_results` rows.
- A stubbed/no-op scanner was rejected — success criterion 5 requires demonstrating that a
  disallowed-type file and a scan-failing file are both rejected *before storage*, which a stub
  cannot prove.
- Phase 5's exhibit intake (F15) calls this existing service rather than building its own.

### Configuration dependency inversion (F13 needs F3, which is Phase 2)

- **Phase 1 creates the configuration tables with seeded per-court defaults** —
  `security_policies`, `retention_schedules`, file-type allowlist, session timeout — and a read
  path. **Features must read configuration from the database from day one, never from hardcoded
  constants.**
- **Phase 2 adds rule-package versioning, the maker-checker approval flow, and the admin UI on top
  of these tables.** Pulling the whole Configuration Engine forward into Phase 1 was explicitly
  rejected as scope creep.
- Hardcoded constants were rejected: F13 states designation policy must live in the configuration
  engine and not in ad hoc code paths, and constants force revisiting every call site in Phase 2.

### Retention and disposition

- **Phase 1 ships `retention_schedules` + `disposition_log` schema, seeded defaults per record
  category, and the hard no-auto-purge guard** (`403 SECURITY_DISPOSITION_UNCONFIRMED` internal
  guard). The dangerous capability — anything auto-deleting — must be impossible from day one.
- **The scheduled sweep that generates due-for-disposition tasks waits for the Work Queue in
  Phase 3.** Building it now would only accumulate a backlog nobody can action for two phases.

### Claude's Discretion

No gray area was handed over wholesale, but the following were not discussed and are left to
research/planning judgment, constrained by the canonical refs below:

- Service decomposition for Phase 1 — whether Platform Core ships as one NestJS application or is
  already split along the three-service boundary in `TechArch/01-components.md`.
- OpenAPI contract direction (spec-first vs. code-first generation) and the client-generation
  pipeline wiring.
- Session mechanics not covered above: timeout values, concurrent-session limits, the 5-minute
  claim cache window, and session invalidation on role/scope change (`FRD/F00` process step 7).
- Encryption key management mechanics and the `security_officer` / `system_admin` key-access split
  (`FRD/F13` validation).
- Prisma migration layout, and the raw-SQL approach for hash-chain triggers and append-only
  `GRANT`/`REVOKE` management.
- Audit Explorer filter/detail UI composition within USWDS components.
- Repository/folder structure and CI pipeline composition.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Binding error and denial semantics
- `project_specs/FRD/Y2-errors.md` — Canonical HTTP status taxonomy and error codes. **Principle 3
  is binding and already resolves the 403-vs-404 question**: `404` (existence-hiding) on
  blind-discovery paths where the requester has no other legitimate path to learn the object exists;
  `403` (designation-denied) where the requester already has legitimate access to the parent
  case/object and lacks only the specific sealed/restricted entitlement. Implementers apply this
  test **per endpoint**. Do not re-litigate this.
- `project_specs/TechArch/04-security.md` §7.6 — Existence-hiding for sealed records, including the
  requirement that result counts, ranking, and response timing must not leak existence, and that
  every denied/hidden attempt is logged as an `access_attempt` audit event.

### Phase 1 feature requirements
- `project_specs/FRD/F00-identity-access-management.md` — SSO/MFA, RBAC+ABAC scope attributes,
  session management, separation of duties, least-privilege default. Contains the `[ASSUMPTION]` on
  the role catalog that must be preserved, not silently resolved.
- `project_specs/FRD/F01-core-case-docket-data-model.md` — Shared case/docket entity model,
  source-identifier preservation, security-designation tagging, no-delete-with-activity rule.
- `project_specs/FRD/F02-audit-trail-explorer.md` — Material actions, hash chain (`prev_hash` /
  `row_hash`), DB-level revocation of UPDATE/DELETE, transactional outbox, `audit_reader`
  separation of duties, integrity verification job.
- `project_specs/FRD/F13-security-compliance-baseline.md` — Encryption, malware scan gate, file-type
  allowlist, designation policy engine, retention/disposition with human confirmation, key-access
  SoD. Contains the `[ASSUMPTION]` on exhibit file storage model.

### Schema and API contracts
- `project_specs/FRD/Y0a-schema-shared.md` — §Identity (`users`, `roles`, `user_roles`,
  `scope_assignments`, `sessions`), §Case Model, §Audit (`audit_events`), §Security & Retention
  (`file_references`, `malware_scan_results`, `security_policies`, `retention_schedules`,
  `disposition_log`).
- `project_specs/FRD/Y1a-api-shared.md` — §Identity & Access (`/auth/login`, `/auth/refresh`,
  `/auth/logout`, `/auth/entitlements`), §Case & Docket Model (`/cases`, `/cases/{id}/proceedings`,
  `/cases/{id}/parties`, `/cases/{id}/docket-events`), §Audit (`/audit/events` internal,
  `/audit/explorer`), §Security Baseline (`/files/upload`, `/security/policy-evaluate`,
  `/retention/schedules`, `/retention/due-for-disposition`).
- `project_specs/TechArch/02a-data-shared.md` — Authoritative DDL for the `platform` schema. Note:
  three schemas (`platform`, `evidentiary`, `speedytrial`), UUIDv4 via `pgcrypto`, all timestamps
  UTC `timestamptz`, **no hard deletes on any table feeding the audit trail or docket-sourced
  data**, and the `locally_modified` provenance flag.
- `project_specs/TechArch/03a-api-shared.md` — Shared service API contracts.

### Architecture and stack
- `project_specs/TechArch/05-tech-stack.md` — **Binding stack**: Node 20 LTS, NestJS 10,
  TypeScript 5, Prisma 5 (raw SQL escape hatch for hash-chain triggers and grant management),
  PostgreSQL 15, OPA/Rego PDP, BullMQ/Redis 7, `zod`, `openid-client`, React 18,
  `@trussworks/react-uswds`, `@uswds/uswds` 3.x, TanStack Query 5, React Router 6, OpenAPI 3.1,
  axe-core/Pa11y CI gate.
- `project_specs/TechArch/04-security.md` — Full security architecture: §7.2 PDP invocation and the
  session short-cache window, §7.3/§7.4 append-only grants and hash chain, §7.5 encryption at rest,
  §7.6 existence-hiding, §7.7 release-pipeline SoD.
- `project_specs/TechArch/01-components.md` — Component/service decomposition and which FRD features
  map to which service module.
- `project_specs/TechArch/00-overview.md` — System overview; §159 court-level multi-tenancy by
  `court_id` enforced at the ABAC/row-level-security layer, not by physical separation.

### Acceptance criteria and traceability
- `project_specs/UserStories/Epic-00-identity-access-management.md` — F0 acceptance criteria.
- `project_specs/UserStories/Epic-01-core-case-docket-data-model.md` — F1 acceptance criteria.
- `project_specs/UserStories/Epic-02-audit-trail-explorer.md` — F2 acceptance criteria.
- `project_specs/UserStories/Epic-13-security-compliance-baseline.md` — F13 acceptance criteria.
- `project_specs/RTM-JudicialSync.md` — Requirements traceability matrix.

### UI and accessibility (for the thin shell only)
- `project_specs/UX-Mockup/Y0-patterns.md` — Shared USWDS interaction patterns.
- `project_specs/UX-Mockup/Y2-accessibility.md` — Section 508 / WCAG 2.1 AA expectations.
- `project_specs/UX-Mockup/Screen-17-audit-explorer.md` — Audit Explorer screen design.
- **Read for boundary awareness, do NOT build in Phase 1:**
  `project_specs/UX-Mockup/Screen-10-clerk-console-home.md`,
  `Screen-04-chambers-oversight-home.md`, `Screen-15-admin-dashboard-home.md`,
  `Screen-01-deputy-realtime-logging.md` — these are Phase 4 deliverables.
- U.S. Web Design System — https://designsystem.digital.gov/ (binding per PROJECT.md).

### Project-level governance
- `.planning/PROJECT.md` — Constraints: USWDS binding, human-in-command on every legally significant
  determination, CM/ECF remains authoritative with no silent overwrite, vision-stage source material
  means assumptions must be flagged rather than locked.
- `.planning/REQUIREMENTS.md` — v1 scope (28 requirements) and the traceability table.
- `.planning/ROADMAP.md` — Phase 1 goal and the five success criteria.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

**None — this is a greenfield repository.** The repo contains one commit
(`d0d7a01 docs: create roadmap`), a `README.md`, `opencode.json`, `.planning/`, and the
`project_specs/` spec suite. There are no source files, no `package.json`, no build tooling, and no
test harness.

Phase 1 therefore establishes, for the first time:
- The repository/workspace structure and `package.json` layout
- The Prisma schema and migration pipeline
- The NestJS application skeleton and module boundaries
- The OPA policy bundle and its test suite
- The React/USWDS frontend and its Sass build
- The OpenAPI contract and client generation pipeline
- The Docker Compose development stack
- The CI pipeline, including the release-blocking axe-core accessibility gate
- The seed script that every subsequent phase and UAT session depends on

### Established Patterns

No code patterns exist yet. The constraining prior art is entirely documentary:
- `TechArch/05-tech-stack.md` fixes every technology choice — treat it as binding, not advisory.
- `TechArch/01-components.md` states that NestJS module boundaries map directly onto FRD feature
  groupings; the physical codebase structure should mirror the architecture, not an ad hoc folder
  layout.
- `TechArch/02a-data-shared.md` fixes schema conventions: three PostgreSQL schemas, UUIDv4 PKs via
  `pgcrypto`, UTC `timestamptz`, no hard deletes on audit-feeding or docket-sourced tables.
- `FRD/Y2-errors.md` fixes the error taxonomy across all features — every endpoint built in this
  phase and later must conform.

### Integration Points

Phase 1 creates the seams that Phases 2–8 plug into. Build them as real extension points:
- **Configuration read path** — Phase 2's Configuration Engine adds versioning and maker-checker on
  top of the Phase 1 config tables.
- **`integrity_alert` records** — Phase 3's Exception Queue consumes these.
- **Pending grant records** — Phase 3's Work Queue surfaces these for approval.
- **Retention disposition guard** — Phase 3's Work Queue drives the sweep that feeds it.
- **Shared case-context API** — Phase 3's CM/ECF adapter writes through it; Phases 5–8 read case,
  proceeding, party, and docket-event context exclusively through it. No module may maintain a
  shadow copy.
- **`/files/upload`** — Phase 5's exhibit intake (F15) calls this service rather than building its
  own upload path.
- **Audit Service** — every state-changing feature in every later phase emits through it via the
  transactional outbox.
- **Generic USWDS shell** — Phase 4 extends it into the role-specific workspaces.
- **OIDC/IdP abstraction** — Phase 4's external attorney portal requires a structurally separate
  OIDC client/audience; the Phase 1 abstraction should not preclude that.

</code_context>

<specifics>
## Specific Ideas

- *"I want to perfectly execute the phase as it's the building block."* — The user opted into
  discussing all five gray areas and consistently chose the more rigorous option over the faster
  one. Planning should favor correctness and provability over minimizing Phase 1 size.
- **"Role existence must not imply access"** — stated by the user as a hard constraint, not a
  preference. It must be enforced structurally (separate grant records) and proven by test.
- **Assumptions must stay visible.** The user explicitly required that unresolved authority
  decisions be "preserved as explicit assumptions requiring stakeholder validation" and that the
  bootstrap mechanism "not invent permanent production policy from a development constraint." Carry
  the `[ASSUMPTION]` markers from `FRD/F00` and `FRD/F13` into the code and docs rather than quietly
  resolving them.
- **No convenience bypasses.** Dev-login stubs, MFA bypass flags, and no-op malware scanners were
  each offered and each rejected, with the consistent reasoning that the bypass becomes the
  daily-exercised path and the real control goes unproven.
- **Prefer "the API refuses" over "the audit catches it."** Chosen explicitly on the
  separation-of-duties question.
- **Build the dangerous guard first, the convenience later.** Chosen on retention: the no-auto-purge
  guard ships in Phase 1 while the task-generating sweep waits for Phase 3.

</specifics>

<deferred>
## Deferred Ideas

Raised or implied during discussion, deliberately out of scope for Phase 1:

- **Kubernetes manifests and Terraform IaC for AWS GovCloud / Azure Government** — deferred until a
  real deployment target exists. Compose is the Phase 1 target. Revisit before pilot.
- **Kong API Gateway / WAF enforcement layer** — additive hardening for a real deployment; the
  NestJS global guard is the authoritative check for now.
- **SAML IdP support (`node-saml`)** — deferred until a court requires it; the OIDC abstraction
  should not preclude it.
- **Configuration Engine versioning, maker-checker flow, and admin UI (F3)** — Phase 2. Phase 1
  ships only the tables, seeded defaults, and read path.
- **Exception Queue (F07)** — Phase 3. Phase 1 writes `integrity_alert` records for it to consume.
- **Work Queue (F06)** — Phase 3. Needed for pending-grant surfacing and the retention disposition
  sweep.
- **CM/ECF conflict detection and human-review resolution (F10)** — Phase 3. Phase 1 ships only the
  provenance fields the conflict logic will read.
- **Role-specific USWDS workspaces (F11)** — Phase 4. Already designed in `project_specs/UX-Mockup/`.
- **External attorney portal with separate OIDC client/audience (F12)** — Phase 4.
- **Full cross-phase user-authority matrix** — requires stakeholder validation per `FRD/F00`
  `[ASSUMPTION]` and PRD §9.3; not resolvable by implementation.
- **Exhibit file storage model decision (store vs. reference vs. both)** — carried forward
  unresolved from `FRD/F13` `[ASSUMPTION]`. Phase 1 builds the reference layer and the security
  controls that apply to either model.
- **Production bootstrap policy** — the Phase 1 bootstrap mechanism is a development-constraint
  workaround requiring security/stakeholder validation before production.

</deferred>

---

*Phase: 01-core-identity-case-model-audit-security-baseline*
*Context gathered: 2026-10-05*
