import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { ApiException } from '../../common/errors/api-error';

/** The denial, per docs/SCHEMA-NOTES.md §7's error-code addendum. */
const DENIED_CODE = 'AUDIT_WRITE_DENIED';
const DENIED_MESSAGE = 'This endpoint is not callable by end-user clients';

export const SERVICE_TOKEN_HEADER = 'x-service-token';
export const SERVICE_ACTOR_HEADER = 'x-service-actor-id';

/**
 * ============================================================================
 * THE SERVICE-TO-SERVICE BOUNDARY FOR `POST /api/v1/audit/events`
 * ============================================================================
 *
 * `FRD/Y1a-api-shared.md` §Audit marks the route "(internal service-to-service
 * only) … Not user-invokable," and `US-2.3` makes it an acceptance criterion:
 * "The audit write API (`/audit/events`) is service-to-service only and never
 * directly callable by end-user clients."
 *
 * The stakes are unusual for an authorization guard. Most guards protect data
 * from being read or changed; this one protects **the permanent record of what
 * happened** from being written to by someone who should not be writing it. A
 * forged audit entry is worse than a missing one — it reads as evidence, and
 * it is evidence an appellate court may rely on. So this guard denies on every
 * ambiguity rather than resolving any of them generously.
 *
 * Three independent conditions, each of which alone denies:
 *
 * 1. **The secret must be configured.** An unset `INTERNAL_SERVICE_TOKEN`
 *    denies every request. The tempting alternative — treat "no secret" as
 *    "no check" — turns a deployment mistake (an env var missing from a
 *    Compose file, a secret that failed to mount) into a world-writable audit
 *    log, which is the single worst failure this system can have and is
 *    indistinguishable from working correctly until someone reads the log.
 *    `FRD/Y2-errors.md` principle 1 is "fail closed, not open," and this is
 *    the case it was written for.
 *
 * 2. **The token must match, compared in constant time.** See below.
 *
 * 3. **No end-user session may ride along.** A request carrying BOTH a valid
 *    service token and an `Authorization` header is refused outright, even
 *    though the service token alone would have been sufficient. The point is
 *    to make a confused-deputy path impossible: a browser-reachable proxy or
 *    a middleware that forwards client headers while adding its own service
 *    credential would otherwise let an end user's request arrive here wearing
 *    trusted clothes. Refusing the combination means a user token can never be
 *    laundered into a service call, regardless of what sits in front of this
 *    API. (Threat T-01-16.)
 *
 * ## Why the comparison is constant-time, and why it hashes first
 *
 * `===` on a secret leaks its length and its matching prefix through timing —
 * string comparison returns at the first differing byte, so an attacker who
 * can measure response times can recover the token byte by byte rather than
 * guessing it whole. (Threat T-01-17.)
 *
 * `timingSafeEqual` fixes that but throws on length-mismatched buffers, and
 * catching that throw would reintroduce the length leak through a different
 * channel. So both sides are SHA-256'd first: digests are always 32 bytes, the
 * comparison is always performed over the same width, and neither the token's
 * length nor its content is observable in the timing.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly logger = new Logger(ServiceTokenGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const expected = process.env.INTERNAL_SERVICE_TOKEN;

    // 1. Fail closed on an unconfigured secret.
    if (expected === undefined || expected === '') {
      this.logger.error(
        'INTERNAL_SERVICE_TOKEN is not configured; denying every call to ' +
          'POST /audit/events. Set it from the secrets manager — an unset ' +
          'secret must never mean "allow anyone".',
      );
      throw new ApiException(403, DENIED_CODE, DENIED_MESSAGE);
    }

    // 2. An end-user session must never reach this route, even alongside a
    //    valid service token.
    if (request.headers.authorization !== undefined) {
      this.logger.warn(
        'Rejected a call to POST /audit/events carrying an Authorization ' +
          'header. This route is service-to-service only; a request bearing ' +
          'an end-user credential is refused even with a valid service token.',
      );
      throw new ApiException(403, DENIED_CODE, DENIED_MESSAGE);
    }

    // 3. The token itself.
    const presented = request.headers[SERVICE_TOKEN_HEADER];
    if (typeof presented !== 'string' || !constantTimeEquals(presented, expected)) {
      throw new ApiException(403, DENIED_CODE, DENIED_MESSAGE);
    }

    return true;
  }
}

/**
 * Compare two secrets without leaking their length or content through timing.
 * Both are hashed to a fixed 32 bytes first so `timingSafeEqual` never sees
 * mismatched widths and never has to throw.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}
