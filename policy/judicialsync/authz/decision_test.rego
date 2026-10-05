package judicialsync.authz

import future.keywords.every
import future.keywords.if
import future.keywords.in

# ---------------------------------------------------------------------------
# Fail closed (FRD/Y2-errors.md principle 1).
#
# These are the tests behind threat T-01-04: a decision document that comes
# back undefined for an input shape the rules do not match could be misread as
# an allow by the guard. `default decision` makes that impossible.
# ---------------------------------------------------------------------------

test_default_is_deny_on_empty_input if {
	d := decision with input as {}
	d.allow == false
	d.hide_existence == false
}

test_default_is_deny_on_malformed_input if {
	d := decision with input as {
		"principal": {
			"user_id": "u-1",
			"mfa_satisfied": true,
			"roles": [],
			"scopes": [],
			"entitlements": ["case_read"],
		},
		"action": "read",
		# resource omitted entirely
		"context": {"route": "/api/v1/cases/c1", "method": "GET"},
	}

	d.allow == false
}

# A decision is always a COMPLETE document — the guard can read all three keys
# without a presence check, whatever the input was.
test_decision_always_complete_document if {
	every bad_input in [
		{},
		{"principal": {}},
		{"action": "read"},
		{"principal": {"user_id": "u", "entitlements": []}, "resource": {"type": "case"}},
	] {
		fx_is_complete_decision with input as bad_input
	}
}

fx_is_complete_decision if {
	d := decision
	is_boolean(d.allow)
	is_string(d.reason_code)
	is_boolean(d.hide_existence)
}

# ---------------------------------------------------------------------------
# The full allow path.
# ---------------------------------------------------------------------------

test_full_allow_path if {
	d := decision with input as {
		"principal": {
			"user_id": "u-clerk",
			"mfa_satisfied": true,
			"roles": [{"role_name": "clerk_case_admin", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": ["case_read"],
		},
		"action": "read",
		"resource": {
			"type": "case",
			"id": fx_case_1,
			"court_id": fx_court_a,
			"division_id": null,
			"case_id": fx_case_1,
			"proceeding_id": null,
			"designations": [],
			"requested_by": null,
		},
		"context": {"route": "/api/v1/cases/aaaa", "method": "GET"},
	}

	d.allow == true
	d.reason_code == ""
	d.hide_existence == false
}

# reason_code is empty exactly when allow is true — the contract plan 01-07
# codes against.
test_allow_implies_empty_reason_code if {
	d := decision with input as {
		"principal": {
			"user_id": "u-clerk",
			"mfa_satisfied": true,
			"roles": [{"role_name": "clerk_case_admin", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": ["case_read"],
		},
		"action": "read",
		"resource": fx_resource("case"),
		"context": {"route": "/api/v1/cases/r-1", "method": "GET"},
	}

	d.allow == true
	d.reason_code == ""
}

# ---------------------------------------------------------------------------
# Reason precedence.
# ---------------------------------------------------------------------------

# A self-approval attempt that is ALSO out of scope reports the SoD violation,
# because it is the more specific and more actionable fact.
test_precedence_sod_over_scope if {
	d := decision with input as {
		"principal": {
			"user_id": "u-admin",
			"mfa_satisfied": true,
			"roles": [{"role_name": "system_admin", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": ["access_admin"],
		},
		"action": "approve",
		"resource": {
			"type": "access_grant_request",
			"id": "gr-1",
			"court_id": fx_court_b, # out of scope — court B
			"division_id": null,
			"case_id": null,
			"proceeding_id": null,
			"designations": [],
			"requested_by": "u-admin", # and a self-approval
		},
		"context": {"route": "/api/v1/entitlements/requests/gr-1/approve", "method": "POST"},
	}

	d.allow == false
	d.reason_code == "AUTH_SOD_VIOLATION"
}

# MFA outranks a plain scope denial.
test_precedence_mfa_over_scope if {
	d := decision with input as {
		"principal": {
			"user_id": "u-clerk",
			"mfa_satisfied": false,
			"roles": [{"role_name": "clerk_case_admin", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": [],
		},
		"action": "read",
		"resource": {"type": "case", "id": "c-b", "court_id": fx_court_b, "designations": []},
		"context": {"route": "/api/v1/cases/c-b", "method": "GET"},
	}

	d.allow == false
	d.reason_code == "AUTH_MFA_FAILED"
}

# Designation denial outranks MFA, for a requester with parent-case access.
test_precedence_designation_over_mfa if {
	d := decision with input as {
		"principal": {
			"user_id": "u-clerk",
			"mfa_satisfied": false,
			"roles": [{"role_name": "clerk_case_admin", "court_id": fx_court_a, "division_id": null}],
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
			"designations": ["sealed"],
		},
		"context": {"route": "/api/v1/cases/aaaa", "method": "GET"},
	}

	d.allow == false
	d.reason_code == "AUTH_DESIGNATION_DENIED"
}

# ---------------------------------------------------------------------------
# Existence-hiding outranks everything (threat T-01-05).
#
# If the error code varied by denial cause, the difference would itself tell a
# blind-discovery requester that a sealed matter exists. This asserts the
# response is identical no matter which other denials also apply.
# ---------------------------------------------------------------------------

test_hide_existence_wins_over_other_denials if {
	d := decision with input as {
		"principal": {
			"user_id": "u-blind",
			"mfa_satisfied": false, # also an MFA failure
			"roles": [{"role_name": "jury_admin", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": [], # also an entitlement denial
		},
		"action": "read",
		"resource": {
			"type": "case",
			"id": fx_case_1,
			"court_id": fx_court_b, # also out of scope
			"case_id": fx_case_1,
			"designations": ["sealed"],
			"requested_by": null,
		},
		"context": {"route": "/api/v1/cases/aaaa", "method": "GET"},
	}

	d.allow == false
	d.reason_code == "RESOURCE_NOT_FOUND"
	d.hide_existence == true
}

# Existence-hiding beats SoD too — the top of the ordinary precedence list.
test_hide_existence_wins_over_sod if {
	d := decision with input as {
		"principal": {
			"user_id": "u-blind",
			"mfa_satisfied": true,
			"roles": [{"role_name": "jury_admin", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": [],
		},
		"action": "approve",
		"resource": {
			"type": "access_grant_request",
			"id": "gr-1",
			"court_id": fx_court_a,
			"case_id": fx_case_1,
			"designations": ["sealed"],
			"requested_by": "u-blind",
		},
		"context": {"route": "/api/v1/entitlements/requests/gr-1/approve", "method": "POST"},
	}

	d.allow == false
	d.reason_code == "RESOURCE_NOT_FOUND"
	d.hide_existence == true
}

# The two sealed-record responses are byte-identical regardless of why else the
# blind requester was denied — this is the leak-proofing stated as a property
# rather than as two separate assertions.
test_hidden_responses_are_indistinguishable if {
	fx_blind_decision(false, fx_court_b) == fx_blind_decision(true, fx_court_a)
}

fx_blind_decision(mfa, court) := d if {
	d := decision with input as {
		"principal": {
			"user_id": "u-blind",
			"mfa_satisfied": mfa,
			"roles": [{"role_name": "jury_admin", "court_id": fx_court_a, "division_id": null}],
			"scopes": [{"scope_type": "court", "scope_value": fx_court_a, "scope_enum_value": null}],
			"entitlements": [],
		},
		"action": "read",
		"resource": {
			"type": "case",
			"id": fx_case_1,
			"court_id": court,
			"case_id": fx_case_1,
			"designations": ["sealed"],
			"requested_by": null,
		},
		"context": {"route": "/api/v1/cases/aaaa", "method": "GET"},
	}
}

# ---------------------------------------------------------------------------
# The entry point is singular and its shape is stable.
# ---------------------------------------------------------------------------

test_decision_exposes_exactly_three_keys if {
	d := decision with input as {}
	count(object.keys(d)) == 3
	object.keys(d) == {"allow", "reason_code", "hide_existence"}
}
