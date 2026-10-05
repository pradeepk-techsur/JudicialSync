import { Module } from '@nestjs/common';

/**
 * **Identity & ABAC Module** — `TechArch/01-components.md` §4.1 · FRD F00.
 *
 * Responsibility: SSO/OIDC exchange against the court IdP, MFA enforcement,
 * session issuance/refresh/revocation, the role catalog, and scope-attribute
 * resolution for the principal.
 *
 * Phase 1 owner: plan **01-06** (real `openid-client` OIDC against Keycloak,
 * TOTP MFA enforced in the IdP, session short-cache in Redis). There is no
 * dev-login path and no MFA bypass flag — both were explicitly rejected in
 * CONTEXT, because the bypass becomes the daily-exercised path and the real
 * integration rots.
 *
 * Deliberately empty here: this plan (01-01) fixes the module boundary and
 * the composition root so that plan 01-06 can implement entirely inside this
 * directory without touching `app.module.ts`.
 */
@Module({})
export class IdentityModule {}
