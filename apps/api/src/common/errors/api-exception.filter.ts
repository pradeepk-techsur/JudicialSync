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
      return {
        status,
        body: {
          error_code: this.genericCodeFor(status),
          message: this.genericMessageFor(status),
        },
      };
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
      body: {
        error_code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
      },
    };
  }

  /**
   * Stable, non-leaking codes for framework-originated failures. These follow
   * the Y2 `{DOMAIN}_{CONDITION}` convention with a neutral domain, since the
   * owning feature area is unknown at this layer.
   */
  private genericCodeFor(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'REQUEST_INVALID';
      case HttpStatus.UNAUTHORIZED:
        return 'AUTH_SESSION_EXPIRED';
      case HttpStatus.FORBIDDEN:
        return 'AUTH_ACCESS_DENIED';
      case HttpStatus.NOT_FOUND:
        return 'RESOURCE_NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'RESOURCE_INVALID_TRANSITION';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'REQUEST_VALIDATION_FAILED';
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return 'REQUEST_PAYLOAD_TOO_LARGE';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'REQUEST_RATE_LIMITED';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      default:
        return 'INTERNAL_ERROR';
    }
  }

  private genericMessageFor(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'The request could not be understood';
      case HttpStatus.UNAUTHORIZED:
        return 'Session expired; please sign in again';
      case HttpStatus.FORBIDDEN:
        return 'You are not authorized to perform this action';
      case HttpStatus.NOT_FOUND:
        return 'Resource not found or not accessible';
      case HttpStatus.CONFLICT:
        return 'This action cannot be performed from the current state';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'The request failed validation';
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return 'The submitted content is too large';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Too many requests; please retry shortly';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'The service is temporarily unavailable';
      default:
        return 'An internal error occurred';
    }
  }
}
