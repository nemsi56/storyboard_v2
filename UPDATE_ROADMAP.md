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

## 7. Second full-app audit (drag-and-drop, keyboard, and CSP-migration verification)

A follow-up audit specifically targeting the areas §6 covered lightly (drag-and-drop,
keyboard shortcuts, panel resize/zoom) plus an independent re-verification of the `*-init.js`
CSP migration from §6. Three parallel passes: one mechanically re-verified every id/function
reference in the new `*-init.js` wiring and the CSP/localStorage/global-scope surface
(all clean — see STATUS.md for the full inventory), one did a line-by-line correctness
review of `editor.js`'s drag-and-drop and keyboard-handling code, and one did a mechanical
consistency sweep (duplicate ids, global name collisions, script load order). All findings
below were independently re-verified against the source before being fixed.

- `[x]` **Ctrl+Z/Ctrl+Y hijacked a text field's own native undo.**
  [editor.js:1790-1791](editor.js#L1790) (pre-fix) handled undo/redo before the `!inInput`
  guard that already protected the export/zoom shortcuts a few lines down. Typing in a
  scene's Summary and pressing Ctrl+Z to fix a typo blocked the browser's native field-undo
  and instead reverted an unrelated board-level action, leaving the typo untouched. Fixed by
  moving undo/redo behind the same `!inInput` guard.
- `[x]` **Undo/redo could fire mid-drag, corrupting drag state.** Folded into the fix above:
  the same guard now also requires `!drag.on && !ld.on && !sld.on` — pressing Ctrl+Z while
  actively dragging a card (or a library/section-list item) previously re-rendered the board
  out from under the drag via `renderBoard()`, so the eventual mouseup committed a reorder
  against post-undo state and wiped the redo stack in the process.
- `[x]` **A drag never ended if the mouse button was released outside the browser
  window.** Drag state (`ptr`/`drag`/`ld`/`sld`, plus the panel-resize state) was only
  cleared by a `mouseup` listener on `document`, which never fires for an outside-the-window
  release. The ghost card stuck to the cursor, and the *next unrelated click anywhere* would
  silently commit a reorder/section-reassignment to wherever the cursor happened to be.
  Fixed by checking `e.buttons === 0` at the top of the global `mousemove` handler — any
  stray movement after re-entering the window now self-heals all drag state without
  committing anything (verified: a simulated stuck card-drag and stuck library-item drag
  both clear cleanly with the scene/library order provably unchanged afterward).
- `[x]` **Multi-select drag could silently move a scene hidden by the section filter.**
  `beginCardDrag()` built `drag.ids` from `S.selIds` with no regard for the active section
  filter — selecting two scenes across two different sections, then filtering the board to
  show only one of those sections, then dragging the *visible* card would drag the *hidden*
  one along with it (only a "+1" badge on the ghost hinted at it). Fixed by filtering
  `drag.ids` down to scenes whose card is actually rendered in the DOM at drag-start.
- `[x]` **Ctrl+Shift+E (export) detected Shift by key-case instead of `e.shiftKey`.**
  [editor.js:1810](editor.js#L1810) (pre-fix) tested `e.key === 'E'`. With Caps Lock on, a
  plain Ctrl+E (no Shift) produces an uppercase `e.key` and false-triggered export, while the
  real Ctrl+Shift+E produces a *lowercase* `e.key` under Caps Lock (Shift cancels the
  inversion) and silently failed to fire. Fixed to check `e.shiftKey && e.code === 'KeyE'`.
- `[x]` **Alt-letter shortcuts fired underneath an open confirmation/data-entry modal.**
  Unlike the Escape-key handler (`ESCAPE_ACTIONS`, fully modal-tier-aware), the Alt+N/C/L/
  T/M/R/V branch only checked `!inInput` — e.g. Alt+N while a "Delete this?" confirmation was
  open would open a New Scene form underneath it. Added a shared `anyModalOpen()` helper
  (checking the same 9 overlay ids `ESCAPE_ACTIONS` treats as the modal tier) and gated the
  whole Alt-shortcut branch on it.

Not done (assessed as low-value polish, not necessary — see conversation): no-op drag drops
(dropping a card/library item/section back into its exact original position) still push an
undo-stack entry and a `saveState()` call, since the existing guard only checks
`dropIdx !== fromIdx` rather than whether the actual resulting order differs. Self-contained
to `endCardDrag()`/`endLibDrag()`/`endSecListDrag()`, independent of everything else on this
branch — safe to pick up anytime.

*(All of §7 landed on `feature/updates_v2`, pushed, not yet merged.)*

## 8. Third full-app audit (`feature/updates_v3`, post word-count-chart feature)

Two-part audit on `feature/updates_v3`: a first pass over the new chart code plus the files
earlier audits covered lightly (reports.js, backup.js, ui.js, tracking.js, state.js
save/load), then a final pass over the fixes themselves plus editor.js's remaining ~1400
lines (forms, section/library CRUD, modals, selection — only its drag-and-drop/keyboard
code had been audited before, in §7). Runtime verification was done live in the browser
(XSS payload injection through the report builders, corrupt-project open, simulated
storage failures, negative-input entry), not just by reading. Every subagent finding
below was re-verified against source (and where feasible, reproduced live) before being
logged.

### Fixed on this branch

- `[x]` **A project that failed to load was silently overwritten by the first save**
  *(high)*. `openProject()` ([projects.js:185](projects.js#L185)) ignored `loadState()`'s
  return value, so a corrupt/unreadable blob opened as an empty, live-editable session —
  the next `saveState()` (any edit, undo, even a theme change) overwrote the stored JSON
  with that empty state, destroying possibly hand-recoverable data. Variant: a stale
  `ss_open_project` id opened an empty editor whose saves went to an orphaned storage key
  invisible in the projects grid. Now checks the return and bounces to projects.html with
  an alert, leaving the stored blob untouched (reproduced and verified live both ways).
- `[x]` **Non-quota save failures were completely silent; quota failures alerted on every
  edit** *(medium)*. [state.js:62](state.js#L62) only alerted on `QuotaExceededError` —
  storage disabled or a privacy-mode SecurityError meant every subsequent edit was
  in-memory only, lost on refresh with no warning. And the quota alert re-fired on every
  one of saveState's ~20 call paths. Both cases now alert exactly once per session
  (verified: three consecutive simulated failures → one alert). Known accepted limitation:
  the once-per-session flag never resets on a later successful save, so a
  break→recover→break-again sequence in one session only alerts the first time.
- `[x]` **`loadState()` could leave `S` half-populated and still return false** *(medium)*.
  It mutates `S` field-by-field inside its try, so an exception partway (e.g. a malformed
  `sections` value) left scenes loaded but sections gone — and before the fix above, that
  half-state was saveable. The catch now calls `resetState()` before returning false
  (verified live: a bad-shape blob now yields a clean, fully-reset `S`).
- `[x]` **Negative word counts were accepted and persisted** *(low)*. `min="0"` on a
  number input doesn't block a typed/pasted "-500"; `parseInt(v) || null` kept the sign.
  Charts' `> 0` guards rendered it as "unset," masking the bad value while it round-tripped
  through export. New/Edit Scene now clamp via a shared `parseWordCount()`; `loadState()`
  and JSON import both normalize existing ≤0 values to null (reproduced live before the
  fix, re-verified clamped after).
- `[x]` **Printed flow chart showed unexplained red "estimated" ticks** *(low)*. The print
  legend ([charts.js:715](charts.js#L715)) explained section letters but not the
  estimated-word-count tick the on-screen legend explains. Added the same note, gated on
  the same `sceneSetHasEstimated()` check.

*(The five fixes above landed as commits `2ebbfe8` and `4432c10`, pushed.)*

- `[x]` **Adding/renaming a character never checked `S.povCustomNames`** *(medium)*.
  `confirmAdd` ([editor.js:70](editor.js#L70)) and `saveLibEdit`'s rename-collision check
  ([editor.js:313](editor.js#L313)) only scanned `S[sec]`, but `povNames()` concatenates
  characters + custom names — a name in both lists rendered twice in every POV dropdown,
  saved duplicate entries into `scene.povs`, and `renderPovLibSec` gave the character's
  row custom-name edit/delete handlers (deleting removed the custom name while the
  character silently kept supplying the POV). Both now also check
  `S.povCustomNames.includes(name)` for the `characters` category, mirroring the guard
  `confirmPovAdd` already had in the other direction (verified live: adding a character
  or renaming one onto an existing custom POV name is now blocked, input reselected).
- `[x]` **`pendingInsert` survived detours and could splice a later scene at a stale
  anchor** *(medium)*. Set by an insert-zone click ([editor.js:451](editor.js#L451)),
  previously cleared only by `addScene`/`cancelNewScene` — `menuNewScene` and entering
  Edit mode now also clear it, so a detour through Create > New Scene or into editing a
  scene no longer lets a later, unrelated Add Scene land at an abandoned anchor position
  (verified live: the legitimate insert-zone flow still lands the new scene in the right
  spot; a detour through either entry point now clears the anchor first).
- `[x]` **Hovering the open menu's own title button closed the menu** *(medium-low)*.
  `hoverMenu` ([editor.js:132](editor.js#L132)) called `toggleMenu` for every hovered
  button while any menu was open — for the already-open menu, that toggled it *closed*,
  so drifting the pointer from the dropdown back across its own title made the menu
  vanish mid-use. Now only switches when the hovered menu differs from the one already
  open (verified live: hovering back across File's own title keeps it open; hovering
  Edit while File is open still switches to Edit).

*(The three fixes above landed as commit `e7f7192`, pushed.)*

### Fixed (round two — six low-severity items)

- `[x]` **`renderPovCk` mutated `S.povCustomNames` during render without persisting**
  *(low)*. The legacy-name fold-in ([editor.js:1195](editor.js#L1195)) now calls
  `recordDataEdit()`/`saveState()` whenever a name is actually folded in this render pass
  (verified live: opening Edit mode on a scene with a legacy POV name now persists the
  fold to storage immediately, not just in memory).
- `[x]` **Cancelling the native color picker stranded live-preview state** *(low)*.
  `input` events mutate `sec.color` and consume the one history entry before `change`
  fires; a `blur` listener now reverts the color and pops the phantom history entry if
  `change` never followed (verified live: simulating input-then-blur-without-change
  reverts the color and leaves the undo stack exactly as it was; a real input-then-change
  commit still works and persists normally).
- `[x]` **`quickSetup` pushed history/recorded an edit even when it created nothing**
  *(low)*. Now computes what would actually be created before touching history/state, and
  skips entirely if every generated name already exists; the undo label reflects the real
  count when only some names collide (verified live: an all-collision run pushes zero
  history entries; a partial-collision run creates only the missing sections and labels
  the undo entry with the accurate count).
- `[x]` **`resetAll` was dead code** *(low)* — removed; confirmed zero call sites anywhere
  in the repo before deletion, and a full reload afterward shows no console errors.
- `[x]` **Clicking a scene card under a dirty edit form toggled its selection beneath the
  discard confirmation** *(low, cosmetic)*. The outside-click discard-confirm handler now
  disarms the pending `ptr.down` pointer state before opening its dialog (verified live,
  dispatching a real mousedown/mouseup sequence: the confirm opens and the other card's
  selection does not toggle; a normal click with no dirty form still toggles selection
  correctly).
- `[x]` **Float `wordCount` from an import false-dirtied and truncated in the edit form**
  *(low)*. A shared `normalizeWordCount()` ([state.js](state.js)) now rounds to an integer
  (and only after rounding checks positivity, so e.g. 0.4 correctly becomes null rather
  than a non-null 0) on both load and import, so the Edit form's integer-only
  `parseWordCount()` can never see a stored value it wouldn't itself have produced
  (verified: 2.5→3, 0.6→1, 0.4→null, -3.5→null, 0→null, 500→500, and an end-to-end
  `loadState()` of a scene with `wordCount: 2.5` yields a stored integer `3`).

*(All six landed as commit `10d30c7`, pushed. One verification note: while testing the
wordCount fix, this preview environment served a stale cached copy of `state.js` across
several reload attempts on the same port — confirmed via direct `curl` against the
server and a diff against a fresh origin/port that the *served* file was always correct;
the caching was specific to the browser preview tool, not a real app or server issue.)*

### Fixed (round three — the last three, analytics/print-only)

- `[x]` **Milestone counters were cross-project** *(low, analytics-only)*. A single
  global baseline, snapshotted only the first time any project was ever opened, meant
  opening a second project compared ITS scene count against the first project's
  baseline — counts could go negative or skip past 1/5 depending on which project
  happened to be open. `ensureProjectMilestoneBaselines()` ([tracking.js](tracking.js))
  now snapshots a baseline per project, the first time each one is opened (wired into
  `openProject()`), so the count is scoped to "scenes added to this project" regardless
  of how many others exist (verified live: opening two different sample projects shows
  each with its own independent baseline matching its own scene count, and adding a
  scene to one correctly shows count=1 with no cross-contamination from the other).
- `[x]` **A corrupt report counter stuck at `"NaN"` forever** *(low, analytics-only)*
  ([reports.js:89](reports.js#L89)) — falls back to 0 when the stored value isn't finite
  instead of incrementing NaN and writing the literal string back (verified live: a
  manually corrupted counter recovers to 1 after calling the real `generateReport()`,
  no exception thrown).
- `[x]` **Matrix report chunked columns by screen width, not paper width** *(low)*
  ([reports.js:341](reports.js#L341)) — used a fixed ~720px estimate of a portrait
  Letter/A4 page's usable width instead of the popup window's on-screen
  `document.body.clientWidth`, which had no relationship to the physical printed page
  (verified: the generated report's inline script now contains `var pageW = 720`
  unconditionally, regardless of window size at generation time).

*(All three landed as commit `cc531d7`, pushed. This closes out every finding from the
third full-app audit — nothing remains open from §8.)*

### Verified clean (for coverage)

XSS: hostile scene titles injected live came out escaped in every report type and chart
tooltip; `rptEsc` correct including the `</script>`-breakout case. All 6 pages load with
zero console/CSP errors; no inline handlers/scripts have crept back; every
`getElementById` in charts.js/editor-init.js/backup.js resolves; no global name
collisions; `build.js` order matches editor.html. External payloads (Formspree/GA) carry
no scene content; `anonymize_ip` set; failures handled. pushHistory→mutate→recordDataEdit→
saveState ordering verified across all editor CRUD paths; rename/delete propagation
(including character→`scene.povs`) correct; no `==` id comparisons; `S.editingId`/
`S.selIds` cleaned up on delete and undo/redo; section-delete filter cleanup (§6) intact.
Efficiency: nothing worth flagging at 300-scene scale.

*(Fixes in §8 landed on `feature/updates_v3`, pushed; open items above are the backlog.)*
