import type { Request } from 'express';

import { ApiException } from '../../common/errors/api-error';
import {
  Principal,
  RequestWithPrincipal,
} from '../../common/principal/principal.types';

/**
 * The authenticated principal attached by `SessionAuthGuard`.
 *
 * Every case-context route is `@Resource()`-marked, so by the time a handler
 * runs both global guards have passed and `request.principal` is present.
 * Absent means a route lost its marking — the guard did not run — and throwing
 * a 401 beats a non-null assertion that would surface as a 500 reading
 * `Cannot read properties of undefined`. Mirrors the identity module's
 * `principalOf`.
 */
export function principalOf(request: Request): Principal {
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
