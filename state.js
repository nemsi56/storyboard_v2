'use strict';

// ── PERSISTENCE ───────────────────────────────────────────────────────────────
const DATA_VERSION = '3';
// Fossil key from the last single-project (pre scriptease_proj_<id>) era, when
// DATA_VERSION was '2' — frozen here rather than derived from DATA_VERSION, or
// bumping DATA_VERSION would stop the legacy bootstrap below from ever finding
// a real pre-multi-project user's data again.
const STORAGE_KEY  = 'storyboard_v2';
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
// Section colors are set by a native <input type=color> (always "#rrggbb") but
// can also arrive from an imported/hand-edited file — validate the format
// before it ever reaches a style.background/color-mix() string, rather than
// trusting an arbitrary string into inline CSS.
function isValidSecColor(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v); }
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
      nextEntId: S.nextEntId,
      povCustom: S.povCustom,
      povOrder: S.povOrder,
      storylines: S.storylines,
      revealsLib: S.revealsLib,
      constraints: S.constraints,
      markers: S.markers,
      chronOrder: S.chronOrder,
      dismissed: S.dismissed,
      timelinePrefs: S.timelinePrefs,
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
    if (typeof scheduleConflictsRecompute === 'function') scheduleConflictsRecompute();
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

// Migrate a parsed v2 project object to v3 in place (schema v3 spec §3.2):
// library entities/custom POVs gain ids, scene ref arrays switch from name to
// id arrays, and the timeline fields (storylines/chronOrder/etc) are seeded
// with defaults. Returns d, mutated, with d.v === '3'.
function migrateV2toV3(d) {
  d.nextEntId = 1;
  const toObj = arr => (arr || []).map(x => typeof x === 'string' ? { name: x, notes: '' } : x);
  const libMaps = {};
  ['characters', 'locations', 'themes', 'misc'].forEach(lib => {
    const entries = toObj(d[lib]);
    const map = new Map(); // first entry with a given name wins the name -> id mapping
    entries.forEach(e => {
      e.id = d.nextEntId++;
      if (!map.has(e.name)) map.set(e.name, e.id);
    });
    d[lib] = entries;
    libMaps[lib] = map;
  });
  const charMap = libMaps.characters;
  const povMap = new Map();
  d.povCustom = (d.povCustomNames || []).map(name => {
    const id = d.nextEntId++;
    povMap.set(name, id);
    return { id, name };
  });
  delete d.povCustomNames;

  (d.scenes || []).forEach(sc => {
    ['characters', 'locations', 'themes', 'misc'].forEach(lib => {
      const map = libMaps[lib];
      sc[lib] = (sc[lib] || []).map(name => map.get(name)).filter(id => id !== undefined);
    });
    const povs = Array.isArray(sc.povs) ? sc.povs : [];
    sc.povs = povs.map(name => {
      if (charMap.has(name)) return charMap.get(name);
      if (povMap.has(name)) return povMap.get(name);
      const id = d.nextEntId++;
      povMap.set(name, id);
      d.povCustom.push({ id, name });
      return id;
    });
  });
  d.povOrder = (Array.isArray(d.povOrder) ? d.povOrder : [])
    .map(name => (charMap.has(name) ? charMap.get(name) : povMap.get(name)))
    .filter(id => id !== undefined);

  // Duplicate names within one library: the first entry keeps the name->id
  // mapping (above); any other entry with that name is a shadowed duplicate —
  // drop it unless a scene ref still points at its own (non-canonical) id.
  ['characters', 'locations', 'themes', 'misc'].forEach(lib => {
    const map = libMaps[lib];
    const usedIds = new Set();
    (d.scenes || []).forEach(sc => (sc[lib] || []).forEach(id => usedIds.add(id)));
    d[lib] = d[lib].filter(e => usedIds.has(e.id) || map.get(e.name) === e.id);
  });

  const mainId = d.nextEntId++;
  d.storylines = [{ id: mainId, name: 'Main', paletteIndex: 0 }];
  (d.scenes || []).forEach(sc => {
    sc.storylineId = mainId;
    sc.alsoStorylineIds = [];
    sc.anchor = null;
    sc.durationMin = null;
    sc.offscreen = false;
    sc.reveals = [];
    sc.requires = [];
  });
  d.revealsLib = [];
  d.constraints = [];
  d.markers = [];
  d.dismissed = [];
  d.timelinePrefs = { axis: 'ordinal', threadCharId: null, pxPerScene: 110 };

  // chronOrder = manuscript order at migration time: Unassigned group first
  // (in d.scenes array order), then each section in d.sections array order —
  // exactly what renderBoard() displayed pre-migration.
  const validSecIds = new Set((d.sections || []).map(s => s.id));
  const unassigned = (d.scenes || []).filter(s => !validSecIds.has(s.sectionId));
  const bySection = (d.sections || []).flatMap(sec => (d.scenes || []).filter(s => s.sectionId === sec.id));
  d.chronOrder = [...unassigned, ...bySection].map(s => s.id);

  d.v = '3';
  return d;
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
        v: '2',
        characters: od.characters||[], locations: od.locations||[], themes: od.themes||[], misc: od.misc||[],
        scenes: (od.scenes||[]).map(sc => ({...sc, sectionId: null})),
        nextId: od.nextId||1, andOr: od.andOr, theme: od.theme,
        sections: [], nextSecId: 1,
      });
      migrated = true;
    }
    if (!raw) return false;
    let d = JSON.parse(raw);
    if (!d) return false;
    if (d.v === '2') { d = migrateV2toV3(d); migrated = true; }
    if (d.v !== DATA_VERSION) return false;
    S.characters = d.characters || [];
    S.locations  = d.locations  || [];
    S.themes     = d.themes     || [];
    S.misc       = d.misc       || [];
    S.scenes = (d.scenes || []).map(sc => {
      const arr = v => Array.isArray(v) ? v.filter(x => Number.isInteger(x)) : [];
      return {
        ...sc,
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
        povs: arr(sc.povs),
        storylineId: sc.storylineId,
        alsoStorylineIds: arr(sc.alsoStorylineIds),
        anchor: (sc.anchor && typeof sc.anchor === 'object') ? { date: sc.anchor.date, time: sc.anchor.time ?? null } : null,
        durationMin: (Number.isInteger(sc.durationMin) && sc.durationMin > 0) ? sc.durationMin : null,
        offscreen: !!sc.offscreen,
        reveals: arr(sc.reveals), requires: arr(sc.requires),
      };
    });
    S.nextId    = d.nextId    || 1;
    S.andOr     = d.andOr === 'AND' ? 'AND' : 'OR';
    S.sections  = d.sections  || [];
    S.sections.forEach(s => { if (!isValidSecColor(s.color)) s.color = SEC_COLORS[S.sections.indexOf(s) % SEC_COLORS.length]; });
    S.nextSecId = d.nextSecId || 1;
    const VALID_THEMES = ['ivory','slate','studio','ocean','sunset'];
    const theme = VALID_THEMES.includes(d.theme) ? d.theme : 'ivory';
    document.documentElement.dataset.theme = theme;
    S.lastDataEditAt = d.lastDataEditAt || null;
    // Legacy projects saved before backup tracking existed: treat them as not
    // overdue yet rather than retroactively flagging them as stale on load.
    S.lastExportedAt = d.lastExportedAt || d.lastDataEditAt || new Date().toISOString();
    S.editsSinceExport = d.editsSinceExport || 0;
    S.projectUid = d.projectUid || null;
    S.revision   = d.revision || 0;
    S.nextEntId  = d.nextEntId || 1;
    // A name in both the Character library and here isn't just redundant — it
    // renders twice in every POV dropdown, and the read-only Library-panel POV
    // row hands a character's entry the custom-name edit/delete handlers
    // (deleting it removes the custom name while the character silently keeps
    // supplying the POV). confirmAdd/saveLibEdit/confirmPovAdd all guard
    // against creating this overlap going forward, but stored/imported data
    // from before those guards existed (or a hand-edited file) can already
    // have it — drop those on load rather than re-fixing it in every UI entry
    // point that reads povCustom, rewriting any scene reference from the
    // dropped custom id to the character's id.
    const charByName = new Map(S.characters.map(c => [c.name, c.id]));
    const droppedPovIds = new Map();
    S.povCustom = (Array.isArray(d.povCustom) ? d.povCustom : []).filter(p => {
      if (charByName.has(p.name)) { droppedPovIds.set(p.id, charByName.get(p.name)); return false; }
      return true;
    });
    if (droppedPovIds.size) {
      S.scenes.forEach(sc => { sc.povs = sc.povs.map(id => droppedPovIds.has(id) ? droppedPovIds.get(id) : id); });
    }
    // Any POV id that resolves to neither a character nor a custom POV entry
    // (stale data from before an id existed, or a hand-edited file) can't be
    // repaired without a name to attach it to — drop it, same as any other
    // stale-id-treated-as-absent site (the validSecIds pattern).
    const povIdSet = new Set([...S.characters.map(c => c.id), ...S.povCustom.map(p => p.id)]);
    S.scenes.forEach(sc => { sc.povs = sc.povs.filter(id => povIdSet.has(id)); });
    // Manual drag order for the Library panel's POV row (see
    // orderedUsedPovEntities in editor.js) — append-only, so ids missing here
    // (older saves, or a hand-edited file) just fall back to the panel's
    // default order until dragged, rather than being rejected.
    S.povOrder = (Array.isArray(d.povOrder) ? d.povOrder : []).filter(id => Number.isInteger(id));

    S.storylines = Array.isArray(d.storylines) && d.storylines.length ? d.storylines : [{ id: S.nextEntId++, name: 'Main', paletteIndex: 0 }];
    S.revealsLib = Array.isArray(d.revealsLib) ? d.revealsLib : [];
    S.constraints = Array.isArray(d.constraints) ? d.constraints : [];
    S.markers = Array.isArray(d.markers) ? d.markers : [];
    S.dismissed = Array.isArray(d.dismissed) ? d.dismissed.filter(x => typeof x === 'string') : [];
    const tp = (d.timelinePrefs && typeof d.timelinePrefs === 'object') ? d.timelinePrefs : {};
    S.timelinePrefs = {
      axis: tp.axis === 'true' ? 'true' : 'ordinal',
      threadCharId: Number.isInteger(tp.threadCharId) && S.characters.some(c => c.id === tp.threadCharId) ? tp.threadCharId : null,
      pxPerScene: Number.isInteger(tp.pxPerScene) && tp.pxPerScene >= 70 && tp.pxPerScene <= 200 ? tp.pxPerScene : 110,
    };

    // Every-load invariant repair (schema v3 §3.3, port of ThruLine's
    // enforceInvariants minus its msOrder section — manuscript order here is
    // derived from the board, never stored).
    const stIds = new Set(S.storylines.map(st => st.id));
    S.scenes.forEach(s => { if (!stIds.has(s.storylineId)) s.storylineId = S.storylines[0].id; });
    S.scenes.forEach(s => {
      const out = []; const seenSt = new Set();
      (s.alsoStorylineIds || []).forEach(id => {
        if (id === s.storylineId || seenSt.has(id)) return;
        seenSt.add(id); out.push(id);
      });
      s.alsoStorylineIds = out;
    });
    const sceneIdSet = new Set(S.scenes.map(s => s.id));
    const seenChron = new Set();
    S.chronOrder = (Array.isArray(d.chronOrder) ? d.chronOrder : []).filter(id => {
      if (!sceneIdSet.has(id) || seenChron.has(id)) return false;
      seenChron.add(id); return true;
    });
    S.scenes.forEach(s => { if (!seenChron.has(s.id)) { S.chronOrder.push(s.id); seenChron.add(s.id); } });

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
  nextEntId: 1,
  povCustom: [],
  povOrder: [],
  storylines: [],
  revealsLib: [],
  constraints: [],
  markers: [],
  chronOrder: [],
  dismissed: [],
  timelinePrefs: { axis: 'ordinal', threadCharId: null, pxPerScene: 110 },
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
      alsoStorylineIds:[...(s.alsoStorylineIds||[])],
      reveals:[...(s.reveals||[])], requires:[...(s.requires||[])],
      anchor: s.anchor ? {...s.anchor} : null,
    })),
    nextId: S.nextId,
    sections: S.sections.map(s => ({...s})),
    nextSecId: S.nextSecId,
    nextEntId: S.nextEntId,
    povCustom: dupe(S.povCustom),
    povOrder: [...S.povOrder],
    storylines: dupe(S.storylines),
    revealsLib: dupe(S.revealsLib),
    constraints: dupe(S.constraints),
    markers: dupe(S.markers),
    chronOrder: [...S.chronOrder],
    dismissed: [...S.dismissed],
    // timelinePrefs is deliberately excluded — view state, not data (mirrors
    // ThruLine's viewPrefs-outside-undo rule).
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
    alsoStorylineIds:[...(s.alsoStorylineIds||[])],
    reveals:[...(s.reveals||[])], requires:[...(s.requires||[])],
    anchor: s.anchor ? {...s.anchor} : null,
  }));
  S.nextId    = snap.nextId;
  S.sections  = (snap.sections || []).map(s => ({...s}));
  S.nextSecId = snap.nextSecId || 1;
  S.nextEntId = snap.nextEntId || 1;
  S.povCustom = dupe(snap.povCustom || []);
  S.povOrder = [...(snap.povOrder || [])];
  S.storylines = dupe(snap.storylines || []);
  S.revealsLib = dupe(snap.revealsLib || []);
  S.constraints = dupe(snap.constraints || []);
  S.markers = dupe(snap.markers || []);
  S.chronOrder = [...(snap.chronOrder || [])];
  S.dismissed = [...(snap.dismissed || [])];
  SECS.forEach(({ key }) => {
    S.selections[key] = new Set([...S.selections[key]].filter(v => S[key].some(x => x.id === v)));
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
  // renderBoard() no-ops into renderChart() on its own when chart view is
  // open, but the timeline view is a wholly separate render tree — without
  // this, undo/redo silently desyncs its DOM from the data the moment either
  // fires while timeline mode is open.
  if (typeof timelineMode !== 'undefined' && timelineMode && typeof renderTimeline === 'function') renderTimeline();
  recordDataEdit();
  saveState();
}

function redo() {
  if (!hist.future.length) return;
  const entry = hist.future.pop();
  hist.past.push({ snap: snapshot(), desc: entry.desc });
  applySnapshot(entry.snap);
  buildLibPanel(); renderAllLib(); renderAllCk(); renderSecPanel(); renderSectionSelects(); renderPovCk("sc", []); renderPovCk("ed", []); renderBoard(); updateLibClearBtn(); updateUndoRedo();
  // renderBoard() no-ops into renderChart() on its own when chart view is
  // open, but the timeline view is a wholly separate render tree — without
  // this, undo/redo silently desyncs its DOM from the data the moment either
  // fires while timeline mode is open.
  if (typeof timelineMode !== 'undefined' && timelineMode && typeof renderTimeline === 'function') renderTimeline();
  recordDataEdit();
  saveState();
}
