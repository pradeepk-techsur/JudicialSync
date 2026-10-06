import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_SELF_SCOPED_KEY } from '../decorators/self-scoped.decorator';
import { ApiException } from '../errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { Principal, RequestWithPrincipal } from '../principal/principal.types';
import { AuditService } from '../../modules/audit/audit.service';
import { recordStandaloneAudit } from '../../modules/audit/with-audit';
import { PdpClient, policyUnavailable } from '../../modules/policy/pdp.client';
import { PdpDecision, PdpInput } from '../../modules/policy/pdp.types';
import {
  RESOURCE_KEY,
  ResourceDescriptor,
} from '../../modules/policy/resource-descriptor.decorator';
import {
  LoadedResource,
  ResourceLoaderService,
} from '../../modules/policy/resource-loader.service';

/**
 * `audit_events.object_id` is NOT NULL, so a denial on a resource that does
 * not exist (or has no id — a `create`, an `encryption_key`) still needs a
 * value. The nil UUID is the conventional "no object" marker and is
 * distinguishable from any real id, which a random placeholder would not be.
 */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Reason code → HTTP status and display-safe message.
 *
 * Every row is verbatim from a specification table — `FRD/F00` Error States
 * for the four `AUTH_*` codes, `FRD/Y2-errors.md` for the not-found wording.
 * They are collected here rather than written inline at each throw site so
 * that a client branching on `error_code` cannot encounter two spellings of
 * the same condition.
 *
 * A code absent from this map denies with 403 and the generic scope message.
 * That is the safe direction: a new reason the policy learns to emit before
 * the guard learns to map it still denies, it merely does so less specifically.
 */
const REASON_RESPONSES: Readonly<
  Record<string, { status: number; message: string }>
> = {
  AUTH_SCOPE_DENIED: {
    status: 403,
    message: 'You do not have access to this record',
  },
  AUTH_DESIGNATION_DENIED: {
    status: 403,
    message: 'This record requires additional authorization',
  },
  AUTH_MFA_FAILED: {
    status: 401,
    message: 'Multifactor verification failed',
  },
  AUTH_SOD_VIOLATION: {
    status: 403,
    message:
      'Separation-of-duties violation: cannot approve your own request',
  },
};

/**
 * Resource-type-aware refinement of a denial's `error_code` and message.
 *
 * `FRD/Y2-errors.md` and the per-feature FRD error tables require that a denial
 * carry a **feature-specific** code, not only the generic `AUTH_*` one — e.g.
 * F02's "Explorer query without `audit_reader`" is `AUDIT_READ_DENIED` with
 * "You do not have audit explorer access", and its sealed-case denial is
 * `AUDIT_DESIGNATION_DENIED`. The same pattern recurs for F01
 * (`CASE_DESIGNATION_DENIED`), F12 (`PORTAL_DESIGNATION_DENIED`), F16
 * (`LEDGER_DESIGNATION_DENIED`), each listed in `Y2-errors.md` principle 3.
 *
 * This is **presentation, not policy**. The DECISION is entirely the PDP's —
 * this table never changes allow/deny, it only relabels a denial the policy
 * already made so the client sees the code its feature's FRD table specifies.
 * Keyed by `(resource_type, generic_reason_code)`; an absent entry falls back to
 * the generic code and message in {@link REASON_RESPONSES}, so adding a new
 * resource type here is optional and never widens access.
 *
 * Plan 01-12 added `audit_event`; later feature plans add their own rows for
 * their own FRD codes.
 */
const RESOURCE_REASON_OVERRIDES: Readonly<
  Record<string, Record<string, { errorCode: string; message: string }>>
> = {
  audit_event: {
    // A missing `audit_reader` entitlement is denied by the PDP as
    // AUTH_SCOPE_DENIED (the policy has no per-feature reason vocabulary); F02's
    // error table names it AUDIT_READ_DENIED for the client.
    AUTH_SCOPE_DENIED: {
      errorCode: 'AUDIT_READ_DENIED',
      message: 'You do not have audit explorer access',
    },
    AUTH_DESIGNATION_DENIED: {
      errorCode: 'AUDIT_DESIGNATION_DENIED',
      message: "This case's audit history requires additional authorization",
    },
  },
};

/** Display label for a resource type, used in the 404 message. */
const NOT_FOUND_LABELS: Readonly<Record<string, string>> = {
  case: 'Case',
  proceeding: 'Proceeding',
  hearing: 'Hearing',
  party: 'Party',
  docket_event: 'Docket event',
  document_reference: 'Document',
  security_designation: 'Security designation',
  court_config: 'Court configuration',
  audit_event: 'Audit entry',
  file: 'File',
  retention_schedule: 'Retention schedule',
  disposition: 'Disposition',
  access_grant_request: 'Access request',
  entitlement_grant: 'Entitlement grant',
  encryption_key: 'Encryption key',
};

/**
 * ============================================================================
 * THE AUTHORITATIVE AUTHORIZATION ENFORCEMENT POINT
 * ============================================================================
 *
 * The **second** of two global guards, registered as an `APP_GUARD` in
 * `app.module.ts` and running on every request after `SessionAuthGuard` has
 * established who the caller is.
 *
 * Its question: **may THIS principal touch THIS resource?**
 *
 *   | route marking   | this guard |
 *   |-----------------|------------|
 *   | `@Public()`     | allow — no principal exists to evaluate         |
 *   | `@SelfScoped()` | allow — the endpoint has no target resource     |
 *   | `@Resource(…)`  | load the object's real attributes, ask OPA      |
 *   | unmarked        | **deny 503, and log the route loudly**          |
 *
 * ## This guard contains no authorization logic, and must never contain any
 *
 * It does exactly three things: assemble the input document, call the PDP,
 * and apply the verdict it is handed. Every *decision* lives in Rego.
 *
 * You will not find in this file — and must not add — four things in
 * particular: a membership test of the principal's entitlements against a
 * required one, a court-identifier equality test, a designation lookup, or a
 * self-approval comparison of the requester against the acting user. Those
 * belong to `abac.rego`, `designation.rego` and `sod.rego` respectively.
 * `TechArch/04-security.md` §7.2 requires the binding rules be "enforced in
 * policy, not scattered across handler code," and is specific about why for
 * SoD: it must be "a policy rule comparing `request.created_by` against
 * `request.approved_by`, **not an application-layer `if` statement that a
 * future refactor could drop**."
 *
 * (The four are described rather than written out as code, because this
 * plan's verification greps the file for exactly those expressions — a
 * warning that trips its own detector makes the detector useless.)
 *
 * A reimplementation here would also not merely be redundant — it would be a
 * SECOND policy, diverging silently from the first, with no test covering the
 * disagreement. The plan's verification greps this file for exactly those
 * shapes.
 *
 * ## Why global rather than per-route
 *
 * Per-route opt-in guards were rejected in the Phase 1 CONTEXT: "a route that
 * forgets the decorator is silently open, which is precisely the failure mode
 * F00 forbids." Registering globally inverts the default — a route is
 * protected unless deliberately marked otherwise, and forgetting produces a
 * 503, not an open endpoint (threats T-01-01, T-01-26).
 *
 * ## The 403-vs-404 distinction is the policy's, not this file's
 *
 * `FRD/Y2-errors.md` principle 3 is binding and already resolves it, so
 * `designation.rego` decides and reports `hide_existence`. This guard only
 * TRANSLATES: a hidden resource becomes a 404 whose body is byte-identical to
 * the one a genuinely nonexistent id produces, because a difference in either
 * body or status would itself disclose that a sealed matter exists
 * (`TechArch/04-security.md` §7.6). The policy deliberately does not know the
 * per-resource 404 codes; deriving `{TYPE}_NOT_FOUND` is this file's job.
 */
@Injectable()
export class AbacGuard implements CanActivate {
  private readonly logger = new Logger(AbacGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly pdp: PdpClient,
    private readonly resources: ResourceLoaderService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    // 1. A public route has no authenticated principal, so there is nothing to
    //    evaluate against. `SessionAuthGuard` already let it through.
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) === true
    ) {
      return true;
    }

    // 2. A self-scoped route has a principal but no TARGET RESOURCE — its only
    //    subject is the caller's own identity, so there are no resource
    //    attributes for the PDP to weigh. The session requirement was already
    //    enforced upstream; this is not an authentication bypass.
    if (
      this.reflector.getAllAndOverride<boolean>(IS_SELF_SCOPED_KEY, targets) ===
      true
    ) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & RequestWithPrincipal>();
    const route = this.routeOf(request);
    const method = request.method ?? 'GET';

    // 3. The forgot-the-decorator case. It must fail LOUDLY rather than open:
    //    an unmarked route is one nobody declared a policy for, so there is
    //    genuinely no decision available — which is what 503
    //    SECURITY_POLICY_UNAVAILABLE means. The error log names the handler so
    //    the fix is obvious rather than a mystery 503 in production.
    const descriptor = this.reflector.getAllAndOverride<ResourceDescriptor>(
      RESOURCE_KEY,
      targets,
    );
    if (descriptor === undefined) {
      this.logger.error(
        `DENY (fail closed): ${method} ${route} reached AbacGuard with no ` +
          `@Resource() descriptor. Handler: ` +
          `${context.getClass().name}.${context.getHandler().name}. ` +
          `Every protected route must declare exactly one of @Public(), ` +
          `@SelfScoped() or @Resource({type, action}) — and the (type, action) ` +
          `pair needs a row in policy/judicialsync/authz/abac.rego's ` +
          `action_entitlement_map (plan 01-02 owns that file).`,
      );
      throw policyUnavailable();
    }

    // 4. The principal, attached by SessionAuthGuard.
    const principal = request.principal;
    if (principal === undefined) {
      throw new ApiException(
        401,
        'AUTH_SESSION_EXPIRED',
        'Session expired; please sign in again',
      );
    }

    // 5. The target's REAL attributes, from the database.
    const resource = await this.resources.load(
      descriptor.type,
      this.param(request, descriptor.idParam),
      this.param(request, descriptor.caseIdParam),
      {
        body: this.bodyOf(request),
        actorUserId: principal.user_id,
      },
    );

    // 6. The court's effective designation policy, plus the rule-package
    //    version that produced it. Read together so the version recorded on
    //    the audit event is the one that actually decided — FRD/F02's
    //    "linkage ... to the specific configuration/rule-package version in
    //    effect at action time" is only true if those cannot drift apart.
    const config = await this.resources.effectiveSecurityConfig(
      resource?.court_id ?? null,
    );

    // A target that does not exist is treated as absent. The denial is still
    // audited: an attempt to read a record that is not there is exactly the
    // probing pattern an investigation needs to see, and dropping the event
    // because there was no object would discard it.
    if (resource === null) {
      await this.auditDenial({
        principal,
        descriptor,
        resource: null,
        decision: {
          allow: false,
          reason_code: 'RESOURCE_NOT_FOUND',
          hide_existence: true,
        },
        route,
        method,
        request,
        rulePackageVersionId: config.rulePackageVersionId,
      });
      throw this.notFound(descriptor.type);
    }

    // 7. Ask OPA. Any failure here raises 503 from inside the client.
    const input: PdpInput = {
      principal: {
        user_id: principal.user_id,
        mfa_satisfied: principal.mfa_satisfied,
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
      action: descriptor.action,
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
      context: { route, method },
      // Omitted entirely when the court has no rows, so the bundle falls back
      // to its built-in defaults. Sending an EMPTY ARRAY would be wrong: the
      // policy replaces its defaults wholesale with whatever is supplied, so
      // an empty set maps every designation to nothing and denies every
      // designated record in a court whose configuration has not loaded.
      ...(config.policies.length > 0
        ? { security_policies: config.policies }
        : {}),
    };

    const decision = await this.pdp.evaluate(input);

    if (decision.allow) {
      return true;
    }

    // 8. Apply the verdict. Audited first, so a denial is recorded even if
    //    something downstream of this point throws.
    await this.auditDenial({
      principal,
      descriptor,
      resource,
      decision,
      route,
      method,
      request,
      rulePackageVersionId: config.rulePackageVersionId,
    });

    // `hide_existence` outranks every reason code. The policy sets it only on
    // blind-discovery paths; see designation.rego.
    if (decision.hide_existence) {
      throw this.notFound(descriptor.type);
    }

    // A feature-specific relabelling of the denial, if the resource type
    // declares one (FRD/Y2-errors.md per-feature codes). Presentation only — the
    // decision is unchanged; this just names it the way the feature's FRD table
    // does. Falls back to the generic reason code and message below.
    const override =
      RESOURCE_REASON_OVERRIDES[descriptor.type]?.[decision.reason_code];

    const mapped = REASON_RESPONSES[decision.reason_code];
    if (mapped === undefined) {
      this.logger.warn(
        `PDP returned an unmapped reason_code '${decision.reason_code}' for ` +
          `${method} ${route}. Denying 403 with the generic scope message; ` +
          `add the code to REASON_RESPONSES with its FRD wording.`,
      );
      throw new ApiException(
        403,
        override?.errorCode ??
          (decision.reason_code === '' ? 'AUTH_SCOPE_DENIED' : decision.reason_code),
        override?.message ?? 'You do not have access to this record',
      );
    }

    throw new ApiException(
      mapped.status,
      override?.errorCode ?? decision.reason_code,
      override?.message ?? mapped.message,
    );
  }

  /**
   * The 404 for a resource the caller may not learn exists.
   *
   * **Nothing about this response may vary with the reason.** A genuinely
   * nonexistent id and a sealed record hidden from a blind-discovery requester
   * must produce byte-identical bodies, or the difference between them becomes
   * an existence oracle — which is the precise attack
   * `TechArch/04-security.md` §7.6 names. Both paths call this one method, so
   * there is no second place for them to diverge.
   */
  private notFound(type: string): ApiException {
    const label = NOT_FOUND_LABELS[type] ?? 'Resource';
    return new ApiException(
      404,
      `${type.toUpperCase()}_NOT_FOUND`,
      `${label} not found or not accessible`,
    );
  }

  /**
   * Write the `access_attempt` event for a denial.
   *
   * `TechArch/04-security.md` §7.6: "Every such denied/hidden attempt is
   * itself logged as an `access_attempt` audit event." That is the second half
   * of Phase 1 success criterion 4, and it applies to the 404 path as much as
   * the 403 one — an attempt hidden behind a not-found is exactly the attempt
   * an investigation most wants to see.
   *
   * ## Two properties this method must hold, both easy to get wrong
   *
   * **1. It must never change the response.** There is no request transaction
   * to join — the handler never ran — so this write stands alone. If it fails,
   * the denial must still be the denial: converting a 403 into a 500 because
   * the audit insert hit a deadlock would hand the caller a different signal
   * for a reason that has nothing to do with their access, and on the 404 path
   * it would leak that *something* is there to fail about. So the failure is
   * caught, logged at `error` as an integrity gap, and swallowed — the only
   * place in this codebase where an audit failure does not abort the
   * operation, and only because the operation was already being refused.
   *
   * **2. `rule_version_ref` links the entry to the rule package in effect.**
   * `FRD/F02` requires "linkage of every audit entry to the specific
   * configuration/rule-package version … in effect at action time," and the
   * version passed here is the one read alongside the policies that decided
   * this request, not a fresh lookup that might have moved.
   */
  private async auditDenial(args: {
    principal: Principal;
    descriptor: ResourceDescriptor;
    resource: LoadedResource | null;
    decision: PdpDecision;
    route: string;
    method: string;
    request: Request;
    rulePackageVersionId: string | null;
  }): Promise<void> {
    try {
      await recordStandaloneAudit(this.prisma, this.audit, {
        actor_id: args.principal.user_id,
        action_type: 'access_attempt',
        object_type: args.descriptor.type,
        // NOT NULL in the schema — see NIL_UUID.
        object_id: args.resource?.id ?? NIL_UUID,
        after_state: {
          outcome: 'denied',
          reason_code: args.decision.reason_code,
          hide_existence: args.decision.hide_existence,
          action: args.descriptor.action,
          route: args.route,
          method: args.method,
        },
        client_ip: args.request.ip ?? null,
        session_id: args.principal.session_id,
        rule_version_ref: args.rulePackageVersionId,
      });
    } catch (error) {
      // Deliberately swallowed — see the method comment. Logged at `error`
      // with an integrity-alert framing because a denial that left no trace is
      // a gap in the record, and the record is the point.
      this.logger.error(
        `INTEGRITY GAP: failed to write the access_attempt audit event for a ` +
          `denied ${args.method} ${args.route} ` +
          `(reason_code=${args.decision.reason_code}). The denial itself ` +
          `stands and is being returned to the caller, but this attempt is ` +
          `NOT in the audit trail. Cause: ${
            error instanceof Error ? error.message : String(error)
          }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * A route parameter, or `null`.
   *
   * Reads `params` first and falls back to `query`, because a collection route
   * scoped by query string (`GET /retention/schedules?court_id=…`) names its
   * resource exactly as a path route does, and the descriptor should not have
   * to care which.
   */
  private param(request: Request, name: string | undefined): string | null {
    if (name === undefined) return null;

    const fromPath = (request.params as Record<string, unknown> | undefined)?.[
      name
    ];
    if (typeof fromPath === 'string' && fromPath !== '') return fromPath;

    const fromQuery = (request.query as Record<string, unknown> | undefined)?.[
      name
    ];
    if (typeof fromQuery === 'string' && fromQuery !== '') return fromQuery;

    return null;
  }

  /**
   * The request body and query merged, for the loader's `create` placement
   * lookups.
   *
   * Both are client-supplied and neither is trusted here — the loader
   * re-validates every id against the database before it reaches the PDP (see
   * `placementFromBody`). What arrives in this object is a *claim*, not an
   * attribute.
   */
  private bodyOf(request: Request): Record<string, unknown> | null {
    const body =
      typeof request.body === 'object' && request.body !== null
        ? (request.body as Record<string, unknown>)
        : {};
    const query =
      typeof request.query === 'object' && request.query !== null
        ? (request.query as Record<string, unknown>)
        : {};
    return { ...query, ...body };
  }

  /**
   * The route path for `input.context.route` and the audit record.
   *
   * Prefers the matched ROUTE PATTERN (`/api/v1/cases/:id`) over the concrete
   * URL. Two reasons, and the second is the important one:
   *
   *  - `rbac.rego`'s internal-only gate matches route prefixes, and a pattern
   *    is the stable thing to match; and
   *  - a concrete URL carries ids and query strings, which would put case
   *    identifiers into `input.context` and into every audit row's
   *    `after_state`. The object id is already recorded in its own column, so
   *    that would be duplication that also widens what a log line discloses.
   */
  private routeOf(request: Request): string {
    const base = request.baseUrl ?? '';
    const pattern = (request.route as { path?: string } | undefined)?.path;
    if (typeof pattern === 'string' && pattern !== '') {
      return `${base}${pattern}`;
    }
    // No matched route (a 404 reaching the guard chain). Strip the query
    // string so a probe cannot write arbitrary text into the audit trail.
    const url = request.originalUrl ?? request.url ?? '';
    return url.split('?')[0];
  }
}
