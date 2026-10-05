# Deferred items — Phase 1

Out-of-scope discoveries logged during execution. Each names the plan that
found it and the plan that should resolve it.

---

## DEF-01 (found in 01-07): the seeded `judge` cannot read the seeded sealed case

**Status:** open — fixture/intent mismatch, not a policy defect.

**What the seed believes.** `apps/api/prisma/seed/courts.ts` states its own
purpose in a header comment:

> `judge` holds `designation_sealed` and `clerk_case_admin` does not, so the
> sealed case is visible to one and denied to the other — Phase 1 success
> criterion 4, in data.

**What actually happens.** Verified against the running OPA container during
01-07:

```
judge reads sealed case  => {"allow": false, "reason_code": "AUTH_SCOPE_DENIED"}
```

**Why.** Plan 01-02's narrowing-scope semantics (`abac.rego`, and
`policy/README.md` § Scope semantics) say the case check applies only to a
principal who *holds* case-type scopes — a court-scoped principal reaches every
case in their court, and a case-scoped one is deliberately confined to the cases
named. Plan 01-04's seed gives `judge` a `case` scope row on the **plain** case
(`SEED_IDS.cases.plain`) and no row for the sealed one. That single row flips
`case_restricted` to true, which narrows the judge to exactly one case and
denies the sealed case on **scope**, before the designation layer is ever
consulted.

Both halves are individually correct and deliberate. The policy is right: a
principal scoped to specific cases should be confined to them. The seed's intent
is right: there should be a user who demonstrates that holding
`designation_sealed` unlocks a sealed record. They simply were not checked
against each other, and nothing in either plan's tests would have noticed —
01-02's Rego suite uses synthetic principals, and 01-04's seed tests assert rows
exist rather than what they authorize.

**Consequence.** The positive half of Phase 1 success criterion 4 ("a judge
holding the sealed entitlement can read the sealed case") is **not demonstrable
from the seed as it stands**. The negative halves all are, and are covered by
`abac-guard.e2e-spec.ts`.

**How 01-07 worked around it.** `abac-guard.e2e-spec.ts` inserts a case-scope
row for `judge` on the sealed case inside the test and removes it afterwards,
then asserts the 200. The test also asserts the *unscoped* judge's 403, so the
narrowing semantics stay pinned rather than being papered over — if a later
change makes a case-scoped principal reach cases they hold no scope for, that
assertion fails.

**Recommended fix (NOT taken here — `prisma/seed/**` is plan 01-04's file).**
Add a second `scope_assignments` row giving `judge` a `case` scope on
`SEED_IDS.cases.sealed`. One row, in `seed/identity.ts`'s existing
`['judge', 'law_clerk']` loop, and the fixture then demonstrates what its own
comment claims. Plan **01-14** (assurance) is the natural owner, since it is the
plan that asserts the phase's success criteria end to end and would otherwise
have to carry the same workaround.

**Do not "fix" it by removing the narrowing.** That would make every case-scoped
principal — including the Phase 4 external attorney, whose confinement to two
named cases is the entire point of `attorney_external` — reach every case in
their court.

---

## DEF-02 (found in 01-07): `INTERNAL_SERVICE_TOKEN` is not passed to the `api` container

**Status:** open — affects both internal service routes in the Compose stack.

**What happens.** Against the running stack, with the correct token from
`.env`:

```
POST /api/v1/audit/events            -> 403 AUDIT_WRITE_DENIED
POST /api/v1/security/policy-evaluate -> 403 AUDIT_WRITE_DENIED
docker compose exec api sh -c 'echo $INTERNAL_SERVICE_TOKEN'  -> (empty)
```

**Why.** `docker-compose.yml`'s `api` service lists every other secret it needs
(`OIDC_CLIENT_SECRET`, `KEYCLOAK_ADMIN_PASSWORD`, `S3_*`) but not
`INTERNAL_SERVICE_TOKEN`. `.env` declares it and `.env.example` documents it as
`[SECRET]`; the Compose service simply never forwards it. `ServiceTokenGuard`
fails closed on an unconfigured secret — deliberately, and with a loud
error-level log, because plan 01-05 reasoned that "no secret" must never mean
"no check" — so both routes deny every caller.

**Pre-existing, not introduced by 01-07.** `POST /audit/events` shipped in plan
01-05 and is affected identically; `/security/policy-evaluate` merely reuses the
same guard and so inherits it. Verified by calling both against the stack.

**Why nothing caught it.** 01-05's suite boots the app in-process with
`INTERNAL_SERVICE_TOKEN` set in the test environment, which is the right way to
test the guard's logic and cannot observe what Compose forwards. 01-07's
fail-closed suite does the same. Nothing in the phase exercises an internal
route through the deployed container, so the gap lives exactly in the space
between the two.

**Consequence.** Both internal service-to-service routes are unreachable in the
Compose deployment. No Phase 1 user-facing behaviour is affected — nothing calls
them yet — but any Phase 2+ service integration would hit a 403 whose cause is
several layers from the symptom.

**Recommended fix (NOT taken here — `docker-compose.yml` is plan 01-04's file).**
One line in the `api` service's `environment:` block, following the pattern the
other secrets already use:

```yaml
INTERNAL_SERVICE_TOKEN: ${INTERNAL_SERVICE_TOKEN:?INTERNAL_SERVICE_TOKEN must be set — copy .env.example to .env}
```

The `:?` form matches how that file already treats every other required secret
and turns a missing value into a refusal to start rather than a stack that boots
with two silently dead endpoints. Plan **01-14** (assurance) is the natural
owner, and the durable fix is a test that calls an internal route through the
deployed container rather than in-process — the gap is a *coverage* gap as much
as a configuration one.
