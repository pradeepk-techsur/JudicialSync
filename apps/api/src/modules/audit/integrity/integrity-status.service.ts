import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { ChainVerificationResult } from './chain-verifier.service';

/** The last-verification summary, as `/audit/integrity/status` returns it. */
export interface IntegrityStatus {
  chain_verified: boolean;
  last_verified_at: string | null;
  open_alert_count: number;
}

/** The Redis key the last-result summary is stored under. */
const STATUS_KEY = 'audit:integrity:last-result';

/**
 * ============================================================================
 * LAST-VERIFICATION STATE, SO `/status` NEED NOT RE-WALK
 * ============================================================================
 *
 * `Screen-17` shows an always-visible "🔒 Chain verified ✓" badge and a "Chain
 * broken" critical state. That badge cannot trigger a full chain re-walk on
 * every page load — a re-walk is expensive by design (it streams the whole
 * append-only table). So the scheduled job records its outcome here and
 * `/audit/integrity/status` reads the recorded outcome, falling back to the
 * authoritative `integrity_alerts` count when the cache is cold.
 *
 * Redis is a cache, not a system of record: the open-alert count always comes
 * from the database, and a cold or unavailable cache degrades
 * `last_verified_at` to `null` (honestly "not verified recently") rather than
 * to a stale or fabricated timestamp. The persistent `integrity_alerts` rows
 * are the real record of any break; losing Redis loses only the "when did we
 * last look" convenience, never the finding itself.
 */
@Injectable()
export class IntegrityStatusService {
  private readonly logger = new Logger(IntegrityStatusService.name);
  private readonly redis: Redis | undefined;

  constructor(private readonly prisma: PrismaService) {
    const url = process.env.REDIS_URL;
    if (url === undefined || url.trim() === '') {
      this.logger.warn(
        'REDIS_URL is not set; integrity status will report last_verified_at=null ' +
          'and read the open-alert count from the database directly.',
      );
      this.redis = undefined;
    } else {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
      });
      // A failed connection must not crash the process — status degrades to the
      // DB-backed answer. Attach a handler so an ECONNREFUSED is logged, not
      // thrown as an unhandled 'error' event.
      this.redis.on('error', (err) => {
        this.logger.warn(`Integrity status Redis unavailable: ${err.message}`);
      });
    }
  }

  /** Record the outcome of a verification run. */
  async recordResult(result: ChainVerificationResult): Promise<void> {
    if (this.redis === undefined) return;
    try {
      await this.redis.set(
        STATUS_KEY,
        JSON.stringify({
          verified: result.verified,
          rows_checked: result.rows_checked,
          break_count: result.breaks.length,
          verified_at: new Date().toISOString(),
        }),
      );
    } catch (error) {
      // Non-fatal: the finding is already in integrity_alerts; only the "when"
      // convenience is lost.
      this.logger.warn(
        `Failed to record integrity status in Redis: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * The current integrity status.
   *
   * `open_alert_count` is ALWAYS read from the database — it is the
   * authoritative signal and must never come from a cache that could be stale or
   * absent. `chain_verified` is `false` whenever an open alert exists, so a
   * recorded `verified: true` can never mask a persisted break. `last_verified_at`
   * comes from the cache and is `null` when it is cold or unreachable.
   */
  async getStatus(): Promise<IntegrityStatus> {
    const openAlertCount = await this.prisma.integrity_alerts.count({
      where: { status: 'open' },
    });

    let lastVerifiedAt: string | null = null;
    if (this.redis !== undefined) {
      try {
        const raw = await this.redis.get(STATUS_KEY);
        if (raw !== null) {
          const parsed = JSON.parse(raw) as { verified_at?: string };
          lastVerifiedAt = parsed.verified_at ?? null;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to read integrity status from Redis: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      // An open alert means the chain is broken regardless of what the cache
      // last recorded — the database is authoritative.
      chain_verified: openAlertCount === 0,
      last_verified_at: lastVerifiedAt,
      open_alert_count: openAlertCount,
    };
  }
}
