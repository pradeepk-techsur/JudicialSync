# Schema Notes — every Phase 1 departure from TechArch, and why

**Owner:** plan 01-03. Later plans that add a table or column to the `platform`
schema append a row here in the same shape; they do not rewrite existing rows.

`project_specs/TechArch/02a-data-shared.md` §5 is the source of truth for the
platform schema, and `apps/api/prisma/migrations/20260101000000_platform_schema/migration.sql`
copies it column-for-column, CHECK-for-CHECK, index-for-index. Where the
migration goes *beyond* that document it does so because a locked Phase 1
CONTEXT decision requires it, and every such case is enumerated below with the
decision that forces it.

The reason for writing this down rather than letting the diff speak: a schema
addition that nobody traced is indistinguishable, six months later, from a
requirement. Someone reading `security_designations.revoked_at` with no
explanation cannot tell whether it implements a policy, works around a bug, or
was a guess — and will preserve it either way. Each entry below is the trace
that keeps the question answerable.

---

## 1. Spec disagreements recorded, not silently resolved

### 1.1 The role catalog: nine names or ten?

| | |
|---|---|
| **Conflict** | `TechArch/02a-data-shared.md` §5.2's inline comment on `roles.role_name` lists **nine** role names and omits `ao_program_manager`. `TechArch/03a-api-shared.md` §6.1 mirrors the same nine. `FRD/Y0a-schema-shared.md` §Identity, `FRD/F00`, and the Phase 1 CONTEXT all list **ten**, including `ao_program_manager`. |
| **This is a spec defect** | Not an implementation choice. Two source documents disagree about a fact. |
| **What Phase 1 does** | Follows the FRD side: **ten** roles are seeded (plan 01-04), matching `apps/api/src/common/principal/principal.types.ts` from plan 01-01. |
| **Recorded as** | **ASM-05** in [`docs/ASSUMPTIONS.md`](./ASSUMPTIONS.md) — OPEN, requires spec reconciliation. Cheap to fix now; expensive once production role assignments exist. |

Note also that `roles.role_name` carries **no CHECK constraint**, exactly as
TechArch writes it. That is deliberate and should stay: the catalog is seeded
reference data, not a type. Adding a CHECK would turn every future role
addition into a migration and would duplicate the catalog in two places that
could then disagree — the same class of defect as ASM-05 itself.

---

## 2. Tables created beyond TechArch

Each exists because a CONTEXT decision has no home in the TechArch schema.

| Table | CONTEXT decision requiring it | Note |
|---|---|---|
| `entitlement_definitions` | *"Entitlements are first-class and grantable independently of roles."* | TechArch models roles but never gives an entitlement a record of its own. Without this table "role existence never implies access" has nothing to be true about — an entitlement would only exist as a string in policy. |
| `access_grant_requests` | *"Two-step request → approve, enforced server-side at the API layer."* | Carries a table-level `CHECK (decided_by IS NULL OR decided_by <> requested_by)`, so separation of duties is refused by PostgreSQL and not only by application code. See §4. |
| `entitlement_grants` | *"Every grant carries its own record, grantor, timestamp, and audit event."* | A grant is a historical fact with a grantor, so it is append-only except for revocation. See §4. |
| `integrity_alerts` | *"A detected break writes a persistent `integrity_alert` record … Phase 3 routes these existing records into the Exception Queue."* | Phase 1 must **not** create the F07 `exceptions` table. This is the Phase 1 record; Phase 3 routes the rows it has already written rather than starting a new history. |
| `bootstrap_state` | *"An explicit bootstrap-completion step must disable or rotate them before normal operation."* | Single-row (`id BOOLEAN PRIMARY KEY CHECK (id)`), so "has bootstrap completed?" has exactly one answer by construction. |
| `audit_chain_head` | Hash-chain correctness — see §5. | Single-row, same shape. |

### Deliberately NOT created in Phase 1

`workflow_state_defs`, `threshold_defs`, `event_mapping_defs` (Phase 2
Configuration Engine), `tasks`, `exceptions`, `notifications`, `sync_conflicts`
(Phase 3). `rule_package_versions` **is** created — table only, no publish
workflow, no version comparison, no admin surface — solely because
`security_policies.rule_package_version_id` carries a `NOT NULL` FK to it.
CONTEXT: *"Phase 2 adds rule-package versioning, the maker-checker approval
flow, and the admin UI on top of these tables."*

---

## 3. Columns added to TechArch tables

### 3.1 Provenance completion

CONTEXT: *"Full provenance fields ship in Phase 1: `source_system`,
`source_identifier`, and `locally_modified` on every sync-eligible record"* —
with the rationale that backfilling them later *"leaves pre-backfill edits with
unknowable provenance"* once real court records exist.

TechArch already carries all three on `docket_events`, two on `cases` and
`document_references`, and one on `parties`. Only the gaps are filled:

| Table | Column added |
|---|---|
| `cases` | `locally_modified BOOLEAN NOT NULL DEFAULT false` |
| `parties` | `source_identifier TEXT` |
| `parties` | `locally_modified BOOLEAN NOT NULL DEFAULT false` |
| `document_references` | `locally_modified BOOLEAN NOT NULL DEFAULT false` |

**Not added:** conflict-detection and review-queue columns. CONTEXT defers
those to Phase 3, and a column with no writer is worse than no column — it
reads as a supported feature.

### 3.2 Status columns — the transition targets "no hard deletes" needs

CONTEXT: *"No hard deletes anywhere in the case model. No `DELETE` endpoints.
Removal is always a status transition (`closed`, `superseded`, `withdrawn`)."*
`FRD/F01` states the same for proceedings specifically: *"A proceeding cannot
be deleted once it has associated exhibit or Speedy Trial activity — it may
only be marked `closed`."*

`proceedings.status` already exists in TechArch §5.3. Added:

| Table | Column added |
|---|---|
| `cases` | `status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','superseded'))` |
| `parties` | `status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn'))` |

**Soft-delete columns were explicitly rejected** by CONTEXT as *"a competing
second meaning of 'gone'."* A `deleted_at` alongside a `status` gives every
future query two different questions to ask about the same record, and reader
and writer eventually disagree about which one is authoritative. These are
lifecycle states, not deletion markers.

### 3.3 `security_designations` lifecycle — a traced departure from §5.3

**This is the most significant departure in the migration and deserves its own
reasoning.** TechArch §5.3 gives the table only
`id, object_type, object_id, designation, applied_by, applied_at`. Added:

```sql
ALTER TABLE platform.security_designations ADD COLUMN revoked_at TIMESTAMPTZ;
ALTER TABLE platform.security_designations ADD COLUMN revoked_by UUID REFERENCES users(id);
CREATE INDEX idx_security_designations_active
  ON platform.security_designations(object_type, object_id) WHERE revoked_at IS NULL;
```

**Why it is forced.** A sealing order can be lifted — that is an ordinary,
lawful event. Combine that with the two rules this phase makes structural:
`app_rw` holds no DELETE grant on any case-model table, and the table as
specified has no status column. The remaining options would be a hard delete
(forbidden by grant, and it would destroy the record of the sealing ever having
happened) or leaving the record permanently sealed (factually wrong). Neither
is acceptable, so the table needs a lifecycle.

**Why this shape.** `revoked_at`/`revoked_by` is the shape already used by
`user_roles` and `entitlement_grants`, so the posture is consistent across the
schema rather than a one-off invention. It also preserves the historical fact —
the designation *was* applied, by someone, at a time — which a status
transition to `'lifted'` would equally do but which a delete would not.

**Why in THIS migration and not a later one.** Plan 01-07's
`ResourceLoaderService` (wave 5) filters every `security_designations` read on
`revoked_at IS NULL` when assembling the PDP input, and plan 01-09 (wave 6)
writes the columns. A column introduced in either of those waves would make
every resource load fail with Postgres `42703` from wave 5 onward. The partial
index matches the loader's predicate exactly because it sits on the hot path of
every authorization decision.

### 3.4 `user_roles` traceability and revocation

CONTEXT puts role grants through the same request → approve flow as entitlement
grants, and the no-hard-delete rule applies to the grant itself:

```sql
ALTER TABLE platform.user_roles ADD COLUMN request_id UUID REFERENCES access_grant_requests(id);
ALTER TABLE platform.user_roles ADD COLUMN is_bootstrap BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE platform.user_roles ADD COLUMN revoked_at TIMESTAMPTZ;
ALTER TABLE platform.user_roles ADD COLUMN revoked_by UUID REFERENCES users(id);
```

`is_bootstrap` implements CONTEXT's *"Bootstrap grants are clearly marked as
bootstrap, fully audited, and non-self-approved"* — the marking has to live on
the grant row itself, because that is the only artifact that survives into
production data for an auditor to query.

---

## 4. The grant posture, and the rule every future migration must follow

`20260101000100_append_only_grants/migration.sql` is where Phase 1 success
criterion 3 is actually satisfied. The important property is the *order*: it
starts from `REVOKE ALL` and grants deliberately, because the opposite order is
how an accidental DELETE grant survives review.

Three tiers worth understanding:

- **Append-only (SELECT + INSERT only):** `audit_events`, `disposition_log`,
  `malware_scan_results`. These record facts about points in time.
- **Append-only except revocation (column-scoped UPDATE on
  `revoked_at`, `revoked_by` only):** `entitlement_grants`, `user_roles`,
  `security_designations`. A table-wide UPDATE here would silently permit
  retitling a sealing order or rewriting which entitlement a grant conferred —
  the column-level grant is what makes "the substance is historical, only the
  revocation is writable" true at the database rather than in a code review.
- **No DELETE anywhere.** `app_rw` holds zero DELETE privileges across the
  entire `platform` schema.

> ### Rule for every future grant migration
>
> The migration ends with a `DO $$ … RAISE EXCEPTION` block asserting that
> `app_rw` holds no DELETE grant anywhere in `platform`. **Every future
> migration that touches grants must repeat that block as its final
> statement.**
>
> This is what makes the no-DELETE rule self-enforcing rather than a convention
> someone remembers. Without it, a migration three phases from now that grants
> `ALL PRIVILEGES` on a new table would widen the posture silently and the
> failure would surface, if ever, as a missing row. With it, the deploy fails
> and names the table.
>
> One honest caveat about the block *as it appears in `…000100`*: that file
> opens with `REVOKE ALL`, so by the time the assertion runs there is nothing
> left for it to catch. It cannot fail there regardless of what preceded it.
> Its value in that file is as a **template**. Later grant migrations will not
> start from zero — they will add a grant to a live schema — and there the same
> block is a genuine gate. It is verified to fire against a deliberately
> planted DELETE grant in `apps/api/test/schema-grants.e2e-spec.ts`, so the
> control is tested rather than merely written.

`ALTER DEFAULT PRIVILEGES IN SCHEMA platform REVOKE DELETE ON TABLES FROM app_rw`
covers the same ground for tables that do not exist yet, but it is a backstop,
not a replacement: default privileges apply only to objects created by the role
that set them, so the assertion block remains the thing that actually catches
the mistake.

---

## 5. `audit_chain_head` — why the chain needs a head row

The hash chain could in principle find its previous link with
`SELECT row_hash FROM audit_events ORDER BY occurred_at DESC LIMIT 1`. It must
not. Two concurrent writers would read the same "latest" row and both chain
onto it, forking the history into two branches that each verify correctly in
isolation — exactly the condition a tamper-evidence scheme exists to rule out.
`occurred_at` is also a wall-clock value and not guaranteed to order writes.

So the chain head is a single row (`id BOOLEAN PRIMARY KEY DEFAULT true
CHECK (id)` makes a second row impossible), the trigger takes
`pg_advisory_xact_lock` before reading it, and chain advancement serialises.
The genesis `prev_hash` is 64 zeros.

**The canonical hash payload is a pinned, ordered, pipe-delimited field list**,
not `to_jsonb(NEW)`. A whole-row conversion would include `id` and `row_hash`,
and — more damaging — would silently change meaning the moment a later phase
adds a column, invalidating every historical chain at once. The field list in
`platform.compute_audit_row_hash()` is therefore frozen: **a later phase adding
a column to `audit_events` must not add it to the hash function without a
deliberate, documented chain migration.**

---

## 6. Prisma is the mirror; SQL is authoritative

`apps/api/prisma/schema.prisma` is hand-maintained to match the hand-written
migrations. **Never run `prisma migrate dev` against this project** — it would
regenerate the migration directory and drop the grants and the trigger, which
is to say it would delete the phase's central guarantee while reporting
success. Migrations are applied with `prisma migrate deploy` via `npm run
db:migrate`, which connects as `app_dba` through `MIGRATION_DATABASE_URL`.

Some SQL has no Prisma syntax and is intentionally absent from the schema file.
This is **not** drift: CHECK constraints, partial indexes
(`WHERE revoked_at IS NULL`), the grants, the hash function, and the trigger.
Each is noted in a `///` comment on the model it belongs to.

Everything Prisma *can* express is pinned to match the SQL exactly — index
names via `map:`, and referential actions as `NoAction` to match plain
PostgreSQL FKs rather than Prisma's implicit `Restrict`/`Cascade`. That pinning
is what makes the following a genuine drift gate rather than permanent noise:

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script
```

It currently prints `-- This is an empty migration.` Any later plan that
changes one side without the other will see real output here.

---

## 7. `search_path` must be pinned on every `platform` function

*Added by plan 01-05, which found this the hard way.*

Migration `20260101000300_audit_hash_search_path` fixes a latent defect in
`20260101000200`: `platform.compute_audit_row_hash` called `digest()`
unqualified. `pgcrypto` installs into `public`, and the application's
`DATABASE_URL` carries `?schema=platform`, so Prisma sets `search_path` to
`platform` alone and the name did not resolve:

```
ERROR: function digest(bytea, unknown) does not exist
```

Because the trigger fires `BEFORE INSERT` on the transactional-outbox path,
that failure rolled back the domain write with it. In production **no status
change, ruling, custody transfer or designation change could have been saved
at all** — the defect was total, not partial.

**Why 01-03's tests passed anyway.** They exercise the chain through the raw
`pg` driver, which ignores the `?schema=` parameter and leaves `search_path`
at a default that includes `public`. The application connects through Prisma,
which sets it. The harness and the application disagreed about a session
setting, and nothing on either side mentioned it, so the disagreement was
invisible. `apps/api/test/audit-write.e2e-spec.ts` now drives the write path
through Prisma specifically, so the test connects the way the application
does.

**The rule for every future migration:** a function that an application with a
pinned `search_path` will call must pin its own —

```sql
CREATE OR REPLACE FUNCTION platform.f(...) RETURNS ...
SET search_path = pg_catalog, public      -- add `platform` only if it is needed
AS $$ ... $$;
```

`pg_catalog` first prevents a caller who can create objects in an earlier
schema from shadowing a built-in the function relies on. Inheriting the
caller's `search_path` means depending on a connection string in a secrets
manager for correctness.

`20260101000300` ends with a `DO` block that calls the function under
`search_path = platform` alone and fails the deploy if it cannot resolve, so a
recurrence is caught at migrate time rather than in production.

### Error-code addendum

Codes defined by Phase 1 features beyond `FRD/Y2-errors.md`, which leaves
feature-specific codes to the feature:

| Code | Status | Owner | Meaning |
|---|---|---|---|
| `AUDIT_WRITE_DENIED` | 403 | 01-05 | `POST /api/v1/audit/events` called by anything other than a trusted internal service. `Y1a` marks the route "service-to-service only … not user-invokable", so a denial here is a category error rather than a missing entitlement — distinct from `AUDIT_READ_DENIED` (403), which means a real user lacks `audit_reader`. |

---

*Owner: plan 01-03 (§1–6) · plan 01-05 (§7) · Phase 1 — Core Identity, Case Model, Audit & Security Baseline*
