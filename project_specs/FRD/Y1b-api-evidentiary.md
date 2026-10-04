## Y1b: API Endpoints — Evidentiary Tracking

All endpoints prefixed `/api/v1/evidentiary` (shown relative below). All mutating endpoints emit audit events (F02) unless noted.

### §Case Setup (F14)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/cases/{id}/setup` | `{proceeding_id, numbering_scheme_id, party_ids[], security_designations[]}` | `201 {exhibit_tracking_context}` | Idempotent re-run |

### §Pretrial Intake (F15)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/intake` | `{description, offering_party_id, proceeding_id, exhibit_type, proposed_number, file}` | `201 {submission}` | File via F13 scan gate |
| GET | `/intake` | query: `proceeding_id, status` | `{submissions[]}` | — |
| POST | `/intake/{id}/accept` | — | `200 {exhibit}` | Promotes to ledger |
| POST | `/intake/{id}/reject` | `{reason}` | `200` | — |
| POST | `/intake/{id}/request-correction` | `{deficiency_detail}` | `200` | — |

### §Exhibit Ledger (F16)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/exhibits` | query: filters | `{exhibits[]}` | — |
| GET | `/exhibits/{id}` | — | `{exhibit}` | — |
| POST | `/exhibits/{id}/transition` | `{status_transition, proceeding_id, ruling_actor_id?, notes}` | `200 {exhibit, new_version}` | Workflow-validated |
| GET | `/exhibits/{id}/versions` | — | `{versions[]}` | Immutable history |

### §Courtroom Logging (F17)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/sessions` | `{proceeding_id}` | `201 {session}` | Opens logging session |
| POST | `/sessions/{id}/log-action` | `{exhibit_id, action, objection_category?, ruling_outcome?, notes?}` | `200` | Judge attribution auto-resolved |
| POST | `/sessions/{id}/close` | — | `200/409` | Triggers F18 reconciliation |

### §Reconciliation (F18)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/reconciliation/runs` | `{proceeding_id, checkpoint_type}` | `201 {run}` | — |
| GET | `/reconciliation/runs/{id}/discrepancies` | — | `{discrepancies[]}` | — |
| POST | `/reconciliation/discrepancies/{id}/resolve` | `{resolved_value, rationale}` | `200` | — |

### §Basic Closeout (F19)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/exports` | `{proceeding_id, status_filter[], export_format}` | `201 {export}` | — |
| POST | `/exports/{id}/certify` | — | `200` | Distinct confirmation action |

### §Custody (F20)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/exhibits/{id}/custody-transfers` | `{recipient_custodian_id, purpose, location, condition_note}` | `201 {transfer}` | — |
| POST | `/custody-transfers/{id}/acknowledge` | `{condition_confirmed}` | `200` | Recipient-only |

### §Sealing (F21)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/exhibits/{id}/seal` | `{designation_category, authorizing_judge_id, permitted_entitlement_scope}` | `200` | Judge-only |
| POST | `/exhibits/{id}/release` | `{release_authorizing_judge_id, release_reason}` | `200` | — |

### §Jury Package (F22)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/proceedings/{id}/jury-packages` | `{authorizing_judge_id, inclusion_scope, session_window}` | `201 {package}` | Auto-excludes sealed/non-admitted |
| GET | `/jury-packages/{id}/session` | — | `{access_token, expires_at}` | Session-scoped |

### §Exhibit Types (F23)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/exhibit-types` | query: `court_id` | `{types[]}` | Catalog |
| POST | `/exhibits/{id}/reclassify` | `{new_type, reason}` | `200` | Audit-logged |

### §Full Closeout (F24)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/proceedings/{id}/closeout` | — | `201 {closeout_package}` | Requires completed reconciliation |
| POST | `/closeout/{id}/dispositions` | `{exhibit_id, disposition_action, executing_custodian_id}` | `200` | — |
| POST | `/closeout/{id}/certify` | — | `200` | — |

### §Portfolio & Templates (F25)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/portfolio/dashboard` | query: `scope` | `{metrics}` | Caseload-scoped |
| POST | `/templates` | `{source_court_id, template_name}` | `201` | Requires `system_admin` |
| POST | `/templates/{id}/apply` | `{target_court_id, approving_user_id}` | `200` | Maker-checker |

### §Courtroom Technology (F39)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/courtroom-display/sessions` | `{exhibit_id\|jury_package_id, authorized_endpoint_id, proceeding_id}` | `201` | — |
| GET | `/courtroom-display/endpoints` | query: `court_id` | `{endpoints[]}` | — |
