import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditWriteInput } from './audit.types';
import { computeRowHash } from './canonical-payload';

/** What a successful append returns to the caller. */
export interface AuditWriteResult {
  id: string;
  row_hash: string;
  occurred_at: Date;
}

/**
 * ============================================================================
 * THE SINGLE WRITER OF `platform.audit_events`
 * ============================================================================
 *
 * `FRD/F02` Process step 2: the Audit Service "computes
 * `row_hash = hash(row_content + prev_hash)` and persists the entry as a new
 * append-only row; no update or delete operation is ever issued against this
 * table at the application layer."
 *
 * ## Why `record` demands a transaction client
 *
 * The first parameter is a `Prisma.TransactionClient`, never the root
 * `PrismaService`, and that is the single most load-bearing design decision in
 * this file.
 *
 * `FRD/F02` Validation requires that a material action's audit write and
 * domain write "commit atomically, or neither does," and
 * `TechArch/04-security.md` §7.3 sharpens it: "'the action happened but wasn't
 * audited' is structurally impossible, not merely discouraged." The difference
 * between *discouraged* and *impossible* is whether a developer can write the
 * unsafe version by accident.
 *
 * With this signature they cannot. There is no way to call `record` without
 * already holding a transaction, so there is no shape of code in which the
 * domain write commits and the audit write is merely attempted afterwards.
 * The compiler enforces what a code-review convention would only ask for.
 * (Threat T-01-19.)
 *
 * Callers should not reach for `record` directly in any case — {@link withAudit}
 * is the documented path and handles the error translation.
 *
 * ## Why the chain head is locked with `FOR UPDATE`
 *
 * Step 2 below takes a row lock on the single `audit_chain_head` row *inside
 * the caller's transaction*. The trigger also takes a transaction-scoped
 * advisory lock, so this is belt-and-braces by design, and the belt matters:
 * without it two concurrent writers would both read the same `prev_hash`, both
 * compute a valid-looking hash, and then one would be rejected by the trigger
 * at insert time — correct, but as a late failure that rolls back a court
 * action rather than as a brief wait. Taking the lock before computing means
 * concurrent writers *queue* instead of one of them *losing*.
 *
 * `audit-write.e2e-spec.ts` drives ten concurrent writers through this path
 * and asserts a single unbroken chain, because a locking argument that has
 * never been executed under contention is a hypothesis.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  /**
   * Append one audit event inside the caller's transaction.
   *
   * @param tx  The enclosing transaction. Required — see the class comment.
   * @param input  The event. `actor_id` MUST come from the authenticated
   *   session or a validated service header, never from a request body
   *   (`FRD/F02` Inputs; threat T-01-15).
   *
   * @throws Anything the database raises — a trigger rejection
   *   (`AUDIT_CHAIN_BROKEN`), a foreign-key violation on `actor_id`, a
   *   privilege error. **Nothing is caught here.** The exception must
   *   propagate so the enclosing transaction aborts and the domain write goes
   *   with it; swallowing it is precisely the "silent partial success" that
   *   `FRD/Y2-errors.md` principle 2 forbids.
   */
  async record(
    tx: Prisma.TransactionClient,
    input: AuditWriteInput,
  ): Promise<AuditWriteResult> {
    const occurredAt = new Date();

    // 1. Lock the chain head so a concurrent writer cannot read the same tip.
    //    `WHERE id` reads naturally because `id` is the BOOLEAN primary key of
    //    a deliberately single-row table (migration 20260101000000).
    const head = await tx.$queryRaw<{ last_row_hash: string }[]>`
      SELECT last_row_hash
        FROM platform.audit_chain_head
       WHERE id
         FOR UPDATE
    `;

    const prevHash = head[0]?.last_row_hash;
    if (prevHash === undefined) {
      // Unreachable against a correctly migrated database — the genesis row is
      // inserted by the schema migration. Checked anyway because the
      // alternative is hashing against `undefined` and producing a chain that
      // verifies against nothing.
      throw new Error(
        'platform.audit_chain_head has no row. The database was not migrated ' +
          'correctly: migration 20260101000000 seeds the genesis chain head.',
      );
    }

    // 2. Compute the hash the trigger will independently recompute and check.
    //    A mismatch here is not a chain break in the tamper sense — it means
    //    canonical-payload.ts has drifted from the SQL function, which
    //    audit-canonical-parity.e2e-spec.ts exists to catch before deploy.
    const rowHash = computeRowHash(input, occurredAt, prevHash);

    // 3. Append. Every value is BOUND, never interpolated — `object_type` and
    //    `object_id` are caller-supplied and reach this statement from an HTTP
    //    boundary (threat T-01-18). Prisma's tagged template parameterises
    //    each `${}`. The string-interpolating `...Unsafe` raw variants are
    //    banned from this module and a grep in the plan's verification
    //    enforces their absence, so their names are deliberately not written
    //    out here — a mention in a comment would defeat that gate.
    const inserted = await tx.$queryRaw<{ id: string; row_hash: string }[]>`
      INSERT INTO platform.audit_events (
        actor_id, action_type, object_type, object_id,
        before_state, after_state, rule_version_ref, calculation_version_ref,
        client_ip, session_id, occurred_at, prev_hash, row_hash
      ) VALUES (
        ${input.actor_id}::uuid,
        ${input.action_type},
        ${input.object_type},
        ${input.object_id}::uuid,
        ${toJsonbParam(input.before_state)}::jsonb,
        ${toJsonbParam(input.after_state)}::jsonb,
        ${input.rule_version_ref ?? null}::uuid,
        ${input.calculation_version_ref ?? null}::uuid,
        ${input.client_ip ?? null},
        ${input.session_id ?? null}::uuid,
        ${occurredAt}::timestamptz,
        ${prevHash},
        ${rowHash}
      )
      RETURNING id, row_hash
    `;

    const row = inserted[0];
    if (row === undefined) {
      throw new Error('Audit insert returned no row.');
    }

    return { id: row.id, row_hash: row.row_hash, occurred_at: occurredAt };
  }
}

/**
 * Serialise a state object for a `jsonb` bind parameter.
 *
 * `JSON.stringify` is correct here and `canonicalJsonb` would be wrong: the
 * database normalises whatever text it receives into its own `jsonb`
 * representation on the way in, and it is *that* normalised form the trigger
 * re-renders when it recomputes the hash. Both paths therefore converge on the
 * same bytes — which is exactly the property the parity corpus verifies, by
 * passing `JSON.stringify` output to `$1::jsonb::text` and comparing against
 * `canonicalJsonb`.
 */
function toJsonbParam(
  value: Record<string, unknown> | null | undefined,
): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}
