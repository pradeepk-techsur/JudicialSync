import { Body, Controller, Get, Post, HttpCode, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import { SelfScoped } from '../../common/decorators/self-scoped.decorator';
import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Principal,
  RequestWithPrincipal,
} from '../../common/principal/principal.types';
import { AuditService } from '../audit/audit.service';
import { recordStandaloneAudit } from '../audit/with-audit';

/** The `key_custodian` entitlement, seeded only on `security_officer`. */
const KEY_CUSTODIAN_ENTITLEMENT = 'key_custodian';

/** A key-rotation request body. */
const RotateKeySchema = z
  .object({
    rationale: z.string().min(1),
  })
  .strict();

/**
 * ============================================================================
 * KEY ACCESS — SEPARATION OF DUTIES, WITHOUT EVER TOUCHING KEY MATERIAL
 * ============================================================================
 *
 * `FRD/F13` Validation: "Encryption key rotation and access must be restricted
 * to the `security_officer` privileged role, separate from `system_admin`
 * routine administration (separation of duties)." `US-13.3` makes
 * `SECURITY_KEY_ACCESS_DENIED` (403) an acceptance criterion.
 *
 * ## What Phase 1 honestly implements
 *
 * CONTEXT places the key-access split under Claude's Discretion, and is clear
 * that actual KMS key rotation lives in the cloud KMS whose IaC is deferred.
 * So this implements the **access control and the audited request**, not a
 * fake rotation. The handler records an authorized rotation REQUEST and returns
 * `202`; it never handles key material. `TechArch/04-security.md` §7.5: "the
 * application never handles raw encryption keys" — do not "complete" this later
 * by reading a key into process memory. Production substitutes AWS KMS GovCloud
 * / Azure Key Vault Government behind this same authorization boundary.
 *
 * ## Why these routes are self-scoped with a controller-level entitlement check
 *
 * The specified code is `SECURITY_KEY_ACCESS_DENIED`, specific to this
 * resource type. On this branch the global `AbacGuard` maps a PDP entitlement
 * denial to the generic `AUTH_SCOPE_DENIED`, and there is no resource-type →
 * error-code table in the guard to override that — and the guard is plan
 * 01-07's file, which this plan must not edit (its verification greps it). The
 * resource-loader's own comment already notes that `encryption_key` is "a
 * capability, not an object … the `key_custodian` entitlement IS the whole
 * decision," so the authorization here is purely an entitlement membership
 * test with no resource attributes to weigh.
 *
 * So these routes are marked self-scoped — which still requires a valid,
 * MFA-satisfied session (`SessionAuthGuard` runs regardless) — and the
 * `key_custodian` check plus the `SECURITY_KEY_ACCESS_DENIED` denial and its
 * `access_attempt` audit event live here. A denial is audited exactly as the
 * ABAC guard audits one, so `system_admin`'s refused attempt is on the record.
 *
 * The entitlement is seeded only on `security_officer`, deliberately NOT on
 * `system_admin` (plan 01-04's GRANTS) — which is the separation of duties the
 * named test asserts.
 */
@Controller('security/keys')
export class KeyAccessController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post('rotate')
  @SelfScoped()
  @HttpCode(202)
  async rotate(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<{ status: string; note: string }> {
    const principal = this.principalOf(request);

    const parsed = RotateKeySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'A rationale is required to request a key rotation',
        { fields: parsed.error.issues.map((i) => i.path.join('.')) },
      );
    }

    await this.assertKeyCustodian(request, principal, 'rotate');

    // Record the authorized request. No key material is read, generated or
    // stored — this is an audited authorization event, not a cryptographic
    // operation. The cloud KMS performs the actual rotation out of band.
    await recordStandaloneAudit(this.prisma, this.audit, {
      actor_id: principal.user_id,
      action_type: 'config_change',
      object_type: 'encryption_key',
      // No key object exists in the application; the nil UUID marks "no object"
      // the same way the ABAC guard does for attribute-free resources.
      object_id: '00000000-0000-0000-0000-000000000000',
      after_state: {
        request: 'key_rotation_request',
        rationale: parsed.data.rationale,
        requested_by: principal.user_id,
      },
      session_id: principal.session_id,
    });

    return {
      status: 'recorded',
      note:
        'Key material is managed by the cloud KMS; this records an authorized ' +
        'rotation request.',
    };
  }

  @Get('status')
  @SelfScoped()
  async status(
    @Req() request: Request,
  ): Promise<{
    at_rest: { object_store: string; database: string };
    in_transit: string;
    note: string;
  }> {
    const principal = this.principalOf(request);
    await this.assertKeyCustodian(request, principal, 'read');

    // A factual statement of the Phase 1 posture, for UAT and the security
    // reviewer. Production substitutes AWS KMS GovCloud / Azure Key Vault
    // Government for the at-rest providers.
    return {
      at_rest: {
        object_store: 'SSE-S3',
        database: 'volume-encryption',
      },
      in_transit: 'TLS 1.2+ terminated at the reverse proxy',
      note:
        'Phase 1 posture. Production substitutes AWS KMS GovCloud / Azure Key ' +
        'Vault Government for at-rest key management.',
    };
  }

  /**
   * Refuse a caller lacking `key_custodian`, with the specific
   * `SECURITY_KEY_ACCESS_DENIED` code and an audited `access_attempt`.
   *
   * This is the separation-of-duties boundary: `system_admin` performs routine
   * administration and does NOT hold this entitlement, so it is refused here
   * exactly as any unprivileged caller is.
   */
  private async assertKeyCustodian(
    request: Request,
    principal: Principal,
    action: 'rotate' | 'read',
  ): Promise<void> {
    if (principal.entitlements.includes(KEY_CUSTODIAN_ENTITLEMENT)) {
      return;
    }

    // Audit the refused attempt — the same `access_attempt` event the ABAC
    // guard writes on a denial. Swallow a write failure (logged inside
    // recordStandaloneAudit's transaction path) rather than converting a 403
    // into a 500: the denial stands regardless.
    try {
      await recordStandaloneAudit(this.prisma, this.audit, {
        actor_id: principal.user_id,
        action_type: 'access_attempt',
        object_type: 'encryption_key',
        object_id: '00000000-0000-0000-0000-000000000000',
        after_state: {
          outcome: 'denied',
          reason_code: 'SECURITY_KEY_ACCESS_DENIED',
          action,
          route: `/api/v1/security/keys/${action === 'rotate' ? 'rotate' : 'status'}`,
          method: action === 'rotate' ? 'POST' : 'GET',
        },
        client_ip: request.ip ?? null,
        session_id: principal.session_id,
      });
    } catch {
      /* the denial is returned regardless — see the method comment */
    }

    throw new ApiException(
      403,
      'SECURITY_KEY_ACCESS_DENIED',
      'Key management requires security officer privileges',
    );
  }

  private principalOf(request: Request): Principal {
    const principal = (request as Request & RequestWithPrincipal).principal;
    if (principal === undefined) {
      throw new ApiException(
        401,
        'AUTH_SESSION_EXPIRED',
        'Session expired; please sign in again',
      );
    }
    return principal;
  }
}
