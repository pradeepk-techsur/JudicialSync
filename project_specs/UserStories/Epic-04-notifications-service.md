## Epic 4: Notifications Service (F4)

### US-4.1: Receive Policy-Compliant Alerts Without Sensitive Content Exposure
**As a** judge (Judge Robert Hale), **I want to** receive notifications that link securely to case detail rather than embedding sensitive content in the message body, **so that** defendant, party, or sealed-case information is never exposed in an email preview or unsecured channel.

**Acceptance Criteria:**
- [ ] Notification body/preview text never contains party names, exhibit descriptions, sealed-case identifiers, or defendant-identifying detail
- [ ] Notifications are rendered from reviewed, approved templates — never free text — enforcing the content policy structurally
- [ ] Each notification includes a secure deep link requiring re-authentication rather than embedded detail
- [ ] A content-policy violation detected at render time blocks the send with `NOTIFY_CONTENT_POLICY_VIOLATION` (500, internal) rather than sending a non-compliant message

**Priority:** P0 | **Feature Ref:** F4

---

### US-4.2: Track Delivery Status and Escalate Failed Notifications
**As a** clerk/case administrator (David Okafor), **I want to** see delivery status (sent/failed/acknowledged) for notifications and have persistent failures escalate automatically, **so that** a critical alert never silently fails to reach anyone.

**Acceptance Criteria:**
- [ ] Email delivery failures are retried at least 3 times with exponential backoff before being marked `failed`
- [ ] A notification type with no configured recipient for a court raises a configuration exception rather than silently failing to send (`NOTIFY_NO_RECIPIENT_CONFIGURED`, 422)
- [ ] Persistent delivery failure after retries returns `NOTIFY_DELIVERY_FAILED` (502) and escalates to the Exception Queue
- [ ] Threshold-crossed and custody-unacknowledged notifications escalate to a secondary recipient after a configured maximum unacknowledged duration

**Priority:** P0 | **Feature Ref:** F4

---
