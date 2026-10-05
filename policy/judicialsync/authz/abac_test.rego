package judicialsync.authz

import future.keywords.every
import future.keywords.if
import future.keywords.in

# ---------------------------------------------------------------------------
# Fixture builders, shared with decision_test.rego.
#
# fx_principal builds an in-scope, MFA-satisfied, internal-role principal
# holding exactly the entitlements passed in — so a test that varies only the
# entitlement list isolates the entitlement requirement from everything else.
# ---------------------------------------------------------------------------

fx_principal(entitlements) := {
	"user_id": "u-staff",
	"mfa_satisfied": true,
	"roles": [{"role_name": "clerk_case_admin", "court_id": fx_court_a, "division_id": null}],
	"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
	"entitlements": entitlements,
}

# A non-designated resource of the given type, in court A. requested_by is a
# DIFFERENT user than fx_principal's, so the separation-of-duties rule does not
# fire on the "approve" rows and this fixture isolates the entitlement check.
fx_resource(type) := {
	"type": type,
	"id": "r-1",
	"court_id": fx_court_a,
	"division_id": null,
	"case_id": null,
	"proceeding_id": null,
	"designations": [],
	"requested_by": "u-someone-else",
}

fx_input(entitlements, type, action) := {
	"principal": fx_principal(entitlements),
	"action": action,
	"resource": fx_resource(type),
	"context": {"route": "/api/v1/cases", "method": "GET"},
}

# All denial sets that layers 1 and 2 can produce.
fx_layer_denials := (rbac_deny | abac_deny) | entitlement_deny

# ---------------------------------------------------------------------------
# CONTEXT's hard constraint, stated directly: "Role existence must never imply
# access." A principal with a real role and the correct court scope, but an
# EMPTY entitlements array, is denied.
# ---------------------------------------------------------------------------

test_role_without_entitlement_denied if {
	"AUTH_SCOPE_DENIED" in entitlement_deny with input as {
		"principal": {
			"user_id": "u-jury",
			"mfa_satisfied": true,
			"roles": [{"role_name": "jury_admin", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": [],
		},
		"action": "read",
		"resource": fx_resource("case"),
		"context": {"route": "/api/v1/cases/r-1", "method": "GET"},
	}
}

# The same principal, now holding the entitlement, is not denied. Without this
# pair the test above would pass against a policy that denies everything.
test_role_with_entitlement_not_denied if {
	count(fx_layer_denials) == 0 with input as fx_input(["case_read"], "case", "read")
}

# ---------------------------------------------------------------------------
# Cross-court isolation (TechArch/00-overview.md §159).
# ---------------------------------------------------------------------------

test_cross_court_denied if {
	"AUTH_SCOPE_DENIED" in abac_deny with input as {
		"principal": {
			"user_id": "u-staff",
			"mfa_satisfied": true,
			"roles": [{"role_name": "clerk_case_admin", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": ["case_read"],
		},
		"action": "read",
		"resource": {
			"type": "case",
			"id": "r-b",
			"court_id": fx_court_b,
			"designations": [],
		},
		"context": {"route": "/api/v1/cases/r-b", "method": "GET"},
	}
}

test_same_court_not_denied if {
	count(abac_deny) == 0 with input as fx_input(["case_read"], "case", "read")
}

# Court affiliation carried on a user_roles row, rather than an explicit
# scope_assignments row, also satisfies the court check.
test_court_scope_via_user_role if {
	count(abac_deny) == 0 with input as {
		"principal": {
			"user_id": "u-judge",
			"mfa_satisfied": true,
			"roles": [{"role_name": "judge", "court_id": fx_court_a, "division_id": null}],
			"scopes": [],
			"entitlements": ["case_read"],
		},
		"action": "read",
		"resource": fx_resource("case"),
		"context": {"route": "/api/v1/cases/r-1", "method": "GET"},
	}
}

# ---------------------------------------------------------------------------
# Narrowing scopes: a principal holding case-type scopes is confined to those
# cases, while a court-scoped principal with no case rows is not.
# ---------------------------------------------------------------------------

test_case_scoped_principal_denied_other_case if {
	"AUTH_SCOPE_DENIED" in abac_deny with input as {
		"principal": {
			"user_id": "u-ext",
			"mfa_satisfied": true,
			"roles": [{"role_name": "attorney_external", "court_id": fx_court_a, "division_id": null}],
			"scopes": [
				{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null},
				{"scope_type": "case", "scope_value": fx_case_1, "scope_enum_value": null},
			],
			"entitlements": ["case_read"],
		},
		"action": "read",
		"resource": {
			"type": "case",
			"id": fx_case_2,
			"court_id": fx_court_a,
			"case_id": fx_case_2,
			"designations": [],
		},
		"context": {"route": "/api/v1/cases/bbbb", "method": "GET"},
	}
}

test_case_scoped_principal_allowed_own_case if {
	count(abac_deny) == 0 with input as {
		"principal": {
			"user_id": "u-ext",
			"mfa_satisfied": true,
			"roles": [{"role_name": "attorney_external", "court_id": fx_court_a, "division_id": null}],
			"scopes": [
				{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null},
				{"scope_type": "case", "scope_value": fx_case_1, "scope_enum_value": null},
			],
			"entitlements": ["case_read"],
		},
		"action": "read",
		"resource": {
			"type": "case",
			"id": fx_case_1,
			"court_id": fx_court_a,
			"case_id": fx_case_1,
			"designations": [],
		},
		"context": {"route": "/api/v1/cases/aaaa", "method": "GET"},
	}
}

# A court-scoped principal holding NO case-type scope rows reaches cases in
# their court. Without this, every court-scoped judge would be denied every
# case — the regression this rule shape exists to prevent.
test_court_scoped_principal_not_denied_by_case_rule if {
	count(abac_deny) == 0 with input as {
		"principal": {
			"user_id": "u-judge",
			"mfa_satisfied": true,
			"roles": [{"role_name": "judge", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": ["case_read"],
		},
		"action": "read",
		"resource": {
			"type": "case",
			"id": fx_case_1,
			"court_id": fx_court_a,
			"case_id": fx_case_1,
			"designations": [],
		},
		"context": {"route": "/api/v1/cases/aaaa", "method": "GET"},
	}
}

# ---------------------------------------------------------------------------
# Fail closed on an unmapped (type, action) pair.
# ---------------------------------------------------------------------------

# "exhibit" is a Phase 5 resource type with no Phase 1 map row.
test_unmapped_resource_type_denied if {
	"AUTH_SCOPE_DENIED" in entitlement_deny with input as fx_input(
		["case_read", "exhibit_read", "audit_reader"],
		"exhibit", "read",
	)
}

# A mapped type with an unmapped ACTION is denied too — the map is keyed on the
# pair, not the type.
test_unmapped_action_on_mapped_type_denied if {
	"AUTH_SCOPE_DENIED" in entitlement_deny with input as fx_input(["case_read", "case_update"], "case", "delete")
}

# ---------------------------------------------------------------------------
# Table-driven coverage of the whole map.
#
# One pair of table-driven tests rather than thirty-one hand-written pairs:
# these read action_entitlement_map itself, so they cannot drift from it. This
# is the test that catches the map being written against a partial route
# inventory.
# ---------------------------------------------------------------------------

# Every map row: a principal holding exactly that entitlement passes layers 1-2.
test_every_map_row_allows_with_its_entitlement if {
	every type, actions in action_entitlement_map {
		every action, entitlement in actions {
			count(fx_layer_denials) == 0 with input as fx_input([entitlement], type, action)
		}
	}
}

# Every map row: the same principal holding an unrelated entitlement is denied.
test_every_map_row_denies_without_its_entitlement if {
	every type, actions in action_entitlement_map {
		every action, _ in actions {
			"AUTH_SCOPE_DENIED" in entitlement_deny with input as fx_input(
				["some_unrelated_entitlement"],
				type, action,
			)
		}
	}
}

# ---------------------------------------------------------------------------
# The map is the route-authorization inventory. A later phase that adds a route
# and forgets its map row must fail here, loudly, at `opa test` time — rather
# than producing a silent 403 discovered in integration.
#
# expected_route_pairs is transcribed from the table in policy/README.md.
# ---------------------------------------------------------------------------

expected_route_pairs := {
	["case", "read"],
	["case", "create"],
	["case", "update"],
	["proceeding", "read"],
	["proceeding", "create"],
	["proceeding", "update"],
	["hearing", "read"],
	["hearing", "create"],
	["hearing", "update"],
	["party", "read"],
	["party", "create"],
	["party", "update"],
	["docket_event", "read"],
	["docket_event", "create"],
	["docket_event", "update"],
	["document_reference", "read"],
	["document_reference", "create"],
	["security_designation", "update"],
	["court_config", "read"],
	["audit_event", "read"],
	["audit_event", "approve"],
	["file", "upload"],
	["file", "read"],
	["retention_schedule", "read"],
	["disposition", "create"],
	["access_grant_request", "read"],
	["access_grant_request", "create"],
	["access_grant_request", "approve"],
	["entitlement_grant", "revoke"],
	["encryption_key", "read"],
	["encryption_key", "rotate"],
}

actual_map_pairs := {[type, action] |
	some type, actions in action_entitlement_map
	some action, _ in actions
}

test_map_covers_every_declared_route if {
	actual_map_pairs == expected_route_pairs
}

# The phase declares 31 (type, action) pairs across 15 resource types.
test_map_pair_count if {
	count(actual_map_pairs) == 31
}

test_map_resource_type_count if {
	count(action_entitlement_map) == 15
}
