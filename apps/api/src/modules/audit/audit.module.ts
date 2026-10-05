import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditInternalController } from './audit-internal.controller';
import { AuditService } from './audit.service';
import { AuditExplorerController } from './explorer.controller';
import { AuditExplorerService } from './explorer.service';

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
 *
 * ---
 *
 * ## Why `PolicyModule` is NOT in `imports`, even though two providers here
 * ## inject from it
 *
 * `AuditExplorerService` injects `PdpClient` and `ResourceLoaderService`. It
 * does not pull `PolicyModule` into `imports`, because `PolicyModule` already
 * imports **this** module (its `AbacGuard` writes `access_attempt` events
 * through `AuditService`), and adding the reverse edge would make the pair
 * circular — resolvable only with
 * `forwardRef()` on both sides, which trades a clear graph for a pair of
 * lazily-resolved references that fail at runtime rather than at boot.
 *
 * It is unnecessary in any case: `PolicyModule` is `@Global()`, exactly so its
 * providers are resolvable from the root injector for `AbacGuard`'s sake. A
 * `@Global()` module's exports are visible to every module in the application
 * once it has been registered, and `app.module.ts` registers it. So the
 * dependency is real and satisfied; only the import edge is absent, and only
 * because adding it would create a cycle that solves nothing.
 *
 * `context-boot.e2e-spec.ts` compiles the whole `AppModule`, so if that ever
 * stopped being true it would fail there rather than in production.
 */
@Module({
  imports: [PrismaModule],
  providers: [AuditService, AuditExplorerService],
  exports: [AuditService, AuditExplorerService],
  controllers: [AuditInternalController, AuditExplorerController],
})
export class AuditModule {}
