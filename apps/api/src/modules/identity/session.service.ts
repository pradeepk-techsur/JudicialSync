import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import * as jose from 'jose';

import { ApiException } from '../../common/errors/api-error';
import { Principal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EntitlementResolverService } from './entitlement-resolver.service';
import { SessionConfigService } from './session-config.service';

/**
 * ============================================================================
 * SESSION ISSUANCE, ROTATION AND REVOCATION
 * ============================================================================
 *
 * Backed by `platform.sessions` (plan 01-03). The table is the authority on
 * whether a session is live; the access token is only a signed claim that a
 * session *was* created. That ordering is the whole design, and it is what
 * `TechArch/04-security.md` §7.1 demands when it says revocation is "enforced
 * via a revocation check on every token validation, **not merely token
 * expiry**".
 *
 * ## Why the revocation check cannot be skipped for performance
 *
 * A JWT is, by construction, a statement that was true when it was signed.
 * Nothing about holding one proves it is *still* true. If validation stopped
 * at the signature, then revoking access — firing someone, lifting a role,
 * responding to a compromise — would take effect only when the token
 * happened to expire. `FRD/F00` Process step 7 requires the opposite: a
 * role or scope change invalidates active sessions and forces
 * re-authentication.
 *
 * So `validate()` reads the session row every time. The cost is one indexed
 * primary-key lookup; the alternative is a window during which a revoked
 * credential still works, whose length is whatever the token TTL happens to
 * be.
 *
 * ## Refresh tokens are stored hashed and compared in constant time
 *
 * §7.1: "refresh tokens are stored hashed (`sessions.refresh_token_hash`),
 * never in plaintext." A database leak must not yield usable credentials.
 * Comparison uses {@link timingSafeEqual} so that the time taken to reject a
 * wrong token carries no information about how much of it was right.
 *
 * ## Rotation detects reuse, and treats it as compromise
 *
 * A refresh token is single-use: rotating it revokes the old session. If an
 * already-rotated token is presented again, that is the classic signature of
 * a stolen token — either the attacker or the legitimate user is replaying
 * one the other already spent, and there is no way to tell which. The safe
 * response is to revoke **every** session for that user and audit it, which
 * costs the legitimate user one re-login and costs an attacker their foothold.
 */

/** Claims carried in the signed access token. */
interface AccessTokenClaims extends jose.JWTPayload {
  /** `users.id`. */
  sub: string;
  /** `sessions.id`. */
  sid: string;
  /** Whether the originating assertion evidenced MFA. */
  mfa: boolean;
}

export interface IssuedSession {
  session_token: string;
  refresh_token: string;
  session_id: string;
  expires_in: number;
}

export interface RotatedSession {
  session_token: string;
  refresh_token: string;
  session_id: string;
  expires_in: number;
}

/** Thrown-and-caught marker for a refresh token replayed after rotation. */
export class RefreshReuseDetected extends Error {
  constructor(readonly userId: string) {
    super('Refresh token reuse detected');
  }
}

const AUTH_SESSION_EXPIRED_MESSAGE = 'Session expired; please sign in again';

/** JWT signing algorithm. HMAC-SHA256 — symmetric, single verifier. */
const JWT_ALG = 'HS256';

const JWT_ISSUER = 'judicialsync';
const JWT_AUDIENCE = 'judicialsync-session';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  /** Lazily derived HMAC key for access-token signing. */
  private signingKey?: Uint8Array;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SessionConfigService,
    private readonly entitlements: EntitlementResolverService,
  ) {}

  /**
   * The access-token signing key.
   *
   * Derived from `SESSION_TOKEN_SECRET` when set. When it is not — local
   * development and tests — a random key is generated **per process**, which
   * is the right failure mode: tokens stop being valid across a restart
   * (visible, recoverable by signing in again) rather than every deployment
   * sharing a predictable key (invisible, and forgeable).
   */
  private key(): Uint8Array {
    if (this.signingKey !== undefined) return this.signingKey;

    const configured = process.env.SESSION_TOKEN_SECRET;
    if (configured !== undefined && configured.trim() !== '') {
      this.signingKey = createHash('sha256').update(configured).digest();
    } else {
      this.logger.warn(
        'SESSION_TOKEN_SECRET is not set; generating an ephemeral signing key. ' +
          'Sessions will not survive a restart and will not validate across ' +
          'multiple instances. Set it in any real deployment.',
      );
      this.signingKey = new Uint8Array(randomBytes(32));
    }
    return this.signingKey;
  }

  /**
   * Issue a session for `userId`.
   *
   * Enforces the configured concurrent-session limit by revoking the oldest
   * active session, so a limit of 3 means three *live* sessions rather than
   * three attempts.
   */
  async issue(userId: string, mfaSatisfied: boolean): Promise<IssuedSession> {
    const config = await this.config.get();
    const now = new Date();

    await this.enforceConcurrencyLimit(userId, config.concurrent_session_limit);

    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(
      now.getTime() + config.refresh_token_ttl_seconds * 1000,
    );

    const session = await this.prisma.sessions.create({
      data: {
        user_id: userId,
        refresh_token_hash: hashToken(refreshToken),
        mfa_satisfied: mfaSatisfied,
        issued_at: now,
        expires_at: expiresAt,
      },
      select: { id: true },
    });

    const sessionToken = await this.signAccessToken(
      userId,
      session.id,
      mfaSatisfied,
      config.access_token_ttl_seconds,
    );

    return {
      session_token: sessionToken,
      refresh_token: refreshToken,
      session_id: session.id,
      expires_in: config.access_token_ttl_seconds,
    };
  }

  /**
   * Validate a bearer access token and resolve the caller.
   *
   * Three checks, in order, all of which must pass:
   *   1. the JWT signature, issuer, audience and expiry;
   *   2. the session row still exists, is not revoked, and has not expired;
   *   3. the principal resolves.
   *
   * Step 2 is the one that cannot be optimised away — see the class comment.
   *
   * @throws `401 AUTH_SESSION_EXPIRED` for every failure mode, deliberately
   *   undifferentiated: telling a caller whether a token was malformed,
   *   expired or revoked is free reconnaissance.
   */
  async validate(bearer: string): Promise<Principal> {
    const token = stripBearer(bearer);
    if (token === undefined) throw sessionExpired();

    let claims: AccessTokenClaims;
    try {
      const { payload } = await jose.jwtVerify(token, this.key(), {
        algorithms: [JWT_ALG],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      claims = payload as AccessTokenClaims;
    } catch {
      throw sessionExpired();
    }

    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string') {
      throw sessionExpired();
    }

    // THE REVOCATION CHECK. Every request, against the database.
    const session = await this.prisma.sessions.findUnique({
      where: { id: claims.sid },
      select: {
        id: true,
        user_id: true,
        mfa_satisfied: true,
        revoked_at: true,
        expires_at: true,
      },
    });

    if (
      session === null ||
      session.revoked_at !== null ||
      session.expires_at.getTime() <= Date.now() ||
      session.user_id !== claims.sub
    ) {
      throw sessionExpired();
    }

    const principal = await this.entitlements.resolve(session.user_id);

    return {
      ...principal,
      session_id: session.id,
      mfa_satisfied: session.mfa_satisfied,
    };
  }

  /**
   * Rotate a refresh token: revoke the presented session, issue a new one.
   *
   * @throws {RefreshReuseDetected} when the token matches a session that was
   *   already revoked — the caller turns this into a full revocation plus an
   *   audit event, which it must do inside its own transaction.
   * @throws `401 AUTH_SESSION_EXPIRED` when the token matches nothing.
   */
  async rotate(refreshToken: string): Promise<RotatedSession> {
    const presentedHash = hashToken(refreshToken);

    // Look the session up BY HASH. Scanning candidate rows and comparing in
    // the application would be the version of this that leaks timing; the
    // index lookup is both faster and constant with respect to the secret.
    const candidates = await this.prisma.sessions.findMany({
      where: { refresh_token_hash: presentedHash },
      select: {
        id: true,
        user_id: true,
        mfa_satisfied: true,
        revoked_at: true,
        expires_at: true,
        refresh_token_hash: true,
      },
      orderBy: { issued_at: 'desc' },
      take: 2,
    });

    // Constant-time confirmation of the match. The lookup above already used
    // equality, so this is belt-and-braces — but the comparison that decides
    // whether a credential is accepted should not be a `===` on a secret,
    // and writing it correctly here means nobody later copies a `===` out of
    // this file into somewhere it matters more.
    const session = candidates.find((row) =>
      constantTimeEquals(row.refresh_token_hash, presentedHash),
    );

    if (session === undefined) throw sessionExpired();

    if (session.revoked_at !== null) {
      // Already rotated or explicitly revoked, and someone is presenting it
      // again. Either an attacker is replaying a stolen token or the real
      // user is replaying one an attacker already spent — indistinguishable
      // from here, and both are compromise.
      this.logger.warn(
        `Refresh token reuse detected for user ${session.user_id}; ` +
          `revoking all sessions.`,
      );
      throw new RefreshReuseDetected(session.user_id);
    }

    if (session.expires_at.getTime() <= Date.now()) throw sessionExpired();

    await this.revoke(session.id);
    const issued = await this.issue(session.user_id, session.mfa_satisfied);

    return {
      session_token: issued.session_token,
      refresh_token: issued.refresh_token,
      session_id: issued.session_id,
      expires_in: issued.expires_in,
    };
  }

  /** Revoke one session. Idempotent — revoking twice is not an error. */
  async revoke(sessionId: string): Promise<void> {
    await this.prisma.sessions.updateMany({
      where: { id: sessionId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  /**
   * Revoke every live session for a user, and drop their cached principal.
   *
   * `FRD/F00` Process step 7: "On role or scope-attribute change … active
   * sessions are invalidated and the user must re-authenticate to receive
   * updated entitlements."
   *
   * The cache invalidation is not incidental. Revoking sessions without
   * dropping the cached `Principal` would leave a window in which a *new*
   * session still resolves the stale entitlement set — so the two always
   * happen together. See `EntitlementResolverService.invalidate`.
   */
  async revokeAllForUser(userId: string): Promise<number> {
    const { count } = await this.prisma.sessions.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    await this.entitlements.invalidate(userId);
    return count;
  }

  /** Live sessions for a user, oldest first. */
  async activeSessions(
    userId: string,
  ): Promise<{ id: string; issued_at: Date }[]> {
    return this.prisma.sessions.findMany({
      where: {
        user_id: userId,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      select: { id: true, issued_at: true },
      orderBy: { issued_at: 'asc' },
    });
  }

  /**
   * Revoke oldest sessions until issuing one more stays within the limit.
   *
   * A loop rather than a single revoke: the limit is configuration and can be
   * lowered, at which point a user may already hold more sessions than the
   * new limit allows.
   */
  private async enforceConcurrencyLimit(
    userId: string,
    limit: number,
  ): Promise<void> {
    if (!Number.isFinite(limit) || limit <= 0) return;

    const active = await this.activeSessions(userId);
    const excess = active.length - (limit - 1);
    if (excess <= 0) return;

    for (const session of active.slice(0, excess)) {
      await this.revoke(session.id);
    }
  }

  private async signAccessToken(
    userId: string,
    sessionId: string,
    mfaSatisfied: boolean,
    ttlSeconds: number,
  ): Promise<string> {
    return new jose.SignJWT({ sid: sessionId, mfa: mfaSatisfied })
      .setProtectedHeader({ alg: JWT_ALG })
      .setSubject(userId)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${Math.floor(ttlSeconds)}s`)
      .sign(this.key());
  }
}

/** SHA-256 of a token, hex-encoded. What lands in `refresh_token_hash`. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Length-safe constant-time string comparison.
 *
 * {@link timingSafeEqual} throws on a length mismatch, which would itself be
 * a timing signal, so both sides are hashed to a fixed width first.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

function stripBearer(header: string | undefined): string | undefined {
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() === '' ? undefined : match?.[1];
}

function sessionExpired(): ApiException {
  return new ApiException(
    401,
    'AUTH_SESSION_EXPIRED',
    AUTH_SESSION_EXPIRED_MESSAGE,
  );
}
