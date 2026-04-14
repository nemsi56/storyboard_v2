'use strict';

// ── CONFIG ────────────────────────────────────────────────────────────────────
const SECS = [
  { key:'characters', label:'Characters', dot:'dc', secCls:'sec-c', tag:'tc', ph:'Character name…' },
  { key:'locations',  label:'Locations',  dot:'dl', secCls:'sec-l', tag:'tl', ph:'Location name…'  },
  { key:'themes',     label:'Themes',     dot:'dt', secCls:'sec-t', tag:'tt', ph:'Theme…'          },
  { key:'misc',       label:'Misc Items',  dot:'dm', secCls:'sec-m', tag:'tm', ph:'Topic…'          },
];
const SINGULAR = { characters:'Character', locations:'Location', themes:'Theme', misc:'Misc item' };
const SEC_COLORS = ['#5b8dd9','#6aaa80','#9b7cc4','#d4844a','#4aadb5','#c47a8a','#c4a84a','#7a8ea8'];

// ── MILESTONE TRACKING ────────────────────────────────────────────────────────
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mbdqjbnp';
const USER_ID_KEY = 'scenesetter_user_id';

function getUserId() {
  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}

function trackMilestone(milestone, metadata = {}) {
  const data = {
    user_id: getUserId(),
    milestone: milestone,
    timestamp: new Date().toLocaleString(),
    ...metadata
  };

  // Send to Formspree
  fetch(FORMSPREE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).catch(err => console.log('Milestone tracking failed:', err));

  // Also track in GA if available
  if (typeof gtag !== 'undefined') {
    gtag('event', 'user_milestone', { milestone: milestone });
  }
}

// ── EMAIL POPUP FUNCTIONS ──────────────────────────────────────────────────────
function showEmailPopup() {
  const popup = document.getElementById('email-popup');
  if (popup) {
    popup.style.display = 'block';
    setTimeout(() => popup.classList.add('open'), 10);
    const input = document.getElementById('email-input');
    if (input) input.focus();
  }
}

function closeEmailPopup() {
  const popup = document.getElementById('email-popup');
  if (popup) {
    popup.classList.remove('open');
    setTimeout(() => {
      popup.style.display = 'none';
      const input = document.getElementById('email-input');
      if (input) input.value = '';
    }, 200);
  }
}

function submitEmail() {
  const input = document.getElementById('email-input');
  const email = input ? input.value.trim() : '';

  if (!email) {
    alert('Please enter a valid email address');
    return;
  }

  // Validate email format (basic check)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert('Please enter a valid email address');
    return;
  }

  // Send email to Formspree
  const data = {
    user_id: getUserId(),
    email: email,
    type: 'email_signup',
    timestamp: new Date().toLocaleString()
  };

  fetch(FORMSPREE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(() => {
    // Close popup after successful submission
    closeEmailPopup();
    // Optional: show confirmation
    console.log('Email submitted successfully');
  }).catch(err => {
    console.log('Email submission failed:', err);
    alert('There was an issue submitting your email. Please try again.');
  });
}

// ── PERSISTENCE ───────────────────────────────────────────────────────────────
const DATA_VERSION = '2';
const STORAGE_KEY  = 'storyboard_v' + DATA_VERSION;
const LEGACY_KEY   = 'storyboard_v1';
const PROJECT_INDEX_KEY = 'scriptease_projects';
const GLOBAL_PREFS_KEY  = 'scriptease_prefs';
let currentProjectId = null;

function projKey(id) { return 'scriptease_proj_' + id; }
function genProjId() { return 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

function loadProjectIndex() {
  try { return JSON.parse(localStorage.getItem(PROJECT_INDEX_KEY)) || []; }
  catch(e) { return []; }
}
function saveProjectIndex(index) {
  try { localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(index)); } catch(e) {}
}
function loadGlobalPrefs() {
  try { return JSON.parse(localStorage.getItem(GLOBAL_PREFS_KEY)) || {}; }
  catch(e) { return {}; }
}
function saveGlobalPrefs(prefs) {
  try { localStorage.setItem(GLOBAL_PREFS_KEY, JSON.stringify(prefs)); } catch(e) {}
}

function saveState() {
  if (!currentProjectId) return;
  try {
    localStorage.setItem(projKey(currentProjectId), JSON.stringify({
      v: DATA_VERSION,
      characters: S.characters, locations: S.locations, themes: S.themes, misc: S.misc,
      scenes: S.scenes, nextId: S.nextId, andOr: S.andOr,
      theme: document.documentElement.dataset.theme,
      sections: S.sections, nextSecId: S.nextSecId,
    }));
    // Update project index metadata
    const index = loadProjectIndex();
    const entry = index.find(p => p.id === currentProjectId);
    if (entry) {
      entry.modifiedAt = new Date().toISOString();
      entry.sceneCount = S.scenes.length;
      entry.theme = document.documentElement.dataset.theme;
      saveProjectIndex(index);
    }
  } catch(e) { /* storage full or unavailable */ }
}

function loadState(storageKey) {
  try {
    const key = storageKey || STORAGE_KEY;
    let raw = localStorage.getItem(key);
    let migrated = false;
    if (!raw && !storageKey) {
      // Try migrating from v1
      const old = localStorage.getItem(LEGACY_KEY);
      if (!old) return false;
      const od = JSON.parse(old);
      if (!od || od.v !== '1') return false;
      raw = JSON.stringify({
        v: DATA_VERSION,
        characters: od.characters||[], locations: od.locations||[], themes: od.themes||[], misc: od.misc||[],
        scenes: (od.scenes||[]).map(sc => ({...sc, sectionId: null})),
        nextId: od.nextId||1, andOr: od.andOr, theme: od.theme,
        sections: [], nextSecId: 1,
      });
      migrated = true;
    }
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || d.v !== DATA_VERSION) return false;
    // Migrate plain strings to {name, notes} objects
    const toObj = arr => (arr || []).map(x => typeof x === 'string' ? { name: x, notes: '' } : x);
    S.characters = toObj(d.characters);
    S.locations  = toObj(d.locations);
    S.themes     = toObj(d.themes);
    S.misc       = toObj(d.misc);
    S.scenes = (d.scenes || []).map(sc => ({
      ...sc,
      characters: sc.characters || [], locations: sc.locations || [],
      themes: sc.themes || [],         misc: sc.misc || [],
      sectionId: sc.sectionId ?? null,
    }));
    S.nextId    = d.nextId    || 1;
    S.andOr     = d.andOr === 'AND' ? 'AND' : 'OR';
    S.sections  = d.sections  || [];
    S.sections.forEach(s => { if (!s.color) s.color = SEC_COLORS[S.sections.indexOf(s) % SEC_COLORS.length]; });
    S.nextSecId = d.nextSecId || 1;
    const VALID_THEMES = ['ivory','slate','studio','ocean','sunset'];
    const theme = VALID_THEMES.includes(d.theme) ? d.theme : 'ivory';
    document.documentElement.dataset.theme = theme;
    const sel = document.getElementById('theme-sel');
    if (sel) sel.value = theme;
    if (migrated) saveState();
    return true;
  } catch(e) { return false; }
}

// ── STATE ─────────────────────────────────────────────────────────────────────
const S = {
  characters:[], locations:[], themes:[], misc:[],
  scenes:[],
  sections:[], nextSecId:1,
  selections:{ characters:new Set(), locations:new Set(), themes:new Set(), misc:new Set() },
  andOr: 'OR',
  selIds: new Set(),
  editingId: null,
  nextId: 1,
};

// ── HISTORY (undo / redo) ─────────────────────────────────────────────────────
const hist = { past:[], future:[], MAX:10 };

function snapshot() {
  return {
    characters: [...S.characters], locations: [...S.locations],
    themes: [...S.themes],         misc: [...S.misc],
    scenes: S.scenes.map(s => ({
      ...s,
      characters:[...s.characters], locations:[...s.locations],
      themes:[...s.themes],         misc:[...s.misc],
    })),
    nextId: S.nextId,
    sections: S.sections.map(s => ({...s})),
    nextSecId: S.nextSecId,
  };
}

function pushHistory(desc) {
  hist.past.push({ snap: snapshot(), desc });
  if (hist.past.length > hist.MAX) hist.past.shift();
  hist.future = [];
  updateUndoRedo();
}

function applySnapshot(snap) {
  S.characters = [...snap.characters]; S.locations = [...snap.locations];
  S.themes     = [...snap.themes];     S.misc      = [...snap.misc];
  S.scenes = snap.scenes.map(s => ({
    ...s,
    characters:[...s.characters], locations:[...s.locations],
    themes:[...s.themes],         misc:[...s.misc],
  }));
  S.nextId    = snap.nextId;
  S.sections  = (snap.sections || []).map(s => ({...s}));
  S.nextSecId = snap.nextSecId || 1;
  // Clean up stale selections
  SECS.forEach(({ key }) => {
    S.selections[key] = new Set([...S.selections[key]].filter(v => S[key].includes(v)));
  });
  S.selIds = new Set([...S.selIds].filter(id => S.scenes.some(s => s.id === id)));
  if (S.editingId && !S.scenes.some(s => s.id === S.editingId)) cancelEdit();
}

function undo() {
  if (!hist.past.length) return;
  const entry = hist.past.pop();
  hist.future.push({ snap: snapshot(), desc: entry.desc });
  applySnapshot(entry.snap);
  buildLibPanel(); renderAllLib(); renderAllCk(); renderSecPanel(); renderSectionSelects(); renderBoard(); updateLibClearBtn(); updateUndoRedo();
  saveState();
}

function redo() {
  if (!hist.future.length) return;
  const entry = hist.future.pop();
  hist.past.push({ snap: snapshot(), desc: entry.desc });
  applySnapshot(entry.snap);
  buildLibPanel(); renderAllLib(); renderAllCk(); renderSecPanel(); renderSectionSelects(); renderBoard(); updateLibClearBtn(); updateUndoRedo();
  saveState();
}

function truncStr(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

function updateUndoRedo() {
  const ub = document.getElementById('undo-btn');
  const rb = document.getElementById('redo-btn');
  const canU = hist.past.length > 0, canR = hist.future.length > 0;
  ub.disabled = !canU; rb.disabled = !canR;
  ub.textContent = canU ? '↩ ' + truncStr(hist.past[hist.past.length-1].desc, 20) : '↩ Undo';
  rb.textContent = canR ? '↪ ' + truncStr(hist.future[hist.future.length-1].desc, 20) : '↪ Redo';
  ub.title = canU ? '↩ ' + hist.past[hist.past.length-1].desc + ' (Ctrl+Z)' : 'Undo (Ctrl+Z)';
  rb.title = canR ? '↪ ' + hist.future[hist.future.length-1].desc + ' (Ctrl+Y)' : 'Redo (Ctrl+Y)';
}

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
function openAddPopup(sec) {
  apSec = sec;
  const cfg = SECS.find(s => s.key === sec);
  document.getElementById('ap-title').textContent = 'Add ' + SINGULAR[sec];
  const inp = document.getElementById('ap-input'); inp.value = ''; inp.placeholder = cfg.ph;
  document.getElementById('ap-notes').value = '';
  document.getElementById('add-popup').classList.add('open');
  setTimeout(() => inp.focus(), 60);
}
function closeAddPopup() {
  document.getElementById('add-popup').classList.remove('open');
  document.getElementById('ap-input').value = '';
  document.getElementById('ap-notes').value = '';
  apSec = null;
}
function confirmAdd() {
  if (!apSec) return;
  const inp = document.getElementById('ap-input');
  const name = inp.value.trim();
  const notes = document.getElementById('ap-notes').value.trim();
  if (!name) { inp.focus(); return; }
  if (S[apSec].some(x => x.name === name)) { inp.select(); return; }
  pushHistory('Add ' + SINGULAR[apSec] + ' "' + name + '"');
  gtag('event', 'item_added', { category: apSec });
  S[apSec].push({ name, notes });
  renderLibSec(apSec); renderCk(apSec); renderEditCk(apSec);
  closeAddPopup();
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

// ── THEME ─────────────────────────────────────────────────────────────────────
function setTheme(name) {
  gtag('event', 'theme_changed', { theme: name });
  document.documentElement.dataset.theme = name;
  saveState();
  // Sync global prefs and both theme selectors
  const prefs = loadGlobalPrefs(); prefs.theme = name; saveGlobalPrefs(prefs);
  const pmSel = document.getElementById('pm-theme-sel');
  const tSel = document.getElementById('theme-sel');
  if (pmSel) pmSel.value = name;
  if (tSel) tSel.value = name;
}
function setGlobalTheme(name) {
  document.documentElement.dataset.theme = name;
  const prefs = loadGlobalPrefs(); prefs.theme = name; saveGlobalPrefs(prefs);
  const pmSel = document.getElementById('pm-theme-sel');
  const tSel = document.getElementById('theme-sel');
  if (pmSel) pmSel.value = name;
  if (tSel) tSel.value = name;
  if (currentProjectId) saveState();
}

// ── PANEL / SCALE ─────────────────────────────────────────────────────────────
function togglePanel(id) { document.getElementById(id).classList.toggle('collapsed'); }
function setScale(v) { document.getElementById('board').style.setProperty('--cs', v); if (S.sections.length) alignSecHeaders(); }

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
  SECS.forEach(({ key }) => renderLibSec(key));
  renderBoard(); updateLibClearBtn();
}
function updateLibClearBtn() {
  const any = SECS.some(({ key }) => S.selections[key].size > 0);
  document.getElementById('lib-clr-wrap').style.display = any ? 'block' : 'none';
}

// ── REMOVE LIB ITEM ───────────────────────────────────────────────────────────
function removeItem(sec, name) {
  pushHistory('Remove "' + name + '"');
  S[sec] = S[sec].filter(x => x.name !== name);
  S.scenes.forEach(sc => { sc[sec] = (sc[sec] || []).filter(x => x !== name); });
  S.selections[sec].delete(name);
  renderLibSec(sec); renderCk(sec); renderEditCk(sec); renderBoard(); updateLibClearBtn();
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
    });
    if (S.selections[sec].has(oldName)) {
      S.selections[sec].delete(oldName);
      S.selections[sec].add(newName);
    }
  }
  closeLibEditModal();
  renderLibSec(sec); renderCk(sec); renderEditCk(sec); renderBoard();
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
  const allSel = SECS.flatMap(({ key }) => [...S.selections[key]].map(v => ({ key, v })));
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
  SECS.forEach(({ key }) => S.selections[key].clear());
  S.selIds.clear(); S.editingId = null;
  hist.past = []; hist.future = [];
  clearSearch();
  syncAndOrUI();
  buildLibPanel(); renderAllLib(); renderAllCk(); renderSecPanel(); renderSectionSelects(); renderBoard(); updateLibClearBtn(); updateUndoRedo();
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
  pushHistory('Add scene "' + truncStr(title, 22) + '"');
  gtag('event', 'scene_added');
  const newScene = { id: S.nextId++, title, summary, notes, ...row, sectionId };
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
  document.querySelectorAll('#form-new .ck-drop-list input').forEach(c => { c.checked = false; });
  SECS.forEach(({ key, label }) => { const w = document.getElementById('ck-' + key + '-wrap'); if (w) updateCkDropLabel(w, label); });
  setNewSceneLive(false);
  renderBoard();

  // Track milestones
  if (S.scenes.length === 1) {
    trackMilestone('1st_scene_created');
  } else if (S.scenes.length === 5) {
    trackMilestone('5th_scene_created');
    // Show email popup at 5th scene
    showEmailPopup();
  }

  saveState();
}

function cancelNewScene() {
  pendingInsert = null;
  document.getElementById('sc-title').value = '';
  document.getElementById('sc-summary').value = '';
  document.getElementById('sc-notes').value = '';
  document.querySelectorAll('#form-new .ck-drop-list input').forEach(c => { c.checked = false; });
  SECS.forEach(({ key, label }) => { const w = document.getElementById('ck-' + key + '-wrap'); if (w) updateCkDropLabel(w, label); });
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
  gtag('event', 'scene_deleted');
  S.scenes = S.scenes.filter(s => s.id !== id);
  S.selIds.delete(id);
  if (S.editingId === id) cancelEdit();
  renderBoard();
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
function renderAllLib() { SECS.forEach(s => renderLibSec(s.key)); }

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
  if (!S[sec].length) {
    box.innerHTML = '<div class="ck-drop-empty">Add ' + lbl.toLowerCase() + ' to library first</div>';
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
function renderCk(sec) { renderCkList('ck', sec); }
function renderEditCk(sec, checked=[]) { renderCkList('ek', sec, checked); }

// ── RENDER: BOARD ─────────────────────────────────────────────────────────────
// Returns the 1-based display number for a scene based on visual board order:
// unassigned scenes first (leftmost), then each section in S.sections order.
// This ensures numbers run 1…N left-to-right across ALL sections regardless of
// the underlying S.scenes array order.
function sceneDisplayNum(sceneId) {
  if (!S.sections.length) {
    const idx = S.scenes.findIndex(s => s.id === sceneId);
    return idx === -1 ? 1 : idx + 1;
  }
  const validSecIds = new Set(S.sections.map(s => s.id));
  const ordered = [
    ...S.scenes.filter(s => !validSecIds.has(s.sectionId)),           // unassigned
    ...S.sections.flatMap(sec => S.scenes.filter(s => s.sectionId === sec.id)), // each section in order
  ];
  const idx = ordered.findIndex(s => s.id === sceneId);
  return idx === -1 ? 1 : idx + 1;
}

function renderCard(container, scene, idx) {
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
  const num  = document.createElement('div'); num.className  = 'cnum'; num.textContent = `Scene ${sceneDisplayNum(scene.id)}`;
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
  card.appendChild(bar); card.appendChild(badge); card.appendChild(delbtn); card.appendChild(sumbtn); card.appendChild(editbtn);
  card.appendChild(num); card.appendChild(tit); card.appendChild(meta);
  card.addEventListener('mousedown', e => onCardDown(e, scene.id));
  container.appendChild(card);
}

function renderBoard() {
  const board = document.getElementById('board'), emp = document.getElementById('sbemp');
  board.innerHTML = '';
  document.querySelectorAll('.sec-pin').forEach(p => p.remove()); // clear body-level pins
  updateCount();
  const hasSecs = S.sections.length > 0;
  board.classList.toggle('has-secs', hasSecs);
  if (!S.scenes.length) { emp.style.display='flex'; return; }
  emp.style.display = 'none';

  if (!hasSecs) {
    // Original flat layout
    S.scenes.forEach((scene, idx) => renderCard(board, scene, idx));
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
        renderCard(wrap, scene, S.scenes.indexOf(scene));
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
  gtag('event', 'section_added');
  const color = SEC_COLORS[S.sections.length % SEC_COLORS.length];
  S.sections.push({ id: S.nextSecId++, name, color });

  // Track milestone: 2nd section created
  if (S.sections.length === 2) {
    trackMilestone('2nd_section_created');
  }

  inp.value = '';
  renderSecPanel(); renderSectionSelects(); renderBoard();
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
  saveState();
}

function colorSection(id, color) {
  const sec = S.sections.find(s => s.id === id); if (!sec) return;
  sec.color = color;
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
  saveState();
}

function renderSecPanel() {
  const list = document.getElementById('sec-list');
  if (!list) return;
  list.innerHTML = '';
  const unassignedCnt = S.scenes.filter(s => !s.sectionId).length;
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
    drag.dropId = newId; drag.before = newBef; drag.dropSecId = newSecId; renderBoard();
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
  if (changed) saveState();
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
    renderLibSec(ld.sec); renderCk(ld.sec); renderEditCk(ld.sec);
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
document.addEventListener('mousedown', e => {
  const tabNew = document.getElementById('tab-new');
  if (!tabNew) return;
  const editActive = S.editingId !== null;
  const newLive    = tabNew.classList.contains('live');
  if (!editActive && !newLive) return;
  if (e.target.closest('#cp')) return;
  if (document.querySelector('.cfm-modal.open, #modal.open, #add-popup.open, #rpt-modal.open, #lib-edit-modal.open')) return;
  if (editActive) cancelEdit();
  if (newLive)    cancelNewScene();
});

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
  if ((e.ctrlKey || e.metaKey) && !inInput) {
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); if (typeof undo === 'function') undo(); return; }
    if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); if (typeof redo === 'function') redo(); return; }
  }
  if (e.key === 'Escape') {
    if (typeof clearAllSel === 'function') try { clearAllSel(); } catch(e){}
    if (typeof clearCardSel === 'function') try { clearCardSel(); } catch(e){}
    if (typeof cancelEdit === 'function') try { cancelEdit(); } catch(e){}
    if (typeof closeModal === 'function') try { closeModal(); } catch(e){}
    if (typeof closeAddPopup === 'function') try { closeAddPopup(); } catch(e){}
    if (typeof clearSearch === 'function') try { clearSearch(); } catch(e){}
    if (typeof closeLibDelModal === 'function') try { closeLibDelModal(); } catch(e){}
    if (typeof closeSaveCfm === 'function') try { closeSaveCfm(); } catch(e){}
    if (typeof closeSecDelModal === 'function') try { closeSecDelModal(); } catch(e){}
    if (typeof closeSecFilter === 'function') try { closeSecFilter(); } catch(e){}
    if (typeof closeReportModal === 'function') try { closeReportModal(); } catch(e){}
    if (typeof closeLibEditModal === 'function') try { closeLibEditModal(); } catch(e){}
    if (typeof closeHelp === 'function') try { closeHelp(); } catch(e){}
  }
});
// Close filter dropdown on click outside
document.addEventListener('mousedown', e => {
  const wrap = document.getElementById('sec-filter-wrap');
  if (wrap && !wrap.contains(e.target) && typeof closeSecFilter === 'function') closeSecFilter();
});

// ── REPORTS ───────────────────────────────────────────────────────────────────
let rptType = 'scenelist';

function openReportModal() {
  const secList = document.getElementById('rpt-sec-list');
  secList.innerHTML = '';
  S.sections.forEach(sec => {
    const lbl = document.createElement('label'); lbl.className = 'rpt-ck';
    const cb  = document.createElement('input'); cb.type = 'checkbox'; cb.value = String(sec.id); cb.checked = true;
    cb.dataset.rptSec = '1';
    cb.addEventListener('change', syncRptAllSecs);
    const sp = document.createElement('span'); sp.textContent = sec.name;
    lbl.appendChild(cb); lbl.appendChild(sp); secList.appendChild(lbl);
  });
  if (S.scenes.some(s => !s.sectionId)) {
    const lbl = document.createElement('label'); lbl.className = 'rpt-ck';
    const cb  = document.createElement('input'); cb.type = 'checkbox'; cb.value = '__unassigned__'; cb.checked = true;
    cb.dataset.rptSec = '1';
    cb.addEventListener('change', syncRptAllSecs);
    const sp = document.createElement('span'); sp.textContent = 'Unassigned'; sp.style.fontStyle = 'italic';
    lbl.appendChild(cb); lbl.appendChild(sp); secList.appendChild(lbl);
  }
  document.getElementById('rpt-modal').classList.add('open');
}

function closeReportModal() { document.getElementById('rpt-modal').classList.remove('open'); }

function switchRptType(type, btn) {
  rptType = type;
  document.querySelectorAll('.rpt-type-btn').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  document.querySelectorAll('.rpt-opts-panel').forEach(p => p.classList.remove('on'));
  const panel = document.getElementById('rpt-opts-' + type);
  if (panel) panel.classList.add('on');
}

function rptToggleAllSecs(cb) {
  document.querySelectorAll('[data-rpt-sec]').forEach(c => { c.checked = cb.checked; });
}
function syncRptAllSecs() {
  const all = [...document.querySelectorAll('[data-rpt-sec]')];
  document.getElementById('rpt-sec-all').checked = all.every(c => c.checked);
}
function rptSelectedSecs() {
  return new Set([...document.querySelectorAll('[data-rpt-sec]:checked')].map(c => c.value));
}
function rptFilterScenes(secSet) {
  // Filter then sort by board display order (unassigned first, then sections in order)
  const filtered = S.scenes.filter(sc => {
    const sid = sc.sectionId != null ? String(sc.sectionId) : '__unassigned__';
    return secSet.has(sid);
  });
  const validSecIds = S.sections.map(s => s.id);
  const secOrder = new Map(validSecIds.map((id, i) => [id, i + 1]));
  return filtered.sort((a, b) => {
    const oa = secOrder.get(a.sectionId) ?? 0;
    const ob = secOrder.get(b.sectionId) ?? 0;
    if (oa !== ob) return oa - ob;
    return filtered.indexOf(a) - filtered.indexOf(b);
  });
}
function rptSecName(sectionId) {
  if (!sectionId) return 'Unassigned';
  const sec = S.sections.find(s => s.id === sectionId);
  return sec ? sec.name : 'Unassigned';
}

// ── REPORT BUILDERS ───────────────────────────────────────────────────────────
function generateReport() {
  const secSet = rptSelectedSecs();
  let html = '';
  if (rptType === 'scenelist') html = buildSceneListReport(secSet);
  if (rptType === 'character') html = buildCharacterReport(secSet);
  if (rptType === 'location')  html = buildLocationReport(secSet);
  if (rptType === 'theme')     html = buildThemeReport(secSet);
  if (rptType === 'misc')      html = buildMiscReport(secSet);
  if (rptType === 'matrix')    html = buildMatrixReport(secSet);

  // Track milestone: 3rd report generated
  try {
    let reportCount = parseInt(localStorage.getItem('scenesetter_report_count') || '0');
    reportCount++;
    localStorage.setItem('scenesetter_report_count', String(reportCount));
    if (reportCount === 3) {
      trackMilestone('3rd_report_generated');
    }
  } catch(e) {}

  openReportWindow(html);
}

function rptBaseCSS() {
  return `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#222;background:#fff;padding:24px 28px;max-width:700px;margin:0 auto}
    h1{font-size:20px;font-weight:800;margin-bottom:4px;color:#111}
    .rpt-meta{font-size:11px;color:#666;margin-bottom:18px;border-bottom:1px solid #ddd;padding-bottom:10px}
    h2{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#555;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #ddd}
    .scene-block{padding:8px 0;border-bottom:1px solid #ccc;break-inside:avoid}
    .scene-block:last-child{border-bottom:none}
    .scene-num{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:1px}
    .scene-title{font-size:13px;font-weight:700;color:#111;margin-bottom:4px;white-space:pre-wrap;line-height:1.35}
    .field-row{display:flex;gap:6px;margin-top:3px;align-items:baseline}
    .field-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#888;flex-shrink:0;min-width:72px}
    .field-val{font-size:11px;color:#444;line-height:1.5;white-space:pre-wrap}
    .tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:10px;margin:1px 2px 1px 0;font-weight:600}
    .tag-c{background:#dce8fb;color:#2a5bb4}
    .tag-l{background:#d5eede;color:#1e6b3f}
    .tag-t{background:#e8dff7;color:#5a2f90}
    .tag-m{background:#fdecd5;color:#8f5520}
    .scene-entry{margin:3px 0;padding:4px 8px;border-left:2px solid #ccc}
    .scene-entry-title{font-weight:600;color:#222;font-size:11px}
    .scene-entry-meta{color:#666;font-size:11px}
    .scene-entry-summary{font-size:11px;color:#555;margin-top:2px;white-space:pre-wrap;line-height:1.45}
    .empty-note{font-size:11px;color:#999;font-style:italic;padding-left:8px;margin:3px 0}
    table{border-collapse:collapse;font-size:11px;margin-top:6px}
    thead th{background:#f0f0f0;font-weight:700;font-size:10px;color:#555;padding:5px 6px;text-align:center;border:1px solid #ccc;border-bottom-width:2px;vertical-align:bottom}
    thead th:first-child{text-align:left;padding-left:8px}
    .mx-scene-num{white-space:nowrap;display:block;font-weight:600;font-size:10px;color:#444;line-height:1.4}
    .mx-axis-hdr{font-size:10px;color:#444;font-weight:700;white-space:nowrap;line-height:1.3;display:block;letter-spacing:0.04em}
    .mx-scene-sec{font-size:9px;color:#777;font-weight:400}
    tbody td{padding:5px 4px;border:1px solid #ccc;vertical-align:middle}
    tbody td:first-child{padding-left:8px}
    .mx-cell{padding:4px 2px;text-align:center}
    tbody tr:hover td{background:#fafafa}
    .mx-dot{color:#3a6bc4;font-size:12px}
    .mx-row-hdr{font-weight:600;color:#333;white-space:nowrap;font-size:11px}
    .mx-row-wrap{display:flex;gap:0;align-items:baseline}
    .mx-row-num{flex-shrink:0;margin-right:4px;color:#666;font-weight:600}
    .mx-row-title{white-space:normal;line-height:1.4}
    @media print{
      *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
      body{padding:14px 18px;max-width:none}
      .scene-block{break-inside:avoid}
      h2{break-before:auto}
      table{border-collapse:collapse}
      td,th{border:1px solid #ccc !important}
      thead th{border-bottom-width:2px !important}
    }
  `;
}

function openReportWindow(html) {
  const w = window.open('', '_blank');
  if (!w) { alert('Pop-up blocked — please allow pop-ups for this page and try again.'); return; }
  w.document.write(html);
  w.document.close();
}

function rptPageHeader(title) {
  const d = new Date().toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
  const total = S.scenes.length;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${rptEsc(title)}</title><style>${rptBaseCSS()}</style></head><body>`
       + `<h1>${rptEsc(title)}</h1>`
       + `<div class="rpt-meta">Generated ${d} &nbsp;·&nbsp; ${total} scene${total!==1?'s':''} total</div>`;
}

function rptEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function rptFieldRow(label, val) {
  return `<div class="field-row"><span class="field-lbl">${label}</span><span class="field-val">${val}</span></div>`;
}
function rptTagsHtml(arr, cls) {
  return arr.map(t => `<span class="tag ${cls}">${rptEsc(t)}</span>`).join('');
}

// Scene List
function buildSceneListReport(secSet) {
  const inc = {
    section:    document.getElementById('rpt-sl-section').checked,
    summary:    document.getElementById('rpt-sl-summary').checked,
    notes:      document.getElementById('rpt-sl-notes').checked,
    characters: document.getElementById('rpt-sl-characters').checked,
    locations:  document.getElementById('rpt-sl-locations').checked,
    themes:     document.getElementById('rpt-sl-themes').checked,
    misc:       document.getElementById('rpt-sl-misc').checked,
  };
  const scenes = rptFilterScenes(secSet);
  let html = rptPageHeader('Scene List');
  if (!scenes.length) {
    html += '<p style="color:#aaa;margin-top:20px;font-style:italic">No scenes match the selected sections.</p>';
  } else {
    scenes.forEach(sc => {
      html += `<div class="scene-block">`;
      html += `<div class="scene-num">Scene ${sceneDisplayNum(sc.id)}</div>`;
      html += `<div class="scene-title">${rptEsc(sc.title || '(Untitled)')}</div>`;
      if (inc.section)                       html += rptFieldRow('Section',    rptEsc(rptSecName(sc.sectionId)));
      if (inc.summary    && sc.summary)      html += rptFieldRow('Summary',    rptEsc(sc.summary));
      if (inc.notes      && sc.notes)        html += rptFieldRow('Notes',      rptEsc(sc.notes));
      if (inc.characters && sc.characters?.length) html += rptFieldRow('Characters', rptTagsHtml(sc.characters, 'tag-c'));
      if (inc.locations  && sc.locations?.length)  html += rptFieldRow('Locations',  rptTagsHtml(sc.locations,  'tag-l'));
      if (inc.themes     && sc.themes?.length)     html += rptFieldRow('Themes',      rptTagsHtml(sc.themes,     'tag-t'));
      if (inc.misc       && sc.misc?.length)       html += rptFieldRow('Misc Items',  rptTagsHtml(sc.misc,       'tag-m'));
      html += `</div>`;
    });
  }
  return html + '</body></html>';
}

// Generic Library Item Report (Character, Location, Theme, Misc)
const LIB_RPT_CFG = {
  character: { key:'characters', prefix:'rpt-ch', title:'Character Report', emptyMsg:'No characters in library.', emptyScene:'Does not appear in selected scenes',
               extraMeta: (inc, sc) => inc.location && sc.locations?.length ? sc.locations.map(rptEsc).join(', ') : null },
  location:  { key:'locations',  prefix:'rpt-lo', title:'Location Report',  emptyMsg:'No locations in library.',  emptyScene:'Not used in selected scenes',
               extraMeta: (inc, sc) => inc.characters && sc.characters?.length ? sc.characters.map(rptEsc).join(', ') : null },
  theme:     { key:'themes',     prefix:'rpt-th', title:'Theme Report',     emptyMsg:'No themes in library.',     emptyScene:'Not present in selected scenes',
               extraMeta: (inc, sc) => inc.characters && sc.characters?.length ? sc.characters.map(rptEsc).join(', ') : null },
  misc:      { key:'misc',       prefix:'rpt-mi', title:'Misc Items Report',emptyMsg:'No misc items in library.', emptyScene:'Not present in selected scenes',
               extraMeta: (inc, sc) => inc.characters && sc.characters?.length ? sc.characters.map(rptEsc).join(', ') : null },
};

function buildLibItemReport(secSet, type) {
  const cfg = LIB_RPT_CFG[type];
  const pfx = cfg.prefix;
  const inc = {};
  document.querySelectorAll(`[id^="${pfx}-"]`).forEach(el => {
    const field = el.id.slice(pfx.length + 1); // e.g. 'section', 'summary', etc.
    inc[field] = el.checked;
  });
  const scenes = rptFilterScenes(secSet);
  let html = rptPageHeader(cfg.title);
  if (!S[cfg.key].length) {
    html += `<p style="color:#aaa;margin-top:20px;font-style:italic">${cfg.emptyMsg}</p>`;
  } else {
    S[cfg.key].forEach(item => {
      const appears = scenes.filter(sc => (sc[cfg.key] || []).includes(item.name));
      html += `<h2>${rptEsc(item.name)} <span style="font-weight:400;letter-spacing:0;font-size:10px;color:#ccc">${appears.length} scene${appears.length!==1?'s':''}</span></h2>`;
      if (inc.notes && item.notes) html += `<div class="scene-entry-summary" style="margin:-4px 0 8px">${rptEsc(item.notes)}</div>`;
      if (!appears.length) {
        html += `<div class="empty-note">${cfg.emptyScene}</div>`;
      } else {
        appears.forEach(sc => {
          const meta = [];
          if (inc.section) meta.push(rptEsc(rptSecName(sc.sectionId)));
          const extra = cfg.extraMeta(inc, sc);
          if (extra) meta.push(extra);
          html += `<div class="scene-entry">`;
          html += `<span class="scene-entry-title">Scene ${sceneDisplayNum(sc.id)} — ${rptEsc(sc.title || '(Untitled)')}</span>`;
          if (meta.length) html += ` <span class="scene-entry-meta">· ${meta.join(' · ')}</span>`;
          if (inc.summary && sc.summary) html += `<div class="scene-entry-summary">${rptEsc(sc.summary)}</div>`;
          html += `</div>`;
        });
      }
    });
  }
  return html + '</body></html>';
}
function buildCharacterReport(secSet) { return buildLibItemReport(secSet, 'character'); }
function buildLocationReport(secSet)  { return buildLibItemReport(secSet, 'location'); }
function buildThemeReport(secSet)     { return buildLibItemReport(secSet, 'theme'); }
function buildMiscReport(secSet)      { return buildLibItemReport(secSet, 'misc'); }

// Cross-Reference Matrix
function updateMxNote() {
  const flip = document.getElementById('rpt-mx-flip').checked;
  const note = document.getElementById('rpt-mx-note');
  if (note) note.textContent = flip ? 'as columns · Scenes as rows' : 'as rows · Scenes as columns';
}

function buildMatrixReport(secSet) {
  const axis      = document.getElementById('rpt-mx-axis').value;
  const showSec   = document.getElementById('rpt-mx-section').checked;
  const flip      = document.getElementById('rpt-mx-flip').checked;
  const scenes    = rptFilterScenes(secSet);
  const axisItems = S[axis] || [];
  const axisLabel = SECS.find(s => s.key === axis)?.label || axis;
  const title     = flip ? `Cross-Reference: Scenes × ${axisLabel}` : `Cross-Reference: ${axisLabel} × Scenes`;
  let html = rptPageHeader(title);
  if (!axisItems.length) {
    html += `<p style="color:#aaa;margin-top:20px;font-style:italic">No ${axisLabel.toLowerCase()} in library.</p>`;
    return html + '</body></html>';
  }
  if (!scenes.length) {
    html += '<p style="color:#aaa;margin-top:20px;font-style:italic">No scenes match the selected sections.</p>';
    return html + '</body></html>';
  }
  if (flip) {
    // Scenes as rows, axisItems as columns
    html += `<table><thead><tr><th style="width:200px;max-width:200px">Scene</th>`;
    axisItems.forEach(item => {
      html += `<th><span class="mx-axis-hdr">${rptEsc(item.name)}</span></th>`;
    });
    html += `</tr></thead><tbody>`;
    scenes.forEach(sc => {
      const secStr = showSec ? ` <span class="mx-scene-sec" style="font-weight:400">· ${rptEsc(rptSecName(sc.sectionId))}</span>` : '';
      html += `<tr><td class="mx-row-hdr" style="width:200px;max-width:200px"><div class="mx-row-wrap"><span class="mx-row-num">${sceneDisplayNum(sc.id)} —</span><span class="mx-row-title">${rptEsc(sc.title||'(Untitled)')}${secStr}</span></div></td>`;
      axisItems.forEach(item => {
        html += (sc[axis] || []).includes(item.name) ? `<td class="mx-cell mx-dot">●</td>` : `<td class="mx-cell"></td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table>`;
  } else {
    // axisItems as rows, Scenes as columns — render full table, then auto-chunk via script
    html += `<div id="mx-wrap">`;
    html += `<table id="mx-full"><thead><tr><th style="min-width:130px">${rptEsc(axisLabel)}</th>`;
    scenes.forEach(sc => {
      const secStr = showSec ? `<span class="mx-scene-sec" style="display:block;white-space:nowrap">${rptEsc(rptSecName(sc.sectionId))}</span>` : '';
      html += `<th title="${rptEsc(sc.title||'(Untitled)')}"><span class="mx-scene-num">Sc ${sceneDisplayNum(sc.id)}</span>${secStr}</th>`;
    });
    html += `</tr></thead><tbody>`;
    axisItems.forEach(item => {
      html += `<tr><td class="mx-row-hdr">${rptEsc(item.name)}</td>`;
      scenes.forEach(sc => {
        html += (sc[axis] || []).includes(item.name) ? `<td class="mx-cell mx-dot">●</td>` : `<td class="mx-cell"></td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    // Post-render script: measure actual column widths, split into fitted chunks
    html += `<script>
(function(){
  var tbl = document.getElementById('mx-full');
  if (!tbl) return;
  var ths = tbl.querySelectorAll('thead th');
  if (ths.length < 2) return;
  var pageW = document.body.clientWidth || 760;
  var hdrW = ths[0].offsetWidth;
  var colWs = [];
  for (var i = 1; i < ths.length; i++) colWs.push(ths[i].offsetWidth);
  // Determine how many columns fit per chunk
  var chunks = [], ci = 0;
  while (ci < colWs.length) {
    var used = hdrW, end = ci;
    while (end < colWs.length && used + colWs[end] <= pageW) { used += colWs[end]; end++; }
    if (end === ci) end = ci + 1; // at least one column
    chunks.push([ci, end]);
    ci = end;
  }
  if (chunks.length <= 1) return; // fits in one table, nothing to do
  // Build chunk tables
  var rows = tbl.querySelectorAll('tbody tr');
  var wrap = document.getElementById('mx-wrap');
  var frag = document.createDocumentFragment();
  chunks.forEach(function(c) {
    var t = document.createElement('table');
    t.style.marginBottom = '18px';
    t.style.pageBreakInside = 'avoid';
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    hr.appendChild(ths[0].cloneNode(true));
    for (var i = c[0]; i < c[1]; i++) hr.appendChild(ths[i+1].cloneNode(true));
    thead.appendChild(hr);
    t.appendChild(thead);
    var tbody = document.createElement('tbody');
    rows.forEach(function(row) {
      var cells = row.querySelectorAll('td');
      var nr = document.createElement('tr');
      nr.appendChild(cells[0].cloneNode(true));
      for (var i = c[0]; i < c[1]; i++) nr.appendChild(cells[i+1].cloneNode(true));
      tbody.appendChild(nr);
    });
    t.appendChild(tbody);
    frag.appendChild(t);
  });
  wrap.innerHTML = '';
  wrap.appendChild(frag);
})();
<\/script>`;
  }
  return html + '</body></html>';
}

// ── HELP OVERLAY ──────────────────────────────────────────────────────────────
const HELP_ZONES = [
  { sel: '#undo-btn',        tip: 'Undo — reverses the last change (up to 10 steps). Shortcut: Ctrl+Z / ⌘Z.' },
  { sel: '#redo-btn',        tip: 'Redo — restores a previously undone change. Shortcut: Ctrl+Y / ⌘⇧Z.' },
  { sel: '#theme-wrap',      tip: 'Theme — switch the app\'s color scheme between Ivory, Slate, Studio, Ocean, and Sunset.' },
  { sel: '#lp .p-hdr',      tip: 'Library panel — stores characters, locations, themes, and misc items. Click + to add an item. Click any item to highlight matching scenes on the board. Hover an item to shuffle, edit (name & notes), or delete it. Use ◀ to hide the panel or drag the right edge to resize it.' },
  { sel: '#ao-global-wrap',  tip: 'Highlight mode — OR highlights scenes containing any selected item; AND highlights only scenes that contain all selected items simultaneously. A Clear Highlights option appears when any items are selected.' },
  { sel: '#sp .p-hdr',      tip: 'Sections panel — organize scenes into named sections such as acts, chapters, or sequences. Hover a section row and click → to jump to it on the board. Use ◀ or drag the panel edge to hide or resize.' },
  { sel: '.sp-add-row',      tip: 'Add Section — type a name and press + (or Enter) to create a new section.' },
  { sel: '.sp-qs',           tip: 'Quick Setup — rapidly create multiple numbered sections at once (e.g. "Act 1, Act 2, Act 3").' },
  { sel: '#cp .tabs',        tip: 'Scene panel — New Scene creates a scene; Edit Scene (enabled when a card is selected) lets you modify it. Enter a title, summary, section, library tags, and notes. Use ◀ or drag the panel edge to hide or resize.' },
  { sel: '#sbhdr .sbt',      tip: 'Scene Board — the main workspace. Scenes are arranged by section. Drag cards to reorder them. Click a card to select it; click multiple cards to select them together and move them as a group.' },
  { sel: '#sbcnt',           tip: 'Scene count — shows how many scenes are currently visible (may be fewer when a section filter is active).' },
  { sel: '#clrsel',          tip: 'Clear Selection — deselects all currently selected scene cards on the board.' },
  { sel: '#det-toggle',      tip: 'Show Card Details — toggle to show or hide library tags (characters, locations, themes, misc) printed on each card.' },
  { sel: '#sec-filter-wrap', tip: 'Section Filter — click to choose which sections are visible on the board. Useful for focusing on one part of your story.' },
  { sel: '#rpt-btn',         tip: 'Report — generate a printable report: Scene List, Character, Location, Theme, Misc Items, or Cross-Reference Matrix. Reports can optionally include your library item notes.' },
  { sel: '#srch-wrap',       tip: 'Search — filter visible cards by title or summary text. Press × or Escape to clear the search.' },
  { sel: '.scalew',          tip: 'Card Size — drag the slider to make scene cards larger or smaller on the board.' },
  { sel: '#help-btn',        tip: 'Help — you\'re already here! Click ? to toggle this mode on/off. Hover highlighted areas to learn what each element does.' },
];

let helpMode = false;

function toggleHelp() {
  helpMode ? closeHelp() : openHelp();
}

function openHelp() {
  helpMode = true;
  document.getElementById('help-btn').classList.add('active');
  const overlay = document.getElementById('help-overlay');
  overlay.classList.add('active');
  overlay.querySelectorAll('.help-zone').forEach(z => z.remove());
  // Temporarily reveal elements that are hidden but should still get a help zone
  const tempShow = ['#lib-clr-wrap'];
  const restored = [];
  tempShow.forEach(sel => {
    const el = document.querySelector(sel);
    if (el && el.style.display === 'none') { el.style.display = 'block'; restored.push(el); }
  });
  HELP_ZONES.forEach(zone => {
    const el = document.querySelector(zone.sel);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 && r.height < 2) return;
    const div = document.createElement('div');
    div.className = 'help-zone';
    div.style.left   = (r.left   - 3) + 'px';
    div.style.top    = (r.top    - 3) + 'px';
    div.style.width  = (r.width  + 6) + 'px';
    div.style.height = (r.height + 6) + 'px';
    div.addEventListener('mouseenter', () => showHelpTip(zone.tip, r));
    div.addEventListener('mouseleave', hideHelpTip);
    div.addEventListener('click', e => { e.stopPropagation(); closeHelp(); });
    overlay.appendChild(div);
  });
  restored.forEach(el => { el.style.display = 'none'; });
  overlay.addEventListener('click', _helpOverlayClose);
}

function _helpOverlayClose(e) {
  if (e.target.classList.contains('help-zone')) return;
  closeHelp();
}

function closeHelp() {
  if (!helpMode) return;
  helpMode = false;
  hideHelpTip();
  document.getElementById('help-btn').classList.remove('active');
  const overlay = document.getElementById('help-overlay');
  overlay.classList.remove('active');
  overlay.removeEventListener('click', _helpOverlayClose);
}

function showHelpTip(text, rect) {
  const tip = document.getElementById('help-tip');
  tip.textContent = text;
  tip.classList.add('vis');
  let top  = rect.bottom + 10;
  let left = rect.left;
  if (top  + 140 > window.innerHeight) top  = rect.top - 148;
  // Clamp fully within viewport so tips on tall/top elements never go off-screen
  top  = Math.max(8, Math.min(top,  window.innerHeight - 150));
  if (left + 282 > window.innerWidth)  left = window.innerWidth - 288;
  if (left < 8) left = 8;
  tip.style.top  = top  + 'px';
  tip.style.left = left + 'px';
}

function hideHelpTip() {
  document.getElementById('help-tip').classList.remove('vis');
}

// ── PROJECT MANAGER ──────────────────────────────────────────────────────────

function migrateExistingData() {
  // If project index already exists, migration is done
  if (localStorage.getItem(PROJECT_INDEX_KEY)) return;
  // Check for existing storyboard data
  let raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // Check for v1 data
    const old = localStorage.getItem(LEGACY_KEY);
    if (old) {
      const od = JSON.parse(old);
      if (od && od.v === '1') {
        raw = JSON.stringify({
          v: DATA_VERSION,
          characters: od.characters||[], locations: od.locations||[], themes: od.themes||[], misc: od.misc||[],
          scenes: (od.scenes||[]).map(sc => ({...sc, sectionId: null})),
          nextId: od.nextId||1, andOr: od.andOr, theme: od.theme,
          sections: [], nextSecId: 1,
        });
      }
    }
  }
  if (raw) {
    const d = JSON.parse(raw);
    const id = genProjId();
    localStorage.setItem(projKey(id), raw);
    const now = new Date().toISOString();
    saveProjectIndex([{
      id, name: 'My Storyboard', createdAt: now, modifiedAt: now,
      sceneCount: (d.scenes || []).length, theme: d.theme || 'ivory'
    }]);
    // Save theme as global pref
    saveGlobalPrefs({ theme: d.theme || 'ivory' });
  } else {
    saveProjectIndex([]);
  }
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd ago';
  return new Date(iso).toLocaleDateString();
}

function renderProjectGrid() {
  const grid = document.getElementById('proj-grid');
  const index = loadProjectIndex().sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  grid.innerHTML = '';

  if (!index.length) {
    grid.innerHTML = `
      <div class="pm-empty" style="grid-column:1/-1">
        <div class="pm-empty-icon">📝</div>
        <div class="pm-empty-title">No projects yet</div>
        <div class="pm-empty-sub">Create a new project to start building your visual storyboard, or import an existing one from a JSON file.</div>
      </div>`;
    return;
  }

  index.forEach(p => {
    const card = document.createElement('div');
    card.className = 'pm-card' + (p.isSample ? ' pm-card-sample' : '');
    card.ondblclick = () => openProject(p.id);

    const sampleBadge = p.isSample ? '<div class="pm-card-badge">SAMPLE</div>' : '';

    card.innerHTML = `
      ${sampleBadge}
      <div class="pm-card-top">
        <div class="pm-card-icon">📝</div>
        <div class="pm-card-info">
          <div class="pm-card-name">${esc(p.name)}</div>
          <div class="pm-card-meta">
            <span>${p.sceneCount || 0} scene${(p.sceneCount||0) !== 1 ? 's' : ''}</span>
            <span>Modified ${timeAgo(p.modifiedAt)}</span>
          </div>
        </div>
      </div>
      <div class="pm-card-actions">
        <button class="pm-card-btn" onclick="event.stopPropagation();openProject('${p.id}')">Open</button>
        <button class="pm-card-btn" onclick="event.stopPropagation();startProjRename('${p.id}')">Rename</button>
        <button class="pm-card-btn" onclick="event.stopPropagation();duplicateProject('${p.id}')">Duplicate</button>
        <button class="pm-card-btn" onclick="event.stopPropagation();exportProjectJSON('${p.id}')">Export</button>
        <button class="pm-card-btn del" onclick="event.stopPropagation();startProjDel('${p.id}')">Delete</button>
      </div>`;
    grid.appendChild(card);
  });
}

function esc(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

// ── PAGE DETECTION ────────────────────────────────────────────────────────────
const _page = (function() {
  const hasLanding = !!document.getElementById('landing');
  const hasStoryboard = !!document.getElementById('app-storyboard');
  const hasProjMgr = !!document.getElementById('proj-mgr');
  if (hasLanding && hasStoryboard) return 'index';
  if (hasProjMgr && !hasLanding) return 'projects';
  return 'other';
})();

function showProjectManager() {
  if (_page === 'index') {
    // Navigate to projects page
    window.location.href = 'projects.html';
    return;
  }
  if (_page === 'projects') {
    renderProjectGrid();
  }
}

function showStoryboard() {
  if (_page === 'index') {
    document.getElementById('landing').style.display = 'none';
    document.getElementById('app-storyboard').style.display = 'flex';
  }
}

function showLanding() {
  if (_page === 'index') {
    document.getElementById('landing').style.display = 'flex';
    document.getElementById('app-storyboard').style.display = 'none';
  }
}

function resetState() {
  S.characters = []; S.locations = []; S.themes = []; S.misc = [];
  S.scenes = []; S.nextId = 1; S.andOr = 'OR';
  S.sections = []; S.nextSecId = 1;
  SECS.forEach(({ key }) => S.selections[key].clear());
  S.selIds.clear(); S.editingId = null;
  hist.past = []; hist.future = [];
}

function initStoryboard() {
  syncAndOrUI();
  buildLibPanel(); renderAllLib(); renderAllCk();
  renderSecPanel(); renderSectionSelects();
  renderBoard(); updateLibClearBtn(); updateUndoRedo();
  document.getElementById('board').classList.add('hide-details');
  document.getElementById('det-toggle').checked = false;
}

function openProject(id) {
  if (_page === 'projects') {
    // Store project ID and navigate to index.html (storyboard)
    sessionStorage.setItem('ss_open_project', id);
    window.location.href = 'index.html';
    return;
  }
  // On index.html — load project into storyboard
  currentProjectId = id;
  resetState();
  loadState(projKey(id));
  const index = loadProjectIndex();
  const entry = index.find(p => p.id === id);
  document.getElementById('proj-name').textContent = entry ? entry.name : '';
  initStoryboard();
  showStoryboard();
}

function createAndOpenProject() {
  gtag('event', 'project_created');
  const id = genProjId();
  const now = new Date().toISOString();
  const index = loadProjectIndex();
  index.push({ id, name: 'Untitled Project', createdAt: now, modifiedAt: now, sceneCount: 0, theme: document.documentElement.dataset.theme });
  saveProjectIndex(index);

  // Track milestone: 2nd project created
  if (index.length === 2) {
    trackMilestone('2nd_project_created');
  }
  // Save empty project data
  localStorage.setItem(projKey(id), JSON.stringify({
    v: DATA_VERSION, characters:[], locations:[], themes:[], misc:[],
    scenes:[], nextId:1, andOr:'OR', theme: document.documentElement.dataset.theme,
    sections:[], nextSecId:1,
  }));
  if (_page === 'projects') {
    // Store project ID and flag for rename, navigate to index.html
    sessionStorage.setItem('ss_open_project', id);
    sessionStorage.setItem('ss_rename_project', id);
    window.location.href = 'index.html';
    return;
  }
  openProject(id);
  // Prompt rename immediately
  startProjRename(id);
}

function backToProjects() {
  if (currentProjectId) saveState();
  currentProjectId = null;
  window.location.href = 'projects.html';
}

// Rename
let renamingProjId = null;
function startProjRename(id) {
  renamingProjId = id;
  const index = loadProjectIndex();
  const entry = index.find(p => p.id === id);
  document.getElementById('proj-rename-input').value = entry ? entry.name : '';
  document.getElementById('proj-rename-modal').classList.add('open');
  setTimeout(() => {
    const inp = document.getElementById('proj-rename-input');
    inp.focus(); inp.select();
  }, 100);
}
function closeProjRename() { document.getElementById('proj-rename-modal').classList.remove('open'); renamingProjId = null; }
function confirmProjRename() {
  if (!renamingProjId) return;
  const name = document.getElementById('proj-rename-input').value.trim();
  if (!name) return;
  const index = loadProjectIndex();
  const entry = index.find(p => p.id === renamingProjId);
  if (entry) { entry.name = name; saveProjectIndex(index); }
  // Update header if this is the currently open project
  if (currentProjectId === renamingProjId) {
    document.getElementById('proj-name').textContent = name;
  }
  closeProjRename();
  renderProjectGrid();
}

// Delete
let deletingProjId = null;
function startProjDel(id) {
  deletingProjId = id;
  const index = loadProjectIndex();
  const entry = index.find(p => p.id === id);
  document.getElementById('proj-del-name').textContent = entry ? entry.name : 'this project';
  document.getElementById('proj-del-modal').classList.add('open');
}
function closeProjDel() { document.getElementById('proj-del-modal').classList.remove('open'); deletingProjId = null; }
function confirmProjDel() {
  if (!deletingProjId) return;
  gtag('event', 'project_deleted');
  localStorage.removeItem(projKey(deletingProjId));
  const index = loadProjectIndex().filter(p => p.id !== deletingProjId);
  saveProjectIndex(index);
  closeProjDel();
  renderProjectGrid();
}

// Duplicate
function duplicateProject(id) {
  gtag('event', 'project_duplicated');
  const raw = localStorage.getItem(projKey(id));
  if (!raw) return;
  const index = loadProjectIndex();
  const entry = index.find(p => p.id === id);
  const newId = genProjId();
  const now = new Date().toISOString();
  localStorage.setItem(projKey(newId), raw);
  index.push({
    id: newId, name: (entry ? entry.name : 'Project') + ' (Copy)',
    createdAt: now, modifiedAt: now,
    sceneCount: entry ? entry.sceneCount : 0,
    theme: entry ? entry.theme : 'ivory'
  });
  saveProjectIndex(index);
  renderProjectGrid();
}

// Export JSON
function exportProjectJSON(id) {
  gtag('event', 'project_exported');
  const raw = localStorage.getItem(projKey(id));
  if (!raw) return;
  const index = loadProjectIndex();
  const entry = index.find(p => p.id === id);
  const name = entry ? entry.name : 'project';
  const data = JSON.parse(raw);
  data.projectName = name;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name.replace(/[^a-zA-Z0-9_\- ]/g, '') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportCurrentProject() {
  if (currentProjectId) {
    saveState();
    exportProjectJSON(currentProjectId);
  }
}

// Import JSON with validation
function importProjectJSON(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const d = JSON.parse(e.target.result);

      // Version check
      if (!d || d.v !== DATA_VERSION) {
        alert('Invalid project file version. Expected v: "' + DATA_VERSION + '"' + (d && d.v ? ' but found v: "' + d.v + '"' : '') + '.');
        return;
      }

      // Validate required structure
      const requiredFields = ['characters', 'locations', 'themes', 'misc', 'scenes', 'sections'];
      const missingFields = requiredFields.filter(f => !Array.isArray(d[f]));
      if (missingFields.length > 0) {
        alert('Invalid project structure. Missing required arrays: ' + missingFields.join(', '));
        return;
      }

      // Validate scene references (characters, locations, themes, misc)
      const charNames = new Set(d.characters.map(c => typeof c === 'string' ? c : c.name));
      const locNames = new Set(d.locations.map(l => typeof l === 'string' ? l : l.name));
      const themeNames = new Set(d.themes.map(t => typeof t === 'string' ? t : t.name));
      const miscNames = new Set(d.misc.map(m => typeof m === 'string' ? m : m.name));

      const refIssues = [];
      d.scenes.forEach((scene, idx) => {
        const sceneNum = idx + 1;
        if (Array.isArray(scene.characters)) {
          scene.characters.forEach(char => {
            if (!charNames.has(char)) refIssues.push(`Scene ${sceneNum}: Character "${char}" not found in character library`);
          });
        }
        if (Array.isArray(scene.locations)) {
          scene.locations.forEach(loc => {
            if (!locNames.has(loc)) refIssues.push(`Scene ${sceneNum}: Location "${loc}" not found in location library`);
          });
        }
        if (Array.isArray(scene.themes)) {
          scene.themes.forEach(theme => {
            if (!themeNames.has(theme)) refIssues.push(`Scene ${sceneNum}: Theme "${theme}" not found in theme library`);
          });
        }
        if (Array.isArray(scene.misc)) {
          scene.misc.forEach(item => {
            if (!miscNames.has(item)) refIssues.push(`Scene ${sceneNum}: Misc item "${item}" not found in misc library`);
          });
        }
      });

      if (refIssues.length > 0) {
        const summary = refIssues.slice(0, 5).join('\n');
        const moreMsg = refIssues.length > 5 ? '\n... and ' + (refIssues.length - 5) + ' more issues' : '';
        alert('Project has reference issues:\n\n' + summary + moreMsg + '\n\nPlease check that all scene references match library items.');
        return;
      }

      const id = genProjId();
      const now = new Date().toISOString();
      const name = d.projectName || file.name.replace(/\.json$/i, '') || 'Imported Project';
      delete d.projectName;
      localStorage.setItem(projKey(id), JSON.stringify(d));
      const index = loadProjectIndex();
      index.push({ id, name, createdAt: now, modifiedAt: now, sceneCount: (d.scenes||[]).length, theme: d.theme || 'ivory' });
      saveProjectIndex(index);
      gtag('event', 'project_imported');
      renderProjectGrid();
      alert('Project imported successfully: ' + name + ' (' + d.scenes.length + ' scenes)');
    } catch(err) {
      alert('Could not read project file. Make sure it is a valid SceneSetter JSON export.\n\nError: ' + err.message);
    }
  };
  reader.readAsText(file);
  inputEl.value = '';
}

// Auto-load sample projects on first visit
function ensureSampleProjects() {
  const index = loadProjectIndex();
  const sampleNames = ['Pride and Prejudice', 'The Count of Monte Cristo'];
  const samplesToLoad = [];

  // Check which samples are missing
  if (!index.some(p => p.name === 'Pride and Prejudice')) {
    samplesToLoad.push({ name: 'Pride and Prejudice', file: 'pride-and-prejudice.json' });
  }
  if (!index.some(p => p.name === 'The Count of Monte Cristo')) {
    samplesToLoad.push({ name: 'The Count of Monte Cristo', file: 'count-of-monte-cristo.json' });
  }

  if (samplesToLoad.length === 0) return; // All samples already loaded

  // Load missing samples
  samplesToLoad.forEach(sample => {
    fetch(sample.file)
      .then(response => {
        if (!response.ok) throw new Error('Failed to load sample project');
        return response.json();
      })
      .then(d => {
        if (!d || d.v !== DATA_VERSION) return;
        const id = genProjId();
        const now = new Date().toISOString();
        delete d.projectName;
        localStorage.setItem(projKey(id), JSON.stringify(d));
        const index = loadProjectIndex();
        index.push({
          id, name: sample.name, createdAt: now, modifiedAt: now,
          sceneCount: (d.scenes||[]).length, theme: d.theme || 'ivory', isSample: true
        });
        saveProjectIndex(index);
        gtag('event', 'sample_project_auto_loaded');
      })
      .catch(err => console.log('Could not auto-load sample project: ' + sample.name));
  });
}

// Backdrop click to close project modals (only on pages with these elements)
if (document.getElementById('proj-rename-modal')) {
  onBackdropClick('proj-rename-modal', closeProjRename);
  onBackdropClick('proj-del-modal', closeProjDel);
  document.getElementById('proj-rename-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmProjRename(); }
  });
}

// ── INIT ──────────────────────────────────────────────────────────────────────
// Apply global theme
const gPrefs = loadGlobalPrefs();
const gTheme = ['ivory','slate','studio','ocean','sunset'].includes(gPrefs.theme) ? gPrefs.theme : 'ivory';
document.documentElement.dataset.theme = gTheme;

// Sync theme selectors (only if they exist on this page)
const pmThemeSel = document.getElementById('pm-theme-sel');
const themeSel = document.getElementById('theme-sel');
if (pmThemeSel) pmThemeSel.value = gTheme;
if (themeSel) themeSel.value = gTheme;

// Migrate any existing data to project format
migrateExistingData();

// ── PAGE-SPECIFIC INIT ───────────────────────────────────────────────────────
if (_page === 'projects') {
  // Projects page: ensure sample projects are loaded, then render grid
  ensureSampleProjects();
  setTimeout(renderProjectGrid, 100); // Delay to allow samples to load
} else if (_page === 'index') {
  // Check for pending project from projects.html navigation
  const pendingId = sessionStorage.getItem('ss_open_project');
  const pendingRename = sessionStorage.getItem('ss_rename_project');
  sessionStorage.removeItem('ss_open_project');
  sessionStorage.removeItem('ss_rename_project');

  if (pendingId) {
    // Open the project directly into storyboard
    openProject(pendingId);
    if (pendingRename) startProjRename(pendingRename);
  } else {
    // Show landing page
    showLanding();
  }
}
