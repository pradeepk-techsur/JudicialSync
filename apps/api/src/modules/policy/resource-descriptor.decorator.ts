import { SetMetadata } from '@nestjs/common';

/** Reflector metadata key read by `AbacGuard`. */
export const RESOURCE_KEY = 'abacResource';

/**
 * The fifteen resource types, mirroring plan 01-02's `action_entitlement_map`
 * **exactly**.
 *
 * The two lists are kept in lockstep deliberately and in both directions:
 *
 *  - a type here with no map row is DENIED at the PDP
 *    (`abac.rego`'s `entitlement_deny` second rule — fail closed on an
 *    unmapped pair), so adding one here without the Rego row produces a 403 on
 *    a route that was supposed to work; and
 *  - a map row with no type here does not typecheck, so a route cannot declare
 *    it.
 *
 * `policy/README.md` is the authoritative inventory and
 * `test_map_covers_every_declared_route` fails at `opa test` time when the map
 * and that table drift. Adding a route in plans 01-08..01-12 means adding the
 * Rego row FIRST (plan 01-02 owns `policy/**`), then the descriptor here.
 */
export type ResourceType =
  | 'case'
  | 'proceeding'
  | 'hearing'
  | 'party'
  | 'docket_event'
  | 'document_reference'
  | 'security_designation'
  | 'court_config'
  | 'audit_event'
  | 'file'
  | 'retention_schedule'
  | 'disposition'
  | 'access_grant_request'
  | 'entitlement_grant'
  | 'encryption_key';

/** Runtime companion to {@link ResourceType}, for validation and iteration. */
export const RESOURCE_TYPES = [
  'case',
  'proceeding',
  'hearing',
  'party',
  'docket_event',
  'document_reference',
  'security_designation',
  'court_config',
  'audit_event',
  'file',
  'retention_schedule',
  'disposition',
  'access_grant_request',
  'entitlement_grant',
  'encryption_key',
] as const satisfies readonly ResourceType[];

/**
 * The seven actions. Matches the `action` union in `policy/README.md` § Input.
 *
 * Note there is no `deny` action: `access_grant_request` denial is declared as
 * `approve`, so `sod.rego`'s single `action == "approve"` rule binds a
 * requester quietly denying their own request exactly as it binds them
 * approving it. A separate `deny` action would silently escape SoD.
 */
export type ResourceAction =
  | 'read'
  | 'create'
  | 'update'
  | 'approve'
  | 'upload'
  | 'rotate'
  | 'revoke';

export interface ResourceDescriptor {
  type: ResourceType;
  action: ResourceAction;
  /** Route param holding the target object's id, e.g. `"id"`. */
  idParam?: string;
  /** Route param holding the owning case id, when it differs from `idParam`. */
  caseIdParam?: string;
}

/**
 * ============================================================================
 * DECLARE WHAT THIS ROUTE TOUCHES, SO THE PDP CAN DECIDE ABOUT IT
 * ============================================================================
 *
 * Every protected route in plans 01-08 through 01-12 carries **exactly one**
 * `@Resource()`. `AbacGuard` reads it, loads the named object's real
 * attributes from the database, and asks OPA.
 *
 * ## A route with no marking at all is DENIED, not allowed
 *
 * A route that is neither `@Public()`, nor `@SelfScoped()`, nor `@Resource(…)`
 * is refused with `503 SECURITY_POLICY_UNAVAILABLE` and an error-level log
 * naming the controller and handler. That is literally true — the guard cannot
 * evaluate policy for a resource nobody declared — and it is the same
 * deny-by-default posture plan 01-01 established, now with a diagnostic
 * instead of silence. (Threat T-01-26.)
 *
 * ## Nothing is ever inferred from the URL
 *
 * It would be easy to derive `type` from the path — `/cases/:id` is obviously
 * a case. It is also how a mistyped or unusual route gets quietly assigned the
 * *wrong* policy: `/cases/:id/security-designations` is a `security_designation`
 * requiring `case_security_admin`, not a `case` requiring `case_read`, and a
 * path-prefix heuristic would hand it the weaker rule. Inference fails toward
 * permissive on exactly the routes where being wrong is most expensive, so the
 * descriptor is explicit and mandatory.
 *
 * @example
 *   \@Resource({ type: 'case', action: 'read', idParam: 'id' })
 *   \@Get('cases/:id')
 *   findOne(\@Param('id') id: string) { … }
 */
export const Resource = (
  descriptor: ResourceDescriptor,
): MethodDecorator & ClassDecorator => SetMetadata(RESOURCE_KEY, descriptor);
