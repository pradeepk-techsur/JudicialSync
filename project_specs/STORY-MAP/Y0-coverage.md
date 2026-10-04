---

## Coverage Analysis

### Persona Coverage

| Persona | R1 (P0) | R2 (P1) | R3 (P2) | R4 (P3) |
|---------|---------|---------|---------|---------|
| PER-01 (Maria Santos) | US-4.1, US-4.2, US-11.2, US-16.1, US-16.2, US-16.3, US-17.1, US-17.2, US-17.3, US-18.1, US-18.2, US-18.3 | US-19.1, US-19.2 | US-20.1, US-20.2, US-20.3, US-21.1 (via judge auth), US-22.1, US-22.2, US-23.2, US-24.1, US-24.2 | US-39.1, US-39.2 (indirect beneficiary) |
| PER-02 (Judge Hale / Ana Ibarra) | US-6.2, US-8.1, US-8.2, US-11.1, US-16.3 (ruling), US-28.1, US-28.2, US-29.1, US-29.2, US-29.3, US-30.1, US-30.2, US-31.1 | US-32.1, US-35.1, US-35.2 | US-21.1, US-21.2, US-33.1, US-33.2, US-34.1, US-34.2, US-36.1 | US-39.1, US-39.2 |
| PER-03 (David Okafor) | US-1.1–1.3 (consumer), US-3.1, US-3.3, US-6.1, US-7.1, US-7.2, US-10.1, US-11.3, US-14.1, US-14.2, US-15.1, US-15.2, US-15.3, US-26.1, US-26.3, US-27.1, US-27.2, US-31.2 | US-12.1, US-12.2, US-12.3 | US-23.1, US-33.2, US-36.1, US-36.2 | US-25.1, US-25.2 |
| PER-04 (Priya Nandan) | US-0.1, US-0.2, US-0.3, US-1.1–1.3 (owner), US-2.1, US-2.2, US-2.3, US-3.2, US-5.1, US-5.2, US-10.2, US-11.4, US-13.1, US-13.2, US-13.3 | US-9.1, US-9.2 | US-21.2, US-36.2 | US-37.1, US-37.2, US-38.1, US-39.2 |

Every persona has at least one fully completable journey within R1 alone (per the R1 Acceptance Gate), satisfying the "each release enables at least one complete journey" requirement.

### JTBD Coverage

| JTBD ID | Release | Stories | NaC Count |
|---------|---------|---------|-----------|
| JTBD-01.1 | R1 | US-17.1, US-17.2, US-16.3, US-11.2 | 4 |
| JTBD-01.2 | R1 | US-18.1, US-18.2, US-18.3, US-17.3 | 4 |
| JTBD-01.3 | R3 | US-20.1, US-20.2, US-20.3, US-23.2 (R1 alert half: US-4.1, US-4.2) | 5 |
| JTBD-01.4 | R2 | US-19.1, US-19.2 (R3 extension: US-24.1, US-24.2) | 4 |
| JTBD-02.1 | R1 | US-16.3, US-29.1, US-29.2, US-29.3 (R2 extension: US-32.1; R3 extension: US-34.1, US-34.2) | 7 |
| JTBD-02.2 | R1 | US-28.1, US-28.2, US-30.1, US-30.2 (R3 extension: US-33.1, US-33.2) | 6 |
| JTBD-02.3 | R1 | US-31.1, US-31.2, US-4.1, US-6.1 | 4 |
| JTBD-02.4 | R2 | US-35.1, US-35.2, US-8.1, US-8.2 | 4 |
| JTBD-02.5 | R3 | US-21.1, US-21.2, US-22.1, US-22.2 (R4 extension: US-39.1, US-39.2) | 6 |
| JTBD-03.1 | R1 | US-15.1, US-15.2, US-15.3 (R2 extension: US-12.1, US-12.2, US-12.3) | 6 |
| JTBD-03.2 | R1 | US-27.1, US-27.2, US-7.1, US-7.2, US-3.1 | 5 |
| JTBD-03.3 | R1 | US-14.1, US-14.2, US-26.1, US-26.2, US-26.3 | 5 |
| JTBD-03.4 | R3 | US-36.1, US-36.2 (R4 extension: US-25.1, US-25.2, US-38.1) | 5 |
| JTBD-03.5 | R1 | US-3.3 (R4 extension: US-37.1, US-37.2) | 3 |
| JTBD-04.1 | R1 | US-0.2, US-0.1, US-0.3, US-5.1, US-5.2 | 5 |
| JTBD-04.2 | R1 | US-2.1, US-2.2, US-2.3 | 3 |
| JTBD-04.3 | R1 | US-10.1, US-10.2, US-1.3 | 3 |
| JTBD-04.4 | R1 | US-13.1, US-13.2, US-13.3, US-21.2 | 4 |
| JTBD-04.5 | R1 | US-3.2, US-0.3 | 2 |

### Gap Analysis

- **No JTBD outcome is left entirely without a derived NaC** — all 19 JTBD IDs appear in the NaC Derivation Table (02-nac-derivation.md) or the NaC Coverage table above.
- **No persona lacks a release** — every persona has R1 stories and a completable R1 journey per the R1 Acceptance Gate.
- **No journey stage lacks feature coverage** — all 46 stage rows across the 8 journeys in JOURNEYS-JudicialSync.md have at least one mapped story in the Story Map Matrix.
- **Orphan stories relative to journey stages (flagged, not unmapped):** Six epics — F1 (US-1.1–1.3), F5 (US-5.1–5.2), F13 (US-13.1–13.3), F37 (US-37.1–37.2), F38 (US-38.1), F39 (US-39.1–39.2) — have no stage explicitly named in any of the eight journeys. These 13 stories are foundational/platform-wide or Scale-increment capabilities placed in the **Cross-Cutting Platform Foundation & Scale** lane (01d-matrix-per04-crosscutting.md) with NaC derived by extension rather than direct journey-stage traceability. (F23 and F32 are *not* orphans — both are placed directly in named journey-stage rows: F23 under JRN-01.1/JRN-03.2, F32 under JRN-02.2 — so they count toward the 80 directly-traced stories below, not this 13.) This is an explicit gap in JOURNEYS-JudicialSync.md's scenario coverage, not a gap in UserStories mapping — **recommend a follow-up journey-generation pass covering a "platform onboarding" or "national rollout" scenario for PER-04 if these capabilities need stage-level validation ahead of Release R4.**
- **JTBD-02.5 and JTBD-01.3 show their "zero unauthorized access" / "zero unacknowledged transfer" outcomes split across two releases (R1 partial + R3/R4 full).** This is intentional build-sequencing (alerting infrastructure ships R1; the sealing/custody domain logic it protects ships R3) but should be called out to stakeholders so a pilot demo doesn't imply full JTBD-01.3/JTBD-02.5 satisfaction before R3 ships.
- **No story exists with zero JTBD/NaC traceability** — all 93 stories trace to at least one JTBD outcome, either directly (80 stories via journey-stage traceability) or by reasonable extension (13 stories in the Cross-Cutting lane).
