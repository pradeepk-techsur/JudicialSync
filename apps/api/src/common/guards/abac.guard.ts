import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_SELF_SCOPED_KEY } from '../decorators/self-scoped.decorator';
import { ApiException } from '../errors/api-error';

/**
 * The **second** of two global guards, and the authoritative authorization
 * enforcement point for the entire system. Registered as an `APP_GUARD`
 * provider in `app.module.ts`, it runs on every request after
 * `SessionAuthGuard` has established who the caller is.
 *
 * Its question: **may THIS principal touch THIS resource?**
 *
 * Decision table:
 *
 *   | route marking   | this guard |
 *   |-----------------|------------|
 *   | `@Public()`     | allow — no principal exists to evaluate            |
 *   | `@SelfScoped()` | allow — the endpoint has no target resource        |
 *   | unmarked        | **evaluate, and deny on any ambiguity**            |
 *
 * ---
 *
 * ## Why this guard is global rather than per-route
 *
 * Per-route opt-in guards were explicitly rejected in the Phase 1 CONTEXT:
 * "a route that forgets the decorator is silently open, which is precisely
 * the failure mode F00 forbids." Registering globally inverts the default —
 * a route is protected unless someone deliberately marks it otherwise, and
 * forgetting produces a 503, not an open endpoint. This mitigates threat
 * T-01-01 structurally rather than by convention.
 *
 * ---
 *
 * ## PLACEHOLDER UNTIL PLAN 01-07
 *
 * The evaluation branch is a stub that denies unconditionally. Plan **01-07**
 * replaces it with the real Policy Decision Point call: build the resource
 * scope (court / division / case / proceeding / party-role /
 * security-designation) from the request, POST it with the principal to the
 * OPA container, and honour the allow/deny decision.
 *
 * **The stub denies, and must never be made permissive.** A route added by
 * plan 01-09 before 01-07 lands must return 503, not 200 — deny-by-default is
 * the entire point of writing this guard first.
 *
 * `503 SECURITY_POLICY_UNAVAILABLE` is also exactly the response the *real*
 * implementation owes when OPA is unreachable or evaluation errors. The stub
 * is therefore not a fake state: the system genuinely cannot evaluate policy
 * yet, and it says so in the specified way
 * (`FRD/F13` Error States; `FRD/Y2-errors.md` principle 1, "Fail closed, not
 * open"). The code path the stub exercises is the one the real client will
 * reuse for its own failure mode.
 */
@Injectable()
export class AbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    // A public route has no authenticated principal, so there is nothing to
    // evaluate against. `SessionAuthGuard` already let it through.
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    if (isPublic === true) {
      return true;
    }

    // A self-scoped route has a principal but no TARGET RESOURCE — its only
    // subject is the caller's own identity, so there are no resource
    // attributes for the PDP to weigh. The session requirement was already
    // enforced upstream; this is not an authentication bypass.
    const isSelfScoped = this.reflector.getAllAndOverride<boolean>(
      IS_SELF_SCOPED_KEY,
      targets,
    );
    if (isSelfScoped === true) {
      return true;
    }

    // PLACEHOLDER UNTIL PLAN 01-07 — the real PDP client lands there.
    // Until then no policy decision can be made, so no access is granted.
    throw new ApiException(
      503,
      'SECURITY_POLICY_UNAVAILABLE',
      'Access cannot be evaluated at this time; request denied',
    );
  }
}
