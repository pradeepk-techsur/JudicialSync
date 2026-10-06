import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * ============================================================================
 * S3-COMPATIBLE OBJECT STORE, ENCRYPTED AT REST, SERVER-SIDE ONLY
 * ============================================================================
 *
 * `@aws-sdk/client-s3` pointed at `S3_ENDPOINT` with `forcePathStyle: true`
 * (MinIO locally). CONTEXT: "the storage interface must be S3-compatible so AWS
 * S3 GovCloud / Azure Blob Government substitute by configuration, not code
 * change." So this is the ONLY file that knows the store exists — no
 * MinIO-specific SDK, and no MinIO concept leaks past these methods. Swapping
 * MinIO for S3 GovCloud is an `S3_ENDPOINT`/credentials change, nothing more.
 *
 * ## Encryption at rest
 *
 * Every `put` sets `ServerSideEncryption: 'AES256'` (`TechArch/04-security.md`
 * §7.5), backed locally by the `MINIO_KMS_SECRET_KEY` configured in plan
 * 01-04's compose file. The application never handles the raw key — it asks for
 * AES256 and the store does the rest. `HeadObject` reporting `AES256` is how
 * the round-trip suite proves it (threat T-01-45).
 *
 * ## There is NO URL-signing method, deliberately
 *
 * A signed-ahead-of-time object URL would be generated against the store's
 * INTERNAL address (the compose service, port 9000), which the browser cannot
 * resolve and which would not carry the caller's `Authorization` header anyway
 * (runtime-environment.md §9a). The store is a server-side dependency exactly
 * like the database; bytes move through the application's own authenticated API
 * routes in both directions. The absence of any such method here is structural,
 * and the plan's verification greps `apps/api/src/` to prove the forbidden
 * S3-signing helpers appear nowhere (threat T-01-43).
 */
@Injectable()
export class ObjectStoreService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStoreService.name);

  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? 'judicialsync-files';

    const endpoint = process.env.S3_ENDPOINT;
    this.client = new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      // Blank endpoint → the AWS default for the region (a real S3). A set
      // endpoint → MinIO or a GovCloud endpoint, which both need path-style
      // addressing because virtual-host-style buckets are not available.
      ...(endpoint !== undefined && endpoint !== ''
        ? { endpoint, forcePathStyle: true }
        : {}),
      credentials:
        process.env.S3_ACCESS_KEY_ID !== undefined &&
        process.env.S3_SECRET_ACCESS_KEY !== undefined
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  /** Ensure the bucket exists at boot. Idempotent — safe on every restart. */
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket();
    } catch (error) {
      // A boot-time store outage must not crash the API — the upload routes
      // will surface it per-request, and every other route stays up. Logged so
      // the cause is visible rather than a mystery 500 on the first upload.
      this.logger.error(
        `Could not ensure object-store bucket '${this.bucket}' at boot: ${
          error instanceof Error ? error.message : String(error)
        }. Uploads will fail until the store is reachable.`,
      );
    }
  }

  /**
   * Create the bucket if it is absent. Idempotent: `HeadBucket` succeeds when it
   * already exists, and a 404/NotFound triggers a create.
   */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created object-store bucket '${this.bucket}'.`);
    } catch (error) {
      // A concurrent creator (another API instance booting at the same time)
      // wins the race; "already owned by you" is success, not failure.
      if (isAlreadyOwned(error)) return;
      throw error;
    }
  }

  /**
   * Store `body` under `key`, server-side encrypted.
   *
   * @returns the key, which becomes the `file_references.storage_pointer`.
   */
  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Encryption at rest — §7.5. Every object, no exceptions.
        ServerSideEncryption: 'AES256',
      }),
    );
    return key;
  }

  /** Stream an object's bytes back. The controller pipes this to the response. */
  async getObjectStream(key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = response.Body;
    if (body === undefined) {
      throw new Error(`Object '${key}' returned an empty body.`);
    }
    // In Node the SDK returns a Readable; the union also admits web/Blob types
    // that never occur on this runtime.
    return body as Readable;
  }

  /** The configured bucket name, for diagnostics and tests. */
  get bucketName(): string {
    return this.bucket;
  }
}

/** A 404 / NoSuchBucket / NotFound from the SDK. */
function isNotFound(error: unknown): boolean {
  const name = errorName(error);
  const status = httpStatus(error);
  return (
    status === 404 ||
    name === 'NotFound' ||
    name === 'NoSuchBucket' ||
    name === 'NoSuchKey'
  );
}

/** "This bucket already exists and you own it" — treat as success. */
function isAlreadyOwned(error: unknown): boolean {
  const name = errorName(error);
  return (
    name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists'
  );
}

function errorName(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    return String((error as { name: unknown }).name);
  }
  return undefined;
}

function httpStatus(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    typeof (error as { $metadata: unknown }).$metadata === 'object'
  ) {
    const meta = (error as { $metadata: { httpStatusCode?: number } }).$metadata;
    return meta.httpStatusCode;
  }
  return undefined;
}
