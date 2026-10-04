
---

## 8. Technology Stack

### 8.1 Frontend

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| UI framework | React | 18.x | Component model for all five role-specific workspaces |
| Design system (binding) | U.S. Web Design System (USWDS) | 3.x | Mandatory federal design system — Section 508 accessibility, consistent federal UX; source: https://designsystem.digital.gov/ |
| USWDS React bindings | `@trussworks/react-uswds` | latest stable | React component wrappers over USWDS markup/CSS, avoids hand-rolling USWDS HTML structure |
| Design tokens / CSS | `@uswds/uswds` (Sass source) | 3.x | Underlying USWDS tokens, compiled via the project's Sass build, themeable per court branding within USWDS constraints |
| Language | TypeScript | 5.x | Compile-time contract checking against the generated OpenAPI client |
| State/data fetching | TanStack Query (React Query) | 5.x | Server-state caching, used for all REST calls; no client-side ABAC decisions ever trusted — UI gating only |
| Routing / code-splitting | React Router + per-workspace bundle splitting | 6.x | Enables the Courtroom Deputy Interface to ship a minimal bundle distinct from Clerk/Admin consoles |
| Offline support (Courtroom Deputy Interface only) | Service Worker + IndexedDB write queue | — | Local-first queue for `session_log_entries` during network/API interruption, reconciled on reconnect (F17) |
| Accessibility testing | axe-core / Pa11y in CI | — | Automated Section 508/WCAG 2.1 AA gate on every build, release-blocking per NFR |
| API client generation | OpenAPI Generator (TypeScript-fetch target) | — | Generated directly from the backend's OpenAPI 3.1 contract — frontend and backend share one source of truth |

### 8.2 Backend

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Runtime | Node.js | 20.x LTS | Shared runtime across all three services (Platform Core, Evidentiary, Speedy Trial) |
| Framework | NestJS | 10.x | Modular, dependency-injected service framework; module boundaries map directly to FRD feature groupings (§4 Component Architecture) |
| Language | TypeScript | 5.x | End-to-end type safety from DB layer through API contract to frontend |
| ORM / query layer | Prisma | 5.x | Type-safe schema access; raw SQL escape hatch used for the hash-chain trigger logic and append-only grant management (migrations), since those require direct DDL/grant control beyond typical ORM abstractions |
| API contract | OpenAPI 3.1 | — | Single source of truth for request/response schemas, consumed by both the TypeScript client generator and server-side request validation (`zod`/`class-validator`) |
| Authentication | `openid-client` (OIDC) / `node-saml` (SAML) | — | Pluggable per-court IdP protocol support (F00) |
| Policy engine (ABAC/PDP) | Open Policy Agent (OPA), Rego policies | latest | Centralized policy decision point invoked by the API Gateway and each service (§7.2) |
| Background jobs / workers | BullMQ (Redis-backed) | 5.x | Notification delivery retries, CM/ECF sync polling, audit hash-chain verification job, scheduled Speedy Trial recalculation |
| Validation | `zod` | 3.x | Runtime request-body validation generated from/aligned to the OpenAPI schema |

### 8.3 Data Platform

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Primary database | PostgreSQL | 15.x | Operational data, audit trail, configuration, all DDL in §5; chosen for mature row-level security, `UUID`/`JSONB` support, and the fine-grained `GRANT`/`REVOKE` model §7.3/§7.4 depend on |
| Extensions | `pgcrypto` (UUID generation), `pg_trgm` (fallback text search) | — | UUID defaults; trigram search as a fallback when OpenSearch is unavailable |
| Search | OpenSearch | 2.x | Access-tagged, denormalized search index (F05) backing `search_index`; chosen over Elasticsearch for its Apache-2.0 licensing and GovCloud availability |
| Cache / session store | Redis | 7.x | Session token short-cache window (§7.2), rate-limit counters, BullMQ job queue backend |
| Object storage | S3-compatible object store (AWS S3 GovCloud / Azure Blob Government) | — | Exhibit file references, generated packages/exports, encrypted at rest (§7.5) |
| Backup / DR | Automated snapshot + cross-region replication, immutable (WORM) backup retention for audit/calculation tables | — | Matches the append-only guarantee at the backup layer, not just the live database |

### 8.4 Infrastructure & Operations

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Cloud environment | AWS GovCloud (US) or Azure Government | — | Federal data-residency and compliance posture (FedRAMP-aligned) |
| Container orchestration | Kubernetes (EKS GovCloud / AKS Government) | 1.29+ | Runs Platform Core, Evidentiary, Speedy Trial, PDP, and worker deployments |
| API Gateway / ingress | Kong or cloud-native API Gateway + WAF | — | Token validation entry point, rate limiting, audience separation enforcement (internal vs. portal) |
| CI/CD | GitHub Actions (or GitLab CI, per court/AO infra constraints) with mandatory security-scan + CODEOWNERS review gates | — | Separation-of-duties-enforced release pipeline (§7.7) |
| Infrastructure as Code | Terraform | 1.x | Reproducible environment provisioning, including the database grant/role definitions themselves |
| Secrets management | AWS Secrets Manager / Azure Key Vault (Government) | — | No credentials embedded in code or container images |
| Observability | OpenTelemetry (traces/metrics) + centralized logging (SIEM-forwarded) | — | Cross-cutting request tracing across the three services; audit-chain verification job alerts surface here |
| Vulnerability management | Container image scanning (Trivy/Grype) + dependency scanning (Dependabot/Snyk) in CI | — | Release-blocking above configured severity threshold |

### 8.5 Why This Stack

- **Node.js/TypeScript end-to-end** keeps one language across frontend, backend, and the generated API contract, minimizing the risk of request/response shape drift between the three services and five frontend workspaces — a meaningful risk given the system's 60+ entity data model.
- **NestJS's module system** maps directly onto the FRD's feature-group boundaries (F00–F13 Platform Core modules, F14–F25/F39 Evidentiary modules, F26–F36 Speedy Trial modules), so the codebase's physical structure mirrors the architecture diagram in §1, not an ad hoc folder layout.
- **PostgreSQL over a NoSQL alternative** is a direct consequence of the append-only/hash-chain immutability requirement (§7.3/§7.4): fine-grained `REVOKE`/`GRANT` at the table level, mature transactional guarantees for the outbox pattern, and `JSONB` columns give schema flexibility (e.g., `config_snapshot`, `detail` on exceptions) without sacrificing relational integrity for the core case/exhibit/tracker graph.
- **OPA/Rego for the Policy Decision Point** avoids three independently-implemented, independently-buggy ABAC checks across the three services — policy logic is written once and versioned like code, with its own test suite, directly addressing the FRD's requirement that ABAC evaluation be identical regardless of which service receives the request.
- **USWDS is non-negotiable per PRD/PROJECT.md** — the `@trussworks/react-uswds` + `@uswds/uswds` pairing is the most mature, actively maintained React binding for USWDS as of this writing, minimizing the risk of hand-rolled, drift-prone reimplementations of USWDS accessibility patterns.
