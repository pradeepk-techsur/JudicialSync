### Flow 7: Sealed-Record Access Investigation via Audit Explorer

**Trigger:** A defense attorney disputes that a sealed exhibit was improperly viewed.
**User Stories:** US-2.1, US-2.2, US-2.3, US-21.2, US-0.2
**Journey:** JRN-04.1 (Dispute Reported → Findings Delivered)

```
[Admin Dashboard Home] ──▶ "Dispute Reported" — admin opens Audit Explorer scoped to the exhibit
   │
   ▼
[Audit Explorer] (Screen-17)
   │  filters: case_id, user_id, date_range, object_type = exhibit
   │
   ├── Requester lacks audit_reader entitlement ──▶ AUDIT_READ_DENIED (403)
   │
   └── Authorized query ──▶ chronological list: actor, action_type, before/after diff,
            rule/calculation version link — EVERY access attempt (success + denied) shown individually
   │
   ▼
[Access Control Cross-Check]
   │  for each access row, admin opens the user's role/attribute scope AS IT WAS at that timestamp
   │  (Identity & Role Management screen, point-in-time view)
   │
   ▼
[Rule-Version Linkage Review]
   │  confirms which sealing authorization (F21) was in effect at the moment of each access
   │  — every audit row links directly to the authorizing judge action, no gray area
   │
   ▼
[Findings Delivered]
   │  structured report exported: every access row + authorization linkage + conclusion
   │  (uses same export pattern as F9 reporting — de-identified where appropriate, role-limited)
```

**Steps:**
1. The Audit Explorer is **strictly read-only** — no edit/delete affordance exists anywhere in its UI, and the underlying write API is service-to-service only, never reachable from this screen (US-2.3).
2. Hash-chain integrity is visually confirmed via a persistent "Chain verified ✓" Summary Box at the top of any query result; a detected break would instead surface as a blocking critical Alert, never a quiet log line (US-2.2).
3. An attempt to view sealed-case audit entries without the matching security-designation entitlement returns a 403 that is **itself** logged as a new audit row — visible the next time anyone queries this same object (US-2.1, recursive accountability).
4. Direct-ID access attempts against a sealed exhibit by an unauthorized party return "not found," never "access denied" — the investigation screen reflects this by showing denied attempts as their own distinct row type so Priya can distinguish "tried and was told no" from "tried and the system said it doesn't exist" (US-21.2).

**States covered:** query-unauthorized, query-authorized-clean, query-shows-denied-attempts, chain-verified, chain-broken-escalated, findings-exported.
