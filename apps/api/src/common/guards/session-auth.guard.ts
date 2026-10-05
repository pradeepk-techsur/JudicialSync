import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiException } from '../errors/api-error';

/**
 * The **first** of two global guards. Registered as an `APP_GUARD` provider in
 * `app.module.ts`, it runs before `AbacGuard` on every request in the
 * application.
 *
 * Its question is narrow: **is there a valid, MFA-satisfied session?**
 * Whether that session may touch *this particular resource* is `AbacGuard`'s
 * question, not this one's.
 *
 * Decision table:
 *
 *   | route marking   | this guard |
 *   |-----------------|------------|
 *   | `@Public()`     | allow      |
 *   | `@SelfScoped()` | authenticate (SelfScoped exempts ABAC, not the session) |
 *   | unmarked        | authenticate |
 *
 * Note that `@SelfScoped()` is deliberately absent from the allow row. It
 * exempts a route from *resource* evaluation only; it never exempts it from
 * holding a session. Treating it as an authentication bypass would turn
 * `GET /auth/entitlements` into an anonymous endpoint.
 *
 * ---
 *
 * ## PLACEHOLDER UNTIL PLAN 01-06
 *
 * The *body* of the authenticated branch is a stub: it denies unconditionally.
 * Plan **01-06** replaces it with real session validation — bearer token
 * verification against the Keycloak-issued JWT, the Redis short-cache window
 * (`TechArch/04-security.md` §7.2), the `amr`/`acr` MFA claim check, and
 * population of `request.principal`.
 *
 * **The stub denies rather than allows, and that is deliberate.** A route
 * added by plan 01-09 before 01-06 lands must fail, not sail through. The
 * registration and the `@Public()` logic written here are permanent; only the
 * authenticated branch is temporary.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  // The signature is `Promise<boolean>` even though this stub body never
  // awaits: plan 01-06 introduces real awaits here (JWT verification, the
  // Redis session-cache lookup), and fixing the async contract now means that
  // plan changes only this method's body, never its callers or its tests.
  // eslint-disable-next-line @typescript-eslint/require-await
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Handler metadata wins over controller metadata, so a controller can be
    // marked `@Public()` wholesale and a single route inside it still be
    // protected by its own marking.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic === true) {
      return true;
    }

    // PLACEHOLDER UNTIL PLAN 01-06 — real session validation lands there.
    // Until then every session-requiring route denies. Fail closed.
    throw new ApiException(
      401,
      'AUTH_SESSION_EXPIRED',
      'Session expired; please sign in again',
    );
  }
}
