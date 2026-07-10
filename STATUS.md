# Current Status

As of July 7, 2026:

## Notes
strip_AI branch: removed all AI features (Analyze Story menu item, AI panel with Analysis/Chat tabs, ai.js, chat.js, and related state/CSS) so the app ships without them for now — to be reintroduced later. Also hardened the app: CSP meta tags on all pages, stricter JSON import validation, and cleanup of leftover AI localStorage keys.

## feature/flow_visual branch — Scene Flow Chart

Adds a "Scene Flow Chart" view: an alternate rendering of the Scene Board as a continuous
ribbon (snake or circle layout) instead of cards. Toggle via **Alt+V**, the **View menu**
("Show/Hide Scene Flow Chart"), or the Board-view ✕ button inside the chart toolbar.
Built against `CHART_FEATURE_SPEC.md` (also on this branch) — read that file first for the
full design rationale; this section is the implementation/status summary.

**New file:** `charts.js` (all chart logic — loads after `ui.js`, before `editor.js`, and is
registered in `build.js`'s `JS_FILES` in that same position).
**Touched files:** `editor.html` (chart-host DOM + View-menu item + script tag),
`editor.js` (one guard line at the top of `renderBoard()`, Alt+V handler, Escape handler),
`styles.css` (new `SCENE FLOW CHART` banner section at the end), `build.js`.

### How it works
- `chartMode` (bool) and `chartType` ('snake'|'circle') are module-level state in
  `charts.js`. `chartType` persists via `loadGlobalPrefs()/saveGlobalPrefs()`; `chartMode`
  does not (every project open starts in board view).
- Entering chart mode hides `#sbscrl`/`#sbemp` and shows `#chart-host`, then calls
  `renderChart()`. The single hook `if (chartMode) { renderChart(); return; }` at the top
  of `renderBoard()` means every existing code path that already calls `renderBoard()`
  (library clicks, search, section filter, add/edit/delete scene, undo/redo) transparently
  keeps the chart in sync — no new event wiring needed anywhere else in the app.
- Both chart types build ONE invisible centerline (`<path>` for snake, `<circle>` for
  circle), measure it with `getTotalLength()`, then clone it once per scene and slice each
  clone via `stroke-dasharray`/`stroke-dashoffset` (see `addSegments()`). This is why
  segments follow curves for free and each one is its own clickable/hoverable DOM node.
- Section boundaries render as small lettered badges (A, B, C…) rather than full text
  labels — the labels-on-ribbon approach was tried first and scrapped for being cluttered
  and clipping at the snake's screen edges. Badges link two-way with a legend row under the
  toolbar (hover a badge → tooltip + legend highlight; hover the legend → badge highlight).
  The circle view uses a different, later-added scheme: a plain pie chart drawn inside the
  ring (only when 2+ sections exist), each wedge labeled with its section name directly, no
  legend needed for circle.
- Highlighting reuses the board's existing `sceneMatchesLib()`/`sceneMatchesSearch()` — the
  chart adds no new matching logic, just its own visual treatment (accent stroke + `--ontx`
  number text for matches, 0.45 opacity for non-matches when a filter is active).
- Print serializes the current `<svg>`, walks it resolving every `var(--x)` in
  stroke/fill/style to its computed value (the print window has no theme stylesheet), and
  hands the result to the existing `openReportWindow()`.

### Known non-obvious fixes worth knowing about if you touch this code
- `#chart-host` and `#chart-scroll` need `min-height:0` — they're flex children of a column
  flexbox and default to `min-height:auto`, which lets them grow past the panel instead of
  scrolling. (`#sbscrl` already had this for the board; the chart elements didn't at first.)
- The snake SVG width must subtract the `#chart-canvas` padding (20px each side) or the
  chart area always carries a 40px phantom scrollbar even when content fits.
- A resize listener alone doesn't catch panel collapse/expand or panel-resize drags (they
  don't fire `window resize`) — there's a `ResizeObserver` on `#chart-scroll` for that,
  debounced 150ms, keyed on last-rendered size to avoid redundant re-renders.
- A pie wedge spanning the full 360° (one section holds every scene) has coincident SVG arc
  endpoints and renders as nothing — clamped to 359.9°.
- Dash `GAP` (3px divider between segments) is capped at `segLen/3` so it can't go negative
  when there are many scenes packed into a small ring.
- `build.js`'s `JS_FILES` placement for `charts.js` deliberately does NOT match what
  `CHART_FEATURE_SPEC.md` §11.5 literally says (it says "between projects.js and main.js",
  which would put it after `editor.js` and break the `chartMode` guard) — this was a spec
  self-contradiction, resolved in favor of the explicit hard requirement elsewhere in the
  spec that `charts.js` load before `editor.js` in both HTML and build order.

### Explicitly deferred / not done
- §10 of the spec (an optional "Section colors" toggle for the neutral/resting state) was
  skipped per the user's instructions — the chart is neutral-by-default with no plan to add
  this unless requested.
- Segments are mouse-only; no keyboard navigation between them (matches spec's v1 scope).
- The Scene Board header's Zoom slider and "Show Card Details" checkbox remain visible but
  inert while the chart is open (they only affect the card view). Not fixed — flagged as
  optional polish, not a bug.

### Verification
Manually tested against the spec's full checklist (§12) in-browser: all 5 themes, both
chart types, library/search highlighting (OR/AND), section filter, add/delete/undo/redo
live-updating the chart, click-to-board-and-select, hover tooltips (including XSS-safe
scene titles), resize/panel-collapse re-layout, print in both chart types, Escape/Alt+V/
View-menu-label round trip, and a full-app regression (reports, import/export, console
clean). No automated test suite exists for this app — all verification was manual via the
Claude Code browser preview tool.

### Not yet done
- Not merged to `main` or pushed to `origin` — still local-only on `feature/flow_visual`.
- No entry point from other pages (projects.html etc.) — chart view only exists inside
  `editor.html`, which is correct per spec (it's a Scene Board view mode, not a global
  feature), just noting it so it's not mistaken for an oversight.
main currently includes strip_AI branch and that was pushed to the release branch

Going forward, experiment with new features in branches, push to main when ready to merge, and only push to release branch (and tag) when I want it to be the published version at scenesetterapp.com (it will automatically be served there because Pages reads from release branch)

## feature/updates_v1 branch — Backup reminder

Adds a passive "Backed up N ago" status indicator (in the editor header) plus a
dismissible/re-appearing banner nudging the user to export a backup once it's overdue —
either **25 edits** or **15 minutes** since the last export, whichever comes first. Export
itself is unchanged (still the existing manual JSON download); this only reminds the user
to click it. Deliberately does NOT use the File System Access API (Chromium-only) so
behavior is identical across all browsers.

**New file:** `backup.js` (loads right after `state.js`, before `reports.js` — needs `S`/
`currentProjectId` but nothing from other files at parse time; registered in `build.js`'s
`JS_FILES` in that position).
**Touched files:** `state.js` (new `lastExportedAt`/`editsSinceExport` fields on `S`,
persisted in `saveState()`/`loadState()`; `recordDataEdit()` now also bumps
`editsSinceExport`), `projects.js` (`exportProjectJSON()` resets both fields — in storage
always, and on the live `S` object when exporting the currently-open project;
`updateProjectNameDisplay()` calls `refreshBackupStatus()`), `editor.html` (`#backup-status`
span in the header, `#backup-banner` above `.main`), `styles.css` (banner + indicator
styles), `build.js`.

### How it works
- `S.editsSinceExport` increments in `recordDataEdit()` — the same funnel already used by
  every real content edit (add/delete/edit scene, undo/redo, library edits). No new call
  sites needed: `saveState()` → `updateProjectNameDisplay()` → `refreshBackupStatus()`
  already fires after every one of those.
- `S.lastExportedAt` is set (and `editsSinceExport` reset to 0) only in `exportProjectJSON()`,
  which writes both fields back into the project's stored localStorage blob directly —
  it works whether the project being exported is open in the editor or just a card on the
  projects grid, since that function doesn't go through the live `S` object at all except
  when `id === currentProjectId`.
- `backupIsOverdue()` is the single source of truth for "should the banner show": true when
  `editsSinceExport >= 25` OR `(now - lastExportedAt) >= 15min` (only once there's at least
  one edit pending — an untouched project never nags regardless of elapsed time).
- Dismissing the banner snoozes it for 5 minutes rather than hiding it for the rest of the
  session — a 30s interval re-checks and re-shows it if still overdue once the snooze
  expires (the "keeps coming back until you export" behavior the user asked for).
- A `beforeunload` handler warns on tab close/navigate-away while overdue, using the same
  `backupIsOverdue()` check — the browser's native "leave site?" prompt, not a custom one.
- Legacy projects saved before this feature existed get `lastExportedAt` defaulted to their
  existing `lastDataEditAt` (or now, if neither exists) on load, so old projects aren't
  retroactively flagged as stale the moment this ships.

### Known non-obvious details
- `.backup-status` needs the same `overflow:hidden;text-overflow:ellipsis` as `.pn-time` —
  the header is only ~50px tall and can show 3 stacked lines (title, last-update, backup
  status) at once; missing this caused raw mid-word text clipping instead of an ellipsis
  (caught and fixed during verification).
- `refreshBackupStatus`/`exportCurrentProject` etc. are referenced across files via
  `typeof x === 'function'` guards (matching the defensive pattern already used for
  `chartMode`/`closeChartView` in `charts.js`/`editor.js`), since `backup.js` has no
  reason to assume every page that loads it also has the banner DOM present.

### Verification
Manually tested in-browser: indicator shows correct relative time and color state (neutral/
amber/red) at 0, mid-range, and overdue edit counts; banner appears at both the edit-count
and time-elapsed thresholds independently; Export Now button resets state and hides the
banner; dismiss snoozes and the banner reappears once the snooze window passes; verified in
both a light (ivory) and dark (slate) theme; console clean throughout. Did not verify the
`beforeunload` prompt itself (browser-native dialogs aren't automatable), but the underlying
`backupIsOverdue()` condition it depends on was directly verified.

### Not yet done
- Not merged to `main` or pushed to `origin` — still local-only on `feature/updates_v1`.
- No UI to adjust the 25-edit / 15-minute thresholds — hardcoded constants at the top of
  `backup.js`, per the user's specified values.
