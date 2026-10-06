import { Alert } from '@trussworks/react-uswds';

import { ApiError } from '../api/client';

/**
 * ============================================================================
 * ApiErrorAlert — the ONE display-safe rendering of a failed API call.
 * ============================================================================
 *
 * Every screen that makes an API call surfaces its failures through this one
 * component, so the rule from `FRD/Y2-errors.md` principle 4 — a message
 * "suitable for direct display to court staff (never a raw stack trace)" — is
 * enforced in a single place rather than re-decided per screen.
 *
 * What it renders, and deliberately what it does NOT:
 *
 *  - `message` — the human-readable, display-safe text from the FRD Y2 envelope.
 *    The API's global exception filter (plan 01-01) already strips stacks
 *    server-side, so this is safe to show verbatim.
 *  - `error_code` — shown as small supporting detail, because it is the string a
 *    user reads out on a support call ("I got CASE_DESIGNATION_DENIED"). It is
 *    stable and machine-readable; it is NOT a stack trace.
 *  - NEVER `detail`. `ApiError.detail` can carry structured context the Y2
 *    contract says must never reach court staff verbatim (threat T-01-66). It is
 *    available to code that branches on it, but it is never painted onto a page.
 *
 * A non-`ApiError` (an unexpected throw, a network failure before the response
 * interceptor ran) falls back to a generic, equally display-safe message — a
 * raw `Error.message` from deep in the stack is exactly what principle 4 forbids
 * showing.
 */
export function ApiErrorAlert({
  error,
  heading = 'Something went wrong',
}: {
  error: unknown;
  heading?: string;
}): JSX.Element {
  if (error instanceof ApiError) {
    return (
      <Alert type="error" headingLevel="h2" heading={heading} role="alert">
        <p className="margin-top-0">{error.message}</p>
        <p className="font-body-3xs text-base margin-bottom-0">
          Reference code: <code>{error.error_code}</code>
        </p>
      </Alert>
    );
  }

  // Not an ApiError: a network failure or an unexpected throw. Show a generic,
  // display-safe message — NEVER the raw Error.message, which can leak internals.
  return (
    <Alert type="error" headingLevel="h2" heading={heading} role="alert">
      <p className="margin-y-0">
        The request could not be completed. Please try again, and contact your court
        administrator if the problem persists.
      </p>
    </Alert>
  );
}
