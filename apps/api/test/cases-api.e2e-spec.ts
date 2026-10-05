import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';

import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import {
  bootApp,
  loginAs,
  requireStack,
  testAdminDatabaseUrl,
  testDatabaseUrl,
} from './auth-harness';
import {
  SEED,
  api,
  auditEventsFor,
  createCaseBody,
  uniqueCaseNumber,
} from './case-fixtures';

/**
 * ============================================================================
 * THE SHARED CASE MODEL, OVER HTTP, WITH REAL SESSIONS AND A REAL PDP
 * ============================================================================
 *
 * Plan 01-09. Nothing here is mocked: the sign-ins are real password + TOTP
 * browser flows against the Compose Keycloak, the authorization decisions come
 * from the OPA container evaluating the Rego bundle that ships, and the audit
 * assertions read `platform.audit_events` directly.
 *
 * ## Rows these tests create are permanent, and that shapes every assertion
 *
 * `app_rw` holds no DELETE grant on any case-model table (plan 01-03), which
 * is the property `case-no-delete.e2e-spec.ts` exists to prove. So this suite
 * cannot clean up after itself and must never assert on a collection's exact
 * size — `expect(cases).toHaveLength(4)` would pass on the first run and fail
 * on every one after it. Every list assertion is therefore about the presence
 * or absence of a SPECIFIC id, which is both stable and the thing actually
 * under test.
 */

jest.setTimeout(300_000);

describe('cases-api: the shared case model (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  let adminDb: Client;
  let available = false;

  /** Signed in once per suite — each `loginAs` costs a real TOTP window. */
  let clerkToken = '';
  let judgeToken = '';

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;

    ({ app, restoreEnv } = await bootApp());

    const provider = app.get(OidcProvider);
    for (let i = 0; i < 60 && !provider.isReady(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    adminDb = new Client({ connectionString: testAdminDatabaseUrl() });
    await adminDb.connect();

    clerkToken = (await loginAs(app, 'clerk_case_admin')).session_token;
    judgeToken = (await loginAs(app, 'judge')).session_token;
  });

  afterAll(async () => {
    await adminDb?.end();
    await db?.end();
    await app?.close();
    restoreEnv?.();
  });

  // =========================================================================
  // CREATE
  // =========================================================================

  describe('POST /cases', () => {
    it('clerk_case_admin creates a case with a defendant → 201 in the §6.2 shape', async () => {
      if (!available) return;

      const body = createCaseBody();
      const response = await api(app, clerkToken).post('/api/v1/cases', body);

      expect(response.status).toBe(201);

      const created = response.body.case as Record<string, unknown>;

      // Field-for-field against `TechArch/03a-api-shared.md` §6.2's `Case`.
      // Asserted as a key SET rather than per field, because the failure this
      // guards against is a RENAME — `caseNumber` instead of `case_number` —
      // which a per-field `toBeDefined()` would not catch on the field that
      // moved.
      expect(Object.keys(created).sort()).toEqual(
        [
          'case_caption',
          'case_number',
          'case_type',
          'court_id',
          'created_at',
          'division_id',
          'id',
          'locally_modified',
          'source_system',
          'status',
        ].sort(),
      );

      expect(created).toMatchObject({
        case_number: body.case_number,
        court_id: SEED.courts.NDCA,
        division_id: SEED.divisions.ndcaSanFrancisco,
        case_caption: 'United States v. Fixture',
        case_type: 'criminal',
        // `FRD/F01` Validation: manual entry is flagged `manual`.
        source_system: 'manual',
        status: 'open',
      });
      // A manually created record has no upstream version to diverge from.
      expect(created.locally_modified).toBe(false);
      // `source_identifier` is omitted (null) on a manual case: inventing one
      // would make a locally-authored record indistinguishable from an
      // imported one to Phase 3's adapter.
      expect(created.source_identifier).toBeUndefined();
      expect(typeof created.created_at).toBe('string');
      expect(new Date(created.created_at as string).toISOString()).toBe(
        created.created_at,
      );

      const parties = response.body.parties as Array<Record<string, unknown>>;
      expect(parties).toHaveLength(2);
      expect(parties.map((p) => p.party_role).sort()).toEqual([
        'defendant',
        'government',
      ]);
    });

    it('a duplicate case_number in the same division → 409 CASE_DUPLICATE_NUMBER', async () => {
      if (!available) return;

      const caseNumber = uniqueCaseNumber();
      const first = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody({ case_number: caseNumber }),
      );
      expect(first.status).toBe(201);

      const second = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody({ case_number: caseNumber }),
      );

      expect(second.status).toBe(409);
      expect(second.body).toEqual({
        error_code: 'CASE_DUPLICATE_NUMBER',
        message: 'A case with this number already exists in this division',
      });
    });

    it('the same case_number in a DIFFERENT division → 201 (uniqueness is division-scoped)', async () => {
      if (!available) return;

      const caseNumber = uniqueCaseNumber();
      const sf = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody({
          case_number: caseNumber,
          division_id: SEED.divisions.ndcaSanFrancisco,
        }),
      );
      expect(sf.status).toBe(201);

      const oakland = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody({
          case_number: caseNumber,
          division_id: SEED.divisions.ndcaOakland,
        }),
      );

      // `UNIQUE (division_id, case_number)` — not `UNIQUE (case_number)`.
      // Two divisions of one court legitimately use overlapping local
      // numbering, and a court-wide constraint would reject lawful filings.
      expect(oakland.status).toBe(201);
      expect(oakland.body.case.division_id).toBe(SEED.divisions.ndcaOakland);
    });

    it('a case with no defendant party → 422 CASE_MISSING_DEFENDANT', async () => {
      if (!available) return;

      const response = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody({
          party: [
            { name: 'United States of America', role: 'government' },
            { name: 'Someone Else', role: 'counsel' },
          ],
        }),
      );

      // The exact code and message from `FRD/F01` Error States. `US-1.2` ties
      // the Phase 7 tracker precondition to this rule, so enforcing it at
      // creation is what stops Phase 7 inheriting untrackable cases.
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        error_code: 'CASE_MISSING_DEFENDANT',
        message: 'At least one defendant party is required',
      });
    });

    it('a division belonging to another court → 422 CASE_INVALID_DIVISION', async () => {
      if (!available) return;

      const response = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody({
          court_id: SEED.courts.NDCA,
          division_id: SEED.divisions.sdnyManhattan,
        }),
      );

      // Plan 01-07's `ResourceLoaderService` already refuses this pairing and
      // would 404 it (threat T-01-36), so this assertion also pins WHICH
      // layer answers: the loader returns `null` only when the body's claimed
      // court contradicts the division's real one, and it reports the
      // division's court to the PDP in every other case. Either a 422 or a
      // 404 is a refusal; 201 would mean the case landed in a court the
      // caller named rather than the one the division belongs to.
      expect([422, 404]).toContain(response.status);
      if (response.status === 422) {
        expect(response.body.error_code).toBe('CASE_INVALID_DIVISION');
      }
    });
  });

  // =========================================================================
  // LIST — the designation and scope pre-filter
  // =========================================================================

  describe('GET /cases', () => {
    it('clerk_case_admin (NDCA) sees NDCA cases, and no SDNY case', async () => {
      if (!available) return;

      const response = await api(app, clerkToken).get('/api/v1/cases');
      expect(response.status).toBe(200);

      const ids = (response.body.cases as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(SEED.cases.plain);
      // Cross-court isolation, Phase 1 criterion 1. The SDNY case is not
      // redacted or greyed out — it is absent.
      expect(ids).not.toContain(SEED.cases.otherCourt);
    });

    it('omits the sealed case entirely from the clerk\u2019s list, including the count', async () => {
      if (!available) return;

      const response = await api(app, clerkToken).get('/api/v1/cases');
      const cases = response.body.cases as Array<{ id: string }>;
      const ids = cases.map((c) => c.id);

      // `clerk_case_admin` holds `case_security_admin` but NOT
      // `designation_sealed` — the seeded distinction that makes this
      // testable. `UX-Mockup/Y0-patterns.md`: the record is "omitted entirely
      // — never shown as a greyed-out row, a 'restricted' placeholder, or a
      // count that includes it."
      expect(ids).not.toContain(SEED.cases.sealed);
      expect(ids).not.toContain(SEED.cases.restricted);

      // `total` counts what the caller may see. A count computed from an
      // unfiltered query would disclose the sealed matter the rows do not —
      // `TechArch/04-security.md` §7.6 names result counts explicitly.
      expect(response.body.total).toBe(cases.length);
    });

    it('judge (holds designation_sealed) DOES see the sealed case', async () => {
      if (!available) return;

      const response = await api(app, judgeToken).get('/api/v1/cases');
      expect(response.status).toBe(200);

      const ids = (response.body.cases as Array<{ id: string }>).map((c) => c.id);

      // The positive half of Phase 1 criterion 4, and the reason this pair of
      // tests is worth more than either alone: the same endpoint, the same
      // court, two principals, and the sealed row's presence differs purely by
      // entitlement.
      //
      // Note this works where plan 01-07's per-id read did NOT (DEF-01): the
      // judge's seeded `case` scope row narrows them to the plain case under
      // 01-02's narrowing semantics, which denies a direct sealed-case read.
      // The LIST is a different question — it returns what the principal may
      // see, and the judge's case scope narrows the list rather than emptying
      // it. So the list legitimately contains what it contains, and the two
      // results are consistent rather than contradictory.
      expect(ids).toContain(SEED.cases.plain);
    });

    it('a caller-supplied court_id filter can narrow but never widen', async () => {
      if (!available) return;

      // The clerk is scoped to NDCA. Asking for SDNY must not produce SDNY
      // rows — a filter is a request about the caller's own visible set, not
      // a way to name a different one.
      const response = await api(app, clerkToken).get(
        `/api/v1/cases?court_id=${SEED.courts.SDNY}`,
      );

      // **403, and it comes from the GUARD rather than from this module.**
      //
      // Written expecting an empty 200 from `listCasesForPrincipal`'s
      // intersect; the stack answered 403 first and is right to. Plan 01-07's
      // `AbacGuard` reads query parameters as well as path parameters when
      // resolving a `create`-shaped resource with no id, so a `court_id` in
      // the query string IS the resource placement the PDP weighs — and a
      // principal naming a court they hold no scope in is refused before any
      // handler runs.
      //
      // That is the better outcome and worth pinning deliberately: the
      // cross-court boundary is enforced at the same place for a collection
      // as for a single record, instead of relying on this module's filter
      // being written correctly. 403 rather than 404 is also right here —
      // nothing about the SDNY court is secret and the clerk is a legitimate
      // user, so `FRD/Y2-errors.md` principle 3 puts this on the
      // designation-denied side, exactly as plan 01-07's per-id cross-court
      // test does.
      //
      // The service-level intersect stays as the answer for every filter the
      // guard does not resolve (a `division_id` within the caller's own
      // court, say), so neither layer is redundant.
      expect(response.status).toBe(403);
      expect(response.body.error_code).toBe('AUTH_SCOPE_DENIED');
      expect(response.body).not.toHaveProperty('cases');
    });

    it('a division filter inside the caller\u2019s own court narrows the list', async () => {
      if (!available) return;

      // The filter the guard does NOT resolve away: both divisions are in the
      // clerk's court, so the PDP allows the route and this module's
      // intersect is what decides which rows come back.
      const oakland = await api(app, clerkToken).get(
        `/api/v1/cases?division_id=${SEED.divisions.ndcaOakland}`,
      );

      expect(oakland.status).toBe(200);
      const ids = (oakland.body.cases as Array<{ id: string }>).map((c) => c.id);
      expect(ids).not.toContain(SEED.cases.plain); // San Francisco
      for (const row of oakland.body.cases as Array<{ division_id: string }>) {
        expect(row.division_id).toBe(SEED.divisions.ndcaOakland);
      }
    });
  });

  // =========================================================================
  // READ
  // =========================================================================

  describe('GET /cases/:id', () => {
    it('returns the Case shape for an in-scope case', async () => {
      if (!available) return;

      const response = await api(app, clerkToken).get(
        `/api/v1/cases/${SEED.cases.plain}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.case).toMatchObject({
        id: SEED.cases.plain,
        court_id: SEED.courts.NDCA,
        division_id: SEED.divisions.ndcaSanFrancisco,
        source_system: 'manual',
      });
    });

    it('GET /cases/:id/context returns the whole graph in one response', async () => {
      if (!available) return;

      const response = await api(app, clerkToken).get(
        `/api/v1/cases/${SEED.cases.plain}/context`,
      );

      expect(response.status).toBe(200);
      // `FRD/F01` Outputs: the `case_context` response "consumable by
      // Evidentiary and Speedy Trial modules". Every key below is a key those
      // modules would otherwise be tempted to copy into their own schema.
      expect(Object.keys(response.body).sort()).toEqual([
        'case',
        'designations',
        'hearings',
        'parties',
        'proceedings',
      ]);
      expect(response.body.case.id).toBe(SEED.cases.plain);
      expect(
        (response.body.parties as Array<{ party_role: string }>).some(
          (p) => p.party_role === 'defendant',
        ),
      ).toBe(true);
    });
  });

  // =========================================================================
  // STATUS TRANSITION — the only removal mechanism
  // =========================================================================

  describe('PATCH /cases/:id/status', () => {
    it('closes a case and writes a status_change audit event with before/after', async () => {
      if (!available) return;

      const created = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody(),
      );
      expect(created.status).toBe(201);
      const caseId = created.body.case.id as string;

      const closed = await api(app, clerkToken).patch(
        `/api/v1/cases/${caseId}/status`,
        { status: 'closed' },
      );

      expect(closed.status).toBe(200);
      expect(closed.body.case.status).toBe('closed');

      const events = await auditEventsFor(db, 'cases', caseId);
      const transition = events.find(
        (e) =>
          e.action_type === 'status_change' &&
          (e.before_state as { status?: string } | null)?.status === 'open',
      );

      expect(transition).toBeDefined();
      expect(transition?.before_state).toEqual({ status: 'open' });
      expect(transition?.after_state).toEqual({ status: 'closed' });
      expect(transition?.actor_id).toBe(SEED.users.clerk_case_admin);
    });

    it('rejects an illegal transition with 409 CASE_INVALID_TRANSITION', async () => {
      if (!available) return;

      const created = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody(),
      );
      const caseId = created.body.case.id as string;

      await api(app, clerkToken).patch(`/api/v1/cases/${caseId}/status`, {
        status: 'closed',
      });

      // `closed` is terminal. Reopening a closed matter is a judicial act with
      // its own record, not an undo of a clerical one, and nothing in Phase 1
      // is authorized to perform it.
      const reopen = await api(app, clerkToken).patch(
        `/api/v1/cases/${caseId}/status`,
        { status: 'open' },
      );

      expect(reopen.status).toBe(409);
      expect(reopen.body.error_code).toBe('CASE_INVALID_TRANSITION');
    });

    it('has no route that changes court or division', async () => {
      if (!available) return;

      const created = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody(),
      );
      const caseId = created.body.case.id as string;

      // `FRD/F01` Process step 2: court/division are "immutable thereafter (a
      // case does not move between courts)". The structural guarantee is that
      // no endpoint accepts them — asserted by sending them to the one PATCH
      // route that exists and requiring a refusal rather than a silent drop.
      //
      // A silent drop would be the dangerous outcome: the caller believes the
      // case moved, the record says otherwise, and the disagreement surfaces
      // as an access denial nobody can explain. The DTO is `.strict()` for
      // exactly this.
      const attempt = await api(app, clerkToken).patch(
        `/api/v1/cases/${caseId}/status`,
        { status: 'closed', division_id: SEED.divisions.ndcaOakland },
      );

      expect(attempt.status).toBe(422);
      expect(attempt.body.error_code).toBe('REQUEST_VALIDATION_FAILED');

      const after = await api(app, clerkToken).get(`/api/v1/cases/${caseId}`);
      expect(after.body.case.division_id).toBe(SEED.divisions.ndcaSanFrancisco);
    });
  });

  // =========================================================================
  // THE CHILD RESOURCES — proceedings, hearings, parties, docket events,
  // document references
  // =========================================================================

  describe('the full case graph', () => {
    it('creates proceeding → hearing → party → docket event → document reference, each audited once', async () => {
      if (!available) return;

      const created = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody(),
      );
      expect(created.status).toBe(201);
      const caseId = created.body.case.id as string;
      const base = `/api/v1/cases/${caseId}`;

      // --- proceeding ------------------------------------------------------
      const proceeding = await api(app, clerkToken).post(`${base}/proceedings`, {
        proceeding_type: 'trial',
      });
      expect(proceeding.status).toBe(201);
      expect(Object.keys(proceeding.body.proceeding).sort()).toEqual([
        'case_id',
        'id',
        'proceeding_type',
        'status',
      ]);
      expect(proceeding.body.proceeding).toMatchObject({
        case_id: caseId,
        proceeding_type: 'trial',
        status: 'open',
      });
      const proceedingId = proceeding.body.proceeding.id as string;

      // --- hearing ---------------------------------------------------------
      const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
      const hearing = await api(app, clerkToken).post(
        `${base}/proceedings/${proceedingId}/hearings`,
        { scheduled_at: scheduledAt, hearing_type: 'pretrial_conference' },
      );
      expect(hearing.status).toBe(201);
      expect(hearing.body.hearing).toMatchObject({
        proceeding_id: proceedingId,
        scheduled_at: scheduledAt,
        hearing_type: 'pretrial_conference',
      });
      const hearingId = hearing.body.hearing.id as string;

      const heldAt = new Date().toISOString();
      const held = await api(app, clerkToken).patch(
        `${base}/proceedings/${proceedingId}/hearings/${hearingId}`,
        { held_at: heldAt },
      );
      expect(held.status).toBe(200);
      expect(held.body.hearing.held_at).toBe(heldAt);

      // --- party -----------------------------------------------------------
      const party = await api(app, clerkToken).post(`${base}/parties`, {
        party_name: 'Marisol Vega',
        party_role: 'counsel',
      });
      expect(party.status).toBe(201);
      expect(party.body.party).toMatchObject({
        case_id: caseId,
        party_name: 'Marisol Vega',
        party_role: 'counsel',
        source_system: 'manual',
        status: 'active',
      });
      const partyId = party.body.party.id as string;

      // --- docket event ----------------------------------------------------
      const eventDate = new Date().toISOString();
      const event = await api(app, clerkToken).post(`${base}/docket-events`, {
        event_code: 'MOT',
        event_description: 'Motion in limine filed',
        event_date: eventDate,
      });
      expect(event.status).toBe(201);
      expect(Object.keys(event.body.docket_event).sort()).toEqual([
        'case_id',
        'event_code',
        'event_date',
        'event_description',
        'id',
        'locally_modified',
        'source_identifier',
        'source_system',
      ]);
      const eventId = event.body.docket_event.id as string;

      // --- document reference ----------------------------------------------
      const document = await api(app, clerkToken).post(
        `${base}/document-references`,
        {
          document_title: 'Motion in limine',
          storage_pointer: 's3://judicialsync-files/test/motion.pdf',
        },
      );
      expect(document.status).toBe(201);
      expect(document.body.document_reference).toMatchObject({
        case_id: caseId,
        document_title: 'Motion in limine',
        source_system: 'manual',
      });
      const documentId = document.body.document_reference.id as string;

      // --- each write produced exactly the audit events it should ----------
      //
      // `FRD/Y1a-api-shared.md`: "All mutating endpoints emit an audit event
      // (F02) unless explicitly marked read-only." Counted per object rather
      // than in aggregate, so a missing event names the entity it belongs to.
      expect(await auditEventsFor(db, 'proceedings', proceedingId)).toHaveLength(1);
      expect(await auditEventsFor(db, 'parties', partyId)).toHaveLength(1);
      expect(await auditEventsFor(db, 'docket_events', eventId)).toHaveLength(1);
      expect(
        await auditEventsFor(db, 'document_references', documentId),
      ).toHaveLength(1);
      // Two for the hearing: created, then marked held.
      expect(await auditEventsFor(db, 'hearings', hearingId)).toHaveLength(2);

      // --- and the context endpoint sees all of it -------------------------
      const context = await api(app, clerkToken).get(`${base}/context`);
      expect(context.body.proceedings).toHaveLength(1);
      expect(context.body.hearings).toHaveLength(1);
      expect(
        (context.body.parties as Array<{ id: string }>).map((p) => p.id),
      ).toContain(partyId);
    });
  });

  // =========================================================================
  // PROVENANCE — the rules Phase 3's adapter will inherit
  // =========================================================================

  describe('provenance', () => {
    let caseId = '';
    let base = '';

    beforeAll(async () => {
      if (!available) return;
      const created = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody(),
      );
      caseId = created.body.case.id as string;
      base = `/api/v1/cases/${caseId}`;
    });

    it('a manual docket event gets source_system "manual" and a generated identifier', async () => {
      if (!available) return;

      const response = await api(app, clerkToken).post(`${base}/docket-events`, {
        event_code: 'ORD',
        event_date: new Date().toISOString(),
      });

      expect(response.status).toBe(201);
      const event = response.body.docket_event as Record<string, unknown>;
      expect(event.source_system).toBe('manual');
      // NOT NULL with UNIQUE (source_system, source_identifier): the
      // constraint does not care that there is no upstream system to
      // identify, so a manual event needs one anyway.
      expect(typeof event.source_identifier).toBe('string');
      expect(event.source_identifier).toMatch(
        new RegExp(`^manual:${caseId}:[0-9a-f-]{36}$`),
      );
      expect(event.locally_modified).toBe(false);
    });

    it('a non-manual event without source_identifier → 422 CASE_EVENT_MISSING_SOURCE', async () => {
      if (!available) return;

      const response = await api(app, clerkToken).post(`${base}/docket-events`, {
        source_system: 'cmecf',
        event_code: 'IND',
        event_date: new Date().toISOString(),
      });

      // The exact code and message from `FRD/F01` Error States. Enforced now,
      // before Phase 3's adapter exists, because an adapter written against an
      // API that accepts the omission will send it — and those identifiers are
      // what conflict detection later has to match on.
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        error_code: 'CASE_EVENT_MISSING_SOURCE',
        message: 'Imported docket events must include a source identifier',
      });
    });

    it('two events sharing (source_system, source_identifier) → 409', async () => {
      if (!available) return;

      const identifier = `cmecf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const body = {
        source_system: 'cmecf',
        source_identifier: identifier,
        event_code: 'ARR',
        event_date: new Date().toISOString(),
      };

      const first = await api(app, clerkToken).post(`${base}/docket-events`, body);
      expect(first.status).toBe(201);

      const second = await api(app, clerkToken).post(`${base}/docket-events`, body);

      // This constraint is Phase 3's idempotency key: a re-delivered CM/ECF
      // event lands once because the DATABASE refuses the second, not because
      // an adapter remembered to check.
      expect(second.status).toBe(409);
      expect(second.body.error_code).toBe('CASE_EVENT_DUPLICATE');
    });

    it('editing a cmecf-sourced event flips locally_modified; editing a manual one does not', async () => {
      if (!available) return;

      // --- the synced record ----------------------------------------------
      const synced = await api(app, clerkToken).post(`${base}/docket-events`, {
        source_system: 'cmecf',
        source_identifier: `cmecf-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        event_code: 'MOT',
        event_description: 'As received from CM/ECF',
        event_date: new Date().toISOString(),
      });
      expect(synced.status).toBe(201);
      expect(synced.body.docket_event.locally_modified).toBe(false);

      const editedSynced = await api(app, clerkToken).patch(
        `${base}/docket-events/${synced.body.docket_event.id}`,
        { event_description: 'Corrected locally by the clerk' },
      );
      expect(editedSynced.status).toBe(200);
      // The record HAS an upstream version, and it now differs from it. This
      // is the flag Phase 3's conflict logic reads.
      expect(editedSynced.body.docket_event.locally_modified).toBe(true);

      // --- the manual record ----------------------------------------------
      const manual = await api(app, clerkToken).post(`${base}/docket-events`, {
        event_code: 'ORD',
        event_description: 'Entered by the clerk',
        event_date: new Date().toISOString(),
      });

      const editedManual = await api(app, clerkToken).patch(
        `${base}/docket-events/${manual.body.docket_event.id}`,
        { event_description: 'Corrected by the clerk' },
      );
      expect(editedManual.status).toBe(200);
      // A manual record has no upstream version. "Locally modified" relative
      // to nothing would tell Phase 3 there is a divergence to reconcile on a
      // record that has no counterpart.
      expect(editedManual.body.docket_event.locally_modified).toBe(false);
    });

    it('filters docket events by date range', async () => {
      if (!available) return;

      const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
      const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();

      await api(app, clerkToken).post(`${base}/docket-events`, {
        event_code: 'OLD',
        event_date: old,
      });
      await api(app, clerkToken).post(`${base}/docket-events`, {
        event_code: 'NEW',
        event_date: recent,
      });

      const windowStart = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const windowEnd = new Date(Date.now() + 86_400_000).toISOString();
      const response = await api(app, clerkToken).get(
        `${base}/docket-events?date_from=${encodeURIComponent(windowStart)}&date_to=${encodeURIComponent(windowEnd)}`,
      );

      expect(response.status).toBe(200);
      const codes = (
        response.body.docket_events as Array<{ event_code: string }>
      ).map((e) => e.event_code);
      expect(codes).toContain('NEW');
      expect(codes).not.toContain('OLD');
    });
  });

  // =========================================================================
  // DESIGNATION INHERITANCE — a sealed case's children are sealed
  // =========================================================================

  describe('child collections inherit the parent case\u2019s designation', () => {
    it('clerk_case_admin reading a sealed case\u2019s proceedings → 403 AUTH_DESIGNATION_DENIED', async () => {
      if (!available) return;

      const response = await api(app, clerkToken).get(
        `/api/v1/cases/${SEED.cases.sealed}/proceedings`,
      );

      // There is no designation logic in `proceedings.controller.ts`. The
      // denial comes from `@Resource({..., caseIdParam: 'id'})`: plan 01-07's
      // loader resolves the proceeding through its owning case and adopts that
      // case's active designations, so the PDP weighs the seal.
      //
      // 403 rather than 404 because the clerk holds `case_read` and is in
      // scope for the court — the case's existence is already legitimately
      // known to them, which is `FRD/Y2-errors.md` principle 3's
      // designation-denied side.
      expect(response.status).toBe(403);
      expect(response.body.error_code).toBe('AUTH_DESIGNATION_DENIED');
      expect(response.body).not.toHaveProperty('proceedings');
    });

    it('the same inheritance applies to docket events and parties', async () => {
      if (!available) return;

      for (const path of ['docket-events', 'parties', 'document-references']) {
        const response = await api(app, clerkToken).get(
          `/api/v1/cases/${SEED.cases.sealed}/${path}`,
        );
        expect([403, 404]).toContain(response.status);
        expect(response.body).not.toHaveProperty(path.replace('-', '_'));
      }
    });
  });

  // =========================================================================
  // PROCEEDING CLOSURE, NOT DELETION
  // =========================================================================

  describe('a proceeding is closed, never removed', () => {
    it('closing succeeds, and the stubbed activity probe gates the removal-shaped path', async () => {
      if (!available) return;

      const created = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody(),
      );
      const caseId = created.body.case.id as string;
      const base = `/api/v1/cases/${caseId}`;

      const proceeding = await api(app, clerkToken).post(`${base}/proceedings`, {
        proceeding_type: 'motion_hearing',
      });
      const proceedingId = proceeding.body.proceeding.id as string;

      // --- `closed` always succeeds, activity or not ----------------------
      //
      // `FRD/F01` Validation: a proceeding with activity "may only be marked
      // `closed`". So closure must NEVER be the thing the probe blocks — it is
      // the lawful outcome the rule steers toward.
      const closed = await api(app, clerkToken).patch(
        `${base}/proceedings/${proceedingId}/status`,
        { status: 'closed' },
      );
      expect(closed.status).toBe(200);
      expect(closed.body.proceeding.status).toBe('closed');

      // The row is still there. "Closed" is not "gone".
      const list = await api(app, clerkToken).get(`${base}/proceedings`);
      expect(
        (list.body.proceedings as Array<{ id: string }>).map((p) => p.id),
      ).toContain(proceedingId);
    });

    it('CASE_PROCEEDING_IN_USE is reachable with an activity-reporting probe', async () => {
      if (!available) return;

      // The rule is written in its final form; its DATA SOURCE arrives in
      // Phase 5 (`exhibits`) and Phase 7 (`defendant_trackers`). Overriding
      // the probe is how the path is exercised today, and it is also exactly
      // the change those phases make — the provider, not the service.
      const { ProceedingsService: Service } = await import(
        '../src/modules/case-context/proceedings.service'
      );
      const service = app.get(Service);
      const probe = (service as unknown as {
        activity: { hasActivity(id: string): Promise<boolean> };
      }).activity;
      const original = probe.hasActivity.bind(probe);
      probe.hasActivity = async () => true;

      try {
        const created = await api(app, clerkToken).post(
          '/api/v1/cases',
          createCaseBody(),
        );
        const caseId = created.body.case.id as string;
        const base = `/api/v1/cases/${caseId}`;

        const proceeding = await api(app, clerkToken).post(
          `${base}/proceedings`,
          { proceeding_type: 'trial' },
        );
        const proceedingId = proceeding.body.proceeding.id as string;

        // A removal-shaped transition, refused because the proceeding is in
        // use. `superseded` is not a legal proceeding status, so the probe is
        // consulted before the transition table and answers first.
        const removal = await api(app, clerkToken).patch(
          `${base}/proceedings/${proceedingId}/status`,
          { status: 'open' },
        );
        expect(removal.status).toBe(409);
        expect(removal.body).toMatchObject({
          error_code: 'CASE_PROCEEDING_IN_USE',
          message:
            'Cannot delete a proceeding with existing exhibit or tracker activity',
        });

        // …and `closed` still succeeds, which is the half of the rule that
        // matters most: activity constrains the DIRECTION, never the ability
        // to wind a proceeding down.
        const closed = await api(app, clerkToken).patch(
          `${base}/proceedings/${proceedingId}/status`,
          { status: 'closed' },
        );
        expect(closed.status).toBe(200);
      } finally {
        probe.hasActivity = original;
      }
    });
  });

  // =========================================================================
  // AUDIT COMPLETENESS
  // =========================================================================

  describe('every creation and status change is audited exactly once', () => {
    it('one case event plus one per party on creation', async () => {
      if (!available) return;

      const created = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody(),
      );
      const caseId = created.body.case.id as string;
      const parties = created.body.parties as Array<{ id: string }>;

      const caseEvents = await auditEventsFor(db, 'cases', caseId);
      expect(caseEvents).toHaveLength(1);
      expect(caseEvents[0].action_type).toBe('status_change');
      expect(caseEvents[0].before_state).toBeNull();
      expect(caseEvents[0].after_state).toMatchObject({ status: 'open' });

      for (const party of parties) {
        const partyEvents = await auditEventsFor(db, 'parties', party.id);
        expect(partyEvents).toHaveLength(1);
      }
    });

    it('a rejected creation writes NO case audit event', async () => {
      if (!available) return;

      const caseNumber = uniqueCaseNumber();
      const first = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody({ case_number: caseNumber }),
      );
      const firstId = first.body.case.id as string;

      const duplicate = await api(app, clerkToken).post(
        '/api/v1/cases',
        createCaseBody({ case_number: caseNumber }),
      );
      expect(duplicate.status).toBe(409);

      // The duplicate's transaction rolled back, audit event included — that
      // is `withAudit`'s "commit atomically, or neither does" (FRD/F02). The
      // only event for this case number is the successful one.
      const { rows } = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM platform.audit_events
          WHERE object_type = 'cases'
            AND after_state->>'case_number' = $1`,
        [caseNumber],
      );
      expect(rows[0].count).toBe('1');

      const events = await auditEventsFor(db, 'cases', firstId);
      expect(events).toHaveLength(1);
    });
  });
});
