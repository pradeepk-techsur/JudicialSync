import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { ApiErrorBody, ApiException } from './api-error';

/**
 * Safe, stable responses for framework-originated failures — the ones Nest
 * raises before or around a handler (a malformed body, an unmatched route, a
 * payload over the limit), where no feature module authored an
 * {@link ApiException} of its own.
 *
 * Codes follow the Y2 `{DOMAIN}_{CONDITION}` convention with a neutral domain,
 * because the owning feature area is genuinely unknown at this layer. The
 * messages are deliberately generic: the framework's own text can embed
 * validation internals, class names and property paths, and this map exists
 * precisely so none of that reaches a client.
 */
const GENERIC_RESPONSES: Readonly<Record<number, ApiErrorBody>> = {
  [HttpStatus.BAD_REQUEST]: {
    error_code: 'REQUEST_INVALID',
    message: 'The request could not be understood',
  },
  [HttpStatus.UNAUTHORIZED]: {
    error_code: 'AUTH_SESSION_EXPIRED',
    message: 'Session expired; please sign in again',
  },
  [HttpStatus.FORBIDDEN]: {
    error_code: 'AUTH_ACCESS_DENIED',
    message: 'You are not authorized to perform this action',
  },
  [HttpStatus.NOT_FOUND]: {
    error_code: 'RESOURCE_NOT_FOUND',
    message: 'Resource not found or not accessible',
  },
  [HttpStatus.CONFLICT]: {
    error_code: 'RESOURCE_INVALID_TRANSITION',
    message: 'This action cannot be performed from the current state',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    error_code: 'REQUEST_VALIDATION_FAILED',
    message: 'The request failed validation',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    error_code: 'REQUEST_PAYLOAD_TOO_LARGE',
    message: 'The submitted content is too large',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    error_code: 'REQUEST_RATE_LIMITED',
    message: 'Too many requests; please retry shortly',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    error_code: 'SERVICE_UNAVAILABLE',
    message: 'The service is temporarily unavailable',
  },
};

/** Used for any status not in the map, and for every unanticipated throw. */
const FALLBACK_RESPONSE: ApiErrorBody = {
  error_code: 'INTERNAL_ERROR',
  message: 'An internal error occurred',
};

/**
 * The global exception filter. Registered in `main.ts` via
 * `app.useGlobalFilters(new ApiExceptionFilter())`, it is the last thing
 * between a thrown error and the client, and it has exactly one job:
 *
 *   **Every failure response leaves as a well-formed {@link ApiErrorBody},
 *   and no internal detail ever crosses the trust boundary.**
 *
 * This implements FRD/Y2-errors.md principle 4 — a `message` must be
 * "suitable for direct display to court staff (never a raw stack trace or
 * internal exception string)" — and mitigates threat T-01-02
 * (information disclosure via the error channel).
 *
 * Mapping:
 *   - {@link ApiException}        → its own `error_code` / `message` / `detail`,
 *                                   verbatim. These are deliberately authored
 *                                   and therefore known display-safe.
 *   - other `HttpException`       → the framework's status, with a derived
 *                                   generic code. The framework's own message
 *                                   text is NOT forwarded, because it can
 *                                   contain validation internals.
 *   - anything else               → 500 `INTERNAL_ERROR`, fixed message.
 *
 * In all non-`ApiException` cases the real error is logged server-side with
 * its stack so nothing is lost to operators — only to the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.resolve(exception, request);

    response.status(status).json(body);
  }

  private resolve(
    exception: unknown,
    request: Request,
  ): { status: number; body: ApiErrorBody } {
    // 1. Deliberate, specified application errors pass through unchanged.
    if (exception instanceof ApiException) {
      return { status: exception.getStatus(), body: exception.toBody() };
    }

    // 2. Framework HttpExceptions keep their status but NOT their message:
    //    Nest's default bodies can embed validation internals and class names.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      this.logger.warn(
        `${request.method} ${request.url} → ${status} ${exception.name}: ${exception.message}`,
      );
      const generic = GENERIC_RESPONSES[status] ?? FALLBACK_RESPONSE;
      return { status, body: { ...generic } };
    }

    // 3. Anything else is an unanticipated defect. Log it fully server-side;
    //    tell the client nothing beyond "something broke on our side".
    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url}: ${err.message}`,
      err.stack,
    );

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { ...FALLBACK_RESPONSE },
    };
  }
}
