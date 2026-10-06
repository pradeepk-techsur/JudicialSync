import {
  RoleAssignment,
  ScopeAttribute,
} from '../../../common/principal/principal.types';

/**
 * Request/response shapes for `/api/v1/auth/*`.
 *
 * Source: `FRD/Y1a-api-shared.md` §Identity & Access and
 * `TechArch/03a-api-shared.md` §6.1.
 */

/** `POST /auth/login` */
export interface LoginRequestDto {
  /**
   * The IdP assertion. For the OIDC binding this is the authorization code
   * returned to the redirect URI.
   */
  identity_assertion: string;
  /**
   * The `state` issued by `GET /auth/authorize-url`, used to recover the
   * server-held nonce and PKCE verifier and to reject a replayed callback.
   */
  state?: string;
  /**
   * Additional query parameters the IdP returned on the redirect.
   *
   * Forwarded verbatim to the provider. A provider advertising
   * `authorization_response_iss_parameter_supported` returns an `iss`
   * parameter the relying party must validate (RFC 9207); dropping it
   * fails every exchange.
   */
  callback_params?: Record<string, string>;
}

/** `POST /auth/login` → 200 */
export interface LoginResponseDto {
  session_token: string;
  refresh_token: string;
  /**
   * The caller's computed entitlements.
   *
   * ## FOR UI GATING ONLY — NEVER THE AUTHORIZATION DECISION
   *
   * `TechArch/03a-api-shared.md` §6.1 is explicit, and the distinction is
   * load-bearing rather than stylistic. This payload exists so a client can
   * avoid rendering a button the user cannot use. It is **not** evidence of
   * authority, and no server-side decision is ever made from it.
   *
   * Every protected route re-derives the principal from the session and
   * evaluates the policy independently (plan 01-07). A client that forged
   * this array would change what its own UI draws and nothing else — the
   * request it then sent would be denied by the guard chain exactly as if
   * the array had been honest.
   */
  entitlements: EntitlementsDto;
}

/** `POST /auth/mfa-challenge` */
export interface MfaChallengeRequestDto {
  mfa_challenge_response: string;
  state?: string;
}

/** `POST /auth/refresh` */
export interface RefreshRequestDto {
  refresh_token: string;
}

/** `POST /auth/refresh` → 200 */
export interface RefreshResponseDto {
  session_token: string;
  /**
   * Refresh tokens ROTATE: the presented token is revoked and this is its
   * replacement. Callers must persist it — presenting the old one again is
   * treated as compromise and revokes every session for the user.
   */
  refresh_token: string;
  expires_in: number;
}

/** `GET /auth/authorize-url` → 200 */
export interface AuthorizeUrlResponseDto {
  authorization_url: string;
  state: string;
}

/**
 * `GET /auth/entitlements` → 200
 *
 * The `Entitlements` interface from `TechArch/03a-api-shared.md` §6.1, plus
 * the `entitlements[]` array that CONTEXT's first-class entitlement model
 * requires.
 *
 * **For UI gating only.** See {@link LoginResponseDto.entitlements}.
 */
export interface EntitlementsDto {
  user_id: string;
  /**
   * The signed-in user's human-readable name, for display in the UI shell.
   *
   * Added for plan 01-13: the authenticated shell must show "their name and
   * role" (CONTEXT must-have), and `user_id` is a UUID. It is read from the
   * `users.display_name` column that plan 01-06 already populates from the IdP
   * assertion at login. It is display-only and carries no authority.
   */
  display_name: string;
  roles: RoleAssignment[];
  scopes: ScopeAttribute[];
  /**
   * Separately granted entitlements, read from `entitlement_grants` alone.
   * A role NEVER contributes to this array — see
   * `EntitlementResolverService`.
   */
  entitlements: string[];
  mfa_satisfied: boolean;
}
