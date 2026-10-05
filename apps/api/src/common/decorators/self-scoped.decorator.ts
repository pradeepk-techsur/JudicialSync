import { SetMetadata } from '@nestjs/common';

/** Reflector metadata key read by `AbacGuard`. */
export const IS_SELF_SCOPED_KEY = 'isSelfScoped';

/**
 * Marks a route as requiring a **valid, MFA-satisfied session** but **no
 * resource-level ABAC evaluation**.
 *
 * ## Why this exists
 *
 * `AbacGuard` evaluates the caller's attributes against a TARGET RESOURCE's
 * court / division / case / proceeding / party-role / security-designation.
 * A handful of endpoints have no such target: their only subject is the
 * caller's own identity. There is nothing to build a resource scope from, so
 * there is no decision for the PDP to make.
 *
 * **Legitimate uses, exhaustively:**
 *   - `GET  /auth/entitlements`            — returns the caller's own computed roles/scopes
 *   - `POST /auth/logout`                  — revokes the caller's own session
 *   - `PATCH /users/me/workspace-preference` — the caller's own UI preference
 *
 * ## What this is NOT
 *
 * **This is not a bypass and must not become one.** `@SelfScoped()` still
 * requires a valid session that satisfied MFA — `SessionAuthGuard` runs first
 * and is unaffected by this marker. It skips only the *resource-attribute*
 * half of the decision, for endpoints that have no resource.
 *
 * The Phase 1 CONTEXT explicitly rejected both a dev-login path and an MFA
 * bypass flag, on the reasoning that a bypass becomes the daily-exercised path
 * while the real control goes unproven. The same reasoning applies here: if a
 * route returns anything scoped to a court, a case, or another user, it is by
 * definition not self-scoped, and marking it so is a privilege-escalation bug.
 *
 * A useful test before applying it: *could two different users calling this
 * endpoint with identical arguments legitimately receive different data
 * because of who they are, rather than because of what they may see?* If the
 * answer involves a resource at all, do not use this decorator.
 */
export const SelfScoped = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_SELF_SCOPED_KEY, true);
