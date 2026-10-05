import { Controller, ExecutionContext, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { Public } from '../src/common/decorators/public.decorator';
import { SelfScoped } from '../src/common/decorators/self-scoped.decorator';
import { ApiException } from '../src/common/errors/api-error';
import { ApiExceptionFilter } from '../src/common/errors/api-exception.filter';
import { AbacGuard } from '../src/common/guards/abac.guard';
import { SessionAuthGuard } from '../src/common/guards/session-auth.guard';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { SessionService } from '../src/modules/identity/session.service';
import { PdpClient } from '../src/modules/policy/pdp.client';
import { ResourceLoaderService } from '../src/modules/policy/resource-loader.service';

/**
 * **Proof that deny-by-default holds.**
 *
 * The Phase 1 CONTEXT rejected per-route opt-in guards because "a route that
 * forgets the decorator is silently open, which is precisely the failure mode
 * F00 forbids." This file is the evidence for that claim, and it is written
 * to fail loudly if a future change makes either guard permissive.
 *
 * The throwaway controller below is the point: it is an *unaudited* route of
 * the kind a later plan might add. Nobody wired it into the application, it
 * carries no security review, and it must still be denied.
 *
 * Mitigates threats T-01-01 (elevation of privilege via a forgotten
 * decorator) and T-01-02 (information disclosure through the error channel).
 */
@Controller('guard-probe')
class GuardProbeController {
  /** Exempt from the session requirement entirely — the `/health` case. */
  @Public()
  @Get('public')
  publicRoute(): { reached: true } {
    return { reached: true };
  }

  /**
   * Session required, resource ABAC skipped — the `/auth/entitlements` case.
   * Still denied in this plan, because `SessionAuthGuard` is itself a
   * deny-by-default stub until plan 01-06.
   */
  @SelfScoped()
  @Get('self-scoped')
  selfScopedRoute(): { reached: true } {
    return { reached: true };
  }

  /**
   * Carries no marking at all. This is the route that must never return 200.
   */
  @Get('unmarked')
  unmarkedRoute(): { reached: true } {
    return { reached: true };
  }
}

describe('Global guards fail closed (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [GuardProbeController],
      providers: [
        // `SessionAuthGuard` gained a `SessionService` dependency in plan
        // 01-06, when its deny-all stub became real session validation.
        //
        // The stand-in below rejects every token, which is exactly what this
        // suite needs: the subject here is the GUARD CHAIN's shape — public
        // allowed, everything else denied, denial bodies leaking nothing —
        // not the validation logic, which `auth-session.e2e-spec.ts` drives
        // against a real database and a real Keycloak.
        //
        // Deliberately a rejecting double rather than a permissive one. A
        // double that returned a principal would make every assertion below
        // pass for the wrong reason, and this file's entire purpose is to
        // fail loudly if the chain ever stops denying.
        {
          provide: SessionService,
          useValue: {
            validate: (): Promise<never> =>
              Promise.reject(
                new ApiException(
                  401,
                  'AUTH_SESSION_EXPIRED',
                  'Session expired; please sign in again',
                ),
              ),
          },
        },
        // `AbacGuard` gained its real collaborators in plan 01-07. They are
        // provided as THROWING doubles, for the same reason the
        // `SessionService` double above rejects: every path this suite
        // exercises is decided before the guard reaches any of them.
        //
        // `SessionAuthGuard` denies first on every non-public route here, and
        // a public route returns from `AbacGuard` immediately. So if any of
        // these is ever called, the chain has started doing something this
        // suite does not expect, and the right outcome is a loud failure —
        // not a stub quietly answering "allow".
        {
          provide: PdpClient,
          useValue: {
            evaluate: (): never => {
              throw new Error(
                'PdpClient.evaluate must not be reached: every route in this ' +
                  'suite is denied before policy evaluation.',
              );
            },
          },
        },
        {
          provide: ResourceLoaderService,
          useValue: {
            load: (): never => {
              throw new Error(
                'ResourceLoaderService.load must not be reached in this suite.',
              );
            },
            effectiveSecurityConfig: (): never => {
              throw new Error(
                'ResourceLoaderService.effectiveSecurityConfig must not be ' +
                  'reached in this suite.',
              );
            },
          },
        },
        { provide: PrismaService, useValue: {} },
        { provide: AuditService, useValue: {} },
        // Registered exactly as app.module.ts registers them, in the same
        // order, so this test exercises the real chain rather than a
        // convenient approximation of it.
        { provide: APP_GUARD, useClass: SessionAuthGuard },
        { provide: APP_GUARD, useClass: AbacGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('@Public() routes', () => {
    it('reaches the handler', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/guard-probe/public',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ reached: true });
    });
  });

  describe('unmarked routes', () => {
    it('is denied 401 AUTH_SESSION_EXPIRED before the handler runs', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/guard-probe/unmarked',
      );

      // SessionAuthGuard denies first: no session, so authorization is never
      // even reached. The handler's `{reached: true}` must not appear.
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error_code: 'AUTH_SESSION_EXPIRED',
        message: 'Session expired; please sign in again',
      });
      expect(response.body).not.toHaveProperty('reached');
    });

    it('can never return 200', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/guard-probe/unmarked',
      );

      expect(response.status).not.toBe(200);
    });
  });

  describe('@SelfScoped() routes', () => {
    it('still requires a session (SelfScoped exempts ABAC, not authentication)', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/guard-probe/self-scoped',
      );

      // If this ever returns 200, @SelfScoped() has become an authentication
      // bypass — which is exactly what its doc comment forbids.
      expect(response.status).toBe(401);
      expect(response.body.error_code).toBe('AUTH_SESSION_EXPIRED');
    });
  });

  describe('denial bodies leak nothing (FRD Y2 principle 4)', () => {
    const paths = [
      '/api/v1/guard-probe/unmarked',
      '/api/v1/guard-probe/self-scoped',
    ];

    it.each(paths)('%s carries no stack trace or exception text', async (path) => {
      const response = await request(app.getHttpServer()).get(path);
      const serialized = JSON.stringify(response.body);

      expect(response.body).not.toHaveProperty('stack');
      expect(serialized).not.toContain('Error:');
      expect(serialized).not.toContain('at ');

      // The envelope carries exactly the FRD Y2 shape and nothing beyond it.
      expect(Object.keys(response.body).sort()).toEqual(['error_code', 'message']);
    });
  });

  /**
   * The e2e cases above prove the CHAIN denies, but they all stop at the
   * first guard. That leaves the second guard's own default untested — and a
   * later plan will replace SessionAuthGuard with a real implementation that
   * lets authenticated callers through, at which point AbacGuard becomes the
   * only thing standing between a principal and an unmarked resource route.
   *
   * So invoke it directly with a mocked, already-authenticated context.
   */
  describe('AbacGuard in isolation (second guard is independently closed)', () => {
    const buildContext = (
      handler: (...args: unknown[]) => unknown,
      controllerClass: new () => unknown,
    ): ExecutionContext =>
      ({
        getHandler: () => handler,
        getClass: () => controllerClass,
        switchToHttp: () => ({
          getRequest: () => ({
            // An authenticated principal, as plan 01-06 will supply.
            principal: {
              user_id: '00000000-0000-4000-8000-000000000001',
              session_id: '00000000-0000-4000-8000-000000000002',
              mfa_satisfied: true,
              roles: [{ role_name: 'judge' as const }],
              scopes: [],
              entitlements: [],
            },
          }),
          getResponse: () => ({}),
        }),
      }) as unknown as ExecutionContext;

    let guard: AbacGuard;

    beforeAll(() => {
      // Plan 01-07 gave `AbacGuard` its real collaborators (PDP client,
      // resource loader, Prisma, audit). None of them is reachable on the
      // paths this suite exercises — a `@Public()` or `@SelfScoped()` route
      // returns before the guard looks at anything, and an unmarked route is
      // refused for the absence of a `@Resource()` descriptor, which is
      // decided before any collaborator is touched.
      //
      // So they are passed as THROWING doubles rather than permissive ones.
      // If a future change makes one of these paths call out to the PDP or
      // the database, this suite fails loudly with "must not be reached"
      // instead of quietly passing against a stub that said yes. The whole
      // point of this file is to fail when the chain stops denying.
      const unreachable = (name: string): never => {
        throw new Error(
          `${name} must not be reached on a public/self-scoped/undeclared route`,
        );
      };

      guard = new AbacGuard(
        new Reflector(),
        {
          evaluate: () => unreachable('PdpClient.evaluate'),
        } as unknown as ConstructorParameters<typeof AbacGuard>[1],
        {
          load: () => unreachable('ResourceLoaderService.load'),
          effectiveSecurityConfig: () =>
            unreachable('ResourceLoaderService.effectiveSecurityConfig'),
        } as unknown as ConstructorParameters<typeof AbacGuard>[2],
        {} as unknown as ConstructorParameters<typeof AbacGuard>[3],
        {} as unknown as ConstructorParameters<typeof AbacGuard>[4],
      );
    });

    it('denies an unmarked route with 503 SECURITY_POLICY_UNAVAILABLE', async () => {
      const context = buildContext(
        GuardProbeController.prototype.unmarkedRoute,
        GuardProbeController,
      );

      await expect(guard.canActivate(context)).rejects.toThrow(ApiException);

      await guard.canActivate(context).catch((error: ApiException) => {
        expect(error.getStatus()).toBe(503);
        expect(error.errorCode).toBe('SECURITY_POLICY_UNAVAILABLE');
        expect(error.toBody()).toEqual({
          error_code: 'SECURITY_POLICY_UNAVAILABLE',
          message: 'Access cannot be evaluated at this time; request denied',
        });
      });
    });

    it('denies even a fully MFA-satisfied principal — authentication is not authorization', async () => {
      const context = buildContext(
        GuardProbeController.prototype.unmarkedRoute,
        GuardProbeController,
      );

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        errorCode: 'SECURITY_POLICY_UNAVAILABLE',
      });
    });

    it('allows a @Public() route', async () => {
      const context = buildContext(
        GuardProbeController.prototype.publicRoute,
        GuardProbeController,
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('allows a @SelfScoped() route (no target resource to evaluate)', async () => {
      const context = buildContext(
        GuardProbeController.prototype.selfScopedRoute,
        GuardProbeController,
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });
});
