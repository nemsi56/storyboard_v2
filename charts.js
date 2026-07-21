'use strict';

// ── CHART STATE ────────────────────────────────────────────────────────────────
const SVGNS = 'http://www.w3.org/2000/svg';
let chartMode = false;          // is chart view active
let chartType = 'snake';        // 'snake' | 'circle'
let showWordCount = false;      // size segments proportionally by scene.wordCount
let traceCat = 'off';           // 'off' | 'characters' | 'locations' | 'themes' | 'misc' | 'povs'
// Lane count is NOT hard-capped — the tube widens and bands thin continuously
// as more items are traced, so selection count is only limited by how many
// items exist and by LANE_SANITY_CAP below (a runaway guard, not a design cap).
const LANE_SANITY_CAP = 24;
// A separate, larger palette from SEC_COLORS (section colors) — reusing that
// 8-color list meant any selection past 8 lanes repeated a color outright
// (e.g. lane 1 and lane 9 identical), which read as two different items being
// "the same" color. 16 distinct hues, alternating warm/cool so adjacent
// library items (likely to land at adjacent indices) don't get near-neighbor
// hues either.
const TRACE_COLORS = [
  '#5b8dd9', '#d4844a', '#6aaa80', '#9b7cc4', '#c4a84a', '#4aadb5', '#c47a8a', '#7a8ea8',
  '#b5574a', '#5ac48a', '#8a6ac4', '#c4914a', '#4a90c4', '#a5c44a', '#c454a0', '#4ac4b0',
];
const LANE_W_MAX = 5;           // trace-line stroke width with one lane — bold by default
const LANE_W_MIN = 1.5;         // stroke width floor — bands keep thinning toward this as lanes grow
const LANE_W_DECAY = 0.9;       // per-additional-lane multiplier on stroke width (continuous, no cliff)
const LANE_EDGE_PAD = 1.5;      // margin kept between the outermost lane and each tube edge
const LANE_MIN_PITCH = 2.5;     // smallest acceptable px between lane centers before the tube must grow
const TRACE_CATS = ['characters', 'locations', 'themes', 'misc', 'povs'];
let chartResizeTimer = null;
let chartLastSize = '';         // last rendered chart-scroll size, "WxH"
const CHART_PAD = 12;           // must match #chart-canvas padding in styles.css
const SNAKE_SEG_THICKNESS = 34; // base stroke width of the snake row "tube" — grows with trace lanes, see traceThickness()
const CIRCLE_SEG_THICKNESS = 30; // base stroke width of the circle ring — same growth rule
// Generous sanity ceiling, not a design target — the snake's turn radius grows
// in lockstep with its thickness (see computeSnakeLayout), so a very wide tube
// just makes a taller chart rather than breaking the turn geometry.
const SNAKE_THICKNESS_CEIL = 220;
// The circle's ring can't grow past this without R (see buildCircleChart)
// being squeezed below a size where the pie/labels are still legible; in
// practice traceThickness rarely asks for this much.
const CIRCLE_THICKNESS_CEIL = 160;
const SNAKE_TURN_CLEARANCE = 19; // r - thickness/2, held constant as thickness grows — see computeSnakeLayout
// The tube ramps up toward this floor as lanes are added (see traceThickness)
// rather than jumping straight there on the first selection — one lane looks
// like the non-trace tube, and it visibly grows with each item traced.
// Untouched (returns `base`) while trace is off.
const SNAKE_TRACE_FLOOR = 80;
const CIRCLE_TRACE_FLOOR = 90;
const TRACE_RAMP_DECAY = 0.6; // how quickly the ramp closes in on the floor — ~92% there by 6 lanes
const UNASSIGNED_SEC_ID = 'unassigned';
// Avg wordCount among scenes with one, from the most recently computed layout —
// stashed here so the tooltip (which only gets a single scene, not the whole
// layout) can label an averaged-in scene as "~N words (estimated)".
let lastAvgWordCount = null;

if (document.getElementById('chart-host')) {

  (function initChartPrefs() {
    const p = loadGlobalPrefs();
    if (p.chartType === 'snake' || p.chartType === 'circle') chartType = p.chartType;
    if (typeof p.showWordCount === 'boolean') showWordCount = p.showWordCount;
    if (p.chartTrace === 'off' || TRACE_CATS.includes(p.chartTrace)) traceCat = p.chartTrace;
    updateViewToggleUI();
    document.getElementById('chart-wc-toggle').classList.toggle('on', showWordCount);
    const traceSel = document.getElementById('chart-trace-sel');
    traceSel.value = traceCat;
    traceSel.classList.toggle('trace-on', traceCat !== 'off');
  })();

  // Re-render on any chart-area size change. The ResizeObserver catches panel
  // collapse/expand and panel-resize drags (which don't fire window resize);
  // the window listener stays as a baseline since RO callbacks ride the
  // rendering pipeline and can be throttled in background tabs.
  const scheduleChartRerender = () => {
    if (!chartMode) return;
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(renderChart, 150);
  };
  const chartScrollEl = document.getElementById('chart-scroll');
  if (typeof ResizeObserver !== 'undefined' && chartScrollEl) {
    new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      if (Math.round(r.width) + 'x' + Math.round(r.height) === chartLastSize) return;
      scheduleChartRerender();
    }).observe(chartScrollEl);
  }
  window.addEventListener('resize', scheduleChartRerender);
}

// ── VIEW TOGGLE ─────────────────────────────────────────────────────────────────
function toggleChartView() {
  if (chartMode) closeChartView(); else openChartView();
}
// Cards/Snake/Circle read as one 3-way switch (see #view-toggle) even though
// only two of the buttons live in chartType — the third state is "chart
// isn't open at all".
function updateViewToggleUI() {
  document.getElementById('chart-type-cards').classList.toggle('on', !chartMode);
  document.getElementById('chart-type-snake').classList.toggle('on', chartMode && chartType === 'snake');
  document.getElementById('chart-type-circle').classList.toggle('on', chartMode && chartType === 'circle');
}
function openChartView() {
  chartMode = true;
  document.getElementById('sbscrl').style.display = 'none';
  document.getElementById('sbemp').style.display = 'none';
  document.getElementById('chart-host').style.display = 'flex';
  // renderBoard() normally clears these body-level pins on every call, but it
  // early-returns into renderChart() while chartMode is on and never reaches
  // that cleanup — so a section pin left over from scrolling the board stays
  // stuck on screen for as long as the chart is open unless cleared here.
  document.querySelectorAll('.sec-pin').forEach(p => p.remove());
  // Card-only controls: meaningless once cards aren't on screen.
  document.getElementById('det-ck-wrap').style.display = 'none';
  document.getElementById('scalew-wrap').style.display = 'none';
  // Reuse the top header line for the chart's own status text (scene/section/
  // trace counts) in place of the board's scene count, drop the section
  // filter down onto the chart toolbar row after the Trace dropdown, and
  // move the Cards/Snake/Circle view switch onto that same toolbar row —
  // moving the actual nodes (not clones) keeps their listeners and state intact.
  document.getElementById('sbcnt').style.display = 'none';
  document.getElementById('sbhdr').insertBefore(document.getElementById('chart-status'), document.getElementById('det-ck-wrap'));
  document.getElementById('chart-toolbar').insertBefore(document.getElementById('sec-filter-wrap'), document.getElementById('chart-print-btn'));
  document.getElementById('chart-toolbar').insertBefore(document.getElementById('view-toggle'), document.getElementById('chart-wc-toggle'));
  updateViewToggleUI();
  setChartMenuLabel();
  renderChart();
}
function closeChartView() {
  if (!chartMode) return;
  chartMode = false;
  document.getElementById('chart-host').style.display = 'none';
  document.getElementById('sbscrl').style.display = '';
  document.getElementById('det-ck-wrap').style.display = '';
  document.getElementById('scalew-wrap').style.display = '';
  document.getElementById('sbcnt').style.display = '';
  document.getElementById('chart-toolbar').insertBefore(document.getElementById('chart-status'), document.getElementById('chart-print-btn'));
  document.getElementById('sbhdr').insertBefore(document.getElementById('sec-filter-wrap'), document.getElementById('srch-wrap'));
  document.getElementById('sbhdr').insertBefore(document.getElementById('view-toggle'), document.getElementById('sbhdr').firstChild);
  updateViewToggleUI();
  setChartMenuLabel();
  renderBoard();
}
function setChartMenuLabel() {
  const lbl = document.getElementById('menu-chart-text');
  if (lbl) lbl.textContent = chartMode ? 'Hide Scene Flow Chart' : 'Show Scene Flow Chart';
}
function setChartType(type) {
  if (type !== 'snake' && type !== 'circle') return;
  chartType = type;
  const p = loadGlobalPrefs(); p.chartType = type; saveGlobalPrefs(p);
  // Picking Snake/Circle from the board is now how you open the chart at
  // all (see #view-toggle) — openChartView already renders and updates the
  // toggle UI, so only do those explicitly on the "already open" path.
  if (chartMode) { updateViewToggleUI(); renderChart(); }
  else openChartView();
}
function toggleShowWordCount() {
  showWordCount = !showWordCount;
  document.getElementById('chart-wc-toggle').classList.toggle('on', showWordCount);
  const p = loadGlobalPrefs(); p.showWordCount = showWordCount; saveGlobalPrefs(p);
  if (chartMode) renderChart();
}
function traceActive() { return traceCat !== 'off'; }
function setChartTrace(cat) {
  if (cat !== 'off' && !TRACE_CATS.includes(cat)) return;
  traceCat = cat;
  document.getElementById('chart-trace-sel').classList.toggle('trace-on', traceCat !== 'off');
  const p = loadGlobalPrefs(); p.chartTrace = traceCat; saveGlobalPrefs(p);
  if (chartMode) renderChart();
}

// ── DATA ─────────────────────────────────────────────────────────────────────
function orderedScenes() {
  if (!S.sections.length) return [...S.scenes];
  const validSecIds = new Set(S.sections.map(s => s.id));
  const groups = [
    { id: null, isUnasgn: true,  scenes: S.scenes.filter(s => !validSecIds.has(s.sectionId)) },
    ...S.sections.map(sec => ({ id: sec.id, isUnasgn: false, scenes: S.scenes.filter(s => s.sectionId === sec.id) })),
  ];
  const visible = secFilterIds.size === 0
    ? groups
    : groups.filter(g => g.isUnasgn ? secFilterIds.has('unassigned') : secFilterIds.has(g.id));
  return visible.flatMap(g => g.scenes);
}

function chartFilterActive() {
  return !!searchQ || SECS.some(({ key }) => S.selections[key].size > 0) || S.selections.povs.size > 0;
}
function sceneMatchesChart(scene) {
  if (searchQ) return sceneMatchesSearch(scene);
  if (SECS.some(({ key }) => S.selections[key].size > 0) || S.selections.povs.size > 0) return sceneMatchesLib(scene);
  return false;
}
function sceneSectionName(scene) {
  if (!S.sections.length) return '';
  const sec = S.sections.find(s => s.id === scene.sectionId);
  return sec ? sec.name : 'Unassigned';
}

// ── TRACE LANES ─────────────────────────────────────────────────────────────────
function traceItems() {
  // All {id, name} entries in the traced category, in stable library order.
  if (traceCat === 'povs') {
    const used = new Set(S.scenes.flatMap(s => s.povs || []));
    return povEntities().filter(e => used.has(e.id));
  }
  return S[traceCat].map(item => ({ id: item.id, name: item.name }));
}

function computeTraceLanes(scenes) {
  // Returns { lanes: [{id, name, color}], overflow: number }. Lanes are only
  // the items the user has explicitly selected in the traced category —
  // nothing selected means no lanes (see updateChartLegend for the hint shown
  // then). There's no small design cap on lane count: the tube widens and
  // bands thin continuously as more are selected (see traceThickness/
  // traceLaneWidth). LANE_SANITY_CAP only guards against a pathological
  // selection (hundreds of items), not normal use.
  if (!traceActive()) return { lanes: [], overflow: 0 };
  const inScenes = id => scenes.some(sc => (sc[traceCat] || []).includes(id));
  const selected = S.selections[traceCat];
  const items = traceItems().filter(e => selected.has(e.id) && inScenes(e.id));
  const overflow = Math.max(0, items.length - LANE_SANITY_CAP);
  return { lanes: items.slice(0, LANE_SANITY_CAP).map((e, i) => ({ id: e.id, name: e.name, color: TRACE_COLORS[i % TRACE_COLORS.length] })), overflow };
}

function computeLaneRuns(layout, id) {
  const numMap = buildSceneNumMap();
  const runs = [];
  layout.forEach(({ scene, offset, len }) => {
    const has = (scene[traceCat] || []).includes(id);
    if (!has) return;
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

// How wide one trace line is drawn, given how many lanes are sharing the tube.
// Bands start at LANE_W_MAX and thin continuously (no cliff, no cap on k) toward
// a LANE_W_MIN floor as more items are traced, so adding "just one more" always
// has somewhere to go — it just costs a little width off every band.
function traceLaneWidth(k) {
  if (k <= 1) return LANE_W_MAX;
  return Math.max(LANE_W_MIN, LANE_W_MAX * Math.pow(LANE_W_DECAY, k - 1));
}
// How thick the tube itself should be, given the lane count. Ramps smoothly
// from `base` toward `floor` as lanes are added (TRACE_RAMP_DECAY controls how
// fast) rather than jumping straight to `floor` on the first selection — one
// lane looks like the non-trace tube; the tube visibly grows with each
// further item traced. Past the ramp, grows further only once `floor`
// wouldn't leave lanes at least LANE_MIN_PITCH apart when spread across the
// full tube width (see laneOffsets — lanes always fill whatever width they're
// given, so this is the one place lane count can still force more room),
// capped at `ceil` purely as a runaway guard. Returns `base` unchanged while
// trace is off — the non-trace appearance is always untouched.
function traceThickness(base, floor, ceil, k) {
  if (k <= 0) return base;
  const ramped = base + (floor - base) * (1 - Math.pow(TRACE_RAMP_DECAY, k - 1));
  if (k === 1) return ramped; // equals `base` exactly — see TRACE_RAMP_DECAY math
  const w = traceLaneWidth(k);
  const margin = w / 2 + LANE_EDGE_PAD;
  const needed = 2 * margin + (k - 1) * LANE_MIN_PITCH;
  return Math.min(ceil, Math.max(ramped, needed));
}
// Lanes always spread across the FULL usable width of the tube, edge to edge
// (not just far enough apart to be legible) — a tube sized generously by
// traceThickness's floor should look filled with color, not like a few thin
// lines floating in a mostly-empty gray band.
function laneOffsets(k, thickness, laneW) {
  const usable = thickness - 2 * (laneW / 2 + LANE_EDGE_PAD);
  const spacing = k > 1 ? usable / (k - 1) : 0;
  return Array.from({ length: k }, (_, i) => (i - (k - 1) / 2) * spacing);
}

// mapLen converts a length along the CENTERLINE into the corresponding length
// along this particular lane path. For a circle this is exact simple
// proportional scaling (offsetting a full circle's radius scales its whole
// circumference uniformly). For the snake it is NOT exact — see
// snakeLenToLaneLen — because a lane's turns have a different radius (and thus
// a different arc length) than its straight runs, which are unchanged; passing
// no mapLen falls back to the (circle-correct, snake-approximate) proportional
// scale for callers that don't need the precise version.
function drawLaneRuns(container, lanePathEl, laneTotal, total, runs, lane, laneW, mapLen) {
  const map = mapLen || (len => len / total * laneTotal);
  runs.forEach(run => {
    const s = map(run.start), e = map(run.end);
    const inset = Math.min(2, (e - s) / 4); // soft ends, keep length positive
    const len = Math.max(2, e - s - 2 * inset);
    const clone = lanePathEl.cloneNode(false);
    clone.classList.add('chart-lane');
    clone.dataset.lane = lane.id;
    clone.setAttribute('stroke', lane.color);
    clone.setAttribute('stroke-width', laneW);
    clone.dataset.baseWidth = laneW; // highlightLaneLegend widens relative to this, not a fixed px value
    clone.setAttribute('stroke-linecap', 'round');
    clone.setAttribute('fill', 'none');
    clone.setAttribute('stroke-dasharray', len + ' ' + Math.max(0, laneTotal - len));
    clone.setAttribute('stroke-dashoffset', String(-(s + inset)));
    clone.style.pointerEvents = 'stroke';
    clone.addEventListener('mouseenter', e2 => { showLaneTip(e2, lane, run); highlightLaneLegend(lane.id, true); });
    clone.addEventListener('mousemove', moveChartTip);
    clone.addEventListener('mouseleave', () => { hideChartTip(); highlightLaneLegend(lane.id, false); });
    container.appendChild(clone);
  });
}
// Widens a lane by a multiple of its OWN width (plus a flat px bump) rather
// than to a fixed absolute value — a fixed target (e.g. "5px") stops reading
// as a highlight once bands are naturally that thick or thicker on their own,
// which is common now that lanes can grow well past their old 3px max.
function highlightLaneLegend(id, on) {
  document.querySelectorAll('.chart-lane[data-lane="' + CSS.escape(String(id)) + '"]').forEach(l => {
    l.classList.toggle('chart-lane-hl', on);
    const base = parseFloat(l.dataset.baseWidth) || LANE_W_MIN;
    l.setAttribute('stroke-width', on ? base * 1.6 + 1.5 : base);
  });
  const el = document.querySelector('.chart-legend-item[data-lane="' + CSS.escape(String(id)) + '"]');
  if (el) el.classList.toggle('chart-legend-hl', on);
}
function showLaneTip(e, lane, run) {
  const tip = document.getElementById('chart-tip');
  tip.innerHTML = '';
  const t1 = document.createElement('div'); t1.className = 'chart-tip-title';
  t1.textContent = lane.name;
  const t2 = document.createElement('div'); t2.className = 'chart-tip-sec';
  t2.textContent = run.firstNum === run.lastNum
    ? 'Scene ' + run.firstNum : 'Scenes ' + run.firstNum + '–' + run.lastNum;
  tip.appendChild(t1); tip.appendChild(t2);
  tip.style.display = 'block';
  positionChartTip(e);
}
function traceCatLabel() {
  const sec = SECS.find(s => s.key === traceCat);
  return sec ? sec.label : 'POV';
}

// ── RENDER ─────────────────────────────────────────────────────────────────────
function renderChart() {
  const canvas = document.getElementById('chart-canvas');
  if (!canvas) return;
  canvas.innerHTML = '';
  hideChartTip();
  const scrollEl = document.getElementById('chart-scroll');
  chartLastSize = scrollEl.clientWidth + 'x' + scrollEl.clientHeight;
  const scenes = orderedScenes();
  const trace = computeTraceLanes(scenes);
  updateChartStatus(scenes);
  updateChartLegend(scenes, trace);
  if (!S.scenes.length) { renderChartEmpty(canvas); return; }
  if (chartType === 'circle') buildCircleChart(canvas, scenes, trace);
  else buildSnakeChart(canvas, scenes, trace);
}

function renderChartEmpty(canvas) {
  const wrap = document.createElement('div'); wrap.className = 'chart-empty';
  const icon = document.createElement('div'); icon.className = 'ei'; icon.textContent = '🎭';
  const p = document.createElement('p'); p.textContent = 'Create your first scene to see the flow chart';
  wrap.appendChild(icon); wrap.appendChild(p);
  canvas.appendChild(wrap);
}
function renderChartNoMatch(canvas) {
  const wrap = document.createElement('div'); wrap.className = 'chart-empty';
  const p = document.createElement('p'); p.textContent = 'No scenes match the current section filter.';
  wrap.appendChild(p);
  canvas.appendChild(wrap);
}

function updateChartStatus(scenes) {
  const el = document.getElementById('chart-status'); if (!el) return;
  // secFilterIds (from the Sections dropdown, editor.js) is empty = "all
  // sections visible"; once it's narrowed to a subset, that's the section
  // count that actually describes what's on screen, not S.sections.length.
  const n = scenes.length, secCount = secFilterIds.size > 0 ? secFilterIds.size : S.sections.length;
  let txt = `Showing ${n} scene${n !== 1 ? 's' : ''} · ${secCount} section${secCount !== 1 ? 's' : ''}`;
  if (traceActive() && !searchQ) {
    const k = S.selections[traceCat].size;
    if (traceCat === 'povs') {
      txt += ` · tracing ${k} POV${k !== 1 ? 's' : ''}`;
    } else {
      const singular = SINGULAR[traceCat].toLowerCase();
      const label = k === 1 ? singular : singular + 's';
      txt += ` · tracing ${k} ${label}`;
    }
  } else if (chartFilterActive()) {
    const matching = scenes.filter(sceneMatchesChart).length;
    txt += ` · ${matching} matching`;
  }
  el.textContent = txt;
}

function sectionLetter(idx) {
  return idx < 26 ? String.fromCharCode(65 + idx) : String(idx + 1);
}

function hasUnassignedScenes() {
  const validSecIds = new Set(S.sections.map(s => s.id));
  return S.sections.length > 0 && S.scenes.some(s => !validSecIds.has(s.sectionId));
}

function chartLegendSections() {
  // orderedScenes() always places unassigned scenes first, ahead of every real
  // section — so its letter must lead the sequence too, or the letters and the
  // chart's left-to-right / clockwise order fall out of sync.
  const items = [...S.sections];
  if (hasUnassignedScenes()) items.unshift({ id: UNASSIGNED_SEC_ID, name: 'Unassigned' });
  return items;
}

// True only when the set is a genuine mix — some scenes carry a real wordCount
// and some don't — so the average-fallback (and its tick marks) is actually in
// play. An all-or-nothing set never triggers it: with none set, sizing is just
// the plain uniform layout; with all set, nothing is estimated.
function sceneSetHasEstimated(scenes) {
  if (!showWordCount) return false;
  return scenes.some(s => s.wordCount > 0) && scenes.some(s => !(s.wordCount > 0));
}

function chartLegendSep(el) {
  if (el.children.length) { const sep = document.createElement('span'); sep.className = 'chart-legend-sep'; sep.textContent = '·'; el.appendChild(sep); }
}
function updateChartLegend(scenes, trace) {
  const el = document.getElementById('chart-legend'); if (!el) return;
  el.innerHTML = '';
  // Sections used to get a name legend here too, but the snake already marks
  // each section boundary directly on the tube with a lettered marker (see
  // addSnakeSectionMarkers/drawSectionMarkerAt) — hovering it shows the name
  // via showSectionTip, the same on-chart discovery the circle's pie wedges
  // use. Repeating the names in a legend row just cost a line of header space
  // for no new information.
  if (sceneSetHasEstimated(scenes)) {
    chartLegendSep(el);
    const item = document.createElement('span'); item.className = 'chart-legend-item chart-legend-est';
    const tickEl = document.createElement('span'); tickEl.className = 'chart-legend-tick';
    const nameEl = document.createElement('span'); nameEl.className = 'chart-legend-name'; nameEl.textContent = 'Estimated (no word count)';
    item.appendChild(tickEl); item.appendChild(nameEl);
    el.appendChild(item);
  }
  if (trace && traceActive()) {
    if (trace.lanes.length === 0) {
      chartLegendSep(el);
      const hintLabel = traceCat === 'povs' ? 'POVs' : traceCatLabel().toLowerCase();
      const item = document.createElement('span'); item.className = 'chart-legend-item chart-legend-hint';
      item.textContent = `Select ${hintLabel} in the library to trace them`;
      el.appendChild(item);
    } else {
      trace.lanes.forEach(lane => {
        chartLegendSep(el);
        const item = document.createElement('span'); item.className = 'chart-legend-item'; item.dataset.lane = lane.id;
        const swatch = document.createElement('span'); swatch.className = 'chart-legend-swatch'; swatch.style.background = lane.color;
        const nameEl = document.createElement('span'); nameEl.className = 'chart-legend-name'; nameEl.textContent = lane.name;
        item.appendChild(swatch); item.appendChild(nameEl);
        item.addEventListener('mouseenter', () => highlightLaneLegend(lane.id, true));
        item.addEventListener('mouseleave', () => highlightLaneLegend(lane.id, false));
        el.appendChild(item);
      });
      if (trace.overflow > 0) {
        chartLegendSep(el);
        const item = document.createElement('span'); item.className = 'chart-legend-item';
        item.title = 'Select fewer items to choose which lines are shown';
        item.textContent = `+${trace.overflow} more`;
        el.appendChild(item);
      }
    }
  }
}
// ── PROPORTIONAL LAYOUT (by word count) ─────────────────────────────────────────
// Normally every scene gets an equal share of the path. When showWordCount is on,
// each scene's share is weighted by scene.wordCount instead; scenes with no
// wordCount (0 counts as unset too) fall back to the average of scenes that do
// have one, so a handful of missing values render as "typical size" rather than
// collapsing to invisible slivers. If *no* scene in the set has a wordCount, every
// weight is 1 and this reduces to the original even split.
function computeSceneLayout(scenes, total) {
  const N = scenes.length;
  if (!showWordCount) {
    lastAvgWordCount = null;
    const segLen = total / N;
    return scenes.map((scene, i) => ({ scene, len: segLen, offset: i * segLen, estimated: false }));
  }
  const known = scenes.filter(s => s.wordCount > 0).map(s => s.wordCount);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  lastAvgWordCount = avg;
  const weights = scenes.map(s => (s.wordCount > 0) ? s.wordCount : (avg || 1));
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  let cum = 0;
  return scenes.map((scene, i) => {
    const len = total * weights[i] / sumW;
    const item = { scene, len, offset: cum, estimated: avg !== null && !(scene.wordCount > 0) };
    cum += len;
    return item;
  });
}

// ── SEGMENT / NUMBER / TICK PRIMITIVES (shared snake + circle) ────────────────
// While tracing, the library selections that drive sceneMatchesChart() are being
// visualized as lanes instead — so segment coloring must ignore them and fall back
// to search-only matching, or the accent fill would fight the trace lines.
function chartSegFilterActive() { return traceActive() ? !!searchQ : chartFilterActive(); }
function segIsMatched(scene) { return traceActive() ? (!!searchQ && sceneMatchesSearch(scene)) : sceneMatchesChart(scene); }
function applySegColor(clone, scene) {
  clone.classList.remove('chart-seg-match', 'chart-seg-dim');
  if (chartSegFilterActive()) {
    if (segIsMatched(scene)) { clone.setAttribute('stroke', 'var(--acc)'); clone.classList.add('chart-seg-match'); }
    else { clone.setAttribute('stroke', 'var(--s1)'); clone.classList.add('chart-seg-dim'); }
  } else {
    clone.setAttribute('stroke', 'var(--s1)');
  }
}

function addSegments(container, centerline, layout, total, thickness) {
  layout.forEach(({ scene, len, offset }) => {
    const GAP = Math.min(3, len / 3); // keep the dash length positive when segments get tiny
    const clone = centerline.cloneNode(false);
    clone.classList.add('chart-seg');
    clone.dataset.sceneId = scene.id;
    clone.setAttribute('stroke-dasharray', (len - GAP) + ' ' + (total - len + GAP));
    clone.setAttribute('stroke-dashoffset', String(-(offset + GAP / 2)));
    clone.setAttribute('fill', 'none');
    clone.setAttribute('stroke-width', thickness);
    clone.setAttribute('stroke-linecap', 'butt');
    clone.style.pointerEvents = 'stroke';
    applySegColor(clone, scene);
    clone.addEventListener('mouseenter', e => { showChartTip(e, scene); highlightSegNumber(scene.id, true); });
    clone.addEventListener('mousemove', moveChartTip);
    clone.addEventListener('mouseleave', () => { hideChartTip(); highlightSegNumber(scene.id, false); });
    clone.addEventListener('click', () => onSegClick(scene));
    container.appendChild(clone);
  });
}
// Short red accent mark just past an averaged-in ("estimated") segment's own
// scene number — deliberately small and off to the side rather than a
// full-width divider crossing the ribbon, so it reads as an annotation on the
// number instead of competing with the segment boundaries themselves.
function drawEstimatedTick(container, x, y, nx, ny, sceneId) {
  const near = 9, far = 16; // px out from the number position, along the normal
  const line = document.createElementNS(SVGNS, 'line');
  line.setAttribute('x1', x + nx * near); line.setAttribute('y1', y + ny * near);
  line.setAttribute('x2', x + nx * far); line.setAttribute('y2', y + ny * far);
  line.setAttribute('stroke', 'var(--rd)');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linecap', 'round');
  line.classList.add('chart-seg-tick');
  line.dataset.sceneId = sceneId;
  line.style.pointerEvents = 'none';
  container.appendChild(line);
}
// The hover darkening on a segment (see .chart-seg:hover in styles.css) can
// swallow the resting --sub/--ontx number color it's drawn under, so swap the
// matching chart-num to --ontx while hovered — the same "readable against a
// dark/strong fill" color already used for filter-matched numbers, and it
// reliably contrasts against --tx (the hover color) on every theme since
// both variables sit at opposite ends of that theme's light/dark polarity.
function highlightSegNumber(sceneId, on) {
  const num = document.querySelector('.chart-num[data-scene-id="' + sceneId + '"]');
  if (num) num.classList.toggle('chart-num-hl', on);
}

function drawSectionMarkerAt(container, x, y, sectionId, idx) {
  const g = document.createElementNS(SVGNS, 'g');
  g.classList.add('chart-sec-marker');
  g.dataset.secId = sectionId;
  const circle = document.createElementNS(SVGNS, 'circle');
  circle.setAttribute('cx', x); circle.setAttribute('cy', y); circle.setAttribute('r', 9);
  circle.setAttribute('fill', 'var(--tx)');
  circle.setAttribute('stroke', 'none');
  const txt = document.createElementNS(SVGNS, 'text');
  txt.setAttribute('x', x); txt.setAttribute('y', y);
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('dominant-baseline', 'central');
  txt.setAttribute('font-size', '10');
  txt.setAttribute('font-weight', '700');
  txt.setAttribute('fill', 'var(--bg1)');
  txt.textContent = sectionLetter(idx);
  g.appendChild(circle); g.appendChild(txt);
  g.addEventListener('mouseenter', e => showSectionTip(e, sectionId));
  g.addEventListener('mousemove', moveChartTip);
  g.addEventListener('mouseleave', hideChartTip);
  container.appendChild(g);
}
function showSectionTip(e, sectionId) {
  const name = sectionId === UNASSIGNED_SEC_ID ? 'Unassigned' : (S.sections.find(s => s.id === sectionId) || {}).name;
  const tip = document.getElementById('chart-tip');
  tip.innerHTML = '';
  const t1 = document.createElement('div'); t1.className = 'chart-tip-title';
  t1.textContent = name || '';
  tip.appendChild(t1);
  tip.style.display = 'block';
  positionChartTip(e);
}

// ── SNAKE ──────────────────────────────────────────────────────────────────────
function computeSnakeLayout(N, W, thickness) {
  // The row/curve "tube" is a thick stroke centered on this arc: at the tip of
  // each turn, its outer edge extends thickness/2 past the centerline itself,
  // so the margin needs that much extra clearance on top of the intended
  // CHART_PAD, or the turn's outer edge clips against the SVG bounds.
  // r (the turn radius) tracks thickness directly — SNAKE_TURN_CLEARANCE is
  // the inner turn edge's clearance (r - thickness/2), held constant so the
  // tube never gets close to swallowing its own turn regardless of how much
  // trace lanes have widened it. This is also what makes "snake height expand"
  // as lanes are added: row-to-row spacing (2r) grows in lockstep with r.
  // At the base thickness (34) this reproduces the pre-trace r of 36 exactly.
  const r = thickness / 2 + SNAKE_TURN_CLEARANCE, M = r + CHART_PAD + thickness / 2, A = Math.PI * r, T = 110;
  const runLen = Math.max(2 * r + 20, W - 2 * M);
  const L = N * T;
  let R = Math.max(1, Math.ceil((L - runLen) / (runLen + A)) + 1);
  let run = (L - (R - 1) * A) / R;
  if (run > runLen) { R++; run = (L - (R - 1) * A) / R; }
  if (R > 1 && run < 180) { R--; run = (L - (R - 1) * A) / R; }
  // The above only sizes `run` to hit ~110px/scene, which leaves it short of
  // runLen (and thus dead space on the right of every row) whenever N*T
  // doesn't divide evenly into R rows. Row count R is already settled above,
  // so stretch to the full available width now.
  run = runLen;
  return { R, run, M, r };
}
function buildSnakePath(N, W, thickness) {
  const { R, run, M, r } = computeSnakeLayout(N, W, thickness);
  const rowStep = 2 * r;
  // +24 (not 0) so row 1 doesn't sit flush against the very top of the chart.
  const y0 = 24 + r;
  let d = `M ${M} ${y0}`, y = y0;
  for (let row = 0; row < R; row++) {
    const leftToRight = row % 2 === 0;
    const xEnd = leftToRight ? M + run : M;
    d += ` L ${xEnd} ${y}`;
    if (row < R - 1) {
      const sweep = leftToRight ? 1 : 0, newY = y + rowStep;
      d += ` A ${r} ${r} 0 0 ${sweep} ${xEnd} ${newY}`;
      y = newY;
    }
  }
  return { d, height: y0 + (R - 1) * rowStep + r + 24 };
}
// Parallel offset of the snake centerline, for one trace lane. Mirrors
// buildSnakePath exactly (same R/run/M/r) so lanes land on the same geometry as
// the tube; d=0 reproduces the centerline. A lane at constant offset "to the
// left of travel" sits ABOVE the centerline on left-to-right rows and BELOW it
// on right-to-left rows, and turn radii alternate r+d / r-d — that's what keeps
// the lane weaving through the turns correctly instead of crossing the tube.
function buildSnakeLanePathD(N, W, d, thickness) {
  const { R, run, M, r } = computeSnakeLayout(N, W, thickness);
  const rowStep = 2 * r;
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
      const newY = y + rowStep;
      const yNext = newY + (leftToRight ? d : -d); // next row travels the other way
      dd += ` A ${rLane} ${rLane} 0 0 ${sweep} ${xEnd} ${yNext}`;
      y = newY;
    }
  }
  return dd;
}
// Converts a length along the CENTERLINE into the equivalent length along a
// lane offset by `d`. Proportional scaling (len/total*laneTotal) is wrong here:
// a lane's straight runs are the exact same length as the centerline's (only
// shifted in y), but its turns have a different radius (r+d or r-d) and thus a
// different arc length — so the ratio between centerline-length and
// lane-length isn't constant, it only changes inside turns. Using proportional
// scaling anyway visibly drifted lane color boundaries away from the actual
// scene boundaries, worse the more lanes were offset from center. This walks
// the same row/turn structure buildSnakeLanePathD draws and converts each
// piece on its own terms: straight-run lengths pass through unchanged, and an
// arc's length is rescaled by exactly how much longer/shorter that lane's
// turn radius makes it.
function snakeLenToLaneLen(lenC, N, W, thickness, d) {
  const { R, run, r } = computeSnakeLayout(N, W, thickness);
  const turnLenC = Math.PI * r;
  let remaining = lenC, laneLen = 0;
  for (let row = 0; row < R; row++) {
    const straight = Math.min(remaining, run);
    laneLen += straight;
    remaining -= run;
    if (remaining <= 0) return laneLen;
    if (row < R - 1) {
      const leftToRight = row % 2 === 0;
      const rLane = leftToRight ? r + d : r - d;
      const turnLenLane = Math.PI * rLane;
      if (remaining <= turnLenC) return laneLen + (remaining / turnLenC) * turnLenLane;
      laneLen += turnLenLane;
      remaining -= turnLenC;
    }
  }
  return laneLen;
}
function addSnakeTraceLanes(svg, N, W, trace, layout, total, thickness, laneW) {
  if (!trace || !trace.lanes.length) return;
  const offsets = laneOffsets(trace.lanes.length, thickness, laneW);
  trace.lanes.forEach((lane, i) => {
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', buildSnakeLanePathD(N, W, offsets[i], thickness));
    path.setAttribute('stroke', 'none'); path.setAttribute('fill', 'none');
    svg.appendChild(path);
    const laneTotal = path.getTotalLength();
    const runs = computeLaneRuns(layout, lane.id);
    const mapLen = len => snakeLenToLaneLen(len, N, W, thickness, offsets[i]);
    drawLaneRuns(svg, path, laneTotal, total, runs, lane, laneW, mapLen);
  });
}

function buildSnakeChart(canvas, scenes, trace) {
  const scrollEl = document.getElementById('chart-scroll');
  const W = Math.max(300, (scrollEl.clientWidth || 800) - 2 * CHART_PAD);
  const N = scenes.length;
  if (N === 0) { renderChartNoMatch(canvas); return; }
  const thickness = traceThickness(SNAKE_SEG_THICKNESS, SNAKE_TRACE_FLOOR, SNAKE_THICKNESS_CEIL, trace.lanes.length);
  const laneW = traceLaneWidth(trace.lanes.length);
  const svg = document.createElementNS(SVGNS, 'svg');
  canvas.appendChild(svg);
  const { d, height } = buildSnakePath(N, W, thickness);
  svg.setAttribute('width', W);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
  const centerline = document.createElementNS(SVGNS, 'path');
  centerline.setAttribute('d', d);
  centerline.setAttribute('stroke', 'none');
  centerline.setAttribute('fill', 'none');
  svg.appendChild(centerline);
  const total = centerline.getTotalLength();
  const layout = computeSceneLayout(scenes, total);
  addSegments(svg, centerline, layout, total, thickness);
  addSnakeTraceLanes(svg, N, W, trace, layout, total, thickness, laneW);
  addSnakeNumbers(svg, centerline, layout, total);
  addSnakeSectionMarkers(svg, centerline, layout, total, W, thickness);
  if (showWordCount) addSnakeEstimatedTicks(svg, centerline, layout, total);
}

// Scene number, drawn on a small solid badge instead of bare text over the
// segment fill — a text-stroke halo (the old approach, still needed once
// trace lanes are drawn behind it) reads as blurry at this font size, and a
// plain color swap on hover wasn't reliably legible against every segment
// color/trace combination. A badge guarantees contrast regardless of what's
// underneath. Sized to the text itself (not a fixed circle) since scene
// counts run past two digits.
// Default colors are set as attributes (not just CSS) so printChart's clone
// — a bare document with no app stylesheet — still resolves them via
// resolveChartVars; the hover state stays CSS-only since print never
// carries a live hover.
function drawChartNum(container, x, y, text, sceneId, matched) {
  const g = document.createElementNS(SVGNS, 'g');
  g.classList.add('chart-num');
  g.dataset.sceneId = sceneId;
  g.style.pointerEvents = 'none';
  const w = Math.max(15, text.length * 7 + 5), h = 14;
  const bg = document.createElementNS(SVGNS, 'rect');
  bg.setAttribute('x', x - w / 2); bg.setAttribute('y', y - h / 2);
  bg.setAttribute('width', w); bg.setAttribute('height', h);
  bg.setAttribute('rx', h / 2);
  bg.setAttribute('fill', matched ? 'var(--acc)' : 'var(--bg1)');
  bg.classList.add('chart-num-bg');
  const txt = document.createElementNS(SVGNS, 'text');
  txt.setAttribute('x', x); txt.setAttribute('y', y);
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('dominant-baseline', 'central');
  txt.setAttribute('font-size', '10');
  txt.setAttribute('font-weight', '700');
  txt.setAttribute('fill', matched ? 'var(--ontx)' : 'var(--sub)');
  txt.textContent = text;
  g.appendChild(bg); g.appendChild(txt);
  container.appendChild(g);
  return g;
}
function addSnakeNumbers(svg, centerline, layout, total) {
  // Built once for this pass instead of each scene independently rebuilding
  // the same ordered scene list via sceneDisplayNum().
  const numMap = buildSceneNumMap();
  layout.forEach(({ scene, len, offset }) => {
    if (len < 26) return; // segment too small on screen to fit a number legibly
    const mid = centerline.getPointAtLength(offset + len / 2);
    const matched = chartSegFilterActive() && segIsMatched(scene);
    drawChartNum(svg, mid.x, mid.y, String(numMap.get(scene.id) ?? 1), scene.id, matched);
  });
}

function addSnakeSectionMarkers(svg, centerline, layout, total, W, thickness) {
  if (!S.sections.length) return;
  const validSecIds = new Set(S.sections.map(s => s.id));
  const letterOffset = hasUnassignedScenes() ? 1 : 0; // Unassigned (if present) takes letter A
  const secIndexById = new Map(S.sections.map((s, i) => [s.id, i + letterOffset]));
  const pad = 14;
  // 16 is tuned for the base tube thickness; grow it in step with any lane-driven
  // thickness boost so the marker still clears the (now wider) tube edge.
  const markerOff = 16 + (thickness - SNAKE_SEG_THICKNESS) / 2;
  let lastSec;
  layout.forEach(({ scene, offset }, i) => {
    const secId = validSecIds.has(scene.sectionId) ? scene.sectionId : null;
    if (i > 0 && secId === lastSec) { lastSec = secId; return; }
    const len = offset;
    const p0 = centerline.getPointAtLength(Math.max(0, len - 0.5));
    const p1 = centerline.getPointAtLength(Math.min(total, len + 0.5));
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist, ny = dx / dist;
    const p = centerline.getPointAtLength(len);
    const mx = Math.min(W - pad, Math.max(pad, p.x + nx * markerOff));
    const my = p.y + ny * markerOff;
    const markerId = secId !== null ? secId : UNASSIGNED_SEC_ID;
    const idx = secId !== null ? secIndexById.get(secId) : 0;
    drawSectionMarkerAt(svg, mx, my, markerId, idx);
    lastSec = secId;
  });
}

function addSnakeEstimatedTicks(svg, centerline, layout, total) {
  layout.forEach(({ scene, offset, len, estimated }) => {
    if (!estimated) return;
    // Same midpoint the scene number is drawn at (addSnakeNumbers) — the tick
    // is pushed outward from there along the normal, so it lands just past
    // the digit instead of on top of it.
    const mid = offset + len / 2;
    const p0 = centerline.getPointAtLength(Math.max(0, mid - 0.5));
    const p1 = centerline.getPointAtLength(Math.min(total, mid + 0.5));
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist, ny = dx / dist;
    const p = centerline.getPointAtLength(mid);
    drawEstimatedTick(svg, p.x, p.y, nx, ny, scene.id);
  });
}

// ── CIRCLE ─────────────────────────────────────────────────────────────────────
function addCircleTraceLanes(g, layout, cx, cy, R, total, trace, thickness, laneW) {
  if (!trace || !trace.lanes.length) return;
  const offsets = laneOffsets(trace.lanes.length, thickness, laneW);
  trace.lanes.forEach((lane, i) => {
    const path = document.createElementNS(SVGNS, 'circle');
    path.setAttribute('cx', cx); path.setAttribute('cy', cy); path.setAttribute('r', R + offsets[i]);
    path.setAttribute('stroke', 'none'); path.setAttribute('fill', 'none');
    g.appendChild(path);
    const laneTotal = path.getTotalLength();
    const runs = computeLaneRuns(layout, lane.id);
    drawLaneRuns(g, path, laneTotal, total, runs, lane, laneW);
  });
}
function buildCircleChart(canvas, scenes, trace) {
  const scrollEl = document.getElementById('chart-scroll');
  const paneW = Math.max(300, (scrollEl.clientWidth || 600) - 2 * CHART_PAD);
  const paneH = Math.max(300, (scrollEl.clientHeight || 480) - 2 * CHART_PAD);
  const N = scenes.length;
  if (N === 0) { renderChartNoMatch(canvas); return; }
  const thickness = traceThickness(CIRCLE_SEG_THICKNESS, CIRCLE_TRACE_FLOOR, CIRCLE_THICKNESS_CEIL, trace.lanes.length);
  const laneW = traceLaneWidth(trace.lanes.length);
  // R shrinks as the ring thickens, so the whole chart always fits inside the
  // visible pane — no scrolling to find a ring that's grown past the bottom
  // of the window. This is also most of why the pie shrinks when tracing: the
  // ring both gets thicker AND moves inward to compensate. At the base
  // thickness (trace off) this is identical to the original fixed "-25".
  const R = Math.max(70, Math.min(paneW, paneH) / 2 - (thickness / 2 + 10));
  const availW = paneW, availH = paneH;
  const cx = availW / 2, cy = availH / 2;
  const svg = document.createElementNS(SVGNS, 'svg');
  canvas.appendChild(svg);
  svg.setAttribute('width', availW);
  svg.setAttribute('height', availH);
  svg.setAttribute('viewBox', `0 0 ${availW} ${availH}`);
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
  svg.appendChild(g);
  const centerline = document.createElementNS(SVGNS, 'circle');
  centerline.setAttribute('cx', cx); centerline.setAttribute('cy', cy); centerline.setAttribute('r', R);
  centerline.setAttribute('stroke', 'none'); centerline.setAttribute('fill', 'none');
  g.appendChild(centerline);
  const total = centerline.getTotalLength();
  const layout = computeSceneLayout(scenes, total);
  addSegments(g, centerline, layout, total, thickness);
  addCircleTraceLanes(g, layout, cx, cy, R, total, trace, thickness, laneW);
  addCircleNumbers(svg, layout, cx, cy, R, total);
  drawCirclePie(svg, layout, cx, cy, R, total, thickness);
  if (showWordCount) addCircleEstimatedTicks(svg, layout, cx, cy, R, total);
}

function addCircleNumbers(svg, layout, cx, cy, R, total) {
  // Built once for this pass instead of each scene independently rebuilding
  // the same ordered scene list via sceneDisplayNum().
  const numMap = buildSceneNumMap();
  layout.forEach(({ scene, len, offset }) => {
    if (len < 26) return; // segment too small on screen to fit a number legibly
    const angleDeg = -90 + (offset + len / 2) / total * 360;
    const rad = angleDeg * Math.PI / 180;
    const x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad);
    const matched = chartSegFilterActive() && segIsMatched(scene);
    drawChartNum(svg, x, y, String(numMap.get(scene.id) ?? 1), scene.id, matched);
  });
}

function addCircleEstimatedTicks(svg, layout, cx, cy, R, total) {
  layout.forEach(({ scene, offset, len, estimated }) => {
    if (!estimated) return;
    // Same midpoint the scene number is drawn at (addCircleNumbers).
    const angleDeg = -90 + (offset + len / 2) / total * 360;
    const p = circlePoint(cx, cy, R, angleDeg);
    const rad = angleDeg * Math.PI / 180;
    // On a circle the direction crossing the ring (perpendicular to the tangent)
    // is simply the radial direction, so no separate tangent-sampling is needed
    // here the way addSnakeEstimatedTicks needs it for an arbitrary path.
    drawEstimatedTick(svg, p.x, p.y, Math.cos(rad), Math.sin(rad), scene.id);
  });
}

function circlePoint(cx, cy, r, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function truncateForWidth(name, maxWidth, charWidth) {
  charWidth = charWidth || 5.7;
  const maxChars = Math.max(0, Math.floor(maxWidth / charWidth));
  if (name.length <= maxChars) return name;
  if (maxChars <= 1) return '';
  return name.slice(0, maxChars - 1) + '…';
}
function drawPieWedge(svg, cx, cy, outerR, startDeg, endDeg, sec) {
  const p2 = circlePoint(cx, cy, outerR, startDeg);
  const p3 = circlePoint(cx, cy, outerR, endDeg);
  const largeArc = (endDeg - startDeg) > 180 ? 1 : 0;
  const d = `M ${cx} ${cy} L ${p2.x} ${p2.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${p3.x} ${p3.y} Z`;
  const path = document.createElementNS(SVGNS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'var(--bg2)');
  // --bdr is deliberately subtle (barely-there chrome dividers), which reads as
  // nearly invisible on dark themes once it's the only thing separating two large
  // wedges. --sub is tuned per theme to stay legible as body text against --bg2,
  // so it holds up as a divider color across both light and dark themes.
  path.setAttribute('stroke', 'var(--sub)');
  path.setAttribute('stroke-width', '1.25');
  path.classList.add('chart-pie-wedge');
  path.dataset.secId = sec.id;
  path.addEventListener('mouseenter', e => showSectionTip(e, sec.id));
  path.addEventListener('mousemove', moveChartTip);
  path.addEventListener('mouseleave', hideChartTip);
  svg.appendChild(path);

  const midDeg = (startDeg + endDeg) / 2;
  const midR = outerR * 0.6;
  const angleSpanRad = (endDeg - startDeg) * Math.PI / 180;
  const availWidth = midR * angleSpanRad - 8;
  const label = truncateForWidth(sec.name, availWidth);
  if (label) {
    const p = circlePoint(cx, cy, midR, midDeg);
    const txt = document.createElementNS(SVGNS, 'text');
    txt.setAttribute('x', p.x); txt.setAttribute('y', p.y);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'central');
    txt.setAttribute('font-size', '10');
    txt.setAttribute('fill', 'var(--sub)');
    txt.style.pointerEvents = 'none';
    txt.textContent = label;
    svg.appendChild(txt);
  }
}
function drawCirclePie(svg, layout, cx, cy, R, total, thickness) {
  if (!S.sections.length) return;
  const validSecIds = new Set(S.sections.map(s => s.id));
  // Leaves a small gap between the pie's outer edge and the ring's inner edge
  // (thickness/2). At the base thickness this is R-20, identical to before
  // trace lanes existed; as lanes widen the ring (and R itself shrinks to
  // compensate, see buildCircleChart), the pie gives up room from both
  // directions at once. With enough lanes traced the pie shrinks to a sliver
  // near the center — floored at 8 (not 0) purely so the wedge path stays
  // numerically well-formed.
  const outerR = Math.max(8, R - thickness / 2 - 5);
  const runs = [];
  layout.forEach(({ scene, offset, len }) => {
    const secId = validSecIds.has(scene.sectionId) ? scene.sectionId : null;
    const last = runs[runs.length - 1];
    if (last && last.secId === secId) last.end = offset + len;
    else runs.push({ secId, start: offset, end: offset + len });
  });
  // Skip only when there's fundamentally nothing to ever distinguish (one section,
  // no unassigned scenes anywhere). Don't key this off `runs.length` — a section
  // filter narrowing the *visible* scenes down to a single section is a normal case
  // that should still label that lone wedge, not disappear it.
  if (S.sections.length === 1 && !hasUnassignedScenes()) return;
  runs.forEach(run => {
    const sec = run.secId === null
      ? { id: UNASSIGNED_SEC_ID, name: 'Unassigned' }
      : S.sections.find(s => s.id === run.secId);
    if (!sec) return;
    const startDeg = -90 + run.start / total * 360;
    // A full 360° wedge has coincident arc endpoints and renders as nothing —
    // clamp just short so the path stays valid (hairline gap marks the start).
    const endDeg = Math.min(-90 + run.end / total * 360, startDeg + 359.9);
    drawPieWedge(svg, cx, cy, outerR, startDeg, endDeg, sec);
  });
}
// ── TOOLTIP ────────────────────────────────────────────────────────────────────
function wordCountTipLine(scene) {
  if (!showWordCount) return null;
  if (scene.wordCount > 0) return scene.wordCount.toLocaleString() + ' words';
  if (lastAvgWordCount !== null) return '~' + Math.round(lastAvgWordCount).toLocaleString() + ' words (estimated)';
  return null;
}
function showChartTip(e, scene) {
  const tip = document.getElementById('chart-tip');
  tip.innerHTML = '';
  const t1 = document.createElement('div'); t1.className = 'chart-tip-title';
  t1.textContent = `Scene ${sceneDisplayNum(scene.id)} — ${scene.title}`;
  tip.appendChild(t1);
  const secName = sceneSectionName(scene);
  if (secName) { const t2 = document.createElement('div'); t2.className = 'chart-tip-sec'; t2.textContent = secName; tip.appendChild(t2); }
  const wcLine = wordCountTipLine(scene);
  if (wcLine) { const t4 = document.createElement('div'); t4.className = 'chart-tip-wc'; t4.textContent = wcLine; tip.appendChild(t4); }
  if (scene.summary) { const t3 = document.createElement('div'); t3.className = 'chart-tip-sum'; t3.textContent = scene.summary; tip.appendChild(t3); }
  tip.style.display = 'block';
  positionChartTip(e);
}
function moveChartTip(e) { positionChartTip(e); }
function positionChartTip(e) {
  const tip = document.getElementById('chart-tip');
  const host = document.getElementById('chart-host');
  const hr = host.getBoundingClientRect();
  const margin = 8;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  // Clamp against the actual browser viewport (not just the host box) so callouts
  // near the bottom/right of the window flip to the other side of the cursor
  // instead of running off-screen.
  let vx = e.clientX + 14;
  if (vx + tw + margin > window.innerWidth) vx = e.clientX - 14 - tw;
  vx = Math.max(margin, vx);
  let vy = e.clientY + 14;
  if (vy + th + margin > window.innerHeight) vy = e.clientY - 14 - th;
  vy = Math.max(margin, vy);
  tip.style.left = (vx - hr.left) + 'px';
  tip.style.top = (vy - hr.top) + 'px';
}
function hideChartTip() {
  const tip = document.getElementById('chart-tip');
  if (tip) { tip.style.display = 'none'; tip.innerHTML = ''; }
}

// ── CLICK: JUMP TO BOARD ───────────────────────────────────────────────────────
function onSegClick(scene) {
  // Set the selection before tearing down chart view so closeChartView()'s
  // own renderBoard() already reflects it — avoids hand-rolling its teardown
  // a second time here, which previously skipped restoring det-ck-wrap/
  // scalew-wrap (the "Show Card Details" checkbox and zoom slider), leaving
  // them missing from the toolbar until chart view was toggled again.
  S.selIds.clear(); S.selIds.add(scene.id);
  closeChartView();
  const card = document.querySelector('.sc[data-id="' + scene.id + '"]');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

// ── PRINT ──────────────────────────────────────────────────────────────────────
function getChartProjectName() {
  try {
    const index = loadProjectIndex();
    const entry = index.find(p => p.id === currentProjectId);
    return entry ? entry.name : '';
  } catch (e) { return ''; }
}
function resolveChartVars(root) {
  // The print page is always a plain white sheet, regardless of the on-screen theme —
  // so colors must resolve against a fixed light palette ("ivory"), not the live theme.
  // Resolving against the live theme meant a dark theme's near-black wedge fills and
  // subtle (dark-on-dark) borders got baked in verbatim, making section dividers and
  // labels nearly invisible once isolated on white paper.
  const probe = document.createElement('div');
  probe.setAttribute('data-theme', 'ivory');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const resolve = val => val.replace(/var\((--[a-z0-9-]+)\)/gi, (m, name) => cs.getPropertyValue(name).trim() || m);
  const walk = el => {
    ['stroke', 'fill'].forEach(attr => {
      const v = el.getAttribute && el.getAttribute(attr);
      if (v && v.indexOf('var(') !== -1) el.setAttribute(attr, resolve(v));
    });
    const styleAttr = el.getAttribute && el.getAttribute('style');
    if (styleAttr && styleAttr.indexOf('var(') !== -1) el.setAttribute('style', resolve(styleAttr));
    Array.from(el.children || []).forEach(walk);
  };
  walk(root);
  document.body.removeChild(probe);
}
function printChart() {
  const svgEl = document.querySelector('#chart-canvas svg');
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  resolveChartVars(clone);
  // Dimming comes from a CSS class, which won't exist in the print window —
  // inline it so an active filter prints the way it looks on screen.
  clone.querySelectorAll('.chart-seg-dim').forEach(seg => seg.setAttribute('opacity', '0.45'));
  const xml = new XMLSerializer().serializeToString(clone);
  const projName = getChartProjectName();
  const title = (projName ? projName + ' — ' : '') + 'Scene Flow';
  const titleEsc = rptEsc(title);
  let legendHtml = '';
  if (S.sections.length) {
    legendHtml = '<div style="font-size:11px;color:#555;margin-bottom:12px">'
      + chartLegendSections().map((sec, i) =>
          (chartType === 'snake' ? '<b>' + sectionLetter(i) + '</b> — ' : '') + rptEsc(sec.name)
        ).join(' &nbsp;·&nbsp; ')
      + '</div>';
  }
  // The on-screen legend explains the red "estimated" tick (see
  // updateChartLegend/sceneSetHasEstimated) — without this, a printed chart
  // with proportional sizing on shows unexplained red marks next to some
  // scene numbers.
  if (sceneSetHasEstimated(orderedScenes())) {
    legendHtml += '<div style="font-size:11px;color:#555;margin-bottom:12px">'
      + '<span style="display:inline-block;width:2px;height:11px;background:#dc2626;'
      + 'transform:rotate(20deg);margin-right:6px;vertical-align:middle"></span>'
      + 'Estimated (no word count)</div>';
  }
  if (traceActive()) {
    const trace = computeTraceLanes(orderedScenes());
    if (trace.lanes.length) {
      legendHtml += '<div style="font-size:11px;color:#555;margin-bottom:12px">'
        + trace.lanes.map(lane =>
            '<span style="display:inline-block;width:14px;height:3px;border-radius:2px;background:'
            + lane.color + ';margin-right:6px;vertical-align:middle"></span>' + rptEsc(lane.name)
          ).join(' &nbsp;·&nbsp; ')
        + (trace.overflow > 0 ? ' &nbsp;·&nbsp; +' + trace.overflow + ' more' : '')
        + '</div>';
    }
  }
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + titleEsc + '</title>'
    + '<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#fff;padding:24px;'
    + "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}"
    + 'h1{font-size:16px;margin-bottom:6px;color:#111}svg{display:block;max-width:100%}'
    + '@media print{body{padding:10px}}</style></head><body>'
    + '<h1>' + titleEsc + '</h1>' + legendHtml + xml + '</body></html>';
  openReportWindow(html);
}
