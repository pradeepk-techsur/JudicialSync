## F20: Custody and Location Tracking

**Description:** Tracks physical and digital exhibit possession, transfers, returns, storage requirements, and receipts, with each transfer confirmed by an authorized user. This feature addresses the PRD's "lost accountability for custody transfers" root cause by making every change of possession an explicit, dual-acknowledged, audited event.

**Terminology:**
- **Custodian:** The party (person, agency, storage facility) currently responsible for an exhibit's physical or digital possession.
- **Custody Transfer:** A recorded change of custodian, requiring acknowledgment from both transferor and recipient.
- **Storage Location:** A tracked physical or logical location (evidence room, agency custody, special-storage facility) an exhibit may reside at.

**Sub-features:**
- Transfer/return/storage event recording with responsible custodian
- Transferor and recipient acknowledgment with purpose, time, location, condition note
- Custody-event alerts for unacknowledged transfers
- Full custody history per exhibit

**`[ASSUMPTION]`:** The vision document leaves open which exhibit categories remain with parties/law-enforcement custodians and what transfer records are required (PRD §9.3). This FRD assumes a general-purpose custody transfer model applicable to any exhibit type (F23), with court-configurable required fields per exhibit type/category (e.g., contraband items may require an additional chain-of-custody field) via F03.

**Process:**
1. An authorized user (courtroom deputy, clerk, or custodian) initiates a custody transfer for an exhibit: specifies recipient custodian, purpose, and current location/condition note.
2. System creates a `pending` custody transfer record and notifies (F04) the designated recipient for acknowledgment.
3. Recipient reviews and acknowledges the transfer (confirming receipt, condition, time); transferor's initiation itself constitutes their acknowledgment of release.
4. On recipient acknowledgment, transfer status becomes `completed`, the exhibit's current custodian/location fields update (feeding F16), and an audit event (F02) is recorded.
5. If a transfer remains unacknowledged beyond a configured SLA (F03), an escalation alert (F04) fires to a supervisory role.
6. Full custody history (every transfer, return, and storage assignment) remains queryable per exhibit, feeding F24 closeout receipts generation and F08 timeline.

**Inputs:**
- `exhibit_id` (required)
- `recipient_custodian_id` (required)
- `purpose` (string, required)
- `location` (string, required)
- `condition_note` (string, optional)
- Acknowledgment: `acknowledged_by`, `acknowledgment_timestamp`, `condition_confirmed` (boolean)

**Outputs:**
- Custody transfer record (`pending` → `completed` or `disputed`)
- Updated exhibit current-custodian/location fields
- Custody history list per exhibit

**Validation:**
- A transfer is not considered complete, and the exhibit's custodian field does not update, until the recipient explicitly acknowledges — no auto-acknowledgment on timeout; timeout instead triggers escalation, not completion.
- Both transferor and recipient identities must be resolvable to specific authorized users/custodian records — a transfer to an unregistered/unknown custodian is rejected.
- Exhibit-type-specific required fields (F23/F03 configuration, e.g., contraband requiring an additional authorization reference) must be present before a transfer for that type can be initiated.
- Unacknowledged-transfer SLA breach must generate an escalation alert; per the PRD's success metric, the goal is zero custody transfers left unacknowledged beyond the defined SLA.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Transfer initiated to unregistered custodian | 422 | CUSTODY_UNKNOWN_CUSTODIAN | "Recipient custodian is not registered" |
| Required type-specific field missing | 422 | CUSTODY_MISSING_TYPE_FIELD | "This exhibit type requires additional fields: {fields}" |
| Acknowledgment attempted by non-designated recipient | 403 | CUSTODY_ACK_DENIED | "Only the designated recipient may acknowledge this transfer" |
| Transfer SLA breached (unacknowledged) | n/a (alert, not request error) | CUSTODY_SLA_BREACH | "Custody transfer has not been acknowledged within the required time" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Custody for `/evidentiary/exhibits/{id}/custody-transfers`, `/evidentiary/custody-transfers/{id}/acknowledge` endpoints.

**Schema Surface (this feature):** uses tables `custody_transfers`, `storage_locations` — see `Y0b-schema-evidentiary.md` §Custody & Location.
