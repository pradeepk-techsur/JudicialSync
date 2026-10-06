import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { withAudit } from '../audit/with-audit';

/** The capability every bootstrap identity is granted. */
const BOOTSTRAP_ENTITLEMENT = 'access_admin';

/**
 * ============================================================================
 * THE CONSTRAINED, SELF-CLOSING BOOTSTRAP
 * ============================================================================
 *
 * CONTEXT permits this mechanism **only** because an empty system cannot
 * satisfy the two-person approval rule — there is no second person yet — and
 * then constrains it tightly. Every constraint is implemented literally here,
 * and `docs/ASSUMPTIONS.md` ASM-03 records that the whole thing is a
 * development-constraint workaround requiring security and stakeholder
 * validation before production.
 *
 * ## It does NOT bypass separation of duties — it supplies the second person
 *
 * This is the single most important property and the easiest to get wrong. A
 * bootstrap grant still writes an `access_grant_requests` row with
 * `requested_by` = an admin subject and `decided_by` = a DISTINCT approver
 * subject, both drawn from configuration. So the table CHECK
 * (`decided_by <> requested_by`) and the Rego `sod_deny` rule both still hold
 * over bootstrap rows. The two configured lists must be **disjoint**; if they
 * intersect the application FAILS TO START, because a bootstrap that
 * self-approves is not a bootstrap, it is a backdoor.
 *
 * ## Identities come only from the environment, never from whoever signs in
 *
 * The admin and approver identities are read from `BOOTSTRAP_ADMIN_SUBJECTS`
 * and `BOOTSTRAP_APPROVER_SUBJECTS` (comma-separated `external_idp_subject`
 * values). If either is empty, bootstrap is simply UNAVAILABLE — the system
 * does NOT fall back to promoting whoever authenticates earliest. Deriving the
 * administrator from the earliest sign-in is the single most common way a
 * bootstrap becomes a privilege-escalation vector, and CONTEXT forbids it by
 * name. Nothing in this file reads a session, a sign-in, or any "earliest"
 * account.
 *
 * ## It closes itself, permanently
 *
 * `POST /bootstrap/complete` sets `bootstrap_state.completed_at`. After that:
 * every operation here throws `403 BOOTSTRAP_CLOSED`, startup grants nothing,
 * and the completion cannot be performed by a principal whose own `access_admin`
 * was bootstrap-granted (otherwise the bootstrap would close itself using the
 * very authority it created). Startup logs a warning if the env lists are still
 * present after completion, instructing the operator to remove them.
 */
@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The configured admin subjects, trimmed and de-duplicated. Empty if unset. */
  adminSubjects(): string[] {
    return parseSubjects(process.env.BOOTSTRAP_ADMIN_SUBJECTS);
  }

  /** The configured approver subjects, trimmed and de-duplicated. */
  approverSubjects(): string[] {
    return parseSubjects(process.env.BOOTSTRAP_APPROVER_SUBJECTS);
  }

  /**
   * Run bootstrap at application startup.
   *
   * Idempotent: re-running with the volume persisted must not duplicate grants.
   * Fails startup (throws) if the two configured lists intersect — a
   * self-approving bootstrap is refused by construction rather than silently
   * proceeded with.
   */
  async onModuleInit(): Promise<void> {
    const admins = this.adminSubjects();
    const approvers = this.approverSubjects();

    // Disjointness is checked FIRST and unconditionally, even after completion
    // and even when bootstrap would otherwise be a no-op: a misconfiguration
    // that would let the path self-approve must stop the process wherever it is
    // found, not wait until the path happens to run.
    const overlap = admins.filter((s) => approvers.includes(s));
    if (overlap.length > 0) {
      throw new Error(
        `BOOTSTRAP_ADMIN_SUBJECTS and BOOTSTRAP_APPROVER_SUBJECTS must be ` +
          `disjoint — a bootstrap that approves its own grant is a backdoor, ` +
          `not a bootstrap. Overlapping subject(s): ${overlap.join(', ')}.`,
      );
    }

    const state = await this.state();
    if (state.completed_at !== null) {
      // Already closed. Grant nothing, and nag the operator if the env is still
      // set — CONTEXT: "An explicit bootstrap-completion step must disable or
      // rotate them before normal operation."
      if (admins.length > 0 || approvers.length > 0) {
        this.logger.warn(
          'Bootstrap is already completed, but BOOTSTRAP_ADMIN_SUBJECTS / ' +
            'BOOTSTRAP_APPROVER_SUBJECTS are still set. Remove them: leaving ' +
            'bootstrap credentials configured after completion is exactly what ' +
            'the completion step exists to end.',
        );
      }
      return;
    }

    if (admins.length === 0 || approvers.length === 0) {
      // Bootstrap is UNAVAILABLE without both lists. This is the branch that
      // proves the system never promotes whoever authenticates earliest: with
      // no configuration there is simply nothing to grant, and no other code
      // path confers administrative authority on anyone.
      this.logger.log(
        'Bootstrap not configured (BOOTSTRAP_ADMIN_SUBJECTS / ' +
          'BOOTSTRAP_APPROVER_SUBJECTS empty); no bootstrap grants created. ' +
          'Administrative authority is granted only through the normal ' +
          'two-person workflow.',
      );
      return;
    }

    // The approver who will decide every bootstrap grant. The first configured
    // approver suffices — all that matters is that it is a distinct person from
    // each admin, which the disjointness check above already guarantees.
    const approverId = await this.ensureUser(approvers[0]);

    for (const adminSubject of admins) {
      await this.ensureBootstrapGrant(adminSubject, approverId);
    }

    this.logger.log(
      `Bootstrap complete for ${admins.length} admin subject(s). Each holds ` +
        `${BOOTSTRAP_ENTITLEMENT}, granted through the normal request→grant ` +
        `path with a distinct approver and is_bootstrap=true. Run ` +
        `POST /bootstrap/complete to close the bootstrap path before normal ` +
        `operation.`,
    );
  }

  /**
   * Ensure one admin subject holds a non-revoked `access_admin` grant, created
   * through the normal `access_grant_requests` → `entitlement_grants` path with
   * `is_bootstrap = true` on both rows.
   *
   * Idempotent: if the admin already holds a non-revoked bootstrap
   * `access_admin` grant, this does nothing — re-running on every boot must not
   * duplicate grants (compose volumes persist).
   */
  private async ensureBootstrapGrant(
    adminSubject: string,
    approverId: string,
  ): Promise<void> {
    if (await this.isClosed()) {
      throw bootstrapClosed();
    }

    const adminId = await this.ensureUser(adminSubject);

    const existing = await this.prisma.entitlement_grants.findFirst({
      where: {
        user_id: adminId,
        entitlement_key: BOOTSTRAP_ENTITLEMENT,
        is_bootstrap: true,
        revoked_at: null,
      },
      select: { id: true },
    });
    if (existing !== null) return;

    await withAudit(this.prisma, this.audit, async (tx) => {
      const request = await tx.access_grant_requests.create({
        data: {
          grant_type: 'entitlement',
          subject_user_id: adminId,
          entitlement_key: BOOTSTRAP_ENTITLEMENT,
          justification:
            'Bootstrap: environment-configured initial administrator. See ' +
            'docs/ASSUMPTIONS.md ASM-03 — development-constraint workaround.',
          // Two DISTINCT people, both from configuration — this is what makes
          // bootstrap honour SoD rather than bypass it. `requested_by` is the
          // admin subject, `decided_by` is a disjoint approver subject, so the
          // table CHECK (`decided_by <> requested_by`) and the Rego `sod_deny`
          // rule both hold over the bootstrap row exactly as over a normal one.
          // CONTEXT: "The bootstrap path does not bypass SoD; it supplies the
          // second person from configuration."
          requested_by: adminId,
          status: 'approved',
          decided_by: approverId,
          decided_at: new Date(),
          is_bootstrap: true,
        },
        select: { id: true },
      });

      const grant = await tx.entitlement_grants.create({
        data: {
          request_id: request.id,
          user_id: adminId,
          entitlement_key: BOOTSTRAP_ENTITLEMENT,
          granted_by: approverId,
          is_bootstrap: true,
        },
        select: { id: true },
      });

      return {
        result: undefined,
        audit: {
          actor_id: approverId,
          action_type: 'approval' as const,
          object_type: 'access_grant_request',
          object_id: request.id,
          after_state: {
            event: 'bootstrap_grant',
            bootstrap: true,
            subject_user_id: adminId,
            entitlement_key: BOOTSTRAP_ENTITLEMENT,
            requested_by: adminId,
            decided_by: approverId,
            grant_id: grant.id,
          },
        },
      };
    });
  }

  /**
   * Complete the bootstrap, permanently closing the path.
   *
   * Callable only by a principal holding `access_admin` that was **not** itself
   * bootstrap-granted — otherwise the bootstrap closes itself using the very
   * authority it created, which is circular. The route that calls this
   * (`POST /bootstrap/complete`) is also PDP-guarded on
   * `access_grant_request`/`approve`, so an unentitled caller never reaches
   * here; this check adds the bootstrap-granted exclusion the policy cannot see.
   */
  async complete(actorUserId: string): Promise<{ completed_at: string }> {
    if (await this.isClosed()) {
      throw bootstrapClosed();
    }

    const bootstrapGranted = await this.prisma.entitlement_grants.findFirst({
      where: {
        user_id: actorUserId,
        entitlement_key: BOOTSTRAP_ENTITLEMENT,
        is_bootstrap: true,
        revoked_at: null,
      },
      select: { id: true },
    });
    if (bootstrapGranted !== null) {
      throw new ApiException(
        403,
        'BOOTSTRAP_SELF_CLOSE_FORBIDDEN',
        'A principal whose access_admin was bootstrap-granted cannot complete ' +
          'the bootstrap; completion must be performed by a normally-granted ' +
          'administrator.',
      );
    }

    const completedAt = await withAudit(this.prisma, this.audit, async (tx) => {
      const now = new Date();
      await tx.bootstrap_state.update({
        where: { id: true },
        data: { completed_at: now, completed_by: actorUserId },
      });
      return {
        result: now,
        audit: {
          actor_id: actorUserId,
          action_type: 'config_change' as const,
          object_type: 'bootstrap_state',
          // bootstrap_state's primary key is a boolean; the audit object_id is a
          // uuid column, so the actor is used as the object reference — the event
          // is about the actor closing the path.
          object_id: actorUserId,
          after_state: {
            event: 'bootstrap_completed',
            completed_by: actorUserId,
          },
        },
      };
    });

    this.logger.warn(
      `Bootstrap completed by ${actorUserId}. The bootstrap path is now closed ` +
        `permanently. Remove BOOTSTRAP_ADMIN_SUBJECTS and ` +
        `BOOTSTRAP_APPROVER_SUBJECTS from the environment.`,
    );

    return { completed_at: completedAt.toISOString() };
  }

  /** `GET /bootstrap/status` — whether the path is still open. */
  async status(): Promise<{ completed: boolean; completed_at: string | null }> {
    const state = await this.state();
    return {
      completed: state.completed_at !== null,
      completed_at: state.completed_at?.toISOString() ?? null,
    };
  }

  /** Has the bootstrap been completed? */
  async isClosed(): Promise<boolean> {
    return (await this.state()).completed_at !== null;
  }

  private async state(): Promise<{
    completed_at: Date | null;
    completed_by: string | null;
  }> {
    const row = await this.prisma.bootstrap_state.findUnique({
      where: { id: true },
      select: { completed_at: true, completed_by: true },
    });
    if (row === null) {
      // Unreachable against a migrated database — migration 20260101000000
      // seeds the single row. Treated as "open" rather than throwing, so a
      // missing row never silently reports the path closed.
      return { completed_at: null, completed_by: null };
    }
    return row;
  }

  /**
   * Resolve (creating if absent) the user row for an IdP subject.
   *
   * Bootstrap subjects are `external_idp_subject` values from the environment,
   * which may not yet have a `users` row — the whole point is to seed the first
   * administrators before anyone has signed in. The row is created disabled of
   * nothing: it is a normal active user that will authenticate through the usual
   * OIDC flow, the only difference being that its `access_admin` arrives by the
   * bootstrap path rather than a human approver.
   */
  private async ensureUser(subject: string): Promise<string> {
    const user = await this.prisma.users.upsert({
      where: { external_idp_subject: subject },
      create: {
        external_idp_subject: subject,
        display_name: subject,
        email: `${sanitizeEmailLocalPart(subject)}@bootstrap.invalid`,
        status: 'active',
      },
      update: {},
      select: { id: true },
    });
    return user.id;
  }
}

/** Parse a comma-separated subject list, trimming and de-duplicating. */
function parseSubjects(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed !== '') seen.add(trimmed);
  }
  return [...seen];
}

/** A safe email local-part for a synthesized bootstrap user record. */
function sanitizeEmailLocalPart(subject: string): string {
  const cleaned = subject.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 64);
  return cleaned === '' ? 'bootstrap' : cleaned;
}

function bootstrapClosed(): ApiException {
  return new ApiException(
    403,
    'BOOTSTRAP_CLOSED',
    'The bootstrap path is closed; administrative authority is granted only ' +
      'through the normal two-person workflow.',
  );
}
