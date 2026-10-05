# Layer 1 — coarse-grained RBAC route gate.
#
# TechArch/04-security.md §7.2: "A request's role determines which *endpoint
# classes* are even reachable ... by route-level RBAC gate, before ABAC is even
# evaluated."
#
# This layer can ONLY deny. It never contributes to an allow decision — see
# abac.rego for why that separation is structural rather than stylistic.
package judicialsync.authz

import future.keywords.contains
import future.keywords.if
import future.keywords.in

# Endpoint classes that a purely external principal may never reach, regardless
# of any case association. Matched by prefix against input.context.route.
internal_only_route_prefixes := [
	"/api/v1/audit",
	"/api/v1/security",
	"/api/v1/retention",
	"/api/v1/entitlements",
	"/api/v1/config",
	"/api/v1/bootstrap",
]

# The nine internal roles. A principal holding any of these is court staff; a
# principal holding only attorney_external is not.
internal_role_names := {
	"judge",
	"law_clerk",
	"courtroom_deputy",
	"clerk_case_admin",
	"jury_admin",
	"court_admin",
	"ao_program_manager",
	"system_admin",
	"security_officer",
}

internal_roles_held contains name if {
	some role in input.principal.roles
	name := role.role_name
	name in internal_role_names
}

# FRD/F00 Validation: "A principal with only `attorney_external` role may never
# receive entitlements scoped to internal-only resources (ledger write,
# calculation override, audit explorer), REGARDLESS OF ANY CASE ASSOCIATION."
#
# The "regardless" is load-bearing: this rule deliberately does not consult
# input.principal.scopes, input.resource.case_id, or any entitlement. Holding
# `audit_reader` does not rescue an attorney_external principal from this gate,
# because the gate runs before entitlements are considered at all.
rbac_deny contains "AUTH_SCOPE_DENIED" if {
	some role in input.principal.roles
	role.role_name == "attorney_external"
	count(internal_roles_held) == 0
	some prefix in internal_only_route_prefixes
	startswith(input.context.route, prefix)
}

# CONTEXT: "the application reads the `amr`/`acr` claim from the assertion and
# rejects sessions where MFA was not satisfied. No dev bypass flag."
#
# Living in policy rather than in a handler means no route can forget it. Note
# the fail-closed shape: an input that omits mfa_satisfied entirely makes the
# reference undefined, `not undefined` is true, and the request is denied.
rbac_deny contains "AUTH_MFA_FAILED" if {
	not input.principal.mfa_satisfied
}
