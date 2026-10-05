import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';

import { AuditService } from '../src/modules/audit/audit.service';
import { AUDIT_GENESIS_HASH, AuditWriteInput } from '../src/modules/audit/audit.types';
import {
  PlatformDb,
  seedActor,
  startPlatformDb,
  stopPlatformDb,
} from './testcontainers-postgres';

/**
 * ============================================================================
 * THE AUDIT WRITE PATH, AGAINST A REAL DATABASE
 * ============================================================================
 *
 * `AuditService` is only correct in company: on its own it computes a hash,
 * but what makes the hash *mean* anything is the trigger that recomputes it,
 * the chain head that orders it, and the grants that stop it being rewritten.
 * None of those exist in a mock. So this suite runs against the real migrated
 * schema as the real `app_rw` role, and every assertion is a query against
 * what actually landed in the table rather than a check of what the service
 * returned.
 *
 * The concurrency case is the one that earns its runtime. A hash chain is a
 * totally ordered structure maintained by writers who do not coordinate with
 * each other at the application layer, and the argument for why that works —
 * the chain-head row lock plus the trigger's advisory lock — is only an
 * argument until it has been run under contention.
 */

jest.setTimeout(180_000); // container pull + start + migrations

interface AuditRow {
  id: string;
  actor_id: string;
  action_type: string;
  object_type: string;
  object_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  occurred_at: Date;
  prev_hash: string;
  row_hash: string;
}

describe('audit-write: append-only hash-chained capture (e2e)', () => {
  let db: PlatformDb;
  let prisma: PrismaClient;
  let owner: Client;
  let audit: AuditService;

  let actorId: string;
  let objectId: string;

  beforeAll(async () => {
    db = await startPlatformDb();

    // `app_rw` — the role the grants apply to. Running as the superuser would
    // make an accidentally-missing INSERT grant invisible.
    prisma = new PrismaClient({ datasources: { db: { url: db.appRwUrl } } });
    await prisma.$connect();

    owner = new Client({ connectionString: db.ownerUrl });
    await owner.connect();

    audit = new AuditService();

    actorId = await seedActor(owner);
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO platform.courts (court_name, court_code)
       VALUES ('Audit Write Court', 'AWC') RETURNING id`,
    );
    objectId = rows[0].id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await owner?.end();
    await stopPlatformDb(db);
  });

  /** Clear the chain between cases so each starts from genesis. */
  beforeEach(async () => {
    // As the OWNER: `app_rw` deliberately holds no DELETE on audit_events, so
    // the role under test cannot do this — which is the point of the grants
    // and is itself asserted in schema-grants.e2e-spec.ts.
    await owner.query('DELETE FROM platform.audit_events');
    await owner.query(
      `UPDATE platform.audit_chain_head
          SET last_row_hash = $1, last_audit_event_id = NULL`,
      [AUDIT_GENESIS_HASH],
    );
  });

  function input(overrides: Partial<AuditWriteInput> = {}): AuditWriteInput {
    return {
      actor_id: actorId,
      action_type: 'status_change',
      object_type: 'courts',
      object_id: objectId,
      ...overrides,
    };
  }

  /** Every audit row, oldest first. */
  async function allEvents(): Promise<AuditRow[]> {
    const { rows } = await owner.query<AuditRow>(
      `SELECT * FROM platform.audit_events ORDER BY occurred_at, row_hash`,
    );
    return rows;
  }

  async function chainHead(): Promise<{
    last_row_hash: string;
    last_audit_event_id: string | null;
  }> {
    const { rows } = await owner.query<{
      last_row_hash: string;
      last_audit_event_id: string | null;
    }>('SELECT last_row_hash, last_audit_event_id FROM platform.audit_chain_head');
    return rows[0];
  }

  describe('consecutive writes form an unbroken chain', () => {
    it('links each event to its predecessor, starting from the genesis hash', async () => {
      for (const n of [1, 2, 3]) {
        await prisma.$transaction((tx) =>
          audit.record(tx, input({ after_state: { seq: n } })),
        );
      }

      const events = await allEvents();
      expect(events).toHaveLength(3);

      // The first link anchors the chain to a known constant; without it a
      // chain could be internally consistent yet rooted anywhere.
      expect(events[0].prev_hash).toBe(AUDIT_GENESIS_HASH);

      // Every later link is the previous row's hash. This is the chain.
      expect(events[1].prev_hash).toBe(events[0].row_hash);
      expect(events[2].prev_hash).toBe(events[1].row_hash);

      // Hashes are distinct — identical rows would mean the chain is not
      // actually covering the payload.
      expect(new Set(events.map((e) => e.row_hash)).size).toBe(3);
    });

    it('advances audit_chain_head to the most recent event', async () => {
      await prisma.$transaction((tx) => audit.record(tx, input()));
      const second = await prisma.$transaction((tx) =>
        audit.record(tx, input({ after_state: { n: 2 } })),
      );

      const head = await chainHead();
      expect(head.last_row_hash).toBe(second.row_hash);
      expect(head.last_audit_event_id).toBe(second.id);
    });

    it('returns the id and row_hash that were actually persisted', async () => {
      const result = await prisma.$transaction((tx) => audit.record(tx, input()));

      const events = await allEvents();
      expect(events[0].id).toBe(result.id);
      expect(events[0].row_hash).toBe(result.row_hash);
    });
  });

  describe('concurrent writes still form one chain', () => {
    /**
     * The real test of the locking design.
     *
     * Ten writers start at once. Each takes `FOR UPDATE` on the single
     * chain-head row inside its own transaction, so they queue; the trigger's
     * advisory lock backs that up. Without either, several would read the same
     * `prev_hash` and the chain would FORK — two branches that each verify
     * perfectly in isolation, which is exactly the condition a tamper-evidence
     * scheme must rule out, and which appears under ordinary load rather than
     * under attack.
     *
     * Asserting "no duplicate prev_hash" is the assertion that actually
     * detects a fork. Walking the chain alone would not: a forked chain still
     * has a valid-looking path from genesis to *one* of its tips.
     */
    it('serialises ten concurrent writers into a single unbroken chain', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, n) =>
          prisma.$transaction(
            (tx) => audit.record(tx, input({ after_state: { writer: n } })),
            { maxWait: 15_000, timeout: 30_000 },
          ),
        ),
      );

      expect(results).toHaveLength(10);

      const events = await allEvents();
      expect(events).toHaveLength(10);

      // No two rows claim the same predecessor — i.e. the chain did not fork.
      const prevHashes = events.map((e) => e.prev_hash);
      expect(new Set(prevHashes).size).toBe(10);
      expect(new Set(events.map((e) => e.row_hash)).size).toBe(10);

      // Walk the chain from genesis: every row_hash must be consumed exactly
      // once as some other row's prev_hash, ending at the head.
      const byPrev = new Map(events.map((e) => [e.prev_hash, e]));
      let cursor = AUDIT_GENESIS_HASH;
      const walked: string[] = [];
      for (let i = 0; i < 10; i++) {
        const next = byPrev.get(cursor);
        expect(next).toBeDefined();
        walked.push(next!.row_hash);
        cursor = next!.row_hash;
      }
      expect(walked).toHaveLength(10);

      const head = await chainHead();
      expect(head.last_row_hash).toBe(cursor);
    });
  });

  describe('payload round-trips', () => {
    it('stores before_state and after_state as queryable jsonb', async () => {
      const before = { status: 'draft', tags: ['a', 'b'], count: 2 };
      const after = { status: 'filed', tags: ['a', 'b', 'c'], count: 3, nested: { ok: true } };

      await prisma.$transaction((tx) =>
        audit.record(tx, input({ before_state: before, after_state: after })),
      );

      const events = await allEvents();
      expect(events[0].before_state).toEqual(before);
      expect(events[0].after_state).toEqual(after);
    });

    it('stores all optional fields, and null where they were omitted', async () => {
      const ruleRef = '33333333-3333-4333-8333-333333333333';
      const sessionId = '55555555-5555-4555-8555-555555555555';

      await prisma.$transaction((tx) =>
        audit.record(
          tx,
          input({
            action_type: 'access_attempt',
            rule_version_ref: ruleRef,
            client_ip: '203.0.113.42',
            session_id: sessionId,
          }),
        ),
      );

      const { rows } = await owner.query<{
        action_type: string;
        rule_version_ref: string | null;
        calculation_version_ref: string | null;
        client_ip: string | null;
        session_id: string | null;
        before_state: unknown;
      }>('SELECT * FROM platform.audit_events');

      expect(rows[0].action_type).toBe('access_attempt');
      expect(rows[0].rule_version_ref).toBe(ruleRef);
      expect(rows[0].client_ip).toBe('203.0.113.42');
      expect(rows[0].session_id).toBe(sessionId);
      expect(rows[0].calculation_version_ref).toBeNull();
      expect(rows[0].before_state).toBeNull();
    });

    it('stores a string containing the hash payload delimiter without corrupting the chain', async () => {
      // Confirms the fixed-arity argument from canonical-payload.ts holds
      // against the real trigger, not only against the parity fixtures.
      await prisma.$transaction((tx) =>
        audit.record(
          tx,
          input({ object_type: 'courts|evil', after_state: { note: 'a|b|c' } }),
        ),
      );

      const events = await allEvents();
      expect(events[0].object_type).toBe('courts|evil');
      expect(events[0].prev_hash).toBe(AUDIT_GENESIS_HASH);
    });
  });

  describe('the database independently verifies every hash', () => {
    /**
     * The point of the whole design: the application is not trusted to produce
     * a correct hash, only to produce one the database agrees with. Here we
     * ask the database to recompute each stored row from scratch.
     */
    it('agrees with platform.compute_audit_row_hash for every stored row', async () => {
      for (const n of [1, 2, 3]) {
        await prisma.$transaction((tx) =>
          audit.record(tx, input({ after_state: { seq: n, label: `row ${n}` } })),
        );
      }

      const { rows } = await owner.query<{ row_hash: string; recomputed: string }>(
        `SELECT row_hash,
                platform.compute_audit_row_hash(
                  actor_id, action_type, object_type, object_id,
                  before_state, after_state, rule_version_ref,
                  calculation_version_ref, client_ip, session_id,
                  occurred_at, prev_hash) AS recomputed
           FROM platform.audit_events`,
      );

      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.row_hash).toBe(row.recomputed);
      }
    });

    it('rejects a write whose prev_hash is not the current chain head', async () => {
      // Simulates an application that computed against a stale head — the
      // condition the chain-head lock exists to prevent, proven to be caught
      // by the trigger even if the lock were somehow bypassed.
      await expect(
        prisma.$executeRaw`
          INSERT INTO platform.audit_events
            (actor_id, action_type, object_type, object_id, prev_hash, row_hash)
          VALUES (${actorId}::uuid, 'status_change', 'courts', ${objectId}::uuid,
                  ${'f'.repeat(64)}, ${'0'.repeat(64)})
        `,
      ).rejects.toThrow(/AUDIT_CHAIN_BROKEN/);

      expect(await allEvents()).toHaveLength(0);
    });

    it('rejects a write whose row_hash does not match server recomputation', async () => {
      await expect(
        prisma.$executeRaw`
          INSERT INTO platform.audit_events
            (actor_id, action_type, object_type, object_id, prev_hash, row_hash)
          VALUES (${actorId}::uuid, 'status_change', 'courts', ${objectId}::uuid,
                  ${AUDIT_GENESIS_HASH}, ${'a'.repeat(64)})
        `,
      ).rejects.toThrow(/AUDIT_CHAIN_BROKEN/);

      expect(await allEvents()).toHaveLength(0);
    });
  });

  describe('invalid input fails before anything is written', () => {
    it('propagates the foreign-key violation for an unknown actor_id', async () => {
      await expect(
        prisma.$transaction((tx) =>
          audit.record(
            tx,
            input({ actor_id: '99999999-9999-4999-8999-999999999999' }),
          ),
        ),
      ).rejects.toThrow();

      expect(await allEvents()).toHaveLength(0);
    });

    it('throws on a non-integer number in state rather than writing a bad hash', async () => {
      await expect(
        prisma.$transaction((tx) =>
          audit.record(tx, input({ after_state: { amount: 10.5 } })),
        ),
      ).rejects.toThrow(/Pass the value as a string/);

      expect(await allEvents()).toHaveLength(0);
    });
  });
});
