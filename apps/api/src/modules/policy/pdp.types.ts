/**
 * ============================================================================
 * THE PDP WIRE CONTRACT
 * ============================================================================
 *
 * **Source of truth: `policy/README.md` § "The contract".** The shapes below
 * are a transcription of that document, not an independent design. Plan 01-02
 * owns the Rego bundle and publishes the input/output documents there; this
 * file exists only so TypeScript callers can be typed against them.
 *
 * ## Why drift here is a silent authorization bug
 *
 * OPA does not reject unknown input fields and does not require declared ones.
 * A misspelled key (`designation` for `designations`, `caseId` for `case_id`)
 * does not error — it makes the corresponding Rego reference *undefined*,
 * which in a `not`-guarded rule flips the decision rather than failing it. A
 * resource whose `designations` never arrive looks like an undesignated
 * resource, and a sealed case becomes readable by anyone with `case_read`.
 *
 * So: if you change a field name here, change it in `policy/README.md` and in
 * the Rego in the same commit, and add a case to the policy unit suite. There
 * is no runtime check that these agree — the integration suites
 * (`abac-guard.e2e-spec.ts`) are the only thing that would catch it, and only
 * for the paths they cover.
 */

/** One scope attribute on the principal. Mirrors `scope_assignments`. */
export interface PdpScope {
  scope_type:
    | 'court'
    | 'division'
    | 'case'
    | 'proceeding'
    | 'party_role'
    | 'security_designation';
  scope_value: string | null;
  scope_enum_value: string | null;
}

/** One role assignment on the principal. Roles may only DENY or SCOPE. */
export interface PdpRole {
  role_name: string;
  court_id: string | null;
  division_id: string | null;
}

/**
 * The principal, as the policy sees it.
 *
 * `entitlements` is the ONLY field that can make the policy allow anything
 * (`policy/README.md` § "Fail closed", property 3). Nothing in the bundle
 * derives an entitlement from a role.
 */
export interface PdpPrincipal {
  user_id: string;
  mfa_satisfied: boolean;
  roles: PdpRole[];
  scopes: PdpScope[];
  entitlements: string[];
}

/**
 * The target resource's **real** attributes, as loaded from the database by
 * `ResourceLoaderService`. Never client-supplied — see threat T-01-27.
 */
export interface PdpResource {
  type: string;
  id: string | null;
  court_id: string | null;
  division_id: string | null;
  case_id: string | null;
  proceeding_id: string | null;
  designations: string[];
  /** Populated only for SoD-bearing resources (`access_grant_request`). */
  requested_by: string | null;
}

/** Route context, used by `rbac.rego`'s internal-only prefix gate. */
export interface PdpContext {
  route: string;
  method: string;
}

/**
 * One row of the court's effective `security_policies`.
 *
 * When supplied, the Rego bundle uses this set **instead of** its built-in
 * designation→entitlement defaults — wholesale replacement, not a merge
 * (`policy/README.md` § "Designation policy is configuration-driven"). A
 * designation present on a resource but absent from this set therefore maps to
 * no entitlement and DENIES. That is intentional: a configuration that forgets
 * a designation hides records, it never exposes them.
 */
export interface PdpSecurityPolicy {
  designation: string;
  required_entitlement: string;
}

/** The complete input document posted to OPA. */
export interface PdpInput {
  principal: PdpPrincipal;
  action: string;
  resource: PdpResource;
  context: PdpContext;
  /** Omitted entirely when the court has no configured rows. */
  security_policies?: PdpSecurityPolicy[];
}

/**
 * The decision document.
 *
 * `reason_code` is `""` exactly when `allow` is `true`. `hide_existence`
 * outranks every other denial reason, so a hidden resource always reports
 * `RESOURCE_NOT_FOUND` regardless of what else also denied — the error code
 * cannot vary by denial cause and leak a sealed matter's existence.
 *
 * The policy deliberately does NOT know per-resource 404 codes
 * (`CASE_NOT_FOUND`, `AUDIT_NOT_FOUND`, …). `AbacGuard` maps them.
 */
export interface PdpDecision {
  allow: boolean;
  reason_code: string;
  hide_existence: boolean;
}

/** OPA's `POST /v1/data/{path}` envelope. `result` is absent on an undefined document. */
export interface OpaDataResponse {
  result?: unknown;
}

/**
 * Narrow an arbitrary parsed body to a {@link PdpDecision}.
 *
 * Deliberately strict about `allow`: a body whose `allow` is absent, `null`,
 * or the string `"true"` is treated as MALFORMED and rejected, not coerced.
 * Coercion here is how a fail-closed client becomes fail-open — `Boolean("false")`
 * is `true`, and a policy bundle returning a stringly-typed decision would then
 * allow everything.
 */
export function parsePdpDecision(value: unknown): PdpDecision | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.allow !== 'boolean') return undefined;

  // `reason_code` and `hide_existence` are defaulted rather than required:
  // both defaults are the SAFE direction (a denial with a generic reason, and
  // "do not hide"), so a bundle that omitted them cannot widen access.
  const reasonCode =
    typeof candidate.reason_code === 'string' ? candidate.reason_code : '';
  const hideExistence = candidate.hide_existence === true;

  return {
    allow: candidate.allow,
    reason_code: reasonCode,
    hide_existence: hideExistence,
  };
}
