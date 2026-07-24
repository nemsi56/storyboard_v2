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
- `[x]` Import validation now rejects a scene whose `characters`/`locations`/`themes`/
  `misc` isn't an array of strings when present (only `povs` was checked before) — a
  hand-edited or corrupted file with e.g. a bare string in one of those fields previously
  passed validation and crashed the board on first render. `loadState()` also hardened
  defensively for the same shape regardless of how the data arrived.
- `[x]` The "Imported File Is Newer" conflict dialog now warns when the local copy has
  unexported changes before offering "Update Local Copy," since a newer file revision never
  implied the local copy had nothing worth keeping (`revision` counts saves, not edits).
- `[x]` Removed `'unsafe-inline'` from `script-src` in every page's CSP — all inline event
  handlers (~140 across the app) and inline `<script>` blocks were converted to
  `addEventListener` wiring in external files. `test.html` also got a CSP meta tag for the
  first time.
- `[x]` Fixed five drag-and-drop/keyboard bugs found in a follow-up audit: Ctrl+Z/Ctrl+Y no
  longer hijacks a text field's own native undo or fires mid-drag; a card/library-item drag
  now self-heals instead of sticking to the cursor forever if the mouse button is released
  outside the browser window; dragging a multi-selected card no longer silently drags along
  another selected scene that's hidden by the active section filter; Ctrl+Shift+E (export) no
  longer misfires or fails depending on Caps Lock state; Alt-letter shortcuts no longer fire
  underneath an open confirmation/data-entry modal. See `UPDATE_ROADMAP.md` §7 for full detail.
  *(`feature/updates_v2` branch, merged to `main` via PR #11)*

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
- `[x]` Fixed POV highlighting not working in either chart — `chartFilterActive()`/
  `sceneMatchesChart()` only checked the four SECS categories (Characters/Locations/
  Themes/Misc) for an active selection, so selecting a POV with nothing else selected
  never triggered highlighting, even though `sceneMatchesLib()` already handled POV
  correctly for the Scene Board itself.
- `[x]` "Unassigned" section indicator in both charts — a lettered marker on the snake
  and a wedge on the circle, shown only when at least one scene has no section. Because
  `orderedScenes()` always places unassigned scenes first (ahead of every real section),
  Unassigned leads the letter sequence (letter A, with real sections shifted down) rather
  than trailing after them, so the letters stay in sync with the chart's actual left-to-
  right / clockwise order.
- `[x]` Fixed Alt+N/C/L/T/M/R/V shortcuts not firing on Mac — the handler matched
  `e.key`, but macOS remaps that under Option to a composed character (e.g. Option+V →
  "√", Option+N → a dead key), so every Alt shortcut silently failed on Mac. Switched to
  `e.code` ("KeyV", etc.), the physical key, which is unaffected by what the modifier
  composes.
- `[~]` Optional "Section colors" toggle for the neutral resting state — spec'd as an
  explicitly optional, build-last item; skipped per direction to keep the resting state
  color-free until filtered.
- `[ ]` Keyboard navigation between chart segments (currently mouse-only).
- `[x]` Hide the Zoom slider and "Show Card Details" checkbox while chart view is open —
  they only affect the card view, so they now disappear entirely instead of sitting there
  inert, and reappear (fully functional) when returning to board view.
- `[x]` Tightened the snake/circle charts' canvas padding and internal margins to use more
  of the available window (`CHART_PAD` 20→12px, snake's row margin, circle's radius buffer).
- `[x]` Fixed snake chart rows leaving unused space on the right — `computeSnakeLayout`
  sized each row's width to hit a ~110px/scene target rather than filling the container, so
  whenever that target didn't divide evenly across rows the row fell short of the available
  width (fixed left margin, variable — sometimes large — right margin). Row count is already
  chosen for that target; the row is now stretched to the full available width once row
  count is settled.
- `[x]` Fixed snake chart curve caps clipping against the canvas edge — the horizontal
  margin only cleared the turn's centerline arc, not the ~34px-thick stroke drawn along it,
  whose outer edge at the tip of each turn extends stroke-width/2 further out than the
  centerline itself, clipping against the SVG's default `overflow:hidden`. Margin now
  accounts for the stroke's actual painted extent (`r + CHART_PAD + SNAKE_SEG_THICKNESS/2`),
  verified by rasterizing the rendered SVG to a canvas and measuring the painted pixel
  boundary directly (DOM bbox APIs don't reflect stroke width).
- `[x]` "Show relative word count" toggle — sizes each scene's segment (both chart
  types) proportionally to `scene.wordCount` instead of splitting the path evenly. Scenes
  with no wordCount (0 counts as unset) are weighted at the average of scenes that do have
  one, so missing data renders as "typical size" instead of a distorting sliver; a set with
  no wordCounts at all reduces to the original uniform layout unchanged. Averaged-in scenes
  get a short red tick beside their scene number plus a tooltip note and a legend entry, so
  it's clear the size is an estimate. See `CHART_FEATURE_SPEC.md` §14.
  *(`feature/updates_v3` branch, merged to `main` via PR #12)*
- `[x]` Added a "Size by Word Count" entry to the Tutorial's Scene Flow Chart section and
  a sentence to its Overview card — the feature above had no user-facing documentation
  until now. Also fixed a stale "Undo/Redo: up to 10 steps" in the Tutorial (raised to 50
  in an earlier fix; the docs were never updated to match).
- `[x]` **Trace lines** — a "Trace:" selector in the chart toolbar lets the user pick one
  library category (Characters/Locations/Themes/Misc/POV); each item explicitly selected in
  that category (via the existing Library panel checkboxes) draws as its own colored line
  running through the scenes it appears in, layered inside the ribbon alongside the existing
  segments — combining the highlight and flow-chart features into one view, per the user's
  own framing of the idea. Lanes are only the items actually selected (nothing selected
  shows a "Select … to trace them" legend hint, not every item in the category); no small
  hard cap on lane count (an initial `MAX_LANES = 6` was removed after user feedback) — a
  16-color palette (separate from the 8-color section-color palette, which repeated a color
  past 8 items) and continuously thinning band widths keep large selections readable, gated
  only by a 24-item runaway guard. See `TRACE_LINES_SPEC.md` for the original build spec.
  *(`feature/updates_v4` branch, merged to `main` via PR #13)*
- `[x]` Trace lines' tube/lane geometry, tuned across several rounds of live feedback: the
  tube (both chart types) widens and its lane bands thin continuously as more items are
  traced, filling the tube's full width edge to edge rather than clustering in the middle;
  thickness ramps in smoothly as lanes are added instead of jumping straight to its widened
  size on the first selection. The circle's inner pie shrinks as the ring thickens, and the
  ring's own radius shrinks to compensate so the whole chart always stays inside the visible
  pane (an earlier version let the ring grow past the pane and rely on scrolling, which read
  as the chart "cutting off"). The snake's turn radius tracks its thickness directly, so
  row-to-row spacing grows with the tube instead of the turns getting cramped.
- `[x]` Fixed a real geometry bug in the snake chart's trace lines: lane dash positions
  were computed via proportional path-length scaling, which is only exact for a circle — a
  snake lane's turns have a different radius (and arc length) than its straight runs, so a
  uniform scale drifted colored lane boundaries away from the true scene boundaries, worst
  near turns and with wider lane offsets (measured 13.7px of drift at one scene boundary
  before the fix; a user screenshot showed this as "colors running across scenes").
  Replaced with an exact length-mapping function that walks the same row/turn structure the
  lane path is built from — verified worst-case error across every scene boundary in a real
  render drops to 0.04px.
- `[x]` Lane hover/legend-hover highlighting now widens a lane proportionally to its own
  base width (plus a brightness/saturation bump) instead of to a fixed pixel value, which
  had stopped reading as a highlight once bands were naturally that thick or thicker on
  their own — flagged by the user as "hard to tell when they're highlighted."
- `[x]` Fixed a stale section-name pin (left over from scrolling the Scene Board) staying
  on screen after switching to chart view — `renderBoard()` normally clears it but
  early-returns into `renderChart()` while chart mode is active and never reaches that
  cleanup line.
- `[x]` Fixed the chart status line showing the project's total section count even when
  the Sections filter had narrowed the board to fewer — now shows the filtered count.
- `[x]` The chart's Trace selector and the board's Sections filter button now show an
  accent glow ring whenever they're not in their default state (a trace category chosen, or
  the section filter narrowed), matching the app's existing active-state affordance used
  elsewhere in the toolbar.
- `[x]` Snake/Circle chart-type buttons are now a two-icon segmented control (a squiggly
  line / a ring) instead of text buttons; the snake icon matches the actual chart's 3-row
  winding shape.
- `[ ]` Presence lanes chart — rows are selected library items, columns are scenes in
  order, a filled cell marks where an item appears; a subway-map view of the ensemble.
  Reuses the same data as the existing cross-reference matrix report. *(proposed, not
  built — largely superseded by Trace lines above, which draws the same "where does this
  item appear" information as colored lines directly on the existing snake/circle chart
  rather than a separate grid view; still a distinct idea if a literal row/column matrix
  layout is ever wanted instead)*
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
  sections. Trace lines above already covers most of this need (tracing selected POV
  names as lines rather than filling each segment), but doesn't fill the segment itself
  by its own POV the way this proposal describes. *(proposed, not built)*
- `[x]` Removed the snake chart's separate section-name legend row — sections were
  already marked directly on the ribbon via lettered badges with hover tooltips, the same
  on-chart approach the circle chart's pie wedges use, so the legend row duplicated that
  information for a full line of header height. *(`feature/updates_v5` branch)*
- `[x]` Scene number badges (both chart types) changed from a text-stroke halo — added
  only while trace lanes were active, and blurry at 10-11px font size — to a small solid
  pill background behind each number, which reads cleanly against any segment/trace-lane
  color. *(`feature/updates_v5` branch)*
- `[x]` **Cards/Snake/Circle view switch** — a persistent 3-way control (labeled icons)
  replacing the old "Show/Hide Scene Flow Chart" menu-only toggle and the in-toolbar
  "Board view ✕" button. Lives in the Scene Board header and physically moves into the
  chart toolbar while a chart is open (same DOM node, not a clone, so its state carries
  over); picking Snake/Circle from the board now opens the chart directly instead of
  requiring the menu/shortcut first. *(`feature/updates_v5` branch)*
- `[x]` Moved the chart's "Showing X scenes · X sections · tracing X …" status text onto
  the header line (replacing the old "Scene Board" title/count there) and moved the
  Section filter onto the toolbar row after the Trace picker, so every control in the
  chart toolbar row is directly identified in Help Mode (previously the toolbar had zero
  tooltip coverage). *(`feature/updates_v5` branch)*

## 4. Project Management

- `[x]` "New Project" naming modal — prefilled with "Untitled Project" and pre-selected
  so Enter accepts the default in one keystroke, or the user can type a name immediately;
  replaces the old flow where projects were silently created as "Untitled Project" with
  no prompt.
- `[x]` Removed the old rename-after-create flow, which silently did nothing when a
  project was created from the editor's File menu (the rename modal only exists on the
  Projects page).
- `[x]` Removed the non-functional "Save" menu item (the app already autosaves on every
  change, so it never did anything). Ctrl+S is now a documented no-op instead of
  triggering the browser's own "Save Page As…" dialog.
- `[x]` Renamed the Projects page's "Import JSON" button to "Import project (JSON file)"
  for clarity, and updated the one other place (Tutorial) that referenced the old label.

## 5. Scene Editing (New/Edit Scene forms)

- `[x]` Word Count field — plain numeric input (0–999,999), placed just before Notes in
  both the New Scene and Edit Scene forms.
- `[x]` POV field — a multi-select checklist, exactly like Characters/Locations/Themes/
  Misc, sourced from the Character library plus a separate, growing list of custom POV
  names (`S.povCustomNames`), kept independent of the Characters checklist since a scene's
  POV may not be tagged as a character in that scene, or may not belong in the Character
  library at all. Multi-select rather than single-select because a "scene" here often
  corresponds to a full chapter, and multi-POV chapters are a normal structure, not an
  edge case — modeling it as single-select would have been wrong for how this app is
  actually used.
- `[x]` The checklist's "+ Add POV Name…" trigger opens a small dialog rather than a
  free-text field retyped per scene — once added, the name is a normal, permanent,
  reusable option for every future scene, so the same name is never entered inconsistently
  (e.g. "Bob" vs "Bab") across scenes.
- `[x]` Renaming a library character propagates into every scene's `povs`; deleting one
  preserves those assignments (falls back to a plain custom name) instead of erasing them.
  Legacy single-value `pov` data (string) from before multi-select migrates automatically
  to the new `povs` array shape on load, with the old key dropped; JSON import accepts
  both shapes. Undo/redo, JSON import validation, and project reset all account for the
  new field and list.
- `[x]` Read-only "POV" section in the Library panel, alongside Characters/Locations/
  Themes/Misc, for highlighting scenes by POV on the board — no add/edit/delete controls
  (POV names are managed from the scene form), and it lists only names actually assigned
  to a scene, not every Character in the library. Because POV is array-valued like the
  other categories, it plugs into the existing AND/OR highlight engine with no special
  logic needed — e.g. selecting two POV names in AND mode correctly finds scenes where
  both are POV, a query that wasn't meaningful back when POV was single-select. Added a
  `--pv` theme color (distinct per theme) for its highlight dot.
- `[x]` POV shown on Scene Board cards as its own row, after Characters/Locations/
  Themes/Misc Items, whenever a scene has one or more POVs assigned. Reuses the existing
  "Show Card Details" toggle and its underlying CSS (`#board.hide-details .cmeta`) — no
  separate control needed. Styled with a new `.tp` tag class matching the `--pv` color
  used elsewhere for POV.
- `[x]` Every Characters/Locations/Themes/Misc checklist in both scene forms now has a
  "+ Add [category]…" entry at the top, opening the existing Add Item dialog without
  losing any in-progress scene form data. The new item is auto-checked in whichever
  checklist triggered it. The same button replaces the old dead-end "add to library
  first" message shown when a category is completely empty.
- `[x]` Fixed a pre-existing bug found while building the above: adding, renaming, or
  drag-reordering any library item was silently wiping out whatever was already checked
  in that category's checklist in the Edit Scene form. Checked state is now read from the
  live DOM and restored across all of these re-renders; a rename correctly carries the
  checkmark over to the item's new name.
- `[x]` Clicking outside the scene panel, or pressing Escape, while creating a New Scene
  with content or editing a scene with genuine unsaved changes now opens a "Discard
  changes?" confirmation instead of silently discarding the work. Viewing an unchanged
  scene and clicking away still closes silently (`isEditFormDirty()` finds nothing at
  risk, so there's no unnecessary nag). The explicit Cancel button remains instant and
  unprompted, since that's already a deliberate action.
- `[ ]` The explicit "Projects" button, tab close, and browser close still silently lose
  an in-progress New/Edit scene's unsaved form content (a different risk than the backup
  reminder in §6, which only covers scenes already committed to `S.scenes`). Noted during
  the discard-confirmation work as a related, not-yet-built follow-up.
- `[x]` POV added to Reporting at parity with the other library categories: a "POV"
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
- `[x]` Updated the Overview and Tutorial pages to document all of the above POV work —
  the Library panel's read-only POV section, the POV field on the scene form, POV
  highlighting in the flow charts (including the new Unassigned indicator from §3), and
  the POV report/matrix axis — none of which the marketing/help pages mentioned until now.
- `[x]` POV library items can now be drag-reordered like every other Library section —
  the one gap left over from POV becoming its own read-only section. POV isn't backed by
  a simple array the way Characters/Locations/etc. are (it's a filtered, merged view of
  Character names plus `S.povCustomNames`), so this needed a dedicated, append-only order
  list (`S.povOrder`) rather than reordering either source list directly, which would also
  reorder the Characters section or desync from the "only show POVs actually used on a
  scene" filter. *(`feature/updates_v5` branch)*

## 6. Backup & Data Safety

- `[x]` Passive "Backed up N ago" status indicator in the editor header, color-coded
  (neutral / warning / overdue).
- `[x]` Dismissible reminder banner once a backup is overdue.
- `[x]` Overdue thresholds: 50 edits since last export, or 1 hour since the project was
  opened/last exported with unexported changes pending — whichever comes first.
- `[x]` Dismissing the banner snoozes it for an hour; it reappears automatically once the
  snooze expires (recurs hourly rather than staying dismissed for the session).
- `[x]` Browser-native "leave site?" warning on tab close, window close, or browser quit
  whenever any unexported changes exist (not just once the hourly/edit threshold is hit).
- `[x]` Added "(Backups can be found where your browser saves downloaded files.)" to the
  banner text.
- `[x]` Banner is now prominent and theme-aware — uses the active theme's accent color
  and on-accent text instead of a fixed color that had poor contrast on light themes.
- `[x]` Fixed a bug where clicking the "Projects" button silently skipped the
  unexported-changes warning — `backToProjects()` cleared `currentProjectId` before the
  browser's `beforeunload` check ran, so the guard always saw "no project open."
  Tab/window/browser-close were never affected by this; only in-app navigation via that
  button was.
- `[ ]` UI to customize the edit-count / time thresholds — currently hardcoded constants
  in `backup.js`.
- `[x]` Added a "Learn about your data and backups" link to the backup reminder banner
  itself (matching the one already on the Projects page), plus a short privacy sentence —
  "Your content remains privately yours. We use Google Analytics and other tools to
  understand feature usage and improve the app, but no personal data or project content is
  shared." — appended to the Data & Backups block on the splash page and the Tutorial, and
  to the banner. *(`feature/updates_v5`/`v6` branches)*
- `[x]` Reworked the "Working Across Devices" messaging (Projects/Overview/Tutorial) into
  **"Your Data & Backups"** — plainer language for novice users, making clear that (a) a
  project just persists on its own with no import needed to continue working, (b)
  backing up matters because browser storage itself can be wiped (not only for moving
  between devices), and (c) export/import/conflict-detection, now three short bullets
  instead of one dense paragraph. The Projects page dropped the full banner in favor of a
  small "Learn about your data and backups" text link next to the toolbar that opens the
  Tutorial in a new tab, anchored straight to that section (`tutorial.html#data-backups`)
  — first tried as a "?" icon, changed to a text link after it read as unclear on its own.

## 7. Scene Board Header & Splash/Landing Page

- `[x]` Scene ↔ Scene Board divider now fills with the theme's accent color instead of
  just an outlined bar matching the surrounding background, and is a couple px thicker
  than the Library/Sections dividers — it's the boundary between editing and board views,
  so it reads as more significant. *(`feature/updates_v5` branch)*
- `[x]` Removed the "Scene Board" panel title; the scene count next to it now reads
  "Showing N scenes" and — fixing a real bug — reflects the active section filter instead
  of always showing the project's total scene count. *(`feature/updates_v5` branch)*
- `[x]` "Clear highlights" button pulses with a glow when library highlights are active,
  so it's easier to spot among the panel's other low-key controls. *(`feature/updates_v5`
  branch)*
- `[x]` **Merged the splash page and Overview page into one `index.html`.** Frozen header
  (logo left, "Your Projects"/"Tutorial" centered) → hero (tagline + intro copy) → the six
  former-Overview feature sections, reworked as an alternating zigzag layout with
  scroll-reveal animation → the Data & Backups block → the closing contact/Get Started
  section. `overview.html`/`overview-init.js` deleted; every link that pointed at Overview
  (Projects page nav, the editor's Help menu) now points at `index.html`. Removed the old
  "Ready to start? Launch SceneSetter" CTA at the bottom — opening Projects in a second tab
  from a page the user is already one click from leaving wasn't wanted; the header nav and
  the closing section's own Get Started button already cover it. *(`feature/updates_v6`
  branch)*
- `[x]` Redesigned the splash page with a bespoke dark palette (scoped to the page, not
  tied to the app's `data-theme`), drifting color-blob animations behind the hero,
  gradient hero text, a widened zigzag feature layout with a "browser window" frame around
  every screenshot, and scroll-reveal animation that replays every time a row scrolls back
  into view (not just once) — text and image animate on staggered timing rather than the
  row fading in as one block. Respects `prefers-reduced-motion`. *(`feature/updates_v6`
  branch)*
- `[x]` Populated both built-in sample projects (Pride and Prejudice, The Count of Monte
  Cristo) with per-scene word counts and POV data — neither had ever had this data, so
  "Show relative word count" and the POV report/trace features had nothing to demonstrate
  on the samples. Word counts are reasonable estimates summing close to each novel's real
  length (~122k and ~465k words); POV names are drawn from each project's existing
  character list. *(`feature/updates_v6` branch)*
- `[x]*` **Version-tracked sample-project refresh.** The word-count/POV data above only
  reaches a browser that seeds the samples for the first time — `ensureSampleProjects()`
  only ever seeds once per browser, so anyone who'd already opened the app had no way to
  get the update short of clearing `localStorage` by hand. Added a `samplesVersion` counter
  alongside the existing `samplesSeeded` flag: a browser behind the current version gets an
  automatic refresh on its next Projects-page visit, but only for a sample project it never
  actually touched (`revision === 0`) — an edited copy is left alone and not silently
  overwritten. Deleting a sample records a permanent `sampleKey` (not its display name) so a
  version bump never resurrects it, extending the guarantee that already existed for a plain
  page reload. A follow-up full-app audit caught and fixed a name-matching bug this
  introduced (a rename could re-add a duplicate, or slip past `deletedSamples` entirely and
  resurrect after a delete) and hardened JSON import along the way — see `STATUS.md` for the
  full narrative. *(`feature/updates_v7` branch)*

## 8. Timeline / Entity-ID Integration

Folds the `thruLine` app's chronology view, mapping wires, and conflict engine into
SceneSetter as a fourth board view, on top of a schema migration that gives library
entities stable ids. Full design in `SCENESETTER_V3_TIMELINE_SPEC.md`; narrative
implementation log in `STATUS.md`. Milestones M1–M7 per the spec's own numbering:

- `[x]*` **M1+M2 — Schema v3 migration + entity-id identity refactor.** `DATA_VERSION` v3;
  library entities/POVs/scene refs move to a shared integer id space; rename-propagation
  loops deleted (rename is now instant, id-based); charts/reports resolve ids to names per
  render. Combined into one pass — inseparable from the migration in practice.
- `[x]*` **M3 — Scene form Timing/Reveals groups + offscreen semantics.** Storyline/anchor/
  duration/offscreen fields and a Reveals checklist pair (with orphan garbage-collection on
  save) added to the Edit Scene form; board cards get an "Offscreen" badge and count.
- `[x]*` **M4 — Timeline view shell.** Fourth view-toggle mode; chronology strip (storyline
  lanes, ordinal/true-scale positioning, zoom, character thread overlay) + manuscript ribbon
  + wires overlay, ported from `../Timeline/js/{time,wires}.js`; right panel reparents the
  real Edit Scene form into an Inspector tab instead of duplicating it; board-only menu
  items/shortcuts disabled while active. Uses **Alt+K** (not the spec's assumed Alt+T,
  already taken by Add Theme in this codebase).
- `[x]*` **M5 — Chron drag + markers.** Horizontal reorder (`chronOrder`) and vertical
  re-lane drag in the chronology strip (ordinal-only reorder; true-scale shows a one-time
  toast); right-click markers (add/rename/delete via popover).
- `[x]*` **M6 — Conflict engine + panel + warn-dots.** Ported from `../Timeline/js/
  conflicts.js`; bilocation/constraint/reveal-order/anchor-monotonicity checks (bilocation
  adapted for this app's multi-location scenes), a Conflicts tab in the right panel (flag
  mode, dismiss/restore), warn-dots on board/strip/ribbon cards, debounced recompute on
  every save with dismissed-fingerprint pruning.
- `[x]*` **M7 — Polish + full verification.** Full §13 checklist (24 items) run across
  all five themes, against both a fresh project and a migrated sample. Found and fixed
  a real bug along the way: the M3 Timing/Reveals dropdown buttons ("Also part of,"
  "This scene reveals," "Requires knowing") were never wired to `toggleCkDrop()` in
  `editor-init.js`, so they didn't open on click.
- `[x]*` **Post-M7 hardening**, prompted by importing a real, structurally rich
  ThruLine dataset (Frankenstein — multiple storylines, a frame narrative, a genuine
  reveal-order conflict) that the smaller M7 test fixtures never exercised. Found and
  fixed four more real bugs: the Timeline Inspector's Cancel/Save row collapsing
  beside the Title field and every field click silently cancelling the edit (two
  compounding causes — a reparented-element CSS rule and a board-only click-outside
  handler that didn't know about Timeline mode); the wires zone hardcoded to 48px
  instead of taking the stage's remaining space; wires not drawing for offscreen
  scenes at all; and wire endpoints pinned to the strip boundary instead of the
  actual card position, so any card outside the bottommost storyline lane looked
  disconnected. The converted Frankenstein project was then kept as a permanent
  third sample (`frankenstein.json`), since its Timeline-heavy shape makes it a
  better everyday demo than the two v2-derived samples.
- `[x]*` **Post-M7 hardening, continued** — three more rounds chasing a user report
  of chron-strip lanes "not matching their names." The first round added colored
  lane outlines (each row/label now carries the same color as its cards' top
  border) and, while investigating, fixed a real separate bug where marker year-
  caption labels were invisible on every project that has any (an overflow clip,
  not a stacking issue). That didn't fully explain the report; round two found the
  actual cause — `.tl-lane-label` had no `flex-shrink:0`, so flex's default
  shrink-to-fit silently compressed every label below its true height once total
  lane height exceeded the available space, while the track's absolutely-
  positioned rows/cards stayed put — a cumulative drift, worse with every lane
  down, confirmed against the user's own exported project data (which was correct
  throughout; this was purely a layout bug). Round three fixed a direct regression
  from that: disabling the shrink meant the "+ Storyline" button — previously
  just the last flex child, kept visible only because flex was compressing labels
  to make room for it — got pushed past the clipped edge and disappeared.
  See `STATUS.md` for the full narrative of all of the above.

*(`thruLine_v1` branch — all M1–M7 milestones complete, plus post-M7 hardening, the
Braid view — renamed **Path** — (ported from `../Timeline`'s `updates_v1` branch),
Strip renamed **Loom**, both now part of the same Cards/Snake/Circle/Loom/Path
view-toggle switch shared across all views (board, Flow Chart, Timeline) rather
than a separate in-header control; a chron-strip lane-row/offscreen polish pass;
several rounds of direct-feedback fixes across the Inspector panel, Path view,
and the Timeline zoom slider (now a 0-100 auto-fit-aware position shared by both
Loom and Path, replacing the old fixed 70-200px/scene range); a View-menu
overhaul (direct Card Board/Scene Flow Chart/Timeline switch items replacing
the old toggle pair); and a Conflicts panel that now follows scene selection.
Most recently, a large direct-feedback round across Loom/Path selection
(Inspector auto-expand, a click-off-to-deselect fix, selected-card styling
unified with hover), a Narrative-ribbon drag-reorder, a storyline-palette
contrast fix, a redrawn Loom/Path icon pair, a Conflicts-panel rework
(always shows every conflict, scrolls to/highlights the selected scene's
own), toolbar sizing/spacing polish, a Chronology True-scale cross-lane
ordering bug fix (was zig-zagging the character Thread), True-scale drag
now editing the scene's anchor date instead of being disabled, and a
scroll-arrow edge-overlap fix on both chron/manuscript rows. See
`STATUS.md` for the full narrative. Not merged to `main`, explicitly scoped
to stay off `main` and every other branch until it's ready.)*

---

## Branch status

| Branch | State |
|---|---|
| `strip_AI` | Merged to `main` (PR #4) |
| `feature/flow_visual` | Merged to `main` (PR #7) |
| `feature/updates_v1` | Merged to `main` (PR #9) — new project modal, backup reminder system, Save-menu removal, `backToProjects` fix, chart-view control hiding, Word Count/multi-select POV fields, "+ Add item" scene checklists, discard-confirmation dialog, POV Library panel highlighting, POV chart-highlighting fix, Unassigned chart indicator, Mac Alt-shortcut fix, POV scene-card row, POV added to Reporting, Overview/Tutorial docs updated for POV |
| `feature/updates_v2` | Merged to `main` (PR #11) — all of `UPDATE_ROADMAP.md`'s code-review fixes (§1-3), custom POV name edit/delete, chart segment hover polish, chart margin tightening, the snake chart width-utilization and curve-clipping fixes, the sample-project seeding race fix, a fresh full-app audit's fixes (§6: import validation gap, orphaned-section reports bug, filtered-section-delete bug, section-color undo bug, report-generation perf), the CSP `unsafe-inline` removal, and (most recent) §7's drag-and-drop/keyboard fixes (stuck-drag recovery, multi-select+filter drag, undo/redo input and drag guards, Caps-Lock-proof export shortcut, Alt-shortcuts-under-modal guard) |
| `feature/updates_v3` | Merged to `main` (PR #12) — "Show relative word count" chart toggle (see `CHART_FEATURE_SPEC.md` §14); a third full-app audit's fixes (`UPDATE_ROADMAP.md` §8: a high-severity corrupt-project-load data-loss bug, save-failure alerting, wordCount clamping, a character/POV-name collision, a stale drag-insert anchor, a menu-hover bug, and several other low-severity fixes — fully closed out, nothing left open); and a "Your Data & Backups" messaging rework across Projects/Overview/Tutorial plus feature-doc refresh (Size by Word Count, a stale Undo/Redo count). See `STATUS.md` for the full narrative. |
| `feature/updates_v4` | Merged to `main` (PR #13) — new "Trace lines" chart feature: a "Trace:" selector draws each selected library item as its own colored line through the scenes it appears in, layered on the existing snake/circle chart (see `TRACE_LINES_SPEC.md`), plus six rounds of live-feedback fixes on top of it — an exact snake lane-position fix (13.7px worst-case drift down to 0.04px), continuous no-cap tube/band scaling that always fills the tube's full width, gradual (not jumping) tube growth, a dedicated 16-color trace palette (the shared 8-color section palette was repeating colors past 8 lanes), proportional (not fixed-px) hover-highlight widening, active-state glow rings on the Trace/Sections selectors, a stale section-pin fix, and a chart section-count fix. See `STATUS.md` for the full narrative. |
| `feature/updates_v5` | Merged to `main` (PR #14) — Scene/Scene Board divider and header polish (prominent divider color, "Scene Board" title removed, scene-count-vs-filter bug fix), the Cards/Snake/Circle view switch replacing the old chart toggle button and menu item, removal of the snake chart's redundant section legend, solid-badge scene numbers, POV drag-reorder, a "Learn about your data and backups" link on the backup banner, and Help Mode tooltip coverage for the entire chart toolbar (plus an overflow-clipping fix). See `STATUS.md` for the full narrative. |
| `feature/updates_v6` | Merged to `main` (PR #15) — merged the splash page and Overview page into one redesigned `index.html` (dark palette, animated hero, zigzag feature rows with scroll-reveal, "browser window" screenshot framing), deleted the standalone Overview page, and added word-count/POV data to both sample projects so Word Count sizing and the POV report/trace features have something to demonstrate out of the box. See `STATUS.md` for the full narrative. |
| `feature/updates_v7` | Pushed to `origin`, **not yet merged to `main`** — version-tracked sample-project refresh: a browser that already seeded the samples before v6's word-count/POV update now gets it automatically on its next Projects-page visit, but only for a sample it never edited; deleting a sample records its `sampleKey` so a version bump never brings it back. Plus a follow-up full-app audit's fixes: the rename/delete sample-matching bug above, `importProjectJSON()` hardening (section-color format validation, `sectionId` type check, duplicate-library-name rejection), an export-filename edge case, and dead-code cleanup (`hdr-spacer` duplicate id, retired theme-dropdown CSS/JS). See `STATUS.md` for the full narrative. |
| `thruLine_v1` | Complete (M1-M7 of 7) + post-M7 hardening, **not merged to `main`** — Timeline/entity-id integration (§8 above): schema v3 migration + identity refactor, Timing/Reveals scene-form fields, Timeline view shell with chronology/manuscript/wires/lanes, chron drag + markers, conflict engine + panel + warn-dots, a full M7 verification pass, four bugs found + fixed via a real converted ThruLine dataset kept on as a third permanent sample project (Frankenstein), and three further rounds fixing chron-strip lane/label alignment (colored lane outlines, invisible marker labels, labels drifting out of sync with their rows under flex shrink, and the "+ Storyline" button regression that fix introduced). Since then: the Braid view (a read-only reading-order/story-time structure chart with a dashed flashback path, ported from ThruLine and added as a "Strip / Braid" toggle inside Timeline view); a chron-strip polish pass (gradient lane-row borders, offscreen-tile dotted borders/labeling); an Inspector-panel pass (hidden irrelevant fields, bigger collapsible-group carets, dirty-state Cancel/Save dimming, a click-off-panel discard guard, a Delete Scene button, the panel made collapsible like the others); a Braid/Strip visual-polish round (era-marker/legend/arrow fixes, a measured — not assumed — arrow-centering fix, a thread-trace redesign through several iterations landing on thick+translucent+light-red, and a from-scratch zoom-slider redesign: a single shared 0-100 auto-fit-aware position, replacing the old fixed 70-200px/scene range, driving both Strip's card spacing and Braid's column spacing, with a 0 position that fits every scene in the current window with no overlap and no scroll); and a final detail pass (thread color, zoom-tick contrast, Title/Summary spacing, an Inspector-panel View-menu entry). Most recently: the Cards/Snake/Circle/Timeline view-toggle switch is now shared identically across board, Flow Chart, and Timeline (previously board+Flow only), Strip/Braid renamed Loom/Path with new icons as part of that same switch, the View menu's mode section reworked into direct Card Board/Scene Flow Chart/Timeline switch items (greyed for whichever's active), the Conflicts panel now follows scene selection (all conflicts only when nothing's selected or the badge is clicked), real vertical section dividers added to Path, and the Narrative row's section label moved below its dividers. Most recently: contrast fixes (storyline scene-counts, "Also part of" dots), the Title/Summary divider actually frozen now (was on Summary's own scrolling border, moved to Title's sticky one), Loom scroll affordances (overscroll-behavior fix so trackpad swipes stop triggering browser back/forward, native scrollbars hidden in favor of small bubble scroll-arrow buttons), a Save/Discard confirmation before a chron drag (reorder or re-lane) commits, and a Loom/Path icon redraw. Most recently: Inspector auto-expand on card/node click, a click-off-to-deselect fix for empty lane-row space, selected-card styling unified with hover's, a storyline-palette contrast fix, Narrative-ribbon drag-reorder (same move-confirmation flow as chron drag), a `user-select:none` fix for text getting highlighted mid-drag, a second Loom/Path icon redraw, a Conflicts-panel rework (always shows every conflict with a count header, scrolls to/highlights the selected scene's own instead of filtering), toolbar sizing/label-spacing polish, an era-marker-label legibility fix at low zoom, a Chronology True-scale cross-lane ordering bug fix (was zig-zagging the character Thread — and separately, letting color bands stop short of the track's true edge), True-scale drag now edits the scene's anchor date (previously disabled entirely) with the same move-confirmation flow, and a scroll-arrow edge-overlap fix on both the chron and manuscript rows. See `STATUS.md` for the full narrative. |
| `thruLine_v2` | Forked from `thruLine_v1`, **not merged anywhere** — Chronology Ordinal mode now renders two or more scenes on different storylines that share an identical anchor (date + time, when set) at the same vertical, instead of always staggering them; scoped to Ordinal only (True scale's per-lane collision-avoidance pass makes the same idea materially harder/riskier there, discussed but not attempted). Grouping is adjacency-scoped in `chronOrder` and never merges two scenes on the *same* storyline. A new showcase sample project (`longfellow-job.json`, a heist story built to exercise every conflict type plus the simultaneous-anchor alignment) surfaced a second round: the Conflicts panel now scrolls to/centers a conflict's scenes on both the Chronology and Narrative rows, and selecting a card vs. clicking a conflict row are now mutually exclusive (used to both stay highlighted at once); a stray section-color border on Narrative cards removed (was also silently breaking the selection-ring CSS); the Narrative row's first section now actually shows its name; clipped anchor date/time inputs in the Inspector fixed; Mac keyboard shortcut labels (⌘/⌥) added (the underlying handler already accepted Cmd, this was display-only); and a Path-view flashback investigation that turned up no bug, just a sample restructured into a proper in-medias-res cold open to actually demonstrate the feature. Most recently: the Inspector/Conflicts panel background now matches its own active tab (was a shade off from the New/Edit Scene pane's equivalent), and the "Conflicts (N)" header freezes at the top while the list scrolls beneath it. Also discussed but explicitly deferred (not implemented): scoping offscreen scenes to the Chronology rows only, excluded from Cards/Flow/Narrative and their numbering — assessed as a real but non-trivial change (five separate places independently rebuild "scenes in display order" and would all need updating, including Reports, which the user hadn't mentioned) — see `STATUS.md` for the full writeup. Most recently: a fifth full-app audit found and fixed six real issues (a Timeline "New Scene" discard-guard bypass, missing `nextId`/`nextSecId` repair + section validation in the v3 import path, a project-creation write-ordering bug that could leave a phantom project entry on storage failure, a chart section-filter/lettering bug, an unnecessary O(n²) conflict recompute on every save, and a zoom-slider save-per-tick perf issue), plus a same-session follow-up round of smaller efficiency fixes (a redundant per-lane scene-number rebuild in the charts, layout-thrashing in the section-header alignment code, and a stale build-script file list). See `STATUS.md` for the full narrative. |

Items marked `[x]*` above are complete and verified in the browser preview, but only exist
on the branch noted for that item until it's merged into `main`. Items marked `[x]` (no
asterisk) are merged to `main`.
