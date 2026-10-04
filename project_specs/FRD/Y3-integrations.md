## Y3: Integration Points

This chunk catalogs external system dependencies and integration contracts referenced across feature chunks. Exact transport mechanisms, SDKs, and protocol versions are TechArch decisions; this document specifies the functional contract each integration must satisfy.

### CM/ECF (or Successor Case-Management Platform)

- **Purpose:** Case, party, docket-event, order, and document-reference synchronization (F10).
- **Direction:** Primarily inbound; controlled outbound references/filings only where explicitly authorized (F10 §Process step 7).
- **Authoritative-source discipline:** CM/ECF data always wins in a conflict unless a human explicitly overrides via F07 exception resolution; JudicialSync never silently overwrites a locally-modified field (F10 §Validation).
- **`[ASSUMPTION]`:** Exact mechanism (polling vs. webhook), schema, event availability, and latency are unresolved per PRD/vision §9.3. This FRD assumes a mechanism that:
  - Delivers case, party, docket-event, order, and document-reference records, each carrying a stable CM/ECF-native `source_identifier`.
  - Supports idempotent redelivery (same `source_identifier` + payload does not create duplicate records, per F10/F27 duplicate-detection rules).
  - Surfaces delivery/sync health metrics consumable by F10's adapter health log and F09's reporting feed.
- **Consumed by:** F01 (case/docket model), F10 (adapter itself), F14 (case setup sync), F26/F27 (Speedy Trial trigger/event ingestion).

### Identity Provider (IdP)

- **Purpose:** Single sign-on and multifactor authentication for internal court users (F00) and a separately-scoped flow for external attorneys (F12).
- **Direction:** Bidirectional — JudicialSync redirects to the IdP for authentication and receives signed assertions back; session/entitlement checks occur on every subsequent request.
- **Protocol:** SAML or OIDC (`[ASSUMPTION]`: exact protocol is a TechArch decision; this FRD assumes the IdP can carry role/court-context claims or that JudicialSync resolves role/scope independently of the IdP's own claims, per F00 §Process step 4).
- **Separation requirement:** The external attorney portal (F12) uses a structurally distinct token issuer/audience from internal SSO, even if the underlying IdP technology is shared, so that no internal API inadvertently accepts a portal-scoped token.
- **Consumed by:** F00 (core), F12 (external portal), F11 (workspace routing depends on resolved role).

### Document / Object Repository

- **Purpose:** Secure storage or reference layer for electronic exhibits, generated packages, and other file artifacts (F13, F15, F22, F24).
- **Direction:** Bidirectional (upload and retrieval).
- **Design note:** Sealed and restricted content must be separable from general storage per F13/F21 policy — `[ASSUMPTION]`: the exhibit file storage model (store vs. reference vs. both) is unresolved per PRD/vision §9.3; this FRD specifies the security controls (encryption, malware scanning, allowlisting, per F13) applicable regardless of which model TechArch selects, and assumes at minimum a reference-layer (`storage_pointer` field on `document_references`/`file_references`, see `Y0a-schema-shared.md`) exists.
- **Consumed by:** F13 (controls), F15 (intake upload), F20 (custody condition-note attachments), F22 (jury package electronic content), F24 (closeout receipts/audit package).

### Notification Channels (Email, In-App, Other Approved Channels)

- **Purpose:** Outbound delivery of alerts and notices (F04), consumed by F18 (reconciliation), F20 (custody escalation), F31 (threshold alerts), F07 (exception escalation).
- **Direction:** Outbound, with delivery status (sent/failed/acknowledged) tracked inbound back to JudicialSync.
- **Design note:** Content policy (F04 §Validation) strictly limits what may appear in notification bodies/previews — no sensitive case/defendant/exhibit detail, only generic descriptions plus secure deep links requiring re-authentication.
- **Consumed by:** F04 (core), F07, F18, F20, F31.

### Courtroom Technology (Display / Jury-Review Hardware)

- **Purpose:** Secure display or jury review of authorized admitted evidence (F22 baseline; F39 broader integration).
- **Direction:** Controlled outbound package or stream; no uncontrolled copying or public access.
- **Design note:** Integration credentials are narrowly scoped (display/stream only), distinct from general API access, per F39 §Validation. Health/incident monitoring surfaces to system administrators, with repeated unauthorized connection attempts escalated as security exceptions (F07).
- **Consumed by:** F22 (baseline package delivery), F39 (deeper display/streaming integration).

### Reporting / Analytics Consumers

- **Purpose:** Operational metrics, backlog, data quality, adoption, and support reporting for court administrators and AO program managers (F09 baseline; F38 advanced).
- **Direction:** Outbound, de-identified or role-limited.
- **Design note:** Explicit guardrail — aggregate analytics must never be positioned or usable to alter judicial determinations (F09/F38 §Validation); no judge-outcome-attributed metrics are structurally available in the metric catalog.
- **Consumed by:** F09 (core), F38 (cross-court trend extension), F25 (portfolio dashboard, distinct from de-identified reporting — operational, case-identified, viewer-scoped).

### Integration Monitoring (Cross-Cutting)

- Every external integration above must surface health/status metrics (last successful sync, error rate, backlog where applicable) to system administrators via the admin dashboard (F11) and, for sustained failures, must trigger a critical alert (F04) and/or an exception (F07) rather than failing silently.
- No integration failure may block a user's ability to perform the manual-fallback procedures specified in F13 (e.g., deputies must be able to continue real-time courtroom logging even if the CM/ECF sync or notification channel is down).
