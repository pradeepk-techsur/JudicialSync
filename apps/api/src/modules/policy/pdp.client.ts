import { Injectable, Logger } from '@nestjs/common';

import { ApiException } from '../../common/errors/api-error';
import {
  OpaDataResponse,
  PdpDecision,
  PdpInput,
  parsePdpDecision,
} from './pdp.types';

/** The exact code and message from `FRD/F13` Error States. Verbatim. */
const UNAVAILABLE_STATUS = 503;
const UNAVAILABLE_CODE = 'SECURITY_POLICY_UNAVAILABLE';
const UNAVAILABLE_MESSAGE =
  'Access cannot be evaluated at this time; request denied';

/** The one path this client calls. `policy/README.md` § "The contract". */
const DECISION_PATH = '/v1/data/judicialsync/authz/decision';

const DEFAULT_TIMEOUT_MS = 2000;

/**
 * ============================================================================
 * THE POLICY DECISION POINT CLIENT
 * ============================================================================
 *
 * An HTTP client for OPA, and nothing else. It assembles no decision, applies
 * no rule and compares no attribute — `AbacGuard` builds the input and OPA
 * decides. If a reviewer finds a policy comparison in this file or in the
 * guard, the whole reason TechArch chose OPA has been undone
 * (`TechArch/04-security.md` §7.2: the binding ABAC rules are "enforced in
 * policy, not scattered across handler code").
 *
 * ============================================================================
 * FAIL CLOSED. THERE IS NO FALLBACK, AND THERE MUST NEVER BE ONE.
 * ============================================================================
 *
 * **Every** failure mode — connection refused, DNS failure, TLS error, a
 * timeout, a non-200 status, a body that is not JSON, a body missing a boolean
 * `result.allow` — raises `503 SECURITY_POLICY_UNAVAILABLE`. No code path in
 * this file returns `allow: true`, and the only `PdpDecision` it can produce
 * is one OPA actually sent.
 *
 * **If you have arrived here to improve availability, stop and read this
 * paragraph.** The obvious improvements are all the same bug:
 *
 *   - caching the last decision per (principal, resource) and serving it when
 *     OPA is down;
 *   - a "last known good" allow for a principal who was permitted a moment ago;
 *   - treating a timeout as transient and defaulting to the previous answer;
 *   - a circuit breaker that fails *open* after N consecutive errors.
 *
 * Each of those converts a loud, specified outage (503, which `FRD/Y2-errors.md`
 * principle 1 and the Phase 1 CONTEXT both require) into a silent authorization
 * bypass that is active precisely when the authorization system is broken. A
 * cached allow is an allow issued by a system that cannot currently evaluate
 * whether it should be allowed — and the entitlement it is replaying may be the
 * one that was just revoked, which is the single most likely reason someone is
 * restarting OPA.
 *
 * The correct availability answer is to run more OPA replicas, not to make the
 * client guess. `apps/api/test/abac-fail-closed.e2e-spec.ts` stops the
 * container and asserts the 503, and this plan's verification greps the file
 * for the identifiers such a change would introduce, so the regression is
 * caught mechanically rather than by review. (That grep is why the forbidden
 * names are not spelled out in this comment — a warning that trips its own
 * detector makes the detector useless.)
 *
 * ## What is logged, and what deliberately is not
 *
 * A PDP failure logs at `error` with the route, method and resource type —
 * enough for an operator to find the failing call. It never logs the
 * principal's entitlement list, their token, or the resource's designations:
 * an error log is a lower-trust destination than the audit trail, and a log
 * line enumerating who holds `designation_sealed` is a reconnaissance gift.
 */
@Injectable()
export class PdpClient {
  private readonly logger = new Logger(PdpClient.name);

  /**
   * Evaluate one authorization request.
   *
   * @throws {ApiException} 503 `SECURITY_POLICY_UNAVAILABLE` on ANY failure.
   *   There is no second outcome: the method either returns the decision OPA
   *   produced, or it denies.
   */
  async evaluate(input: PdpInput): Promise<PdpDecision> {
    const url = `${this.baseUrl()}${DECISION_PATH}`;

    // AbortController, not a Promise.race: a race leaves the socket open and
    // the process holding a request nobody is waiting for, so a slow PDP
    // quietly exhausts the connection pool while every request "times out"
    // correctly. Aborting tears the request down.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });
    } catch (error) {
      // Covers the abort (timeout) and every transport failure alike. They are
      // the same thing to the caller — the decision could not be obtained.
      throw this.unavailable(
        input,
        controller.signal.aborted
          ? `timed out after ${this.timeoutMs()}ms`
          : `transport error: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw this.unavailable(input, `OPA returned HTTP ${response.status}`);
    }

    let body: OpaDataResponse;
    try {
      body = (await response.json()) as OpaDataResponse;
    } catch (error) {
      throw this.unavailable(
        input,
        `OPA response was not JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // An OPA document that evaluates to undefined comes back as `{}` with a
    // 200 — the single most likely shape of a misconfigured bundle (wrong
    // package path, bundle failed to load). Treating a missing `result` as
    // anything other than a failure would read "the policy said nothing" as
    // "the policy said yes".
    const decision = parsePdpDecision(body.result);
    if (decision === undefined) {
      throw this.unavailable(
        input,
        'OPA response carried no boolean result.allow (bundle not loaded, ' +
          'or the decision document has drifted from policy/README.md)',
      );
    }

    return decision;
  }

  /** `OPA_URL` from `.env.example` (owned by plan 01-01). */
  private baseUrl(): string {
    return (process.env.OPA_URL ?? 'http://localhost:8181').replace(/\/+$/, '');
  }

  /**
   * `PDP_TIMEOUT_MS`, defaulting to 2000.
   *
   * A non-numeric or non-positive value falls back to the default rather than
   * producing `NaN` — `setTimeout(fn, NaN)` fires immediately, which would
   * abort every evaluation instantly and deny the entire system over a typo in
   * an env file.
   */
  private timeoutMs(): number {
    const raw = Number(process.env.PDP_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
  }

  /**
   * Build the denial, logging the cause server-side.
   *
   * The log carries the route, method and resource type. It deliberately
   * carries NO principal entitlements, token, user identifier or resource
   * designations — see the class comment.
   */
  private unavailable(input: PdpInput, cause: string): ApiException {
    this.logger.error(
      `PDP evaluation failed (${cause}). Denying ` +
        `${input.context.method} ${input.context.route} ` +
        `[resource.type=${input.resource.type}, action=${input.action}]. ` +
        `Fail closed: the request is refused, never allowed.`,
    );

    return new ApiException(
      UNAVAILABLE_STATUS,
      UNAVAILABLE_CODE,
      UNAVAILABLE_MESSAGE,
    );
  }
}

/**
 * Exported so `AbacGuard` and the `/security/policy-evaluate` controller raise
 * the identical exception when they deny for a reason of their own (a missing
 * `@Resource()` descriptor), rather than each writing out the code and message
 * and risking a divergence a client would branch on.
 */
export function policyUnavailable(): ApiException {
  return new ApiException(
    UNAVAILABLE_STATUS,
    UNAVAILABLE_CODE,
    UNAVAILABLE_MESSAGE,
  );
}
