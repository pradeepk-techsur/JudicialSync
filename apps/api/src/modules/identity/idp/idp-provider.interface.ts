/**
 * ============================================================================
 * THE IDENTITY-PROVIDER SEAM
 * ============================================================================
 *
 * `FRD/F00` Process step 1 says the user authenticates against a
 * "court-configured IdP". **Court-configured** is the operative word: which
 * provider a court runs, and which protocol it speaks, is a deployment fact,
 * not a property of this codebase. This interface is where that fact is
 * allowed to vary and nowhere else — every caller in the system talks to
 * `IdpProvider`, so substituting a provider is a one-line binding change in
 * `identity.module.ts` rather than a rewrite of `AuthService`.
 *
 * Phase 1 ships exactly one implementation, {@link ../oidc.provider}, speaking
 * OIDC against the Keycloak stand-in realm. A second protocol binding is
 * deliberately deferred rather than stubbed — see `docs/IDP-INTEGRATION.md`,
 * which records what is deferred, why, and what adding it would involve.
 *
 * The reason for a seam with only one implementation behind it is not
 * speculative generality. It is that the alternative — `AuthService` calling
 * `openid-client` directly — makes the protocol a load-bearing assumption of
 * every authentication code path, so the cost of a court arriving with a
 * different IdP is paid in the session layer, the audit layer and the tests
 * rather than in one file.
 */

/** DI token for the bound {@link IdpProvider}. See `identity.module.ts`. */
export const IDP_PROVIDER = 'IDP_PROVIDER';

/**
 * What a successfully verified IdP assertion tells us about the person.
 *
 * This is the ONLY shape the rest of the system sees. No protocol-specific
 * token, claim set or client object escapes the provider, which is what keeps
 * the seam a real seam.
 */
export interface IdpAssertionResult {
  /** The IdP's own subject identifier. Maps to `users.external_idp_subject`. */
  subject: string;
  display_name: string;
  email: string;

  /**
   * Whether the assertion **evidences** multi-factor authentication.
   *
   * Derived solely from the authentication-context claims the IdP signed
   * (`acr` / `amr`). There is deliberately no environment variable, config
   * flag or constructor option anywhere in this module that can force this
   * field true: the Phase 1 CONTEXT rejected such a flag outright, on the
   * reasoning that it becomes the daily-exercised path while the real control
   * goes unproven.
   *
   * A `false` here is rejected by the caller with `401 AUTH_MFA_FAILED`. It is
   * never downgraded to a lesser session.
   */
  mfa_satisfied: boolean;

  /** Raw authentication-context-class reference, retained for audit. */
  acr?: string;
  /** Raw authentication-methods references, retained for audit. */
  amr?: string[];

  issued_at: Date;
  expires_at: Date;
}

/**
 * A started authentication attempt.
 *
 * `state` is returned so the caller can correlate the eventual callback; the
 * nonce and the PKCE verifier are **not** returned, because they are held
 * server-side for exactly one use and handing them to a caller would make
 * replay protection a caller responsibility.
 */
export interface AuthorizationRequest {
  /** Where to send the user agent to authenticate. */
  authorization_url: string;
  /** Opaque single-use correlator, echoed back on the callback. */
  state: string;
}

/**
 * The server-held half of an in-flight attempt, recovered by `state` when the
 * callback arrives and destroyed in the same operation.
 */
export interface AuthorizationVerifier {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface IdpProvider {
  /**
   * The protocol this binding speaks. A single-member union today; widening it
   * is the deliberate, reviewable act of adding a second binding.
   */
  readonly protocol: 'oidc';

  /**
   * Begin an attempt: generate `state`, `nonce` and a PKCE pair, persist the
   * server-held half under a short TTL, and return where to send the user.
   *
   * Implementations own the persistence because replay protection is only a
   * property of the system if exactly one component decides when a `state` is
   * spent. Spreading that across the provider and its callers produces two
   * places that each assume the other checked.
   */
  beginAuthorization(): Promise<AuthorizationRequest>;

  /**
   * Build the authorization URL from already-generated parameters.
   *
   * The primitive underneath {@link beginAuthorization}, exposed separately so
   * the URL construction is testable without a persistence round trip.
   */
  authorizationUrl(
    state: string,
    nonce: string,
    codeChallenge: string,
  ): Promise<string>;

  /**
   * Recover and **consume** the server-held verifier for `state`.
   *
   * Returns `undefined` when the state is unknown, expired, or already spent —
   * all three of which the caller must treat identically, as a rejected
   * callback. Distinguishing them in a response would tell an attacker whether
   * a guessed state had ever been valid.
   */
  consumeVerifier(state: string): Promise<AuthorizationVerifier | undefined>;

  /**
   * Exchange a verified assertion for the person it describes.
   *
   * Implementations MUST validate the assertion completely — signature against
   * the issuer's published keys, issuer, audience, expiry and nonce — and MUST
   * derive {@link IdpAssertionResult.mfa_satisfied} only from signed
   * authentication-context claims.
   *
   * @throws `401 AUTH_INVALID_ASSERTION` when validation fails.
   * @throws `503 AUTH_IDP_UNAVAILABLE` when the IdP cannot be reached.
   */
  exchange(
    assertion: string,
    verifier: AuthorizationVerifier,
    callbackParams?: Record<string, string>,
  ): Promise<IdpAssertionResult>;

  /**
   * The whole callback leg: consume the verifier for `state`, then
   * {@link exchange}. The path an HTTP caller should use, because it cannot be
   * written in a way that skips the replay check.
   *
   * `callbackParams` carries any additional query parameters the IdP
   * returned on the redirect. They are not decoration: a provider that
   * advertises `authorization_response_iss_parameter_supported` (Keycloak
   * does) returns an `iss` parameter that the relying party MUST validate
   * per RFC 9207, and dropping it makes every exchange fail.
   */
  completeAuthorization(
    assertion: string,
    state: string,
    callbackParams?: Record<string, string>,
  ): Promise<IdpAssertionResult>;
}
