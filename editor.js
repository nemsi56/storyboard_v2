'use strict';

// ── SEARCH ────────────────────────────────────────────────────────────────────
let searchQ = '', searchScope = 'both';

function onSearch() {
  searchQ    = document.getElementById('srch-inp').value.trim().toLowerCase();
  searchScope = document.getElementById('srch-scope').value;
  document.getElementById('srch-clr').style.display = searchQ ? 'inline' : 'none';
  document.getElementById('srch-wrap').classList.toggle('srch-active', !!searchQ);
  renderBoard();
}

function clearSearch() {
  document.getElementById('srch-inp').value = '';
  searchQ = '';
  document.getElementById('srch-clr').style.display = 'none';
  document.getElementById('srch-wrap').classList.remove('srch-active');
  renderBoard();
}

function sceneMatchesSearch(scene) {
  if (!searchQ) return false;
  const inTitle   = scene.title.toLowerCase().includes(searchQ);
  const inSummary = (scene.summary || '').toLowerCase().includes(searchQ);
  if (searchScope === 'title')   return inTitle;
  if (searchScope === 'summary') return inSummary;
  return inTitle || inSummary;
}

// ── ADD-ITEM POPUP ────────────────────────────────────────────────────────────
let apSec = null;
// Set when "+ Add…" is triggered from inside a scene form's checklist (rather
// than the Library panel), so the newly-added item can be auto-checked there
// instead of leaving the user to reopen the dropdown and find it themselves.
let apReturnCk = null; // { prefix: 'sc'|'ed', sec }
function openAddPopup(sec) {
  apSec = sec;
  const cfg = SECS.find(s => s.key === sec);
  document.getElementById('ap-title').textContent = 'Add ' + SINGULAR[sec];
  const inp = document.getElementById('ap-input'); inp.value = ''; inp.placeholder = cfg.ph;
  document.getElementById('ap-notes').value = '';
  document.getElementById('add-popup').classList.add('open');
  setTimeout(() => inp.focus(), 60);
}
function openAddPopupFromCk(prefix, sec) {
  apReturnCk = { prefix, sec };
  openAddPopup(sec);
}
function closeAddPopup() {
  document.getElementById('add-popup').classList.remove('open');
  document.getElementById('ap-input').value = '';
  document.getElementById('ap-notes').value = '';
  apSec = null;
  apReturnCk = null;
}
// Current checkbox selections in a scene form's checklist for one category —
// read before a library mutation re-renders it, so that re-render can restore
// exactly what was checked instead of resetting to nothing.
function ckCurrentlyChecked(prefix, sec) {
  const box = document.getElementById(prefix + '-' + sec);
  return box ? [...box.querySelectorAll('input:checked')].map(c => c.value) : [];
}
function confirmAdd() {
  if (!apSec) return;
  const inp = document.getElementById('ap-input');
  const name = inp.value.trim();
  const notes = document.getElementById('ap-notes').value.trim();
  if (!name) { inp.focus(); return; }
  if (S[apSec].some(x => x.name === name)) { inp.select(); return; }
  pushHistory('Add ' + SINGULAR[apSec] + ' "' + name + '"');
  trackItemAdded(apSec);
  S[apSec].push({ name, notes });
  const newCkChecked = ckCurrentlyChecked('ck', apSec);
  const newEkChecked = ckCurrentlyChecked('ek', apSec);
  if (apReturnCk && apReturnCk.sec === apSec) {
    if (apReturnCk.prefix === 'ck') newCkChecked.push(name);
    if (apReturnCk.prefix === 'ek') newEkChecked.push(name);
  }
  renderLibSec(apSec); renderCk(apSec, newCkChecked); renderEditCk(apSec, newEkChecked);
  if (apSec === 'characters') {
    renderPovCk('sc', ckCurrentlyChecked('sc', 'povs'));
    renderPovCk('ed', ckCurrentlyChecked('ed', 'povs'));
  }
  closeAddPopup();
  recordDataEdit();
  saveState();
}
if (document.getElementById('ap-input')) {
  document.getElementById('ap-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmAdd();
    if (e.key === 'Escape') closeAddPopup();
  });
}
// Backdrop-click-to-close helper (used by all modals)
function onBackdropClick(id, closeFn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', e => { if (e.target === el) closeFn(); });
}
if (document.getElementById('add-popup')) onBackdropClick('add-popup', closeAddPopup);

// ── PANEL / SCALE ─────────────────────────────────────────────────────────────
function togglePanel(id) {
  document.getElementById(id).classList.toggle('collapsed');
}
function setScale(v) { document.getElementById('board').style.setProperty('--cs', v); if (S.sections.length) alignSecHeaders(); }

// ── MENU BAR ───────────────────────────────────────────────────────────────────
function toggleMenu(name) {
  const isOpen = document.getElementById('mi-' + name).classList.contains('open');
  closeAllMenus();
  if (!isOpen) {
    document.getElementById('mi-' + name).classList.add('open');
    if (name === 'view') {
      updateThemeMenuState();
      updatePanelMenuStates();
    }
  }
}
function closeAllMenus() {
  document.querySelectorAll('#menu-bar .mi.open').forEach(m => m.classList.remove('open'));
}
function hoverMenu(name) {
  if (document.querySelector('#menu-bar .mi.open')) toggleMenu(name);
}
function updateThemeMenuState() {
  const current = document.documentElement.dataset.theme || 'ivory';
  document.querySelectorAll('#drop-view .theme-di').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === current);
  });
}
function updatePanelMenuStates() {
  const lp = document.getElementById('lp');
  const sp = document.getElementById('sp');
  const cp = document.getElementById('cp');
  const lpCollapsed = lp && lp.classList.contains('collapsed');
  const spCollapsed = sp && sp.classList.contains('collapsed');
  const cpCollapsed = cp && cp.classList.contains('collapsed');
  const libEl = document.getElementById('menu-lib-text');
  const secEl = document.getElementById('menu-sec-text');
  const scnEl = document.getElementById('menu-scn-text');
  const allEl = document.getElementById('menu-all-text');
  if (libEl) libEl.textContent = lpCollapsed ? 'Show Library Panel' : 'Hide Library Panel';
  if (secEl) secEl.textContent = spCollapsed ? 'Show Sections Panel' : 'Hide Sections Panel';
  if (scnEl) scnEl.textContent = cpCollapsed ? 'Show Scene Panel' : 'Hide Scene Panel';
  const allCollapsed = lpCollapsed && spCollapsed && cpCollapsed;
  if (allEl) allEl.textContent = allCollapsed ? 'Show All Panels' : 'Hide All Panels';
}
function toggleAllPanels() {
  const lp = document.getElementById('lp');
  const sp = document.getElementById('sp');
  const cp = document.getElementById('cp');
  const lpCollapsed = lp && lp.classList.contains('collapsed');
  const spCollapsed = sp && sp.classList.contains('collapsed');
  const cpCollapsed = cp && cp.classList.contains('collapsed');
  const allCollapsed = lpCollapsed && spCollapsed && cpCollapsed;
  if (allCollapsed) {
    if (lp && lpCollapsed) togglePanel('lp');
    if (sp && spCollapsed) togglePanel('sp');
    if (cp && cpCollapsed) togglePanel('cp');
  } else {
    if (lp && !lpCollapsed) togglePanel('lp');
    if (sp && !spCollapsed) togglePanel('sp');
    if (cp && !cpCollapsed) togglePanel('cp');
  }
}

function menuImport() { closeAllMenus(); document.getElementById('menu-import-input').click(); }
function menuNewScene() {
  closeAllMenus();
  if (document.getElementById('cp').classList.contains('collapsed')) togglePanel('cp');
  switchTab('new');
  setNewSceneLive(false);
  setTimeout(() => document.getElementById('sc-title').focus(), 40);
}
function zoomIn()    { const el = document.getElementById('scaler'); if (!el) return; const v = Math.min(1.65, Math.round((+el.value + 0.1) * 100) / 100); el.value = v; setScale(v); }
function zoomOut()   { const el = document.getElementById('scaler'); if (!el) return; const v = Math.max(0.55, Math.round((+el.value - 0.1) * 100) / 100); el.value = v; setScale(v); }
function zoomReset() { const el = document.getElementById('scaler'); if (!el) return; el.value = 1; setScale(1); }
document.addEventListener('click', e => { if (!e.target.closest('#menu-bar')) closeAllMenus(); });

// ── AND/OR (global) ────────────────────────────────────────────────────────────
function setAndOr(mode) {
  S.andOr = mode;
  syncAndOrUI();
  renderBoard();
  saveState();
}
function syncAndOrUI() {
  document.getElementById('ao-or').classList.toggle('on',  S.andOr === 'OR');
  document.getElementById('ao-and').classList.toggle('on', S.andOr === 'AND');
}

// ── LIBRARY SELECTION (multi) ─────────────────────────────────────────────────
function toggleLibItem(sec, name) {
  const s = S.selections[sec];
  if (s.has(name)) s.delete(name); else s.add(name);
  renderLibSec(sec); renderBoard(); updateLibClearBtn();
}
function clearAllSel() {
  SECS.forEach(({ key }) => S.selections[key].clear());
  S.selections.povs.clear();
  SECS.forEach(({ key }) => renderLibSec(key));
  renderPovLibSec();
  renderBoard(); updateLibClearBtn();
}
function updateLibClearBtn() {
  const any = SECS.some(({ key }) => S.selections[key].size > 0) || S.selections.povs.size > 0;
  document.getElementById('lib-clr-wrap').style.display = any ? 'block' : 'none';
}

// ── REMOVE LIB ITEM ───────────────────────────────────────────────────────────
function removeItem(sec, name) {
  pushHistory('Remove "' + name + '"');
  S[sec] = S[sec].filter(x => x.name !== name);
  S.scenes.forEach(sc => { sc[sec] = (sc[sec] || []).filter(x => x !== name); });
  S.selections[sec].delete(name);
  // Deliberately NOT clearing a scene's povs when the matching character is
  // removed — keep it selectable as a plain custom POV name instead of
  // losing the assignment, since a removed library character may still be
  // the intended POV.
  if (sec === 'characters' && S.scenes.some(sc => (sc.povs || []).includes(name)) && !S.povCustomNames.includes(name)) {
    S.povCustomNames.push(name);
  }
  const newCkChecked = ckCurrentlyChecked('ck', sec).filter(v => v !== name);
  const newEkChecked = ckCurrentlyChecked('ek', sec).filter(v => v !== name);
  renderLibSec(sec); renderCk(sec, newCkChecked); renderEditCk(sec, newEkChecked); renderBoard(); updateLibClearBtn();
  if (sec === 'characters') {
    renderPovCk('sc', ckCurrentlyChecked('sc', 'povs'));
    renderPovCk('ed', ckCurrentlyChecked('ed', 'povs'));
    renderPovLibSec();
  }
  recordDataEdit();
  saveState();
}

function toggleCkDrop(wrapId, sec) {
  const wrap = document.getElementById(wrapId); if (!wrap) return;
  const isOpen = wrap.classList.contains('open');
  document.querySelectorAll('.ck-drop-wrap.open').forEach(w => w.classList.remove('open'));
  if (!isOpen) wrap.classList.add('open');
}
function updateCkDropLabel(wrap, lbl) {
  const btn = wrap.querySelector('.ck-drop-btn'); if (!btn) return;
  const n = wrap.querySelectorAll('input:checked').length;
  btn.textContent = n === 0 ? 'No ' + lbl.toLowerCase() + ' selected' : n + ' selected';
}
document.addEventListener('click', e => {
  if (!e.target.closest('.ck-drop-wrap')) {
    document.querySelectorAll('.ck-drop-wrap.open').forEach(w => w.classList.remove('open'));
  }
}, true);

// ── LIBRARY ITEM EDIT MODAL ───────────────────────────────────────────────────
let libEditSec = null, libEditIdx = null;

function openLibEditModal(sec, idx) {
  const item = S[sec][idx]; if (!item) return;
  libEditSec = sec; libEditIdx = idx;
  document.getElementById('lib-edit-hdr').textContent = 'Edit ' + (SINGULAR[sec] || 'Item');
  document.getElementById('lib-edit-name').value  = item.name;
  document.getElementById('lib-edit-notes').value = item.notes || '';
  document.getElementById('lib-edit-modal').classList.add('open');
  setTimeout(() => document.getElementById('lib-edit-name').focus(), 60);
}
function closeLibEditModal() {
  document.getElementById('lib-edit-modal').classList.remove('open');
  libEditSec = null; libEditIdx = null;
}
function saveLibEdit() {
  if (libEditSec === null || libEditIdx === null) return;
  const item = S[libEditSec][libEditIdx]; if (!item) return;
  const sec     = libEditSec;
  const oldName = item.name;
  const newName = document.getElementById('lib-edit-name').value.trim();
  const newNotes = document.getElementById('lib-edit-notes').value.trim();
  if (!newName) { document.getElementById('lib-edit-name').focus(); return; }
  if (newName !== oldName && S[sec].some((x, i) => i !== libEditIdx && x.name === newName)) {
    document.getElementById('lib-edit-name').select(); return;
  }
  pushHistory('Edit "' + oldName + '"');
  item.name  = newName;
  item.notes = newNotes;
  if (newName !== oldName) {
    S.scenes.forEach(scene => {
      const i = (scene[sec] || []).indexOf(oldName);
      if (i !== -1) scene[sec][i] = newName;
      if (sec === 'characters' && Array.isArray(scene.povs)) {
        const pi = scene.povs.indexOf(oldName);
        if (pi !== -1) scene.povs[pi] = newName;
      }
    });
    if (S.selections[sec].has(oldName)) {
      S.selections[sec].delete(oldName);
      S.selections[sec].add(newName);
    }
    if (sec === 'characters' && S.selections.povs.has(oldName)) {
      S.selections.povs.delete(oldName);
      S.selections.povs.add(newName);
    }
  }
  const renameInList = arr => arr.map(v => v === oldName ? newName : v);
  const newCkChecked = renameInList(ckCurrentlyChecked('ck', sec));
  const newEkChecked = renameInList(ckCurrentlyChecked('ek', sec));
  closeLibEditModal();
  renderLibSec(sec); renderCk(sec, newCkChecked); renderEditCk(sec, newEkChecked); renderBoard();
  if (sec === 'characters') {
    renderPovCk('sc', renameInList(ckCurrentlyChecked('sc', 'povs')));
    renderPovCk('ed', renameInList(ckCurrentlyChecked('ed', 'povs')));
    renderPovLibSec();
  }
  recordDataEdit();
  saveState();
}

let libDelSec = null, libDelName = null;
let secDelId = null;
function openLibDelModal(sec, name) {
  libDelSec = sec; libDelName = name;
  const cfg = SECS.find(s => s.key === sec);
  const label = cfg.label.replace(/s$/, '');
  document.getElementById('libdel-msg').textContent = `Permanently delete "${name}" (${label}) from the entire file? This cannot be undone.`;
  document.getElementById('libdel-modal').classList.add('open');
}
function closeLibDelModal() { document.getElementById('libdel-modal').classList.remove('open'); libDelSec = null; libDelName = null; }
function confirmLibDel() {
  if (!libDelSec || !libDelName) return;
  const s = libDelSec, n = libDelName;
  closeLibDelModal();
  removeItem(s, n);
}

// ── CARD DETAILS TOGGLE ───────────────────────────────────────────────────────
function toggleDetails(show) {
  document.getElementById('board').classList.toggle('hide-details', !show);
  if (S.sections.length) alignSecHeaders();
}

// ── HIGHLIGHT LOGIC ───────────────────────────────────────────────────────────
function sceneMatchesLib(scene) {
  const allSel = SECS.flatMap(({ key }) => [...S.selections[key]].map(v => ({ key, v })))
    .concat([...S.selections.povs].map(v => ({ key: 'povs', v })));
  if (!allSel.length) return false;
  if (S.andOr === 'AND') return allSel.every(({ key, v }) => (scene[key] || []).includes(v));
  return allSel.some(({ key, v }) => (scene[key] || []).includes(v));
}

// ── RESET ────────────────────────────────────────────────────────────────────
function resetAll() {
  if (!confirm('Reset everything?\n\nAll scenes and library items will be permanently deleted.')) return;
  S.characters = []; S.locations = []; S.themes = []; S.misc = [];
  S.scenes = []; S.nextId = 1; S.andOr = 'OR';
  S.sections = []; S.nextSecId = 1;
  S.povCustomNames = [];
  SECS.forEach(({ key }) => S.selections[key].clear());
  S.selIds.clear(); S.editingId = null;
  hist.past = []; hist.future = [];
  clearSearch();
  syncAndOrUI();
  buildLibPanel(); renderAllLib(); renderAllCk(); renderSecPanel(); renderSectionSelects(); renderPovCk('sc', []); renderPovCk('ed', []); renderBoard(); updateLibClearBtn(); updateUndoRedo();
  if (currentProjectId) saveState();
  else localStorage.removeItem(STORAGE_KEY);
}

// ── SCENE ACTIONS ─────────────────────────────────────────────────────────────
let pendingInsert = null; // { afterId: sceneId|null (null=prepend), sectionId: number|null }

function addInsertZone(container, afterSceneId, sectionId) {
  const zone = document.createElement('div');
  zone.className = 'ins-zone' + (drag.on ? ' ins-inert' : '');
  const btn  = document.createElement('div'); btn.className  = 'ins-btn'; btn.textContent = '＋ Add Scene';
  zone.appendChild(btn);
  zone.addEventListener('click', e => {
    e.stopPropagation();
    pendingInsert = { afterId: afterSceneId, sectionId };
    if (S.sections.length) {
      const sel = document.getElementById('sc-section');
      if (sel) sel.value = sectionId !== null ? String(sectionId) : '';
    }
    if (document.getElementById('cp').classList.contains('collapsed')) togglePanel('cp');
    switchTab('new');
    setNewSceneLive(true);
    setTimeout(() => document.getElementById('sc-title').focus(), 40);
  });
  container.appendChild(zone);
}

function addScene() {
  const titleEl = document.getElementById('sc-title'), errEl = document.getElementById('scerr');
  const title = titleEl.value.trim(), summary = document.getElementById('sc-summary').value.trim();
  const notes = document.getElementById('sc-notes').value.trim();
  errEl.textContent = '';
  if (!title) { errEl.textContent = 'Please enter a scene title.'; titleEl.focus(); return; }
  if (S.scenes.some(s => s.title.toLowerCase() === title.toLowerCase())) { errEl.textContent = 'Title already exists.'; titleEl.select(); return; }
  const row = {};
  SECS.forEach(({ key }) => { row[key] = [...document.querySelectorAll(`#ck-${key} input:checked`)].map(c => c.value); });
  const sectionId = S.sections.length ? (parseInt(document.getElementById('sc-section').value) || null) : null;
  const wordCount = parseInt(document.getElementById('sc-wordcount').value) || null;
  const povs = ckCurrentlyChecked('sc', 'povs');
  pushHistory('Add scene "' + truncStr(title, 22) + '"');
  trackSceneAdded();
  const newScene = { id: S.nextId++, title, summary, notes, ...row, sectionId, wordCount, povs };
  if (pendingInsert !== null) {
    const { afterId, sectionId: piSecId } = pendingInsert; pendingInsert = null;
    if (afterId !== null) {
      const idx = S.scenes.findIndex(s => s.id === afterId);
      S.scenes.splice(idx !== -1 ? idx + 1 : S.scenes.length, 0, newScene);
    } else {
      // Prepend: insert before the first scene in this section
      const validSecIds = new Set(S.sections.map(s => s.id));
      const firstIdx = piSecId !== null
        ? S.scenes.findIndex(s => s.sectionId === piSecId)
        : S.scenes.findIndex(s => !validSecIds.has(s.sectionId));
      S.scenes.splice(firstIdx !== -1 ? firstIdx : S.scenes.length, 0, newScene);
    }
  } else if (sectionId) {
    // Default: insert after the last scene already in this section
    let insertIdx = -1;
    S.scenes.forEach((s, i) => { if (s.sectionId === sectionId) insertIdx = i; });
    if (insertIdx === -1) S.scenes.push(newScene); else S.scenes.splice(insertIdx + 1, 0, newScene);
  } else {
    S.scenes.push(newScene);
  }
  titleEl.value = ''; document.getElementById('sc-summary').value = ''; document.getElementById('sc-notes').value = '';
  document.getElementById('sc-wordcount').value = '';
  document.querySelectorAll('#form-new .ck-drop-list input').forEach(c => { c.checked = false; });
  SECS.forEach(({ key, label }) => { const w = document.getElementById('ck-' + key + '-wrap'); if (w) updateCkDropLabel(w, label); });
  const scPovWrap = document.getElementById('sc-povs-wrap'); if (scPovWrap) updateCkDropLabel(scPovWrap, 'POV names');
  setNewSceneLive(false);
  renderBoard();
  renderPovLibSec();

  // Track milestones (based on scenes created since user ID was generated)
  const scenesCreated = getScenesCreatedSinceIdCreation();
  if (scenesCreated === 1) {
    trackMilestone('1st_scene_created');
  } else if (scenesCreated === 5) {
    // Show email popup once, the first time the 5th-scene milestone fires
    // (deleting back down to 5 and re-adding one must not re-show it).
    if (!hasMilestoneFired('5th_scene_created')) showEmailPopup();
    trackMilestone('5th_scene_created');
  }

  recordDataEdit();
  saveState();
}

function cancelNewScene() {
  pendingInsert = null;
  document.getElementById('sc-title').value = '';
  document.getElementById('sc-summary').value = '';
  document.getElementById('sc-notes').value = '';
  document.getElementById('sc-wordcount').value = '';
  document.querySelectorAll('#form-new .ck-drop-list input').forEach(c => { c.checked = false; });
  SECS.forEach(({ key, label }) => { const w = document.getElementById('ck-' + key + '-wrap'); if (w) updateCkDropLabel(w, label); });
  const scPovWrap = document.getElementById('sc-povs-wrap'); if (scPovWrap) updateCkDropLabel(scPovWrap, 'POV names');
  document.querySelectorAll('.ck-drop-wrap.open').forEach(w => w.classList.remove('open'));
  const secSel = document.getElementById('sc-section');
  if (secSel) secSel.value = '';
  document.getElementById('scerr').textContent = '';
  setNewSceneLive(false);
}

function deleteScene(id) {
  const sc = S.scenes.find(s => s.id === id); if (!sc) return;
  if (!confirm(`Delete "${sc.title}"?`)) return;
  pushHistory('Delete scene "' + truncStr(sc.title, 22) + '"');
  trackSceneDeleted();
  S.scenes = S.scenes.filter(s => s.id !== id);
  S.selIds.delete(id);
  if (S.editingId === id) cancelEdit();
  renderBoard();
  renderPovLibSec();
  recordDataEdit();
  saveState();
}

function clearCardSel() {
  S.selIds.clear(); document.getElementById('clrsel').style.display = 'none'; renderBoard();
}

// ── EDIT MODE ─────────────────────────────────────────────────────────────────
function openEditMode(id) {
  const sc = S.scenes.find(s => s.id === id); if (!sc) return;
  // Auto-open center panel if collapsed
  if (document.getElementById('cp').classList.contains('collapsed')) togglePanel('cp');
  S.editingId = id;
  document.getElementById('ed-title').value   = sc.title;
  document.getElementById('ed-summary').value = sc.summary || '';
  document.getElementById('ed-notes').value   = sc.notes || '';
  document.getElementById('ed-wordcount').value = sc.wordCount || '';
  renderPovCk('ed', sc.povs || []);
  document.getElementById('ederr').textContent = '';
  if (S.sections.length) {
    document.getElementById('ed-section').value = sc.sectionId || '';
  }
  SECS.forEach(({ key }) => renderEditCk(key, sc[key] || []));
  document.getElementById('tab-edit').disabled = false;
  document.getElementById('tab-edit').classList.remove('dim');
  switchTab('edit');
}
function cancelEdit() {
  S.editingId = null; switchTab('new');
  document.getElementById('tab-edit').disabled = true;
  document.getElementById('tab-edit').classList.add('dim');
  document.getElementById('ederr').textContent = '';
}
// Does the live Edit Scene form differ from the scene's last-saved values?
// Mirrors exactly what confirmSaveEdit() reads/writes, field for field, so a
// scene that's merely open for viewing (nothing changed) never triggers a
// discard confirmation — only genuine unsaved edits do.
function isEditFormDirty() {
  const sc = S.scenes.find(s => s.id === S.editingId);
  if (!sc) return false;
  if (document.getElementById('ed-title').value.trim() !== sc.title.trim()) return true;
  if (document.getElementById('ed-summary').value.trim() !== (sc.summary || '')) return true;
  if (document.getElementById('ed-notes').value.trim() !== (sc.notes || '')) return true;
  if ((parseInt(document.getElementById('ed-wordcount').value) || null) !== (sc.wordCount || null)) return true;
  if (S.sections.length) {
    const sectionId = parseInt(document.getElementById('ed-section').value) || null;
    if (sectionId !== (sc.sectionId ?? null)) return true;
  }
  for (const { key } of SECS) {
    const checked  = [...document.querySelectorAll(`#ek-${key} input:checked`)].map(c => c.value).sort();
    const original = [...(sc[key] || [])].sort();
    if (JSON.stringify(checked) !== JSON.stringify(original)) return true;
  }
  const checkedPovs  = ckCurrentlyChecked('ed', 'povs').sort();
  const originalPovs = [...(sc.povs || [])].sort();
  if (JSON.stringify(checkedPovs) !== JSON.stringify(originalPovs)) return true;
  return false;
}
// ── DISCARD CONFIRMATION (unsaved New/Edit scene) ─────────────────────────────
let pendingDiscard = null; // { editActive, newLive } — what to discard if confirmed
function openDiscardConfirm(editActive, newLive) {
  pendingDiscard = { editActive, newLive };
  const msgEl = document.getElementById('discard-cfm-msg');
  if (editActive) {
    const sc = S.scenes.find(s => s.id === S.editingId);
    msgEl.textContent = sc
      ? `Discard changes to Scene ${sceneDisplayNum(sc.id)} — "${sc.title}"? Your edits will be lost.`
      : 'Discard your changes? They will be lost.';
  } else {
    msgEl.textContent = 'Discard this new scene? Your entries will be lost.';
  }
  document.getElementById('discard-cfm-modal').classList.add('open');
}
function closeDiscardConfirm() {
  document.getElementById('discard-cfm-modal').classList.remove('open');
  pendingDiscard = null;
}
function confirmDiscard() {
  if (!pendingDiscard) return;
  const { editActive, newLive } = pendingDiscard;
  closeDiscardConfirm();
  if (editActive) cancelEdit();
  if (newLive) cancelNewScene();
}
// Escape-key path to cancelEdit(): skip the prompt entirely when nothing
// would actually be lost, same rule as the outside-click handler below.
function maybeCancelEditWithConfirm() {
  // If the confirm is already showing, Escape dismisses IT (keeps editing)
  // rather than re-opening it — this function runs inside the same handler
  // that also fires many other one-shot "close if open" calls, so it must
  // not both open and close the modal within a single keypress.
  if (document.getElementById('discard-cfm-modal').classList.contains('open')) { closeDiscardConfirm(); return; }
  if (S.editingId === null) return;
  if (isEditFormDirty()) { openDiscardConfirm(true, false); return; }
  cancelEdit();
}
if (document.getElementById('discard-cfm-modal')) onBackdropClick('discard-cfm-modal', closeDiscardConfirm);
function saveEdit() {
  const sc = S.scenes.find(s => s.id === S.editingId); if (!sc) return;
  const titleEl = document.getElementById('ed-title'), errEl = document.getElementById('ederr');
  const title = titleEl.value.trim();
  errEl.textContent = '';
  if (!title) { errEl.textContent = 'Please enter a title.'; titleEl.focus(); return; }
  if (S.scenes.some(s => s.id !== sc.id && s.title.toLowerCase() === title.toLowerCase())) { errEl.textContent = 'Title already exists.'; titleEl.select(); return; }
  const sceneNum = sceneDisplayNum(sc.id);
  document.getElementById('savecfm-msg').textContent = `Save changes to Scene ${sceneNum} — "${title}"?`;
  document.getElementById('savecfm-modal').classList.add('open');
}
function confirmSaveEdit() {
  const sc = S.scenes.find(s => s.id === S.editingId); if (!sc) return;
  const title = document.getElementById('ed-title').value.trim();
  const summary = document.getElementById('ed-summary').value.trim();
  const sectionId = S.sections.length ? (parseInt(document.getElementById('ed-section').value) || null) : null;
  pushHistory('Edit scene "' + truncStr(sc.title, 22) + '"');
  const oldSecId = sc.sectionId ?? null;
  sc.title = title; sc.summary = summary; sc.notes = document.getElementById('ed-notes').value.trim();
  sc.wordCount = parseInt(document.getElementById('ed-wordcount').value) || null;
  sc.povs = ckCurrentlyChecked('ed', 'povs');
  if (S.sections.length) sc.sectionId = sectionId;
  SECS.forEach(({ key }) => { sc[key] = [...document.querySelectorAll(`#ek-${key} input:checked`)].map(c => c.value); });
  // If section changed, move scene to end of new section so numbering stays sequential
  if (S.sections.length && sectionId !== oldSecId) {
    const idx = S.scenes.indexOf(sc);
    if (idx !== -1) S.scenes.splice(idx, 1);
    let insertIdx = -1;
    S.scenes.forEach((s, i) => { if (s.sectionId === sectionId) insertIdx = i; });
    if (insertIdx === -1) S.scenes.push(sc); else S.scenes.splice(insertIdx + 1, 0, sc);
  }
  closeSaveCfm(); cancelEdit(); renderSecPanel(); renderBoard();
  renderPovLibSec();
  recordDataEdit();
  saveState();
}
function closeSaveCfm() { document.getElementById('savecfm-modal').classList.remove('open'); }
function setNewSceneLive(on) {
  document.getElementById('tab-new').classList.toggle('live', on);
}
function checkNewSceneLive() {
  const hasContent = !!(
    document.getElementById('sc-title').value.trim() ||
    document.getElementById('sc-summary').value.trim() ||
    document.getElementById('sc-notes').value.trim() ||
    document.getElementById('sc-wordcount').value.trim() ||
    document.querySelectorAll('#form-new .ck-drop-list input:checked').length
  );
  setNewSceneLive(hasContent);
}

function switchTab(t) {
  document.getElementById('tab-new').classList.toggle('on', t === 'new');
  document.getElementById('tab-edit').classList.toggle('on', t === 'edit');
  document.getElementById('form-new').style.display  = t === 'new'  ? '' : 'none';
  document.getElementById('form-edit').style.display = t === 'edit' ? '' : 'none';
}

// ── SUMMARY MODAL ─────────────────────────────────────────────────────────────
function openModal(id) {
  const sc = S.scenes.find(s => s.id === id); if (!sc) return;
  const hasInfo = !!(sc.summary || sc.notes); if (!hasInfo) return;
  document.getElementById('mnum').textContent = `Scene ${sceneDisplayNum(sc.id)}`;
  document.getElementById('mtit').textContent = sc.title;
  const sumSec = document.getElementById('msum-section'), sumEl = document.getElementById('msum');
  const notesSec = document.getElementById('mnotes-section'), notesEl = document.getElementById('mnotes');
  sumSec.style.display = sc.summary ? '' : 'none'; if (sc.summary) sumEl.textContent = sc.summary;
  notesSec.style.display = sc.notes ? '' : 'none'; if (sc.notes) notesEl.textContent = sc.notes;
  document.getElementById('modal').classList.add('open');
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }
if (document.getElementById('modal')) {
  onBackdropClick('modal', closeModal);
  onBackdropClick('libdel-modal', closeLibDelModal);
  onBackdropClick('savecfm-modal', closeSaveCfm);
  onBackdropClick('secdel-modal', closeSecDelModal);
  document.getElementById('sec-add-inp').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addSection(); }
  });
}

// ── RENDER ALL LIBRARY SECTIONS ───────────────────────────────────────────────
function renderAllLib() { SECS.forEach(s => renderLibSec(s.key)); renderPovLibSec(); }

// ── BUILD LIBRARY PANEL ───────────────────────────────────────────────────────
function buildLibPanel() {
  const body = document.getElementById('lp-body');
  // Remove dynamically-built sections only; static elements (ao-global-wrap, lib-clr-wrap) stay
  body.querySelectorAll('.lsec').forEach(el => el.remove());
  SECS.forEach(({ key, label }) => {
    const sec = document.createElement('div'); sec.className = 'lsec';
    const hdr = document.createElement('div'); hdr.className = 'lsec-hdr';
    const h3 = document.createElement('h3'); h3.textContent = label;
    const addBtn = document.createElement('button'); addBtn.className = 'lsec-add'; addBtn.textContent = '+'; addBtn.title = 'Add to ' + label;
    addBtn.addEventListener('click', () => openAddPopup(key));
    hdr.appendChild(h3); hdr.appendChild(addBtn);
    const il = document.createElement('div'); il.className = 'ilist'; il.id = 'il-' + key;
    il.innerHTML = '<div class="eh">None yet</div>';
    sec.appendChild(hdr); sec.appendChild(il);
    body.appendChild(sec);
  });
  // POV section: read-only, highlight-only — POV names are assigned and
  // added from the scene form's checklist, not managed here, so this section
  // has no "+" button and only lists names currently in use by a scene.
  const povSec = document.createElement('div'); povSec.className = 'lsec';
  const povHdr = document.createElement('div'); povHdr.className = 'lsec-hdr';
  const povH3 = document.createElement('h3'); povH3.textContent = 'POV';
  povHdr.appendChild(povH3);
  const povList = document.createElement('div'); povList.className = 'ilist'; povList.id = 'il-povs';
  povList.innerHTML = '<div class="eh">None yet</div>';
  povSec.appendChild(povHdr); povSec.appendChild(povList);
  body.appendChild(povSec);
}

// ── RENDER: LIBRARY SECTION ───────────────────────────────────────────────────
function renderLibSec(sec) {
  const cfg  = SECS.find(s => s.key === sec);
  const list = document.getElementById('il-' + sec); if (!list) return;
  list.innerHTML = '';
  if (!S[sec].length) { list.innerHTML = '<div class="eh">None yet</div>'; return; }
  S[sec].forEach((item, idx) => {
    const name = item.name;
    const isOn = S.selections[sec].has(name);
    const li = document.createElement('div');
    li.className = 'li' + (isOn ? ' on ' + cfg.secCls : '');
    li.dataset.idx = idx; li.dataset.sec = sec;
    const dh  = document.createElement('span'); dh.className = 'dh'; dh.textContent = '⠿';
    const dot = document.createElement('span'); dot.className = 'dot ' + cfg.dot;
    const nm   = document.createElement('span');   nm.className   = 'iname'; nm.textContent = name;
    if (item.notes) { nm.title = item.notes; }
    const edit = document.createElement('button'); edit.className = 'iedit'; edit.title = 'Edit'; edit.textContent = '✎';
    const del  = document.createElement('button'); del.className  = 'idel';  del.title = 'Remove'; del.textContent = '×';
    edit.addEventListener('mousedown', e => e.stopPropagation());
    edit.addEventListener('click',     e => { e.stopPropagation(); openLibEditModal(sec, idx); });
    del.addEventListener('mousedown',  e => e.stopPropagation());
    del.addEventListener('click',      e => { e.stopPropagation(); openLibDelModal(sec, name); });
    li.appendChild(dh); li.appendChild(dot); li.appendChild(nm); li.appendChild(edit); li.appendChild(del);
    li.addEventListener('click', () => toggleLibItem(sec, name));
    dh.addEventListener('mousedown', e => startLibDrag(e, sec, idx));
    list.appendChild(li);
  });
}

// ── RENDER: CHECKLISTS ────────────────────────────────────────────────────────
function renderAllCk() { SECS.forEach(s => { renderCk(s.key); renderEditCk(s.key); }); }
function renderCkList(prefix, sec, checked=[]) {
  const wrap = document.getElementById(prefix + '-' + sec + '-wrap');
  const box  = document.getElementById(prefix + '-' + sec); if (!box) return;
  const btn  = wrap ? wrap.querySelector('.ck-drop-btn') : null;
  const lbl  = SECS.find(s => s.key === sec)?.label || sec;
  box.innerHTML = '';
  // "+ Add" trigger, always first — lets the user add a missing library item
  // without leaving/losing the in-progress scene form (see openAddPopupFromCk).
  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'ck-drop-add';
  addBtn.textContent = '+ Add ' + SINGULAR[sec] + '…';
  addBtn.addEventListener('click', e => { e.stopPropagation(); openAddPopupFromCk(prefix, sec); });
  box.appendChild(addBtn);
  if (!S[sec].length) {
    const empty = document.createElement('div'); empty.className = 'ck-drop-empty';
    empty.textContent = 'No ' + lbl.toLowerCase() + ' yet';
    box.appendChild(empty);
    if (btn) btn.textContent = 'No ' + lbl.toLowerCase() + ' selected';
    return;
  }
  S[sec].forEach(libItem => {
    const name = libItem.name;
    const item = document.createElement('label'); item.className = 'ck-drop-item';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = name; cb.checked = checked.includes(name);
    cb.addEventListener('change', () => { if (wrap) updateCkDropLabel(wrap, lbl); });
    const sp = document.createElement('span'); sp.textContent = name;
    item.appendChild(cb); item.appendChild(sp); box.appendChild(item);
  });
  if (wrap) updateCkDropLabel(wrap, lbl);
}
function renderCk(sec, checked=[]) { renderCkList('ck', sec, checked); }
function renderEditCk(sec, checked=[]) { renderCkList('ek', sec, checked); }

// ── RENDER: BOARD ─────────────────────────────────────────────────────────────
// Builds a scene id -> 1-based display number map in one pass, based on visual
// board order: unassigned scenes first (leftmost), then each section in
// S.sections order. This ensures numbers run 1…N left-to-right across ALL
// sections regardless of the underlying S.scenes array order.
// Callers that need every scene's number in the same pass (rendering all
// cards, or all chart segments) should build this once and look up by id,
// rather than each calling sceneDisplayNum() — which rebuilds this same
// ordered list from scratch on every single call.
function buildSceneNumMap() {
  const map = new Map();
  let ordered = S.scenes;
  if (S.sections.length) {
    const validSecIds = new Set(S.sections.map(s => s.id));
    ordered = [
      ...S.scenes.filter(s => !validSecIds.has(s.sectionId)),           // unassigned
      ...S.sections.flatMap(sec => S.scenes.filter(s => s.sectionId === sec.id)), // each section in order
    ];
  }
  ordered.forEach((s, i) => map.set(s.id, i + 1));
  return map;
}
function sceneDisplayNum(sceneId) {
  return buildSceneNumMap().get(sceneId) ?? 1;
}

function renderCard(container, scene, idx, numMap) {
  const isd = drag.on && drag.ids.includes(scene.id);
  const sel = S.selIds.has(scene.id);
  const dpb = drag.on && drag.dropId === scene.id && drag.before;
  const dpa = drag.on && drag.dropId === scene.id && !drag.before;
  let hlCls = '';
  if (searchQ)         { if (sceneMatchesSearch(scene)) hlCls = 'hl-s'; }
  else                 { if (sceneMatchesLib(scene))    hlCls = 'hl';   }
  const card = document.createElement('div');
  card.className = ['sc', isd?'isd':'', sel?'sel':'', hlCls, dpb?'dpb':'', dpa?'dpa':''].filter(Boolean).join(' ');
  card.dataset.id = scene.id;
  const bar    = document.createElement('div');    bar.className    = 'sc-bar';
  const badge  = document.createElement('div');    badge.className  = 'sbadge'; badge.textContent = '✓';
  const delbtn = document.createElement('button'); delbtn.className = 'cdel';   delbtn.title = 'Delete'; delbtn.textContent = '×';
  const hasInfo = !!(scene.summary || scene.notes);
  const sumbtn = document.createElement('button'); sumbtn.className = 'csum' + (hasInfo ? ' hs' : ''); sumbtn.title = hasInfo ? 'View summary / notes' : ''; sumbtn.textContent = 'ⓘ'; if (!hasInfo) sumbtn.style.visibility = 'hidden';
  const editbtn= document.createElement('button'); editbtn.className= 'cedit';  editbtn.title = 'Edit scene'; editbtn.textContent = '✏️';
  delbtn.addEventListener('mousedown', e => e.stopPropagation());
  delbtn.addEventListener('click', e => { e.stopPropagation(); deleteScene(scene.id); });
  sumbtn.addEventListener('mousedown', e => e.stopPropagation());
  sumbtn.addEventListener('click', e => { e.stopPropagation(); if (hasInfo) openModal(scene.id); });
  editbtn.addEventListener('mousedown', e => e.stopPropagation());
  editbtn.addEventListener('click', e => { e.stopPropagation(); openEditMode(scene.id); });
  const num  = document.createElement('div'); num.className  = 'cnum'; num.textContent = `Scene ${numMap.get(scene.id) ?? 1}`;
  const tit  = document.createElement('div'); tit.className  = 'ctit'; tit.textContent = scene.title;
  const meta = document.createElement('div'); meta.className = 'cmeta';
  SECS.forEach(({ key, label, tag }) => {
    if (!scene[key] || !scene[key].length) return;
    const row  = document.createElement('div'); row.className  = 'crow';
    const lbl  = document.createElement('div'); lbl.className  = 'clbl'; lbl.textContent = label;
    const tags = document.createElement('div'); tags.className = 'ctags';
    scene[key].forEach(v => { const t = document.createElement('span'); t.className = 'tag ' + tag; t.textContent = v; tags.appendChild(t); });
    row.appendChild(lbl); row.appendChild(tags); meta.appendChild(row);
  });
  if (scene.povs && scene.povs.length) {
    const row  = document.createElement('div'); row.className  = 'crow';
    const lbl  = document.createElement('div'); lbl.className  = 'clbl'; lbl.textContent = 'POV';
    const tags = document.createElement('div'); tags.className = 'ctags';
    scene.povs.forEach(v => { const t = document.createElement('span'); t.className = 'tag tp'; t.textContent = v; tags.appendChild(t); });
    row.appendChild(lbl); row.appendChild(tags); meta.appendChild(row);
  }
  card.appendChild(bar); card.appendChild(badge); card.appendChild(delbtn); card.appendChild(sumbtn); card.appendChild(editbtn);
  card.appendChild(num); card.appendChild(tit); card.appendChild(meta);
  card.addEventListener('mousedown', e => onCardDown(e, scene.id));
  container.appendChild(card);
}

function renderBoard() {
  if (typeof chartMode !== 'undefined' && chartMode) { renderChart(); return; }
  const board = document.getElementById('board'), emp = document.getElementById('sbemp');
  board.innerHTML = '';
  document.querySelectorAll('.sec-pin').forEach(p => p.remove()); // clear body-level pins
  updateCount();
  const hasSecs = S.sections.length > 0;
  board.classList.toggle('has-secs', hasSecs);
  if (!S.scenes.length) { emp.style.display='flex'; return; }
  emp.style.display = 'none';

  // Built once per render pass and shared by every card below, instead of
  // each card independently rebuilding the same ordered scene list just to
  // look up its own number.
  const numMap = buildSceneNumMap();

  if (!hasSecs) {
    // Original flat layout
    S.scenes.forEach((scene, idx) => renderCard(board, scene, idx, numMap));
  } else {
    // Section group layout
    const validSecIds = new Set(S.sections.map(s => s.id));
    const unassigned  = S.scenes.filter(s => !validSecIds.has(s.sectionId));
    const allGroups   = [
      { id: null, name: 'Unassigned', scenes: unassigned, isUnasgn: true },
      ...S.sections.map(sec => ({ id: sec.id, name: sec.name, scenes: S.scenes.filter(s => s.sectionId === sec.id), isUnasgn: false })),
    ];
    let groups;
    if (secFilterIds.size === 0) {
      groups = allGroups.filter(g => !g.isUnasgn || g.scenes.length > 0);
    } else {
      groups = allGroups.filter(g => g.isUnasgn ? secFilterIds.has('unassigned') : secFilterIds.has(g.id));
    }

    groups.forEach(group => {
      const secGrp = document.createElement('div');
      const isDragOver = drag.on && drag.dropId === null && (
        (group.isUnasgn && drag.dropSecId === 0) ||
        (!group.isUnasgn && drag.dropSecId === group.id)
      );
      secGrp.className = 'sec-group' + (group.isUnasgn ? ' sec-unasgn' : '') + (isDragOver ? ' card-drag-over' : '');
      if (group.id !== null) secGrp.dataset.secId = group.id;
      else secGrp.dataset.secId = '0';

      // Header
      const hdr = document.createElement('div'); hdr.className = 'sec-hdr';
      const nameEl = document.createElement('span'); nameEl.className = 'sec-name'; nameEl.textContent = group.name;
      const cntEl = document.createElement('span'); cntEl.className = 'sec-cnt';
      cntEl.textContent = `${group.scenes.length} scene${group.scenes.length !== 1 ? 's' : ''}`;
      hdr.appendChild(nameEl); hdr.appendChild(cntEl);

      // Body
      const body = document.createElement('div'); body.className = 'sec-body';

      let secColor = null;
      if (!group.isUnasgn) {
        const sec = S.sections.find(s => s.id === group.id);
        if (sec && sec.color) {
          secColor = sec.color;
          hdr.style.background = `color-mix(in srgb, ${sec.color} 20%, var(--bg1))`;
          hdr.style.borderBottomColor = `color-mix(in srgb, ${sec.color} 30%, var(--s1))`;
          body.style.backgroundColor = `color-mix(in srgb, ${sec.color} 7%, var(--sbg))`;
          secGrp.style.borderRightColor = `color-mix(in srgb, ${sec.color} 25%, var(--s1))`;
        }
      }

      group.scenes.forEach(scene => {
        const wrap = document.createElement('div'); wrap.className = 'card-wrap';
        body.appendChild(wrap);
        renderCard(wrap, scene, S.scenes.indexOf(scene), numMap);
        addInsertZone(wrap, scene.id, group.id);
      });
      // For empty sections, show a single insert zone so the column is still usable
      if (group.scenes.length === 0) addInsertZone(body, null, group.id);

      // Sticky pin label: appended to body so no stacking context clips it
      if (!group.isUnasgn) {
        const pin = document.createElement('div');
        pin.className = 'sec-pin';
        pin.dataset.secId = group.id;
        pin.textContent = group.name;
        const sec = S.sections.find(s => s.id === group.id);
        if (sec && sec.color) {
          pin.style.background = `color-mix(in srgb, ${sec.color} 22%, var(--bg1))`;
          pin.style.borderBottomColor = `color-mix(in srgb, ${sec.color} 30%, var(--s1))`;
        } else { pin.style.background = 'var(--bg1)'; }
        document.body.appendChild(pin);
      }

      secGrp.appendChild(hdr); secGrp.appendChild(body);
      board.appendChild(secGrp);
    });
  }
  document.getElementById('clrsel').style.display = S.selIds.size > 0 ? 'inline-block' : 'none';
  if (hasSecs) alignSecHeaders();
}

// ── ALIGN SECTION HEADERS ─────────────────────────────────────────────────────
// After render, measure each sec-body's actual card extent (including overflow columns)
// and set explicit widths on the header and group so the header spans all card columns.
function alignSecHeaders() {
  // Clear any previously-set explicit widths first so natural layout takes effect
  document.querySelectorAll('.sec-group').forEach(grp => {
    grp.style.width = '';
    const h = grp.querySelector('.sec-hdr');
    if (h) h.style.width = '';
  });
  // One rAF: browser re-lays-out with cleared widths, then we measure card extents
  requestAnimationFrame(() => {
    const cs = parseFloat(document.getElementById('board').style.getPropertyValue('--cs') || '1') || 1;
    const minW = Math.ceil((174 + 24) * cs); // at minimum: one card width + 12px padding each side
    document.querySelectorAll('.sec-group').forEach(grp => {
      const hdr = grp.querySelector('.sec-hdr');
      if (!hdr) return;
      let w = minW;
      const gl = grp.getBoundingClientRect().left;
      // Measure the rightmost edge of any card relative to this group's left edge
      grp.querySelectorAll('.sc').forEach(c => {
        const r = c.getBoundingClientRect();
        w = Math.max(w, Math.ceil(r.right - gl + 12)); // +12 = right padding
      });
      hdr.style.width = w + 'px';
      grp.style.width = w + 'px';
    });
    updateSecPins(); // re-sync pins after widths settle
  });
}

// ── STICKY SECTION HEADER PINS ────────────────────────────────────────────────
// When a section's header has scrolled off to the left, slide a compact pin label
// into view at the left edge of the storyboard panel so the section name is always
// visible while the user scrolls horizontally.
function updateSecPins() {
  const sbp = document.getElementById('sbp');
  if (!sbp) return;
  const sbpRect = sbp.getBoundingClientRect();
  const allGrps = [...document.querySelectorAll('.sec-group')];
  document.querySelectorAll('.sec-pin[data-sec-id]').forEach(pin => {
    const grp = document.querySelector(`.sec-group[data-sec-id="${pin.dataset.secId}"]`);
    if (!grp) { pin.style.opacity = '0'; return; }
    const grpRect  = grp.getBoundingClientRect();
    const hdr      = grp.querySelector('.sec-hdr');
    // Find the next sibling section group (if any) to know when to hide the pin.
    const grpIdx   = allGrps.indexOf(grp);
    const nextGrp  = allGrps[grpIdx + 1];
    const nextLeft = nextGrp ? nextGrp.getBoundingClientRect().left : Infinity;
    // Pin's right edge in viewport = sbpRect.left + pin width.
    // Hide as soon as the next group's left edge reaches the pin's right edge.
    const pinW = pin.getBoundingClientRect().width || pin.offsetWidth || 80;
    if (grpRect.left < sbpRect.left && nextLeft > sbpRect.left + pinW) {
      pin.style.left    = sbpRect.left + 'px';
      pin.style.top     = (hdr ? hdr.getBoundingClientRect().top : sbpRect.top) + 'px';
      pin.style.opacity = '1';
    } else {
      pin.style.opacity = '0';
    }
  });
}

function updateCount() {
  const n = S.scenes.length;
  document.getElementById('sbcnt').textContent = `${n} scene${n !== 1 ? 's' : ''}`;
}

// ── SECTION SELECTS (forms + filter) ──────────────────────────────────────────
function renderSectionSelects() {
  const hasSecs = S.sections.length > 0;
  document.getElementById('sc-sec-wrap').style.display = hasSecs ? '' : 'none';
  document.getElementById('ed-sec-wrap').style.display = hasSecs ? '' : 'none';
  document.getElementById('sec-filter-wrap').classList.toggle('vis', hasSecs);
  // Form dropdowns
  ['sc-section','ed-section'].forEach(id => {
    const sel = document.getElementById(id);
    const cur = sel.value;
    sel.innerHTML = '<option value="">Unassigned</option>';
    S.sections.forEach(sec => {
      const opt = document.createElement('option'); opt.value = sec.id; opt.textContent = sec.name;
      sel.appendChild(opt);
    });
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  });
  // Filter checkbox dropdown
  renderFilterDrop();
}

// ── POV (Point of View) ────────────────────────────────────────────────────────
// Multi-select checklist, exactly like Characters/Locations/etc, but sourced
// from the Character library UNION S.povCustomNames (not S.characters alone)
// — a scene's POV doesn't have to be tagged as a Character in that scene, or
// exist in the Character library at all, since a scene (often a full
// chapter here) can have several POV characters at once.
function povNames() {
  return [...S.characters.map(c => c.name), ...S.povCustomNames];
}
// Names actually assigned as POV on at least one scene — the Library panel's
// read-only POV section shows only these, so every entry is meaningful to
// click (a name with zero scenes would just highlight nothing).
function usedPovNames() {
  const used = new Set();
  S.scenes.forEach(sc => (sc.povs || []).forEach(n => used.add(n)));
  return povNames().filter(n => used.has(n));
}
function togglePovHighlight(name) {
  const s = S.selections.povs;
  if (s.has(name)) s.delete(name); else s.add(name);
  renderPovLibSec(); renderBoard(); updateLibClearBtn();
}
function renderPovLibSec() {
  const list = document.getElementById('il-povs'); if (!list) return;
  list.innerHTML = '';
  const names = usedPovNames();
  if (!names.length) { list.innerHTML = '<div class="eh">None yet</div>'; return; }
  names.forEach(name => {
    const isOn = S.selections.povs.has(name);
    const li = document.createElement('div');
    li.className = 'li' + (isOn ? ' on sec-p' : '');
    const dot = document.createElement('span'); dot.className = 'dot dp';
    const nm  = document.createElement('span'); nm.className = 'iname'; nm.textContent = name;
    li.appendChild(dot); li.appendChild(nm);
    li.addEventListener('click', () => togglePovHighlight(name));
    list.appendChild(li);
  });
}
// Any name in `checked` that isn't currently a valid option (a character
// since removed from the library, or a name saved before this feature
// existed) is folded into S.povCustomNames on the spot, so it becomes a
// normal, consistently-reusable option instead of a dead/lost selection.
function renderPovCk(prefix, checked=[]) {
  checked.forEach(name => {
    if (!S.characters.some(c => c.name === name) && !S.povCustomNames.includes(name)) {
      S.povCustomNames.push(name);
    }
  });
  const wrap = document.getElementById(prefix + '-povs-wrap');
  const box  = document.getElementById(prefix + '-povs'); if (!box) return;
  box.innerHTML = '';
  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'ck-drop-add';
  addBtn.textContent = '+ Add POV Name…';
  addBtn.addEventListener('click', e => { e.stopPropagation(); openPovAddFromCk(prefix); });
  box.appendChild(addBtn);
  const names = povNames();
  if (!names.length) {
    const empty = document.createElement('div'); empty.className = 'ck-drop-empty';
    empty.textContent = 'No POV names yet';
    box.appendChild(empty);
    if (wrap) updateCkDropLabel(wrap, 'POV names');
    return;
  }
  names.forEach(name => {
    const item = document.createElement('label'); item.className = 'ck-drop-item';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = name; cb.checked = checked.includes(name);
    cb.addEventListener('change', () => { if (wrap) updateCkDropLabel(wrap, 'POV names'); });
    const sp = document.createElement('span'); sp.textContent = name;
    item.appendChild(cb); item.appendChild(sp); box.appendChild(item);
  });
  if (wrap) updateCkDropLabel(wrap, 'POV names');
}
let povAddReturnPrefix = null; // which POV checklist ('sc'|'ed') to auto-check the new name in
function openPovAddFromCk(prefix) {
  povAddReturnPrefix = prefix;
  const inp = document.getElementById('pov-add-input');
  inp.value = '';
  document.getElementById('pov-add-modal').classList.add('open');
  setTimeout(() => inp.focus(), 60);
}
function closePovAddModal() {
  document.getElementById('pov-add-modal').classList.remove('open');
  povAddReturnPrefix = null;
}
function confirmPovAdd() {
  const inp = document.getElementById('pov-add-input');
  const name = inp.value.trim();
  if (!name) { inp.focus(); return; }
  if (S.characters.some(c => c.name === name) || S.povCustomNames.includes(name)) { inp.select(); return; }
  pushHistory('Add POV name "' + name + '"');
  S.povCustomNames.push(name);
  const scChecked = ckCurrentlyChecked('sc', 'povs');
  const edChecked = ckCurrentlyChecked('ed', 'povs');
  if (povAddReturnPrefix === 'sc') scChecked.push(name);
  if (povAddReturnPrefix === 'ed') edChecked.push(name);
  renderPovCk('sc', scChecked); renderPovCk('ed', edChecked);
  closePovAddModal();
  recordDataEdit();
  saveState();
}
if (document.getElementById('pov-add-input')) {
  document.getElementById('pov-add-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmPovAdd();
    if (e.key === 'Escape') closePovAddModal();
  });
}
if (document.getElementById('pov-add-modal')) onBackdropClick('pov-add-modal', closePovAddModal);

// ── SECTION FILTER ────────────────────────────────────────────────────────────
let secFilterIds = new Set(); // empty = show all sections

function toggleSecFilter() {
  const drop = document.getElementById('sec-filter-drop');
  if (!drop.classList.contains('open')) renderFilterDrop();
  drop.classList.toggle('open');
}
function closeSecFilter() {
  document.getElementById('sec-filter-drop')?.classList.remove('open');
}
function onSecFilterChange(id, checked) {
  if (id === 'all') {
    secFilterIds.clear();
  } else {
    if (checked) secFilterIds.add(id);
    else         secFilterIds.delete(id);
  }
  updateSecFilterBtn();
  renderFilterDrop(); // re-sync "All Sections" checkbox state
  renderBoard();
}
function updateSecFilterBtn() {
  const btn = document.getElementById('sec-filter-btn');
  if (!btn) return;
  if (secFilterIds.size === 0) {
    btn.textContent = 'All Sections ▾';
  } else if (secFilterIds.size === 1) {
    const id = [...secFilterIds][0];
    const sec = S.sections.find(s => s.id === id);
    btn.textContent = (sec ? sec.name : (id === 'unassigned' ? 'Unassigned' : '1 Section')) + ' ▾';
  } else {
    btn.textContent = secFilterIds.size + ' Sections ▾';
  }
}
function buildSecFilterItem(id, name, checked, color) {
  const lbl = document.createElement('label'); lbl.className = 'sec-fck';
  const ck  = document.createElement('input'); ck.type = 'checkbox'; ck.dataset.fid = id; ck.checked = checked;
  ck.addEventListener('change', e => onSecFilterChange(id, e.target.checked));
  lbl.appendChild(ck);
  if (color) {
    const dot = document.createElement('span'); dot.className = 'sec-li-dot'; dot.style.background = color;
    lbl.appendChild(dot);
  }
  const span = document.createElement('span'); span.className = 'sec-fck-name'; span.textContent = name; lbl.appendChild(span);
  return lbl;
}
function renderFilterDrop() {
  const drop = document.getElementById('sec-filter-drop'); if (!drop) return;
  drop.innerHTML = '';
  drop.appendChild(buildSecFilterItem('all', 'All Sections', secFilterIds.size === 0, null));
  if (S.sections.length) {
    const sep = document.createElement('div'); sep.className = 'sec-fck-sep'; drop.appendChild(sep);
    const validSecIds = new Set(S.sections.map(s => s.id));
    const hasUnassigned = S.scenes.some(s => !validSecIds.has(s.sectionId));
    if (hasUnassigned) drop.appendChild(buildSecFilterItem('unassigned', 'Unassigned', secFilterIds.has('unassigned'), null));
    S.sections.forEach(sec => drop.appendChild(buildSecFilterItem(sec.id, sec.name, secFilterIds.has(sec.id), sec.color)));
  }
  updateSecFilterBtn();
}

// ── SECTION MANAGEMENT ─────────────────────────────────────────────────────────
function addSection() {
  const inp = document.getElementById('sec-add-inp');
  const name = inp.value.trim();
  if (!name) { inp.focus(); return; }
  if (S.sections.some(s => s.name.toLowerCase() === name.toLowerCase())) { inp.select(); return; }
  pushHistory('Add section "' + truncStr(name, 22) + '"');
  trackSectionAdded();
  const color = SEC_COLORS[S.sections.length % SEC_COLORS.length];
  S.sections.push({ id: S.nextSecId++, name, color });

  // Track milestone: 2nd section created (based on sections created since user ID was generated)
  const sectionsCreated = getSectionsCreatedSinceIdCreation();
  if (sectionsCreated === 2) {
    trackMilestone('2nd_section_created');
  }

  inp.value = '';
  renderSecPanel(); renderSectionSelects(); renderBoard();
  recordDataEdit();
  saveState();
}

function deleteSection(id) {
  const sec = S.sections.find(s => s.id === id); if (!sec) return;
  secDelId = id;
  const count = S.scenes.filter(s => s.sectionId === id).length;
  document.getElementById('secdel-msg').textContent = count > 0
    ? `Delete section "${sec.name}"?\n\nThe ${count} scene${count!==1?'s':''} in it will become Unassigned.`
    : `Delete section "${sec.name}"?`;
  document.getElementById('secdel-modal').classList.add('open');
}
function closeSecDelModal() { document.getElementById('secdel-modal').classList.remove('open'); secDelId = null; }
function confirmSecDel() {
  if (secDelId === null) return;
  const id = secDelId;
  closeSecDelModal();
  const sec = S.sections.find(s => s.id === id); if (!sec) return;
  pushHistory('Delete section "' + truncStr(sec.name, 22) + '"');
  S.sections = S.sections.filter(s => s.id !== id);
  S.scenes.forEach(s => { if (s.sectionId === id) s.sectionId = null; });
  renderSecPanel(); renderSectionSelects(); renderBoard();
  recordDataEdit();
  saveState();
}

function renameSection(id, newName) {
  const sec = S.sections.find(s => s.id === id); if (!sec) return;
  newName = newName.trim();
  if (!newName || newName === sec.name) { renderSecPanel(); return; }
  if (S.sections.some(s => s.id !== id && s.name.toLowerCase() === newName.toLowerCase())) { renderSecPanel(); return; }
  pushHistory('Rename section to "' + truncStr(newName, 22) + '"');
  sec.name = newName;
  renderSecPanel(); renderSectionSelects(); renderBoard();
  recordDataEdit();
  saveState();
}

function colorSection(id, color) {
  const sec = S.sections.find(s => s.id === id); if (!sec) return;
  sec.color = color;
  recordDataEdit();
  saveState();
}

function quickSetup() {
  const n   = Math.min(20, Math.max(1, parseInt(document.getElementById('qs-n').value) || 3));
  const pfx = (document.getElementById('qs-pfx').value.trim() || 'Section');
  if (!confirm(`Create ${n} sections: "${pfx} 1" through "${pfx} ${n}"?`)) return;
  pushHistory('Quick setup: ' + n + ' sections');
  for (let i = 1; i <= n; i++) {
    const name = pfx + ' ' + i;
    if (!S.sections.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      const color = SEC_COLORS[S.sections.length % SEC_COLORS.length];
      S.sections.push({ id: S.nextSecId++, name, color });
    }
  }
  renderSecPanel(); renderSectionSelects(); renderBoard();
  recordDataEdit();
  saveState();
}

function renderSecPanel() {
  const list = document.getElementById('sec-list');
  if (!list) return;
  list.innerHTML = '';
  // Match renderBoard()'s definition of Unassigned: a scene whose sectionId
  // doesn't resolve to a real section (not just a falsy sectionId) — an
  // orphaned id (e.g. from an import) is possible and should count here too.
  const validSecIds = new Set(S.sections.map(s => s.id));
  const unassignedCnt = S.scenes.filter(s => !validSecIds.has(s.sectionId)).length;
  if (unassignedCnt > 0) {
    const li = document.createElement('div'); li.className = 'sec-li sec-li-unassigned';
    const nameEl = document.createElement('span'); nameEl.className = 'sec-li-name sec-li-name-dim'; nameEl.textContent = 'Unassigned';
    const cntEl = document.createElement('span'); cntEl.className = 'sec-li-cnt'; cntEl.textContent = unassignedCnt + ' scene' + (unassignedCnt !== 1 ? 's' : '');
    const gotoU = document.createElement('button'); gotoU.className = 'sec-li-goto'; gotoU.textContent = '→'; gotoU.title = 'Scroll to on board';
    gotoU.addEventListener('click', () => scrollToSection(0));
    li.appendChild(nameEl); li.appendChild(cntEl); li.appendChild(gotoU);
    list.appendChild(li);
  }
  if (!S.sections.length) {
    if (!unassignedCnt) list.innerHTML = '<div class="sec-empty-hint">No sections yet.</div>';
    return;
  }
  S.sections.forEach((sec, idx) => {
    const li = document.createElement('div'); li.className = 'sec-li'; li.dataset.idx = idx; li.dataset.secid = sec.id;
    const dh = document.createElement('span'); dh.className = 'sdh'; dh.textContent = '⠿';
    dh.addEventListener('mousedown', e => startSecListDrag(e, idx));
    const colorPick = document.createElement('input');
    colorPick.type = 'color'; colorPick.className = 'sec-color-pick';
    colorPick.value = sec.color || '#5b8dd9'; colorPick.title = 'Section color';
    colorPick.addEventListener('mousedown', e => e.stopPropagation());
    colorPick.addEventListener('input', e => {
      const s = S.sections.find(x => x.id === sec.id); if (!s) return;
      s.color = e.target.value; renderBoard();
    });
    colorPick.addEventListener('change', e => { colorSection(sec.id, e.target.value); renderBoard(); });
    const nameEl = document.createElement('span'); nameEl.className = 'sec-li-name'; nameEl.textContent = sec.name;
    nameEl.addEventListener('click', () => startSecRename(li, sec.id));
    const cnt = S.scenes.filter(s => s.sectionId === sec.id).length;
    const cntEl = document.createElement('span'); cntEl.className = 'sec-li-cnt'; cntEl.textContent = cnt + ' scene' + (cnt!==1?'s':'');
    const del = document.createElement('button'); del.className = 'sec-li-del'; del.textContent = '×'; del.title = 'Delete';
    del.addEventListener('mousedown', e => e.stopPropagation());
    del.addEventListener('click', e => { e.stopPropagation(); deleteSection(sec.id); });
    const goto = document.createElement('button'); goto.className = 'sec-li-goto'; goto.textContent = '→'; goto.title = 'Scroll to on board';
    goto.addEventListener('mousedown', e => e.stopPropagation());
    goto.addEventListener('click', e => { e.stopPropagation(); scrollToSection(sec.id); });
    li.appendChild(dh); li.appendChild(colorPick); li.appendChild(nameEl); li.appendChild(cntEl); li.appendChild(goto); li.appendChild(del);
    list.appendChild(li);
  });
}

function scrollToSection(secId) {
  const target = document.querySelector(`.sec-group[data-sec-id="${secId}"]`);
  if (!target) return;
  const scrl = document.getElementById('sbscrl');
  if (!scrl) return;
  const containerRect = scrl.getBoundingClientRect();
  const targetRect    = target.getBoundingClientRect();
  scrl.scrollTo({ left: scrl.scrollLeft + (targetRect.left - containerRect.left) - 10, behavior: 'smooth' });
}

function startSecRename(li, id) {
  const nameEl = li.querySelector('.sec-li-name'); if (!nameEl) return;
  const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'sec-li-edt';
  inp.value = nameEl.textContent; inp.maxLength = 60;
  li.replaceChild(inp, nameEl);
  inp.focus(); inp.select();
  let done = false;
  const finish = () => { if (done) return; done = true; renameSection(id, inp.value); };
  inp.addEventListener('blur', finish);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(); }
    if (e.key === 'Escape') { done = true; renderSecPanel(); }
  });
}

// ── SECTION LIST DRAG (in modal) ──────────────────────────────────────────────
const sld = { on:false, fromIdx:null, dropIdx:null, before:true };
function startSecListDrag(e, idx) {
  if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
  sld.on = true; sld.fromIdx = idx; sld.dropIdx = null;
}
function moveSecListDrag(e) {
  const list = document.getElementById('sec-list'); if (!list) return;
  const items = [...list.querySelectorAll('.sec-li')];
  items.forEach(i => i.classList.remove('dib','dia','dg'));
  const fromEl = items.find(i => +i.dataset.idx === sld.fromIdx); if (fromEl) fromEl.classList.add('dg');
  let ni = null, nb = true;
  for (const item of items) {
    if (+item.dataset.idx === sld.fromIdx) continue;
    const r = item.getBoundingClientRect();
    if (e.clientY >= r.top && e.clientY <= r.bottom) { ni = +item.dataset.idx; nb = e.clientY < r.top + r.height/2; break; }
  }
  if (ni !== null) { const tgt = items.find(i => +i.dataset.idx === ni); if (tgt) tgt.classList.add(nb?'dib':'dia'); }
  sld.dropIdx = ni; sld.before = nb;
}
function endSecListDrag() {
  const list = document.getElementById('sec-list');
  if (list) list.querySelectorAll('.sec-li').forEach(i => i.classList.remove('dib','dia','dg'));
  if (sld.dropIdx !== null && sld.dropIdx !== sld.fromIdx) {
    pushHistory('Reorder sections');
    const arr = S.sections;
    const [item] = arr.splice(sld.fromIdx, 1);
    let ti = sld.dropIdx > sld.fromIdx ? sld.dropIdx - 1 : sld.dropIdx;
    if (!sld.before) ti++;
    arr.splice(ti, 0, item);
    renderSecPanel(); renderSectionSelects(); renderBoard();
    recordDataEdit();
    saveState();
  }
  sld.on = false; sld.fromIdx = null; sld.dropIdx = null;
}

// ── CARD DRAG ─────────────────────────────────────────────────────────────────
const ptr  = { down:false, id:null, sx:0, sy:0, dragging:false };
const drag = { on:false, ids:[], ox:0, oy:0, dropId:null, before:true, dropSecId:null };

function onCardDown(e, id) {
  if (e.button !== 0) return; e.preventDefault();
  ptr.down = true; ptr.id = id; ptr.sx = e.clientX; ptr.sy = e.clientY; ptr.dragging = false;
}
function beginCardDrag(id, e) {
  const ids = (S.selIds.has(id) && S.selIds.size > 1)
    ? S.scenes.filter(s => S.selIds.has(s.id)).map(s => s.id)
    : [id];
  drag.on = true; drag.ids = ids; drag.dropId = null; drag.before = true;
  const card = document.querySelector(`.sc[data-id="${id}"]`), r = card.getBoundingClientRect();
  drag.ox = e.clientX - r.left; drag.oy = e.clientY - r.top;
  const sc = S.scenes.find(s => s.id === id), ghost = document.getElementById('ghost');
  ghost.innerHTML = '';
  const n = document.createElement('div'); n.className = 'cnum'; n.textContent = `Scene ${sceneDisplayNum(sc.id)}`;
  const t = document.createElement('div'); t.className = 'ctit'; t.textContent = sc.title;
  ghost.appendChild(n); ghost.appendChild(t);
  if (ids.length > 1) { const b = document.createElement('div'); b.className = 'gbadge'; b.textContent = `+${ids.length-1}`; ghost.appendChild(b); }
  ghost.style.display = 'block';
  ghost.style.left = (e.clientX - drag.ox) + 'px'; ghost.style.top = (e.clientY - drag.oy) + 'px';
  renderBoard();
}
function moveCardDrag(e) {
  const g = document.getElementById('ghost');
  g.style.left = (e.clientX - drag.ox) + 'px'; g.style.top = (e.clientY - drag.oy) + 'px';
  const cards = [...document.querySelectorAll('.sc')].filter(c => !drag.ids.includes(+c.dataset.id));
  let newId = null, newBef = true, newSecId = null;
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      newId = +c.dataset.id; newBef = e.clientY < r.top + r.height / 2; break;
    }
  }
  if (newId === null && S.sections.length) {
    for (const grp of document.querySelectorAll('.sec-group')) {
      const r = grp.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        newSecId = grp.dataset.secId ? parseInt(grp.dataset.secId) : 0;
        break;
      }
    }
  }
  if (newId !== drag.dropId || newBef !== drag.before || newSecId !== drag.dropSecId) {
    drag.dropId = newId; drag.before = newBef; drag.dropSecId = newSecId;
    // Toggle just the drop-indicator classes on the existing DOM instead of a
    // full renderBoard() (innerHTML wipe + rebuild) on every hover change —
    // nothing else about the board changes while just hovering during a drag.
    document.querySelectorAll('.sc.dpb, .sc.dpa').forEach(c => c.classList.remove('dpb', 'dpa'));
    document.querySelectorAll('.sec-group.card-drag-over').forEach(grp => grp.classList.remove('card-drag-over'));
    if (newId !== null) {
      const tgt = document.querySelector(`.sc[data-id="${newId}"]`);
      if (tgt) tgt.classList.add(newBef ? 'dpb' : 'dpa');
    } else if (newSecId !== null) {
      const grp = document.querySelector(`.sec-group[data-sec-id="${newSecId}"]`);
      if (grp) grp.classList.add('card-drag-over');
    }
  }
}
function endCardDrag() {
  document.getElementById('ghost').style.display = 'none';
  let changed = false;
  if (drag.dropId !== null) {
    pushHistory('Reorder scenes');
    const dragged = drag.ids.map(id => S.scenes.find(s => s.id === id)).filter(Boolean);
    const rest    = S.scenes.filter(s => !drag.ids.includes(s.id));
    const ti      = rest.findIndex(s => s.id === drag.dropId);
    // Cross-section: assign dropped cards to the target card's section
    if (S.sections.length) {
      const targetScene = S.scenes.find(s => s.id === drag.dropId);
      if (targetScene) {
        const targetSecId = targetScene.sectionId ?? null;
        dragged.forEach(s => { s.sectionId = targetSecId; });
      }
    }
    if (ti !== -1) rest.splice(drag.before ? ti : ti + 1, 0, ...dragged);
    S.scenes = rest; changed = true;
  } else if (drag.dropSecId !== null) {
    pushHistory('Assign to section');
    const targetSecId = drag.dropSecId === 0 ? null : drag.dropSecId;
    const dragged = drag.ids.map(id => S.scenes.find(s => s.id === id)).filter(Boolean);
    dragged.forEach(s => { s.sectionId = targetSecId; });
    // Also reorder in S.scenes: place dragged scenes after the last scene already
    // in the target section, so scene numbers update to reflect the new position.
    const rest = S.scenes.filter(s => !drag.ids.includes(s.id));
    let insertIdx = -1;
    rest.forEach((s, i) => { if (s.sectionId === targetSecId) insertIdx = i; });
    if (insertIdx === -1) rest.push(...dragged); else rest.splice(insertIdx + 1, 0, ...dragged);
    S.scenes = rest;
    changed = true;
  }
  // If a scene currently open in Edit mode was dragged, sync its section dropdown
  if (changed && S.editingId !== null && drag.ids.includes(S.editingId) && S.sections.length) {
    const editedScene = S.scenes.find(s => s.id === S.editingId);
    const edSel = document.getElementById('ed-section');
    if (edSel && editedScene) edSel.value = editedScene.sectionId || '';
  }
  drag.on = false; drag.ids = []; drag.dropId = null; drag.dropSecId = null;
  renderSecPanel(); renderBoard();
  if (changed) { recordDataEdit(); saveState(); }
}
function toggleCardSel(id, e) {
  if (e && (e.target.classList.contains('cdel') || e.target.classList.contains('csum') || e.target.classList.contains('cedit'))) return;
  if (S.selIds.has(id)) S.selIds.delete(id); else S.selIds.add(id);
  renderBoard();
  document.getElementById('clrsel').style.display = S.selIds.size > 0 ? 'inline-block' : 'none';
}

// ── LIB ITEM DRAG ─────────────────────────────────────────────────────────────
const ld = { on:false, sec:null, fromIdx:null, dropIdx:null, before:true };
function startLibDrag(e, sec, idx) {
  if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
  ld.on = true; ld.sec = sec; ld.fromIdx = idx; ld.dropIdx = null;
}
function moveLibDrag(e) {
  const list = document.getElementById('il-' + ld.sec); if (!list) return;
  const items = [...list.querySelectorAll('.li')];
  items.forEach(i => i.classList.remove('dib', 'dia', 'dg'));
  const fromEl = items.find(i => +i.dataset.idx === ld.fromIdx); if (fromEl) fromEl.classList.add('dg');
  let ni = null, nb = true;
  for (const item of items) {
    if (+item.dataset.idx === ld.fromIdx) continue;
    const r = item.getBoundingClientRect();
    if (e.clientY >= r.top && e.clientY <= r.bottom) { ni = +item.dataset.idx; nb = e.clientY < r.top + r.height / 2; break; }
  }
  if (ni !== null) { const tgt = items.find(i => +i.dataset.idx === ni); if (tgt) tgt.classList.add(nb ? 'dib' : 'dia'); }
  ld.dropIdx = ni; ld.before = nb;
}
function endLibDrag() {
  const list = document.getElementById('il-' + ld.sec);
  if (list) list.querySelectorAll('.li').forEach(i => i.classList.remove('dib', 'dia', 'dg'));
  if (ld.dropIdx !== null && ld.dropIdx !== ld.fromIdx) {
    pushHistory('Reorder ' + ld.sec);
    const arr = S[ld.sec];
    const [item] = arr.splice(ld.fromIdx, 1);
    let ti = ld.dropIdx > ld.fromIdx ? ld.dropIdx - 1 : ld.dropIdx;
    if (!ld.before) ti++;
    arr.splice(ti, 0, item);
    renderLibSec(ld.sec); renderCk(ld.sec, ckCurrentlyChecked('ck', ld.sec)); renderEditCk(ld.sec, ckCurrentlyChecked('ek', ld.sec));
    recordDataEdit();
    saveState();
  }
  ld.on = false; ld.sec = null; ld.fromIdx = null; ld.dropIdx = null;
}

// ── PANEL RESIZE ──────────────────────────────────────────────────────────────
function initPanelResize(panelId, handleId, min, max) {
  const dr = { on:false, startX:0, startW:0, panelId, handleId, min, max };
  document.getElementById(handleId).addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    dr.on = true; dr.startX = e.clientX; dr.startW = document.getElementById(panelId).offsetWidth;
    document.getElementById(handleId).classList.add('dragging');
    e.preventDefault(); e.stopPropagation();
  });
  return dr;
}
let lpDr = {on:false}, cpDr = {on:false}, spDr = {on:false};
if (document.getElementById('lp-resize')) {
  lpDr = initPanelResize('lp', 'lp-resize', 140, 480);
  cpDr = initPanelResize('cp', 'cp-resize', 180, 520);
  spDr = initPanelResize('sp', 'sp-resize', 150, 400);
}

// ── GLOBAL MOUSE ──────────────────────────────────────────────────────────────
document.addEventListener('mousemove', e => {
  if (ptr.down) {
    if (!ptr.dragging && (Math.abs(e.clientX - ptr.sx) > 4 || Math.abs(e.clientY - ptr.sy) > 4)) {
      ptr.dragging = true; beginCardDrag(ptr.id, e);
    }
    if (ptr.dragging) moveCardDrag(e);
  }
  if (ld.on)  moveLibDrag(e);
  if (sld.on) moveSecListDrag(e);
  [lpDr, cpDr, spDr].forEach(dr => {
    if (!dr.on) return;
    const newW = Math.max(dr.min, Math.min(dr.max, dr.startW + (e.clientX - dr.startX)));
    const panel = document.getElementById(dr.panelId);
    if (panel) panel.style.width = newW + 'px';
  });
});
document.addEventListener('mouseup', e => {
  if (ptr.down) {
    if (!ptr.dragging) toggleCardSel(ptr.id, e); else endCardDrag();
    ptr.down = false; ptr.dragging = false; ptr.id = null;
  }
  if (ld.on)  endLibDrag();
  if (sld.on) endSecListDrag();
  [lpDr, cpDr, spDr].forEach(dr => {
    if (!dr.on) return;
    dr.on = false;
    const handle = document.getElementById(dr.handleId);
    if (handle) handle.classList.remove('dragging');
  });
});

// ── CANCEL ON CLICK OUTSIDE SCENE PANEL ───────────────────────────────────────
// A click outside the panel with genuinely unsaved content (a dirty edit, or
// a New Scene form with something entered) confirms before discarding, since
// this is easy to trigger by accident. An edit that's merely open but
// unchanged has nothing to lose, so it's still dismissed silently.
document.addEventListener('mousedown', e => {
  const tabNew = document.getElementById('tab-new');
  if (!tabNew) return;
  const editActive = S.editingId !== null;
  const newLive    = tabNew.classList.contains('live');
  if (!editActive && !newLive) return;
  if (e.target.closest('#cp')) return;
  if (document.querySelector('.cfm-modal.open, #modal.open, #add-popup.open, #rpt-modal.open, #lib-edit-modal.open, #pov-add-modal.open')) return;
  const editDirty = editActive && isEditFormDirty();
  if (!editDirty && !newLive) {
    if (editActive) cancelEdit();
    return;
  }
  openDiscardConfirm(editDirty, newLive);
});

// ── ESCAPE KEY PRIORITY ───────────────────────────────────────────────────────
// Checked top-to-bottom on Escape; only the first isOpen() match runs its
// close(), then the loop stops. Order runs most "in front"/blocking first
// (modals), then floating chrome, then view modes, then board-content state.
const ESCAPE_ACTIONS = [
  { isOpen: () => document.getElementById('discard-cfm-modal')?.classList.contains('open'), close: closeDiscardConfirm },
  { isOpen: () => document.getElementById('modal')?.classList.contains('open'), close: closeModal },
  { isOpen: () => document.getElementById('add-popup')?.classList.contains('open'), close: closeAddPopup },
  { isOpen: () => document.getElementById('lib-edit-modal')?.classList.contains('open'), close: closeLibEditModal },
  { isOpen: () => document.getElementById('libdel-modal')?.classList.contains('open'), close: closeLibDelModal },
  { isOpen: () => document.getElementById('savecfm-modal')?.classList.contains('open'), close: closeSaveCfm },
  { isOpen: () => document.getElementById('secdel-modal')?.classList.contains('open'), close: closeSecDelModal },
  { isOpen: () => document.getElementById('rpt-modal')?.classList.contains('open'), close: closeReportModal },
  { isOpen: () => document.getElementById('pov-add-modal')?.classList.contains('open'), close: closePovAddModal },
  { isOpen: () => helpMode, close: closeHelp },
  { isOpen: () => document.getElementById('sec-filter-drop')?.classList.contains('open'), close: closeSecFilter },
  { isOpen: () => !!document.querySelector('#menu-bar .mi.open'), close: closeAllMenus },
  { isOpen: () => typeof chartMode !== 'undefined' && chartMode, close: closeChartView },
  { isOpen: () => S.editingId !== null, close: maybeCancelEditWithConfirm },
  { isOpen: () => !!searchQ, close: clearSearch },
  { isOpen: () => S.selIds.size > 0, close: clearCardSel },
  { isOpen: () => SECS.some(({ key }) => S.selections[key].size > 0) || S.selections.povs.size > 0, close: clearAllSel },
];

// ── KEYBOARD & STORYBOARD EVENT LISTENERS ────────────────────────────────────
if (document.getElementById('sc-title')) {
  document.getElementById('sc-title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); } });
  document.getElementById('form-new').addEventListener('input', checkNewSceneLive);
  document.getElementById('form-new').addEventListener('change', checkNewSceneLive);
  document.getElementById('ed-title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); } });
  document.getElementById('sbscrl').addEventListener('scroll', updateSecPins);
  onBackdropClick('rpt-modal', closeReportModal);
  window.addEventListener('resize', () => { if (S.sections.length) alignSecHeaders(); });
}
document.addEventListener('keydown', e => {
  const inInput = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
  // Ctrl / Cmd shortcuts
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    // The app autosaves on every change; swallow Ctrl+S so the browser's
    // Save Page dialog doesn't appear on muscle-memory presses.
    if (e.key === 's') { e.preventDefault(); return; }
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); if (typeof undo === 'function') undo(); return; }
    if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); if (typeof redo === 'function') redo(); return; }
    if (!inInput) {
      if (e.key === 'E') { e.preventDefault(); exportCurrentProject(); return; }
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); return; }
      if (e.key === '-') { e.preventDefault(); zoomOut(); return; }
      if (e.key === '0') { e.preventDefault(); zoomReset(); return; }
    }
  }
  // Alt shortcuts (not in an input field). Keyed off e.code, not e.key — on Mac,
  // Option+letter remaps e.key to an accented/symbol character (e.g. Option+V → "√",
  // Option+N → a dead key), so matching on e.key silently breaks every one of these.
  // e.code reports the physical key regardless of what the modifier composes.
  if (e.altKey && !e.ctrlKey && !e.metaKey && !inInput) {
    if (e.code === 'KeyN') { e.preventDefault(); menuNewScene(); return; }
    if (e.code === 'KeyC') { e.preventDefault(); openAddPopup('characters'); return; }
    if (e.code === 'KeyL') { e.preventDefault(); openAddPopup('locations'); return; }
    if (e.code === 'KeyT') { e.preventDefault(); openAddPopup('themes'); return; }
    if (e.code === 'KeyM') { e.preventDefault(); openAddPopup('misc'); return; }
    if (e.code === 'KeyR') { e.preventDefault(); openReportModal(); return; }
    if (e.code === 'KeyV') { e.preventDefault(); toggleChartView(); return; }
  }
  if (e.key === 'Escape') {
    // Close/clear only the single front-most thing, in priority order, and
    // stop — rather than running every close/clear handler unconditionally.
    // Previously, dismissing one modal also wiped card selections, library
    // highlights, and search in the same keystroke.
    for (const action of ESCAPE_ACTIONS) {
      try {
        if (action.isOpen()) { action.close(); break; }
      } catch(err) {}
    }
  }
});
// Close filter dropdown on click outside
document.addEventListener('mousedown', e => {
  const wrap = document.getElementById('sec-filter-wrap');
  if (wrap && !wrap.contains(e.target) && typeof closeSecFilter === 'function') closeSecFilter();
});
