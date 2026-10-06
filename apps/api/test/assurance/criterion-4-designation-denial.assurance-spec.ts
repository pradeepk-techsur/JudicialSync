/**
 * ============================================================================
 * CRITERION 4 — SECURITY-DESIGNATION DENIAL, AND THE DENIAL IS ITSELF AUDITED
 * ============================================================================
 *
 * ROADMAP success criterion 4: "A user lacking a specific security-designation
 * entitlement (sealed/restricted/grand-jury/juvenile/PII) is denied access to a
 * tagged record, and the denied attempt itself is logged as an audit event."
 *
 * Every case issues RAW HTTP against the running stack with a real token — no
 * in-process module, no UI (see harness.ts).
 *
 * ## 403 vs 404 — FRD/Y2-errors.md principle 3, and the seed topology that proves both
 *
 *  - **403 branch** — a requester who already has a legitimate path to the
 *    record's EXISTENCE but lacks the designation entitlement. `clerk_case_admin`
 *    holds `case_read` and an NDCA court scope (so the sealed case's existence is
 *    known to them) but NOT `designation_sealed` → `403
 *    AUTH_DESIGNATION_DENIED`.
 *  - **404 branch** — a requester with NO access path to the record at all.
 *    `system_admin` is scoped to SDNY, so the NDCA sealed case is not a thing it
 *    may know exists → `404`, and the body must be BYTE-IDENTICAL to the 404 for
 *    a genuinely nonexistent UUID. A divergence would be an existence oracle.
 *
 * ## DEF-01 (recorded, not worked around in production)
 *
 * The seeded `judge` holds `designation_sealed` but its only CASE scope is on the
 * PLAIN case (01-04), and under 01-02's narrowing semantics that confines the
 * judge to exactly that case — so the judge is denied the sealed case on SCOPE,
 * before designation is ever considered. The POSITIVE control (case 5) therefore
 * grants the judge a sealed-case scope IN-TEST (as app_dba, cleaned up after),
 * exactly as 01-07's guard suite does, so the only variable under test is the
 * designation entitlement. This plan writes NO production code; DEF-01 is
 * recorded as a confirmed finding in the SUMMARY with the one-row seed fix it
 * recommends.
 */
import {
  api,
  appDbaClient,
  forgetToken,
  loginFresh,
  requireStack,
  seedIds,
  tokenFor,
} from './harness';

jest.setTimeout(900_000);

const SEALED = seedIds.cases.sealed;
const RESTRICTED = seedIds.cases.restricted;
const PLAIN = seedIds.cases.plain;
const NONEXISTENT = seedIds.nonexistent;

const isDenied = (status: number): boolean => [401, 403, 404].includes(status);

describe('criterion 4: security-designation denial (assurance)', () => {
  let available = false;

  beforeAll(async () => {
    available = await requireStack();
  });

  // =========================================================================
  // 1. 403 branch — parent access known, designation entitlement missing
  // =========================================================================

  it('criterion 4: sealed case → 403 AUTH_DESIGNATION_DENIED for a parent-access requester', async () => {
    if (!available) return;
    const clerk = await tokenFor('clerk_case_admin');

    const caseRes = await api.get<{ error_code?: string }>(`/cases/${SEALED}`, {
      token: clerk,
    });
    expect(caseRes.status).toBe(403);
    expect(caseRes.body.error_code).toBe('AUTH_DESIGNATION_DENIED');

    // Its children inherit the designation denial.
    for (const child of [
      'proceedings',
      'parties',
      'docket-events',
      'document-references',
    ]) {
      const res = await api.get(`/cases/${SEALED}/${child}`, { token: clerk });
      expect(isDenied(res.status)).toBe(true);
      expect(res.status).not.toBe(200);
    }
  });

  // =========================================================================
  // 2. 404 branch — no access path, byte-identical to a nonexistent case
  // =========================================================================

  it('criterion 4: sealed case → 404 for a no-path requester, byte-identical to a nonexistent id', async () => {
    if (!available) return;

    // system_admin is scoped to SDNY; the NDCA sealed case is not theirs to know
    // exists. The 404 must be indistinguishable from a genuinely-absent case, or
    // the status itself would confirm the sealed matter's existence.
    const sysadmin = await tokenFor('system_admin');

    const sealed = await api.get(`/cases/${SEALED}`, { token: sysadmin });
    const random = await api.get(`/cases/${NONEXISTENT}`, { token: sysadmin });

    expect(sealed.status).toBe(404);
    expect(random.status).toBe(404);
    // Byte-for-byte identical bodies — the honest version of "existence hidden".
    expect(sealed.rawBody).toBe(random.rawBody);
  });

  it('criterion 4: response timing cannot distinguish the sealed case from a nonexistent one', async () => {
    if (!available) return;

    // §7.6: "response timing cannot be used to infer the existence of a sealed
    // matter." A band check is the honest form of that assertion — the sandbox
    // cannot deliver microsecond determinism, so the medians of paired requests
    // are asserted within a generous tolerance rather than asserting a precision
    // the environment does not have.
    const sysadmin = await tokenFor('system_admin');

    const timeOne = async (path: string): Promise<number> => {
      const start = process.hrtime.bigint();
      await api.get(path, { token: sysadmin });
      return Number(process.hrtime.bigint() - start) / 1e6; // ms
    };

    const sealedTimes: number[] = [];
    const absentTimes: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      // Interleave so a drift in overall load affects both equally.
      sealedTimes.push(await timeOne(`/cases/${SEALED}`));
      absentTimes.push(await timeOne(`/cases/${NONEXISTENT}`));
    }

    const median = (xs: number[]): number => {
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const sealedMed = median(sealedTimes);
    const absentMed = median(absentTimes);

    // Generous band: the two medians within max(15ms, 50% of the larger). The
    // existence decision is the same codepath for both, so any gap is noise.
    const tolerance = Math.max(15, 0.5 * Math.max(sealedMed, absentMed));
    expect(Math.abs(sealedMed - absentMed)).toBeLessThanOrEqual(tolerance);
  });

  // =========================================================================
  // 3. Restricted designation behaves the same way
  // =========================================================================

  it('criterion 4: restricted case → 403 AUTH_DESIGNATION_DENIED for a parent-access requester', async () => {
    if (!available) return;
    const clerk = await tokenFor('clerk_case_admin');
    const res = await api.get<{ error_code?: string }>(`/cases/${RESTRICTED}`, {
      token: clerk,
    });
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('AUTH_DESIGNATION_DENIED');
  });

  // =========================================================================
  // 4. Role existence does not imply access
  // =========================================================================

  it('criterion 4: a role without entitlements grants nothing', async () => {
    if (!available) return;

    // jury_admin holds a role and ZERO entitlements — the permanent fixture that
    // makes "role existence never implies access" falsifiable rather than merely
    // asserted (CONTEXT: "must be proven by test, not merely asserted"). It is
    // denied even the ordinary, undesignated case.
    const jury = await tokenFor('jury_admin');
    const res = await api.get(`/cases/${PLAIN}`, { token: jury });
    expect(isDenied(res.status)).toBe(true);
    expect(res.status).not.toBe(200);
  });

  // =========================================================================
  // 5. Entitlement grants access (the positive control) — DEF-01 handled in-test
  // =========================================================================

  it('criterion 4: with designation_sealed AND a sealed-case scope, the judge reads the sealed case', async () => {
    if (!available) return;

    // The judge holds designation_sealed but is scoped to the PLAIN case only
    // (DEF-01), so without this the sealed read is denied on SCOPE and the suite
    // could not distinguish "correctly denied" from "broken". Grant the
    // sealed-case scope in-test (app_dba), so the ONLY variable is the
    // designation entitlement, then assert 200.
    const dba = await appDbaClient();
    try {
      await dba.query(
        `INSERT INTO platform.scope_assignments (user_id, scope_type, scope_value)
           VALUES ($1, 'case', $2) ON CONFLICT DO NOTHING`,
        [seedIds.users.judge, SEALED],
      );
      forgetToken('judge');
      const judge = (await loginFresh('judge')).session_token;

      const res = await api.get<{ id: string }>(`/cases/${SEALED}`, {
        token: judge,
      });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(SEALED);
    } finally {
      await dba.query(
        `DELETE FROM platform.scope_assignments
           WHERE user_id = $1 AND scope_type = 'case' AND scope_value = $2`,
        [seedIds.users.judge, SEALED],
      );
      await dba.end();
      forgetToken('judge');
    }
  });

  // =========================================================================
  // 6. Audit history inherits the designation
  // =========================================================================

  it('criterion 4: audit history for the sealed case is withheld without the designation', async () => {
    if (!available) return;

    // security_officer holds audit_reader but NOT designation_sealed. A query
    // filtered to the sealed case is denied; an unfiltered query returns no row
    // belonging to that case (the designation pre-filter excludes it before the
    // page is built).
    const officer = await tokenFor('security_officer');

    const filtered = await api.get<{ error_code?: string }>(
      `/audit/explorer?case_id=${SEALED}`,
      { token: officer },
    );
    // Denied with the audit-specific designation code (01-12 refinement), or a
    // byte-identical empty/404 for a blind-discovery requester — either is a
    // withholding, never the sealed case's rows.
    expect([403, 404, 200]).toContain(filtered.status);
    if (filtered.status === 403) {
      expect(filtered.body.error_code).toBe('AUDIT_DESIGNATION_DENIED');
    }

    // The unfiltered query must not surface any audit row belonging to the
    // sealed case.
    const all = await api.get<{
      audit_events: { object_id?: string; object_type?: string }[];
    }>('/audit/explorer', { token: officer });
    expect(all.status).toBe(200);
    expect(
      all.body.audit_events.some(
        (e) => e.object_type === 'cases' && e.object_id === SEALED,
      ),
    ).toBe(false);
  });

  // =========================================================================
  // 7. List endpoints omit the designated case entirely
  // =========================================================================

  it('criterion 4: GET /cases omits the sealed case for the unentitled, includes it for the entitled', async () => {
    if (!available) return;

    // UX-Mockup/Y0-patterns.md: "omitted entirely — never shown as a greyed-out
    // row, a 'restricted' placeholder, or a count that includes it."
    const clerk = await tokenFor('clerk_case_admin');
    const unentitled = await api.get<{
      cases: { id: string }[];
      total?: number;
    }>('/cases', { token: clerk });
    expect(unentitled.status).toBe(200);
    const unentitledIds = unentitled.body.cases.map((c) => c.id);
    expect(unentitledIds).not.toContain(SEALED);

    // The entitled judge (with the sealed-case scope granted in-test) includes it.
    const dba = await appDbaClient();
    try {
      await dba.query(
        `INSERT INTO platform.scope_assignments (user_id, scope_type, scope_value)
           VALUES ($1, 'case', $2) ON CONFLICT DO NOTHING`,
        [seedIds.users.judge, SEALED],
      );
      forgetToken('judge');
      const judge = (await loginFresh('judge')).session_token;
      const entitled = await api.get<{ cases: { id: string }[] }>('/cases', {
        token: judge,
      });
      expect(entitled.status).toBe(200);
      expect(entitled.body.cases.map((c) => c.id)).toContain(SEALED);
    } finally {
      await dba.query(
        `DELETE FROM platform.scope_assignments
           WHERE user_id = $1 AND scope_type = 'case' AND scope_value = $2`,
        [seedIds.users.judge, SEALED],
      );
      await dba.end();
      forgetToken('judge');
    }
  });

  // =========================================================================
  // 8. Every denial is logged as an access_attempt
  // =========================================================================

  it('criterion 4: each designation denial produces an access_attempt audit event', async () => {
    if (!available) return;

    // Make a fresh denial, then confirm an access_attempt row exists for the
    // acting user. This is the second half of criterion 4 — "the denied attempt
    // itself is logged" — and the half most likely to be quietly missing.
    const clerk = await tokenFor('clerk_case_admin');
    const denied = await api.get(`/cases/${SEALED}`, { token: clerk });
    expect(denied.status).toBe(403);

    const officer = await tokenFor('security_officer');
    await new Promise((r) => setTimeout(r, 1500));

    const explorer = await api.get<{
      audit_events: { action_type: string }[];
    }>(
      `/audit/explorer?action_type=access_attempt&user_id=${seedIds.users.clerk_case_admin}`,
      { token: officer },
    );
    expect(explorer.status).toBe(200);
    expect(explorer.body.audit_events.length).toBeGreaterThan(0);
    expect(
      explorer.body.audit_events.every(
        (e) => e.action_type === 'access_attempt',
      ),
    ).toBe(true);
  });

  // =========================================================================
  // 9. Designation changes are themselves gated
  // =========================================================================

  it('criterion 4: changing a designation without the entitlement is denied and logged', async () => {
    if (!available) return;

    const deputy = await tokenFor('courtroom_deputy');
    const res = await api.patch<{ error_code?: string }>(
      `/cases/${PLAIN}/security-designations`,
      { token: deputy, json: { designations: ['sealed'] } },
    );
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('CASE_DESIGNATION_DENIED');

    const officer = await tokenFor('security_officer');
    await new Promise((r) => setTimeout(r, 1500));
    const explorer = await api.get<{
      audit_events: { action_type: string }[];
    }>(
      `/audit/explorer?action_type=access_attempt&user_id=${seedIds.users.courtroom_deputy}`,
      { token: officer },
    );
    expect(explorer.status).toBe(200);
    expect(explorer.body.audit_events.length).toBeGreaterThan(0);
  });
});
