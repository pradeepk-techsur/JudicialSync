import { Module } from '@nestjs/common';

/**
 * **File/Malware Scanning Service** —
 * `TechArch/01-components.md` §4.1 · FRD F13.
 *
 * Responsibility: the `/files/upload` intake pipeline — file-type allowlist
 * enforcement, malware scan orchestration against a real ClamAV instance,
 * encrypted object storage, and the `file_references` +
 * `malware_scan_results` records.
 *
 * Phase 1 owner: plan **01-10**. Order of operations is itself a requirement:
 * the allowlist rejects a disallowed type BEFORE a scan is attempted, and both
 * a disallowed-type file and a scan-failing file are rejected BEFORE storage.
 * A placeholder scanner was explicitly rejected — success criterion 5 requires
 * demonstrating those rejections against a real engine, which an
 * always-returns-clean implementation cannot do.
 *
 * File bytes move through this service's own authenticated API routes in both
 * directions. A presigned URL pointing at the object store must never reach a
 * browser: the store is a server-side dependency and its endpoint is not
 * reachable from a client.
 *
 * Phase 5's exhibit intake (F15) calls this service rather than building its
 * own upload path.
 */
@Module({})
export class FilesModule {}
