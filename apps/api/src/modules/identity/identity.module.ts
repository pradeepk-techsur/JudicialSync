import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { IDP_PROVIDER } from './idp/idp-provider.interface';
import {
  OIDC_CONFIG,
  OidcProvider,
  oidcConfigFromEnv,
} from './idp/oidc.provider';
import { redisProvider } from './redis.provider';

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
 */
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [
    redisProvider,
    { provide: OIDC_CONFIG, useFactory: oidcConfigFromEnv },
    OidcProvider,
    // The seam. Callers inject `IDP_PROVIDER`, never a concrete provider.
    { provide: IDP_PROVIDER, useExisting: OidcProvider },
  ],
  exports: [IDP_PROVIDER, OidcProvider, redisProvider],
})
export class IdentityModule {}
