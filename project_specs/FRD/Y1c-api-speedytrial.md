## Y1c: API Endpoints — Speedy Trial Tracker

All endpoints prefixed `/api/v1/speedytrial` (shown relative below). All mutating endpoints emit audit events (F02) unless noted.

### §Tracker Initialization (F26)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/trackers` | `{defendant_party_id, case_id, trigger_event_id\|trigger_event_type+trigger_date}` | `201 {tracker (proposed)}` | Auto or manual path |
| POST | `/trackers/{id}/confirm` | — | `200 {tracker (confirmed)}` | Requires reviewer entitlement |
| POST | `/trackers/{id}/reject` | `{reason}` | `200` | Routes to exception |

### §Event Ingestion (F27)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/events` | `{source_identifier, source_code, source_description, event_date, case_id, defendant_party_id}` | `201/200 (idempotent)` | Duplicate-safe |
| POST | `/events/{id}/resolve-mapping` | `{event_category}` or `{new_mapping_rule_request}` | `200` | Requires reviewer entitlement |

### §Candidate Exclusions (F28)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/trackers/{id}/candidate-exclusions` | query: `state` | `{candidates[]}` | Read/list only; generation is system-triggered |

### §Clock Calculation (F29)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/trackers/{id}/calculate` | `{calculation_date?}` | `201 {calculation_version}` | Creates new immutable version |
| GET | `/trackers/{id}/calculation-versions` | — | `{versions[]}` | Full history |
| GET | `/calculation-versions/{id}/explain` | — | `{segments[]}` | "Explain this date" view |

### §Review & Approval (F30)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/review-items/{id}/accept` | — | `200 {confirmed_record}` | — |
| POST | `/review-items/{id}/modify` | `{modified_value, rationale}` | `200` | — |
| POST | `/review-items/{id}/reject` | `{rationale}` | `200` | — |
| POST | `/review-items/{id}/override` | `{modified_value, rationale}` | `200 {new_version}` | Never edits in place |

### §Threshold Alerts (F31)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/trackers/{id}/alerts` | — | `{alerts[]}` | — |
| POST | `/alerts/{id}/acknowledge` | — | `200` | Feeds audit trail |

### §Version Comparison (F32)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/trackers/{id}/calculation-versions/compare` | query: `version_a_id, version_b_id` | `{additions[], removals[], modifications[]}` | Same-tracker only |

### §Continuance Findings (F33)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/continuances/{id}/completeness` | — | `{status, missing_fields[]}` | Structural check only |
| POST | `/continuances/{id}/supply-references` | `{structured_findings_ref, order_document_ref}` | `200` | Chambers/judge entitlement |

### §Multi-Defendant (F34)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/cases/{id}/defendant-trackers` | — | `{trackers[], relationships[]}` | No collapsed view |
| POST | `/cases/{id}/severance` | `{severed_defendant_ids[], severance_date}` | `201 {severance_event}` | Explicit confirmation required |

### §Case Conference View (F35)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/trackers/{id}/conference-view` | query: `proceeding_context?` | `{summary}` | Deep-linked |
| GET | `/trackers/{id}/conference-view/export` | — | file (packet) | — |

### §Portfolio Dashboard (F36)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/dashboard/personal` | — | `{flagged_trackers[]}` | Caseload-scoped |
| GET | `/dashboard/court` | query: `court_id` | `{aggregate_metrics}` | Requires `court_admin` |
