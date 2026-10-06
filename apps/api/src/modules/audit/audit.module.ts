import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditInternalController } from './audit-internal.controller';
import { AuditService } from './audit.service';
import { AuditExplorerController } from './explorer.controller';
import { AuditExplorerService } from './explorer.service';
import { ChainVerifierService } from './integrity/chain-verifier.service';
import { IntegrityController } from './integrity/integrity.controller';
import { IntegrityStatusService } from './integrity/integrity-status.service';
import {
  AUDIT_INTEGRITY_QUEUE,
  IntegrityProcessor,
} from './integrity/integrity.processor';

/**
 * Parse `REDIS_URL` into the connection options BullMQ needs.
 *
 * BullMQ (ioredis under the hood) accepts a URL, but passing the parsed host /
 * port / password explicitly keeps the parse in one place and lets a missing
 * URL fall back to localhost without BullMQ throwing at module-construction
 * time — the schedule is disabled separately via
 * `AUDIT_INTEGRITY_SCHEDULE_ENABLED`, and a hermetic unit test that never arms
 * the schedule must still be able to boot the module.
 */
function redisConnection(): {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: number | null;
} {
  const raw = process.env.REDIS_URL;
  try {
    const url = new URL(raw ?? 'redis://localhost:6379');
    return {
      host: url.hostname,
      port: url.port === '' ? 6379 : Number.parseInt(url.port, 10),
      ...(url.password !== '' ? { password: url.password } : {}),
      // BullMQ workers REQUIRE maxRetriesPerRequest: null (its blocking
      // commands must not give up); this is the value its own docs mandate.
      maxRetriesPerRequest: null,
    };
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
  }
}

/**
 * **Audit Service** — `TechArch/01-components.md` §4.1 · FRD F02.
 *
 * Responsibility: append-only, hash-chained audit event capture
 * (`prev_hash` / `row_hash`), transactional-outbox coordination with domain
 * writes, and the Audit Explorer query API gated on the `audit_reader`
 * entitlement (separation of duties).
 *
 * Phase 1 owners: plan **01-05** (the write path — this file's current
 * contents) and plan **01-12** (the Audit Explorer read API and the BullMQ
 * hash-chain verification job, which writes a persistent `integrity_alert`
 * record on a detected break — log-only was rejected as too easy to miss).
 *
 * The append-only guarantee is enforced at the DATABASE GRANT level — the
 * application role holds no UPDATE or DELETE on `audit_events` — not merely by
 * application convention. Plan 01-14 proves this by attempting the writes.
 *
 * ---
 *
 * ## Two notes for the plans that come next
 *
 * **`AuditService` is exported deliberately.** Plans 01-06 through 01-12 all
 * inject it: identity emits login/MFA events, the ABAC guard emits
 * `access_attempt` on every denial, the case model emits
 * `designation_change`. Nearly every feature module in the system is
 * downstream of this one export.
 *
 * **This module is the first importer of `PrismaModule`,** which matters more
 * than it looks. `PrismaModule` is `@Global()`, but `@Global()` does not mean
 * auto-registered — Nest registers a global module the first time *some*
 * module imports it, and until then injecting `PrismaService` fails at boot
 * with an unresolved dependency. Plan 01-03 shipped the module with no
 * importer (every feature module was still an empty shell and `app.module.ts`
 * is single-owner). The import below is that first importer; from here on
 * every other module gets `PrismaService` for free without touching the
 * composition root.
 */
@Module({
  imports: [
    PrismaModule,
    // BullMQ for the hash-chain verification job (TechArch §8.2). The
    // connection is read from REDIS_URL at registration; the SCHEDULE is armed
    // separately in IntegrityProcessor and gated on
    // AUDIT_INTEGRITY_SCHEDULE_ENABLED, so registering the queue here does not
    // by itself start any periodic work.
    BullModule.forRoot({ connection: redisConnection() }),
    BullModule.registerQueue({ name: AUDIT_INTEGRITY_QUEUE }),
  ],
  providers: [
    AuditService,
    AuditExplorerService,
    ChainVerifierService,
    IntegrityStatusService,
    IntegrityProcessor,
  ],
  exports: [AuditService, ChainVerifierService, IntegrityStatusService],
  controllers: [
    AuditInternalController,
    AuditExplorerController,
    IntegrityController,
  ],
})
export class AuditModule {}
