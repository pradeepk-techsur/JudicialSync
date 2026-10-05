/**
 * Stable identifiers for every seeded row.
 *
 * ## Why these are hard-coded rather than generated
 *
 * The seed runs on **every container boot** — the Compose `command` is
 * `migrate → seed → serve` and the volume persists — so each write must be an
 * upsert rather than an insert. An upsert needs a stable conflict target, and
 * for three of these tables the primary key is the *only* viable one (see the
 * header of `identity.ts`).
 *
 * They are also the fixture contract for later phases. A Phase 7 Speedy Trial
 * test that needs "the sealed case" can import `SEED_IDS.cases.sealed` instead
 * of querying by case number and hoping the number never changes.
 *
 * UUIDs are laid out so the table is readable at a glance: the leading group
 * names the entity class, the trailing group counts within it.
 */
export const SEED_IDS = {
  courts: {
    NDCA: '0a000001-0000-4000-8000-000000000001',
    SDNY: '0a000001-0000-4000-8000-000000000002',
  },

  divisions: {
    ndcaSanFrancisco: '0a000002-0000-4000-8000-000000000001',
    ndcaOakland: '0a000002-0000-4000-8000-000000000002',
    sdnyManhattan: '0a000002-0000-4000-8000-000000000003',
  },

  roles: {
    judge: '0a000003-0000-4000-8000-000000000001',
    law_clerk: '0a000003-0000-4000-8000-000000000002',
    courtroom_deputy: '0a000003-0000-4000-8000-000000000003',
    clerk_case_admin: '0a000003-0000-4000-8000-000000000004',
    attorney_external: '0a000003-0000-4000-8000-000000000005',
    jury_admin: '0a000003-0000-4000-8000-000000000006',
    court_admin: '0a000003-0000-4000-8000-000000000007',
    ao_program_manager: '0a000003-0000-4000-8000-000000000008',
    system_admin: '0a000003-0000-4000-8000-000000000009',
    security_officer: '0a000003-0000-4000-8000-00000000000a',
  },

  users: {
    judge: '0a000004-0000-4000-8000-000000000001',
    law_clerk: '0a000004-0000-4000-8000-000000000002',
    courtroom_deputy: '0a000004-0000-4000-8000-000000000003',
    clerk_case_admin: '0a000004-0000-4000-8000-000000000004',
    attorney_external: '0a000004-0000-4000-8000-000000000005',
    jury_admin: '0a000004-0000-4000-8000-000000000006',
    court_admin: '0a000004-0000-4000-8000-000000000007',
    ao_program_manager: '0a000004-0000-4000-8000-000000000008',
    system_admin: '0a000004-0000-4000-8000-000000000009',
    security_officer: '0a000004-0000-4000-8000-00000000000a',
  },

  /**
   * The reserved unattributed-actor principal.
   *
   * `audit_events.actor_id` is NOT NULL with a foreign key to `users`, so a
   * **failed login whose IdP subject resolves to no user** has no actor to
   * attribute the mandatory `access_attempt` event to. `FRD/F00` Process step
   * 8 requires authentication *failures* be audited, and dropping the event
   * because attribution is awkward would discard exactly the records an
   * intrusion investigation needs.
   *
   * It is an attribution sink, **not a service account**: `status: 'disabled'`,
   * no Keycloak user, zero roles, zero scopes, zero entitlements. Plan 01-06's
   * AuthService writes unattributable audit events against this id.
   */
  UNATTRIBUTED_ACTOR_USER_ID: '0a000004-0000-4000-8000-0000000000ff',

  cases: {
    /** NDCA / San Francisco — no designation. The "ordinary case" baseline. */
    plain: '0a000005-0000-4000-8000-000000000001',
    /** NDCA / San Francisco — SEALED. Visible to judge, denied to clerk. */
    sealed: '0a000005-0000-4000-8000-000000000002',
    /** NDCA / Oakland — RESTRICTED. */
    restricted: '0a000005-0000-4000-8000-000000000003',
    /** SDNY / Manhattan — the cross-court isolation fixture. */
    otherCourt: '0a000005-0000-4000-8000-000000000004',
  },

  designations: {
    sealedCase: '0a000006-0000-4000-8000-000000000001',
    restrictedCase: '0a000006-0000-4000-8000-000000000002',
  },

  courtProfiles: {
    NDCA: '0a000007-0000-4000-8000-000000000001',
    SDNY: '0a000007-0000-4000-8000-000000000002',
  },

  rulePackageVersions: {
    NDCA: '0a000008-0000-4000-8000-000000000001',
    SDNY: '0a000008-0000-4000-8000-000000000002',
  },
} as const;

/** The ten-role catalog (docs/ASSUMPTIONS.md ASM-01). Order is the catalog's. */
export const ROLE_NAMES = [
  'judge',
  'law_clerk',
  'courtroom_deputy',
  'clerk_case_admin',
  'attorney_external',
  'jury_admin',
  'court_admin',
  'ao_program_manager',
  'system_admin',
  'security_officer',
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

/**
 * Deterministic UUID v4-shaped identifier derived from a namespace and an
 * index. Used where a table needs many stable ids that are not worth naming
 * individually (parties, docket events, grants).
 */
export function seedId(namespace: number, index: number): string {
  const ns = namespace.toString(16).padStart(8, '0');
  const ix = index.toString(16).padStart(12, '0');
  return `${ns}-0000-4000-8000-${ix}`;
}
