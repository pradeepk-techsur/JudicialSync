# Phase 1 Assurance — the negative-path evidence

> **What this is.** A dedicated, separately runnable body of tests whose only job
> is to prove the guarantees Phase 1 claims **by attacking them**. The Phase 1
> CONTEXT names this a deliverable in its own right — "a dedicated negative-path
> test suite is a named Phase 1 deliverable, not left to developer discretion" —
> and closes with: "These tests are the evidence for success criteria 1, 3, 4,
> and 5." This file is the traceability matrix that maps each criterion to the
> named tests that evidence it.

## How to run it

```bash
docker compose up -d --build      # the full stack: db, redis, opa, keycloak, clamav, minio, proxy, api
npm run test:assurance -w apps/api
```

The suite is a **standalone Jest runner** (`apps/api/jest.assurance.config.js`),
separate from the fast `npm test` gate, because it is the artifact a reviewer
runs on its own to answer "is the foundation sound?". In CI it is its own
check — `.github/workflows/assurance.yml` — so a failure names the guarantee
that broke rather than just "CI".

## How it differs from the feature suites — and why that matters

Feature plans test their own happy and unhappy paths. This suite is different in
three ways that make it *evidence* rather than *more tests*:

1. **It bypasses the UI and the in-process Nest module entirely.** Every case
   issues raw HTTP against the running `api` container through the TLS proxy at
   `https://judicialsync.localhost:8443/api/v1`, exactly as an attacker on the
   network would — no `bootApp`, no supertest. See
   `apps/api/test/assurance/harness.ts`.
2. **It talks to the database as the application's own role.** Criterion 3's
   immutability proof runs raw SQL as `app_rw` through
   `apps/api/test/assurance/raw-sql-client.ts`, so no ORM behaviour can be
   mistaken for a database guarantee. Each client asserts its effective
   `current_user` on connect, so the proof cannot become a tautology.
3. **Its tokens are real.** `tokenFor` drives the real Keycloak password + TOTP
   flow and exchanges the result at the app's own `POST /auth/login`. No test
   mints a JWT — a self-signed token would prove the suite can forge
   credentials, not that the system is sound.

**Findings are recorded, not fixed in place.** This plan wrote no production
code. Where a test revealed a gap it is recorded in the plan's SUMMARY and in
the **Known gaps** section below, because a control patched by the person writing
its test has not been independently verified.

## The matrix

| Criterion | Requirement text (verbatim from ROADMAP) | Evidence (spec file · test titles) | Status |
|---|---|---|---|
| 1 | *A user can log in via SSO and complete MFA, and is granted only the access their role/court/division/case/proceeding/party-role/security-designation scope allows — an unauthorized resource request is denied server-side (403), not merely hidden in the UI.* | `criterion-1-scoped-access.assurance-spec.ts` — `criterion 1: MFA is enforced by the IdP, end to end`, `criterion 1: cross-court isolation holds in both directions`, `criterion 1: writes across the boundary are denied, not only reads`, `criterion 1: the scope dimensions below court are enforced`, `criterion 1: attorney_external is excluded from internal resources`, `criterion 1: a denial body carries no resource data`, `criterion 1: a revoked session is rejected on the next call`, `criterion 1: each denial is itself audited` | COMPLETE |
| 2 | *A clerk can create or sync a case with court/division/proceeding/parties/docket events through one shared case-context model — there is no duplicate, module-specific case representation for Evidentiary vs. Speedy Trial to later diverge from.* | **Structural — not an attackable property.** Evidenced by plan 01-09's single `CaseContextService` (the one shared case-context read surface) and the absence of any second case representation, proven by `cases-api.e2e-spec.ts` and `case-no-delete.e2e-spec.ts`. No attack is invented for it. | COMPLETE (structural) |
| 3 | *Every status change, ruling, custody transfer, override, or approval produces an immutable, hash-chained audit entry; an attempt to UPDATE or DELETE a past audit row fails at the database grant level, not merely via application convention.* | `criterion-3-audit-immutability.assurance-spec.ts` — `criterion 3: UPDATE platform.audit_events as app_rw fails with 42501`, `criterion 3: DELETE FROM platform.audit_events as app_rw fails with 42501`, `criterion 3: TRUNCATE / DISABLE TRIGGER / DROP TRIGGER as app_rw all fail`, `criterion 3: app_rw has zero DELETE privileges across platform.*`, `criterion 3: an INSERT with an incorrect hash is rejected by the trigger`, `criterion 3: a corrupted row is detected as row_hash_mismatch and left corrupted`, `criterion 3: deleting the chain tail is detected as chain_head_mismatch`, `criterion 3: audit_events.action_type accepts the later-phase producers` | COMPLETE (see Known gap on later-phase producers) |
| 4 | *A user lacking a specific security-designation entitlement (sealed/restricted/grand-jury/juvenile/PII) is denied access to a tagged record, and the denied attempt itself is logged as an audit event.* | `criterion-4-designation-denial.assurance-spec.ts` — `criterion 4: sealed case → 403 AUTH_DESIGNATION_DENIED for a parent-access requester`, `criterion 4: sealed case → 404 for a no-path requester, byte-identical to a nonexistent id`, `criterion 4: restricted case → 403 AUTH_DESIGNATION_DENIED for a parent-access requester`, `criterion 4: a role without entitlements grants nothing`, `criterion 4: with designation_sealed AND a sealed-case scope, the judge reads the sealed case`, `criterion 4: audit history for the sealed case is withheld without the designation`, `criterion 4: GET /cases omits the sealed case for the unentitled, includes it for the entitled`, `criterion 4: each designation denial produces an access_attempt audit event`, `criterion 4: changing a designation without the entitlement is denied and logged` | COMPLETE (see Known gap DEF-01 on the positive control) |
| 5 | *An uploaded file of a disallowed type or failing malware scan is rejected before storage, and all data is encrypted in transit and at rest.* | `criterion-5-upload-and-encryption.assurance-spec.ts` — `criterion 5: a disallowed-type file is rejected before storage, no scan attempted`, `criterion 5: an executable disguised as a PDF is rejected (content sniffed, not declared)`, `criterion 5: an EICAR file of an allowed type is rejected by the real scanner before storage`, `criterion 5: when the scanner is down the upload fails closed, then succeeds once it returns`, `criterion 5 (partial): object store encrypts at rest; database at-rest encryption is deferred — see ASM-07`, `criterion 5: there is no plaintext HTTP path to the API, and TLS negotiates 1.2 or higher`, `criterion 5: no response contains a store address, a presign signature, or a redirect to the store`, `criterion 5: each upload rejection leaves an audit event recording the reason` | **PARTIAL — see ASM-07** |

### What "PARTIAL — see ASM-07" means for criterion 5

All of the following are **proven here**, against the live stack:

- **rejection before storage** — a disallowed type and a header-spoofed executable
  are both refused, the bucket count is unchanged, and no `malware_scan_results`
  row is written (the allowlist runs before the scanner);
- **scanner fail-closed** — with ClamAV stopped, a clean PDF is refused `503
  SECURITY_SCANNER_UNAVAILABLE` and stored nowhere; it succeeds once the scanner
  returns, proving the scanner was the cause;
- **TLS 1.2+ in transit with no plaintext path** — plain HTTP to the TLS port is
  refused, neither `api` nor `keycloak` publishes a host port (only the proxy
  does), and TLS 1.1 is refused; and
- **object-store encryption at rest** — a stored object reports `AES256` via
  `HeadObject`.

**Database at-rest encryption is deferred to the deployment target** and is **not**
evidenced by any test in this suite. `TechArch/04-security.md` §7.5 requires
PostgreSQL transparent data encryption (or cloud-managed disk encryption) with
KMS-managed keys — a property of the managed database volume and its KMS, whose
IaC is itself deferred per CONTEXT (**ASM-07** in `docs/ASSUMPTIONS.md`). The
local Compose Postgres volume is unencrypted. Marking criterion 5 "complete"
would be the single most misleading line in the phase's output — a reviewer would
read it as "all data encrypted at rest, verified," which is not what was built.

## Known gaps

These are recorded so the phase's partial coverage is explicit rather than
implied:

1. **Later-phase audit producers (criterion 3).** The action types `ruling`,
   `custody_transfer` and `calculation_override` named in criterion 3 have **no
   Phase 1 producer** — they are written by Phases 5 and 7. The suite proves the
   `audit_events.action_type` column accepts them (it is unconstrained text; the
   vocabulary is enforced in the application layer), so the schema is ready, but
   their *producers* arrive later. Criterion 3's immutability, hash-chaining and
   detection guarantees are proven in full here for the Phase 1 producers
   (`status_change`, `security_change`, grant `approval`, file upload,
   disposition).

2. **Database at-rest encryption (criterion 5) — ASM-07.** See the criterion 5
   note above. Must be satisfied by the deployment substrate (KMS-managed keys
   per §7.5) before pilot. Cross-referenced from the criterion 5 row.

3. **DEF-01 — the judge's positive control for criterion 4.** The seeded `judge`
   holds `designation_sealed` but its only *case* scope is on the plain case
   (plan 01-04), and under plan 01-02's narrowing semantics that confines the
   judge to exactly that case — so the judge is denied the sealed case **on
   scope, before designation is ever considered**. The positive control
   (`criterion 4: with designation_sealed AND a sealed-case scope, the judge
   reads the sealed case`) therefore grants the judge a sealed-case scope
   **in-test** (as `app_dba`, cleaned up after), exactly as 01-07's guard suite
   does, so the only variable under test is the designation entitlement. This is
   a **confirmed finding**: a one-row fix in `prisma/seed/identity.ts` (give the
   judge a sealed-case scope row) would make the positive half of criterion 4
   demonstrable from the seed as shipped. It must **not** be "fixed" by removing
   the narrowing — that would let every case-scoped principal, including the
   Phase 4 external attorney, reach every case in their court.
