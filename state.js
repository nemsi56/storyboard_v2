'use strict';

// ── PERSISTENCE ───────────────────────────────────────────────────────────────
const DATA_VERSION = '2';
const STORAGE_KEY  = 'storyboard_v' + DATA_VERSION;
const LEGACY_KEY   = 'storyboard_v1';
const PROJECT_INDEX_KEY = 'scriptease_projects';
const GLOBAL_PREFS_KEY  = 'scriptease_prefs';
let currentProjectId = null;
// Alert once per session on a save failure, not once per edit — saveState runs
// on ~20 different code paths, so an unguarded alert() re-fires (and re-blocks
// the UI) on every single keystroke/action for as long as storage stays broken.
let saveErrorAlerted = false;

function projKey(id) { return 'scriptease_proj_' + id; }
// Single normalization rule for scene.wordCount, used both on load and on
// JSON import: null unless a positive number, rounded to an integer. Without
// the rounding, a float that slipped in (a hand-edited file, or a future
// version that allows fractional counts) would silently mismatch the Edit
// form's parseWordCount() — which only ever produces integers via parseInt —
// so the form would read as dirty the instant the scene is opened, and saving
// would truncate the value without the user having changed anything.
function normalizeWordCount(v) {
  if (v == null) return null;
  // Round first, then check positivity — checking `v > 0` before rounding
  // would let a value like 0.4 (which rounds to 0) through as a non-null 0,
  // defeating the whole point of this function.
  const n = Math.round(v);
  return n > 0 ? n : null;
}
function genProjId() { return 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
// Permanent project lineage id — unlike the storage id above, this survives
// export/import so copies of the same project can be recognized across devices.
function genProjUid() { return 'puid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10); }

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
  S.editsSinceExport = (S.editsSinceExport || 0) + 1;
}

function saveState() {
  if (!currentProjectId) return;
  try {
    if (!S.projectUid) S.projectUid = genProjUid();
    S.revision = (S.revision || 0) + 1;
    localStorage.setItem(projKey(currentProjectId), JSON.stringify({
      v: DATA_VERSION,
      characters: S.characters, locations: S.locations, themes: S.themes, misc: S.misc,
      scenes: S.scenes, nextId: S.nextId, andOr: S.andOr,
      theme: document.documentElement.dataset.theme,
      sections: S.sections, nextSecId: S.nextSecId,
      lastDataEditAt: S.lastDataEditAt,
      lastExportedAt: S.lastExportedAt, editsSinceExport: S.editsSinceExport,
      projectUid: S.projectUid, revision: S.revision,
      povCustomNames: S.povCustomNames,
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
  } catch(e) {
    const isQuotaErr = e.name === 'QuotaExceededError';
    console.warn('Storage error:', isQuotaErr ? 'quota exceeded' : e.message);
    // Any save failure — quota or otherwise (storage disabled, a privacy-mode
    // SecurityError, etc.) — means everything from here on is edited in memory
    // only and will be lost on refresh with no other warning, so this needs to
    // surface once. Previously only the quota case alerted at all, and it did
    // so on every single edit rather than once.
    if (!saveErrorAlerted && typeof window !== 'undefined') {
      saveErrorAlerted = true;
      alert(isQuotaErr
        ? 'Your browser storage is full. Please delete some old projects, then reload — until then, new changes are not being saved and will be lost if you close or refresh this tab.'
        : 'Your changes could not be saved (browser storage is unavailable). New changes are not being saved and will be lost if you close or refresh this tab.');
    }
  }
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
    S.scenes = (d.scenes || []).map(sc => {
      // POV was a single string before multi-POV support; migrate old data
      // into the new array shape and drop the legacy key.
      const povs = Array.isArray(sc.povs)
        ? sc.povs.filter(v => typeof v === 'string')
        : (typeof sc.pov === 'string' && sc.pov ? [sc.pov] : []);
      const { pov, ...rest } = sc;
      const arr = v => Array.isArray(v) ? v : [];
      return {
        ...rest,
        characters: arr(sc.characters), locations: arr(sc.locations),
        themes: arr(sc.themes),         misc: arr(sc.misc),
        sectionId: sc.sectionId ?? null,
        // A negative/zero/non-integer wordCount could only get here from data
        // saved before the New/Edit Scene forms started rejecting it (or a
        // hand-edited file) — normalize on load same as import does, so it
        // can't survive as invisible bad data (charts already treat ≤0 as
        // unset, but stored reports/exports shouldn't carry a nonsensical
        // negative or fractional number).
        wordCount: normalizeWordCount(sc.wordCount),
        povs,
      };
    });
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
    // Legacy projects saved before backup tracking existed: treat them as not
    // overdue yet rather than retroactively flagging them as stale on load.
    S.lastExportedAt = d.lastExportedAt || d.lastDataEditAt || new Date().toISOString();
    S.editsSinceExport = d.editsSinceExport || 0;
    S.projectUid = d.projectUid || null;
    S.revision   = d.revision || 0;
    S.povCustomNames = d.povCustomNames || [];
    // Fold in any scene's POV name that predates this list (older exports,
    // or a since-removed character) so it's immediately a normal, reusable
    // checklist option rather than only recognized once that scene is opened.
    S.scenes.forEach(sc => {
      (sc.povs || []).forEach(name => {
        if (!S.characters.some(c => c.name === name) && !S.povCustomNames.includes(name)) {
          S.povCustomNames.push(name);
        }
      });
    });
    if (migrated) saveState();
    return true;
  } catch(e) {
    // The block above mutates S field-by-field rather than building a temp
    // object and assigning it atomically, so an exception partway through
    // (e.g. a malformed `sections` array) can leave S with some fields loaded
    // from this project and others still at their pre-call values. Reset
    // before returning false so a caller that (correctly) treats `false` as
    // "nothing loaded" is actually true, not just conventionally true.
    if (typeof resetState === 'function') resetState();
    return false;
  }
}

// ── STATE ─────────────────────────────────────────────────────────────────────
const S = {
  characters:[], locations:[], themes:[], misc:[],
  scenes:[],
  sections:[], nextSecId:1,
  selections:{ characters:new Set(), locations:new Set(), themes:new Set(), misc:new Set(), povs:new Set() },
  andOr: 'OR',
  selIds: new Set(),
  editingId: null,
  nextId: 1,
  lastDataEditAt: null,
  lastExportedAt: null,
  editsSinceExport: 0,
  projectUid: null,
  revision: 0,
  povCustomNames: [],
};

// ── HISTORY (undo / redo) ─────────────────────────────────────────────────────
const hist = { past:[], future:[], MAX:50 };

function truncStr(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

function snapshot() {
  const dupe = arr => arr.map(x => ({...x}));
  return {
    characters: dupe(S.characters), locations: dupe(S.locations),
    themes: dupe(S.themes),         misc: dupe(S.misc),
    scenes: S.scenes.map(s => ({
      ...s,
      characters:[...s.characters], locations:[...s.locations],
      themes:[...s.themes],         misc:[...s.misc],
      povs:[...(s.povs||[])],
    })),
    nextId: S.nextId,
    sections: S.sections.map(s => ({...s})),
    nextSecId: S.nextSecId,
    povCustomNames: [...S.povCustomNames],
  };
}

function pushHistory(desc) {
  hist.past.push({ snap: snapshot(), desc });
  if (hist.past.length > hist.MAX) hist.past.shift();
  hist.future = [];
  updateUndoRedo();
}

function applySnapshot(snap) {
  const dupe = arr => arr.map(x => ({...x}));
  S.characters = dupe(snap.characters); S.locations = dupe(snap.locations);
  S.themes     = dupe(snap.themes);     S.misc      = dupe(snap.misc);
  S.scenes = snap.scenes.map(s => ({
    ...s,
    characters:[...s.characters], locations:[...s.locations],
    themes:[...s.themes],         misc:[...s.misc],
    povs:[...(s.povs||[])],
  }));
  S.nextId    = snap.nextId;
  S.sections  = (snap.sections || []).map(s => ({...s}));
  S.nextSecId = snap.nextSecId || 1;
  S.povCustomNames = [...(snap.povCustomNames || [])];
  SECS.forEach(({ key }) => {
    S.selections[key] = new Set([...S.selections[key]].filter(v => S[key].some(x => x.name === v)));
  });
  const usedPovs = new Set(S.scenes.flatMap(s => s.povs || []));
  S.selections.povs = new Set([...S.selections.povs].filter(v => usedPovs.has(v)));
  S.selIds = new Set([...S.selIds].filter(id => S.scenes.some(s => s.id === id)));
  if (S.editingId && !S.scenes.some(s => s.id === S.editingId)) cancelEdit();
}

function updateUndoRedo() {
  const canU = hist.past.length > 0, canR = hist.future.length > 0;
  const ul = document.getElementById('mdi-undo-lbl');
  const rl = document.getElementById('mdi-redo-lbl');
  if (ul) ul.textContent = canU ? 'Undo ' + truncStr(hist.past[hist.past.length-1].desc, 22) : 'Undo';
  if (rl) rl.textContent = canR ? 'Redo ' + truncStr(hist.future[hist.future.length-1].desc, 22) : 'Redo';
}

function undo() {
  if (!hist.past.length) return;
  const entry = hist.past.pop();
  hist.future.push({ snap: snapshot(), desc: entry.desc });
  applySnapshot(entry.snap);
  buildLibPanel(); renderAllLib(); renderAllCk(); renderSecPanel(); renderSectionSelects(); renderPovCk("sc", []); renderPovCk("ed", []); renderBoard(); updateLibClearBtn(); updateUndoRedo();
  recordDataEdit();
  saveState();
}

function redo() {
  if (!hist.future.length) return;
  const entry = hist.future.pop();
  hist.past.push({ snap: snapshot(), desc: entry.desc });
  applySnapshot(entry.snap);
  buildLibPanel(); renderAllLib(); renderAllCk(); renderSecPanel(); renderSectionSelects(); renderPovCk("sc", []); renderPovCk("ed", []); renderBoard(); updateLibClearBtn(); updateUndoRedo();
  recordDataEdit();
  saveState();
}
