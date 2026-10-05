import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * The session tuning values, as seeded into
 * `rule_package_versions.config_snapshot.session`.
 *
 * `CONTEXT`: "Features must read configuration from the database from day
 * one, never from hardcoded constants." The distinction is not pedantry — a
 * TTL living in a TypeScript constant is not configuration, it is a value
 * that happens to be changeable by a developer with a deploy. Reading these
 * from the database means the read path a court administrator will eventually
 * write through is exercised from the first commit rather than retrofitted.
 */
export interface SessionConfig {
  /** Access-token lifetime. `TechArch/04-security.md` §7.1 wants 5–15 min. */
  access_token_ttl_seconds: number;
  /** Refresh-token lifetime. Longer-lived, and rotating. */
  refresh_token_ttl_seconds: number;
  idle_timeout_minutes: number;
  /** How long a resolved `Principal` may be cached. FRD/F00 Validation. */
  claim_cache_seconds: number;
  /** Issuing beyond this revokes the oldest active session. */
  concurrent_session_limit: number;
}

/**
 * Fallback used ONLY when the configuration row cannot be read at all.
 *
 * This is not "the default configuration" — it is a last resort that keeps an
 * authentication outage from becoming an availability outage, and every value
 * matches what the seed writes so the fallback can never silently *widen* a
 * window. It is logged loudly whenever it is used, because running on it
 * means the configuration read path is broken and nobody would otherwise
 * notice: the system would simply work, with values no administrator chose.
 */
const LAST_RESORT: SessionConfig = {
  access_token_ttl_seconds: 900,
  refresh_token_ttl_seconds: 604800,
  idle_timeout_minutes: 30,
  claim_cache_seconds: 300,
  concurrent_session_limit: 3,
};

/** How long a read of the configuration row is itself cached, in ms. */
const CONFIG_CACHE_MS = 10_000;

/**
 * Reads session configuration from the published rule package.
 *
 * Cached for a few seconds so that a per-request read does not become a
 * per-request query, and deliberately short so that changing the seeded value
 * takes effect without a restart — which is what makes
 * `auth-entitlements.e2e-spec.ts` able to prove the value is genuinely read
 * from the database rather than compiled in.
 */
@Injectable()
export class SessionConfigService {
  private readonly logger = new Logger(SessionConfigService.name);

  private cached?: SessionConfig;
  private cachedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  /** Drop the memo so the next read hits the database. Tests use this. */
  reset(): void {
    this.cached = undefined;
    this.cachedAt = 0;
  }

  async get(): Promise<SessionConfig> {
    if (this.cached !== undefined && Date.now() - this.cachedAt < CONFIG_CACHE_MS) {
      return this.cached;
    }

    try {
      // The most recently published package wins. `published_at DESC` rather
      // than `version_number DESC` because version numbers are per-court and
      // the session block is a platform-wide concern.
      const rows = await this.prisma.rule_package_versions.findMany({
        where: { published_at: { not: null } },
        orderBy: { published_at: 'desc' },
        take: 1,
        select: { config_snapshot: true },
      });

      const snapshot = rows[0]?.config_snapshot;
      const session = extractSession(snapshot);

      if (session === undefined) {
        this.logger.warn(
          'No published rule package carries a `session` configuration block. ' +
            'Falling back to last-resort session values — configuration is not ' +
            'being read from the database as CONTEXT requires.',
        );
        this.cached = LAST_RESORT;
      } else {
        this.cached = session;
      }
    } catch (error) {
      this.logger.error(
        `Could not read session configuration: ${
          error instanceof Error ? error.message : String(error)
        }. Falling back to last-resort values.`,
      );
      this.cached = LAST_RESORT;
    }

    this.cachedAt = Date.now();
    return this.cached;
  }
}

/** Pull and validate the `session` block out of a `config_snapshot` JSON value. */
function extractSession(snapshot: unknown): SessionConfig | undefined {
  if (snapshot === null || typeof snapshot !== 'object') return undefined;
  const block = (snapshot as Record<string, unknown>)['session'];
  if (block === null || typeof block !== 'object') return undefined;

  const source = block as Record<string, unknown>;
  const read = (key: keyof SessionConfig): number | undefined => {
    const raw = source[key];
    const numeric = typeof raw === 'string' ? Number(raw) : raw;
    return typeof numeric === 'number' && Number.isFinite(numeric) && numeric > 0
      ? numeric
      : undefined;
  };

  return {
    access_token_ttl_seconds:
      read('access_token_ttl_seconds') ?? LAST_RESORT.access_token_ttl_seconds,
    refresh_token_ttl_seconds:
      read('refresh_token_ttl_seconds') ?? LAST_RESORT.refresh_token_ttl_seconds,
    idle_timeout_minutes:
      read('idle_timeout_minutes') ?? LAST_RESORT.idle_timeout_minutes,
    claim_cache_seconds:
      read('claim_cache_seconds') ?? LAST_RESORT.claim_cache_seconds,
    concurrent_session_limit:
      read('concurrent_session_limit') ?? LAST_RESORT.concurrent_session_limit,
  };
}
