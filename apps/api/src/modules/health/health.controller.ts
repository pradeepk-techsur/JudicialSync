import { Controller, Get } from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator';

/** Shape of the liveness response. */
export interface HealthResponse {
  status: 'ok';
  service: 'platform-core';
}

/**
 * Liveness/readiness probe for the Platform Core service.
 *
 * `@Public()` is legitimate here: `FRD/Y1a-api-shared.md` requires a session
 * on every endpoint "except where noted as part of the authentication flow
 * itself", and a health probe is by definition called by infrastructure that
 * holds no session.
 *
 * This endpoint MUST work with **no database**. It is reachable from the very
 * first commit of Phase 1, which predates the schema (plan 01-03). A later
 * plan may add a separate, deeper readiness probe that does check dependencies
 * — but this liveness route stays dependency-free, because a probe that fails
 * when the database is down cannot distinguish "the process is wedged" from
 * "a downstream is degraded", and the orchestrator responds very differently
 * to those two.
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): HealthResponse {
    return { status: 'ok', service: 'platform-core' };
  }
}
