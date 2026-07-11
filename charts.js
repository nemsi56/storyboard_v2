'use strict';

// ── CHART STATE ────────────────────────────────────────────────────────────────
const SVGNS = 'http://www.w3.org/2000/svg';
let chartMode = false;          // is chart view active
let chartType = 'snake';        // 'snake' | 'circle'
let chartResizeTimer = null;
let chartLastSize = '';         // last rendered chart-scroll size, "WxH"
const CHART_PAD = 12;           // must match #chart-canvas padding in styles.css
const SNAKE_SEG_THICKNESS = 34; // stroke width of the snake row "tube" (see addSegments call below)
const UNASSIGNED_SEC_ID = 'unassigned';

if (document.getElementById('chart-host')) {

  (function initChartPrefs() {
    const p = loadGlobalPrefs();
    if (p.chartType === 'snake' || p.chartType === 'circle') chartType = p.chartType;
    document.getElementById('chart-type-snake').classList.toggle('on', chartType === 'snake');
    document.getElementById('chart-type-circle').classList.toggle('on', chartType === 'circle');
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
function openChartView() {
  chartMode = true;
  document.getElementById('sbscrl').style.display = 'none';
  document.getElementById('sbemp').style.display = 'none';
  document.getElementById('chart-host').style.display = 'flex';
  // Card-only controls: meaningless once cards aren't on screen.
  document.getElementById('det-ck-wrap').style.display = 'none';
  document.getElementById('scalew-wrap').style.display = 'none';
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
  document.getElementById('chart-type-snake').classList.toggle('on', type === 'snake');
  document.getElementById('chart-type-circle').classList.toggle('on', type === 'circle');
  const p = loadGlobalPrefs(); p.chartType = type; saveGlobalPrefs(p);
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

// ── RENDER ─────────────────────────────────────────────────────────────────────
function renderChart() {
  const canvas = document.getElementById('chart-canvas');
  if (!canvas) return;
  canvas.innerHTML = '';
  hideChartTip();
  const scrollEl = document.getElementById('chart-scroll');
  chartLastSize = scrollEl.clientWidth + 'x' + scrollEl.clientHeight;
  const scenes = orderedScenes();
  updateChartStatus(scenes);
  updateChartLegend();
  if (!S.scenes.length) { renderChartEmpty(canvas); return; }
  if (chartType === 'circle') buildCircleChart(canvas, scenes);
  else buildSnakeChart(canvas, scenes);
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
  const n = scenes.length, secCount = S.sections.length;
  let txt = `${n} scene${n !== 1 ? 's' : ''} · ${secCount} section${secCount !== 1 ? 's' : ''}`;
  if (chartFilterActive()) {
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

function updateChartLegend() {
  const el = document.getElementById('chart-legend'); if (!el) return;
  el.innerHTML = '';
  if (chartType !== 'snake') return; // circle labels its sections directly on the pie
  chartLegendSections().forEach((sec, i) => {
    if (i > 0) { const sep = document.createElement('span'); sep.className = 'chart-legend-sep'; sep.textContent = '·'; el.appendChild(sep); }
    const item = document.createElement('span'); item.className = 'chart-legend-item'; item.dataset.secId = sec.id;
    const letterEl = document.createElement('span'); letterEl.className = 'chart-legend-letter'; letterEl.textContent = sectionLetter(i);
    const nameEl = document.createElement('span'); nameEl.className = 'chart-legend-name'; nameEl.textContent = sec.name;
    item.appendChild(letterEl); item.appendChild(nameEl);
    item.addEventListener('mouseenter', () => highlightSecMarker(sec.id, true));
    item.addEventListener('mouseleave', () => highlightSecMarker(sec.id, false));
    el.appendChild(item);
  });
}
function highlightSecMarker(sectionId, on) {
  document.querySelectorAll('.chart-sec-marker[data-sec-id="' + sectionId + '"]').forEach(m => m.classList.toggle('chart-sec-marker-hl', on));
}
function highlightLegendItem(sectionId, on) {
  const el = document.querySelector('.chart-legend-item[data-sec-id="' + sectionId + '"]');
  if (el) el.classList.toggle('chart-legend-hl', on);
}

// ── SEGMENT / NUMBER / TICK PRIMITIVES (shared snake + circle) ────────────────
function applySegColor(clone, scene) {
  clone.classList.remove('chart-seg-match', 'chart-seg-dim');
  if (chartFilterActive()) {
    if (sceneMatchesChart(scene)) { clone.setAttribute('stroke', 'var(--acc)'); clone.classList.add('chart-seg-match'); }
    else { clone.setAttribute('stroke', 'var(--s1)'); clone.classList.add('chart-seg-dim'); }
  } else {
    clone.setAttribute('stroke', 'var(--s1)');
  }
}

function addSegments(container, centerline, scenes, total, thickness) {
  const N = scenes.length, segLen = total / N;
  const GAP = Math.min(3, segLen / 3); // keep the dash length positive when segments get tiny
  scenes.forEach((scene, i) => {
    const clone = centerline.cloneNode(false);
    clone.classList.add('chart-seg');
    clone.dataset.sceneId = scene.id;
    clone.setAttribute('stroke-dasharray', (segLen - GAP) + ' ' + (total - segLen + GAP));
    clone.setAttribute('stroke-dashoffset', String(-(i * segLen + GAP / 2)));
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
  g.addEventListener('mouseenter', e => { showSectionTip(e, sectionId); highlightLegendItem(sectionId, true); });
  g.addEventListener('mousemove', moveChartTip);
  g.addEventListener('mouseleave', () => { hideChartTip(); highlightLegendItem(sectionId, false); });
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
function computeSnakeLayout(N, W) {
  // The row/curve "tube" is a thick stroke centered on this arc: at the tip of
  // each turn, its outer edge extends SNAKE_SEG_THICKNESS/2 past the
  // centerline itself, so the margin needs that much extra clearance on top
  // of the intended CHART_PAD, or the turn's outer edge clips against the
  // SVG bounds.
  const r = 45, M = r + CHART_PAD + SNAKE_SEG_THICKNESS / 2, A = Math.PI * r, T = 110;
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
function buildSnakePath(N, W) {
  const { R, run, M, r } = computeSnakeLayout(N, W);
  // +24 (not 0) so row 1 doesn't sit flush against the very top of the chart.
  const y0 = 24 + r;
  let d = `M ${M} ${y0}`, y = y0;
  for (let row = 0; row < R; row++) {
    const leftToRight = row % 2 === 0;
    const xEnd = leftToRight ? M + run : M;
    d += ` L ${xEnd} ${y}`;
    if (row < R - 1) {
      const sweep = leftToRight ? 1 : 0, newY = y + 90;
      d += ` A ${r} ${r} 0 0 ${sweep} ${xEnd} ${newY}`;
      y = newY;
    }
  }
  return { d, height: y0 + (R - 1) * 90 + r + 24 };
}

function buildSnakeChart(canvas, scenes) {
  const scrollEl = document.getElementById('chart-scroll');
  const W = Math.max(300, (scrollEl.clientWidth || 800) - 2 * CHART_PAD);
  const N = scenes.length;
  if (N === 0) { renderChartNoMatch(canvas); return; }
  const svg = document.createElementNS(SVGNS, 'svg');
  canvas.appendChild(svg);
  const { d, height } = buildSnakePath(N, W);
  svg.setAttribute('width', W);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
  const centerline = document.createElementNS(SVGNS, 'path');
  centerline.setAttribute('d', d);
  centerline.setAttribute('stroke', 'none');
  centerline.setAttribute('fill', 'none');
  svg.appendChild(centerline);
  const total = centerline.getTotalLength();
  addSegments(svg, centerline, scenes, total, SNAKE_SEG_THICKNESS);
  addSnakeNumbers(svg, centerline, scenes, total);
  addSnakeSectionMarkers(svg, centerline, scenes, total, W);
}

function addSnakeNumbers(svg, centerline, scenes, total) {
  const N = scenes.length, segLen = total / N;
  if (segLen < 26) return;
  // Built once for this pass instead of each scene independently rebuilding
  // the same ordered scene list via sceneDisplayNum().
  const numMap = buildSceneNumMap();
  scenes.forEach((scene, i) => {
    const mid = centerline.getPointAtLength(i * segLen + segLen / 2);
    const txt = document.createElementNS(SVGNS, 'text');
    txt.setAttribute('x', mid.x); txt.setAttribute('y', mid.y);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'central');
    txt.setAttribute('font-size', '11');
    txt.setAttribute('fill', (chartFilterActive() && sceneMatchesChart(scene)) ? 'var(--ontx)' : 'var(--sub)');
    txt.classList.add('chart-num');
    txt.dataset.sceneId = scene.id;
    txt.style.pointerEvents = 'none';
    txt.textContent = String(numMap.get(scene.id) ?? 1);
    svg.appendChild(txt);
  });
}

function addSnakeSectionMarkers(svg, centerline, scenes, total, W) {
  if (!S.sections.length) return;
  const N = scenes.length, segLen = total / N;
  const validSecIds = new Set(S.sections.map(s => s.id));
  const offset = hasUnassignedScenes() ? 1 : 0; // Unassigned (if present) takes letter A
  const secIndexById = new Map(S.sections.map((s, i) => [s.id, i + offset]));
  const pad = 14;
  let lastSec;
  scenes.forEach((scene, i) => {
    const secId = validSecIds.has(scene.sectionId) ? scene.sectionId : null;
    if (i > 0 && secId === lastSec) { lastSec = secId; return; }
    const len = i * segLen;
    const p0 = centerline.getPointAtLength(Math.max(0, len - 0.5));
    const p1 = centerline.getPointAtLength(Math.min(total, len + 0.5));
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist, ny = dx / dist;
    const p = centerline.getPointAtLength(len);
    const mx = Math.min(W - pad, Math.max(pad, p.x + nx * 16));
    const my = p.y + ny * 16;
    const markerId = secId !== null ? secId : UNASSIGNED_SEC_ID;
    const idx = secId !== null ? secIndexById.get(secId) : 0;
    drawSectionMarkerAt(svg, mx, my, markerId, idx);
    lastSec = secId;
  });
}

// ── CIRCLE ─────────────────────────────────────────────────────────────────────
function buildCircleChart(canvas, scenes) {
  const scrollEl = document.getElementById('chart-scroll');
  const availW = Math.max(300, (scrollEl.clientWidth || 600) - 2 * CHART_PAD);
  const availH = Math.max(300, (scrollEl.clientHeight || 480) - 2 * CHART_PAD);
  const N = scenes.length;
  if (N === 0) { renderChartNoMatch(canvas); return; }
  // -25 leaves just enough room for the ribbon's own stroke half-width (15)
  // plus a little breathing room — nothing else is drawn outside R (the pie
  // wedge and its labels sit inward, at outerR = R - 20 and less).
  const R = Math.max(90, Math.min(availW, availH) / 2 - 25);
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
  addSegments(g, centerline, scenes, total, 30);
  addCircleNumbers(svg, scenes, cx, cy, R);
  drawCirclePie(svg, scenes, cx, cy, R);
}

function addCircleNumbers(svg, scenes, cx, cy, R) {
  const N = scenes.length;
  const segLen = (2 * Math.PI * R) / N;
  if (segLen < 26) return;
  // Built once for this pass instead of each scene independently rebuilding
  // the same ordered scene list via sceneDisplayNum().
  const numMap = buildSceneNumMap();
  scenes.forEach((scene, i) => {
    const angleDeg = -90 + (i + 0.5) * 360 / N;
    const rad = angleDeg * Math.PI / 180;
    const x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad);
    const txt = document.createElementNS(SVGNS, 'text');
    txt.setAttribute('x', x); txt.setAttribute('y', y);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'central');
    txt.setAttribute('font-size', '11');
    txt.setAttribute('fill', (chartFilterActive() && sceneMatchesChart(scene)) ? 'var(--ontx)' : 'var(--sub)');
    txt.classList.add('chart-num');
    txt.dataset.sceneId = scene.id;
    txt.style.pointerEvents = 'none';
    txt.textContent = String(numMap.get(scene.id) ?? 1);
    svg.appendChild(txt);
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
function drawCirclePie(svg, scenes, cx, cy, R) {
  if (!S.sections.length) return;
  const N = scenes.length;
  const validSecIds = new Set(S.sections.map(s => s.id));
  const outerR = R - 20;
  const runs = [];
  scenes.forEach((scene, i) => {
    const secId = validSecIds.has(scene.sectionId) ? scene.sectionId : null;
    const last = runs[runs.length - 1];
    if (last && last.secId === secId) last.count++;
    else runs.push({ secId, start: i, count: 1 });
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
    const startDeg = -90 + run.start * 360 / N;
    // A full 360° wedge has coincident arc endpoints and renders as nothing —
    // clamp just short so the path stays valid (hairline gap marks the start).
    const endDeg = Math.min(-90 + (run.start + run.count) * 360 / N, startDeg + 359.9);
    drawPieWedge(svg, cx, cy, outerR, startDeg, endDeg, sec);
  });
}
// ── TOOLTIP ────────────────────────────────────────────────────────────────────
function showChartTip(e, scene) {
  const tip = document.getElementById('chart-tip');
  tip.innerHTML = '';
  const t1 = document.createElement('div'); t1.className = 'chart-tip-title';
  t1.textContent = `Scene ${sceneDisplayNum(scene.id)} — ${scene.title}`;
  tip.appendChild(t1);
  const secName = sceneSectionName(scene);
  if (secName) { const t2 = document.createElement('div'); t2.className = 'chart-tip-sec'; t2.textContent = secName; tip.appendChild(t2); }
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
  chartMode = false;
  document.getElementById('chart-host').style.display = 'none';
  document.getElementById('sbscrl').style.display = '';
  setChartMenuLabel();
  S.selIds.clear(); S.selIds.add(scene.id);
  renderBoard();
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
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + titleEsc + '</title>'
    + '<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#fff;padding:24px;'
    + "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}"
    + 'h1{font-size:16px;margin-bottom:6px;color:#111}svg{display:block;max-width:100%}'
    + '@media print{body{padding:10px}}</style></head><body>'
    + '<h1>' + titleEsc + '</h1>' + legendHtml + xml + '</body></html>';
  openReportWindow(html);
}
