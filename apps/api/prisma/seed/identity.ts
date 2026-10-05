/**
 * Identity seed — roles, users, role assignments, scopes, entitlements.
 *
 * =============================================================================
 * THE CONSTRAINT THAT SHAPES THIS FILE
 * =============================================================================
 *
 * `user_roles`, `entitlement_grants` and `security_designations` are
 * **append-only except for revocation**. Plan 01-03 grants `app_rw` only
 * `SELECT, INSERT` plus a column-scoped `UPDATE (revoked_at, revoked_by)` on
 * each. So every seeded row in those tables uses a Prisma `upsert` keyed on
 * its stable `SEED_IDS` UUID with an **empty `update: {}`** — create-if-absent,
 * never rewrite.
 *
 * **This is a binding rule, not a stylistic preference, and the failure it
 * prevents is a second-boot failure — the worst shape it could take.** The seed
 * runs as `app_rw` (the Compose `command` uses `DATABASE_URL`; only
 * `db:migrate` uses `MIGRATION_DATABASE_URL`). On a FIRST boot every row is an
 * INSERT and any upsert shape works. On the SECOND boot the conflict branch
 * fires, and an `update:` payload touching a substance column — `role_id`,
 * `court_id`, `entitlement_key`, `granted_by`, `designation`, `applied_by`,
 * `applied_at`, `scope_*` — raises PostgreSQL `42501 insufficient_privilege`.
 * `docker compose up` would therefore succeed exactly once and then break,
 * violating CONTEXT's "anyone must be able to clone and reach a working system
 * with `docker compose up`".
 *
 * The database is refusing to let the seed rewrite history, which is exactly
 * what it is there to refuse. The seed differs from the other tables here
 * because the grant posture makes it differ — not because seeding is special.
 *
 * (`security_designations` additionally has no unique constraint beyond its
 * primary key, so the `SEED_IDS` UUID is the only viable conflict target
 * regardless.)
 * =============================================================================
 */
import type { PrismaClient } from '@prisma/client';

import { ROLE_NAMES, SEED_IDS, seedId, type RoleName } from './ids';
import type { SubjectResolver } from './keycloak';

/** Namespaces for `seedId()` — see ids.ts. */
const NS_SCOPE = 0x0a000010;
const NS_REQUEST = 0x0a000011;
const NS_GRANT = 0x0a000012;
const NS_USER_ROLE = 0x0a000013;

interface Person {
  displayName: string;
  email: string;
  court: 'NDCA' | 'SDNY';
}

const PEOPLE: Record<RoleName, Person> = {
  judge: { displayName: 'Robert Hale', email: 'robert.hale@judicialsync.invalid', court: 'NDCA' },
  law_clerk: { displayName: 'Ana Ibarra', email: 'ana.ibarra@judicialsync.invalid', court: 'NDCA' },
  courtroom_deputy: {
    displayName: 'Maria Santos',
    email: 'maria.santos@judicialsync.invalid',
    court: 'NDCA',
  },
  clerk_case_admin: {
    displayName: 'David Okafor',
    email: 'david.okafor@judicialsync.invalid',
    court: 'NDCA',
  },
  attorney_external: {
    displayName: 'Jordan Whitfield',
    email: 'jordan.whitfield@judicialsync.invalid',
    court: 'NDCA',
  },
  jury_admin: {
    displayName: 'Carla Jimenez',
    email: 'carla.jimenez@judicialsync.invalid',
    court: 'NDCA',
  },
  court_admin: {
    displayName: 'Thomas Reyes',
    email: 'thomas.reyes@judicialsync.invalid',
    court: 'NDCA',
  },
  ao_program_manager: {
    displayName: 'Lydia Brennan',
    email: 'lydia.brennan@judicialsync.invalid',
    court: 'NDCA',
  },
  system_admin: {
    displayName: 'Priya Nandan',
    email: 'priya.nandan@judicialsync.invalid',
    court: 'SDNY',
  },
  security_officer: {
    displayName: 'Samuel Adeyemi',
    email: 'samuel.adeyemi@judicialsync.invalid',
    court: 'SDNY',
  },
};

const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  judge: 'Article III judge. Rules, finds, and determines; the system never decides for them.',
  law_clerk: 'Chambers staff supporting a judge.',
  courtroom_deputy: 'Logs exhibit actions in the courtroom in real time.',
  clerk_case_admin: 'Keeps case and docket data clean, reconciled, and correctly configured.',
  attorney_external: 'External counsel. Reaches the system through the Phase 4 attorney portal.',
  jury_admin: 'Jury administration. Confirms an assembled jury package matches authorization.',
  court_admin: 'Court-level administration and operational oversight.',
  ao_program_manager: 'Administrative Office program manager. De-identified metrics only.',
  system_admin: 'Platform administration and access grant workflow.',
  security_officer: 'Audit integrity and security oversight. Deliberately holds no case access.',
};

/**
 * The Phase 1 entitlement catalog — **fifteen** definitions.
 *
 * These must match plan 01-02's `action_entitlement_map` EXACTLY. An
 * entitlement the policy map requires but the catalog lacks can never be
 * granted to anyone, which denies the corresponding route permanently and
 * silently. CONTEXT limits Phase 1 to Phase 1 entitlements; later phases add
 * their own alongside the map entries that need them.
 */
const ENTITLEMENTS: ReadonlyArray<{
  key: string;
  description: string;
  designation?: true;
}> = [
  { key: 'case_read', description: 'Read case, docket, party and document records.' },
  { key: 'case_create', description: 'Create a case.' },
  { key: 'case_update', description: 'Update case, proceeding, hearing, party and docket records.' },
  {
    key: 'case_security_admin',
    description: 'Apply or lift a security designation on a record.',
  },
  { key: 'audit_reader', description: 'Read the audit trail and the Audit Explorer.' },
  { key: 'file_upload', description: 'Upload a file. Distinct from reading one back.' },
  { key: 'retention_viewer', description: 'Read retention schedules and disposition candidates.' },
  {
    key: 'disposition_confirm',
    // Deliberately separate from retention_viewer. Confirming the disposition
    // of a court record is a materially more dangerous authority than reading
    // a schedule, and CONTEXT's least-privilege default forbids bundling them.
    description: 'Confirm a record disposition. Separate from, and far more dangerous than, reading a schedule.',
  },
  { key: 'access_admin', description: 'Request, approve and revoke access grants.' },
  { key: 'key_custodian', description: 'Read and rotate encryption keys.' },

  // The five designation entitlements. Plan 01-02's Rego maps each designation
  // to the entitlement that unlocks it, overridable by `security_policies`.
  { key: 'designation_sealed', description: 'Access records designated sealed.', designation: true },
  {
    key: 'designation_restricted',
    description: 'Access records designated restricted.',
    designation: true,
  },
  {
    key: 'designation_grand_jury',
    description: 'Access records designated grand jury.',
    designation: true,
  },
  {
    key: 'designation_juvenile',
    description: 'Access records designated juvenile.',
    designation: true,
  },
  { key: 'designation_pii', description: 'Access records designated PII.', designation: true },
];

/**
 * Per-user entitlement grants — **explicit rows, never a role bundle.**
 *
 * CONTEXT: "Role-bundled defaults were rejected — a default bundle silently
 * becomes implied access." The distribution below is load-bearing, not
 * illustrative:
 *
 *  - `security_officer` holds `audit_reader` but NOT `case_read` or any edit
 *    entitlement, and `clerk_case_admin` holds broad edit entitlements but NOT
 *    `audit_reader`. That is FRD/F02's separation of duties — "a clerk with
 *    exhibit-ledger write access does not automatically gain audit-explorer
 *    read access, and vice versa" — expressed in data rather than in prose.
 *  - `judge` holds `designation_sealed` and `clerk_case_admin` does not, so the
 *    sealed case is visible to one and denied to the other. That pair is the
 *    fixture for Phase 1 success criterion 4.
 *  - `disposition_confirm` goes to `court_admin` and `system_admin` but NOT to
 *    `clerk_case_admin`, giving plan 01-11 a user who can read retention data
 *    and cannot act on it.
 *  - `jury_admin` holds a role and NOTHING. See below.
 */
const GRANTS: Record<RoleName, readonly string[]> = {
  clerk_case_admin: ['case_read', 'case_create', 'case_update', 'case_security_admin', 'file_upload'],
  judge: ['case_read', 'designation_sealed'],
  law_clerk: ['case_read'],
  courtroom_deputy: ['case_read'],
  court_admin: ['case_read', 'retention_viewer', 'disposition_confirm'],
  system_admin: ['access_admin', 'retention_viewer', 'disposition_confirm'],
  security_officer: ['audit_reader', 'key_custodian', 'access_admin'],
  ao_program_manager: ['retention_viewer'],
  attorney_external: [],

  // DELIBERATELY EMPTY — do not "fix" this.
  //
  // CONTEXT's hard constraint is that role existence must never imply access.
  // That claim is easy to assert and easy to violate by accident, usually via a
  // sensible-looking default bundle. `jury_admin` is the fixture that makes it
  // falsifiable: the user authenticates, holds a legitimate role, and is denied
  // every protected action because it was granted nothing. Plan 01-14's
  // assurance suite fails if this list stops being empty.
  jury_admin: [],
};

export async function seedIdentity(
  prisma: PrismaClient,
  resolveSubject: SubjectResolver,
): Promise<void> {
  // --- roles ---------------------------------------------------------------
  // Plain upsert: `roles` carries full UPDATE for app_rw, and a role's
  // description is descriptive metadata rather than a record of anything.
  for (const name of ROLE_NAMES) {
    await prisma.roles.upsert({
      where: { id: SEED_IDS.roles[name] },
      create: {
        id: SEED_IDS.roles[name],
        role_name: name,
        description: ROLE_DESCRIPTIONS[name],
      },
      update: { description: ROLE_DESCRIPTIONS[name] },
    });
  }

  // --- the ten role users --------------------------------------------------
  for (const name of ROLE_NAMES) {
    const person = PEOPLE[name];
    const subject = await resolveSubject(name);
    await prisma.users.upsert({
      where: { id: SEED_IDS.users[name] },
      create: {
        id: SEED_IDS.users[name],
        external_idp_subject: subject,
        display_name: person.displayName,
        email: person.email,
        status: 'active',
      },
      // The IdP subject is re-resolved on every boot and CAN legitimately
      // change — a fresh Keycloak volume regenerates every user id. Keeping it
      // current is the difference between a working login and a principal that
      // cannot be resolved.
      update: {
        external_idp_subject: subject,
        display_name: person.displayName,
        email: person.email,
      },
    });
  }

  // --- the reserved unattributed-actor principal ---------------------------
  //
  // NOT a service account, despite the name resembling one. It exists because
  // `audit_events.actor_id` is NOT NULL with an FK to `users`, so a failed
  // login whose IdP subject resolves to no user has no actor to attribute its
  // mandatory `access_attempt` event to (FRD/F00 Process step 8 requires
  // authentication FAILURES be audited). Dropping the event because
  // attribution is awkward would lose exactly the records an intrusion
  // investigation needs.
  //
  // It is `disabled`, has no Keycloak user, and is given no user_roles,
  // scope_assignments or entitlement_grants anywhere below. It can never
  // authenticate and can never be granted anything — an attribution sink.
  await prisma.users.upsert({
    where: { id: SEED_IDS.UNATTRIBUTED_ACTOR_USER_ID },
    create: {
      id: SEED_IDS.UNATTRIBUTED_ACTOR_USER_ID,
      external_idp_subject: 'system:unattributed',
      display_name: 'System (unattributed actor)',
      email: 'unattributed@judicialsync.invalid',
      status: 'disabled',
    },
    update: { status: 'disabled' },
  });

  // --- entitlement definitions --------------------------------------------
  for (const e of ENTITLEMENTS) {
    await prisma.entitlement_definitions.upsert({
      where: { entitlement_key: e.key },
      create: {
        entitlement_key: e.key,
        description: e.description,
        is_designation_entitlement: e.designation ?? false,
      },
      update: {
        description: e.description,
        is_designation_entitlement: e.designation ?? false,
      },
    });
  }

  const systemAdminId = SEED_IDS.users.system_admin;
  const securityOfficerId = SEED_IDS.users.security_officer;
  // Third administrative principal, so that a grant whose SUBJECT is one of
  // the other two still has two distinct non-subject parties available.
  const courtAdminId = SEED_IDS.users.court_admin;

  // --- role assignments ----------------------------------------------------
  // APPEND-ONLY TABLE. Empty `update: {}` — see the file header.
  for (const [index, name] of ROLE_NAMES.entries()) {
    await prisma.user_roles.upsert({
      where: { id: seedId(NS_USER_ROLE, index + 1) },
      create: {
        id: seedId(NS_USER_ROLE, index + 1),
        user_id: SEED_IDS.users[name],
        role_id: SEED_IDS.roles[name],
        court_id: SEED_IDS.courts[PEOPLE[name].court],
        granted_by: systemAdminId,
        is_bootstrap: true,
      },
      update: {},
    });
  }

  // --- scope assignments ---------------------------------------------------
  // A court scope each (the multi-tenancy boundary), plus a case scope on the
  // plain case for judge and law_clerk so case-level granularity is
  // exercisable. `scope_assignments` carries full UPDATE, so a normal upsert.
  let scopeIndex = 0;
  for (const name of ROLE_NAMES) {
    scopeIndex += 1;
    await prisma.scope_assignments.upsert({
      where: { id: seedId(NS_SCOPE, scopeIndex) },
      create: {
        id: seedId(NS_SCOPE, scopeIndex),
        user_id: SEED_IDS.users[name],
        scope_type: 'court',
        scope_value: SEED_IDS.courts[PEOPLE[name].court],
      },
      update: {},
    });
  }
  for (const name of ['judge', 'law_clerk'] as const) {
    scopeIndex += 1;
    await prisma.scope_assignments.upsert({
      where: { id: seedId(NS_SCOPE, scopeIndex) },
      create: {
        id: seedId(NS_SCOPE, scopeIndex),
        user_id: SEED_IDS.users[name],
        scope_type: 'case',
        scope_value: SEED_IDS.cases.plain,
      },
      update: {},
    });
  }

  // --- entitlement grants, each with its own approved request --------------
  //
  // Every grant carries a matching `access_grant_requests` row whose
  // `requested_by` differs from `decided_by`, so the seed itself never
  // violates separation of duties — the table-level CHECK would reject it if
  // it tried, but the point is that the seeded history is a *lawful* one that
  // later audits can read without an asterisk.
  let grantIndex = 0;
  for (const name of ROLE_NAMES) {
    for (const key of GRANTS[name]) {
      grantIndex += 1;

      // Requester and decider must be two DIFFERENT people, and neither may
      // be the subject of the grant — otherwise the seed writes a record of
      // someone approving their own access.
      //
      // The pair is chosen structurally rather than by special-casing: pick
      // the first two of the three administrative principals that are not the
      // subject. Independently patching "if the subject is X use Y" does not
      // compose — an earlier version flipped the requester for `system_admin`
      // and left the decider alone, so BOTH ends landed on `security_officer`
      // and the table-level CHECK (decided_by <> requested_by) rejected it
      // with SQLSTATE 23514. The constraint caught it; the logic should not
      // have needed catching.
      const [requestedBy, decidedBy] = [systemAdminId, securityOfficerId, courtAdminId].filter(
        (candidate) => candidate !== SEED_IDS.users[name],
      );

      const requestId = seedId(NS_REQUEST, grantIndex);
      await prisma.access_grant_requests.upsert({
        where: { id: requestId },
        create: {
          id: requestId,
          grant_type: 'entitlement',
          subject_user_id: SEED_IDS.users[name],
          entitlement_key: key,
          court_id: SEED_IDS.courts[PEOPLE[name].court],
          scope_type: 'court',
          scope_value: SEED_IDS.courts[PEOPLE[name].court],
          justification: `Phase 1 bootstrap: ${name} requires ${key} to perform its documented duties.`,
          requested_by: requestedBy,
          status: 'approved',
          decided_by: decidedBy,
          decided_at: new Date(),
          is_bootstrap: true,
        },
        update: {},
      });

      // APPEND-ONLY TABLE. Empty `update: {}` — see the file header.
      await prisma.entitlement_grants.upsert({
        where: { id: seedId(NS_GRANT, grantIndex) },
        create: {
          id: seedId(NS_GRANT, grantIndex),
          request_id: requestId,
          user_id: SEED_IDS.users[name],
          entitlement_key: key,
          scope_type: 'court',
          scope_value: SEED_IDS.courts[PEOPLE[name].court],
          granted_by: systemAdminId,
          is_bootstrap: true,
        },
        update: {},
      });
    }
  }
}
