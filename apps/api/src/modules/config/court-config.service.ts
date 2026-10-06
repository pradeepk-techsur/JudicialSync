import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';

import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REDIS_CLIENT } from '../identity/redis.provider';
import {
  EffectiveCourtConfig,
  EffectiveCourtConfigSnapshotSchema,
} from './config.types';

/**
 * ============================================================================
 * THE SINGLE CONFIGURATION READ PATH
 * ============================================================================
 *
 * Every Phase 1 feature that needs a configurable value — the file-type
 * allowlist, the session timings, the claim cache window, the per-court
 * designation policy — reads it through this service. That is the whole point
 * of building it in Phase 1: CONTEXT requires features to "read configuration
 * from the database from day one, never from hardcoded constants," and a read
 * path exercised from the first commit is a read path Phase 2's Configuration
 * Engine can add versioning and maker-checker approval on top of without
 * revisiting every call site.
 *
 * ## There is no default. A missing or malformed snapshot is a loud failure.
 *
 * This is the property the service exists to hold (threat T-01-49). A silent
 * fallback to built-in defaults here would reintroduce exactly the hardcoded
 * constants CONTEXT rejected — and do it invisibly, so that a court whose
 * configuration failed to load would quietly run on developer defaults while
 * every screen looked normal. So:
 *
 *   - no published, currently-effective version for the court → `500
 *     CONFIG_NOT_FOUND`. The seed guarantees one exists, so its absence is a
 *     defect, not user error.
 *   - a `config_snapshot` that fails the `zod` schema → `500
 *     CONFIG_INVALID_SNAPSHOT`. A malformed snapshot that produced `undefined`
 *     deep inside a security check is precisely the failure the parse step
 *     turns into an immediate, diagnosable error.
 *
 * Both are `500`s because `FRD/Y2-errors.md` reserves the `CONFIG_*` internal
 * codes "for internal-guard violations that should structurally never occur."
 *
 * ## Caching, and who owns invalidation
 *
 * The resolved configuration is cached in Redis under `courtconfig:{courtId}`
 * with a short TTL (60s), so the hot read path does not hit two joins on every
 * request. {@link invalidate} clears a court's entry; **Phase 2's publish flow
 * owns calling it** when a new rule-package version is published. In Phase 1
 * nothing publishes, so the only invalidation is the TTL — and the cache-TTL
 * test changes a seeded value through the administrative connection and then
 * calls {@link invalidate} to observe the change immediately rather than
 * waiting out the window.
 *
 * A cache miss, or an absent Redis client, falls through to the database. The
 * cache is a latency optimisation over a system of record, never a source of
 * truth, so losing it degrades speed and not correctness.
 */
@Injectable()
export class CourtConfigService {
  private readonly logger = new Logger(CourtConfigService.name);

  /** Redis key TTL for a cached effective configuration, in seconds. */
  private static readonly CACHE_TTL_SECONDS = 60;

  constructor(
    private readonly prisma: PrismaService,
    // Optional for the same reason the identity module treats it so: a unit
    // test that never exercises a cache path need not stand up Redis. An
    // absent client means "always read through to the database," which is safe
    // — it can only make the read slower, never staler or wider.
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /** The Redis key for a court's cached effective configuration. */
  private cacheKey(courtId: string): string {
    return `courtconfig:${courtId}`;
  }

  /**
   * Resolve a court's currently-effective configuration.
   *
   * @throws {ApiException} 500 `CONFIG_NOT_FOUND` when the court has no
   *   published, currently-effective rule-package version.
   * @throws {ApiException} 500 `CONFIG_INVALID_SNAPSHOT` when the snapshot
   *   fails schema validation.
   */
  async getEffective(courtId: string): Promise<EffectiveCourtConfig> {
    const cached = await this.readCache(courtId);
    if (cached !== undefined) {
      return cached;
    }

    const effective = await this.resolveFromDatabase(courtId);
    await this.writeCache(courtId, effective);
    return effective;
  }

  /**
   * Drop a court's cached configuration.
   *
   * Phase 2's publish flow calls this after publishing a new version. It is a
   * no-op when Redis is absent, and it tolerates a Redis error rather than
   * failing the operation that triggered it: a stale cache entry self-heals in
   * at most {@link CourtConfigService.CACHE_TTL_SECONDS}, so a failed
   * invalidation is a bounded latency of staleness, not a correctness break.
   */
  async invalidate(courtId: string): Promise<void> {
    if (this.redis === undefined) return;
    try {
      await this.redis.del(this.cacheKey(courtId));
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate cached configuration for court ${courtId}: ${
          error instanceof Error ? error.message : String(error)
        }. It will expire within ${CourtConfigService.CACHE_TTL_SECONDS}s.`,
      );
    }
  }

  /**
   * The database read: the published, currently-effective version plus its
   * designation policies.
   *
   * Selection matches `ResourceLoaderService.effectiveSecurityConfig` exactly
   * — `published_at IS NOT NULL`, greatest `effective_from <= now()`,
   * tie-broken on greatest `version_number` — so the two read paths cannot
   * disagree about which version is in effect. (That duplication is itself a
   * follow-up: see the SUMMARY's note that 01-07's guard should switch to this
   * service.)
   */
  private async resolveFromDatabase(
    courtId: string,
  ): Promise<EffectiveCourtConfig> {
    const version = await this.prisma.rule_package_versions.findFirst({
      where: {
        court_id: courtId,
        published_at: { not: null },
        OR: [{ effective_from: null }, { effective_from: { lte: new Date() } }],
      },
      orderBy: [{ effective_from: 'desc' }, { version_number: 'desc' }],
      select: {
        id: true,
        version_number: true,
        config_snapshot: true,
        security_policies: {
          select: { designation: true, required_entitlement: true },
        },
      },
    });

    if (version === null) {
      // The seed guarantees a published version per court, so this is a defect
      // rather than user error. Failing loudly is the point — see the class
      // comment: a default here would be an invisible return to constants.
      this.logger.error(
        `No published, currently-effective rule-package version for court ` +
          `${courtId}. The seed guarantees one exists; its absence is a ` +
          `configuration defect, not a reason to substitute defaults.`,
      );
      throw new ApiException(
        500,
        'CONFIG_NOT_FOUND',
        'Court configuration is unavailable',
      );
    }

    const parsed = EffectiveCourtConfigSnapshotSchema.safeParse(
      version.config_snapshot,
    );
    if (!parsed.success) {
      this.logger.error(
        `config_snapshot for rule-package version ${version.id} (court ` +
          `${courtId}) failed validation: ` +
          `${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}. ` +
          `Refusing to substitute a default.`,
      );
      throw new ApiException(
        500,
        'CONFIG_INVALID_SNAPSHOT',
        'Court configuration is invalid',
      );
    }

    return {
      rule_package_version_id: version.id,
      version_number: version.version_number,
      file_type_allowlist: parsed.data.file_type_allowlist,
      session: parsed.data.session,
      max_upload_bytes: parsed.data.max_upload_bytes,
      security_policies: version.security_policies.map((row) => ({
        designation: row.designation,
        required_entitlement: row.required_entitlement,
      })),
    };
  }

  /** Read a cached configuration, or `undefined` on miss / absent Redis / error. */
  private async readCache(
    courtId: string,
  ): Promise<EffectiveCourtConfig | undefined> {
    if (this.redis === undefined) return undefined;
    try {
      const raw = await this.redis.get(this.cacheKey(courtId));
      if (raw === null) return undefined;
      return JSON.parse(raw) as EffectiveCourtConfig;
    } catch (error) {
      // A cache read failure is never fatal: fall through to the database.
      this.logger.warn(
        `Cache read failed for court ${courtId}; reading through to the ` +
          `database: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  /** Cache a resolved configuration under the short TTL. Best-effort. */
  private async writeCache(
    courtId: string,
    config: EffectiveCourtConfig,
  ): Promise<void> {
    if (this.redis === undefined) return;
    try {
      await this.redis.set(
        this.cacheKey(courtId),
        JSON.stringify(config),
        'EX',
        CourtConfigService.CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(
        `Cache write failed for court ${courtId}: ${
          error instanceof Error ? error.message : String(error)
        }. The next read will hit the database again.`,
      );
    }
  }
}
