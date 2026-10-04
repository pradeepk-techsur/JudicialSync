## F23: Physical and Digital Exhibit Distinction

**Description:** Distinguishes file reference, physical item, demonstrative aid, contraband, and special-storage item types within the ledger to support differentiated custody and storage treatment. This classification underlies several other features' eligibility logic (F22's electronic-only jury package inclusion, F20's type-specific custody fields).

**Terminology:**
- **Exhibit Type:** The classification of an exhibit's physical/digital nature, set at intake (F15) and immutable thereafter except via a documented re-classification action.
- **File Reference:** An exhibit type representing a pointer to an electronic file (document, image, audio, video).
- **Special-Storage Item:** An exhibit type requiring handling outside standard evidence-room storage (e.g., weapons, biological material, large items).

**Sub-features:**
- Exhibit-type classification (file reference, physical, demonstrative, contraband, special-storage)
- Type-specific custody/storage workflow rules
- Type-aware validation during intake (F15)

**Process:**
1. At intake (F15), submitter or reviewing clerk assigns an `exhibit_type` from the court-configured type catalog (F03 may extend the base five types with court-specific subtypes).
2. Type assignment drives downstream behavior: `file_reference` exhibits are eligible for F22 jury package electronic inclusion and F13 file-upload/scanning; `physical`/`demonstrative`/`special-storage` exhibits require F20 custody transfer records with type-specific required fields; `contraband` exhibits require additional authorization references per court configuration.
3. Type-specific required fields (configured per F03) are enforced at intake validation (F15) and at custody transfer initiation (F20) — e.g., a `contraband` item might require a law-enforcement case number field before a transfer can be recorded.
4. Re-classification (e.g., correcting an item mistakenly intaken as `physical` when it is actually `demonstrative`) is a distinct, audit-logged action requiring the same entitlement as general ledger edits, not a silent field update.

**Inputs:**
- `exhibit_type` (enum, required at intake): file_reference | physical | demonstrative | contraband | special_storage
- Type-specific metadata fields (per F03 configuration)

**Outputs:**
- Exhibit record with immutable-unless-reclassified `exhibit_type`
- Type-driven eligibility flags consumed by F20/F22

**Validation:**
- `exhibit_type` must be one of the court-configured catalog values (base five or court-specific extensions); an unrecognized type value is rejected at intake.
- Type-specific required fields must be present before a custody transfer (F20) can be initiated for that type.
- Re-classification requires the same entitlement as a ledger status transition (F16) and produces its own audit event; it may not be performed via a generic field-edit path that bypasses audit logging.
- `file_reference` is the only type eligible for F22 electronic jury package inclusion; attempts to mark any other type as package-eligible are structurally rejected.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Unrecognized exhibit_type submitted | 422 | TYPE_UNRECOGNIZED | "Exhibit type is not recognized for this court" |
| Custody transfer attempted without type-specific required field | 422 | TYPE_MISSING_REQUIRED_FIELD | "This exhibit type requires: {fields}" (see F20) |
| Non-electronic type submitted for jury package inclusion | 422 | TYPE_NOT_ELIGIBLE_FOR_PACKAGE | "This exhibit type is not eligible for electronic jury review" |
| Re-classification attempted without ledger-edit entitlement | 403 | TYPE_RECLASSIFY_DENIED | "You are not authorized to re-classify this exhibit" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Exhibit Types for `/evidentiary/exhibit-types` (catalog, read), `/evidentiary/exhibits/{id}/reclassify` endpoints.

**Schema Surface (this feature):** uses `exhibits.exhibit_type` column plus `exhibit_type_catalog` (F03-configured) — see `Y0b-schema-evidentiary.md` §Exhibit Type Classification.
