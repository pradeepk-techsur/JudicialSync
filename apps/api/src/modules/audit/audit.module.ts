import { Module } from '@nestjs/common';

/**
 * **Audit Service** — `TechArch/01-components.md` §4.1 · FRD F02.
 *
 * Responsibility: append-only, hash-chained audit event capture
 * (`prev_hash` / `row_hash`), transactional-outbox coordination with domain
 * writes, and the Audit Explorer query API gated on the `audit_reader`
 * entitlement (separation of duties).
 *
 * Phase 1 owners: plan **01-05** (capture + outbox + Explorer API) and plan
 * **01-12** (the BullMQ hash-chain verification job, which writes a persistent
 * `integrity_alert` record on a detected break — log-only was rejected as too
 * easy to miss).
 *
 * The append-only guarantee is enforced at the DATABASE GRANT level — the
 * application role holds no UPDATE or DELETE on `audit_events` — not merely by
 * application convention. Plan 01-14 proves this by attempting the writes.
 */
@Module({})
export class AuditModule {}
