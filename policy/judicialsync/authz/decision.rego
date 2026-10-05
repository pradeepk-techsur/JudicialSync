# The single authorization entry point.
#
# Plan 01-07's NestJS guard calls exactly one path:
#     POST /v1/data/judicialsync/authz/decision
#
# Everything else in this bundle is a layer this document composes.
package judicialsync.authz

import future.keywords.contains
import future.keywords.every
import future.keywords.if
import future.keywords.in

# ---------------------------------------------------------------------------
# Fail closed.
#
# FRD/Y2-errors.md principle 1: "Fail closed, not open." A malformed, partial
# or empty input must produce a DENY, never an undefined result the guard might
# mistake for an allow. `default` guarantees `decision` is always a complete
# document with allow == false, whatever the input looks like.
# ---------------------------------------------------------------------------

default decision := {
	"allow": false,
	"reason_code": "AUTH_SCOPE_DENIED",
	"hide_existence": false,
}

# Every denial reason produced by every layer, as one set.
all_denials := ((rbac_deny | abac_deny) | entitlement_deny) | sod_deny

# Designation denials are tracked separately because they carry the
# existence-hiding decision (Y2 principle 3) rather than being a plain reason
# code — see designation.rego.
designation_reason contains "AUTH_DESIGNATION_DENIED" if {
	designation_deny
}

all_reasons := all_denials | designation_reason

# ---------------------------------------------------------------------------
# Reason precedence — most specific wins, so the client receives the most
# actionable code rather than whichever rule happened to sort first.
#
#   AUTH_SOD_VIOLATION > AUTH_DESIGNATION_DENIED > AUTH_MFA_FAILED > AUTH_SCOPE_DENIED
# ---------------------------------------------------------------------------

reason_precedence := [
	"AUTH_SOD_VIOLATION",
	"AUTH_DESIGNATION_DENIED",
	"AUTH_MFA_FAILED",
	"AUTH_SCOPE_DENIED",
]

# The lowest index in reason_precedence that actually fired. Expressed as a
# min over matching indices rather than a "nothing earlier matched" scan,
# because the scan form has an off-by-one trap: numbers.range(0, -1) counts
# DOWN to -1 rather than yielding an empty sequence, which silently made the
# top-precedence reason unselectable.
matched_precedence_indices := {i |
	some i
	reason_precedence[i] in all_reasons
}

highest_precedence_reason := reason_precedence[min(matched_precedence_indices)]

# ---------------------------------------------------------------------------
# The three outcomes. The bodies are mutually exclusive, so `decision` is never
# ambiguous — OPA would raise a complete-rules conflict if two branches ever
# produced different documents for the same input, which makes that exclusivity
# a machine-checked property rather than a convention.
# ---------------------------------------------------------------------------

# 1. Existence-hiding outranks every other denial.
#
# Deliberately unconditional on other denials: if the response differed by
# denial cause, the error code itself would leak that a sealed matter exists.
# A blind-discovery requester gets the same RESOURCE_NOT_FOUND whether they
# were also out of scope, also unentitled, or neither.
decision := {
	"allow": false,
	"reason_code": "RESOURCE_NOT_FOUND",
	"hide_existence": true,
} if {
	hide_existence
}

# 2. Denied, with the most specific applicable reason.
decision := {
	"allow": false,
	"reason_code": highest_precedence_reason,
	"hide_existence": false,
} if {
	not hide_existence
	count(all_reasons) > 0
}

# 3. Allowed. Requires every layer to be silent — no denial from any of them,
# and no missing designation entitlement.
decision := {
	"allow": true,
	"reason_code": "",
	"hide_existence": false,
} if {
	not hide_existence
	count(all_reasons) == 0
}
