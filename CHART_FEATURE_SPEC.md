# Scene Flow Chart — Implementation Guide

Guidance for adding a "scene flow chart" feature to SceneSetter. Written to be followed
step by step. Read this entire document before writing any code, then read the files
listed in §1. Do not improvise beyond what is specified; where a choice is left open it
is marked **(implementer's choice)**.

## 0. What is being built

A chart view that visualizes the flow of scenes in story order, as an alternate view of
the Scene Board panel. Two chart types:

1. **Snake** — one continuous ribbon divided into contiguous segments (one segment per
   scene), winding left-to-right then back, like a snake. The snake gets longer as
   scenes are added, wrapping into more coils.
2. **Circle** — the same ribbon closed into a ring. Scene 1 starts at 12 o'clock and
   scenes progress clockwise. The ring is always a full circle: adding scenes makes
   every segment proportionally thinner (the ring does not grow).

**Resting state is deliberately neutral: no colors.** All segments are the same muted
tone. Color appears ONLY when the user filters — by selecting library items (characters,
locations, themes, misc) or by typing in search. Matching segments light up in the theme
accent color; non-matching segments stay neutral and dim slightly. When the filter is
cleared, the chart returns to its neutral state. Section colors are NOT shown by
default (see §10 for an optional, default-off toggle).

## 1. Read these files first

| File | Why |
|---|---|
| `editor.js` | Board rendering, menu system, keyboard shortcuts, search, highlight logic. The chart reuses many functions here. |
| `editor.html` | All DOM structure. The chart host is inserted here. |
| `state.js` | The global `S` object, `saveState`/`loadState`, `loadGlobalPrefs`/`saveGlobalPrefs`. |
| `styles.css` | Theme CSS variables (top of file) and Scene Board styles. |
| `reports.js` | `openReportWindow()` — reuse for the print feature. |
| `build.js` | The `JS_FILES` list — the new file must be registered here. |

## 2. Hard constraints — do not violate

- **Vanilla JS only.** No frameworks, no chart libraries, no new dependencies, no CDN
  scripts. The pages carry a Content-Security-Policy meta tag that only allows
  same-origin scripts; adding an external library will silently break the app.
- **Build SVG with DOM APIs** (`document.createElementNS('http://www.w3.org/2000/svg', ...)`).
  Never assemble SVG or HTML via string concatenation with user data — scene titles are
  user input and must always be set with `textContent` (XSS).
- **Match the existing code style**: `'use strict'`, compact vanilla functions, no
  classes, camelCase, DOM built imperatively. Look at `renderBoard()` and copy its idiom.
- **All colors via the theme CSS variables** (see §6). Never hardcode hex colors — the
  app has 5 themes (ivory, slate, studio, ocean, sunset) and the chart must look right
  in all of them, including the two dark ones (slate, ocean).
- Do not rename or restructure existing functions. Additions to existing functions must
  be single guarded lines as specified in §5.
- New code goes in a new file `charts.js` plus small CSS additions at the END of
  `styles.css` under a clearly-marked banner comment (match the existing
  `/* ── ... ── */` banner style).

## 3. Architecture: chart is a view mode of the Scene Board

Do NOT build the chart as a modal or popup. It replaces the board area inside the Scene
Board panel (`#sbp`), so the Library panel stays visible and clickable — this is what
makes live filtering work with zero new plumbing, because every library click already
triggers a full re-render.

DOM (in `editor.html`, inside `#sbp`, immediately after the `<div id="sbscrl">...` line):

```html
<div id="chart-host" style="display:none">
  <div id="chart-toolbar">
    <button id="chart-type-snake" class="chart-type-btn on" onclick="setChartType('snake')">Snake</button>
    <button id="chart-type-circle" class="chart-type-btn" onclick="setChartType('circle')">Circle</button>
    <span id="chart-status"></span>
    <button id="chart-print-btn" onclick="printChart()">Print</button>
    <button id="chart-close-btn" onclick="toggleChartView()" title="Back to board">Board view ✕</button>
  </div>
  <div id="chart-scroll"><div id="chart-canvas"></div></div>
  <div id="chart-tip" role="tooltip"></div>
</div>
```

State (module-level in `charts.js`):

```js
let chartMode = false;          // is chart view active
let chartType = 'snake';        // 'snake' | 'circle'
```

### Entry points (all three do the same thing: toggle chart view)

1. **View menu item.** In `editor.html`, in the View dropdown (`#drop-view`), after the
   "Hide All Panels" button and a `<div class="di-sep"></div>`, add:
   `<button class="di" id="menu-chart" onclick="toggleChartView();closeAllMenus()"><span id="menu-chart-text">Show Scene Flow Chart</span><span class="di-sc">Alt+V</span></button>`
   Update the label text ("Show…"/"Hide…") inside `toggleChartView()`.
2. **Keyboard shortcut Alt+V.** In `editor.js`, in the `document.addEventListener('keydown', ...)`
   handler, in the Alt-shortcut block (next to the existing Alt+N/C/L/T/M/R lines), add:
   `if (e.key === 'v' || e.key === 'V') { e.preventDefault(); toggleChartView(); return; }`
3. **Escape** closes chart view. In the same keydown handler's Escape block, add
   (following the existing defensive pattern used there):
   `if (typeof closeChartView === 'function') try { closeChartView(); } catch(e){}`

### toggleChartView behavior

- Entering chart mode: set `chartMode = true`; hide `#sbscrl` and `#sbemp`
  (`style.display='none'`); show `#chart-host` (`display:flex`); call `renderChart()`;
  update the View-menu label.
- Leaving: reverse it, call `renderBoard()` (which restores `#sbemp` visibility itself).
- Chart mode is editor-session state only — do NOT persist `chartMode`. DO persist
  `chartType` in global prefs: on change, `const p = loadGlobalPrefs(); p.chartType = chartType; saveGlobalPrefs(p);`
  and read it once at init.

## 4. Data: what to reuse (do not reimplement)

| Need | Use | Where defined |
|---|---|---|
| Scenes in story order | Build the ordered array exactly the way `sceneDisplayNum()` does: scenes whose `sectionId` is not a valid section come first ("unassigned"), then each section's scenes in `S.sections` order. Factor this into a helper `orderedScenes()` in `charts.js`; do not modify `sceneDisplayNum`. | `editor.js` |
| Scene's display number | `sceneDisplayNum(scene.id)` | `editor.js` |
| Does scene match the library selection (respects the AND/OR toggle) | `sceneMatchesLib(scene)` | `editor.js` |
| Is a library filter active | `SECS.some(({key}) => S.selections[key].size > 0)` | `config.js` / `state.js` |
| Does scene match search | `sceneMatchesSearch(scene)`; search is active when the global `searchQ` is non-empty | `editor.js` |
| Section name/boundaries | `S.sections` (array of `{id, name, color}`) | `state.js` |
| Section filter | `secFilterIds` — if non-empty, the board hides some sections. The chart must apply the same filter to `orderedScenes()` (same logic as the `groups` filtering in `renderBoard`). | `editor.js` |
| Scene summary modal | `openModal(sceneId)` — safe to call from chart mode | `editor.js` |
| Print window | `openReportWindow(html)` | `reports.js` |

**Highlight precedence (must match the board):** if `searchQ` is non-empty, highlight by
`sceneMatchesSearch` and ignore the library selection; otherwise, if any library items
are selected, highlight by `sceneMatchesLib`; otherwise no filter is active.

## 5. Live refresh wiring

The chart must re-render whenever the underlying data or filters change. Everything in
the app already funnels through `renderBoard()`. Add exactly one line at the very top of
`renderBoard()` in `editor.js`:

```js
if (typeof chartMode !== 'undefined' && chartMode) { renderChart(); return; }
```

Because `charts.js` will load BEFORE `editor.js` in script order (see §11), `chartMode`
will always be defined; the `typeof` guard is belt-and-suspenders for the projects page,
where `charts.js` is not loaded.

This single hook covers: library item clicks, AND/OR toggle, search input, section
filter changes, add/edit/delete scene, undo/redo, and section changes — all of them
already call `renderBoard()`. Verify each of these live-updates the chart during testing.

Also add a window `resize` listener (in `charts.js`, guarded by
`if (document.getElementById('chart-host'))`) that calls `renderChart()` when
`chartMode` is true — the snake layout depends on container width. Debounce with a
150 ms `setTimeout` reset per event.

## 6. Visual specification

Theme variables available (defined at the top of `styles.css` per theme):
`--bg0 --bg1 --bg2` backgrounds · `--s0 --s1` control surfaces · `--o0 --o1` muted
text/icons · `--tx` text · `--sub` secondary text · `--acc` accent · `--bdr` borders ·
`--sbg` storyboard background · `--ontx` text on accent.

| Element | Value |
|---|---|
| Chart area background | `var(--sbg)` (same as the board) |
| Segment, resting | stroke `var(--s1)`, full opacity |
| Segment, hover | stroke `var(--s0)`; CSS `filter: brightness(1.06)` is acceptable **(implementer's choice)**; cursor pointer |
| Segment gap (divider) | 3px of background showing between segments (achieved by the dash gap, §7) |
| Scene number text | `var(--sub)`, 11px, `font-family:inherit`, centered on the segment midpoint; hidden when segment arc length < 26px |
| Section boundary tick | a 10px line perpendicular to the path at each section boundary, stroke `var(--o0)`, width 2 — drawn even in the neutral state so structure is visible without color |
| Section name label | `var(--sub)` 11px, placed just outside the ribbon at the section's first segment; skip if it would overlap the previous label **(implementer's choice on exact placement)** |
| Filter active — matching segment | stroke `var(--acc)`, number text `var(--ontx)` |
| Filter active — non-matching segment | stays `var(--s1)` AND element `opacity: 0.45` |
| Ribbon thickness | snake 34px; circle 30px |
| Tooltip | positioned `absolute` inside `#chart-host`; background `var(--bg1)`, 1px border `var(--bdr)`, radius 6px, 12px text `var(--tx)`; content: "Scene N — Title" (bold-ish first line), section name, then summary if present, `var(--sub)`. ALL text set via `textContent` on separate child divs. |
| `#chart-status` (toolbar) | `var(--sub)` 11px; shows "18 scenes · 3 sections" and, when a filter is active, "· 4 matching" |

Empty project: show a centered message in the chart area, same tone as `#sbemp`
("Create your first scene to see the flow chart"). One scene: both charts still render
(circle = one segment ring).

## 7. Geometry — the dasharray slicing technique

Both charts are built the same way: ONE invisible centerline path defines the shape;
each scene is a **clone of that path** showing only its slice via `stroke-dasharray` /
`stroke-dashoffset`. Segments flow smoothly around curves for free, and each clone is
its own DOM element for hover/click/coloring. Scene counts here are small (tens, rarely
a few hundred), so N path clones are not a performance concern.

Slicing math (identical for both chart types):

```js
const total  = centerline.getTotalLength();   // px
const segLen = total / N;                     // N = number of scenes shown
const GAP    = 3;                             // px of background between segments
// for scene index i (0-based):
clone.setAttribute('stroke-dasharray',  (segLen - GAP) + ' ' + (total - segLen + GAP));
clone.setAttribute('stroke-dashoffset', -(i * segLen + GAP / 2));
clone.setAttribute('fill', 'none');
clone.style.pointerEvents = 'stroke';         // hover/click hits the ribbon only
```

Segment midpoint for the number label and tooltip anchor:
`centerline.getPointAtLength(i * segLen + segLen / 2)`.
Section boundary tick at `centerline.getPointAtLength(k * segLen)` for each boundary
index k; get the perpendicular direction from two nearby `getPointAtLength` samples.

**Important:** `getTotalLength()` only works on a path that is attached to a rendered
SVG. Build the SVG, attach it to `#chart-canvas`, THEN measure and add the segment
clones. The centerline itself keeps `stroke="none"` so it is invisible.

### Snake centerline

- Host width `W = chart-scroll clientWidth`; horizontal margin `M = 50`;
  `runLen` target = `W - 2*M`, u-turn radius `r = 45` (row pitch = 90px), arc length
  `A = Math.PI * r` (≈141.4).
- Fixed target segment length `T = 110` px. Total needed `L = N * T`.
- Rows: `R = Math.max(1, Math.ceil((L - runLen) / (runLen + A)) + 1)` then recompute the
  actual run length `run = (L - (R - 1) * A) / R`. If `run > runLen`, increment R and
  recompute. If `R > 1 && run < 180`, decrement R and recompute (avoids stubby rows).
  Clamp: if N is very small (run < 180 with R = 1), just use `run = L` (a short
  straight snake is fine).
- Path: start at `(M, y0)` with `y0 = 40 + r`; even rows go left→right, odd rows
  right→left, connected by semicircular arcs:
  right side down-turn `A r r 0 0 1 x,(y+90)`, left side down-turn `A r r 0 0 0 x,(y+90)`.
- SVG height = `y0 + (R-1)*90 + r + 40`. Set the SVG's width/height attributes so
  `#chart-scroll` (overflow:auto) can scroll vertically when there are many rows.

### Circle centerline

- Use a `<circle>` element as the centerline (it supports `getTotalLength()` too).
- Radius `R = Math.max(90, Math.min(availW, availH) / 2 - 70)`; center of the host area.
- A circle's dash origin is at the 3 o'clock position; wrap the whole segment group in
  `transform="rotate(-90 cx cy)"` so scene 1 starts at 12 o'clock, clockwise.
- Counter-rotate the number labels: place them at the midpoint coordinates computed from
  angle math instead (`angle = -90° + (i + 0.5) * 360°/N`), in an unrotated group —
  simpler than nested rotations.
- When `segLen < 26px`, hide the in-segment numbers (tooltip still identifies scenes).
- Center of the ring: project name (`var(--tx)`, 13px) and "N scenes · M sections"
  (`var(--sub)`, 12px). Get the project name the way `updateProjectNameDisplay()` does.
- A small "start" label (`var(--sub)`, 11px) just above the 12 o'clock gap.

## 8. Interactions

- **Hover** segment → show tooltip near the pointer (clamp to host bounds); highlight
  hover state. Mouseleave hides it.
- **Click** segment → jump to the scene on the board: set `chartMode = false`, restore
  board visibility (same code path as `toggleChartView` off), then
  `S.selIds.clear(); S.selIds.add(scene.id); renderBoard();` then find
  `document.querySelector('.sc[data-id="' + scene.id + '"]')` and
  `scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'})`.
  (Selecting the card gives it the existing `.sel` styling — no new CSS needed.)
- Keyboard: the toolbar buttons are real `<button>`s so they are tabbable; no further
  keyboard navigation is required in v1.

## 9. Print

`printChart()`: serialize the current SVG and hand it to the existing report window:

```js
const svg = document.querySelector('#chart-canvas svg').cloneNode(true);
```

**Gotcha:** the print window has no theme stylesheet, so CSS variables resolve to
nothing. Before serializing, walk the clone and replace every `var(--x)` in `stroke`,
`fill`, and inline `style` attributes with the computed value:
`getComputedStyle(document.documentElement).getPropertyValue('--x').trim()`.
Then build a minimal HTML document (title = project name + " — Scene Flow", white
background, the serialized SVG via `new XMLSerializer().serializeToString(svg)`) and
call `openReportWindow(html)`. Because segment colors were chosen from theme variables,
a printed dark-theme chart may have low contrast on white — acceptable for v1;
**(implementer's choice)** to force the ivory theme's values when printing.

## 10. Optional (build LAST, only if everything else is done): color-by-section toggle

A checkbox in `#chart-toolbar`, label "Section colors", DEFAULT OFF, persisted in global
prefs (`p.chartSecColors`). When on, resting segments use their section's stored
`sec.color` (hex) instead of `var(--s1)`; scenes in no section stay neutral. Filter
behavior on top: matches keep full saturation + a 2px `var(--acc)` outline (a slightly
wider clone underneath), non-matches get `opacity:0.35`. The neutral-by-default rule in
§0 is the product decision; this toggle is the only sanctioned way color appears without
a filter.

## 11. File changes checklist

1. **Create `charts.js`** — all new logic: `toggleChartView`, `closeChartView`,
   `setChartType`, `renderChart`, `orderedScenes`, snake/circle builders, tooltip,
   `printChart`, resize listener, prefs read at init. Top of file: `'use strict';`.
   Guard all init code with `if (document.getElementById('chart-host'))` so the file is
   inert on other pages.
2. **`editor.html`** — chart-host markup (§3), View-menu item (§3), and
   `<script src="charts.js"></script>` inserted immediately BEFORE
   `<script src="editor.js"></script>`.
3. **`editor.js`** — one line at top of `renderBoard()` (§5); Alt+V shortcut; Escape
   handler line (§3).
4. **`styles.css`** — new banner section at end of file: `#chart-host` (flex column,
   `flex:1`, `min-width:0`, background `var(--sbg)`), `#chart-toolbar` (match `#sbhdr`
   styling: `var(--bg1)` background, bottom border `var(--bdr)`), `.chart-type-btn`
   (match `.ai-footer-btn`-era button styling — see `.pm-btn` / `.sec-filter-btn` for
   current patterns), `#chart-scroll` (`flex:1; overflow:auto`), `#chart-tip`
   (hidden by default), `.chart-seg` hover styles.
5. **`build.js`** — add `'charts.js'` to `JS_FILES` between `'projects.js'` and
   `'main.js'` (must mirror the HTML script order).
6. **`STATUS.md`** — one line describing the feature when done.

## 12. Manual test checklist (all 5 themes for #1–4; ivory + slate for the rest)

1. Open a sample project → Alt+V. Neutral snake renders: no colors, numbered segments,
   section ticks visible, status line correct.
2. Click "Elizabeth Bennet" in the Library → her scenes light up in accent color, all
   others dim. Click a second character; toggle OR/AND — matches change accordingly and
   instantly. Clear Highlights → chart returns to fully neutral.
3. Type in search → matches light up; search overrides library selection; clearing
   search restores library-based highlighting.
4. Switch to Circle → same data, scene 1 at 12 o'clock, clockwise; center label correct.
5. Add a scene (chart open in another view? no — leave chart, add, return): snake is one
   segment longer; circle has thinner segments. Delete a scene → reverse. Undo/redo
   while in chart mode updates the chart.
6. Section filter (board header dropdown) hides those scenes in the chart, numbering
   still uses `sceneDisplayNum`.
7. Click a segment → lands on the board, card selected and scrolled into view.
8. Hover → tooltip shows title/section/summary; a scene titled
   `<img src=x onerror=alert(1)>` renders as literal text everywhere (tooltip, print).
9. Resize the window in snake view → rows re-wrap. 1-scene and 0-scene projects don't
   error.
10. Print from both chart types → new window shows the chart with real colors, prints
    on one page for ≤3 rows.
11. Empty-selection Escape closes chart view; Alt+V toggles it back; View menu label
    flips between Show/Hide.
12. `python3 -m http.server 5500` — full app regression: board, reports, import/export
    all unaffected. Console shows no errors on load or during any step above.

## 13. Known pitfalls

- `getTotalLength()` on an unattached path returns 0 in some browsers — attach first (§7).
- A `<circle>`'s dash pattern starts at 3 o'clock — rotate the group, not each segment (§7).
- `renderBoard()` is called ~30 places; do NOT try to hook them individually — use the
  single top-of-function guard (§5).
- `charts.js` must load before `editor.js` (the `renderBoard` guard reads `chartMode`),
  and both the HTML and `build.js` orders must match.
- Scene titles are user data: `textContent` only, everywhere, including the print path.
- Don't persist `chartMode` — reopening a project should always start in board view.
- The board's empty-state element `#sbemp` is toggled inside `renderBoard()`; when
  entering chart mode hide it explicitly or it can bleed through on empty projects.

## 14. Addendum (`feature/updates_v3`): proportional sizing by word count

Added after the rest of this spec was implemented — a "Show relative word count" toggle
in `#chart-toolbar` (persisted in global prefs like `chartType`) that, when on, sizes each
scene's segment proportionally to `scene.wordCount` instead of splitting the path evenly.

- **Layout:** `computeSceneLayout(scenes, total)` in `charts.js` is the single source of
  truth for per-scene `{len, offset}` along the centerline, replacing the old `total/N`
  uniform math everywhere it appeared (`addSegments`, `addSnakeNumbers`,
  `addSnakeSectionMarkers`, `addCircleNumbers`, `drawCirclePie`). When the toggle is off,
  it returns the original even split unchanged.
- **Missing data:** a scene with no `wordCount` (0 counts as unset too) is weighted at the
  average of scenes that DO have one — not a fixed default, and not a minimum-size sliver
  — so a handful of missing values render as "typical size" instead of distorting the
  chart or collapsing to something unclickable. If *no* scene in the set has a wordCount,
  every weight is 1 and the layout is identical to the toggle-off case.
- **"Estimated" indicator:** an averaged-in scene gets a short red tick (`var(--rd)`)
  positioned just outward from its own scene number — not a tick spanning the ribbon's
  full width, which was tried first and read as a spurious divider. Tooltip shows the real
  `wordCount` or "~N words (estimated)"; a legend entry ("Estimated (no word count)")
  appears only when the current scene set is a genuine mix of known and unknown (all-known
  or all-unknown sets show nothing extra, since there's nothing to distinguish).
- **Circle-chart specifics:** the ring's dash offsets, pie-wedge run boundaries, and number
  placement all switched from index-based (`i * 360/N`) to cumulative-offset-based
  (`offset / total * 360`) degree math to stay consistent with the new variable segment
  lengths.
