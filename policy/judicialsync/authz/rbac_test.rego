package judicialsync.authz

import future.keywords.every
import future.keywords.if
import future.keywords.in

# ---------------------------------------------------------------------------
# Shared test fixtures. Prefixed `fx_` so they cannot collide with rule names
# in the policy files, which share this package.
# ---------------------------------------------------------------------------

fx_court_a := "11111111-1111-1111-1111-111111111111"

fx_court_b := "22222222-2222-2222-2222-222222222222"

fx_case_1 := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

fx_case_2 := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

# ---------------------------------------------------------------------------
# The binding FRD/F00 rule: attorney_external can never reach an internal-only
# endpoint class, "regardless of any case association".
#
# This principal is deliberately given EVERY advantage short of an internal
# role: a case scope matching the resource, a court scope matching the
# resource, MFA satisfied, and the audit_reader entitlement itself. It is still
# denied — which is the proof that the RBAC gate precedes ABAC rather than
# being one more condition among many.
# ---------------------------------------------------------------------------

test_attorney_external_denied_audit_explorer_even_with_case_scope if {
	"AUTH_SCOPE_DENIED" in rbac_deny with input as {
		"principal": {
			"user_id": "u-ext",
			"mfa_satisfied": true,
			"roles": [{"role_name": "attorney_external", "court_id": fx_court_a, "division_id": null}],
			"scopes": [
				{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null},
				{"scope_type": "case", "scope_value": fx_case_1, "scope_enum_value": null},
			],
			"entitlements": ["audit_reader", "case_read"],
		},
		"action": "read",
		"resource": {
			"type": "audit_event",
			"id": "ae-1",
			"court_id": fx_court_a,
			"division_id": null,
			"case_id": fx_case_1,
			"proceeding_id": null,
			"designations": [],
			"requested_by": null,
		},
		"context": {"route": "/api/v1/audit/explorer", "method": "GET"},
	}
}

# Every internal-only prefix is gated, not just the audit one.
test_attorney_external_denied_every_internal_prefix if {
	every prefix in internal_only_route_prefixes {
		"AUTH_SCOPE_DENIED" in rbac_deny with input as {
			"principal": {
				"user_id": "u-ext",
				"mfa_satisfied": true,
				"roles": [{"role_name": "attorney_external", "court_id": fx_court_a, "division_id": null}],
				"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
				"entitlements": [],
			},
			"action": "read",
			"resource": {"type": "case", "id": "c1", "court_id": fx_court_a, "designations": []},
			"context": {"route": sprintf("%s/anything", [prefix]), "method": "GET"},
		}
	}
}

# The gate is scoped to internal-only prefixes: an external attorney reaching a
# normal case route is not denied BY THIS LAYER. (Entitlements still apply —
# that is abac.rego's job, tested separately.)
test_attorney_external_not_rbac_denied_on_case_route if {
	not "AUTH_SCOPE_DENIED" in rbac_deny with input as {
		"principal": {
			"user_id": "u-ext",
			"mfa_satisfied": true,
			"roles": [{"role_name": "attorney_external", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "case", "scope_value": fx_case_1, "scope_enum_value": null}],
			"entitlements": ["case_read"],
		},
		"action": "read",
		"resource": {"type": "case", "id": fx_case_1, "court_id": fx_court_a, "case_id": fx_case_1, "designations": []},
		"context": {"route": "/api/v1/cases/aaaa", "method": "GET"},
	}
}

# A principal who ALSO holds an internal role is not caught by the gate — the
# rule keys on holding attorney_external and nothing else.
test_dual_role_principal_not_gated if {
	not "AUTH_SCOPE_DENIED" in rbac_deny with input as {
		"principal": {
			"user_id": "u-dual",
			"mfa_satisfied": true,
			"roles": [
				{"role_name": "attorney_external", "court_id": fx_court_a, "division_id": null},
				{"role_name": "law_clerk", "court_id": fx_court_a, "division_id": null},
			],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": ["audit_reader"],
		},
		"action": "read",
		"resource": {"type": "audit_event", "id": "ae-1", "court_id": fx_court_a, "designations": []},
		"context": {"route": "/api/v1/audit/explorer", "method": "GET"},
	}
}

# ---------------------------------------------------------------------------
# MFA. CONTEXT: "No dev bypass flag."
# ---------------------------------------------------------------------------

test_mfa_not_satisfied_denied if {
	"AUTH_MFA_FAILED" in rbac_deny with input as {
		"principal": {
			"user_id": "u-judge",
			"mfa_satisfied": false,
			"roles": [{"role_name": "judge", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": ["case_read"],
		},
		"action": "read",
		"resource": {"type": "case", "id": "c1", "court_id": fx_court_a, "designations": []},
		"context": {"route": "/api/v1/cases/c1", "method": "GET"},
	}
}

# Fail closed: an input that omits mfa_satisfied entirely is treated as
# "MFA not satisfied", not as "unknown, therefore fine".
test_mfa_absent_denied if {
	"AUTH_MFA_FAILED" in rbac_deny with input as {
		"principal": {
			"user_id": "u-judge",
			"roles": [{"role_name": "judge", "court_id": fx_court_a, "division_id": null}],
			"scopes": [],
			"entitlements": ["case_read"],
		},
		"action": "read",
		"resource": {"type": "case", "id": "c1", "court_id": fx_court_a, "designations": []},
		"context": {"route": "/api/v1/cases/c1", "method": "GET"},
	}
}

test_mfa_satisfied_not_denied if {
	not "AUTH_MFA_FAILED" in rbac_deny with input as {
		"principal": {
			"user_id": "u-judge",
			"mfa_satisfied": true,
			"roles": [{"role_name": "judge", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": ["case_read"],
		},
		"action": "read",
		"resource": {"type": "case", "id": "c1", "court_id": fx_court_a, "designations": []},
		"context": {"route": "/api/v1/cases/c1", "method": "GET"},
	}
}

# An internal principal on an internal route with MFA satisfied passes layer 1
# cleanly — so the suite can distinguish "denies everything" from "denies
# correctly".
test_internal_role_passes_rbac_gate if {
	count(rbac_deny) == 0 with input as {
		"principal": {
			"user_id": "u-sec",
			"mfa_satisfied": true,
			"roles": [{"role_name": "security_officer", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": ["audit_reader"],
		},
		"action": "read",
		"resource": {"type": "audit_event", "id": "ae-1", "court_id": fx_court_a, "designations": []},
		"context": {"route": "/api/v1/audit/explorer", "method": "GET"},
	}
}
