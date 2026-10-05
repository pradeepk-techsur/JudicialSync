import { HttpException } from '@nestjs/common';

/**
 * The FRD Y2 shared error envelope, returned by EVERY endpoint on failure.
 *
 * Source: `project_specs/TechArch/03a-api-shared.md` §6.6 and
 * `project_specs/FRD/Y2-errors.md` ("All error responses return a JSON body:
 * `{error_code, message, detail?}`").
 *
 * The two fields are deliberately distinct in audience:
 *   - `error_code` is STABLE and machine-readable; clients branch on it.
 *   - `message`   is human-readable and DISPLAY-SAFE — it is shown directly to
 *                 court staff and must never be a raw stack trace or an
 *                 internal exception string (Y2 principle 4).
 */
export interface ApiErrorBody {
  /** Stable machine-readable code, e.g. "AUTH_SCOPE_DENIED", "SECURITY_POLICY_UNAVAILABLE". */
  error_code: string;
  /** Human-readable, display-safe message — never a raw stack trace. */
  message: string;
  /** Optional structured context. Must never carry internal exception detail. */
  detail?: Record<string, unknown>;
}

/**
 * The single exception type every JudicialSync handler, guard and service
 * throws when it needs to produce a deliberate, specified error response.
 *
 * Throwing `ApiException` guarantees the response body is a well-formed
 * {@link ApiErrorBody}. Anything else that escapes a handler is caught by
 * `ApiExceptionFilter` and deliberately flattened to a generic
 * `INTERNAL_ERROR`, because an unplanned exception's message is by definition
 * not known to be display-safe.
 *
 * @example
 *   throw new ApiException(403, 'AUTH_SOD_VIOLATION', 'Cannot approve your own request');
 */
export class ApiException extends HttpException {
  constructor(
    status: number,
    public readonly errorCode: string,
    message: string,
    public readonly detail?: Record<string, unknown>,
  ) {
    const body: ApiErrorBody = { error_code: errorCode, message };
    if (detail !== undefined) {
      body.detail = detail;
    }
    super(body, status);
  }

  /** The response body in canonical {@link ApiErrorBody} form. */
  toBody(): ApiErrorBody {
    return this.getResponse() as ApiErrorBody;
  }
}
