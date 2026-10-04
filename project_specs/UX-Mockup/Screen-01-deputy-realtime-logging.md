### Screen 01: Deputy Real-Time Logging (Courtroom Speed Surface)

**Purpose:** The single, full-screen, low-chrome surface for logging exhibit offers, objections, rulings, withdrawals, and substitutions during live proceedings — the make-or-break screen for the entire product per PRD/vision "courtroom speed" principle.
**User Stories:** US-11.2, US-17.1, US-17.2, US-16.3, US-20.1
**Workspace:** Courtroom Deputy Interface

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Minimal Header: session clock 00:42:17 | Dept 4 | ● LIVE | [Close]│
├──────────────────────────────────────────────────────────────────┤
│ Quick-filter tags: [All] [Pending] [Offered] [Objected] [Ruled]    │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────┐  ┌─────────────────────────────┐  │
│ │ EXHIBIT LIST (large rows)  │  │ ACTIVE EXHIBIT PANEL         │  │
│ │                             │  │                               │  │
│ │ ① Lease agreement   [Tag:  │  │  Exhibit 1 — Lease agreement  │  │
│ │    Govt]  Proposed         │  │  Offered by: Government       │  │
│ │  ┌────────┐                │  │                               │  │
│ │  │ OFFER  │ ← big touch    │  │  [ OFFER ]   [ WITHDRAW ]      │  │
│ │  └────────┘   target       │  │                               │  │
│ │                             │  │  Objection category:          │  │
│ │ ② Photo — scene A  [Tag:   │  │  (•) None  ( ) Relevance       │  │
│ │    Govt]  Offered           │  │  ( ) Hearsay ( ) Foundation    │  │
│ │  ┌─────────┐┌────────────┐ │  │  ( ) Other (+note)             │  │
│ │  │ OBJECT  ││ (awaiting   │ │  │                                │  │
│ │  └─────────┘│  ruling)    │ │  │  Ruling (judge spoken aloud):  │  │
│ │              └────────────┘ │  │  [ ADMIT ]      [ REJECT ]     │  │
│ │ ③ Video clip       Pending │  │                                │  │
│ │  ┌────────┐                │  │  Notes (optional): __________  │  │
│ │  │ OFFER  │                │  │                                │  │
│ │  └────────┘                │  │  Last action: 10:42:03 AM —    │  │
│ │                             │  │  "Ruling entered: Judge Hale   │  │
│ │ [+ Quick-add unlisted]      │  │   — Admitted" ✓ saved          │  │
│ └────────────────────────────┘  └─────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│  ⚠ Offline — entries saving locally, will resync (if disconnected)│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Header (minimal/custom extended per USWDS guidance for application shells), Tag (status filter chips + exhibit status Tags), Card, Button (big touch-target, keyboard-accessible, `aria-keyshortcuts`), Radio buttons (objection category, large), Site Alert (offline banner), Text input (notes), Icon (status glyphs).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | OFFER / OBJECT / ADMIT / REJECT action buttons for the selected exhibit | Right-hand Active Exhibit Panel, large and central |
| Primary | Exhibit list with current status Tag | Left column, persistent |
| Secondary | Objection category selector | Right panel, appears only when relevant |
| Secondary | Last-action confirmation line ("Ruling entered: Judge Hale") | Bottom of right panel |
| Tertiary | Optional free-text notes | Collapsed/small, right panel |
| Tertiary | Offline/sync status | Bottom banner, only shown when relevant |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Default (exhibit selected) | Action buttons enabled, large | None — ready for input |
| Offer submitted | Exhibit Tag updates to "Offered" instantly | Brief inline checkmark animation, timestamp shown |
| Objection recorded | Tag → "Objected"; ruling buttons become primary focus | Category shown as sub-tag |
| Ruling recorded | Tag → "Admitted"/"Rejected" (solid, judge-attributed) | "Ruling entered: Judge Hale — Admitted ✓" confirmation line, live-pushed to Chambers |
| No judge assigned | ADMIT/REJECT buttons disabled, Alert shown inline | "Cannot record ruling: no presiding judge assigned" (COURTROOM_NO_JUDGE_ASSIGNED) + "Flag for clerk" link |
| Invalid transition | Button shows disabled + tooltip | "This exhibit's status does not allow this action" (COURTROOM_INVALID_ACTION) |
| Offline/draft-buffer | Persistent amber Site Alert banner at bottom | "Working offline — entries saved locally and will sync automatically" |
| Resync conflict | Exhibit row gets a Tag: "Needs Review" | Routed to Exception Queue; deputy sees non-blocking badge, keeps logging |
| Quick-add unlisted exhibit | Inline mini-form expands below list | Required fields (description, offering party) must be completed before save; incomplete entries flagged at session close |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| OFFER | Button, primary, ≥44px target, keyboard shortcut `O` | Single action marks exhibit `offered`, auto-timestamped |
| OBJECT | Button, secondary, shortcut `J` | Opens objection-category radio group (one more action to complete, total ≤2 for this cycle) |
| ADMIT / REJECT | Button, primary (judge-ruling color convention), shortcuts `A` / `R` | Records ruling as occurring; system auto-resolves `presiding_judge_id`; never deputy-selectable |
| WITHDRAW / SUBSTITUTE | Button, tertiary, shortcut `W` / `S` | Same single-action pattern, timestamped, optional note |
| Quick-add unlisted | Link/Button, shortcut `N` | Expands minimal inline form; routes to Exception Queue at close if incomplete |
| Notes field | Text input, optional | Free text, never required, never auto-populated |
| Close (header) | Button, top-right | Navigates to Screen-02 (Session Close & Reconciliation) — mandatory checkpoint |
| Exhibit row "⋯" menu | Icon button | "Transfer Custody" → Screen-03 |

**Keyboard operability:** every action above (offer/object/rule/withdraw/substitute/quick-add/close) is reachable via a documented single-key shortcut with visible `aria-keyshortcuts` hints, satisfying US-17.1's "fully operable via keyboard shortcuts" acceptance criterion without requiring mouse/touch.
