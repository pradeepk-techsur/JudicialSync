### Screen 15: Admin Dashboard Home

**Purpose:** Priya's landing workspace composing configuration, identity/role management, operational reporting feed, and CM/ECF adapter health — platform-wide settings and integration monitoring from one place.
**User Stories:** US-11.4, US-0.2, US-0.3
**Workspace:** Admin Dashboard

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Header | Side Navigation: Home · Configuration · Identity & Roles ·│
│         Audit Explorer · Integrations · Reporting                  │
├────────────┬───────────────────────────────────────────────────┤
│  Side Nav  │  ┌─ System Health Summary ─────────────────────────┐ │
│            │  │ CM/ECF adapter: ✓ Healthy (last sync 4m ago)     │ │
│            │  │ Audit chain: ✓ Verified   Pending approvals: 3   │ │
│            │  └────────────────────────────────────────────────────┘ │
│            │                                                       │
│            │  ┌─ Pending Privileged Approvals ──────────────────┐ │
│            │  │ Config: Event mapping update — drafted by D.O.  │ │
│            │  │   [Cannot self-approve — requires 2nd approver] │ │
│            │  │   [Review & Approve →]                           │ │
│            │  └────────────────────────────────────────────────────┘ │
│            │                                                       │
│            │  ┌─ Operational Reporting Feed (de-identified) ────┐ │
│            │  │ "Administrative metrics — not for use in case    │ │
│            │  │  determinations" (persistent label)              │ │
│            │  │ Backlog age ↓12%  Data quality 97%  Adoption 88%│ │
│            │  └────────────────────────────────────────────────────┘ │
└────────────┴───────────────────────────────────────────────────┘
```

**USWDS components:** Side navigation, Card, Summary Box, Tag (health status), Icon, Button, persistent disclaimer banner (Site Alert, info).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | System Health Summary (adapter, audit chain integrity) | Top |
| Primary | Pending Privileged Approvals, with SoD explanation visible inline | Upper-middle |
| Secondary | Operational Reporting Feed snapshot, persistent disclaimer label | Lower section |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| All systems healthy | Green Tags throughout | — |
| Adapter unhealthy | Red Tag + banner | "CM/ECF feed unavailable" (CMECF_UNAVAILABLE, 503) — persistent until resolved |
| Audit chain break detected | Full-width critical Alert, cannot be dismissed | "Audit integrity check failed — escalated" (AUDIT_CHAIN_BROKEN) — routes to a P0 exception automatically |
| Self-drafted approval pending | "Review & Approve" explicitly disabled for the drafter | Tooltip explains separation-of-duties requirement |
| No pending approvals | Empty-state text | "No privileged actions awaiting approval" |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Review & Approve →" | Button, SoD-gated | Only enabled for a user who is NOT the drafter; navigates to Screen-16 |
| System Health rows | Clickable | Deep-link to Screen-18 (Integrations) or Screen-17 (Audit Explorer) |
| Reporting Feed card | Clickable | Navigates to full reporting view (F09), same de-identification rules apply |
