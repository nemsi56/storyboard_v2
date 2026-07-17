# Trace Lines ("Rainbow") — Implementation Guide

Guidance for adding **trace lines** to the Scene Flow Chart: colored lines that run
along the chart ribbon, one per library item (character, location, theme, misc item,
or POV), visible only through the scenes where that item appears — like the colored
lines on a subway map. Written to be followed step by step. Read this entire document
before writing any code, then read the files listed in §1. Do not improvise beyond
what is specified; where a choice is left open it is marked **(implementer's choice)**.

Work on branch `feature/updates_v4`.

## 0. What is being built

The Scene Flow Chart (snake and circle types, see `charts.js`) currently shows scenes
as neutral segments along a thick ribbon ("tube"). This feature adds a **Trace**
control to the chart toolbar. When the user picks a category (Characters, Locations,
Themes, Misc, or POV), each *selected* library item in that category is drawn as a
thin colored line running INSIDE the tube, parallel to it. The line is present only
along the scenes that contain that item; consecutive scenes with the item merge into
one continuous run. Multiple items appear as parallel side-by-side lines — the
"rainbow" — that stay in their lane through the snake's turns and around the circle.

This combines the existing highlight feature (library selections) with the flow chart:
the selections stop *coloring segments* and instead *become the lines*.

Everything else about the chart (segments, numbers, section markers, tooltips, click
to jump, word-count sizing, print) keeps working.

## 1. Read these files first

| File | Why |
|---|---|
| `charts.js` | ALL chart rendering. This is where ~90% of the new code goes. Understand `renderChart`, `computeSceneLayout`, `addSegments` (the stroke-dasharray trick), `buildSnakePath`/`computeSnakeLayout`, `buildCircleChart`, the tooltip helpers, and `printChart`. |
| `config.js` | `SECS` (the 4 library categories) and `SEC_COLORS` (categorical hex palette). |
| `editor.js` | `sceneMatchesLib` (~line 437), `S.selections` usage, `buildSceneNumMap` (~line 865), `renderBoard` (~line 929 — note it delegates to `renderChart()` when chart mode is on). |
| `state.js` | The `S` object: `S.scenes` (each scene has `characters`, `locations`, `themes`, `misc`, `povs` — all arrays of name strings), `S.characters` etc. (library arrays of `{name, notes}`), `S.selections` (per-category `Set`s of selected names), `S.povCustomNames`, `loadGlobalPrefs`/`saveGlobalPrefs`. |
| `editor.html` | Chart toolbar markup (~line 266). |
| `editor-init.js` | Chart toolbar event wiring (~line 148). |
| `styles.css` | Chart styles (~lines 623–660), theme variables at top of file. |

## 2. Hard constraints — do not violate

- **Vanilla JS only.** No frameworks, no libraries, no new dependencies. The pages
  carry a CSP meta tag that only allows same-origin scripts.
- **Build SVG with DOM APIs** (`document.createElementNS(SVGNS, ...)`). Never build
  SVG/HTML by string concatenation with user data; item names are user input — always
  set them with `textContent` (XSS).
- **Match existing code style**: `'use strict'`, compact vanilla functions, no
  classes, camelCase. Copy the idiom of the functions already in `charts.js`.
- **Chrome colors via theme CSS variables.** Exception: the trace line colors
  themselves come from the `SEC_COLORS`-style literal-hex palette (§5) — those hues
  are deliberately theme-independent mid-tones that read on both light and dark
  themes, same as section colors. Everything else (legend chrome, halos) uses vars.
- **No new JS file.** All chart code goes in `charts.js` (so no `build.js` change).
- **Do not change persisted project data.** This feature adds only a UI pref.

## 3. The toolbar control and state

### 3.1 Markup — `editor.html`

In `#chart-toolbar`, after the `#chart-wc-toggle` button, insert:

```html
<label id="chart-trace-wrap">Trace:
  <select id="chart-trace-sel">
    <option value="off">Off</option>
    <option value="characters">Characters</option>
    <option value="locations">Locations</option>
    <option value="themes">Themes</option>
    <option value="misc">Misc</option>
    <option value="povs">POV</option>
  </select>
</label>
```

Style the label/select to match `.chart-type-btn` sizing (12px font, theme vars for
background/border). **(implementer's choice)** on exact select styling; it must look
acceptable on all 5 themes — check `ivory` and `slate` at minimum.

### 3.2 State — `charts.js`

Add module-level state next to `chartType`:

```js
let traceCat = 'off';  // 'off' | 'characters' | 'locations' | 'themes' | 'misc' | 'povs'
const MAX_LANES = 6;   // most lanes drawable before the tube gets crowded
const LANE_W = 3;      // stroke width of one trace line
```

- `traceActive()` helper: `return traceCat !== 'off';`
- Persist in global prefs as `prefs.chartTrace` (same pattern as `chartType` in
  `initChartPrefs` / `setChartType`). Restore in `initChartPrefs` — validate the
  stored value against the 6 legal strings; fall back to `'off'`. Set the select's
  `.value` to match on init.
- New function `setChartTrace(cat)`: validate, assign, save pref, `renderChart()` if
  `chartMode`.

### 3.3 Wiring — `editor-init.js`

Next to the other chart listeners (~line 148):

```js
$('chart-trace-sel').addEventListener('change', function(){ setChartTrace(this.value); });
```

Live updates need no extra wiring: toggling a library checkbox calls `renderBoard()`,
which already calls `renderChart()` when chart mode is on.

## 4. Which items become lanes

Add to `charts.js`:

```js
function traceItemNames() {
  // All item names in the traced category, in stable library order.
  if (traceCat === 'povs') {
    const used = new Set(S.scenes.flatMap(s => s.povs || []));
    return S.characters.map(c => c.name).concat(S.povCustomNames || [])
      .filter(n => used.has(n));
  }
  return S[traceCat].map(item => item.name);
}

function computeTraceLanes(scenes) {
  // Returns { lanes: [{name, color}], overflow: number }.
  if (!traceActive()) return { lanes: [], overflow: 0 };
  const inScenes = name => scenes.some(sc => (sc[traceCat] || []).includes(name));
  const selected = S.selections[traceCat];
  const names = traceItemNames().filter(n => selected.has(n) && inScenes(n));
  const overflow = Math.max(0, names.length - MAX_LANES);
  return { lanes: names.slice(0, MAX_LANES).map((name, i) => ({ name, color: SEC_COLORS[i % SEC_COLORS.length] })), overflow };
}
```

Rules encoded above — implement exactly:

1. Lanes are ONLY the items **explicitly selected** in the traced category
   (`S.selections[traceCat]`), in library order (not selection order). Nothing
   selected → no lanes; §9 defines the hint shown instead, so the feature never
   looks broken.
2. Selected items appearing in zero visible scenes are dropped from the lanes.
3. Cap at `MAX_LANES` (first N in library order); report the number cut as `overflow`.
4. Colors assigned by lane position from `SEC_COLORS`. (Colors can shift when the
   selection changes; that is accepted.)
5. Scene membership test for every category, including povs, is
   `(scene[traceCat] || []).includes(name)` — scene objects store povs under the same
   key name `povs`.

## 5. Runs: where along the ribbon a lane is drawn

The chart already computes `layout` — `[{scene, len, offset, estimated}]` against the
centerline's `total` length (`computeSceneLayout`). A lane's **runs** are the maximal
stretches of consecutive layout entries whose scene contains the item:

```js
function computeLaneRuns(layout, name) {
  const numMap = buildSceneNumMap();
  const runs = [];
  layout.forEach(({ scene, offset, len }) => {
    const has = (scene[traceCat] || []).includes(name);
    if (!has) { return; }
    const last = runs[runs.length - 1];
    if (last && Math.abs(last.end - offset) < 0.001) {
      last.end = offset + len; last.lastNum = numMap.get(scene.id);
    } else {
      runs.push({ start: offset, end: offset + len,
                  firstNum: numMap.get(scene.id), lastNum: numMap.get(scene.id) });
    }
  });
  return runs;
}
```

The tolerance comparison merges only truly adjacent scenes: offsets are built
cumulatively in `computeSceneLayout`, but floating-point drift (especially with
word-count weighting) means exact `===` cannot be trusted.

(When a section filter hides scenes, runs merge across the hidden gap because the
layout only contains visible scenes. That is accepted behavior.)

## 6. Lane geometry — the only real math in this feature

Lanes are paths **parallel to the centerline**, offset perpendicular to the direction
of travel. For `k` lanes, the signed offsets are evenly spread and centered:

```js
function laneOffsets(k, thickness) {
  const usable = thickness - 2 * (LANE_W / 2 + 3.5); // 3.5px margin inside each tube edge
  const spacing = k > 1 ? Math.min(5, usable / (k - 1)) : 0;
  return Array.from({ length: k }, (_, i) => (i - (k - 1) / 2) * spacing);
}
```

`thickness` is `SNAKE_SEG_THICKNESS` (34) or `CIRCLE_SEG_THICKNESS` (30). With k=6
this yields spacing 4.8 / 4.0 — every lane stays inside the tube.

### 6.1 Circle — trivial

A lane at offset `d` is a concentric circle of radius `R + d`. Build it exactly like
the existing invisible centerline circle (same `cx`/`cy`, `stroke:none`, `fill:none`)
and append it to the same rotated `g` so scene 1 still starts at 12 o'clock.

### 6.2 Snake — parallel offset path

SVG cannot offset a path, but the snake is straight runs + semicircular turns, so the
parallel curve is exact: horizontal runs shift in y, turn arcs change radius. The
subtlety: a lane at constant offset "to the left of travel" is ABOVE the centerline
on left-to-right rows and BELOW it on right-to-left rows, and turn radii alternate
`r + d` / `r − d`. This is what makes lanes weave through the turns correctly.

Add this function; it mirrors `buildSnakePath` and MUST reuse `computeSnakeLayout`
(same `R, run, M, r`) so lanes land on the same geometry as the tube. `d = 0`
reproduces the centerline exactly — use that as a sanity check.

```js
function buildSnakeLanePathD(N, W, d) {
  const { R, run, M, r } = computeSnakeLayout(N, W);
  const y0 = 24 + r;
  let y = y0;
  let dd = `M ${M} ${y0 - d}`;
  for (let row = 0; row < R; row++) {
    const leftToRight = row % 2 === 0;
    const yLane = y + (leftToRight ? -d : d);
    const xEnd = leftToRight ? M + run : M;
    dd += ` L ${xEnd} ${yLane}`;
    if (row < R - 1) {
      const sweep = leftToRight ? 1 : 0;
      const rLane = leftToRight ? r + d : r - d;
      const newY = y + 90;
      const yNext = newY + (leftToRight ? d : -d); // next row travels the other way
      dd += ` A ${rLane} ${rLane} 0 0 ${sweep} ${xEnd} ${yNext}`;
      y = newY;
    }
  }
  return dd;
}
```

Do not modify `buildSnakePath` itself.

### 6.3 Mapping centerline offsets onto a lane path

A lane path's `getTotalLength()` differs slightly from the centerline's (offset arcs
are shorter/longer). Scale proportionally when drawing:

`laneStart = run.start / total * laneTotal`, `laneEnd = run.end / total * laneTotal`.

On the circle this is exact. On the snake, run boundaries inside turns drift by ~1px
at these offsets — accepted; do NOT build exact per-segment mapping.

## 7. Drawing the lanes

One shared function draws a lane's runs on a prepared invisible lane path, using the
same dasharray technique as `addSegments`:

```js
function drawLaneRuns(container, lanePathEl, laneTotal, total, runs, lane) {
  runs.forEach(run => {
    const s = run.start / total * laneTotal, e = run.end / total * laneTotal;
    const inset = Math.min(2, (e - s) / 4);      // soft ends, keep length positive
    const len = Math.max(2, e - s - 2 * inset);
    const clone = lanePathEl.cloneNode(false);
    clone.classList.add('chart-lane');
    clone.setAttribute('stroke', lane.color);
    clone.setAttribute('stroke-width', LANE_W);
    clone.setAttribute('stroke-linecap', 'round');
    clone.setAttribute('fill', 'none');
    clone.setAttribute('stroke-dasharray', len + ' ' + Math.max(0, laneTotal - len));
    clone.setAttribute('stroke-dashoffset', String(-(s + inset)));
    clone.style.pointerEvents = 'stroke';
    clone.addEventListener('mouseenter', e2 => showLaneTip(e2, lane, run));
    clone.addEventListener('mousemove', moveChartTip);
    clone.addEventListener('mouseleave', hideChartTip);
    container.appendChild(clone);
  });
}
```

Then per chart type, a `addTraceLanes(...)` step:

- **Snake** (`buildSnakeChart`): after `addSegments(...)` and BEFORE
  `addSnakeNumbers(...)`, for each lane `i`: build a path element with
  `d = buildSnakeLanePathD(N, W, offsets[i])`, `stroke:none`, `fill:none`, append it,
  take its `getTotalLength()`, compute runs, call `drawLaneRuns`. `N` and `W` are the
  same values already in scope in `buildSnakeChart`.
- **Circle** (`buildCircleChart`): same, after `addSegments(...)` and before
  `addCircleNumbers(...)`, with concentric-circle lane paths of radius `R + offsets[i]`
  appended to the rotated `g`.

Ordering matters: segments (bottom) → lane lines → numbers → section markers /
estimated ticks (top). Numbers drawn after lanes stay legible; additionally, when
trace is active add class `chart-trace` to the `<svg>` root and add CSS:

```css
svg.chart-trace .chart-num{paint-order:stroke;stroke:var(--s1);stroke-width:3px}
.chart-lane{transition:stroke-width .12s}
.chart-lane:hover,.chart-lane.chart-lane-hl{stroke-width:5px}
```

The `var(--s1)` halo matches the neutral tube color so digits punch a small hole in
the lanes right around themselves. (With search active a matched segment is accent
colored and the halo will look slightly off there — accepted.)

### 7.1 Lane tooltip

```js
function showLaneTip(e, lane, run) {
  const tip = document.getElementById('chart-tip');
  tip.innerHTML = '';
  const t1 = document.createElement('div'); t1.className = 'chart-tip-title';
  t1.textContent = lane.name;                                   // user data — textContent
  const t2 = document.createElement('div'); t2.className = 'chart-tip-sec';
  t2.textContent = run.firstNum === run.lastNum
    ? 'Scene ' + run.firstNum : 'Scenes ' + run.firstNum + '–' + run.lastNum;
  tip.appendChild(t1); tip.appendChild(t2);
  tip.style.display = 'block';
  positionChartTip(e);
}
```

Lane clicks do nothing (the thin line barely occludes the segments beneath, and
segment click-to-jump must keep working around it).

## 8. Interaction with the existing highlight/filter coloring

When trace is active, **library-selection highlighting on segments is suppressed** —
the selections ARE the lanes now, and accent-colored segments would fight the rainbow.
Search highlighting still applies. Change `applySegColor` to:

```js
function applySegColor(clone, scene) {
  clone.classList.remove('chart-seg-match', 'chart-seg-dim');
  const filterOn = traceActive() ? !!searchQ : chartFilterActive();
  const matches  = traceActive() ? (searchQ && sceneMatchesSearch(scene)) : sceneMatchesChart(scene);
  if (filterOn) {
    if (matches) { clone.setAttribute('stroke', 'var(--acc)'); clone.classList.add('chart-seg-match'); }
    else { clone.setAttribute('stroke', 'var(--s1)'); clone.classList.add('chart-seg-dim'); }
  } else {
    clone.setAttribute('stroke', 'var(--s1)');
  }
}
```

Apply the same trace-aware rule to the two number-fill expressions in
`addSnakeNumbers` / `addCircleNumbers` (they check `chartFilterActive() &&
sceneMatchesChart(scene)`) — factor a small helper, e.g. `segIsMatched(scene)`, used
by all three sites, rather than duplicating the ternary.

`updateChartStatus`'s "N matching" line: when trace is active and search is empty,
skip the matching count and instead append `· tracing K <category>` (e.g. "tracing 4
characters"; singular/plural like the existing counts; label "POV" for povs, and for
povs use "POV" uninflected).

## 9. Legend

`renderChart` currently calls `updateChartLegend(scenes)`. Compute lanes ONCE in
`renderChart` — `const trace = computeTraceLanes(scenes)` — and pass them to both
`updateChartLegend(scenes, trace)` and the chart builders
(`buildSnakeChart(canvas, scenes, trace)` / `buildCircleChart(canvas, scenes, trace)`),
so lanes are never computed twice per render.

In `updateChartLegend`, after the existing section letters (snake) / at the start
(circle), append one legend item per lane: a color swatch + the item name
(`textContent`). Separate groups with the existing `chart-legend-sep` dot pattern.
Swatch:

```css
.chart-legend-swatch{display:inline-block;flex-shrink:0;width:14px;height:3px;border-radius:2px}
```

set `style.background = lane.color` on the element. If `trace.overflow > 0`, append a
final plain-text item `+N more` (title attribute: "Select fewer items to choose which
lines are shown"). Legend items for lanes should highlight their lane on hover:
toggle class `chart-lane-hl` on `.chart-lane` elements matching the lane — give each
lane run `dataset.lane = lane.name` when drawing, and mirror the existing
`highlightSecMarker` pattern.

If trace is active but there are zero lanes, show one legend item telling the user
what to do: `Select <category> in the library to trace them` (e.g. "Select characters
in the library to trace them"; for povs: "Select POVs in the library to trace them").
This is the normal state right after picking a category, so the hint is required —
without it the control looks broken.

## 10. Print

In `printChart`, lane strokes are literal hex, so `resolveChartVars` needs no change.
Two additions:

1. The number halo comes from a CSS class that won't exist in the print window.
   After the existing `.chart-seg-dim` inlining, if the cloned svg has class
   `chart-trace`, inline the halo on each `.chart-num`: set `stroke` to the resolved
   `--s1` value... simpler and acceptable: set `paint-order`/`stroke`/`stroke-width`
   as attributes on each `.chart-num` in the clone BEFORE `resolveChartVars(clone)`
   runs, using `stroke: 'var(--s1)'` so resolution handles it.
2. When trace is active, append a legend line to `legendHtml` mirroring §9: color
   swatches via inline-styled `<span>`s (hex is safe to interpolate; names must go
   through `rptEsc`), plus the `+N more` overflow note.

## 11. Edge cases — handle all of these

- **1 lane**: offset 0, line rides the centerline. Fine.
- **Item in zero visible scenes**: already excluded by `computeTraceLanes`.
- **Tiny runs** (short scene, proportional sizing): `drawLaneRuns` clamps dash length
  to ≥ 2px; verify no negative dasharray values ever reach the DOM.
- **Word-count sizing on**: works with no extra code (runs come from `layout`).
- **Section filter active**: lanes computed over visible scenes only (see §5 note).
- **Trace category with selections in a DIFFERENT category**: those other-category
  selections still count as a "filter" for `sceneMatchesLib`, but §8 suppresses all
  library-based segment coloring while trace is active — verify segments stay neutral.
- **Scene edits while chart open**: all paths go through `renderChart()`; lanes must
  never cache anything across renders except `traceCat` itself.
- **`chartFilterActive()` is used by `updateChartStatus`** — do not change that
  function itself; only its call sites per §8.

## 12. Manual QA checklist

Test with a real project (load `pride-and-prejudice.json` via Projects → import if no
data handy). No automated test additions required; optionally add a config smoke test
in `test-init.js` **(implementer's choice)**.

1. Snake + circle: trace Characters with 3 selected → 3 parallel colored lines inside
   the tube, weaving through snake turns, concentric on circle, starting/ending at
   the right scenes (verify against tooltips).
2. Nothing selected in category → no lanes, legend shows the "Select … in the
   library" hint; selecting >6 items → 6 lanes, `+N more` in legend.
3. Consecutive scenes sharing an item → ONE continuous run, no gaps at boundaries.
4. Toggle word count on → lanes stretch with segments.
5. Trace on: segments neutral even with library items checked; search still lights
   segments accent; scene numbers legible over lanes (halo).
6. Hover lane → tooltip with name + scene range, line thickens; legend hover ditto.
7. Segment hover/click still works between lanes (click jumps to board).
8. Trace select persists across reload (global prefs), restores select value.
9. All 5 themes (ivory, slate, studio, ocean, sunset): lanes readable, select styled.
10. Print (both chart types, trace on): lanes + legend + halo appear on white.
11. Resize window / collapse panels with chart open → re-render keeps lanes correct.
12. Empty project and no-match section filter → no errors (lanes code must tolerate
    `scenes.length === 0` — it never runs because the builders return early; verify).
