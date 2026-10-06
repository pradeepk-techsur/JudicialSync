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
 * Phase 1 owner: plan **01-08** — the two-step request → approve workflow with
 * server-side separation of duties. The API must REFUSE an approval where
 * `approver == requester` with `403 AUTH_SOD_VIOLATION`; "the audit trail will
 * catch it" was explicitly rejected as insufficient.
 *
 * Split from `identity` deliberately: the grant workflow is a distinct
 * surface with its own authorization story, and keeping it separate lets
 * plans 01-06 and 01-08 run in parallel without file contention.
 *
 * ## Why these imports
 *
 * - `IdentityModule` is `@Global()` (plan 01-06), so `SessionService` and
 *   `EntitlementResolverService` are resolvable here without importing it —
 *   they are injected by `GrantsService` to run the documented invalidate +
 *   revoke-sessions pair on every approval and revocation.
 * - `AuditModule` supplies `AuditService`, which `withAudit` requires so each
 *   grant and its audit event commit atomically.
 *
 * `PolicyModule` is NOT imported: it is `@Global()` (plan 01-07), so the
 * collaborators `AbacGuard` needs for this module's `@Resource()` routes are
 * already resolvable from the root injector.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [GrantsController],
  providers: [GrantsService],
  exports: [GrantsService],
})
export class EntitlementsModule {}
