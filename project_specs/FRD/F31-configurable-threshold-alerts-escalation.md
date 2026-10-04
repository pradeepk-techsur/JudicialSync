## F31: Configurable Threshold Alerts and Escalation

**Description:** Generates alerts as remaining time crosses court-defined thresholds or as unresolved events persist, with court control over recipients, cadence, and threshold values. Per the vision document's explicit principle, alerts are tied to explanation context, "not merely a date" — every alert links back to the full F29 explain-this-date view, never presenting a bare number without its supporting detail.

**Terminology:**
- **Threshold Tier:** A court-configured remaining-time boundary (e.g., "30 days remaining," "10 days remaining") at which an alert fires.
- **Persistent Unresolved Event:** A docket event or candidate exclusion that has remained unreviewed/unmapped beyond a configured age, independently alertable from remaining-time thresholds.

**Sub-features:**
- Court-configurable thresholds (e.g., remaining-time tiers)
- Configurable recipients and escalation cadence
- Alerts tied to explanation context, not a bare date
- Delivery via shared Notifications Service (F04)

**Process:**
1. After each new calculation version is produced (F29), the system compares the new `remaining_time` value against the court's configured threshold tiers (F03).
2. If the remaining time has newly crossed a tier boundary (compared to the prior calculation version) or an unresolved event (F07/F27) has exceeded its configured age threshold, the system triggers an alert via the Notifications Service (F04), specifying the triggering tracker/event, severity (mapped from tier), and a deep link to the F29 explain-this-date view — never embedding the bare remaining-time number alone in the alert body, consistent with the vision document's explicit design note.
3. Notifications Service resolves configured recipients/channels for this alert type and court (F03) and delivers per F04's process.
4. Recipient acknowledges the alert (F04 acknowledgment tracking); unacknowledged alerts beyond the configured escalation cadence trigger escalation to a secondary recipient (e.g., supervising judge or court administrator).
5. Alert and acknowledgment events are logged; threshold-crossing alert acknowledgment specifically feeds the audit trail (F02) since it is evidence a human reviewed a risk signal for a legally significant deadline.

**Inputs:**
- New calculation version's `remaining_time` (from F29) and prior version's `remaining_time` (for crossing detection)
- Threshold tier definitions (F03): `{tier_name, remaining_time_boundary, severity}`
- Escalation cadence config (F03): `{max_unacknowledged_duration, secondary_recipient_role}`

**Outputs:**
- Alert record referencing the triggering calculation version / unresolved event
- Delivered notification (via F04) with deep link to explain-this-date view
- Escalation record if unacknowledged beyond cadence

**Validation:**
- An alert must never be generated or delivered without a working deep link to its full explanatory context (F29 view); an alert lacking this linkage is a system defect, not an acceptable minimal-viable alert.
- Threshold crossing detection compares consecutive calculation versions, not merely a point-in-time check, so a tier crossing is detected exactly once per crossing event, not re-fired on every subsequent calculation that remains below the same tier.
- Per the PRD's stated success metric, 100% of cases crossing a configured threshold must generate a delivered, acknowledged alert — failure to deliver (channel failure) must itself raise an exception (F07), not fail silently.
- Escalation cadence must have a defined maximum unacknowledged duration per severity tier; critical-severity alerts (e.g., limit-reached tier) must have the shortest escalation window.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Alert generation attempted with no deep-link context available | 500 (internal guard) | ALERT_MISSING_CONTEXT | "Alert blocked: explanatory context unavailable (system defect)" |
| No threshold tiers configured for court | 422 | ALERT_NO_TIERS_CONFIGURED | "No Speedy Trial alert thresholds are configured for this court" |
| Alert delivery failure | 502 (routes to F07) | ALERT_DELIVERY_FAILED | "Threshold alert could not be delivered" (see F04) |
| Unacknowledged alert exceeds escalation cadence | n/a (triggers escalation, not a request error) | ALERT_ESCALATED | "Alert escalated due to lack of acknowledgment" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Threshold Alerts for `/speedytrial/trackers/{id}/alerts`, `/speedytrial/alerts/{id}/acknowledge` endpoints.

**Schema Surface (this feature):** uses tables `threshold_alerts`, `alert_escalations` — see `Y0c-schema-speedytrial.md` §Threshold Alerts & Escalation.
