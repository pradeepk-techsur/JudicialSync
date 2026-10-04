## F12: Restricted External Attorney Portal

**Description:** A scoped external portal allowing authorized attorneys to submit structured exhibit metadata and view authorized deadline information, without any ability to alter the official record. This portal operates under a separate authentication/authorization scope from internal court users, consistent with the PRD's "no direct write access to official ledger, docket, or calculation status" principle.

**Terminology:**
- **External Principal:** An attorney/authorized-party identity authenticated through a portal-specific identity flow, distinct from internal court SSO.
- **Proposed Submission:** Attorney-submitted exhibit metadata or deficiency correction, which always enters the system in a "proposed" state requiring clerk/deputy acceptance (F15) — never directly written to the authoritative ledger.

**Sub-features:**
- Structured exhibit metadata submission (proposed exhibits, corrections to deficiencies)
- Authorized, read-only Speedy Trial deadline visibility where the court permits
- No direct write access to official ledger, docket, or calculation status
- Separate authentication/authorization scope from internal court users

**`[ASSUMPTION]`:** The PRD/vision document leaves open exactly what information external counsel may view or submit and at what case stage (PRD §9.3). This FRD assumes: (a) attorneys may submit proposed exhibit metadata only for cases/proceedings where they are a recorded party-of-record (per F01 party role), (b) Speedy Trial visibility is limited to a read-only "confirmed calculation summary" (remaining time, next threshold, confirmed trigger/exclusion periods) without full explainability detail or override history, and (c) exact scope is court-configurable per F03 and must be revalidated during pilot engagement.

**Process:**
1. Attorney authenticates via the portal-specific identity flow (separate IdP registration/scope from F00 internal SSO, though it may share the same underlying IdP technology — see `Y3-integrations.md` §Identity Provider).
2. System resolves the attorney's party-of-record associations (which cases/proceedings they are authorized to interact with) from F01 party records.
3. Attorney submits structured exhibit metadata (proposed exhibit list, corrections to a previously flagged deficiency) via a portal-specific intake form; submission is created in `proposed` state and routed into the standard F15 pretrial intake validation/exception flow — identical downstream handling to internally-submitted exhibits, distinguished only by `submitted_via = 'external_portal'`.
4. Attorney views a read-only Speedy Trial summary for their associated defendant(s), scoped per the court's configured visibility level (F03).
5. Attorney has no UI affordance, and the API enforces no entitlement, for any write operation against the ledger (F16), docket (F10), or calculation state (F29/F30) — all such endpoints reject external-principal tokens regardless of any case association.

**Inputs:**
- Portal login credentials / external IdP assertion
- `exhibit_metadata_submission` (same structured shape as F15 intake, plus `submitted_via = 'external_portal'`)
- Query: `defendant_tracker_summary` (read-only, for Speedy Trial visibility)

**Outputs:**
- Submission confirmation (routed to F15 intake queue, status = `pending_review`)
- Read-only Speedy Trial summary view (remaining time, next threshold, confirmed periods only — no candidate/proposed detail unless `[ASSUMPTION]` visibility level is configured broader by the court)

**Validation:**
- External principal tokens are structurally distinct from internal session tokens (different token issuer/audience claim) so that no internal API can be invoked by mistake using a portal token even if an endpoint's authorization check were misconfigured (defense in depth).
- An attorney may only submit metadata or view deadline information for cases where they hold an active party-of-record association; this association itself is sourced from CM/ECF via F01/F10, not self-asserted by the attorney.
- All external submissions are immutably logged with `submitted_via = 'external_portal'` and the submitting attorney's identity, feeding the same audit trail (F02) as internal submissions.
- Sealed/restricted/grand-jury/juvenile cases are never visible through the portal regardless of party-of-record status, unless explicitly and individually authorized by the court (`[ASSUMPTION]`: default-deny for all security-designated cases in the external portal).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Attorney attempts write to ledger/docket/calculation endpoint | 403 | PORTAL_WRITE_DENIED | "External users cannot modify the official record" |
| Attorney has no party-of-record association for the case | 403 | PORTAL_NOT_PARTY_OF_RECORD | "You are not associated with this case" |
| Attorney attempts to view a security-designated case | 403 | PORTAL_DESIGNATION_DENIED | "This case is not available through the external portal" |
| External IdP assertion invalid/expired | 401 | PORTAL_AUTH_FAILED | "Authentication failed; please sign in again" |

**API Surface (this feature):** see `Y1a-api-shared.md` §External Portal for `/portal/submissions`, `/portal/trackers/{id}/summary` endpoints (fully distinct base path and auth middleware from internal APIs).

**Schema Surface (this feature):** reuses `exhibits` (intake rows tagged `submitted_via`), `defendant_trackers` (read projection only); no dedicated external-only tables beyond `external_principals` — see `Y0a-schema-shared.md` §External Portal.
