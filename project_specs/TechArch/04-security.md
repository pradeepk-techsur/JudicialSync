
---

## 7. Security Architecture

JudicialSync's security architecture is built around four structural guarantees, each enforced at the lowest practical layer (database grant, middleware, or protocol) rather than by application-code discipline alone — because federal court data (sealed records, grand jury material, juvenile records, PII, and legally dispositive calculations) cannot tolerate "we trust the code wrote it right" as the sole safeguard.

### 7.1 Authentication

| Mechanism | Detail |
|---|---|
| Protocol | OIDC (preferred) or SAML 2.0, per court-selected IdP; `[ASSUMPTION per FRD F00]` — exact protocol is court-configurable, both are supported by the Identity & ABAC Module's pluggable assertion validator |
| MFA | Mandatory for all internal court-user roles; court-configurable (default: required) for the external attorney portal realm |
| Token model | Short-lived signed JWT access token (5–15 min) + longer-lived rotating refresh token; refresh tokens are stored hashed (`sessions.refresh_token_hash`), never in plaintext |
| Audience separation | Internal realm and external attorney portal realm use **distinct OIDC client IDs / SAML service-provider entity IDs**, so a portal-issued token is structurally rejected (invalid audience claim) by any internal-only endpoint, independent of any role-check bug |
| Session invalidation | Role or scope-attribute change immediately revokes active sessions (`sessions.revoked_at` set); next request forces re-authentication to pick up updated entitlements — enforced via a revocation check on every token validation, not merely token expiry |
| IdP outage handling | Fail-closed: if the IdP is unreachable, authentication fails with `503 AUTH_IDP_UNAVAILABLE`; the system never falls back to an unauthenticated or degraded-trust mode |

### 7.2 Authorization — RBAC + ABAC Enforced at the API Layer

Authorization is a two-layer model, and **both layers are evaluated server-side on every request** — client-supplied entitlement claims are advisory for UI gating only and are never trusted as the authorization decision.

**Layer 1 — RBAC (coarse-grained):** A request's role (`judge`, `law_clerk`, `courtroom_deputy`, `clerk_case_admin`, `attorney_external`, `jury_admin`, `court_admin`, `system_admin`, `security_officer`) determines which *endpoint classes* are even reachable (e.g., `attorney_external` can never reach `/audit/explorer` or any `/*/transition` write endpoint, by route-level RBAC gate, before ABAC is even evaluated).

**Layer 2 — ABAC (fine-grained):** For every request that passes the RBAC gate, a centralized **Policy Decision Point (PDP)** evaluates the requester's scope attributes (court, division, case, proceeding, party-role, security-designation) against the target resource's actual attributes, returning `allow`/`deny`. The PDP is implemented as a shared policy-evaluation service (e.g., Open Policy Agent with Rego policies, or an equivalent embedded policy engine) invoked identically by the API Gateway (coarse pre-filter) and by each of the three backend services (fine-grained, resource-specific checks that require loading the actual object's attributes).

```
Request → API Gateway → [RBAC route gate] → Service handler
                                                  │
                                                  ▼
                                   [PDP: ABAC policy-evaluate(
                                      requester_scope, resource_attributes)]
                                                  │
                                   allow ──────────┼────────── deny
                                     │                            │
                                     ▼                            ▼
                              handler executes         403 (or 404 if existence-
                              domain logic             hiding applies, e.g. sealed
                                                        case per FRD Y2 principle 3)
```

**Binding ABAC rules (directly from FRD F00/Y2, enforced in policy, not scattered across handler code):**

- A principal holding only `attorney_external` can never receive an `allow` decision for internal-only resource classes (ledger write, calculation override, audit explorer), regardless of any case association — this is a policy-level deny, not a per-endpoint check that could be missed on a new endpoint.
- Access to a security-designated object (sealed/restricted/grand_jury/juvenile) requires an explicit additional entitlement beyond the base role; absence of that entitlement against a sealed object returns `404`, not `403`, to avoid confirming the object's existence (existence-hiding, per FRD Y2 principle 3).
- `system_admin` and `security_officer` may not approve a privileged role-grant request they themselves created — enforced as a policy rule comparing `request.created_by` against `request.approved_by`, not an application-layer `if` statement that a future refactor could drop.
- Entitlement claims cached client-side (for UI gating) expire after a configurable short window (default 5 minutes) and are always re-validated server-side before any privileged action — a stale "I have access" UI state can never itself grant access.

**Separation of duties (maker-checker):** Configuration publishing (F03), role grants (F00), exhibit-config-template application (F25), and national-baseline governance changes (F37) all require a second, distinct approving user — enforced in policy as `drafted_by != approved_by`, with violations returning `403 *_SOD_VIOLATION`.

### 7.3 Audit Immutability Architecture

This is the system's accountability backbone and the single most structurally enforced guarantee in the architecture, because the PRD requires the audit trail to be suitable for appellate review — a record an appellate court could be asked to trust.

**Append-only enforcement at the database-grant level:**

```sql
-- Applied identically to audit_events, exhibit_versions, calculation_versions,
-- and confirmed_exclusions — the four tables FRD Y2 flags as immutable:
REVOKE UPDATE, DELETE ON audit_events FROM app_rw;
GRANT  SELECT, INSERT ON audit_events TO app_rw;
```

The running application's database role (`app_rw`) physically cannot issue `UPDATE` or `DELETE` against these tables — not because the ORM forbids it, but because PostgreSQL itself will reject the statement regardless of which code path generated it, including a compromised application process or an operator using the application's own credentials. Only a separate, non-application `app_dba` role can alter these tables' structure (schema migrations), and that role is never used by running request-handling code.

**Hash-chain tamper evidence:**

```
row_hash[n] = SHA-256( canonical_json(row[n] minus row_hash) || row_hash[n-1] )
```

Each `audit_events` row stores `prev_hash` (copied from the previous row's `row_hash` at write time) and its own `row_hash`. A `BEFORE INSERT` trigger recomputes the expected hash server-side and rejects the insert if the application-supplied hash doesn't match — this prevents a compromised application instance from forging a consistent-looking chain by computing hashes incorrectly or out of order. A scheduled integrity-verification job re-walks the entire chain (or an incremental window) and raises a **P0, individually-reviewed exception** (`audit_integrity_break`, FRD F02/F07) the instant any break is detected — this check is never silently logged and auto-dismissed.

**Transactional outbox for domain-write + audit-write atomicity:** Every state-changing operation on an audited object (exhibit status transition, custody transfer, calculation override, configuration change) writes its domain row and its corresponding `audit_events` row **in the same database transaction**. If the audit insert fails for any reason, the entire transaction rolls back and the domain change is never committed — "the action happened but wasn't audited" is structurally impossible, not merely discouraged.

**Audit read/write separation:** Audit read access requires a distinct `audit_reader` entitlement that is never implied by operational edit roles — a clerk with exhibit-ledger write access does not automatically gain audit-explorer read access, and vice versa. This is enforced in the ABAC policy, not by UI link-hiding.

### 7.4 Speedy Trial Calculation Immutability

The Speedy Trial clock calculation receives the same structural immutability treatment as the audit trail, because a miscalculated or silently-altered deadline is itself a legally significant failure mode (PRD success metric: "Zero instances of a prior approved Speedy Trial calculation being silently overwritten rather than versioned").

- `calculation_versions` and `confirmed_exclusions` carry the same `REVOKE UPDATE, DELETE` database-grant treatment as `audit_events` (§5.25, §5.24).
- Every recalculation — whether system-scheduled, event-driven, manually requested, or an explicit human override — **inserts a new row** with `supersedes_version_id` (or `supersedes_confirmed_exclusion_id`) pointing to the prior version; no code path updates a published calculation in place.
- The `triggering_reason` column (`scheduled | event_driven | manual | override`) distinguishes *why* a new version was created as part of the permanent record, not merely in a separate log — this is itself queryable evidence of whether a human initiated a change.
- The "explain this date" API (`GET /calculation-versions/{id}/explain`) walks `timeline_segments` to reconstruct, for any historical version, exactly which confirmed exclusions, triggering events, and rule-package version produced that specific number — including versions that have since been superseded. Nothing about a prior approved result becomes unreconstructable just because a newer version exists.
- No batch/cron identity has `INSERT` privilege with `triggering_reason = 'override'` — overrides can only originate from an authenticated human request through the Review & Approval Module (F30), which requires a mandatory rationale captured in the linked `review_actions` row.

### 7.5 Data Protection

| Control | Implementation |
|---|---|
| Encryption in transit | TLS 1.2+ enforced at the API Gateway and load balancer; internal service-to-service traffic within the private network segment also TLS-encrypted (not merely network-isolated) |
| Encryption at rest | PostgreSQL transparent data encryption (or cloud-managed disk encryption) + object store server-side encryption, both using keys managed by a dedicated KMS; application never handles raw encryption keys |
| Key management | Federal-cloud-native KMS (AWS KMS GovCloud / Azure Key Vault Government), key rotation policy, no application-embedded secrets — all credentials resolved from a secrets manager at runtime |
| Malware scanning | Every upload (`POST /files/upload`) is quarantined (`scan_status = 'pending'`) until an asynchronous scan completes; only `clean` results permit the file to be referenced by intake/custody/jury-package workflows; `infected`/`error` results are rejected and logged (`SECURITY_MALWARE_DETECTED`) |
| File-type allowlisting | Enforced server-side against a configurable allowlist per court profile, independent of client-supplied MIME type (content-sniffed, not trusted from the `Content-Type` header) |
| Sealed/restricted/grand-jury/juvenile/PII handling | Policy-driven via `security_designations`/`exhibit_designations` + `security_policies` (rule-package-scoped `required_entitlement` per designation) — never an ad hoc `if is_sealed` check scattered through handler code |
| Notification content policy | Enforced by **reviewed, approved templates**, not free-text composition — a template cannot reference defendant name, exhibit description, or sealed-case identifiers; violations are blocked pre-send (`NOTIFY_CONTENT_POLICY_VIOLATION`) rather than caught after delivery |
| Retention & disposition | `retention_schedules` (per court, per record category) drive scheduled disposition tasks (F06); disposition actions themselves are logged to the append-only `disposition_log`, never silently executed without a confirming user |

### 7.6 Existence-Hiding for Sealed Records

Per FRD Y2 principle 3, where an object's mere existence is itself sensitive (sealed cases/exhibits), an unauthorized access attempt — including via Search (F05) — returns `404 Not Found`, never `403 Forbidden`. This is implemented as a pre-ranking, mandatory access-scope filter at the search-index query layer (not a post-hoc redaction of search results), so result counts, ranking positions, and response timing cannot be used to infer the existence of a sealed matter. Every such denied/hidden attempt is itself logged as an `access_attempt` audit event.

### 7.7 Separation of Duties — Operational & Release Controls

Beyond the maker-checker patterns in §7.2, release and infrastructure controls enforce separation between those who can deploy code and those who can approve a production release:

- CI/CD pipeline requires a distinct approving reviewer for any change touching the `platform/core` audit, authorization, or calculation-engine modules, flagged automatically via CODEOWNERS-style path rules.
- Infrastructure-as-code changes to database grants (the `REVOKE UPDATE, DELETE` statements in §7.3/§7.4) are themselves version-controlled and require security-officer sign-off before merge — the immutability guarantee's own definition is protected by the same separation-of-duties discipline it enforces on the data.
- Vulnerability scanning (dependency, container image, and infrastructure) runs on every build; findings above a configured severity threshold block promotion to the pilot-production environment.
