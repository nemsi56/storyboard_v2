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
- `[x]*` Import validation now rejects a scene whose `characters`/`locations`/`themes`/
  `misc` isn't an array of strings when present (only `povs` was checked before) — a
  hand-edited or corrupted file with e.g. a bare string in one of those fields previously
  passed validation and crashed the board on first render. `loadState()` also hardened
  defensively for the same shape regardless of how the data arrived.
- `[x]*` The "Imported File Is Newer" conflict dialog now warns when the local copy has
  unexported changes before offering "Update Local Copy," since a newer file revision never
  implied the local copy had nothing worth keeping (`revision` counts saves, not edits).
- `[x]*` Removed `'unsafe-inline'` from `script-src` in every page's CSP — all inline event
  handlers (~140 across the app) and inline `<script>` blocks were converted to
  `addEventListener` wiring in external files. `test.html` also got a CSP meta tag for the
  first time.
- `[x]*` Fixed five drag-and-drop/keyboard bugs found in a follow-up audit: Ctrl+Z/Ctrl+Y no
  longer hijacks a text field's own native undo or fires mid-drag; a card/library-item drag
  now self-heals instead of sticking to the cursor forever if the mouse button is released
  outside the browser window; dragging a multi-selected card no longer silently drags along
  another selected scene that's hidden by the active section filter; Ctrl+Shift+E (export) no
  longer misfires or fails depending on Caps Lock state; Alt-letter shortcuts no longer fire
  underneath an open confirmation/data-entry modal. See `UPDATE_ROADMAP.md` §7 for full detail.
  *(`feature/updates_v2` branch, pushed, not yet merged)*

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
- `[x]*` Fixed POV highlighting not working in either chart — `chartFilterActive()`/
  `sceneMatchesChart()` only checked the four SECS categories (Characters/Locations/
  Themes/Misc) for an active selection, so selecting a POV with nothing else selected
  never triggered highlighting, even though `sceneMatchesLib()` already handled POV
  correctly for the Scene Board itself.
- `[x]*` "Unassigned" section indicator in both charts — a lettered marker on the snake
  and a wedge on the circle, shown only when at least one scene has no section. Because
  `orderedScenes()` always places unassigned scenes first (ahead of every real section),
  Unassigned leads the letter sequence (letter A, with real sections shifted down) rather
  than trailing after them, so the letters stay in sync with the chart's actual left-to-
  right / clockwise order.
- `[x]*` Fixed Alt+N/C/L/T/M/R/V shortcuts not firing on Mac — the handler matched
  `e.key`, but macOS remaps that under Option to a composed character (e.g. Option+V →
  "√", Option+N → a dead key), so every Alt shortcut silently failed on Mac. Switched to
  `e.code` ("KeyV", etc.), the physical key, which is unaffected by what the modifier
  composes.
- `[~]` Optional "Section colors" toggle for the neutral resting state — spec'd as an
  explicitly optional, build-last item; skipped per direction to keep the resting state
  color-free until filtered.
- `[ ]` Keyboard navigation between chart segments (currently mouse-only).
- `[x]*` Hide the Zoom slider and "Show Card Details" checkbox while chart view is open —
  they only affect the card view, so they now disappear entirely instead of sitting there
  inert, and reappear (fully functional) when returning to board view.
- `[x]*` Tightened the snake/circle charts' canvas padding and internal margins to use more
  of the available window (`CHART_PAD` 20→12px, snake's row margin, circle's radius buffer).
- `[x]*` Fixed snake chart rows leaving unused space on the right — `computeSnakeLayout`
  sized each row's width to hit a ~110px/scene target rather than filling the container, so
  whenever that target didn't divide evenly across rows the row fell short of the available
  width (fixed left margin, variable — sometimes large — right margin). Row count is already
  chosen for that target; the row is now stretched to the full available width once row
  count is settled.
- `[x]*` Fixed snake chart curve caps clipping against the canvas edge — the horizontal
  margin only cleared the turn's centerline arc, not the ~34px-thick stroke drawn along it,
  whose outer edge at the tip of each turn extends stroke-width/2 further out than the
  centerline itself, clipping against the SVG's default `overflow:hidden`. Margin now
  accounts for the stroke's actual painted extent (`r + CHART_PAD + SNAKE_SEG_THICKNESS/2`),
  verified by rasterizing the rendered SVG to a canvas and measuring the painted pixel
  boundary directly (DOM bbox APIs don't reflect stroke width).
- `[x]*` "Show relative word count" toggle — sizes each scene's segment (both chart
  types) proportionally to `scene.wordCount` instead of splitting the path evenly. Scenes
  with no wordCount (0 counts as unset) are weighted at the average of scenes that do have
  one, so missing data renders as "typical size" instead of a distorting sliver; a set with
  no wordCounts at all reduces to the original uniform layout unchanged. Averaged-in scenes
  get a short red tick beside their scene number plus a tooltip note and a legend entry, so
  it's clear the size is an estimate. See `CHART_FEATURE_SPEC.md` §14.
  *(`feature/updates_v3` branch, pushed, not yet merged)*
- `[x]*` Added a "Size by Word Count" entry to the Tutorial's Scene Flow Chart section and
  a sentence to its Overview card — the feature above had no user-facing documentation
  until now. Also fixed a stale "Undo/Redo: up to 10 steps" in the Tutorial (raised to 50
  in an earlier fix; the docs were never updated to match).
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
- `[x]*` Renamed the Projects page's "Import JSON" button to "Import project (JSON file)"
  for clarity, and updated the one other place (Tutorial) that referenced the old label.

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
- `[x]*` POV shown on Scene Board cards as its own row, after Characters/Locations/
  Themes/Misc Items, whenever a scene has one or more POVs assigned. Reuses the existing
  "Show Card Details" toggle and its underlying CSS (`#board.hide-details .cmeta`) — no
  separate control needed. Styled with a new `.tp` tag class matching the `--pv` color
  used elsewhere for POV.
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
- `[x]*` POV added to Reporting at parity with the other library categories: a "POV"
  report type (6th type) mirroring the Character/Location/Theme/Misc per-item reports —
  for each POV name, lists the scenes it narrates with section, characters-in-scene, and
  summary, exactly like its siblings. Also added a POV checkbox to the Scene List report,
  and a "POV" axis option on the Cross-Reference matrix report. Since POV isn't a real
  library array (`S.povs` doesn't exist — names come from the Character library plus
  `S.povCustomNames`), the per-item and matrix report builders now take an optional
  `items()`/axis override in place of reading `S[key]` directly, sourced from
  `usedPovNames()`.
- `[ ]` Word-count total per POV name on the POV report (e.g. "Elizabeth Bennet — 4
  scenes, 9,200 words") to show page-time balance across an ensemble — deliberately left
  out of the parity pass above since no other library-item report shows a word-count
  rollup. *(proposed, not built)*
- `[x]*` Updated the Overview and Tutorial pages to document all of the above POV work —
  the Library panel's read-only POV section, the POV field on the scene form, POV
  highlighting in the flow charts (including the new Unassigned indicator from §3), and
  the POV report/matrix axis — none of which the marketing/help pages mentioned until now.

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
- `[x]*` Reworked the "Working Across Devices" messaging (Projects/Overview/Tutorial) into
  **"Your Data & Backups"** — plainer language for novice users, making clear that (a) a
  project just persists on its own with no import needed to continue working, (b)
  backing up matters because browser storage itself can be wiped (not only for moving
  between devices), and (c) export/import/conflict-detection, now three short bullets
  instead of one dense paragraph. The Projects page dropped the full banner in favor of a
  small "Learn about your data and backups" text link next to the toolbar that opens the
  Tutorial in a new tab, anchored straight to that section (`tutorial.html#data-backups`)
  — first tried as a "?" icon, changed to a text link after it read as unclear on its own.

---

## Branch status

| Branch | State |
|---|---|
| `strip_AI` | Merged to `main` (PR #4) |
| `feature/flow_visual` | Merged to `main` (PR #7) |
| `feature/updates_v1` | Merged to `main` (PR #9) — new project modal, backup reminder system, Save-menu removal, `backToProjects` fix, chart-view control hiding, Word Count/multi-select POV fields, "+ Add item" scene checklists, discard-confirmation dialog, POV Library panel highlighting, POV chart-highlighting fix, Unassigned chart indicator, Mac Alt-shortcut fix, POV scene-card row, POV added to Reporting, Overview/Tutorial docs updated for POV |
| `feature/updates_v2` | Pushed to `origin`, **not yet merged to `main`** — all of `UPDATE_ROADMAP.md`'s code-review fixes (§1-3), custom POV name edit/delete, chart segment hover polish, chart margin tightening, the snake chart width-utilization and curve-clipping fixes, the sample-project seeding race fix, a fresh full-app audit's fixes (§6: import validation gap, orphaned-section reports bug, filtered-section-delete bug, section-color undo bug, report-generation perf), the CSP `unsafe-inline` removal, and (most recent) §7's drag-and-drop/keyboard fixes (stuck-drag recovery, multi-select+filter drag, undo/redo input and drag guards, Caps-Lock-proof export shortcut, Alt-shortcuts-under-modal guard) |
| `feature/updates_v3` | Pushed to `origin`, **not yet merged to `main`** — "Show relative word count" chart toggle (see `CHART_FEATURE_SPEC.md` §14); a third full-app audit's fixes (`UPDATE_ROADMAP.md` §8: a high-severity corrupt-project-load data-loss bug, save-failure alerting, wordCount clamping, a character/POV-name collision, a stale drag-insert anchor, a menu-hover bug, and several other low-severity fixes — fully closed out, nothing left open); and a "Your Data & Backups" messaging rework across Projects/Overview/Tutorial plus feature-doc refresh (Size by Word Count, a stale Undo/Redo count). See `STATUS.md` for the full narrative. |

Items marked `[x]*` above are complete and verified in the browser preview, but only exist
on `feature/updates_v2` until that branch is merged into `main`.
