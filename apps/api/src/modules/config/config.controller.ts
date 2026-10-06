import { Controller, Get, Param } from '@nestjs/common';

import { ApiException } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Resource } from '../policy/resource-descriptor.decorator';
import { CourtConfigService } from './court-config.service';
import {
  CourtProfileResponse,
  RulePackageVersionResponse,
} from './config.types';

/**
 * ============================================================================
 * THE CONFIGURATION READ SURFACE — two read endpoints, and only two
 * ============================================================================
 *
 * `FRD/Y1a-api-shared.md` §Configuration specifies exactly two Phase 1 routes:
 *
 *   | GET | /config/court-profiles/{court_id}            | { court_profile }        |
 *   | GET | /config/rule-packages/{court_id}/effective   | { rule_package_version } |
 *
 * ## Phase 2 owns authoring — the absence of write routes is deliberate
 *
 * The rule-package CREATE route and the rule-package PUBLISH route are
 * **Phase 2** (F3: the Configuration Engine's maker-checker approval flow and
 * admin UI). They are intentionally not implemented here, and the
 * configuration tables are SELECT-only for `app_rw` at the grant level (plan
 * 01-03), so an attempt to add them to this controller would fail at the
 * database before it failed at review. This comment names Phase 2 so the
 * omission reads as deliberate rather than forgotten.
 *
 * ## Authorization
 *
 * Both routes carry `@Resource({type:'court_config', action:'read'})`. Plan
 * 01-02's `action_entitlement_map` binds `court_config`/`read` to the
 * `case_read` entitlement, and plan 01-07's loader resolves a `court_config`
 * resource against the `courts` row named by `{court_id}`, so cross-court
 * reads are denied by the same multi-tenancy boundary that protects a case.
 * Reading one's own court's operating configuration is appropriate for any user
 * with case access — it contains no secrets (session timings, an upload
 * allowlist, a designation→entitlement map that is itself public policy).
 */
@Controller('config')
export class ConfigController {
  constructor(
    private readonly config: CourtConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('court-profiles/:court_id')
  @Resource({ type: 'court_config', action: 'read', idParam: 'court_id' })
  async courtProfile(
    @Param('court_id') courtId: string,
  ): Promise<{ court_profile: CourtProfileResponse }> {
    const profile = await this.prisma.court_profiles.findUnique({
      where: { court_id: courtId },
      select: { id: true, court_id: true },
    });

    // The guard has already confirmed the caller may read this court's
    // configuration and that the court exists (the loader 404s an unknown
    // court). A missing PROFILE row for a known court is a genuine not-found.
    if (profile === null) {
      throw new ApiException(
        404,
        'COURT_CONFIG_NOT_FOUND',
        'Court configuration not found or not accessible',
      );
    }

    return { court_profile: { id: profile.id, court_id: profile.court_id } };
  }

  @Get('rule-packages/:court_id/effective')
  @Resource({ type: 'court_config', action: 'read', idParam: 'court_id' })
  async effectiveRulePackage(
    @Param('court_id') courtId: string,
  ): Promise<{ rule_package_version: RulePackageVersionResponse }> {
    // Resolve the effective version through the SINGLE read path, so a
    // malformed snapshot is caught here with CONFIG_INVALID_SNAPSHOT exactly as
    // it would be for any other consumer — rather than returned raw to the
    // Phase 2 admin UI that binds to this shape.
    const effective = await this.config.getEffective(courtId);

    const version = await this.prisma.rule_package_versions.findUnique({
      where: { id: effective.rule_package_version_id },
      select: {
        id: true,
        court_id: true,
        version_number: true,
        drafted_by: true,
        approved_by: true,
        effective_from: true,
        published_at: true,
      },
    });

    // getEffective resolved this id from the same table moments ago, so a null
    // here is a concurrent deletion no running code performs (configuration is
    // SELECT-only for app_rw). Treating it as CONFIG_NOT_FOUND keeps the
    // internal-guard framing rather than inventing a 500.
    if (version === null) {
      throw new ApiException(
        500,
        'CONFIG_NOT_FOUND',
        'Court configuration is unavailable',
      );
    }

    return {
      rule_package_version: {
        id: version.id,
        court_id: version.court_id,
        version_number: version.version_number,
        drafted_by: version.drafted_by,
        approved_by: version.approved_by,
        effective_from: version.effective_from?.toISOString() ?? null,
        published_at: version.published_at?.toISOString() ?? null,
        config_snapshot: {
          file_type_allowlist: effective.file_type_allowlist,
          session: effective.session,
          max_upload_bytes: effective.max_upload_bytes,
        },
      },
    };
  }
}
