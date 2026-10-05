import { Module } from '@nestjs/common';

/**
 * **Identity & ABAC Module — grant workflow** —
 * `TechArch/01-components.md` §4.1 · FRD F00.
 *
 * Responsibility: entitlements as first-class, separately grantable records.
 * A user holds roles AND zero or more independently granted entitlements;
 * role existence never implies access (CONTEXT, hard constraint). Every grant
 * carries its own requester, approver, timestamp and audit event.
 *
 * Phase 1 owner: plan **01-09** — the two-step request → approve workflow with
 * server-side separation of duties. The API must REFUSE an approval where
 * `approver == requester` with `403 AUTH_SOD_VIOLATION`; "the audit trail will
 * catch it" was explicitly rejected as insufficient.
 *
 * Split from `identity` deliberately: the grant workflow is a distinct
 * surface with its own authorization story, and keeping it separate lets
 * plans 01-06 and 01-09 run in parallel without file contention.
 */
@Module({})
export class EntitlementsModule {}
