## PER-02: Judge Robert Hale (with Law Clerk Ana Ibarra)

### JRN-02.1: Trial Day from the Bench and Chambers — Ruling, Oversight, and Sealing Authorization

**Persona:** PER-02 (Judge Robert Hale, with Ana Ibarra)
**Scenario:** During the same multi-day evidentiary hearing Maria operates from the deputy station (JRN-01.1), Judge Hale rules live on objections from the bench, monitors the shared exhibit status with chambers, and is asked mid-trial to personally authorize sealing a sensitive exhibit before confirming the jury review package and reviewing the sealed-access log after trial.
**Related Jobs:** JTBD-02.5, JTBD-02.1

#### Journey Stages

| Stage | Action | Touchpoint | Thinking | Feeling | Pain Point | Opportunity |
|-------|--------|------------|----------|---------|------------|-------------|
| Pre-Session Briefing | Glances at the chambers workspace summary of today's proceeding — exhibits pre-loaded, any open exceptions flagged | Role-Specific UI Workspaces (F11), Case Timeline View (F8) | "Is there anything unresolved from yesterday I need to know before we start?" | Composed, preparing | Being blindsided mid-session by an unresolved exhibit issue | A single pre-session summary card showing open items relevant to today's docket |
| Live Ruling on Objection | Rules from the bench on an exhibit objection and watches Maria's log capture the ruling in real time on the shared live display | Real-Time Courtroom Logging (F17, via F11) | "This has to show it was my ruling, recorded accurately — not something the system decided" | Attentive, protective of accuracy | Any lag or ambiguity between his spoken ruling and the recorded record undermines trust instantly | Instant, explicit on-screen attribution confirming "Ruling entered: Judge Hale" the moment it's logged |
| Mid-Trial Sealing Request | Reviews and personally authorizes sealing a sensitive exhibit flagged by counsel or Maria | Sealing and Restricted Exhibit Handling (F21) | "I'm not letting this happen automatically — sealing has to be my call, logged clearly" | Deliberate, careful | Without an explicit authorization step, sensitive material risks casual handling or loose exposure control | One clear authorize/deny action tied to his credentials, with every subsequent access attempt logged |
| Jury Review Authorization | Confirms the assembled jury review package contains only properly admitted, non-sealed electronic exhibits | Jury Review Package Assembly (F22) | "I need to be certain nothing improper reaches the jury room" | Vigilant | Manually double-checking package contents against the admitted list would be slow and risky under time pressure | Package assembly structurally excludes rejected/withdrawn/sealed items, with a simple confirmation view |
| Post-Trial Record Review | Reviews the certified exhibit export and the sealed-access log before signing off on the record | Exportable Exhibit List (F19), Audit Trail / Sealed-Access Log (F21, F2) | "Did anyone access the sealed exhibit who shouldn't have?" | Satisfied if clean, alarmed if not | Previously no structured way existed to confirm sealed-access integrity after the fact | A reviewable access log attached directly to the sealing decision, available on demand |

#### Key Moments
- **Decision Point:** Mid-Trial Sealing Request — his explicit authorize/deny decision is the entire control point for sensitive-exhibit exposure.
- **Risk of Abandonment:** Live Ruling on Objection — if the system ever appears to infer or auto-populate a ruling, Judge Hale could lose trust in the tool for the rest of the proceeding.
- **Delight Opportunity:** Post-Trial Record Review — a clean, reviewable sealed-access log confirming zero improper access without having to ask anyone to dig for it.

#### Success Outcome
Zero unauthorized-access attempts succeed against exhibits he has sealed (JTBD-02.5), and every ruling remains explicitly and visibly attributed to him in real time, preserving judicial authority throughout the proceeding (JTBD-02.1).

#### Feature Touchpoints

| Stage | Features |
|-------|----------|
| Pre-Session Briefing | F11, F8 |
| Live Ruling on Objection | F17, F11 |
| Mid-Trial Sealing Request | F21 |
| Jury Review Authorization | F22 |
| Post-Trial Record Review | F19, F21, F2 |

---
