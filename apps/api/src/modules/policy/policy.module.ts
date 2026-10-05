import { Module } from '@nestjs/common';

/**
 * **Policy Decision Point (PDP) client** —
 * `TechArch/01-components.md` §4.1 · FRD F00 / F13.
 *
 * Responsibility: centralized ABAC evaluation. This module is the HTTP client
 * for the Open Policy Agent container; the policy LOGIC itself lives in Rego
 * inside OPA, not in TypeScript. TechArch chose OPA specifically to avoid
 * three independently-implemented, independently-buggy ABAC checks across the
 * three services — so do not reimplement policy here.
 *
 * Phase 1 owner: plan **01-07** (PDP client + Rego bundle), consumed by
 * `AbacGuard`. Until it lands, `AbacGuard` denies every unmarked route with
 * `503 SECURITY_POLICY_UNAVAILABLE` — the same fail-closed response the real
 * client must produce when OPA is unreachable or evaluation errors
 * (`FRD/Y2-errors.md` principle 1).
 */
@Module({})
export class PolicyModule {}
