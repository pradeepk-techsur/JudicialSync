### Flow 2: Judge Live Ruling & Mid-Trial Sealing Authorization

**Trigger:** Judge is on the bench during the same session Maria is logging (Flow 0); a sensitive exhibit requires sealing.
**User Stories:** US-16.3, US-17.1, US-21.1, US-22.1
**Journey:** JRN-02.1 (Pre-Session Briefing → Post-Trial Record Review)

```
[Chambers Oversight Home] ──▶ "Today's Proceeding" card
   │
   ▼
[Live Courtroom Status panel] (read-mostly, mirrors Deputy screen in real time)
   │
   ├── Judge rules verbally from the bench (no system interaction required to rule —
   │        the deputy logs it; chambers SEES "Ruling entered: Judge Hale — Admitted"
   │        appear instantly, with timestamp, no refresh needed)
   │
   └── Counsel/deputy flags an exhibit as sensitive
            │
            ▼
      [Sealing & Jury Package Authorization] (Screen-09)
            │
            ├── Judge authorizes seal ──▶ requires authorizing_judge_id = actual judge role holder
            │        │        (a clerk cannot self-authorize — SEAL_AUTHORIZATION_DENIED, 403)
            │        ▼
            │   Exhibit sealed; excluded from jury package by default;
            │   every subsequent access attempt (success or denial) logged individually
            │
            └── Later: Release requested ──▶ symmetric judge-authorized action,
                     requires documented release_reason
   │
   ▼
[Jury Review Authorization] (same screen, package tab)
   │  Judge confirms package = admitted, non-sealed electronic exhibits only
   │
   ▼
[Post-Trial Record Review]
   │  Judge reviews certified export (F19) + sealed-access log (F21/F2) before sign-off
```

**Steps:**
1. Chambers' Live Courtroom Status panel is a **read-mostly mirror** of the deputy's logging screen — rulings appear the instant the deputy records them, explicitly attributed, with zero manual refresh (US-11.1, "live to chambers").
2. The judge never "clicks a ruling" in this flow — the deputy's entry, attributed to the judge, is what the system persists. The judge's only *write* action here is the sealing authorization, which is structurally distinct and requires his own credentials.
3. Sealing/release is a dedicated, deliberate action — never bundled into a general "edit exhibit" affordance — with a mandatory rationale on release (US-21.1).
4. Jury package authorization structurally excludes sealed/rejected/withdrawn items; the judge confirms scope rather than manually cross-checking a raw ledger (US-22.1).
5. Post-trial, the judge reviews a reviewable sealed-access log attached directly to the sealing decision — every access attempt, successful or denied, appears individually (US-21.2).

**States covered:** live-mirrored-ruling, seal-pending-authorization, sealed-active, release-pending-rationale, package-authorized, access-log-clean, access-log-flagged.
