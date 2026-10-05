import { createHash } from 'node:crypto';

import { AuditWriteInput } from './audit.types';

/**
 * ============================================================================
 * THE TYPESCRIPT HALF OF THE HASH CHAIN
 * ============================================================================
 *
 * Plan 01-03's `BEFORE INSERT` trigger recomputes every row's hash server-side
 * and rejects the insert if the application-supplied value disagrees. That
 * check is the control; the application-supplied hash is only the claim being
 * checked. Which means this file has exactly one job, and it is a byte-level
 * one:
 *
 *   **reproduce `platform.compute_audit_row_hash` exactly.**
 *
 * Not "equivalently". Not "for the cases we tried". Exactly — because the only
 * two outcomes available are "the hashes match" and "the insert is rejected
 * with `AUDIT_CHAIN_BROKEN`", and the second one surfaces to a user as a
 * failed court action with an opaque integrity error. There is no partial
 * credit and no graceful degradation.
 *
 * The SQL side, verbatim from
 * `prisma/migrations/20260101000200_audit_hash_chain/migration.sql`:
 *
 *     coalesce(p_actor_id::text, '')               || '|' ||
 *     coalesce(p_action_type, '')                  || '|' ||
 *     coalesce(p_object_type, '')                  || '|' ||
 *     coalesce(p_object_id::text, '')              || '|' ||
 *     coalesce(p_before_state::text, '')           || '|' ||
 *     coalesce(p_after_state::text, '')            || '|' ||
 *     coalesce(p_rule_version_ref::text, '')       || '|' ||
 *     coalesce(p_calculation_version_ref::text,'') || '|' ||
 *     coalesce(p_client_ip, '')                    || '|' ||
 *     coalesce(p_session_id::text, '')             || '|' ||
 *     to_char(p_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
 *     coalesce(p_prev_hash, '')
 *
 * then `sha256` over its UTF-8 bytes, hex-encoded.
 *
 * ## Why the `|` delimiter is not ambiguous
 *
 * A pipe-delimited join is normally a bad idea, because a value containing the
 * delimiter can impersonate a field boundary. It is safe **here, and only
 * here**, for one specific reason: the field list is FIXED at twelve and
 * frozen (the migration says so in capitals), and the payload is never parsed
 * back — it is only ever hashed. With a fixed arity and no parse step there is
 * no "field boundary" to confuse: a `|` inside `object_type` produces a
 * different payload string than the same `|` as a separator would, so the two
 * cannot collide. The parity corpus includes a fixture whose string value
 * contains `|` to keep that property honest rather than assumed.
 *
 * ## The genuinely hard part: `jsonb::text`
 *
 * `before_state` and `after_state` reach the hash through Postgres' own
 * `jsonb` output, which is **not** `JSON.stringify`. See
 * {@link canonicalJsonb} — every rule there was confirmed against a live
 * PostgreSQL 15 rather than inferred from documentation, and
 * `test/audit-canonical-parity.e2e-spec.ts` re-confirms each one on every CI
 * run by comparing against `SELECT $1::jsonb::text` directly. That per-field
 * comparison exists so a drift says *which* rule broke, instead of only
 * reporting that two 64-character hex strings differ.
 * ============================================================================
 */

/** The twelve-field payload is frozen; see the migration's capitalised note. */
const FIELD_DELIMITER = '|';

/** Thrown when a caller's state object cannot be hashed deterministically. */
export class CanonicalPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalPayloadError';
  }
}

/**
 * Render a value the way PostgreSQL renders `jsonb::text`.
 *
 * The rules below are not stylistic choices — each one is a place where the
 * obvious JavaScript implementation differs from PostgreSQL, and each one was
 * verified empirically against `postgres:15.7-alpine`:
 *
 * | Rule | PostgreSQL | `JSON.stringify` |
 * |---|---|---|
 * | object key order | **UTF-8 byte length first, then bytewise** | insertion order |
 * | member separator | `", "` | `","` |
 * | key/value separator | `": "` | `":"` |
 * | array separator | `", "` | `","` |
 * | `/` | not escaped | not escaped |
 * | `\b` `\f` `\n` `\r` `\t` | short escapes | short escapes |
 * | other C0 controls | `\u00XX`, lowercase hex | `\u00XX`, lowercase hex |
 * | `\u007f` (DEL) | **literal byte** | literal byte |
 * | non-ASCII | literal UTF-8 | literal UTF-8 |
 *
 * The key ordering is the one that actually bites. `jsonb` sorts keys by
 * **length first** and only then bytewise, so `{"zz":1,"a":2,"mmm":3}` renders
 * as `{"a": 2, "zz": 1, "mmm": 3}` — an order no lexicographic sort produces.
 * An implementation that sorted lexicographically would agree with PostgreSQL
 * on most real payloads (keys of equal length are common) and disagree on
 * others, which is the worst possible failure shape: intermittent, data-
 * dependent, and invisible until a specific court action happens to use two
 * differently-sized field names. The corpus pins it with a dedicated fixture.
 *
 * Note "length" means **UTF-8 byte length**, not `String#length`: a key of
 * `"é"` is one JavaScript character and two bytes, and PostgreSQL sorts it
 * with the two-byte keys.
 *
 * ## What this function refuses, and why refusing is the right answer
 *
 * `jsonb` stores numbers as `numeric`, which is arbitrary-precision decimal
 * and preserves the *written* form (`1.50` stays `1.50`, `1e5` becomes
 * `100000`). An IEEE-754 double has no written form to preserve — `1.50` and
 * `1.5` are the same value by the time JavaScript sees them — so for a
 * non-integer there is no way to know which text PostgreSQL will produce.
 *
 * Guessing would mean computing a hash that the trigger rejects, and the
 * caller would see `AUDIT_CHAIN_BROKEN`: a message about tamper evidence,
 * raised by a perfectly honest write, pointing at nothing the developer can
 * act on. Throwing here instead costs the same failed call but says exactly
 * what to change. Numbers outside the safe-integer range fail for the same
 * reason (`String(1e21)` is `"1e+21"`; PostgreSQL writes it out in full).
 *
 * @throws {CanonicalPayloadError} on a non-integer / unsafe number, a `NaN` or
 *   `Infinity`, a `bigint`/`symbol`/`function`, a `NUL` character, or an
 *   unpaired surrogate — the last two because `jsonb` cannot store them at all.
 */
export function canonicalJsonb(value: unknown): string {
  return render(value, '$');
}

function render(value: unknown, path: string): string {
  if (value === null) {
    return 'null';
  }

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';

    case 'number':
      return renderNumber(value, path);

    case 'string':
      return renderString(value, path);

    case 'object':
      break;

    default:
      throw new CanonicalPayloadError(
        `Audit state at ${path} has unsupported type '${typeof value}'. ` +
          `before_state/after_state must contain only objects, arrays, strings, ` +
          `booleans, safe integers and null.`,
      );
  }

  // `toJSON` is honoured for the same reason `JSON.stringify` honours it: the
  // object is also serialised with `JSON.stringify` on its way to the database,
  // so ignoring it here would hash one thing and store another. `Date` is the
  // case that actually occurs.
  const candidate = value as { toJSON?: (key?: string) => unknown };
  if (typeof candidate.toJSON === 'function') {
    return render(candidate.toJSON(), path);
  }

  if (Array.isArray(value)) {
    // Arrays preserve input order — only object keys are reordered.
    return `[${value.map((item, i) => render(item, `${path}[${i}]`)).join(', ')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    // `undefined` members are dropped, matching `JSON.stringify` — which is
    // what actually serialises this object for the INSERT, so dropping them
    // here is what keeps the hashed text and the stored text the same.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => compareJsonbKeys(a, b));

  const members = entries.map(
    ([key, v]) => `${renderString(key, `${path}.${key}`)}: ${render(v, `${path}.${key}`)}`,
  );

  return `{${members.join(', ')}}`;
}

/**
 * `jsonb`'s key collation: shorter UTF-8 encodings first, ties broken by
 * byte comparison. (PostgreSQL source: `jsonb_util.c`, `lengthCompareJsonbString`.)
 */
function compareJsonbKeys(a: string, b: string): number {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    return ab.length - bb.length;
  }
  return Buffer.compare(ab, bb);
}

function renderNumber(value: number, path: string): string {
  if (!Number.isFinite(value)) {
    throw new CanonicalPayloadError(
      `Audit state at ${path} is ${String(value)}, which JSON cannot represent. ` +
        `Pass a string instead.`,
    );
  }

  if (!Number.isSafeInteger(value)) {
    throw new CanonicalPayloadError(
      `Audit state at ${path} is the non-integer or unsafe number ${String(value)}. ` +
        `The audit row hash is recomputed by PostgreSQL over the jsonb's own text ` +
        `form, and jsonb renders numbers as arbitrary-precision 'numeric' — a ` +
        `JavaScript double does not carry enough information to predict that text, ` +
        `so a hash computed here would be rejected by the database as a chain ` +
        `break. Pass the value as a string (e.g. "1.50") to record it exactly.`,
    );
  }

  // Safe integers: `String` and PostgreSQL agree, including `-0` → "0".
  return String(value);
}

/** C0 controls PostgreSQL emits as short escapes rather than `\u00XX`. */
const SHORT_ESCAPES: Readonly<Record<number, string>> = {
  0x08: '\\b',
  0x09: '\\t',
  0x0a: '\\n',
  0x0c: '\\f',
  0x0d: '\\r',
};

function renderString(value: string, path: string): string {
  let out = '"';

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    const code = value.charCodeAt(i);

    if (code === 0x00) {
      throw new CanonicalPayloadError(
        `Audit state at ${path} contains a NUL character (\\u0000), which ` +
          `PostgreSQL jsonb cannot store. Remove or replace it.`,
      );
    }

    // Lone surrogates are not valid UTF-8 and `jsonb` rejects them outright;
    // caught here so the error names the field rather than arriving as a
    // driver-level encoding failure during the INSERT.
    if (code >= 0xd800 && code <= 0xdfff) {
      const isHigh = code <= 0xdbff;
      const next = isHigh ? value.charCodeAt(i + 1) : NaN;
      const paired = isHigh && next >= 0xdc00 && next <= 0xdfff;
      if (!paired) {
        throw new CanonicalPayloadError(
          `Audit state at ${path} contains an unpaired surrogate (\\u${code
            .toString(16)
            .padStart(4, '0')}), which is not valid UTF-8 and cannot be stored ` +
            `as jsonb.`,
        );
      }
      out += ch + value[i + 1];
      i++;
      continue;
    }

    if (ch === '"') {
      out += '\\"';
    } else if (ch === '\\') {
      out += '\\\\';
    } else if (SHORT_ESCAPES[code] !== undefined) {
      out += SHORT_ESCAPES[code];
    } else if (code < 0x20) {
      // Lowercase hex — PostgreSQL emits `\u001b`, not `\u001B`.
      out += `\\u${code.toString(16).padStart(4, '0')}`;
    } else {
      // Everything else passes through literally, including `/` and `\u007f`,
      // neither of which PostgreSQL escapes.
      out += ch;
    }
  }

  return `${out}"`;
}

/**
 * Format an instant the way
 * `to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` does:
 * UTC, with exactly **six** fractional digits.
 *
 * The explicit rendering is the whole point. A `timestamptz::text` cast is
 * sensitive to the session's `TimeZone` and `DateStyle`, so the same row would
 * hash differently for two clients with different session settings — phantom
 * chain breaks that depend on who happens to be connected. Six digits because
 * `US` is microseconds; a JavaScript `Date` carries milliseconds, so the last
 * three are always zero and the value round-trips through `timestamptz`
 * unchanged.
 */
export function formatOccurredAt(occurredAt: Date): string {
  if (Number.isNaN(occurredAt.getTime())) {
    throw new CanonicalPayloadError('occurred_at is an invalid Date.');
  }
  // `toISOString()` → "YYYY-MM-DDTHH:MM:SS.mmmZ" (year zero-padded to 4).
  return `${occurredAt.toISOString().slice(0, -1)}000Z`;
}

/** SQL `coalesce(x, '')` for a nullable scalar field. */
function scalar(value: string | null | undefined): string {
  return value ?? '';
}

/** SQL `coalesce(x::text, '')` for a nullable `jsonb` field. */
function jsonField(value: Record<string, unknown> | null | undefined): string {
  return value === null || value === undefined ? '' : canonicalJsonb(value);
}

/**
 * Build the exact string `platform.compute_audit_row_hash` concatenates.
 *
 * Exported separately from {@link computeRowHash} so a failing parity fixture
 * can print the payload and show which field diverged. Comparing two hex
 * digests tells you only that something is wrong.
 */
export function buildCanonicalPayload(
  input: AuditWriteInput,
  occurredAt: Date,
  prevHash: string,
): string {
  return [
    scalar(input.actor_id),
    scalar(input.action_type),
    scalar(input.object_type),
    scalar(input.object_id),
    jsonField(input.before_state),
    jsonField(input.after_state),
    scalar(input.rule_version_ref),
    scalar(input.calculation_version_ref),
    scalar(input.client_ip),
    scalar(input.session_id),
    formatOccurredAt(occurredAt),
    scalar(prevHash),
  ].join(FIELD_DELIMITER);
}

/**
 * `sha256` of the canonical payload, hex-encoded — the value supplied as
 * `audit_events.row_hash` and independently recomputed by the trigger.
 */
export function computeRowHash(
  input: AuditWriteInput,
  occurredAt: Date,
  prevHash: string,
): string {
  return createHash('sha256')
    .update(buildCanonicalPayload(input, occurredAt, prevHash), 'utf8')
    .digest('hex');
}
