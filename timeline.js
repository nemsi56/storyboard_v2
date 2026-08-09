'use strict';

// ── STORYLINE PALETTE (schema v3 §2.6) ────────────────────────────────────────
// Ported from ../Timeline/js/state.js STORYLINE_PALETTE/slColor, adapted:
// SceneSetter has five themes, not two — map each theme to whichever of the
// two pools (dark-ish / light-ish) reads better against its background.
// Index 2 (purple) was originally #a78bfa/#7b5ea7 — too close to index 0's blue
// at small sizes (similar lightness/saturation, only ~50deg of hue apart).
// Shifted toward magenta (hue ~285) for real separation from blue at a glance.
const STORYLINE_PALETTE = {
  dark:  ['#5aa9e6','#e0a458','#c065e8','#6ad19a','#e66a9a','#58c4d4','#d4c458','#c48a58','#8a9ae6','#6ae0c4'],
  light: ['#3d6c9e','#b07a35','#9142ad','#3f8f68','#b3486f','#35809a','#8f7d2e','#8f5b32','#4f5fa8','#2e8b7a'],
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

// Margin (in %) reserved at each edge so the first/last card's own edge (not
// just its center) never lands under the scroll-arrow buttons (26px wide,
// inset 6px from the edge — see .tl-scroll-arrow in styles.css) — without
// it, at a tight zoom/large scene count the edge-most cards render almost
// flush with 0%/100% and the arrow sits directly on top of them, hiding real
// content. Accounts for the current card width (bigger cards need more
// clearance for their center to keep their edge past the arrow), and is
// pixel-based (converted to % of the track's actual width) so it scales
// correctly at every zoom level and scene count.
const TL_ARROW_REACH_PX = 32; // .tl-scroll-arrow: left:6px + width:26px
function chronXEdgeMarginPct() {
  const track = document.getElementById('tl-track');
  const w = track ? track.clientWidth : 0;
  if (!w) return 4;
  const cardW = tlLoomCardW(tlCurrentPxPerScene(), 10, 96);
  const neededPx = TL_ARROW_REACH_PX + cardW / 2 + 4;
  return Math.min(20, (neededPx / w) * 100);
}
// Two scenes are "the same anchor" only if their anchor is fully identical
// (date AND time, when both set) — a looser same-day-only match would treat
// an untimed all-day scene and a precisely-timed one as simultaneous, which
// isn't necessarily true. Returns null for an unanchored scene, which never
// matches anything (including another unanchored scene) — two scenes with
// no date aren't known to be simultaneous, so each keeps its own slot.
function _tlAnchorKey(scene) {
  const a = scene.anchor;
  if (!a || !a.date) return null;
  return a.date + '|' + (a.time || '');
}
// Ordinal has no per-lane collision pass (unlike True scale) because every
// scene normally gets its own evenly-spaced rank slot, which by construction
// can never collide — a slot is unique to one position in chronOrder, full
// stop. Sharing a slot across storylines is exactly what this function does
// for scenes with a matching anchor, which is safe for the same reason
// (different lanes can't visually overlap regardless of x). The one thing
// it must never do is collapse two scenes on the *same* storyline into one
// slot — that's a real on-screen collision, not just a coordinate tie — so
// grouping only merges a same-anchor run so long as no storyline repeats
// within it; a repeat starts a fresh group instead.
function chronXOrdinal() {
  const map = new Map();
  const order = S.chronOrder || [];
  const sceneById = new Map(S.scenes.map(s => [s.id, s]));
  const margin = chronXEdgeMarginPct();
  const span = 100 - margin * 2;

  const groups = [];
  let current = null; // { key, lanes: Set, ids: [] }
  order.forEach(id => {
    const scene = sceneById.get(id);
    const key = scene ? _tlAnchorKey(scene) : null;
    const lane = scene ? scene.storylineId : undefined;
    if (current && key !== null && key === current.key && !current.lanes.has(lane)) {
      current.ids.push(id);
      current.lanes.add(lane);
    } else {
      current = { key, lanes: new Set([lane]), ids: [id] };
      groups.push(current);
    }
  });

  const g = groups.length || 1;
  groups.forEach((grp, i) => {
    const x = margin + ((i + 0.5) / g) * span;
    grp.ids.forEach(id => map.set(id, x));
  });
  return map;
}

function anchorTs(anchor) {
  if (!anchor || !anchor.date) return null;
  const t = anchor.time || '00:00';
  const ms = Date.parse(anchor.date + 'T' + t + ':00');
  return isNaN(ms) ? null : ms;
}

// Shared by chronXTrueScale (ts -> x%) and _tlXPercentToTs (x% -> ts, used
// when dragging a card to a new date in True scale) — both must agree on
// exactly the same anchored-scene range or a drag could "snap" a card to a
// date slightly off from where it visually landed.
function _tlAnchoredTsRange() {
  const order = S.chronOrder || [];
  const sceneById = new Map(S.scenes.map(s => [s.id, s]));
  const anchored = [];
  order.forEach(id => {
    const s = sceneById.get(id); if (!s) return;
    const ts = anchorTs(s.anchor);
    if (ts !== null) anchored.push(ts);
  });
  if (anchored.length < 2) return null;
  anchored.sort((a, b) => a - b);
  return { tMin: anchored[0], tMax: anchored[anchored.length - 1] };
}
// Inverse of the anchored-scene mapping below (x% -> timestamp), for
// True-scale card drag: interprets wherever the card was dropped as a date.
function _tlXPercentToTs(xPct) {
  const range = _tlAnchoredTsRange();
  if (!range || range.tMax === range.tMin) return null;
  const frac = (xPct - 4) / 92;
  return range.tMin + frac * (range.tMax - range.tMin);
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

  // The per-lane pass above only looks at each lane in isolation, so a lane
  // with many tightly-clustered scenes can get pushed forward enough to
  // overtake a *different* lane's scene that's chronologically later —
  // same-lane cards never visually overlap as a result (the pass's actual
  // job), but S.chronOrder (built from real dates, spanning every lane) is
  // no longer left-to-right monotonic in x. Nothing downstream expects that:
  // the character Thread (renderChronThread) walks chronOrder and connects
  // each point in sequence, so a cross-lane inversion here reads as the
  // thread zig-zagging backward even though the scenes are in correct date
  // order. One more forward-only sweep over chronOrder itself (not per-lane)
  // restores that invariant — it only ever pushes a later scene's x up to
  // match an earlier one's, same "push forward, never back" rule as above.
  let prevOrderX = -Infinity;
  order.forEach(id => {
    const x = map.get(id);
    if (x === undefined) return;
    if (x < prevOrderX) map.set(id, prevOrderX);
    else prevOrderX = x;
  });

  // The collision pass above can push a dense lane's x values past 100 (it
  // only enforces a minimum gap, with no upper bound) — left unclamped, those
  // cards render past the track's own right edge, past where the lane-row
  // color band and every other track-relative background actually ends
  // (visible as bands that stop abruptly partway across True scale). Rescale
  // the whole map back into [0,100] when that happens, preserving order and
  // relative spacing.
  let maxX = 0;
  map.forEach(x => { if (x > maxX) maxX = x; });
  if (maxX > 100) {
    const scale = 100 / maxX;
    map.forEach((x, id) => map.set(id, x * scale));
  }

  return map;
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
// ── MODE STATE ─────────────────────────────────────────────────────────────────
let timelineMode = false;
let tlBraidMode = false; // Strip vs. Braid, ephemeral like chartMode — resets on project open
let tlBraidChronMode = false; // Narrative vs. Chronology axis within Braid, same ephemeral lifetime as tlBraidMode
let tlSelectedId = null;
let tlActiveTab = 'inspector'; // in-memory only, not persisted (§6.6)
let _tlFormEditHome = null; // { parent, next } captured once, restored on leave
let _tlFormNewHome = null; // same idea, for the New Scene form (see tlShowNewSceneForm)

function _tlCaptureFormEditHome() {
  if (_tlFormEditHome) return;
  const form = document.getElementById('form-edit');
  if (!form) return;
  _tlFormEditHome = { parent: form.parentElement, next: form.nextSibling };
}
function _tlCaptureFormNewHome() {
  if (_tlFormNewHome) return;
  const form = document.getElementById('form-new');
  if (!form) return;
  _tlFormNewHome = { parent: form.parentElement, next: form.nextSibling };
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

// ── DISCARD GUARD FOR CLICKS OUTSIDE THE PANEL (mirrors editor.js's board-only
// "cancel edit on click outside #cp" handler) ─────────────────────────────────
// Chron/manuscript/braid cards and the scroll containers' own empty-space
// clicks already route through tlSelectScene()'s runWithDiscardGuard (correct,
// specific afterDiscard per click) — skipped here so this generic handler
// doesn't pre-empt them with a less specific "just deselect" action. Everything
// else outside #tl-panel (header controls, zoom, tabs, blank stage chrome) had
// no guard at all before this, unlike the board view's equivalent.
document.addEventListener('mousedown', e => {
  if (!timelineMode) return;
  if (e.target.closest('#tl-panel')) return;
  if (e.target.closest('.tl-scene, .tl-ms-card, .tl-braid-node, #tl-chron-scroll, #tl-ms-scroll, #tl-braid-scroll')) return;
  // anyModalOpen() (editor.js) covers every modal, not just the confirm-style
  // .cfm-modal ones — the reveal-library Edit modal (lib-edit-modal) is a
  // plain data-entry dialog, not a .cfm-modal, so the narrower check missed
  // it: clicking its Cancel button (or anywhere inside it) bubbled a
  // mousedown here uncaught, deselecting the Timeline card and clearing the
  // Inspector underneath the modal the user was still interacting with.
  if ((typeof anyModalOpen === 'function' && anyModalOpen()) || document.getElementById('tl-marker-popover') || document.getElementById('tl-marker-context-menu')) return;
  // Clears both card selection and (via _tlDoSelectScene) flag mode — the
  // panel's own row-click "show scenes" state — in one action.
  tlSelectScene(null);
});

function _openTimelineViewImpl() {
  if (typeof closeChartView === 'function') closeChartView();
  timelineMode = true;
  document.body.classList.add('tl-mode');
  document.getElementById('sbemp').style.display = 'none';
  document.getElementById('sbscrl').style.display = 'none';
  document.getElementById('timeline-host').style.display = 'flex';
  // renderBoard() normally clears these body-level pins on every call (they're
  // appended straight to <body>, not #board, so a scrolled section's sticky
  // label stays positioned correctly regardless of #board's own scrolling) —
  // but nothing in Timeline mode ever calls renderBoard() again to reach that
  // cleanup, so a pin left over from scrolling the board stays stuck on
  // screen for as long as Timeline is open unless cleared here too (same fix
  // already applied to openChartView(), charts.js).
  document.querySelectorAll('.sec-pin').forEach(p => p.remove());
  _tlCaptureFormEditHome();
  _tlCaptureFormNewHome();
  document.getElementById('tl-inspector-body').appendChild(document.getElementById('form-edit'));
  document.getElementById('tl-inspector-body').appendChild(document.getElementById('form-new'));
  // Both forms carry over whatever display state Card view last left them in
  // (e.g. mid-edit before switching to Timeline) — force a clean "nothing
  // selected" default every time Timeline opens, rather than trusting
  // leftover state from wherever they came from.
  document.getElementById('form-edit').style.display = 'none';
  document.getElementById('form-new').style.display = 'none';
  document.getElementById('tl-inspector-empty').style.display = '';
  tlSwitchTab('inspector');
  tlSelectedId = null;
  tlBraidMode = false;
  // tlBraidChronMode is intentionally NOT reset here — Narrative vs.
  // Chronology is a user preference within Path view, and should survive a
  // trip through Cards/Flow and back the same way the Loom/Path choice
  // itself would if it persisted. (tlBraidMode above still resets to Loom on
  // every reopen — that part's unchanged; only the axis choice inside Path
  // carries over.) The mode-switch buttons (#tl-braid-mode-switch) need their
  // .on classes re-synced to the CURRENT (carried-over) value explicitly
  // here, rather than via setTlBraidChronMode() (which would also call
  // renderTimeline() before the rest of this function has finished setting
  // up the just-reopened view) — otherwise they'd keep showing whatever the
  // DOM happened to look like from before this reopen, independent of what
  // tlBraidChronMode's value actually is.
  document.querySelectorAll('#tl-braid-mode-switch .tl-axis-btn').forEach(b => {
    b.classList.toggle('on', (b.dataset.braidMode === 'chronology') === tlBraidChronMode);
  });
  document.getElementById('tl-stage').classList.remove('tl-braid-active');
  document.getElementById('tl-axis-switch').style.display = '';
  document.getElementById('tl-thread-wrap').style.display = '';
  document.getElementById('tl-braid-mode-switch').style.display = 'none';
  // Ordinal/True-scale, Chronology/Narrative, Thread, and Zoom move up onto
  // the menu-bar row next to the Cards/Flow/Timeline switch (which lives
  // there permanently, see editor.html) — same reparent-not-clone pattern
  // openChartView() uses, keeps listeners/state intact rather than
  // duplicating them. Reversed in _closeTimelineViewImpl(). Zoom goes last so
  // it always ends up next to whichever of Thread/Chronology-Narrative is
  // actually visible (the other one is display:none, not removed).
  const menuCenter = document.getElementById('menu-center');
  menuCenter.appendChild(document.getElementById('tl-axis-switch'));
  menuCenter.appendChild(document.getElementById('tl-braid-mode-switch'));
  menuCenter.appendChild(document.getElementById('tl-thread-wrap'));
  menuCenter.appendChild(document.getElementById('tl-zoom-ctl'));
  updateViewToggleUI();
  updateMenuForMode();
  updateViewMenuActiveStates();
  renderTimeline();
}
function _closeTimelineViewImpl() {
  timelineMode = false;
  document.body.classList.remove('tl-mode');
  document.getElementById('timeline-host').style.display = 'none';
  document.getElementById('sbscrl').style.display = '';
  // Move the Timeline-only selectors back to their home in #tl-chron-hdr,
  // ahead of #tl-status, restoring their original left-to-right order.
  const chronHdr = document.getElementById('tl-chron-hdr');
  const tlStatus = document.getElementById('tl-status');
  chronHdr.insertBefore(document.getElementById('tl-axis-switch'), tlStatus);
  chronHdr.insertBefore(document.getElementById('tl-braid-mode-switch'), tlStatus);
  chronHdr.insertBefore(document.getElementById('tl-thread-wrap'), tlStatus);
  chronHdr.insertBefore(document.getElementById('tl-zoom-ctl'), tlStatus);
  if (_tlFormEditHome) {
    const form = document.getElementById('form-edit');
    form.style.display = 'none';
    if (_tlFormEditHome.next) _tlFormEditHome.parent.insertBefore(form, _tlFormEditHome.next);
    else _tlFormEditHome.parent.appendChild(form);
  }
  if (_tlFormNewHome) {
    const formNew = document.getElementById('form-new');
    if (_tlFormNewHome.next) _tlFormNewHome.parent.insertBefore(formNew, _tlFormNewHome.next);
    else _tlFormNewHome.parent.appendChild(formNew);
  }
  // Timeline may have left these disabled (clean-form state) — board's own
  // Edit Scene form never sets this attribute, so nothing else clears it.
  document.getElementById('canceledit').disabled = false;
  document.getElementById('saveedit').disabled = false;
  cancelEdit();
  updateViewToggleUI();
  updateMenuForMode();
  updateViewMenuActiveStates();
  renderBoard();
}
function updateViewMenuActiveStates() {
  const boardBtn = document.getElementById('menu-view-board');
  const chartBtn = document.getElementById('menu-view-chart');
  const tlBtn = document.getElementById('menu-view-timeline');
  const isChart = typeof chartMode !== 'undefined' && chartMode;
  if (boardBtn) boardBtn.disabled = !isChart && !timelineMode;
  if (chartBtn) chartBtn.disabled = isChart;
  if (tlBtn) tlBtn.disabled = timelineMode;
}
// Cards/Snake/Circle/Timeline read as one 4-way switch (see #view-toggle).
function updateViewToggleUI() {
  const cardsOn = !timelineMode && !(typeof chartMode !== 'undefined' && chartMode);
  document.getElementById('chart-type-cards').classList.toggle('on', cardsOn);
  document.getElementById('chart-type-snake').classList.toggle('on', !timelineMode && typeof chartMode !== 'undefined' && chartMode && chartType === 'snake');
  document.getElementById('chart-type-circle').classList.toggle('on', !timelineMode && typeof chartMode !== 'undefined' && chartMode && chartType === 'circle');
  document.getElementById('tl-view-loom').classList.toggle('on', timelineMode && !tlBraidMode);
  document.getElementById('tl-view-path').classList.toggle('on', timelineMode && tlBraidMode);
}

// Strip (chron strip + manuscript ribbon + wires) vs. Braid (read-only structure
// chart, §9.5) — a toggle nested inside Timeline view, not a 5th top-level view mode.
// Axis toggle and thread picker don't apply in Braid (per spec) and are hidden while
// it's active.
function setTlViewMode(mode) {
  tlBraidMode = (mode === 'braid');
  document.getElementById('tl-stage').classList.toggle('tl-braid-active', tlBraidMode);
  updateViewToggleUI();
  const axisSwitch = document.getElementById('tl-axis-switch');
  const threadWrap = document.getElementById('tl-thread-wrap');
  const braidModeSwitch = document.getElementById('tl-braid-mode-switch');
  if (axisSwitch) axisSwitch.style.display = tlBraidMode ? 'none' : '';
  if (threadWrap) threadWrap.style.display = tlBraidMode ? 'none' : '';
  if (braidModeSwitch) braidModeSwitch.style.display = tlBraidMode ? '' : 'none';
  renderTimeline();
}
// Narrative (today's reading-order × chronology braid, unchanged) vs.
// Chronology (same braid, axes swapped: columns walk chronological order —
// merging scenes that share an exact anchor into one column — and rows are
// each scene's reading-order rank instead). Nested inside Braid the same way
// Braid itself nests inside Timeline; resets alongside tlBraidMode.
function setTlBraidChronMode(chron) {
  tlBraidChronMode = !!chron;
  document.querySelectorAll('#tl-braid-mode-switch .tl-axis-btn').forEach(b => {
    b.classList.toggle('on', (b.dataset.braidMode === 'chronology') === tlBraidChronMode);
  });
  renderTimeline();
}
// Loom/Path buttons live in the shared #view-toggle bar now (top of every
// view), so clicking either one must also open Timeline mode first if it
// isn't already active — mirrors charts.js's setChartType()'s own
// already-open-vs-not branch.
function setTlViewFromToggle(mode) {
  if (timelineMode) { setTlViewMode(mode); }
  else { runWithDiscardGuard(() => { _openTimelineViewImpl(); setTlViewMode(mode); }); }
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
  // Inverse of the above — Inspector is Timeline's own panel, so this only
  // makes sense while Timeline mode is active.
  const inspectorToggle = document.getElementById('menu-show-inspector');
  if (inspectorToggle) inspectorToggle.disabled = !timelineMode;
}
function updateTlPanelMenuState() {
  const el = document.getElementById('menu-insp-text');
  if (!el) return;
  const panel = document.getElementById('tl-panel');
  const collapsed = panel && panel.classList.contains('collapsed');
  el.textContent = collapsed ? 'Show Inspector Panel' : 'Hide Inspector Panel';
}

// ── RENDER PIPELINE ────────────────────────────────────────────────────────────
function renderTimeline() {
  if (!timelineMode) return;
  renderStorylineLanes();
  renderChronStrip();
  renderManuscriptRibbon();
  redrawWires();
  renderBraid();
  renderThreadPicker();
  updateAxisAvailability();
  const zoomEl = document.getElementById('tl-zoom');
  if (zoomEl && document.activeElement !== zoomEl) zoomEl.value = S.timelinePrefs.zoomPos;
  document.querySelectorAll('#tl-axis-switch .tl-axis-btn').forEach(b => {
    b.classList.toggle('on', b.dataset.axis === S.timelinePrefs.axis);
  });
  if (typeof renderConflictsBadge === 'function') renderConflictsBadge();
  tlUpdateScrollArrows();
}

// ── ZOOM (§7.6) ────────────────────────────────────────────────────────────────
// The slider is a 0-100 position, not a literal pixel value: 0 is "fit every
// scene into the current width with no overlap and no scroll" (recomputed live
// against the actual container width/scene count, so it stays fit-to-window
// across resizes and scene add/delete), 50 is the feature's original fixed
// minimum (70px/scene), and 100 is the original fixed maximum (200px/scene) —
// so anyone used to the old 70-200 range sees identical density in the upper
// half of the slider.
const TL_ZOOM_MID_PX = 70, TL_ZOOM_MAX_PX = 200;
// TL_PITCH_FLOOR_PX: not a "readable card" floor — a purely technical one, just
// enough to keep a pitch/width declaration meaningful (never 0 or negative) for
// a pathological scene count. Previously floored at 38px (a fixed "readable
// card" minimum), which sounds reasonable but actually broke the fit-to-window
// promise at position 0: with enough scenes that true fit needs tighter than
// 38px/scene (e.g. ~89 scenes in a ~1200px container needs ~12.6px),
// tlZoomFitPx() silently clamped back up to 38px, chronTrackWidth() then
// exceeded the container width, and "fit everything, no scroll" quietly
// became "scroll anyway" — the exact thing this setting exists to avoid.
// cardW below (tlLoomCardW()) still caps card width at its own pitch (not at
// this floor), so cards shrink right along with the pitch instead of
// overlapping once real fit needs to go below 38px.
const TL_PITCH_FLOOR_PX = 2;
function tlZoomFitPx() {
  const scroll = document.getElementById('tl-chron-scroll');
  const n = (S.chronOrder && S.chronOrder.length) || 1;
  const containerW = (scroll && scroll.clientWidth) || 800;
  const PADDING = 80;
  return Math.max(TL_PITCH_FLOOR_PX, (containerW - PADDING) / n);
}
// Card width from a given pitch (pxPerScene) — always kept within that pitch
// (minus a small gap) rather than floored at a fixed "readable" minimum, so a
// tight fit-to-window pitch shrinks cards right along with it instead of the
// card staying wider than its own slot and overlapping its neighbors.
function tlLoomCardW(pxPerScene, gap, cap) {
  const w = Math.max(TL_PITCH_FLOOR_PX, pxPerScene - gap);
  return cap ? Math.min(cap, w) : w;
}
// .tl-scene/.tl-ms-card's CSS padding (7px sides) + border (1px sides) is a
// SECOND, independent floor that tlLoomCardW() alone doesn't clear: with
// box-sizing:border-box, a declared width smaller than padding+border simply
// can't render smaller than that sum — the box model clamps it, silently
// widening cards back out past their pitch (and, for the flex-laid-out
// manuscript ribbon, back out past the container) exactly like the old fixed
// width floor did. Scales padding down together with width below the
// full-padding threshold so cards keep shrinking in lockstep with a tight
// fit-to-window pitch instead of bottoming out around ~16px regardless of
// what width was requested. Border (1px/3px accent) is left alone — it only
// contributes ~2px on top, small enough not to meaningfully block fitting a
// realistic scene count, and touching it would also flatten the storyline-
// color accent stripe that makes each card recognizable at a glance.
const TL_CARD_FULL_PAD = { top: 5, side: 7, bottom: 4 };
function tlApplyCardWidth(el, cardW) {
  el.style.width = cardW + 'px';
  const floor = TL_CARD_FULL_PAD.side * 2;
  const scale = Math.max(0, Math.min(1, cardW / floor));
  el.style.padding = (TL_CARD_FULL_PAD.top * scale).toFixed(2) + 'px '
    + (TL_CARD_FULL_PAD.side * scale).toFixed(2) + 'px '
    + (TL_CARD_FULL_PAD.bottom * scale).toFixed(2) + 'px';
}
function tlZoomSliderToPx(pos) {
  const fitPx = tlZoomFitPx();
  if (pos <= 50) return fitPx + (pos / 50) * (TL_ZOOM_MID_PX - fitPx);
  return TL_ZOOM_MID_PX + ((pos - 50) / 50) * (TL_ZOOM_MAX_PX - TL_ZOOM_MID_PX);
}
function tlCurrentPxPerScene() {
  return tlZoomSliderToPx(S.timelinePrefs.zoomPos);
}

// Braid's own version of the same zoom mapping — same shared slider
// (S.timelinePrefs.zoomPos), same 0=fit/50=default/100=max shape, just against
// Braid's own container and column count instead of the chron strip's.
const BRAID_ZOOM_MID_DX = 93, BRAID_ZOOM_MAX_DX = 200;
// BRAID_NODE_FULL_R: node circle radius at a comfortable column spacing.
// braidNodeR() below scales it down as columns pack tighter than that, so a
// high scene count's true fit-to-window spacing doesn't leave neighboring
// nodes overlapping — same fix as tlLoomCardW() on the Loom side, applied to
// a radius instead of a width.
const BRAID_NODE_FULL_R = 11, BRAID_NODE_MIN_R = 3;
function braidNodeR(dx) {
  return Math.max(BRAID_NODE_MIN_R, Math.min(BRAID_NODE_FULL_R, dx / 2 - 2));
}
function tlBraidZoomFitDx(colCount) {
  const scroll = document.getElementById('tl-braid-scroll');
  const containerW = (scroll && scroll.clientWidth) || 800;
  // Matches renderBraid()'s own contentW formula exactly (braidColX(n-1) +
  // BRAID_RIGHT_PAD) so fitDx produces contentW === containerW precisely,
  // not just approximately. No fixed floor (previously 40px) — that silently
  // widened columns back out past the container once a high scene count's
  // true fit-to-window spacing needed tighter than 40px, same bug as
  // tlZoomFitPx() had on the Loom side. TL_PITCH_FLOOR_PX is purely
  // technical (never 0/negative), not a readability floor.
  const usable = containerW - BRAID_COL_X0 - BRAID_RIGHT_PAD;
  const gaps = Math.max(1, colCount - 1);
  return Math.max(TL_PITCH_FLOOR_PX, usable / gaps);
}
function tlBraidColDx(colCount) {
  const pos = S.timelinePrefs.zoomPos;
  const fitDx = tlBraidZoomFitDx(colCount);
  if (pos <= 50) return fitDx + (pos / 50) * (BRAID_ZOOM_MID_DX - fitDx);
  return BRAID_ZOOM_MID_DX + ((pos - 50) / 50) * (BRAID_ZOOM_MAX_DX - BRAID_ZOOM_MID_DX);
}

function chronTrackWidth(trackEl) {
  const scrollEl = trackEl.parentElement;
  const containerW = (scrollEl && scrollEl.clientWidth) || trackEl.clientWidth || 0;
  const n = (S.chronOrder && S.chronOrder.length) || 0;
  const pxPerScene = tlCurrentPxPerScene();
  const PADDING = 80;
  return Math.max(containerW, n * pxPerScene + PADDING);
}

function renderStorylineLanes() {
  const laneScroll = document.getElementById('tl-lane-scroll');
  laneScroll.querySelectorAll('.tl-lane-label').forEach(el => el.remove());
  const laneH = 92;
  S.storylines.forEach((st, i) => {
    const count = S.scenes.filter(s => s.storylineId === st.id).length;
    const label = document.createElement('div');
    label.className = 'tl-lane-label';
    label.style.height = laneH + 'px';
    label.style.setProperty('--lane-c', slColor(st.paletteIndex));
    label.dataset.storylineId = st.id;
    label.dataset.idx = i;
    const handle = document.createElement('span'); handle.className = 'tl-lane-handle'; handle.textContent = '⠿'; handle.title = 'Drag to reorder storylines';
    handle.addEventListener('mousedown', e => startStorylineDrag(e, i));
    const sw = document.createElement('span'); sw.className = 'tl-sw'; sw.style.background = slColor(st.paletteIndex);
    const nameWrap = document.createElement('span'); nameWrap.className = 'tl-lane-name'; nameWrap.textContent = st.name;
    nameWrap.title = 'Click to rename';
    nameWrap.addEventListener('click', e => { e.stopPropagation(); startStorylineRename(label, st.id); });
    const countEl = document.createElement('i'); countEl.textContent = count + (count === 1 ? ' scene' : ' scenes');
    const delBtn = document.createElement('button'); delBtn.className = 'tl-lane-del'; delBtn.textContent = '×'; delBtn.title = 'Delete storyline';
    delBtn.addEventListener('click', e => { e.stopPropagation(); deleteStoryline(st.id); });
    label.appendChild(handle); label.appendChild(sw); label.appendChild(nameWrap); label.appendChild(countEl); label.appendChild(delBtn);
    laneScroll.appendChild(label);
  });
  tlSyncLaneScroll();
}

// ── STORYLINE LANE DRAG (reorder, Loom view) ──────────────────────────────────
// Mirrors editor.js's sld (Section list drag)/ld (Library item drag): a plain
// {on, fromIdx, dropIdx, before} state, a drag-handle mousedown to start, and
// global mousemove/mouseup (wired below, alongside the chron/manuscript/braid
// drag checks) to drive it. Purely cosmetic — reordering S.storylines only
// changes which row a storyline's lane appears in, never any scene's own
// data — so unlike every other Timeline drag it does NOT need the move-
// confirmation flow scene drags use; it's instant and undo-able, same as
// reordering Sections.
const tlLaneDrag = { on: false, fromIdx: null, dropIdx: null, before: true };
function startStorylineDrag(e, idx) {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  tlLaneDrag.on = true; tlLaneDrag.fromIdx = idx; tlLaneDrag.dropIdx = null;
}
function moveStorylineDrag(e) {
  const laneScroll = document.getElementById('tl-lane-scroll'); if (!laneScroll) return;
  const items = [...laneScroll.querySelectorAll('.tl-lane-label')];
  items.forEach(i => i.classList.remove('dib', 'dia', 'dg'));
  const fromEl = items.find(i => +i.dataset.idx === tlLaneDrag.fromIdx);
  if (fromEl) fromEl.classList.add('dg');
  let ni = null, nb = true;
  for (const item of items) {
    if (+item.dataset.idx === tlLaneDrag.fromIdx) continue;
    const r = item.getBoundingClientRect();
    if (e.clientY >= r.top && e.clientY <= r.bottom) { ni = +item.dataset.idx; nb = e.clientY < r.top + r.height / 2; break; }
  }
  if (ni !== null) { const tgt = items.find(i => +i.dataset.idx === ni); if (tgt) tgt.classList.add(nb ? 'dib' : 'dia'); }
  tlLaneDrag.dropIdx = ni; tlLaneDrag.before = nb;
}
function endStorylineDrag() {
  const laneScroll = document.getElementById('tl-lane-scroll');
  if (laneScroll) laneScroll.querySelectorAll('.tl-lane-label').forEach(i => i.classList.remove('dib', 'dia', 'dg'));
  if (tlLaneDrag.dropIdx !== null && tlLaneDrag.dropIdx !== tlLaneDrag.fromIdx) {
    pushHistory('Reorder storylines');
    const arr = S.storylines;
    const [item] = arr.splice(tlLaneDrag.fromIdx, 1);
    let ti = tlLaneDrag.dropIdx > tlLaneDrag.fromIdx ? tlLaneDrag.dropIdx - 1 : tlLaneDrag.dropIdx;
    if (!tlLaneDrag.before) ti++;
    arr.splice(ti, 0, item);
    recordDataEdit();
    saveState();
    renderTimeline();
    if (typeof refreshNewSceneStorylineField === 'function') refreshNewSceneStorylineField();
  }
  tlLaneDrag.on = false; tlLaneDrag.fromIdx = null; tlLaneDrag.dropIdx = null;
}

// Mirrors #tl-lane-scroll's scrollTop onto #tl-track via a matching
// translateY, so the card rows track the lane labels 1:1 as the labels
// column scrolls — #tl-track itself stays un-scrollable (#tl-chron-scroll
// keeps overflow-y:hidden, its native scrollbar already repurposed for
// horizontal paging), it just visually follows the one real scrollbar on the
// labels side. clientHeight can be 0 on the very first paint before layout
// has run once (e.g. right after switching into Timeline view), so this is
// re-called after every lane/scene render rather than wired once.
function tlSyncLaneScroll() {
  const laneScroll = document.getElementById('tl-lane-scroll');
  const track = document.getElementById('tl-track');
  if (!laneScroll || !track) return;
  track.style.transform = 'translateY(-' + laneScroll.scrollTop + 'px)';
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
  if (typeof refreshNewSceneStorylineField === 'function') refreshNewSceneStorylineField();
}
function renameStoryline(id, name) {
  const st = S.storylines.find(x => x.id === id); if (!st) return;
  name = name.trim();
  if (!name || name === st.name) { renderStorylineLanes(); renderChronStrip(); return; }
  pushHistory('Rename storyline to "' + truncStr(name, 22) + '"');
  st.name = name;
  recordDataEdit(); saveState();
  renderTimeline();
  if (typeof refreshNewSceneStorylineField === 'function') refreshNewSceneStorylineField();
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
  if (typeof refreshNewSceneStorylineField === 'function') refreshNewSceneStorylineField();
}

function renderChronStrip() {
  const track = document.getElementById('tl-track');
  if (!track) return;
  // A card mid-hover can get torn out and rebuilt by this render (zoom
  // change, undo, live edit elsewhere) without its mouseleave ever firing —
  // the callout would otherwise linger, anchored to a now-detached element.
  clearTimeout(_tlCalloutTimer); tlHideCallout();
  track.querySelectorAll('.tl-scene, .tl-lane-row, #tl-thread-svg, .tl-markers-layer').forEach(el => el.remove());

  const laneCount = S.storylines.length || 1;
  // Was a flat 96px regardless of zoom — at the auto-fit low end of the zoom
  // slider that let fixed-width cards overlap even though their pitch had
  // shrunk below it. Capped at 96 (today's look, unchanged down to
  // ~pxPerScene 106); shrinks with the pitch past that (tlLoomCardW(), no
  // fixed floor) so a high scene count's true fit-to-window pitch isn't
  // silently widened back out past the container.
  const laneH = 92, cardW = tlLoomCardW(tlCurrentPxPerScene(), 10, 96);
  // min-height (not height) so a short lane list still stretches to fill
  // #tl-chron-scroll via CSS height:100% (which now grows with the box, see
  // styles.css #tl-chron-body flex:1 1 auto); a lane list taller than that
  // just forces track past 100% and out of view, revealed by scrolling
  // #tl-lane-labels — tlSyncLaneScroll() mirrors that scroll onto #tl-track
  // via translateY so the two stay in lockstep (each lane is still
  // positioned identically at i*laneH in both).
  track.style.minHeight = (laneCount * laneH) + 'px';
  track.style.width = chronTrackWidth(track) + 'px';

  const laneIndex = new Map(S.storylines.map((st, i) => [st.id, i]));
  const storylineById = new Map(S.storylines.map(st => [st.id, st]));

  S.storylines.forEach((st, i) => {
    const row = document.createElement('div');
    row.className = 'tl-lane-row';
    row.style.top = (i * laneH) + 'px';
    row.style.height = laneH + 'px';
    row.style.setProperty('--lane-c', slColor(st.paletteIndex));
    row.dataset.storylineId = st.id;
    track.appendChild(row);
  });

  const threadSvg = document.createElementNS(SVGNS, 'svg');
  threadSvg.id = 'tl-thread-svg';
  threadSvg.style.position = 'absolute'; threadSvg.style.inset = '0';
  threadSvg.style.width = '100%'; threadSvg.style.height = '100%';
  threadSvg.setAttribute('width', chronTrackWidth(track));
  threadSvg.setAttribute('height', laneCount * laneH);
  // Above .tl-scene (z-index:2) so the trace line floats over the cards
  // instead of hiding behind them — pointer-events:none keeps it from
  // blocking card clicks/hover despite sitting on top visually.
  threadSvg.style.zIndex = '4'; threadSvg.style.pointerEvents = 'none';
  track.appendChild(threadSvg);

  const markersLayer = document.createElement('div');
  markersLayer.className = 'tl-markers-layer';
  // z-index:3, above .tl-scene's z-index:2 — otherwise a card sitting at a
  // marker's x-position (very likely, since markers commonly sit right before
  // the first scene of a new time period) fully hides the marker's label
  // behind its opaque background, since a stacking context's z-index is only
  // meaningful relative to its own children, not decided by them.
  markersLayer.style.cssText = 'position:absolute;inset:0;z-index:3;pointer-events:none';
  track.appendChild(markersLayer);

  const xMap = chronX(S.timelinePrefs.axis);

  S.scenes.forEach(s => {
    const x = xMap.get(s.id); if (x === undefined) return;
    const lane = laneIndex.get(s.storylineId); if (lane === undefined) return;

    const card = document.createElement('div');
    card.className = 'tl-scene' + (s.offscreen ? ' tl-offscreen' : '');
    card.dataset.sceneId = s.id;
    tlApplyCardWidth(card, cardW);
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
    card.appendChild(meta);
    if (s.offscreen) { const chip = document.createElement('div'); chip.className = 'tl-off-chip'; chip.textContent = 'Offscreen'; card.appendChild(chip); }

    const convDots = renderConvDots(s, storylineById);
    if (convDots) card.appendChild(convDots);

    tlWireCardHover(card, s.id);
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
  tlSyncLaneScroll();
}

function onChronCardDown(e, sceneId) {
  if (e.button !== 0) return;
  clearTimeout(_tlCalloutTimer); tlHideCallout();
  _tlDrag = { zone: 'chron', sceneId, active: false, startX: e.clientX, startY: e.clientY, ghostEl: null, insertLineEl: null, targetBeforeId: undefined, targetStorylineId: null };
}

function onBraidNodeDown(e, ids) {
  if (e.button !== 0) return;
  clearTimeout(_tlCalloutTimer); tlHideCallout();
  // ids: every scene in this column (>1 only for a merged Chronology-mode
  // node) — the whole group drags and reorders together as one unit.
  _tlDrag = { zone: 'braid', sceneId: ids[0], ids: ids.slice(), active: false, startX: e.clientX, startY: e.clientY, ghostEl: null, insertLineEl: null, targetBeforeId: undefined };
}

function onMsCardDown(e, sceneId) {
  if (e.button !== 0) return;
  clearTimeout(_tlCalloutTimer); tlHideCallout();
  _tlDrag = { zone: 'ms', sceneId, active: false, startX: e.clientX, startY: e.clientY, ghostEl: null, insertLineEl: null, targetBeforeId: undefined };
}

function renderManuscriptRibbon() {
  const row = document.getElementById('tl-ms-row');
  if (!row) return;
  row.innerHTML = '';
  const storylineById = new Map(S.storylines.map(st => [st.id, st]));
  // Offscreen scenes are never shown to the reader, so they have no place on
  // the Narrative row (reading order) — only the Chronology row (see
  // renderChronTrack above, which renders every scene unfiltered).
  const scenes = manuscriptOrder().filter(s => !s.offscreen);
  const numMap = buildSceneNumMap();
  const validSecIds = new Set(S.sections.map(s => s.id));

  let lastSecKey = undefined;
  scenes.forEach((s, i) => {
    const secKey = validSecIds.has(s.sectionId) ? s.sectionId : null;
    if (i === 0) {
      // The very first group never gets a divider (nothing precedes it to
      // divide from) — but it still needs its name shown, or the first
      // section's label never appears anywhere on the row at all. A
      // label-only marker (no dashed line) reuses the same .tl-sep-label
      // positioning as the real dividers below.
      const sec = S.sections.find(x => x.id === secKey);
      if (sec) {
        const lead = document.createElement('div'); lead.className = 'tl-sep-lead';
        const lbl = document.createElement('div'); lbl.className = 'tl-sep-label'; lbl.textContent = sec.name; lbl.style.color = sec.color || '';
        lead.appendChild(lbl);
        row.appendChild(lead);
      }
    } else if (secKey !== lastSecKey) {
      const sep = document.createElement('div'); sep.className = 'tl-sep';
      const sec = S.sections.find(x => x.id === secKey);
      if (sec) { const lbl = document.createElement('div'); lbl.className = 'tl-sep-label'; lbl.textContent = sec.name; lbl.style.color = sec.color || ''; sep.appendChild(lbl); }
      row.appendChild(sep);
    }
    lastSecKey = secKey;
    row.appendChild(buildRibbonCard(s, numMap.get(s.id) ?? 1, storylineById));
  });

  // No fixed floor (tlLoomCardW()) — a flat floor here would keep forcing
  // ribbon cards wider than the actual pitch once a high scene count's
  // fit-to-window pitch drops below it, defeating the fit.
  const cardW = tlLoomCardW(tlCurrentPxPerScene(), 14);
  row.querySelectorAll('.tl-ms-card').forEach(el => tlApplyCardWidth(el, cardW));
  // #tl-ms-row's CSS gap (8px, styles.css) is fixed-size same as the old card
  // width/padding floors were — irrelevant at normal density, but with
  // enough scenes it alone (n-1 gaps × 8px) can exceed the container even
  // once every card itself has shrunk to fit, so it scales down with cardW
  // too rather than silently reintroducing the overflow that just got fixed.
  row.style.gap = Math.min(8, cardW) + 'px';
}

function buildRibbonCard(s, num, storylineById) {
  // s is never offscreen here — renderManuscriptRibbon() already filters
  // offscreen scenes out before calling this.
  const card = document.createElement('div');
  card.className = 'tl-ms-card';
  card.dataset.sceneId = s.id;
  const st = storylineById.get(s.storylineId);
  card.style.setProperty('--c', st ? slColor(st.paletteIndex) : 'var(--acc)');
  if (s.id === tlSelectedId) card.classList.add('tl-sel');
  if (typeof getFlaggedSceneIds === 'function' && (getFlaggedSceneIds() || []).includes(s.id)) card.classList.add('tl-flag');
  if (typeof sceneHasWarning === 'function' && sceneHasWarning(s.id)) card.classList.add('tl-warn');

  const warnDot = document.createElement('div'); warnDot.className = 'tl-warn-dot'; card.appendChild(warnDot);
  const ch = document.createElement('div'); ch.className = 'tl-ch'; ch.textContent = 'Sc ' + num; card.appendChild(ch);
  const title = document.createElement('div'); title.className = 'tl-t'; title.textContent = s.title; card.appendChild(title);

  const convDots = renderConvDots(s, storylineById);
  if (convDots) card.appendChild(convDots);

  tlWireCardHover(card, s.id);
  card.addEventListener('click', e => {
    e.stopPropagation();
    if (_tlDragOccurred) { _tlDragOccurred = false; return; } // a drag just ended here
    tlSelectScene(s.id);
  });
  card.addEventListener('mousedown', e => onMsCardDown(e, s.id));
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

// The slider fires an 'input' event per pixel of drag — saveState() (a full
// project JSON.stringify plus a synchronous conflicts recompute via
// pruneDismissed) on every single tick would make dragging visibly stutter.
// The render stays synchronous (immediate visual feedback); only the actual
// persistence is debounced, same tradeoff scheduleTlRerender already makes
// for resize.
let _tlZoomSaveTimer = null;
function setTlZoom(pos) {
  pos = Math.max(0, Math.min(100, parseInt(pos, 10) || 0));
  S.timelinePrefs.zoomPos = pos;
  clearTimeout(_tlZoomSaveTimer);
  _tlZoomSaveTimer = setTimeout(saveState, 300);
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
  updateTlThreadSelActive();
}
function updateTlThreadSelActive() {
  const sel = document.getElementById('tl-thread-sel'); if (!sel) return;
  sel.classList.toggle('tl-thread-active', !!S.timelinePrefs.threadCharId);
}
function setTlThread(charIdStr) {
  const id = charIdStr ? parseInt(charIdStr, 10) : null;
  S.timelinePrefs.threadCharId = id;
  saveState();
  renderChronThread();
  updateTlThreadSelActive();
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
  // Thick and solid, but translucent — this line floats ABOVE the cards (see
  // the z-index bump on #tl-thread-svg in renderChronStrip()), so it needs to
  // stay see-through enough to read the card text underneath it. A literal
  // (not theme-var) very light red — the accent color is already
  // load-bearing elsewhere (selection, active controls).
  const THREAD_COLOR = '#e57373';
  const path = document.createElementNS(SVGNS, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', 'none');
  path.setAttribute('stroke', THREAD_COLOR); path.setAttribute('stroke-width', '5');
  path.setAttribute('opacity', '.32');
  svg.appendChild(path);
  pts.forEach(p => {
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', '11');
    c.setAttribute('fill', THREAD_COLOR); c.setAttribute('opacity', '.32');
    svg.appendChild(c);
  });
}

// ── CHRON STRIP DRAG (ported from ../Timeline/js/chron.js's _chronDrag family,
// schema v3 §6.5) — candidate/threshold-4px/active two-phase pattern, matching
// the mouse-event pattern editor.js already uses for board card drag. ────────
let _tlDrag = null; // null when not dragging
let _tlDragActive = false; // guards undo (editor.js keydown) and hover (highlightScene) mid-drag
let _tlDragOccurred = false; // suppresses the click that always follows a drag's mouseup

function isTlDragActive() { return !!(_tlDrag && _tlDrag.active); }
function cancelTlDrag() { if (_tlDrag) _tlDragCancel(); }

function _tlDragBegin(e) {
  const d = _tlDrag;
  d.active = true;
  _tlDragActive = true;
  clearHighlight(); // the mouseleave the drag itself triggers won't fire while dragActive guards it below

  if (d.zone === 'ms') { _tlMsDragBegin(d); return; }
  if (d.zone === 'braid') { _tlBraidDragBegin(d); return; }

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
}

function _tlMsDragBegin(d) {
  const row = document.getElementById('tl-ms-row');
  const srcEl = row.querySelector('.tl-ms-card[data-scene-id="' + d.sceneId + '"]');
  if (srcEl) srcEl.classList.add('tl-drag-source');

  const scene = S.scenes.find(x => x.id === d.sceneId);
  if (!scene) { _tlDragCancel(); return; }
  const st = S.storylines.find(x => x.id === scene.storylineId);

  const ghost = document.createElement('div');
  ghost.className = 'tl-ms-card tl-drag-ghost';
  ghost.style.width = '96px';
  ghost.style.setProperty('--c', st ? slColor(st.paletteIndex) : 'var(--acc)');
  const t = document.createElement('div'); t.className = 'tl-t'; t.textContent = scene.title;
  ghost.appendChild(t);
  row.appendChild(ghost);
  d.ghostEl = ghost;

  const line = document.createElement('div');
  line.className = 'tl-insert-line';
  line.style.display = 'none';
  row.appendChild(line);
  d.insertLineEl = line;
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
  if (d.zone === 'ms') { _tlMsDragMove(d, e); return; }
  if (d.zone === 'braid') { _tlBraidDragMove(d, e); return; }
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
    // True scale: there's no "slot" to snap to — the drop position itself is
    // interpreted as a date (see _tlDragFinish), so the indicator just
    // tracks the cursor directly, same idea as the Manuscript row's line but
    // continuous instead of snapping between two cards.
    d.targetBeforeId = undefined;
    d.targetXPct = Math.max(0, Math.min(100, (localX / trackRect.width) * 100));
    d.insertLineEl.style.left = localX + 'px';
    d.insertLineEl.style.display = '';
  }

  const laneStId = _tlLaneAtClientY(e.clientY);
  d.targetStorylineId = laneStId;
  document.querySelectorAll('.tl-lane-row').forEach(row => {
    row.classList.toggle('tl-drop-target', row.dataset.storylineId === laneStId);
  });
}

// Single row, no lanes — the reading-order equivalent of _tlFindDropBeforeId/
// _tlInsertionX above, just simpler (one axis, one track of cards).
function _tlMsFindDropBeforeId(localX, excludeId) {
  const row = document.getElementById('tl-ms-row');
  const cards = [...row.querySelectorAll('.tl-ms-card:not(.tl-drag-ghost)')];
  let best = null, bestX = Infinity;
  cards.forEach(el => {
    const id = el.dataset.sceneId;
    if (!id || id === excludeId) return;
    const r = el.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const cx = r.left + r.width / 2 - rowRect.left;
    if (cx >= localX && cx < bestX) { bestX = cx; best = id; }
  });
  return best; // null = insert at the end
}
function _tlMsInsertionX(row, rowRect, beforeId, excludeId) {
  if (beforeId) {
    const el = row.querySelector('.tl-ms-card[data-scene-id="' + beforeId + '"]');
    if (el) { const r = el.getBoundingClientRect(); return r.left - rowRect.left - 4; }
  }
  const cards = [...row.querySelectorAll('.tl-ms-card:not(.tl-drag-ghost)')];
  let maxRight = 0;
  cards.forEach(el => {
    if (el.dataset.sceneId === excludeId) return;
    const r = el.getBoundingClientRect();
    const rx = r.right - rowRect.left;
    if (rx > maxRight) maxRight = rx;
  });
  return maxRight + 4;
}
function _tlMsDragMove(d, e) {
  const row = document.getElementById('tl-ms-row');
  const rowRect = row.getBoundingClientRect();
  const localX = e.clientX - rowRect.left;
  const localY = e.clientY - rowRect.top;
  d.ghostEl.style.left = localX + 'px';
  d.ghostEl.style.top = localY + 'px';

  const beforeId = _tlMsFindDropBeforeId(localX, String(d.sceneId));
  d.targetBeforeId = beforeId;
  d.insertLineEl.style.left = _tlMsInsertionX(row, rowRect, beforeId, String(d.sceneId)) + 'px';
  d.insertLineEl.style.display = '';
}

function _tlDragCleanupVisual() {
  if (_tlDrag) {
    if (_tlDrag.ghostEl) _tlDrag.ghostEl.remove();
    if (_tlDrag.insertLineEl) _tlDrag.insertLineEl.remove();
    // querySelectorAll + remove-from-every-match, not querySelector's first
    // match — the same scene id exists simultaneously as a .tl-scene AND a
    // .tl-ms-card AND a .tl-braid-node (Loom/Path both stay in the DOM, just
    // CSS-hidden, whichever isn't the active sub-view), so a single-match
    // query can grab the wrong one and leave the real source element stuck
    // faded. Removing the class from every match is safe either way — it was
    // only ever added to the one that actually started the drag.
    document.querySelectorAll('.tl-scene[data-scene-id="' + _tlDrag.sceneId + '"], .tl-ms-card[data-scene-id="' + _tlDrag.sceneId + '"], .tl-braid-node[data-scene-id="' + _tlDrag.sceneId + '"]')
      .forEach(el => el.classList.remove('tl-drag-source'));
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
  if (d.zone === 'ms') { _tlMsDragFinish(d); return; }
  if (d.zone === 'braid') { _tlBraidDragFinish(d); return; }
  _tlDragCleanupVisual();
  _tlDragActive = false;
  _tlDrag = null;
  _tlDragOccurred = true; // suppress the click that follows this mouseup

  const scene = S.scenes.find(x => x.id === d.sceneId);
  if (!scene) return;

  let newChronOrder = null;
  let newAnchor = null;
  if (S.timelinePrefs.axis !== 'true' && d.targetBeforeId !== undefined) {
    const without = S.chronOrder.filter(id => id !== d.sceneId);
    const beforeIdNum = d.targetBeforeId ? parseInt(d.targetBeforeId, 10) : null;
    let idx = beforeIdNum !== null ? without.indexOf(beforeIdNum) : -1;
    if (idx === -1) idx = without.length;
    const candidate = without.slice();
    candidate.splice(idx, 0, d.sceneId);
    const same = candidate.length === S.chronOrder.length && candidate.every((id, i) => id === S.chronOrder[i]);
    if (!same) newChronOrder = candidate;
  } else if (S.timelinePrefs.axis === 'true' && d.targetXPct !== undefined) {
    // True scale: dropping a card is interpreted as re-dating it (x IS the
    // date axis here) rather than reordering — reorder chronOrder to match
    // so the two stay consistent (no anchor-vs-order contradiction from the
    // drag itself).
    const newTs = _tlXPercentToTs(d.targetXPct);
    if (newTs !== null) {
      const dateStr = _tlTsToDateStr(newTs);
      if (!scene.anchor || scene.anchor.date !== dateStr) {
        newAnchor = { date: dateStr, time: (scene.anchor && scene.anchor.time) || null };
        newChronOrder = _tlReorderChronForNewAnchor(d.sceneId, newTs);
      }
    }
  }

  const targetStorylineId = d.targetStorylineId ? parseInt(d.targetStorylineId, 10) : null;
  const relane = !!(targetStorylineId && targetStorylineId !== scene.storylineId);

  if (!newChronOrder && !newAnchor && !relane) return; // no-op drag: nothing moved, no commit

  // Nothing is committed yet — the real card was never actually moved during
  // the drag (only a ghost element tracked the cursor), so simply not
  // applying newChronOrder/newAnchor/relane below (Discard) leaves S and the
  // render exactly as they were, no extra cleanup needed.
  const label = newAnchor ? 'Move scene (date)' : (newChronOrder ? 'Move scene (time)' : 'Move scene (lane)');
  const kind = newAnchor ? ('to ' + fmtAnchor(newAnchor)) : (newChronOrder ? 'when it happens' : 'which storyline it belongs to');
  _tlPendingMove = {
    label,
    sceneId: scene.id,
    apply: () => {
      if (newAnchor) scene.anchor = newAnchor;
      if (newChronOrder) S.chronOrder = newChronOrder;
      if (relane) {
        scene.storylineId = targetStorylineId;
        // §2.5 invariant: alsoStorylineIds never contains storylineId.
        scene.alsoStorylineIds = (scene.alsoStorylineIds || []).filter(id => id !== targetStorylineId);
      }
    },
  };
  document.getElementById('tl-move-cfm-msg').textContent =
    'Save this move — changing "' + scene.title + '" (' + kind + ')?';
  document.getElementById('tl-move-cfm-modal').classList.add('open');
}

function _tlTsToDateStr(ts) {
  const dt = new Date(ts);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
// Repositions just the dragged scene within chronOrder to sit next to its
// new date's neighbors — walks the existing order (already expected to be
// date-consistent) rather than a full resort, so every other scene's
// relative position (including unanchored ones) is left untouched.
function _tlReorderChronForNewAnchor(sceneId, newTs) {
  const without = S.chronOrder.filter(id => id !== sceneId);
  let insertAt = without.length;
  for (let i = 0; i < without.length; i++) {
    const s = S.scenes.find(x => x.id === without[i]);
    const ts = s ? anchorTs(s.anchor) : null;
    if (ts !== null && ts > newTs) { insertAt = i; break; }
  }
  const candidate = without.slice();
  candidate.splice(insertAt, 0, sceneId);
  return candidate;
}

// Reorders S.scenes directly, exactly mirroring editor.js's board drag-reorder
// (endCardDrag) — manuscriptOrder()/buildSceneNumMap() derive reading order
// from S.scenes' own storage order grouped by sectionId, so that's the array
// that must actually move, not a separate "manuscript order" list.
function _tlMsDragFinish(d) {
  _tlDragCleanupVisual();
  _tlDragActive = false;
  _tlDrag = null;
  _tlDragOccurred = true;

  const scene = S.scenes.find(x => x.id === d.sceneId);
  if (!scene) return;
  if (d.targetBeforeId === undefined) return; // never moved over a valid drop position

  const without = S.scenes.filter(s => s.id !== d.sceneId);
  const beforeIdNum = d.targetBeforeId ? parseInt(d.targetBeforeId, 10) : null;
  let idx = beforeIdNum !== null ? without.findIndex(s => s.id === beforeIdNum) : -1;
  if (idx === -1) idx = without.length;

  let targetSectionId = scene.sectionId ?? null;
  if (S.sections.length) {
    const validSecIds = new Set(S.sections.map(s => s.id));
    if (beforeIdNum !== null) {
      const targetScene = without.find(s => s.id === beforeIdNum);
      targetSectionId = targetScene && validSecIds.has(targetScene.sectionId) ? targetScene.sectionId : null;
    } else {
      const lastScene = without[without.length - 1];
      targetSectionId = lastScene && validSecIds.has(lastScene.sectionId) ? lastScene.sectionId : null;
    }
  }

  const candidate = without.slice();
  candidate.splice(idx, 0, scene);
  const reordered = candidate.length === S.scenes.length && !candidate.every((s, i) => s === S.scenes[i]);
  const resectioned = S.sections.length && targetSectionId !== (scene.sectionId ?? null);
  if (!reordered && !resectioned) return; // no-op drag: nothing moved, no commit

  _tlPendingMove = {
    label: 'Reorder narrative',
    sceneId: scene.id,
    apply: () => {
      if (S.sections.length) scene.sectionId = targetSectionId;
      S.scenes = candidate;
    },
  };
  document.getElementById('tl-move-cfm-msg').textContent =
    'Save this move — changing "' + scene.title + '" (its place in reading order)?';
  document.getElementById('tl-move-cfm-modal').classList.add('open');
}

// ── BRAID DRAG (Path view node reorder) ─────────────────────────────────────
// Unlike the chron/ms zones above, a braid column's on-screen position is a
// pure formula (braidColX(i)) rather than something read off real card DOM
// rects, so there's no need for the _tlFindDropBeforeId-style "query real
// elements" approach — the drop target is computed directly from _braidColIds
// (the exact column list renderBraid() just drew) and cursor x alone.
function _tlBraidDragBegin(d) {
  const scroll = document.getElementById('tl-braid-scroll');
  document.querySelectorAll('.tl-braid-node[data-scene-id="' + d.sceneId + '"]').forEach(el => el.classList.add('tl-drag-source'));

  // Reuses .tl-ms-card's own box styling (padding/background/border-radius)
  // for the floating label — a braid node has no equivalent HTML card of its
  // own to clone, and this reads identically to the ms-row ghost already
  // used elsewhere in Timeline.
  const ghost = document.createElement('div');
  ghost.className = 'tl-ms-card tl-drag-ghost';
  ghost.style.width = 'auto';
  const titles = d.ids.map(id => { const s = S.scenes.find(x => x.id === id); return s ? s.title : ''; }).join(' / ');
  const t = document.createElement('div'); t.className = 'tl-t'; t.textContent = titles;
  ghost.appendChild(t);
  scroll.appendChild(ghost);
  d.ghostEl = ghost;

  const line = document.createElement('div');
  line.className = 'tl-insert-line';
  line.style.display = 'none';
  // Cached once here rather than re-read every _tlBraidDragMove() — reading
  // scrollHeight right after a style WRITE (the ghost's left/top, set first
  // thing in that function) forces a synchronous layout reflow, and doing
  // that on every single mousemove event during a drag is exactly the kind
  // of jank that makes a real drag feel like it "didn't take": the drop
  // position calc lags behind the cursor, so the user can release believing
  // they're over a new column while `targetBeforeId` is still catching up
  // to a stale/earlier one. The content height can't change mid-drag (no
  // render happens while dragging), so one read up front is exact for the
  // whole gesture, not just an approximation.
  d.insertLineHeight = scroll.scrollHeight;
  line.style.top = '0';
  line.style.height = d.insertLineHeight + 'px';
  scroll.appendChild(line);
  d.insertLineEl = line;
}

// Nearest column (by center x) at or past localX, excluding any column that
// shares a scene with the dragged group — returns that column's first scene
// id as the "insert before" target, or null for "insert at the end."
function _tlBraidFindDropBeforeId(localX, excludeIds) {
  let best = null, bestX = Infinity;
  _braidColIds.forEach((col, i) => {
    if (col.ids.some(id => excludeIds.includes(id))) return;
    const cx = braidColX(i);
    if (cx >= localX && cx < bestX) { bestX = cx; best = col.ids[0]; }
  });
  return best;
}
function _tlBraidInsertionX(beforeId, excludeIds) {
  if (beforeId !== null) {
    const i = _braidColIds.findIndex(col => col.ids[0] === beforeId);
    if (i !== -1) return braidColX(i) - _braidColDx / 2;
  }
  let maxX = 0;
  _braidColIds.forEach((col, i) => {
    if (col.ids.some(id => excludeIds.includes(id))) return;
    const x = braidColX(i);
    if (x > maxX) maxX = x;
  });
  return maxX + _braidColDx / 2;
}
function _tlBraidDragMove(d, e) {
  const scroll = document.getElementById('tl-braid-scroll');
  const scrollRect = scroll.getBoundingClientRect();
  const localX = e.clientX - scrollRect.left + scroll.scrollLeft;
  const localY = e.clientY - scrollRect.top + scroll.scrollTop;
  d.ghostEl.style.left = localX + 'px';
  d.ghostEl.style.top = localY + 'px';

  const beforeId = _tlBraidFindDropBeforeId(localX, d.ids);
  d.targetBeforeId = beforeId;
  d.insertLineEl.style.left = _tlBraidInsertionX(beforeId, d.ids) + 'px';
  d.insertLineEl.style.display = '';
}
// Narrative mode reorders S.scenes (mirrors _tlMsDragFinish exactly — a
// braid node is always a single scene there, no merge). Chronology mode
// reorders S.chronOrder, splicing every id in the dragged column back in as
// one contiguous block so a merged node's scenes stay adjacent (and thus
// still merge into one column) at their new position.
function _tlBraidDragFinish(d) {
  _tlDragCleanupVisual();
  _tlDragActive = false;
  _tlDrag = null;
  _tlDragOccurred = true;
  if (d.targetBeforeId === undefined) return; // never moved over a valid drop position

  if (tlBraidChronMode) {
    const without = S.chronOrder.filter(id => !d.ids.includes(id));
    let idx = d.targetBeforeId !== null ? without.indexOf(d.targetBeforeId) : -1;
    if (idx === -1) idx = without.length;
    const candidate = without.slice();
    candidate.splice(idx, 0, ...d.ids);
    const same = candidate.length === S.chronOrder.length && candidate.every((id, i) => id === S.chronOrder[i]);
    if (same) return;

    const scene = S.scenes.find(x => x.id === d.sceneId);
    const desc = d.ids.length > 1 ? 'these scenes' : ('"' + ((scene && scene.title) || '') + '"');
    _tlPendingMove = {
      label: 'Reorder chronology',
      sceneId: d.sceneId,
      apply: () => { S.chronOrder = candidate; },
    };
    document.getElementById('tl-move-cfm-msg').textContent =
      'Save this move — changing when ' + desc + ' happen' + (d.ids.length > 1 ? '' : 's') + ' in the story?';
    document.getElementById('tl-move-cfm-modal').classList.add('open');
  } else {
    const scene = S.scenes.find(x => x.id === d.sceneId);
    if (!scene) return;
    const without = S.scenes.filter(s => s.id !== d.sceneId);
    let idx = d.targetBeforeId !== null ? without.findIndex(s => s.id === d.targetBeforeId) : -1;
    if (idx === -1) idx = without.length;

    let targetSectionId = scene.sectionId ?? null;
    if (S.sections.length) {
      const validSecIds = new Set(S.sections.map(s => s.id));
      if (d.targetBeforeId !== null) {
        const targetScene = without.find(s => s.id === d.targetBeforeId);
        targetSectionId = targetScene && validSecIds.has(targetScene.sectionId) ? targetScene.sectionId : null;
      } else {
        const lastScene = without[without.length - 1];
        targetSectionId = lastScene && validSecIds.has(lastScene.sectionId) ? lastScene.sectionId : null;
      }
    }

    const candidate = without.slice();
    candidate.splice(idx, 0, scene);
    const reordered = candidate.length === S.scenes.length && !candidate.every((s, i) => s === S.scenes[i]);
    const resectioned = S.sections.length && targetSectionId !== (scene.sectionId ?? null);
    if (!reordered && !resectioned) return;

    _tlPendingMove = {
      label: 'Reorder narrative',
      sceneId: scene.id,
      apply: () => {
        if (S.sections.length) scene.sectionId = targetSectionId;
        S.scenes = candidate;
      },
    };
    document.getElementById('tl-move-cfm-msg').textContent =
      'Save this move — changing "' + scene.title + '" (its place in reading order)?';
    document.getElementById('tl-move-cfm-modal').classList.add('open');
  }
}

let _tlPendingMove = null;
function tlConfirmMoveSave() {
  if (!_tlPendingMove) return;
  const { apply, label, sceneId } = _tlPendingMove;
  closeTlMoveConfirm();
  pushHistory(label);
  apply();
  recordDataEdit();
  saveState();
  // If the moved scene is also the one currently open in the Inspector, its
  // form fields (storyline/anchor/section) are now stale against what apply()
  // just changed underneath them — isEditFormDirty() compares the live form
  // DOM against the scene's current data, so without this it would spuriously
  // report the form as dirty (Save/Cancel's disabled state was last computed
  // *before* the drag and never re-checked, so it stays wrongly greyed too),
  // and the very next scene-selection/tab-switch would hit the discard-guard
  // asking to keep or discard "changes" the user never actually made.
  // openEditMode() fully re-populates every field from the current data —
  // the same call _tlDoSelectScene() already makes for a fresh selection.
  if (S.editingId === sceneId) { openEditMode(sceneId); refreshTlSaveCancelState(); }
  renderTimeline();
}
function tlConfirmMoveDiscard() {
  closeTlMoveConfirm();
}
function closeTlMoveConfirm() {
  document.getElementById('tl-move-cfm-modal').classList.remove('open');
  _tlPendingMove = null;
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

// ── HOVER CALLOUT ─────────────────────────────────────────────────────────────
// Read-only "full card info" popover shown after a hover delay on any chron or
// manuscript card, at any zoom level — the point being that a card shrunk down
// for a tight fit-to-window zoom (tlApplyCardWidth()) still has its info
// reachable even though it's no longer legible at its rendered size.
const TL_CALLOUT_DELAY_MS = 400;
let _tlCalloutTimer = null;
let _tlCalloutEl = null;

// Shared by both card-creation sites (renderChronStrip, buildRibbonCard) so
// the hover-highlight wiring and the callout wiring can't drift apart between
// the two.
function tlWireCardHover(card, sceneId) {
  card.addEventListener('mouseenter', () => {
    highlightScene(sceneId, true);
    clearTimeout(_tlCalloutTimer);
    _tlCalloutTimer = setTimeout(() => tlShowCallout(sceneId, card), TL_CALLOUT_DELAY_MS);
  });
  card.addEventListener('mouseleave', () => {
    highlightScene(sceneId, false);
    clearTimeout(_tlCalloutTimer);
    tlHideCallout();
  });
}

function tlHideCallout() {
  if (_tlCalloutEl) { _tlCalloutEl.remove(); _tlCalloutEl = null; }
}

function tlShowCallout(sceneId, anchorEl) {
  const s = S.scenes.find(x => x.id === sceneId);
  // anchorEl.isConnected: the card can be gone by the time the delay fires
  // (a re-render mid-hover, e.g. from an undo or a live edit elsewhere).
  if (!s || !anchorEl.isConnected) return;
  tlHideCallout();

  const maps = buildLibMaps();
  const namesFor = (ids, key) => (ids || [])
    .map(id => { const e = maps[key] && maps[key].get(id); return e ? e.name : null; })
    .filter(Boolean);

  const pop = document.createElement('div');
  pop.className = 'tl-callout';

  if (s.offscreen) {
    const chip = document.createElement('div');
    chip.className = 'tl-callout-offscreen';
    chip.textContent = 'OFFSCREEN';
    pop.appendChild(chip);
  }

  const title = document.createElement('div');
  title.className = 'tl-callout-title';
  title.textContent = s.title || '(untitled scene)';
  pop.appendChild(title);

  const metaBits = [];
  const anchorStr = fmtAnchor(s.anchor);
  if (anchorStr) metaBits.push(anchorStr);
  const st = S.storylines.find(x => x.id === s.storylineId);
  if (st) metaBits.push(st.name + ' storyline');
  if (metaBits.length) {
    const meta = document.createElement('div');
    meta.className = 'tl-callout-meta';
    meta.textContent = metaBits.join(' · ');
    pop.appendChild(meta);
  }

  if (s.summary) {
    const summary = document.createElement('div');
    summary.className = 'tl-callout-summary';
    summary.textContent = s.summary;
    pop.appendChild(summary);
  }

  const povNames = namesFor(s.povs, 'povs');
  if (povNames.length) tlAppendCalloutRow(pop, 'POV', povNames.join(', '));
  const charNames = namesFor(s.characters, 'characters');
  if (charNames.length) tlAppendCalloutRow(pop, 'Characters', charNames.join(', '));
  const locNames = namesFor(s.locations, 'locations');
  if (locNames.length) tlAppendCalloutRow(pop, 'Locations', locNames.join(', '));

  document.body.appendChild(pop);
  _tlCalloutEl = pop;
  tlPositionCallout(pop, anchorEl);
}

function tlAppendCalloutRow(pop, label, text) {
  const row = document.createElement('div');
  row.className = 'tl-callout-row';
  const b = document.createElement('b');
  b.textContent = label + ': ';
  row.appendChild(b);
  row.appendChild(document.createTextNode(text));
  pop.appendChild(row);
}

function tlPositionCallout(pop, anchorEl) {
  const r = anchorEl.getBoundingClientRect();
  const pr = pop.getBoundingClientRect();
  let left = r.left + r.width / 2 - pr.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - pr.width - 8));
  // Above the card by default; flips below if there isn't room (e.g. a
  // manuscript-ribbon card near the top of the viewport).
  let top = r.top - pr.height - 8;
  if (top < 8) top = r.bottom + 8;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
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
  if (tlBraidMode) { svg.textContent = ''; return; } // Strip-only concern; Braid draws its own paths
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
    const isSelCard = tlSelectedId != null && String(s.id) === String(tlSelectedId);
    // Selection reuses hover's "heavy wire" treatment (same as isHi below) —
    // selecting a card should look like a pinned hover, not a separate style.
    const isHi = (hovering && String(s.id) === hoveredId) || isSelCard;
    let opacity = 0.5, width = 1.4;
    if (hovering) opacity = isHi ? 1 : 0.08;
    else if (isSelCard) opacity = 1;
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

// ── BRAID VIEW (§9.5) — structure chart, draggable to reorder ─────────────────
// Ported from ../Timeline/js/braid.js, adapted: SceneSetter's manuscriptOrder()
// includes offscreen scenes (ThruLine's msOrder never did), so the reading-order
// axis explicitly filters them out here; "dividers" become section boundaries
// (this app has sections instead of ThruLine's separate divider concept), colored
// by each section's own .color instead of one literal accent hex.
// Originally read-only; a later round (the Narrative/Chronology mode toggle,
// see tlBraidChronMode) generalized the single msOrder×chronOrder axis pair
// into a column/row abstraction (colIds/rowOf/rowCount below) so both axis
// assignments — and drag-to-reorder in either one — share one render path.
// BRAID_ROW_Y0 bumped 70 -> 120: a marker pinned before row 0 (the very
// first scene) draws BRAID_MARKER_LEAD_GAP above row 0, and needs enough
// clearance both from #tl-braid-top-bar (styles.css) — a position:sticky bar
// that paints opaque over the first 54px of the viewport, to hide scrolled-
// PAST content under the sticky axis labels; at scrollTop 0, "scrolled
// past" and "not yet scrolled to" are the same 0px, so a leading marker
// could render entirely behind it — and from row 0's own label. The first
// attempt at fixing this only clamped the marker's own Y up to clear the
// bar, which shrank its gap from row 0 down to a few px and traded one
// collision for another: with a wide marker label (pinned near the left
// edge, same as row 0's own column) the two labels overlapped instead,
// visually hiding row 0's title behind the marker's opaque label box —
// reported with a second screenshot. Padding out BRAID_ROW_Y0 itself instead
// gives the leading marker real breathing room on both sides at once,
// rather than fighting over a few px squeezed between two fixed points.
const BRAID_COL_X0 = 110, BRAID_ROW_Y0 = 120;
const BRAID_LEFT = 60, BRAID_RIGHT_PAD = 210, BRAID_LABEL_FLIP_ZONE = 160;
const BRAID_MIN_ROWH = 26, BRAID_MAX_ROWH = 52;
// Fixed, not rowH-scaled (unlike every other row gap) — at BRAID_MIN_ROWH a
// half-row gap alone (13px) isn't enough clearance from either the top bar
// or row 0's own label; a flat 40px is enough at every zoom level, and
// doesn't need to grow just because rowH does (row 0 itself already moves
// down with rowH via BRAID_ROW_Y0 + nothing — it's the anchor).
const BRAID_MARKER_LEAD_GAP = 40;
const BRAID_FLASHBACK_COLOR = { dark: '#e0a458', light: '#b07a35' };
// A merged (simultaneous-scenes) node has no single storyline to color by.
// Originally drew it in var(--acc) — every theme's accent turned out to sit
// close enough to one of STORYLINE_PALETTE's own hues (e.g. slate's #b07ef8
// accent next to the palette's #c065e8 purple storyline swatch) to read as
// the same color at circle size, exactly the ambiguity a legend swatch is
// supposed to prevent. Fixed with a dedicated, fully desaturated gray in
// each theme's bucket instead — the palette above is all fully-saturated
// hues, so a true gray can never sit close to any of them regardless of
// which storyline colors happen to be in use.
const BRAID_MERGED_COLOR = { dark: '#9aa3ad', light: '#6b6459' };
function braidMergedColor() {
  const theme = document.documentElement.dataset.theme || 'ivory';
  return BRAID_MERGED_COLOR[TL_DARK_THEMES.has(theme) ? 'dark' : 'light'];
}
// Recomputed once per renderBraid() call from the shared zoom slider
// (tlBraidColDx()) — module-level so braidColX() doesn't need every call site
// updated to thread a parameter through.
let _braidColDx = BRAID_ZOOM_MID_DX;

function braidColX(i) { return BRAID_COL_X0 + i * _braidColDx; }
function braidRowY(chronIndex, rowH) { return BRAID_ROW_Y0 + chronIndex * rowH; }
// Background-colored halo behind an SVG text element (paint-order:stroke
// draws the stroke UNDER the fill, unlike normal SVG stroke-on-top) — makes
// the glyphs opaque against whatever else is drawn behind them (gridlines,
// paths, era-marker lines), without needing a real background <rect> sized
// to a dynamically-measured bbox. var(--cbg) matches the node circle's own
// fill so the halo reads as "this label has a small opaque backing," not as
// an outlined-text effect.
function applyBraidLabelHalo(textEl) {
  textEl.style.paintOrder = 'stroke';
  textEl.style.stroke = 'var(--cbg)';
  textEl.style.strokeWidth = '3px';
  textEl.style.strokeLinejoin = 'round';
}

function renderBraidLegend() {
  const el = document.getElementById('tl-braid-legend');
  if (!el) return;
  el.textContent = '';
  S.storylines.forEach(st => {
    const item = document.createElement('span'); item.className = 'chart-legend-item';
    // A ring, not a filled dot — matches the node's own look (a colored
    // stroke around a --cbg fill, per §9.5), not the Flow Chart's bar swatch.
    const swatch = document.createElement('span'); swatch.className = 'tl-braid-legend-swatch'; swatch.style.borderColor = slColor(st.paletteIndex);
    const nameEl = document.createElement('span'); nameEl.className = 'chart-legend-name'; nameEl.textContent = st.name;
    item.appendChild(swatch); item.appendChild(nameEl);
    el.appendChild(item);
  });
}
// Appended to the legend built above, only in Chronology mode and only once
// at least one column actually merged two-or-more simultaneous scenes — a
// merged node has no single storyline color (see renderBraid's node loop), so
// it needs its own swatch explaining the neutral/accent ring it renders with.
function appendBraidMergedLegendEntry() {
  const el = document.getElementById('tl-braid-legend');
  if (!el) return;
  const item = document.createElement('span'); item.className = 'chart-legend-item';
  const swatch = document.createElement('span'); swatch.className = 'tl-braid-legend-swatch'; swatch.style.borderColor = braidMergedColor();
  const nameEl = document.createElement('span'); nameEl.className = 'chart-legend-name'; nameEl.textContent = 'Simultaneous scenes';
  item.appendChild(swatch); item.appendChild(nameEl);
  el.appendChild(item);
}

// Groups a chronological order (already filtered to on-screen scenes) into
// one column per exact-anchor match — ported from chronXOrdinal()'s own
// grouping (timeline.js:92), same "never collapse a repeated storyline into
// one slot" rule, just producing column {ids} objects instead of an x-percent
// map. Used only by Chronology mode; Narrative mode's columns are one scene
// each (msOrder), unchanged from before this mode existed.
function braidChronColumns(chronOrderIds, sceneById) {
  const groups = [];
  let current = null;
  chronOrderIds.forEach(id => {
    const scene = sceneById.get(id);
    const key = scene ? _tlAnchorKey(scene) : null;
    const lane = scene ? scene.storylineId : undefined;
    if (current && key !== null && key === current.key && !current.lanes.has(lane)) {
      current.ids.push(id);
      current.lanes.add(lane);
    } else {
      current = { key, lanes: new Set([lane]), ids: [id] };
      groups.push(current);
    }
  });
  return groups.map(g => ({ ids: g.ids }));
}

// Columns/rows the node loop and drag logic both read every render — kept
// module-level (not a local of renderBraid) so drag handlers, which fire
// between renders, can look up the exact same column list the visible chart
// was drawn from without recomputing it (and possibly disagreeing, e.g. mid-
// drag if S.chronOrder/S.scenes changes some other way).
let _braidColIds = []; // [{ids:[sceneId,...]}, ...] one entry per column, left to right

function renderBraid() {
  const scroll = document.getElementById('tl-braid-scroll');
  const svg = document.getElementById('tl-braid-svg');
  if (!scroll || !svg || !timelineMode) return;

  const msScenes = manuscriptOrder().filter(s => !s.offscreen);
  const msOrder = msScenes.map(s => s.id);
  const sceneById = new Map(S.scenes.map(s => [s.id, s]));
  // Raw, unfiltered — Chronology mode's own column axis uses this directly
  // (offscreen scenes get their own column there, same as Loom's Chronology
  // row). Narrative mode's row axis (chronIndex, below) derives a filtered
  // view from this instead of using it directly.
  const chronOrder = S.chronOrder || [];
  const N = msOrder.length;

  renderBraidLegend();

  const axisTopEl = document.querySelector('.tl-braid-axis-top');
  const axisLeftEl = document.querySelector('.tl-braid-axis-left span:first-child');
  if (axisTopEl) axisTopEl.textContent = tlBraidChronMode ? 'EVENTS →' : 'READING ORDER →';
  if (axisLeftEl) axisLeftEl.textContent = 'CHRONOLOGY';
  const watermarkEl = document.getElementById('tl-braid-watermark');
  if (watermarkEl) watermarkEl.textContent = tlBraidChronMode ? 'Chronology Order' : 'Narrative Order';
  tlBraidUpdateWatermark();

  svg.textContent = '';
  _braidColIds = [];
  if (!tlBraidMode) return;

  // Narrative-mode row lookup: every id in chronOrder maps to a row number on
  // an offscreen-filtered row axis, matching msOrder's own column axis
  // (which already excludes offscreen scenes) — an on-page scene gets its
  // real rank among on-page scenes; an offscreen scene gets the SAME rank
  // the next on-page scene after it gets. That fallback matters for markers
  // (below): an era marker anchored right before an offscreen scene still
  // resolves to a sensible row instead of vanishing, even though the
  // offscreen scene itself never becomes a column/node in Narrative mode.
  // (Building this on the raw, unfiltered chronOrder — not skipping
  // offscreen ids outright — is what fixes the old "skipped lines" bug: the
  // previous version ranked every scene including offscreen ones, so two
  // consecutive on-page scenes could land more than one row apart purely
  // because an invisible offscreen scene's rank sat between them.)
  const chronIndex = new Map();
  let visRank = 0;
  chronOrder.forEach(id => {
    const s = sceneById.get(id);
    chronIndex.set(id, visRank);
    if (s && !s.offscreen) visRank++;
  });

  // colIds: one entry per column, left to right. rowOf(col, i): a column's
  // row rank (0-based) — i is the column's own index in colIds, only used by
  // the Chronology branch. rowCount: number of distinct row slots (drives
  // rowH/gridlines).
  // Narrative mode: one scene per column (msOrder, offscreen already
  // excluded), row = the scene's own rank in chronological order (chronIndex
  // above) — an independent value from its column position, which is what
  // lets the connecting path show flashbacks (a later column with an earlier
  // row).
  // Chronology mode: one column per exact-anchor group, walking the RAW
  // chronOrder — offscreen scenes get their own column here (unlike every
  // other reading-order-based view, this is exactly where an offscreen scene
  // belongs: "when it happened," matching Loom's own Chronology row) — and
  // the row axis stays Chronology too, but here it's simply each column's
  // OWN position (row = i), not a second independent value. Column order and
  // row order are therefore the same sequence by construction: dragging a
  // node reorders S.chronOrder directly (same effect as Loom's own
  // Chronology-row drag, just in this view), and the resting chart is always
  // a monotonic southeast staircase — "regression" has no meaning on an axis
  // that only ever measures itself.
  let colIds, rowOf, rowCount;
  if (!tlBraidChronMode) {
    colIds = msOrder.map(id => ({ ids: [id] }));
    rowOf = col => chronIndex.get(col.ids[0]);
    rowCount = N;
  } else {
    colIds = braidChronColumns(chronOrder, sceneById);
    rowOf = (col, i) => i;
    rowCount = colIds.length;
  }
  _braidColIds = colIds;

  // Markers (below) need a scene-id -> row lookup too. Narrative mode's rows
  // ARE chronIndex, so it can reuse that map directly. Chronology mode's rows
  // are each column's own index (rowOf above) — NOT the same as chronIndex,
  // since colIds is filtered (offscreen excluded) and merged (2+ simultaneous
  // scenes collapse into one column), so its row count can be smaller than
  // chronIndex's raw range. Built once here from colIds so every id in a
  // merged column correctly maps to that column's single row.
  let markerRowIndex;
  if (!tlBraidChronMode) {
    markerRowIndex = chronIndex;
  } else {
    markerRowIndex = new Map();
    colIds.forEach((col, i) => col.ids.forEach(id => markerRowIndex.set(id, i)));
  }

  if (!colIds.length || rowCount < 1) {
    svg.setAttribute('width', scroll.clientWidth || 1);
    svg.setAttribute('height', scroll.clientHeight || 1);
    return;
  }

  _braidColDx = tlBraidColDx(colIds.length);

  const storylineById = new Map(S.storylines.map(st => [st.id, st]));
  const validSecIds = new Set(S.sections.map(s => s.id));

  const stageH = scroll.clientHeight || 400;
  let rowH = rowCount > 1 ? (stageH - 140) / (rowCount - 1) : BRAID_MAX_ROWH;
  rowH = Math.max(BRAID_MIN_ROWH, Math.min(BRAID_MAX_ROWH, rowH));

  const contentW = Math.max(scroll.clientWidth || 0, braidColX(colIds.length - 1) + BRAID_RIGHT_PAD);
  const contentH = Math.max(scroll.clientHeight || 0, braidRowY(rowCount - 1, rowH) + 60);
  const chartRight = braidColX(colIds.length - 1) + 110;

  // Explicit width/height ATTRIBUTES, not just CSS — an <svg> is a replaced
  // element and silently falls back to the 300x150 UA default without them
  // (same pitfall #tl-wires already works around).
  svg.setAttribute('width', contentW);
  svg.setAttribute('height', contentH);

  const theme = document.documentElement.dataset.theme || 'ivory';
  const flashbackColor = BRAID_FLASHBACK_COLOR[TL_DARK_THEMES.has(theme) ? 'dark' : 'light'];

  // ---- gridlines: one per row rank ----
  for (let r = 0; r < rowCount; r++) {
    const gl = document.createElementNS(SVGNS, 'line');
    gl.setAttribute('x1', BRAID_LEFT); gl.setAttribute('x2', chartRight);
    gl.setAttribute('y1', braidRowY(r, rowH)); gl.setAttribute('y2', braidRowY(r, rowH));
    gl.setAttribute('stroke-width', 1);
    gl.style.stroke = 'var(--s1)';
    svg.appendChild(gl);
  }

  // ---- axis labels ("READING ORDER →" / "CHRONOLOGY" + arrow): static HTML
  // in #tl-braid-axis-hud (editor.html), not the SVG — position:sticky pins
  // them to the top-left corner of #tl-braid-scroll's own viewport in BOTH
  // scroll directions at once, with no per-scroll recompute needed (unlike
  // the marker/section labels below, these never need to track a moving
  // target — they always belong in that one corner). Also gives them a real
  // opaque background (the old SVG <text> version had none, so gridlines/
  // paths could render visibly through the letters). Content is nailed down
  // in the HTML/CSS itself; nothing to build here every render. ----

  const numMap = buildSceneNumMap();

  // ---- markers (§7.4): dashed line in the SVG (scrolls normally); the label
  // lives in the HTML #tl-braid-markers-hud overlay instead, so it can stay
  // pinned to the viewport's left edge on horizontal scroll (see
  // tlBraidUpdateMarkerHud()) rather than disappearing off-screen. ----
  const markersLayer = document.createElementNS(SVGNS, 'g');
  svg.appendChild(markersLayer);
  const hud = document.getElementById('tl-braid-markers-hud');
  if (hud) { hud.textContent = ''; hud.style.height = contentH + 'px'; }
  // Markers are era pins on the Chronology axis, and Chronology is the row
  // (Y) axis in BOTH modes now — Narrative mode's row IS chronIndex;
  // Chronology mode's row is each column's own index, looked up via
  // markerRowIndex (built above) instead. Same horizontal-line rendering
  // works unchanged in both; only which row-lookup map feeds it differs.
  (S.markers || []).forEach(m => {
    let y;
    if (!m.beforeSceneId) {
      y = braidRowY(rowCount - 1, rowH) + rowH / 2;
    } else {
      const idx = markerRowIndex.get(m.beforeSceneId);
      if (idx === undefined) return;
      y = (idx === 0) ? braidRowY(0, rowH) - BRAID_MARKER_LEAD_GAP : (braidRowY(idx - 1, rowH) + braidRowY(idx, rowH)) / 2;
    }
    const line = document.createElementNS(SVGNS, 'line');
    line.setAttribute('x1', BRAID_LEFT); line.setAttribute('x2', chartRight);
    line.setAttribute('y1', y); line.setAttribute('y2', y);
    line.setAttribute('stroke-width', 1); line.setAttribute('stroke-dasharray', '5 4');
    line.style.stroke = 'var(--o0)';
    markersLayer.appendChild(line);

    if (hud) {
      const label = document.createElement('div');
      label.className = 'tl-braid-marker-label';
      label.style.top = (y - 12) + 'px';
      label.textContent = m.label;
      hud.appendChild(label);
    }
  });
  tlBraidUpdateMarkerHud();

  // ---- section boundaries (sections replace ThruLine's "dividers"): full-height
  // vertical dividers between the relevant reading-order columns, colored by
  // the section's own .color, dashed and behind the path/nodes layers (appended
  // before them) so they read as background structure, not foreground content.
  // Labels live in the HTML #tl-braid-section-hud overlay (same idea as the
  // marker labels' #tl-braid-markers-hud, opposite axis): a divider is a
  // full-height VERTICAL line, so its label should scroll normally along
  // with horizontal scroll (stay above its own divider) but get re-pinned
  // near the top on vertical scroll instead of scrolling away — see
  // tlBraidUpdateSectionHud(). The very first group (i===0) never gets a
  // divider tick (nothing precedes it to divide from) but still needs its
  // own label, same "lead" treatment renderManuscriptRibbon() gives the
  // Narrative row's first group. ----
  const dividersLayer = document.createElementNS(SVGNS, 'g');
  svg.appendChild(dividersLayer);
  const sectionHud = document.getElementById('tl-braid-section-hud');
  if (sectionHud) sectionHud.textContent = '';
  // Sections are a narrative-structure concept (a run of consecutive scenes
  // in reading order) — meaningless as contiguous column spans once the
  // column axis is chronological instead, so this whole block is Narrative-
  // mode-only; Chronology mode just leaves dividersLayer/sectionHud empty.
  if (!tlBraidChronMode) {
    let lastSecKey;
    msScenes.forEach((s, i) => {
      const secKey = validSecIds.has(s.sectionId) ? s.sectionId : null;
      if (i === 0) {
        const sec = S.sections.find(x => x.id === secKey);
        if (sec && sectionHud) {
          const label = document.createElement('div');
          label.className = 'tl-braid-section-label';
          label.style.left = braidColX(0) + 'px';
          label.style.borderLeftColor = sec.color || 'var(--acc)';
          label.textContent = sec.name;
          sectionHud.appendChild(label);
        }
      } else if (secKey !== lastSecKey) {
        const x = (braidColX(i - 1) + braidColX(i)) / 2;
        const sec = S.sections.find(x => x.id === secKey);
        const tick = document.createElementNS(SVGNS, 'line');
        tick.setAttribute('x1', x); tick.setAttribute('x2', x);
        tick.setAttribute('y1', 42); tick.setAttribute('y2', contentH - 16);
        tick.setAttribute('stroke-width', 1.5); tick.setAttribute('stroke-dasharray', '4 4');
        tick.style.stroke = (sec && sec.color) || 'var(--acc)';
        tick.style.opacity = '.55';
        dividersLayer.appendChild(tick);
        if (sec && sectionHud) {
          const label = document.createElement('div');
          label.className = 'tl-braid-section-label';
          label.style.left = (x + 6) + 'px';
          label.style.borderLeftColor = sec.color || 'var(--acc)';
          label.textContent = sec.name;
          sectionHud.appendChild(label);
        }
      }
      lastSecKey = secKey;
    });
  }
  if (sectionHud) { sectionHud.style.height = contentH + 'px'; tlBraidUpdateSectionHud(); }
  tlBraidUpdateAxisBars();

  // ---- path: cubic bezier per consecutive column pair, drawn before nodes ----
  const pathsLayer = document.createElementNS(SVGNS, 'g');
  svg.appendChild(pathsLayer);
  const pathEls = [];
  for (let i = 0; i < colIds.length - 1; i++) {
    const aCol = colIds[i], bCol = colIds[i + 1];
    const aId = aCol.ids[0], bId = bCol.ids[0];
    const aIdx = rowOf(aCol, i), bIdx = rowOf(bCol, i + 1);
    if (aIdx === undefined || bIdx === undefined) continue;
    const ax = braidColX(i), ay = braidRowY(aIdx, rowH);
    const bx = braidColX(i + 1), by = braidRowY(bIdx, rowH);
    const mx = (ax + bx) / 2;
    // Upward = backward on the row axis. Always false in Chronology mode —
    // bIdx is literally i+1 there (row = column's own index), so it can never
    // be less than aIdx's i.
    const isFlashback = bIdx < aIdx;
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', 'M ' + ax + ' ' + ay + ' C ' + mx + ' ' + ay + ', ' + mx + ' ' + by + ', ' + bx + ' ' + by);
    path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', 2.5);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('data-from', aId); path.setAttribute('data-to', bId);
    path.setAttribute('data-flash', isFlashback ? 'true' : 'false');
    if (isFlashback) {
      path.style.stroke = flashbackColor;
      path.setAttribute('stroke-dasharray', '7 5');
      path.setAttribute('opacity', 0.9);
    } else {
      path.style.stroke = 'var(--sub)';
      path.setAttribute('opacity', 0.55);
    }
    pathsLayer.appendChild(path);
    pathEls.push(path);
  }

  // ---- nodes + labels ----
  const nodesLayer = document.createElementNS(SVGNS, 'g');
  svg.appendChild(nodesLayer);

  const flagActive = typeof isFlagModeActive === 'function' && isFlagModeActive();
  const flaggedIds = flagActive && typeof getFlaggedSceneIds === 'function' ? (getFlaggedSceneIds() || []) : [];
  const nodeR = braidNodeR(_braidColDx);
  // The scene number doesn't shrink with the circle (fixed font-size:10) — at
  // some point it stops fitting inside the node at all, so it's dropped
  // rather than left spilling out past a tiny circle at extreme fit-to-window
  // zoom levels.
  const showNodeNum = nodeR >= 7;

  colIds.forEach((col, i) => {
    const ids = col.ids;
    const scenes = ids.map(id => sceneById.get(id)).filter(Boolean);
    if (!scenes.length) return;
    const idx = rowOf(col, i);
    if (idx === undefined) return;
    const x = braidColX(i), y = braidRowY(idx, rowH);
    // A merged node (2+ scenes sharing one exact anchor, Chronology mode
    // only) has no single storyline to color by — drawn in a dedicated
    // desaturated gray (braidMergedColor(), guaranteed distinct from every
    // storyline hue) instead, with a legend entry
    // (appendBraidMergedLegendEntry()) explaining it rather than picking one
    // member's color arbitrarily.
    const merged = scenes.length > 1;
    const st = !merged ? storylineById.get(scenes[0].storylineId) : null;
    const color = merged ? braidMergedColor() : (st ? slColor(st.paletteIndex) : 'var(--acc)');
    // The node's own identity for selection/hover/drag is its first scene —
    // simplest consistent choice for a merged node.
    const id = ids[0];

    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'tl-braid-node');
    g.dataset.sceneId = String(id);
    g.dataset.sceneIds = ids.join(',');
    if (String(id) === String(tlSelectedId)) g.classList.add('tl-sel');
    if (scenes.some(s => typeof sceneHasWarning === 'function' && sceneHasWarning(s.id))) g.classList.add('tl-warn');
    if (flagActive && scenes.some(s => flaggedIds.includes(s.id))) g.classList.add('tl-flag');
    // Only meaningful in Chronology mode (the only place an offscreen scene
    // gets a node here) — a dedicated merged-node color already applies when
    // scenes.length > 1, so this only ever fires for a lone offscreen scene.
    if (!merged && scenes[0].offscreen) g.classList.add('tl-offscreen');

    const circle = document.createElementNS(SVGNS, 'circle');
    circle.setAttribute('cx', x); circle.setAttribute('cy', y); circle.setAttribute('r', nodeR);
    circle.setAttribute('stroke-width', 3);
    circle.style.fill = 'var(--cbg)';
    circle.style.stroke = color;
    // Also set as `color` (not just `stroke`) so the .tl-sel selection glow
    // (styles.css, drop-shadow(currentColor)) matches this node's own
    // storyline color instead of a fixed accent — selection should look more
    // prominent, not recolored.
    circle.style.color = color;
    g.appendChild(circle);

    // Offscreen scenes have no display number (buildSceneNumMap skips them
    // entirely) — filtered out of the join rather than falling back to '?',
    // so a lone offscreen node shows no number at all (matching Loom's own
    // Chronology row, which never numbers offscreen cards either) and a
    // merged node mixing an offscreen scene with on-page ones just shows the
    // on-page number(s).
    const nodeNums = ids.map(sid => numMap.get(sid)).filter(n => n !== undefined).join('/');
    if (showNodeNum && nodeNums) {
      const num = document.createElementNS(SVGNS, 'text');
      num.setAttribute('x', x); num.setAttribute('y', y);
      num.setAttribute('font-size', 10); num.setAttribute('font-weight', 'bold'); num.setAttribute('text-anchor', 'middle');
      num.setAttribute('dominant-baseline', 'central'); num.setAttribute('pointer-events', 'none');
      num.style.fill = 'var(--tx)';
      num.textContent = nodeNums;
      g.appendChild(num);
    }

    if (g.classList.contains('tl-warn')) {
      // Offset/radius scale with nodeR (both fixed at 9/4 for the full-size
      // 11px node) so the badge stays pinned to the node's own edge instead
      // of floating past it once nodeR shrinks well below 11 at a tight fit.
      const warnScale = nodeR / BRAID_NODE_FULL_R;
      const warn = document.createElementNS(SVGNS, 'circle');
      warn.setAttribute('cx', x + 9 * warnScale); warn.setAttribute('cy', y - 9 * warnScale); warn.setAttribute('r', Math.max(2, 4 * warnScale));
      warn.setAttribute('stroke-width', 2); warn.setAttribute('pointer-events', 'none');
      warn.style.fill = 'var(--rd)';
      warn.style.stroke = 'var(--cbg)';
      g.appendChild(warn);
    }

    const lastColX = braidColX(colIds.length - 1);
    const flip = (lastColX - x) < BRAID_LABEL_FLIP_ZONE;
    const labelX = flip ? x - 18 : x + 18;
    const anchor = flip ? 'end' : 'start';

    const title = document.createElementNS(SVGNS, 'text');
    title.setAttribute('x', labelX); title.setAttribute('y', y - 2);
    title.setAttribute('font-size', 11); title.setAttribute('text-anchor', anchor); title.setAttribute('pointer-events', 'none');
    // A background-colored "halo" stroke behind the fill (paint-order:stroke)
    // knocks out anything drawn behind the glyphs — gridlines, the flashback/
    // connecting path, and especially era-marker lines, which at a tight
    // rowH (many scenes, low zoom) can land only a few px from a node's own
    // label and visibly cut through the letterforms otherwise (reported with
    // a screenshot: a marker line reading as struck through the node text it
    // sat just above). Cheap and correct at any zoom level — no per-marker
    // clearance math needed.
    applyBraidLabelHalo(title);
    title.style.fill = 'var(--tx)';
    title.textContent = scenes.map(s => s.title).join(' / ');
    g.appendChild(title);

    const timeLabel = document.createElementNS(SVGNS, 'text');
    timeLabel.setAttribute('x', labelX); timeLabel.setAttribute('y', y + 11);
    timeLabel.setAttribute('font-size', 9.5); timeLabel.setAttribute('text-anchor', anchor); timeLabel.setAttribute('pointer-events', 'none');
    applyBraidLabelHalo(timeLabel);
    timeLabel.style.fill = 'var(--sub)';
    timeLabel.textContent = (fmtAnchor(scenes[0].anchor) || '—') + (g.classList.contains('tl-offscreen') ? '  ·  Offscreen' : '');
    g.appendChild(timeLabel);

    g.style.cursor = 'pointer';
    g.addEventListener('mouseenter', () => { ids.forEach(sid => highlightScene(sid, true)); _tlBraidThickenPaths(pathEls, id, true); });
    g.addEventListener('mouseleave', () => { ids.forEach(sid => highlightScene(sid, false)); _tlBraidThickenPaths(pathEls, id, false); });
    g.addEventListener('click', e => {
      e.stopPropagation();
      if (_tlDragOccurred) { _tlDragOccurred = false; return; } // a drag just ended here
      tlSelectScene(id);
    });
    g.addEventListener('mousedown', e => onBraidNodeDown(e, ids));

    nodesLayer.appendChild(g);
  });

  if (tlBraidChronMode && colIds.some(c => c.ids.length > 1)) appendBraidMergedLegendEntry();
}

function _tlBraidThickenPaths(pathEls, sceneId, on) {
  pathEls.forEach(p => {
    const from = p.getAttribute('data-from'), to = p.getAttribute('data-to');
    if (String(from) !== String(sceneId) && String(to) !== String(sceneId)) return;
    if (on) {
      p.setAttribute('stroke-width', 4);
      p.setAttribute('opacity', 1);
    } else {
      const isFlash = p.getAttribute('data-flash') === 'true';
      p.setAttribute('stroke-width', 2.5);
      p.setAttribute('opacity', isFlash ? 0.9 : 0.55);
    }
  });
}

// Keeps each era-marker label pinned to the visible left edge of
// #tl-braid-scroll as the user scrolls horizontally — a plain CSS
// position:sticky is unreliable here since each label's parent is
// individually positioned (top:Ypx) rather than sitting in normal flow, so
// this recomputes the offset directly against the container's own scrollLeft.
function tlBraidUpdateMarkerHud() {
  const scroll = document.getElementById('tl-braid-scroll');
  const hud = document.getElementById('tl-braid-markers-hud');
  if (!scroll || !hud) return;
  // Pinned at BRAID_LEFT (where the dashed marker line itself starts), not
  // nearer the true edge (e.g. +12) — closer in used to land the label
  // directly on top of the rotated "CHRONOLOGY" axis label at scrollLeft:0,
  // since both sit in that same left margin.
  const left = scroll.scrollLeft + BRAID_LEFT + 4;
  hud.querySelectorAll('.tl-braid-marker-label').forEach(el => { el.style.left = left + 'px'; });
}

// Section labels are the opposite case from era-marker labels: their divider
// is a full-height VERTICAL line, so the label should track horizontal
// scroll normally (stay above its own divider, no compensation needed —
// each label's `left` is already set to its divider's real x) but needs
// re-pinning near the TOP on VERTICAL scroll, or it scrolls away with the
// rest of the chart's height exactly like the divider tick itself does.
// +38, not flush under #tl-braid-top-bar's own 30px height — leaves a small
// +30, not flush under the axis label's own row — leaves a small gap so the
// section label doesn't sit right on its heel. Still within
// #tl-braid-top-bar's own (taller, 54px) height, so both rows share one
// continuous opaque bar rather than the section-label row sitting in a gap
// below it where gridlines/paths could show through.
function tlBraidUpdateSectionHud() {
  const scroll = document.getElementById('tl-braid-scroll');
  const hud = document.getElementById('tl-braid-section-hud');
  if (!scroll || !hud) return;
  const top = scroll.scrollTop + 30;
  hud.querySelectorAll('.tl-braid-section-label').forEach(el => { el.style.top = top + 'px'; });
}

// Sizes the two opaque axis-margin bars to the scroll container's own
// visible (client) dimensions — not the wide/tall scrollable content — so
// they cover exactly the top/left margin regardless of how far the chart
// itself extends. clientWidth/clientHeight don't change on scroll, only on
// resize, but this is cheap enough to just call alongside the other HUD
// updates rather than wiring a separate resize-only path.
function tlBraidUpdateAxisBars() {
  const scroll = document.getElementById('tl-braid-scroll');
  const topBar = document.getElementById('tl-braid-top-bar');
  const leftBar = document.getElementById('tl-braid-left-bar');
  if (!scroll || !topBar || !leftBar) return;
  topBar.style.width = scroll.clientWidth + 'px';
  leftBar.style.height = scroll.clientHeight + 'px';
}

// Recentered on the container's own CURRENT viewport (scrollLeft/Top +
// half its client size), not a fixed point in the scrollable content — a
// watermark meant to always read as "which mode am I in" needs to stay
// visible no matter how far the user has scrolled, the same reasoning
// tlBraidUpdateMarkerHud() already applies to era-marker labels.
function tlBraidUpdateWatermark() {
  const scroll = document.getElementById('tl-braid-scroll');
  const wm = document.getElementById('tl-braid-watermark');
  if (!scroll || !wm) return;
  wm.style.left = (scroll.scrollLeft + scroll.clientWidth / 2) + 'px';
  wm.style.top = (scroll.scrollTop + scroll.clientHeight / 2) + 'px';
}

let _tlWiresRafPending = false;
function _tlOnStripScroll() {
  if (_tlWiresRafPending) return;
  _tlWiresRafPending = true;
  requestAnimationFrame(() => { _tlWiresRafPending = false; redrawWires(); tlUpdateScrollArrows(); });
}

// Small bubble scroll-arrow affordance (native scrollbar is hidden on these
// two rows) — shown only on whichever side there's actually more to see.
function tlUpdateScrollArrows() {
  _tlUpdateScrollArrowPair('tl-chron-scroll', 'tl-chron-arrow-left', 'tl-chron-arrow-right');
  _tlUpdateScrollArrowPair('tl-ms-scroll', 'tl-ms-arrow-left', 'tl-ms-arrow-right');
}
function _tlUpdateScrollArrowPair(scrollId, leftId, rightId) {
  const scroll = document.getElementById(scrollId);
  const left = document.getElementById(leftId);
  const right = document.getElementById(rightId);
  if (!scroll || !left || !right) return;
  const canScroll = scroll.scrollWidth - scroll.clientWidth > 1;
  left.classList.toggle('visible', canScroll && scroll.scrollLeft > 1);
  right.classList.toggle('visible', canScroll && scroll.scrollLeft < scroll.scrollWidth - scroll.clientWidth - 1);
}
function tlScrollByPage(scrollId, dir) {
  const scroll = document.getElementById(scrollId);
  if (!scroll) return;
  scroll.scrollBy({ left: dir * scroll.clientWidth * 0.8, behavior: 'smooth' });
}
function scrollTlCounterpartIntoView(sceneId) {
  _tlScrollCardIntoView(document.getElementById('tl-chron-scroll'), document.querySelector('.tl-scene[data-scene-id="' + sceneId + '"]'));
  _tlScrollCardIntoView(document.getElementById('tl-ms-scroll'), document.querySelector('.tl-ms-card[data-scene-id="' + sceneId + '"]'));
}
// Conflicts (§8) can involve two scenes that are nowhere near each other on
// screen — unlike a single selected scene (scrollTlCounterpartIntoView,
// which only scrolls if the card isn't already visible), showing a conflict
// always centers so the reader isn't left hunting for whichever card wasn't
// already on screen. Centers on the midpoint between every involved card
// still resolvable in each row (a single-scene conflict just centers that
// one card).
function _tlCenterOnScenes(scrollEl, sceneIds, selector) {
  if (!scrollEl || !sceneIds || !sceneIds.length) return;
  const cards = sceneIds
    .map(id => scrollEl.querySelector(selector + '[data-scene-id="' + id + '"]'))
    .filter(Boolean);
  if (!cards.length) return;
  const centers = cards.map(el => el.offsetLeft + el.offsetWidth / 2);
  const mid = (Math.min(...centers) + Math.max(...centers)) / 2;
  let target = mid - scrollEl.clientWidth / 2;
  const maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
  target = Math.max(0, Math.min(maxScroll, target));
  scrollEl.scrollTo({ left: target, behavior: 'smooth' });
}
function scrollTlConflictIntoView(sceneIds) {
  _tlCenterOnScenes(document.getElementById('tl-chron-scroll'), sceneIds, '.tl-scene');
  _tlCenterOnScenes(document.getElementById('tl-ms-scroll'), sceneIds, '.tl-ms-card');
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
  // A conflict "shown" via the panel's own row click (flag mode) is a
  // separate state from card selection — selecting (or clearing) a card is a
  // click elsewhere as far as that state is concerned, so it clears too.
  if (typeof isFlagModeActive === 'function' && isFlagModeActive()) clearFlagMode();
  // The Conflicts panel always shows every conflict; re-render just moves
  // which row (if any) is scrolled-to/highlighted for the new selection.
  if (typeof renderConflictsPanel === 'function' && tlActiveTab === 'conflicts') renderConflictsPanel();
  document.querySelectorAll('.tl-scene, .tl-ms-card, .tl-braid-node').forEach(el => {
    el.classList.toggle('tl-sel', el.dataset.sceneId === String(sceneId));
  });
  const emptyEl = document.getElementById('tl-inspector-empty');
  const form = document.getElementById('form-edit');
  // Selecting or deselecting a scene always means "not creating a new scene
  // right now" — hide #form-new unconditionally rather than only in the
  // (sceneId == null) branch, since it can also be left visible-but-blank
  // when the New Scene form was open but never made dirty (runWithDiscardGuard's
  // fast path skips cancelNewScene() entirely when nothing needs discarding),
  // then a scene gets selected directly. Previously left it stuck visible
  // underneath the empty-state message once the scene was later deselected.
  document.getElementById('form-new').style.display = 'none';
  if (sceneId == null) {
    emptyEl.style.display = '';
    form.style.display = 'none';
    if (S.editingId !== null) cancelEdit();
  } else {
    emptyEl.style.display = 'none';
    openEditMode(sceneId);
    form.style.display = 'flex';
    const tlPanel = document.getElementById('tl-panel');
    if (tlPanel && tlPanel.classList.contains('collapsed')) togglePanel('tl-panel');
    if (opts.focusTitle) {
      setTimeout(() => { const t = document.getElementById('ed-title'); if (t) { t.focus(); t.select(); } }, 40);
    }
  }
  if (sceneId != null) scrollTlCounterpartIntoView(sceneId);
  updateTlInspectorFooter();
  refreshTlSaveCancelState();
  // Wire opacity/width is baked into each path's own attributes at draw time
  // (redrawWires reads tlSelectedId directly, no CSS hook) — selecting only
  // incidentally redraws today via the hover events a click naturally fires
  // alongside it, but deselecting by clicking empty track space fires no
  // hover event on any card at all, so without this the just-deselected
  // scene's wire stays rendered at its old "selected" opacity/width forever.
  redrawWires();
}

function tlSwitchTab(tab) {
  tlActiveTab = tab;
  document.getElementById('tl-tab-inspector').classList.toggle('on', tab === 'inspector');
  document.getElementById('tl-tab-conflicts').classList.toggle('on', tab === 'conflicts');
  document.getElementById('tl-inspector-body').style.display = tab === 'inspector' ? '' : 'none';
  document.getElementById('tl-conflicts-body').style.display = tab === 'conflicts' ? '' : 'none';
  if (tab === 'conflicts' && typeof renderConflictsPanel === 'function') renderConflictsPanel();
  updateTlInspectorFooter();
}

// Delete Scene footer button: visible only on the Inspector tab, with a scene
// actually open (mirrors the form's own visibility rule in _tlDoSelectScene).
function updateTlInspectorFooter() {
  const footer = document.getElementById('tl-inspector-footer');
  if (!footer) return;
  footer.style.display = (tlActiveTab === 'inspector' && tlSelectedId != null) ? '' : 'none';
}

// Cancel/Save Changes dim to "nothing to do" the moment the form is clean —
// only while Timeline mode is driving these shared buttons; board's own Edit
// Scene form never sets/clears this attribute, so it can't affect board.
function refreshTlSaveCancelState() {
  if (!timelineMode) return;
  const dirty = S.editingId !== null && isEditFormDirty();
  const cancelBtn = document.getElementById('canceledit');
  const saveBtn = document.getElementById('saveedit');
  if (cancelBtn) cancelBtn.disabled = !dirty;
  if (saveBtn) saveBtn.disabled = !dirty;
}

function tlDeleteSelectedScene() {
  if (S.editingId == null) return;
  deleteScene(S.editingId);
}

// Create -> New Scene / the Inspector's own "+ New Scene" button (shown in
// its empty state, next to "Select a scene to edit it here"), while in
// timeline mode (§6.1): opens the same New Scene form Card view uses (see
// _openTimelineViewImpl's reparenting of #form-new alongside #form-edit),
// rather than creating a scene immediately with blank defaults — matches
// the reader's mental model ("fill in a new scene, then save it") and
// avoids leaving an untitled orphan scene behind if the user backs out.
// Routed through the same discard guard as every other selection/mode-switch
// entry point in timeline mode, since opening this form discards whatever
// the Inspector was showing before (a dirty edit, or an already-live New
// Scene draft).
function tlShowNewSceneForm() {
  runWithDiscardGuard(_tlShowNewSceneFormImpl);
}
function _tlShowNewSceneFormImpl() {
  tlSelectedId = null;
  document.querySelectorAll('.tl-scene, .tl-ms-card, .tl-braid-node').forEach(el => el.classList.remove('tl-sel'));
  document.getElementById('tl-inspector-empty').style.display = 'none';
  switchTab('new');
  const tlPanel = document.getElementById('tl-panel');
  if (tlPanel && tlPanel.classList.contains('collapsed')) togglePanel('tl-panel');
  updateTlInspectorFooter();
  redrawWires(); // clears any stale "selected" wire highlight (mirrors _tlDoSelectScene's own trailing call)
  setTimeout(() => { const t = document.getElementById('sc-title'); if (t) t.focus(); }, 40);
}
// Timeline-specific follow-up once addScene() (editor.js) successfully
// creates a scene from the Inspector's own New Scene form: switches the
// Inspector from "new" back to "edit", showing the scene that was just
// created. renderTimeline() runs first so the new scene's card actually
// exists in the DOM before _tlDoSelectScene() tries to select/scroll to it.
function _tlAfterCreateScene(newId) {
  document.getElementById('form-new').style.display = 'none';
  renderTimeline();
  _tlDoSelectScene(newId, {});
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
    // Same mid-drag destruction hazard scheduleConflictsRecompute() guards
    // against (see conflicts.js): renderTimeline() tears down and rebuilds
    // #tl-track/#tl-ms-row, destroying a live drag's ghost/insert-line
    // elements. This debounced resize path calls the identical
    // renderTimeline() but was missing the same guard — a resize (or an
    // Inspector-panel collapse/expand, which resizes #tl-stage) firing within
    // 150ms of a drag starting silently killed the drag's visual feedback.
    tlResizeTimer = setTimeout(() => {
      if (typeof isTlDragActive === 'function' && isTlDragActive()) return;
      renderTimeline();
    }, 150);
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
      // Cards call stopPropagation() on their own click, so anything that
      // bubbles up here (the bare track, a lane row's empty background, the
      // markers layer, etc.) is a click off a card — deselect.
      tlSelectScene(null);
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
