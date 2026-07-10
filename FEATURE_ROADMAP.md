# SceneSetter — Feature Roadmap

Tracks every feature, fix, and idea discussed so far, organized by area. This is a living
document — update it as work lands or new ideas come up.

**Legend:** `[x]` done and merged to `main` · `[x]*` done, committed on a branch not yet
merged to `main` · `[~]` explicitly deferred (considered, decided against for now) ·
`[ ]` not started

---

## 1. AI Features

- `[x]` Removed all AI features to ship a clean baseline: "Analyze Story" menu item, AI
  panel (Analysis/Chat tabs), `ai.js`/`chat.js`, AI confirmation modal, Alt+A shortcut,
  and leftover `ai_dismissed_*` localStorage keys.
  *(`strip_AI` branch, merged to `main`)*
- `[ ]` Reintroduce AI features, redesigned — intentionally deferred; no spec written yet.

## 2. Security & Data Integrity

- `[x]` Content-Security-Policy meta tag added to every page.
- `[x]` Strict type validation on JSON import (scene/section shape, unique scene ids,
  library item names) with specific rejection messages instead of silent corruption.
- `[x]` Cross-device fork detection: every project carries a permanent `projectUid` and a
  `revision` counter that increments on save.
- `[x]` Import conflict dialogs: detects a same-project file that is newer, older,
  identical, or diverged from the local copy, and offers Update Local Copy / Keep Both /
  Cancel accordingly (Keep Both assigns the import a fresh uid so it stops matching).
- `[x]` Duplicate Project assigns the copy its own uid so it never false-matches the
  original during import checks.
- `[x]` Fixed a crash/misleading-error when importing from the editor's File menu
  (`renderProjectGrid` assumed it was always on the projects page).
- `[x]` Reworded conflict dialogs for clarity ("Imported File Is Newer/Older",
  "Copies Have Diverged" — titles now always describe the file being imported, not the
  local copy).
- `[x]` Rewrote the cross-device guidance banner on the Projects, Overview, and Tutorial
  pages to describe the new automatic detection instead of the old "date your files
  yourself" advice.
  *(`strip_AI` branch, merged to `main`)*

## 3. Scene Flow Chart (visualization)

- `[x]` Implementation spec written for a lower-capability model to build from
  (`CHART_FEATURE_SPEC.md`).
- `[x]` Snake chart: one continuous segmented ribbon (one segment per scene, in story
  order), neutral resting state, grows and coils into more rows as scenes are added.
- `[x]` Circle chart: same ribbon closed into a fixed-size ring; scene 1 at 12 o'clock,
  clockwise; segments get thinner as scenes are added rather than the ring growing.
- `[x]` Filter highlighting reuses the Scene Board's own matching logic
  (`sceneMatchesLib`/`sceneMatchesSearch`) — no separate highlight system.
- `[x]` Section boundary indicators: lettered badges + a linked legend for the snake;
  a plain pie chart inside the ring for the circle view.
- `[x]` Hover tooltips (title/section/summary) and click-to-jump-to-board-card.
- `[x]` Print support (serializes the chart into the existing report-print window).
- `[x]` View menu entry ("Show/Hide Scene Flow Chart") + Alt+V shortcut.
  *(`feature/flow_visual` branch, merged to `main`)*
- `[~]` Optional "Section colors" toggle for the neutral resting state — spec'd as an
  explicitly optional, build-last item; skipped per direction to keep the resting state
  color-free until filtered.
- `[ ]` Keyboard navigation between chart segments (currently mouse-only).
- `[x]*` Hide the Zoom slider and "Show Card Details" checkbox while chart view is open —
  they only affect the card view, so they now disappear entirely instead of sitting there
  inert, and reappear (fully functional) when returning to board view.
- `[ ]` Presence lanes chart — rows are selected library items, columns are scenes in
  order, a filled cell marks where an item appears; a subway-map view of the ensemble.
  Reuses the same data as the existing cross-reference matrix report. *(proposed, not
  built — top pick for the next chart type)*
- `[ ]` Arc diagram — scenes on one line, arcs over the top connecting consecutive
  appearances of a chosen item; reads better than the circle's chords at high scene
  counts. *(proposed, not built)*
- `[ ]` Filmstrip minimap — a persistent mini-snake docked in the Scene Board header,
  always visible, doubling as a scroll-position navigator for long boards. *(proposed,
  not built)*
- `[ ]` Density encoding — segment size or a small badge reflecting how many library tags
  a scene carries, to surface over-crowded scenes. *(proposed, not built)*
- `[ ]` "Color by POV" toggle — since POV is now assigned per scene (possibly several),
  color each segment by its POV name(s) with a legend, showing at a glance who's carrying
  the story where. A scene with 2+ POVs needs a split-fill or small multi-dot marker
  rather than one solid color. Distinct from the section-colors toggle skipped above —
  POV coloring is well-suited to this precisely because it's assigned per scene, unlike
  sections. *(proposed, not built)*

## 4. Project Management

- `[x]*` "New Project" naming modal — prefilled with "Untitled Project" and pre-selected
  so Enter accepts the default in one keystroke, or the user can type a name immediately;
  replaces the old flow where projects were silently created as "Untitled Project" with
  no prompt.
- `[x]*` Removed the old rename-after-create flow, which silently did nothing when a
  project was created from the editor's File menu (the rename modal only exists on the
  Projects page).
- `[x]*` Removed the non-functional "Save" menu item (the app already autosaves on every
  change, so it never did anything). Ctrl+S is now a documented no-op instead of
  triggering the browser's own "Save Page As…" dialog.

## 5. Scene Editing (New/Edit Scene forms)

- `[x]*` Word Count field — plain numeric input (0–999,999), placed just before Notes in
  both the New Scene and Edit Scene forms.
- `[x]*` POV field — a multi-select checklist, exactly like Characters/Locations/Themes/
  Misc, sourced from the Character library plus a separate, growing list of custom POV
  names (`S.povCustomNames`), kept independent of the Characters checklist since a scene's
  POV may not be tagged as a character in that scene, or may not belong in the Character
  library at all. Multi-select rather than single-select because a "scene" here often
  corresponds to a full chapter, and multi-POV chapters are a normal structure, not an
  edge case — modeling it as single-select would have been wrong for how this app is
  actually used.
- `[x]*` The checklist's "+ Add POV Name…" trigger opens a small dialog rather than a
  free-text field retyped per scene — once added, the name is a normal, permanent,
  reusable option for every future scene, so the same name is never entered inconsistently
  (e.g. "Bob" vs "Bab") across scenes.
- `[x]*` Renaming a library character propagates into every scene's `povs`; deleting one
  preserves those assignments (falls back to a plain custom name) instead of erasing them.
  Legacy single-value `pov` data (string) from before multi-select migrates automatically
  to the new `povs` array shape on load, with the old key dropped; JSON import accepts
  both shapes. Undo/redo, JSON import validation, and project reset all account for the
  new field and list.
- `[x]*` Read-only "POV" section in the Library panel, alongside Characters/Locations/
  Themes/Misc, for highlighting scenes by POV on the board — no add/edit/delete controls
  (POV names are managed from the scene form), and it lists only names actually assigned
  to a scene, not every Character in the library. Because POV is array-valued like the
  other categories, it plugs into the existing AND/OR highlight engine with no special
  logic needed — e.g. selecting two POV names in AND mode correctly finds scenes where
  both are POV, a query that wasn't meaningful back when POV was single-select. Added a
  `--pv` theme color (distinct per theme) for its highlight dot.
- `[x]*` Every Characters/Locations/Themes/Misc checklist in both scene forms now has a
  "+ Add [category]…" entry at the top, opening the existing Add Item dialog without
  losing any in-progress scene form data. The new item is auto-checked in whichever
  checklist triggered it. The same button replaces the old dead-end "add to library
  first" message shown when a category is completely empty.
- `[x]*` Fixed a pre-existing bug found while building the above: adding, renaming, or
  drag-reordering any library item was silently wiping out whatever was already checked
  in that category's checklist in the Edit Scene form. Checked state is now read from the
  live DOM and restored across all of these re-renders; a rename correctly carries the
  checkmark over to the item's new name.
- `[x]*` Clicking outside the scene panel, or pressing Escape, while creating a New Scene
  with content or editing a scene with genuine unsaved changes now opens a "Discard
  changes?" confirmation instead of silently discarding the work. Viewing an unchanged
  scene and clicking away still closes silently (`isEditFormDirty()` finds nothing at
  risk, so there's no unnecessary nag). The explicit Cancel button remains instant and
  unprompted, since that's already a deliberate action.
- `[ ]` The explicit "Projects" button, tab close, and browser close still silently lose
  an in-progress New/Edit scene's unsaved form content (a different risk than the backup
  reminder in §6, which only covers scenes already committed to `S.scenes`). Noted during
  the discard-confirmation work as a related, not-yet-built follow-up.
- `[ ]` A "POV Report" (6th report type) mirroring the existing per-item reports —
  for each POV name, list the scenes it narrates, with a word-count total per POV
  (e.g. "Elizabeth Bennet — 4 scenes, 9,200 words") to show page-time balance across
  an ensemble. *(proposed, not built)*

## 6. Backup & Data Safety

- `[x]*` Passive "Backed up N ago" status indicator in the editor header, color-coded
  (neutral / warning / overdue).
- `[x]*` Dismissible reminder banner once a backup is overdue.
- `[x]*` Overdue thresholds: 50 edits since last export, or 1 hour since the project was
  opened/last exported with unexported changes pending — whichever comes first.
- `[x]*` Dismissing the banner snoozes it for an hour; it reappears automatically once the
  snooze expires (recurs hourly rather than staying dismissed for the session).
- `[x]*` Browser-native "leave site?" warning on tab close, window close, or browser quit
  whenever any unexported changes exist (not just once the hourly/edit threshold is hit).
- `[x]*` Added "(Backups can be found where your browser saves downloaded files.)" to the
  banner text.
- `[x]*` Banner is now prominent and theme-aware — uses the active theme's accent color
  and on-accent text instead of a fixed color that had poor contrast on light themes.
- `[x]*` Fixed a bug where clicking the "Projects" button silently skipped the
  unexported-changes warning — `backToProjects()` cleared `currentProjectId` before the
  browser's `beforeunload` check ran, so the guard always saw "no project open."
  Tab/window/browser-close were never affected by this; only in-app navigation via that
  button was.
- `[ ]` UI to customize the edit-count / time thresholds — currently hardcoded constants
  in `backup.js`.

---

## Branch status

| Branch | State |
|---|---|
| `strip_AI` | Merged to `main` (PR #4) |
| `feature/flow_visual` | Merged to `main` (PR #7) |
| `feature/updates_v1` | Committed locally, **not yet pushed to `origin`** — new project modal, backup reminder system, Save-menu removal, `backToProjects` fix, chart-view control hiding, Word Count/multi-select POV fields, "+ Add item" scene checklists, discard-confirmation dialog, POV Library panel highlighting |

Items marked `[x]*` above are complete and verified in the browser preview, but only exist
on `feature/updates_v1` until that branch is pushed and merged into `main`.
