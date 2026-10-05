import { Controller, Get, Module, Param } from '@nestjs/common';

import { SelfScoped } from '../src/common/decorators/self-scoped.decorator';
import { Resource } from '../src/modules/policy/resource-descriptor.decorator';

/**
 * ============================================================================
 * THE PROBE ROUTES THE ABAC SUITES EXERCISE
 * ============================================================================
 *
 * Plans 01-08 through 01-12 add the real protected endpoints. None exists
 * yet, and `AbacGuard` ships in this plan — so these suites would otherwise
 * have nothing to point at and the guard would land unexercised over HTTP.
 *
 * ## Why these live in test code rather than in the application
 *
 * `undeclared()` below carries **no** `@Resource()` descriptor. That is the
 * forgot-the-decorator case (threat T-01-26), and it is the one case that
 * cannot be written in application code: a real route missing its descriptor
 * IS the bug the guard exists to catch, so shipping one to prove the guard
 * works would be shipping the vulnerability to test the mitigation.
 *
 * Keeping the whole set here also means these routes are not reachable in any
 * deployment. They are compiled only by the Jest transform and registered
 * only by a test module.
 *
 * The handlers return `{reached: true}` and nothing else. The subject under
 * test is whether control arrives at all — every assertion about *what* a
 * handler should return belongs to the plan that writes the real one.
 */

/** Seeded court ids, from `prisma/seed/ids.ts`. */
export const COURT_IDS = {
  NDCA: '0a000001-0000-4000-8000-000000000001',
  SDNY: '0a000001-0000-4000-8000-000000000002',
} as const;

/** Seeded case ids, from `prisma/seed/ids.ts`. */
export const CASE_IDS = {
  /** NDCA / San Francisco, no designation. */
  plain: '0a000005-0000-4000-8000-000000000001',
  /** NDCA / San Francisco, SEALED. */
  sealed: '0a000005-0000-4000-8000-000000000002',
  /** NDCA / Oakland, RESTRICTED. */
  restricted: '0a000005-0000-4000-8000-000000000003',
  /** SDNY / Manhattan — the cross-court isolation fixture. */
  otherCourt: '0a000005-0000-4000-8000-000000000004',
} as const;

@Controller('abac-probe')
export class AbacProbeController {
  /** The ordinary protected read: declared type, declared action, id param. */
  @Resource({ type: 'case', action: 'read', idParam: 'id' })
  @Get('cases/:id')
  readCase(@Param('id') id: string): { reached: true; id: string } {
    return { reached: true, id };
  }

  /** An audit read — a different entitlement (`audit_reader`) entirely. */
  @Resource({ type: 'audit_event', action: 'read', idParam: 'id' })
  @Get('audit-events/:id')
  readAuditEvent(@Param('id') id: string): { reached: true; id: string } {
    return { reached: true, id };
  }

  /**
   * **Deliberately undeclared.** No `@Public()`, no `@SelfScoped()`, no
   * `@Resource()`. Must be refused `503 SECURITY_POLICY_UNAVAILABLE`.
   *
   * If this route ever returns 200, deny-by-default has been lost and every
   * route a later plan forgets to annotate is silently open.
   */
  @Get('undeclared')
  undeclared(): { reached: true } {
    return { reached: true };
  }

  /** Session required, no target resource — the `/auth/entitlements` shape. */
  @SelfScoped()
  @Get('self-scoped')
  selfScoped(): { reached: true } {
    return { reached: true };
  }
}

@Module({ controllers: [AbacProbeController] })
export class AbacProbeModule {}
