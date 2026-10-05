import { SetMetadata } from '@nestjs/common';

/** Reflector metadata key read by `SessionAuthGuard` and `AbacGuard`. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as requiring **no session at all**.
 *
 * This is one of only two ways a route can be exempted from the full guard
 * chain, and it is the broader of the two — so it is also the narrower in
 * legitimate application.
 *
 * **Legitimate uses, exhaustively:**
 *   - the authentication flow itself (`/auth/login`, `/auth/refresh`, the
 *     OIDC callback, the MFA challenge), because a caller cannot present a
 *     session before obtaining one; and
 *   - `/health`, which infrastructure probes with no credential.
 *
 * `FRD/Y1a-api-shared.md` states the rule directly: every endpoint "require[s]
 * a valid session token (F00) except where noted as part of the authentication
 * flow itself."
 *
 * **This is not a convenience hatch.** Applying `@Public()` to a resource
 * route makes that route world-readable, which is precisely the failure mode
 * F00 forbids. Any new use outside the two cases above should be treated as a
 * security change and reviewed as one.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
