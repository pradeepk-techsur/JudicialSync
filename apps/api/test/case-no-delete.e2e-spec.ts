import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import {
  bootApp,
  loginAs,
  requireStack,
  testDatabaseUrl,
} from './auth-harness';

/**
 * ============================================================================
 * THE STRUCTURAL PROOF: NO DELETE PATH EXISTS, ANYWHERE
 * ============================================================================
 *
 * The central structural commitment of plan 01-09 is the ABSENCE of something.
 * CONTEXT: "No hard deletes anywhere in the case model. No `DELETE` endpoints.
 * Removal is always a status transition." Plan 01-03 already removed the
 * database DELETE grant; this suite proves the API never offers one and the
 * database would refuse one anyway.
 *
 * Three independent layers are asserted:
 *   1. HTTP — a `DELETE` against every case-model resource returns 404/405
 *      (the route does not exist), never 200/204/403 (which would mean a delete
 *      route exists and is merely guarded).
 *   2. Source — no file under `modules/case-context/` contains `@Delete(` or a
 *      Prisma `.delete(`/`.deleteMany(` call.
 *   3. Database — a raw `DELETE FROM platform.cases` as `app_rw` fails with
 *      SQLSTATE `42501` (insufficient privilege).
 *
 * And the positive half: closing a case via `PATCH .../status` succeeds and the
 * row still exists — removal is a transition, and the record is still there.
 */

jest.setTimeout(300_000);

const COURTS = { NDCA: '0a000001-0000-4000-8000-000000000001' } as const;
const DIVISIONS = { ndcaSanFrancisco: '0a000002-0000-4000-8000-000000000001' } as const;
const CASES = { plain: '0a000005-0000-4000-8000-000000000001' } as const;

const unique = (): string => `nodelete-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe('case-no-delete: removal is a transition, never a delete (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  let available = false;
  let token: string;

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

    ({ session_token: token } = await loginAs(app, 'clerk_case_admin'));
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
    restoreEnv?.();
  });

  const del = (path: string): request.Test =>
    request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${token}`);

  // =========================================================================
  // 1. HTTP — DELETE routes do not exist
  // =========================================================================

  describe('HTTP DELETE against every case-model resource', () => {
    // Concrete ids are irrelevant: the route pattern must not exist at all, so
    // the method is refused before any id is looked up.
    const anyId = '0a000005-0000-4000-8000-0000000000aa';
    const paths = [
      `/api/v1/cases/${CASES.plain}`,
      `/api/v1/cases/${CASES.plain}/proceedings/${anyId}`,
      `/api/v1/cases/${CASES.plain}/parties/${anyId}`,
      `/api/v1/cases/${CASES.plain}/docket-events/${anyId}`,
      `/api/v1/cases/${CASES.plain}/document-references/${anyId}`,
      `/api/v1/cases/${CASES.plain}/security-designations`,
    ];

    it.each(paths)('DELETE %s → 404 or 405, never 200/204/403', async (path) => {
      if (!available) return;

      const res = await del(path);
      // 404 (no route) or 405 (method not allowed on an existing path). A 200
      // or 204 would mean a delete happened; a 403 would mean a delete route
      // exists and is merely guarded — both are failures of the structural
      // commitment.
      expect([404, 405]).toContain(res.status);
      expect([200, 204, 403]).not.toContain(res.status);
    });
  });

  // =========================================================================
  // 2. Source — no delete affordance in the module
  // =========================================================================

  describe('the case-context source', () => {
    const moduleDir = join(__dirname, '..', 'src', 'modules', 'case-context');

    const allSources = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...allSources(full));
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
          out.push(full);
        }
      }
      return out;
    };

    it('contains no @Delete( route decorator', () => {
      if (!available) return;
      for (const file of allSources(moduleDir)) {
        const text = readFileSync(file, 'utf8');
        expect(text).not.toMatch(/@Delete\(/);
      }
    });

    it('contains no Prisma .delete( or .deleteMany( call', () => {
      if (!available) return;
      for (const file of allSources(moduleDir)) {
        const text = readFileSync(file, 'utf8');
        expect(text).not.toMatch(/\.delete\(/);
        expect(text).not.toMatch(/\.deleteMany\(/);
      }
    });
  });

  // =========================================================================
  // 3. Database — app_rw holds no DELETE grant
  // =========================================================================

  describe('the database grant', () => {
    it('DELETE FROM platform.cases as app_rw → SQLSTATE 42501', async () => {
      if (!available) return;

      let code: string | undefined;
      try {
        await db.query(`DELETE FROM platform.cases WHERE id = $1`, [CASES.plain]);
      } catch (error) {
        code = (error as { code?: string }).code;
      }
      // 42501 = insufficient_privilege. The API has no delete route AND the
      // database would refuse one.
      expect(code).toBe('42501');
    });
  });

  // =========================================================================
  // The positive half — closing is a transition, the row survives
  // =========================================================================

  describe('closing a case', () => {
    it('PATCH .../status to closed succeeds and the row still exists', async () => {
      if (!available) return;

      const created = await request(app.getHttpServer())
        .post('/api/v1/cases')
        .set('Authorization', `Bearer ${token}`)
        .send({
          case_number: unique(),
          court_id: COURTS.NDCA,
          division_id: DIVISIONS.ndcaSanFrancisco,
          case_caption: 'United States v. Survivor',
          case_type: 'criminal',
          party: [{ name: 'Survivor Defendant', role: 'defendant' }],
        });
      expect(created.status).toBe(201);
      const caseId = created.body.id as string;

      const closed = await request(app.getHttpServer())
        .patch(`/api/v1/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'closed' });
      expect(closed.status).toBe(200);

      const rows = await db.query<{ status: string }>(
        `SELECT status FROM platform.cases WHERE id = $1`,
        [caseId],
      );
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0].status).toBe('closed');
    });
  });
});
