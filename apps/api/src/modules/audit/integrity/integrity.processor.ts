import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

import { ChainVerifierService } from './chain-verifier.service';
import { IntegrityStatusService } from './integrity-status.service';

/** The BullMQ queue name for hash-chain verification. */
export const AUDIT_INTEGRITY_QUEUE = 'audit-integrity';

/** Job names. */
export const INCREMENTAL_JOB = 'verify-incremental';
export const FULL_JOB = 'verify-full';
export const ON_DEMAND_JOB = 'verify-on-demand';

/** Default cadence when `AUDIT_INTEGRITY_INTERVAL_MS` is unset. */
const DEFAULT_INTERVAL_MS = 900_000; // 15 minutes

/** The daily full re-walk, in ms. */
const FULL_INTERVAL_MS = 86_400_000; // 24 hours

/**
 * How far back an incremental run looks.
 *
 * An incremental window must comfortably overlap the interval between runs so a
 * row written just before one run and verified by the next is never skipped. Two
 * intervals of overlap (bounded to a floor) is cheap — verifying a row twice is
 * harmless — and the alternative (a gap) is not: a skipped row is a row whose
 * tamper the incremental pass never examines.
 */
function incrementalWindowMs(intervalMs: number): number {
  return Math.max(intervalMs * 2, 60_000);
}

/**
 * ============================================================================
 * THE SCHEDULED HASH-CHAIN VERIFICATION WORKER
 * ============================================================================
 *
 * `TechArch/05-tech-stack.md` §8.2 lists "audit hash-chain verification job"
 * among BullMQ's purposes, and §7.3 requires the job "re-walks the entire chain
 * (or an incremental window)". This worker runs {@link ChainVerifierService}
 * on two repeatable schedules:
 *
 *  - **incremental**, every `AUDIT_INTEGRITY_INTERVAL_MS` (default 15 min) —
 *    cheap, frequent, catches a recent edit quickly; and
 *  - **full**, daily — the only run that checks `chain_head`, so it is the one
 *    that catches a deleted tail (see `ChainVerifierService.verify`).
 *
 * ## The schedule switch is NOT a verification bypass
 *
 * `AUDIT_INTEGRITY_SCHEDULE_ENABLED=false` stops the repeatable jobs from being
 * registered. It does **not** disable verification: {@link ChainVerifierService.verify}
 * remains fully callable, the on-demand `POST /audit/integrity/verify` route
 * still works, and the e2e suite calls `verify()` directly. This is a scheduling
 * switch for tests that want to drive timing deterministically, not a flag that
 * turns the integrity check off — a flag that did the latter would be exactly
 * the kind of innocuous-looking switch that silently removes tamper detection in
 * production, so the distinction is stated here where someone changing this file
 * will read it.
 *
 * ## On-demand runs are rate-limited to one in flight
 *
 * The on-demand job uses a fixed `jobId`, so BullMQ coalesces concurrent
 * requests into a single run. A full re-walk is expensive; an unbounded trigger
 * would be a denial-of-service lever (threat T-01-54).
 */
@Processor(AUDIT_INTEGRITY_QUEUE)
export class IntegrityProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(IntegrityProcessor.name);

  constructor(
    @InjectQueue(AUDIT_INTEGRITY_QUEUE) private readonly queue: Queue,
    private readonly verifier: ChainVerifierService,
    private readonly status: IntegrityStatusService,
  ) {
    super();
  }

  /**
   * Register the repeatable jobs at boot, unless the schedule is disabled.
   *
   * Idempotent: BullMQ keys a repeatable job by its name + pattern, so
   * re-registering on every boot converges rather than duplicating.
   */
  onModuleInit(): void {
    if (process.env.AUDIT_INTEGRITY_SCHEDULE_ENABLED === 'false') {
      this.logger.log(
        'AUDIT_INTEGRITY_SCHEDULE_ENABLED=false — not registering the repeatable ' +
          'verification jobs. Verification remains callable on demand and in tests; ' +
          'this is a scheduling switch, not a verification bypass.',
      );
      return;
    }

    // Scheduling is deliberately NOT awaited here. `queue.add` runs on a BullMQ
    // connection with `maxRetriesPerRequest: null` (required for workers), so a
    // blocking `await` against an unreachable Redis would hang boot forever —
    // and the app must boot with no Redis (a hermetic test, a Redis outage).
    // Firing it in the background behind a bounded reachability probe keeps boot
    // non-blocking: the schedule arms when Redis is up and stays unarmed (logged)
    // when it is not, while the verifier itself remains callable regardless.
    void this.scheduleWhenReachable();
  }

  /**
   * Arm the repeatable jobs once Redis is confirmed reachable.
   *
   * The reachability probe is bounded (a `ping` with its own timeout) so this
   * never blocks and never hangs; if Redis is down the schedule is simply not
   * armed, which is logged. BullMQ keys a repeatable job by name + pattern, so
   * re-registering on every boot converges rather than duplicating.
   */
  private async scheduleWhenReachable(): Promise<void> {
    const intervalMs = this.intervalMs();
    try {
      const reachable = await this.pingWithTimeout(3_000);
      if (!reachable) {
        this.logger.warn(
          'Redis is not reachable; the repeatable integrity jobs are NOT armed. ' +
            'Verification remains available on demand. The schedule will not ' +
            're-arm until the next boot with a reachable Redis.',
        );
        return;
      }

      await this.queue.add(
        INCREMENTAL_JOB,
        {},
        { repeat: { every: intervalMs }, removeOnComplete: true, removeOnFail: 100 },
      );
      await this.queue.add(
        FULL_JOB,
        {},
        { repeat: { every: FULL_INTERVAL_MS }, removeOnComplete: true, removeOnFail: 100 },
      );
      this.logger.log(
        `Scheduled audit integrity verification: incremental every ${intervalMs}ms, ` +
          `full re-walk every ${FULL_INTERVAL_MS}ms.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to register repeatable integrity jobs: ${
          error instanceof Error ? error.message : String(error)
        }. Verification is still available on demand.`,
      );
    }
  }

  /** A `ping` against the queue's Redis client, bounded by `timeoutMs`. */
  private async pingWithTimeout(timeoutMs: number): Promise<boolean> {
    const deadline = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('redis ping timeout')), timeoutMs),
    );
    try {
      // BOTH awaits are bounded by the single deadline: resolving `queue.client`
      // can itself hang when the connection never reaches `ready` (ioredis with
      // `maxRetriesPerRequest: null` keeps retrying rather than rejecting), and
      // boot must not wait on it.
      const client = (await Promise.race([
        this.queue.client,
        deadline,
      ])) as unknown as { ping: () => Promise<string> };
      await Promise.race([client.ping(), deadline]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run one verification. The job name selects incremental vs full.
   */
  async process(job: Job): Promise<void> {
    const full = job.name === FULL_JOB || job.name === ON_DEMAND_JOB;

    const result = await this.verifier.verify(
      full ? {} : { fromOccurredAt: this.windowStart() },
    );
    await this.status.recordResult(result);

    if (result.verified) {
      this.logger.debug(
        `Integrity ${full ? 'full' : 'incremental'} verify OK ` +
          `(${result.rows_checked} rows).`,
      );
    }
    // A break is already logged at error and persisted by the verifier; nothing
    // more to do here. The job itself SUCCEEDS — it did its job, which was to
    // detect, not to be a failure signal. The alert is the signal.
  }

  /** Enqueue an on-demand run, coalescing concurrent requests via a fixed id. */
  async triggerOnDemand(): Promise<void> {
    await this.queue.add(
      ON_DEMAND_JOB,
      {},
      {
        jobId: ON_DEMAND_JOB, // fixed → at most one in flight (threat T-01-54)
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  private intervalMs(): number {
    const raw = process.env.AUDIT_INTEGRITY_INTERVAL_MS;
    const parsed = raw === undefined ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
  }

  private windowStart(): Date {
    return new Date(Date.now() - incrementalWindowMs(this.intervalMs()));
  }
}
