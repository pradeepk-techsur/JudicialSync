### Flow 1: Custody Transfer & Escalation

**Trigger:** Deputy needs to transfer a physical exhibit to evidence storage/custodian (overnight, recess, or post-trial).
**User Stories:** US-20.1, US-20.2, US-20.3
**Journey:** JRN-01.2 (End-of-Day Custody Transfer → Resolution Confirmed Before Next Session)

```
[Deputy Real-Time Logging] ──▶ exhibit row action: "Transfer Custody"
   │
   ▼
[Deputy Custody Transfer form] (Screen-03)
   │  recipient, purpose, location, condition note
   │
   ├── Recipient unregistered/unknown ──▶ CUSTODY_UNKNOWN_CUSTODIAN (422) — blocked
   │
   ├── Type-specific field missing (e.g., contraband auth ref) ──▶ CUSTODY_MISSING_TYPE_FIELD (422) — blocked
   │
   └── Valid submission ──▶ transferor's initiation = acknowledgment of release
            │
            ▼
      Transfer record enters `pending` ──▶ notification to designated recipient
            │
            ├── Recipient acknowledges within SLA ──▶ transfer = `completed`,
            │        custodian/location fields update, custody history entry added
            │
            └── SLA window elapses without acknowledgment
                     │
                     ▼
               CUSTODY_SLA_BREACH ──▶ escalation alert to supervisory role (F4)
                     │
                     ▼
               Supervisor/deputy follows up ──▶ acknowledgment still required (never auto-completes)
```

**Steps:**
1. From the active logging screen, the deputy opens the custody transfer form inline (no navigation away from the session).
2. Form enforces type-specific required fields (US-23.2) before submission is allowed — contraband and special-storage types block submission until satisfied.
3. The transfer sits in `pending` with a visible SLA countdown badge; only the designated recipient's explicit acknowledgment (never a timeout) completes it (US-20.2).
4. If the SLA elapses, an escalation notification fires automatically to a supervisory role — the deputy sees a visual "Escalated" tag rather than being left to notice the silence herself.

**States covered:** form-validation-error, pending-awaiting-ack, sla-warning (approaching), sla-breached-escalated, completed.
