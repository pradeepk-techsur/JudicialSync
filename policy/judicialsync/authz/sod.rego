# Separation of duties — maker/checker.
#
# TechArch/04-security.md §7.2: "`system_admin` and `security_officer` may not
# approve a privileged role-grant request they themselves created — enforced as
# a policy rule comparing `request.created_by` against `request.approved_by`,
# NOT an application-layer `if` statement that a future refactor could drop."
#
# CONTEXT reinforces the posture: "Prefer 'the API refuses' over 'the audit
# catches it'."
package judicialsync.authz

import future.keywords.contains
import future.keywords.if

# Deliberately RESOURCE-TYPE-AGNOSTIC. The rule keys only on the action being
# an approval and the resource carrying a requester — it never names a resource
# type. That is what lets later phases reuse it with no policy change:
#
#   - Phase 2, F03 configuration publish  (drafted_by != approved_by)
#   - Phase 5, F25 exhibit-config template application
#
# Both need only populate `resource.requested_by`; neither needs a new rule.
#
# Note what is NOT covered, by design: `entitlement_grant` / `revoke` is a
# distinct action precisely so this rule does not fire on it. Revocation is
# deliberately single-step — removing access is not the dangerous direction.
sod_deny contains "AUTH_SOD_VIOLATION" if {
	input.action == "approve"
	input.resource.requested_by != null
	input.resource.requested_by == input.principal.user_id
}
