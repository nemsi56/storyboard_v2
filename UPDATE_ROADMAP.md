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
- `[~]` **Escape key cascades every close/clear handler at once.**
  [editor.js:1592](editor.js#L1592): pressing Escape to close one modal also clears card
  selections, library highlights, and search in the same keystroke. *Partially improved by
  the merge:* the `cancelEdit` path now goes through `maybeCancelEditWithConfirm()`, so a
  dirty edit is no longer silently discarded. The rest of the cascade remains a product
  call, not necessarily a bug.

## 3. Efficiency (not urgent at current scale, worth knowing)

- `[ ]` **`sceneDisplayNum()` recomputes the full ordered list on every call.** It's called
  once per card per render, and again per chart segment/tooltip — each call rebuilds the
  unassigned+section-ordered array from scratch. Fine under ~100 scenes; compute an
  id→number `Map` once per `renderBoard()`/`renderChart()` pass and reuse it.
- `[ ]` **Card drag re-renders the whole board on every pointer-move.** `moveCardDrag()`
  calls `renderBoard()` (full innerHTML wipe + rebuild) on every drop-target change during a
  drag. Toggling drop-indicator classes on existing DOM nodes instead would scale much
  better past a couple hundred cards.
- `[~]` `hist.MAX = 10` ([state.js:165](state.js#L165)) — undo depth is shallow relative to
  how cheap each snapshot is. Raising it to 50 costs little. Low priority, quality-of-life
  only.

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
- `[~]` **Custom POV names are permanent by design** — there's no UI to delete a typo'd
  name from `S.povCustomNames`; it stays a checklist option forever (it only leaves the
  Library panel, which lists used names only). Matches the documented "permanent, reusable"
  intent in `FEATURE_ROADMAP.md` §5, but a typo path may eventually warrant a remove
  affordance. Flagging as a product call, not a bug.
