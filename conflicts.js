'use strict';

// ── CONFLICT ENGINE (ported from ../Timeline/js/conflicts.js, schema v3 §8) ──
// anchorTs()/fmtAnchor() come from timeline.js; manuscriptOrder()/sceneDisplayNum()
// from editor.js — all referenced only inside function bodies below, so load order
// relative to this file doesn't matter (nothing here runs until after every script
// has loaded).

function computeConflicts() {
  const sceneById = new Map(S.scenes.map(s => [s.id, s]));
  const chronIndexMap = new Map();
  (S.chronOrder || []).forEach((id, i) => chronIndexMap.set(id, i));

  const title = id => { const s = sceneById.get(id); return s ? s.title : '?'; };
  const sceneLabel = id => 'Scene ' + sceneDisplayNum(id) + ' — "' + title(id) + '"';
  const fp = (type, ids, extraKey) => type + ':' + [...ids].sort((a, b) => a - b).join(',') + ':' + (extraKey ?? '');

  const byFingerprint = new Map();
  const fpOrder = [];
  const push = c => {
    if (byFingerprint.has(c.fingerprint)) return; // report each conflict once
    byFingerprint.set(c.fingerprint, c);
    fpOrder.push(c.fingerprint);
  };

  // ── anchor-vs-chronOrder monotonicity (adjacent anchored pairs) ────────────
  const anchoredInChron = (S.chronOrder || []).filter(id => { const s = sceneById.get(id); return s && s.anchor && s.anchor.date; });
  for (let ai = 1; ai < anchoredInChron.length; ai++) {
    const aId = anchoredInChron[ai - 1], bId = anchoredInChron[ai];
    const a = sceneById.get(aId), b = sceneById.get(bId);
    const ta = anchorTs(a.anchor), tb = anchorTs(b.anchor);
    if (ta !== null && tb !== null && ta > tb) {
      push({
        fingerprint: fp('anchor-order', [aId, bId]),
        type: 'anchor-order', severity: 'error',
        title: 'Anchor vs. order contradiction',
        message: `${sceneLabel(bId)} is placed after ${sceneLabel(aId)} in the chronology, but its date (${fmtAnchor(b.anchor)}) is earlier (${fmtAnchor(a.anchor)}).`,
        sceneIds: [aId, bId],
      });
    }
  }

  // ── constraint cycles (computed first so the violation pass below can skip
  // constraints already reported as part of a cycle) ─────────────────────────
  const beforeLike = (S.constraints || []).filter(c => c.type === 'before' || c.type === 'offset');
  const adj = new Map();
  beforeLike.forEach(c => {
    if (!adj.has(c.a)) adj.set(c.a, []);
    adj.get(c.a).push({ to: c.b, cid: c.id });
  });
  const cycleConstraintIds = new Set();
  const visited = new Set(), inStack = new Set(), stack = [];
  function dfs(node) {
    visited.add(node); inStack.add(node); stack.push(node);
    const edges = adj.get(node) || [];
    for (const edge of edges) {
      if (inStack.has(edge.to)) {
        const idx = stack.indexOf(edge.to);
        const cyclePath = stack.slice(idx);
        for (let k = 0; k < cyclePath.length; k++) {
          const from = cyclePath[k], to = cyclePath[(k + 1) % cyclePath.length];
          (adj.get(from) || []).forEach(ed => { if (ed.to === to) cycleConstraintIds.add(ed.cid); });
        }
        const chainTitles = cyclePath.map(title);
        chainTitles.push(title(cyclePath[0]));
        push({
          fingerprint: fp('cycle', cyclePath),
          type: 'cycle', severity: 'error', title: 'Constraint cycle',
          message: `${chainTitles.map(t => '"' + t + '"').join(' → ')} can't all be satisfied.`,
          sceneIds: [...cyclePath],
        });
      } else if (!visited.has(edge.to)) {
        dfs(edge.to);
      }
    }
    stack.pop(); inStack.delete(node);
  }
  [...adj.keys()].forEach(n => { if (!visited.has(n)) dfs(n); });

  // ── constraint violations ───────────────────────────────────────────────────
  const tolerance = (a, b) => (!a.anchor.time || !b.anchor.time) ? (24 * 60 * 60 * 1000) : (60 * 1000);
  function fmtOffsetMin(min) {
    if (min < 60) return min + ' min';
    if (min < 1440) { const hrs = Math.round(min / 60); return hrs + ' hr' + (hrs === 1 ? '' : 's'); }
    const days = Math.round(min / 1440);
    return days + ' day' + (days === 1 ? '' : 's');
  }
  (S.constraints || []).forEach(c => {
    if (cycleConstraintIds.has(c.id)) return;
    const a = sceneById.get(c.a), b = sceneById.get(c.b);
    if (!a || !b) return;
    let violated = false;
    const bothAnchored = !!(a.anchor && a.anchor.date && b.anchor && b.anchor.date);
    if (c.type === 'before' || c.type === 'offset') {
      const ia = chronIndexMap.get(c.a), ib = chronIndexMap.get(c.b);
      const chronViolated = (ia !== undefined && ib !== undefined && ia > ib);
      let anchorViolated = false;
      if (bothAnchored) {
        const ta2 = anchorTs(a.anchor), tb2 = anchorTs(b.anchor);
        if (c.type === 'before') anchorViolated = ta2 > tb2;
        else anchorViolated = Math.abs(tb2 - (ta2 + c.offsetMin * 60000)) > tolerance(a, b);
      }
      violated = chronViolated || anchorViolated;
    } else if (c.type === 'same-time') {
      if (bothAnchored) {
        const ta3 = anchorTs(a.anchor), tb3 = anchorTs(b.anchor);
        violated = Math.abs(ta3 - tb3) > tolerance(a, b);
      }
    }
    if (!violated) return;
    let msg;
    if (c.type === 'before') msg = `"${title(c.a)}" must come before "${title(c.b)}" in the chronology, but it doesn't.`;
    else if (c.type === 'offset') msg = `"${title(c.b)}" should be ${fmtOffsetMin(c.offsetMin)} after "${title(c.a)}", but their placement/dates don't agree.`;
    else msg = `"${title(c.a)}" and "${title(c.b)}" are marked as happening at the same time, but their dates don't match.`;
    push({
      fingerprint: fp('constraint', [c.a, c.b], c.id),
      type: 'constraint', severity: 'error', title: 'Constraint violated',
      message: msg, sceneIds: [c.a, c.b],
    });
  });

  // ── bilocation ───────────────────────────────────────────────────────────
  // Adapted for schema v3's multi-location scenes (ThruLine's single locationId
  // doesn't exist here): a conflict requires both scenes to have at least one
  // location tagged and their location sets to be completely disjoint — a
  // shared location can't be a bilocation, and a scene with no location tagged
  // can't be judged against one that does.
  function sceneInterval(s) {
    const ts = anchorTs(s.anchor);
    if (ts === null) return null;
    if (!s.anchor.time) return { start: ts, end: ts + 24 * 60 * 60 * 1000 }; // whole day
    const durMs = (s.durationMin || 0) * 60000; // no duration -> instant
    return { start: ts, end: ts + durMs };
  }
  function intervalsOverlap(iv1, iv2) {
    if (iv1.start < iv2.end && iv2.start < iv1.end) return true;
    if (iv1.start === iv1.end && iv2.start === iv2.end && iv1.start === iv2.start) return true;
    return false;
  }
  const characterById = new Map(S.characters.map(c => [c.id, c]));
  const locationById = new Map(S.locations.map(l => [l.id, l]));
  const scenesArr = S.scenes;
  for (let i = 0; i < scenesArr.length; i++) {
    for (let j = i + 1; j < scenesArr.length; j++) {
      const sA = scenesArr[i], sB = scenesArr[j];
      if (!sA.anchor || !sA.anchor.date || !sB.anchor || !sB.anchor.date) continue;
      if (!sA.locations.length || !sB.locations.length) continue;
      const disjointLocations = !sA.locations.some(id => sB.locations.includes(id));
      if (!disjointLocations) continue;
      const shared = (sA.characters || []).filter(cid => (sB.characters || []).includes(cid));
      if (!shared.length) continue;
      const ivA = sceneInterval(sA), ivB = sceneInterval(sB);
      if (!ivA || !ivB || !intervalsOverlap(ivA, ivB)) continue;

      const names = shared.map(cid => (characterById.get(cid) || {}).name || cid);
      const locA = sA.locations.map(id => (locationById.get(id) || {}).name || id).join('/');
      const locB = sB.locations.map(id => (locationById.get(id) || {}).name || id).join('/');
      const dateLabel = fmtAnchor(sA.anchor.time ? sA.anchor : { date: sA.anchor.date }) || sA.anchor.date;
      push({
        fingerprint: fp('bilocation', [sA.id, sB.id]),
        type: 'bilocation', severity: 'error', title: 'Character in two places at once',
        message: `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} in both "${sA.title}" and "${sB.title}" at the same time on ${dateLabel} — ${locA} and ${locB}.`,
        sceneIds: [sA.id, sB.id],
      });
    }
  }

  // ── reveal order — walked against manuscriptOrder() filtered to on-screen
  // scenes only (§8: reader-order inputs use manuscriptOrder() minus offscreen;
  // an offscreen scene neither contributes a reveal nor triggers a requires
  // check, matching §9's "excluded from reader-knowledge checks" in both
  // directions) ────────────────────────────────────────────────────────────
  const revealById = new Map(S.revealsLib.map(r => [r.id, r]));
  const readerOrder = manuscriptOrder().filter(s => !s.offscreen);
  const known = new Set();
  readerOrder.forEach(s => {
    (s.requires || []).forEach(rvId => {
      if (known.has(rvId)) return;
      let revealer = null;
      for (const s2 of readerOrder) {
        if ((s2.reveals || []).includes(rvId)) { revealer = s2; break; }
      }
      const label = (revealById.get(rvId) || {}).label || rvId;
      if (revealer) {
        push({
          fingerprint: fp('reveal-order', [s.id, revealer.id], rvId),
          type: 'reveal-order', severity: 'error', title: 'Reveal used before shown',
          message: `${sceneLabel(s.id)} requires "${label}" — not revealed until ${sceneLabel(revealer.id)}.`,
          sceneIds: [s.id, revealer.id],
        });
      } else {
        push({
          fingerprint: fp('reveal-missing', [s.id], rvId),
          type: 'reveal-missing', severity: 'error', title: 'Reveal never shown',
          message: `"${label}" is never revealed to the reader.`,
          sceneIds: [s.id],
        });
      }
    });
    (s.reveals || []).forEach(rvId => known.add(rvId));
  });

  return fpOrder.map(f => byFingerprint.get(f));
}

// ── CACHE + DEBOUNCED RECOMPUTE ───────────────────────────────────────────────
// The computation itself is pure/cheap; what's debounced is the follow-up UI
// refresh (badge, warn-dots via re-render, panel) so a burst of saves (e.g. a
// drag) doesn't thrash re-renders. state.js's saveState() calls
// scheduleConflictsRecompute() on every save; initStoryboard() (projects.js)
// calls conflictsCacheRefreshNow() once synchronously on load so the very
// first render isn't stuck showing an empty cache for 150ms.
let _tlActiveConflicts = [];
let _tlConflictsDebounceTimer = null;
let _tlFlaggedFingerprint = null;

function conflictsCacheRefreshNow() {
  _tlActiveConflicts = computeConflicts();
}

function scheduleConflictsRecompute() {
  clearTimeout(_tlConflictsDebounceTimer);
  _tlConflictsDebounceTimer = setTimeout(() => {
    conflictsCacheRefreshNow();
    renderConflictsBadge();
    if (typeof timelineMode !== 'undefined' && timelineMode) {
      renderTimeline();
      if (tlActiveTab === 'conflicts') renderConflictsPanel();
    } else if (typeof renderBoard === 'function') {
      // Board warn-dots must stay current whether or not the timeline is
      // open (§8: "conflicts are discoverable without opening the timeline").
      renderBoard();
    }
  }, 150);
}

function getActiveConflicts() {
  return _tlActiveConflicts.filter(c => !S.dismissed.includes(c.fingerprint));
}
function getDismissedConflicts() {
  return _tlActiveConflicts.filter(c => S.dismissed.includes(c.fingerprint));
}
// §4.3/§9 warn-dot rule: a scene is "warned" when it's a member of any
// non-dismissed conflict.
function sceneHasWarning(sceneId) {
  return getActiveConflicts().some(c => c.sceneIds.includes(sceneId));
}
// Stale dismissed fingerprints (no longer produced) are pruned on save.
function pruneDismissed() {
  if (!S.dismissed.length) return; // nothing to prune — skip the full O(n²) recompute saveState would otherwise force on every save
  const active = computeConflicts().map(c => c.fingerprint);
  S.dismissed = S.dismissed.filter(fp => active.includes(fp));
}

// ── FLAG MODE (§8) ─────────────────────────────────────────────────────────
function isFlagModeActive() { return !!_tlFlaggedFingerprint; }
function getFlaggedSceneIds() {
  if (!_tlFlaggedFingerprint) return null;
  const c = _tlActiveConflicts.find(x => x.fingerprint === _tlFlaggedFingerprint);
  return c ? c.sceneIds : null;
}
function setFlagMode(fingerprint) {
  _tlFlaggedFingerprint = fingerprint;
  document.body.classList.add('flagging');
  document.querySelectorAll('.tl-flag').forEach(el => el.classList.remove('tl-flag'));
  const ids = getFlaggedSceneIds() || [];
  ids.forEach(id => {
    document.querySelectorAll('[data-scene-id="' + id + '"]').forEach(el => el.classList.add('tl-flag'));
  });
  if (typeof redrawWires === 'function') redrawWires();
  if (typeof scrollTlConflictIntoView === 'function') scrollTlConflictIntoView(ids);
}
function clearFlagMode() {
  _tlFlaggedFingerprint = null;
  document.body.classList.remove('flagging');
  document.querySelectorAll('.tl-flag').forEach(el => el.classList.remove('tl-flag'));
  if (typeof redrawWires === 'function') redrawWires();
}
function toggleFlagMode(fingerprint) {
  if (_tlFlaggedFingerprint === fingerprint) clearFlagMode();
  else setFlagMode(fingerprint);
}
// Entry point for the Conflicts panel specifically (row click / "show
// scenes") — card selection and "show scenes" flag mode used to be two
// independent highlight states that could both be active at once (select a
// card, then click an unrelated conflict row), which made "just clear
// everything" take more than one click since each state needed its own
// clearing action. Routing every panel-driven flag toggle through a card
// deselect first makes the two mutually exclusive, matching how they're
// already unified in the other direction (_tlDoSelectScene already clears
// flag mode when a card gets selected).
function tlToggleFlagFromPanel(fingerprint) {
  const run = () => {
    const wasSame = _tlFlaggedFingerprint === fingerprint;
    if (typeof _tlDoSelectScene === 'function') _tlDoSelectScene(null, {});
    if (!wasSame) setFlagMode(fingerprint);
    renderConflictsPanel();
  };
  if (typeof runWithDiscardGuard === 'function') runWithDiscardGuard(run); else run();
}

// ── CONFLICTS BADGE (strip header) ────────────────────────────────────────────
function renderConflictsBadge() {
  const btn = document.getElementById('tl-conflicts-badge');
  if (!btn) return;
  const n = getActiveConflicts().length;
  btn.textContent = 'Conflicts (' + n + ')';
  btn.classList.toggle('has-warn', n > 0);
}

// ── CONFLICTS PANEL (right panel tab, §6.6/§8) ────────────────────────────────
// Always shows every conflict — no per-selection filtering. Selecting a scene
// that's involved in a conflict instead scrolls the panel to (and highlights)
// that conflict's row, so the full list stays visible as context. Deselecting
// (or selecting a scene with no conflict) just clears the highlight — see
// _tlDoSelectScene (timeline.js), which re-renders this panel on every
// selection change.
function tlShowAllConflicts() {
  tlSwitchTab('conflicts');
}
function renderConflictsPanel() {
  const body = document.getElementById('tl-conflicts-body');
  if (!body) return;
  body.innerHTML = '';
  const active = getActiveConflicts();
  const dismissed = getDismissedConflicts();

  const hdr = document.createElement('div');
  hdr.className = 'conflictCountHdr';
  hdr.textContent = 'Conflicts (' + active.length + ')';
  body.appendChild(hdr);

  if (!active.length && !dismissed.length) {
    const empty = document.createElement('div');
    empty.className = 'tl-panel-empty';
    empty.textContent = 'No conflicts found.';
    body.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'conflictList';
  let selRow = null;
  active.forEach(c => {
    const row = buildConflictRow(c, false);
    if (tlSelectedId != null && c.sceneIds.includes(tlSelectedId) && !selRow) selRow = row;
    list.appendChild(row);
  });
  if (dismissed.length) {
    const dh = document.createElement('div');
    dh.className = 'conflictGroupHeader';
    dh.textContent = 'Dismissed';
    list.appendChild(dh);
    dismissed.forEach(c => {
      const row = buildConflictRow(c, true);
      if (tlSelectedId != null && c.sceneIds.includes(tlSelectedId) && !selRow) selRow = row;
      list.appendChild(row);
    });
  }
  body.appendChild(list);

  if (selRow) {
    selRow.classList.add('conflictSelMatch');
    selRow.scrollIntoView({ block: 'nearest' });
  }
}

function buildConflictRow(c, isDismissed) {
  const row = document.createElement('div');
  row.className = 'conflictRow' + (isDismissed ? ' dismissed' : '');
  row.dataset.fingerprint = c.fingerprint;
  if (!isDismissed && c.fingerprint === _tlFlaggedFingerprint) row.classList.add('flagActive');

  const head = document.createElement('div'); head.className = 'conflictHead';
  const dot = document.createElement('span'); dot.className = 'conflictDot'; head.appendChild(dot);
  const titleEl = document.createElement('span'); titleEl.className = 'conflictTitle'; titleEl.textContent = c.title;
  head.appendChild(titleEl);
  row.appendChild(head);

  const msgEl = document.createElement('div'); msgEl.className = 'conflictMsg'; msgEl.textContent = c.message;
  row.appendChild(msgEl);

  const actions = document.createElement('div'); actions.className = 'conflictActions';
  if (isDismissed) {
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'linkBtn'; restoreBtn.textContent = 'restore warning';
    restoreBtn.addEventListener('click', e => {
      e.stopPropagation();
      pushHistory('Restore warning');
      S.dismissed = S.dismissed.filter(fp => fp !== c.fingerprint);
      recordDataEdit(); saveState();
      conflictsCacheRefreshNow(); renderConflictsBadge(); renderConflictsPanel();
      if (typeof timelineMode !== 'undefined' && timelineMode) renderTimeline();
    });
    actions.appendChild(restoreBtn);
  } else {
    const showBtn = document.createElement('button');
    showBtn.className = 'linkBtn'; showBtn.textContent = 'show scenes';
    showBtn.addEventListener('click', e => { e.stopPropagation(); tlToggleFlagFromPanel(c.fingerprint); });
    actions.appendChild(showBtn);

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'linkBtn'; dismissBtn.textContent = 'mark intentional';
    dismissBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (_tlFlaggedFingerprint === c.fingerprint) clearFlagMode();
      pushHistory('Mark conflict intentional');
      if (!S.dismissed.includes(c.fingerprint)) S.dismissed.push(c.fingerprint);
      recordDataEdit(); saveState();
      conflictsCacheRefreshNow(); renderConflictsBadge(); renderConflictsPanel();
      if (typeof timelineMode !== 'undefined' && timelineMode) renderTimeline();
    });
    actions.appendChild(dismissBtn);
  }
  row.appendChild(actions);

  // Clicking the row body (not the action links) also toggles flag mode.
  if (!isDismissed) {
    row.addEventListener('click', () => tlToggleFlagFromPanel(c.fingerprint));
  }
  return row;
}
