# JudicialSync — Manual Fallback & Recovery Runbook

> **Status: derived from the FRD, NOT yet validated by courtroom staff.** This
> runbook is the deliverable required by `FRD/F13` Sub-features ("Documented
> manual-fallback and recovery procedures for courtroom or integration
> disruption") and `US-13.3`. Its content — the paper-form fields, who may
> declare a fallback, and the re-entry procedure — is an implementer's reading
> of the FRD and has **not** been walked through by the people who would execute
> it under pressure. That gap is tracked as **ASM-06** in
> [`docs/ASSUMPTIONS.md`](./ASSUMPTIONS.md), which requires pilot stakeholder
> validation **and a tabletop exercise** before production. Read that assumption
> alongside this document.

`FRD/F13` Process step 6 requires these procedures be "exercised and validated
during pilot scenario testing." Section 7 is the log for those exercises.

---

## 1. Scope and triggers

A **disruption** is any condition that prevents authorized users from recording
or retrieving court information through JudicialSync. In Phase 1 the triggers
are:

| Trigger | Symptom | Section |
|---|---|---|
| API unavailable | The application does not respond, or `/api/v1/health` fails | §6 recovery |
| Identity provider (IdP) unavailable | Login fails with `503 AUTH_IDP_UNAVAILABLE` | §2 |
| Policy engine (OPA) unavailable | Every protected request returns `503 SECURITY_POLICY_UNAVAILABLE` | §3 |
| Object store unavailable | File uploads fail; existing documents cannot be retrieved | §6 recovery |
| CM/ECF adapter down | *(Phase 3 — not applicable in Phase 1; listed for completeness)* | §6 recovery |

**Who declares a disruption.** The court's designated operations lead (or, in
their absence, the senior clerk on duty) declares a fallback, records the time
of declaration, and notifies the IdP/platform operator. *Confirming the exact
authority and escalation chain is one of the three items ASM-06 flags for
courtroom-staff validation.*

The system is designed to **fail closed**: when a dependency is unavailable it
denies rather than degrading. A denial during a disruption is the control
working, not a second fault to chase.

---

## 2. Identity outage

**Symptom.** Login returns `503 AUTH_IDP_UNAVAILABLE`. Existing sessions may
continue until they expire; new sign-ins cannot be issued.

**There is deliberately no offline credential.** CONTEXT and `FRD/F00` rejected
a local dev-login / break-glass password on the reasoning that a bypass becomes
the daily-exercised path while the real control goes unproven. Authentication
depends on the court's IdP, and restoring it is the only way back in.

**Procedure.**
1. Confirm the outage: a login attempt returns `503 AUTH_IDP_UNAVAILABLE`, and
   an OIDC discovery fetch (§6) fails.
2. Escalate to the court's IdP operator with the time of first failure.
3. While the IdP is down, courtroom work continues **on paper** per §4.
4. When the IdP is restored, verify per §6 before resuming, then re-enter any
   paper-captured work per §5.

---

## 3. Policy engine (OPA) outage

**Symptom.** Authenticated requests to protected routes return
`503 SECURITY_POLICY_UNAVAILABLE`. The system denies rather than degrades — it
will **not** fall back to a permissive or cached decision, because an allow
issued by a system that cannot evaluate whether it should allow is exactly the
failure the deny-closed posture exists to prevent.

**Procedure.**
1. Confirm the OPA service state: `docker compose ps opa` and its health probe.
2. Restart the policy engine: `docker compose restart opa`, then wait for it to
   report healthy (`docker compose ps opa`).
3. Verify a protected request now succeeds for a known-entitled user.
4. If OPA will not return to health, escalate to the platform operator; paper
   fallback (§4) continues in the meantime.

---

## 4. Courtroom paper fallback

When the system is unavailable, the courtroom continues on paper and the work
is re-entered afterwards (§5). Two forms are maintained:

### 4a. Paper exhibit log sheet

Captures what the system would record for an exhibit, so nothing is lost before
re-entry. Minimum fields:

- Case number and division
- Exhibit identifier / label
- Description
- Offered by (party) and date/time offered
- Ruling (admitted / denied / reserved) and the ruling judge
- Custodian and any custody transfer, with time
- Handling clerk's name and signature

### 4b. Manual Speedy Trial worksheet

Captures the deadline-relevant facts that the Speedy Trial Tracker (Phases 7–8)
will later compute from:

- Case number and defendant
- Triggering event and its date (arrest, indictment, arraignment, …)
- Excludable periods claimed, with start/end dates and the basis for each
- The clerk's running count and the next critical date as computed by hand
- Handling clerk's name and signature

**Who holds the forms.** The courtroom deputy keeps the current blank forms and
the completed sheets until re-entry is confirmed. *Form content and custody are
the second item ASM-06 flags for validation.*

---

## 5. Re-entry procedure

Once the system is verified healthy (§6), re-enter paper-captured work through
the Phase 1 manual-entry API — the **permanent** manual fallback path, not
temporary scaffolding:

- `POST /cases` to create any case that did not already exist.
- `POST /cases/{id}/docket-events` to record docket activity captured on paper.
- Exhibit and ruling re-entry uses the same case/docket endpoints in Phase 1;
  the dedicated exhibit intake arrives with F15 (Phase 5).

**Provenance matters.** Records created this way carry `source_system='manual'`,
and any later edit sets `locally_modified`. These are not bookkeeping: when the
CM/ECF adapter arrives in Phase 3, conflict detection relies on knowing which
records were hand-entered during an outage versus synced from the authoritative
system. Entering fallback work without that provenance would make a later sync
unable to tell a deliberate manual record from a stale duplicate.

> **Deferred — do not build in Phase 1.** `US-13.3` describes an **offline draft
> buffer with automatic resync** so that work captured during an outage is
> re-applied by the system rather than re-keyed by a clerk. That capability
> belongs to **F17, Phase 5**. Phase 1 documents the paper procedure and the
> manual re-entry path above, and nothing more.

---

## 6. Recovery verification

Before declaring the system usable again, run these checks and confirm each:

1. **Stack health:** `docker compose ps` shows every service `healthy`.
2. **API liveness:** `curl -ksSf https://judicialsync.localhost:8443/api/v1/health`
   returns success.
3. **Identity:** an OIDC discovery fetch succeeds —
   `curl -ksSf https://judicialsync.localhost:8443/auth/realms/judicialsync/.well-known/openid-configuration`
   — and a known user can complete a full login (password + MFA).
4. **Authorization:** a protected request succeeds for an entitled user and is
   denied for an unentitled one (the policy engine is deciding, not failing
   closed).
5. **Audit integrity:** run the audit chain verification job (plan 01-12) and
   confirm the chain is intact end to end.
6. **Object round-trip:** upload a test document and retrieve it, confirming the
   object store and the scan pipeline are operational (Phase 1 file service,
   plan 01-10).

Only after all six pass does the operations lead rescind the fallback and
authorize re-entry (§5).

---

## 7. Exercise record

`FRD/F13` Process step 6 requires these procedures be exercised and validated.
Log each tabletop or live exercise here.

| Date | Scenario exercised | Participants | Outcome / gaps found | Follow-up |
|---|---|---|---|---|
| _(none yet — see ASM-06)_ | | | | |
