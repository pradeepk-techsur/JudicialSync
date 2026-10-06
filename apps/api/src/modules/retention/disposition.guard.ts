import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Principal } from '../../common/principal/principal.types';
import { SERVICE_TOKEN_HEADER } from '../audit/service-token.guard';

/** The confirmation object a disposition request must carry. */
export interface DispositionConfirmation {
  confirmed_by?: unknown;
  rationale?: unknown;
}

/** The minimum length `FRD/Y2-errors.md`'s rationale convention requires. */
const MIN_RATIONALE_LENGTH = 10;

/**
 * ============================================================================
 * THE DANGEROUS-CAPABILITY GUARD — automated deletion is impossible by design
 * ============================================================================
 *
 * `FRD/F13` Validation: "Retention schedule disposition actions require human
 * confirmation via a task (F06); **no automated hard-delete of any record
 * category is permitted** without this gate." `FRD/Y2-errors.md` lists
 * `SECURITY_DISPOSITION_UNCONFIRMED` as a `403` **internal guard**.
 *
 * This guard is not a NestJS `CanActivate`. It is a service the disposition
 * handler calls explicitly as its first act, deliberately: the authorization
 * question ("may this principal confirm dispositions at all?") is already
 * answered by the PDP through the `@Resource({type:'disposition'})` descriptor,
 * and this is the SEPARATE, narrower question — "is this specific request a
 * genuine human confirmation?" Neither subsumes the other, and the dangerous
 * capability needs both: a principal who holds `disposition_confirm` but
 * submits an unconfirmed, misattributed, or batch-issued request must still be
 * refused.
 *
 * ## Why "the confirmer must BE the caller" and not merely "a confirmer exists"
 *
 * A confirmation naming someone else is not a confirmation — it is one person
 * asserting that another person confirmed, which is exactly the attribution a
 * disposition record must not be able to forge. So `confirmed_by` must resolve
 * to an active user AND equal the authenticated principal.
 *
 * ## Why a batch identity can never pass this
 *
 * The internal service token is how background jobs authenticate
 * service-to-service calls. If a batch identity could dispose of a record, the
 * "no automated hard-delete" guarantee would be one cron job away from false.
 * The same reasoning `TechArch/04-security.md` §7.4 applies to calculation
 * overrides ("No batch/cron identity has INSERT privilege with
 * triggering_reason = 'override'") applies here: a request carrying
 * `x-service-token`, or lacking a human `request.principal`, is refused before
 * any of the confirmation fields are even considered.
 */
@Injectable()
export class DispositionGuard {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Refuse unless the request is a genuine, self-named, reasoned human
   * confirmation.
   *
   * @throws {ApiException} 403 `SECURITY_DISPOSITION_UNCONFIRMED` on any
   *   failure. The message never varies with the specific cause — a caller
   *   learning precisely which clause they failed gains nothing legitimate and
   *   a probing one gains a checklist.
   */
  async assertHumanConfirmed(
    request: Request,
    principal: Principal | undefined,
    confirmation: DispositionConfirmation | undefined,
  ): Promise<void> {
    // 1. A human session, not the internal service identity. Checked first:
    //    a batch identity must never reach the confirmation fields at all.
    if (request.headers[SERVICE_TOKEN_HEADER] !== undefined) {
      throw this.unconfirmed();
    }
    if (principal === undefined) {
      throw this.unconfirmed();
    }

    // 2. A confirmation object with the two required fields.
    if (confirmation === undefined || confirmation === null) {
      throw this.unconfirmed();
    }

    const confirmedBy = confirmation.confirmed_by;
    const rationale = confirmation.rationale;

    if (typeof confirmedBy !== 'string' || confirmedBy.trim() === '') {
      throw this.unconfirmed();
    }
    if (
      typeof rationale !== 'string' ||
      rationale.trim().length < MIN_RATIONALE_LENGTH
    ) {
      throw this.unconfirmed();
    }

    // 3. The confirmer must BE the caller — not merely a valid user.
    if (confirmedBy !== principal.user_id) {
      throw this.unconfirmed();
    }

    // 4. ...and must resolve to an ACTIVE user. A disabled or deleted account
    //    cannot confirm, even if the id matches the session (a session
    //    outliving an account's deactivation).
    const user = await this.prisma.users.findUnique({
      where: { id: confirmedBy },
      select: { id: true, status: true },
    });
    if (user === null || user.status !== 'active') {
      throw this.unconfirmed();
    }
  }

  private unconfirmed(): ApiException {
    return new ApiException(
      403,
      'SECURITY_DISPOSITION_UNCONFIRMED',
      'Disposition requires human confirmation',
    );
  }
}
