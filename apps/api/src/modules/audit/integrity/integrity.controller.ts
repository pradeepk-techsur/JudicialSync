import { Controller, Get, HttpCode, Post } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Resource } from '../../policy/resource-descriptor.decorator';
import { IntegrityStatusService } from './integrity-status.service';
import { IntegrityProcessor } from './integrity.processor';

/** One open integrity alert, as the Explorer surfaces it. */
interface IntegrityAlertDto {
  id: string;
  alert_type: string;
  severity: string;
  audit_event_id: string | null;
  expected_hash: string | null;
  actual_hash: string | null;
  detail: unknown;
  detected_at: string;
  status: string;
}

/**
 * ============================================================================
 * `GET /audit/integrity/status`, `/alerts`, and `POST /verify`
 * ============================================================================
 *
 * These back `Screen-17`'s chain-integrity badge and surface detected breaks
 * into the Audit Explorer. CONTEXT: a detected break "surfaces in the Audit
 * Explorer" — these endpoints are how.
 *
 * ## All three require `audit_reader`
 *
 * The badge and the alert list are part of the Explorer, so they carry the same
 * entitlement as the Explorer itself: `@Resource({type:'audit_event',
 * action:'read'})`. The on-demand verify is `action:'approve'`, which plan
 * 01-02's map also binds to `audit_reader` — it is a privileged, expensive
 * operation (a full re-walk) and must not be reachable by an unauthenticated or
 * merely operational caller. Both bindings already exist in `policy/README.md`.
 *
 * ## No Phase 3 work queue
 *
 * The alerts route reads `integrity_alerts` as-is. It creates no F07 rows, no
 * queue, and no resolution workflow — Phase 3 (F07) owns those and will route
 * these same rows. This controller only reports.
 */
@Controller()
export class IntegrityController {
  constructor(
    private readonly status: IntegrityStatusService,
    private readonly processor: IntegrityProcessor,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The chain-integrity badge's data: verified?, when last checked, open count.
   */
  @Get('audit/integrity/status')
  @Resource({ type: 'audit_event', action: 'read' })
  async getStatus(): Promise<{
    chain_verified: boolean;
    last_verified_at: string | null;
    open_alert_count: number;
  }> {
    return this.status.getStatus();
  }

  /** The open integrity alerts, newest first. */
  @Get('audit/integrity/alerts')
  @Resource({ type: 'audit_event', action: 'read' })
  async getAlerts(): Promise<{ alerts: IntegrityAlertDto[] }> {
    const rows = await this.prisma.integrity_alerts.findMany({
      where: { status: 'open' },
      orderBy: { detected_at: 'desc' },
    });
    return {
      alerts: rows.map((row) => ({
        id: row.id,
        alert_type: row.alert_type,
        severity: row.severity,
        audit_event_id: row.audit_event_id,
        expected_hash: row.expected_hash,
        actual_hash: row.actual_hash,
        detail: row.detail,
        detected_at: row.detected_at.toISOString(),
        status: row.status,
      })),
    };
  }

  /**
   * Trigger an on-demand full re-walk.
   *
   * Enqueued with a fixed job id so only one run can be in flight — a full
   * re-walk is expensive and an unbounded trigger is a DoS lever (threat
   * T-01-54). Returns 202: the verification runs asynchronously, and its outcome
   * is read back through `/status` and `/alerts`.
   */
  @Post('audit/integrity/verify')
  @Resource({ type: 'audit_event', action: 'approve' })
  @HttpCode(202)
  async verify(): Promise<{ accepted: boolean }> {
    await this.processor.triggerOnDemand();
    return { accepted: true };
  }
}
