import { createHash, randomBytes } from 'node:crypto';

import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { Client, Issuer, generators, type IdTokenClaims } from 'openid-client';

import { ApiException } from '../../../common/errors/api-error';
import { REDIS_CLIENT } from '../redis.provider';
import {
  AuthorizationRequest,
  AuthorizationVerifier,
  IdpAssertionResult,
  IdpProvider,
} from './idp-provider.interface';

/**
 * ============================================================================
 * THE REAL OIDC EXCHANGE — no stub, no parallel login path
 * ============================================================================
 *
 * This talks to an actual identity provider over the actual protocol. The
 * Phase 1 CONTEXT is unusually explicit about why that matters: a second,
 * stubbed sign-in route was rejected because "the stub becomes the
 * daily-exercised path and the real integration rots". So there is one way to
 * obtain a session in this system, and it runs through this file.
 *
 * ## Fail closed, always
 *
 * `TechArch/04-security.md` §7.1: "if the IdP is unreachable, authentication
 * fails with `503 AUTH_IDP_UNAVAILABLE`; the system never falls back to an
 * unauthenticated or degraded-trust mode." Discovery is retried with backoff
 * in the background, and until it succeeds every call throws. The important
 * property is the *direction* of the failure: an IdP outage must cost
 * everyone their ability to log in, never cost the system its ability to tell
 * who is logging in.
 *
 * ## Replay protection is this class's job, not its callers'
 *
 * `state`, `nonce` and the PKCE verifier are generated here, stored in Redis
 * under a short TTL, and **deleted atomically on first use**. A callback
 * whose state is unknown, expired or already spent is rejected identically in
 * all three cases. Keeping this in one place is deliberate: replay protection
 * that is split between a provider and its callers becomes two components
 * that each assume the other checked.
 *
 * ## TLS
 *
 * Node's default agent is used unmodified, trusting the Caddy internal CA via
 * `NODE_EXTRA_CA_CERTS` (set by the Compose file). Certificate verification
 * is never relaxed here or anywhere under `apps/api/src/` — a CI grep
 * enforces that, because "just for local dev" is how a verification bypass
 * reaches production.
 */

/** Redis key prefix for in-flight authorization attempts. */
const STATE_KEY_PREFIX = 'oidc:state:';

/**
 * How long an in-flight login attempt stays valid. Long enough for a person
 * to type a password and read a code off a phone; short enough that a
 * captured authorization URL is near-worthless by the time it is replayed.
 */
const STATE_TTL_SECONDS = 600;

/** Discovery retry schedule, in milliseconds. Capped, then steady. */
const DISCOVERY_BACKOFF_MS = [500, 1_000, 2_000, 5_000, 10_000, 30_000];

const AUTH_IDP_UNAVAILABLE_MESSAGE =
  'Authentication service temporarily unavailable';
const AUTH_INVALID_ASSERTION_MESSAGE =
  'Authentication failed; please sign in again';

/**
 * Level of Authentication at or above which a session counts as
 * multi-factor. The realm's `acr.loa.map` is `{"otp": 2}` — OTP is LoA 2.
 */
const MFA_MINIMUM_LOA = 2;

/**
 * Authentication-method references that independently evidence a second
 * factor, per RFC 8176. Checked when the IdP sends `amr` at all; Keycloak in
 * this configuration does not, which is exactly why `acr` is handled
 * carefully below rather than relied on to be numeric.
 */
const MFA_AMR_METHODS = new Set(['otp', 'mfa', 'hwk', 'swk', 'sms', 'pop']);

export interface OidcProviderConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /**
   * The realm's `acr.loa.map`, as published by the IdP: alias → numeric Level
   * of Authentication. See {@link OidcProvider.deriveMfaSatisfied} for why
   * this mapping is not optional.
   */
  acrLoaMap?: Record<string, number>;
}

/** Read provider configuration from the environment. */
export function oidcConfigFromEnv(): OidcProviderConfig {
  return {
    issuerUrl: process.env.OIDC_ISSUER_URL ?? '',
    clientId: process.env.OIDC_CLIENT_ID ?? '',
    clientSecret: process.env.OIDC_CLIENT_SECRET ?? '',
    redirectUri: process.env.OIDC_REDIRECT_URI ?? '',
    acrLoaMap: parseAcrLoaMap(process.env.OIDC_ACR_LOA_MAP),
  };
}

function parseAcrLoaMap(raw: string | undefined): Record<string, number> | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return undefined;
    const out: Record<string, number> = {};
    for (const [alias, level] of Object.entries(parsed as Record<string, unknown>)) {
      const numeric = typeof level === 'string' ? Number(level) : level;
      if (typeof numeric === 'number' && Number.isFinite(numeric)) {
        out[alias] = numeric;
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

export const OIDC_CONFIG = 'OIDC_CONFIG';

@Injectable()
export class OidcProvider implements IdpProvider, OnModuleInit {
  readonly protocol = 'oidc' as const;

  private readonly logger = new Logger(OidcProvider.name);

  /** Resolved once discovery succeeds. Undefined means "not ready — deny". */
  private client?: Client;

  /** Why discovery last failed, for the server-side log only. */
  private lastDiscoveryError?: string;

  /**
   * Alias → LoA, learned from the IdP's published metadata and merged over
   * the configured map. Populated at discovery.
   */
  private acrLoaMap: Record<string, number>;

  private discoveryTimer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    @Inject(OIDC_CONFIG) private readonly config: OidcProviderConfig,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {
    this.acrLoaMap = { ...(config.acrLoaMap ?? {}) };
  }

  async onModuleInit(): Promise<void> {
    // Kick discovery off without blocking boot. The API must come up and
    // serve /health even when the IdP is down — a readiness probe that fails
    // because an upstream is down produces a restart loop that makes the
    // outage worse, and the fail-closed guarantee is already carried by every
    // method throwing until `client` is set.
    void this.discoverWithRetry();
    await Promise.resolve();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
  }

  /** True once the issuer has been discovered and the client built. */
  isReady(): boolean {
    return this.client !== undefined;
  }

  /**
   * Discover the issuer, retrying with backoff until it works.
   *
   * Exposed (rather than inlined) so a test can await readiness deterministically
   * instead of sleeping and hoping.
   */
  async discover(): Promise<void> {
    const issuer = await Issuer.discover(this.config.issuerUrl);

    this.client = new issuer.Client({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uris: [this.config.redirectUri],
      response_types: ['code'],
    });

    this.absorbAcrLoaMap(issuer.metadata as Record<string, unknown>);
    this.lastDiscoveryError = undefined;
    this.logger.log(`OIDC issuer discovered: ${issuer.metadata.issuer ?? '(unnamed)'}`);
  }

  private async discoverWithRetry(attempt = 0): Promise<void> {
    if (this.stopped) return;
    try {
      await this.discover();
    } catch (error) {
      this.lastDiscoveryError =
        error instanceof Error ? error.message : String(error);
      const delay =
        DISCOVERY_BACKOFF_MS[Math.min(attempt, DISCOVERY_BACKOFF_MS.length - 1)];
      this.logger.warn(
        `OIDC discovery failed (attempt ${attempt + 1}): ${this.lastDiscoveryError}. ` +
          `Retrying in ${delay}ms. Authentication fails closed until it succeeds.`,
      );
      if (this.stopped) return;
      this.discoveryTimer = setTimeout(() => {
        void this.discoverWithRetry(attempt + 1);
      }, delay);
      // `unref` so a pending retry never holds the process (or a Jest run) open.
      this.discoveryTimer.unref?.();
    }
  }

  /**
   * Learn the realm's `acr.loa.map` from discovery metadata when it is
   * published there, without letting it silently override explicit config.
   */
  private absorbAcrLoaMap(metadata: Record<string, unknown>): void {
    const published = metadata['acr_values_supported'];
    if (!Array.isArray(published)) return;

    // Keycloak publishes `acr_values_supported: ["otp", "0", "2"]` — the
    // aliases and the raw levels mixed together. A bare numeric string is
    // self-describing; an alias is not, and is resolved from configuration.
    for (const value of published) {
      if (typeof value !== 'string') continue;
      const numeric = Number(value);
      if (Number.isFinite(numeric) && value.trim() !== '') {
        this.acrLoaMap[value] ??= numeric;
      }
    }
  }

  /**
   * The ready client, or the fail-closed error.
   *
   * Every public method goes through here, so there is no shape of this class
   * in which an un-discovered issuer yields anything other than a 503.
   */
  private requireClient(): Client {
    if (this.client === undefined) {
      this.logger.error(
        `Rejecting authentication: OIDC issuer not discovered. ` +
          `Last error: ${this.lastDiscoveryError ?? 'discovery still in progress'}`,
      );
      throw new ApiException(
        503,
        'AUTH_IDP_UNAVAILABLE',
        AUTH_IDP_UNAVAILABLE_MESSAGE,
      );
    }
    return this.client;
  }

  private requireRedis(): Redis {
    if (this.redis === undefined) {
      // Without the state store there is no replay protection, and a login
      // flow without replay protection is worse than no login flow.
      this.logger.error(
        'Rejecting authentication: no Redis client bound, so OIDC state/nonce ' +
          'replay protection cannot be enforced.',
      );
      throw new ApiException(
        503,
        'AUTH_IDP_UNAVAILABLE',
        AUTH_IDP_UNAVAILABLE_MESSAGE,
      );
    }
    return this.redis;
  }

  async beginAuthorization(): Promise<AuthorizationRequest> {
    this.requireClient();
    const redis = this.requireRedis();

    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    const verifier: AuthorizationVerifier = { state, nonce, codeVerifier };
    await redis.set(
      STATE_KEY_PREFIX + state,
      JSON.stringify(verifier),
      'EX',
      STATE_TTL_SECONDS,
    );

    return {
      authorization_url: await this.authorizationUrl(state, nonce, codeChallenge),
      state,
    };
  }

  async authorizationUrl(
    state: string,
    nonce: string,
    codeChallenge: string,
  ): Promise<string> {
    const client = this.requireClient();
    return Promise.resolve(
      client.authorizationUrl({
        scope: 'openid profile email',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        redirect_uri: this.config.redirectUri,
      }),
    );
  }

  /**
   * Fetch and delete the verifier in one round trip.
   *
   * `GETDEL` is what makes the state genuinely single-use: a read followed by
   * a separate delete leaves a window in which two concurrent callbacks both
   * read the same live state and both proceed, which is precisely the replay
   * this is meant to stop.
   */
  async consumeVerifier(state: string): Promise<AuthorizationVerifier | undefined> {
    const redis = this.requireRedis();
    const key = STATE_KEY_PREFIX + state;

    let raw: string | null;
    try {
      raw = await redis.getdel(key);
    } catch {
      // Redis older than 6.2 has no GETDEL. A MULTI/EXEC pair is atomic for
      // the same purpose, so the single-use property survives the fallback.
      const [[, value]] = (await redis.multi().get(key).del(key).exec()) as [
        [Error | null, string | null],
        [Error | null, number],
      ];
      raw = value;
    }

    if (raw === null || raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as AuthorizationVerifier;
    } catch {
      return undefined;
    }
  }

  async completeAuthorization(
    assertion: string,
    state: string,
  ): Promise<IdpAssertionResult> {
    const verifier = await this.consumeVerifier(state);
    if (verifier === undefined) {
      // Unknown / expired / already-spent are one outcome on purpose.
      // Distinguishing them tells an attacker whether a guessed state was
      // ever real.
      this.logger.warn('Rejected OIDC callback: unknown, expired or replayed state.');
      throw new ApiException(
        401,
        'AUTH_INVALID_ASSERTION',
        AUTH_INVALID_ASSERTION_MESSAGE,
      );
    }
    return this.exchange(assertion, verifier);
  }

  async exchange(
    assertion: string,
    verifier: AuthorizationVerifier,
  ): Promise<IdpAssertionResult> {
    const client = this.requireClient();

    let claims: IdTokenClaims;
    try {
      // `callback` performs the full set of checks openid-client is
      // certified for: the ID token signature against the issuer's JWKS, and
      // `iss`, `aud`, `azp`, `exp`, `iat` and `nonce`. Doing it here rather
      // than hand-rolling the checks is the point of using a certified RP
      // library — a hand-rolled validator is where audience confusion and
      // `alg: none` bugs live.
      const tokenSet = await client.callback(
        this.config.redirectUri,
        { code: assertion, state: verifier.state },
        { state: verifier.state, nonce: verifier.nonce, code_verifier: verifier.codeVerifier },
      );
      claims = tokenSet.claims();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (isTransportFailure(error)) {
        // The IdP could not be reached. That is an availability failure, and
        // reporting it as a bad assertion would send an operator hunting a
        // credential problem during an outage.
        this.logger.error(`OIDC token exchange could not reach the issuer: ${message}`);
        throw new ApiException(
          503,
          'AUTH_IDP_UNAVAILABLE',
          AUTH_IDP_UNAVAILABLE_MESSAGE,
        );
      }

      this.logger.warn(`OIDC assertion rejected: ${message}`);
      throw new ApiException(
        401,
        'AUTH_INVALID_ASSERTION',
        AUTH_INVALID_ASSERTION_MESSAGE,
      );
    }

    return this.toAssertionResult(claims);
  }

  /** Map validated claims onto the protocol-agnostic result. */
  toAssertionResult(claims: IdTokenClaims): IdpAssertionResult {
    const amr = Array.isArray(claims.amr)
      ? claims.amr.filter((m): m is string => typeof m === 'string')
      : undefined;
    const acr = typeof claims.acr === 'string' ? claims.acr : undefined;

    return {
      subject: claims.sub,
      display_name:
        (typeof claims.name === 'string' ? claims.name : undefined) ??
        (typeof claims.preferred_username === 'string'
          ? claims.preferred_username
          : undefined) ??
        claims.sub,
      email: typeof claims.email === 'string' ? claims.email : '',
      mfa_satisfied: this.deriveMfaSatisfied(acr, amr),
      acr,
      amr,
      issued_at: new Date((claims.iat ?? Math.floor(Date.now() / 1000)) * 1000),
      expires_at: new Date((claims.exp ?? Math.floor(Date.now() / 1000)) * 1000),
    };
  }

  /**
   * ==========================================================================
   * MFA DERIVATION — the one computation with no override
   * ==========================================================================
   *
   * Computed from the IdP's **signed** authentication-context claims and from
   * nothing else. No environment variable, constructor option or request
   * field reaches this method, and that is a deliberate structural choice
   * rather than an omission: the Phase 1 CONTEXT rejected any flag able to
   * override this, on the reasoning that such a flag becomes the
   * daily-exercised path while the real control goes unproven. There is
   * correspondingly no way to make this
   * return `true` except by presenting an assertion in which the identity
   * provider says the second factor happened.
   *
   * ## Why `acr` is resolved through a map rather than parsed as a number
   *
   * This was established against the running realm, not from documentation,
   * and the naive version is wrong in the dangerous direction.
   *
   * A genuine browser login — password **plus** a real TOTP code — produces:
   *
   *     { "acr": "otp" }        // and NO `amr` claim at all
   *
   * `acr` carries the realm's LoA **alias**, not its numeric level, and
   * Keycloak omits `amr` entirely in this configuration. So the obvious
   * formula `Number(acr) >= 2 || amr.includes('otp')` evaluates
   * `Number("otp") >= 2` → `NaN >= 2` → `false`, with `amr` undefined — and
   * rejects every correct MFA login with `AUTH_MFA_FAILED`. The realm's
   * `acr.loa.map` of `{"otp": 2}` is the missing half: it is what says the
   * alias `otp` *means* level 2, and resolving through it is the only way the
   * alias carries its intended meaning.
   *
   * Worth noting which way the naive bug fails. It denies genuine logins
   * rather than admitting forged ones — loud, not silent. The reason to fix
   * it carefully anyway is that the obvious repair under deadline pressure
   * ("just treat any non-empty acr as MFA") inverts that, and quietly accepts
   * the `acr: "1"` password-only assertion shown below.
   *
   * ## The password-only case, for contrast
   *
   * A direct-access-grant token obtained with password + TOTP reports
   * `{ "acr": "1" }`, because the direct grant does not run the browser flow's
   * LoA-conditioned OTP step — the TOTP is verified by the credential check,
   * but the session is not stepped up to LoA 2. `"1"` resolves to 1, which is
   * below {@link MFA_MINIMUM_LOA}, so it is correctly **not** MFA-satisfied.
   * Treating a non-empty `acr` as sufficient would admit exactly this token.
   */
  deriveMfaSatisfied(acr: string | undefined, amr: string[] | undefined): boolean {
    // RFC 8176 `amr`, when the IdP sends it. Keycloak here does not, but a
    // real court IdP may, and an assertion that explicitly names a second
    // factor evidences one regardless of how `acr` is expressed.
    if (amr?.some((method) => MFA_AMR_METHODS.has(method.toLowerCase())) === true) {
      return true;
    }

    if (acr === undefined || acr.trim() === '') return false;

    const level = this.resolveAcrLevel(acr.trim());
    return level !== undefined && level >= MFA_MINIMUM_LOA;
  }

  /**
   * Resolve an `acr` value to a numeric Level of Authentication.
   *
   * A bare numeric string is its own level. An alias is resolved through the
   * realm's `acr.loa.map`, and an alias that is NOT in the map resolves to
   * nothing — which denies. Defaulting an unknown alias to "probably fine"
   * would mean a realm misconfiguration silently downgrades MFA for everyone,
   * so the unknown case fails closed.
   */
  private resolveAcrLevel(acr: string): number | undefined {
    const mapped = this.acrLoaMap[acr];
    if (typeof mapped === 'number' && Number.isFinite(mapped)) return mapped;

    const numeric = Number(acr);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
}

/**
 * Distinguish "could not reach the IdP" from "the IdP said no".
 *
 * The distinction decides between 503 and 401, and it matters operationally:
 * a 401 during an IdP outage sends people to check credentials while the real
 * problem is a dead upstream.
 */
function isTransportFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string') {
    return [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ECONNRESET',
      'ETIMEDOUT',
      'EAI_AGAIN',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'SELF_SIGNED_CERT_IN_CHAIN',
    ].includes(code);
  }
  const name = (error as { name?: unknown }).name;
  return name === 'RPError' ? false : name === 'TimeoutError';
}

/** Exported for tests that assert on the SHA-256 PKCE challenge shape. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
