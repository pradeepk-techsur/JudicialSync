## Epic 0: Identity and Access Management (F0)

### US-0.1: Secure SSO and MFA Login
**As a** courtroom deputy (Maria Santos), **I want to** log in through the court's SSO identity provider with multifactor authentication, **so that** I can access only the records my role permits without delaying courtroom work.

**Acceptance Criteria:**
- [ ] Login accepts a valid SAML/OIDC assertion from the court-configured IdP and rejects invalid or expired assertions with error `AUTH_INVALID_ASSERTION`
- [ ] MFA challenge is enforced for all internal roles unless already satisfied by the IdP assertion
- [ ] A successful login issues a short-lived session token plus a rotation-enabled refresh token carrying role and scope claims
- [ ] Session token scope claims are re-validated against current role/attribute state at least every 5 minutes on privileged actions
- [ ] Every login, MFA outcome, and session termination is captured as an audit event

**Priority:** P0 | **Feature Ref:** F0

---

### US-0.2: Scope Access by Court, Case, and Security Designation
**As a** system administrator (Priya Nandan), **I want to** assign roles and attribute-based scope (court/division/case/proceeding/party-role/security-designation) to each user, **so that** no one can see or act on records outside their authorized scope.

**Acceptance Criteria:**
- [ ] A new account starts with zero module access until a role is explicitly assigned (least-privilege default)
- [ ] Access to a case/proceeding/exhibit/tracker bearing a security designation (sealed, restricted, grand jury, juvenile) requires an explicit additional entitlement beyond the base role
- [ ] An `attorney_external` principal never receives entitlements scoped to internal-only resources (ledger write, calculation override, audit explorer), regardless of case association
- [ ] Insufficient scope on any resource request returns `AUTH_SCOPE_DENIED` (403) rather than partial data
- [ ] Role or scope-attribute changes invalidate active sessions, forcing re-authentication to receive updated entitlements

**Priority:** P0 | **Feature Ref:** F0

---

### US-0.3: Enforce Separation of Duties on Privileged Role Grants
**As a** system administrator (Priya Nandan), **I want to** be blocked from approving a privileged role grant I created myself, **so that** separation of duties is enforced for every privileged administrative action.

**Acceptance Criteria:**
- [ ] A `system_admin` or `security_officer` cannot self-approve a role-grant request they created, returning `AUTH_SOD_VIOLATION` (403)
- [ ] A second, distinct approver is required to finalize any privileged role grant
- [ ] All role-grant creation and approval actions are captured as audit events, including both the requester and approver identities
- [ ] IdP unavailability returns `AUTH_IDP_UNAVAILABLE` (503) rather than silently granting degraded access

**Priority:** P0 | **Feature Ref:** F0

---
