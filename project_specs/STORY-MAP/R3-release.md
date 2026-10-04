### Release R3: Pilot Hardening (P2 — 8 features, 17 stories)

**Theme:** Capabilities required before broader rollout beyond the initial pilot district(s): custody transfer tracking, judge-authorized sealing, jury review package assembly, physical/digital exhibit distinction, the full appeal-ready closeout package, continuance findings check, multi-defendant separation, and the Speedy Trial portfolio dashboard. Matches the vision document's "Pilot hardening" build-sequence increment and PRD's P2 tier.

**Stories:**
- US-20.1, US-20.2, US-20.3 (F20 Custody and Location Tracking)
- US-21.1, US-21.2 (F21 Sealing and Restricted Exhibit Handling)
- US-22.1, US-22.2 (F22 Jury Review Package Assembly)
- US-23.1, US-23.2 (F23 Physical and Digital Exhibit Distinction)
- US-24.1, US-24.2 (F24 Post-Trial Closeout, Full)
- US-33.1, US-33.2 (F33 Continuance Findings Check)
- US-34.1, US-34.2 (F34 Multi-Defendant Separation)
- US-36.1, US-36.2 (F36 Speedy Trial Portfolio Dashboard)

**Personas Served:** PER-01 (custody, jury package, full closeout, exhibit typing), PER-02 (sealing authorization, continuance findings, multi-defendant clocks, personal risk dashboard), PER-03 (type-specific intake rules, court-level risk dashboard), PER-04 (sealed-access audit linkage)

**JTBD Addressed:** JTBD-01.3 (custody transfer confirmation), JTBD-02.2 (continuance findings completeness, extended), JTBD-02.5 (authorized sealing and access oversight), JTBD-03.4 (portfolio-level visibility, Speedy Trial side)

**Acceptance Gate:**
- [ ] All NaC for included stories pass
- [ ] Maria can complete the full JRN-01.1 journey with zero gaps: custody handoff with recipient acknowledgment, jury package assembly excluding sealed/rejected items, and a full appeal-ready closeout package — no stage of JRN-01.1 remains partially implemented after this release
- [ ] Judge Hale can personally authorize sealing/release of a sensitive exhibit and review the sealed-access log (completing JRN-02.1 end-to-end); continuance records missing findings are flagged before chambers relies on them; multi-defendant matters maintain clearly separated, independently reviewable clocks (completing JRN-02.2 end-to-end)
- [ ] David can classify exhibit type at intake with type-specific custody enforcement, and view the Speedy Trial portfolio dashboard alongside the exhibit portfolio view (R4) to prioritize his full caseload
- [ ] No sealed exhibit is ever included in a jury package or courtroom display without the same judge's explicit, per-instance authorization (cross-checked against US-21.1, US-22.1)
- [ ] Release extends journey depth without breaking any R1/R2 flow
