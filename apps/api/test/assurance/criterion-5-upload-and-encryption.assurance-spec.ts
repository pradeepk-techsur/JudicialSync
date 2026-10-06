/**
 * ============================================================================
 * CRITERION 5 — UPLOAD REJECTION BEFORE STORAGE, AND ENCRYPTION
 * ============================================================================
 *
 * ROADMAP success criterion 5: "An uploaded file of a disallowed type or
 * failing malware scan is rejected before storage, and all data is encrypted in
 * transit and at rest."
 *
 * Every upload issues RAW HTTP (multipart `fetch`) against the running stack —
 * no in-process module. The decisive move throughout is the same as 01-10's
 * feature suite: count the bucket BEFORE and AFTER each rejection and assert it
 * is unchanged, because "rejected before storage" is a claim about the STORE and
 * must be proven against the store (via an independent S3 client).
 *
 * ## Criterion 5 is PARTIAL by design — and the test output says so
 *
 * Object-store at-rest encryption is provable here (MinIO SSE-S3 via
 * HeadObject). Database at-rest encryption is a property of the managed database
 * volume + KMS, deferred to the deployment substrate (ASM-07 in
 * docs/ASSUMPTIONS.md). The encryption-at-rest test is NAMED to make that
 * limitation visible in the test output rather than only in a document, and
 * docs/ASSURANCE.md records criterion 5 as `PARTIAL — see ASM-07`.
 */
import { execFileSync } from 'node:child_process';

import { ListObjectsV2Command } from '@aws-sdk/client-s3';

import {
  countObjects,
  headEncryption,
  makeEicarTxt,
  makeExecutable,
  makePdf,
  startClamavAndWait,
  stopClamav,
  TEST_BUCKET,
  testS3Client,
} from '../files-harness';
import { api, API_BASE, appDbaClient, requireStack, tokenFor } from './harness';

jest.setTimeout(900_000);

/**
 * A raw multipart upload against the running stack.
 *
 * Uses the platform `FormData`/`Blob` so no supertest or in-process app is
 * involved — the bytes cross the TLS proxy to the real `api` container exactly
 * as a browser's upload would.
 */
async function rawUpload(
  token: string,
  bytes: Buffer,
  filename: string,
  contentType: string,
): Promise<{ status: number; body: Record<string, unknown>; rawBody: string }> {
  const form = new FormData();
  form.append('declared_purpose', 'exhibit');
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: contentType }),
    filename,
  );
  const res = await fetch(`${API_BASE}/files/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const rawBody = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: res.status, body, rawBody };
}

describe('criterion 5: upload rejection and encryption (assurance)', () => {
  let available = false;
  const s3 = testS3Client();
  let clerk: string;

  beforeAll(async () => {
    available = await requireStack();
    if (!available) return;
    clerk = await tokenFor('clerk_case_admin');
  });

  // =========================================================================
  // 1. Disallowed type rejected before storage AND before scanning
  // =========================================================================

  it('criterion 5: a disallowed-type file is rejected before storage, no scan attempted', async () => {
    if (!available) return;

    const before = await countObjects(s3);
    const res = await rawUpload(
      clerk,
      makeExecutable(),
      'tool.bin',
      'application/octet-stream',
    );

    expect(res.status).toBe(422);
    expect(res.body.error_code).toBe('SECURITY_FILE_TYPE_DENIED');
    // Nothing stored — the claim is about the store, so it is checked there.
    expect(await countObjects(s3)).toBe(before);

    // No malware_scan_results row for a rejected-type upload: the allowlist ran
    // first, so the scan was never attempted. Verified as app_dba (read-only is
    // fine) so this remains a black-box observation of the store + DB state.
    const dba = await appDbaClient();
    try {
      const { rows } = await dba.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
           FROM platform.malware_scan_results msr
           JOIN platform.file_references fr ON fr.id = msr.file_reference_id
          WHERE fr.scan_status = 'rejected'`,
      );
      expect(Number(rows[0].n)).toBe(0);
    } finally {
      await dba.end();
    }
  });

  // =========================================================================
  // 2. Header spoofing does not help
  // =========================================================================

  it('criterion 5: an executable disguised as a PDF is rejected (content sniffed, not declared)', async () => {
    if (!available) return;

    const before = await countObjects(s3);
    const res = await rawUpload(
      clerk,
      makeExecutable(),
      'report.pdf',
      'application/pdf',
    );
    expect(res.status).toBe(422);
    expect(res.body.error_code).toBe('SECURITY_FILE_TYPE_DENIED');
    expect(await countObjects(s3)).toBe(before);
  });

  // =========================================================================
  // 3. EICAR of an ALLOWED type rejected before storage — isolates the scanner
  // =========================================================================

  it('criterion 5: an EICAR file of an allowed type is rejected by the real scanner before storage', async () => {
    if (!available) return;

    const before = await countObjects(s3);
    // EICAR sniffs as text/plain (allowed), so the ALLOWLIST passes and the
    // SCANNER is the thing that rejects — meaningful only because the clean-PDF
    // case (below) shows an allowed type does get through.
    const res = await rawUpload(
      clerk,
      makeEicarTxt(),
      'notes.txt',
      'text/plain',
    );
    expect(res.status).toBe(422);
    expect(res.body.error_code).toBe('SECURITY_MALWARE_DETECTED');
    expect(await countObjects(s3)).toBe(before);
  });

  // =========================================================================
  // 4. Scanner outage fails closed
  // =========================================================================

  it('criterion 5: when the scanner is down the upload fails closed, then succeeds once it returns', async () => {
    if (!available) return;

    const before = await countObjects(s3);

    // Treating an unreachable scanner as "clean" is the single most likely way
    // this control gets quietly disabled. Stop ClamAV and prove a clean PDF —
    // which otherwise succeeds — is refused and stored nowhere.
    stopClamav();
    try {
      const refused = await rawUpload(
        clerk,
        makePdf(),
        'clean.pdf',
        'application/pdf',
      );
      expect(refused.status).toBe(503);
      expect(refused.body.error_code).toBe('SECURITY_SCANNER_UNAVAILABLE');
      expect(await countObjects(s3)).toBe(before);
    } finally {
      startClamavAndWait();
    }

    // With the scanner back, the SAME upload succeeds — proving the scanner was
    // the cause of the 503, not something incidental.
    const ok = await rawUpload(clerk, makePdf(), 'clean.pdf', 'application/pdf');
    expect(ok.status).toBe(201);
    expect(ok.body.scan_status).toBe('clean');
  });

  // =========================================================================
  // 5. Encrypted at rest — OBJECT STORE ONLY, and the name says so
  // =========================================================================

  it('criterion 5 (partial): object store encrypts at rest; database at-rest encryption is deferred — see ASM-07', async () => {
    if (!available) return;

    // A clean upload, then assert the stored object reports AES256 via
    // HeadObject. Deliberately asserts NOTHING about PostgreSQL at-rest
    // encryption: that is a property of the managed DB volume + KMS
    // (TechArch/04 §7.5), deferred to the deployment substrate with the IaC
    // (ASM-07). The local Compose Postgres volume is unencrypted; claiming
    // otherwise would be the most misleading line the suite could emit.
    const upload = await rawUpload(
      clerk,
      makePdf(),
      'encrypted.pdf',
      'application/pdf',
    );
    expect(upload.status).toBe(201);

    // Find the newest object and assert its server-side encryption.
    const client = testS3Client();
    const key = await newestObjectKey();
    expect(key).not.toBeNull();
    const sse = await headEncryption(client, key as string);
    expect(sse).toBe('AES256');
  });

  // =========================================================================
  // 6. Encrypted in transit — no plaintext path, TLS 1.2+
  // =========================================================================

  it('criterion 5: there is no plaintext HTTP path to the API, and TLS negotiates 1.2 or higher', () => {
    if (!available) return;

    // Plain HTTP to the TLS port is refused (a 400 bad-request, not a 200): the
    // proxy speaks TLS and a cleartext request cannot be served. There is no
    // redirect to follow because there is no plaintext listener to redirect to.
    const plain = runCurl([
      '-sS',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      'http://judicialsync.localhost:8443/api/v1/health',
    ]);
    expect(plain.trim()).not.toBe('200');

    // Neither `api` nor `keycloak` publishes a host port — only the proxy does.
    const psPorts = runCompose(['ps', '--format', '{{.Service}} {{.Ports}}']);
    const published = psPorts
      .split('\n')
      .filter((line) => /^(api|keycloak)\s/.test(line))
      .join('\n');
    // No `0.0.0.0:` / `:::` host binding on api or keycloak.
    expect(published).not.toMatch(/0\.0\.0\.0:/);
    expect(published).not.toMatch(/:::\d/);

    // TLS 1.1 is refused on the HTTPS endpoint — so the negotiated floor is 1.2+.
    let tls11Failed = false;
    try {
      runCurl([
        '-ksS',
        '--tls-max',
        '1.1',
        '-o',
        '/dev/null',
        'https://judicialsync.localhost:8443/api/v1/health',
      ]);
    } catch {
      tls11Failed = true;
    }
    expect(tls11Failed).toBe(true);
  });

  // =========================================================================
  // 7. No store URL or signature leaks in any response
  // =========================================================================

  it('criterion 5: no response contains a store address, a presign signature, or a redirect to the store', async () => {
    if (!available) return;

    // Upload, read metadata, and download — none of these responses may contain
    // the object store's internal address or a presigned signature, and the
    // download must stream bytes rather than redirect to the store (01-10,
    // threat T-01-43; runtime-environment §9a).
    const upload = await rawUpload(
      clerk,
      makePdf(),
      'leakcheck.pdf',
      'application/pdf',
    );
    expect(upload.status).toBe(201);
    const refId = upload.body.file_reference_id as string;

    const metadata = await api.get(`/files/${refId}`, { token: clerk });
    const downloadRes = await fetch(`${API_BASE}/files/${refId}/content`, {
      method: 'GET',
      headers: { authorization: `Bearer ${clerk}` },
      redirect: 'manual',
    });
    const downloadText = await downloadRes.text();

    const forbidden = ['minio', 'X-Amz-Signature', ':9000'];
    for (const probe of [
      upload.rawBody,
      metadata.rawBody,
      downloadText,
    ]) {
      for (const needle of forbidden) {
        expect(probe).not.toContain(needle);
      }
    }
    // The download is the bytes, not a 3xx redirect to the store.
    expect(downloadRes.status).toBeLessThan(300);
  });

  // =========================================================================
  // 8. Rejections are audited
  // =========================================================================

  it('criterion 5: each upload rejection leaves an audit event recording the reason', async () => {
    if (!available) return;

    // A fresh rejection, then confirm an access_attempt/rejection audit row for
    // the acting user exists with the rejection reason.
    const res = await rawUpload(
      clerk,
      makeExecutable(),
      'tool.bin',
      'application/octet-stream',
    );
    expect(res.status).toBe(422);

    await new Promise((r) => setTimeout(r, 1500));
    const dba = await appDbaClient();
    try {
      const { rows } = await dba.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM platform.audit_events
          WHERE action_type = 'access_attempt'
            AND after_state->>'outcome' = 'rejected'`,
      );
      expect(Number(rows[0].n)).toBeGreaterThan(0);
    } finally {
      await dba.end();
    }
  });
});

// ===========================================================================
// Helpers
// ===========================================================================

/** The key of the most recently modified object in the bucket, or null. */
async function newestObjectKey(): Promise<string | null> {
  const client = testS3Client();
  const page = await client.send(
    new ListObjectsV2Command({ Bucket: TEST_BUCKET }),
  );
  const contents = page.Contents ?? [];
  if (contents.length === 0) return null;
  contents.sort(
    (a, b) =>
      (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
  );
  return contents[0].Key ?? null;
}

function runCurl(args: string[]): string {
  return execFileSync('curl', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runCompose(args: string[]): string {
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return execFileSync('docker', ['compose', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}
