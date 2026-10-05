import { Client } from 'pg';

import { ApiException } from '../src/common/errors/api-error';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { AUDIT_GENESIS_HASH } from '../src/modules/audit/audit.types';
import { withAudit } from '../src/modules/audit/with-audit';
import {
  PlatformDb,
  seedActor,
  startPlatformDb,
  stopPlatformDb,
} from './testcontainers-postgres';

/**
 * ============================================================================
 * THE ATOMICITY PROOF
 * ============================================================================
 *
 * `FRD/F02` Validation: the audit write and the domain write "commit
 * atomically, or neither does." `TechArch/04-security.md` §7.3: "'the action
 * happened but wasn't audited' is structurally impossible, not merely
 * discouraged."
 *
 * Those are two claims about what is in the database after a failure, so this
 * suite only makes assertions about what is in the database after a failure.
 * In particular it never concludes anything from the fact that an exception
 * was thrown — a thrown error is consistent with the write having been rolled
 * back, with it having committed and the error arriving afterwards, and with
 * a compensating delete that itself half-worked. Only a `SELECT` distinguishes
 * them, so every case here ends in one.
 *
 * The domain table is `platform.courts`: a real table `app_rw` may INSERT
 * into, with no audit coupling of its own, so a row's presence or absence
 * means exactly one thing.
 *
 * Both directions matter and they fail differently:
 *   - audit write fails → the domain row must be gone (the headline guarantee);
 *   - domain write fails → no audit row must survive (the quieter one — a
 *     phantom audit entry for an action that never happened is also a
 *     falsified record, and it is the direction people forget to test).
 */

jest.setTimeout(180_000); // container pull + start + migrations

/** An actor_id that is a valid UUID but violates `REFERENCES users(id)`. */
const NONEXISTENT_ACTOR = '99999999-9999-4999-8999-999999999999';

describe('audit-outbox: domain and audit writes commit together or not at all (e2e)', () => {
  let db: PlatformDb;
  let prisma: PrismaService;
  let owner: Client;
  let audit: AuditService;
  let actorId: string;

  beforeAll(async () => {
    db = await startPlatformDb();

    // `PrismaService` rather than a bare client: `withAudit` is typed against
    // it, and this exercises the same `$transaction` the application uses.
    process.env.DATABASE_URL = db.appRwUrl;
    prisma = new PrismaService();
    await prisma.$connect();

    owner = new Client({ connectionString: db.ownerUrl });
    await owner.connect();

    audit = new AuditService();
    actorId = await seedActor(owner);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await owner?.end();
    await stopPlatformDb(db);
  });

  beforeEach(async () => {
    // As the owner — `app_rw` holds no DELETE grant on audit_events, by design.
    await owner.query('DELETE FROM platform.audit_events');
    await owner.query(
      `UPDATE platform.audit_chain_head
          SET last_row_hash = $1, last_audit_event_id = NULL`,
      [AUDIT_GENESIS_HASH],
    );
    await owner.query(`DELETE FROM platform.courts WHERE court_code LIKE 'OBX%'`);
  });

  async function countCourts(code: string): Promise<number> {
    const { rows } = await owner.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM platform.courts WHERE court_code = $1',
      [code],
    );
    return Number(rows[0].n);
  }

  async function countAuditEvents(): Promise<number> {
    const { rows } = await owner.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM platform.audit_events',
    );
    return Number(rows[0].n);
  }

  describe('a failing audit write rolls back the domain write', () => {
    /**
     * The headline guarantee, and the case the whole helper exists for.
     *
     * The domain INSERT genuinely succeeds inside the transaction; the audit
     * write then fails on the `actor_id` foreign key. If the two were not
     * sharing a transaction, the court row would be sitting in the table right
     * now with nothing recording who created it.
     */
    it('leaves no domain row when the audit insert fails', async () => {
      const code = 'OBX1';

      const error = await withAudit(prisma, audit, async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO platform.courts (court_name, court_code)
          VALUES ('Outbox Rollback Court', ${code})
          RETURNING id
        `;
        return {
          result: rows[0].id,
          audit: {
            actor_id: NONEXISTENT_ACTOR, // violates REFERENCES users(id)
            action_type: 'config_change' as const,
            object_type: 'courts',
            object_id: rows[0].id,
            after_state: { court_code: code },
          },
        };
      }).catch((e: unknown) => e);

      // The specified failure, verbatim from FRD/F02 Error States.
      expect(error).toBeInstanceOf(ApiException);
      const api = error as ApiException;
      expect(api.getStatus()).toBe(500);
      expect(api.errorCode).toBe('AUDIT_WRITE_FAILED');
      expect(api.toBody().message).toBe(
        'Action could not be completed; audit record failed',
      );

      // THE ACTUAL PROOF — ask the database, do not infer from the throw.
      expect(await countCourts(code)).toBe(0);
      expect(await countAuditEvents()).toBe(0);
    });

    it('leaves no domain row when the audit insert is rejected by the hash-chain trigger', async () => {
      // A different failure mode reaching the same guarantee: here the audit
      // write is well-formed but a concurrent-looking chain state makes the
      // trigger reject it. Proves the rollback is the transaction's, not
      // special-case handling of foreign-key errors.
      const code = 'OBX2';

      const error = await withAudit(prisma, audit, async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO platform.courts (court_name, court_code)
          VALUES ('Outbox Trigger Court', ${code})
          RETURNING id
        `;
        // Plant a row with a deliberately wrong row_hash directly, so the
        // trigger raises AUDIT_CHAIN_BROKEN inside this transaction.
        await tx.$executeRaw`
          INSERT INTO platform.audit_events
            (actor_id, action_type, object_type, object_id, prev_hash, row_hash)
          VALUES (${actorId}::uuid, 'config_change', 'courts', ${rows[0].id}::uuid,
                  ${AUDIT_GENESIS_HASH}, ${'b'.repeat(64)})
        `;
        return {
          result: rows[0].id,
          audit: {
            actor_id: actorId,
            action_type: 'config_change' as const,
            object_type: 'courts',
            object_id: rows[0].id,
          },
        };
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(await countCourts(code)).toBe(0);
      expect(await countAuditEvents()).toBe(0);
    });
  });

  describe('a failing domain write leaves no audit row', () => {
    /**
     * The direction people forget. An audit entry for an action that never
     * happened is as much a falsified record as a missing entry for one that
     * did — and it is more corrosive, because it reads as evidence.
     */
    it('persists no audit event when the domain work throws', async () => {
      const code = 'OBX3';

      const error = await withAudit(prisma, audit, async (tx) => {
        await tx.$executeRaw`
          INSERT INTO platform.courts (court_name, court_code)
          VALUES ('Outbox Domain-Fail Court', ${code})
        `;
        throw new ApiException(409, 'RESOURCE_INVALID_TRANSITION', 'Nope');
      }).catch((e: unknown) => e);

      // The domain error propagates UNCHANGED. Relabelling a 409 as
      // AUDIT_WRITE_FAILED would send a clerk chasing an integrity incident
      // over an ordinary validation failure.
      expect(error).toBeInstanceOf(ApiException);
      expect((error as ApiException).errorCode).toBe('RESOURCE_INVALID_TRANSITION');
      expect((error as ApiException).getStatus()).toBe(409);

      expect(await countCourts(code)).toBe(0);
      expect(await countAuditEvents()).toBe(0);
    });

    it('leaves the chain head untouched after a rolled-back transaction', async () => {
      // The trigger advances audit_chain_head inside the same transaction, so
      // a rollback must take the head with it. If it did not, the next write
      // would compute against a head no row matches and the chain would be
      // permanently broken by a failure that was supposed to be harmless.
      await withAudit(prisma, audit, async (tx) => {
        await tx.$executeRaw`
          INSERT INTO platform.courts (court_name, court_code)
          VALUES ('Outbox Head Court', 'OBX4')
        `;
        return {
          result: null,
          audit: {
            actor_id: NONEXISTENT_ACTOR,
            action_type: 'config_change' as const,
            object_type: 'courts',
            object_id: '11111111-1111-4111-8111-111111111111',
          },
        };
      }).catch(() => undefined);

      const { rows } = await owner.query<{ last_row_hash: string }>(
        'SELECT last_row_hash FROM platform.audit_chain_head',
      );
      expect(rows[0].last_row_hash).toBe(AUDIT_GENESIS_HASH);

      // And the chain still works afterwards — the failure left no damage.
      await withAudit(prisma, audit, async (tx) => {
        const r = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO platform.courts (court_name, court_code)
          VALUES ('Outbox Recovery Court', 'OBX5')
          RETURNING id
        `;
        return {
          result: r[0].id,
          audit: {
            actor_id: actorId,
            action_type: 'config_change' as const,
            object_type: 'courts',
            object_id: r[0].id,
          },
        };
      });

      expect(await countAuditEvents()).toBe(1);
      expect(await countCourts('OBX5')).toBe(1);
    });
  });

  describe('the happy path commits both, exactly once', () => {
    it('persists one domain row and one audit row', async () => {
      const code = 'OBX6';

      const courtId = await withAudit(prisma, audit, async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO platform.courts (court_name, court_code)
          VALUES ('Outbox Happy Court', ${code})
          RETURNING id
        `;
        return {
          result: rows[0].id,
          audit: {
            actor_id: actorId,
            action_type: 'config_change' as const,
            object_type: 'courts',
            object_id: rows[0].id,
            after_state: { court_code: code, court_name: 'Outbox Happy Court' },
          },
        };
      });

      expect(courtId).toBeTruthy();
      expect(await countCourts(code)).toBe(1);
      expect(await countAuditEvents()).toBe(1);

      const { rows } = await owner.query<{
        object_id: string;
        actor_id: string;
        after_state: Record<string, unknown>;
      }>('SELECT object_id, actor_id, after_state FROM platform.audit_events');
      expect(rows[0].object_id).toBe(courtId);
      expect(rows[0].actor_id).toBe(actorId);
      expect(rows[0].after_state).toEqual({
        court_code: code,
        court_name: 'Outbox Happy Court',
      });
    });

    it('writes several events from one operation, in order, in one transaction', async () => {
      await withAudit(prisma, audit, async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO platform.courts (court_name, court_code)
          VALUES ('Outbox Multi Court', 'OBX7')
          RETURNING id
        `;
        const id = rows[0].id;
        return {
          result: id,
          audit: [
            {
              actor_id: actorId,
              action_type: 'config_change' as const,
              object_type: 'courts',
              object_id: id,
              after_state: { step: 1 },
            },
            {
              actor_id: actorId,
              action_type: 'approval' as const,
              object_type: 'courts',
              object_id: id,
              after_state: { step: 2 },
            },
          ],
        };
      });

      const { rows } = await owner.query<{
        action_type: string;
        prev_hash: string;
        row_hash: string;
      }>(
        'SELECT action_type, prev_hash, row_hash FROM platform.audit_events ORDER BY occurred_at',
      );

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.action_type)).toEqual(['config_change', 'approval']);
      // Chained to each other even within a single operation.
      expect(rows[0].prev_hash).toBe(AUDIT_GENESIS_HASH);
      expect(rows[1].prev_hash).toBe(rows[0].row_hash);
    });

    it('refuses an operation that emits no audit event at all', async () => {
      // An "audited" call with an empty event list is an unaudited state
      // change wearing the helper's name — the one thing it must not permit.
      const error = await withAudit(prisma, audit, async (tx) => {
        await tx.$executeRaw`
          INSERT INTO platform.courts (court_name, court_code)
          VALUES ('Outbox Empty Court', 'OBX8')
        `;
        return { result: null, audit: [] };
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/at least one audit event/);
      expect(await countCourts('OBX8')).toBe(0);
    });
  });
});
