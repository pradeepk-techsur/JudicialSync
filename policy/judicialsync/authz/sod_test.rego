package judicialsync.authz

import future.keywords.every
import future.keywords.if
import future.keywords.in

fx_approver(user_id) := {
	"user_id": user_id,
	"mfa_satisfied": true,
	"roles": [{"role_name": "system_admin", "court_id": fx_court_a, "division_id": null}],
	"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
	"entitlements": ["access_admin"],
}

fx_grant_request(requested_by) := {
	"type": "access_grant_request",
	"id": "gr-1",
	"court_id": fx_court_a,
	"division_id": null,
	"case_id": null,
	"proceeding_id": null,
	"designations": [],
	"requested_by": requested_by,
}

fx_approve_input(user_id, requested_by) := {
	"principal": fx_approver(user_id),
	"action": "approve",
	"resource": fx_grant_request(requested_by),
	"context": {"route": "/api/v1/entitlements/requests/gr-1/approve", "method": "POST"},
}

# ---------------------------------------------------------------------------
# The core rule: you may not approve what you requested.
# ---------------------------------------------------------------------------

test_self_approval_denied if {
	"AUTH_SOD_VIOLATION" in sod_deny with input as fx_approve_input("u-admin", "u-admin")
}

test_self_approval_decision_reports_sod_violation if {
	d := decision with input as fx_approve_input("u-admin", "u-admin")
	d.allow == false
	d.reason_code == "AUTH_SOD_VIOLATION"
}

# A distinct approver is exactly what the two-person rule requires, so this
# must succeed — otherwise the rule would block the legitimate path too.
test_distinct_approver_allowed if {
	d := decision with input as fx_approve_input("u-approver", "u-requester")
	d.allow == true
}

test_distinct_approver_not_sod_denied if {
	count(sod_deny) == 0 with input as fx_approve_input("u-approver", "u-requester")
}

# ---------------------------------------------------------------------------
# Scope of the rule.
# ---------------------------------------------------------------------------

# A null requested_by (a resource that carries no requester) cannot violate SoD.
test_null_requested_by_not_denied if {
	count(sod_deny) == 0 with input as fx_approve_input("u-admin", null)
}

# The rule is specific to approvals. The same principal CREATING their own
# request is the normal path and must not be blocked.
test_create_own_request_not_denied if {
	count(sod_deny) == 0 with input as {
		"principal": fx_approver("u-admin"),
		"action": "create",
		"resource": fx_grant_request("u-admin"),
		"context": {"route": "/api/v1/entitlements/requests", "method": "POST"},
	}
}

# Revocation is deliberately single-step — removing access is not the dangerous
# direction — so SoD must not fire even when requester and actor coincide.
# This is why `entitlement_grant`/`revoke` is a distinct action in the map.
test_revoke_own_grant_not_sod_denied if {
	count(sod_deny) == 0 with input as {
		"principal": fx_approver("u-admin"),
		"action": "revoke",
		"resource": {
			"type": "entitlement_grant",
			"id": "eg-1",
			"court_id": fx_court_a,
			"designations": [],
			"requested_by": "u-admin",
		},
		"context": {"route": "/api/v1/entitlements/grants/eg-1/revoke", "method": "POST"},
	}
}

# ---------------------------------------------------------------------------
# Resource-type agnosticism. The rule names no resource type, so later phases
# reuse it by populating `requested_by` and nothing more.
#
# These two stand in for Phase 2's F03 configuration publish
# (drafted_by != approved_by) and Phase 5's F25 template application.
# ---------------------------------------------------------------------------

test_rule_is_resource_type_agnostic if {
	every future_type in ["configuration_version", "exhibit_config_template", "national_baseline"] {
		"AUTH_SOD_VIOLATION" in sod_deny with input as {
			"principal": fx_approver("u-admin"),
			"action": "approve",
			"resource": {
				"type": future_type,
				"id": "x-1",
				"court_id": fx_court_a,
				"designations": [],
				"requested_by": "u-admin",
			},
			"context": {"route": "/api/v1/config/publish", "method": "POST"},
		}
	}
}
