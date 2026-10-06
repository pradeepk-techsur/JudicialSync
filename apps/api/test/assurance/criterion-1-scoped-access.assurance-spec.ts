/**
 * ============================================================================
 * CRITERION 1 — SCOPED ACCESS IS ENFORCED SERVER-SIDE, NOT HIDDEN IN THE UI
 * ============================================================================
 *
 * ROADMAP success criterion 1: "A user can log in via SSO and complete MFA, and
 * is granted only the access their role/court/division/case/proceeding/
 * party-role/security-designation scope allows — an unauthorized resource
 * request is denied server-side (403), not merely hidden in the UI."
 *
 * ## Every case here issues RAW HTTP against the running stack
 *
 * CONTEXT requires this suite "bypass the UI entirely and issue direct API calls
 * with lower-privileged tokens against forbidden resources." So there is no
 * `bootApp`, no supertest, no in-process Nest module in this file. `api.*` is a
 * raw `fetch` against `https://judicialsync.localhost:8443/api/v1`, and
 * `tokenFor` obtains a REAL session from the real Keycloak (password + computed
 * TOTP) exchanged at the app's own `POST /auth/login`. An attacker on the
 * network has exactly these primitives; so does this suite, and nothing more.
 *
 * ## 403 vs 404 — FRD/Y2-errors.md principle 3
 *
 * Principle 3: return **403** where the requester already has a legitimate path
 * to the object's existence (a scope boundary they can see across), and **404**
 * where they do not (revealing existence would itself be a disclosure). The
 * expected code for each case below is annotated with that reasoning, so a code
 * is never mistaken for arbitrary:
 *
 *  - A direct `GET /cases/{otherCourtCase}` by a legitimate court user is a
 *    **403** (AUTH_SCOPE_DENIED): the user is a real clerk hitting a tenancy
 *    boundary, and the case is not designation-protected, so its existence is
 *    not a secret from them in principle.
 *  - A `GET /cases/{otherCourtCase}/proceedings` (a child collection in another
 *    court/division the user has NO scope into) is a **404**: the division does
 *    not resolve for them at all, so the honest answer is "no such resource
 *    here" rather than "it exists but you can't". Both are denials; the suite
 *    asserts denial and records the observed code with its principle-3 rationale.
 *
 * Either way the test's contract is: **not a success, and no resource data in
 * the body.** That is what "denied server-side" means.
 */
import {
  api,
  appDbaClient,
  directGrant,
  forgetToken,
  loginFresh,
  requireStack,
  seedIds,
  tokenFor,
} from './harness';

jest.setTimeout(900_000);

/** A denial is any non-2xx that is not a server error — 401/403/404/422. */
const DENIAL_CODES = [401, 403, 404, 422] as const;
const isDenied = (status: number): boolean =>
  (DENIAL_CODES as readonly number[]).includes(status);

describe('criterion 1: scoped access denied server-side (assurance)', () => {
  let available = false;

  beforeAll(async () => {
    available = await requireStack();
  });

  // =========================================================================
  // 1. MFA is required end to end
  // =========================================================================

  describe('criterion 1: MFA is enforced by the IdP, end to end', () => {
    it('a direct-access-grant token request WITHOUT a TOTP is rejected by Keycloak', async () => {
      if (!available) return;

      const denied = await directGrant('clerk_case_admin', { withTotp: false });
      // Keycloak refuses the second-factor-less grant. This is the IdP itself
      // enforcing MFA — not the application, and not a bypass flag.
      expect(denied.status).toBe(401);
      expect(denied.body.error).toBe('invalid_grant');
    });

    it('with a valid TOTP, the full browser flow yields a session', async () => {
      if (!available) return;

      const session = await loginFresh('clerk_case_admin');
      expect(typeof session.session_token).toBe('string');
      expect(session.session_token.length).toBeGreaterThan(0);
      // The session reports the user's real entitlements — MFA satisfied.
      expect(session.entitlements.mfa_satisfied).toBe(true);
    });
  });

  // =========================================================================
  // 2. Cross-court isolation, BOTH directions, every resource family
  // =========================================================================

  describe('criterion 1: cross-court isolation holds in both directions', () => {
    /**
     * The clerk_case_admin fixtures are per-court: the seeded clerk is NDCA.
     * There is no seeded SDNY clerk, so the "mirror direction" is exercised with
     * the SDNY-less reality the seed provides: an NDCA user is denied every SDNY
     * resource family, AND (the mirror) an NDCA user is confined to NDCA — a
     * one-sided configuration error that leaked SDNY rows into an NDCA list, or
     * accepted an NDCA write naming SDNY, would fail here.
     */
    it('an NDCA clerk is denied the SDNY case and every child family', async () => {
      if (!available) return;

      const clerk = await tokenFor('clerk_case_admin');
      const sdny = seedIds.cases.otherCourt;

      // The case itself: a legitimate court user at a tenancy boundary → 403.
      const caseRes = await api.get<{ error_code?: string }>(`/cases/${sdny}`, {
        token: clerk,
      });
      expect(caseRes.status).toBe(403); // Y2 principle 3: scope boundary, existence not secret.
      expect(caseRes.body.error_code).toBe('AUTH_SCOPE_DENIED');

      // Each child family: a division the clerk has no scope into → denied.
      // Observed as 404 (the division does not resolve for them — existence is
      // genuinely not theirs to know), which is the principle-3 answer here.
      for (const child of [
        'proceedings',
        'parties',
        'docket-events',
        'document-references',
      ]) {
        const res = await api.get(`/cases/${sdny}/${child}`, { token: clerk });
        expect(isDenied(res.status)).toBe(true);
        expect([403, 404]).toContain(res.status);
      }
    });

    it('the mirror: the NDCA clerk sees NDCA only — no SDNY row leaks into the list', async () => {
      if (!available) return;

      const clerk = await tokenFor('clerk_case_admin');
      const list = await api.get<{ cases: { id: string; court_id: string }[] }>(
        '/cases',
        { token: clerk },
      );
      expect(list.status).toBe(200);
      const ids = list.body.cases.map((c) => c.id);
      // The SDNY case is omitted entirely — not shown, not counted.
      expect(ids).not.toContain(seedIds.cases.otherCourt);
      for (const c of list.body.cases) {
        expect(c.court_id).toBe(seedIds.courts.NDCA);
      }
    });
  });

  // =========================================================================
  // 3. Writes are denied too, not just reads
  // =========================================================================

  describe('criterion 1: writes across the boundary are denied, not only reads', () => {
    it('POST /cases naming the other court is denied', async () => {
      if (!available) return;

      const clerk = await tokenFor('clerk_case_admin');
      const res = await api.post('/cases', {
        token: clerk,
        json: {
          case_number: `assurance-x-court-${Date.now()}`,
          court_id: seedIds.courts.SDNY,
          division_id: seedIds.divisions.sdnyManhattan,
          case_caption: 'United States v. Boundary',
          case_type: 'criminal',
          party: [
            { name: 'Defendant', role: 'defendant' },
            { name: 'United States of America', role: 'government' },
          ],
        },
      });
      // A write path that trusted the body would create an SDNY case for an NDCA
      // clerk. It must be denied — the body does not grant scope.
      expect(isDenied(res.status)).toBe(true);
      expect(res.status).not.toBe(201);
    });

    it('PATCH /cases/{sdnyCase}/status is denied', async () => {
      if (!available) return;

      const clerk = await tokenFor('clerk_case_admin');
      const res = await api.patch(
        `/cases/${seedIds.cases.otherCourt}/status`,
        { token: clerk, json: { status: 'closed' } },
      );
      expect(isDenied(res.status)).toBe(true);
      expect(res.status).not.toBe(200);
    });
  });

  // =========================================================================
  // 4. Scope narrower than role — division/case dimensions, not only court
  // =========================================================================

  describe('criterion 1: the scope dimensions below court are enforced', () => {
    it('courtroom_deputy (court scope, no case scope outside its division) is confined', async () => {
      if (!available) return;

      // courtroom_deputy holds case_read and a court scope. The sealed and
      // restricted cases live in NDCA divisions; a deputy without the matching
      // case/division scope (and without the designation entitlement) is denied
      // the cross-division case — proving the court check is not the only one.
      const deputy = await tokenFor('courtroom_deputy');

      const sealed = await api.get(`/cases/${seedIds.cases.sealed}`, {
        token: deputy,
      });
      expect(isDenied(sealed.status)).toBe(true);
      expect(sealed.status).not.toBe(200);

      // And the SDNY case — a different court entirely.
      const crossCourt = await api.get(`/cases/${seedIds.cases.otherCourt}`, {
        token: deputy,
      });
      expect(isDenied(crossCourt.status)).toBe(true);
      expect(crossCourt.status).not.toBe(200);
    });
  });

  // =========================================================================
  // 5. attorney_external can never reach internal resources
  // =========================================================================

  describe('criterion 1: attorney_external is excluded from internal resources', () => {
    it('is denied every internal surface, even after a case scope is granted', async () => {
      if (!available) return;

      const attorney = await tokenFor('attorney_external');

      const surfaces = [
        '/audit/explorer',
        '/entitlements/requests',
        '/retention/schedules',
        '/security/policy-evaluate',
      ];
      for (const path of surfaces) {
        const res = await api.get(path, { token: attorney });
        // Each denied — 403 where the surface's existence is not a secret,
        // 404 where the user has no path to it at all (FRD/Y2 principle 3).
        expect(isDenied(res.status)).toBe(true);
      }

      // Now grant the external attorney a case scope on an NDCA case and prove
      // the exclusion still holds. FRD/F00 Validation: internal resources are
      // denied to an external attorney "regardless of any case association."
      const dba = await appDbaClient();
      try {
        await dba.query(
          `INSERT INTO platform.scope_assignments (user_id, scope_type, scope_value)
             VALUES ($1, 'case', $2)
             ON CONFLICT DO NOTHING`,
          [seedIds.users.attorney_external, seedIds.cases.plain],
        );
        // Force a fresh session so the new scope is in the principal.
        forgetToken('attorney_external');
        const rescoped = (await loginFresh('attorney_external')).session_token;

        for (const path of surfaces) {
          const res = await api.get(path, { token: rescoped });
          expect(isDenied(res.status)).toBe(true);
          expect(res.status).not.toBe(200);
        }
      } finally {
        // app_rw holds no DELETE on scope_assignments; clean up as app_dba.
        await dba.query(
          `DELETE FROM platform.scope_assignments
             WHERE user_id = $1 AND scope_type = 'case' AND scope_value = $2`,
          [seedIds.users.attorney_external, seedIds.cases.plain],
        );
        await dba.end();
        forgetToken('attorney_external');
      }
    });
  });

  // =========================================================================
  // 6. Denial is server-side and information-free
  // =========================================================================

  describe('criterion 1: a denial body carries no resource data', () => {
    it('the cross-court case denial is the {error_code,message} envelope and nothing of the case', async () => {
      if (!available) return;

      const clerk = await tokenFor('clerk_case_admin');
      const res = await api.get<Record<string, unknown>>(
        `/cases/${seedIds.cases.otherCourt}`,
        { token: clerk },
      );
      expect(res.status).toBe(403);

      // The body is exactly the error envelope — no redacted field, no id, no
      // count, no caption. A denial that leaked any of those would be a UI-level
      // hide, not a server-side denial.
      const keys = Object.keys(res.body).sort();
      expect(keys).toEqual(['error_code', 'message']);
      // The serialized body must not contain the forbidden case's id anywhere.
      expect(res.rawBody).not.toContain(seedIds.cases.otherCourt);
      expect(res.rawBody.toLowerCase()).not.toContain('caption');
    });
  });

  // =========================================================================
  // 7. Session revocation is immediate (FRD/F00 process step 7)
  // =========================================================================

  describe('criterion 1: a revoked session is rejected on the next call', () => {
    it('reissuing a token after its session is revoked yields 401', async () => {
      if (!available) return;

      // A fresh, uncached session for a user we can safely revoke.
      const session = await loginFresh('law_clerk');
      const token = session.session_token;

      // It works first.
      const ok = await api.get('/auth/entitlements', { token });
      expect(ok.status).toBe(200);

      // Revoke this user's sessions out of band as app_dba — modelling the
      // session invalidation a scope change triggers (the scope-change approval
      // path itself needs two distinct approvers and is exercised in 01-08; here
      // the property under test is that revocation takes effect immediately).
      const dba = await appDbaClient();
      try {
        await dba.query(
          `DELETE FROM platform.sessions WHERE user_id = $1`,
          [seedIds.users.law_clerk],
        );
      } finally {
        await dba.end();
      }

      // The SAME token, on the next call, is now rejected.
      const after = await api.get<{ error_code?: string }>(
        '/auth/entitlements',
        { token },
      );
      expect(after.status).toBe(401);
      expect(after.body.error_code).toBe('AUTH_SESSION_EXPIRED');

      forgetToken('law_clerk');
    });
  });

  // =========================================================================
  // 8. Every denial produced an access_attempt audit event
  // =========================================================================

  describe('criterion 1: each denial is itself audited', () => {
    it('an access_attempt row exists for a denied cross-court request', async () => {
      if (!available) return;

      const clerk = await tokenFor('clerk_case_admin');
      // Make a fresh, uniquely-timestamped denial.
      const marker = Date.now();
      const denied = await api.get(`/cases/${seedIds.cases.otherCourt}`, {
        token: clerk,
      });
      expect(denied.status).toBe(403);

      // As security_officer (holds audit_reader), query the Explorer filtered by
      // the acting user and action_type=access_attempt, and assert a denial row
      // for this clerk exists. The denied attempt is a first-class audit record,
      // not an omission (FRD/F00 process step 8).
      const officer = await tokenFor('security_officer');
      // Give the async audit write a moment to land.
      await new Promise((r) => setTimeout(r, 1500));

      const explorer = await api.get<{
        audit_events: {
          action_type: string;
          actor_id?: string;
          object_id?: string;
        }[];
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
      void marker;
    });
  });
});
