## F13: Security and Compliance Baseline

**Description:** Platform-wide security controls required for federal court operation, applied consistently across both modules — encryption, malware scanning, sensitive-record handling policy, retention/disposition schedules, and documented manual-fallback/recovery procedures. This feature is the non-functional backbone every other feature depends on rather than implementing independently.

**Terminology:**
- **Sensitive Record:** Any case/document/exhibit bearing a security designation (sealed, restricted, grand jury, juvenile, PII).
- **Retention Schedule:** A court/record-category-specific configuration defining how long a record category is retained before disposition action is required.
- **Manual Fallback:** A documented operational procedure for continuing essential courtroom operation (exhibit logging, Speedy Trial awareness) during a system or integration outage.

**Sub-features:**
- Encryption in transit and at rest; secure key management
- Malware scanning and approved file-type controls on uploads
- Sealed/restricted/grand-jury/juvenile/PII handling via explicit policy configuration (not ad hoc code paths)
- Configurable retention and disposition schedules by record category
- Documented manual-fallback and recovery procedures for courtroom or integration disruption

**`[ASSUMPTION]`:** The vision document's open decision on exhibit file storage model (store vs. reference vs. both) is carried forward unresolved here; this feature specifies the security controls applicable to *whichever* storage model TechArch selects, assuming at minimum a reference-layer exists and file storage (if implemented) is behind the same encryption/scanning controls.

**Process:**
1. All data at rest (database, object store) is encrypted using a managed key service; all data in transit uses TLS 1.2+ with no fallback to unencrypted transport.
2. Any file upload (exhibit intake F15, custody condition photos F20) passes through a malware-scanning gate before being accepted into the reference layer; scanning failure routes to rejection with a user-facing reason, never silent acceptance.
3. Approved file-type allowlist (per court configuration, F03) is enforced at upload; disallowed types are rejected before scanning is even attempted.
4. Every object (case, document, exhibit) carrying a security designation is evaluated against the centrally-defined policy engine (not per-feature if/else logic) to determine access — the policy engine is a single reusable service consumed by F00's ABAC evaluation, F05 search filtering, F08 timeline filtering, and F21 exhibit sealing.
5. Retention schedules are configured per record category (exhibit, document, audit event, notification) and court (F03); a scheduled disposition job surfaces due-for-disposition records as tasks (F06) for human action — no record is auto-purged without a human-confirmed disposition action for any category deemed court-record-significant.
6. Manual fallback procedures (documented runbook, not purely a software feature) are exercised and validated during pilot scenario testing (vision §8.3); the system supports fallback by ensuring deputies can resume real-time logging promptly after an outage without data loss (local draft persistence / fast resync).

**Inputs:**
- File upload: `file_binary`, `file_type`, `declared_purpose` (exhibit | custody_condition_note | package_artifact)
- Security designation policy config (from F03)
- Retention schedule config (from F03): `{record_category, retention_period, disposition_action}`

**Outputs:**
- Accepted file reference (post-scan) or rejection with reason
- Policy evaluation result (allow/deny) consumed by requesting feature
- Disposition-due task list (F06)

**Validation:**
- No file is persisted to the reference/storage layer until malware scan completes successfully.
- File types outside the court-configured allowlist are rejected regardless of scan result.
- Security designation policy changes are themselves rule-package-versioned (F03) and audit-logged (F02) — no designation policy may be altered via direct data edit outside the configuration engine.
- Retention schedule disposition actions require human confirmation via a task (F06); no automated hard-delete of any record category is permitted without this gate.
- Encryption key rotation and access must be restricted to the `security_officer` privileged role, separate from `system_admin` routine administration (separation of duties).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Upload fails malware scan | 422 | SECURITY_MALWARE_DETECTED | "File rejected: failed security scan" |
| Upload file type not in allowlist | 422 | SECURITY_FILE_TYPE_DENIED | "This file type is not permitted" |
| Policy engine evaluation failure (fail-closed) | 503 | SECURITY_POLICY_UNAVAILABLE | "Access cannot be evaluated at this time; request denied" |
| Disposition action attempted without human confirmation | 403 (internal guard) | SECURITY_DISPOSITION_UNCONFIRMED | "Disposition requires human confirmation" |
| Key rotation attempted by non-security-officer role | 403 | SECURITY_KEY_ACCESS_DENIED | "Key management requires security officer privileges" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Security Baseline for `/files/upload`, `/security/policy-evaluate` (internal), `/retention/schedules`, `/retention/due-for-disposition` endpoints.

**Schema Surface (this feature):** uses tables `file_references`, `malware_scan_results`, `security_policies`, `retention_schedules`, `disposition_log` — see `Y0a-schema-shared.md` §Security & Retention.
