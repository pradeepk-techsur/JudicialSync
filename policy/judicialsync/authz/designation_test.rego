package judicialsync.authz

import future.keywords.every
import future.keywords.if
import future.keywords.in

# ---------------------------------------------------------------------------
# One sealed resource, used by both the 403 test and the 404 test.
#
# Using the SAME resource for both is the point: it proves the 403-vs-404
# decision is a property of the REQUESTER's existing access (Y2 principle 3),
# not a blanket property of the record.
# ---------------------------------------------------------------------------

fx_sealed_resource := {
	"type": "case",
	"id": fx_case_1,
	"court_id": fx_court_a,
	"division_id": null,
	"case_id": fx_case_1,
	"proceeding_id": null,
	"designations": ["sealed"],
	"requested_by": null,
}

fx_sealed_context := {"route": "/api/v1/cases/aaaa", "method": "GET"}

# A requester with legitimate access to the parent case: holds case_read and a
# case scope matching the resource. They can already see the case exists.
fx_requester_with_case_access(entitlements) := {
	"user_id": "u-clerk",
	"mfa_satisfied": true,
	"roles": [{"role_name": "clerk_case_admin", "court_id": fx_court_a, "division_id": null}],
	"scopes": [
		{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null},
		{"scope_type": "case", "scope_value": fx_case_1, "scope_enum_value": null},
	],
	"entitlements": entitlements,
}

# A blind-discovery requester: holds neither case_read nor a case scope.
# Nothing in their existing access tells them this case exists, so a 403 would
# itself be the leak.
fx_blind_requester(entitlements) := {
	"user_id": "u-blind",
	"mfa_satisfied": true,
	"roles": [{"role_name": "jury_admin", "court_id": fx_court_a, "division_id": null}],
	"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
	"entitlements": entitlements,
}

# ---------------------------------------------------------------------------
# The two halves of Y2 principle 3, against the same resource.
# ---------------------------------------------------------------------------

test_sealed_denied_403_when_requester_has_case_access if {
	d := decision with input as {
		"principal": fx_requester_with_case_access(["case_read"]),
		"action": "read",
		"resource": fx_sealed_resource,
		"context": fx_sealed_context,
	}

	d.allow == false
	d.reason_code == "AUTH_DESIGNATION_DENIED"
	d.hide_existence == false
}

test_sealed_denied_404_when_blind_discovery if {
	d := decision with input as {
		"principal": fx_blind_requester([]),
		"action": "read",
		"resource": fx_sealed_resource,
		"context": fx_sealed_context,
	}

	d.allow == false
	d.reason_code == "RESOURCE_NOT_FOUND"
	d.hide_existence == true
}

# A court-scoped principal holding case_read but no per-case scope rows
# legitimately reaches every case in their court, so their knowledge of the
# case is legitimate too — 403, not 404.
test_court_scoped_requester_gets_403_not_404 if {
	d := decision with input as {
		"principal": {
			"user_id": "u-judge",
			"mfa_satisfied": true,
			"roles": [{"role_name": "judge", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": ["case_read"],
		},
		"action": "read",
		"resource": fx_sealed_resource,
		"context": fx_sealed_context,
	}

	d.allow == false
	d.reason_code == "AUTH_DESIGNATION_DENIED"
	d.hide_existence == false
}

# ---------------------------------------------------------------------------
# The positive path, so the suite can distinguish "denies every sealed record"
# from "denies correctly".
# ---------------------------------------------------------------------------

test_sealed_allowed_with_entitlement if {
	d := decision with input as {
		"principal": fx_requester_with_case_access(["case_read", "designation_sealed"]),
		"action": "read",
		"resource": fx_sealed_resource,
		"context": fx_sealed_context,
	}

	d.allow == true
	d.hide_existence == false
}

# ---------------------------------------------------------------------------
# Multiple designations require ALL of them.
# ---------------------------------------------------------------------------

test_multiple_designations_requires_all if {
	d := decision with input as {
		"principal": fx_requester_with_case_access(["case_read", "designation_sealed"]),
		"action": "read",
		"resource": json.patch(fx_sealed_resource, [{
			"op": "replace",
			"path": "/designations",
			"value": ["sealed", "grand_jury"],
		}]),
		"context": fx_sealed_context,
	}

	d.allow == false
	d.reason_code == "AUTH_DESIGNATION_DENIED"
}

test_multiple_designations_allowed_with_all if {
	d := decision with input as {
		"principal": fx_requester_with_case_access([
			"case_read",
			"designation_sealed",
			"designation_grand_jury",
		]),
		"action": "read",
		"resource": json.patch(fx_sealed_resource, [{
			"op": "replace",
			"path": "/designations",
			"value": ["sealed", "grand_jury"],
		}]),
		"context": fx_sealed_context,
	}

	d.allow == true
}

# An undesignated resource is unaffected by this layer.
test_undesignated_resource_not_designation_denied if {
	not designation_deny with input as {
		"principal": fx_requester_with_case_access(["case_read"]),
		"action": "read",
		"resource": json.patch(fx_sealed_resource, [{
			"op": "replace",
			"path": "/designations",
			"value": [],
		}]),
		"context": fx_sealed_context,
	}
}

# Every built-in designation is enforced, not just `sealed`.
test_every_default_designation_enforced if {
	every designation, entitlement in default_designation_entitlement {
		fx_designation_denied_without(designation)
		fx_designation_allowed_with(designation, entitlement)
	}
}

fx_designation_denied_without(designation) if {
	designation_deny with input as {
		"principal": fx_requester_with_case_access(["case_read"]),
		"action": "read",
		"resource": json.patch(fx_sealed_resource, [{
			"op": "replace",
			"path": "/designations",
			"value": [designation],
		}]),
		"context": fx_sealed_context,
	}
}

fx_designation_allowed_with(designation, entitlement) if {
	not designation_deny with input as {
		"principal": fx_requester_with_case_access(["case_read", entitlement]),
		"action": "read",
		"resource": json.patch(fx_sealed_resource, [{
			"op": "replace",
			"path": "/designations",
			"value": [designation],
		}]),
		"context": fx_sealed_context,
	}
}

# ---------------------------------------------------------------------------
# Configuration-driven policy (FRD/F13): input.security_policies overrides the
# built-in defaults. This is the seam Phase 2's versioned configuration plugs
# into without a policy rewrite.
# ---------------------------------------------------------------------------

fx_restricted_resource := json.patch(fx_sealed_resource, [{
	"op": "replace",
	"path": "/designations",
	"value": ["restricted"],
}])

fx_override_policies := [{
	"designation": "restricted",
	"required_entitlement": "designation_restricted_v2",
}]

# Under the override, the remapped entitlement grants access...
test_security_policies_override if {
	not designation_deny with input as {
		"principal": fx_requester_with_case_access(["case_read", "designation_restricted_v2"]),
		"action": "read",
		"resource": fx_restricted_resource,
		"context": fx_sealed_context,
		"security_policies": fx_override_policies,
	}
}

# ...and the built-in default no longer does, proving the supplied set REPLACES
# the defaults rather than merging with them.
test_security_policies_override_supersedes_default if {
	designation_deny with input as {
		"principal": fx_requester_with_case_access(["case_read", "designation_restricted"]),
		"action": "read",
		"resource": fx_restricted_resource,
		"context": fx_sealed_context,
		"security_policies": fx_override_policies,
	}
}

# Fail closed: a designation absent from a supplied security_policies set maps
# to no entitlement, so it denies. A configuration that forgets a designation
# hides records; it never exposes them.
test_designation_absent_from_supplied_policies_denies if {
	designation_deny with input as {
		"principal": fx_requester_with_case_access([
			"case_read",
			"designation_sealed",
			"designation_restricted_v2",
		]),
		"action": "read",
		"resource": fx_sealed_resource, # sealed, not covered by the override set
		"context": fx_sealed_context,
		"security_policies": fx_override_policies,
	}
}

# With no security_policies supplied, the built-in defaults apply.
test_defaults_apply_when_no_policies_supplied if {
	not designation_deny with input as {
		"principal": fx_requester_with_case_access(["case_read", "designation_restricted"]),
		"action": "read",
		"resource": fx_restricted_resource,
		"context": fx_sealed_context,
	}
}
