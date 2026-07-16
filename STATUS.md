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
- No UI to adjust the 25-edit / 15-minute thresholds — hardcoded constants at the top of
  `backup.js`, per the user's specified values.

*(Update: `feature/updates_v1` has since been merged to `main` via PR #9.)*

## feature/updates_v2 branch — Chart margin fixes & sample-seeding race fix

Two follow-on bugs surfaced after a prior commit on this branch (`59a256d`, "Tighten flow
chart margins so more of the window is used") tightened the snake/circle charts' padding —
plus an unrelated data-integrity bug found while investigating a live report of duplicated
projects.

### Snake chart width utilization
`computeSnakeLayout()` ([charts.js:267](charts.js#L267)) sizes each row's width (`run`) to
hit a ~110px/scene target total path length, not to fill the container. Whenever that
target didn't divide evenly across the chosen row count, `run` came out short of the actual
available width (`runLen`) — dead space on the right of every row, while the fixed-width
left margin stayed correctly tight. This asymmetry existed before the margin-tightening
commit too, but the old, larger margins mostly hid it. Fix: once row count is settled, set
`run = runLen` to fill the available width.

### Snake chart curve clipping
Separately, the horizontal margin (`M = r + 12`) only cleared the turn's centerline arc, not
the ~34px-thick stroke `addSegments()` draws along it — that stroke's outer edge at the tip
of each turn extends `stroke-width/2` (17px) further out than the centerline, which with
only 12px of margin landed past the SVG's bounds and got clipped by its default
`overflow:hidden`. Visible as both turn caps reading "cut off" on every row, independent of
the width-utilization bug above (fixing one didn't fix the other — confirmed by a user
report that persisted after the first fix shipped). Fix: introduced a named
`SNAKE_SEG_THICKNESS` constant and size the margin as
`r + CHART_PAD + SNAKE_SEG_THICKNESS / 2`, so it clears the stroke's actual painted extent.

**Verification note:** `getBBox()`/`getBoundingClientRect()` do not reflect stroke width in
the Claude Code browser preview tool used for verification — confirmed with a minimal
repro (a straight line, `stroke-width: 40`, reported bbox width `0`). Both fixes were
instead verified by rasterizing the rendered `<svg>` to a `<canvas>` and reading painted
pixel boundaries directly: old margin left the curve's paint ~6px from the SVG edge (reads
as "cut off"); the fix gives a symmetric ~23-24px on both sides at the same window width.
The width-utilization fix was verified by asserting `computeSnakeLayout()`'s returned `run`
equals the computed `runLen` across scene counts from 2 to 39 and several window widths.

### Sample-project seeding race condition
`ensureSampleProjects()` ([projects.js:604](projects.js#L604)) only persisted the
`samplesSeeded` flag after its sample-file fetches resolved. Two `projects.html` loads
racing before that write landed (two tabs opened at once, a fast reload) would each read the
flag as unset and seed their own copy of both samples — a live user report showed exactly
2× "Pride and Prejudice" and 2× "The Count of Monte Cristo". Fix: claim a short-lived,
timestamped `samplesSeeding` lock synchronously before starting the async fetches, so a
concurrent load backs off instead of re-seeding; falls back to retrying on the next visit if
the lock goes stale. Verified by extracting the old and new function bodies and racing two
concurrent calls against a cleared `localStorage`: old code produced 4 project entries, new
code produced 2.

### Not yet done
- Not merged to `main` — pushed to `origin/feature/updates_v2`, PR not yet opened.

## feature/updates_v2 branch — Full-app audit fixes & CSP hardening

A fresh ground-up audit of the whole app (not a follow-up to a specific bug report),
covering every `.js` file plus the XSS/CSP/localStorage/external-endpoint surfaces across
all HTML pages. See `UPDATE_ROADMAP.md` §6 for the full per-bug technical detail; this is
the higher-level summary of what changed and how it was verified.

### What the audit found and fixed
Four real bugs (import validation gap that could crash the board on a corrupted file,
reports silently dropping scenes with an orphaned `sectionId`, a filtered-then-deleted
section blanking the whole board, section color changes having no undo entry), one
perf issue (report generation rebuilding the full scene-number map once per scene instead
of once per report — same anti-pattern already fixed elsewhere), and one data-safety gap
(the "Update Local Copy" import dialog could overwrite unexported local edits with no
warning, since `revision` counts saves rather than content edits).

### CSP hardening
The remaining item was removing `'unsafe-inline'` from every page's CSP `script-src`. This
turned out to be a two-part job:
1. Convert every inline event-handler attribute (`onclick=`, `onchange=`, `oninput=`,
   `onmouseenter=`, etc. — ~140 call sites across `editor.html`, `projects.html`,
   `overview.html`, `test.html`, and the projects-grid card template in `projects.js`) to
   `addEventListener` wiring. All were static, literal calls with no interpolated data, so
   this was a mechanical CSP-compliance transform, not an XSS fix in itself. Delegated to
   two parallel subagents (editor.html being the bulk of it, everything else in the
   second), then independently verified.
2. Realized partway through that step 1 alone wasn't sufficient: a CSP without
   `'unsafe-inline'` blocks inline `<script>` *blocks* just as much as inline attributes —
   and the wiring from step 1, plus some pre-existing inline scripts (overview.html's
   image-modal logic, test.html's whole test runner), were themselves inline blocks. Moved
   all of it into four new files: `editor-init.js`, `projects-init.js`, `overview-init.js`,
   `test-init.js`. Also added a CSP meta tag to `test.html`, which previously shipped with
   none despite going to production alongside the app.

### Known non-obvious things worth knowing about if you touch this code
- This environment's browser-automation click tool does not reliably dispatch real click
  events on some elements (confirmed unrelated to the code changes — direct function calls,
  the native `.click()` DOM method, and a manually-dispatched full `pointerdown`/
  `mousedown`/`pointerup`/`mouseup`/`click` event sequence at the identical coordinates all
  triggered the listener correctly when the tool's own click did not). All interactive
  verification for this round was done via the manually-dispatched event sequence instead.
- A first attempt at extracting editor.html's inline script left duplicate content in the
  file (a botched edit tried to insert `</body></html>` mid-file instead of replacing
  through the end) — caught immediately via `wc -l`/`tail` before it was ever committed.
- `test.html`'s inline test suite has never actually loaded any of the app's own JS files
  (no `<script src="config.js">` etc., confirmed present in `git show HEAD:test.html` before
  this round's changes too) — its "0 passed, 17 failed" result predates this work and is
  unrelated to the CSP change; every failure is `<name> not defined` because the globals
  it's testing for were never loaded on that page to begin with.

### Verification
On a fresh, uncached origin (a new port, to rule out the disk-cache issues encountered
earlier in this project): zero remaining inline handlers or inline `<script>` blocks
(grepped), zero console/CSP-violation errors across all 6 pages on load, and a full
functional pass — menu bar (toggle + hover-to-switch), theme switching, panel collapse/
expand, scene creation through the real form, chart view toggle + type switch, report modal
open + type switch, the projects-grid card actions (Open/Rename/Duplicate/Export/Delete,
including per-card closure correctness so each button acts on the right project id), the
overview image-enlargement modal, and a re-verification that the section-filter-delete and
section-color-undo fixes from earlier in this branch still work correctly after the
markup restructuring.

### Not yet done
- Not merged to `main` — pushed to `origin/feature/updates_v2`, PR not yet opened.
- `build.js`'s `JS_FILES` list was not updated to include the four new `*-init.js` files —
  left out deliberately, since (per `build.js`'s own comment) that bundle isn't actually
  used in deployment, and the new files aren't written defensively enough to be safely
  bundled alongside pages that lack their expected DOM elements.

## feature/updates_v2 branch — Second audit: drag-and-drop, keyboard, CSP re-verification

A follow-up to the audit above, this time targeting the areas it covered lightly (drag-and-
drop, keyboard shortcuts, panel resize/zoom) plus an independent re-verification of the
`*-init.js` CSP migration. Three parallel passes, all findings re-verified against source
before anything was fixed.

### CSP migration re-verification — all clean
A second, independent pass over the `*-init.js` wiring and the wider CSP/global-scope
surface, specifically checking things the first audit's verification didn't explicitly
enumerate:
- Every `getElementById` id referenced by the four `*-init.js` files resolves in its page
  (91/93 — the 2 "misses" are intentional `!!document.getElementById(...)` feature-detection
  probes in `test-init.js` checking whether the current page is the editor or projects page,
  unchanged from the pre-migration inline script).
- Every function referenced by the four files resolves in a script that page actually loads
  (69/69).
- No element gets the same event wired twice (once via an `*-init.js` file and again inside
  `editor.js`/`projects.js`/etc.).
- Every inline handler removed by the CSP migration has a verified-equivalent
  `addEventListener` call (same function(s), same order for multi-statement handlers,
  correct event-type translation).
- No top-level `function`/`const`/`let`/`var` name collisions across the 12 scripts sharing
  one global scope.
- CSP meta tag byte-identical across all 6 pages; `'unsafe-inline'` confirmed absent from
  every `script-src` (present only in `style-src`, which was always out of scope).
- One pre-existing, harmless duplicate id (`hdr-spacer` in `editor.html`, lines 21 and 27)
  confirmed unchanged from before this branch's work — only `styles.css`'s `#hdr-spacer`
  selector touches it, and CSS doesn't require id uniqueness to apply a rule, so this has no
  functional effect. Not worth fixing now, but flagged in case it's ever a source of
  confusion.

### Drag-and-drop and keyboard fixes
Five bugs found and fixed in `editor.js`:
1. **Ctrl+Z/Ctrl+Y hijacked a text field's own native undo.** The undo/redo branch fired
   before the `!inInput` guard that already protected export/zoom — typing in a scene's
   Summary and pressing Ctrl+Z to fix a typo reverted an unrelated board action instead of
   the typo. Moved undo/redo behind the same guard.
2. **Undo/redo could fire mid-drag.** Folded into fix 1's guard: also requires
   `!drag.on && !ld.on && !sld.on`, since undo's `renderBoard()` re-render out from under an
   active drag left the eventual mouseup committing a reorder against post-undo state and
   wiping the redo stack.
3. **A drag stuck forever if the mouse button was released outside the browser window** —
   no `mouseup` ever reaches `document` for an outside release, so the ghost card stayed
   attached to the cursor and the *next unrelated click* would silently commit a
   reorder/reassignment wherever the cursor happened to be. Fixed by checking
   `e.buttons === 0` at the top of the global `mousemove` handler, so any stray movement
   after re-entering the window self-heals every drag state (card, library-item,
   section-list, panel-resize) without committing anything.
4. **Multi-select drag could move a scene hidden by the section filter.** Selecting two
   scenes across two sections, filtering to just one, then dragging the visible card would
   silently drag the hidden one along too (`S.selIds` isn't pruned by the filter). Fixed by
   filtering the drag set down to scenes whose card is actually rendered at drag-start.
5. **Ctrl+Shift+E (export) was Caps-Lock-dependent.** It tested `e.key === 'E'` instead of
   `e.shiftKey` — Caps Lock makes a plain Ctrl+E false-trigger export, and makes the real
   Ctrl+Shift+E silently fail (Shift cancels the Caps Lock inversion, producing lowercase
   `e.key`). Fixed to check `e.shiftKey && e.code === 'KeyE'`.

Plus one from the Escape-key comparison: **Alt-letter shortcuts fired underneath an open
confirmation modal** (Escape's `ESCAPE_ACTIONS` already had full modal-tier awareness; the
Alt+N/C/L/T/M/R/V branch only checked `!inInput`). Added a shared `anyModalOpen()` helper
(same 9 overlay ids `ESCAPE_ACTIONS` treats as the modal tier) and gated the Alt-shortcut
branch on it.

### Verification
Since this environment's native `<input type=color>` interactions aren't scriptable via
clicks, and drag interactions are timing-sensitive, verification for this round leaned
heavily on directly dispatching the same event sequences a real interaction produces
(`pointerdown`/`mousedown`/`mousemove` with the right `buttons`/`clientX`/`clientY`/
`ctrlKey`/`shiftKey`/`code`, `KeyboardEvent`s with explicit `code`) and asserting on both the
resulting app state and (for the drag/undo guards) that legitimate/unrelated cases still
work exactly as before:
- Ctrl+Z confirmed blocked with focus in a text field, confirmed blocked with `drag.on`
  true, and confirmed still fires normally in neither case (regression check).
- Ctrl+E/Ctrl+Shift+E confirmed correct under both simulated Caps-Lock scenarios.
- A full card drag was started, then a `mousemove` with `buttons: 0` dispatched (simulating
  re-entering the window after releasing outside it) — confirmed all drag state clears, the
  ghost hides, and `S.scenes`' order/count are provably unchanged (no silent commit). Same
  check repeated for a stuck library-item drag with a pending, uncommitted reorder.
- Two scenes across two sections selected, filtered to one, dragged the visible one —
  confirmed only the visible scene entered `drag.ids`.
- Alt+N confirmed blocked (via spying on `menuNewScene` directly) while a section-delete
  confirmation was open, and confirmed to fire normally once the modal was closed.

### Not done
Assessed as low-value polish, not necessary: dropping a card/library item/section back into
its exact original position still pushes an undo-stack entry and a `saveState()` call, since
the existing no-op guard only checks `dropIdx !== fromIdx` rather than whether the actual
resulting order differs (a same-index-but-not-same-order case is possible and was traced
through by hand). Self-contained to `endCardDrag()`/`endLibDrag()`/`endSecListDrag()`,
independent of everything else on this branch — safe to pick up anytime it's worth the
~20-30 minutes.

### Not yet done
- Not merged to `main` — pushed to `origin/feature/updates_v2`, PR not yet opened.

## feature/updates_v3 branch — Chart segments sized by word count

Adds a "Show relative word count" toggle to `#chart-toolbar` (both snake and circle
charts) that sizes each scene's segment proportionally to `scene.wordCount` — an existing,
previously-unused field on scenes — instead of splitting the path evenly. Full design
rationale is in `CHART_FEATURE_SPEC.md` §14; this is the implementation/status summary.

**Touched files:** `charts.js` (all the layout/tick/tooltip/legend logic), `editor.html`
(toolbar button), `editor-init.js` (click wiring), `styles.css` (tooltip line + legend
swatch styles).

### How it works
- `computeSceneLayout(scenes, total)` is the one function that decides per-scene
  `{len, offset}` along the centerline — every place that used to compute `total/N`
  (`addSegments`, `addSnakeNumbers`, `addSnakeSectionMarkers`, `addCircleNumbers`,
  `drawCirclePie`) now reads from its output instead. With the toggle off it returns the
  original uniform split unchanged, so existing behavior is a strict subset of the new code
  path, not a fork of it.
- Missing `wordCount` (0 treated as unset) falls back to the average of scenes that do have
  one — deliberately not a fixed default and not a minimum-size floor, since averaging
  renders a missing value as "typical size" with no extra layout math (no clamp-and-
  redistribute needed the way a minimum-floor approach would require). If nothing in the
  set has a wordCount, every weight is 1 and the layout is byte-for-byte the toggle-off
  case.
- An averaged-in ("estimated") scene gets a short red (`var(--rd)`) tick drawn just outward
  from its own scene-number position — both `addSnakeEstimatedTicks` and
  `addCircleEstimatedTicks` compute it at the *same* offset the number is drawn at
  (`offset + len/2`), then push it out along the segment's normal/radial direction so it
  lands beside the digit rather than under it.
- Tooltip and legend both read a module-level `lastAvgWordCount` (set inside
  `computeSceneLayout`) — the tooltip labels an estimated scene "~N words (estimated)",
  and the legend gets one extra entry, but only when `sceneSetHasEstimated()` finds a
  genuine mix of known/unknown in the currently rendered scene set (an all-known or
  all-unknown set shows nothing extra — there's nothing to distinguish).

### Known non-obvious fixes worth knowing about if you touch this code
- The tick was first implemented as a full-width perpendicular line crossing the ribbon at
  the segment's leading edge — visually it read as a spurious extra segment divider (user
  feedback, confirmed against a reference screenshot). Redesigned to a short mark anchored
  to the number's own position instead, colored red so it doesn't compete with the
  segment's own fill/stroke color states (filter-match/dim/plain — see `applySegColor`).
- That first revision (still full-width, but repositioned to the segment's leading edge
  instead of its midpoint to avoid the number) is what caused the numbers to visually
  disappear on estimated segments during initial testing — the tick and the number were
  both drawn at the exact same midpoint, and the tick (drawn after, so painted on top)
  covered the digit. Not a bug in the final version, but worth knowing if the draw order or
  position of either one changes again.
- Circle-chart section-pie boundaries (`drawCirclePie`) had to move from index-counted runs
  (`run.count` scenes = `count * 360/N` degrees) to offset-tracked runs (`run.end` in path
  units, converted via `/ total * 360`), since a run of consecutive same-section scenes no
  longer spans a fixed number of degrees once segment widths vary.

### Verification
Manually tested in-browser against a sample project (39 scenes): mixed known/null/zero
word counts confirmed correct proportional widths on both chart types; toggle off reduces
to a single uniform `stroke-dasharray` across all segments (asserted via DOM query, not
just visual); an all-unset set and an all-known set both correctly produce zero tick marks
and no legend entry; tooltip shows the real count or the estimated label; legend entry
appears only for a genuine mixed set; verified legible in both a light (ivory) and dark
(slate) theme. No wordCount test data or theme changes were left in the sample project
(confirmed via the project's unchanged "Modified" timestamp) since none of it went through
`saveState()`.

### Not yet done
- Not merged to `main` — pushed to `origin/feature/updates_v3`.

## feature/updates_v3 branch — Third full-app audit & data-safety fixes

A two-part audit of the whole app in its `updates_v3` state (see `UPDATE_ROADMAP.md` §8
for the complete per-item detail; this is the summary). First pass: the new word-count
chart code plus the files earlier audits covered lightly (reports.js, backup.js, ui.js,
tracking.js, state.js save/load). Final pass: the fixes themselves plus editor.js's
remaining ~1400 lines (forms, section/library CRUD, modals, selection), which §7's audit
had only covered for drag-and-drop/keyboard.

### What was found and fixed (commits `2ebbfe8`, `4432c10`, `e7f7192`)
- **High:** a corrupt/unreadable project opened as an empty, saveable session, and the
  first save overwrote the stored blob — permanent data loss from possibly-recoverable
  data. `openProject()` now checks `loadState()`'s return and bounces to the project list
  with the stored blob untouched.
- **Medium ×5:** non-quota storage failures were completely silent (edits silently
  in-memory only) while quota failures alerted on *every* edit — both now alert once per
  session; `loadState()` could leave `S` half-populated on a mid-parse exception — its
  catch now resets cleanly; a character and a custom POV name sharing one name rendered
  as duplicate POV checkboxes and mis-wired the custom-name edit/delete handlers onto a
  character row — `confirmAdd` and `saveLibEdit` now check `S.povCustomNames` the way
  `confirmPovAdd` already checked `S.characters` in the other direction; a stale
  `pendingInsert` anchor from an insert-zone click survived a detour through Create > New
  Scene or into Edit mode, letting a later, unrelated Add Scene splice into an abandoned
  position — both entry points now clear it; hovering an open menu's own title button
  (after dipping into its dropdown) closed the menu instead of leaving it open —
  `hoverMenu` now only switches when the hovered menu differs from the one already open.
- **Low ×2:** negative word counts could be typed/pasted/imported and persisted invisibly
  (now clamped at form entry, on load, and on import via a shared rule); the printed
  chart's legend didn't explain the red "estimated" tick (now it does).

### How it was verified
Live in the browser against the real code paths, not just by reading: reproduced the
corrupt-project overwrite before the fix and confirmed the stored blob survives after;
injected XSS payloads through every report builder (escaped everywhere); simulated three
consecutive storage failures (exactly one alert); entered "-500" into the word-count
field before and after; drove the actual `confirmAdd`/`saveLibEdit` collision paths (not
just the guard logic) and confirmed both block with the input reselected; set
`pendingInsert` and called `menuNewScene()`/`openEditMode()` directly to confirm each
clears it, then re-ran the legitimate insert-zone flow to confirm no regression; hovered
back across an open menu's own title button (the exact repro sequence) and confirmed it
stays open, then hovered a different menu button and confirmed switching still works.
All test artifacts (corrupt test project, test scenes, test library items) were confirmed
removed from localStorage afterward.

### Round two (commit `10d30c7`): six more low-severity fixes
- `renderPovCk`'s legacy-POV-name fold now persists immediately instead of living only
  in memory until an unrelated later save happened to catch it.
- Cancelling the section color picker (an `input` preview with no following `change`)
  now reverts the color and pops the phantom undo entry on blur, instead of stranding an
  unsaved preview color and silently consuming the next real change's undo entry.
- `quickSetup` no longer pushes a no-op undo entry when every generated section name
  already exists; the undo label reflects the real count on a partial collision.
- Removed `resetAll` — confirmed dead code, zero call sites anywhere in the repo.
- A click on another scene card while an edit form is dirty no longer also toggles that
  card's selection underneath the discard-confirm dialog.
- `wordCount` is now normalized (null unless a positive integer, via a shared
  `normalizeWordCount()`) on both load and import, so a non-integer value from a
  hand-edited or future-version file can no longer mismatch the Edit form's integer-only
  `parseWordCount()` and read as dirty the instant the scene opens.

All six verified live (each original issue reproduced first, then confirmed fixed,
including the legitimate/non-broken paths for each). One tooling note: this preview
environment cached a stale copy of `state.js` across several reload attempts on the same
port while verifying the wordCount fix — confirmed via direct `curl` against the running
server, and by cross-checking against a fresh origin/port, that the server was always
serving the correct file; this was a browser-preview-tool caching artifact, not a real
app or server bug.

### Round three (commit `cc531d7`): the last three, analytics/print-only
- Milestone scene/section counters used one global baseline snapshotted only the first
  time any project was ever opened, so a second project's count compared against the
  first project's baseline instead of its own — counts could go negative or skip past
  1/5 depending on which project happened to be open. Now snapshots a baseline per
  project the first time each one is opened.
- A corrupt/non-numeric stored report counter parsed to NaN and got written back as the
  literal string `"NaN"`, permanently disabling the 3rd-report milestone. Now falls back
  to 0 when the stored value isn't finite.
- The matrix report's print-pagination chunked columns to the popup window's current
  on-screen width instead of the physical printed page's usable width. Now uses a fixed
  ~720px estimate for a portrait Letter/A4 page.

Verified live: two sample projects opened side by side show independent baselines and
counts with no cross-contamination; a corrupted report counter recovers to 1 (not "NaN")
when the real `generateReport()` runs; the matrix report's generated script now contains
a fixed `pageW` regardless of window size.

This closes out every finding from the third full-app audit (`UPDATE_ROADMAP.md` §8) —
nothing remains open from it.

### Delegation note
Mechanical sweeps (CSP/id-reference/global-collision/localStorage-key/build-order
regression checks) and the first-pass file reviews were delegated to subagents; every
finding they reported was independently re-verified against source — and reproduced live
where feasible — before being fixed or logged. Two subagent-reported claims were
corrected in the process (a report-builder "error" that was the test harness's own wrong
calling convention, and a garbled storage-key name in an otherwise-correct inventory).

### Not yet done
- Not merged to `main` — pushed to `origin/feature/updates_v3`.
- The 12 open audit items above (tracked in `UPDATE_ROADMAP.md` §8).

## feature/updates_v3 branch — "Your Data & Backups" messaging rework

User-requested rework of the "Working Across Devices" box on the Projects, Overview, and
Tutorial pages — the original one-paragraph copy conflated "why backups matter" entirely
with cross-device syncing, and gave no indication that a project just persists on its own
without needing to import anything. Iterated on the copy live with the user (several
rounds) before touching any file, per their request to see it first.

### What changed
- Retitled the box **"Your Data & Backups"** (from "Working Across Devices") on
  `overview.html` and `tutorial.html`, since the content is broader than cross-device use.
- Rewrote the body as a short lead paragraph + three bullets, making explicit: (a)
  projects persist automatically in this browser — closing the tab and coming back later
  needs no import, (b) backups matter because browser storage itself is fragile (clearing
  cache, a browser issue) — not only because of syncing, and (c) export/import and the
  timestamp-conflict-detection safety net, condensed to one bullet each.
- **Projects page**: dropped the full banner entirely. Added a small text link — "Learn
  about your data and backups" — next to the toolbar, opening `tutorial.html#data-backups`
  in a new tab (an anchor id added to the same box there). First built as a "?" icon
  button (styled like the existing `#help-btn`); changed to a plain underlined text link
  after the user flagged that a bare "?" didn't communicate what it was for.
- Renamed the "Import JSON" button to **"Import project (JSON file)"** for clarity, and
  fixed the one other place (a Tutorial step) that still referenced the old label.
- While updating the Tutorial's Scene Flow Chart section for the "Size by Word Count"
  toggle (which had no user-facing docs since it shipped — see the "Chart segments sized
  by word count" section above), also fixed a stale "Undo/Redo: up to 10 steps" line
  (raised to 50 in an earlier fix; the docs never caught up).

### Verification
Manually verified in-browser: no leftover "Working Across Devices" or "Import JSON" text
anywhere in the repo (grepped all `.html`/`.js`); the projects-page link correctly opens
the Tutorial in a new tab scrolled straight to the box; both Overview and Tutorial render
the new title, lead paragraph, and three bullets correctly; console clean on all three
pages.

### Not yet done
- Not merged to `main` — pushed to `origin/feature/updates_v3`.

## feature/updates_v3 branch — Fourth full-app audit & fixes

A general re-audit of the whole app, not tied to a specific new feature (see
`UPDATE_ROADMAP.md` §9 for the complete per-item detail; this is the summary). Same split
as the third audit: peripheral/wiring files (init scripts, HTML, build.js, CSP, GA/
Formspree) went to a subagent; the core data-path files (state, projects, editor, charts,
reports, backup) were read directly.

### What was found and fixed
- **Medium-high:** the Cross-Reference report's print-pagination script — added in the
  third audit's round three — never actually ran. It was an inline `<script>` written into
  the report popup, but every page's CSP forbids inline scripts and popups inherit their
  opener's CSP, so the chunking silently no-opped from the moment CSP landed; the third
  audit's fix changed the generated *string* correctly but nothing verified it *executed*.
  Moved the chunking into a same-origin function that runs from the opener against the
  popup's document after it's written — outside-in DOM access isn't subject to the target
  document's CSP.
- **Medium:** export could produce no file at all if its own bookkeeping write hit a full
  quota — exactly the moment a user is most likely to reach for export. The write-back is
  now a separate best-effort try/catch; the file download no longer depends on it.
- **Medium-low:** stored/imported data could already contain the character ↔ custom-POV-
  name overlap the UI's add/rename guards block going forward — `loadState()` now dedupes
  it on load.
- **Low-medium ×2:** import checked scene-id uniqueness but not section-id uniqueness (a
  colliding pair rendered as one merged section); both scene and section id validation
  used `typeof === 'number'`, which admits non-integer floats and `NaN` — both now use
  `Number.isInteger`.
- **Low-medium:** jumping from a chart segment to its scene on the board hand-rolled chart-
  view teardown and skipped restoring two toolbar controls (Show Card Details, zoom
  slider) — now delegates to `closeChartView()` directly so nothing is duplicated or
  missed.
- **Low:** the dynamic import-conflict dialog (newer/older/diverged file) wasn't
  recognized by any of editor.js's modal guards — Alt-shortcuts fired underneath it,
  Escape ignored it, and it could stack with the discard-confirm dialog. Added a close
  function and wired it into the same three guard points every other modal already uses.

### How it was verified
All core-file findings were reproduced live, either by driving the real UI or — for fixes
where the local preview's browser HTTP cache kept serving pre-fix script versions after
files were edited on disk (confirmed via direct `curl`/XHR against the running server that
the *served* files were always correct, the same class of tooling artifact noted in the
third audit) — by fetching the served source fresh and executing the exact changed
function against real app state/DOM, which exercises identical logic to a real page load.
Specifically: chunking verified by generating a real ~4,700px matrix report table and
confirming the fresh function splits it into 9 correctly-sized print chunks; export
verified by simulating `QuotaExceededError` on every `setItem` call and confirming the
download still fires with no blocking alert; the POV-overlap dedupe verified by loading a
project with the overlap injected and confirming it's gone from `S.povCustomNames` after;
both import-validation additions verified by importing synthetic files (duplicate section
ids, a `2.5` scene id) and confirming each is now rejected before anything is written to
storage; the chart-segment-click fix verified by opening chart view, confirming the two
controls are hidden, simulating a segment click, and confirming both are restored; the
import-dialog fix verified by opening a real dialog via `showImportChoiceDialog` and
confirming the new close function removes it.

### Not yet done
- Not merged to `main` — pushed to `origin/feature/updates_v3`.
