import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PdpClient } from './pdp.client';
import { ResourceLoaderService } from './resource-loader.service';

/**
 * **Policy Decision Point (PDP) client** —
 * `TechArch/01-components.md` §4.1 · FRD F00 / F13.
 *
 * Responsibility: centralized ABAC evaluation. This module is the HTTP client
 * for the Open Policy Agent container and the resource-attribute loader that
 * feeds it; the policy LOGIC itself lives in Rego inside OPA, not in
 * TypeScript. TechArch chose OPA specifically to avoid three
 * independently-implemented, independently-buggy ABAC checks across the three
 * services — so do not reimplement policy here.
 *
 * Implemented by plan **01-07**: {@link PdpClient} (fail-closed OPA client),
 * {@link ResourceLoaderService} (the target object's real attributes), the
 * `@Resource()` route descriptor, and `POST /security/policy-evaluate`.
 *
 * ## Why this module is `@Global()`
 *
 * `AbacGuard` is registered as an `APP_GUARD` in `app.module.ts` — a file
 * owned exclusively by plan 01-01, which this plan must not edit — and a
 * global guard is instantiated in the ROOT injector. Its dependencies must
 * therefore be resolvable there.
 *
 * `@Global()` makes {@link PdpClient} and {@link ResourceLoaderService}
 * available to the root injector without the composition root changing, which
 * is the same mechanism `IdentityModule` uses for `SessionService` (plan
 * 01-06) and the property plan 01-01 designed that file around. The
 * alternative — importing `PolicyModule` into `app.module.ts` — would edit a
 * single-owner file for no behavioural gain.
 *
 * `AuditModule` is imported because the guard writes an `access_attempt` event
 * on every denial and needs `AuditService` from the root injector for the same
 * reason.
 */
@Global()
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [PdpClient, ResourceLoaderService],
  exports: [PdpClient, ResourceLoaderService],
})
export class PolicyModule {}
