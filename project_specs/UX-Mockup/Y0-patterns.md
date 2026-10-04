## Interaction Patterns

### Pattern: Proposed vs. Confirmed Tag Convention

**When to use:** Any surface displaying a candidate exclusion, proposed exhibit, proposed tracker start context, or mapped-but-unreviewed event alongside confirmed data.
**Behavior:** Proposed/candidate items always use an **outline-style USWDS Tag** reading "Proposed" or "Candidate" in a neutral/amber color. Confirmed items always use a **solid-fill Tag** reading "Confirmed" in teal/green. The two styles are never visually similar enough to be confused at a glance, and screen-reader text always announces the state explicitly (e.g., "status: candidate, not yet reviewed"), never relying on color alone.
**Examples:** Screen-06 (Explain This Date pending segment), Screen-07 (exclusion review), Screen-12 (intake queue "Pending" items), Screen-16 (draft vs. published rule package).

### Pattern: Explicit Human Attribution Line

**When to use:** Any screen recording a ruling, exclusion confirmation, sealing decision, custody acknowledgment, or configuration publish.
**Behavior:** The UI renders a literal sentence naming the actor and action — "Ruling entered: Judge Hale — Admitted," "Sealed by: Judge Hale," "Published by: P. Nandan (approver), drafted by D. Okafor" — never a bare status change. This line is rendered as plain text (not solely an icon/tooltip) so it is visible to screen readers and in printed/exported artifacts.
**Examples:** Screen-01 (ruling confirmation line), Screen-05 (live activity stream), Screen-09 (seal authorization), Screen-16 (publish panel).

### Pattern: Required-Rationale Gate

**When to use:** Any resolution action on an Exception, Reconciliation Discrepancy, Modify/Reject exclusion decision, or supervisory override.
**Behavior:** The submit/resolve control for the action is **rendered disabled** until a Textarea rationale field meets the minimum length (≥10 characters, enforced client-side as a UX courtesy and server-side as the source of truth). A USWDS Character count component shows live progress toward the minimum. The disabled state carries a Tooltip explaining why, rather than silently blocking with no explanation.
**Examples:** Screen-02 (reconciliation discrepancy), Screen-07 (modify/reject exclusion), Screen-13 (exception resolution), Screen-18 (sync conflict resolution — rationale implicit in the explicit value-selection).

### Pattern: Separation-of-Duties Visual Block

**When to use:** Any maker-checker workflow (configuration publish, privileged role grant, template application).
**Behavior:** Rather than letting the drafter click "Publish"/"Approve" and then receiving a 403 error, the control is **rendered disabled from the start** for the drafter's own session, with an inline Tooltip/helper text: "A second approver is required." The approver-selection control (if present) excludes the current user from its own option list structurally, not just via validation.
**Examples:** Screen-16 (Configuration Engine publish), Screen-15 (pending privileged approvals card).

### Pattern: Non-Disclosure of Sealed/Restricted Existence

**When to use:** Any list, search result, or direct-ID lookup against a sealed/restricted/grand-jury/juvenile record by a user lacking the matching entitlement.
**Behavior:** The record is **omitted entirely** — never shown as a greyed-out row, a "restricted" placeholder, or a count that includes it. Direct-ID access returns a "not found" response/screen state, never "access denied," so the UI never confirms the record's existence to an unauthorized viewer. Every omission/attempt is still logged server-side as an `access_attempt` audit event, invisible to the requester but visible later to an authorized auditor.
**Examples:** Screen-19 (attorney's case list), Screen-13/17 (search and audit queries), Screen-09 (sealed exhibit direct access).

### Pattern: Live, No-Refresh Status Mirroring

**When to use:** Any screen displaying a status that another user is actively changing in real time (deputy logging ↔ chambers live view).
**Behavior:** Updates push to the viewing screen without a manual refresh/reload action, using a visible "● LIVE" indicator and a brief (reduced-motion-respecting) highlight animation on newly arrived entries. A connectivity gap is shown explicitly ("Reconnecting…") rather than silently freezing with no visual signal that data may be stale.
**Examples:** Screen-05 (Live Courtroom Status), Screen-04 (Chambers Home live card), Screen-14 (near-real-time portfolio refresh).

### Pattern: Entitlement-Gated Control Rendering (not just role-gated)

**When to use:** Every control that performs a privileged or legally significant action.
**Behavior:** Components check the viewer's **computed entitlement**, not merely their role label, before rendering a control as enabled. A read-only viewer sees the same layout/components as an authorized actor (so the screen's information architecture is consistent across roles) but never sees an *enabled* action button they cannot actually invoke — the control either renders disabled-with-tooltip or is omitted, per screen convention documented in each screen's States table.
**Examples:** Screen-04 (exhibit ruling control), Screen-09 (seal/authorize controls), Screen-11 (security designation checkboxes).

### Pattern: Partial-Availability Degradation

**When to use:** Any workspace where a dependent component/service fails to load.
**Behavior:** The affected card/panel shows a contained Alert ("Part of this workspace is temporarily unavailable") while the rest of the page remains fully usable — never a full-page failure for a partial dependency outage. Courtroom logging specifically continues accepting entries into the local draft buffer even if a secondary component (e.g., live chambers mirror) is unavailable.
**Examples:** Screen-04 (UI_COMPONENT_UNAVAILABLE), Screen-01 (offline/draft-buffer banner), Screen-08 (CONFERENCE_PACKET_PARTIAL).
