# Current Status

As of July 21, 2026:

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

### Not yet done
Nothing outstanding from the M7 checklist itself. Still not merged to `main` —
stays on `thruLine_v1` per explicit instruction; main and all other branches are
untouched by this work.
