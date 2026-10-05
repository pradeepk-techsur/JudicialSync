import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from './audit.service';
import { AuditWriteInput } from './audit.types';

/** The exact code, status and message from `FRD/F02` Error States. */
const AUDIT_WRITE_FAILED_STATUS = 500;
const AUDIT_WRITE_FAILED_CODE = 'AUDIT_WRITE_FAILED';
const AUDIT_WRITE_FAILED_MESSAGE =
  'Action could not be completed; audit record failed';

/** What `fn` returns: the domain result, plus the event(s) to append. */
export interface AuditedOutcome<T> {
  result: T;
  audit: AuditWriteInput | AuditWriteInput[];
}

const logger = new Logger('withAudit');

/**
 * ============================================================================
 * THE TRANSACTIONAL OUTBOX — the path EVERY state-changing operation takes
 * ============================================================================
 *
 * **If you are implementing a feature in any phase and it changes state, you
 * call this function. Calling `prisma.$transaction` directly for an audited
 * object is a review-blocking mistake.**
 *
 * `FRD/F02` Validation: every status-changing operation "**must** emit a
 * corresponding audit event before the operation is considered complete
 * (enforced via transactional outbox pattern — the audit write and the domain
 * write commit atomically, or neither does)."
 *
 * ## Why a helper, rather than a convention
 *
 * The requirement spans eight phases and dozens of endpoints. A convention
 * that says "remember to audit" is satisfied by diligence, and diligence
 * degrades — the first missed call is also the one nobody notices, because a
 * missing audit row looks exactly like an action that never happened.
 *
 * So the atomic path is made the *easiest* path. Writing the correct version
 * is shorter than writing the incorrect one: there is no transaction to open,
 * no error translation to remember, and no ordering to get right. An audit
 * call a developer can simply forget is not a control, and the way to stop
 * people routing around a control is to make it the shortest road.
 *
 * ## Why rollback is the transaction's, not the application's
 *
 * There is no compensating write here, no "undo the domain change" branch, no
 * cleanup path. The domain write and the audit write share one transaction;
 * if the audit insert raises — the trigger rejecting a hash, the `actor_id`
 * foreign key failing, the append-only grants refusing something — the
 * transaction aborts and PostgreSQL discards both.
 *
 * That is what satisfies `FRD/Y2-errors.md` principle 2 ("No silent partial
 * success") rather than merely claiming to. Compensation logic can itself
 * fail, and when it does it leaves the exact state the guarantee exists to
 * rule out: a committed action with no record of it. A transaction boundary
 * cannot half-work.
 *
 * `audit-outbox.e2e-spec.ts` proves both directions by querying the tables
 * afterwards, rather than by trusting the thrown error.
 *
 * ## Usage
 *
 * ```typescript
 * const updated = await withAudit(this.prisma, this.audit, async (tx) => {
 *   const before = await tx.cases.findUniqueOrThrow({ where: { id } });
 *   const after = await tx.cases.update({ where: { id }, data: { status } });
 *   return {
 *     result: after,
 *     audit: {
 *       actor_id: principal.user_id,   // from the SESSION, never the body
 *       action_type: 'status_change',
 *       object_type: 'cases',
 *       object_id: id,
 *       before_state: { status: before.status },
 *       after_state: { status: after.status },
 *     },
 *   };
 * });
 * ```
 *
 * Return an **array** for `audit` when one operation is several material
 * actions (a bulk custody transfer, say). All of them land in the same
 * transaction, in order.
 *
 * ## What callers must still get right
 *
 * - `actor_id` comes from the authenticated principal. Never from a request
 *   body (`FRD/F02` Inputs; threat T-01-15).
 * - Do all domain work on `tx`, not on the root client. Work issued outside
 *   the transaction is outside the guarantee — and will deadlock against the
 *   chain-head lock if it touches audit tables.
 * - `before_state`/`after_state` may contain only JSON-safe values with
 *   **integer** numbers; see `canonical-payload.ts` for why a fraction throws.
 *
 * @throws {ApiException} 500 `AUDIT_WRITE_FAILED` when the audit write is what
 *   failed. Domain failures propagate unchanged so the feature's own error
 *   handling still applies — a validation error must not be reported to a
 *   judge as an audit malfunction.
 */
export async function withAudit<T>(
  prisma: PrismaService,
  audit: AuditService,
  fn: (tx: Prisma.TransactionClient) => Promise<AuditedOutcome<T>>,
): Promise<T> {
  /**
   * True only while control is inside the audit append. It is what lets the
   * `catch` tell "the audit write failed" from "the domain write failed" — a
   * distinction no inspection of the error itself can make reliably, since a
   * foreign-key violation looks identical whichever statement raised it.
   */
  let inAuditWrite = false;

  try {
    return await prisma.$transaction(
      async (tx) => {
        const { result, audit: events } = await fn(tx);

        const list = Array.isArray(events) ? events : [events];
        if (list.length === 0) {
          // An audited operation that emits nothing is a silently unaudited
          // operation — the exact outcome this helper exists to prevent. Fail
          // loudly rather than commit a change with no record of it.
          throw new Error(
            'withAudit() was given an empty audit event list. Every state ' +
              'change must emit at least one audit event (FRD/F02 Validation).',
          );
        }

        inAuditWrite = true;
        for (const event of list) {
          await audit.record(tx, event);
        }
        inAuditWrite = false;

        return result;
      },
      {
        // Audit writes serialise on the chain-head row lock (and the trigger's
        // advisory lock), so under concurrency transactions WAIT by design —
        // that is the cost of a totally ordered log, which TechArch 04 §7.3
        // requires for appellate review. Prisma's defaults (2s maxWait, 5s
        // timeout) are tuned for transactions that do not queue behind each
        // other and would surface ordinary contention as a spurious
        // AUDIT_WRITE_FAILED under a burst of concurrent writes.
        maxWait: 15_000,
        timeout: 30_000,
      },
    );
  } catch (error) {
    if (inAuditWrite) {
      // Log the real cause server-side: the client gets the fixed, display-safe
      // message FRD/F02 specifies, and an operator needs the trigger's actual
      // complaint to tell a chain break from a bad actor_id.
      logger.error(
        `Audit write failed; domain transaction rolled back: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new ApiException(
        AUDIT_WRITE_FAILED_STATUS,
        AUDIT_WRITE_FAILED_CODE,
        AUDIT_WRITE_FAILED_MESSAGE,
      );
    }

    // A domain failure. Propagate untouched — the feature's own ApiException
    // (a 409 invalid transition, a 422 validation failure) is the correct
    // response, and relabelling it AUDIT_WRITE_FAILED would send a court
    // clerk chasing an integrity incident over a typo.
    throw error;
  }
}
