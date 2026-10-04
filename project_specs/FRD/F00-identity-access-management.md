## F00: Identity and Access Management

**Description:** Provides authentication and fine-grained authorization for every user across both modules, combining single sign-on (SSO), multifactor authentication (MFA), and a role-based + attribute-based access control (RBAC/ABAC) model scoped by court, division, case, proceeding, party role, and security designation. This feature is the gatekeeper for every other feature in the system; no other feature may bypass it.

**Terminology:**
- **Principal:** An authenticated identity (internal court user or external attorney) recognized by the system.
- **Entitlement:** The computed set of actions a principal may perform on a given resource, derived from role + attribute evaluation at request time.
- **Scope Attributes:** The dimensions used for ABAC evaluation — court, division, case, proceeding, party-role, security-designation.
- **Privileged Administrator:** A role class (system administrator, security officer) subject to separation-of-duties controls distinct from routine operational roles.

**Sub-features:**
- SSO integration with the court's identity provider (IdP)
- Multifactor authentication enforcement
- RBAC role catalog (judge, law clerk, courtroom deputy, clerk/case administrator, attorney, jury administrator, court administrator, system administrator) — see `[ASSUMPTION]` below
- ABAC policy evaluation scoped by court/division/case/proceeding/party-role/security-designation
- Session management (timeout, concurrent-session limits, forced logout on role change)
- Privileged-action separation of duties (no single admin role may both grant itself new permissions and perform the privileged action unaudited)
- Least-privilege default (new accounts start with zero module access until explicitly role-assigned)

**`[ASSUMPTION]`:** The PRD/vision document does not resolve the full user-authority matrix (who may create/confirm/override/certify each record type). This FRD assumes a baseline role catalog (judge, law_clerk, courtroom_deputy, clerk_case_admin, attorney_external, jury_admin, court_admin, ao_program_manager, system_admin, security_officer) with per-feature authority specified in each feature chunk's Validation section, to be revisited during pilot stakeholder validation per PRD §9.3. Role-to-persona mapping (see `PERSONAS-JudicialSync.md`): `jury_admin` → PER-05 (Carla Jimenez, Jury Administrator); `court_admin`/`ao_program_manager` → PER-06 (Thomas Reyes, Court Administrator/AO Program Manager) — added during spec validation to close a gap where these roles had defined entitlements and process responsibilities (F22, F03, F09, F36) but no corresponding persona.

**Process:**
1. Principal initiates login via court-configured IdP (SAML/OIDC) — see `Y3-integrations.md` §Identity Provider.
2. System receives IdP assertion, validates signature and expiry.
3. System enforces MFA challenge if not already satisfied by the IdP assertion (configurable per court profile).
4. System resolves principal to an internal user record, loading assigned roles and scope attributes (court/division affiliations).
5. System issues a session token (short-lived access token + refresh token) carrying role and scope claims.
6. On each subsequent API request, the API gateway validates the token and evaluates ABAC policy against the requested resource's court/division/case/proceeding/party-role/security-designation before allowing the handler to execute.
7. On role or scope-attribute change (e.g., reassignment), active sessions are invalidated and the user must re-authenticate to receive updated entitlements.
8. All authentication events (success, failure, MFA challenge outcome, session termination) are emitted as audit events (see F02).

**Inputs:**
- `identity_assertion` (SAML/OIDC token, required): IdP-issued proof of authentication
- `mfa_challenge_response` (string, conditional): required when MFA is enforced
- `requested_resource_scope` (object, implicit on every API call): court_id, division_id, case_id, proceeding_id, security_designation — used for ABAC evaluation, not user-supplied

**Outputs:**
- `session_token` (JWT or equivalent, short-lived)
- `refresh_token` (long-lived, rotation-enabled)
- `entitlements` (computed role + scope claim set returned to the client for UI gating, never trusted as the sole enforcement point — server-side ABAC check is authoritative)

**Validation:**
- MFA is mandatory for all internal court-user roles; external attorney portal (F12) MFA requirement is court-configurable but defaults to required.
- A session token's scope claims must be re-validated against current role/attribute state on every privileged action (no stale-claim trust beyond a configurable short cache window, default 5 minutes).
- A principal with only `attorney_external` role may never receive entitlements scoped to internal-only resources (ledger write, calculation override, audit explorer), regardless of any case association.
- Privileged administrative roles (`system_admin`, `security_officer`) may not self-approve role-grant requests they created (separation of duties).
- Access to a case/proceeding/exhibit/tracker bearing a security designation (sealed, restricted, grand jury, juvenile) requires an explicit additional entitlement beyond the base role, configured per F03.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Invalid or expired IdP assertion | 401 | AUTH_INVALID_ASSERTION | "Authentication failed; please sign in again" |
| MFA challenge failed | 401 | AUTH_MFA_FAILED | "Multifactor verification failed" |
| Session token expired | 401 | AUTH_SESSION_EXPIRED | "Session expired; please sign in again" |
| Insufficient scope for requested resource | 403 | AUTH_SCOPE_DENIED | "You do not have access to this record" |
| Security-designation entitlement missing | 403 | AUTH_DESIGNATION_DENIED | "This record requires additional authorization" |
| Self-approval of privileged role grant attempted | 403 | AUTH_SOD_VIOLATION | "Separation-of-duties violation: cannot approve your own request" |
| IdP unavailable | 503 | AUTH_IDP_UNAVAILABLE | "Authentication service temporarily unavailable" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Identity & Access for `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/entitlements` endpoints.

**Schema Surface (this feature):** uses tables `users`, `roles`, `user_roles`, `scope_assignments`, `sessions` — see `Y0a-schema-shared.md` §Identity.
