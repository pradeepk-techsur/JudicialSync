---

## Release Planning

### Release R1: Foundation + Operational MVP (P0 — 23 features, 59 stories)

**Theme:** Shared platform foundation plus the core real-time courtroom logging and Speedy Trial calculation loop. Matches the vision document's "Foundation" + "Operational MVP" build-sequence increments (PROJECT.md). This is the smallest release in which both Maria and Judge Hale can complete a full trial day, and David/Priya can run a full Speedy Trial clerk/governance lifecycle, end to end.

**Stories:**
- **Shared platform:** US-0.1, US-0.2, US-0.3 (F0 Identity/Access); US-1.1, US-1.2, US-1.3 (F1 Case/Docket Model); US-2.1, US-2.2, US-2.3 (F2 Audit Trail); US-3.1, US-3.2, US-3.3 (F3 Configuration Engine); US-4.1, US-4.2 (F4 Notifications); US-5.1, US-5.2 (F5 Search); US-6.1, US-6.2 (F6 Work Queue); US-7.1, US-7.2 (F7 Exception Queue); US-8.1, US-8.2 (F8 Case Timeline); US-10.1, US-10.2 (F10 CM/ECF Adapter); US-11.1, US-11.2, US-11.3, US-11.4 (F11 Role-Specific UI); US-13.1, US-13.2, US-13.3 (F13 Security Baseline)
- **Evidentiary Tracking MVP:** US-14.1, US-14.2 (F14 Setup); US-15.1, US-15.2, US-15.3 (F15 Intake); US-16.1, US-16.2, US-16.3 (F16 Ledger); US-17.1, US-17.2, US-17.3 (F17 Courtroom Logging); US-18.1, US-18.2, US-18.3 (F18 Reconciliation)
- **Speedy Trial MVP:** US-26.1, US-26.2, US-26.3 (F26 Tracker Init); US-27.1, US-27.2 (F27 Event Mapping); US-28.1, US-28.2 (F28 Candidate Exclusion); US-29.1, US-29.2, US-29.3 (F29 Calculation/Explainability); US-30.1, US-30.2 (F30 Review/Approval); US-31.1, US-31.2 (F31 Threshold Alerts)

**Personas Served:** PER-01, PER-02, PER-03, PER-04 (all four fully served)

**JTBD Addressed:** JTBD-01.1, JTBD-01.2 (partial — custody/export detail lands R2/R3), JTBD-02.1, JTBD-02.2, JTBD-02.3, JTBD-03.1, JTBD-03.2, JTBD-03.3, JTBD-03.5, JTBD-04.1, JTBD-04.2, JTBD-04.3, JTBD-04.4, JTBD-04.5 (partial — portal-boundary half lands R2)

**Acceptance Gate:**
- [ ] All NaC for included stories pass (see NaC Derivation Table and NaC-to-AC Mapping)
- [ ] Maria can complete a full trial day end-to-end: pre-session setup → real-time logging → recess reconciliation → certified export is deferred to R2 (US-19.x), so R1's gate is "zero reversion to paper" + "zero unresolved discrepancies at session close," not yet the certified-export artifact
- [ ] Judge Hale can open "explain this date," review/approve a candidate exclusion, and receive a threshold alert fully end-to-end without using a sealed-exhibit or multi-defendant flow (those are R3)
- [ ] David can set up a case, process intake, resolve exceptions, and initialize/track a Speedy Trial tracker without portfolio dashboards (R3/R4) or external-portal intake (R2)
- [ ] Priya can enforce access control, investigate via the audit explorer, and govern a privileged configuration/CM/ECF conflict end-to-end
- [ ] No feature in this release auto-finalizes a ruling, exclusion, override, or final Speedy Trial status — every such action requires explicit human approval (binding constraint, verified against US-16.3, US-26.2, US-29.3, US-30.1, US-30.2)
