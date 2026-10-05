import { Client } from 'pg';

import {
  buildCanonicalPayload,
  canonicalJsonb,
  CanonicalPayloadError,
  computeRowHash,
  formatOccurredAt,
} from '../src/modules/audit/canonical-payload';
import { AuditWriteInput } from '../src/modules/audit/audit.types';
import {
  PlatformDb,
  startPlatformDb,
  stopPlatformDb,
} from './testcontainers-postgres';

/**
 * ============================================================================
 * HASH PARITY: the test the whole audit write path rests on
 * ============================================================================
 *
 * Plan 01-03's trigger recomputes every row's hash in PL/pgSQL and rejects the
 * insert if the application's value disagrees. So the application and the
 * database must produce identical bytes for identical inputs — not usually,
 * not for the cases someone thought of, but always.
 *
 * Two things make that worth a dedicated suite rather than a couple of
 * assertions:
 *
 * 1. **The failure is invisible until it isn't.** A canonicaliser that is
 *    wrong only for, say, objects with keys of differing lengths passes every
 *    hand-written test using `{"status": "x"}` and then fails the first time a
 *    real court action records `{"status": "sealed", "sealed_by": "..."}`.
 *    The user sees `AUDIT_CHAIN_BROKEN` — a tamper alarm — raised by an honest
 *    write.
 *
 * 2. **Nothing short of asking PostgreSQL settles it.** The `jsonb` text
 *    format is an implementation detail of PostgreSQL, not a documented
 *    interface. Every rule in `canonicalJsonb` was derived by running queries
 *    against a live server, and the only way to keep it true across a future
 *    PostgreSQL upgrade is to keep asking the server on every CI run.
 *
 * So each fixture is checked **twice**, deliberately:
 *
 *   - `canonicalJsonb(v)` vs `SELECT $1::jsonb::text` — a narrow check that
 *     names the broken rule;
 *   - `computeRowHash(...)` vs `SELECT platform.compute_audit_row_hash(...)` —
 *     the end-to-end check that is what the trigger actually enforces.
 *
 * The first exists only to make a failure of the second diagnosable. Comparing
 * two 64-character hex strings tells you that something diverged, which is the
 * least useful true statement available.
 */

jest.setTimeout(180_000); // container pull + start + three migrations

/** Fixed UUIDs — fixtures must be deterministic for the payload to be. */
const ACTOR = '11111111-1111-4111-8111-111111111111';
const OBJECT = '22222222-2222-4222-8222-222222222222';
const RULE_REF = '33333333-3333-4333-8333-333333333333';
const CALC_REF = '44444444-4444-4444-8444-444444444444';
const SESSION = '55555555-5555-4555-8555-555555555555';
const GENESIS = '0'.repeat(64);

interface Fixture {
  name: string;
  input: AuditWriteInput;
  occurredAt: Date;
  prevHash: string;
}

/** Shorthand: a minimal valid input with the given overrides. */
function fixture(
  name: string,
  overrides: Partial<AuditWriteInput> = {},
  occurredAt = new Date('2026-03-05T14:30:00.000Z'),
  prevHash = GENESIS,
): Fixture {
  return {
    name,
    occurredAt,
    prevHash,
    input: {
      actor_id: ACTOR,
      action_type: 'status_change',
      object_type: 'cases',
      object_id: OBJECT,
      ...overrides,
    },
  };
}

/**
 * The corpus. Each entry exists because a plausible implementation gets it
 * wrong; the comment says which one.
 */
const FIXTURES: Fixture[] = [
  // ---- 1-8: every action_type, so the union cannot drift from the FRD ----
  fixture('action_type status_change', { action_type: 'status_change' }),
  fixture('action_type ruling', { action_type: 'ruling' }),
  fixture('action_type custody_transfer', { action_type: 'custody_transfer' }),
  fixture('action_type calculation_override', { action_type: 'calculation_override' }),
  fixture('action_type approval', { action_type: 'approval' }),
  fixture('action_type designation_change', { action_type: 'designation_change' }),
  fixture('action_type config_change', { action_type: 'config_change' }),
  fixture('action_type access_attempt', { action_type: 'access_attempt' }),

  // ---- 9: every optional field null. Catches a `null` rendered as the
  //         string "null" instead of coalescing to "".
  fixture('all optional fields null', {
    before_state: null,
    after_state: null,
    rule_version_ref: null,
    calculation_version_ref: null,
    client_ip: null,
    session_id: null,
  }),

  // ---- 10: every optional field populated. The inverse of the above.
  fixture('all optional fields populated', {
    before_state: { status: 'draft' },
    after_state: { status: 'filed' },
    rule_version_ref: RULE_REF,
    calculation_version_ref: CALC_REF,
    client_ip: '203.0.113.42',
    session_id: SESSION,
  }),

  // ---- 11: THE KEY-ORDERING FIXTURE. jsonb sorts by UTF-8 byte length
  //          first, then bytewise: {"a": 2, "zz": 1, "mmm": 3}. A
  //          lexicographic sort yields {"a","mmm","zz"} and a mismatched
  //          hash. This is the single most likely way to get this wrong.
  fixture('key ordering: length-first, not lexicographic', {
    after_state: { zz: 1, a: 2, mmm: 3 },
  }),

  // ---- 12: equal-length keys fall through to bytewise comparison, which is
  //          ASCII-ordinal — uppercase before lowercase, digits before both.
  fixture('key ordering: bytewise tiebreak among equal-length keys', {
    after_state: { aa: 1, aB: 2, Ab: 3, 'a~': 4, a0: 5 },
  }),

  // ---- 13: multi-byte keys sort by BYTE length, not character count. "é" is
  //          one JS character and two bytes, so it sorts with "ab", not "z".
  fixture('key ordering: multi-byte keys sort by byte length', {
    after_state: { é: 1, ab: 2, z: 3, ü: 4 },
  }),

  // ---- 14: duplicate keys collapse to the LAST occurrence under jsonb.
  //          JavaScript object literals already collapse this way, so the
  //          fixture is really asserting the two agree on *which* one wins.
  fixture('duplicate keys collapse to the last occurrence', {
    // Written as JSON text because a TypeScript object literal with a
    // duplicate key is a compile error — the collapse has to happen at parse
    // time, which is also how it reaches the database.
    after_state: JSON.parse('{"dup": 1, "dup": 2, "other": 3}') as Record<
      string,
      unknown
    >,
  }),

  // ---- 15: nested objects and arrays. Arrays keep input order while object
  //          keys are reordered — a canonicaliser that sorts both is wrong.
  fixture('nested objects and arrays', {
    before_state: {
      exhibits: [
        { id: 3, label: 'C' },
        { id: 1, label: 'A' },
      ],
      meta: { zzz: { nested: true }, a: [1, 2, 3] },
    },
    after_state: { empty_obj: {}, empty_arr: [], nul: null },
  }),

  // ---- 16: unicode passes through literally as UTF-8 — not \uXXXX escaped.
  //          A multi-byte character also catches a byte-vs-character length bug.
  fixture('unicode strings pass through as literal UTF-8', {
    after_state: {
      caption: 'United States v. Müller-Ødegård',
      note: 'héllo → 漢字 😀',
    },
  }),

  // ---- 17: JSON string escaping. `/` is NOT escaped; C0 controls use short
  //          escapes where they exist and lowercase \u00xx otherwise; DEL
  //          (\u007f) is emitted literally, which trips most hand-rolled
  //          escapers since many JSON writers escape it.
  fixture('string escaping: quotes, backslashes, controls, solidus, DEL', {
    after_state: {
      s: 'line\nbreak\ttab "quoted" back\\slash /solidus/',
      ctrl: '\u0001\u001b\u001f',
      del: '\u007f',
    },
  }),

  // ---- 18: a value containing the `|` field delimiter. Safe because the
  //          field list is fixed at twelve and the payload is never parsed
  //          back — only hashed. This fixture keeps that property tested
  //          rather than merely asserted in a comment.
  fixture('values containing the pipe field delimiter', {
    object_type: 'cases|spoofed',
    after_state: { note: 'a|b|c', deeper: { x: '|||' } },
    client_ip: '203.0.113.9|198.51.100.1',
  }),

  // ---- 19: integers at the edges. jsonb renders -0 as 0 and large safe
  //          integers in full; `String()` agrees for both.
  fixture('integer edge cases: negative, zero, -0, MAX_SAFE_INTEGER', {
    after_state: {
      neg: -5,
      zero: 0,
      negzero: -0,
      max: Number.MAX_SAFE_INTEGER,
      min: Number.MIN_SAFE_INTEGER,
    },
  }),

  // ---- 20: booleans, nulls and the empty-string key.
  fixture('booleans, nulls, and the empty-string key', {
    before_state: { t: true, f: false, n: null, '': 'empty key' },
  }),

  // ---- 21: sub-second precision. A Date carries milliseconds; the SQL side
  //          renders six fractional digits, so the last three must be zeros.
  fixture(
    'occurred_at with sub-second precision',
    {},
    new Date('2026-03-05T14:30:00.123Z'),
  ),

  // ---- 22: no sub-second component at all — ".000000", not "" and not ".0".
  fixture(
    'occurred_at with no sub-second component',
    {},
    new Date('2026-07-04T00:00:00.000Z'),
  ),

  // ---- 23: a non-UTC input offset must normalise to UTC before formatting.
  //          `AT TIME ZONE 'UTC'` on the SQL side; `toISOString()` here.
  fixture(
    'occurred_at supplied at a non-UTC offset',
    {},
    new Date('2026-03-05T14:30:00.123456+02:00'),
  ),

  // ---- 24: a non-genesis prev_hash — every row after the first.
  fixture('non-genesis prev_hash', { after_state: { n: 2 } }, undefined, 'a'.repeat(64)),

  // ---- 25: a realistic sealing order, the shape plan 01-09 will write.
  fixture('realistic designation_change payload', {
    action_type: 'designation_change',
    object_type: 'security_designations',
    before_state: null,
    after_state: {
      designation_type: 'sealed',
      applied_to_type: 'cases',
      order_reference: 'Dkt. 47',
      effective_at: '2026-03-05T14:30:00.000Z',
    },
    rule_version_ref: RULE_REF,
    client_ip: '198.51.100.7',
    session_id: SESSION,
  }),
];

/** The JSON values checked field-by-field against `$1::jsonb::text`. */
const JSON_FIXTURES: { name: string; value: Record<string, unknown> }[] =
  FIXTURES.flatMap((f) => {
    const fields: [string, Record<string, unknown> | null | undefined][] = [
      ['before_state', f.input.before_state],
      ['after_state', f.input.after_state],
    ];
    return fields
      .filter((entry) => entry[1] != null)
      .map(([field, value]) => ({
        name: `${f.name} · ${field}`,
        value: value as Record<string, unknown>,
      }));
  });

describe('audit-canonical-parity: TypeScript and PL/pgSQL agree byte-for-byte (e2e)', () => {
  let db: PlatformDb;
  let client: Client;

  beforeAll(async () => {
    db = await startPlatformDb();
    // app_rw, not the owner: the migration grants EXECUTE on
    // compute_audit_row_hash to app_rw specifically, and it is app_rw that
    // calls it in production. Running as the superuser would pass even if
    // that grant had been forgotten.
    client = new Client({ connectionString: db.appRwUrl });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
    await stopPlatformDb(db);
  });

  /** `SELECT platform.compute_audit_row_hash(...)` for one fixture. */
  async function sqlRowHash(f: Fixture): Promise<string> {
    const { rows } = await client.query<{ hash: string }>(
      `SELECT platform.compute_audit_row_hash(
         $1::uuid, $2::text, $3::text, $4::uuid, $5::jsonb, $6::jsonb,
         $7::uuid, $8::uuid, $9::text, $10::uuid, $11::timestamptz, $12::text
       ) AS hash`,
      [
        f.input.actor_id,
        f.input.action_type,
        f.input.object_type,
        f.input.object_id,
        // The driver serialises an object to JSON text for a jsonb parameter.
        // That is exactly how AuditService binds it, so the test exercises the
        // real encoding path rather than a test-only one.
        f.input.before_state ?? null,
        f.input.after_state ?? null,
        f.input.rule_version_ref ?? null,
        f.input.calculation_version_ref ?? null,
        f.input.client_ip ?? null,
        f.input.session_id ?? null,
        f.occurredAt.toISOString(),
        f.prevHash,
      ],
    );
    return rows[0].hash;
  }

  describe('canonicalJsonb matches PostgreSQL jsonb::text exactly', () => {
    it.each(JSON_FIXTURES.map((j) => [j.name, j.value] as const))(
      'renders %s identically to $1::jsonb::text',
      async (_name, value) => {
        const { rows } = await client.query<{ text: string }>(
          'SELECT $1::jsonb::text AS text',
          [JSON.stringify(value)],
        );
        expect(canonicalJsonb(value)).toBe(rows[0].text);
      },
    );

    it('orders object keys by UTF-8 byte length first, then bytewise', async () => {
      // Spelled out as a literal expectation as well as a DB comparison: if
      // both sides ever changed together, the comparison alone would keep
      // passing while the documented rule silently stopped being the rule.
      const value = { zz: 1, a: 2, mmm: 3 };
      expect(canonicalJsonb(value)).toBe('{"a": 2, "zz": 1, "mmm": 3}');

      const { rows } = await client.query<{ text: string }>(
        'SELECT $1::jsonb::text AS text',
        [JSON.stringify(value)],
      );
      expect(rows[0].text).toBe('{"a": 2, "zz": 1, "mmm": 3}');
    });

    it('separates members with ", " and keys from values with ": "', () => {
      expect(canonicalJsonb({ a: 1, b: [1, 2] })).toBe('{"a": 1, "b": [1, 2]}');
    });

    it('preserves array order while reordering object keys', () => {
      expect(canonicalJsonb({ arr: [3, 1, 2], zz: 0, a: 0 })).toBe(
        '{"a": 0, "zz": 0, "arr": [3, 1, 2]}',
      );
    });
  });

  describe('computeRowHash matches platform.compute_audit_row_hash', () => {
    it.each(FIXTURES.map((f) => [f.name, f] as const))(
      'agrees with the database for: %s',
      async (_name, f) => {
        const expected = await sqlRowHash(f);
        const actual = computeRowHash(f.input, f.occurredAt, f.prevHash);

        if (actual !== expected) {
          // Surface the payload, not just the digests. Two differing hex
          // strings say nothing about which of the twelve fields drifted.
          throw new Error(
            `Hash mismatch for fixture "${f.name}".\n` +
              `  TS payload: ${JSON.stringify(
                buildCanonicalPayload(f.input, f.occurredAt, f.prevHash),
              )}\n` +
              `  TS hash:    ${actual}\n` +
              `  SQL hash:   ${expected}`,
          );
        }
        expect(actual).toBe(expected);
      },
    );

    it('covers at least 20 fixtures', () => {
      expect(FIXTURES.length).toBeGreaterThanOrEqual(20);
    });

    it('covers every AuditActionType', () => {
      const covered = new Set(FIXTURES.map((f) => f.input.action_type));
      expect([...covered].sort()).toEqual([
        'access_attempt',
        'approval',
        'calculation_override',
        'config_change',
        'custody_transfer',
        'designation_change',
        'ruling',
        'status_change',
      ]);
    });
  });

  describe('occurred_at formatting matches to_char(..., YYYY-MM-DD"T"HH24:MI:SS.US"Z")', () => {
    it.each([
      '2026-03-05T14:30:00.000Z',
      '2026-03-05T14:30:00.123Z',
      '2026-12-31T23:59:59.999Z',
      '2026-01-01T00:00:00.000Z',
    ])('formats %s the way the database does', async (iso) => {
      const { rows } = await client.query<{ formatted: string }>(
        `SELECT to_char($1::timestamptz AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS formatted`,
        [iso],
      );
      expect(formatOccurredAt(new Date(iso))).toBe(rows[0].formatted);
    });

    it('always emits exactly six fractional digits', () => {
      expect(formatOccurredAt(new Date('2026-03-05T14:30:00.000Z'))).toBe(
        '2026-03-05T14:30:00.000000Z',
      );
      expect(formatOccurredAt(new Date('2026-03-05T14:30:00.400Z'))).toBe(
        '2026-03-05T14:30:00.400000Z',
      );
    });

    it('normalises a non-UTC offset to UTC', () => {
      expect(formatOccurredAt(new Date('2026-03-05T14:30:00+02:00'))).toBe(
        '2026-03-05T12:30:00.000000Z',
      );
    });
  });

  describe('inputs that cannot be hashed deterministically are rejected, not guessed', () => {
    /**
     * The design decision under test. A non-integer double has no canonical
     * `numeric` text form, so the alternative to throwing is computing a hash
     * the trigger will reject — surfacing to the user as AUDIT_CHAIN_BROKEN,
     * a tamper alarm, on a perfectly honest write. An error naming the field
     * costs the same failed call and is actionable.
     */
    it('throws on a non-integer number with a message naming the fix', () => {
      expect(() => canonicalJsonb({ amount: 1.5 })).toThrow(CanonicalPayloadError);
      expect(() => canonicalJsonb({ amount: 1.5 })).toThrow(/Pass the value as a string/);
      expect(() => canonicalJsonb({ amount: 1.5 })).toThrow(/\$\.amount/);
    });

    it('throws on a nested non-integer number, naming its path', () => {
      expect(() => canonicalJsonb({ a: { b: [0, { c: 0.1 }] } })).toThrow(
        /\$\.a\.b\[1\]\.c/,
      );
    });

    it('throws on a number beyond the safe-integer range', () => {
      // String(1e21) is "1e+21"; PostgreSQL writes the digits out in full.
      expect(() => canonicalJsonb({ big: 1e21 })).toThrow(CanonicalPayloadError);
    });

    it('throws on NaN and Infinity', () => {
      expect(() => canonicalJsonb({ x: NaN })).toThrow(CanonicalPayloadError);
      expect(() => canonicalJsonb({ x: Infinity })).toThrow(CanonicalPayloadError);
    });

    it('throws on a NUL character, which jsonb cannot store', () => {
      expect(() => canonicalJsonb({ s: 'a\u0000b' })).toThrow(/NUL character/);
    });

    it('throws on an unpaired surrogate, which is not valid UTF-8', () => {
      expect(() => canonicalJsonb({ s: '\ud800' })).toThrow(/unpaired surrogate/);
      // A correctly paired surrogate (😀) is fine.
      expect(canonicalJsonb({ s: '\ud83d\ude00' })).toBe('{"s": "😀"}');
    });

    it('rejects a bigint rather than silently coercing it', () => {
      expect(() => canonicalJsonb({ n: 1n })).toThrow(/unsupported type 'bigint'/);
    });

    it('drops undefined members, matching the JSON.stringify that stores the row', () => {
      expect(canonicalJsonb({ a: 1, b: undefined })).toBe('{"a": 1}');
    });
  });
});
