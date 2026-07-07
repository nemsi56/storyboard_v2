# Current Status

As of July 7, 2026:

## Notes
strip_AI branch: removed all AI features (Analyze Story menu item, AI panel with Analysis/Chat tabs, ai.js, chat.js, and related state/CSS) so the app ships without them for now — to be reintroduced later. Also hardened the app: CSP meta tags on all pages, stricter JSON import validation, and cleanup of leftover AI localStorage keys.

Added release branch - this will serve as the branch that is always live through Pages (which redirects to scenesetterapp.com)

release branch currently serves up the main_beforeAI branch (basically has all features, including menu, before adding AI panel and features)

main currently includes all changes up to feature/AI_v3 branch

Going forward, experiment with new features in branches, push to main when ready to merge (and tag that version of main), and only push to release branch when I want it to be the published version at scenesetterapp.com (it will automatically be served there because Pages reads from release branch)

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
