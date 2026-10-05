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
