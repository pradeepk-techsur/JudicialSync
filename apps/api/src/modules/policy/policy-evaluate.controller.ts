import { Body, Controller, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../../common/decorators/public.decorator';
import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  SERVICE_ACTOR_HEADER,
  ServiceTokenGuard,
} from '../audit/service-token.guard';
import { EntitlementResolverService } from '../identity/entitlement-resolver.service';
import { PdpClient } from './pdp.client';
import { PdpInput } from './pdp.types';
import { ResourceLoaderService } from './resource-loader.service';

/**
 * `TechArch/03a-api-shared.md` §6.9, verbatim:
 *
 * ```typescript
 * interface PolicyEvaluationRequest {
 *   object_type: string;
 *   object_id: string;
 *   requester_scope: ScopeAttribute[];
 * }
 * ```
 */
const PolicyEvaluationRequestSchema = z
  .object({
    object_type: z.string().min(1).max(128),
    object_id: z.string().uuid(),
    requester_scope: z
      .array(
        z.object({
          scope_type: z.enum([
            'court',
            'division',
            'case',
            'proceeding',
            'party_role',
            'security_designation',
          ]),
          scope_value: z.string().uuid().nullable().optional(),
          scope_enum_value: z.string().nullable().optional(),
        }),
      )
      .default([]),
    /** Optional, defaults to `read` — §6.9's shape carries no action field. */
    action: z
      .enum(['read', 'create', 'update', 'approve', 'upload', 'rotate', 'revoke'])
      .default('read'),
  })
  .strict();

/** `PolicyEvaluationResponse` from §6.9, plus a diagnostic `detail`. */
interface PolicyEvaluationResponse {
  decision: 'allow' | 'deny';
  reason_code?: string;
  detail?: Record<string, unknown>;
}

/**
 * ============================================================================
 * `POST /api/v1/security/policy-evaluate` — THE PDP CALL, EXPOSED INTERNALLY
 * ============================================================================
 *
 * `FRD/Y1a-api-shared.md` §Security Baseline and `TechArch/03a-api-shared.md`
 * §6.9 both specify this route and both mark it **Internal** — "the ABAC PDP
 * call itself (§7.2)". It exists so another service, which cannot share this
 * process's guard chain, can ask the same question the guard asks.
 *
 * ## This endpoint is an authorization oracle, and is guarded as one
 *
 * Two independent things make it dangerous, and each is closed separately.
 *
 * **1. It answers questions about resources the caller cannot see.** Left
 * reachable by end users, a caller could enumerate which case ids exist by
 * probing reason codes: `RESOURCE_NOT_FOUND` for an id that is hidden from
 * them, `AUTH_SCOPE_DENIED` for one that merely is not theirs. That
 * distinction is exactly the one `designation.rego` works to deny them over
 * HTTP, and this route would hand it back in a JSON field. Hence
 * {@link ServiceTokenGuard} at the controller level — the same guard plan
 * 01-05 wrote for `POST /audit/events`, reused rather than reimplemented so
 * there is one notion of "internal caller" in the system.
 *
 * **2. The caller supplies a `requester_scope`, and it is IGNORED.** §6.9's
 * request shape includes it, so it is accepted and validated — but the
 * decision is made against scope resolved from the database by
 * {@link EntitlementResolverService}. Honouring the supplied value would make
 * this route a complete authorization bypass: anyone able to call it could
 * claim court scope they do not hold and receive `allow`, then present that
 * answer to whatever service asked. A supplied scope that disagrees with the
 * resolved one is echoed back under `detail.supplied_scope_ignored` so the
 * mismatch is diagnosable rather than silent. (Threat T-01-27.)
 *
 * ## Why `@Public()` here is not a hole
 *
 * Identical reasoning to `audit-internal.controller.ts`, and worth restating
 * because `@Public()` on a PDP endpoint reads like a vulnerability until the
 * controller-level guard is noticed.
 *
 * There is no end-user session on a service-to-service call, so
 * `SessionAuthGuard` could only ever 401 it, and `AbacGuard` would 503 it for
 * carrying no `@Resource()` descriptor. `@Public()` removes those two, and
 * {@link ServiceTokenGuard} replaces them with something **strictly
 * narrower**: the session chain admits any authenticated user, while the
 * service-token guard admits only a caller holding the deployment's internal
 * secret AND carrying no user credential at all. Swapping one for the other
 * makes the route less reachable, not more.
 *
 * If `ServiceTokenGuard` is ever removed from the decorator below, `@Public()`
 * must go in the same change.
 */
@Controller()
@UseGuards(ServiceTokenGuard)
export class PolicyEvaluateController {
  constructor(
    private readonly pdp: PdpClient,
    private readonly resources: ResourceLoaderService,
    private readonly entitlements: EntitlementResolverService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('security/policy-evaluate')
  @Public() // Guarded by ServiceTokenGuard instead — see the class comment.
  @HttpCode(200)
  async evaluate(
    @Body() body: unknown,
    @Headers(SERVICE_ACTOR_HEADER) actorIdHeader: string | undefined,
  ): Promise<PolicyEvaluationResponse> {
    const parsed = PolicyEvaluationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        'The request failed validation',
        // Field paths only. Zod messages can echo submitted values, and this
        // body carries object identifiers (FRD/Y2-errors.md principle 4).
        { fields: parsed.error.issues.map((issue) => issue.path.join('.')) },
      );
    }

    // The SUBJECT of the evaluation — the principal the calling service is
    // asking about. Taken from the header, exactly as `POST /audit/events`
    // takes its actor, and never from the body.
    const subjectId = z.string().uuid().safeParse(actorIdHeader);
    if (!subjectId.success) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        `${SERVICE_ACTOR_HEADER} must be a UUID identifying the subject user`,
      );
    }

    const subject = await this.prisma.users.findUnique({
      where: { id: subjectId.data },
      select: { id: true },
    });
    if (subject === null) {
      throw new ApiException(
        422,
        'REQUEST_VALIDATION_FAILED',
        `${SERVICE_ACTOR_HEADER} does not identify a known user`,
      );
    }

    // Resolved from the database. The caller's `requester_scope` is NOT
    // consulted — see the class comment.
    const principal = await this.entitlements.resolveUncached(subjectId.data);

    const resource = await this.resources.load(
      parsed.data.object_type,
      parsed.data.object_id,
      null,
    );

    // An unresolvable target collapses to the same `deny` +
    // `RESOURCE_NOT_FOUND` a hidden one produces. Callers here are services,
    // which need the reason rather than an HTTP status — and the two cases
    // must still be indistinguishable to them for the same reason they are
    // over HTTP.
    if (resource === null) {
      return {
        decision: 'deny',
        reason_code: 'RESOURCE_NOT_FOUND',
        ...this.scopeMismatchDetail(parsed.data.requester_scope, principal),
      };
    }

    const config = await this.resources.effectiveSecurityConfig(
      resource.court_id,
    );

    const input: PdpInput = {
      principal: {
        user_id: principal.user_id,
        // This endpoint evaluates a SERVICE's question about a subject, not a
        // live browser session, so there is no session to have satisfied MFA.
        // Asserting it here would make `rbac.rego`'s MFA rule deny every call;
        // the MFA gate belongs to the session path (`SessionAuthGuard`), which
        // is where a human's second factor is actually established.
        mfa_satisfied: true,
        roles: principal.roles.map((role) => ({
          role_name: role.role_name,
          court_id: role.court_id ?? null,
          division_id: role.division_id ?? null,
        })),
        scopes: principal.scopes.map((scope) => ({
          scope_type: scope.scope_type,
          scope_value: scope.scope_value ?? null,
          scope_enum_value: scope.scope_enum_value ?? null,
        })),
        entitlements: principal.entitlements,
      },
      action: parsed.data.action,
      resource: {
        type: resource.type,
        id: resource.id,
        court_id: resource.court_id,
        division_id: resource.division_id,
        case_id: resource.case_id,
        proceeding_id: resource.proceeding_id,
        designations: resource.designations,
        requested_by: resource.requested_by,
      },
      context: { route: '/api/v1/security/policy-evaluate', method: 'POST' },
      ...(config.policies.length > 0
        ? { security_policies: config.policies }
        : {}),
    };

    // A PDP failure raises 503 SECURITY_POLICY_UNAVAILABLE from the client,
    // which is right here too: a service asking "may this principal do this?"
    // must not receive `allow` from a system that cannot evaluate the question.
    const decision = await this.pdp.evaluate(input);

    if (decision.allow) {
      return {
        decision: 'allow',
        ...this.scopeMismatchDetail(parsed.data.requester_scope, principal),
      };
    }

    return {
      decision: 'deny',
      // `hide_existence` collapses into the reason code rather than into a
      // status, because the caller is a service.
      reason_code: decision.hide_existence
        ? 'RESOURCE_NOT_FOUND'
        : decision.reason_code,
      ...this.scopeMismatchDetail(parsed.data.requester_scope, principal),
    };
  }

  /**
   * Report a caller-supplied scope that disagrees with the resolved one.
   *
   * The supplied value never affects the decision. Echoing the disagreement
   * is what keeps "we ignored your input" from being indistinguishable from
   * "your input was honoured and agreed" — a caller whose scope assembly has
   * drifted would otherwise see correct-looking answers until the day the two
   * diverge in the other direction.
   */
  private scopeMismatchDetail(
    supplied: Array<{
      scope_type: string;
      scope_value?: string | null;
      scope_enum_value?: string | null;
    }>,
    principal: { scopes: Array<{ scope_type: string; scope_value?: string }> },
  ): { detail?: Record<string, unknown> } {
    if (supplied.length === 0) return {};

    const key = (s: { scope_type: string; scope_value?: string | null }): string =>
      `${s.scope_type}:${s.scope_value ?? '-'}`;

    const resolvedKeys = new Set(principal.scopes.map(key));
    const extra = supplied.filter((s) => !resolvedKeys.has(key(s)));
    if (extra.length === 0) return {};

    return {
      detail: {
        supplied_scope_ignored: extra.map(key),
        note:
          'requester_scope is accepted for API-shape compatibility and never ' +
          'influences the decision; scope is resolved server-side from ' +
          'scope_assignments and user_roles.',
      },
    };
  }
}
