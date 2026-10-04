### PER-04: Priya Nandan — JRN-04.1: Investigating a Disputed Sealed-Record Access

| Activity | Persona | Epic | Stories | NaC | Release |
|----------|---------|------|---------|-----|---------|
| Dispute Reported: single audit explorer entry point scoped to the disputed object, via the admin dashboard | PER-04 | Epic 11 (F11) | US-11.4 | JTBD-04.2 (context): dashboard composes configuration, identity/role management, reporting feed, and adapter health from one place | R1 |
| Audit Explorer Query: filters and reconstructs full history by case, user, date range, object | PER-04 | Epic 2 (F2) | *(see US-2.1 under PER-01/JRN-01.2)* | JTBD-04.2: queries the tamper-evident audit explorer by case, user, date range, or object to produce a defensible, structured answer | R1 |
| Access Control Cross-Check: cross-references the access log against RBAC/ABAC scope at the time of access | PER-04 | Epic 0 (F0) | US-0.1, US-0.2, US-0.3 | JTBD-04.1: RBAC/ABAC scoping covers court/division/case/proceeding/party-role/security-designation; zero unauthorized access succeeds against sealed/restricted records | R1 |
| Rule-Version Linkage Review: confirms which sealing policy and judge authorization were in effect at the time | PER-04 | Epic 21 (F21) | *(see US-21.1/US-21.2 under PER-02/JRN-02.1)* | JTBD-04.4 (context): sensitive record handling is enforced via explicit policy configuration, confirmed under audit | R3 |
| Findings Delivered: structured, defensible findings report delivered via de-identified operational reporting | PER-04 | Epic 9 (F9) | US-9.1, US-9.2 | JTBD-04.2 (context, extended): a reusable, repeatable investigation pattern shortens every future response time, surfaced through role-limited reporting exports | R2 |

---

### PER-04: Priya Nandan — JRN-04.2: Governing a Privileged Configuration Change and CM/ECF Conflict

| Activity | Persona | Epic | Stories | NaC | Release |
|----------|---------|------|---------|-----|---------|
| Configuration Change Requested: separation-of-duties ensures David's routine role can request but not approve | PER-04 | Epic 3 (F3) | *(see US-3.2 under PER-03/JRN-03.2 via Lane PER-01/JRN-01.2)* | JTBD-04.5: requires a distinct second approver before a new rule-package version takes effect | R1 |
| CM/ECF Conflict Flagged: inbound docket update conflicting with a local record routes to Priya's review queue | PER-04 | Epic 10 (F10) | US-10.2 | JTBD-04.3 (via Journey-to-JTBD traceability): zero silent overwrites of CM/ECF docket data; all conflicts route to human review | R1 |
| CM/ECF Conflict Flagged: conflict appears in the shared Exception Queue, not a silent overwrite | PER-04 | Epic 7 (F7) | *(see US-7.1/US-7.2 under PER-03/JRN-03.2)* | JTBD-04.3 (context): a silent overwrite would be a serious integrity and compliance risk | R1 |
| Conflict Resolution: both versions reviewed, source lineage preserved on the authoritative docket side | PER-04 | Epic 10 (F10) | *(see US-10.1 under PER-03/JRN-03.1)* | JTBD-04.3 (context): source-identifier preservation on all imported records makes the resolution traceable and defensible after the fact | R1 |
| Configuration Change Approved: versioned, audit-logged, governed change process | PER-04 | Epic 3 (F3) | *(see US-3.2 under PER-03/JRN-03.2)* | JTBD-04.5: governed, versioned configuration changes carry a full audit trail | R1 |
| Verification via Audit Explorer: confirms both actions are fully attributed, versioned, and segregated | PER-04 | Epic 2 (F2) | *(see US-2.1 under PER-01/JRN-01.2)* | JTBD-04.5 (via Journey-to-JTBD traceability): privileged administrative actions remain fully segregated and auditable at all times | R1 |

---

### Cross-Cutting Platform Foundation & Scale Capabilities (No Dedicated Journey Touchpoint)

Six epics (F1, F5, F13, F37, F38, F39) have no stage explicitly named in JOURNEYS-JudicialSync.md's eight journeys. They are foundational/platform-wide or Scale-increment capabilities that underpin every persona's journey rather than appearing as a discrete step. (F23 and F32 are *not* included here — both already have dedicated journey-stage placements in the lane tables above: F23 under PER-01/JRN-01.1 "Custody Handoff" and PER-03/JRN-03.2 "Exception Triage"; F32 under PER-02/JRN-02.2 "Explain This Date Review.") Placed here per PER-04's cross-cutting platform-ownership role (per PERSONAS-JudicialSync.md: "Admin's access-control, audit, and CM/ECF integration decisions silently underpin every other persona's ability to trust the data they see").

| Activity | Persona | Epic | Stories | NaC | Release |
|----------|---------|------|---------|-----|---------|
| Establish the shared case/docket data model consumed by both domain modules | PER-03 (consumer) / PER-04 (owner) | Epic 1 (F1) | US-1.1, US-1.2, US-1.3 | JTBD-03.3 / JTBD-04.3 (extended): both modules read case/proceeding/party context exclusively through the shared case-context API — no module maintains a shadow copy, and source identifiers are never broken by local edits | R1 |
| Search across exhibits, trackers, and case objects respecting access scope | PER-03 | Epic 5 (F5) | US-5.1, US-5.2 | JTBD-04.1 (extended): sealed/restricted records never appear in search results for unauthorized users, not even as a placeholder hit | R1 |
| Enforce platform-wide security and compliance baseline (encryption, malware scanning, retention) | PER-04 | Epic 13 (F13) | US-13.1, US-13.2, US-13.3 | JTBD-04.4: encryption, malware scanning, approved file-type controls, and explicit policy-driven handling enforced platform-wide; zero unauthorized-access attempts succeed | R1 |
| Define the national configuration baseline and route out-of-scope local changes to governance review | PER-04 | Epic 37 (F37) | US-37.1, US-37.2 | JTBD-03.5 (extended nationally): local configuration changes are made directly within permitted override scope, with national core constraints never bypassed | R4 |
| View de-identified, cross-court trend analytics for AO program management | PER-04 | Epic 38 (F38) | US-38.1 | JTBD-03.4 (extended cross-court): portfolio-wide risk visibility extended to AO program management, never usable for judicial performance evaluation | R4 |
| Integrate broader courtroom display/streaming technology for authorized evidence | PER-01 / PER-02 | Epic 39 (F39) | US-39.1, US-39.2 | JTBD-02.5 (extended to hardware): sealed/restricted exhibits follow identical judge-authorization rules on courtroom display as in jury packages | R4 |
