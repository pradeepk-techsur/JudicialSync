
---

## 9. Integration Points

All external integrations are isolated behind the Platform Core Service's integration-adapter boundary (§1.2 Key Architectural Decisions) — no Evidentiary or Speedy Trial service component calls an external system directly. This keeps external-system churn (a CM/ECF upgrade, an IdP migration) contained to one service's adapter layer.

### 9.1 CM/ECF (or Successor Case-Management Platform)

| Aspect | Detail |
|---|---|
| Purpose | Case, party, docket-event, order, and document-reference synchronization (F10) |
| Direction | Primarily inbound; controlled outbound references/filings only where explicitly authorized |
| Transport | Polling adapter (scheduled, configurable interval) with webhook support where the court's CM/ECF deployment exposes one; `[ASSUMPTION per FRD Y3]` — exact mechanism, schema, and latency are unresolved pending CM/ECF interface availability per court, so the adapter is built against an abstract `CmecfSyncProvider` interface with a pluggable transport implementation |
| Idempotency | Every inbound record carries a stable CM/ECF-native `source_identifier`; redelivery of the same `source_identifier` + payload is a no-op (`sync_conflicts`/dedup check before insert), never a duplicate row |
| Conflict handling | CM/ECF data wins by default; a field-level conflict with a locally-modified value creates a `sync_conflicts` row routed to the Exception Queue (F07) for human resolution — never a silent overwrite |
| Health monitoring | `adapter_health_log` (last successful sync, error count, backlog count) surfaces to the Admin Dashboard and feeds the Reporting Feed (F09); sustained failure triggers a critical notification (F04) and an exception (F07) |
| Consumed by | Case & Docket Context Service (F01), CM/ECF Adapter itself (F10), Exhibit Setup (F14), Speedy Trial tracker/event ingestion (F26/F27) |

```
┌──────────────┐  poll/webhook   ┌─────────────────────────┐  idempotent   ┌────────────────┐
│   CM/ECF      │────────────────▶│ CM/ECF Integration       │───insert────▶│ cases, parties, │
│  (external,   │                 │ Adapter (Platform Core)  │              │ docket_events,  │
│  authoritative│◄────controlled──│                          │              │ document_refs   │
│  docket)      │     outbound    └───────────┬─────────────┘              └────────────────┘
└──────────────┘     (authorized              │ conflict detected
                       filings only)           ▼
                                      ┌─────────────────┐
                                      │  sync_conflicts   │──▶ Exception Queue (F07) ──▶ human review
                                      └─────────────────┘
```

### 9.2 Identity Provider (IdP)

| Aspect | Detail |
|---|---|
| Purpose | SSO + MFA for internal court users (F00); separately-scoped flow for external attorneys (F12) |
| Protocol | OIDC or SAML 2.0, per court-selected IdP; federal PKI (PIV/CAC) compatibility expected for internal court-user authentication where the court's IdP supports it |
| Audience separation | Internal realm and external attorney portal realm use distinct client IDs/entity IDs (§7.1) — a single IdP technology may serve both, but tokens are not interchangeable between realms |
| Role/scope resolution | The IdP assertion is not assumed to carry JudicialSync-specific role/scope claims; the Identity & ABAC Module resolves role and scope-attribute assignments independently from its own `user_roles`/`scope_assignments` tables, using the IdP assertion only to establish *who* authenticated, not *what* they're entitled to |
| Consumed by | Identity & ABAC Module (F00, core), External Portal (F12), UI workspace routing (F11, depends on resolved role) |

### 9.3 Document / Object Repository

| Aspect | Detail |
|---|---|
| Purpose | Secure storage/reference layer for electronic exhibits, generated packages, and file artifacts (F13, F15, F22, F24) |
| Direction | Bidirectional (upload and retrieval) |
| Storage model | `[ASSUMPTION per FRD Y3]` — store-vs-reference-vs-both is a pilot-validation decision; the architecture implements at minimum a reference layer (`storage_pointer` on `document_references`/`file_references`) with the object store itself holding content when the "store" model is selected, so no schema change is required if the storage-model decision shifts during pilot scoping |
| Security | Server-side encryption at rest (§7.5), malware-scan quarantine gate before any reference becomes usable by downstream workflows, sealed/restricted content logically separated via `security_designations`/`exhibit_designations` policy (not a separate physical bucket, to avoid policy drift between two storage paths) |
| Consumed by | File/Malware Scanning Service (F13, core), Intake Module (F15), Custody Module (F20, condition-note attachments), Jury Package Module (F22), Closeout Module (F24, receipts/audit package) |

### 9.4 Notification Channels (Email, In-App, Other Approved Channels)

| Aspect | Detail |
|---|---|
| Purpose | Outbound alert/notice delivery (F04), consumed by Reconciliation (F18), Custody (F20), Threshold Alerts (F31), Exception Queue (F07) |
| Direction | Outbound, with delivery status (sent/failed/acknowledged) tracked back inbound |
| Channel registry | Extensible — email (SMTP/transactional-email provider) and in-app (WebSocket/poll-based inbox) at MVP; additional channels added via the same `notification_recipients_config` per-court configuration without code changes |
| Content policy enforcement | Templates are reviewed/approved assets (§7.5) — no free-text composition path exists in the delivery pipeline |
| Retry/escalation | BullMQ-backed retry with exponential backoff (minimum 3 attempts) before marking `failed`; persistent failure escalates to the Exception Queue and, for custody/threshold alerts, to a configured secondary recipient |
| Consumed by | Notifications Service (F04, core), F07, F18, F20, F31 |

### 9.5 Courtroom Technology (Display / Jury-Review Hardware)

| Aspect | Detail |
|---|---|
| Purpose | Secure display/streaming of authorized admitted evidence (F22 baseline session-scoped package; F39 deeper integration, Scale increment) |
| Direction | Controlled outbound package/stream only; no uncontrolled copying or public access |
| Credential scope | Registered endpoint credentials (`registered_display_endpoints.integration_credential_hash`) are narrowly scoped to display/stream operations only, structurally distinct from general API access credentials |
| Monitoring | Connection/session health surfaces to system administrators; repeated unauthorized connection attempts escalate as a security exception (F07), not merely a log entry |
| Consumed by | Jury Package Module (F22, baseline), Courtroom Technology Bridge (F39, Scale increment) |

### 9.6 Reporting / Analytics Consumers

| Aspect | Detail |
|---|---|
| Purpose | Operational metrics, backlog, data-quality, and adoption reporting for court administrators and AO program managers (F09 baseline; F38 advanced, Scale increment) |
| Direction | Outbound, de-identified or role-limited |
| Guardrail | No judge-outcome-attributed metric exists in the metric catalog by construction — the Reporting Feed Service's query layer has no schema path from a metric definition to an individual judicial determination, enforced by the metric catalog's own data-access boundary, not merely a policy statement |
| Consumed by | Reporting Feed Service (F09, core), Analytics Module (F38, cross-court trend extension), Portfolio Dashboard (F25/F36, operationally case-identified and viewer-scoped — distinct from the de-identified reporting feed) |

### 9.7 Cross-Cutting Integration Monitoring

Every integration above surfaces health/status metrics (last successful sync, error rate, backlog where applicable) to the Admin Dashboard (F11), with sustained failure triggering both a critical notification (F04) and an exception-queue entry (F07) rather than failing silently. No integration failure may block a user's ability to perform documented manual-fallback procedures — most critically, courtroom deputies must be able to continue real-time exhibit logging via the offline-tolerant local write queue (§8.1) even if the CM/ECF sync or notification channel is unavailable.
