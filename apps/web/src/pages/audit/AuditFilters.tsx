import { Button, ComboBox, DatePicker, Label, Select } from '@trussworks/react-uswds';
import { useState } from 'react';

/**
 * ============================================================================
 * AuditFilters — the Screen-17 filter toolbar.
 * ============================================================================
 *
 * Case, User, Date range, Object type, and Action type, plus a Search button.
 * Each control maps 1:1 onto a query parameter of `GET /audit/explorer`:
 *
 *  - Case / User — USWDS ComboBox over the viewer's visible cases/users.
 *  - Date range — two DatePickers (`date_from`, `date_to`); the API accepts a
 *    bare `YYYY-MM-DD`.
 *  - Object type — a Select; the Screen-17 filter.
 *  - Action type — a Select. This is the one filter the FRD's listed set omits,
 *    added deliberately because Screen-17's "denied attempt" row state needs a
 *    way to select `access_attempt` rows, and those are an action_type, not an
 *    object_type. (Documented in the SUMMARY and the explorer DTO.)
 *
 * The parent owns the applied filter state (and reflects it in the URL); this
 * component owns only the UNAPPLIED, in-progress edits, handing them up on
 * Search. That split keeps the URL from churning on every keystroke while still
 * making a searched view linkable.
 */

export interface AuditFilterValues {
  case_id?: string;
  user_id?: string;
  date_from?: string;
  date_to?: string;
  object_type?: string;
  action_type?: string;
}

export interface FilterOption {
  value: string;
  label: string;
}

/** The eight audit action types (apps/api audit.types.ts), Screen-17's filter. */
const ACTION_TYPES: readonly string[] = [
  'status_change',
  'ruling',
  'custody_transfer',
  'calculation_override',
  'approval',
  'designation_change',
  'config_change',
  'access_attempt',
];

/** Common audit object types. A free Select rather than a closed enum because
 *  `object_type` is a logical table name and new ones arrive each phase. */
const OBJECT_TYPES: readonly string[] = [
  'case',
  'cases',
  'proceedings',
  'parties',
  'docket_events',
  'document_references',
  'security_designations',
  'audit_event',
];

export function AuditFilters({
  initial,
  caseOptions,
  userOptions,
  onSearch,
}: {
  initial: AuditFilterValues;
  caseOptions: FilterOption[];
  userOptions: FilterOption[];
  onSearch: (values: AuditFilterValues) => void;
}): JSX.Element {
  const [draft, setDraft] = useState<AuditFilterValues>(initial);

  const update = (patch: Partial<AuditFilterValues>): void =>
    setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <form
      className="usa-form usa-form--large margin-bottom-2"
      data-testid="audit-filters"
      onSubmit={(e) => {
        e.preventDefault();
        // Strip empties so an untouched control does not send an empty param.
        const cleaned: AuditFilterValues = {};
        for (const [k, v] of Object.entries(draft)) {
          if (v !== undefined && v !== '') {
            cleaned[k as keyof AuditFilterValues] = v;
          }
        }
        onSearch(cleaned);
      }}
    >
      <div className="grid-row grid-gap">
        <div className="tablet:grid-col-4">
          <Label htmlFor="filter-case">Case</Label>
          <ComboBox
            id="filter-case"
            name="case_id"
            defaultValue={draft.case_id}
            options={caseOptions}
            onChange={(value) => update({ case_id: value ?? undefined })}
          />
        </div>

        <div className="tablet:grid-col-4">
          <Label htmlFor="filter-user">User</Label>
          <ComboBox
            id="filter-user"
            name="user_id"
            defaultValue={draft.user_id}
            options={userOptions}
            onChange={(value) => update({ user_id: value ?? undefined })}
          />
        </div>

        <div className="tablet:grid-col-4">
          <Label htmlFor="filter-object-type">Object type</Label>
          <Select
            id="filter-object-type"
            name="object_type"
            value={draft.object_type ?? ''}
            onChange={(e) => update({ object_type: e.target.value || undefined })}
          >
            <option value="">All object types</option>
            {OBJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid-row grid-gap">
        <div className="tablet:grid-col-4">
          <Label htmlFor="filter-action-type">Action type</Label>
          <Select
            id="filter-action-type"
            name="action_type"
            value={draft.action_type ?? ''}
            onChange={(e) => update({ action_type: e.target.value || undefined })}
          >
            <option value="">All action types</option>
            {ACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>

        <div className="tablet:grid-col-4">
          <Label id="filter-date-from-label" htmlFor="filter-date-from">
            Date from
          </Label>
          <DatePicker
            id="filter-date-from"
            name="date_from"
            aria-labelledby="filter-date-from-label"
            defaultValue={draft.date_from}
            onChange={(value) => update({ date_from: value || undefined })}
          />
        </div>

        <div className="tablet:grid-col-4">
          <Label id="filter-date-to-label" htmlFor="filter-date-to">
            Date to
          </Label>
          <DatePicker
            id="filter-date-to"
            name="date_to"
            aria-labelledby="filter-date-to-label"
            defaultValue={draft.date_to}
            onChange={(value) => update({ date_to: value || undefined })}
          />
        </div>
      </div>

      <Button type="submit" data-testid="audit-search">
        Search
      </Button>
    </form>
  );
}
