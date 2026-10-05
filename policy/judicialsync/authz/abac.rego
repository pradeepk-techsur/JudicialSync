# Layer 2 — fine-grained ABAC scope evaluation and the entitlement requirement.
#
# TechArch/04-security.md §7.2: the PDP "evaluates the requester's scope
# attributes (court, division, case, proceeding, party-role,
# security-designation) against the target resource's actual attributes."
package judicialsync.authz

import future.keywords.contains
import future.keywords.if
import future.keywords.in

# ---------------------------------------------------------------------------
# Resource field accessors — each is UNDEFINED when the resource does not carry
# that field, or carries it as an explicit null (a court-independent resource,
# a case-independent resource, ...). Downstream deny rules reference these, so
# "the resource has no case_id" makes the case deny rule simply not apply,
# rather than comparing against null and producing a nonsense result.
#
# A null resource.court_id does NOT auto-pass the court check. It makes the
# court check inapplicable, which is a different thing: nothing in this file
# ever sets in_court_scope true for such a resource.
# ---------------------------------------------------------------------------

scoped_resource_court_id := id if {
	id := input.resource.court_id
	id != null
}

scoped_resource_division_id := id if {
	id := input.resource.division_id
	id != null
}

scoped_resource_case_id := id if {
	id := input.resource.case_id
	id != null
}

scoped_resource_proceeding_id := id if {
	id := input.resource.proceeding_id
	id != null
}

# ---------------------------------------------------------------------------
# Scope matching. A principal may be affiliated to a court/division either
# through an explicit scope_assignments row (input.principal.scopes) or through
# a user_roles row that carries court_id/division_id (FRD/Y0a-schema-shared.md
# §Identity). Both are honored.
# ---------------------------------------------------------------------------

in_court_scope if {
	some s in input.principal.scopes
	s.scope_type == "court"
	s.scope_value == scoped_resource_court_id
}

in_court_scope if {
	some role in input.principal.roles
	role.court_id == scoped_resource_court_id
}

in_division_scope if {
	some s in input.principal.scopes
	s.scope_type == "division"
	s.scope_value == scoped_resource_division_id
}

in_division_scope if {
	some role in input.principal.roles
	role.division_id == scoped_resource_division_id
}

in_case_scope if {
	some s in input.principal.scopes
	s.scope_type == "case"
	s.scope_value == scoped_resource_case_id
}

in_proceeding_scope if {
	some s in input.principal.scopes
	s.scope_type == "proceeding"
	s.scope_value == scoped_resource_proceeding_id
}

# ---------------------------------------------------------------------------
# Narrowing scopes.
#
# Scope assignments express a GRANULARITY, not a checklist. A principal scoped
# at court level legitimately reaches every case in that court and holds no
# per-case rows; a principal scoped to specific cases is deliberately narrowed
# to those cases. So the division/case/proceeding checks apply only to a
# principal who actually holds scopes of that type — otherwise a court-scoped
# judge would be denied every case in their own court.
#
# The COURT check is different and is unconditional: court_id is the
# multi-tenancy boundary (TechArch/00-overview.md §159, "court-level
# multi-tenancy by court_id enforced at the ABAC layer, not by physical
# separation"). Every principal is affiliated to at least one court, so an
# unmatched court_id is always a cross-tenant request.
# ---------------------------------------------------------------------------

division_restricted if {
	some s in input.principal.scopes
	s.scope_type == "division"
}

case_restricted if {
	some s in input.principal.scopes
	s.scope_type == "case"
}

proceeding_restricted if {
	some s in input.principal.scopes
	s.scope_type == "proceeding"
}

# Cross-court isolation. Phase 1's negative-path suite proves this with two
# seeded courts.
abac_deny contains "AUTH_SCOPE_DENIED" if {
	scoped_resource_court_id
	not in_court_scope
}

abac_deny contains "AUTH_SCOPE_DENIED" if {
	scoped_resource_division_id
	division_restricted
	not in_division_scope
}

abac_deny contains "AUTH_SCOPE_DENIED" if {
	scoped_resource_case_id
	case_restricted
	not in_case_scope
}

abac_deny contains "AUTH_SCOPE_DENIED" if {
	scoped_resource_proceeding_id
	proceeding_restricted
	not in_proceeding_scope
}

# ---------------------------------------------------------------------------
# Role existence must never imply access.
#
# CONTEXT states this as a hard constraint, not a preference, and requires it
# be proven by test rather than asserted in a document. It is encoded
# STRUCTURALLY here: the only thing that can satisfy the entitlement
# requirement is a membership test against input.principal.entitlements.
# Nothing in this bundle derives an entitlement from a role. Roles can only
# ever deny (rbac.rego) or scope (above).
# ---------------------------------------------------------------------------

# The authoritative Phase 1 route-authorization inventory. Every row
# corresponds to at least one real route declared in plans 01-08..01-12, and
# every @Resource() descriptor in the phase corresponds to a row here. See
# policy/README.md for the route column and the four decision notes.
#
# Adding a resource type or action WITHOUT a row here denies it — see
# entitlement_deny's second rule. That is deliberate: fail closed.
action_entitlement_map := {
	"case": {
		"read": "case_read",
		"create": "case_create",
		"update": "case_update",
	},
	"proceeding": {
		"read": "case_read",
		"create": "case_update",
		"update": "case_update",
	},
	"hearing": {
		"read": "case_read",
		"create": "case_update",
		"update": "case_update",
	},
	"party": {
		"read": "case_read",
		"create": "case_update",
		"update": "case_update",
	},
	"docket_event": {
		"read": "case_read",
		"create": "case_update",
		"update": "case_update",
	},
	"document_reference": {
		"read": "case_read",
		"create": "case_update",
	},
	"security_designation": {"update": "case_security_admin"},
	"court_config": {"read": "case_read"},

	# F02 separation of duties: audit read is never implied by an operational
	# edit role (TechArch §7.3, "Audit read/write separation").
	"audit_event": {
		"read": "audit_reader",
		"approve": "audit_reader",
	},

	# file/read requires case_read, NOT file_upload: uploading and reading back
	# a security-controlled artifact are different authorities.
	"file": {
		"upload": "file_upload",
		"read": "case_read",
	},
	"retention_schedule": {"read": "retention_viewer"},

	# disposition/create is gated on its own entitlement, not retention_viewer:
	# confirming the disposition of a court record is materially more dangerous
	# than viewing a schedule.
	"disposition": {"create": "disposition_confirm"},

	# "approve" covers deny as well as approve, so sod.rego's single
	# action == "approve" rule binds a requester quietly denying their own
	# request exactly as it binds them approving it.
	"access_grant_request": {
		"read": "access_admin",
		"create": "access_admin",
		"approve": "access_admin",
	},

	# Revocation targets a materialized grant, not the request that produced
	# it, and is deliberately single-step — removing access is not the
	# dangerous direction, so SoD must not fire on it.
	"entitlement_grant": {"revoke": "access_admin"},
	"encryption_key": {
		"read": "key_custodian",
		"rotate": "key_custodian",
	},
}

required_entitlement := action_entitlement_map[input.resource.type][input.action]

holds_required_entitlement if {
	some e in input.principal.entitlements
	e == required_entitlement
}

# The principal is missing the entitlement this (type, action) pair requires.
entitlement_deny contains "AUTH_SCOPE_DENIED" if {
	required_entitlement
	not holds_required_entitlement
}

# Fail closed on an unmapped (resource.type, action) pair. A new resource type
# added in a later phase without a map entry is DENIED, not allowed.
entitlement_deny contains "AUTH_SCOPE_DENIED" if {
	not required_entitlement
}
