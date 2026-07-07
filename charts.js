'use strict';

// ── CHART STATE ────────────────────────────────────────────────────────────────
const SVGNS = 'http://www.w3.org/2000/svg';
let chartMode = false;          // is chart view active
let chartType = 'snake';        // 'snake' | 'circle'
let chartResizeTimer = null;

if (document.getElementById('chart-host')) {

  (function initChartPrefs() {
    const p = loadGlobalPrefs();
    if (p.chartType === 'snake' || p.chartType === 'circle') chartType = p.chartType;
    document.getElementById('chart-type-snake').classList.toggle('on', chartType === 'snake');
    document.getElementById('chart-type-circle').classList.toggle('on', chartType === 'circle');
  })();

  window.addEventListener('resize', () => {
    if (!chartMode) return;
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(renderChart, 150);
  });
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
  setChartMenuLabel();
  renderChart();
}
function closeChartView() {
  if (!chartMode) return;
  chartMode = false;
  document.getElementById('chart-host').style.display = 'none';
  document.getElementById('sbscrl').style.display = '';
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
  return !!searchQ || SECS.some(({ key }) => S.selections[key].size > 0);
}
function sceneMatchesChart(scene) {
  if (searchQ) return sceneMatchesSearch(scene);
  if (SECS.some(({ key }) => S.selections[key].size > 0)) return sceneMatchesLib(scene);
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
  const scenes = orderedScenes();
  updateChartStatus(scenes);
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
  const N = scenes.length, segLen = total / N, GAP = 3;
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
    clone.addEventListener('mouseenter', e => showChartTip(e, scene));
    clone.addEventListener('mousemove', moveChartTip);
    clone.addEventListener('mouseleave', hideChartTip);
    clone.addEventListener('click', () => onSegClick(scene));
    container.appendChild(clone);
  });
}

function drawTick(container, centerline, total, len) {
  const p0 = centerline.getPointAtLength(Math.max(0, len - 0.5));
  const p1 = centerline.getPointAtLength(Math.min(total, len + 0.5));
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist, ny = dx / dist;
  const p = centerline.getPointAtLength(len), half = 5;
  const line = document.createElementNS(SVGNS, 'line');
  line.setAttribute('x1', p.x - nx * half); line.setAttribute('y1', p.y - ny * half);
  line.setAttribute('x2', p.x + nx * half); line.setAttribute('y2', p.y + ny * half);
  line.setAttribute('stroke', 'var(--o0)');
  line.setAttribute('stroke-width', '2');
  line.classList.add('chart-tick');
  container.appendChild(line);
}

// ── SNAKE ──────────────────────────────────────────────────────────────────────
function computeSnakeLayout(N, W) {
  const M = 50, r = 45, A = Math.PI * r, T = 110;
  const runLen = Math.max(2 * r + 20, W - 2 * M);
  const L = N * T;
  let R = Math.max(1, Math.ceil((L - runLen) / (runLen + A)) + 1);
  let run = (L - (R - 1) * A) / R;
  if (run > runLen) { R++; run = (L - (R - 1) * A) / R; }
  if (R > 1 && run < 180) { R--; run = (L - (R - 1) * A) / R; }
  if (R === 1 && run < 180) run = L;
  return { R, run, M, r };
}
function buildSnakePath(N, W) {
  const { R, run, M, r } = computeSnakeLayout(N, W);
  const y0 = 40 + r;
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
  return { d, height: y0 + (R - 1) * 90 + r + 40 };
}

function buildSnakeChart(canvas, scenes) {
  const scrollEl = document.getElementById('chart-scroll');
  const W = scrollEl.clientWidth || 800;
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
  addSegments(svg, centerline, scenes, total, 34);
  addSnakeNumbers(svg, centerline, scenes, total);
  addSnakeSectionMarkers(svg, centerline, scenes, total);
}

function addSnakeNumbers(svg, centerline, scenes, total) {
  const N = scenes.length, segLen = total / N;
  if (segLen < 26) return;
  scenes.forEach((scene, i) => {
    const mid = centerline.getPointAtLength(i * segLen + segLen / 2);
    const txt = document.createElementNS(SVGNS, 'text');
    txt.setAttribute('x', mid.x); txt.setAttribute('y', mid.y);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'central');
    txt.setAttribute('font-size', '11');
    txt.setAttribute('fill', (chartFilterActive() && sceneMatchesChart(scene)) ? 'var(--ontx)' : 'var(--sub)');
    txt.classList.add('chart-num');
    txt.style.pointerEvents = 'none';
    txt.textContent = String(sceneDisplayNum(scene.id));
    svg.appendChild(txt);
  });
}

function addSnakeSectionMarkers(svg, centerline, scenes, total) {
  if (!S.sections.length) return;
  const N = scenes.length, segLen = total / N;
  const validSecIds = new Set(S.sections.map(s => s.id));
  let lastSec, lastLabelPt = null;
  scenes.forEach((scene, i) => {
    const secId = validSecIds.has(scene.sectionId) ? scene.sectionId : null;
    if (secId === lastSec) return;
    if (i > 0) drawTick(svg, centerline, total, i * segLen);
    const sec = secId !== null ? S.sections.find(s => s.id === secId) : null;
    if (sec) {
      const p = centerline.getPointAtLength(i * segLen);
      if (!lastLabelPt || Math.hypot(p.x - lastLabelPt.x, p.y - lastLabelPt.y) > 60) {
        drawSnakeSectionLabel(svg, centerline, total, i * segLen, sec.name);
        lastLabelPt = p;
      }
    }
    lastSec = secId;
  });
}
function drawSnakeSectionLabel(svg, centerline, total, len, name) {
  const p0 = centerline.getPointAtLength(Math.max(0, len - 0.5));
  const p1 = centerline.getPointAtLength(Math.min(total, len + 0.5));
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist, ny = dx / dist;
  const p = centerline.getPointAtLength(len);
  const txt = document.createElementNS(SVGNS, 'text');
  txt.setAttribute('x', p.x + nx * 24); txt.setAttribute('y', p.y + ny * 24);
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('font-size', '11');
  txt.setAttribute('fill', 'var(--sub)');
  txt.classList.add('chart-sec-label');
  txt.textContent = name;
  svg.appendChild(txt);
}

// ── CIRCLE ─────────────────────────────────────────────────────────────────────
function buildCircleChart(canvas, scenes) {
  const scrollEl = document.getElementById('chart-scroll');
  const availW = scrollEl.clientWidth || 600;
  const availH = scrollEl.clientHeight || 480;
  const N = scenes.length;
  if (N === 0) { renderChartNoMatch(canvas); return; }
  const R = Math.max(90, Math.min(availW, availH) / 2 - 70);
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
  addCircleSectionMarkers(g, svg, centerline, scenes, total, cx, cy, R);
  drawCircleCenter(svg, cx, cy, scenes);
  drawCircleStartLabel(svg, cx, cy, R);
}

function addCircleNumbers(svg, scenes, cx, cy, R) {
  const N = scenes.length;
  const segLen = (2 * Math.PI * R) / N;
  if (segLen < 26) return;
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
    txt.style.pointerEvents = 'none';
    txt.textContent = String(sceneDisplayNum(scene.id));
    svg.appendChild(txt);
  });
}

function angularDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
function addCircleSectionMarkers(g, svg, centerline, scenes, total, cx, cy, R) {
  if (!S.sections.length) return;
  const N = scenes.length, segLen = total / N;
  const validSecIds = new Set(S.sections.map(s => s.id));
  let lastSec, lastLabelAngle = null;
  scenes.forEach((scene, i) => {
    const secId = validSecIds.has(scene.sectionId) ? scene.sectionId : null;
    if (secId === lastSec) return;
    if (i > 0) drawTick(g, centerline, total, i * segLen);
    const sec = secId !== null ? S.sections.find(s => s.id === secId) : null;
    if (sec) {
      const angleDeg = -90 + i * 360 / N;
      if (lastLabelAngle === null || angularDist(angleDeg, lastLabelAngle) > 18) {
        drawCircleSectionLabel(svg, cx, cy, R, angleDeg, sec.name);
        lastLabelAngle = angleDeg;
      }
    }
    lastSec = secId;
  });
}
function drawCircleSectionLabel(svg, cx, cy, R, angleDeg, name) {
  const rad = angleDeg * Math.PI / 180, offset = R + 24;
  const x = cx + offset * Math.cos(rad), y = cy + offset * Math.sin(rad);
  const txt = document.createElementNS(SVGNS, 'text');
  txt.setAttribute('x', x); txt.setAttribute('y', y);
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('dominant-baseline', 'central');
  txt.setAttribute('font-size', '11');
  txt.setAttribute('fill', 'var(--sub)');
  txt.classList.add('chart-sec-label');
  txt.textContent = name;
  svg.appendChild(txt);
}
function drawCircleCenter(svg, cx, cy, scenes) {
  const t1 = document.createElementNS(SVGNS, 'text');
  t1.setAttribute('x', cx); t1.setAttribute('y', cy - 8);
  t1.setAttribute('text-anchor', 'middle');
  t1.setAttribute('font-size', '13');
  t1.setAttribute('fill', 'var(--tx)');
  t1.textContent = getChartProjectName();
  svg.appendChild(t1);
  const n = scenes.length, m = S.sections.length;
  const t2 = document.createElementNS(SVGNS, 'text');
  t2.setAttribute('x', cx); t2.setAttribute('y', cy + 12);
  t2.setAttribute('text-anchor', 'middle');
  t2.setAttribute('font-size', '12');
  t2.setAttribute('fill', 'var(--sub)');
  t2.textContent = `${n} scene${n !== 1 ? 's' : ''} · ${m} section${m !== 1 ? 's' : ''}`;
  svg.appendChild(t2);
}
function drawCircleStartLabel(svg, cx, cy, R) {
  const t = document.createElementNS(SVGNS, 'text');
  t.setAttribute('x', cx); t.setAttribute('y', cy - R - 14);
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('font-size', '11');
  t.setAttribute('fill', 'var(--sub)');
  t.textContent = 'start';
  svg.appendChild(t);
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
  let x = e.clientX - hr.left + 14;
  let y = e.clientY - hr.top + 14;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
  requestAnimationFrame(() => {
    if (tip.style.display === 'none') return;
    const tr = tip.getBoundingClientRect();
    let nx = x, ny = y;
    if (hr.left + x + tr.width > hr.right) nx = Math.max(8, hr.width - tr.width - 8);
    if (hr.top + y + tr.height > hr.bottom) ny = Math.max(8, hr.height - tr.height - 8);
    tip.style.left = nx + 'px'; tip.style.top = ny + 'px';
  });
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
  const cs = getComputedStyle(document.documentElement);
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
}
function printChart() {
  const svgEl = document.querySelector('#chart-canvas svg');
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  resolveChartVars(clone);
  const xml = new XMLSerializer().serializeToString(clone);
  const projName = getChartProjectName();
  const title = (projName ? projName + ' — ' : '') + 'Scene Flow';
  const titleEsc = rptEsc(title);
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + titleEsc + '</title>'
    + '<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#fff;padding:24px;'
    + "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}"
    + 'h1{font-size:16px;margin-bottom:14px;color:#111}svg{display:block;max-width:100%}'
    + '@media print{body{padding:10px}}</style></head><body>'
    + '<h1>' + titleEsc + '</h1>' + xml + '</body></html>';
  openReportWindow(html);
}
