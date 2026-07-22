'use strict';

// ── STORYLINE PALETTE (schema v3 §2.6) ────────────────────────────────────────
// Ported from ../Timeline/js/state.js STORYLINE_PALETTE/slColor, adapted:
// SceneSetter has five themes, not two — map each theme to whichever of the
// two pools (dark-ish / light-ish) reads better against its background.
const STORYLINE_PALETTE = {
  dark:  ['#5aa9e6','#e0a458','#a78bfa','#6ad19a','#e66a9a','#58c4d4','#d4c458','#c48a58','#8a9ae6','#6ae0c4'],
  light: ['#3d6c9e','#b07a35','#7b5ea7','#3f8f68','#b3486f','#35809a','#8f7d2e','#8f5b32','#4f5fa8','#2e8b7a'],
};
const TL_DARK_THEMES = new Set(['slate', 'ocean']);
function slColor(paletteIndex) {
  const theme = document.documentElement.dataset.theme || 'ivory';
  const pal = STORYLINE_PALETTE[TL_DARK_THEMES.has(theme) ? 'dark' : 'light'];
  return pal[((paletteIndex % pal.length) + pal.length) % pal.length];
}
// Lowest palette index 0-9 not currently in use by any storyline; wraps
// (reuses from 0) once every index is taken.
function nextStorylinePaletteIndex() {
  const used = new Set(S.storylines.map(st => st.paletteIndex));
  for (let i = 0; i < 10; i++) if (!used.has(i)) return i;
  return S.storylines.length % 10;
}
// Shared by the chron strip and manuscript ribbon (both show a scene's
// membership in OTHER storylines via small colored dots).
function renderConvDots(scene, storylineById) {
  if (!scene.alsoStorylineIds || !scene.alsoStorylineIds.length) return null;
  const dots = document.createElement('div');
  dots.className = 'tl-conv-dots';
  scene.alsoStorylineIds.slice(0, 4).forEach(stId => {
    const st = storylineById.get(stId); if (!st) return;
    const d = document.createElement('span');
    d.className = 'tl-conv-dot';
    d.style.background = slColor(st.paletteIndex);
    d.title = st.name;
    dots.appendChild(d);
  });
  if (scene.alsoStorylineIds.length > 4) {
    const more = document.createElement('span');
    more.className = 'tl-conv-more';
    more.textContent = '+' + (scene.alsoStorylineIds.length - 4);
    dots.appendChild(more);
  }
  return dots;
}

// ── GEOMETRY ENGINE (ported wholesale from ../Timeline/js/time.js, schema v3 §6.2) ──
function chronX(axisMode) { return axisMode === 'true' ? chronXTrueScale() : chronXOrdinal(); }

function chronXOrdinal() {
  const map = new Map();
  const order = S.chronOrder || [];
  const n = order.length;
  order.forEach((id, i) => map.set(id, ((i + 0.5) / n) * 100));
  return map;
}

function anchorTs(anchor) {
  if (!anchor || !anchor.date) return null;
  const t = anchor.time || '00:00';
  const ms = Date.parse(anchor.date + 'T' + t + ':00');
  return isNaN(ms) ? null : ms;
}

function chronXTrueScale() {
  const order = S.chronOrder || [];
  const sceneById = new Map(S.scenes.map(s => [s.id, s]));

  const anchored = [];
  order.forEach((id, idx) => {
    const s = sceneById.get(id); if (!s) return;
    const ts = anchorTs(s.anchor);
    if (ts !== null) anchored.push({ id, ts, chronIdx: idx });
  });
  if (anchored.length < 2) return chronXOrdinal();

  const byTs = [...anchored].sort((a, b) => a.ts - b.ts);
  const tMin = byTs[0].ts, tMax = byTs[byTs.length - 1].ts;
  const map = new Map(); const anchoredSet = new Set();
  if (tMax === tMin) {
    byTs.forEach(a => { map.set(a.id, 50); anchoredSet.add(a.id); });
  } else {
    byTs.forEach(a => { map.set(a.id, 4 + ((a.ts - tMin) / (tMax - tMin)) * 92); anchoredSet.add(a.id); });
  }

  const n = order.length;
  const anchoredIdxList = [];
  order.forEach((id, idx) => { if (anchoredSet.has(id)) anchoredIdxList.push(idx); });

  let i = 0;
  while (i < n) {
    const id = order[i];
    if (anchoredSet.has(id)) { i++; continue; }
    const runStart = i; let runEnd = i;
    while (runEnd < n && !anchoredSet.has(order[runEnd])) runEnd++;
    let prevAnchoredIdx = -1;
    for (let k = anchoredIdxList.length - 1; k >= 0; k--) { if (anchoredIdxList[k] < runStart) { prevAnchoredIdx = anchoredIdxList[k]; break; } }
    let nextAnchoredIdx = -1;
    for (let m = 0; m < anchoredIdxList.length; m++) { if (anchoredIdxList[m] >= runEnd) { nextAnchoredIdx = anchoredIdxList[m]; break; } }
    const runLen = runEnd - runStart;
    if (prevAnchoredIdx !== -1 && nextAnchoredIdx !== -1) {
      const xPrev = map.get(order[prevAnchoredIdx]), xNext = map.get(order[nextAnchoredIdx]);
      for (let j = 0; j < runLen; j++) { const frac = (j + 1) / (runLen + 1); map.set(order[runStart + j], xPrev + (xNext - xPrev) * frac); }
    } else if (prevAnchoredIdx === -1 && nextAnchoredIdx !== -1) {
      const xNext2 = map.get(order[nextAnchoredIdx]);
      for (let j2 = 0; j2 < runLen; j2++) { const stepsBack = runLen - j2; map.set(order[runStart + j2], Math.max(0, xNext2 - stepsBack * 3)); }
    } else if (nextAnchoredIdx === -1 && prevAnchoredIdx !== -1) {
      const xPrev2 = map.get(order[prevAnchoredIdx]);
      for (let j3 = 0; j3 < runLen; j3++) { map.set(order[runStart + j3], Math.min(100, xPrev2 + (j3 + 1) * 3)); }
    } else {
      for (let j4 = 0; j4 < runLen; j4++) { map.set(order[runStart + j4], ((runStart + j4 + 0.5) / n) * 100); }
    }
    i = runEnd;
  }

  // Collision pass, per lane — sort that lane's scenes by x, sweep left->right
  // enforcing a minimum on-screen gap.
  const laneOf = new Map();
  order.forEach(id => { const s = sceneById.get(id); if (s) laneOf.set(id, s.storylineId); });
  const byLane = new Map();
  order.forEach(id => {
    const lane = laneOf.get(id); if (lane === undefined) return;
    if (!byLane.has(lane)) byLane.set(lane, []);
    byLane.get(lane).push(id);
  });
  const trackEl = document.getElementById('tl-track');
  const trackWidthPx = (trackEl && trackEl.clientWidth) || 800;
  const minGapPct = (96 / Math.max(1, trackWidthPx)) * 100;
  byLane.forEach(ids => {
    ids.sort((a, b) => map.get(a) - map.get(b));
    for (let q = 1; q < ids.length; q++) {
      const prevX = map.get(ids[q - 1]), curX = map.get(ids[q]);
      if (curX - prevX < minGapPct) map.set(ids[q], prevX + minGapPct);
    }
  });

  return map;
}

function chronTrueScaleGapDivider(xMap) {
  const order = S.chronOrder || [];
  const sceneById = new Map(S.scenes.map(s => [s.id, s]));
  const anchored = [];
  order.forEach(id => {
    const s = sceneById.get(id); if (!s) return;
    const ts = anchorTs(s.anchor);
    if (ts !== null) anchored.push({ id, ts });
  });
  if (anchored.length < 2) return null;
  const byTs = [...anchored].sort((a, b) => a.ts - b.ts);
  const gaps = [];
  for (let i = 1; i < byTs.length; i++) gaps.push({ ms: byTs[i].ts - byTs[i - 1].ts, from: byTs[i - 1], to: byTs[i] });
  if (!gaps.length) return null;
  const sortedMs = gaps.map(g => g.ms).sort((a, b) => a - b);
  const mid = Math.floor(sortedMs.length / 2);
  const median = sortedMs.length % 2 ? sortedMs[mid] : (sortedMs[mid - 1] + sortedMs[mid]) / 2;
  const largest = gaps.reduce((best, g) => (!best || g.ms > best.ms) ? g : best, null);
  if (!largest || median <= 0 || largest.ms <= median * 5) return null;
  const xFrom = xMap.get(largest.from.id), xTo = xMap.get(largest.to.id);
  if (xFrom === undefined || xTo === undefined) return null;
  return { x: (xFrom + xTo) / 2, ms: largest.ms, fromId: largest.from.id, toId: largest.to.id };
}

const TL_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtAnchor(anchor) {
  if (!anchor || !anchor.date) return null;
  const [y, mStr, dStr] = anchor.date.split('-');
  const m = parseInt(mStr, 10) - 1, d = parseInt(dStr, 10);
  let out = (TL_MONTH_NAMES[m] || '') + ' ' + d + ', ' + y;
  if (anchor.time) out += ' · ' + anchor.time;
  return out;
}
function fmtGap(ms) {
  const day = 24 * 60 * 60 * 1000, year = 365.25 * day;
  if (ms >= year) { const yrs = Math.round(ms / year); return '≈ ' + yrs + ' yr' + (yrs === 1 ? '' : 's'); }
  const days = Math.round(ms / day);
  return days + ' day' + (days === 1 ? '' : 's');
}

// ── MODE STATE ─────────────────────────────────────────────────────────────────
let timelineMode = false;
let tlSelectedId = null;
let tlActiveTab = 'inspector'; // in-memory only, not persisted (§6.6)
let _tlFormEditHome = null; // { parent, next } captured once, restored on leave

function _tlCaptureFormEditHome() {
  if (_tlFormEditHome) return;
  const form = document.getElementById('form-edit');
  if (!form) return;
  _tlFormEditHome = { parent: form.parentElement, next: form.nextSibling };
}

// A dirty New-Scene form or open Edit form guards every mode switch and every
// scene reselection inside timeline mode (§6.6's "view-switch guard" and the
// Inspector's "selecting a scene" rule share the same discard-confirm flow).
function runWithDiscardGuard(action) {
  const tabNew = document.getElementById('tab-new');
  const editActive = S.editingId !== null;
  const newLive = !!tabNew && tabNew.classList.contains('live');
  if (!editActive && !newLive) { action(); return; }
  const dirty = editActive && isEditFormDirty();
  if (!dirty && !newLive) { if (editActive) cancelEdit(); action(); return; }
  openDiscardConfirm(dirty, newLive, () => {
    if (editActive) cancelEdit();
    if (newLive) cancelNewScene();
    action();
  });
}

function toggleTimelineView() {
  if (timelineMode) runWithDiscardGuard(_closeTimelineViewImpl);
  else runWithDiscardGuard(_openTimelineViewImpl);
}
// force=true skips the guard — used when the whole project is being torn down
// (switching/reloading projects), where there is nothing left to save into.
function closeTimelineView(force) {
  if (!timelineMode) return;
  if (force) _closeTimelineViewImpl();
  else runWithDiscardGuard(_closeTimelineViewImpl);
}

function _openTimelineViewImpl() {
  if (typeof closeChartView === 'function') closeChartView();
  timelineMode = true;
  document.body.classList.add('tl-mode');
  document.getElementById('sbemp').style.display = 'none';
  document.getElementById('sbscrl').style.display = 'none';
  document.getElementById('timeline-host').style.display = 'flex';
  _tlCaptureFormEditHome();
  document.getElementById('tl-inspector-body').appendChild(document.getElementById('form-edit'));
  tlSwitchTab('inspector');
  tlSelectedId = null;
  updateViewToggleUI();
  updateMenuForMode();
  setTimelineMenuLabel();
  renderTimeline();
}
function _closeTimelineViewImpl() {
  timelineMode = false;
  document.body.classList.remove('tl-mode');
  document.getElementById('timeline-host').style.display = 'none';
  document.getElementById('sbscrl').style.display = '';
  if (_tlFormEditHome) {
    const form = document.getElementById('form-edit');
    form.style.display = 'none';
    if (_tlFormEditHome.next) _tlFormEditHome.parent.insertBefore(form, _tlFormEditHome.next);
    else _tlFormEditHome.parent.appendChild(form);
  }
  cancelEdit();
  updateViewToggleUI();
  updateMenuForMode();
  setTimelineMenuLabel();
  renderBoard();
}
function setTimelineMenuLabel() {
  const lbl = document.getElementById('menu-timeline-text');
  if (lbl) lbl.textContent = timelineMode ? 'Hide Timeline View' : 'Show Timeline View';
}

// Cards/Snake/Circle/Timeline read as one 4-way switch (see #view-toggle).
function updateViewToggleUI() {
  const cardsOn = !timelineMode && !(typeof chartMode !== 'undefined' && chartMode);
  document.getElementById('chart-type-cards').classList.toggle('on', cardsOn);
  document.getElementById('chart-type-snake').classList.toggle('on', !timelineMode && typeof chartMode !== 'undefined' && chartMode && chartType === 'snake');
  document.getElementById('chart-type-circle').classList.toggle('on', !timelineMode && typeof chartMode !== 'undefined' && chartMode && chartType === 'circle');
  document.getElementById('chart-type-timeline').classList.toggle('on', timelineMode);
}

// ── MENU STATE PER MODE (§6.1) ─────────────────────────────────────────────────
function updateMenuForMode() {
  const boardZoomIds = ['zoomin-btn', 'zoomout-btn', 'zoomreset-btn'];
  const panelToggleIds = ['menu-show-library', 'menu-show-sections', 'menu-show-scene', 'menu-show-all-panels'];
  const createLibIds = ['mi-add-char', 'mi-add-loc', 'mi-add-theme', 'mi-add-misc'];
  [...boardZoomIds, ...panelToggleIds, ...createLibIds].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = timelineMode;
  });
}

// ── RENDER PIPELINE ────────────────────────────────────────────────────────────
function renderTimeline() {
  if (!timelineMode) return;
  renderStorylineLanes();
  renderChronStrip();
  renderManuscriptRibbon();
  redrawWires();
  renderThreadPicker();
  updateAxisAvailability();
  const zoomEl = document.getElementById('tl-zoom');
  if (zoomEl && document.activeElement !== zoomEl) zoomEl.value = S.timelinePrefs.pxPerScene;
  document.querySelectorAll('#tl-axis-switch .tl-axis-btn').forEach(b => {
    b.classList.toggle('on', b.dataset.axis === S.timelinePrefs.axis);
  });
  if (typeof renderConflictsBadge === 'function') renderConflictsBadge();
}

function chronTrackWidth(trackEl) {
  const scrollEl = trackEl.parentElement;
  const containerW = (scrollEl && scrollEl.clientWidth) || trackEl.clientWidth || 0;
  const n = (S.chronOrder && S.chronOrder.length) || 0;
  const pxPerScene = S.timelinePrefs.pxPerScene || 110;
  const PADDING = 80;
  return Math.max(containerW, n * pxPerScene + PADDING);
}

function renderStorylineLanes() {
  const laneLabels = document.getElementById('tl-lane-labels');
  const addBtn = document.getElementById('tl-add-storyline-btn');
  laneLabels.querySelectorAll('.tl-lane-label').forEach(el => el.remove());
  const laneH = 92;
  S.storylines.forEach((st, i) => {
    const count = S.scenes.filter(s => s.storylineId === st.id).length;
    const label = document.createElement('div');
    label.className = 'tl-lane-label';
    label.style.height = laneH + 'px';
    label.dataset.storylineId = st.id;
    const sw = document.createElement('span'); sw.className = 'tl-sw'; sw.style.background = slColor(st.paletteIndex);
    const nameWrap = document.createElement('span'); nameWrap.className = 'tl-lane-name'; nameWrap.textContent = st.name;
    nameWrap.title = 'Click to rename';
    nameWrap.addEventListener('click', e => { e.stopPropagation(); startStorylineRename(label, st.id); });
    const countEl = document.createElement('i'); countEl.textContent = count + (count === 1 ? ' scene' : ' scenes');
    const delBtn = document.createElement('button'); delBtn.className = 'tl-lane-del'; delBtn.textContent = '×'; delBtn.title = 'Delete storyline';
    delBtn.addEventListener('click', e => { e.stopPropagation(); deleteStoryline(st.id); });
    label.appendChild(sw); label.appendChild(nameWrap); label.appendChild(countEl); label.appendChild(delBtn);
    laneLabels.insertBefore(label, addBtn);
  });
}

function startStorylineRename(labelEl, id) {
  const nameEl = labelEl.querySelector('.tl-lane-name'); if (!nameEl) return;
  const inp = document.createElement('input'); inp.type = 'text'; inp.maxLength = 60;
  inp.value = nameEl.textContent;
  nameEl.replaceWith(inp);
  inp.focus(); inp.select();
  let done = false;
  const finish = () => { if (done) return; done = true; renameStoryline(id, inp.value); };
  inp.addEventListener('click', e => e.stopPropagation());
  inp.addEventListener('blur', finish);
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(); }
    if (e.key === 'Escape') { done = true; renderStorylineLanes(); renderChronStrip(); }
  });
}

function addStoryline() {
  pushHistory('Add storyline');
  const id = S.nextEntId++;
  S.storylines.push({ id, name: 'Storyline ' + S.storylines.length, paletteIndex: nextStorylinePaletteIndex() });
  recordDataEdit(); saveState();
  renderTimeline();
}
function renameStoryline(id, name) {
  const st = S.storylines.find(x => x.id === id); if (!st) return;
  name = name.trim();
  if (!name || name === st.name) { renderStorylineLanes(); renderChronStrip(); return; }
  pushHistory('Rename storyline to "' + truncStr(name, 22) + '"');
  st.name = name;
  recordDataEdit(); saveState();
  renderTimeline();
}
function deleteStoryline(id) {
  if (S.storylines.length <= 1) { alert('A project must always have at least one storyline.'); return; }
  const st = S.storylines.find(x => x.id === id); if (!st) return;
  if (!confirm(`Delete storyline "${st.name}"? Its scenes will move to the first remaining storyline.`)) return;
  pushHistory('Delete storyline "' + truncStr(st.name, 22) + '"');
  S.storylines = S.storylines.filter(x => x.id !== id);
  const fallbackId = S.storylines[0].id;
  S.scenes.forEach(sc => {
    if (sc.storylineId === id) sc.storylineId = fallbackId;
    sc.alsoStorylineIds = (sc.alsoStorylineIds || []).filter(sid => sid !== id);
  });
  recordDataEdit(); saveState();
  renderTimeline();
}

function renderChronStrip() {
  const laneLabels = document.getElementById('tl-lane-labels');
  const track = document.getElementById('tl-track');
  if (!track) return;
  track.querySelectorAll('.tl-scene, .tl-lane-row, #tl-thread-svg, .tl-markers-layer').forEach(el => el.remove());

  const scenesByStoryline = new Map(S.storylines.map(st => [st.id, []]));
  S.chronOrder.forEach(id => {
    const s = S.scenes.find(x => x.id === id);
    if (s && scenesByStoryline.has(s.storylineId)) scenesByStoryline.get(s.storylineId).push(s);
  });

  const laneCount = S.storylines.length || 1;
  const laneH = 92, cardW = 96;
  track.style.height = (laneCount * laneH) + 'px';
  track.style.width = chronTrackWidth(track) + 'px';
  laneLabels.style.height = (laneCount * laneH) + 'px';

  const laneIndex = new Map(S.storylines.map((st, i) => [st.id, i]));
  const storylineById = new Map(S.storylines.map(st => [st.id, st]));

  S.storylines.forEach((st, i) => {
    const row = document.createElement('div');
    row.className = 'tl-lane-row';
    row.style.top = (i * laneH) + 'px';
    row.style.height = laneH + 'px';
    row.dataset.storylineId = st.id;
    track.appendChild(row);
  });

  const threadSvg = document.createElementNS(SVGNS, 'svg');
  threadSvg.id = 'tl-thread-svg';
  threadSvg.style.position = 'absolute'; threadSvg.style.inset = '0';
  threadSvg.style.width = '100%'; threadSvg.style.height = '100%';
  threadSvg.setAttribute('width', chronTrackWidth(track));
  threadSvg.setAttribute('height', laneCount * laneH);
  threadSvg.style.zIndex = '1'; threadSvg.style.pointerEvents = 'none';
  track.appendChild(threadSvg);

  const markersLayer = document.createElement('div');
  markersLayer.className = 'tl-markers-layer';
  markersLayer.style.cssText = 'position:absolute;inset:0;z-index:1;pointer-events:none';
  track.appendChild(markersLayer);

  const xMap = chronX(S.timelinePrefs.axis);

  S.scenes.forEach(s => {
    const x = xMap.get(s.id); if (x === undefined) return;
    const lane = laneIndex.get(s.storylineId); if (lane === undefined) return;

    const card = document.createElement('div');
    card.className = 'tl-scene';
    card.dataset.sceneId = s.id;
    card.style.width = cardW + 'px';
    card.style.left = x + '%';
    card.style.top = (lane * laneH + laneH / 2) + 'px';
    card.style.setProperty('--c', slColor(storylineById.get(s.storylineId).paletteIndex));
    if (s.id === tlSelectedId) card.classList.add('tl-sel');
    if (typeof getFlaggedSceneIds === 'function' && (getFlaggedSceneIds() || []).includes(s.id)) card.classList.add('tl-flag');
    if (typeof sceneHasWarning === 'function' && sceneHasWarning(s.id)) card.classList.add('tl-warn');

    const warnDot = document.createElement('div'); warnDot.className = 'tl-warn-dot'; card.appendChild(warnDot);
    const title = document.createElement('div'); title.className = 'tl-t'; title.textContent = s.title; card.appendChild(title);
    const meta = document.createElement('div'); meta.className = 'tl-m';
    meta.textContent = fmtAnchor(s.anchor) || '—';
    if (s.offscreen) meta.textContent += ' · off';
    card.appendChild(meta);

    const convDots = renderConvDots(s, storylineById);
    if (convDots) card.appendChild(convDots);

    card.addEventListener('mouseenter', () => highlightScene(s.id, true));
    card.addEventListener('mouseleave', () => highlightScene(s.id, false));
    card.addEventListener('click', e => {
      e.stopPropagation();
      if (_tlDragOccurred) { _tlDragOccurred = false; return; } // a drag just ended here
      tlSelectScene(s.id);
    });
    card.addEventListener('mousedown', e => onChronCardDown(e, s.id));

    track.appendChild(card);
  });

  renderChronMarkers(markersLayer, xMap);
  renderChronThread();
  updateAxisAvailability();
}

function onChronCardDown(e, sceneId) {
  if (e.button !== 0) return;
  _tlDrag = { sceneId, active: false, startX: e.clientX, startY: e.clientY, ghostEl: null, insertLineEl: null, targetBeforeId: undefined, targetStorylineId: null };
}

function renderManuscriptRibbon() {
  const row = document.getElementById('tl-ms-row');
  if (!row) return;
  row.innerHTML = '';
  const storylineById = new Map(S.storylines.map(st => [st.id, st]));
  const scenes = manuscriptOrder();
  const numMap = buildSceneNumMap();
  const validSecIds = new Set(S.sections.map(s => s.id));

  let lastSecKey = undefined;
  scenes.forEach(s => {
    const secKey = validSecIds.has(s.sectionId) ? s.sectionId : null;
    if (secKey !== lastSecKey && lastSecKey !== undefined) {
      const sep = document.createElement('div'); sep.className = 'tl-sep';
      const sec = S.sections.find(x => x.id === secKey);
      if (sec) { const lbl = document.createElement('div'); lbl.className = 'tl-sep-label'; lbl.textContent = sec.name; lbl.style.color = sec.color || ''; sep.appendChild(lbl); }
      row.appendChild(sep);
    }
    lastSecKey = secKey;
    row.appendChild(buildRibbonCard(s, numMap.get(s.id) ?? 1, storylineById));
  });

  const cardW = Math.max(70, (S.timelinePrefs.pxPerScene || 110) - 14);
  row.querySelectorAll('.tl-ms-card').forEach(el => { el.style.width = cardW + 'px'; });
}

function buildRibbonCard(s, num, storylineById) {
  const card = document.createElement('div');
  card.className = 'tl-ms-card' + (s.offscreen ? ' tl-offscreen' : '');
  card.dataset.sceneId = s.id;
  const st = storylineById.get(s.storylineId);
  card.style.setProperty('--c', st ? slColor(st.paletteIndex) : 'var(--acc)');
  const sec = S.sections.find(x => x.id === s.sectionId);
  if (sec && sec.color) card.style.boxShadow = 'inset 3px 0 0 ' + sec.color;
  if (s.id === tlSelectedId) card.classList.add('tl-sel');
  if (typeof getFlaggedSceneIds === 'function' && (getFlaggedSceneIds() || []).includes(s.id)) card.classList.add('tl-flag');
  if (typeof sceneHasWarning === 'function' && sceneHasWarning(s.id)) card.classList.add('tl-warn');

  const warnDot = document.createElement('div'); warnDot.className = 'tl-warn-dot'; card.appendChild(warnDot);
  const ch = document.createElement('div'); ch.className = 'tl-ch'; ch.textContent = 'Sc ' + num; card.appendChild(ch);
  const title = document.createElement('div'); title.className = 'tl-t'; title.textContent = s.title; card.appendChild(title);
  if (s.offscreen) { const chip = document.createElement('div'); chip.className = 'tl-off-chip'; chip.textContent = 'off'; card.appendChild(chip); }

  const convDots = renderConvDots(s, storylineById);
  if (convDots) card.appendChild(convDots);

  card.addEventListener('mouseenter', () => highlightScene(s.id, true));
  card.addEventListener('mouseleave', () => highlightScene(s.id, false));
  card.addEventListener('click', e => { e.stopPropagation(); tlSelectScene(s.id); });
  return card;
}

/* §6.2 step 2: gray out True scale until >=2 scenes are anchored. */
function updateAxisAvailability() {
  const btn = document.getElementById('tl-axis-true');
  if (!btn) return;
  const anchoredCount = S.scenes.filter(s => s.anchor && s.anchor.date).length;
  const available = anchoredCount >= 2;
  btn.disabled = !available;
  btn.title = available ? '' : 'Anchor at least two scenes to dates to enable true scale.';
  if (!available && S.timelinePrefs.axis === 'true') {
    S.timelinePrefs.axis = 'ordinal';
    document.querySelectorAll('#tl-axis-switch .tl-axis-btn').forEach(b => b.classList.toggle('on', b.dataset.axis === 'ordinal'));
  }
}

function setTlAxis(mode) {
  if (mode !== 'ordinal' && mode !== 'true') return;
  if (mode === 'true' && document.getElementById('tl-axis-true').disabled) return;
  S.timelinePrefs.axis = mode;
  saveState(); // timelinePrefs is view state (excluded from undo) but still persisted
  renderTimeline();
}

function setTlZoom(px) {
  px = Math.max(70, Math.min(200, parseInt(px, 10) || 110));
  S.timelinePrefs.pxPerScene = px;
  saveState();
  renderTimeline();
}

function renderThreadPicker() {
  const sel = document.getElementById('tl-thread-sel'); if (!sel) return;
  const cur = String(S.timelinePrefs.threadCharId ?? '');
  sel.innerHTML = '<option value="">None</option>';
  S.characters.forEach(c => {
    const opt = document.createElement('option'); opt.value = String(c.id); opt.textContent = c.name;
    sel.appendChild(opt);
  });
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : '';
}
function setTlThread(charIdStr) {
  const id = charIdStr ? parseInt(charIdStr, 10) : null;
  S.timelinePrefs.threadCharId = id;
  saveState();
  renderChronThread();
}

function renderChronThread() {
  const svg = document.getElementById('tl-thread-svg');
  if (!svg) return;
  svg.textContent = '';
  const charId = S.timelinePrefs.threadCharId;
  if (!charId) return;
  const track = document.getElementById('tl-track');
  const trackRect = track.getBoundingClientRect();
  const pts = [];
  S.chronOrder.forEach(id => {
    const s = S.scenes.find(x => x.id === id);
    if (!s || !(s.characters || []).includes(charId)) return;
    const cardEl = track.querySelector('.tl-scene[data-scene-id="' + id + '"]');
    if (!cardEl) return;
    const r = cardEl.getBoundingClientRect();
    pts.push({ x: r.left + r.width / 2 - trackRect.left, y: r.top + r.height / 2 - trackRect.top });
  });
  if (pts.length < 2) return;
  let d = 'M ' + pts[0].x + ' ' + pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i], mx = (p.x + q.x) / 2;
    d += ' C ' + mx + ' ' + p.y + ', ' + mx + ' ' + q.y + ', ' + q.x + ' ' + q.y;
  }
  const path = document.createElementNS(SVGNS, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'var(--acc)'); path.setAttribute('stroke-width', '2.5'); path.setAttribute('opacity', '.8');
  svg.appendChild(path);
  pts.forEach(p => {
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', '4');
    c.setAttribute('fill', 'var(--acc)'); c.setAttribute('stroke', 'var(--sbg)'); c.setAttribute('stroke-width', '2');
    svg.appendChild(c);
  });
}

// ── CHRON STRIP DRAG (ported from ../Timeline/js/chron.js's _chronDrag family,
// schema v3 §6.5) — candidate/threshold-4px/active two-phase pattern, matching
// the mouse-event pattern editor.js already uses for board card drag. ────────
let _tlDrag = null; // null when not dragging
let _tlDragActive = false; // guards undo (editor.js keydown) and hover (highlightScene) mid-drag
let _tlDragOccurred = false; // suppresses the click that always follows a drag's mouseup
let _tlTrueScaleToastShown = false;

function isTlDragActive() { return !!(_tlDrag && _tlDrag.active); }
function cancelTlDrag() { if (_tlDrag) _tlDragCancel(); }

function _tlDragBegin(e) {
  const d = _tlDrag;
  d.active = true;
  _tlDragActive = true;
  clearHighlight(); // the mouseleave the drag itself triggers won't fire while dragActive guards it below

  const track = document.getElementById('tl-track');
  const srcEl = track.querySelector('.tl-scene[data-scene-id="' + d.sceneId + '"]');
  if (srcEl) srcEl.classList.add('tl-drag-source');

  const scene = S.scenes.find(x => x.id === d.sceneId);
  if (!scene) { _tlDragCancel(); return; }
  const st = S.storylines.find(x => x.id === scene.storylineId);

  const ghost = document.createElement('div');
  ghost.className = 'tl-scene tl-drag-ghost';
  ghost.style.width = '96px';
  ghost.style.setProperty('--c', st ? slColor(st.paletteIndex) : 'var(--acc)');
  const t = document.createElement('div'); t.className = 'tl-t'; t.textContent = scene.title;
  ghost.appendChild(t);
  track.appendChild(ghost);
  d.ghostEl = ghost;

  const line = document.createElement('div');
  line.className = 'tl-insert-line';
  line.style.display = 'none';
  track.appendChild(line);
  d.insertLineEl = line;

  // Horizontal reorder is ordinal-mode only (§6.5) — true-scale still allows
  // the vertical lane move, with a one-time toast and a plain cursor.
  if (S.timelinePrefs.axis === 'true') {
    document.body.style.cursor = 'default';
    _tlShowTrueScaleToast();
  }
}

function _tlShowTrueScaleToast() {
  if (_tlTrueScaleToastShown) return;
  _tlTrueScaleToastShown = true;
  const toast = document.createElement('div');
  toast.className = 'tl-toast';
  toast.textContent = 'Switch to Ordinal to reorder by time';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

// Nearest scene to the right of the cursor ACROSS ALL LANES by x — the drop
// slot is a position in chronOrder, not per-lane. Reads real card rects (not
// the xMap) so it's correct regardless of ordinal overlap.
function _tlFindDropBeforeId(localX, excludeId) {
  const track = document.getElementById('tl-track');
  const trackRect = track.getBoundingClientRect();
  const cards = [...track.querySelectorAll('.tl-scene:not(.tl-drag-ghost)')];
  let best = null, bestX = Infinity;
  cards.forEach(el => {
    const id = el.dataset.sceneId;
    if (!id || id === excludeId) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2 - trackRect.left;
    if (cx >= localX && cx < bestX) { bestX = cx; best = id; }
  });
  return best; // null = insert at the end of chronOrder
}

function _tlInsertionX(track, trackRect, beforeId, excludeId) {
  if (beforeId) {
    const el = track.querySelector('.tl-scene[data-scene-id="' + beforeId + '"]');
    if (el) { const r = el.getBoundingClientRect(); return r.left - trackRect.left - 4; }
  }
  const cards = [...track.querySelectorAll('.tl-scene:not(.tl-drag-ghost)')];
  let maxRight = 0;
  cards.forEach(el => {
    if (el.dataset.sceneId === excludeId) return;
    const r = el.getBoundingClientRect();
    const rx = r.right - trackRect.left;
    if (rx > maxRight) maxRight = rx;
  });
  return maxRight + 4;
}

function _tlLaneAtClientY(clientY) {
  const rows = [...document.querySelectorAll('.tl-lane-row')];
  if (!rows.length) return null;
  for (const row of rows) {
    const r = row.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom) return row.dataset.storylineId;
  }
  const firstR = rows[0].getBoundingClientRect();
  if (clientY < firstR.top) return rows[0].dataset.storylineId;
  return rows[rows.length - 1].dataset.storylineId;
}

function _tlDragMove(e) {
  const d = _tlDrag;
  const track = document.getElementById('tl-track');
  const trackRect = track.getBoundingClientRect();
  const localX = e.clientX - trackRect.left;
  const localY = e.clientY - trackRect.top;
  d.ghostEl.style.left = localX + 'px';
  d.ghostEl.style.top = localY + 'px';

  if (S.timelinePrefs.axis !== 'true') {
    const beforeId = _tlFindDropBeforeId(localX, String(d.sceneId));
    d.targetBeforeId = beforeId;
    d.insertLineEl.style.left = _tlInsertionX(track, trackRect, beforeId, String(d.sceneId)) + 'px';
    d.insertLineEl.style.display = '';
  } else {
    d.targetBeforeId = undefined; // true-scale reorder disabled
    d.insertLineEl.style.display = 'none';
  }

  const laneStId = _tlLaneAtClientY(e.clientY);
  d.targetStorylineId = laneStId;
  document.querySelectorAll('.tl-lane-row').forEach(row => {
    row.classList.toggle('tl-drop-target', row.dataset.storylineId === laneStId);
  });
}

function _tlDragCleanupVisual() {
  if (_tlDrag) {
    if (_tlDrag.ghostEl) _tlDrag.ghostEl.remove();
    if (_tlDrag.insertLineEl) _tlDrag.insertLineEl.remove();
    const srcEl = document.querySelector('.tl-scene[data-scene-id="' + _tlDrag.sceneId + '"]');
    if (srcEl) srcEl.classList.remove('tl-drag-source');
  }
  document.querySelectorAll('.tl-lane-row.tl-drop-target').forEach(r => r.classList.remove('tl-drop-target'));
  document.body.style.cursor = '';
}

function _tlDragCancel() {
  _tlDragCleanupVisual();
  _tlDragActive = false;
  _tlDrag = null;
}

function _tlDragFinish() {
  const d = _tlDrag;
  _tlDragCleanupVisual();
  _tlDragActive = false;
  _tlDrag = null;
  _tlDragOccurred = true; // suppress the click that follows this mouseup

  const scene = S.scenes.find(x => x.id === d.sceneId);
  if (!scene) return;

  let newChronOrder = null;
  if (S.timelinePrefs.axis !== 'true' && d.targetBeforeId !== undefined) {
    const without = S.chronOrder.filter(id => id !== d.sceneId);
    const beforeIdNum = d.targetBeforeId ? parseInt(d.targetBeforeId, 10) : null;
    let idx = beforeIdNum !== null ? without.indexOf(beforeIdNum) : -1;
    if (idx === -1) idx = without.length;
    const candidate = without.slice();
    candidate.splice(idx, 0, d.sceneId);
    const same = candidate.length === S.chronOrder.length && candidate.every((id, i) => id === S.chronOrder[i]);
    if (!same) newChronOrder = candidate;
  }

  const targetStorylineId = d.targetStorylineId ? parseInt(d.targetStorylineId, 10) : null;
  const relane = !!(targetStorylineId && targetStorylineId !== scene.storylineId);

  if (!newChronOrder && !relane) return; // no-op drag: nothing moved, no commit

  const label = newChronOrder ? 'Move scene (time)' : 'Move scene (lane)';
  pushHistory(label);
  if (newChronOrder) S.chronOrder = newChronOrder;
  if (relane) {
    scene.storylineId = targetStorylineId;
    // §2.5 invariant: alsoStorylineIds never contains storylineId.
    scene.alsoStorylineIds = (scene.alsoStorylineIds || []).filter(id => id !== targetStorylineId);
  }
  recordDataEdit();
  saveState();
  renderTimeline();
}

// ── MARKERS (ported from ../Timeline/js/chron.js, schema v3 §6.7) ────────────
let _tlMarkerPopoverId = null;

function tlMarkerX(marker, xMap) {
  const order = S.chronOrder;
  if (!marker.beforeSceneId) {
    const lastId = order[order.length - 1];
    const lx = xMap.get(lastId);
    return lx === undefined ? 100 : Math.min(100, lx + (100 - lx) / 2 + 5);
  }
  const idx = order.indexOf(marker.beforeSceneId);
  if (idx === -1) return 0;
  const afterX = xMap.get(marker.beforeSceneId);
  if (idx === 0) return afterX === undefined ? 0 : Math.max(0, afterX / 2);
  const prevId = order[idx - 1];
  const beforeX = xMap.get(prevId);
  if (beforeX === undefined || afterX === undefined) return 0;
  return (beforeX + afterX) / 2;
}

function renderChronMarkers(layer, xMap) {
  layer.innerHTML = '';
  (S.markers || []).forEach(m => {
    const x = tlMarkerX(m, xMap);
    const line = document.createElement('div');
    line.className = 'tl-marker-line';
    line.style.left = x + '%';
    line.style.pointerEvents = 'auto';
    line.dataset.markerId = m.id;

    const label = document.createElement('div');
    label.className = 'tl-marker-label';
    label.textContent = m.label;
    label.style.pointerEvents = 'auto';
    label.addEventListener('click', e => { e.stopPropagation(); openMarkerPopover(m, label); });
    line.appendChild(label);
    layer.appendChild(line);
  });
}

function openMarkerPopover(marker, anchorEl) {
  closeMarkerPopover();
  _tlMarkerPopoverId = marker.id;
  const pop = document.createElement('div');
  pop.className = 'tl-popover';
  pop.id = 'tl-marker-popover';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = marker.label;
  pop.appendChild(input);

  const row = document.createElement('div');
  row.className = 'tl-popover-row';
  const delBtn = document.createElement('button');
  delBtn.className = 'tl-danger';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', () => {
    pushHistory('Delete marker');
    S.markers = S.markers.filter(mk => mk.id !== marker.id);
    recordDataEdit(); saveState();
    closeMarkerPopover();
    renderTimeline();
  });
  row.appendChild(delBtn);
  pop.appendChild(row);

  input.addEventListener('change', () => {
    const val = input.value.trim();
    if (!val) return;
    pushHistory('Rename marker');
    const mk = S.markers.find(x => x.id === marker.id);
    if (mk) mk.label = val;
    recordDataEdit(); saveState();
    renderTimeline();
  });

  document.body.appendChild(pop);
  const rect = anchorEl.getBoundingClientRect();
  pop.style.left = rect.left + 'px';
  pop.style.top = (rect.bottom + 4) + 'px';

  setTimeout(() => document.addEventListener('click', _tlMarkerPopoverOutsideClick), 0);
}
function _tlMarkerPopoverOutsideClick(e) {
  const pop = document.getElementById('tl-marker-popover');
  if (pop && !pop.contains(e.target)) closeMarkerPopover();
}
function closeMarkerPopover() {
  const pop = document.getElementById('tl-marker-popover');
  if (pop) pop.remove();
  _tlMarkerPopoverId = null;
  document.removeEventListener('click', _tlMarkerPopoverOutsideClick);
}
// Every close path (outside click, re-open, Escape, the action button itself)
// removes both the menu element and its document listener — the July-2026
// ThruLine fix this ports verbatim, so two successive right-clicks never
// leave a stray menu/listener behind.
function closeMarkerContextMenu() {
  const menu = document.getElementById('tl-marker-context-menu');
  if (menu) menu.remove();
  document.removeEventListener('click', _tlContextMenuOutsideClick);
}
function chronTrackContextMenu(e) {
  e.preventDefault();
  closeMarkerPopover();
  closeMarkerContextMenu();
  const track = document.getElementById('tl-track');
  const rect = track.getBoundingClientRect();
  const clickX = ((e.clientX - rect.left) / rect.width) * 100;

  const menu = document.createElement('div');
  menu.className = 'tl-popover';
  menu.id = 'tl-marker-context-menu';
  const addBtn = document.createElement('button');
  addBtn.textContent = 'Add marker here';
  addBtn.addEventListener('click', () => {
    const xMap = chronX(S.timelinePrefs.axis);
    let beforeSceneId = null;
    for (const id of S.chronOrder) {
      const sx = xMap.get(id);
      if (sx !== undefined && sx >= clickX) { beforeSceneId = id; break; }
    }
    pushHistory('Add marker');
    const id = S.nextEntId++;
    S.markers.push({ id, label: 'New marker', beforeSceneId });
    recordDataEdit(); saveState();
    closeMarkerContextMenu();
    renderTimeline();
  });
  menu.appendChild(addBtn);
  document.body.appendChild(menu);
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';

  setTimeout(() => document.addEventListener('click', _tlContextMenuOutsideClick), 0);
}
function _tlContextMenuOutsideClick(e) {
  const menu = document.getElementById('tl-marker-context-menu');
  if (menu && !menu.contains(e.target)) {
    menu.remove();
    document.removeEventListener('click', _tlContextMenuOutsideClick);
  }
}

// ── HOVER + WIRES (ported from ../Timeline/js/wires.js, schema v3 §6.2/§9) ────
function highlightScene(sceneId, on) {
  if (typeof drag !== 'undefined' && drag.on) return;
  if (_tlDragActive) return;
  document.body.classList.toggle('hovering', on);
  document.querySelectorAll('[data-scene-id="' + sceneId + '"]').forEach(el => el.classList.toggle('tl-hi', on));
  redrawWires();
}
function clearHighlight() {
  document.body.classList.remove('hovering');
  document.querySelectorAll('.tl-hi').forEach(el => el.classList.remove('tl-hi'));
  redrawWires();
}

function redrawWires() {
  const svg = document.getElementById('tl-wires');
  const stage = document.getElementById('tl-stage');
  if (!svg || !stage || !timelineMode) return;
  svg.setAttribute('width', stage.clientWidth);
  svg.setAttribute('height', stage.clientHeight);
  svg.textContent = '';
  if (!stage.clientWidth || !stage.clientHeight) return;

  const hoveredEl = document.querySelector('.tl-scene.tl-hi, .tl-ms-card.tl-hi');
  const hoveredId = hoveredEl ? hoveredEl.dataset.sceneId : null;
  const hovering = document.body.classList.contains('hovering');
  const storylineById = new Map(S.storylines.map(st => [st.id, st]));

  const chronById = new Map(), msById = new Map();
  document.querySelectorAll('.tl-scene[data-scene-id]').forEach(el => chronById.set(el.dataset.sceneId, el));
  document.querySelectorAll('.tl-ms-card[data-scene-id]').forEach(el => msById.set(el.dataset.sceneId, el));

  const stageRect = stage.getBoundingClientRect();
  const geo = [];
  S.scenes.forEach(s => {
    // Unlike ThruLine (where an offscreen scene has no msOrder entry at all),
    // SceneSetter's manuscript ribbon renders every scene — offscreen ones
    // just get the .tl-offscreen dimmed treatment (renderManuscriptRibbon) —
    // so offscreen scenes are NOT skipped here; both cards always exist.
    const chronEl = chronById.get(String(s.id));
    const msEl = msById.get(String(s.id));
    if (!chronEl || !msEl) return;
    geo.push({ scene: s, ar: chronEl.getBoundingClientRect(), br: msEl.getBoundingClientRect() });
  });

  const frag = document.createDocumentFragment();
  const flagActive = typeof isFlagModeActive === 'function' && isFlagModeActive();
  const flaggedIds = flagActive && typeof getFlaggedSceneIds === 'function' ? (getFlaggedSceneIds() || []) : [];
  geo.forEach(g => {
    const s = g.scene, ar = g.ar, br = g.br;
    const ax = ar.left + ar.width / 2 - stageRect.left, ay = ar.bottom - stageRect.top;
    const bx = br.left + br.width / 2 - stageRect.left, by = br.top - stageRect.top;
    const dy = Math.max(40, (by - ay) / 2);
    const st = storylineById.get(s.storylineId);
    let color = st ? slColor(st.paletteIndex) : 'var(--acc)';
    const isHi = hovering && String(s.id) === hoveredId;
    let opacity = 0.5, width = 1.4;
    if (hovering) opacity = isHi ? 1 : 0.08;
    if (isHi) width = 2.4;
    if (flagActive) {
      const isFlagged = flaggedIds.includes(s.id);
      color = isFlagged ? 'var(--rd)' : color;
      opacity = isFlagged ? 1 : 0.06;
      width = isFlagged ? 2.4 : 1.4;
    }
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', 'M ' + ax + ' ' + ay + ' C ' + ax + ' ' + (ay + dy) + ', ' + bx + ' ' + (by - dy) + ', ' + bx + ' ' + by);
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', width); path.setAttribute('opacity', opacity);
    frag.appendChild(path);
  });
  svg.appendChild(frag);
}

let _tlWiresRafPending = false;
function _tlOnStripScroll() {
  if (_tlWiresRafPending) return;
  _tlWiresRafPending = true;
  requestAnimationFrame(() => { _tlWiresRafPending = false; redrawWires(); });
}
function scrollTlCounterpartIntoView(sceneId) {
  _tlScrollCardIntoView(document.getElementById('tl-chron-scroll'), document.querySelector('.tl-scene[data-scene-id="' + sceneId + '"]'));
  _tlScrollCardIntoView(document.getElementById('tl-ms-scroll'), document.querySelector('.tl-ms-card[data-scene-id="' + sceneId + '"]'));
}
function _tlScrollCardIntoView(scrollEl, cardEl) {
  if (!scrollEl || !cardEl) return;
  const sr = scrollEl.getBoundingClientRect(), cr = cardEl.getBoundingClientRect();
  if (cr.left >= sr.left && cr.right <= sr.right) return;
  const cardCenter = cardEl.offsetLeft + cardEl.offsetWidth / 2;
  let target = cardCenter - scrollEl.clientWidth / 2;
  const maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
  target = Math.max(0, Math.min(maxScroll, target));
  scrollEl.scrollTo({ left: target, behavior: 'smooth' });
}

// ── SELECTION / INSPECTOR (§6.6) ──────────────────────────────────────────────
function tlSelectScene(sceneId, opts) {
  opts = opts || {};
  runWithDiscardGuard(() => _tlDoSelectScene(sceneId, opts));
}
function _tlDoSelectScene(sceneId, opts) {
  tlSelectedId = sceneId;
  document.querySelectorAll('.tl-scene, .tl-ms-card').forEach(el => {
    el.classList.toggle('tl-sel', el.dataset.sceneId === String(sceneId));
  });
  const emptyEl = document.getElementById('tl-inspector-empty');
  const form = document.getElementById('form-edit');
  if (sceneId == null) {
    emptyEl.style.display = '';
    form.style.display = 'none';
    if (S.editingId !== null) cancelEdit();
  } else {
    emptyEl.style.display = 'none';
    openEditMode(sceneId);
    form.style.display = 'flex';
    if (opts.focusTitle) {
      setTimeout(() => { const t = document.getElementById('ed-title'); if (t) { t.focus(); t.select(); } }, 40);
    }
  }
  if (sceneId != null) scrollTlCounterpartIntoView(sceneId);
}

function tlSwitchTab(tab) {
  tlActiveTab = tab;
  document.getElementById('tl-tab-inspector').classList.toggle('on', tab === 'inspector');
  document.getElementById('tl-tab-conflicts').classList.toggle('on', tab === 'conflicts');
  document.getElementById('tl-inspector-body').style.display = tab === 'inspector' ? '' : 'none';
  document.getElementById('tl-conflicts-body').style.display = tab === 'conflicts' ? '' : 'none';
  if (tab === 'conflicts' && typeof renderConflictsPanel === 'function') renderConflictsPanel();
}

// Auto-unique "Untitled scene"/"Untitled scene N" (case-insensitive, matching
// the New Scene form's own title-uniqueness rule, editor.js addScene()).
function tlUniqueUntitledName() {
  let n = 0;
  for (;;) {
    const name = n === 0 ? 'Untitled scene' : 'Untitled scene ' + (n + 1);
    if (!S.scenes.some(s => s.title.toLowerCase() === name.toLowerCase())) return name;
    n++;
  }
}
// Create -> New Scene / the strip header's "+ Scene" button, while in timeline
// mode (§6.1): creates immediately with §2.5 defaults instead of opening the
// (hidden) New Scene form.
function tlCreateScene() {
  const title = tlUniqueUntitledName();
  pushHistory('Add scene "' + title + '"');
  if (typeof trackSceneAdded === 'function') trackSceneAdded();
  const id = S.nextId++;
  const newScene = {
    id, title, summary: '', notes: '', characters: [], locations: [], themes: [], misc: [],
    sectionId: null, wordCount: null, povs: [],
    storylineId: S.storylines[0].id, alsoStorylineIds: [], anchor: null, durationMin: null,
    offscreen: false, reveals: [], requires: [],
  };
  S.scenes.push(newScene);
  S.chronOrder.push(id);
  recordDataEdit(); saveState();
  renderTimeline();
  _tlDoSelectScene(id, { focusTitle: true });
}

// ── SCROLL / RESIZE WIRING (§7.6, §9) ─────────────────────────────────────────
if (document.getElementById('timeline-host')) {
  window.addEventListener('resize', () => { if (timelineMode) redrawWires(); });
  const chronScroll = document.getElementById('tl-chron-scroll');
  const msScroll = document.getElementById('tl-ms-scroll');
  if (chronScroll) chronScroll.addEventListener('scroll', _tlOnStripScroll);
  if (msScroll) msScroll.addEventListener('scroll', _tlOnStripScroll);
  let tlResizeTimer = null;
  const scheduleTlRerender = () => {
    if (!timelineMode) return;
    clearTimeout(tlResizeTimer);
    tlResizeTimer = setTimeout(renderTimeline, 150);
  };
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(scheduleTlRerender).observe(document.getElementById('tl-stage'));
  }

  // Chron strip drag + markers (§6.5, §6.7) — global listeners wired ONCE,
  // not per-render, since #tl-track is a persistent DOM node reused across
  // renderChronStrip() calls (attaching inside it would stack duplicates).
  const track = document.getElementById('tl-track');
  if (track) {
    track.addEventListener('contextmenu', chronTrackContextMenu);
    track.addEventListener('click', e => {
      if (_tlDragOccurred) { _tlDragOccurred = false; return; } // drag dropped on empty track space
      if (e.target === track) tlSelectScene(null);
    });
  }
  window.addEventListener('mousemove', e => {
    if (!_tlDrag) return;
    // Self-heal: mirrors editor.js's board-drag e.buttons===0 check.
    if (e.buttons === 0) { _tlDragCancel(); return; }
    if (!_tlDrag.active) {
      const dx = e.clientX - _tlDrag.startX, dy = e.clientY - _tlDrag.startY;
      if (Math.hypot(dx, dy) < 4) return; // still under the click/drag threshold
      _tlDragBegin(e);
    }
    _tlDragMove(e);
  });
  window.addEventListener('mouseup', () => {
    if (!_tlDrag) return;
    if (!_tlDrag.active) { _tlDrag = null; return; } // never crossed threshold: plain click
    _tlDragFinish();
  });
}
