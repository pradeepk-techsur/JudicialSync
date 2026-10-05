import { readFileSync } from 'node:fs';
import { createServer, Server } from 'node:http';
import { join } from 'node:path';

import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PdpClient } from './pdp.client';
import { PdpInput, parsePdpDecision } from './pdp.types';
import { RESOURCE_TYPES } from './resource-descriptor.decorator';
import { ResourceLoaderService } from './resource-loader.service';

/**
 * ============================================================================
 * HERMETIC PROOFS FOR THE THREE PROPERTIES GREP CANNOT CHECK
 * ============================================================================
 *
 * The plan's `<verify>` block greps this module for the shapes of the
 * mistakes it is worried about. Greps are a useful tripwire and a poor proof:
 * they match comments as readily as code, and they cannot tell a resolver that
 * *exists* from one that *works*. These tests assert the properties directly,
 * and they run under the hermetic `npm test` — no Docker, no OPA, no database
 * — so a regression surfaces on every commit rather than only when someone
 * brings the stack up.
 *
 * Three properties, each of which has a silent failure mode:
 *
 *  1. **`ResourceType` and the Rego map agree.** Checked against the actual
 *     `abac.rego` file rather than a copy, because a copy drifts. A type
 *     missing from the map is denied by the PDP forever; a map row with no
 *     type cannot be declared by a route.
 *  2. **Every one of the fifteen types has a working resolver.** A type that
 *     falls through to the default branch yields a `null` resource, which the
 *     guard turns into a permanent 404 on a route that was supposed to work.
 *  3. **The PDP client denies on every failure mode.** The one that matters
 *     most, and the one a unit test can cover exhaustively where an
 *     integration test can only reach the easy cases.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const ABAC_REGO = join(
  REPO_ROOT,
  'policy',
  'judicialsync',
  'authz',
  'abac.rego',
);

/** Top-level keys of `action_entitlement_map` in `abac.rego`. */
function regoMapResourceTypes(): string[] {
  const source = readFileSync(ABAC_REGO, 'utf8');
  const start = source.indexOf('action_entitlement_map := {');
  expect(start).toBeGreaterThan(-1);

  // Walk braces from the opening one so nested action objects do not end the
  // block early. Counting rather than regexing is the difference between a
  // parser that keeps working when the map gains a nested shape and one that
  // silently reads half the table.
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const block = source.slice(open + 1, end);
  const types: string[] = [];
  for (const line of block.split('\n')) {
    // A resource-type key sits at exactly one tab of indentation and is
    // followed by `: {`. Action keys are deeper, and inline single-action
    // forms (`"court_config": {"read": ...}`) still match this shape.
    const match = /^\t"([a-z_]+)":\s*\{/.exec(line);
    if (match !== null) types.push(match[1]);
  }
  return types;
}

describe('policy contract: ResourceType mirrors the Rego action_entitlement_map', () => {
  it('declares exactly the fifteen types the policy bundle maps', () => {
    const fromRego = regoMapResourceTypes().sort();
    const fromTypescript = [...RESOURCE_TYPES].sort();

    // Asserted as a set equality in ONE assertion so a failure names both
    // sides. Two `toContain` loops would report the first missing item and
    // hide the rest.
    expect(fromTypescript).toEqual(fromRego);
    expect(fromRego).toHaveLength(15);
  });
});

describe('policy contract: every declared resource type has a resolver', () => {
  /**
   * A Prisma double whose every model returns "no such row".
   *
   * That is deliberately the HOSTILE case for this test: the question is not
   * whether a resolver returns data, it is whether a resolver *exists*. With
   * every lookup empty, a type with a real resolver returns `null` from a
   * database miss, and a type with no resolver returns `null` from the default
   * branch — indistinguishable by return value. So the assertion is on the
   * logger instead, which is the only place the two differ.
   */
  const emptyModel = {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  };

  const prisma = new Proxy({} as PrismaService, {
    get: () => emptyModel,
  });

  it('routes all fifteen types to a resolver, never to the default branch', async () => {
    const loader = new ResourceLoaderService(prisma);
    const warn = jest
      .spyOn(
        (loader as unknown as { logger: { warn: (m: string) => void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    const id = '0a000005-0000-4000-8000-000000000001';

    for (const type of RESOURCE_TYPES) {
      await loader.load(type, id, id, {
        body: { object_type: 'case', object_id: id },
        actorUserId: id,
      });
    }

    const unresolved = warn.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.includes('No attribute resolver'));

    expect(unresolved).toEqual([]);
    warn.mockRestore();
  });

  it('returns an attribute-free resource for encryption_key, which has no row', async () => {
    const loader = new ResourceLoaderService(prisma);

    // Not a gap in the table: `encryption_key` is a CAPABILITY, not an object.
    // The `key_custodian` entitlement is the whole decision, which is why the
    // policy map binds both of its actions to that one entitlement.
    const resource = await loader.load('encryption_key', null, null);

    expect(resource).toEqual({
      type: 'encryption_key',
      id: null,
      court_id: null,
      division_id: null,
      case_id: null,
      proceeding_id: null,
      designations: [],
      requested_by: null,
    });
  });

  it('returns null — not an exception — for an absent row', async () => {
    const loader = new ResourceLoaderService(prisma);

    // A missing row and a sealed record a caller may not know about must
    // traverse the SAME code path, so neither the status nor the timing can
    // distinguish them (TechArch/04-security.md §7.6).
    await expect(
      loader.load('case', '0a000005-0000-4000-8000-00000000dead', null),
    ).resolves.toBeNull();
  });

  it('returns null for a malformed id without querying the database', async () => {
    const loader = new ResourceLoaderService(prisma);
    emptyModel.findUnique.mockClear();

    await expect(loader.load('case', 'not-a-uuid', null)).resolves.toBeNull();
    expect(emptyModel.findUnique).not.toHaveBeenCalled();
  });
});

describe('policy contract: parsePdpDecision refuses to coerce', () => {
  it('accepts a well-formed decision', () => {
    expect(
      parsePdpDecision({
        allow: false,
        reason_code: 'AUTH_SCOPE_DENIED',
        hide_existence: false,
      }),
    ).toEqual({
      allow: false,
      reason_code: 'AUTH_SCOPE_DENIED',
      hide_existence: false,
    });
  });

  it.each([
    ['an empty object (undefined OPA document)', {}],
    ['a null body', null],
    ['a stringly-typed allow', { allow: 'true' }],
    ['a numeric allow', { allow: 1 }],
    ['a missing allow', { reason_code: '', hide_existence: false }],
  ])('rejects %s as malformed rather than coercing it', (_label, body) => {
    // `Boolean("false")` is `true`. A client that coerced would turn a
    // stringly-typed bundle into a system that allows everything.
    expect(parsePdpDecision(body)).toBeUndefined();
  });

  it('defaults the two non-decisive fields in the SAFE direction', () => {
    // A bundle that omitted them cannot thereby widen access: the defaults are
    // a denial with a generic reason, and "do not hide".
    expect(parsePdpDecision({ allow: true })).toEqual({
      allow: true,
      reason_code: '',
      hide_existence: false,
    });
  });
});

describe('policy contract: PdpClient fails closed on every failure mode', () => {
  let server: Server | undefined;
  let originalUrl: string | undefined;
  let originalTimeout: string | undefined;

  const input: PdpInput = {
    principal: {
      user_id: '0a000004-0000-4000-8000-000000000001',
      mfa_satisfied: true,
      roles: [],
      scopes: [],
      entitlements: ['case_read'],
    },
    action: 'read',
    resource: {
      type: 'case',
      id: '0a000005-0000-4000-8000-000000000001',
      court_id: null,
      division_id: null,
      case_id: null,
      proceeding_id: null,
      designations: [],
      requested_by: null,
    },
    context: { route: '/api/v1/cases/x', method: 'GET' },
  };

  /** Stand up a stub PDP that responds however the case needs. */
  const stub = async (
    handler: (respond: (status: number, body: string) => void) => void,
  ): Promise<void> => {
    server = createServer((_req, res) => {
      handler((status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(body);
      });
    });
    await new Promise<void>((resolve) =>
      server?.listen(0, '127.0.0.1', () => resolve()),
    );
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    process.env.OPA_URL = `http://127.0.0.1:${port}`;
  };

  beforeEach(() => {
    originalUrl = process.env.OPA_URL;
    originalTimeout = process.env.PDP_TIMEOUT_MS;
  });

  afterEach(async () => {
    if (server !== undefined) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
    if (originalUrl === undefined) delete process.env.OPA_URL;
    else process.env.OPA_URL = originalUrl;
    if (originalTimeout === undefined) delete process.env.PDP_TIMEOUT_MS;
    else process.env.PDP_TIMEOUT_MS = originalTimeout;
  });

  /** Every failure must be this exact response — the FRD/F13 wording. */
  const expectUnavailable = async (client: PdpClient): Promise<void> => {
    await expect(client.evaluate(input)).rejects.toThrow(ApiException);
    await client.evaluate(input).catch((error: ApiException) => {
      expect(error.getStatus()).toBe(503);
      expect(error.errorCode).toBe('SECURITY_POLICY_UNAVAILABLE');
      expect(error.toBody()).toEqual({
        error_code: 'SECURITY_POLICY_UNAVAILABLE',
        message: 'Access cannot be evaluated at this time; request denied',
      });
    });
  };

  it('returns the decision OPA actually sent, when OPA answers correctly', async () => {
    await stub((respond) =>
      respond(
        200,
        JSON.stringify({
          result: { allow: true, reason_code: '', hide_existence: false },
        }),
      ),
    );

    await expect(new PdpClient().evaluate(input)).resolves.toEqual({
      allow: true,
      reason_code: '',
      hide_existence: false,
    });
  });

  it('denies when OPA is unreachable (connection refused)', async () => {
    // Port 1 is reserved and nothing listens on it.
    process.env.OPA_URL = 'http://127.0.0.1:1';
    await expectUnavailable(new PdpClient());
  });

  it('denies on a non-200 status', async () => {
    await stub((respond) => respond(500, '{"code":"internal_error"}'));
    await expectUnavailable(new PdpClient());
  });

  it('denies on a body that is not JSON', async () => {
    await stub((respond) => respond(200, '<html>not json</html>'));
    await expectUnavailable(new PdpClient());
  });

  it('denies on a body with no result (bundle not loaded)', async () => {
    // The single most likely shape of a misconfigured bundle: OPA answers 200
    // with `{}` for an undefined document. "The policy said nothing" must
    // never read as "the policy said yes".
    await stub((respond) => respond(200, '{}'));
    await expectUnavailable(new PdpClient());
  });

  it('denies on a result missing a boolean allow', async () => {
    await stub((respond) => respond(200, '{"result":{"reason_code":"x"}}'));
    await expectUnavailable(new PdpClient());
  });

  it('denies on a PDP slower than PDP_TIMEOUT_MS, without hanging', async () => {
    await stub(() => {
      /* never responds */
    });
    process.env.PDP_TIMEOUT_MS = '250';

    const started = Date.now();
    await expect(new PdpClient().evaluate(input)).rejects.toMatchObject({
      errorCode: 'SECURITY_POLICY_UNAVAILABLE',
    });
    const elapsed = Date.now() - started;

    // Bounded, not merely eventual: the request must not outlive the timeout
    // by a meaningful margin, or a slow PDP exhausts the connection pool while
    // every individual request "times out" correctly.
    expect(elapsed).toBeLessThan(3_000);
  });

  it('falls back to the default timeout rather than NaN on a malformed env value', async () => {
    // `setTimeout(fn, NaN)` fires immediately, which would abort every
    // evaluation instantly and deny the entire system over a typo in a .env.
    await stub((respond) =>
      respond(
        200,
        JSON.stringify({
          result: { allow: true, reason_code: '', hide_existence: false },
        }),
      ),
    );
    process.env.PDP_TIMEOUT_MS = 'not-a-number';

    await expect(new PdpClient().evaluate(input)).resolves.toMatchObject({
      allow: true,
    });
  });

  it('never logs the principal entitlements or user id on a failure', async () => {
    await stub((respond) => respond(503, 'unavailable'));
    const client = new PdpClient();
    const error = jest
      .spyOn(
        (client as unknown as { logger: { error: (m: string) => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    await client.evaluate(input).catch(() => undefined);

    const logged = error.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('/api/v1/cases/x');
    expect(logged).toContain('case');
    // An error log is a lower-trust destination than the audit trail. A line
    // enumerating who holds which entitlement is a reconnaissance gift.
    expect(logged).not.toContain('case_read');
    expect(logged).not.toContain(input.principal.user_id);
    error.mockRestore();
  });
});
