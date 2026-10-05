import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EntitlementResolverService } from './entitlement-resolver.service';
import { IDP_PROVIDER } from './idp/idp-provider.interface';
import {
  OIDC_CONFIG,
  OidcProvider,
  oidcConfigFromEnv,
} from './idp/oidc.provider';
import { redisProvider } from './redis.provider';
import { SessionConfigService } from './session-config.service';
import { SessionService } from './session.service';

/**
 * **Identity & ABAC Module** — `TechArch/01-components.md` §4.1 · FRD F00.
 *
 * Responsibility: SSO/OIDC exchange against the court IdP, MFA enforcement,
 * session issuance/refresh/revocation, the role catalog, and scope-attribute
 * resolution for the principal.
 *
 * Implemented by plan **01-06**: real `openid-client` OIDC against the
 * Keycloak stand-in realm, with TOTP enforced by the IdP itself. There is one
 * way to obtain a session in this system and it runs through
 * {@link OidcProvider} — CONTEXT rejected a second, stubbed login route on the
 * reasoning that the stub becomes the daily-exercised path and the real
 * integration rots.
 *
 * ## The provider binding is the whole point of the seam
 *
 * `IDP_PROVIDER` is bound to {@link OidcProvider} below. That single line is
 * what makes "which IdP, speaking which protocol" a deployment decision: no
 * caller anywhere imports `OidcProvider` directly, so substituting a provider
 * changes this binding and nothing else. A second protocol binding is
 * deferred rather than stubbed — `docs/IDP-INTEGRATION.md` records what is
 * deferred and what adding it would involve.
 *
 * ## Why this module is `@Global()`
 *
 * `SessionAuthGuard` is registered as an `APP_GUARD` in `app.module.ts`
 * (owned by plan 01-01, which this plan must not edit), and it injects
 * {@link SessionService} from here. A global guard is instantiated in the
 * root injector, so its dependencies have to be resolvable there.
 *
 * `@Global()` makes {@link SessionService} available to the root injector
 * without `app.module.ts` changing, which is precisely the property plan
 * 01-01 designed the composition root around: later plans implement inside
 * their own module directory and never touch the shared file. The
 * alternative — importing `IdentityModule` into `app.module.ts` — would edit
 * a single-owner file for no behavioural gain.
 */
@Global()
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AuthController],
  providers: [
    redisProvider,
    { provide: OIDC_CONFIG, useFactory: oidcConfigFromEnv },
    OidcProvider,
    // The seam. Callers inject `IDP_PROVIDER`, never a concrete provider.
    { provide: IDP_PROVIDER, useExisting: OidcProvider },
    SessionConfigService,
    EntitlementResolverService,
    SessionService,
    AuthService,
  ],
  exports: [
    IDP_PROVIDER,
    OidcProvider,
    redisProvider,
    SessionConfigService,
    EntitlementResolverService,
    SessionService,
    AuthService,
  ],
})
export class IdentityModule {}
