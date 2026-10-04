### Release R2: MVP-Adjacent Completion (P1 — 5 features, 10 stories)

**Theme:** Rounds out the R1 MVP with the capabilities needed for a *credible* pilot but not strictly blocking the core loop: basic certified exhibit export/closeout, the external attorney portal, calculation version comparison, operational reporting, and chambers' case conference view. Matches PRD's "P1 — High, MVP-adjacent" tier.

**Stories:**
- US-9.1, US-9.2 (F9 Operational Reporting Feed)
- US-12.1, US-12.2, US-12.3 (F12 Restricted External Attorney Portal)
- US-19.1, US-19.2 (F19 Exportable Exhibit List and Basic Closeout)
- US-32.1 (F32 Calculation Version History / "What Changed")
- US-35.1, US-35.2 (F35 Case Conference View)

**Personas Served:** PER-01 (certified export), PER-02 (version comparison + conference view), PER-03 (external portal intake), PER-04 (operational reporting)

**JTBD Addressed:** JTBD-01.4 (certified export in minutes), JTBD-02.1 (extended — "what changed" explainability), JTBD-02.4 (conference-ready case view), JTBD-03.1 (external-channel intake discipline)

**Acceptance Gate:**
- [ ] All NaC for included stories pass
- [ ] Maria's trial-closeout journey now produces a one-click certified interim export (US-19.1/19.2) without re-typing — completes the JRN-01.1 "Trial Closeout" stage that R1 left partial
- [ ] Ana can generate a pre-conference review packet from the case conference view (US-35.1/35.2) without manual docket reconstruction — completes JRN-02.2's "Status Conference Preparation" stage
- [ ] An authorized external attorney can submit structured exhibit metadata and view read-only Speedy Trial summaries without any write access to the official ledger or docket (US-12.1/12.2), and David reviews those submissions through the identical internal queue (US-12.3)
- [ ] Judge Hale can see a structured diff of what changed between two calculation versions, with override rationale displayed inline (US-32.1)
- [ ] Release extends journey depth without breaking any R1 flow — no R1 story's acceptance criteria regress
