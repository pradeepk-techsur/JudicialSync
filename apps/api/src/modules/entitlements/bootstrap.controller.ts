import { Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { SelfScoped } from '../../common/decorators/self-scoped.decorator';
import { ApiException } from '../../common/errors/api-error';
import {
  Principal,
  RequestWithPrincipal,
} from '../../common/principal/principal.types';
import { Resource } from '../policy/resource-descriptor.decorator';
import { BootstrapService } from './bootstrap.service';

/**
 * `/api/v1/bootstrap/*` — the explicit completion step and the status read.
 *
 * | route                   | marking                                          | why |
 * |-------------------------|--------------------------------------------------|-----|
 * | `POST /bootstrap/complete` | `@Resource access_grant_request / approve`    | closing the bootstrap is a privileged act on the access-grant surface; the PDP gates it on `access_admin`, and `BootstrapService` adds the "not bootstrap-granted" exclusion the policy cannot see |
 * | `GET  /bootstrap/status`   | `@SelfScoped()`                               | reports only whether the system is still in bootstrap mode — no target resource, just a mode flag the operator and UI need |
 *
 * The `complete` route is deliberately NOT self-scoped: it has a real
 * authorization story (only a normally-granted `access_admin` may close the
 * path), so it goes through the PDP like every other privileged route.
 */
@Controller('bootstrap')
export class BootstrapController {
  constructor(private readonly bootstrap: BootstrapService) {}

  @Post('complete')
  @Resource({ type: 'access_grant_request', action: 'approve' })
  @HttpCode(200)
  async complete(
    @Req() request: Request,
  ): Promise<{ completed: true; completed_at: string }> {
    const principal = principalOf(request);
    const { completed_at } = await this.bootstrap.complete(principal.user_id);
    return { completed: true, completed_at };
  }

  @Get('status')
  @SelfScoped()
  async status(): Promise<{ completed: boolean; completed_at: string | null }> {
    return this.bootstrap.status();
  }
}

/**
 * The principal attached by `SessionAuthGuard`. Absent means the guard did not
 * run — a 401 beats a 500 reading `Cannot read properties of undefined`.
 */
function principalOf(request: Request): Principal {
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
