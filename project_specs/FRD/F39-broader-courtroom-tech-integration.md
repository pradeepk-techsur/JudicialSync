## F39: Broader Courtroom Technology Integration

**Description:** Deeper integration with courtroom display and secure jury-review hardware beyond the basic restricted digital package delivered in F22. This Scale-increment feature extends the controlled jury package concept into live, in-courtroom display/streaming scenarios while preserving the same no-uncontrolled-copying, no-public-access controls.

**Terminology:**
- **Secure Display Integration:** A controlled connection between JudicialSync and courtroom display hardware, authorized to render specific admitted exhibits during proceedings.
- **Controlled Stream:** An outbound package or stream to jury-review hardware, access-bounded and monitored, distinct from a downloadable file.

**Sub-features:**
- Secure display/streaming integration for authorized admitted evidence
- Controlled outbound package/stream with no uncontrolled copying or public access
- Integration monitoring and incident support

**Process:**
1. Courtroom technology (display hardware, secure jury-review terminal) authenticates to JudicialSync via a dedicated, narrowly-scoped integration credential (distinct from user-facing F00 sessions).
2. An authorized user (judge/deputy) initiates a secure display session for a specific admitted exhibit (F16) or an assembled jury package (F22), explicitly authorizing which hardware endpoint may receive the stream.
3. System streams or renders the controlled content to the authorized endpoint only, with the stream bounded to the session duration and exhibit scope explicitly authorized — no general file access is exposed to the display hardware beyond what was specifically authorized for that session.
4. All display/streaming sessions are logged (session start/end, exhibit(s) shown, authorizing user) feeding the audit trail (F02), consistent with F22's package-access logging but extended to live display scenarios.
5. Integration health (connection status, error rates) is monitored, with incidents (failed connections, unauthorized connection attempts) surfaced to system administrators and, for repeated unauthorized attempts, escalated as a security exception (F07).

**Inputs:**
- `exhibit_id` or `jury_package_id` (required)
- `authorized_endpoint_id` (required, registered courtroom hardware identifier)
- `session_duration` or `proceeding_id` (session bound to proceeding by default)

**Outputs:**
- Active controlled display/stream session
- Session access log (feeding F02)
- Integration health/incident record

**Validation:**
- Courtroom hardware integration credentials must be scoped narrowly (display/stream only, no general API access) and are managed with the same separation-of-duties discipline as other privileged integration credentials (F13).
- A display session must never expose content beyond the specific exhibit(s)/package explicitly authorized for that session — no general ledger browsing from courtroom display hardware.
- Sealed/restricted exhibits (F21) follow identical inclusion rules for display sessions as for F22 jury packages — excluded by default, requiring the same explicit per-instance judge authorization to include.
- Unauthorized connection attempts from unregistered hardware endpoints must be rejected and logged as a security exception, not merely a connection failure.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Unregistered hardware endpoint attempts connection | 403 | COURTTECH_UNREGISTERED_ENDPOINT | "This display endpoint is not registered" |
| Display session requested for sealed exhibit without specific authorization | 422 | COURTTECH_SEALED_DENIED | "This exhibit is sealed and not authorized for display" |
| Session requested outside an active proceeding | 409 | COURTTECH_NO_ACTIVE_PROCEEDING | "No active proceeding is associated with this session request" |
| Integration connection failure | 502 | COURTTECH_CONNECTION_FAILED | "Courtroom display connection failed" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Courtroom Technology for `/evidentiary/courtroom-display/sessions`, `/evidentiary/courtroom-display/endpoints` endpoints.

**Schema Surface (this feature):** uses tables `courtroom_display_sessions`, `registered_display_endpoints` — see `Y0b-schema-evidentiary.md` §Courtroom Technology Integration.
