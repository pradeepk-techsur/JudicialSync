# Open Assumptions Register

**No entry in this register may be closed by an implementer.** Closure requires
a recorded decision from the responsible stakeholder — the authority named in
the *Validation needed* column — captured in writing and referenced from the
row being closed. An implementer may add context, narrow the question, or
record what the code currently does; an implementer may not decide the
question.

This register exists because JudicialSync's source material is vision-stage.
Several decisions it depends on belong to court authorities, not to engineers,
and the `[ASSUMPTION]` markers in `FRD/F00` and `FRD/F13` mark exactly those.
The Phase 1 CONTEXT makes the handling explicit: unresolved authority decisions
must be *"preserved as explicit, marked assumptions requiring stakeholder
validation … not silently resolved by the implementer."*

The risk this guards against is specific. An implementer who needs a role
catalog to compile against will invent one, ship it, and the invention becomes
indistinguishable from a requirement six months later — at which point the
court discovers the system encodes a permissions model nobody approved. Writing
the assumption down keeps the question open and visible while still letting
Phase 1 proceed.

**Owner of this file:** plan 01-01 seeds all seven rows. Plan 01-08 refreshes
ASM-03 with the bootstrap mechanism it actually implements. No other plan edits
this file.

---

## Register

| ID | Source | Assumption | What Phase 1 built | Validation needed | Status |
|----|--------|------------|--------------------|-------------------|--------|
| **ASM-01** | `FRD/F00-identity-access-management.md` — `[ASSUMPTION]` on the role catalog | The full user-authority matrix — who may create, confirm, override, and certify each record type — is **unresolved**. The FRD lists roles but does not bind each role to an authority set. | The **10-role catalog** (`judge`, `law_clerk`, `courtroom_deputy`, `clerk_case_admin`, `attorney_external`, `jury_admin`, `court_admin`, `ao_program_manager`, `system_admin`, `security_officer`) in `apps/api/src/common/principal/principal.types.ts`, and **Phase 1 entitlements only**. Roles for which Phase 1 defines no work (e.g. `jury_admin`) exist with effectively no entitlements. | Pilot stakeholder validation per PRD §9.3. Court leadership must confirm the per-role authority matrix before production rollout. | OPEN — requires stakeholder validation |
| **ASM-02** | `FRD/F13-security-compliance-baseline.md` — `[ASSUMPTION]` on exhibit file storage | The exhibit file storage model — **store**, **reference**, or **both** — is unresolved. The choice has custody, retention, and cost consequences that differ by court. | The **reference layer** (`file_references`) plus the encryption and malware-scanning controls that apply under *either* model, so neither option is foreclosed. Built in plan 01-10. | Court records-management authority must choose the storage model. Needed before Phase 5 exhibit intake (F15) builds on this layer. | OPEN — requires stakeholder validation |
| **ASM-03** | Phase 1 CONTEXT — "Bootstrap (empty-system exception)" | The environment-supplied bootstrap identity mechanism is a **development-constraint workaround requiring security and stakeholder validation before production; it is not production bootstrap policy.** An empty system cannot satisfy the two-person approval rule, so *something* must seed the first administrator — but that necessity must not be read as a permanent exception to separation of duties. | Implemented in plan 01-08 (`apps/api/src/modules/entitlements/bootstrap.service.ts`): identities come only from `BOOTSTRAP_ADMIN_SUBJECTS` and `BOOTSTRAP_APPROVER_SUBJECTS` (never from the first authenticated user); the two lists **must be disjoint** or the application fails to start; each bootstrap grant is written through the normal `access_grant_requests` → `entitlement_grants` path with `requested_by` = an admin subject and `decided_by` = a distinct approver subject, so the table CHECK and the Rego `sod_deny` rule still hold (bootstrap supplies the second person, it does not bypass SoD); every bootstrap request and grant is marked `is_bootstrap = true` and audited with `after_state.bootstrap === true`; startup is idempotent; and `POST /api/v1/bootstrap/complete` — callable only by a normally-granted (not bootstrap-granted) `access_admin` — closes the path permanently, after which the service returns `403 BOOTSTRAP_CLOSED` and startup grants nothing. `GET /api/v1/bootstrap/status` reports whether the system is still in bootstrap mode. | Security officer and court stakeholder sign-off on the production bootstrap procedure. The mechanism must be reviewed — and most likely replaced — before production. It must not be inherited as policy by default. | OPEN — requires stakeholder validation |
| **ASM-04** | Phase 1 CONTEXT — "Role catalog and entitlements" | Role existence never implies access: a role holding no granted entitlement has none. The *principle* is settled and enforced; the **intended per-role entitlement set for Phases 2–8 is unresolved**. | Entitlements as first-class records, grantable independently of roles, with `Principal.entitlements` structurally distinct from `Principal.roles`. The invariant is proven by test in plan 01-14, not merely asserted. Phase 1 defines only Phase 1 entitlements. | Each later phase's entitlement set requires validation by the court authority owning that capability, at the time that phase is specified. | OPEN — requires stakeholder validation |
| **ASM-05** | `TechArch/02a-data-shared.md` §5.2 vs. `FRD/Y0a-schema-shared.md` §Identity | **The two source documents disagree.** TechArch §5.2's inline role-name comment (mirrored in `TechArch/03a-api-shared.md` §6.1) omits `ao_program_manager`; `FRD/Y0a-schema-shared.md` §Identity and `FRD/F00` both include it. This is a spec defect, not an implementation choice. | Phase 1 follows Y0a / FRD-F00 / CONTEXT and implements **10** roles including `ao_program_manager`. The divergence from TechArch is documented inline in `principal.types.ts` rather than silently absorbed. | Spec reconciliation: the architecture and schema documents must be brought into agreement, and the authoritative list confirmed. Cheap to fix now; expensive after role assignments exist in production data. | OPEN — requires stakeholder validation |
| **ASM-06** | `FRD/F13-security-compliance-baseline.md` Process step 6; `US-13.3` | The manual-fallback and recovery runbook is **derived from the FRD by an implementer and has not been validated by courtroom staff**. A fallback procedure that has never been walked through by the people who would execute it under pressure is an untested control. | `docs/MANUAL-FALLBACK.md` (plan 01-11), derived from the FRD's stated requirements. | Pilot stakeholder validation **and a tabletop exercise**. Three things specifically need courtroom-staff confirmation: the paper-form content, who holds authority to declare a fallback, and the re-entry procedure once systems recover. | OPEN — requires stakeholder validation |
| **ASM-07** | `TechArch/04-security.md` §7.5; ROADMAP success criterion 5 | ROADMAP criterion 5 requires that **all** data be encrypted at rest. Phase 1 can prove this for the object store but **not** for PostgreSQL. §7.5 specifies "PostgreSQL transparent data encryption (or cloud-managed disk encryption)… using keys managed by a dedicated KMS" — a property of the managed database instance and its volume, not of application code, and the IaC that would provision it is itself deferred per CONTEXT. | Object-store encryption delivered and **proven** (MinIO SSE-S3, asserted via `HeadObject` in plan 01-10). Database at-rest encryption is **deferred to the deployment substrate**; the local Compose Postgres volume is **not** encrypted. | The deployment target must satisfy database at-rest encryption before pilot, with KMS-managed keys per §7.5. `docs/ASSURANCE.md` records criterion 5 as **partially evidenced** for this reason — it is a deliberate, documented gap, not an oversight. | OPEN — requires stakeholder validation |

---

## How to close an entry

1. Obtain the decision from the authority named in *Validation needed*, in writing.
2. Record it — meeting minutes, a signed decision record, or a tracked issue with
   the stakeholder's explicit approval.
3. Replace the row's open status with `CLOSED — <date> — <decision reference>`,
   and state what was decided.
4. If the decision changes what the code does, the implementing change references
   this ID in its commit message so the trail runs both directions.

Do not delete closed rows. The register is as much a record of *what was once
uncertain* as of what is currently open — which is what makes it useful to
anyone auditing how a given behaviour came to be.

---

*Seeded by plan 01-01 (Phase 1: Core Identity, Case Model, Audit & Security Baseline).*
