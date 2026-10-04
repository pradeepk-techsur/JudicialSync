### Release R4: Scale (P3 — 4 features, 7 stories)

**Theme:** Later-increment capabilities supporting national/cross-court maturity — exhibit portfolio dashboard and reusable court templates, cross-court governance and national configuration, advanced cross-court analytics, and broader courtroom technology integration. Matches the vision document's "Scale" build-sequence increment and PRD's P3 tier. None of these stories are required for a single-district pilot to succeed.

**Stories:**
- US-25.1, US-25.2 (F25 Exhibit Portfolio Dashboard and Court Templates)
- US-37.1, US-37.2 (F37 Cross-Court Governance and National Configuration)
- US-38.1 (F38 Advanced Analytics)
- US-39.1, US-39.2 (F39 Broader Courtroom Technology Integration)

**Personas Served:** PER-03 (exhibit portfolio view, court templates), PER-04 (national governance, cross-court analytics, courtroom tech integration monitoring), PER-01/PER-02 (indirect beneficiaries of courtroom display integration)

**JTBD Addressed:** JTBD-03.4 (extended cross-court, exhibit side), JTBD-03.5 (extended to national governance), JTBD-02.5 (extended to courtroom hardware)

**Acceptance Gate:**
- [ ] All NaC for included stories pass
- [ ] David's full caseload portfolio view now covers exhibit operations (open exceptions, custody backlog, closeout status) in addition to the Speedy Trial dashboard delivered in R3 — completing JRN-03.1's "Portfolio Check Across Caseload" stage across both modules
- [ ] A new court can be onboarded from a versioned, immutable template without per-court code forks (US-25.2)
- [ ] Priya can define and enforce a national configuration baseline distinguishing locked fields from court-overridable ones, with governance-review routing for out-of-scope requests (US-37.1/37.2)
- [ ] AO program management can view de-identified, aggregate-only cross-court trend analytics with no drill-through to individual cases or defendants, and no metric functions as a judicial-performance proxy (US-38.1)
- [ ] Courtroom display/streaming sessions never expose content beyond the specific judge-authorized exhibit(s), with unregistered hardware endpoints rejected and logged (US-39.1/39.2)
- [ ] Release extends journey depth and national scale without breaking any R1–R3 flow
