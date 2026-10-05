import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../../common/decorators/public.decorator';
import { SelfScoped } from '../../common/decorators/self-scoped.decorator';
import { ApiException } from '../../common/errors/api-error';
import {
  Principal,
  RequestWithPrincipal,
} from '../../common/principal/principal.types';
import { AuthService } from './auth.service';
import {
  AuthorizeUrlResponseDto,
  EntitlementsDto,
  LoginRequestDto,
  LoginResponseDto,
  MfaChallengeRequestDto,
  RefreshRequestDto,
  RefreshResponseDto,
} from './dto/auth.dto';

/**
 * `/api/v1/auth/*` — the endpoints from `FRD/Y1a-api-shared.md` §Identity &
 * Access and `TechArch/03a-api-shared.md` §6.1.
 *
 * | Method | Path | Marking | Why |
 * |---|---|---|---|
 * | GET  | `/auth/authorize-url`  | `@Public()`     | starts the flow; no session can exist yet |
 * | POST | `/auth/login`          | `@Public()`     | the request that creates the session |
 * | POST | `/auth/mfa-challenge`  | `@Public()`     | part of the authentication flow |
 * | POST | `/auth/refresh`        | `@Public()`     | the access token is expired by definition |
 * | POST | `/auth/logout`         | `@SelfScoped()` | session required; addresses only the caller |
 * | GET  | `/auth/entitlements`   | `@SelfScoped()` | session required; returns only the caller's own access |
 *
 * `@Public()` here is the one legitimate use the decorator documents — "the
 * authentication flow itself, because a caller cannot present a session
 * before obtaining one". `@SelfScoped()` is **not** an authentication bypass:
 * `SessionAuthGuard` still runs and still requires a valid, unrevoked
 * session. It exempts only the resource-ABAC half of the decision, for two
 * endpoints whose sole subject is the caller's own identity.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Begin an authentication attempt.
   *
   * Returns the IdP URL to send the user agent to, plus the `state` to hand
   * back on callback. The nonce and PKCE verifier stay server-side.
   */
  @Public()
  @Get('authorize-url')
  async authorizeUrl(): Promise<AuthorizeUrlResponseDto> {
    return this.auth.authorizeUrl();
  }

  /** Exchange an IdP assertion for a session. */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginRequestDto,
    @Req() request: Request,
  ): Promise<LoginResponseDto> {
    const assertion = body?.identity_assertion;
    if (typeof assertion !== 'string' || assertion.trim() === '') {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'identity_assertion is required',
      );
    }

    return this.auth.login(
      assertion,
      typeof body.state === 'string' && body.state !== '' ? body.state : undefined,
      clientIp(request),
      body.callback_params ?? {},
    );
  }

  /**
   * The MFA challenge step from the shared API contract.
   *
   * Against this deployment it always reports that the step does not apply.
   * Keycloak owns the OTP form and completes the second factor inside its own
   * browser flow, so by the time an assertion reaches this API, MFA has
   * either happened or it has not — there is nothing for a separate challenge
   * round-trip to do.
   *
   * The endpoint exists because the contract lists it, and because an IdP
   * that returns an interim `mfa_required` state would need it. What it
   * deliberately does **not** do is verify an OTP application-side: that
   * would be a second authentication path running alongside the real one,
   * which is exactly what CONTEXT rejected. Reporting honestly that the step
   * does not apply is the alternative to pretending to perform it.
   *
   * See `docs/IDP-INTEGRATION.md` §5.
   */
  @Public()
  @Post('mfa-challenge')
  @HttpCode(422)
  mfaChallenge(@Body() _body: MfaChallengeRequestDto): never {
    throw new ApiException(
      422,
      'AUTH_MFA_NOT_REQUIRED_AT_THIS_STEP',
      'Multifactor verification is completed by the identity provider during ' +
        'sign-in; no separate challenge step applies.',
    );
  }

  /** Rotate a refresh token. The presented token is revoked. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() body: RefreshRequestDto,
    @Req() request: Request,
  ): Promise<RefreshResponseDto> {
    const token = body?.refresh_token;
    if (typeof token !== 'string' || token.trim() === '') {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'refresh_token is required',
      );
    }
    return this.auth.refresh(token, clientIp(request));
  }

  /** Revoke the caller's own session. */
  @SelfScoped()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request): Promise<void> {
    await this.auth.logout(principalOf(request), clientIp(request));
  }

  /**
   * The caller's computed roles, scopes and entitlements.
   *
   * **For UI gating only** — never the authorization decision. See
   * `dto/auth.dto.ts`.
   */
  @SelfScoped()
  @Get('entitlements')
  async entitlements(@Req() request: Request): Promise<EntitlementsDto> {
    return this.auth.entitlementsFor(principalOf(request));
  }
}

/**
 * The principal attached by `SessionAuthGuard`.
 *
 * Absent means the guard did not run, which can only happen if a route lost
 * its marking. Throwing beats a non-null assertion: the failure becomes a
 * 401 rather than a 500 reading `Cannot read properties of undefined`.
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

/** Best-effort client address for the audit record. */
function clientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    return forwarded.split(',')[0].trim();
  }
  return request.ip ?? request.socket?.remoteAddress ?? null;
}
