/**
 * The seed is idempotent, and it is idempotent **as `app_rw`**.
 *
 * =============================================================================
 * WHY THE CONNECTION ROLE IS THE POINT OF THIS TEST
 * =============================================================================
 *
 * The Compose `command` runs `db:migrate` over `MIGRATION_DATABASE_URL`
 * (`app_dba`, which holds DDL rights) and then `db:seed` over `DATABASE_URL`
 * (`app_rw`, which holds no DELETE anywhere and only a column-scoped UPDATE on
 * the three append-only-except-revocation tables).
 *
 * If this test seeded as `app_dba` it would pass against a grant posture the
 * live stack does not have. The resulting breakage would then surface on
 * someone's SECOND `docker compose up` — a first boot works, a restart fails
 * with `42501` — and would be diagnosed as a seed bug rather than as the grant
 * consequence it is.
 *
 * So: migrations as `app_dba`, **both** seed passes as `app_rw`, and
 * `SELECT current_user` asserted inside the second pass so the binding is
 * proven rather than assumed.
 * =============================================================================
 */
import { PrismaClient } from '@prisma/client';

import { runSeed } from '../prisma/seed';
import { SEED_IDS } from '../prisma/seed/ids';
import { fixtureSubjects } from '../prisma/seed/keycloak';
import { startPlatformDb, stopPlatformDb, type PlatformDb } from './testcontainers-postgres';

/** Tables whose row counts must not move between the first and second pass. */
const COUNTED_TABLES = [
  'courts',
  'divisions',
  'cases',
  'parties',
  'docket_events',
  'document_references',
  'security_designations',
  'roles',
  'users',
  'user_roles',
  'scope_assignments',
  'entitlement_definitions',
  'entitlement_grants',
  'access_grant_requests',
  'court_profiles',
  'rule_package_versions',
  'security_policies',
  'retention_schedules',
] as const;

type Counts = Record<string, number>;

jest.setTimeout(300_000);

describe('seed-idempotency', () => {
  let db: PlatformDb | undefined;
  /** The APPLICATION connection — app_rw. Everything asserted on reads here. */
  let prisma: PrismaClient;
  /**
   * The ADMINISTRATIVE connection, for the four configuration tables that
   * `app_rw` holds SELECT-only on by design (plan 01-03 §5). Mirrors exactly
   * what the container's start command does.
   */
  let adminPrisma: PrismaClient;
  let firstPass: Counts;
  let secondPass: Counts;
  /** `current_user` observed from inside the second seed pass. */
  let roleDuringSecondPass: string;

  async function countAll(): Promise<Counts> {
    const counts: Counts = {};
    for (const table of COUNTED_TABLES) {
      const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM platform.${table}`,
      );
      counts[table] = Number(rows[0].n);
    }
    return counts;
  }

  beforeAll(async () => {
    // startPlatformDb() applies 01-roles.sql and every migration in order,
    // exactly as a deployment does.
    db = await startPlatformDb();

    // THE app_rw CONNECTION. Not ownerUrl, not a migration role.
    prisma = new PrismaClient({ datasources: { db: { url: db.appRwUrl } } });
    adminPrisma = new PrismaClient({ datasources: { db: { url: db.ownerUrl } } });

    // Pass 1.
    await runSeed({ prisma, adminPrisma, resolveSubject: fixtureSubjects() });
    firstPass = await countAll();

    // Pass 2 — the one that exercises every upsert's conflict branch. If any
    // write targeted a substance column on user_roles, entitlement_grants or
    // security_designations, this is where PostgreSQL raises 42501.
    const whoami = await prisma.$queryRawUnsafe<{ u: string }[]>(`SELECT current_user AS u`);
    roleDuringSecondPass = whoami[0].u;
    await runSeed({ prisma, adminPrisma, resolveSubject: fixtureSubjects() });
    secondPass = await countAll();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await adminPrisma?.$disconnect();
    await stopPlatformDb(db);
  });

  it('runs both passes as app_rw, not as a migration role', () => {
    // A superuser or app_dba connection would make every other assertion in
    // this file vacuous.
    expect(roleDuringSecondPass).toBe('app_rw');
  });

  it('leaves every table unchanged after a second run', () => {
    expect(secondPass).toEqual(firstPass);
  });

  // --- the counts later plans depend on ------------------------------------
  // Pinned here so a seed change that breaks them fails in this file rather
  // than three plans downstream.

  it('seeds exactly 10 roles', () => {
    expect(firstPass.roles).toBe(10);
  });

  it('seeds exactly 11 users — ten role users plus the reserved actor', () => {
    expect(firstPass.users).toBe(11);
  });

  it('seeds exactly 15 entitlement definitions', () => {
    expect(firstPass.entitlement_definitions).toBe(15);
  });

  it('seeds 2 courts and 4 cases', () => {
    expect(firstPass.courts).toBe(2);
    expect(firstPass.cases).toBe(4);
  });

  it('seeds exactly one sealed and one restricted case', async () => {
    const rows = await prisma.$queryRawUnsafe<{ designation: string; n: bigint }[]>(
      `SELECT designation, count(*)::bigint AS n
         FROM platform.security_designations
        WHERE revoked_at IS NULL
        GROUP BY designation ORDER BY designation`,
    );
    expect(rows.map((r) => [r.designation, Number(r.n)])).toEqual([
      ['restricted', 1],
      ['sealed', 1],
    ]);
  });

  // --- the invariants, not just the shapes ---------------------------------

  it('gives jury_admin a role and zero entitlements', async () => {
    // This is CONTEXT's hard constraint — role existence never implies access
    // — made falsifiable. If a future change grants jury_admin anything by
    // side effect, this fails. Do not fix it by granting something.
    const grants = await prisma.entitlement_grants.count({
      where: { user_id: SEED_IDS.users.jury_admin, revoked_at: null },
    });
    const roles = await prisma.user_roles.count({
      where: { user_id: SEED_IDS.users.jury_admin, revoked_at: null },
    });
    expect(grants).toBe(0);
    expect(roles).toBe(1);
  });

  it('seeds the reserved unattributed actor as a disabled, powerless principal', async () => {
    const actors = await prisma.users.findMany({
      where: { external_idp_subject: 'system:unattributed' },
    });
    expect(actors).toHaveLength(1);
    expect(actors[0].id).toBe(SEED_IDS.UNATTRIBUTED_ACTOR_USER_ID);
    expect(actors[0].status).toBe('disabled');

    // It is an attribution sink, not a service account. Zero of everything.
    const id = SEED_IDS.UNATTRIBUTED_ACTOR_USER_ID;
    expect(await prisma.user_roles.count({ where: { user_id: id } })).toBe(0);
    expect(await prisma.scope_assignments.count({ where: { user_id: id } })).toBe(0);
    expect(await prisma.entitlement_grants.count({ where: { user_id: id } })).toBe(0);
  });

  it('never lets a grant request be self-approved', async () => {
    const selfApproved = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n
         FROM platform.access_grant_requests
        WHERE decided_by = requested_by`,
    );
    expect(Number(selfApproved[0].n)).toBe(0);
  });

  it('keeps audit read separate from case write (FRD/F02 separation of duties)', async () => {
    const held = async (role: keyof typeof SEED_IDS.users): Promise<string[]> =>
      (
        await prisma.entitlement_grants.findMany({
          where: { user_id: SEED_IDS.users[role], revoked_at: null },
          select: { entitlement_key: true },
        })
      ).map((g) => g.entitlement_key);

    const officer = await held('security_officer');
    const clerk = await held('clerk_case_admin');

    expect(officer).toContain('audit_reader');
    expect(officer).not.toContain('case_read');
    expect(officer).not.toContain('case_update');

    expect(clerk).toContain('case_update');
    expect(clerk).not.toContain('audit_reader');
  });

  it('gives judge the sealed designation entitlement and clerk_case_admin none', async () => {
    // The fixture pair behind Phase 1 success criterion 4: the same sealed
    // case is visible to one and denied to the other.
    const judge = await prisma.entitlement_grants.count({
      where: {
        user_id: SEED_IDS.users.judge,
        entitlement_key: 'designation_sealed',
        revoked_at: null,
      },
    });
    const clerk = await prisma.entitlement_grants.count({
      where: {
        user_id: SEED_IDS.users.clerk_case_admin,
        entitlement_key: 'designation_sealed',
        revoked_at: null,
      },
    });
    expect(judge).toBe(1);
    expect(clerk).toBe(0);
  });

  it('grants disposition_confirm to court_admin and system_admin only', async () => {
    const holders = await prisma.entitlement_grants.findMany({
      where: { entitlement_key: 'disposition_confirm', revoked_at: null },
      select: { user_id: true },
    });
    expect(new Set(holders.map((h) => h.user_id))).toEqual(
      new Set([SEED_IDS.users.court_admin, SEED_IDS.users.system_admin]),
    );
  });

  it('leaves the configuration tables read-only to the application role', async () => {
    // Plan 01-03 §5 grants app_rw SELECT only on the four configuration
    // tables; Phase 2's Configuration Engine widens them behind maker-checker
    // approval. The seed writes them over the ADMINISTRATIVE connection for
    // that reason, and this asserts the posture it relies on still holds —
    // otherwise the two-connection split in seed.ts is cargo cult.
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE platform.security_policies SET required_entitlement = 'designation_pii'`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('puts configuration in the database rather than in TypeScript constants', async () => {
    const rpv = await prisma.rule_package_versions.findUniqueOrThrow({
      where: { id: SEED_IDS.rulePackageVersions.NDCA },
    });
    const snapshot = rpv.config_snapshot as {
      file_type_allowlist: string[];
      session: { claim_cache_seconds: number };
      max_upload_bytes: number;
    };
    expect(snapshot.file_type_allowlist).toContain('application/pdf');
    // The "configurable short cache window, default 5 minutes" of
    // FRD/F00 Validation and TechArch 04 §7.2 — as data, not a constant.
    expect(snapshot.session.claim_cache_seconds).toBe(300);
    expect(snapshot.max_upload_bytes).toBe(52428800);

    // Separation of duties holds even in seeded configuration.
    expect(rpv.drafted_by).not.toBe(rpv.approved_by);
  });

  it('allows no retention disposition that implies automatic deletion', async () => {
    // FRD/F13 Validation: "no automated hard-delete of any record category is
    // permitted without this gate."
    const actions = await prisma.retention_schedules.findMany({
      select: { disposition_action: true },
      distinct: ['disposition_action'],
    });
    const values = actions.map((a) => a.disposition_action).sort();
    expect(values).toEqual(['retain_permanent', 'review_required']);
    for (const v of values) {
      expect(v).not.toMatch(/delete|purge|destroy|erase/i);
    }
  });

  it('defines every entitlement the policy bundle can require', async () => {
    // An entitlement that plan 01-02's action_entitlement_map requires but
    // the catalog lacks can never be granted, which denies that route forever
    // and silently. Keep these two in step.
    const defined = new Set(
      (await prisma.entitlement_definitions.findMany({ select: { entitlement_key: true } })).map(
        (e) => e.entitlement_key,
      ),
    );
    for (const required of [
      'case_read',
      'case_create',
      'case_update',
      'case_security_admin',
      'audit_reader',
      'file_upload',
      'retention_viewer',
      'disposition_confirm',
      'access_admin',
      'key_custodian',
      'designation_sealed',
      'designation_restricted',
      'designation_grand_jury',
      'designation_juvenile',
      'designation_pii',
    ]) {
      expect(defined).toContain(required);
    }
  });
});
