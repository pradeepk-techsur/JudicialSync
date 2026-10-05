import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../../common/decorators/public.decorator';
import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from './audit.service';
import { AUDIT_ACTION_TYPES, AuditWriteInput } from './audit.types';
import { SERVICE_ACTOR_HEADER, ServiceTokenGuard } from './service-token.guard';
import { recordStandaloneAudit } from './with-audit';

/**
 * The request body: {@link AuditWriteInput} **minus `actor_id`**.
 *
 * `.strict()` is doing real work here, not tidying. It makes any unrecognised
 * key a validation failure, which is what turns the `actor_id` rejection below
 * into a guarantee rather than a single check someone could later bypass by
 * renaming a field.
 */
const AuditWriteBodySchema = z
  .object({
    action_type: z.enum(AUDIT_ACTION_TYPES),
    object_type: z.string().min(1).max(128),
    object_id: z.string().uuid(),
    before_state: z.record(z.unknown()).nullable().optional(),
    after_state: z.record(z.unknown()).nullable().optional(),
    rule_version_ref: z.string().uuid().nullable().optional(),
    calculation_version_ref: z.string().uuid().nullable().optional(),
    client_ip: z.string().max(64).nullable().optional(),
    session_id: z.string().uuid().nullable().optional(),
  })
  .strict();

/**
 * ============================================================================
 * `POST /api/v1/audit/events` — the ONE HTTP way into the audit log
 * ============================================================================
 *
 * `FRD/Y1a-api-shared.md` §Audit: "(internal service-to-service only) … Not
 * user-invokable." In-process callers should use `withAudit` directly;
 * this route exists for a separate service that cannot share the transaction —
 * and because it is the only network-reachable write path, it is the one place
 * where attribution could be forged.
 *
 * ## `actor_id` is not accepted. At all.
 *
 * `FRD/F02` Inputs: "`actor_id` (UUID, required, system-supplied from session
 * — never client-supplied)." So the body schema above does not merely *ignore*
 * an `actor_id` key, it **rejects the whole request with 422** if one is
 * present (`.strict()`, plus the explicit check below for a clearer message).
 *
 * Ignoring it would be the more forgiving design and the wrong one. A caller
 * that sent `actor_id` believed it was setting the actor; silently recording a
 * different one produces an audit entry that is confidently, invisibly wrong
 * about who acted. Better to refuse and say why. The actor instead comes from
 * the `x-service-actor-id` header, validated as a UUID that exists in `users`.
 * (Threat T-01-15.)
 *
 * ## Why `@Public()` here is not a hole
 *
 * `@Public()` exempts this route from `SessionAuthGuard` and `AbacGuard`,
 * which normally would be alarming — those are the global deny-by-default
 * guards and this comment exists so a reviewer does not have to guess.
 *
 * The reasoning: there is no end-user session on this route *by design*, so
 * `SessionAuthGuard` could only ever deny it, and `AbacGuard` has no principal
 * and no resource scope to evaluate. The route is not thereby unguarded — it
 * is guarded by {@link ServiceTokenGuard}, which is **strictly narrower** than
 * the session chain it replaces: the session guards admit any authenticated
 * user, while this one admits only a caller holding the deployment's internal
 * service secret and carrying no user credential at all.
 *
 * Net effect: swapping the global chain for this guard makes the route *less*
 * reachable, not more. If `ServiceTokenGuard` were ever removed from the
 * decorator below, `@Public()` would have to go with it in the same change.
 */
@Controller()
@UseGuards(ServiceTokenGuard)
export class AuditInternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post('audit/events')
  @Public() // Guarded by ServiceTokenGuard instead — see the class comment.
  @HttpCode(201)
  async write(
    @Body() body: unknown,
    @Headers(SERVICE_ACTOR_HEADER) actorIdHeader: string | undefined,
  ): Promise<{ id: string; row_hash: string; occurred_at: string }> {
    // Checked before schema validation so the error names the real problem.
    // `.strict()` would already reject it, but as a generic unknown-key
    // failure — and "you may not set actor_id" is worth saying out loud.
    if (
      typeof body === 'object' &&
      body !== null &&
      'actor_id' in (body as Record<string, unknown>)
    ) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'actor_id may not be supplied in the request body; it is taken from ' +
          'the x-service-actor-id header',
      );
    }

    const parsed = AuditWriteBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'The request failed validation',
        // Field paths only. Zod messages can echo submitted values, and this
        // body may carry case content (FRD/Y2-errors.md principle 4).
        { fields: parsed.error.issues.map((i) => i.path.join('.')) },
      );
    }

    const actorId = z.string().uuid().safeParse(actorIdHeader);
    if (!actorId.success) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        `${SERVICE_ACTOR_HEADER} must be a UUID identifying the acting user`,
      );
    }

    // The actor must be a real user. The FK on `audit_events.actor_id` would
    // catch a fabricated one anyway, but only as a 500 AUDIT_WRITE_FAILED —
    // an integrity-flavoured error for what is a plain bad request. Checking
    // here returns 422 and keeps AUDIT_WRITE_FAILED meaning what FRD/F02 says
    // it means.
    const actor = await this.prisma.users.findUnique({
      where: { id: actorId.data },
      select: { id: true },
    });
    if (actor === null) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        `${SERVICE_ACTOR_HEADER} does not identify a known user`,
      );
    }

    const input: AuditWriteInput = { ...parsed.data, actor_id: actorId.data };

    // The calling service already did its domain work in its own database, so
    // there is nothing to pair this write with here — `recordStandaloneAudit`
    // is the named path for that case. It still runs in a transaction (the
    // chain head must be locked while the hash is computed) and still
    // translates a failure into the specified AUDIT_WRITE_FAILED, so this
    // route shares the single code path into the audit table rather than
    // opening a second one.
    const [written] = await recordStandaloneAudit(this.prisma, this.audit, input);

    return {
      id: written.id,
      row_hash: written.row_hash,
      occurred_at: written.occurred_at.toISOString(),
    };
  }
}
