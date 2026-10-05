import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiException } from '../errors/api-error';
import { RequestWithPrincipal } from '../principal/principal.types';
import { SessionService } from '../../modules/identity/session.service';

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
 * ## What authentication means here (plan 01-06)
 *
 * `SessionService.validate` is called on **every** request to a
 * session-requiring route, and it does three things in order: verifies the
 * JWT, re-reads `platform.sessions` to confirm the session is neither revoked
 * nor expired, and resolves the principal.
 *
 * The middle step is the one worth defending, because it is the one that
 * looks like it could be cached away. `TechArch/04-security.md` §7.1 requires
 * revocation be "enforced via a revocation check on every token validation,
 * **not merely token expiry**". A signed token is a statement that was true
 * when it was signed; nothing about holding one proves it still is. Without
 * the per-request read, revoking access — a lifted role, a departure, a
 * response to compromise — would take effect only whenever the token happened
 * to expire, and `FRD/F00` Process step 7 requires it take effect on the
 * **next request**.
 *
 * ## MFA
 *
 * A session is only ever created from an assertion that evidenced MFA
 * (`AuthService.login` rejects otherwise), so `mfa_satisfied` is true for
 * every session that exists. It is re-checked here anyway: that invariant
 * lives in another file, and a guard that assumes an invariant it does not
 * verify is one refactor away from not holding.
 *
 * ## Failure is uniform on purpose
 *
 * Every failure — missing header, malformed token, bad signature, expired
 * token, revoked session, unknown user — produces the same
 * `401 AUTH_SESSION_EXPIRED`. Distinguishing them would tell an unauthenticated
 * caller which of their guesses was closest, which is free reconnaissance.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

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

    const request = context
      .switchToHttp()
      .getRequest<{ headers?: Record<string, unknown> } & RequestWithPrincipal>();

    const header = request.headers?.['authorization'];
    if (typeof header !== 'string' || header.trim() === '') {
      throw sessionExpired();
    }

    // `validate` re-reads `platform.sessions` and rejects when `revoked_at`
    // is not null or `expires_at` has passed — the per-request revocation
    // check required by TechArch/04-security.md §7.1, performed here on
    // EVERY request rather than only when the token expires.
    //
    // It throws 401 AUTH_SESSION_EXPIRED itself on any failure. Anything
    // unexpected is converted below rather than escaping as a 500 that would
    // leak an internal message.
    let principal;
    try {
      principal = await this.sessions.validate(header);
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw sessionExpired();
    }

    // Belt-and-braces: a session is only created from an MFA-satisfied
    // assertion, so this cannot currently be false. Checked anyway — the
    // invariant is enforced in another file, and this guard should not
    // silently depend on it staying there.
    if (!principal.mfa_satisfied) {
      throw new ApiException(
        401,
        'AUTH_MFA_FAILED',
        'Multifactor verification failed',
      );
    }

    // What every downstream guard, controller and service reads.
    request.principal = principal;

    return true;
  }
}

function sessionExpired(): ApiException {
  return new ApiException(
    401,
    'AUTH_SESSION_EXPIRED',
    'Session expired; please sign in again',
  );
}
