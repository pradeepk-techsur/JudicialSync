import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { PdpSecurityPolicy } from './pdp.types';
import { RESOURCE_TYPES, ResourceType } from './resource-descriptor.decorator';

/**
 * The resource attributes the PDP evaluates against. Shape matches
 * `PdpResource` in `pdp.types.ts`, which matches `policy/README.md` § Input.
 */
export interface LoadedResource {
  type: string;
  id: string | null;
  court_id: string | null;
  division_id: string | null;
  case_id: string | null;
  proceeding_id: string | null;
  designations: string[];
  requested_by: string | null;
}

/** Extra context a few resource types need beyond `(type, id, caseId)`. */
export interface LoadOptions {
  /**
   * The validated request body. Read ONLY for `create` actions (which have no
   * object yet) and for `disposition` (whose target is named in the body).
   * Every id taken from here is re-validated against the database before it
   * reaches the PDP — see the class comment.
   */
  body?: Record<string, unknown> | null;
  /** The acting principal's user id, for resources scoped by the actor. */
  actorUserId?: string | null;
}

/** The court's effective configuration, as the guard needs it. */
export interface EffectiveSecurityConfig {
  /** Rows for `input.security_policies`. Empty when the court has none. */
  policies: PdpSecurityPolicy[];
  /** `rule_package_versions.id` in effect, for `audit_events.rule_version_ref`. */
  rulePackageVersionId: string | null;
}

/**
 * Accepted spellings for a `(object_type, object_id)` pair naming a target.
 *
 * Two callers supply such pairs and they do not agree on spelling, which is a
 * real fact about the system rather than an inconsistency worth "fixing" here:
 *
 *  - `audit_events.object_type` holds the LOGICAL TABLE name (`"cases"`,
 *    `"security_designations"`) — see `audit.types.ts`; and
 *  - a `disposition` request body names a RESOURCE TYPE (`"case"`).
 *
 * Mapping both explicitly beats a `replace(/s$/, '')` heuristic, which would
 * turn `parties` into `partie` and silently fail to resolve. An unrecognised
 * value is absent from this map, which makes the target unresolvable, which
 * the guard turns into a 404 — never a 500 and never a pass.
 */
const OBJECT_TYPE_ALIASES: Readonly<Record<string, ResourceType>> = {
  case: 'case',
  cases: 'case',
  proceeding: 'proceeding',
  proceedings: 'proceeding',
  hearing: 'hearing',
  hearings: 'hearing',
  party: 'party',
  parties: 'party',
  docket_event: 'docket_event',
  docket_events: 'docket_event',
  document_reference: 'document_reference',
  document_references: 'document_reference',
  security_designation: 'security_designation',
  security_designations: 'security_designation',
  court_config: 'court_config',
  court: 'court_config',
  courts: 'court_config',
  audit_event: 'audit_event',
  audit_events: 'audit_event',
  file: 'file',
  file_reference: 'file',
  file_references: 'file',
  retention_schedule: 'retention_schedule',
  retention_schedules: 'retention_schedule',
  disposition: 'disposition',
  disposition_log: 'disposition',
  access_grant_request: 'access_grant_request',
  access_grant_requests: 'access_grant_request',
  entitlement_grant: 'entitlement_grant',
  entitlement_grants: 'entitlement_grant',
  encryption_key: 'encryption_key',
};

/** A UUID-shaped string. Anything else is not an id and is not queried. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ============================================================================
 * THE RESOURCE'S **REAL** ATTRIBUTES
 * ============================================================================
 *
 * `TechArch/04-security.md` §7.2 calls this the "fine-grained,
 * resource-specific checks that require loading the actual object's
 * attributes." Given a `(type, id, caseId)` triple from a route's
 * `@Resource()` descriptor, this service answers: which court does this object
 * belong to, which division, which case, which proceeding, which security
 * designations does it carry, and who requested it.
 *
 * ## Every attribute is read from the database. None is taken from the client.
 *
 * That is the single property this file exists to hold (threat T-01-27). A
 * caller who could nominate `court_id` could nominate a court they are scoped
 * to while writing into another, and the PDP — which has no way to tell a
 * loaded attribute from a supplied one — would faithfully allow it.
 *
 * The one unavoidable exception is a `create`, where the object does not exist
 * yet and its placement genuinely comes from the request. Those ids are
 * therefore **validated against the database before they are used**: a
 * body-supplied `division_id` is looked up, and the `court_id` the PDP sees is
 * the one that division actually belongs to — not the one the body claimed. A
 * mismatch between the two is refused outright (unresolvable → 404) rather
 * than reconciled, because a request naming a division in one court and a
 * court it is not in is not a request anyone makes by accident.
 *
 * ## Coverage is a correctness property, not completeness pedantry
 *
 * The table below must resolve **all fifteen** `ResourceType` values. A type
 * the loader cannot resolve produces a `null` resource, which the guard turns
 * into a 404 — so a gap here is a permanent, silent not-found on a route that
 * was supposed to work. It is the exact mirror of a missing row in plan
 * 01-02's `action_entitlement_map`, and just as quiet.
 *
 * ## Absent rows return `null`, never an exception
 *
 * A missing row is an ordinary outcome, not an error: the guard answers it
 * with the resource's `*_NOT_FOUND` 404, which is also the response a
 * blind-discovery requester gets for a sealed record they may not know exists
 * (`FRD/Y2-errors.md` principle 3). Throwing here would produce a 500 on one
 * of those paths and a 404 on the other, and the difference would itself
 * disclose that the sealed matter exists.
 */
@Injectable()
export class ResourceLoaderService {
  private readonly logger = new Logger(ResourceLoaderService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve one resource's attributes.
   *
   * @returns the attributes, or `null` when the target does not exist. The
   *   caller (`AbacGuard`) turns `null` into the resource's 404.
   */
  async load(
    type: string,
    id: string | null,
    caseId: string | null,
    options: LoadOptions = {},
  ): Promise<LoadedResource | null> {
    return this.resolve(type, id, caseId, options, 0);
  }

  /**
   * @param depth guards the two recursive types (`audit_event` and
   *   `disposition` both resolve through a target named elsewhere). A
   *   disposition of an audit event of a case is legitimate and two levels
   *   deep; anything deeper is a cycle, and a cycle here would hang a request
   *   inside a guard that runs on every call.
   */
  private async resolve(
    type: string,
    id: string | null,
    caseId: string | null,
    options: LoadOptions,
    depth: number,
  ): Promise<LoadedResource | null> {
    if (depth > 3) {
      this.logger.error(
        `Resource resolution exceeded its depth bound at type='${type}'. ` +
          `Treating the target as absent (fail closed).`,
      );
      return null;
    }

    switch (type) {
      // ---------------------------------------------------------------------
      // A capability, not an object. There is no `encryption_keys` table and
      // there is nothing to look up: the `key_custodian` entitlement IS the
      // whole decision, which is why plan 01-02's map binds BOTH of this
      // type's actions (read, rotate) to that one entitlement. Returning an
      // attribute-free resource is correct rather than a stub — with
      // `court_id: null` the policy's court check is inapplicable (not
      // auto-passed; see `policy/README.md` § Scope semantics) and the
      // entitlement requirement decides alone.
      // ---------------------------------------------------------------------
      case 'encryption_key':
        return this.empty('encryption_key');

      case 'case':
        return this.loadCase(id ?? caseId, options);

      case 'proceeding':
        return this.loadProceeding(id, caseId, options);

      case 'hearing':
        return this.loadHearing(id, caseId, options);

      case 'party':
      case 'docket_event':
        return this.loadCaseChild(type, id, caseId, options);

      case 'document_reference':
        return this.loadDocumentReference(id, caseId, options);

      case 'security_designation':
        return this.loadSecurityDesignationTarget(id, caseId, options);

      case 'court_config':
        return this.loadCourtConfig(id ?? caseId, options);

      case 'audit_event':
        return this.loadAuditEvent(id, options, depth);

      case 'file':
        return this.loadFile(id, caseId, options);

      case 'retention_schedule':
        return this.loadRetentionSchedule(id, options);

      case 'disposition':
        return this.loadDisposition(options, depth);

      case 'access_grant_request':
        return this.loadAccessGrantRequest(id, options);

      case 'entitlement_grant':
        return this.loadEntitlementGrant(id);

      default:
        // Unreachable through `@Resource()`, whose `type` is a closed union.
        // Reachable through a body-supplied `object_type`, and the honest
        // answer there is "no such resource" rather than an invented one.
        this.logger.warn(
          `No attribute resolver for resource type '${type}'. ` +
            `Known types: ${RESOURCE_TYPES.join(', ')}.`,
        );
        return null;
    }
  }

  // =========================================================================
  // THE ONE PLACE `security_designations` IS READ
  // =========================================================================

  /**
   * Active designations on one object.
   *
   * **This method is the only reader of `security_designations` in the
   * service, and the only place the `revoked_at IS NULL` predicate appears.**
   * That centralisation is the whole point, because the failure it prevents is
   * the quiet kind.
   *
   * A designation can be lawfully LIFTED — plan 01-03 added revocation columns
   * to the table precisely so a sealing order can be withdrawn without a hard
   * delete. A read path that forgets the filter keeps honouring a designation
   * that no longer applies, and the user simply sees a 403 and concludes they
   * lack the entitlement. Nobody reports it as a bug; a false *denial* is far
   * harder to notice than a false allow, and it can persist for the life of
   * the record.
   *
   * Repeating the predicate once per resource type would be thirteen chances
   * to leave it out. Stated once, it cannot be applied inconsistently. The
   * partial index `idx_security_designations_active` matches this exact
   * predicate, so the centralised form is also the fast one.
   */
  private async activeDesignationsFor(
    objectType: 'case' | 'document_reference' | 'exhibit',
    objectId: string,
  ): Promise<string[]> {
    if (!UUID_RE.test(objectId)) return [];

    const rows = await this.prisma.security_designations.findMany({
      where: { object_type: objectType, object_id: objectId, revoked_at: null },
      select: { designation: true },
    });

    return [...new Set(rows.map((row) => row.designation))].sort();
  }

  // =========================================================================
  // The case family — every type whose placement derives from a case
  // =========================================================================

  /**
   * Court / division / designations for one case.
   *
   * Returns `undefined` for a case that does not exist, which every caller
   * below propagates as a `null` resource.
   */
  private async caseAttributes(caseId: string): Promise<
    | {
        court_id: string;
        division_id: string;
        case_id: string;
        designations: string[];
      }
    | undefined
  > {
    if (!UUID_RE.test(caseId)) return undefined;

    const row = await this.prisma.cases.findUnique({
      where: { id: caseId },
      select: { id: true, court_id: true, division_id: true },
    });
    if (row === null) return undefined;

    return {
      court_id: row.court_id,
      division_id: row.division_id,
      case_id: row.id,
      designations: await this.activeDesignationsFor('case', row.id),
    };
  }

  private async loadCase(
    id: string | null,
    options: LoadOptions,
  ): Promise<LoadedResource | null> {
    // POST /cases — the case does not exist yet, so its placement comes from
    // the body and is validated below.
    if (id === null) return this.placementFromBody('case', options);

    const attributes = await this.caseAttributes(id);
    if (attributes === undefined) return null;

    return {
      type: 'case',
      id,
      court_id: attributes.court_id,
      division_id: attributes.division_id,
      case_id: attributes.case_id,
      proceeding_id: null,
      designations: attributes.designations,
      requested_by: null,
    };
  }

  private async loadProceeding(
    id: string | null,
    caseId: string | null,
    options: LoadOptions,
  ): Promise<LoadedResource | null> {
    if (id === null) {
      // POST /cases/{id}/proceedings — owning case from the route.
      return this.fromOwningCase('proceeding', null, caseId, null, options);
    }
    if (!UUID_RE.test(id)) return null;

    const row = await this.prisma.proceedings.findUnique({
      where: { id },
      select: { id: true, case_id: true },
    });
    if (row === null) return null;

    return this.fromOwningCase('proceeding', id, row.case_id, row.id, options);
  }

  private async loadHearing(
    id: string | null,
    caseId: string | null,
    options: LoadOptions,
  ): Promise<LoadedResource | null> {
    if (id === null) {
      return this.fromOwningCase('hearing', null, caseId, null, options);
    }
    if (!UUID_RE.test(id)) return null;

    const row = await this.prisma.hearings.findUnique({
      where: { id },
      select: { id: true, proceeding: { select: { id: true, case_id: true } } },
    });
    if (row === null) return null;

    return this.fromOwningCase(
      'hearing',
      id,
      row.proceeding.case_id,
      row.proceeding.id,
      options,
    );
  }

  /** `party` and `docket_event` — both hang directly off a case. */
  private async loadCaseChild(
    type: 'party' | 'docket_event',
    id: string | null,
    caseId: string | null,
    options: LoadOptions,
  ): Promise<LoadedResource | null> {
    if (id === null) {
      return this.fromOwningCase(type, null, caseId, null, options);
    }
    if (!UUID_RE.test(id)) return null;

    const owning =
      type === 'party'
        ? await this.prisma.parties.findUnique({
            where: { id },
            select: { case_id: true },
          })
        : await this.prisma.docket_events.findUnique({
            where: { id },
            select: { case_id: true },
          });
    if (owning === null) return null;

    return this.fromOwningCase(type, id, owning.case_id, null, options);
  }

  /**
   * A document reference inherits its case's designations **and may carry its
   * own**.
   *
   * `security_designations.object_type` admits `'document_reference'`
   * precisely so a single filing can be sealed inside an otherwise-open case.
   * Reading only the case's designations would publish exactly those filings.
   * The two sets are merged, and both come through the single revocation-
   * filtered helper, so lifting either one takes effect.
   */
  private async loadDocumentReference(
    id: string | null,
    caseId: string | null,
    options: LoadOptions,
  ): Promise<LoadedResource | null> {
    if (id === null) {
      return this.fromOwningCase('document_reference', null, caseId, null, options);
    }
    if (!UUID_RE.test(id)) return null;

    const row = await this.prisma.document_references.findUnique({
      where: { id },
      select: { case_id: true },
    });
    if (row === null) return null;

    const base = await this.fromOwningCase(
      'document_reference',
      id,
      row.case_id,
      null,
      options,
    );
    if (base === null) return null;

    const own = await this.activeDesignationsFor('document_reference', id);
    return {
      ...base,
      designations: [...new Set([...base.designations, ...own])].sort(),
    };
  }

  /**
   * `PATCH /cases/{id}/security-designations` — applying or lifting a
   * designation.
   *
   * The target's attributes are the CASE's, including the designations
   * currently on it. That ordering matters: lifting a seal is itself an action
   * on a sealed record, so the requester must hold the sealed entitlement to
   * perform it. Resolving to a bare case with no designations would let anyone
   * holding `case_security_admin` unseal a record they may not read.
   */
  private async loadSecurityDesignationTarget(
    id: string | null,
    caseId: string | null,
    options: LoadOptions,
  ): Promise<LoadedResource | null> {
    const target = id ?? caseId;
    if (target === null) return this.placementFromBody('security_designation', options);

    const attributes = await this.caseAttributes(target);
    if (attributes === undefined) return null;

    return {
      type: 'security_designation',
      id: target,
      court_id: attributes.court_id,
      division_id: attributes.division_id,
      case_id: attributes.case_id,
      proceeding_id: null,
      designations: attributes.designations,
      requested_by: null,
    };
  }

  /** Shared tail for everything that derives its placement from a case. */
  private async fromOwningCase(
    type: string,
    id: string | null,
    caseId: string | null,
    proceedingId: string | null,
    options: LoadOptions,
  ): Promise<LoadedResource | null> {
    const resolved = caseId ?? this.bodyString(options.body, 'case_id');
    if (resolved === null) return null;

    const attributes = await this.caseAttributes(resolved);
    if (attributes === undefined) return null;

    return {
      type,
      id,
      court_id: attributes.court_id,
      division_id: attributes.division_id,
      case_id: attributes.case_id,
      proceeding_id: proceedingId,
      designations: attributes.designations,
      requested_by: null,
    };
  }

  // =========================================================================
  // Court-scoped and actor-scoped types
  // =========================================================================

  /**
   * The one type whose id **is** a court id.
   *
   * `GET /config/court-profiles/{court_id}` names a court directly, so this
   * resolves against `courts` rather than through a case. Routing it through
   * the case family would find nothing and 404 every configuration read.
   */
  private async loadCourtConfig(
    courtId: string | null,
    options: LoadOptions,
  ): Promise<LoadedResource | null> {
    const target = courtId ?? this.bodyString(options.body, 'court_id');
    if (target === null || !UUID_RE.test(target)) return null;

    const row = await this.prisma.courts.findUnique({
      where: { id: target },
      select: { id: true },
    });
    if (row === null) return null;

    return {
      type: 'court_config',
      id: row.id,
      court_id: row.id,
      division_id: null,
      case_id: null,
      proceeding_id: null,
      designations: [],
      requested_by: null,
    };
  }

  private async loadRetentionSchedule(
    id: string | null,
    options: LoadOptions,
  ): Promise<LoadedResource | null> {
    // GET /retention/schedules?court_id=… — a collection read scoped by query
    // parameter rather than a single row.
    if (id === null) {
      const courtId = this.bodyString(options.body, 'court_id');
      if (courtId === null) return this.empty('retention_schedule');

      const court = await this.prisma.courts.findUnique({
        where: { id: courtId },
        select: { id: true },
      });
      if (court === null) return null;

      return { ...this.empty('retention_schedule'), court_id: court.id };
    }

    if (!UUID_RE.test(id)) return null;
    const row = await this.prisma.retention_schedules.findUnique({
      where: { id },
      select: { id: true, court_id: true },
    });
    if (row === null) return null;

    return {
      type: 'retention_schedule',
      id: row.id,
      court_id: row.court_id,
      division_id: null,
      case_id: null,
      proceeding_id: null,
      designations: [],
      requested_by: null,
    };
  }

  /**
   * A file reference.
   *
   * `file_references` carries no `case_id` in the Phase 1 schema — a file is
   * uploaded first and associated afterwards — so an uploaded-but-unbound file
   * takes its court from **the uploading user**. That keeps the multi-tenancy
   * boundary applicable to a file that would otherwise have no court at all,
   * which would make the court check inapplicable and leave the entitlement
   * requirement as the only gate on a cross-court read.
   */
  private async loadFile(
    id: string | null,
    caseId: string | null,
    options: LoadOptions,
  ): Promise<LoadedResource | null> {
    // POST /files/upload — no row yet; the uploader's court is the placement.
    if (id === null) {
      const courtId = await this.courtOfUser(options.actorUserId ?? null);
      return { ...this.empty('file'), court_id: courtId };
    }
    if (!UUID_RE.test(id)) return null;

    const row = await this.prisma.file_references.findUnique({
      where: { id },
      select: { id: true, uploaded_by: true },
    });
    if (row === null) return null;

    // When the route also names an owning case, the file is case-bound and
    // inherits that case's court, division and designations — a sealed case's
    // attachments are sealed.
    if (caseId !== null) {
      const attributes = await this.caseAttributes(caseId);
      if (attributes !== undefined) {
        return {
          type: 'file',
          id: row.id,
          court_id: attributes.court_id,
          division_id: attributes.division_id,
          case_id: attributes.case_id,
          proceeding_id: null,
          designations: attributes.designations,
          requested_by: null,
        };
      }
    }

    return {
      ...this.empty('file'),
      id: row.id,
      court_id: await this.courtOfUser(row.uploaded_by),
    };
  }

  /**
   * An access grant request — the one type that populates `requested_by`.
   *
   * That field is what `sod.rego` compares against `principal.user_id` to
   * refuse a self-approval. It is read from the database row, never from the
   * request: a caller able to supply it could name somebody else and approve
   * their own grant.
   */
  private async loadAccessGrantRequest(
    id: string | null,
    options: LoadOptions,
  ): Promise<LoadedResource | null> {
    // POST /entitlements/requests — creating a request. No row yet, and no
    // `requested_by`: SoD binds the APPROVAL, not the request.
    if (id === null) {
      const courtId =
        this.bodyString(options.body, 'court_id') ??
        (await this.courtOfUser(options.actorUserId ?? null));
      if (courtId === null) return this.empty('access_grant_request');

      const court = await this.prisma.courts.findUnique({
        where: { id: courtId },
        select: { id: true },
      });
      if (court === null) return null;

      return { ...this.empty('access_grant_request'), court_id: court.id };
    }

    if (!UUID_RE.test(id)) return null;
    const row = await this.prisma.access_grant_requests.findUnique({
      where: { id },
      select: {
        id: true,
        court_id: true,
        division_id: true,
        requested_by: true,
        subject_user_id: true,
      },
    });
    if (row === null) return null;

    return {
      type: 'access_grant_request',
      id: row.id,
      court_id: row.court_id ?? (await this.courtOfUser(row.subject_user_id)),
      division_id: row.division_id,
      case_id: null,
      proceeding_id: null,
      designations: [],
      requested_by: row.requested_by,
    };
  }

  /**
   * A materialized entitlement grant, targeted by `POST
   * /entitlements/grants/{id}/revoke`.
   *
   * `requested_by` is deliberately left `null`. Revocation is single-step by
   * design — removing access is not the dangerous direction — so SoD must not
   * fire on it, and the way to express that is to give `sod.rego` nothing to
   * compare rather than to special-case the action inside the policy
   * (`policy/README.md` § "Four rows that encode a decision").
   */
  private async loadEntitlementGrant(
    id: string | null,
  ): Promise<LoadedResource | null> {
    if (id === null || !UUID_RE.test(id)) return null;

    const row = await this.prisma.entitlement_grants.findUnique({
      where: { id },
      select: { id: true, user_id: true },
    });
    if (row === null) return null;

    return {
      ...this.empty('entitlement_grant'),
      id: row.id,
      court_id: await this.courtOfUser(row.user_id),
    };
  }

  // =========================================================================
  // The two recursive types
  // =========================================================================

  /**
   * An audit row inherits the designations of whatever it describes.
   *
   * `FRD/F02` Validation requires audit entries about a sealed matter be
   * themselves gated on the sealed entitlement — otherwise the Audit Explorer
   * becomes a side channel that reports a sealed case's status changes to
   * anyone holding `audit_reader`. So the audited object is resolved through
   * this same table and its court, case and designations are adopted wholesale.
   */
  private async loadAuditEvent(
    id: string | null,
    options: LoadOptions,
    depth: number,
  ): Promise<LoadedResource | null> {
    // GET /audit/explorer — a filtered collection read, not a single row. The
    // per-row designation gate is the Explorer's own (plan 01-12); here the
    // entitlement requirement (`audit_reader`) is the decision.
    if (id === null) return this.empty('audit_event');
    if (!UUID_RE.test(id)) return null;

    const row = await this.prisma.audit_events.findUnique({
      where: { id },
      select: { id: true, object_type: true, object_id: true },
    });
    if (row === null) return null;

    const inherited = await this.resolveTarget(
      row.object_type,
      row.object_id,
      options,
      depth + 1,
    );

    return {
      type: 'audit_event',
      id: row.id,
      court_id: inherited?.court_id ?? null,
      division_id: inherited?.division_id ?? null,
      case_id: inherited?.case_id ?? null,
      proceeding_id: inherited?.proceeding_id ?? null,
      designations: inherited?.designations ?? [],
      requested_by: null,
    };
  }

  /**
   * A disposition is an action ON something else, and must be as hard to
   * perform as reading that something else.
   *
   * `POST /retention/dispositions` names its target in the body
   * (`object_type`, `object_id`). Resolving that target through this same
   * table means disposing of a sealed case requires the sealed entitlement —
   * which is the point, since destroying a record is strictly more
   * consequential than reading it, and gating the destructive action more
   * weakly than the read would be the wrong way round.
   *
   * An unresolvable target is a 404, never a 500: a body naming a nonexistent
   * object is an ordinary bad request, and a stack trace would be the only
   * thing distinguishing it from a sealed object the caller may not know about.
   */
  private async loadDisposition(
    options: LoadOptions,
    depth: number,
  ): Promise<LoadedResource | null> {
    const objectType = this.bodyRawString(options.body, 'object_type');
    const objectId = this.bodyString(options.body, 'object_id');
    if (objectType === null || objectId === null) return null;

    const target = await this.resolveTarget(
      objectType,
      objectId,
      options,
      depth + 1,
    );
    if (target === null) return null;

    return {
      type: 'disposition',
      id: null,
      court_id: target.court_id,
      division_id: target.division_id,
      case_id: target.case_id,
      proceeding_id: target.proceeding_id,
      designations: target.designations,
      requested_by: null,
    };
  }

  /** Resolve a `(object_type, object_id)` pair through the alias map. */
  private async resolveTarget(
    objectType: string,
    objectId: string,
    options: LoadOptions,
    depth: number,
  ): Promise<LoadedResource | null> {
    const canonical = OBJECT_TYPE_ALIASES[objectType.toLowerCase()];
    if (canonical === undefined) {
      this.logger.warn(
        `Unrecognised object_type '${objectType}'; treating the target as ` +
          `absent. Add it to OBJECT_TYPE_ALIASES if it is a real type.`,
      );
      return null;
    }

    // A disposition of a disposition, or an audit event of an audit event, is
    // not a thing the system produces. Refusing rather than recursing keeps
    // the depth bound from ever being the thing that stops it.
    if (canonical === 'disposition' || canonical === 'audit_event') {
      return this.resolve(canonical, objectId, null, {}, depth);
    }

    return this.resolve(canonical, objectId, null, options, depth);
  }

  // =========================================================================
  // Effective configuration
  // =========================================================================

  /**
   * The court's effective designation policy, plus the rule-package version it
   * came from.
   *
   * Supplying these rows to the PDP is what makes designation policy
   * configuration-driven rather than compiled into Rego (`FRD/F13`: designation
   * policy lives in the configuration engine, "not ad hoc code paths"). The
   * bundle REPLACES its built-in defaults with whatever arrives, so a court row
   * can genuinely change a mapping.
   *
   * The version id is returned alongside because every `access_attempt` audit
   * event must record the rule package in effect at action time (`FRD/F02`:
   * "Linkage of every audit entry to the specific configuration/rule-package
   * version … in effect at action time"). Reading them together guarantees the
   * recorded version is the one that actually decided, rather than whatever is
   * effective by the time the audit row is written.
   *
   * A court with no published package yields an empty set, and the bundle
   * falls back to its built-in defaults — which are the same five mappings the
   * seed writes, so the fallback is equivalent rather than permissive.
   *
   * Plan 01-11 owns the general configuration read path; this query is the
   * narrow, direct read the guard needs until then.
   */
  async effectiveSecurityConfig(
    courtId: string | null,
  ): Promise<EffectiveSecurityConfig> {
    if (courtId === null || !UUID_RE.test(courtId)) {
      return { policies: [], rulePackageVersionId: null };
    }

    const version = await this.prisma.rule_package_versions.findFirst({
      where: {
        court_id: courtId,
        published_at: { not: null },
        OR: [{ effective_from: null }, { effective_from: { lte: new Date() } }],
      },
      orderBy: [{ effective_from: 'desc' }, { version_number: 'desc' }],
      select: {
        id: true,
        security_policies: {
          select: { designation: true, required_entitlement: true },
        },
      },
    });
    if (version === null) return { policies: [], rulePackageVersionId: null };

    return {
      policies: version.security_policies.map((row) => ({
        designation: row.designation,
        required_entitlement: row.required_entitlement,
      })),
      rulePackageVersionId: version.id,
    };
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /** An attribute-free resource of the given type. */
  private empty(type: string): LoadedResource {
    return {
      type,
      id: null,
      court_id: null,
      division_id: null,
      case_id: null,
      proceeding_id: null,
      designations: [],
      requested_by: null,
    };
  }

  /**
   * Placement for a `create`, taken from the body and **verified against the
   * database**.
   *
   * The `court_id` handed to the PDP is the one the named division actually
   * belongs to — never the one the body claimed. A body naming division D and
   * court C where D is not in C is refused (`null` → 404), because that is not
   * a typo, it is an attempt to write into a court the caller is not scoped to
   * while nominating one they are (threat T-01-27).
   */
  private async placementFromBody(
    type: string,
    options: LoadOptions,
  ): Promise<LoadedResource | null> {
    const divisionId = this.bodyString(options.body, 'division_id');
    const claimedCourtId = this.bodyString(options.body, 'court_id');

    if (divisionId !== null) {
      const division = await this.prisma.divisions.findUnique({
        where: { id: divisionId },
        select: { id: true, court_id: true },
      });
      if (division === null) return null;
      if (claimedCourtId !== null && claimedCourtId !== division.court_id) {
        this.logger.warn(
          `Rejected a ${type} create whose body named court ${claimedCourtId} ` +
            `and division ${divisionId}, which belongs to a different court.`,
        );
        return null;
      }
      return {
        ...this.empty(type),
        court_id: division.court_id,
        division_id: division.id,
      };
    }

    if (claimedCourtId !== null) {
      const court = await this.prisma.courts.findUnique({
        where: { id: claimedCourtId },
        select: { id: true },
      });
      if (court === null) return null;
      return { ...this.empty(type), court_id: court.id };
    }

    // No placement at all. The court check becomes inapplicable, which is NOT
    // a pass — `policy/README.md` § Scope semantics — so this is a safe shape
    // to hand the PDP rather than one that quietly widens access.
    return this.empty(type);
  }

  /** The court a user belongs to, via their role assignment or court scope. */
  private async courtOfUser(userId: string | null): Promise<string | null> {
    if (userId === null || !UUID_RE.test(userId)) return null;

    const role = await this.prisma.user_roles.findFirst({
      where: { user_id: userId, revoked_at: null, court_id: { not: null } },
      select: { court_id: true },
    });
    if (role?.court_id != null) return role.court_id;

    const scope = await this.prisma.scope_assignments.findFirst({
      where: { user_id: userId, scope_type: 'court', scope_value: { not: null } },
      select: { scope_value: true },
    });
    return scope?.scope_value ?? null;
  }

  /** A UUID-valued body field, or `null`. Never trusted beyond its shape. */
  private bodyString(
    body: Record<string, unknown> | null | undefined,
    key: string,
  ): string | null {
    const value = body?.[key];
    return typeof value === 'string' && UUID_RE.test(value) ? value : null;
  }

  /** A non-empty string body field (for `object_type`, which is not a UUID). */
  private bodyRawString(
    body: Record<string, unknown> | null | undefined,
    key: string,
  ): string | null {
    const value = body?.[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  }
}
