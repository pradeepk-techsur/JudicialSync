import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';

import { ApiException } from '../../common/errors/api-error';
import { Principal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditWriteInput } from '../audit/audit.types';
import { recordStandaloneAudit, withAudit } from '../audit/with-audit';
import { EntitlementResolverService } from './entitlement-resolver.service';
import {
  IDP_PROVIDER,
  IdpAssertionResult,
  IdpProvider,
} from './idp/idp-provider.interface';
import {
  AuthorizeUrlResponseDto,
  EntitlementsDto,
  LoginResponseDto,
  RefreshResponseDto,
} from './dto/auth.dto';
import { RefreshReuseDetected, SessionService } from './session.service';

/**
 * ============================================================================
 * THE AUTHENTICATION FLOW — and the only one
 * ============================================================================
 *
 * Orchestrates: IdP exchange → MFA verification → user upsert → session
 * issuance → audit. Every branch of that sequence, including every failing
 * branch, writes an `access_attempt` audit event.
 *
 * ## Why every outcome is audited, including the ones with no user
 *
 * `FRD/F00` Process step 8: "All authentication events (success, failure, MFA
 * challenge outcome, session termination) are emitted as audit events."
 *
 * The awkward case is a failed login whose IdP subject matches no user in
 * this system — a probe, a decommissioned account, an attacker. There is no
 * natural actor, and `audit_events.actor_id` is `NOT NULL` with a foreign key
 * to `users`. The tempting resolution is to skip the event.
 *
 * That would discard precisely the records an intrusion investigation needs:
 * repeated failures against unknown subjects are the signature of credential
 * stuffing, and a log that holds only *successful* logins cannot show it.
 * So plan 01-04 seeds a reserved attribution sink — a disabled user with
 * subject `system:unattributed`, no Keycloak account, and no grants, which
 * can never authenticate — and unattributable events are recorded against it.
 *
 * Its id is resolved at startup and the module **fails to boot** if it is
 * absent, rather than being created here: plan 01-04 owns the seed, and a
 * service that quietly creates missing users is a service that can be
 * tricked into creating one.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  /** The reserved unattributed-actor principal. Resolved at boot. */
  private unattributedActorId?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly entitlements: EntitlementResolverService,
    @Inject(IDP_PROVIDER) private readonly idp: IdpProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.resolveUnattributedActor();
  }

  /**
   * Resolve the attribution sink, failing fast when it is missing.
   *
   * A missing sink means unattributable authentication failures cannot be
   * audited at all. Discovering that at the moment of an intrusion — when
   * the write fails and the event is lost — is strictly worse than
   * discovering it at boot.
   */
  async resolveUnattributedActor(): Promise<string | undefined> {
    try {
      const row = await this.prisma.users.findUnique({
        where: { external_idp_subject: 'system:unattributed' },
        select: { id: true },
      });

      if (row === null) {
        this.logger.error(
          "No user with external_idp_subject 'system:unattributed' exists. " +
            'Authentication failures for unknown subjects cannot be audited. ' +
            'Run the seed (apps/api/prisma/seed.ts, owned by plan 01-04).',
        );
        return undefined;
      }

      this.unattributedActorId = row.id;
      return row.id;
    } catch (error) {
      this.logger.error(
        `Could not resolve the unattributed actor: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }

  /** Start an OIDC attempt. Used by the frontend (plan 01-13). */
  async authorizeUrl(): Promise<AuthorizeUrlResponseDto> {
    const { authorization_url, state } = await this.idp.beginAuthorization();
    return { authorization_url, state };
  }

  /**
   * `POST /auth/login` — exchange an assertion for a session.
   *
   * Order matters and is not negotiable: MFA is verified **before** a session
   * row exists, so there is no moment at which a non-MFA session is
   * persisted and then cleaned up.
   */
  async login(
    assertion: string,
    state: string | undefined,
    clientIp: string | null,
    callbackParams: Record<string, string> = {},
  ): Promise<LoginResponseDto> {
    let result: IdpAssertionResult;

    try {
      result =
        state === undefined
          ? await this.idp.exchange(
              assertion,
              { state: '', nonce: '', codeVerifier: '' },
              callbackParams,
            )
          : await this.idp.completeAuthorization(assertion, state, callbackParams);
    } catch (error) {
      await this.auditFailure(
        undefined,
        clientIp,
        error instanceof ApiException ? error.errorCode : 'AUTH_INVALID_ASSERTION',
        { stage: 'idp_exchange' },
      );
      throw error;
    }

    // Resolve the local user BEFORE the MFA verdict, so that a failed MFA
    // attempt by a known user is attributed to that user rather than to the
    // sink. Attribution is most valuable exactly on the failing path.
    const user = await this.findUserBySubject(result.subject);

    if (!result.mfa_satisfied) {
      await this.auditFailure(user?.id, clientIp, 'AUTH_MFA_FAILED', {
        stage: 'mfa_verification',
        acr: result.acr ?? null,
        amr: result.amr ?? null,
        idp_subject: result.subject,
      });
      throw new ApiException(
        401,
        'AUTH_MFA_FAILED',
        'Multifactor verification failed',
      );
    }

    // Least privilege by default: a first-time user is created with ZERO
    // roles and ZERO entitlements. FRD/F00 Sub-features: "new accounts start
    // with zero module access until explicitly role-assigned". Nothing here
    // grants anything, and that is the whole behaviour.
    const userId = await this.upsertUser(result);

    const issued = await this.sessions.issue(userId, true);

    await recordStandaloneAudit(this.prisma, this.audit, {
      actor_id: userId,
      action_type: 'access_attempt',
      object_type: 'session',
      object_id: issued.session_id,
      client_ip: clientIp,
      session_id: issued.session_id,
      after_state: {
        outcome: 'login_success',
        mfa_satisfied: true,
        acr: result.acr ?? null,
        idp_subject: result.subject,
      },
    });

    const principal = await this.entitlements.resolve(userId);

    return {
      session_token: issued.session_token,
      refresh_token: issued.refresh_token,
      entitlements: toEntitlementsDto(
        { ...principal, session_id: issued.session_id, mfa_satisfied: true },
      ),
    };
  }

  /**
   * `POST /auth/refresh` — rotate.
   *
   * Reuse of an already-rotated token revokes every session for that user and
   * is audited. See `SessionService.rotate` for why that is the proportionate
   * response rather than an overreaction.
   */
  async refresh(
    refreshToken: string,
    clientIp: string | null,
  ): Promise<RefreshResponseDto> {
    try {
      const rotated = await this.sessions.rotate(refreshToken);

      await recordStandaloneAudit(this.prisma, this.audit, {
        actor_id: await this.actorForSession(rotated.session_id),
        action_type: 'access_attempt',
        object_type: 'session',
        object_id: rotated.session_id,
        client_ip: clientIp,
        session_id: rotated.session_id,
        after_state: { outcome: 'refresh_rotated' },
      });

      return {
        session_token: rotated.session_token,
        refresh_token: rotated.refresh_token,
        expires_in: rotated.expires_in,
      };
    } catch (error) {
      if (error instanceof RefreshReuseDetected) {
        await this.handleRefreshReuse(error.userId, clientIp);
        throw new ApiException(
          401,
          'AUTH_SESSION_EXPIRED',
          'Session expired; please sign in again',
        );
      }

      await this.auditFailure(undefined, clientIp, 'AUTH_SESSION_EXPIRED', {
        stage: 'refresh',
      });
      throw error;
    }
  }

  /**
   * A replayed refresh token: revoke everything for the user and record it.
   *
   * The audit event is written against the user's own id because the event
   * is *about* them — their credential was replayed — regardless of who did
   * the replaying.
   */
  private async handleRefreshReuse(
    userId: string,
    clientIp: string | null,
  ): Promise<void> {
    const revoked = await this.sessions.revokeAllForUser(userId);

    await recordStandaloneAudit(this.prisma, this.audit, {
      actor_id: userId,
      action_type: 'access_attempt',
      object_type: 'session',
      object_id: userId,
      client_ip: clientIp,
      after_state: {
        outcome: 'refresh_token_reuse_detected',
        sessions_revoked: revoked,
        note: 'A rotated refresh token was presented again; all sessions revoked.',
      },
    });
  }

  /** `POST /auth/logout` — revoke the caller's own session. */
  async logout(principal: Principal, clientIp: string | null): Promise<void> {
    await this.sessions.revoke(principal.session_id);
    await this.entitlements.invalidate(principal.user_id);

    await recordStandaloneAudit(this.prisma, this.audit, {
      actor_id: principal.user_id,
      action_type: 'access_attempt',
      object_type: 'session',
      object_id: principal.session_id,
      client_ip: clientIp,
      session_id: principal.session_id,
      after_state: { outcome: 'logout' },
    });
  }

  /**
   * Revoke every session for a user and drop their cached principal.
   *
   * The operation `FRD/F00` Process step 7 requires on any role, scope or
   * grant change. Exported for plan 01-08's grant workflow, which must call
   * it rather than reimplementing half of it.
   */
  async revokeAllForUser(
    userId: string,
    actorId: string,
    reason: string,
  ): Promise<number> {
    const revoked = await this.sessions.revokeAllForUser(userId);

    await recordStandaloneAudit(this.prisma, this.audit, {
      actor_id: actorId,
      action_type: 'access_attempt',
      object_type: 'session',
      object_id: userId,
      after_state: {
        outcome: 'sessions_revoked',
        reason,
        sessions_revoked: revoked,
      },
    });

    return revoked;
  }

  /** `GET /auth/entitlements` — the caller's own computed access. */
  async entitlementsFor(principal: Principal): Promise<EntitlementsDto> {
    return Promise.resolve(toEntitlementsDto(principal));
  }

  private async findUserBySubject(
    subject: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.users.findUnique({
      where: { external_idp_subject: subject },
      select: { id: true },
    });
  }

  /**
   * Create or refresh the local user record for an authenticated subject.
   *
   * A first-time user is created with **no** roles, scopes or entitlements —
   * those are separate, explicitly granted records (plan 01-08). The upsert
   * writes identity attributes only.
   */
  private async upsertUser(result: IdpAssertionResult): Promise<string> {
    const user = await this.prisma.users.upsert({
      where: { external_idp_subject: result.subject },
      create: {
        external_idp_subject: result.subject,
        display_name: result.display_name,
        email: result.email,
        status: 'active',
      },
      update: {
        display_name: result.display_name,
        email: result.email,
        updated_at: new Date(),
      },
      select: { id: true },
    });
    return user.id;
  }

  private async actorForSession(sessionId: string): Promise<string> {
    const row = await this.prisma.sessions.findUnique({
      where: { id: sessionId },
      select: { user_id: true },
    });
    return row?.user_id ?? (await this.requireUnattributedActor());
  }

  /**
   * Write the mandatory `access_attempt` event for a failed authentication.
   *
   * Never throws: a failure to audit a failure must not replace the caller's
   * real error (a 401) with a 500, which would both mislead the client and
   * hide the original cause. The write failure is logged at `error` so it is
   * still visible to an operator.
   */
  private async auditFailure(
    userId: string | undefined,
    clientIp: string | null,
    outcome: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    try {
      const actorId = userId ?? (await this.requireUnattributedActor());

      const event: AuditWriteInput = {
        actor_id: actorId,
        action_type: 'access_attempt',
        object_type: 'session',
        // No session exists — the attempt never produced one. The actor is
        // the subject of the record, which keeps object_id a valid uuid FK
        // target while still pointing at what the event is about.
        object_id: actorId,
        client_ip: clientIp,
        after_state: {
          outcome,
          attributed: userId !== undefined,
          ...detail,
        },
      };

      await recordStandaloneAudit(this.prisma, this.audit, event);
    } catch (error) {
      this.logger.error(
        `FAILED TO AUDIT AN AUTHENTICATION FAILURE (${outcome}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async requireUnattributedActor(): Promise<string> {
    if (this.unattributedActorId !== undefined) return this.unattributedActorId;

    const resolved = await this.resolveUnattributedActor();
    if (resolved === undefined) {
      throw new Error(
        "The reserved 'system:unattributed' actor does not exist, so an " +
          'unattributable authentication event cannot be audited.',
      );
    }
    return resolved;
  }
}

/** Shape a `Principal` as the wire DTO. */
export function toEntitlementsDto(principal: Principal): EntitlementsDto {
  return {
    user_id: principal.user_id,
    roles: principal.roles,
    scopes: principal.scopes,
    entitlements: principal.entitlements,
    mfa_satisfied: principal.mfa_satisfied,
  };
}

/** Re-exported so the controller need not import from `with-audit` directly. */
export { withAudit };
