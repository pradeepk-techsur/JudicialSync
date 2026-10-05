# JudicialSync Authorization Policy (`judicialsync.authz`)

This directory is the system's **single authorization brain**. Every access decision in
JudicialSync is made here, in Rego, evaluated by OPA — not in TypeScript.

> `TechArch/04-security.md` §7.2 requires the binding ABAC rules be "enforced in policy, not
> scattered across handler code," and §8.5 adds that policy is "written once and versioned like
> code, with its own test suite." The Phase 1 CONTEXT states it more bluntly: *"Policy logic lives
> in Rego in OPA, not in TypeScript. Do not reimplement ABAC in application code — TechArch chose
> OPA specifically to prevent three independently-buggy implementations."*

## Ownership — read this before adding a route

**`policy/**` is owned by plan 01-02.** A later plan that adds a route needing a new
`(resource.type, action)` pair must have the row added **here**, together with its test, rather
than editing the bundle from that plan. The map below is the authoritative route-authorization
inventory, and an unmapped pair is **denied**, not allowed (see *Fail closed*). A missing row is
therefore a silent 403 on a route that was supposed to work.

## Layout

| File | Role |
|---|---|
| `judicialsync/authz/decision.rego` | The single entry point. Composes every layer into one `{allow, reason_code, hide_existence}` document. |
| `judicialsync/authz/rbac.rego` | Layer 1 — coarse route gate (`attorney_external` exclusion, MFA). Can only **deny**. |
| `judicialsync/authz/abac.rego` | Layer 2 — scope matching (court/division/case/proceeding) and the `action_entitlement_map` requirement. |
| `judicialsync/authz/designation.rego` | Sealed / restricted / grand-jury / juvenile / PII rules, and the Y2 principle 3 403-vs-404 decision. |
| `judicialsync/authz/sod.rego` | Separation of duties — `requested_by != approved_by`. |
| `*_test.rego` | The unit suite. Run with `scripts/opa-test.sh`. |

All files share the package `judicialsync.authz`.

## Running the tests

```bash
scripts/opa-test.sh
```

The script bootstraps OPA **0.64.1** (matching the `openpolicyagent/opa:0.64.1-static` pin in the
Compose stack) into `.tools/`, then runs `opa check` followed by `opa test -v`. It exits non-zero on
any failure. `.github/workflows/policy.yml` runs it on every push and pull request.

## The contract

The API guard (plan 01-07) calls exactly one path:

```
POST /v1/data/judicialsync/authz/decision
```

### Input

```jsonc
{
  "principal": {
    "user_id": "string",
    "mfa_satisfied": true,
    "roles": [
      { "role_name": "string", "court_id": "uuid|null", "division_id": "uuid|null" }
    ],
    "scopes": [
      { "scope_type": "court|division|case|proceeding|party_role|security_designation",
        "scope_value": "uuid|null",
        "scope_enum_value": "string|null" }
    ],
    "entitlements": ["string"]
  },
  "action": "read|create|update|approve|upload|revoke|rotate",
  "resource": {
    "type": "string",
    "id": "string|null",
    "court_id": "uuid|null",
    "division_id": "uuid|null",
    "case_id": "uuid|null",
    "proceeding_id": "uuid|null",
    "designations": ["sealed|restricted|grand_jury|juvenile|pii"],
    "requested_by": "string|null"
  },
  "context": { "route": "string", "method": "string" },

  // Optional. When present, overrides the built-in designation→entitlement
  // defaults. Supplied from the `security_policies` table by plan 01-11.
  "security_policies": [
    { "designation": "string", "required_entitlement": "string" }
  ]
}
```

### Output

```jsonc
{
  "allow": false,
  "reason_code": "AUTH_SOD_VIOLATION | AUTH_DESIGNATION_DENIED | AUTH_MFA_FAILED | AUTH_SCOPE_DENIED | RESOURCE_NOT_FOUND | \"\"",
  "hide_existence": false
}
```

`reason_code` is `""` exactly when `allow` is `true`.

The guard maps `RESOURCE_NOT_FOUND` to the **per-resource** 404 code for the route it is protecting
(`CASE_NOT_FOUND`, `AUDIT_NOT_FOUND`, …). The policy deliberately does not know those per-resource
codes.

### Reason precedence

Most specific wins, so the client receives the most actionable code:

```
AUTH_SOD_VIOLATION  >  AUTH_DESIGNATION_DENIED  >  AUTH_MFA_FAILED  >  AUTH_SCOPE_DENIED
```

`hide_existence` outranks all of them: when it is true the decision reports `RESOURCE_NOT_FOUND`
regardless of what else also denied the request, so the error code cannot vary by denial cause and
leak the existence of a sealed matter through the difference.

## Fail closed

`decision.rego` declares `default decision := {"allow": false, ...}`. This is the Rego-level
expression of `FRD/Y2-errors.md` principle 1 (*"Fail closed, not open"*): a malformed, partial or
empty input produces a **deny**, never an undefined result the guard might misread as allow.

Three structural fail-closed properties, each asserted by a named test:

1. **Empty / malformed input denies** — `test_default_is_deny_on_empty_input`,
   `test_default_is_deny_on_malformed_input`.
2. **An unmapped `(resource.type, action)` pair denies** — a resource type introduced in a later
   phase without a map row is denied, not allowed (`test_unmapped_resource_type_denied`).
3. **Role existence never implies access** — the only thing that can satisfy the entitlement
   requirement is membership in `principal.entitlements`. Nothing in this bundle derives an
   entitlement from a role; roles can only *deny* (the RBAC gate) or *scope* (court/division
   affiliation). Asserted by `test_role_without_entitlement_denied`.

## The action → entitlement map

Defined in `abac.rego` as `action_entitlement_map`. **31 pairs across 15 resource types.** Every row
corresponds to at least one real route; every `@Resource()` descriptor declared in plans 01-08
through 01-12 corresponds to a row here.

| resource.type | action | required entitlement | route(s) that declare it (plan) |
|---|---|---|---|
| `case` | `read` | `case_read` | `GET /cases`, `GET /cases/{id}` (01-09) |
| `case` | `create` | `case_create` | `POST /cases` (01-09) |
| `case` | `update` | `case_update` | `PATCH /cases/{id}/status` (01-09) |
| `proceeding` | `read` | `case_read` | `GET /cases/{id}/proceedings` (01-09) |
| `proceeding` | `create` | `case_update` | `POST /cases/{id}/proceedings` (01-09) |
| `proceeding` | `update` | `case_update` | `PATCH /cases/{id}/proceedings/{pid}/status` (01-09) |
| `hearing` | `read` | `case_read` | `GET …/proceedings/{pid}/hearings` (01-09) |
| `hearing` | `create` | `case_update` | `POST …/proceedings/{pid}/hearings` (01-09) |
| `hearing` | `update` | `case_update` | `PATCH …/hearings/{hid}` (01-09) |
| `party` | `read` | `case_read` | `GET /cases/{id}/parties` (01-09) |
| `party` | `create` | `case_update` | `POST /cases/{id}/parties` (01-09) |
| `party` | `update` | `case_update` | `PATCH /cases/{id}/parties/{pid}/status` (01-09) |
| `docket_event` | `read` | `case_read` | `GET /cases/{id}/docket-events` (01-09) |
| `docket_event` | `create` | `case_update` | `POST /cases/{id}/docket-events` (01-09) |
| `docket_event` | `update` | `case_update` | `PATCH /cases/{id}/docket-events/{eid}` (01-09) |
| `document_reference` | `read` | `case_read` | `GET /cases/{id}/document-references` (01-09) |
| `document_reference` | `create` | `case_update` | `POST /cases/{id}/document-references` (01-09) |
| `security_designation` | `update` | `case_security_admin` | `PATCH /cases/{id}/security-designations` (01-09) |
| `court_config` | `read` | `case_read` | `GET /config/court-profiles/{court_id}`, `GET /config/rule-packages/{court_id}/effective` (01-11) |
| `audit_event` | `read` | `audit_reader` | `GET /audit/explorer`, `GET /audit/integrity/status`, `GET /audit/integrity/alerts` (01-12) |
| `audit_event` | `approve` | `audit_reader` | `POST /audit/integrity/verify` (01-12) |
| `file` | `upload` | `file_upload` | `POST /files/upload` (01-10) |
| `file` | `read` | `case_read` | `GET /files/{id}`, `GET /files/{id}/content` (01-10) |
| `retention_schedule` | `read` | `retention_viewer` | `GET /retention/schedules`, `GET /retention/due-for-disposition` (01-11) |
| `disposition` | `create` | `disposition_confirm` | `POST /retention/dispositions` (01-11) |
| `access_grant_request` | `read` | `access_admin` | `GET /entitlements/requests`, `GET /entitlements/catalog` (01-08) |
| `access_grant_request` | `create` | `access_admin` | `POST /entitlements/requests` (01-08) |
| `access_grant_request` | `approve` | `access_admin` | `POST /entitlements/requests/{id}/approve`, `…/deny`, `POST /bootstrap/complete` (01-08) |
| `entitlement_grant` | `revoke` | `access_admin` | `POST /entitlements/grants/{id}/revoke` (01-08) |
| `encryption_key` | `read` | `key_custodian` | `GET /security/keys/status` (01-11) |
| `encryption_key` | `rotate` | `key_custodian` | `POST /security/keys/rotate` (01-11) |

`test_map_covers_every_declared_route` asserts this table and the map agree exactly. A route added
without its row fails that test at `opa test` time instead of 403-ing silently in integration.

### Four rows that encode a decision rather than a mechanical mapping

- **`access_grant_request` / `approve` covers deny as well as approve.** The `sod_deny` rule keys on
  `action == "approve"`, and separation of duties must bind a requester quietly **denying** their own
  request exactly as it binds them approving it. Giving `deny` the same action value is what makes
  one rule cover both; a separate `deny` action would silently escape it.
- **`entitlement_grant` / `revoke` is its own type and action.** Revocation targets a materialized
  grant, not the request that produced it, and is deliberately single-step — removing access is not
  the dangerous direction, so no second approver is required and SoD must not fire.
- **`file` / `read` requires `case_read`, not `file_upload`.** Uploading and reading back a
  security-controlled artifact are different authorities; `file_upload` must not imply the ability to
  read everything others uploaded.
- **`disposition` / `create` requires `disposition_confirm`**, a distinct entitlement seeded in plan
  01-04 and granted only to `court_admin` and `system_admin`. Confirming the disposition of a court
  record is materially more dangerous than viewing a retention schedule, so it must not ride along on
  `retention_viewer`.

### Routes that deliberately carry no `@Resource()` descriptor

These correctly have **no** map row:

| Route | Why |
|---|---|
| `GET /health`, `POST /auth/login`, `POST /auth/mfa-challenge`, `POST /auth/refresh`, `GET /auth/authorize-url`, `GET /api/v1/openapi.json`, Swagger UI mount | `@Public()` — reachable before a principal exists |
| `POST /auth/logout`, `GET /auth/entitlements`, `GET /bootstrap/status` | `@SelfScoped()` — operate on the caller's own session, no external resource |
| `POST /audit/events`, `POST /security/policy-evaluate` | `@Public()` with respect to the session guards; narrowed by `ServiceTokenGuard` instead |

## Scope semantics

Scope assignments express a **granularity**, not a checklist:

- The **court** check is unconditional. `court_id` is the multi-tenancy boundary
  (`TechArch/00-overview.md` §159 — *"court-level multi-tenancy by `court_id` enforced at the ABAC
  layer, not by physical separation"*). Every principal is affiliated to at least one court, so an
  unmatched `court_id` is always a cross-tenant request. Affiliation may come from a
  `scope_assignments` row **or** a `user_roles` row carrying `court_id`.
- The **division / case / proceeding** checks apply only to a principal who actually holds scopes of
  that type. A court-scoped judge holding no per-case rows reaches every case in their court; an
  external attorney scoped to two specific cases is confined to those two. Without this, every
  court-scoped judge would be denied every case in their own court.
- A `null` resource `court_id` (a court-independent resource) does **not** auto-pass the court check
  — it makes the check *inapplicable*, which is a different thing. Nothing sets `in_court_scope`
  true for such a resource.

## Designations and the 403-vs-404 decision

`FRD/Y2-errors.md` principle 3 is **binding and already resolves this question** — it is encoded in
`designation.rego` so no handler re-decides it per endpoint:

- **404 (existence-hiding)** on *blind-discovery* paths — the requester has no other access path that
  already confirms the object exists. Returning 403 would itself leak the existence of a sealed
  matter.
- **403 (designation-denied)** where the requester already holds general, legitimate access to the
  parent case and is missing only the *specific* sealed / restricted / grand-jury / juvenile
  entitlement. The object's existence is already known to them, so 403 leaks nothing and is more
  actionable.

The discriminator is `has_parent_case_access`: the requester holds `case_read`, the resource carries
a `case_id`, and the requester is in scope for that case.

`designation_test.rego` proves the decision is context-dependent rather than a blanket rule by
asserting both outcomes **against the same resource**, varying only the requester.

### Designation policy is configuration-driven

`FRD/F13` requires designation policy live in the configuration engine, "not ad hoc code paths". The
built-in defaults are:

| designation | required entitlement |
|---|---|
| `sealed` | `designation_sealed` |
| `restricted` | `designation_restricted` |
| `grand_jury` | `designation_grand_jury` |
| `juvenile` | `designation_juvenile` |
| `pii` | `designation_pii` |

When `input.security_policies` is supplied (from the Phase 1 `security_policies` table, read by plan
01-11), it is preferred over these defaults **as a whole** — the supplied set replaces the built-in
map rather than merging with it, so a policy row can genuinely change a mapping. This is the seam
Phase 2's versioned configuration plugs into without a policy rewrite.

Note the fail-closed consequence: a designation present on a resource but **absent** from a supplied
`security_policies` set maps to no entitlement no principal can hold, and therefore denies.

## Separation of duties

```rego
sod_deny contains "AUTH_SOD_VIOLATION" if {
	input.action == "approve"
	input.resource.requested_by != null
	input.resource.requested_by == input.principal.user_id
}
```

`TechArch/04-security.md` §7.2 requires this be "a policy rule comparing `request.created_by` against
`request.approved_by`, **not an application-layer `if` statement that a future refactor could
drop**." CONTEXT reinforces: *"Prefer 'the API refuses' over 'the audit catches it'."*

The rule is deliberately **resource-type-agnostic** — it keys off `action == "approve"` and the
presence of `resource.requested_by`, nothing else. Phase 2's configuration publish (F03,
`drafted_by != approved_by`) and Phase 5's template application (F25) reuse it with no policy change;
they need only populate `requested_by`.
