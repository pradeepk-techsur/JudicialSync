import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { GrantsController } from './grants.controller';
import { GrantsService } from './grants.service';

/**
 * **Identity & ABAC Module — grant workflow** —
 * `TechArch/01-components.md` §4.1 · FRD F00.
 *
 * Responsibility: entitlements as first-class, separately grantable records.
 * A user holds roles AND zero or more independently granted entitlements;
 * role existence never implies access (CONTEXT, hard constraint). Every grant
 * carries its own requester, approver, timestamp and audit event.
 *
 * Implemented by plan **01-08**: the two-step request → approve workflow with
 * server-side separation of duties, and the narrowly constrained,
 * self-closing bootstrap that exists only because an empty system has no
 * second person. The API must REFUSE an approval where `approver ==
 * requester` with `403 AUTH_SOD_VIOLATION`; "the audit trail will catch it"
 * was explicitly rejected as insufficient.
 *
 * Split from `identity` deliberately: the grant workflow is a distinct
 * surface with its own authorization story, and keeping it separate lets
 * plans 01-06 and 01-08 run in parallel without file contention.
 *
 * ## Why `IdentityModule` is not imported here
 *
 * {@link GrantsService} injects `SessionService` and
 * `EntitlementResolverService` — it must revoke the subject's sessions and
 * drop their cached principal the moment a grant changes. Both come from
 * `IdentityModule`, which is `@Global()` (plan 01-06 made it so in order that
 * the `APP_GUARD` in the composition root could resolve `SessionService`
 * without `app.module.ts` being edited). A global module's exports are
 * available to every injector, so importing it here would be a no-op that
 * also created an import cycle risk for no benefit.
 *
 * `PrismaModule` is likewise `@Global()` but IS imported, following
 * `AuditModule`'s precedent: a global module is only registered once *some*
 * module imports it, and relying on another module having done so is a boot
 * order dependency nobody can see.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [GrantsController],
  providers: [GrantsService],
  exports: [GrantsService],
})
export class EntitlementsModule {}
