'use strict';

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

function recordDataEdit() {
  S.lastDataEditAt = new Date().toISOString();
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
      lastDataEditAt: S.lastDataEditAt,
    }));
    const index = loadProjectIndex();
    const entry = index.find(p => p.id === currentProjectId);
    if (entry) {
      entry.modifiedAt = new Date().toISOString();
      entry.sceneCount = S.scenes.length;
      entry.theme = document.documentElement.dataset.theme;
      saveProjectIndex(index);
    }
    updateProjectNameDisplay();
  } catch(e) { /* storage full or unavailable */ }
}

function loadState(storageKey) {
  try {
    const key = storageKey || STORAGE_KEY;
    let raw = localStorage.getItem(key);
    let migrated = false;
    if (!raw && !storageKey) {
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
    S.lastDataEditAt = d.lastDataEditAt || null;
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
  lastDataEditAt: null,
};

// ── HISTORY (undo / redo) ─────────────────────────────────────────────────────
const hist = { past:[], future:[], MAX:10 };

function truncStr(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

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
  SECS.forEach(({ key }) => {
    S.selections[key] = new Set([...S.selections[key]].filter(v => S[key].includes(v)));
  });
  S.selIds = new Set([...S.selIds].filter(id => S.scenes.some(s => s.id === id)));
  if (S.editingId && !S.scenes.some(s => s.id === S.editingId)) cancelEdit();
}

function updateUndoRedo() {
  const ub = document.getElementById('undo-btn');
  const rb = document.getElementById('redo-btn');
  if (!ub || !rb) return;
  const canU = hist.past.length > 0, canR = hist.future.length > 0;
  ub.disabled = !canU; rb.disabled = !canR;
  ub.textContent = canU ? '↩ ' + truncStr(hist.past[hist.past.length-1].desc, 20) : '↩ Undo';
  rb.textContent = canR ? '↪ ' + truncStr(hist.future[hist.future.length-1].desc, 20) : '↪ Redo';
  ub.title = canU ? '↩ ' + hist.past[hist.past.length-1].desc + ' (Ctrl+Z)' : 'Undo (Ctrl+Z)';
  rb.title = canR ? '↪ ' + hist.future[hist.future.length-1].desc + ' (Ctrl+Y)' : 'Redo (Ctrl+Y)';
}

function undo() {
  if (!hist.past.length) return;
  const entry = hist.past.pop();
  hist.future.push({ snap: snapshot(), desc: entry.desc });
  applySnapshot(entry.snap);
  buildLibPanel(); renderAllLib(); renderAllCk(); renderSecPanel(); renderSectionSelects(); renderBoard(); updateLibClearBtn(); updateUndoRedo();
  recordDataEdit();
  saveState();
}

function redo() {
  if (!hist.future.length) return;
  const entry = hist.future.pop();
  hist.past.push({ snap: snapshot(), desc: entry.desc });
  applySnapshot(entry.snap);
  buildLibPanel(); renderAllLib(); renderAllCk(); renderSecPanel(); renderSectionSelects(); renderBoard(); updateLibClearBtn(); updateUndoRedo();
  recordDataEdit();
  saveState();
}
