import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AllowlistService } from './allowlist.service';
import { ClamAvScanner } from './clamav.scanner';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { ObjectStoreService } from './object-store.service';

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
 * A placeholder scanner that always returns clean was explicitly rejected —
 * success criterion 5 requires demonstrating those rejections against a real
 * ClamAV instance, which such a placeholder cannot prove.
 *
 * File bytes move through this service's own authenticated API routes in both
 * directions. A signed object URL pointing at the object store must never reach
 * a browser: the store is a server-side dependency and its endpoint is not
 * reachable from a client.
 *
 * Phase 5's exhibit intake (F15) calls this service rather than building its
 * own upload path.
 *
 * `AuditModule` is imported for `AuditService`: every upload, rejection and
 * download is an audited action, and `withAudit`/`recordStandaloneAudit` are
 * the only paths into the audit table.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [FilesController],
  providers: [AllowlistService, ClamAvScanner, ObjectStoreService, FilesService],
  exports: [FilesService],
})
export class FilesModule {}
