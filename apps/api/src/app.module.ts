/**
 * ============================================================================
 * COMPOSITION ROOT — OWNED EXCLUSIVELY BY PLAN 01-01. DO NOT MODIFY.
 * ============================================================================
 *
 * Plans 01-02 through 01-15 implement **inside their own module directory
 * only** (`src/modules/<name>/`). Every Phase 1 feature module is already
 * imported below, so no later plan needs to touch this file to wire itself in.
 *
 * Two reasons this rule exists:
 *
 *  1. **Parallelism.** Up to fourteen plans run partly in parallel. If each
 *     appended its own import line here, every one of them would conflict on
 *     the same two hunks of the same file. Declaring the full module set up
 *     front removes that entire class of merge conflict.
 *
 *  2. **Security.** The two global guards below are registered BEFORE any
 *     protected route exists, and they deny by default. A route added by a
 *     later plan is covered the moment it is written — there is no window in
 *     which a new endpoint is live but unguarded, and no way for a plan to
 *     "forget" to opt in. `FRD/F00` states identity "is the gatekeeper for
 *     every other feature in the system; no other feature may bypass it";
 *     that is only true if the gate is global and closed by default.
 *
 * If a later plan genuinely needs a change here (a new module directory that
 * is not in the Phase 1 set), raise it as an architectural deviation rather
 * than editing in place.
 */
import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { AuditModule } from './modules/audit/audit.module';
import { CaseContextModule } from './modules/case-context/case-context.module';
import { AppConfigModule } from './modules/config/config.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { PolicyModule } from './modules/policy/policy.module';
import { RetentionModule } from './modules/retention/retention.module';

@Module({
  imports: [
    // Process-environment configuration (`@nestjs/config`). Distinct from
    // `AppConfigModule` below, which is JudicialSync's own database-backed
    // configuration domain (F13/F03).
    NestConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),

    // ---- Phase 1 feature modules, 1:1 with TechArch §4.1 Platform Core ----
    HealthModule, //          liveness/readiness                        (—)
    IdentityModule, //        Identity & ABAC Module                    (F00)
    EntitlementsModule, //    Identity & ABAC — grant workflow          (F00)
    PolicyModule, //          Policy Decision Point client              (F00)
    CaseContextModule, //     Case & Docket Context Service             (F01)
    AuditModule, //           Audit Service                             (F02)
    FilesModule, //           File/Malware Scanning Service             (F13)
    AppConfigModule, //       Configuration read path                   (F13/F03)
    RetentionModule, //       Retention & Disposition Engine            (F13)
  ],
})
export class AppModule {}
