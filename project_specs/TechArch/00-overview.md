# Technical Architecture Document: JudicialSync

**Project Acronym:** JudicialSync
**Document Type:** TechArch (Technical Architecture)
**Version:** 1.0 (Draft — derived from PRD-JudicialSync v1.0 and FRD-JudicialSync v1.0, pre-pilot/pre-stakeholder-validation)
**Generated:** 2026-10-04
**Upstream Sources:** `project_specs/PRD-JudicialSync.md`, `project_specs/FRD-JudicialSync.md` (and chunk files `project_specs/FRD/Y0a/b/c-schema-*.md`, `Y1a/b/c-api-*.md`, `Y2-errors.md`, `Y3-integrations.md`), `.planning/PROJECT.md`

---

## Scope Statement

This document specifies **how** JudicialSync is built: architecture pattern, component decomposition, data model (full DDL), API design (REST + TypeScript contracts), security architecture, technology stack, and integration points. It assumes the functional behavior specified in the FRD and does not re-derive *what* each feature does — it specifies the technical substrate that makes that behavior possible, auditable, and federally deployable.

Three binding, non-negotiable constraints shape every architectural decision below:

1. **USWDS is mandatory for all UI.** The frontend framework choice must be compatible with the U.S. Web Design System (https://designsystem.digital.gov/) component library and design tokens. This is a federal accessibility (Section 508) and visual-consistency requirement, not a preference.
2. **Audit immutability is structural, not procedural.** The `audit_events`, `exhibit_versions`, `calculation_versions`, and `confirmed_exclusions` tables (and others flagged in FRD Y2) are append-only at the database-grant level — no application code path, however privileged, can issue `UPDATE`/`DELETE` against them. Tamper-evidence is enforced via hash-chaining, not merely by convention.
3. **Human-in-command is enforced at the API layer.** No service may auto-finalize a ruling, exclusion confirmation, override, or final Speedy Trial status. Every state-changing endpoint that touches a legally significant object requires an explicit authenticated actor and produces a versioned, attributable record — the architecture makes "silent auto-finalization" structurally impossible, not merely disallowed by policy.

---

## 1. Architectural Pattern

JudicialSync is built as a **modular, domain-partitioned service architecture** — not a single monolith, not a fully decomposed microservices mesh. Three deployable units share one data platform and one API gateway:

- **Platform Core Service** — identity/ABAC, case/docket model, audit, configuration engine, notifications, search, work queue, exception queue, timeline, CM/ECF adapter, security/file-scanning, reporting feed. Every other service depends on Platform Core; Platform Core depends on nothing else in the system.
- **Evidentiary Tracking Service** — exhibit ledger, courtroom logging, reconciliation, custody, sealing, jury package, closeout. Depends on Platform Core only (via internal API, never by directly querying Platform Core's tables).
- **Speedy Trial Service** — tracker initialization, event mapping, candidate exclusion engine, calculation engine, review/approval, threshold alerts, continuance findings, multi-defendant separation. Depends on Platform Core only.

This "shared-core, two domain modules" shape directly mirrors the PRD's Technical Architecture table (§4) and lets a court adopt one module first (e.g., Evidentiary only) without standing up Speedy Trial infrastructure, while both modules get identity, audit, configuration, and notifications for free on day one.

**Why not a single monolith:** The PRD requires the two domains to be "independently deployable" (§4) so pilot courts can adopt one module first. A single deployable would force synchronized releases across both domains and make partial-adoption impossible.

**Why not full microservices decomposition:** Splitting each FRD feature (F00–F39) into its own service would multiply operational burden (40 services, 40 deployment pipelines, 40 sets of federal ATO/security review artifacts) without a corresponding benefit — the PRD's scaling axis is "more courts," not "independent feature-level scaling." Three coarse-grained, domain-aligned services balance deployability against operational and compliance overhead appropriate for a first-pilot federal system.

### 1.1 Logical Architecture Diagram

```
                              ┌─────────────────────────────────────────────┐
                              │         Experience Layer (USWDS)             │
                              │  ┌───────────┐ ┌───────────┐ ┌────────────┐ │
                              │  │  Judge /  │ │   Clerk   │ │ Courtroom  │ │
                              │  │ Chambers  │ │Operations │ │  Deputy    │ │
                              │  │ Workspace │ │  Console  │ │ Interface  │ │
                              │  └───────────┘ └───────────┘ └────────────┘ │
                              │  ┌───────────┐ ┌───────────────────────────┐│
                              │  │  Admin    │ │ Restricted Attorney Portal││
                              │  │ Dashboard │ │   (separate auth realm)   ││
                              │  └───────────┘ └───────────────────────────┘│
                              └───────────────────────┬───────────────────────┘
                                                       │ HTTPS / TLS 1.2+
                                                       ▼
                              ┌─────────────────────────────────────────────┐
                              │              API Gateway                     │
                              │  - Token validation (OIDC/SAML)              │
                              │  - ABAC policy-evaluation hook (per request) │
                              │  - Rate limiting, request logging            │
                              │  - Separate audience/issuer for portal vs.   │
                              │    internal realm (F12 separation req.)      │
                              └───────┬───────────────┬───────────────┬──────┘
                                      │               │               │
                   ┌──────────────────┘               │               └──────────────────┐
                   ▼                                  ▼                                  ▼
      ┌─────────────────────────┐      ┌──────────────────────────┐     ┌──────────────────────────┐
      │   Platform Core Service  │      │ Evidentiary Tracking Svc │     │   Speedy Trial Service    │
      │ ┌───────────────────────┐│      │┌─────────────────────────┐│    │┌─────────────────────────┐│
      │ │ Identity/ABAC (F00)   ││      ││ Exhibit Ledger (F16)    ││    ││ Tracker Init (F26)      ││
      │ │ Case/Docket (F01)     ││      ││ Courtroom Logging (F17) ││    ││ Event Mapping (F27)     ││
      │ │ Audit Service (F02)   ││◄─────┤│ Reconciliation (F18)    ││    ││ Exclusion Engine (F28)  ││
      │ │ Config Engine (F03)   ││ internal││ Custody (F20)        ││    ││ Calc Engine (F29)       ││
      │ │ Notifications (F04)  ││ API  ││ Sealing (F21)           ││    ││ Review/Approval (F30)   ││
      │ │ Search (F05)         ││      ││ Jury Package (F22)      ││    ││ Threshold Alerts (F31)  ││
      │ │ Work Queue (F06)     ││      ││ Closeout (F19/F24)      ││    ││ Continuance Check (F33) ││
      │ │ Exception Queue (F07)││      │└─────────────────────────┘│    ││ Multi-Defendant (F34)   ││
      │ │ Timeline (F08)       ││      └──────────────────────────┘     │└─────────────────────────┘│
      │ │ Reporting (F09)      ││                                       └──────────────────────────┘
      │ │ CM/ECF Adapter (F10) ││
      │ │ File/Malware (F13)   ││
      │ └───────────────────────┘│
      └─────────────┬─────────────┘
                     │
                     ▼
      ┌───────────────────────────────────────────────────────────┐
      │                    Data & Integration Layer                 │
      │ ┌─────────────┐ ┌──────────────┐ ┌───────────┐ ┌──────────┐│
      │ │ PostgreSQL   │ │ Object Store │ │  Search   │ │  Redis   ││
      │ │ (operational │ │ (file refs / │ │ (OpenSearch│ │ (cache / ││
      │ │  + audit)    │ │  evidence)   │ │  index)   │ │ sessions)││
      │ └─────────────┘ └──────────────┘ └───────────┘ └──────────┘│
      └───────────────────────────┬───────────────────────────────┘
                                   │
                                   ▼
      ┌───────────────────────────────────────────────────────────┐
      │                   External Systems (Y3)                     │
      │  CM/ECF (authoritative docket) │ IdP (SSO/MFA) │ Email/SMS   │
      │  Courtroom display/jury-review hardware │ AO reporting feed │
      └───────────────────────────────────────────────────────────┘
```

### 1.2 Key Architectural Decisions

| Decision | Rationale |
|---|---|
| Three coarse-grained services (Platform Core, Evidentiary, Speedy Trial), not a monolith and not per-feature microservices | Matches PRD's "independently deployable modules sharing a platform layer" without multiplying federal ATO/ops overhead across 40 feature-level services |
| Single shared PostgreSQL cluster, schema-separated by domain (`platform`, `evidentiary`, `speedytrial`), not separate databases per service | Audit linkage (`audit_events.object_id`) and cross-module views (Case Timeline F08, Search F05) require efficient cross-schema joins; full physical database separation would force expensive cross-database federation for features that are inherently cross-cutting |
| API Gateway terminates all external traffic; internal service-to-service calls use a private network segment, never routed back through the public gateway | Defense in depth; internal calls (e.g., Evidentiary → Platform Core audit write) must not be interceptable from the public internet path |
| Append-only tables enforced at the PostgreSQL **role/grant** level, not only at the application/ORM level | FRD Y2 explicitly requires database-level enforcement ("no UPDATE/DELETE grants... at the DB level") — application-layer-only enforcement is bypassable by a compromised or misconfigured app process; grant-level enforcement is not |
| ABAC policy evaluation is centralized (Policy Decision Point) rather than re-implemented per service | F00 requires identical scope-attribute evaluation (court/division/case/proceeding/party-role/security-designation) across all three services; a single policy engine avoids three divergent, independently-buggy ABAC implementations |
| External attorney portal (F12) is served by a structurally separate API audience/issuer and a separate frontend bundle, not a role-gated view inside the internal app | FRD F00/F12/Y3 explicitly require a token issued for the portal to be structurally rejected by internal-only endpoints — this is implemented as distinct OIDC client IDs/audiences, not a shared token with a "portal" role flag that a bug could misread |

---

## 2. Deployment Topology

JudicialSync targets a **federal government cloud environment** (e.g., AWS GovCloud (US) or Azure Government), reflecting the domain's security and compliance posture (FedRAMP-aligned controls, data residency, federal PKI/IdP compatibility). Deployment uses containerized services orchestrated by Kubernetes, with environment promotion (dev → staging → pilot-court production) gated by automated security scanning and manual release approval (separation-of-duties for release control, per PRD NFR "Separation of duties").

```
┌───────────────────────────────────────────────────────────────────────┐
│                     Federal Government Cloud Region                    │
│                                                                         │
│  ┌───────────────── Public-Facing Subnet (DMZ) ─────────────────────┐ │
│  │  WAF / CDN  →  Load Balancer  →  API Gateway (ingress)            │ │
│  └────────────────────────────┬──────────────────────────────────────┘ │
│                                │ (private network only beyond this)     │
│  ┌───────────────── Application Subnet (private) ───────────────────┐ │
│  │  Kubernetes cluster:                                              │ │
│  │   - platform-core (N replicas, HPA on CPU/queue depth)            │ │
│  │   - evidentiary-svc (N replicas)                                  │ │
│  │   - speedytrial-svc (N replicas)                                  │ │
│  │   - policy-decision-point (ABAC engine, sidecar or shared svc)    │ │
│  │   - notification-worker (async queue consumer)                   │ │
│  │   - cmecf-sync-worker (polling/webhook consumer)                  │ │
│  └────────────────────────────┬──────────────────────────────────────┘ │
│                                │                                        │
│  ┌───────────────── Data Subnet (private, most restricted) ─────────┐ │
│  │  - PostgreSQL (Multi-AZ primary + read replica)                   │ │
│  │  - Redis (session cache, rate-limit counters)                    │ │
│  │  - OpenSearch cluster (search index, F05)                        │ │
│  │  - Object Store (encrypted at rest, versioned, exhibit/package    │ │
│  │    reference layer — F13/F15/F22/F24)                            │ │
│  │  - Backup / snapshot store (cross-region, immutable retention)   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────── Security & Ops Plane (cross-cutting) ───────────┐ │
│  │  Centralized logging (SIEM-forwarded) │ Secrets manager (KMS)    │ │
│  │  Vulnerability scanning │ Config management │ Audit-chain         │ │
│  │  verification job (scheduled) │ Malware-scan service (F13)        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                 │                              │
                 ▼                              ▼
         CM/ECF (external,              Identity Provider
         court-network boundary)        (SAML/OIDC, federal PKI-aware)
```

**Deployment notes:**

- **Court-level tenancy:** One deployment serves multiple courts (multi-tenant by `court_id`), not one deployment per court — this is what makes "national core, local configuration" (F03, F37) operationally real rather than aspirational. Tenancy isolation is enforced at the ABAC/row-level-security layer, not by physical separation.
- **Courtroom continuity:** Per PRD NFR "Reliability and continuity," the Courtroom Deputy Interface supports an offline-capable local write-ahead queue (`synced_from_offline` flag on `session_log_entries`, see Y0b) so real-time logging continues through a transient network/API outage and reconciles on reconnect — this is a deliberate client-architecture decision, not merely a backend concern.
- **Availability target:** Multi-AZ deployment within the region for all stateful components; availability SLO is scoped to court operating hours per the PRD NFR, with maintenance windows scheduled outside those hours.
- **Environment separation:** Dev/staging/pilot-production are fully isolated (separate databases, separate IdP realms, no production case data in lower environments) given the sensitivity of sealed/restricted/PII-bearing records.

---

## 3. Binding Architectural Principles Reflected in This Design

| PRD Principle | Architectural Realization |
|---|---|
| National core, local configuration | `rule_package_versions` (F03) as the single configuration source of truth read by all three services at action time; no per-court code branches or deployments |
| Human-in-command | Every legally significant mutation requires an authenticated actor claim + produces a new version row; no batch/cron job has write grants to `calculation_versions`, `confirmed_exclusions`, or `exhibit_versions` |
| Explain every consequential result | `timeline_segments`, `calculation_versions.rule_version_ref`, and `exhibit_versions.audit_event_id` provide a queryable, reconstructable lineage from any displayed number back to its source events and rule version |
| Courtroom speed | Dedicated lightweight Courtroom Deputy client bundle (minimal JS payload, offline-tolerant, keyboard-first), separate from the heavier Clerk/Admin consoles |
| Authoritative-source discipline | `source_system`/`source_identifier` columns on every CM/ECF-derived table; `sync_conflicts` table routes discrepancies to human review rather than overwriting |
| Accessibility by design | USWDS component library + design tokens as the mandatory frontend foundation (§5, Technology Stack) |
| API-first interoperability | All external integrations (CM/ECF, IdP, notification channels, courtroom tech) are isolated behind the Platform Core's integration-adapter boundary; no domain service calls an external system directly |
