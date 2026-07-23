# Current Status

As of July 23, 2026:

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
- Commit `c4e3320` (plus the final-audit follow-ups in the next section) not yet pushed
  to `origin/feature/updates_v3`; not merged to `main`.

## feature/updates_v3 branch — Final verification audit

Closing pass over the branch (see `UPDATE_ROADMAP.md` §10 for per-item detail): the §9
fix commit reviewed line-by-line, a subagent regression sweep of the working tree (all
clean), and all seven §9 fixes re-verified end-to-end against a fresh origin served with
`Cache-Control: no-store` — eliminating the stale-cached-script tooling artifact the two
prior rounds had to work around, so this round exercised the real served code through
the real UI paths throughout.

### Follow-ups found and fixed in this round
- **Hardening (latent):** §9's `closeImportChoiceDialog()` matched any `.pm-modal.open`
  — on projects.html that class belongs to the static New/Rename/Delete modals, and
  `.remove()` would have deleted one permanently if the function were ever reachable
  there. The dynamic overlay now carries its own `.pm-modal-dynamic` class and every
  guard targets that (verified live: Rename modal untouched, dynamic dialog still
  removed).
- **Dev-only:** the automated test suite (test.html) had never loaded the app scripts it
  asserts on and had auto-run to 0/17 passed since the day it was added; it now loads
  the editor.html script set and passes 17/17 with a clean console.
- **Dev-only:** test-init.js's all-passed banner pointed at `TEST_PLAN_PHASE_4.md`,
  which doesn't exist in the repo; reworded.

### Not yet done
- Not pushed to `origin/feature/updates_v3`; not merged to `main`.

## feature/updates_v4 branch — Library trace lines on the Scene Flow Chart

Adds "trace lines" to the Scene Flow Chart: a "Trace:" selector in the chart toolbar lets
the user pick one library category (Characters/Locations/Themes/Misc/POV); each item the
user has explicitly selected in that category (via the existing Library panel checkboxes)
draws as its own colored line running through the scenes it appears in, layered inside the
ribbon alongside the existing neutral segments. Combines the chart's existing highlight and
flow-visualization features into one view, per the user's own framing of the idea — a hand
sketch of colored lines woven through a snake/ring shape. Built against `TRACE_LINES_SPEC.md`
(also on this branch) for the initial implementation, then iterated live with the user
across six rounds of screenshot-driven feedback; this section covers both the spec's build
and everything that changed afterward.

**Touched files:** `charts.js` (all trace-lane logic — the large majority of this branch's
diff), `editor.html` (Trace selector, chart-type icon buttons), `editor.js` (Sections-filter
active-ring class, one line), `editor-init.js` (Trace selector wiring), `styles.css`
(lane/legend/selector styles).

### How it works
- `computeTraceLanes(scenes)` turns the current library selection in the traced category
  into `{lanes: [{name, color}], overflow}` — lanes are ONLY items explicitly selected, not
  "every item in the category" when nothing's picked; the legend shows a "Select … to trace
  them" hint instead, so the control never looks broken while empty (a deliberate choice
  the user made explicitly when the spec was still being planned, before any code existed).
  There's no small hard cap on lane count — an initial `MAX_LANES = 6` (matching the
  original spec) was removed after the user asked for it to "theoretically allow unlimited
  selected items"; a 24-item `LANE_SANITY_CAP` remains purely as a runaway guard.
- Each lane draws from a dedicated 16-color `TRACE_COLORS` palette. The original build
  reused the 8-color `SEC_COLORS` (section colors) for lane colors — meant for a different
  purpose, and it silently repeated a color for any selection past 8 items (lane 1 and lane
  9 got the literal same hex), which the user spotted in a real Count of Monte Cristo trace
  ("Mercedes and Heloise, Danglars and Peppino" reading as the same color).
- Lane *width* (`traceLaneWidth(k)`) and tube *thickness* (`traceThickness(base, floor,
  ceil, k)`) both scale continuously with lane count `k`: width starts bold (5px) and thins
  toward a 1.5px floor as more are traced, with no cliff at any particular count; thickness
  ramps smoothly from the non-trace `base` toward a `floor` as lanes are added
  (`TRACE_RAMP_DECAY`) — one traced item now looks identical to the non-trace tube, and it
  visibly grows with each further item, rather than jumping straight to `floor` on the first
  selection (an earlier version did jump immediately; the user asked for gradual growth
  instead once they saw it in practice). Both are capped at a generous `ceil` purely as a
  sanity guard, essentially never hit in normal use.
- `laneOffsets(k, thickness, laneW)` always spreads lanes across the tube's FULL usable
  width, edge to edge minus a small margin. An earlier version capped inter-lane spacing at
  a small fixed pitch even when the tube (sized with headroom for many lanes) had far more
  room, so a handful of lanes clustered in the middle of a mostly-empty gray band — the
  user's screenshot showed this plainly ("lines... not using the full space in the tube").
  Verified lanes now span ~95% of tube width (was ~60%).
- Circle: the ring's radius `R` shrinks as the tube thickens (`buildCircleChart`), so the
  whole chart always fits inside the visible pane. An earlier version anchored `R` to the
  pane using the BASE thickness and let a thicker ring grow the SVG canvas outward beyond
  the pane instead, relying on `#chart-scroll`'s existing scroll — the user reported this as
  the chart "cuts off at the bottom of the window," so it was reverted; the pie
  (`drawCirclePie`'s `outerR`) now shrinks from both the ring thickening AND `R` itself
  shrinking at once, which also reads as a noticeably smaller pie than the anchored version
  did (a separate, earlier complaint — "the center pie is still unnecessarily big").
- Snake: the turn radius `r` (`computeSnakeLayout`) now tracks tube thickness directly
  (`r = thickness/2 + SNAKE_TURN_CLEARANCE`) instead of being a fixed value — this is what
  makes row-to-row spacing grow as lanes widen the tube (the user's "snake height expanding
  correspondingly" ask), while keeping the turn's inner edge a constant, safe distance from
  the tube's own edge no matter how thick tracing has made it.
- Trace-active state suppresses the existing library-selection segment highlighting
  (`chartSegFilterActive()`/`segIsMatched()`) — the selections ARE the lanes now, so an
  accent-colored segment underneath would fight the lane colors; search highlighting still
  applies on top of lanes unchanged.
- Lane hover (from the lane itself or its legend entry, `highlightLaneLegend`) widens that
  lane proportionally to its OWN base width (1.6× + 1.5px) plus a brightness/saturation CSS
  bump, rather than to a fixed absolute pixel value — the fixed version (5px) stopped
  reading as a highlight once bands were naturally that thick or thicker already, which the
  user flagged directly ("hard to tell when they're highlighted if the colored lines are
  thick").

### Known non-obvious fixes worth knowing about if you touch this code
- **The snake lane-position bug — the most significant fix on this branch.** Lane dash
  positions were originally computed by proportionally scaling centerline length to lane
  length (`len/total*laneTotal`) — exact for a circle (a concentric offset scales the whole
  circumference uniformly), but NOT exact for the snake: a lane's turns have a different
  radius (`r±d`) than its straight runs (unchanged, same `run` value as the centerline), so
  one uniform ratio is wrong specifically around turns, worse with larger lane offsets. This
  read as "colors running across scenes" in a user-provided screenshot, and measured at
  13.7px of drift at one scene boundary before the fix. Replaced with `snakeLenToLaneLen()`,
  which walks the exact same row/turn structure `buildSnakeLanePathD` draws and converts
  straight and arc portions on their own terms; verified worst-case error across every scene
  boundary in a real 18-scene render drops to 0.04px — confirmed both by fixing the bug and
  by independently re-deriving the OLD formula's error on the same data, to make sure the
  test itself was capable of detecting the bug it was checking for.
- A stale section-name pin (created by scrolling the Scene Board — see the flow-chart
  section above) stayed on screen after switching to chart view. `renderBoard()` normally
  clears `.sec-pin` elements on every call, but early-returns into `renderChart()` while
  `chartMode` is active and never reaches that cleanup line. The user spotted this as "a
  random 'Resolution and Redemption' label at the top of the screen"; fixed by clearing pins
  explicitly in `openChartView()`.
- The chart status line's section count (`updateChartStatus`) read `S.sections.length`
  unconditionally — always the project's total, even when the Sections filter
  (`secFilterIds`, a board-level control shared with chart view) had narrowed the visible
  board to fewer. Now uses the filtered count when a filter is active.
- Backward compatibility was checked at every geometry-formula change across all six
  rounds: the non-trace (and 1-lane) rendering was re-verified pixel-identical to the
  pre-trace-lines chart each time (exact `R-20`/`R-25` outer-pie radius, exact 34px/30px
  tube thickness, no glow CSS classes present), since none of the tuning was meant to touch
  the resting state — and it never regressed.

### Verification
Each of the six rounds was verified live in the browser against real sample projects
(Pride and Prejudice, and — once the user's own screenshots started referencing Mercédès/
Danglars/Peppino/Héloïse — The Count of Monte Cristo specifically, to match their exact
data): both chart types, dark and light themes, print export (mocking `window.open` to
capture the generated HTML rather than actually opening a window), pref persistence across
a real page reload, and direct numeric assertions everywhere a visual claim could be
independently checked in code rather than eyeballed — lane/scene-boundary position error,
tube thickness at specific lane counts, `R`/`outerR` values, hover stroke-width ratios, and
unique-color counts for a 13-lane trace. No console errors at any point across any round.

### Not yet done
- Not merged to `main` — pushed to `origin/feature/updates_v4`, PR not yet opened.

## feature/updates_v5 branch — Scene Board / Flow Chart header polish, POV reorder, splash-page prep

A round of UI polish on the Scene Board and Scene Flow Chart headers, plus two smaller
features (POV drag-reorder, a backup-alert link) and a documentation refresh. Merged to
`main` via PR #14.

**Touched files:** `editor.html`/`editor.js`/`editor-init.js`/`charts.js` (header
restructure, view toggle, POV reorder), `state.js`/`projects.js` (new `S.povOrder` field),
`styles.css` (divider, aura, number badges, view-toggle layout), `ui.js` (help-mode
tooltips), `overview.html`/`tutorial.html` (still separate pages at this point in the
branch — merged into one in `feature/updates_v6` below).

### How it works
- **Scene/Scene Board divider** now fills with the theme's accent color
  (`color-mix(in srgb, var(--acc) 55%, var(--s1))`) instead of just an outlined
  same-as-background bar, and is a couple px thicker than the Library/Sections dividers —
  it's the boundary between editing and board views, so it reads as more significant.
- **"Scene Board" title removed**; the scene count next to it now reads "Showing N scenes"
  and — fixing a real bug — actually reflects the active section filter instead of always
  showing `S.scenes.length` (the project total).
- **Cards/Snake/Circle view switch** (`#view-toggle` in `charts.js`) replaces the old
  "Show/Hide Scene Flow Chart" menu-only toggle and the in-toolbar "Board view ✕" button
  with one persistent 3-way control: it lives in `#sbhdr` on the board and physically moves
  (`insertBefore`, not cloned — keeps listeners/state) into `#chart-toolbar` while a chart is
  open. Picking Snake/Circle from the board now opens the chart directly.
- **Snake chart's section legend row removed.** Sections were already marked directly on
  the ribbon via lettered badges with hover tooltips (`drawSectionMarkerAt`/
  `showSectionTip`), the same on-chart approach the circle chart's pie wedges use — the
  separate legend row duplicated that information and cost a full line of header height for
  nothing new.
- **Scene number badges** changed from a text-stroke halo (`paint-order:stroke`, added only
  when trace lanes were active) to a small solid pill background behind each number
  (`drawChartNum`) — the stroke approach read as blurry at 10-11px font size, and didn't
  reliably contrast against every segment/trace-lane color combination the way a solid
  backing guarantees.
- **POV library items are now drag-reorderable**, closing the one gap where POV was the only
  Library section without it. POV isn't backed by a simple array like
  Characters/Locations/etc. — it's a filtered, merged view of `S.characters` names plus
  `S.povCustomNames` (`usedPovNames()`) — so dragging needed a dedicated, append-only order
  list (`S.povOrder`) rather than reordering either source list directly, which would also
  reorder the Characters section or desync from the "only show POVs actually used on a
  scene" filter. Wired through `saveState`/`loadState`, undo/redo snapshots, and
  `resetState()`/import validation the same way `povCustomNames` already was.
- **Backup alert banner** gained a "Learn about your data and backups" link (matching the
  one already on the Projects page) plus the same privacy sentence used elsewhere: "Your
  content remains privately yours. We use Google Analytics and other tools to understand
  feature usage and improve the app, but no personal data or project content is shared."
- **Help mode** (`ui.js` `HELP_ZONES`): the Scene Flow Chart toolbar had zero tooltip
  coverage before this — added tooltips for the view switch, word-count toggle, Trace
  picker, chart status text, legend, and Print. Also fixed highlight boxes overflowing past
  the window edges on full-width rows (the `+6px` padding added around every zone pushed an
  edge-to-edge row like the menu bar a few px past the viewport on each side; now clamped to
  `[0, window.innerWidth/innerHeight]`), and removed the generic "Scene Board"/"Scene Flow
  Chart toolbar" catch-all tips once every individual control inside them had its own.

### Known non-obvious fixes worth knowing about if you touch this code
- The CARDS/FLOW labels floating above the view-toggle icons need real vertical headroom in
  their row, not just enough to clear the icon buttons — the row height went from 46px to
  52px (every other panel header row still uses 46px) specifically so the label has a few px
  of breathing room above it before hitting `#sbp`/`#chart-host`'s `overflow:hidden`.
- Trimmed the Cards/Snake/Circle buttons' own padding (they were taller than every other
  control sharing their row) both to fix a vertical-alignment mismatch and to free the extra
  headroom the label needed.

### Verification
Manually verified in-browser across board mode and chart mode: divider color/width, count
text and its bug fix (section-filtered vs. total), view-toggle switching in both directions
with the toolbar/header DOM move, POV drag-reorder (including the append-only "still in
`povOrder` while unused" behavior), the backup banner's new link/text, and all new help-mode
tooltips with zero overflow across 16 zones. No console errors.

## feature/updates_v6 branch — Splash page merge, dark redesign, sample-data enrichment

Combines the old two-page `index.html` (short splash) + `overview.html` (feature tour) into
one page, redesigns it to actually look like a product landing page instead of a static
text column, and fixes the built-in sample projects having no Word Count or POV data to
demonstrate those features with.

**Touched files:** `index.html` (rewritten), `index-init.js` (new — image lightbox +
scroll-reveal, replaces `overview-init.js`), `styles.css` (`LANDING PAGE` section rewritten
with a bespoke dark palette), `projects.html`/`editor-init.js` (Overview links now point at
`index.html`), `overview.html`/`overview-init.js` (deleted), `pride-and-prejudice.json` /
`count-of-monte-cristo.json` (added `wordCount`/`povs` to every scene).

### How it works
- **One page, one flow:** frozen header (logo left; "Your Projects"/"Tutorial" centered via
  a `1fr auto 1fr` grid so the nav stays centered regardless of text width) → hero (tagline +
  "Welcome to SceneSetter" + the old Overview intro copy) → the six Overview feature
  sections, reworked as an alternating zigzag layout → the Data & Backups block → the
  closing contact/Get Started section from the old splash page. `#landing` keeps its
  existing "fixed header, internally-scrolling body" structure (`.landing-body`); only its
  contents grew.
- **Bespoke dark palette scoped to `#landing`** (`--lbg`/`--ltx`/`--lacc`/etc., defined once
  on `#landing` itself) — deliberately independent of the app's `data-theme` system, since
  this page isn't part of the editor and has no reason to track a user's chosen theme.
  `.overview-img`/`.overview-img-wrap`/`.overview-modal` are exclusively used by this page
  now (their old home, `overview.html`, is gone), so they were restyled directly rather than
  scoped/duplicated.
- **Hero:** two slow-drifting blurred color blobs (`::before`/`::after`, `animation:
  landing-blob-float 18s`) behind the text, a gradient-filled `background-clip:text`
  headline, and a bobbing scroll-cue chevron — all skipped under
  `prefers-reduced-motion: reduce`.
- **Feature rows:** widened from 940px to 1120px max-width to use large-screen space better;
  alternate left/right (`:nth-child(even)`) with a colored accent per feature
  (`--landing-accent`, one of six palette colors) driving a glowing circular number badge
  and a matching glow behind that row's screenshot. Every screenshot sits inside a "browser
  window" frame (`.landing-window-dots` — three traffic-light dots + card chrome) instead of
  floating as a bare image. Library/Sections screenshots are much smaller natively (287×598,
  332×311px) than the others — `.landing-img-compact` caps and centers them at 300px instead
  of stretching them to fill the same wide column, which blew them up past their native
  resolution.
- **Scroll-reveal** (`index-init.js`, `initScrollReveal`): an `IntersectionObserver` rooted
  at `.landing-body` (not the viewport — this page scrolls internally) toggles an `in-view`
  class on each `.reveal` element both ways (`classList.toggle('in-view',
  entry.isIntersecting)`), so a row replays its entrance animation every time it's scrolled
  back into view rather than only once. Text and media within a row animate on separate
  staggered timing — text slides in first (with a blur-to-sharp focus effect), the
  screenshot scales in ~120ms later with an overshoot easing — instead of the row fading in
  as one flat block.
- **Sample projects:** `pride-and-prejudice.json` (18 scenes) and `count-of-monte-cristo.json`
  (39 scenes) previously had no `scene.wordCount` or `scene.povs` on any scene, so "Show
  relative word count" and the POV report/trace features had nothing to demonstrate on the
  built-in samples. Added reasonable per-scene word-count estimates (real chapter-level
  counts aren't available for a scene structure that's already a condensed retelling)
  weighted toward pivotal/longer scenes, summing close to each novel's actual total (~122k
  and ~465k words respectively), and POV names drawn from each project's existing character
  list — primarily the protagonist, with scenes centered on another character's own arc
  (Danglars' ruin, Villefort's breakdown, Fernand's suicide, etc.) attributed to that
  character instead, for a POV report with real variety.

### Known non-obvious fixes worth knowing about if you touch this code
- The old "Ready to start? Launch SceneSetter" CTA at the bottom of the splash page was
  removed on purpose, not an oversight — opening Projects in a second tab from a page the
  user is already one click away from leaving wasn't wanted; the existing header nav link
  and the closing section's own Get Started button already cover it.
- `ensureSampleProjects()` (`projects.js`) only ever seeds the sample projects once per
  browser, tracked by a `samplesSeeded` flag in global prefs — a browser that already ran
  the app before this branch's JSON changes won't see the new word counts/POVs until its
  existing "Pride and Prejudice"/"The Count of Monte Cristo" projects are deleted and that
  flag is cleared (or a fresh profile is used). This is existing, intentional behavior (see
  `UPDATE_ROADMAP.md` §1, "Deleted sample projects resurrect themselves") — not something
  this branch needed to change, but worth knowing when verifying the new sample data.
- IntersectionObserver callbacks were unreliable when driven by synthetic
  `element.scrollTop = N` assignment in automated browser testing (the callback for
  "leaving" a target sometimes never fired), even though a real mouse-wheel scroll gesture
  worked correctly every time — a testing-harness quirk, not a code bug; verify this feature
  with real scroll input, not scripted `scrollTop` writes.

### Verification
Manually verified in-browser at desktop and mobile widths: header centering/stacking, hero
animation and gradient text, all six feature rows (including the compact-sized
Library/Sections images and the multi-image Scene Flow Chart/Reports rows), the image
lightbox, Data & Backups styling, the Get Started → Projects flow, and — via real scroll
gestures — that each row's reveal animation replays on re-entry after scrolling away and
back. Sample-project JSON verified both by direct parsing (word-count sums, every POV name
matching a real character) and by loading fresh-seeded projects in the running app: word
count drives the Scene Flow Chart's relative-sizing mode, and POV data populates the Edit
Scene form correctly.

### Not yet done
- *(Update: `feature/updates_v6` has since been merged to `main` via PR #15.)*

## feature/updates_v7 branch — Version-tracked sample-project refresh

Answers a gap noticed right after `feature/updates_v6` shipped new word-count/POV data to
the two sample projects: since `ensureSampleProjects()` only ever seeds once per browser
(tracked by a `samplesSeeded` flag), anyone who'd already opened the app before that change
would never see the new data without manually clearing `localStorage` in the console — there
was no remote or automatic way to refresh them. This branch makes the refresh automatic.

**Touched files:** `projects.js` (`ensureSampleProjects()` rewritten, `confirmProjDel()`
extended, `importProjectJSON()`/`exportProjectJSON()` hardened by a follow-up audit — see
below), `state.js` (new `isValidSecColor()` helper, shared by `loadState()` and the import
path), `editor.html` (duplicate `hdr-spacer` id fixed), `styles.css`/`ui.js`/`main.js`
(dead code from an earlier header redesign removed, surfaced by the same audit).

### How it works
- `samplesSeeded` (boolean) is joined by `samplesVersion` (number) and a new
  `SAMPLES_VERSION` constant, bumped whenever the sample JSON files change enough to want
  existing sample projects refreshed. A user whose stored version is behind gets the newer
  content automatically on their next Projects-page visit — no console step needed. A
  never-seeded browser is treated as version 0; a previously-seeded browser with no
  `samplesVersion` at all (i.e. everyone before this branch) is treated as version 1, so
  they're behind `SAMPLES_VERSION = 2` and get the refresh exactly once.
- The refresh only ever touches a sample project the user never actually modified —
  `revision === 0` (the project's own save-counter, incremented on every `saveState()` call;
  untouched by merely opening/viewing it). An edited sample is left completely alone and
  still counts as "handled" for that version, so it's never checked again until the next
  version bump. This reuses the same per-sample reconciliation for both the first-ever seed
  and a later refresh — one code path, not two.
- Each sample now carries a permanent `sampleKey` (`'pride-and-prejudice'` /
  `'count-of-monte-cristo'`) alongside its display `name`. `ensureSampleProjects()` matches
  an existing index entry by `sampleKey` first, falling back to `name` only for an entry
  seeded before this field existed (and backfilling `sampleKey` onto it once found).
  Deleting a sample project (`confirmProjDel()`) records that same `sampleKey` (not the
  display name) into a `deletedSamples` list in global prefs — see "Known non-obvious
  fixes" below for why this matters. A version bump skips any key on that list entirely, so
  deleting a sample on purpose still means it never comes back — the same guarantee
  `samplesSeeded` originally existed to provide, now extended to survive a version bump
  instead of only a plain page reload.
- The existing 15-second `samplesSeeding` lock (guarding against two tabs/a fast reload
  racing the async fetches) is unchanged and now also covers refresh passes, not just the
  very first seed.

### Known non-obvious fixes worth knowing about if you touch this code
- **Bug found and fixed by a follow-up full-app audit before merge:** the branch as
  originally written matched/tracked samples purely by display `name`. Renaming a sample
  made it invisible to that matching — a version bump would add a fresh duplicate under the
  original name alongside the renamed copy; worse, if the renamed copy was then deleted,
  `deletedSamples` recorded the *new* name, so the next version bump didn't recognize the
  deletion at all and resurrected the sample under its original name. Fixed by adding the
  `sampleKey` field described above, which survives a rename — matching and deletion
  tracking both key off it now, with the original name-matching kept only as a fallback for
  pre-fix data. Verified live: renamed "Pride and Prejudice" via the Projects page, deleted
  it, confirmed `deletedSamples` recorded the key (not the new display name), then rolled
  back `samplesVersion` and reloaded — it did not reappear.
- The same audit hardened `importProjectJSON()` against a few related gaps: `section.color`
  is now format-checked (`isValidSecColor()`, shared with `loadState()`) before it can reach
  an inline `style.background`/`color-mix()` string on the board — an invalid value (e.g. a
  hand-edited `url(...)`) is stripped rather than trusted, and `loadState()` then assigns the
  normal palette fallback the first time the project opens; `scene.sectionId` is now
  type-checked (integer or absent); and a duplicate name within one imported library array
  (characters/locations/themes/misc) is now rejected outright — previously it silently
  rendered two checkboxes sharing one value, since every other name-collision check in the
  app (`confirmAdd`, `saveLibEdit`) assumes one entry per name. `exportProjectJSON()` also no
  longer produces a filename starting with a bare space when the project name is entirely
  punctuation. Separately, the same pass found and removed dead CSS/JS left over from an
  earlier header redesign (a duplicate `id="hdr-spacer"` in `editor.html`; unused
  `#theme-sel`/`#pm-theme-sel`/`#ur-wrap`/`.ur-btn`/`#proj-name`/`#rpt-btn`/`#chart-close-btn`
  rules and the JS that read them, none of which exist on any page anymore).
- Testing the version-refresh mechanics without a real second-visit gap requires simulating
  an "old" browser state by hand (clearing `localStorage`, writing back an old-shaped
  `scriptease_prefs` with `samplesSeeded: true` and no `samplesVersion`, plus a sample
  project with `revision: 0`) — verified this way for all three cases: untouched-and-behind
  (refreshes in place, same project id, no duplicate), edited-and-behind (left alone, no
  duplicate), and deleted-and-behind (never resurrected). Also hit the same stale-fetch-cache
  artifact seen throughout this project's browser-based testing (a plain `fetch()` of the
  sample JSON returned a long-cached pre-wordCount copy in the test browser) — confirmed it
  was a test harness/browser-cache artifact, not a logic bug, by re-running with `fetch`
  patched to force `cache: 'no-store'`.

### Verification
Manually verified in-browser (with `fetch` forced to bypass cache to eliminate the
test-harness caching artifact above): a previously-seeded, untouched sample refreshes to the
new word-count/POV content in place; an edited sample is left byte-for-byte alone; a
deleted sample stays deleted across the version bump; and a genuinely fresh browser (no
prior state at all) still seeds both samples exactly as before. No console errors.

Additionally verified after the audit's `sampleKey` fix and import hardening (see above):
the rename→delete→version-rollback scenario described in "Known non-obvious fixes" no
longer resurrects the sample. `importProjectJSON()` was also driven directly with synthetic
files: a library array with a duplicate name is rejected with the new error message; a scene
with a string `sectionId` is rejected; and a section with a `url(...)`-style `color` value
imports successfully with the color stripped, with `loadState()` then assigning the normal
palette fallback on open. No console errors in any case.

### Not yet done
- Not merged to `main` — pushed to `origin/feature/updates_v7`, PR not yet opened.

## thruLine_v1 branch — SceneSetter v3: entity ids + Timeline feature (in progress)

Integrates the ThruLine app's timeline/conflict-engine feature into SceneSetter, per
`SCENESETTER_V3_TIMELINE_SPEC.md` (also in this repo — read that first for the full design;
this section tracks implementation progress against its M1–M7 milestone list). Reference
implementation lives in `../Timeline` (repo `thruLine`, branch `updates_v1`); code is ported
and adapted from there, not re-implemented from prose. Branched from `main` at `5aa46e5`
(post `feature/updates_v7` merge). M1–M6 complete as of this writing; M7 not started.

**M1+M2 — Schema v3 migration + full identity refactor** (`state.js`, `editor.js`,
`charts.js`, `reports.js`, `projects.js`): `DATA_VERSION` → `'3'`. Library entities, custom
POVs, and every scene reference array move from name-based to a shared integer id space
(`S.nextEntId`), with `migrateV2toV3()` running on load/import/sample-seed. New top-level
timeline fields (`storylines`, `chronOrder`, `revealsLib`, `constraints`, `markers`,
`dismissed`, `timelinePrefs`) are seeded with defaults during migration. The spec's two
milestones were combined into one implementation pass — the identity refactor isn't
separable from the migration in practice, since name-based rename-propagation code can't
coexist with id-based scene refs. Rename-propagation loops in `editor.js` are deleted
outright (renaming is now instant and identity-stable); `charts.js` trace lanes and
`reports.js` builders resolve ids to names per render instead of string-matching.
**Bug found and fixed along the way:** `STORAGE_KEY` was derived from `DATA_VERSION`
(`'storyboard_v' + DATA_VERSION`), which would have silently broken the legacy
single-project bootstrap (`migrateExistingData()`) the moment `DATA_VERSION` changed —
decoupled it into a frozen fossil key (`'storyboard_v2'`).

**M3 — Scene form Timing/Reveals groups + offscreen semantics** (`editor.html`,
`editor.js`, `styles.css`): the Edit Scene form gains two collapsible groups per spec §7 —
Timing (storyline select, "also part of" checklist, anchor date/time + clear button,
duration, offscreen checkbox) and Reveals (two checklists over a shared `revealsLib`, with
an inline mint-and-check add). Both extend `isEditFormDirty()`/`confirmSaveEdit()`
field-for-field; a `revealsLib` entry referenced by no scene in either list is
garbage-collected on save. Board cards get an "Offscreen" badge and the scene count reads
"(N offscreen)" — the only other behavior change; charts/reports/word-count treat offscreen
scenes exactly as before, per spec.

**M4 — Timeline view shell** (new `timeline.js`, `editor.html`, `editor.js`, `editor-init.js`,
`charts.js`, `projects.js`, `styles.css`): a fourth view-toggle mode (cards/snake/circle/
timeline). ThruLine's chronology geometry engine (`../Timeline/js/time.js`), wires overlay,
and hover mechanism (`../Timeline/js/wires.js`) are ported wholesale into `timeline.js`,
adapted from `project`/`P` to `S`. Entering timeline mode hides the three left panels via a
body-level class (their own collapse state is untouched, restored exactly on exit) and
reparents the single `#form-edit` node into the right panel's Inspector tab rather than
duplicating it — leaving moves it back. Board-only menu items (zoom, panel toggles,
Create→library) grey out and their keyboard shortcuts no-op in timeline mode; Create→New
Scene instead creates immediately with schema-v3 defaults and an auto-unique title, opening
it in the Inspector. Every mode switch and scene reselection reuses the existing
discard-confirm modal via a new optional `afterDiscard` callback on
`openDiscardConfirm()`/`confirmDiscard()`. Chronology strip: storyline lanes (add/
rename-inline/delete with scene reassignment + a last-lane guard), ordinal/true-scale
positioning, zoom slider, character thread overlay. Manuscript ribbon: a new pure
`manuscriptOrder()` function in `editor.js` (mirroring `renderBoard()`'s grouping exactly)
drives display order and numbering, with section-color stripes as read-only separators in
place of ThruLine's dividers (sections already existed here and fill that role).
**Spec deviation:** Alt+T was already bound to "Add Theme" in this codebase (the spec
assumed it was free), so Timeline view uses **Alt+K** instead.

**M5 — Chron drag + markers** (`timeline.js`, `editor.js`, `editor-init.js`, `state.js`):
ports ThruLine's `_chronDrag` family (`../Timeline/js/chron.js`) into a `_tlDrag` state
machine — same candidate/threshold-4px/active two-phase pattern editor.js already uses for
board card drag, wired once globally rather than per-render. Horizontal drag reorders
`chronOrder` (ordinal axis only; true-scale shows a one-time "Switch to Ordinal to reorder
by time" toast and disables it); vertical drag re-lanes (sets `storylineId`, strips it from
`alsoStorylineIds` per the §2.5 invariant). No-op drops commit nothing; real moves push
"Move scene (time)"/"Move scene (lane)" undo labels. Markers: right-click empty track space
→ "Add marker here" (anchors to the nearest scene to the right in `chronOrder`); click a
marker label → rename/delete popover. Ported verbatim ThruLine's July-2026
`closeMarkerContextMenu()` pattern (every close path removes both the menu element and its
document listener) to avoid the two-right-clicks-stray-menu bug it fixed there. Drag-cancel,
marker-popover-close, and marker-context-menu-close all join `ESCAPE_ACTIONS` (editor.js)
ahead of the timeline deselect entry, rather than a second keydown listener.
**Bug found and fixed along the way:** `undo()`/`redo()` (`state.js`) call `renderBoard()`
unconditionally, which no-ops into `renderChart()` on its own when chart view is open — but
the timeline view is a wholly separate render tree with no such hook, so undoing/redoing a
chron drag while timeline mode was open silently desynced the DOM from the data (confirmed:
the underlying `S`/`chronOrder` state reverted correctly, only the on-screen card position
didn't move). Fixed by calling `renderTimeline()` from both when `timelineMode` is active.

**M6 — Conflict engine + panel + warn-dots** (new `conflicts.js`, `state.js`, `editor.js`,
`editor.html`, `projects.js`, `timeline.js`, `styles.css`): ports `../Timeline/js/
conflicts.js`'s pure `computeConflicts()` mechanically — fingerprints, the four check
families (anchor-vs-chronOrder monotonicity, constraint violations + cycle DFS, bilocation,
reveal-order/missing), the debounced 150ms recompute (hooked into `saveState()`), and flag
mode. Two adaptations beyond the mechanical port: reader-order inputs use `manuscriptOrder()`
filtered to `!offscreen` (this codebase has no stored `msOrder`), and bilocation is rebuilt
around schema v3's multi-location scenes (ThruLine's single `locationId` doesn't exist here)
— a conflict now requires both scenes to have at least one location tagged and their
location *sets* to be completely disjoint, rather than a simple inequality. UI: a
"Conflicts (N)" badge in the timeline strip header opens the right panel's Conflicts tab
(severity dot, message, "show scenes" flag-mode toggle, "mark intentional" dismiss, a grayed
"Dismissed" section with "restore warning"); warn-dots render on chron-strip cards, ribbon
cards, and — new — board cards (`.sc-warn .warn-dot`, top-right corner, red), the last of
these so a conflict is discoverable without ever opening the timeline. `pruneDismissed()`
(ported from ThruLine's `saveProject()`) runs synchronously inside `saveState()` before every
write, so a dismissed fingerprint the data no longer produces never survives a save.

### Known non-obvious fixes worth knowing about if you touch this code
- `updateViewToggleUI()` briefly existed in both `charts.js` and `timeline.js` — consolidated
  into `timeline.js`'s unified 4-way version and the `<script>` order swapped
  (`timeline.js` before `charts.js`) so `charts.js`'s own startup code can call it safely
  without a load-order `ReferenceError`.
- The migration's library-entity dedup (schema v3 §3.2 step 2) matches the spec precisely:
  when a v2 library array has duplicate names, the *first* entry keeps the name→id mapping;
  any later duplicate is dropped after ref-rewriting unless a scene ref still points at its
  own (non-canonical) id.
- Manual browser testing repeatedly hit a preview-tool caching quirk where navigating to the
  same URL (even a fresh "Open" project flow) served a stale cached HTML/CSS/JS document
  despite the server returning fresh content on `curl`/`fetch(..., {cache:'no-store'})` —
  worked around by appending a cache-busting query string on navigation (and, for `<script>`
  tags specifically, by rewriting `<link>`/re-fetching, since a busted HTML url alone didn't
  bust the script urls it references). Confirmed this exact way for the M5 undo/redo fix
  above: the stale cached `state.js` initially made the fix look like it hadn't worked at
  all (old `undo()` in memory, no `renderTimeline()` call) until isolated by comparing
  `undo.toString()` against the on-disk source. Not an app bug; noted here so a future
  session doesn't chase it as one.

### Verification
Manually verified in-browser against both migrated sample projects (Pride and Prejudice,
The Count of Monte Cristo) after each milestone: v2→v3 migration produces correct ids/
counters/`chronOrder`; renaming a character with its scene open shows zero dirty-flag and
propagates instantly everywhere (card tags, checklists, chart trace, reports); deleting a
character who is a POV survives as a custom POV entry; `validateV3Import()` rejects dangling
refs, malformed anchors, bad `chronOrder`, invalid `timelinePrefs.axis`, and duplicate
cross-collection ids with specific messages, and accepts a real exported v3 project;
Timing/Reveals fields round-trip through save/reload/undo, including the reveals
garbage-collection case (tag on scene A, require on scene B, untag both, confirm the
library entry is gone); Timeline view's mode entry/exit, panel-state round-trip, scene
selection (reparenting the real edit form, not a copy), storyline add/rename/delete, zoom,
thread overlay, and menu/shortcut disabling all confirmed across the ivory and slate themes.
Chron-strip horizontal drag (reorders `chronOrder`, board/manuscript order left untouched,
correct undo label) and vertical drag (re-lanes, correct undo label) both confirmed with
real synthetic mouse drag events; marker add (via direct context-menu-button invocation —
the automated right-click itself didn't reach the app, confirmed by dispatching a real
`contextmenu` event instead, which worked, so this is a test-tool limitation, not a bug),
rename, and delete all confirmed. Console clean throughout.

Conflict engine verified live against real data mutations (not fixtures): built the
bilocation case (shared character, disjoint locations, overlapping anchored intervals,
including one participant marked offscreen — confirmed it still flags per §9) and the
reveal-order case both ways (a reveal tagged on an *offscreen* scene correctly does NOT
satisfy a later requirement; retagging it on an on-screen scene produces a "reveal used
before shown" conflict with a correctly-numbered message; reordering the board so the
revealing scene comes first — not touching `chronOrder` — clears it, confirming
manuscript order, not chronology, drives the reveal check). "Show scenes" flag mode
confirmed on both chron and ribbon cards simultaneously; hovering a different card while
flagged does not dim the flagged one (the specificity fix holds); "mark intentional"
dismisses (badge/panel update, `S.dismissed` persisted) and Escape clears flag mode.
Fixing the underlying data and re-saving pruned the dismissed fingerprint automatically.
Board warn-dot (`.sc-warn`) confirmed rendering independent of which view is open. Console
clean throughout.

**M7 — Polish + full verification** (`editor-init.js`): ran the spec's full §13
checklist (24 items) across all five themes and against both a fresh project and a
migrated sample (Pride and Prejudice).
**Bug found and fixed:** the M3 Timing/Reveals form additions (`editor.html`'s
`ed-also-sl-btn`, `ed-reveals-btn`, `ed-requires-btn`) were wired to `toggleCkDrop()`
in the surrounding code but never actually hooked up — `editor-init.js`'s click-wiring
loop for the checklist-dropdown buttons only listed the pre-existing
characters/locations/themes/misc/POV buttons (both New Scene and Edit Scene variants),
never the three new Timing/Reveals ones. Clicking "Also part of," "This scene
reveals," or "Requires knowing" did nothing — `toggleCkDrop` was dead code from those
buttons' perspective, so the dropdowns could never open and those fields were
effectively unusable via mouse. Fixed by adding the three buttons to the existing
wiring array (`toggleCkDrop`'s `sec` parameter is unused inside the function, so any
label works; used `'storylines'`/`'reveals'` for clarity). Caught only by actually
clicking the rendered buttons in-browser — reading the code in isolation, both the
button markup and `toggleCkDrop` looked correct, and it would have passed a review
that didn't drive the UI.

### M7 verification
All 24 checklist items confirmed, live in-browser, on both a fresh project and the
migrated Pride and Prejudice sample:
- **1–10** (migration/import/undo/validation/identity): re-spot-checked post-fix — v3
  schema fields present and correct on a fresh migration, `v:'3'` persisted, rename
  propagation (via the real `saveLibEdit()` path) shows zero dirty-flag on an open
  scene form and preserves its checkbox selections. (An earlier false-positive dirty
  reading during this pass was traced to a test-script mistake — calling
  `renderAllCk()` directly clears checkbox state since it renders with no `checked`
  argument — not an app bug; the real rename path always supplies
  `ckCurrentlyChecked()`.)
- **11–13** (Timing/Reveals/offscreen): anchor date/time/duration round-trip via
  save/reload confirmed on scene data directly; reveal mint-and-check add, and the
  "Also part of"/"Requires knowing" dropdowns all confirmed working after the fix
  above; board offscreen badge and "(N offscreen)" count confirmed.
- **14, 14a, 14b** (Timeline shell + mode round-trip + menu state): toggle/Alt+K entry,
  panel hide on entry, Sections-panel-collapsed state surviving a full mode
  round-trip while Library/Scene panels restore exactly, reparented `#form-edit`
  working identically in both board and Inspector contexts, Create→library items
  greyed with New Scene still enabled and creating "Untitled scene N" directly in the
  Inspector, Reset Zoom disabled in timeline mode.
- **15–17** (true scale, wires, thread): true-scale positioning and its drag-disabled
  behavior (chronOrder unchanged after a drag attempt) confirmed; thread picker curve
  survives an id-based character rename.
- **18–19** (chron drag + markers): horizontal drag reorders `chronOrder` only (board
  order untouched) with a correct "Move scene (time)" undo label that both undoes and
  redoes the on-screen position; vertical drag re-lanes with "Move scene (lane)";
  marker add (via a dispatched `contextmenu` event — the `computer` tool's real
  right-click doesn't reach the app's listener in this environment, per the known
  quirk), rename-on-blur, delete, and the two-successive-right-clicks-no-stray-menu
  regression all confirmed.
- **20–22** (conflicts): built a live bilocation case (shared character, disjoint
  locations, overlapping anchored times); "show scenes" flags chron+ribbon+board
  cards and hovering an unrelated card does not dim the flagged ones (specificity
  regression holds); "mark intentional" dismisses, persists in `S.dismissed`, and
  fixing the underlying anchor auto-pruned the dismissed fingerprint on next save; an
  offscreen scene in a bilocation conflict still flagged.
- **23** (XSS/CSP): grepped every `innerHTML` assignment across all `.js` files —
  every one is either a clear (`= ''`) or static markup with no entity/scene-derived
  interpolation; CSP meta tag confirmed byte-identical to `main`. Live-set a scene
  title and a storyline name to `<img src=x onerror=alert(1)>` — rendered as literal
  text everywhere (board, chron strip, ribbon, lane header, conflict message), no
  `alert` fired, console stayed clean.
- **24** (themes): cycled ivory/slate/studio/ocean/sunset with the bilocation conflict
  still flagged and a thread active — storyline lane colors, wires, and flag/hover
  states stayed distinct and readable in all five.

**Post-M7 — bugs found via a real converted ThruLine dataset.** M7's own checklist
testing used small, synthetic fixtures (a 2-3 scene test project, the existing Pride
and Prejudice / Count of Monte Cristo samples, whose chronological and manuscript
orders are nearly identical) — none of which exercised a Timeline view with real
scroll or a manuscript order that diverges sharply from chronological order. A
one-off Python script (not committed) converted ThruLine's own
`Frankenstein.thruline.json` test fixture (`../Timeline`) into a SceneSetter v3
project — 27 scenes, 3 storylines, a genuine frame-narrative structure (Walton's
letters open the book; Victor's life is a flashback) — and importing it surfaced
three real bugs the smaller fixtures never touched:

1. **Wires zone was a hardcoded 48px sliver** (`styles.css`), not proportional to
   the stage like ThruLine's own `#wiresZone{flex:1}` — ThruLine's chron/manuscript
   sections size to their content (`flex:0 0 auto`) and the wires zone absorbs all
   remaining space; SceneSetter instead gave chron/manuscript fixed flex-grow shares
   and squeezed wires into a tiny fixed pixel band, making already-thin curves nearly
   invisible. Fixed by mirroring ThruLine's approach: `#tl-chron-body`/`#tl-ms-scroll`
   now content-size (capped at 55%/30% of stage height so a many-storyline project
   can't starve the wires zone), `#tl-wires-zone` takes the remainder (`flex:1`,
   `min-height:100px`). Lane rows were already fixed-height in `timeline.js`
   (`laneH=92`, not computed from available space), so this didn't require any JS
   changes. The user explicitly declined ThruLine's separate draggable resize handle
   for this split — not needed once wires have proper room.
2. **The "divider" between the two strips did nothing.** There was no actual divider
   element — just `#tl-wires-zone`'s own bottom border, which read as a dead resize
   handle. Resolved as a side effect of fix 1: once the zone visibly hosts real wire
   curves, the border reads as a section boundary rather than a broken control.
3. **Clicking any field in the Timeline Inspector emptied the panel** (`editor.js`,
   `styles.css`). Two compounding bugs: (a) `#cp .p-body{display:flex;flex-direction:
   column}` stopped matching once `#form-edit` was reparented into
   `#tl-inspector-body` for Timeline mode, so `.cp-form-hdr` (Cancel/Save) and
   `.cp-form-fields` fell back to flex-direction's row default and rendered side by
   side instead of stacked — fixed by re-declaring the same rule scoped to
   `#tl-inspector-body`. (b) Independently, editor.js's board-only "cancel edit on
   click outside `#cp`" `mousedown` handler didn't know about the reparented form
   either — since it's no longer inside `#cp`, *every* click on it (even squarely
   inside a real field) read as "outside" and silently cancelled the edit. Fixed by
   making that handler step aside entirely while `timelineMode` is true (Timeline
   mode already has its own equivalent via `tlSelectScene`/`runWithDiscardGuard`).
   Bug (a) alone produced the squeezed layout; bug (b) alone would have broken
   clicking-into-fields even with perfect layout — confirmed by reproducing each
   independently (a direct `.click()` call doesn't fire `mousedown` and didn't
   trigger bug (b); a real simulated click did, regardless of exactly where in the
   form it landed).

All three fixes verified live: hover highlighting, chron drag, true-scale mode, and
Conflicts flag-mode wire coloring all re-confirmed working with the new layout;
Inspector field clicks and typing confirmed non-destructive on a genuinely fresh
browser origin (stale HTTP caching in the preview tool made this unusually hard to
verify — see the caching note earlier in this doc; a mid-session server/port restart
was needed to rule out false negatives from cached JS).

**Post-M7, round 2 — wires still weren't actually connecting to cards.** After the
wires-zone sizing fix above landed, the user reported (screenshot) that curves still
looked disconnected from the chronology strip, and that offscreen scenes had no wire
at all. Two more real bugs, both in `redrawWires()` (`timeline.js`):

4. **`if (s.offscreen) return;`** — ported verbatim from ThruLine, where an offscreen
   scene genuinely has no manuscript position (excluded from `msOrder` entirely — the
   Frankenstein conversion had to synthesize `sc_chase`'s manuscript placement by
   hand for exactly this reason, since ThruLine's own file omitted it from
   `msOrder`). SceneSetter's model is different: `renderManuscriptRibbon()` gives
   *every* scene a `.tl-ms-card`, offscreen ones just get a dimmed `.tl-offscreen`
   treatment (spec §6.2), so they always have a real card to draw a wire to. Removed
   the skip; the existing `if (!chronEl || !msEl) return;` guard already covers any
   genuine no-card case.
5. **`ay = 0` was hardcoded** — every wire's chronology-side endpoint was pinned to
   the wires-zone's top edge regardless of where the actual card sat, instead of the
   card's real bottom edge (ThruLine's original: `ar.bottom - stageRect.top`). This
   happened to look fine only for cards in the bottommost chron lane, immediately
   above the zone boundary; any card in an upper storyline lane had its wire start
   from thin air at the boundary line instead of visibly touching the card, reading
   as "the wire disappears in the chronology pane." Root cause: `#tl-wires` was
   nested inside `#tl-wires-zone` (sized to just the zone's own small box) rather
   than being a direct child of `#tl-stage` like ThruLine's `#wires` (sized to the
   whole stage) — a coordinate space too small to reach cards outside the zone at
   all. Fixed by moving the `<svg id="tl-wires">` element in `editor.html` to be a
   direct child of `#tl-stage`, and rewriting the endpoint math in `redrawWires()`
   to anchor on `stageRect` with `ar.bottom`/`br.top` (both endpoints — the
   manuscript side was already reading `br.top` correctly by coincidence, since the
   old zone's bottom edge and the manuscript strip's top edge are the same line, but
   the chron side had no such coincidence to save it).

Verified on a genuinely fresh origin (another stale-cache-driven server/port
restart): wires now visibly touch card edges in every storyline lane, not just the
bottommost; the offscreen scene from the Frankenstein set (id 25, "A Pursuit Across
the World") now gets a wire connecting its chron and manuscript cards, matching the
26-scenes-had-wires → 27 count after the fix.

**Frankenstein promoted to a permanent third sample project** (`frankenstein.json`,
`projects.js`) rather than staying a one-off scratch file — its Timeline-heavy shape
(frame narrative, multiple storylines, a real reveal-order conflict) makes it a
better everyday demo of what M1–M7 actually built than the two v2-derived samples,
whose chronological and manuscript orders are nearly identical. `ensureSampleProjects()`
previously assumed every sample file was v2 and always ran `migrateV2toV3()`; it now
accepts v3-native sample files as-is (v2 has nothing to migrate storylines/reveals/
anchors *from*), gated on `d.v`. `SAMPLES_VERSION` bumped 2→3 so existing installs
pick up the new sample on their next Projects-page visit. Verified end-to-end on a
genuinely fresh browser origin: Frankenstein auto-seeds with the `SAMPLE` badge
alongside the other two, with no manual import step, and opens with all 27 scenes/3
storylines/wires/conflicts intact.

**Post-M7, round 3 — chron strip lane clarity, from a user report of lanes "not
matching up with their names."** Investigated at length (multiple live reproductions
of add-storyline/delete-storyline/vertical-relane sequences, a full code read of
`_tlDrag`'s lane-drop targeting, `snapshot()`/`applySnapshot()`'s storylines
handling, undo/redo's render calls) and could not reproduce any actual data or
positioning bug — a systematic check comparing every one of Frankenstein's 27
scenes' real DOM `top` against its mathematically-expected lane position (derived
independently from `S.storylines`/`s.storylineId`) came back with zero mismatches
on a fresh, untouched import. The likely explanation, arrived at only after making
the same misreading myself first: with no color distinction between lanes and only
a thin dashed line separating them, it's easy to lose track of which row a card
belongs to when scanning a wide horizontally-scrolled strip — especially since a
single storyline's cards can appear at very different horizontal positions (early
vs. late scenes), which reads at a glance like "the same row's cards jumped to a
different lane" when they haven't. Fixed the ambiguity at its root rather than
chasing a bug that isn't there: `.tl-lane-row`/`.tl-lane-label` (`styles.css`,
`timeline.js`) now both carry a `--lane-c` custom property (`slColor(storyline.
paletteIndex)`, the same color already used for each card's own top border and the
wires) as a colored top border plus a faint `color-mix` background tint, so a card's
own color and its row's color are directly, visually comparable — confirmed
correct in both light and dark themes, and non-interfering with hover/flag
dimming.

While investigating, also found and fixed a real, reproducible bug in the same
area: chronology markers' labels (the "1793 — GENEVA & INGOLSTADT" year captions)
were invisible on every project that has any — not a z-index/stacking issue (fixed
that too, `.tl-markers-layer`'s z-index was `1`, below `.tl-scene`'s `2`, so a card
sitting at a marker's x-position fully hid it) but a genuine overflow clip: the
label sits `top:-15px` above its marker line, and the line's own `top:4px` put the
label 11px above `#tl-track`'s own top edge — entirely inside the region
`#tl-chron-scroll`'s `overflow-y:hidden` clips away, regardless of z-index (an
overflow clip and a stacking order are different mechanisms; raising z-index alone
didn't fix this). Changed the marker line's `top` to `20px`, leaving the label
comfortably inside the track's visible bounds. Confirmed visible in both light and
dark themes after the fix.

**Post-M7, round 4 — the lane-label round 3 fix was necessary but not sufficient;
the real bug was elsewhere.** After round 3's color-coding shipped, the user kept
reporting the same "lanes don't match their names" symptom, this time with a much
higher-resolution screenshot and, eventually, their actual exported project file
(imported and checked byte-for-byte against the running code — data was 100%
correct, zero mismatches, in a from-scratch session; confirmed a stale-cache theory
was wrong too, since the user had already re-tested in a private/incognito window).
The eventual breakthrough was a screenshot zoomed in enough to show the *label
column itself* visibly shorter than the row band it should exactly cover — a
question of label-vs-row alignment, not card-vs-lane color. Verified precisely:
`.tl-lane-label` elements were rendering at ~78px instead of their declared 92px,
while `.tl-lane-row` elements (and the cards within them) stayed exactly at 92px.
Root cause: `#tl-lane-labels` is a flex column, and `.tl-lane-label` — a flex
item — has no `flex-shrink:0`, so flex's default shrink-to-fit silently compresses
every label below its declared height the instant total lane height
(`laneCount×92`) exceeds `#tl-chron-body`'s available space (`max-height:55%` from
round 2's wires-zone fix, or just a shorter window). The track's own rows and cards
are absolutely positioned — immune to flex shrinking — so they stay exactly at
`i×92`, while the labels compress and *cumulatively drift*: label 1 lines up by
coincidence (both start at the container's top), label 2 is off by the shrink
amount, label 3 by double that, and so on — worse with every subsequent lane, which
matches the reports precisely. This is why it eluded round 3's testing: the color
verification checked card color/position against `S.storylines` math (always
correct), never label position against row position, and every test window used
happened to be tall enough to give labels their full 92px, so the shrink literally
never triggered in that testing. Fixed with one line — `flex-shrink:0` on
`.tl-lane-label` — so any excess now clips via `#tl-lane-labels`'
`overflow-y:hidden`, exactly like the track's rows already clip via
`#tl-chron-scroll`'s own `overflow-y:hidden`: the same failure mode on both sides
instead of a silent divergence between them. Verified via direct
`getBoundingClientRect()` comparison (label top/height now exactly matches its
row's, at both a normal window size and a deliberately squeezed 1000×500) and
visually — confirmed labels and rows now clip together at the same boundary under
pressure rather than drifting apart.

Also confirmed (unprompted, while helping diagnose): the right-click-on-empty-
track-space "Add marker here" flow still works correctly; the user's separate
question was about discoverability, not a bug — noted as a possible future
affordance (a "+ Marker" button beside "+ Storyline") but not built, since it
wasn't asked for.

**Post-M7, round 5 — round 4's `flex-shrink:0` fix broke the "+ Storyline" button**,
caught immediately by the user asking "where is it now?" `#tl-add-storyline-btn`
was always just the last child of `#tl-lane-labels`' flex column (an unused
`margin-top:auto` was always overridden by a later `margin:6px 8px 8px` shorthand
in the same rule, so it never actually auto-pushed to the bottom) — before round
4, flex-shrink was silently compressing the labels to make room for it; after
disabling that shrink, the button simply got pushed past `#tl-lane-labels`'
clipped bottom edge and became permanently unreachable the moment total lane
height filled the available space (not a rare case — happened on the very next
load of the 3-storyline Frankenstein project). Fixed by taking the button out of
the flex flow entirely: pinned as a floating `position:absolute` overlay at the
container's bottom edge, and reserved 40px (`BTN_RESERVE` in `timeline.js`) in
both the track's and the label column's own height so it no longer overlaps the
last lane's label either. The reserve is added identically to both containers, so
it doesn't reintroduce round 4's label/row divergence. Verified: no overlap at
normal and moderately small window heights (700–900px); at a deliberately extreme
500px-tall window, the button does clip — but that's `#tl-chron-body`'s
pre-existing `max-height:55%` cap clipping the same way it would clip actual lane
content in that scenario, not a new failure mode.

### Not yet done
Nothing outstanding from the M7 checklist itself. Still not merged to `main` —
stays on `thruLine_v1` per explicit instruction; main and all other branches are
untouched by this work.

## thruLine_v1 branch — Braid view (post-M7 addition)

Ports ThruLine's Braid view — a read-only "structure chart" (reading order on x,
story time on y, a cubic-bezier reading path that dashes upward for flashbacks) —
from `../Timeline`'s `updates_v1` branch, commit `5142a2b` ("M8: Braid view + light
theme repaint fix"), `js/braid.js`. This was explicitly out of scope for the M1–M7
spec (`SCENESETTER_V3_TIMELINE_SPEC.md` §14 listed it under "do not build," since
that spec had a fixed milestone list) — added now as deliberate new scope, same
"port and adapt from `../Timeline`" pattern as M4–M6.

**Architecture decision:** ThruLine has three mutually-exclusive editor view modes
(Side-by-Side / Manuscript / Braid); SceneSetter's Timeline view only ever
corresponds to "Side-by-Side" (chron strip + manuscript ribbon + wires shown
together, no mode switch existed). Rather than add a 5th top-level Cards/Snake/
Circle/Timeline view mode, Braid is a **toggle nested inside Timeline view** — a
small "Strip / Braid" segmented control in the Timeline header swaps the whole
stage body between the existing layout and the new chart, full-stage.

**Touched files:** `timeline.js` (all render logic, `renderBraid()` +
`_tlBraidThickenPaths()` + `setTlViewMode()` — lands inside this file rather than
a separate `braid.js`, matching how chron/wires/manuscript were ported here too),
`editor.html` (`#tl-view-switch` toggle, `#tl-braid-scroll`/`#tl-braid-svg`),
`editor-init.js` (toggle + empty-space-click wiring), `styles.css` (Braid section).

### How it works
- `tlBraidMode` (bool, module-level in `timeline.js`) is ephemeral like
  `chartMode` — not persisted, resets to Strip on every project open.
- `renderBraid()` is called unconditionally from `renderTimeline()` (alongside the
  existing chron/manuscript/wires calls) and no-ops via its own early return when
  Braid isn't the active sub-mode or `#tl-braid-scroll` reports zero size — same
  pattern the other render functions already use for elements that may not be
  visible. `redrawWires()` gets a matching early return when `tlBraidMode` is true,
  since Strip's wires are meaningless while Braid is showing.
- Reuses every piece of existing cross-view machinery rather than reinventing it:
  `slColor()`, `fmtAnchor()`, `highlightScene()`/`clearHighlight()` (generic
  `[data-scene-id="…"]` selector — needed zero changes for a new element type),
  `sceneHasWarning()`, flag-mode's `toggleFlagMode()`/`setFlagMode()` (also generic
  selector — braid nodes pick up `.tl-flag` automatically), and `tlSelectScene()`
  (`_tlDoSelectScene()` extended to include `.tl-braid-node` in its selection
  query).
- Two real adaptations beyond a mechanical port, both because SceneSetter's data
  model differs from ThruLine's: (1) `manuscriptOrder()` (this app's `msOrder`
  equivalent) includes offscreen scenes, unlike ThruLine's own `msOrder` which
  never did — the reading-order x-axis explicitly filters `!s.offscreen` to match
  ThruLine's visible behavior. (2) ThruLine's "dividers" (a separate act-break
  concept) don't exist here — sections fill that role already (per spec §14), so
  the vertical boundary ticks along the chart's top edge are computed by walking
  the filtered `manuscriptOrder()` for `sectionId` changes (the same pattern
  `renderManuscriptRibbon()`'s `lastSecKey` loop already uses) and colored with
  each section's own `.color` instead of ThruLine's single literal accent hex.
- The flashback-accent color (dark theme `#e0a458` / light theme `#b07a35`,
  ThruLine's literal per-theme hex, §9.5) picks its variant off the same
  `TL_DARK_THEMES` set `slColor()` itself already uses, rather than duplicating
  ThruLine's own light/dark test.
- Class names follow this app's `tl-`-prefixed convention throughout
  (`tl-braid-node`, `tl-hi`, `tl-sel`, `tl-flag`, `tl-warn`) rather than ThruLine's
  bare `braidNode`/`hi`/`sel`/`flag`.

### Verified live (not just read)
On the Frankenstein sample (27 scenes, 3 storylines, a genuine frame-narrative
flashback structure) and Pride and Prejudice (18 scenes, 5 sections/acts):
offscreen scene correctly absent from the x-axis (26/27 nodes) while still present
in chron/manuscript when toggled back to Strip; a real flashback segment rendered
dashed in the theme-correct accent color, confirmed by reading the computed
`stroke` value directly (`#e0a458` in slate, `#e0a458`→ hex match, not just
eyeballed); node click selects (`.tl-braid-node.tl-sel`, ring in `var(--acc)`,
confirmed via computed style) and opens the Inspector with the right scene;
toggling "show scenes" flag mode on a real conflict turned the two involved nodes
red at full opacity and dimmed the rest to 0.25 (confirmed via computed styles,
not just visually); switching theme (slate) while Braid was open repainted
storyline colors and the flashback accent correctly — turns out no explicit
refresh hook was needed here (unlike ThruLine, which had to fix this): SceneSetter's
`saveState()` already schedules a debounced `renderTimeline()` via
`scheduleConflictsRecompute()`, which now includes `renderBraid()` for free; window
resize reflowed `rowH` with no stale render; toggling back to Strip restored
chron+manuscript+wires and the axis switch/thread picker exactly, with the prior
selection preserved; 4 divider ticks rendered at Pride and Prejudice's 4 act
boundaries, each in that section's own color, confirmed by reading the actual
computed stroke values. Console clean throughout; no `innerHTML` used anywhere in
the new code (matches the existing `textContent`/`createElementNS` XSS-safe
pattern).

### Not yet done
Not merged to `main` — stays on `thruLine_v1` per the same explicit instruction
covering the rest of this branch's work.

## thruLine_v1 branch — Chron strip lane-row/offscreen polish

Two small Strip-view fixes reported directly from a screenshot after the Braid
work above: lane-row borders that appeared to "stop" partway across the row, and
offscreen scenes' labeling/differentiation.

### Lane-row border vs. wires
Investigated first as a possible layout bug — `getBoundingClientRect()` on every
`.tl-lane-row` confirmed each one genuinely spans the full track width (e.g.
3050px on the Frankenstein sample), so nothing was actually being clipped. The
apparent "stop" was an optical illusion: the row's `border-top: 2px solid
var(--lane-c)` is the same kind of thin colored stroke as the wire curves that
cross through the same area, so wherever several wires happened to overlap the
border, the eye read it as the border disappearing — which is also exactly the
user's separate complaint that the borders "look too much like the wires."
Fixed by replacing the flat border with a soft two-layer gradient
(`background-image`, `--lane-c` fading to transparent over 18px from both the
top and bottom edge into the row's own tint) — an area fill has no crisp edge to
confuse with a wire's stroke, so the same change addressed both complaints.
`timeline.js`/`renderChronStrip()` was untouched; this was CSS-only
(`.tl-lane-row` in `styles.css`).

### Offscreen tile differentiation
- Chron cards (`.tl-scene`) never actually got the `.tl-offscreen` class despite
  CSS already having a (dead) rule for it — offscreen was only signaled by
  appending `' · off'` to the date/meta line. Manuscript cards (`.tl-ms-card`)
  had a real `.tl-off-chip` div, but its text was the bare word `off`.
- Both card types now get `.tl-offscreen` (chron cards newly, ribbon cards as
  before) plus a `.tl-off-chip` reading **"Offscreen"** (not `off`/`OFFSCREEN`
  — dropped the chip's `text-transform:uppercase` so the label reads exactly as
  written); the chron card's old inline `' · off'` append is gone.
- Both card types get dotted left/right side borders
  (`border-left/right:2px dotted var(--o0)`) so an offscreen tile is
  recognizable independent of its chip text.

### Verified live
On the real offscreen scene in the Frankenstein sample ("A Pursuit Across the
World"): both its chron card and its manuscript card show the dotted side
borders and the "Offscreen" chip (confirmed via computed styles, not just
visually); each `.tl-lane-row`'s `background-image` confirmed present and keyed
to that lane's own color. Console clean.

### Not yet done
Not merged to `main` — same standing instruction as the rest of this branch.

## thruLine_v1 branch — Timeline Inspector panel polish (fields, dirty-state buttons, click-off guard, delete, collapsible)

A round of usability fixes for the Timeline Inspector, all user-requested directly
against the running app rather than a spec.

**Touched files:** `editor.html` (field ids, `#tl-panel` restructured for
collapse, new delete-scene footer), `styles.css` (field hiding, caret size,
disabled-button styling, panel/strip CSS, delete-button styling),
`timeline.js` (footer/button-state helpers, click-off-panel discard guard,
close-mode button reset), `editor-init.js` (new button wiring, delegated
dirty-check listener), `editor.js` (`deleteScene()` extended for Timeline).

### What changed
- **Hidden fields**: Themes, Misc Items, Word Count, POV, and Notes are hidden
  in the Inspector's Edit Scene form via `body.tl-mode #ed-*-field{display:none}`
  — the fields themselves (and their ids) are untouched, so board's own Edit
  Scene tab (the same shared `#form-edit` node) still shows all of them
  normally; only Timeline's CSS scope hides them.
- **Collapsible-group carets**: `.ffg-car` (the ▾ beside "Timing"/"Reveals")
  went from 9px to 11px, matching `.ffg-hdr`'s own font-size exactly.
- **Cancel/Save Changes dim when clean**: both buttons get a real `disabled`
  attribute, toggled by a new `refreshTlSaveCancelState()` (guarded on
  `timelineMode`, so it can never touch board's identical-id buttons) that
  reads the existing `isEditFormDirty()`. A delegated `input`/`change`/`click`
  listener on `#form-edit` (in `editor-init.js`) keeps it live against every
  field, checkbox-dropdown toggle, and the Anchor "Clear" button; leaving
  Timeline mode explicitly clears both buttons' `disabled` attribute so it can
  never leak into the board's own form.
- **Freeze on scroll**: turned out to already exist — `.cp-form-hdr` was
  already `flex-shrink:0` above the independently-scrolling `.cp-form-fields`
  (both inside and outside Timeline), confirmed by scripting a scroll and
  checking the header's `getBoundingClientRect()` didn't move. No change
  needed.
- **Click-off-panel discard guard**: mirrors the board view's global "cancel
  edit on click outside `#cp`" `mousedown` listener, previously Timeline-only
  covered the empty-space clicks on the chron/manuscript/braid scroll
  containers (each already routed through `tlSelectScene()`'s
  `runWithDiscardGuard`). The new listener catches everything else outside
  `#tl-panel` — header controls, zoom, tabs, blank stage chrome — that had no
  guard at all before. It explicitly skips scene cards and the three scroll
  containers so it doesn't pre-empt their own more-specific reselect action
  with a generic "just deselect."
- **Delete Scene**: a new footer button (visible only on the Inspector tab
  with a scene open) calls the existing `deleteScene()` — unchanged rather than
  duplicated, since it was already schema-v3-aware (chronOrder/marker/
  constraint cleanup) and already shows a native `confirm()` "certainty alert."
  `deleteScene()` gained one small Timeline-specific addition, the same idiom
  M5's undo/redo fix used: call `renderTimeline()` and reset the Inspector
  selection (`_tlDoSelectScene(null,{})`) when `timelineMode` is active, since
  `renderBoard()` alone doesn't touch Timeline's separate render tree and would
  otherwise leave a stale, orphaned form open on a just-deleted scene.
- **Collapsible panel**: `#tl-panel` now uses the same `.panel`/`.p-strip`/
  `.p-content` structure as the Library/Sections/Scene panels, reusing the
  existing generic `togglePanel()`. Required switching `#tl-panel` from
  `flex:0 0 300px` to `width:300px;flex-shrink:0`, since a flex-basis wins over
  `width` in the sizing algorithm and would have silently blocked the shared
  `.panel.collapsed{width:28px!important}` rule from taking effect. The
  collapsed strip's divider was flipped to `border-left` (from the other
  panels' `border-right`), since this panel sits at the right edge of the
  window instead of the left.

### Verified live
On the Frankenstein sample: confirmed via computed styles that the five fields
are actually `display:none` in Timeline but unaffected on board; confirmed
Cancel/Save `disabled` is `true` on a freshly-opened clean scene and flips to
`false` the instant a field changes (dispatched a real `input` event, not just
inspected code); clicking a header control (the zoom slider) while dirty opened
the same discard-confirm dialog board view uses, and clicking a *different*
scene card while dirty did too — confirming Discard on the latter correctly
switched to the newly-clicked card rather than just deselecting; deleted a real
scene (patched `window.confirm` to simulate acceptance, since this environment
auto-suppresses native dialogs as `false` — confirmed that suppression itself
is what made the *first*, unpatched click correctly do nothing) and confirmed
the scene count dropped, the chron/manuscript views both dropped its cards, and
the Inspector reset to the empty state; collapsed and re-expanded the panel via
both the collapse button and the strip button, confirming the stage reclaims
the freed width and the panel returns to exactly 300px. Console clean
throughout except the environment's own expected native-dialog-suppression
notice.

### Not yet done
Not merged to `main` — same standing instruction as the rest of this branch.

## thruLine_v1 branch — Strip/Braid/Thread polish round

Another round of direct, user-driven fixes across Strip view, Braid view, the
Timeline header, and the character thread feature.

**Touched files:** `editor.html`, `styles.css`, `timeline.js`, `editor-init.js`.

### Strip view (Inspector panel)
- `.ffg-car` (the Timing/Reveals ▾) went from 11px to 16px — matching the
  header's own font-size still read visually smaller than the letters, since
  the glyph itself doesn't fill its em box the way text does.
- The Inspector panel's collapse button (◀) moved to the *left* of the
  "Inspector" label (previously matched `#cp`'s own convention of trailing
  the tabs; this panel diverges on purpose per direct request).
- Inspector/Conflicts now reuse the app's real `.tabs`/`.tab` classes (the
  same folder-tab look as New Scene/Edit Scene) instead of a bespoke flat
  underline style — the old `.tl-panel-tabs`/`.tl-panel-tab` CSS rules were
  removed outright (superseded), keeping only the ids for JS state.

### Braid view
- Removed the per-column "Sc n" tick row under "READING ORDER →" — each node
  already shows its own number, so the tick row was pure duplication.
- The Y-axis label changed from "STORY TIME ↓" to "CHRONOLOGY", with the ↓
  pulled out of the rotated text run into its own unrotated `<text>` element
  positioned just past the label's own end — the arrow previously rotated
  along with the string and ended up pointing sideways instead of down.
  Placement math: `getBBox()` on the (still-attached) rotated label reads its
  *pre-rotation* horizontal width; halving that gives the offset from `leftY`
  to the label's rotated bottom edge, which a `rotate(-90 …)` puts at the
  string's first character (confirmed both by the rotation math and by
  reading the rendered element's actual coordinates live).
- Era-marker labels ("1793 — GENEVA & INGOLSTADT" etc.) moved out of the SVG
  into a new HTML overlay (`#tl-braid-markers-hud`, absolutely-positioned
  divs) so they can stay pinned to the visible left edge during horizontal
  scroll (`tlBraidUpdateMarkerHud()`, wired to the scroll container's own
  `scroll` event) — the dashed boundary *line* stays in the SVG and scrolls
  normally, only the label needed to stay legible. A plain CSS
  `position:sticky` wasn't reliable here since each label's vertical position
  comes from an individually-set `top`, not normal document flow, so this
  recomputes the offset directly against `scrollLeft` instead.

### Timeline header
Removed the "+ Scene" button entirely — "Create → New Scene" (menu item and
Alt+N) already detects `timelineMode` and calls the exact same `tlCreateScene()`
the button called (`menuNewScene()`, `editor.js`), so nothing was lost; verified
scene creation still works via the menu.

### Character thread trace
- The trace line now draws with a light dash-dot-dash pattern
  (`stroke-dasharray:"7 3 1.5 3"`, thinner stroke, `.7` opacity) instead of a
  bold solid line, and `#tl-thread-svg`'s z-index moved above `.tl-scene`'s
  (4 vs. 2) so the line now floats over the cards rather than hiding behind
  them — the lighter stroke keeps a floated line from blocking card content.
- `#tl-thread-sel` gets a glow (`box-shadow`, accent color) whenever a
  character is actively traced, toggled by a new `updateTlThreadSelActive()`
  called from both `renderThreadPicker()` (render pipeline) and
  `setTlThread()` (immediate, on the user's own selection change).

### Verified live
On the Frankenstein sample: caret/tab/collapse-button placement confirmed via
computed styles and screenshots at both normal and narrow window widths;
Braid's "CHRONOLOGY ↓" confirmed via each text element's actual `x`/`y`/
`transform` attributes (arrow unrotated, positioned past the rotated label's
real end); scrolled the Braid chart 400px right and confirmed the era-marker
labels stayed pinned to the left edge while the dashed lines and nodes scrolled
normally; confirmed no `#tl-add-scene-btn` remains and that Create → New Scene
still creates a scene correctly (27 → 28, undone back to 27); selected a
character thread and confirmed via computed styles the trace path's dasharray/
opacity/z-index and the selector's glow `box-shadow`, then cleared the
selection and confirmed the glow class comes off. Console clean throughout.

### Not yet done
Not merged to `main` — same standing instruction as the rest of this branch.

## thruLine_v1 branch — Braid legend/label fixes, thread line revision, Strip row captions, auto-fit zoom

Another direct-feedback round, the biggest piece being a redesign of the
Timeline zoom slider's semantics.

**Touched files:** `editor.html`, `styles.css`, `timeline.js`, `editor-init.js`,
`state.js`, `projects.js`, `frankenstein.json`.

### Braid fixes
- The era-marker HUD (previous round's fix) was pinned at `scrollLeft+12` —
  close enough to the rotated "CHRONOLOGY" axis label (which sits at x≈18) to
  land directly on top of it whenever a marker fell near vertical center at
  `scrollLeft:0`. Moved to `scrollLeft + BRAID_LEFT + 4` (where the dashed
  marker line itself starts, past the axis label's own margin) — same
  frozen-on-scroll behavior, no more collision.
- The ↓ arrow (added last round, below "CHRONOLOGY") wasn't visually centered
  — the unicode glyph's own side bearings aren't symmetric in every font.
  Replaced with a hand-drawn stem + triangle (`<line>` + `<polygon>`), both
  built from `18±4` around the same x=18 the label itself is centered on —
  confirmed via the actual rendered coordinates, not just visually.
- Added `#tl-braid-legend`: a swatch + name per storyline, always visible
  above the scrollable chart (not inside it, so it can't scroll away). Reuses
  the Flow Chart's own `.chart-legend-item`/`-swatch`/`-name` classes rather
  than a new bespoke style.

### Strip view: row captions
Added two centered captions inside `#tl-wires-zone` (already `position:
relative`, previously empty): "Chronology — when it happened" pinned to its
top edge (just below the storyline lanes) and "Narrative — what the reader
gets" pinned to its bottom edge (just above the manuscript ribbon). Both
`pointer-events:none`, hidden automatically along with the rest of Strip's
chrome while Braid is active (`#tl-wires-zone` already display:none there).

### Thread trace line — revised
Last round changed this to a dash-dot-dash line; this round replaces that
with the user's refined direction: solid, thicker (`stroke-width` 1.6→5), and
more translucent (`opacity` .7→.4) so card text stays readable underneath it;
the per-scene dot grew from r=3.5→7 and also dropped its solid border for the
same translucent fill (`opacity` .4).

### Timeline zoom — auto-fit at the low end
The zoom slider used to be a direct 70-200px/scene control. It's now a 0-100
*position* (`S.timelinePrefs.zoomPos`, replacing the old persisted
`pxPerScene` field in `state.js`/`projects.js`/`frankenstein.json`) that maps
piecewise: **0** = fit every scene into the chron strip's current width with
no overlap and no horizontal scroll, recomputed live against the real
container width and scene count (`tlZoomFitPx()`) rather than a frozen
number, so it stays fit-to-window across resizes and scene add/delete;
**50** (the new midpoint) = the feature's original fixed minimum, 70px/scene;
**100** = the original fixed maximum, 200px/scene — so the slider's upper half
reproduces the exact density range that existed before this change.
`tlCurrentPxPerScene()` is the single function every layout call site now
reads through (`chronTrackWidth()`, the chron strip's own card width, the
manuscript ribbon's card width) instead of reading `S.timelinePrefs.pxPerScene`
directly.
- Chron strip cards were a flat 96px regardless of zoom (only the *pitch*
  between them changed) — at the new auto-fit low end that let fixed-width
  cards overlap even once their pitch had shrunk well below 96px. Card width
  is now `Math.max(28, Math.min(96, pxPerScene-10))` — unchanged (96px) for
  the whole pre-existing 70-200 range, only shrinking further once the slider
  is pushed into new auto-fit territory below the midpoint.
- The manuscript ribbon's card width had a hard 70px floor (`Math.max(70,
  pxPerScene-14)`) that would have kept cards wider than their own pitch under
  auto-fit for the same reason; floor lowered to 28px.
- `tlZoomFitPx()` itself is floored at 38px (`TL_ZOOM_MIN_CARD_PX+10`) — past
  the point where even the smallest readable card can't fit everyone in the
  current width, `chronTrackWidth()`'s own `Math.max(containerW, …)` takes
  over and allows horizontal scroll for the excess, rather than shrinking
  cards into unreadable overlap just to avoid a scrollbar. Confirmed live:
  at a narrow window (27-scene Frankenstein sample, ~850px available) the
  floor kept the track wider than the viewport (scroll still needed); at a
  wide window (1600px) the track resolved to *exactly* the container's
  width with zero scroll and zero overlap.
- Double-clicking the slider knob resets to 50 (today's typical density) —
  wired as a plain `dblclick` listener, confirmed live.
- `state.js`/`projects.js` updated in every place `timelinePrefs` is
  seeded, loaded/validated (both the tolerant `loadState()` path and the
  strict `validateV3Import()` used by JSON import), and default-constructed;
  `frankenstein.json`'s stored prefs updated from `pxPerScene` to `zoomPos`
  directly rather than left to fall back to the default on next load.
  Confirmed: a re-exported-shaped project with the new field passes
  `validateV3Import()` cleanly; one with the old `pxPerScene` field is
  rejected with a clear, specific message (expected — a genuine schema
  change, not a bug, and this branch has never been merged/exported to real
  users yet).

### Verified live
On the Frankenstein sample: read the actual rendered arrow/stem coordinates
to confirm true geometric centering (not just eyeballing); confirmed the
marker HUD no longer overlaps the axis label at `scrollLeft:0`; confirmed the
Braid legend lists all three storylines with their real colors; confirmed
both row captions render and read correctly; confirmed the thread line's
actual `stroke-width`/`opacity`/`stroke-dasharray` (now `null`) and circle
`r`/`opacity` via computed attributes; confirmed `zoomPos` round-trips through
`setTlZoom()`/`tlZoomSliderToPx()` correctly (50→70px exactly, matching the
old fixed minimum); confirmed auto-fit (`zoomPos:0`) genuinely eliminates
horizontal scroll once the window is wide enough for the scene count, and
gracefully falls back to a (still non-overlapping) scroll when it isn't.
Console clean throughout.

### Not yet done
Not merged to `main` — same standing instruction as the rest of this branch.

## thruLine_v1 branch — Zoom slider tick, freeze fix, panel arrows, Braid arrow/legend/zoom

Follow-up fixes from live feedback on the previous round, including two real
bugs (the freeze not actually engaging, and the arrow-centering fix from last
round still being off) rather than just new polish.

**Touched files:** `editor.html`, `styles.css`, `timeline.js`.

### Strip view
- **Cancel/Save Changes + Title weren't actually frozen.** The prior round's
  claim that `.cp-form-hdr{flex-shrink:0}` was sufficient turned out to be a
  false negative — that test's form was short enough that nothing ever
  overflowed *either* container, so it never exercised the real failure mode.
  The actual bug: `#tl-inspector-body` had no bounded height of its own, so
  `#form-edit` (a plain block child) just grew to fit its full content, never
  giving `.cp-form-fields` anything to overflow *inside itself* — instead
  `#tl-inspector-body`'s own `overflow-y:auto` (from the shared
  `.tl-panel-body` rule) was the one actually engaging, scrolling the whole
  form, header included. Fixed by making `#tl-inspector-body` itself
  `display:flex;flex-direction:column;overflow:hidden` and giving
  `#form-edit` (`.p-body`) `flex:1;min-height:0` so it's bounded to exactly
  the available height — confirmed live by comparing `scrollHeight`/
  `clientHeight` on both containers before and after, and by scrolling 300px
  and checking the header's `getBoundingClientRect()` truly doesn't move.
- **Title field frozen too** — `position:sticky;top:0` on the Edit form's
  first `.ff` (Title), scoped to `#tl-inspector-body` only, so the board's own
  Scene panel (same shared `#form-edit` node) is untouched.
- **Zoom slider center tick** — a small `.tl-zoom-tick` mark at the wrapper's
  horizontal midpoint, marking the slider's 50 position (the feature's
  original fixed density) visually.
- **Thread line/dot**: color changed from the accent to a literal neutral
  grey (`#888c93`, deliberately not a theme var — the ask was for *neutral*,
  not theme-tinted), and opacity dropped further (.4→.32) for "slightly more
  translucent."
- **Panel arrow direction was backwards.** `#tl-panel` sits at the *right*
  edge of the window, but its collapse/expand triangles used the Library/
  Sections panels' own left-edge convention verbatim (▶ to expand, ◀ to
  collapse) — correct for a left-mounted panel, backwards for a right-mounted
  one. Swapped: ◀ now expands (points into the workspace), ▶ now collapses
  (points toward the panel's own edge).

### Braid view
- **The arrow was still off-center after last round's fix** — the previous
  version *computed* an assumed center (x=18, the rotation pivot) rather than
  measuring the actual rendered result, and that assumption was wrong: for
  rotated text, the `x` attribute positions the **baseline**, not the visual
  center, and glyphs sit asymmetrically around a baseline — confirmed live by
  reading the label's real `getBoundingClientRect()` center (14px) against
  the assumed pivot (18px), a 4px gap that exactly matches what was visible
  in the screenshot. Fixed by measuring the label's actual rendered box
  (`getBoundingClientRect()`, post-rotation, converted into the SVG's own
  coordinate space via the svg element's own rect) instead of assuming
  geometry, and centering the hand-drawn arrow on that measured value —
  verified the arrow's own coordinates now match the label's measured center
  exactly, not just visually.
- **Legend swatches are now rings, not bars** — a new `.tl-braid-legend-swatch`
  (a circle with a colored border and `--cbg` fill) replacing the reused
  Flow-Chart bar swatch, matching the chart's own node styling instead.
- **Zoom now actually does something in Braid** — previously the slider was
  visible but inert there (Braid's column spacing was a hardcoded constant,
  93px, never read from the zoom preference at all). Added a Braid-specific
  mirror of the Strip zoom mapping (`tlBraidZoomFitDx()`/`tlBraidColDx()`,
  same shared `S.timelinePrefs.zoomPos`, same 0=fit/50=original-default/
  100=max shape, just against Braid's own container width and column count).
  `braidColX()` now reads a module-level `_braidColDx` recomputed once per
  `renderBraid()` call rather than a fixed constant, so every call site
  (gridlines, nodes, paths, dividers, label-flip check) picks it up with no
  further changes needed. **Caught and fixed one bug while verifying this**:
  the initial fit formula had a stray `+ BRAID_ZOOM_MID_DX` term that made
  `zoomPos:0` overshoot the container width instead of matching it exactly
  (1593px content in a 1500px viewport) — found by directly comparing
  `#tl-braid-scroll`'s `scrollWidth` against its `clientWidth`, fixed by
  aligning the fit formula exactly with `renderBraid()`'s own `contentW`
  calculation, and reverified: `scrollWidth === clientWidth` exactly at
  `zoomPos:0` once the window has room, same graceful degrade-to-scroll as
  Strip when it doesn't.

### Verified live
On the Frankenstein sample, after a genuine page reload (not just a
re-render) to rule out stale-script false positives: all of the above
re-confirmed via computed styles, actual element coordinates, and
scrollWidth/clientWidth comparisons rather than visual impression alone.
Console clean throughout.

### Not yet done
Not merged to `main` — same standing instruction as the rest of this branch.

## thruLine_v1 branch — Thread color, zoom-tick contrast, Title/Summary spacing, Inspector menu item

**Touched files:** `editor.html`, `styles.css`, `timeline.js`, `editor.js`,
`editor-init.js`.

### Strip view
- Thread line/dot color changed from neutral grey to a literal very light red
  (`#e57373`), opacity unchanged (.32, still translucent).
- Zoom slider tick was hard to see, especially on dark themes — went from 1px/
  `var(--o0)` to 2px/`var(--tx)` (the theme's own high-contrast ink color) plus
  a 1px `var(--bg0)` halo, so it reads clearly against the native track's own
  grey on both light and dark themes.
- **Title field had an unintended white box.** Last round's sticky-Title fix
  gave the sticky element `background:var(--cbg)` (the card/input tone,
  noticeably lighter than the panel) so scrolled content couldn't peek through
  underneath it — that choice is what created the "unnecessary white bg."
  Switched to `var(--bg1)` (the panel's own ambient tone) so it blends in
  seamlessly; confirmed via computed `backgroundColor` that it now matches
  `#tl-panel`'s own background exactly. Also dropped the padding-top/negative-
  margin trick from that fix (unneeded — `.cp-form-fields` already has zero
  top padding, so there was nothing above the sticky element left to cover).
- **Summary now has breathing room and a divider above it** —
  `#ed-summary-field` (a new id on that field's wrapper, Timeline-scoped) gets
  `border-top` + `margin-top`/`padding-top`, matching the same divider
  convention the Timing/Reveals `.ffg` groups already use.

### Timeline view
Added "Show/Hide Inspector Panel" to the View menu, right after "Show/Hide
Timeline View" (Inspector is Timeline's own panel, so it's grouped with that
rather than the board's Library/Sections/Scene panel toggles above it — whose
inverse relationship it mirrors exactly: `updateMenuForMode()` now disables
this new item whenever `timelineMode` is false, the same way it already
disables the board panel toggles whenever `timelineMode` is true).
`updateTlPanelMenuState()` flips its label between "Show"/"Hide" same as
`updatePanelMenuStates()` does for the others, called both after the toggle
and whenever the View menu opens. Reuses the existing `togglePanel('tl-panel')`
— no new collapse mechanism needed.

### Verified live
On the Frankenstein sample: thread line's actual `stroke`/`opacity` attributes
confirmed; zoom tick's computed background/box-shadow confirmed on both ivory
and slate; Title's computed background confirmed to exactly match the panel's
own (no more visible box); Summary's `border-top` confirmed present; the new
menu item toggles the panel, updates its own label correctly, and is properly
enabled only in Timeline mode / disabled in board mode (checked both
directions). Console clean throughout.

### Not yet done
Not merged to `main` — same standing instruction as the rest of this branch.

## thruLine_v1 branch — View-toggle unification (Loom/Path), View menu overhaul, Conflicts-panel filtering, section dividers

The largest round yet: unifies the Cards/Snake/Circle/Timeline view switch
that used to live only on the board into one control shared by all three
views, renames Strip/Braid to **Loom**/**Path** with new icons as part of
that same control, reworks the View menu's mode section into direct
switch-to items, makes the Conflicts panel follow scene selection, and adds
real vertical section dividers to Path (Braid).

**Touched files:** `editor.html`, `styles.css`, `timeline.js`, `charts.js`,
`editor.js`, `editor-init.js`, `conflicts.js`.

### View-toggle unification
`#view-toggle` (Cards/Flow/Timeline, previously reparented only between
`#sbhdr` and `#chart-toolbar` via `openChartView()`/`closeChartView()`) now
also reparents into `#tl-chron-hdr` on `_openTimelineViewImpl()` and back to
`#sbhdr` on `_closeTimelineViewImpl()` — the exact same move-not-clone
pattern Flow already used, so it keeps its listeners/state intact and now
appears atop all three views identically, not just Cards and Flow.
- Timeline's own item now spans two icon buttons, like Flow's Snake/Circle:
  **Loom** (`#tl-view-loom`, replacing the old single Timeline icon and the
  in-header "Strip" button) and **Path** (`#tl-view-path`, replacing
  "Braid"). New icons: Loom is two crossed curved strands plus a straight
  vertical (a woven-wires read); Path is a horizontal sine-wave squiggle
  with four evenly-spaced beads sitting on it.
- The old `#tl-view-switch` (Strip/Braid buttons inside `#tl-chron-hdr`) is
  gone entirely — superseded by the shared control. `setTlViewFromToggle()`
  is the new entry point Loom/Path call: opens Timeline first (guarded, via
  `_openTimelineViewImpl`) if it isn't already active, then switches the
  sub-view; if Timeline's already open, it just switches. `updateViewToggleUI()`
  (the single source of truth for all the toggle's on/off states) grew two
  more lines for Loom/Path instead of the old bare Timeline icon.

### View menu overhaul
- "Hide Inspector Panel" moved from the bottom of the menu (grouped with
  Chart/Timeline toggles) up to directly below "Hide Scene Panel" — now
  grouped with the other panel toggles it belongs with, still above the
  "Hide All Panels" divider.
- The old two-item "Show Scene Flow Chart" / "Show Timeline View" toggle
  pair (dynamic Show/Hide text) is now three stacked, always-labeled items —
  **Card Board**, **Scene Flow Chart**, **Timeline** — each a direct
  switch-to action rather than a toggle, with the currently-active one
  disabled/greyed (mirroring how the board's own panel-toggle items already
  grey out during Timeline mode). `updateViewMenuActiveStates()` (new,
  timeline.js) is the single source of truth, called from `openChartView()`/
  `closeChartView()`, `_openTimelineViewImpl()`/`_closeTimelineViewImpl()`,
  and whenever the View menu opens. `setChartMenuLabel()`/
  `setTimelineMenuLabel()` (the old dynamic-label functions) are gone,
  superseded by this.

### Conflicts panel follows scene selection
Selecting a scene now tees up the Conflicts tab with just that scene's own
conflicts, ready the moment the user clicks over to it — `renderConflictsPanel()`
filters `getActiveConflicts()`/`getDismissedConflicts()` by
`c.sceneIds.includes(tlSelectedId)` unless showing everything. "Showing
everything" is true when nothing's selected, or when the user explicitly
clicks the red "Conflicts (N)" badge (`tlShowAllConflicts()`, a new function
that sets `_tlConflictsFilterOverride` before switching to the tab) — any
subsequent selection (including deselecting) clears that override via one
new line in `_tlDoSelectScene()`, so the panel goes back to following
whatever's selected. An empty filtered result reads "No conflicts involve
this scene." instead of the generic "No conflicts found."

### Path (Braid) view: vertical section dividers
The existing short top-edge section-boundary ticks (added earlier this
branch) are now full-height dashed vertical lines spanning the whole chart
(`y1:42` to `contentH-16`), still colored per-section and still appended
before the path/node layers so they read as background structure.

### Narrative-row section label moved below
`.tl-sep-label` (the section name shown on the manuscript ribbon's existing
dividers) moved from `top:-15px` to `bottom:-15px`; `#tl-ms-row`'s bottom
padding grew from 8px to 22px to give it room.

### Other fixes from this round
- Thread selector glow (`.tl-thread-active`) now uses the trace line's own
  literal color (`#e57373`) instead of the accent, with a wider/stronger
  glow.
- Zoom slider now has a visible center tick (previous round); this round
  fixes the actually-reported issues around it separately (see the two
  entries above this one).
- New `--lbl` CSS custom property per theme — equal to `--o0` on the three
  light themes, a genuinely brighter literal color on slate/ocean
  specifically — applied to `.tl-row-caption`, `.tl-braid-marker-label`,
  `.tl-marker-label`, `.tl-gap-label`, and the Braid axis/arrow SVG labels
  (`timeline.js`). Chrome-wide `--o0` usage elsewhere in the app (buttons,
  hints, placeholders) was deliberately left alone — this was scoped to the
  Timeline/Braid label text this conversation had been building.

### Verified live
On both the Frankenstein (no sections) and Pride and Prejudice (5 sections)
samples: clicked Loom/Path/Cards/Snake from every other view to confirm the
shared toggle reparents and switches correctly in both directions; opened
the View menu and confirmed Inspector's new position, and that Card
Board/Scene Flow Chart/Timeline show the correct one disabled in each of the
three modes; selected an uninvolved scene and confirmed the Conflicts tab
read "No conflicts involve this scene," selected the actually-involved scene
and confirmed the real conflict appeared, then clicked the badge with the
uninvolved scene still selected and confirmed it forced "show all," then
selected a new scene and confirmed the override cleared — all via direct
state/DOM inspection, not just visual read; confirmed Path's dividers are
real full-height lines (`y1`/`y2` read out at the chart's actual top/bottom)
in each section's own color; confirmed the Narrative-row label's computed
`bottom`/`top` moved as intended; confirmed `--lbl` reads a genuinely
different, brighter value than `--o0` specifically on slate; confirmed the
thread selector's glow color matches the trace line's literal hex exactly.
Console clean throughout.

### Not yet done
Not merged to `main` — same standing instruction as the rest of this branch.

## thruLine_v1 branch — Loom scroll affordances, move-confirmation, contrast fixes, icon redraw

**Touched files:** `editor.html`, `styles.css`, `timeline.js`, `editor.js`,
`editor-init.js`.

### Contrast/sizing fixes
- Storyline lane label's scene count (".tl-lane-label i") was `var(--o0)` at
  9px/400 weight — hard to read in both light and dark themes, since --o0 is
  meant for faint chrome, not something worth reading. Switched to `var(--sub)`
  (already theme-calibrated for readable secondary text) at 9.5px/600 weight.
- "Also part of" dots (`.tl-conv-dot`) grew 6px→9px and gained a dark
  `box-shadow` ring on top of the existing `--cbg` border — the border alone
  wasn't enough separation from a light theme's own light card background.

### Title/Summary divider — actually frozen now
The divider added last round lived on Summary's own `border-top`, inside the
*scrolling* region — it scrolled away with Summary, leaving the frozen Title
area with no visible boundary a moment after any scroll. Moved to the sticky
Title element's own `border-bottom` instead, confirmed via
`getBoundingClientRect()` before/after a 200px scroll that it doesn't move.

### Loom view: scroll affordances
- Trackpad two-finger swipes past a row's horizontal scroll limit were
  triggering the browser's own back/forward navigation gesture —
  `overscroll-behavior-x: contain` added to `#tl-chron-scroll`, `#tl-ms-scroll`,
  and `#tl-braid-scroll` stops the scroll from "escaping" the container.
- Native scrollbars hidden on the chron and manuscript rows
  (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`), replaced
  with small bubble scroll-arrow buttons (`.tl-scroll-arrow`) for trackpad-less
  users — one pair per row, absolutely positioned over a new wrapper element
  (`#tl-chron-scroll-wrap`/`#tl-ms-scroll-wrap`, since buttons living *inside*
  the scrolling element itself would scroll away with its content), shown only
  on whichever side there's actually more to see
  (`tlUpdateScrollArrows()`/`_tlUpdateScrollArrowPair()`, called after every
  render and on scroll). Verified the visibility logic directly (both arrows
  present in the middle of a scrollable row, only the trailing one at either
  end) — real click-driven `behavior:'smooth'` scrolling doesn't animate in
  this preview tool specifically (a documented environment quirk elsewhere in
  this project too), so the actual scroll-by-page math was verified with a
  temporary `behavior:'auto'` override instead, confirming the right button
  moves `scrollLeft` by the correct page amount.

### Move confirmation (chron drag)
Dragging a scene in Loom (horizontal reorder or vertical re-lane) used to
commit immediately on drop. `_tlDragFinish()` now stops short of committing —
it stores the computed change (`_tlPendingMove`) and opens a new
`#tl-move-cfm-modal` ("Save this move — changing '<title>' (when it
happens/which storyline it belongs to)?") instead. **Save**
(`tlConfirmMoveSave()`) applies exactly what `_tlDragFinish()` used to do
inline (`pushHistory`, mutate, `recordDataEdit`, `saveState`, `renderTimeline`).
**Discard** (`tlConfirmMoveDiscard()`) does nothing — the real card was never
actually moved during the drag (only a ghost tracked the cursor), so simply
not applying the pending change leaves `S` and the render exactly as they
were. Wired into the shared modal machinery: added to `MODAL_IDS` (Alt-shortcut
gating) and `ESCAPE_ACTIONS` (Escape discards, same as clicking the backdrop).
Verified directly: simulated a drag-finish, confirmed `S.chronOrder`
unchanged while the modal is open, confirmed Discard leaves it unchanged, and
confirmed Save commits exactly the expected reorder (undoable via the normal
undo stack).

### Icon redraw (Loom/Path)
Simplified per a hand sketch: Loom is now just two crossing curved strands (no
third straight line), Path is a jagged zigzag with a bead at each vertex
(replacing the smooth sine-wave/bead version from the previous round).

### Verified live
On the Frankenstein sample: computed styles for the lane-count color/weight
and conv-dot size/shadow; Title/Summary divider position and freeze behavior;
`overscroll-behavior-x`/`scrollbar-width` computed values; scroll-arrow
visibility state at both a scrolled-to-start and scrolled-to-middle position;
the full move-confirm flow (open → discard → re-open → save → undo). Console
clean throughout.

### Not yet done
Not merged to `main` — same standing instruction as the rest of this branch.

## thruLine_v1 branch — Loom/Path direct-feedback round: selection, drag, Conflicts panel, True-scale fixes

Two back-to-back rounds of direct, user-driven fixes across Loom/Path, the
Conflicts panel, and Chronology True scale — the largest single batch since
the view-toggle unification. **Touched files:** `timeline.js` (bulk of the
logic), `conflicts.js` (panel rewrite), `editor.html` (icons, toolbar
markup), `styles.css` (throughout).

### Selection & Inspector
- Clicking a Loom card or Path/Braid node now expands the Inspector panel if
  it's currently collapsed (`_tlDoSelectScene` calls `togglePanel('tl-panel')`
  when needed) — previously the selection happened but stayed hidden behind
  the collapsed strip.
- Clicking off a selected card now actually deselects everywhere, including
  empty space *inside* a chron lane row — the click handler on `#tl-track`
  used to require `e.target === track` exactly, which a lane-row's own
  background (a full-row absolutely-positioned div) never satisfies since
  it's a distinct element. Now any bubbled click (cards call
  `stopPropagation()` on their own) deselects.
- Selected-card styling now reuses hover's exact treatment (same
  `var(--c, var(--acc))` color source) at a heavier ring (3px vs 1px) instead
  of a hardcoded `var(--acc)` that read as a different color; `redrawWires()`
  gives the selected scene's wire the same full-opacity/heavy-width
  treatment as a hovered one, persisting even while a *different* card is
  being hovered.

### Storyline palette
Index 2 (purple) was `#a78bfa`/`#7b5ea7` — too close to index 0's blue at
small sizes (dots, thin wires). Shifted toward magenta (hue ~285) for real
separation.

### Narrative (manuscript) ribbon drag-reorder
Ribbon cards are now draggable to reorder, mirroring the chron strip's drag
(candidate/threshold-4px/active two-phase pattern) but simpler — one row, no
lanes. Reordering directly splices `S.scenes` (matching how
`manuscriptOrder()`/`buildSceneNumMap()` derive reading order from that
array's own storage order grouped by `sectionId` — the same thing
`editor.js`'s board drag-reorder already relies on), reassigns the dropped
scene's `sectionId` to match its new neighbor's, and reuses the same
move-confirmation modal as chron drag (`_tlPendingMove` generalized to an
`{label, apply}` shape so both drag flavors and the True-scale date-drag
below share one commit path). Scene numbers update everywhere on save.

### Drag text-selection bug
`.tl-scene`/`.tl-ms-card` lacked `user-select:none` (unlike the board's
`.sc`), so dragging a card in Loom dragged a browser text-selection across
neighboring card titles at the same time. Added.

### Loom/Path icon redraw (per hand sketch)
Loom: same crossed-curve X, one leg now dashed. Path: redrawn as a thin
curved "string" (`stroke-width:1.3`) with four larger beads (`r:2.1`) at
fixed on-curve points, replacing the zigzag+small-dot version from the prior
round.

### Conflicts panel rework
Previously filtered to the selected scene's own conflicts, with a "show all"
override triggered only by the header badge. Reworked to always show every
conflict (with a "Conflicts (N)" count header inside the panel body) —
selecting a scene now scrolls the panel to and highlights that scene's
conflict row instead of filtering the list down. Highlight color was
initially `var(--acc)` (brown) which read as a different state than clicking
a row directly (`flagActive`, red) — unified to the same `var(--rd)`
treatment, just a heavier ring. Click-off now clears *both* forms of
highlight — the card-driven one (via the general deselect path) and the
row-click-driven "flag mode" one (`clearFlagMode()` added to the generic
outside-click guard and to `_tlDoSelectScene`, since flag mode was previously
only cleared via Escape).

### Toolbar polish
- `#chart-type-toggle .chart-type-btn`'s compact icon-button styling
  (padding, border, on-state SVG color) was never extended to
  `#chart-type-timeline-toggle` — Loom/Path buttons were falling back to the
  base `.chart-type-btn` text-button padding, reading as visibly
  smaller/misaligned next to Snake/Circle. Fixed, then further evened up by
  enlarging the Loom/Path SVGs themselves (15px/12px tall → 18px) so the
  bordered group's cross-axis height (set by its tallest child under the
  default `align-items:stretch`) matches Snake/Circle's.
- The CARDS/FLOW/TIMELINE labels floating above their buttons
  (`.view-toggle-lbl`, `position:absolute`) only had `#tl-chron-hdr`'s 8px
  top padding to render into before hitting `#tl-stage`'s `overflow:hidden`
  clip (that header sits flush at the stage's own top edge) — increased to
  16px. An earlier one-off `margin-bottom` bump on just the Timeline label
  (meant to fix the same symptom before the real cause was found) was
  removed once the header padding fix made it redundant — it was actually
  making Timeline sit visibly higher than Flow.
- Era-marker labels (`.tl-marker-label`, e.g. "1793 — GENEVA & INGOLSTADT")
  are already positioned as high as they can go without clipping (a prior
  round's fix), so at low zoom the top lane's cards render close enough
  behind them to read as "covered" despite already being stacked on top via
  z-index — no background meant no contrast against a card's own content.
  Gave the label a solid background chip.

### Chronology True scale: cross-lane order bug (thread zigzag)
Root cause of a reported character-Thread zigzag and general "cards look
out of order" complaint: `chronXTrueScale()`'s per-lane collision-avoidance
pass (enforces a minimum on-screen gap between same-lane cards, since only
same-lane cards can visually overlap) operates on each storyline in
isolation. A lane with many tightly-clustered scenes can get pushed forward
enough to numerically overtake a *different* lane's scene that's
chronologically later — harmless for the pass's actual job (same-lane cards
never overlap), but `S.chronOrder` (built from real dates, spanning every
lane) was left non-monotonic in x, and `renderChronThread()` just walks
`chronOrder` connecting points in sequence, so a cross-lane inversion read
as the thread zig-zagging backward even though every scene's own date was
correct. Fixed with one more forward-only sweep over `chronOrder` itself
(not per-lane) after the existing pass — verified by asserting zero
x-decreases along `chronOrder` on the Frankenstein sample (was 3 violations
before the fix).

Also (found while on the same code): the same collision pass has no upper
bound, so a dense lane could push x values past 100 — cards rendered past
the track's own right edge, past where the lane-row color band and
everything else track-relative actually ends (visible as color bands
stopping abruptly partway across, independent of the thread bug above).
Rescales the whole map back into `[0,100]` when that happens.

### Chronology True scale: drag now edits the anchor date
Previously a deliberate limitation (`S.timelinePrefs.axis === 'true'` disabled
horizontal drag entirely, with a one-time "Switch to Ordinal to reorder by
time" toast) — horizontal position in True scale *is* the date axis, so
dragging didn't have an obvious "reorder" meaning. Asked the user; went with
the recommended option since they had no strong preference: dragging a card
now edits its anchor date, interpreting the drop x-position as a date via
the same anchored-scene timestamp range True scale itself uses for
`ts -> x%` (added the inverse, `_tlXPercentToTs`), with a continuous
placement-indicator line that tracks the cursor (rather than snapping
between two cards, since there's no discrete "slot" concept here) and the
same move-confirmation modal as every other drag, showing the resulting date
(e.g. `… (to Oct 7, 1793)?`). Repositions the scene within `chronOrder` to
sit next to its new date's neighbors (`_tlReorderChronForNewAnchor` — walks
the existing order rather than a full resort, so unrelated scenes' relative
positions are untouched) so the change can't reintroduce the cross-lane
inversion bug above. The dead toast function/CSS this replaced was removed.

### Scroll-arrow edge overlap at low zoom
The bubble scroll-arrow buttons (26px wide, inset 6px from the edge) aren't
part of document flow, so nothing previously reserved room for them — at a
tight zoom/large scene count the edge-most cards rendered close enough to
0%/100% (chron strip, percentage-positioned) or the row's own 10px padding
(manuscript ribbon, flex-positioned) that the arrow sat directly on top of
real card content. Manuscript row: padding bumped from 10px to 38px on each
side. Chron strip: `chronXOrdinal()`'s `0-100%` domain is now inset by a
pixel-based margin (`chronXEdgeMarginPct()`, accounting for the arrow's
reach *and* the current card's half-width so it scales correctly at every
zoom level) rather than running edge-to-edge.

### Verified live
All of the above tested in-browser on the Frankenstein sample across
multiple fresh preview-server restarts (this environment's dev server
intermittently served stale files across normal navigations — mid-session,
not a project bug — worked around by restarting the server and/or a full
hard navigation whenever a fix didn't appear to take effect before trusting
a negative result). Confirmed via both visual screenshots and direct state
inspection (`tlSelectedId`, `S.chronOrder`, `S.scenes` order, computed
styles, simulated mousedown/mousemove/mouseup drag sequences). Console clean
throughout.

### Not yet done
Not merged to `main` — same standing instruction as the rest of this branch.
