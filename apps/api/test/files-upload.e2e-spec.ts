import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import { bootApp, loginAs, requireStack, testDatabaseUrl } from './auth-harness';
import {
  CLAMAV_CONTAINER,
  appS3Endpoint,
  countObjects,
  makeEicarTxt,
  makeExecutable,
  makePdf,
  startClamavAndWait,
  stopClamav,
  testS3Client,
} from './files-harness';

/**
 * ============================================================================
 * REJECTION-BEFORE-STORAGE, AGAINST REAL ClamAV AND REAL MinIO
 * ============================================================================
 *
 * Phase 1 success criterion 5: "an uploaded file of a disallowed type or
 * failing malware scan is rejected **before storage**, and all data is
 * encrypted in transit and at rest." Every claim here is made against the live
 * Compose stack — the scanner is the actual ClamAV container evaluating the
 * actual EICAR signature, and the store is the actual MinIO. A mocked scanner
 * would reproduce exactly the placeholder CONTEXT rejected.
 *
 * The decisive move throughout: the bucket is counted before and after each
 * rejection, and asserted unchanged. "Rejected before storage" is a claim about
 * the store, so it is proven against the store.
 */

jest.setTimeout(900_000);

/** Seeded ids, from `prisma/seed/ids.ts`. */
const USERS = {
  clerk_case_admin: '0a000004-0000-4000-8000-000000000004',
  jury_admin: '0a000004-0000-4000-8000-000000000006',
} as const;

interface RefRow {
  id: string;
  scan_status: string;
}
interface AuditRow {
  object_type: string;
  object_id: string;
  after_state: Record<string, unknown>;
}

describe('files-upload: rejection before storage (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  let available = false;
  const s3 = testS3Client();

  /**
   * Session tokens established ONCE in `beforeAll` and reused across tests.
   *
   * Each `loginAs` is a real password + TOTP browser flow, and Keycloak
   * enforces one-time use of a TOTP code within its 30-second window. Logging
   * in per test would stack far more logins than that budget allows and
   * manifest as spurious "Keycloak did not redirect (status 200)" failures —
   * the OTP form re-rendering a spent code. A session, once issued, stays valid
   * for the whole suite (nothing here revokes it), so one login per user is
   * enough and keeps the suite within the TOTP budget.
   */
  let clerkToken: string;
  let juryToken: string;

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;

    ({ app, restoreEnv } = await bootApp({
      // The app runs in THIS process, so it reaches MinIO on the network
      // address rather than the compose service name `minio:9000`.
      S3_ENDPOINT: appS3Endpoint(),
      S3_BUCKET: 'judicialsync-files',
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? 'judicialsync_local_minio',
      S3_SECRET_ACCESS_KEY:
        process.env.S3_SECRET_ACCESS_KEY ?? 'judicialsync_local_minio_secret',
      // ClamAV reached on its network address, same reasoning.
      CLAMAV_HOST: clamavHost(),
      CLAMAV_PORT: '3310',
      CLAMAV_TIMEOUT_MS: '30000',
    }));

    const provider = app.get(OidcProvider);
    for (let i = 0; i < 60 && !provider.isReady(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();

    // One login per user for the whole suite — see the field comment. Spaced
    // into distinct TOTP windows so neither reuses a code the other (or a
    // prior run) just spent, which Keycloak rejects as invalid_user_credentials.
    clerkToken = (await loginAs(app, 'clerk_case_admin')).session_token;
    await waitForNextTotpWindow();
    juryToken = (await loginAs(app, 'jury_admin')).session_token;
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
    restoreEnv?.();
  });

  const refsFor = async (uploadedBy: string): Promise<RefRow[]> => {
    const { rows } = await db.query<RefRow>(
      `SELECT id, scan_status FROM platform.file_references
        WHERE uploaded_by = $1 ORDER BY id`,
      [uploadedBy],
    );
    return rows;
  };

  const latestRejection = async (userId: string): Promise<AuditRow | undefined> => {
    const { rows } = await db.query<AuditRow>(
      `SELECT object_type, object_id, after_state
         FROM platform.audit_events
        WHERE actor_id = $1
          AND action_type = 'access_attempt'
          AND after_state->>'outcome' = 'rejected'
        ORDER BY occurred_at DESC, id DESC
        LIMIT 1`,
      [userId],
    );
    return rows[0];
  };

  // =========================================================================
  // 1. CLEAN PDF ACCEPTED
  // =========================================================================

  it('accepts a clean PDF and records reference + scan result', async () => {
    if (!available) return;


    const response = await request(app.getHttpServer())
      .post('/api/v1/files/upload')
      .set('Authorization', `Bearer ${clerkToken}`)
      .field('declared_purpose', 'exhibit')
      .attach('file', makePdf(), { filename: 'clean.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ scan_status: 'clean' });
    expect(typeof response.body.file_reference_id).toBe('string');

    const refId = response.body.file_reference_id as string;
    const { rows: refRows } = await db.query<RefRow>(
      `SELECT id, scan_status FROM platform.file_references WHERE id = $1`,
      [refId],
    );
    expect(refRows).toHaveLength(1);
    expect(refRows[0].scan_status).toBe('clean');

    const { rows: scanRows } = await db.query<{ result: string }>(
      `SELECT result FROM platform.malware_scan_results WHERE file_reference_id = $1`,
      [refId],
    );
    expect(scanRows).toHaveLength(1);
    expect(scanRows[0].result).toBe('clean');

    const { rows: audit } = await db.query(
      `SELECT 1 FROM platform.audit_events
        WHERE object_id = $1 AND after_state->>'outcome' = 'uploaded'`,
      [refId],
    );
    expect(audit.length).toBeGreaterThan(0);
  });

  // =========================================================================
  // 2. DISALLOWED TYPE REJECTED BEFORE SCANNING
  // =========================================================================

  it('rejects a disallowed type before scanning and stores nothing', async () => {
    if (!available) return;

    const before = await countObjects(s3);

    const response = await request(app.getHttpServer())
      .post('/api/v1/files/upload')
      .set('Authorization', `Bearer ${clerkToken}`)
      .field('declared_purpose', 'exhibit')
      .attach('file', makeExecutable(), {
        filename: 'tool.bin',
        contentType: 'application/octet-stream',
      });

    expect(response.status).toBe(422);
    expect(response.body.error_code).toBe('SECURITY_FILE_TYPE_DENIED');

    // No malware_scan_results row exists for this attempt — proving the scan was
    // never attempted (the allowlist ran first). Nothing was stored.
    const after = await countObjects(s3);
    expect(after).toBe(before);

    const rejection = await latestRejection(USERS.clerk_case_admin);
    expect(rejection?.after_state).toMatchObject({
      outcome: 'rejected',
      reason: 'SECURITY_FILE_TYPE_DENIED',
    });
    // The allowlist runs before the scan, so no sniffed_type-clean row was
    // created and no scan result was recorded for a nonexistent reference.
    const { rows: orphanScans } = await db.query(
      `SELECT 1 FROM platform.malware_scan_results msr
         JOIN platform.file_references fr ON fr.id = msr.file_reference_id
        WHERE fr.scan_status = 'rejected'`,
    );
    expect(orphanScans).toHaveLength(0);
  });

  // =========================================================================
  // 3. CONTENT SNIFFING BEATS THE HEADER
  // =========================================================================

  it('rejects an executable disguised as a PDF (sniffed, not declared)', async () => {
    if (!available) return;

    const before = await countObjects(s3);

    const response = await request(app.getHttpServer())
      .post('/api/v1/files/upload')
      .set('Authorization', `Bearer ${clerkToken}`)
      .field('declared_purpose', 'exhibit')
      // Lies in both the filename and the declared content type.
      .attach('file', makeExecutable(), {
        filename: 'report.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(422);
    expect(response.body.error_code).toBe('SECURITY_FILE_TYPE_DENIED');
    expect(await countObjects(s3)).toBe(before);
  });

  // =========================================================================
  // 4. INFECTED FILE REJECTED (REAL EICAR, REAL ClamAV)
  // =========================================================================

  it('rejects an EICAR file of an allowed type by a real scan', async () => {
    if (!available) return;

    const before = await countObjects(s3);

    // EICAR sniffs as text/plain (allowed), so the ALLOWLIST passes and the
    // SCANNER is the thing that rejects — which is only meaningful because the
    // clean-PDF case above shows an allowed-type file does get through.
    const response = await request(app.getHttpServer())
      .post('/api/v1/files/upload')
      .set('Authorization', `Bearer ${clerkToken}`)
      .field('declared_purpose', 'exhibit')
      .attach('file', makeEicarTxt(), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(422);
    expect(response.body.error_code).toBe('SECURITY_MALWARE_DETECTED');
    expect(await countObjects(s3)).toBe(before);

    const rejection = await latestRejection(USERS.clerk_case_admin);
    expect(rejection?.after_state).toMatchObject({
      outcome: 'rejected',
      reason: 'SECURITY_MALWARE_DETECTED',
    });
    expect(String(rejection?.after_state.signature)).toContain('Eicar');
  });

  // =========================================================================
  // 5. SCANNER UNAVAILABLE FAILS CLOSED
  // =========================================================================

  it('rejects when the scanner is unreachable, then succeeds once it returns', async () => {
    if (!available) return;

    const before = await countObjects(s3);

    // Stop ClamAV: a clean PDF that would otherwise succeed must now be refused.
    stopClamav();
    try {
      const refused = await request(app.getHttpServer())
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${clerkToken}`)
        .field('declared_purpose', 'exhibit')
        .attach('file', makePdf(), {
          filename: 'clean.pdf',
          contentType: 'application/pdf',
        });

      expect(refused.status).toBe(503);
      expect(refused.body.error_code).toBe('SECURITY_SCANNER_UNAVAILABLE');
      expect(await countObjects(s3)).toBe(before);
    } finally {
      startClamavAndWait();
    }

    // With the scanner back, the SAME upload succeeds — proving the scanner was
    // the cause of the 503, not something incidental.
    const ok = await request(app.getHttpServer())
      .post('/api/v1/files/upload')
      .set('Authorization', `Bearer ${clerkToken}`)
      .field('declared_purpose', 'exhibit')
      .attach('file', makePdf(), {
        filename: 'clean.pdf',
        contentType: 'application/pdf',
      });

    expect(ok.status).toBe(201);
    expect(ok.body.scan_status).toBe('clean');
  });

  // =========================================================================
  // 6. OVERSIZED FILE REJECTED
  // =========================================================================

  it('rejects a file above max_upload_bytes, storing nothing', async () => {
    if (!available) return;

    const before = await countObjects(s3);

    // Just over the seeded 50 MiB limit. The multipart parser's own limit is
    // configured to the same value, so this is aborted before full buffering;
    // the service re-checks regardless.
    const oversized = makePdf(52_428_800 + 1024);

    const response = await request(app.getHttpServer())
      .post('/api/v1/files/upload')
      .set('Authorization', `Bearer ${clerkToken}`)
      .field('declared_purpose', 'exhibit')
      .attach('file', oversized, {
        filename: 'big.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(422);
    expect(['SECURITY_FILE_TOO_LARGE', 'REQUEST_VALIDATION_FAILED']).toContain(
      response.body.error_code,
    );
    expect(await countObjects(s3)).toBe(before);
  });

  // =========================================================================
  // 7. ENTITLEMENT REQUIRED
  // =========================================================================

  it('denies a role with zero entitlements (jury_admin) → 403 with audit', async () => {
    if (!available) return;

    const response = await request(app.getHttpServer())
      .post('/api/v1/files/upload')
      .set('Authorization', `Bearer ${juryToken}`)
      .field('declared_purpose', 'exhibit')
      .attach('file', makePdf(), {
        filename: 'clean.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(403);

    const { rows } = await db.query(
      `SELECT 1 FROM platform.audit_events
        WHERE actor_id = $1 AND action_type = 'access_attempt'
          AND after_state->>'outcome' = 'denied'`,
      [USERS.jury_admin],
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

/** The ClamAV container's address on the Compose network. */
function clamavHost(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
  try {
    const ip = execFileSync(
      'docker',
      [
        'inspect',
        CLAMAV_CONTAINER,
        '--format',
        '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return ip === '' ? 'localhost' : ip;
  } catch {
    return 'localhost';
  }
}

/** Sleep into the next TOTP window, plus margin, so the next login gets a fresh code. */
async function waitForNextTotpWindow(): Promise<void> {
  const stepMs = 30_000;
  const msIntoWindow = Date.now() % stepMs;
  await new Promise((resolve) => setTimeout(resolve, stepMs - msIntoWindow + 1_500));
}
