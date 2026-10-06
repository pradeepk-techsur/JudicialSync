import { ProceedingsService } from './proceedings.service';
import { ProceedingActivityProbe } from './proceeding-activity.probe';
import { ApiException } from '../../common/errors/api-error';

/**
 * ============================================================================
 * CASE_PROCEEDING_IN_USE — the rule, proven against a stubbed activity probe
 * ============================================================================
 *
 * `FRD/F01` Validation: "A proceeding cannot be deleted once it has associated
 * exhibit or Speedy Trial activity — it may only be marked `closed`."
 *
 * In Phase 1 neither activity table exists, so the real
 * `Phase1ProceedingActivityProbe` always returns `false` and the forbidden path
 * cannot be reached over HTTP. The rule is written in its FINAL form now
 * (plan 01-09) so Phase 5 (exhibits) and Phase 7 (defendant trackers) inherit
 * it rather than rediscovering it — and the way to exercise it is exactly this:
 * supply a stub probe that reports activity, and assert the `409
 * CASE_PROCEEDING_IN_USE` path fires for a delete-style transition while
 * `closed` still succeeds.
 *
 * This is a hermetic unit test: the Prisma client and the audit path are
 * stubbed, so it runs under `npm test` on every commit with no Docker stack.
 * The live-stack `cases-api` suite covers the happy-path proceeding lifecycle;
 * this covers the one branch that only a stubbed probe can reach.
 */
describe('ProceedingsService: the CASE_PROCEEDING_IN_USE rule', () => {
  const PROCEEDING = {
    id: 'p-1',
    case_id: 'c-1',
    proceeding_type: 'trial',
    status: 'open',
    presiding_judge_id: null,
  };

  /** A Prisma double with just the methods this path touches. */
  const prismaStub = {
    cases: { findUnique: jest.fn().mockResolvedValue({ id: 'c-1' }) },
    proceedings: {
      findFirst: jest.fn().mockResolvedValue(PROCEEDING),
      update: jest.fn().mockImplementation(({ data }: { data: { status: string } }) =>
        Promise.resolve({ ...PROCEEDING, status: data.status }),
      ),
    },
    // withAudit wraps work in $transaction; run the callback with the stub as
    // the tx client, and ignore the audit write (record is a no-op here).
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn(prismaStub),
    ),
  };

  const auditStub = { record: jest.fn().mockResolvedValue({ id: 'a', row_hash: 'h', occurred_at: new Date() }) };

  // audit_chain_head lookup inside AuditService.record is bypassed because we
  // stub record itself; but withAudit calls audit.record, which we replace.
  const activeProbe: ProceedingActivityProbe = { hasActivity: async () => true };
  const inactiveProbe: ProceedingActivityProbe = { hasActivity: async () => false };

  const principal = {
    user_id: 'u-1',
    session_id: 's-1',
    mfa_satisfied: true,
    roles: [],
    scopes: [],
    entitlements: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prismaStub.cases.findUnique.mockResolvedValue({ id: 'c-1' });
    prismaStub.proceedings.findFirst.mockResolvedValue(PROCEEDING);
  });

  it('refuses a non-closed transition when the probe reports activity → 409', async () => {
    const svc = new ProceedingsService(
      prismaStub as never,
      auditStub as never,
      activeProbe,
    );

    await expect(
      // 'superseded' is not a valid proceeding status, but any non-'closed'
      // target exercises the activity guard before the write; use 'open'
      // (a reopen) which IS a valid status and is the delete-style case.
      svc.updateProceedingStatus(principal as never, 'c-1', 'p-1', 'open'),
    ).rejects.toMatchObject({
      errorCode: 'CASE_PROCEEDING_IN_USE',
    } as Partial<ApiException>);
  });

  it('permits `closed` even when the probe reports activity', async () => {
    const svc = new ProceedingsService(
      prismaStub as never,
      auditStub as never,
      activeProbe,
    );

    const result = await svc.updateProceedingStatus(
      principal as never,
      'c-1',
      'p-1',
      'closed',
    );
    expect(result.status).toBe('closed');
  });

  it('permits a reopen when there is no activity (Phase 1 default)', async () => {
    const svc = new ProceedingsService(
      prismaStub as never,
      auditStub as never,
      inactiveProbe,
    );

    const result = await svc.updateProceedingStatus(
      principal as never,
      'c-1',
      'p-1',
      'open',
    );
    expect(result.status).toBe('open');
  });
});
