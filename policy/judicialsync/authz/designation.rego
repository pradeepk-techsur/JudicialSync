# Security designations, and the 403-vs-404 decision.
#
# FRD/Y2-errors.md principle 3 is BINDING and already resolves the 403-vs-404
# question (CONTEXT: "Do not re-litigate this"). The test is encoded here, once,
# so no handler re-decides it per endpoint:
#
#   404 (existence-hiding) on BLIND-DISCOVERY paths — "the requester has no
#       other access path that already confirms the object/case exists."
#       Returning 403 there would itself leak the existence of a sealed matter.
#
#   403 (designation-denied) where "the requester already has general,
#       legitimate access to the parent case/object ... and are only missing
#       the SPECIFIC sealed/restricted/grand-jury/juvenile entitlement."
#       Existence is already known to them, so 403 leaks nothing and is more
#       actionable.
package judicialsync.authz

import future.keywords.contains
import future.keywords.if
import future.keywords.in

# ---------------------------------------------------------------------------
# Designation → required entitlement.
#
# FRD/F13 requires designation policy be configuration-driven, "not ad hoc code
# paths". These are the built-in defaults; input.security_policies overrides
# them when supplied. See designation_entitlement_for below.
# ---------------------------------------------------------------------------

default_designation_entitlement := {
	"sealed": "designation_sealed",
	"restricted": "designation_restricted",
	"grand_jury": "designation_grand_jury",
	"juvenile": "designation_juvenile",
	"pii": "designation_pii",
}

# True when the caller supplied a security_policies set (the Phase 1
# `security_policies` table, read by plan 01-11).
security_policies_supplied if {
	count(input.security_policies) > 0
}

configured_designation_entitlement := {row.designation: row.required_entitlement |
	some row in input.security_policies
}

# The supplied set REPLACES the built-in map rather than merging with it, so a
# configuration row can genuinely change a mapping rather than only add one.
#
# Fail-closed consequence, intentional: a designation present on a resource but
# absent from a supplied security_policies set maps to nothing, so
# `designation_entitlement_for[d]` is undefined, the membership test below
# cannot succeed, and the designation is treated as missing — a deny. A
# configuration that forgets a designation hides records; it never exposes them.
designation_entitlement_for := configured_designation_entitlement if {
	security_policies_supplied
}

designation_entitlement_for := default_designation_entitlement if {
	not security_policies_supplied
}

# ---------------------------------------------------------------------------
# Which of the resource's designations is the principal NOT entitled to?
# ---------------------------------------------------------------------------

holds_designation_entitlement(d) if {
	some e in input.principal.entitlements
	e == designation_entitlement_for[d]
}

missing_designations contains d if {
	some d in input.resource.designations
	not holds_designation_entitlement(d)
}

# A record carrying several designations requires the entitlement for EVERY one
# of them — holding `designation_sealed` does not unlock a record that is also
# `grand_jury`.
designation_deny if {
	count(missing_designations) > 0
}

# ---------------------------------------------------------------------------
# Y2 principle 3's discriminator: does the requester already have a legitimate
# path to know this object exists?
#
# Yes → they hold case_read, the resource hangs off a case, and they are in
# scope for that case. The case's existence is already known to them, so a 403
# tells them nothing new.
#
# No → blind discovery. The response must be indistinguishable from "this ID
# does not exist".
# ---------------------------------------------------------------------------

has_parent_case_access if {
	scoped_resource_case_id
	some e in input.principal.entitlements
	e == "case_read"
	in_case_scope
}

# A court-scoped principal holding no per-case scope rows legitimately reaches
# every case in their court (see abac.rego's narrowing-scope semantics), so
# their knowledge of the case's existence is equally legitimate.
has_parent_case_access if {
	scoped_resource_case_id
	some e in input.principal.entitlements
	e == "case_read"
	not case_restricted
	in_court_scope
}

hide_existence if {
	designation_deny
	not has_parent_case_access
}
