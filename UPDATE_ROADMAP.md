# SceneSetter — Update Roadmap (Code Review Findings)

Tracks fixes and hardening items surfaced by a full code review of `main` at commit
`0792a9d` (post `feature/updates_v1` merge — all findings re-verified against this exact
code, line numbers current). Advisory only — nothing here has been applied yet. Check
items off as they land.

**Legend:** `[x]` fixed and verified · `[~]` reviewed, decided not to fix (note why) · `[ ]` not started

---

## 1. Bugs

- `[x]` **Undo doesn't revert library-item edits.** `snapshot()` in
  [state.js:169-183](state.js#L169) shallow-copies `S.characters`/etc. (`[...S.characters]`),
  so the snapshot holds references to the same `{name, notes}` objects rather than copies.
  `saveLibEdit()` ([editor.js:270](editor.js#L270)) then mutates `item.name`/`item.notes`
  in place, which mutates the history snapshot too — renaming an item and pressing Ctrl+Z
  restores scene tag references but not the item's own name/notes. Fix: deep-copy library
  items in `snapshot()`/`applySnapshot()` (`.map(x => ({...x}))`), the way sections and
  `povCustomNames` already are. (Scene `povs` arrays are correctly deep-copied, so POV
  assignments are unaffected.)
- `[x]` **Undo/redo silently wipes library highlight selections.**
  [state.js:206-208](state.js#L206): `applySnapshot` filters selections with
  `S[key].includes(v)`, but `S[key]` holds `{name, notes}` objects while selections hold
  plain name strings — the check is always `false`, so every undo/redo clears the user's
  highlighted-items selection even when the items still exist. Should be
  `S[key].some(x => x.name === v)`. Telling contrast: the POV selection filter right below
  it ([state.js:209-210](state.js#L209)) does this correctly with a Set of used names.
- `[x]` **Self-referential sort comparator in reports.** [reports.js:60](reports.js#L60),
  `rptFilterScenes`: calls `filtered.indexOf(a)` *inside* the comparator of
  `filtered.sort(...)` — `indexOf` runs against the array while it's mid-reorder, so the
  "stable tiebreak" isn't reliable (and it's O(n²·log n)). Since ES2019 `sort` is stable,
  just `return oa - ob` and drop the tiebreak, or precompute an index `Map` beforehand.
- `[x]` **"5th scene" milestone / email popup can re-fire.**
  [editor.js:434-441](editor.js#L434) + [tracking.js:20](tracking.js#L20): the count is
  `current scene count − count at ID creation`, so deleting scenes decrements it. A user
  hovering around 5 scenes (add/delete/add) can retrigger `=== 5` repeatedly, causing the
  email popup and duplicate Formspree/GA milestone events to fire more than once. Track a
  "milestone already fired" flag in localStorage instead of recomputing from a live count.
- `[x]` **Deleted sample projects resurrect themselves.**
  [projects.js:583-596](projects.js#L583), `ensureSampleProjects`: checks whether a sample
  exists by matching project *name*. If a user deletes or renames "Pride and Prejudice", the
  next visit to the projects page re-downloads and re-adds it. Persist a `samplesSeeded`
  flag in global prefs instead of matching on name.
- `[x]` **Sample-project seeding race condition could duplicate both samples.**
  [projects.js:604](projects.js#L604), `ensureSampleProjects()`: the `samplesSeeded` flag
  above is only persisted after the sample-file fetches resolve, so two `projects.html` loads
  racing before that write landed (two tabs opened at once, a fast reload) would each read
  the flag as unset and seed their own copy of both samples — a real user report showed
  exactly this (2× "Pride and Prejudice", 2× "The Count of Monte Cristo"). Fixed by claiming
  a short-lived, timestamped `samplesSeeding` lock synchronously before starting the async
  fetches, so a concurrent load backs off instead of re-seeding; falls back to retrying on
  the next visit if the lock goes stale (e.g. the first load crashed mid-seed). Verified by
  racing two concurrent calls against a cleared localStorage: old code produced 4 project
  entries, fixed code produced 2. *(`feature/updates_v2` branch, pushed, not yet merged.)*
- `[x]` **Drag reorders and Quick Setup skip `recordDataEdit()` — now also breaks backup
  tracking.** Card drag-drop (`endCardDrag`), section drag-drop (`endSecListDrag`), library
  drag (`endLibDrag`), and `quickSetup()` all call `saveState()` without `recordDataEdit()`
  first. Originally this only meant `lastDataEditAt` didn't advance (weakening the import
  flow's diverged-copies detection). Since the backup feature landed, `recordDataEdit()` is
  also what increments `S.editsSinceExport` — so **reorder-only changes never count toward
  the backup-overdue banner and never arm the beforeunload "leave site?" warning**. A user
  who spends an hour reordering scenes can close the tab with zero warning and an
  up-to-date-looking "Backed up N ago" status. *(Upgraded from Hardening to Bugs after the
  merge — the backup feature raised the stakes.)*

## 2. Hardening / edge cases

- `[x]` **Import doesn't validate `nextId` / `nextSecId`.**
  [projects.js:403-500](projects.js#L403): a hand-edited or corrupted import file with
  `nextId` ≤ an existing scene id would produce duplicate scene ids on the next "add scene,"
  breaking find-by-id logic throughout the app. The rest of the import validation is
  thorough (and now covers `wordCount`, `pov`/`povs`, and `povCustomNames` too) — this is
  the one structural gap.
- `[x]` **Two different definitions of "unassigned."** `renderBoard`/chart code treats a
  scene whose `sectionId` points to a section that no longer exists as Unassigned (via a
  `validSecIds` check), but `renderSecPanel` ([editor.js:1250](editor.js#L1250)) counts only
  `!s.sectionId`. An orphaned `sectionId` (possible via import) shows the scene on the board
  under Unassigned but doesn't count it in the Sections panel.
- `[x]` **Reload after "Update Local Copy" import doesn't reset view state.**
  [projects.js:535](projects.js#L535): stale `secFilterIds`, `searchQ`, or chart mode can
  survive the in-page reload, making the freshly-imported project appear empty or filtered
  for no visible reason.
- `[x]` **`submitEmail` treats any fetch resolution as success.**
  [ui.js:50](ui.js#L50): doesn't check `response.ok`, so a 4xx/5xx from Formspree still
  closes the popup and logs "submitted successfully."
- `[x]` **`resetState()` doesn't reset backup-tracking fields.**
  [projects.js:120-128](projects.js#L120): clears POV/scenes/sections but not
  `S.lastExportedAt` / `S.editsSinceExport`. Normally harmless because `loadState()`
  immediately overwrites both — but if `loadState` fails (corrupted project), the previous
  project's backup status leaks into the broken one. One-line fix while in the area.
- `[x]` **Escape key cascades every close/clear handler at once.** Replaced the
  "run every handler unconditionally" list with a priority-ordered `ESCAPE_ACTIONS` array
  ([editor.js:1590](editor.js#L1590)): modals first (most specific — the discard-confirm
  dialog — down to the rest), then floating chrome (help overlay, section filter dropdown,
  menu bar), then view modes (chart view), then board-content state (active edit, search,
  card selection, library highlights). Only the first matching tier fires per keypress, so
  dismissing one modal no longer also wipes selections/highlights/search in the same
  keystroke — each now takes its own successive Escape press.
- `[x]` **Escape did nothing for an unsaved New Scene form.** Found while doing the fix
  above: `maybeCancelEditWithConfirm()` (the function the old cascade called for edit mode)
  only ever checked `S.editingId`, never the New Scene tab's `live` state — so unlike the
  existing click-outside-the-panel handler (which already prompted correctly for both
  cases), Escape silently did nothing to an in-progress, unsaved New Scene. Renamed to
  `maybeCancelSceneFormWithConfirm()` and extended it to mirror the click-outside handler's
  logic exactly (same editActive/newLive/editDirty branching), so Escape now opens the same
  "Discard this new scene?" confirmation the click-outside handler already used.

## 3. Efficiency (not urgent at current scale, worth knowing)

- `[x]` **`sceneDisplayNum()` recomputes the full ordered list on every call.** It's called
  once per card per render, and again per chart segment/tooltip — each call rebuilds the
  unassigned+section-ordered array from scratch. Fine under ~100 scenes; compute an
  id→number `Map` once per `renderBoard()`/`renderChart()` pass and reuse it.
- `[x]` **Card drag re-renders the whole board on every pointer-move.** `moveCardDrag()`
  calls `renderBoard()` (full innerHTML wipe + rebuild) on every drop-target change during a
  drag. Toggling drop-indicator classes on existing DOM nodes instead would scale much
  better past a couple hundred cards.
- `[x]` `hist.MAX` raised from `10` to `50` ([state.js:165](state.js#L165)) — undo depth was
  shallow relative to how cheap each snapshot is.

## 4. Repo state

- `[x]` `main` and `release` were out of sync in local clones due to a stale fetch, not an
  actual branch divergence — confirmed identical (`0 files changed`) after fetching origin.
  Both fast-forwarded cleanly to `0792a9d`. `main` is the trailing "stable" branch by design.

## 5. Post-merge code review (backup.js, POV, and other `feature/updates_v1` work)

- `[x]` **`backup.js` reviewed — clean.** Thresholds, snooze, session-start reference point,
  and `beforeunload` guard are all correct; the "count from whichever is later, last export
  or session start" logic properly avoids flagging old projects on open. Only caveat is the
  `recordDataEdit()` gap above, which starves it of reorder edits.
- `[x]` **POV feature reviewed — solid.** Checked-state preservation across library
  re-renders (`ckCurrentlyChecked`), rename propagation into `scene.povs` and POV
  selections, deleted-character fallback into `povCustomNames`, legacy `pov`→`povs`
  migration, snapshot/undo coverage, import validation, and the POV report/matrix `items()`
  override are all implemented correctly. The POV selection filter in `applySnapshot` is
  actually the *model* for fixing the older SECS selection bug (§1).
- `[x]` **Chart changes reviewed — clean.** Unassigned marker/wedge letter-offset logic is
  consistent between snake, circle, legend, and print. The `resolveChartVars` ivory-probe
  for printing is valid because styles.css defines themes with bare `[data-theme=…]`
  attribute selectors (would silently break if those ever became `html[data-theme=…]` —
  worth a comment in styles.css).
- `[x]` **New-project modal, Ctrl+S swallow, `backToProjects` fix, export timestamping
  reviewed — clean.** Export now correctly resets `editsSinceExport` on both the stored
  copy and live state.
- `[x]` **Custom POV names had no edit or delete UI.** Added both, matching the
  ✎/× hover-icon pattern already used by Characters/Locations/Themes/Misc. Every POV row
  now shows the icons — for a name sourced from the Character library, they're dimmed and
  inert with a tooltip ("Edit/delete in Character list") explaining where to go instead of
  silently doing nothing; for a genuinely custom name, they open the same edit/delete-confirm
  modals the other library sections use, propagating a rename or removal into every scene's
  `povs` array and the highlight selection. Character-sourced entries were deliberately
  excluded from local edit/delete rather than unified with it — routing a rename through the
  Character library from two different panels risked the two copies drifting out of sync,
  and deleting a POV entry can't just mean "delete the character" (that has much bigger
  consequences elsewhere). New functions: `openPovEditModal`/`savePovEdit`,
  `openPovDelModal`/`removePovCustomName` — mirroring `openLibEditModal`/`saveLibEdit` and
  `openLibDelModal`/`removeItem` field-for-field, since `S.povCustomNames` is a plain string
  array (no notes) rather than one of the SECS-configured `{name, notes}` arrays.

## 6. Fresh full-app audit (`feature/updates_v2`, post chart/seeding fixes)

A ground-up re-review of the whole app (every `.js` file, all CSP/XSS/localStorage/external-
endpoint surfaces) rather than a follow-up to a specific change. Overall verdict: solid — XSS
posture is genuinely good (every render path escapes or uses `textContent`/`createElement`),
no `eval`/`new Function`, every `JSON.parse` try/caught, storage-quota errors handled. These
are the concrete bugs/gaps it turned up.

- `[x]` **Import validation didn't type-check scene tag arrays — a hand-edited/corrupted
  file could crash the board.** [projects.js:442-451](projects.js#L442) cross-checked
  `scene.characters`/etc. against the library *if* each was an array, but never rejected a
  scene where one of them wasn't an array at all (e.g. `"characters": "Bob"`). Such a scene
  passed validation, survived `loadState()`'s falsy-only `sc.characters || []` check (a
  string is truthy), and then crashed `renderBoard()` the first time
  `scene.characters.forEach(...)` ran on a string. Fixed by requiring `characters`/
  `locations`/`themes`/`misc` to each be `null`/absent or an array of strings, and hardened
  `loadState()` (`state.js`) defensively with `Array.isArray(v) ? v : []` for the same four
  fields regardless of import path.
- `[x]` **Reports silently dropped scenes with an orphaned `sectionId`.**
  [reports.js:49-53](reports.js#L49) and the report modal's Unassigned checkbox
  ([reports.js:17](reports.js#L17)) both keyed off the scene's raw `sectionId` / a falsy
  check, instead of "does this id resolve to a real section" — a scene pointing at a
  deleted/nonexistent section (import never validated `sectionId` against `d.sections`) was
  excluded from every report even with every checkbox selected, silently omitted from output
  the user would treat as a complete export. The board/Sections-panel/charts already treat
  orphans as Unassigned (§2's "two definitions of unassigned" fix); reports.js was the one
  remaining holdout. Fixed both spots to check membership in `S.sections` instead.
- `[x]` **Deleting a filtered-on section blanked the whole board.** `confirmSecDel()`
  ([editor.js:1321](editor.js#L1321)) never removed the deleted section's id from the
  module-level `secFilterIds` Set. Filtering to just that one section, then deleting it,
  left a stale id in the filter that matched neither the surviving sections nor
  `'unassigned'` — every scene (including the ones just reassigned to Unassigned) vanished
  from the board, reading as data loss even though nothing was actually lost (switching back
  to "All Sections" recovered it). Fixed by clearing the id from `secFilterIds` (and
  refreshing the filter button label) as part of the delete.
- `[x]` **Section color changes had no undo entry.** `colorSection()`
  ([editor.js:1346](editor.js#L1346)) called `recordDataEdit()`/`saveState()` but never
  `pushHistory()`, unlike every other section mutator. Fixing this was less trivial than a
  missing call: the color `<input>`'s `input` handler already mutates `sec.color` live
  (for real-time preview while dragging in the native picker) *before* `change` fires, so
  snapshotting inside `colorSection()` (called on `change`) would have captured the
  already-changed color, making undo a no-op. Fixed by snapshotting once, on the *first*
  `input` event of each drag interaction, before that live-preview mutation starts — verified
  by simulating a real drag (3 `input` events + 1 `change`) and confirming exactly one
  history entry is pushed and undo restores the true pre-drag color, not an intermediate one.
- `[x]` **`reports.js` called `sceneDisplayNum()` per scene (and per scene per item in the
  library reports), each call rebuilding the full ordered scene list from scratch** — the
  same anti-pattern `buildSceneNumMap()`'s own comment warns against, already fixed
  everywhere else (`renderBoard()`, the chart renderers). Hoisted to one
  `buildSceneNumMap()` call per report builder (`buildSceneListReport`, `buildLibItemReport`,
  `buildMatrixReport`), verified against all 7 report types with 0 scene-number mismatches
  across 39 scenes.
- `[x]` **"Update Local Copy" import dialog could silently overwrite unexported local
  edits with no warning.** [projects.js:570](projects.js#L570): `revision` counts *saves*,
  not content edits (a theme change or simply leaving the editor bumps it), so "the file is
  a newer revision" never implied "the local copy has nothing worth keeping." The dialog now
  appends a warning naming the local copy's `editsSinceExport` count when it's nonzero.
- `[x]` **CSP still needed `'unsafe-inline'` in `script-src`.** ~140 inline event-handler
  attributes (`onclick=`, `onchange=`, `oninput=`, `onmouseenter=`, etc.) across
  `editor.html`, `projects.html`, `overview.html`, `test.html`, and the projects-grid card
  template in `projects.js` were converted to `addEventListener` wiring — all were static,
  literal calls with no interpolated/untrusted data, so this was a mechanical CSP-compliance
  transform, not itself an XSS fix. Removing only the attributes wasn't sufficient, though:
  the resulting (and some pre-existing) inline `<script>` blocks would *still* violate a
  stricter CSP, so those were extracted into four new files (`editor-init.js`,
  `projects-init.js`, `overview-init.js`, `test-init.js`). `'unsafe-inline'` dropped from
  `script-src` in every page's CSP meta tag (`style-src`'s is unchanged, out of scope); a CSP
  meta tag was also added to `test.html`, which previously shipped with none. Verified on a
  fresh, uncached origin: zero remaining inline handlers/scripts, zero console/CSP-violation
  errors across all 6 pages, and a full functional pass (menus, themes, panels, scene CRUD,
  chart view, reports, projects-grid actions, overview image modal) plus re-verification that
  the section-filter and section-color-undo fixes above still work post-restructuring.

*(All of §6 landed on `feature/updates_v2`, pushed, not yet merged.)*
