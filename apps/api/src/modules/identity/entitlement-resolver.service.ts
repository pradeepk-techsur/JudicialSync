import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';

import {
  Principal,
  RoleAssignment,
  ScopeAttribute,
} from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REDIS_CLIENT } from './redis.provider';
import { SessionConfigService } from './session-config.service';

/**
 * ============================================================================
 * THE PRINCIPAL — roles, scopes, and separately granted entitlements
 * ============================================================================
 *
 * Builds the `Principal` that every authorization decision in the system
 * consumes. Three independent reads, and the third one is the one that
 * matters.
 *
 * ## The rule that shapes this file
 *
 * CONTEXT, verbatim:
 *
 *   > "Role-bundled defaults were rejected — a default bundle silently
 *   > becomes implied access."
 *
 *   > "Role existence must never imply access. This is a hard constraint, and
 *   > must be proven by test, not merely asserted in a document."
 *
 * So `entitlements` comes from `entitlement_grants` and from nothing else.
 * There is no lookup table from role to entitlement, no default bundle, no
 * "every judge obviously needs case_read" convenience, and no code path by
 * which a `user_roles` row contributes to the returned array.
 *
 * This is why the resolution below looks incomplete to a reader expecting
 * roles to carry permissions. It is not incomplete — the missing mapping is
 * the feature. `jury_admin` is seeded holding a legitimate role and zero
 * grants precisely so that the constraint is falsifiable: it authenticates
 * successfully and is denied everything, and the named test in
 * `auth-entitlements.e2e-spec.ts` fails the moment that stops being true.
 *
 * ## The pairing rule for cache invalidation
 *
 * **Changing what a user may do must always BOTH invalidate this cache AND
 * revoke that user's sessions.** Doing only one leaves a window in which a
 * revoked entitlement is still honoured:
 *
 *   - invalidate without revoke → the user's live session re-resolves and
 *     picks up the change, but any `Principal` already attached to an
 *     in-flight request is stale;
 *   - revoke without invalidate → the user re-authenticates and their *new*
 *     session resolves from a cache still holding the old entitlement set,
 *     which is the worse of the two because it looks like it worked.
 *
 * Plan 01-08 calls {@link invalidate} alongside
 * `SessionService.revokeAllForUser` on every grant, revoke, role assignment
 * and scope change. `revokeAllForUser` already calls `invalidate` itself, so
 * the safe path is the short one.
 */
@Injectable()
export class EntitlementResolverService {
  private readonly logger = new Logger(EntitlementResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SessionConfigService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /** Redis key for a user's cached principal. */
  private key(userId: string): string {
    return `principal:${userId}`;
  }

  /**
   * Resolve the `Principal` for a user, via a short-lived cache.
   *
   * The returned `session_id` is a placeholder — the caller
   * (`SessionService.validate`) overwrites it with the real one, because the
   * cache is per-user and a user may hold several sessions.
   */
  async resolve(userId: string): Promise<Principal> {
    const cached = await this.readCache(userId);
    if (cached !== undefined) return cached;

    const principal = await this.resolveUncached(userId);
    await this.writeCache(userId, principal);
    return principal;
  }

  /** Read straight through, bypassing the cache. */
  async resolveUncached(userId: string): Promise<Principal> {
    const [roleRows, scopeRows, grantRows] = await Promise.all([
      // --- roles: organisational facts, NOT permissions -------------------
      this.prisma.user_roles.findMany({
        where: { user_id: userId, revoked_at: null },
        select: {
          court_id: true,
          division_id: true,
          role: { select: { role_name: true } },
        },
      }),

      // --- scopes: where a principal may act, not what they may do --------
      this.prisma.scope_assignments.findMany({
        where: { user_id: userId },
        select: { scope_type: true, scope_value: true, scope_enum_value: true },
      }),

      // ==================================================================
      // ENTITLEMENTS — FROM `entitlement_grants` ONLY.
      //
      // CONTEXT: "Role-bundled defaults were rejected — a default bundle
      // silently becomes implied access," and "Role existence must never
      // imply access. This is a hard constraint, and must be proven by
      // test, not merely asserted in a document."
      //
      // If you are here to add a role-to-entitlement mapping because some
      // role "obviously" needs an entitlement: that is the exact change
      // this comment exists to stop. Grant it explicitly to the user
      // instead — a grant has a grantor, a timestamp, an approving request
      // and an audit event, and a bundle has none of those.
      //
      // `revoked_at: null` is load-bearing too: grants are append-only and
      // revocation is expressed by that column, so omitting it would make
      // revocation silently ineffective.
      // ==================================================================
      this.prisma.entitlement_grants.findMany({
        where: { user_id: userId, revoked_at: null },
        select: { entitlement_key: true },
      }),
    ]);

    const roles: RoleAssignment[] = roleRows.map((row) => ({
      role_name: row.role.role_name as RoleAssignment['role_name'],
      ...(row.court_id !== null ? { court_id: row.court_id } : {}),
      ...(row.division_id !== null ? { division_id: row.division_id } : {}),
    }));

    const scopes: ScopeAttribute[] = scopeRows.map((row) => ({
      scope_type: row.scope_type as ScopeAttribute['scope_type'],
      ...(row.scope_value !== null ? { scope_value: row.scope_value } : {}),
      ...(row.scope_enum_value !== null
        ? { scope_enum_value: row.scope_enum_value }
        : {}),
    }));

    // Deduplicated: the same entitlement may be granted at several scopes,
    // and the Principal reports *which* entitlements are held. Scope-aware
    // evaluation is the PDP's job (plan 01-07), not this array's.
    const entitlements = [
      ...new Set(grantRows.map((row) => row.entitlement_key)),
    ].sort();

    return {
      user_id: userId,
      session_id: '',
      mfa_satisfied: false,
      roles,
      scopes,
      entitlements,
    };
  }

  /**
   * Drop the cached principal for a user.
   *
   * **Always pair this with `SessionService.revokeAllForUser`** — see the
   * class comment for what each one alone leaves exposed. Plan 01-08 calls it
   * on every grant, revoke, role assignment and scope change.
   */
  async invalidate(userId: string): Promise<void> {
    if (this.redis === undefined) return;
    try {
      await this.redis.del(this.key(userId));
    } catch (error) {
      // A cache that cannot be cleared is a correctness problem, not a
      // performance one: it means a revoked entitlement stays honoured for
      // up to the cache window. Log loudly rather than swallowing it.
      this.logger.error(
        `Failed to invalidate cached principal for ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }. A revoked entitlement may remain honoured until the key expires.`,
      );
    }
  }

  private async readCache(userId: string): Promise<Principal | undefined> {
    if (this.redis === undefined) return undefined;
    try {
      const raw = await this.redis.get(this.key(userId));
      return raw === null ? undefined : (JSON.parse(raw) as Principal);
    } catch {
      // A cache miss and a cache failure are the same thing to the caller:
      // resolve from the database. Failing the request instead would make
      // Redis a hard dependency of every authenticated call.
      return undefined;
    }
  }

  private async writeCache(userId: string, principal: Principal): Promise<void> {
    if (this.redis === undefined) return;
    try {
      // The TTL is `claim_cache_seconds`, READ FROM THE DATABASE on every
      // write — the "configurable short cache window, default 5 minutes" of
      // FRD/F00 Validation and TechArch/04-security.md §7.2. Hardcoding 300
      // here would make the configuration row decorative, which is what
      // CONTEXT's "never from hardcoded constants" rules out.
      const { claim_cache_seconds } = await this.config.get();
      await this.redis.set(
        this.key(userId),
        JSON.stringify(principal),
        'EX',
        Math.max(1, Math.floor(claim_cache_seconds)),
      );
    } catch (error) {
      this.logger.warn(
        `Could not cache principal for ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
