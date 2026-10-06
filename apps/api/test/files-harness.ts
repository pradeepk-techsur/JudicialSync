import { execFileSync } from 'node:child_process';

import {
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * ============================================================================
 * FILE-PIPELINE TEST HARNESS (plan 01-10)
 * ============================================================================
 *
 * The upload suites need three things the auth/abac harness does not provide:
 *
 *  1. an independent S3 client pointed at the REAL MinIO, so a test can list
 *     the bucket before and after a rejected upload and prove **nothing was
 *     stored** — the heart of "rejected before storage";
 *  2. deterministic fixtures — a valid PDF, an MZ executable, the EICAR test
 *     string — whose sniffed types are known; and
 *  3. the ClamAV container name, so the fail-closed case can stop and restart
 *     it.
 *
 * MinIO publishes NO host port (that is `docker-compose.yml`'s single-TLS-origin
 * design), so the client reaches it on its Compose-network address, discovered
 * the same way `auth-harness` discovers `db`/`redis`/`opa`. The S3 endpoint is
 * plain HTTP, so no CA handling is needed here — only the Keycloak login path
 * (in `auth-harness`) crosses TLS.
 */

/** Compose service/container names. */
export const MINIO_CONTAINER = 'judicialsync-minio-1';
export const CLAMAV_CONTAINER = 'judicialsync-clamav-1';

/** The bucket the application writes to — must match `S3_BUCKET` in compose. */
export const TEST_BUCKET = process.env.TEST_S3_BUCKET ?? 'judicialsync-files';

/** Local-dev MinIO credentials, from the repo `.env` (S3_* keys). */
const S3_ACCESS_KEY =
  process.env.TEST_S3_ACCESS_KEY_ID ??
  process.env.S3_ACCESS_KEY_ID ??
  'judicialsync_local_minio';
const S3_SECRET_KEY =
  process.env.TEST_S3_SECRET_ACCESS_KEY ??
  process.env.S3_SECRET_ACCESS_KEY ??
  'judicialsync_local_minio_secret';

function serviceIp(container: string): string | undefined {
  try {
    const out = execFileSync(
      'docker',
      [
        'inspect',
        container,
        '--format',
        '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return out === '' ? undefined : out;
  } catch {
    return undefined;
  }
}

let cachedEndpoint: string | undefined;

/** The MinIO S3 endpoint on the Compose network. */
export function minioEndpoint(): string {
  if (cachedEndpoint !== undefined) return cachedEndpoint;
  if (process.env.TEST_S3_ENDPOINT !== undefined) {
    cachedEndpoint = process.env.TEST_S3_ENDPOINT;
    return cachedEndpoint;
  }
  const ip = serviceIp(MINIO_CONTAINER) ?? '127.0.0.1';
  cachedEndpoint = `http://${ip}:9000`;
  return cachedEndpoint;
}

/**
 * The S3 endpoint the APPLICATION should use, injected via `S3_ENDPOINT` when
 * the test boots the app. The app runs in this same test process (not in the
 * compose `api` container), so it too must reach MinIO on the network address
 * rather than the compose service name `minio:9000`, which only resolves inside
 * the compose network.
 */
export function appS3Endpoint(): string {
  return minioEndpoint();
}

/** An S3 client the suites use directly to inspect the store. */
export function testS3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: minioEndpoint(),
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
}

/** Number of objects currently in the bucket. */
export async function countObjects(s3: S3Client): Promise<number> {
  let count = 0;
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: TEST_BUCKET,
        ContinuationToken: token,
      }),
    );
    count += page.KeyCount ?? 0;
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token !== undefined);
  return count;
}

/** The `ServerSideEncryption` header MinIO reports for a stored key, or null. */
export async function headEncryption(
  s3: S3Client,
  key: string,
): Promise<string | null> {
  const head = await s3.send(
    new HeadObjectCommand({ Bucket: TEST_BUCKET, Key: key }),
  );
  return head.ServerSideEncryption ?? null;
}

/** Stop the ClamAV container (case 5 — scanner unavailable). */
export function stopClamav(): void {
  execFileSync('docker', ['compose', 'stop', 'clamav'], {
    cwd: repoRoot(),
    stdio: 'ignore',
  });
}

/** Start ClamAV again and wait for it to report healthy. */
export function startClamavAndWait(timeoutMs = 600_000): void {
  execFileSync('docker', ['compose', 'start', 'clamav'], {
    cwd: repoRoot(),
    stdio: 'ignore',
  });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const status = execFileSync(
        'docker',
        ['inspect', '--format', '{{.State.Health.Status}}', CLAMAV_CONTAINER],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
      if (status === 'healthy') return;
    } catch {
      // Container not yet inspectable; keep waiting.
    }
    // Busy-wait with a coarse sleep via a blocking child — avoids pulling in a
    // sleep dependency and keeps this synchronous for use in beforeAll/afterAll.
    execFileSync('sleep', ['5'], { stdio: 'ignore' });
  }
  throw new Error('ClamAV did not become healthy within the timeout.');
}

function repoRoot(): string {
  // apps/api/test -> repo root is three levels up.
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

// ===========================================================================
// Fixtures — bytes whose sniffed types are known
// ===========================================================================

/**
 * A minimal but structurally valid PDF whose `file-type` sniff is
 * `application/pdf`. Padded to `size` bytes with deterministic content so a
 * round-trip hash is meaningful.
 */
export function makePdf(size = 2048): Buffer {
  const header = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    'latin1',
  );
  if (size <= header.length) return header;
  // Deterministic pseudo-random filler inside a PDF comment, so the whole
  // buffer still sniffs as a PDF (magic is at the front) and its hash is stable.
  const filler = Buffer.alloc(size - header.length);
  for (let i = 0; i < filler.length; i += 1) {
    filler[i] = (i * 1103515245 + 12345) & 0xff;
  }
  return Buffer.concat([header, filler]);
}

/** An MZ-header executable — sniffed type `application/x-msdownload`. */
export function makeExecutable(): Buffer {
  const mz = Buffer.from('MZ');
  const rest = Buffer.alloc(256);
  for (let i = 0; i < rest.length; i += 1) rest[i] = (i * 31 + 7) & 0xff;
  return Buffer.concat([mz, rest]);
}

/**
 * The EICAR anti-malware test string. A real, harmless file that every
 * conforming scanner — including ClamAV — reports as `Eicar-Signature FOUND`.
 * Using it means the malware-rejection case exercises the REAL scanner's
 * detection rather than a mock's hardcoded verdict.
 */
export const EICAR =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export function makeEicarTxt(): Buffer {
  return Buffer.from(EICAR, 'latin1');
}

/** ~64 KiB of deterministic bytes wrapped in a valid PDF, for the round-trip. */
export function makeLargePdf(): Buffer {
  return makePdf(64 * 1024);
}
