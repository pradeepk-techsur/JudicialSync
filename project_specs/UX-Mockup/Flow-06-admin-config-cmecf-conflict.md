### Flow 6: Admin Configuration Change (Maker-Checker) & CM/ECF Conflict Resolution

**Trigger:** Clerk requests a configuration change; concurrently the CM/ECF adapter flags a sync conflict.
**User Stories:** US-3.1, US-3.2, US-3.3, US-10.1, US-10.2, US-0.3
**Journey:** JRN-04.2 (Configuration Change Requested → Verification via Audit Explorer)

```
[Clerk drafts config change] ──▶ Work Queue task: "config_approval" created
   │
   ▼
[Configuration Engine — Draft Review] (Screen-16)
   │
   ├── Same user who drafted attempts to publish ──▶ CONFIG_SOD_VIOLATION (403) — structurally blocked
   │        (publish button is disabled with tooltip, not merely re-rejected server-side)
   │
   ├── Draft fails structural validation (orphaned state, threshold gap) ──▶ CONFIG_INVALID_STRUCTURE (422)
   │
   └── Distinct second approver reviews + publishes
            │
            ▼
      New immutable rule_package_version created, effective-from timestamp set
      Prior version remains retrievable; in-flight calculations NOT retroactively recalculated
            │
            ▼
      Audit event: before/after diff + drafter + approver identities

[CM/ECF Adapter Health & Conflicts] (Screen-18) — concurrent thread
   │
   ▼
Inbound docket update conflicts with a locally modified field
   │
   ├── Field never locally modified ──▶ auto-updated silently (not a conflict)
   │
   └── Field WAS locally modified ──▶ CMECF_SYNC_CONFLICT (409, internal)
            │
            ▼
      [Sync Conflict Resolution panel] — both values shown side by side,
      source_identifier preserved on each
            │
            ├── Admin selects CM/ECF value ──▶ marked source_system, audit-logged
            │
            └── Admin selects local value ──▶ marked manual_override, audit-logged
                     (never a silent pick — both paths require explicit selection + are logged)
   │
   ▼
[Verification via Audit Explorer] (Screen-17)
   │  confirms both actions attributed, versioned, segregated from routine operational actions
```

**Steps:**
1. The **publish** control for a drafted configuration is rendered disabled (with an inline USWDS Tooltip: "A second approver is required") whenever the viewing user is also the drafter — separation of duties is visible in the UI, not just enforced server-side as a rejected request (US-3.2, US-0.3).
2. Draft validation errors appear inline, field-by-field (e.g., a red Alert under the specific threshold tier row showing the gap), never as a single generic failure banner.
3. CM/ECF conflicts are never auto-resolved toward either side — the resolution panel always requires an explicit admin click on one of the two preserved values, each visibly labeled with its `source_identifier` (US-10.1).
4. The Audit Explorer provides a single filtered view (object = this rule_package_version OR this docket record) so Priya can confirm, within the same investigation session, that both the configuration publish and the conflict resolution were properly attributed and segregated (US-2.1).

**States covered:** draft-editing, draft-validation-error, publish-blocked-sod, published, sync-auto-updated, sync-conflict-open, sync-conflict-resolved.
