import { z } from 'zod';

/**
 * ============================================================================
 * THE EFFECTIVE CONFIGURATION SHAPE — read from the database, never a constant
 * ============================================================================
 *
 * CONTEXT, verbatim: "Features must read configuration from the database from
 * day one, never from hardcoded constants." Every configurable value Phase 1
 * uses — the file-type allowlist, the session timings, the claim cache window,
 * the per-court designation policy — is a field below, and the only lawful
 * source for it is a court's published `rule_package_versions.config_snapshot`
 * plus its `security_policies` rows.
 *
 * ## Why the snapshot is parsed with `zod` rather than cast
 *
 * `config_snapshot` is a `Json` column. A `as EffectiveCourtConfigSnapshot`
 * cast would make a malformed or partially-migrated snapshot look well-typed
 * to the compiler and then surface as `undefined` deep inside a security
 * check — the file-type allowlist silently `undefined`, so every MIME type is
 * "allowed"; `claim_cache_seconds` silently `undefined`, so a cache TTL is
 * `NaN`. Those are the failures a configuration-driven system must make
 * impossible, so the snapshot is validated at read time and a parse failure is
 * a loud `500 CONFIG_INVALID_SNAPSHOT` (`FRD/Y2-errors.md`: a code "reserved
 * for internal-guard violations that should structurally never occur"), not a
 * quiet default.
 */

/** The `session` block of a court's configuration snapshot. */
export const SessionConfigSchema = z
  .object({
    access_token_ttl_seconds: z.number().int().positive(),
    refresh_token_ttl_seconds: z.number().int().positive(),
    idle_timeout_minutes: z.number().int().positive(),
    claim_cache_seconds: z.number().int().nonnegative(),
    concurrent_session_limit: z.number().int().positive(),
  })
  // Reject unknown keys: a snapshot that has drifted from this shape is a
  // configuration defect, and letting an unrecognised field through would let
  // a typo'd session setting read as absent.
  .strict();

export type SessionConfig = z.infer<typeof SessionConfigSchema>;

/**
 * The validated `config_snapshot`.
 *
 * Matches the Phase 1 seed (`apps/api/prisma/seed/configuration.ts`). Phase 2
 * may ADD fields; this schema is permissive about additive growth only through
 * a deliberate edit here, not silently — `.strict()` makes an unexpected field
 * a parse error so the schema and the snapshot cannot drift unnoticed.
 */
export const EffectiveCourtConfigSnapshotSchema = z
  .object({
    file_type_allowlist: z.array(z.string().min(1)).min(1),
    session: SessionConfigSchema,
    max_upload_bytes: z.number().int().positive(),
  })
  .strict();

export type EffectiveCourtConfigSnapshot = z.infer<
  typeof EffectiveCourtConfigSnapshotSchema
>;

/**
 * One designation → required-entitlement mapping, joined from the court's
 * `security_policies` rows.
 *
 * This is the array `AbacGuard` forwards to OPA as `input.security_policies`,
 * which is what keeps `FRD/F13` Process step 4 true: designation access is
 * "evaluated against the centrally-defined policy engine (not per-feature
 * if/else logic)."
 */
export interface SecurityPolicyMapping {
  designation: string;
  required_entitlement: string;
}

/**
 * The court's complete effective configuration, as every other module needs
 * it. Returned by {@link CourtConfigService.getEffective}.
 */
export interface EffectiveCourtConfig {
  /** `rule_package_versions.id` that produced this configuration. */
  rule_package_version_id: string;
  version_number: number;
  file_type_allowlist: string[];
  session: SessionConfig;
  max_upload_bytes: number;
  security_policies: SecurityPolicyMapping[];
}

/**
 * The `RulePackageVersion` response shape from `TechArch/03a-api-shared.md`
 * §6.4 — what `GET /config/rule-packages/{court_id}/effective` returns, which
 * Phase 2's admin UI binds to.
 */
export interface RulePackageVersionResponse {
  id: string;
  court_id: string;
  version_number: number;
  drafted_by: string;
  approved_by: string | null;
  effective_from: string | null;
  published_at: string | null;
  config_snapshot: EffectiveCourtConfigSnapshot;
}

/** The `court_profile` response shape for `GET /config/court-profiles/{id}`. */
export interface CourtProfileResponse {
  id: string;
  court_id: string;
}
