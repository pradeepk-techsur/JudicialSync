import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { AUDIT_GENESIS_HASH, AuditWriteInput } from '../audit.types';
import { computeRowHash } from '../canonical-payload';

/** The three ways the chain can be broken, each detected independently. */
export type ChainBreakKind =
  | 'row_hash_mismatch'
  | 'prev_hash_mismatch'
  | 'chain_head_mismatch';

export interface ChainBreak {
  audit_event_id: string;
  kind: ChainBreakKind;
  expected_hash: string;
  actual_hash: string;
}

export interface ChainVerificationResult {
  verified: boolean;
  rows_checked: number;
  breaks: ChainBreak[];
}

/** Batch size for the streaming walk. */
const BATCH_SIZE = 1000;

/** The raw row shape the verifier reads. */
interface VerifierRow {
  id: string;
  actor_id: string;
  action_type: string;
  object_type: string;
  object_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  rule_version_ref: string | null;
  calculation_version_ref: string | null;
  client_ip: string | null;
  session_id: string | null;
  occurred_at: Date;
  prev_hash: string;
  row_hash: string;
}

/**
 * ============================================================================
 * THE INDEPENDENT HASH-CHAIN RE-WALK
 * ============================================================================
 *
 * `TechArch/04-security.md` §7.3 · `FRD/F02` · Phase 1 CONTEXT.
 *
 * Plan 01-05 writes the chain and plan 01-03's trigger recomputes each row's
 * hash at INSERT time. Neither proves the chain is INTACT afterward: the
 * trigger validates a row as it is written and never looks at it again, and a
 * tamper that bypasses the application (a direct `app_dba` UPDATE, a restore
 * from a doctored backup) leaves no trace the write path would notice. "Writing
 * a chain but never checking it leaves 'tamper-evident' unproven" (CONTEXT).
 * This service is the check.
 *
 * ## Why it recomputes in TypeScript rather than calling the DB function
 *
 * It recomputes each row's hash with {@link computeRowHash} — the TypeScript
 * implementation — NOT by calling `platform.compute_audit_row_hash`. This is
 * the single most important design decision in the file, and it is
 * deliberately the *more* expensive one.
 *
 * The threat is a compromised database. If the verifier asked the same SQL
 * function the trigger uses to recompute the hashes, then an attacker who could
 * rewrite an audit row could also rewrite that function to return whatever hash
 * makes the forgery validate — and the verifier would faithfully confirm the
 * tampered chain. An independent reimplementation closes that: forging a row
 * now requires defeating two implementations that must agree byte-for-byte.
 * Plan 01-05's parity corpus is what keeps the two honest — it fails CI the
 * moment they diverge on any fixture, so "independent" never degrades into
 * "subtly different and therefore full of false alarms".
 *
 * ## Three break kinds, all checked, none short-circuited
 *
 *  1. **`row_hash_mismatch`** — the row's content no longer hashes to its
 *     stored `row_hash`. Someone edited a field.
 *  2. **`prev_hash_mismatch`** — a row's `prev_hash` does not equal the
 *     preceding row's `row_hash` (genesis for the first). The linkage is cut.
 *  3. **`chain_head_mismatch`** — `audit_chain_head.last_row_hash` does not
 *     equal the final row's `row_hash`. **This is the one that catches a
 *     deleted tail**: removing the last N rows leaves a chain that is
 *     internally consistent but no longer matches the recorded head. A verifier
 *     that only checked each row in isolation would pass a truncated log.
 *
 * The walk does **not** stop at the first break. An operator who sees one break
 * will assume one row was touched; collecting every break in the window is what
 * shows the true extent of a tamper.
 *
 * ## It never writes back to the audit trail
 *
 * There is no code path here that rewrites, deletes or "corrects" an audit row.
 * The database would refuse it anyway (`app_rw` holds no UPDATE/DELETE on
 * `audit_events`, plan 01-03), and an audit trail that silently rewrote its own
 * mismatched rows would erase the very evidence it exists to preserve — the
 * `<verify>` grep over this directory asserts no such path exists. Detection
 * writes an alert and logs; that is all it does.
 */
@Injectable()
export class ChainVerifierService {
  private readonly logger = new Logger(ChainVerifierService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Re-walk the chain and report every break found.
   *
   * @param opts.fromOccurredAt when supplied, verify only rows at or after this
   *   instant (an incremental window). The row immediately BEFORE the window is
   *   read as the seed `prev_hash`, so an incremental run still validates the
   *   boundary linkage rather than trusting it. Omitted → a full re-walk from
   *   genesis. `TechArch/04-security.md` §7.3: the job "re-walks the entire
   *   chain (or an incremental window)."
   *
   *   The `chain_head_mismatch` check runs only on a FULL walk — the head
   *   reflects the whole chain's tail, which an incremental window by definition
   *   does not reach. A daily full re-walk is what catches tail deletion.
   */
  async verify(opts: { fromOccurredAt?: Date } = {}): Promise<ChainVerificationResult> {
    const full = opts.fromOccurredAt === undefined;
    const breaks: ChainBreak[] = [];
    let rowsChecked = 0;

    // The expected prev_hash for the next row. On a full walk it starts at
    // genesis; on an incremental walk it is the stored row_hash of the row
    // immediately before the window, so the boundary linkage is checked rather
    // than assumed.
    let expectedPrev = full
      ? AUDIT_GENESIS_HASH
      : await this.seedPrevHash(opts.fromOccurredAt as Date);

    let lastRowHash: string | null = null;
    let cursor: { occurred_at: Date; id: string } | null = null;

    for (;;) {
      const rows = await this.fetchBatch(cursor, opts.fromOccurredAt ?? null);
      if (rows.length === 0) break;

      for (const row of rows) {
        rowsChecked++;

        // 1. row_hash: does the content still hash to the stored value?
        const recomputed = computeRowHash(
          this.toInput(row),
          row.occurred_at,
          row.prev_hash,
        );
        if (recomputed !== row.row_hash) {
          breaks.push({
            audit_event_id: row.id,
            kind: 'row_hash_mismatch',
            expected_hash: recomputed,
            actual_hash: row.row_hash,
          });
        }

        // 2. prev_hash: does the linkage to the preceding row hold?
        //    `expectedPrev` is null only on the first incremental batch when the
        //    window starts at genesis (no preceding row) — handled by seeding
        //    it to genesis there, so it is never null here.
        if (row.prev_hash !== expectedPrev) {
          breaks.push({
            audit_event_id: row.id,
            kind: 'prev_hash_mismatch',
            expected_hash: expectedPrev,
            actual_hash: row.prev_hash,
          });
        }

        // The NEXT row's prev_hash should equal THIS row's stored row_hash.
        // Using the stored value (not the recomputed one) means a single
        // row_hash edit surfaces as one row_hash_mismatch here and one
        // prev_hash_mismatch on the following row — the pair that shows a tamper
        // in the middle breaks the chain in both directions, which is the honest
        // picture rather than a single ambiguous flag.
        expectedPrev = row.row_hash;
        lastRowHash = row.row_hash;
      }

      const last = rows[rows.length - 1];
      cursor = { occurred_at: last.occurred_at, id: last.id };

      // A short batch is the last batch.
      if (rows.length < BATCH_SIZE) break;
    }

    // 3. chain_head: on a full walk, the recorded head must match the final
    //    row's hash. This is the tail-deletion detector.
    if (full) {
      const headBreak = await this.checkChainHead(lastRowHash);
      if (headBreak !== null) breaks.push(headBreak);
    }

    const result: ChainVerificationResult = {
      verified: breaks.length === 0,
      rows_checked: rowsChecked,
      breaks,
    };

    if (!result.verified) {
      await this.persistAlerts(result);
    }

    return result;
  }

  // =========================================================================
  // Chain head
  // =========================================================================

  /**
   * Compare the recorded chain head against the final row's hash.
   *
   * `lastRowHash` is `null` when the table is empty, in which case the head must
   * be genesis — an empty chain whose head claims a non-genesis hash is itself a
   * `chain_head_mismatch` (every row was deleted).
   */
  private async checkChainHead(
    lastRowHash: string | null,
  ): Promise<ChainBreak | null> {
    const head = await this.prisma.audit_chain_head.findFirst({
      select: { last_row_hash: true, last_audit_event_id: true },
    });
    if (head === null) {
      // Unreachable against a migrated database — migration 20260101000000
      // seeds the single genesis head row. Treated as a break rather than
      // ignored: a missing head is a more severe tamper than a mismatched one.
      return {
        audit_event_id: AUDIT_GENESIS_HASH,
        kind: 'chain_head_mismatch',
        expected_hash: lastRowHash ?? AUDIT_GENESIS_HASH,
        actual_hash: '',
      };
    }

    const expectedHead = lastRowHash ?? AUDIT_GENESIS_HASH;
    if (head.last_row_hash !== expectedHead) {
      return {
        audit_event_id: head.last_audit_event_id ?? AUDIT_GENESIS_HASH,
        kind: 'chain_head_mismatch',
        expected_hash: expectedHead,
        actual_hash: head.last_row_hash,
      };
    }
    return null;
  }

  // =========================================================================
  // Alerts
  // =========================================================================

  /**
   * Persist one `critical` `integrity_alerts` row per break, and log
   * `AUDIT_CHAIN_BROKEN` at error.
   *
   * CONTEXT: "A detected break writes a persistent `integrity_alert` record …
   * Log-only was rejected as too easy to miss and leaving no audit-visible
   * trace of detection." `FRD/F02` Error States names the code `AUDIT_CHAIN_BROKEN`
   * and describes it as "500 (internal alert, not user-facing)" — it is never
   * returned to an end user; it is the operator-facing signal on the alert and
   * in the log.
   *
   * Phase 3 (F07) will route these exact rows into its work queue. This method
   * writes only `integrity_alerts` — no F07 table, no resolution workflow — it
   * records the finding and nothing more.
   */
  private async persistAlerts(result: ChainVerificationResult): Promise<void> {
    for (const brk of result.breaks) {
      await this.prisma.integrity_alerts.create({
        data: {
          alert_type: 'audit_integrity_break',
          severity: 'critical',
          // The genesis/head sentinels are not real audit_event ids; store null
          // rather than a value that would fail the (nullable) FK's shape.
          audit_event_id: this.isUuid(brk.audit_event_id)
            ? brk.audit_event_id
            : null,
          expected_hash: brk.expected_hash,
          actual_hash: brk.actual_hash,
          detail: {
            kind: brk.kind,
            audit_event_id: brk.audit_event_id,
            rows_checked: result.rows_checked,
            total_breaks: result.breaks.length,
          },
          status: 'open',
        },
      });
    }

    this.logger.error(
      `AUDIT_CHAIN_BROKEN: hash-chain verification found ${result.breaks.length} ` +
        `break(s) over ${result.rows_checked} row(s). Kinds: ${[
          ...new Set(result.breaks.map((b) => b.kind)),
        ].join(', ')}. ${result.breaks.length} critical integrity_alerts ` +
        `record(s) written (status=open). The audit trail has NOT been modified ` +
        `— detection records, it never writes back.`,
    );
  }

  // =========================================================================
  // Row reads
  // =========================================================================

  /**
   * One batch of rows in `(occurred_at, id)` order, strictly after `cursor`.
   *
   * Streaming in batches rather than loading the table is a correctness
   * requirement, not only a memory one: `audit_events` grows without bound (it
   * is append-only), so a full-table load would eventually OOM the worker and
   * silently stop the one job that proves the trail is intact.
   */
  private async fetchBatch(
    cursor: { occurred_at: Date; id: string } | null,
    fromOccurredAt: Date | null,
  ): Promise<VerifierRow[]> {
    const where: Record<string, unknown> = {};
    if (fromOccurredAt !== null) {
      where.occurred_at = { gte: fromOccurredAt };
    }

    const rows = await this.prisma.audit_events.findMany({
      where: cursor
        ? {
            ...where,
            OR: [
              { occurred_at: { gt: cursor.occurred_at } },
              {
                occurred_at: cursor.occurred_at,
                id: { gt: cursor.id },
              },
            ],
          }
        : where,
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
      select: {
        id: true,
        actor_id: true,
        action_type: true,
        object_type: true,
        object_id: true,
        before_state: true,
        after_state: true,
        rule_version_ref: true,
        calculation_version_ref: true,
        client_ip: true,
        session_id: true,
        occurred_at: true,
        prev_hash: true,
        row_hash: true,
      },
    });

    return rows as VerifierRow[];
  }

  /**
   * The seed `prev_hash` for an incremental window: the stored `row_hash` of
   * the row immediately before the window, or genesis when the window starts at
   * the beginning of the chain.
   */
  private async seedPrevHash(fromOccurredAt: Date): Promise<string> {
    const prior = await this.prisma.audit_events.findFirst({
      where: { occurred_at: { lt: fromOccurredAt } },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      select: { row_hash: true },
    });
    return prior?.row_hash ?? AUDIT_GENESIS_HASH;
  }

  /** Map a persisted row to the shape {@link computeRowHash} hashes. */
  private toInput(row: VerifierRow): AuditWriteInput {
    return {
      actor_id: row.actor_id,
      action_type: row.action_type as AuditWriteInput['action_type'],
      object_type: row.object_type,
      object_id: row.object_id,
      before_state: row.before_state,
      after_state: row.after_state,
      rule_version_ref: row.rule_version_ref,
      calculation_version_ref: row.calculation_version_ref,
      client_ip: row.client_ip,
      session_id: row.session_id,
    };
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
