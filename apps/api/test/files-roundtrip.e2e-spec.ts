import { createHash } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

import { OidcProvider } from '../src/modules/identity/idp/oidc.provider';
import { bootApp, loginAs, requireStack, testDatabaseUrl } from './auth-harness';
import {
  CLAMAV_CONTAINER,
  appS3Endpoint,
  headEncryption,
  makeLargePdf,
  testS3Client,
} from './files-harness';

/**
 * ============================================================================
 * BYTE ROUND-TRIP AND ENCRYPTION AT REST
 * ============================================================================
 *
 * The upload suite proves status codes; this one proves the pipeline actually
 * MOVES BYTES. A ~64 KiB PDF is uploaded, downloaded through the authenticated
 * API, and the two SHA-256 hashes are compared — lengths would not catch a
 * truncation-then-pad or a re-encode. It also proves the download is the bytes
 * themselves (not JSON, not a redirect) and that no response leaks the store's
 * address, and it confirms server-side encryption via `HeadObject`.
 */

jest.setTimeout(900_000);

/** security_officer: SDNY, holds `audit_reader` but NOT `case_read`. */
const SECURITY_OFFICER = '0a000004-0000-4000-8000-00000000000a';

describe('files-roundtrip: bytes in = bytes out, encrypted at rest (e2e)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let db: Client;
  let available = false;
  const s3 = testS3Client();

  /**
   * One login per user for the whole suite. Each `loginAs` is a real password +
   * TOTP flow and Keycloak enforces one-time use of each code within its 30s
   * window; a session stays valid for the suite's lifetime, so reusing it keeps
   * the suite within the TOTP budget and avoids spurious OTP re-prompts.
   */
  let clerkToken: string;
  let officerToken: string;

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;

    ({ app, restoreEnv } = await bootApp({
      S3_ENDPOINT: appS3Endpoint(),
      S3_BUCKET: 'judicialsync-files',
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? 'judicialsync_local_minio',
      S3_SECRET_ACCESS_KEY:
        process.env.S3_SECRET_ACCESS_KEY ?? 'judicialsync_local_minio_secret',
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

    // Two real logins back-to-back can land in the same 30s TOTP window; a
    // spent code from a prior run then reads as `invalid_user_credentials`.
    // Spacing them into distinct windows guarantees each gets a fresh,
    // unspent code. Paid once, in setup.
    clerkToken = (await loginAs(app, 'clerk_case_admin')).session_token;
    await waitForNextTotpWindow();
    officerToken = (await loginAs(app, 'security_officer')).session_token;
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
    restoreEnv?.();
  });

  const sha256 = (buffer: Buffer): string =>
    createHash('sha256').update(buffer).digest('hex');

  it('uploads and downloads byte-identically, leaks no store URL, encrypts at rest', async () => {
    if (!available) return;

    const fixture = makeLargePdf();
    const uploadedHash = sha256(fixture);

    // --- upload ---
    const upload = await request(app.getHttpServer())
      .post('/api/v1/files/upload')
      .set('Authorization', `Bearer ${clerkToken}`)
      .field('declared_purpose', 'exhibit')
      .attach('file', fixture, { filename: 'roundtrip.pdf', contentType: 'application/pdf' });

    expect(upload.status).toBe(201);
    const refId = upload.body.file_reference_id as string;

    // Metadata response must not leak the store address either.
    const metadataText = JSON.stringify(upload.body);
    expect(metadataText).not.toContain('minio');
    expect(metadataText).not.toContain('9000');
    expect(metadataText).not.toContain('X-Amz-Signature');

    // --- download ---
    const download = await request(app.getHttpServer())
      .get(`/api/v1/files/${refId}/content`)
      .set('Authorization', `Bearer ${clerkToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    // The body is the bytes, not JSON and not a redirect.
    expect(download.status).toBe(200);
    expect(download.headers.location).toBeUndefined();
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.headers['x-content-type-options']).toBe('nosniff');

    const downloadedBuffer = download.body as Buffer;
    expect(sha256(downloadedBuffer)).toBe(uploadedHash);

    // No store leakage anywhere in the download response.
    const headerBlob = JSON.stringify(download.headers);
    expect(headerBlob).not.toContain('minio');
    expect(headerBlob).not.toContain('X-Amz-Signature');
    expect(headerBlob).not.toContain('9000');

    // --- encryption at rest, independently confirmed ---
    const { rows } = await db.query<{ storage_pointer: string }>(
      `SELECT storage_pointer FROM platform.file_references WHERE id = $1`,
      [refId],
    );
    expect(rows).toHaveLength(1);
    expect(await headEncryption(s3, rows[0].storage_pointer)).toBe('AES256');
  });

  it('denies a user without file-read access → 403, leaking no bytes', async () => {
    if (!available) return;

    // Upload as the clerk, then attempt download as security_officer, who holds
    // `audit_reader` but not `case_read` (file:read requires case_read).
    const upload = await request(app.getHttpServer())
      .post('/api/v1/files/upload')
      .set('Authorization', `Bearer ${clerkToken}`)
      .field('declared_purpose', 'exhibit')
      .attach('file', makeLargePdf(), {
        filename: 'owned.pdf',
        contentType: 'application/pdf',
      });
    expect(upload.status).toBe(201);
    const refId = upload.body.file_reference_id as string;

    const denied = await request(app.getHttpServer())
      .get(`/api/v1/files/${refId}/content`)
      .set('Authorization', `Bearer ${officerToken}`);

    // 403 or 404 (blind-discovery hiding) — never 200, and never the bytes.
    expect([403, 404]).toContain(denied.status);
    expect(denied.status).not.toBe(200);

    const { rows } = await db.query(
      `SELECT 1 FROM platform.audit_events
        WHERE actor_id = $1 AND action_type = 'access_attempt'
          AND after_state->>'outcome' = 'denied'`,
      [SECURITY_OFFICER],
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
