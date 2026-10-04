## F04: Notifications Service

**Description:** Delivers configurable alerts and notices to authorized users via email, in-application, or other approved channels, without exposing sensitive case details in notification text. Every other alert-producing feature (F18 reconciliation, F20 custody, F31 threshold alerts, F07 exceptions) routes through this shared service rather than implementing its own delivery logic.

**Terminology:**
- **Notification Channel:** A delivery mechanism (email, in-app, other court-approved channel) configured per court/recipient.
- **Content Policy:** The rule set preventing sensitive case/exhibit/defendant detail from appearing in notification bodies or previews, replaced instead by a secure deep link requiring re-authentication.
- **Delivery Status:** The lifecycle state of a notification instance (queued, sent, delivered, failed, acknowledged).

**Sub-features:**
- Multi-channel delivery (email, in-app, extensible channel registry)
- Configurable recipients, cadence, and thresholds per court (reads from F03)
- Delivery-status tracking (sent/failed/acknowledged) with retry on transient failure
- Content policy enforcement preventing sensitive data in notification text/previews

**Process:**
1. A triggering feature (F07, F18, F20, F31, etc.) calls the Notifications Service with: recipient(s) or recipient role, notification type, severity, object reference (case/exhibit/tracker ID — not embedded content), and court context.
2. Notifications Service resolves the court-configured recipient list and channel preferences (F03) for the given notification type.
3. Service applies the content policy: notification body contains only a generic description ("A Speedy Trial threshold has been reached for a case on your docket") plus a secure deep link; it never embeds defendant name, exhibit description, or sealed-case detail in the body or push-preview text.
4. Service renders the notification per channel (email template, in-app banner) and enqueues delivery.
5. Delivery adapter sends via the channel; delivery status (sent/failed) is recorded.
6. For channels supporting read receipts or in-app acknowledgment, the recipient's acknowledgment is recorded and timestamped.
7. Failed deliveries are retried per a configurable backoff policy; persistent failures escalate to the Exception Queue (F7) and, for custody/threshold alerts specifically, to a secondary recipient per F03 escalation configuration.
8. All notification send/delivery/acknowledgment events are logged (not necessarily as full F02 audit events, but as delivery-tracking records queryable by admins — `[ASSUMPTION]`: notification delivery logs are operational records, distinct from the legal-significance-triggering audit trail, though threshold-alert *acknowledgment* specifically does feed F02 since it is evidence a human reviewed a risk signal).

**Inputs:**
- `recipient_role` or `recipient_user_id` (required, at least one)
- `notification_type` (enum, required): exception_raised | reconciliation_discrepancy | custody_unacknowledged | threshold_crossed | approval_needed | config_changed
- `severity` (enum, required): info | warning | critical
- `object_reference` (object_type, object_id — required, used to build the deep link, never embedded content)
- `court_id` (required, for recipient/channel resolution)

**Outputs:**
- Notification instance record with delivery status
- Rendered, policy-compliant message per channel
- Delivery/acknowledgment status queryable by the triggering feature and by admins

**Validation:**
- Notification body/preview text must never contain party names, exhibit descriptions, sealed-case identifiers, or defendant-identifying detail — content policy is enforced by template, not by developer discipline alone (templates are reviewed/approved assets, not free-text).
- A notification type with no configured recipient for a given court must raise a configuration exception (F07), not silently fail to send.
- Threshold-crossed and custody-unacknowledged notifications require escalation-cadence configuration (F03) with a defined maximum unacknowledged duration before secondary escalation fires.
- Email channel delivery failures are retried at least 3 times with exponential backoff before being marked `failed` and escalated.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| No recipient configured for notification type/court | 422 | NOTIFY_NO_RECIPIENT_CONFIGURED | "No recipient is configured for this alert type in this court" |
| Delivery channel unavailable | 502 | NOTIFY_CHANNEL_UNAVAILABLE | "Notification channel temporarily unavailable; retry scheduled" |
| Content policy violation detected in template render | 500 (internal, blocks send) | NOTIFY_CONTENT_POLICY_VIOLATION | "Notification blocked: content policy violation detected" |
| Persistent delivery failure after retries | 502 | NOTIFY_DELIVERY_FAILED | "Notification could not be delivered after retries" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Notifications for `/notifications` (internal service-to-service trigger), `/notifications/my` (user-facing inbox), `/notifications/{id}/acknowledge` endpoints.

**Schema Surface (this feature):** uses tables `notifications`, `notification_deliveries`, `notification_recipients_config` — see `Y0a-schema-shared.md` §Notifications.
