## Y1a: API Endpoints — Shared Platform

All endpoints are prefixed `/api/v1` (omitted below for brevity). All require a valid session token (F00) except where noted as part of the authentication flow itself. All mutating endpoints emit an audit event (F02) unless explicitly marked read-only.

### §Identity & Access (F00)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/auth/login` | `{identity_assertion}` | `{session_token, refresh_token, entitlements}` | IdP-assertion exchange |
| POST | `/auth/mfa-challenge` | `{mfa_challenge_response}` | `{session_token}` | Conditional second step |
| POST | `/auth/refresh` | `{refresh_token}` | `{session_token}` | Rotates refresh token |
| POST | `/auth/logout` | — | `204` | Revokes session |
| GET | `/auth/entitlements` | — | `{roles[], scopes[]}` | Current user's computed entitlements |

### §Case & Docket Model (F01)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/cases` | `{case_number, court_id, division_id, case_caption, case_type, party[]}` | `201 {case}` | Manual creation fallback |
| GET | `/cases/{id}` | — | `{case}` | — |
| GET | `/cases/{id}/proceedings` | — | `{proceedings[]}` | — |
| POST | `/cases/{id}/proceedings` | `{proceeding_type}` | `201 {proceeding}` | — |
| GET | `/cases/{id}/parties` | — | `{parties[]}` | — |
| GET | `/cases/{id}/docket-events` | query: date range, category | `{docket_events[]}` | — |
| PATCH | `/cases/{id}/security-designations` | `{designations[]}` | `200` | Requires `case_security_admin` |

### §Audit (F02)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/audit/events` | (internal service-to-service only) | `201` | Not user-invokable |
| GET | `/audit/explorer` | query: `case_id, user_id, date_range, object_type` | `{audit_events[]}` | Requires `audit_reader` entitlement |

### §Configuration (F03)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/config/court-profiles/{court_id}` | — | `{court_profile}` | — |
| POST | `/config/rule-packages` | `{numbering_scheme, workflow_states[], thresholds[], event_mappings[]}` | `201 {rule_package_version (draft)}` | — |
| POST | `/config/rule-packages/{id}/publish` | `{approving_user_id}` | `200` | Maker-checker: approver ≠ drafter |
| GET | `/config/rule-packages/{court_id}/effective` | — | `{rule_package_version}` | Currently effective version |

### §Notifications (F04)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/notifications` | `{recipient_role\|recipient_user_id, notification_type, severity, object_reference, court_id}` | `201` | Internal trigger |
| GET | `/notifications/my` | — | `{notifications[]}` | User's inbox |
| POST | `/notifications/{id}/acknowledge` | — | `200` | — |

### §Search (F05)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/search` | query: `query_text, identifier, party_name, witness_name, status, date_from, date_to, proceeding_id` | `{results[]}` | Access-scoped pre-filtered |

### §Work Queue (F06)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/tasks` | `{task_type, owner_role\|owner_user_id, object_reference, priority}` | `201` | Internal trigger |
| GET | `/tasks/my-queue` | query: filters | `{tasks[]}` | Role-scoped |
| POST | `/tasks/{id}/complete` | `{completing_audit_event_id}` | `200` | — |
| POST | `/tasks/{id}/dismiss` | `{rationale}` | `200` | Rationale required for legally significant tasks |

### §Exception Queue (F07)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/exceptions` | query: `module, type, severity, age` | `{exceptions[]}` | — |
| POST | `/exceptions/{id}/resolve` | `{resolution_action, rationale}` | `200` | Rationale min-length enforced |

### §Case Timeline (F08)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/cases/{id}/timeline` | query: `event_type[], date_from, date_to, module[]` | `{timeline_entries[]}` | Access-scoped merge |

### §Reporting (F09)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/reporting/dashboard` | query: `scope, metric_set[]` | `{metrics}` | Requires `reporting_viewer` |
| GET | `/reporting/export` | query: same | file | De-identified |

### §CM/ECF Adapter (F10)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/integrations/cmecf/sync` | CM/ECF payload | `200/409` | Inbound webhook/poll target |
| GET | `/integrations/cmecf/status` | — | `{last_sync, error_rate, backlog}` | — |
| POST | `/integrations/cmecf/outbound` | `{filing_payload}` | `201` | Requires `docket_outbound` entitlement |

### §UI Workspaces (F11)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| PATCH | `/users/me/workspace-preference` | `{workspace_preference}` | `200` | — |

### §External Portal (F12)
*Separate base path `/portal/v1`, distinct auth middleware.*
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/portal/submissions` | exhibit metadata | `201` | `submitted_via='external_portal'` |
| GET | `/portal/trackers/{id}/summary` | — | `{remaining_time, next_threshold, confirmed_periods[]}` | Read-only, scoped visibility |

### §Security Baseline (F13)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/files/upload` | multipart file | `201/422` | Malware scan + allowlist gate |
| POST | `/security/policy-evaluate` | `{object_type, object_id, requester_scope}` | `{allow\|deny}` | Internal |
| GET | `/retention/schedules` | query: `court_id` | `{schedules[]}` | — |
| GET | `/retention/due-for-disposition` | query: `court_id` | `{records[]}` | Feeds F06 tasks |

### §National Governance (F37)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET/POST | `/governance/national-baseline` | `{field, default_value, court_overridable}` | `{baseline}` | Requires `national_governance_admin` |
| POST | `/governance/requests` | `{court_id, requested_field, requested_value, rationale}` | `201` | — |
| GET | `/governance/consistency-report` | — | `{divergences[]}` | — |

### §Advanced Analytics (F38)
| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/analytics/trends` | query: `court_ids[], metric_categories[], period` | `{trends}` | Requires `ao_program_analytics` |
| GET | `/analytics/export` | same | file | De-identified, court-level min |
