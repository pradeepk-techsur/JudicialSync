## F33: Continuance Findings Check

**Description:** Flags continuance records that lack required structured findings or supporting order references, leaving legal sufficiency determination entirely to the judge and chambers. This feature is a pure completeness check — it never evaluates whether findings are legally adequate, only whether the structural prerequisites (a findings field populated, an order reference present) exist for chambers to make that judgment.

**Terminology:**
- **Continuance Record:** A docket-event-derived or manually entered record of a continuance request/grant, linked to a candidate or confirmed exclusion (F28/F30).
- **Structured Findings:** The court's required documentation (per its Speedy Trial plan) that specific statutory findings (e.g., "ends of justice" findings under 18 U.S.C. § 3161(h)(7)) were made and recorded — the presence of the field, not its legal content, is what this feature checks.

**Sub-features:**
- Structured-completeness check on continuance records (findings present, order reference present)
- Flag-only behavior — system never determines legal sufficiency
- Routed to chambers/judge review queue when incomplete

**Process:**
1. When a docket event categorized (F27) as a continuance-related event is ingested, or a candidate/confirmed exclusion (F28) is linked to a continuance category, the system checks whether the associated record has: (a) a populated structured-findings field reference, and (b) a linked order document reference (F01).
2. If either is missing, the system flags the continuance record `incomplete` and routes it to the chambers/judge review queue (F06) as a `continuance_findings_incomplete` task — distinct from, but feeding into, the general Exception Queue (F07) given its chambers-specific routing.
3. The flag is purely structural — the system does not and cannot evaluate whether the findings, once present, are legally sufficient; that determination remains with the judge/chambers.
4. Chambers/judge reviews the flagged continuance, either supplies the missing findings/order reference (if merely a data-entry gap) or confirms the legal record independently (outside this system) and updates the reference accordingly.
5. Once complete, the continuance record's completeness flag clears and the associated exclusion can proceed through normal F30 review/confirmation.
6. The flag-and-resolution cycle is audit-logged (F02).

**Inputs:**
- Continuance-categorized docket event or exclusion record
- `structured_findings_ref` (nullable at ingestion, required for completeness)
- `order_document_ref` (nullable at ingestion, required for completeness)

**Outputs:**
- Continuance record with `complete`/`incomplete` completeness flag
- `continuance_findings_incomplete` task (F06) when incomplete

**Validation:**
- The completeness check evaluates only field presence (is there a findings reference, is there an order reference) — it must never attempt to parse, evaluate, or score the *content* of findings for legal sufficiency; any such evaluation would violate the human-in-command NFR and the explicit PRD/vision scope boundary.
- An exclusion linked to an incomplete continuance record may still exist in `candidate` state (F28) but should carry a visible warning in its review UI; whether it may be confirmed (F30) while incomplete is a court-configurable policy (`[ASSUMPTION]`: default behavior blocks confirmation until complete, but courts may configure allowing confirmation with an acknowledged-incomplete flag, to be validated during pilot).
- Resolution of the completeness flag (supplying missing references) requires chambers/judge-equivalent entitlement per F03 workflow configuration, not general clerk access.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Confirmation of exclusion attempted while continuance incomplete (court policy blocks this) | 409 | CONTINUANCE_INCOMPLETE_BLOCKS_CONFIRM | "This exclusion cannot be confirmed until continuance findings are complete" |
| Completeness resolution attempted by unauthorized user | 403 | CONTINUANCE_RESOLVE_DENIED | "You are not authorized to resolve continuance findings completeness" |
| System attempts content-level sufficiency evaluation (should never occur) | 500 (internal guard) | CONTINUANCE_SCOPE_VIOLATION | "System defect: sufficiency evaluation is out of scope" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Continuance Findings for `/speedytrial/continuances/{id}/completeness`, `/speedytrial/continuances/{id}/supply-references` endpoints.

**Schema Surface (this feature):** uses table `continuance_records` (extends exclusion/event model with findings/order reference fields) — see `Y0c-schema-speedytrial.md` §Continuance Findings Check.
