/**
 * Configuration seed — court profiles, rule packages, security policies,
 * retention schedules.
 *
 * CONTEXT: "Phase 1 creates the configuration tables with seeded per-court
 * defaults … and a read path. **Features must read configuration from the
 * database from day one, never from hardcoded constants.**"
 *
 * That second sentence is the whole point of this file. A file-type allowlist
 * or a session timeout living in a TypeScript constant is not configuration —
 * it is a value that happens to be changeable by a developer with a deploy.
 * Seeding these as data means every later feature reads them through the same
 * path a court administrator will eventually write them through, so the read
 * path is exercised from the first commit rather than retrofitted in Phase 2.
 *
 * Phase 2 adds versioning, the maker-checker publish flow, and the admin
 * surface **on top of** this row. Do not build any of that here.
 */
import type { PrismaClient } from '@prisma/client';

import { SEED_IDS, seedId } from './ids';

const NS_POLICY = 0x0a000030;
const NS_RETENTION = 0x0a000031;

/**
 * The Phase 1 configuration surface.
 *
 * `session.claim_cache_seconds: 300` is the "configurable short cache window,
 * default 5 minutes" from FRD/F00 Validation and TechArch/04-security.md §7.2
 * — seeded as data precisely so it is configurable rather than compiled in.
 */
const CONFIG_SNAPSHOT = {
  file_type_allowlist: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  session: {
    access_token_ttl_seconds: 900,
    refresh_token_ttl_seconds: 604800,
    idle_timeout_minutes: 30,
    claim_cache_seconds: 300,
    concurrent_session_limit: 3,
  },
  max_upload_bytes: 52428800,
} as const;

/**
 * Designation → required entitlement. This is the table plan 01-02's Rego
 * reads as `input.security_policies`, and supplying it REPLACES the policy's
 * built-in default map wholesale rather than merging — so configuration can
 * genuinely change a mapping, and a designation absent from the set denies.
 */
const DESIGNATION_POLICIES: ReadonlyArray<[designation: string, entitlement: string]> = [
  ['sealed', 'designation_sealed'],
  ['restricted', 'designation_restricted'],
  ['grand_jury', 'designation_grand_jury'],
  ['juvenile', 'designation_juvenile'],
  ['pii', 'designation_pii'],
];

/**
 * Retention schedules per record category.
 *
 * **No `disposition_action` value may imply automatic deletion.** FRD/F13
 * Validation: "no automated hard-delete of any record category is permitted
 * without this gate." Every value here is either `review_required` — a human
 * must confirm — or `retain_permanent`. There is deliberately no `delete`
 * action in the vocabulary for a seeded schedule to reach for.
 */
const RETENTION: ReadonlyArray<[category: string, days: number, action: string]> = [
  ['case_record', 7300, 'review_required'],
  ['document', 3650, 'review_required'],
  ['audit_event', 25550, 'retain_permanent'],
  ['file_reference', 3650, 'review_required'],
];

export async function seedConfiguration(prisma: PrismaClient): Promise<void> {
  const courts = [
    { code: 'NDCA' as const, profile: SEED_IDS.courtProfiles.NDCA, rpv: SEED_IDS.rulePackageVersions.NDCA },
    { code: 'SDNY' as const, profile: SEED_IDS.courtProfiles.SDNY, rpv: SEED_IDS.rulePackageVersions.SDNY },
  ];

  const now = new Date();
  let policyIndex = 0;
  let retentionIndex = 0;

  for (const court of courts) {
    const courtId = SEED_IDS.courts[court.code];

    await prisma.court_profiles.upsert({
      where: { id: court.profile },
      create: { id: court.profile, court_id: courtId },
      update: {},
    });

    // Separation of duties holds even in the seed: the drafter and the
    // approver are different people. A seeded row that self-approved would be
    // a seeded record of an unlawful act, and the first thing an auditor
    // reading the configuration history would find.
    await prisma.rule_package_versions.upsert({
      where: { id: court.rpv },
      create: {
        id: court.rpv,
        court_id: courtId,
        version_number: 1,
        drafted_by: SEED_IDS.users.court_admin,
        approved_by: SEED_IDS.users.system_admin,
        published_at: now,
        effective_from: now,
        config_snapshot: CONFIG_SNAPSHOT,
      },
      update: { config_snapshot: CONFIG_SNAPSHOT },
    });

    for (const [designation, entitlement] of DESIGNATION_POLICIES) {
      policyIndex += 1;
      await prisma.security_policies.upsert({
        where: { id: seedId(NS_POLICY, policyIndex) },
        create: {
          id: seedId(NS_POLICY, policyIndex),
          rule_package_version_id: court.rpv,
          designation,
          required_entitlement: entitlement,
        },
        update: { required_entitlement: entitlement },
      });
    }

    for (const [category, days, action] of RETENTION) {
      retentionIndex += 1;
      await prisma.retention_schedules.upsert({
        where: { id: seedId(NS_RETENTION, retentionIndex) },
        create: {
          id: seedId(NS_RETENTION, retentionIndex),
          court_id: courtId,
          record_category: category,
          retention_period_days: days,
          disposition_action: action,
        },
        update: { retention_period_days: days, disposition_action: action },
      });
    }
  }
}
