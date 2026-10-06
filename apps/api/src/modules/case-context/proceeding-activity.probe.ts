import { Injectable } from '@nestjs/common';

/**
 * ============================================================================
 * "HAS THIS PROCEEDING ACCUMULATED ACTIVITY THAT FORBIDS ITS DELETION?"
 * ============================================================================
 *
 * `FRD/F01` Validation: "A proceeding cannot be deleted once it has associated
 * exhibit or Speedy Trial activity — it may only be marked `closed`."
 *
 * The rule is written in its **final** form now, in Phase 1, even though
 * neither contributing table exists yet:
 *
 *  - `exhibits` arrives in **Phase 5** (Evidentiary Tracking, F14+), and
 *  - `defendant_trackers` arrives in **Phase 7** (Speedy Trial, F26+).
 *
 * The Phase 1 implementation returns `false` for every proceeding — nothing has
 * activity yet, because the activity tables do not exist. But the *rule* that
 * consults it, and the `409 CASE_PROCEEDING_IN_USE` path it guards, are
 * implemented and reachable today. Writing the rule now and supplying the data
 * later is what keeps Phase 5 from having to rediscover that proceedings are
 * not freely deletable.
 *
 * The interface is the seam. Phase 5 and Phase 7 provide a real implementation
 * (or override this token) that queries their tables; the service that depends
 * on this never changes. A test can supply a stub returning `true` to exercise
 * the `CASE_PROCEEDING_IN_USE` path — which is the only way to reach it in
 * Phase 1, and is how `cases-api.e2e-spec.ts` proves the path exists.
 */
export interface ProceedingActivityProbe {
  /**
   * @returns `true` if the proceeding has exhibit or Speedy-Trial activity
   *   that forbids anything stronger than a `closed` transition.
   */
  hasActivity(proceedingId: string): Promise<boolean>;
}

/** DI token for {@link ProceedingActivityProbe}. */
export const PROCEEDING_ACTIVITY_PROBE = Symbol('PROCEEDING_ACTIVITY_PROBE');

/**
 * Phase 1 implementation: no activity table exists, so nothing has activity.
 *
 * Deliberately NOT a stub in the pejorative sense — it is the correct answer
 * for Phase 1, where the exhibit and tracker tables are not yet built. Phases 5
 * and 7 replace the provider bound to {@link PROCEEDING_ACTIVITY_PROBE} with one
 * that reads their tables.
 */
@Injectable()
export class Phase1ProceedingActivityProbe implements ProceedingActivityProbe {
  async hasActivity(): Promise<boolean> {
    return false;
  }
}
