/**
 * Case-model seed — two courts, divisions, cases, parties, docket events.
 *
 * =============================================================================
 * `security_designations` IS APPEND-ONLY EXCEPT FOR REVOCATION
 * =============================================================================
 *
 * Plan 01-03 grants `app_rw` only `SELECT, INSERT` plus a column-scoped
 * `UPDATE (revoked_at, revoked_by)` on this table. Seeded designation rows
 * therefore use an upsert keyed on the stable `SEED_IDS` UUID with an **empty
 * `update: {}`**. An `update:` payload touching `designation`, `applied_by`,
 * `applied_at`, `object_type` or `object_id` raises PostgreSQL `42501` the
 * SECOND time the seed runs — so `docker compose up` would work once and then
 * fail, which is the worst possible shape for the bug to take.
 *
 * The database is refusing to let the seed rewrite the record of who sealed
 * what and when, which is exactly what it is there to refuse. Keep the pattern.
 * See `seed/identity.ts` for the same constraint on `user_roles` and
 * `entitlement_grants`.
 *
 * (This table also has no unique constraint beyond its primary key, so the
 * `SEED_IDS` UUID is the only viable conflict target in any case.)
 * =============================================================================
 *
 * ## What this fixture has to make demonstrable
 *
 * CONTEXT: "Two courts … with divisions; several cases including **at least one
 * sealed and one restricted**, with parties and docket events."
 *
 *  - TWO courts, because cross-court isolation cannot be shown with one.
 *  - A SEALED and a RESTRICTED case, because designation denial cannot be shown
 *    without a designated record. `judge` holds `designation_sealed` and
 *    `clerk_case_admin` does not, so the sealed case is visible to one and
 *    denied to the other — Phase 1 success criterion 4, in data.
 *  - A DEFENDANT party on every case, because FRD/F01 Validation requires one
 *    before a Speedy Trial tracker can exist. Seeding it now means Phase 7
 *    inherits a usable fixture instead of inventing its own.
 */
import type { PrismaClient } from '@prisma/client';

import { SEED_IDS, seedId } from './ids';

const NS_PARTY = 0x0a000020;
const NS_DOCKET = 0x0a000021;
const NS_DOCUMENT = 0x0a000022;

type CaseKey = keyof typeof SEED_IDS.cases;

interface CaseFixture {
  key: CaseKey;
  court: 'NDCA' | 'SDNY';
  division: keyof typeof SEED_IDS.divisions;
  caseNumber: string;
  caption: string;
  caseType: string;
  defendant: string;
  designation?: 'sealed' | 'restricted';
}

const CASES: readonly CaseFixture[] = [
  {
    key: 'plain',
    court: 'NDCA',
    division: 'ndcaSanFrancisco',
    caseNumber: '3:24-cr-00101',
    caption: 'United States v. Halloran',
    caseType: 'criminal',
    defendant: 'Dennis Halloran',
  },
  {
    key: 'sealed',
    court: 'NDCA',
    division: 'ndcaSanFrancisco',
    caseNumber: '3:24-cr-00102',
    caption: 'United States v. Sealed Defendant 1',
    caseType: 'criminal',
    defendant: 'Sealed Defendant 1',
    designation: 'sealed',
  },
  {
    key: 'restricted',
    court: 'NDCA',
    division: 'ndcaOakland',
    caseNumber: '4:24-cv-00210',
    caption: 'Ferreira v. Alameda Transit Authority',
    caseType: 'civil',
    defendant: 'Alameda Transit Authority',
    designation: 'restricted',
  },
  {
    key: 'otherCourt',
    court: 'SDNY',
    division: 'sdnyManhattan',
    caseNumber: '1:24-cr-00055',
    caption: 'United States v. Petrakis',
    caseType: 'criminal',
    defendant: 'Nikolaos Petrakis',
  },
];

/** 3–5 docket entries per case, spread over recent dates. */
const DOCKET_TEMPLATES: ReadonlyArray<{ code: string; description: string; daysAgo: number }> = [
  { code: 'IND', description: 'Indictment filed', daysAgo: 120 },
  { code: 'ARR', description: 'Arraignment held; plea of not guilty entered', daysAgo: 104 },
  { code: 'MOT', description: 'Motion to suppress filed by defendant', daysAgo: 61 },
  { code: 'ORD', description: 'Order setting pretrial conference', daysAgo: 30 },
  { code: 'CONF', description: 'Pretrial conference held', daysAgo: 9 },
];

const daysAgo = (n: number): Date => new Date(Date.now() - n * 86_400_000);

/**
 * Courts, divisions, cases, parties, docket events, documents.
 *
 * Carries NO reference to `users`, so it can and must run before the identity
 * seed — `user_roles.court_id` and `scope_assignments.scope_value` point here.
 */
export async function seedCaseModel(prisma: PrismaClient): Promise<void> {
  // --- courts --------------------------------------------------------------
  await prisma.courts.upsert({
    where: { id: SEED_IDS.courts.NDCA },
    create: {
      id: SEED_IDS.courts.NDCA,
      court_name: 'Northern District of California',
      court_code: 'NDCA',
    },
    update: { court_name: 'Northern District of California' },
  });
  await prisma.courts.upsert({
    where: { id: SEED_IDS.courts.SDNY },
    create: {
      id: SEED_IDS.courts.SDNY,
      court_name: 'Southern District of New York',
      court_code: 'SDNY',
    },
    update: { court_name: 'Southern District of New York' },
  });

  // --- divisions -----------------------------------------------------------
  const divisions = [
    { id: SEED_IDS.divisions.ndcaSanFrancisco, court: SEED_IDS.courts.NDCA, name: 'San Francisco' },
    { id: SEED_IDS.divisions.ndcaOakland, court: SEED_IDS.courts.NDCA, name: 'Oakland' },
    { id: SEED_IDS.divisions.sdnyManhattan, court: SEED_IDS.courts.SDNY, name: 'Manhattan' },
  ];
  for (const d of divisions) {
    await prisma.divisions.upsert({
      where: { id: d.id },
      create: { id: d.id, court_id: d.court, division_name: d.name },
      update: { division_name: d.name },
    });
  }

  // --- cases, parties, docket events, documents ----------------------------
  let partyIndex = 0;
  let docketIndex = 0;

  for (const [caseOrdinal, c] of CASES.entries()) {
    const caseId = SEED_IDS.cases[c.key];

    await prisma.cases.upsert({
      where: { id: caseId },
      create: {
        id: caseId,
        court_id: SEED_IDS.courts[c.court],
        division_id: SEED_IDS.divisions[c.division],
        case_number: c.caseNumber,
        case_caption: c.caption,
        case_type: c.caseType,
        source_system: 'manual',
        locally_modified: false,
        status: 'open',
      },
      update: { case_caption: c.caption },
    });

    // A defendant and the government on every case. FRD/F01 Validation
    // requires a defendant before a Speedy Trial tracker can exist (Phase 7).
    for (const party of [
      { name: c.defendant, role: 'defendant' },
      { name: 'United States of America', role: 'government' },
    ]) {
      partyIndex += 1;
      await prisma.parties.upsert({
        where: { id: seedId(NS_PARTY, partyIndex) },
        create: {
          id: seedId(NS_PARTY, partyIndex),
          case_id: caseId,
          party_name: party.name,
          party_role: party.role,
          source_system: 'manual',
          source_identifier: `seed-party-${partyIndex}`,
          locally_modified: false,
          status: 'active',
        },
        update: { party_name: party.name },
      });
    }

    // 3 events for civil, 5 for criminal — enough variety that a timeline
    // view has something to show.
    const eventCount = c.caseType === 'civil' ? 3 : 5;
    for (const t of DOCKET_TEMPLATES.slice(0, eventCount)) {
      docketIndex += 1;
      await prisma.docket_events.upsert({
        where: { id: seedId(NS_DOCKET, docketIndex) },
        create: {
          id: seedId(NS_DOCKET, docketIndex),
          case_id: caseId,
          source_system: 'manual',
          // The table carries UNIQUE (source_system, source_identifier), so
          // this must be unique across every case, not merely within one.
          source_identifier: `seed-docket-${docketIndex}`,
          event_code: t.code,
          event_description: t.description,
          event_date: daysAgo(t.daysAgo),
          locally_modified: false,
        },
        update: { event_description: t.description },
      });
    }

    await prisma.document_references.upsert({
      where: { id: seedId(NS_DOCUMENT, caseOrdinal + 1) },
      create: {
        id: seedId(NS_DOCUMENT, caseOrdinal + 1),
        case_id: caseId,
        source_system: 'manual',
        source_identifier: `seed-document-${caseOrdinal + 1}`,
        document_title: `${c.caseNumber} — charging document`,
        storage_pointer: `s3://judicialsync-files/seed/${c.caseNumber.replace(/:/g, '-')}/charging.pdf`,
        locally_modified: false,
      },
      update: { document_title: `${c.caseNumber} — charging document` },
    });
  }

}

/**
 * Security designations.
 *
 * Split from `seedCaseModel` because `applied_by` references a user, so this
 * must run AFTER the identity seed while the cases it designates must exist
 * BEFORE it. Keeping the two halves separate makes that ordering a visible
 * property of the call site in `seed.ts` rather than something enforced by
 * catching a foreign-key error and retrying.
 */
export async function seedDesignations(prisma: PrismaClient): Promise<void> {
  // APPEND-ONLY EXCEPT REVOCATION. Empty `update: {}` — see the file header.
  // `applied_by` is clerk_case_admin, the role that holds
  // `case_security_admin`; a designation applied by someone without that
  // entitlement would be a seeded record of an unlawful act.
  const designated: ReadonlyArray<{ id: string; caseKey: CaseKey; designation: string }> = [
    { id: SEED_IDS.designations.sealedCase, caseKey: 'sealed', designation: 'sealed' },
    { id: SEED_IDS.designations.restrictedCase, caseKey: 'restricted', designation: 'restricted' },
  ];
  for (const d of designated) {
    await prisma.security_designations.upsert({
      where: { id: d.id },
      create: {
        id: d.id,
        object_type: 'case',
        object_id: SEED_IDS.cases[d.caseKey],
        designation: d.designation,
        applied_by: SEED_IDS.users.clerk_case_admin,
      },
      update: {},
    });
  }
}
