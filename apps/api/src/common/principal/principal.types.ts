/**
 * The authenticated caller, as every guard, controller and service in
 * JudicialSync sees them.
 *
 * Source: `project_specs/TechArch/03a-api-shared.md` §6.1, with two
 * deliberate, documented divergences:
 *
 *  1. `ao_program_manager` IS included in the role catalog. TechArch §6.1's
 *     inline comment omits it, but `FRD/Y0a-schema-shared.md` §Identity,
 *     `FRD/F00` and the Phase 1 CONTEXT all list it, and CONTEXT locks the
 *     catalog at **10** roles. The disagreement between the two source
 *     documents is recorded as an open assumption (docs/ASSUMPTIONS.md
 *     ASM-05) rather than silently resolved.
 *
 *  2. `Principal.entitlements` is a first-class field, separate from `roles`.
 *     CONTEXT makes entitlements separately grantable with their own record,
 *     grantor, timestamp and audit event — so an entitlement is NEVER derivable
 *     from a role. See the hard constraint on `entitlements` below.
 */

/**
 * A role held by a user, optionally narrowed to a court and/or division.
 *
 * A role is an organisational fact ("this person is a judge"), not a
 * permission. See {@link Principal.entitlements}.
 */
export interface RoleAssignment {
  role_name:
    | 'judge'
    | 'law_clerk'
    | 'courtroom_deputy'
    | 'clerk_case_admin'
    | 'attorney_external'
    | 'jury_admin'
    | 'court_admin'
    | 'ao_program_manager'
    | 'system_admin'
    | 'security_officer';
  court_id?: string;
  division_id?: string;
}

/** The ten role names, as a runtime value for validation and seeding. */
export const ROLE_NAMES = [
  'judge',
  'law_clerk',
  'courtroom_deputy',
  'clerk_case_admin',
  'attorney_external',
  'jury_admin',
  'court_admin',
  'ao_program_manager',
  'system_admin',
  'security_officer',
] as const satisfies readonly RoleAssignment['role_name'][];

/**
 * One ABAC scope attribute attached to a principal. The PDP (plan 01-07)
 * evaluates the caller's scope attributes against the target resource's
 * court / division / case / proceeding / party-role / security-designation.
 */
export interface ScopeAttribute {
  scope_type:
    | 'court'
    | 'division'
    | 'case'
    | 'proceeding'
    | 'party_role'
    | 'security_designation';
  /** UUID of the scoped object, when the scope type refers to a record. */
  scope_value?: string;
  /** Enum member, for `party_role` and `security_designation` scopes. */
  scope_enum_value?: string;
}

/** The scope type names, as a runtime value for validation. */
export const SCOPE_TYPES = [
  'court',
  'division',
  'case',
  'proceeding',
  'party_role',
  'security_designation',
] as const satisfies readonly ScopeAttribute['scope_type'][];

/**
 * The authenticated caller attached to a request by `SessionAuthGuard`
 * (implemented in plan 01-06) and consumed by `AbacGuard` and every handler.
 */
export interface Principal {
  user_id: string;
  session_id: string;

  /**
   * Whether multi-factor authentication was satisfied for THIS session,
   * read from the IdP assertion's `amr`/`acr` claim. There is no bypass flag:
   * a session where MFA was not satisfied is rejected, not downgraded.
   */
  mfa_satisfied: boolean;

  roles: RoleAssignment[];
  scopes: ScopeAttribute[];

  /**
   * Separately granted entitlements — NEVER implied by a role.
   *
   * This is a hard constraint from the Phase 1 CONTEXT: "Role existence must
   * never imply access." A `jury_admin` with no granted entitlement has no
   * access at all. Least privilege is the default: a new account starts with
   * an empty array. Every grant is its own record carrying a grantor, a
   * timestamp and an audit event (plan 01-09), and the invariant is proven by
   * test in plan 01-14 rather than merely asserted here.
   */
  entitlements: string[];
}

/**
 * Express request augmentation. Once `SessionAuthGuard` has run, a
 * non-`@Public()` route can rely on `request.principal` being present.
 */
export interface RequestWithPrincipal {
  principal?: Principal;
}
