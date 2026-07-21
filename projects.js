'use strict';

// ── PROJECT MANAGER ──────────────────────────────────────────────────────────

function migrateExistingData() {
  if (localStorage.getItem(PROJECT_INDEX_KEY)) return;
  let raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const old = localStorage.getItem(LEGACY_KEY);
    if (old) {
      try {
        const od = JSON.parse(old);
        if (od && od.v === '1') {
          raw = JSON.stringify({
            v: '2',
            characters: od.characters||[], locations: od.locations||[], themes: od.themes||[], misc: od.misc||[],
            scenes: (od.scenes||[]).map(sc => ({...sc, sectionId: null})),
            nextId: od.nextId||1, andOr: od.andOr, theme: od.theme,
            sections: [], nextSecId: 1,
          });
        }
      } catch(e) { console.warn('Could not migrate legacy data:', e.message); }
    }
  }
  if (raw) {
    try {
      let d = JSON.parse(raw);
      if (d && d.v === '2') d = migrateV2toV3(d);
      raw = JSON.stringify(d);
      const id = genProjId();
      localStorage.setItem(projKey(id), raw);
      const now = new Date().toISOString();
      saveProjectIndex([{
        id, name: 'My Storyboard', createdAt: now, modifiedAt: now,
        sceneCount: (d.scenes || []).length, theme: d.theme || 'ivory'
      }]);
      saveGlobalPrefs({ theme: d.theme || 'ivory' });
    } catch(e) { console.warn('Could not migrate data:', e.message); }
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

function esc(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

function renderProjectGrid() {
  const grid = document.getElementById('proj-grid');
  if (!grid) return; // not on the projects page (e.g. import from the editor's File menu)
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
      </div>`;

    const actions = document.createElement('div');
    actions.className = 'pm-card-actions';

    const makeBtn = (label, fn, extraClass) => {
      const btn = document.createElement('button');
      btn.className = 'pm-card-btn' + (extraClass ? ' ' + extraClass : '');
      btn.textContent = label;
      btn.addEventListener('click', (event) => { event.stopPropagation(); fn(p.id); });
      return btn;
    };

    actions.appendChild(makeBtn('Open', openProject));
    actions.appendChild(makeBtn('Rename', startProjRename));
    actions.appendChild(makeBtn('Duplicate', duplicateProject));
    actions.appendChild(makeBtn('Export', exportProjectJSON));
    actions.appendChild(makeBtn('Delete', startProjDel, 'del'));

    card.appendChild(actions);
    grid.appendChild(card);
  });
}

function showProjectManager() {
  if (_page === 'editor') {
    window.location.href = 'projects.html';
    return;
  }
  if (_page === 'projects') {
    renderProjectGrid();
  }
}

function showStoryboard() {
  if (_page === 'editor') {
    document.getElementById('app-storyboard').style.display = 'flex';
  }
}

function resetState() {
  S.characters = []; S.locations = []; S.themes = []; S.misc = [];
  S.scenes = []; S.nextId = 1; S.andOr = 'OR';
  S.sections = []; S.nextSecId = 1;
  S.nextEntId = 1;
  S.povCustom = [];
  S.povOrder = [];
  S.storylines = []; S.revealsLib = []; S.constraints = []; S.markers = [];
  S.chronOrder = []; S.dismissed = [];
  S.timelinePrefs = { axis: 'ordinal', threadCharId: null, pxPerScene: 110 };
  SECS.forEach(({ key }) => S.selections[key].clear());
  S.selections.povs.clear();
  S.selIds.clear(); S.editingId = null;
  S.projectUid = null; S.revision = 0;
  S.lastExportedAt = null; S.editsSinceExport = 0;
  hist.past = []; hist.future = [];
}

function initStoryboard() {
  syncAndOrUI();
  buildLibPanel(); renderAllLib(); renderAllCk();
  renderSecPanel(); renderSectionSelects(); renderPovCk('sc', []); renderPovCk('ed', []);
  renderBoard(); updateLibClearBtn(); updateUndoRedo();
  document.getElementById('board').classList.add('hide-details');
  document.getElementById('det-toggle').checked = false;
}

function formatEditDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const m = String(d.getMonth() + 1);
  const day = String(d.getDate());
  const y = String(d.getFullYear()).slice(-2);
  return `${m}/${day}/${y}`;
}

// User-legible, filename-safe timestamp for backup exports, e.g. "2026-07-08 2-45PM".
function formatFileTimestamp(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h24 = d.getHours();
  const h12 = h24 % 12 || 12;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day} ${h12}-${min}${ampm}`;
}

function updateProjectNameDisplay() {
  if (!currentProjectId) return;
  const index = loadProjectIndex();
  const entry = index.find(p => p.id === currentProjectId);
  const titleEl = document.getElementById('proj-name-title');
  const timeEl  = document.getElementById('proj-name-time');
  if (titleEl) titleEl.textContent = entry ? entry.name : '';
  if (timeEl)  timeEl.textContent  = S.lastDataEditAt ? 'Last update ' + formatEditDate(S.lastDataEditAt) : '';
  if (typeof refreshBackupStatus === 'function') refreshBackupStatus();
}

function openProject(id) {
  if (_page === 'projects') {
    sessionStorage.setItem('ss_open_project', id);
    window.location.href = 'editor.html';
    return;
  }
  currentProjectId = id;
  resetState();
  if (!loadState(projKey(id))) {
    // Corrupt/unreadable project data: bounce out instead of opening an empty,
    // saveable session — the very next save (any edit, undo, even a theme
    // change) would overwrite the stored blob with that empty state, turning
    // a possibly-recoverable file into permanent data loss.
    currentProjectId = null;
    alert('This project\'s data could not be read (it may be corrupted or from an incompatible version). Nothing has been changed — returning to your project list.');
    window.location.href = 'projects.html';
    return;
  }
  getUserId();
  ensureProjectMilestoneBaselines();
  // Reset board view state left over from whatever was open before. Usually
  // a no-op (a normal "Open" from the Projects page is a full page
  // navigation, which already starts clean) — but openProject() can also run
  // on an already-loaded editor page, e.g. reconciling an "Update Local
  // Copy" import while the conflicting project is open, or File > New
  // Project. Without this, a stale section filter or search query can make
  // the freshly loaded project appear empty for no visible reason.
  if (typeof secFilterIds !== 'undefined') secFilterIds.clear();
  if (typeof clearSearch === 'function') clearSearch();
  if (typeof closeChartView === 'function') closeChartView();
  updateProjectNameDisplay();
  initStoryboard();
  showStoryboard();
}

function openNewProjectModal() {
  const modal = document.getElementById('proj-new-modal');
  const input = document.getElementById('proj-new-input');
  if (!modal || !input) { createAndOpenProject(); return; }
  input.value = 'Untitled Project';
  modal.classList.add('open');
  setTimeout(() => {
    input.focus(); input.select();
  }, 100);
}

function closeNewProject() { document.getElementById('proj-new-modal').classList.remove('open'); }

function confirmNewProject() {
  const name = document.getElementById('proj-new-input').value.trim();
  closeNewProject();
  createAndOpenProject(name);
}

function createAndOpenProject(name) {
  name = (name || '').trim() || 'Untitled Project';
  trackProjectCreated();
  const id = genProjId();
  const now = new Date().toISOString();
  const index = loadProjectIndex();
  index.push({ id, name, createdAt: now, modifiedAt: now, sceneCount: 0, theme: document.documentElement.dataset.theme });
  saveProjectIndex(index);

  if (index.length === 2) {
    trackMilestone('2nd_project_created');
  }
  localStorage.setItem(projKey(id), JSON.stringify({
    v: DATA_VERSION, characters:[], locations:[], themes:[], misc:[],
    scenes:[], nextId:1, andOr:'OR', theme: document.documentElement.dataset.theme,
    sections:[], nextSecId:1,
    nextEntId: 2,
    povCustom:[], povOrder:[],
    storylines: [{ id: 1, name: 'Main', paletteIndex: 0 }],
    revealsLib:[], constraints:[], markers:[], chronOrder:[], dismissed:[],
    timelinePrefs: { axis:'ordinal', threadCharId:null, pxPerScene:110 },
    projectUid: genProjUid(), revision: 0,
  }));
  if (_page === 'projects') {
    sessionStorage.setItem('ss_open_project', id);
    window.location.href = 'editor.html';
    return;
  }
  openProject(id);
}

function backToProjects() {
  // Don't clear currentProjectId here: if beforeunload's confirmation dialog
  // (from unexported changes) is shown and the user chooses to stay, the page
  // never unloads and autosave would silently stop working. A real navigation
  // discards all JS state anyway, so nulling it first serves no purpose.
  if (currentProjectId) saveState();
  window.location.href = 'projects.html';
}

let renamingProjId = null;
function startProjRename(id) {
  const modal = document.getElementById('proj-rename-modal');
  const input = document.getElementById('proj-rename-input');
  if (!modal || !input) return; // Only proceed if on projects page
  renamingProjId = id;
  const index = loadProjectIndex();
  const entry = index.find(p => p.id === id);
  input.value = entry ? entry.name : '';
  modal.classList.add('open');
  setTimeout(() => {
    input.focus(); input.select();
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
  if (currentProjectId === renamingProjId) {
    const titleEl = document.getElementById('proj-name-title');
    if (titleEl) titleEl.textContent = name;
  }
  closeProjRename();
  renderProjectGrid();
}

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
  trackProjectDeleted();
  const index = loadProjectIndex();
  const entry = index.find(p => p.id === deletingProjId);
  // Deleting a sample is a deliberate "I don't want this" — remember its stable
  // key so a future SAMPLES_VERSION bump (see ensureSampleProjects) never re-adds
  // it, the same way it's never re-added on a plain page reload today. Keyed by
  // sampleKey (not name) so renaming the project first doesn't let it slip back
  // in under its original name, nor get re-added as a duplicate under the new one.
  // entry.sampleKey may be absent on an index entry seeded before this field
  // existed — fall back to name for that one case so it's still recognized.
  if (entry && entry.isSample) {
    const prefs = loadGlobalPrefs();
    const deleted = new Set(prefs.deletedSamples || []);
    deleted.add(entry.sampleKey || entry.name);
    prefs.deletedSamples = [...deleted];
    saveGlobalPrefs(prefs);
  }
  localStorage.removeItem(projKey(deletingProjId));
  saveProjectIndex(index.filter(p => p.id !== deletingProjId));
  closeProjDel();
  renderProjectGrid();
}

function duplicateProject(id) {
  trackProjectDuplicated();
  let raw = localStorage.getItem(projKey(id));
  if (!raw) return;
  // A duplicate is its own lineage — give it a fresh uid so it never
  // false-matches its original during import conflict checks.
  try {
    const d = JSON.parse(raw);
    d.projectUid = genProjUid();
    raw = JSON.stringify(d);
  } catch(e) {}
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

function exportProjectJSON(id) {
  trackProjectExported();
  const raw = localStorage.getItem(projKey(id));
  if (!raw) return;
  try {
    const index = loadProjectIndex();
    const entry = index.find(p => p.id === id);
    const name = entry ? entry.name : 'project';
    const data = JSON.parse(raw);
    // Assign a lineage uid to projects saved before uid support existed, and
    // write it back so the local copy matches its own export from now on.
    if (!data.projectUid) {
      data.projectUid = genProjUid();
      data.revision = data.revision || 0;
    }
    const exportedAt = new Date().toISOString();
    data.lastExportedAt = exportedAt;
    data.editsSinceExport = 0;
    // Best-effort only: this write-back just clears the "N changes since
    // backup" bookkeeping, and storage being full — quota exceeded, or
    // disabled entirely — is exactly the moment export is most needed as an
    // escape hatch. It must not block the actual file download below, which
    // needs no storage at all.
    try {
      localStorage.setItem(projKey(id), JSON.stringify(data));
      if (id === currentProjectId) {
        S.lastExportedAt = exportedAt;
        S.editsSinceExport = 0;
        if (typeof refreshBackupStatus === 'function') refreshBackupStatus();
      }
    } catch(e) { console.warn('Could not update backup bookkeeping:', e.message); }
    data.projectName = name;
    data.exportedAt = exportedAt;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    // A name that's entirely punctuation/symbols (e.g. "!!!") sanitizes down to
    // an empty string, which would otherwise leave the filename starting with
    // a bare space before the timestamp.
    const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'project';
    a.download = safeName + ' ' + formatFileTimestamp(new Date(exportedAt)) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch(e) {
    alert('Could not export project. Please try again.');
    console.warn('Export failed:', e.message);
  }
}

function exportCurrentProject() {
  if (currentProjectId) {
    saveState();
    exportProjectJSON(currentProjectId);
  }
}

// Find the local project (index entry + stored data) sharing a lineage uid, if any.
function findProjectByUid(uid) {
  if (!uid) return null;
  const index = loadProjectIndex();
  for (const p of index) {
    try {
      const raw = localStorage.getItem(projKey(p.id));
      if (!raw) continue;
      const d = JSON.parse(raw);
      if (d.projectUid === uid) return { entry: p, data: d };
    } catch(e) {}
  }
  return null;
}

// Small dynamic modal for import conflict choices (works on both pages).
// buttons: [{ label, primary, onClick }] — every button closes the dialog.
function showImportChoiceDialog(title, msg, buttons) {
  const overlay = document.createElement('div');
  // pm-modal-dynamic marks this as the one-off, safe-to-.remove() overlay, as
  // opposed to the static .pm-modal elements on projects.html (New/Rename/
  // Delete) — closeImportChoiceDialog() and editor.js's modal guards key off
  // the specific class so they can never match (and in the close function's
  // case, permanently delete) one of the static modals.
  overlay.className = 'pm-modal pm-modal-dynamic open';
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
  const box = document.createElement('div'); box.className = 'pm-modal-box';
  const t = document.createElement('div'); t.className = 'pm-modal-title'; t.textContent = title;
  const m = document.createElement('div'); m.className = 'pm-modal-del-msg'; m.textContent = msg;
  m.style.whiteSpace = 'pre-wrap';
  const btns = document.createElement('div'); btns.className = 'pm-modal-btns';
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'pm-btn ' + (b.primary ? 'pm-btn-primary' : 'pm-btn-secondary');
    btn.textContent = b.label;
    btn.addEventListener('click', () => { overlay.remove(); if (b.onClick) b.onClick(); });
    btns.appendChild(btn);
  });
  box.appendChild(t); box.appendChild(m); box.appendChild(btns);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}
// Escape-key path for the dialog above (mirrors every other modal's close
// behavior: dismiss without taking any of the buttons' actions). At most one
// of these is ever open at a time, so removing whichever is present is
// unambiguous. Matches only .pm-modal-dynamic — a bare '.pm-modal.open'
// selector would also match the static New/Rename/Delete modals on
// projects.html, and .remove() would delete those from the DOM permanently
// rather than just closing them.
function closeImportChoiceDialog() {
  document.querySelector('.pm-modal-dynamic.open')?.remove();
}

// Full schema v3 import validation (spec §11). Returns an error message
// string to alert() and reject the import, or null if the file is well-
// formed. Never mutates d except the trusted nextEntId auto-repair, mirroring
// the existing nextId/nextSecId auto-repair for v2 imports above.
function validateV3Import(d) {
  const isStr = v => typeof v === 'string';
  const isPosInt = v => Number.isInteger(v) && v > 0;
  const isIntArr = v => Array.isArray(v) && v.every(Number.isInteger);

  const arrayFields = ['characters', 'locations', 'themes', 'misc', 'scenes', 'sections',
    'povCustom', 'storylines', 'revealsLib', 'constraints', 'markers', 'chronOrder', 'dismissed'];
  const missingFields = arrayFields.filter(f => !Array.isArray(d[f]));
  if (missingFields.length) return 'Invalid project structure. Missing required arrays: ' + missingFields.join(', ');
  if (!Number.isInteger(d.nextEntId)) return 'Invalid project structure. "nextEntId" must be an integer.';
  if (!isIntArr(d.povOrder)) return 'Invalid project structure. "povOrder" must be an array of integers.';

  // Every id-bearing collection shares one counter (schema v3 §2.1) — ids
  // must be unique across all of them combined, not just within each array.
  const idBearing = [
    ['characters', d.characters], ['locations', d.locations], ['themes', d.themes], ['misc', d.misc],
    ['povCustom', d.povCustom], ['storylines', d.storylines], ['revealsLib', d.revealsLib],
    ['constraints', d.constraints], ['markers', d.markers],
  ];
  const allIds = [];
  for (const [field, arr] of idBearing) {
    for (const item of arr) {
      if (!item || typeof item !== 'object' || !isPosInt(item.id)) return 'Invalid project structure. Every entry in "' + field + '" needs a positive integer "id".';
      allIds.push(item.id);
    }
  }
  if (new Set(allIds).size !== allIds.length) return 'Invalid project structure. Entity ids must be unique across the whole file.';
  const maxEntId = allIds.reduce((m, id) => Math.max(m, id), 0);
  if (d.nextEntId <= maxEntId) d.nextEntId = maxEntId + 1;

  for (const f of ['characters', 'locations', 'themes', 'misc', 'povCustom']) {
    if (!d[f].every(x => isStr(x.name))) return 'Invalid project structure. Every entry in "' + f + '" needs a string "name".';
  }
  if (!d.revealsLib.every(r => isStr(r.label))) return 'Invalid project structure. Every entry in "revealsLib" needs a string "label".';
  if (!d.storylines.length) return 'Invalid project structure. "storylines" must not be empty.';
  if (!d.storylines.every(st => isStr(st.name))) return 'Invalid project structure. Every storyline needs a string "name".';
  if (!d.storylines.every(st => Number.isInteger(st.paletteIndex) && st.paletteIndex >= 0 && st.paletteIndex <= 9)) {
    return 'Invalid project structure. Every storyline needs a "paletteIndex" integer 0-9.';
  }

  const charIds = new Set(d.characters.map(c => c.id));
  const locIds = new Set(d.locations.map(l => l.id));
  const themeIds = new Set(d.themes.map(t => t.id));
  const miscIds = new Set(d.misc.map(m => m.id));
  const povIds = new Set([...charIds, ...d.povCustom.map(p => p.id)]);
  const storylineIds = new Set(d.storylines.map(s => s.id));
  const revealIds = new Set(d.revealsLib.map(r => r.id));

  const sceneIds = new Set();
  for (let i = 0; i < d.scenes.length; i++) {
    const sc = d.scenes[i], n = i + 1;
    if (!sc || typeof sc !== 'object' || !Number.isInteger(sc.id) || !isStr(sc.title)) {
      return 'Invalid project structure. Scene ' + n + ' needs a numeric "id" and a string "title".';
    }
    sceneIds.add(sc.id);
    for (const key of ['characters', 'locations', 'themes', 'misc', 'povs', 'reveals', 'requires']) {
      if (sc[key] != null && !isIntArr(sc[key])) return 'Invalid project structure. Scene ' + n + ' "' + key + '" must be an array of integer ids.';
    }
    if ((sc.characters || []).some(id => !charIds.has(id))) return 'Invalid project structure. Scene ' + n + ' references an unknown character id.';
    if ((sc.locations || []).some(id => !locIds.has(id))) return 'Invalid project structure. Scene ' + n + ' references an unknown location id.';
    if ((sc.themes || []).some(id => !themeIds.has(id))) return 'Invalid project structure. Scene ' + n + ' references an unknown theme id.';
    if ((sc.misc || []).some(id => !miscIds.has(id))) return 'Invalid project structure. Scene ' + n + ' references an unknown misc id.';
    if ((sc.povs || []).some(id => !povIds.has(id))) return 'Invalid project structure. Scene ' + n + ' references an unknown POV id.';
    if ((sc.reveals || []).some(id => !revealIds.has(id)) || (sc.requires || []).some(id => !revealIds.has(id))) {
      return 'Invalid project structure. Scene ' + n + ' references an unknown reveal id.';
    }
    if (!Number.isInteger(sc.storylineId) || !storylineIds.has(sc.storylineId)) return 'Invalid project structure. Scene ' + n + ' "storylineId" does not resolve to a storyline.';
    const also = sc.alsoStorylineIds || [];
    if (sc.alsoStorylineIds != null && !isIntArr(also)) return 'Invalid project structure. Scene ' + n + ' "alsoStorylineIds" must be an array of integers.';
    if (also.includes(sc.storylineId)) return 'Invalid project structure. Scene ' + n + ' "alsoStorylineIds" contains its own storylineId.';
    if (new Set(also).size !== also.length) return 'Invalid project structure. Scene ' + n + ' "alsoStorylineIds" contains duplicates.';
    if (also.some(id => !storylineIds.has(id))) return 'Invalid project structure. Scene ' + n + ' "alsoStorylineIds" references an unknown storyline.';
    if (sc.anchor != null) {
      if (typeof sc.anchor !== 'object' || !isStr(sc.anchor.date)) return 'Invalid project structure. Scene ' + n + ' has a malformed anchor.';
      const dt = new Date(sc.anchor.date + 'T00:00:00Z');
      if (isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== sc.anchor.date) return 'Invalid project structure. Scene ' + n + ' anchor date is not a real calendar date.';
      if (sc.anchor.time != null && (!isStr(sc.anchor.time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(sc.anchor.time))) {
        return 'Invalid project structure. Scene ' + n + ' anchor time must be "HH:MM" between 00:00 and 23:59.';
      }
    }
    if (sc.durationMin != null && !(Number.isInteger(sc.durationMin) && sc.durationMin > 0)) return 'Invalid project structure. Scene ' + n + ' "durationMin" must be null or a positive integer.';
    if (sc.offscreen != null && typeof sc.offscreen !== 'boolean') return 'Invalid project structure. Scene ' + n + ' "offscreen" must be a boolean.';
  }
  if (new Set(d.scenes.map(s => s.id)).size !== d.scenes.length) return 'Invalid project structure. Scene "id" values must be unique.';

  for (const c of d.constraints) {
    if (!['before', 'same-time', 'offset'].includes(c.type)) return 'Invalid project structure. Constraint ' + c.id + ' has an invalid "type".';
    if (!sceneIds.has(c.a) || !sceneIds.has(c.b)) return 'Invalid project structure. Constraint ' + c.id + ' references an unknown scene.';
    if (c.type === 'offset' && !isPosInt(c.offsetMin)) return 'Invalid project structure. Constraint ' + c.id + ' needs a positive integer "offsetMin".';
  }
  for (const m of d.markers) {
    if (!isStr(m.label)) return 'Invalid project structure. Marker ' + m.id + ' needs a string "label".';
    if (m.beforeSceneId != null && !sceneIds.has(m.beforeSceneId)) return 'Invalid project structure. Marker ' + m.id + ' "beforeSceneId" does not resolve.';
  }

  if (d.chronOrder.length !== sceneIds.size || new Set(d.chronOrder).size !== d.chronOrder.length || !d.chronOrder.every(id => sceneIds.has(id))) {
    return 'Invalid project structure. "chronOrder" must contain every scene id exactly once.';
  }
  if (!d.dismissed.every(isStr)) return 'Invalid project structure. "dismissed" must be an array of strings.';

  if (d.timelinePrefs != null) {
    const tp = d.timelinePrefs;
    if (typeof tp !== 'object') return 'Invalid project structure. "timelinePrefs" must be an object.';
    if (!['ordinal', 'true'].includes(tp.axis)) return 'Invalid project structure. "timelinePrefs.axis" must be "ordinal" or "true".';
    if (tp.threadCharId != null && (!Number.isInteger(tp.threadCharId) || !charIds.has(tp.threadCharId))) {
      return 'Invalid project structure. "timelinePrefs.threadCharId" must be null or resolve to a character.';
    }
    if (!Number.isInteger(tp.pxPerScene) || tp.pxPerScene < 70 || tp.pxPerScene > 200) {
      return 'Invalid project structure. "timelinePrefs.pxPerScene" must be an integer 70-200.';
    }
  }

  return null;
}

function importProjectJSON(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const d = JSON.parse(e.target.result);

      if (!d || (d.v !== '2' && d.v !== '3')) {
        alert('Invalid project file version. Expected v: "2" or "3"' + (d && d.v ? ' but found v: "' + d.v + '"' : '') + '.');
        return;
      }

      if (d.v === '3') {
        const v3Err = validateV3Import(d);
        if (v3Err) { alert(v3Err); return; }
      } else {
      const requiredFields = ['characters', 'locations', 'themes', 'misc', 'scenes', 'sections'];
      const missingFields = requiredFields.filter(f => !Array.isArray(d[f]));
      if (missingFields.length > 0) {
        alert('Invalid project structure. Missing required arrays: ' + missingFields.join(', '));
        return;
      }

      const isStr = v => typeof v === 'string';
      const badLib = ['characters', 'locations', 'themes', 'misc']
        .find(f => !d[f].every(x => isStr(x) || (x && typeof x === 'object' && isStr(x.name))));
      if (badLib) {
        alert('Invalid project structure. Every entry in "' + badLib + '" must be a name or an object with a "name" string.');
        return;
      }
      // Every name-collision check elsewhere (confirmAdd, saveLibEdit, the
      // checklist checkbox value itself) assumes one entry per name within a
      // library array — a duplicate that arrives via import instead of the
      // UI renders two checkboxes sharing one value, which can only ever
      // reflect/toggle as a single checked state despite being two distinct
      // library entries.
      const badLibDup = ['characters', 'locations', 'themes', 'misc'].find(f => {
        const names = d[f].map(x => typeof x === 'string' ? x : x.name);
        return new Set(names).size !== names.length;
      });
      if (badLibDup) {
        alert('Invalid project structure. "' + badLibDup + '" contains duplicate names — each entry must have a unique name.');
        return;
      }

      const isStrArr = v => v == null || (Array.isArray(v) && v.every(isStr));
      // Number.isInteger (not typeof === 'number') so NaN/Infinity from a
      // hand-edited file are rejected here rather than reaching nextId/
      // nextSecId math below — an Infinity id makes every id-based lookup
      // afterward (nextId itself becomes Infinity, so every scene added post-
      // import shares one id) silently ambiguous instead of a clean rejection.
      const badSceneIdx = d.scenes.findIndex(sc =>
        !sc || typeof sc !== 'object' || !Number.isInteger(sc.id) || !isStr(sc.title) ||
        (sc.summary != null && !isStr(sc.summary)) || (sc.notes != null && !isStr(sc.notes)) ||
        (sc.wordCount != null && typeof sc.wordCount !== 'number') ||
        (sc.sectionId != null && !Number.isInteger(sc.sectionId)) ||
        (sc.pov != null && !isStr(sc.pov)) || // legacy single-value POV, still accepted on import
        (sc.povs != null && (!Array.isArray(sc.povs) || !sc.povs.every(isStr))) ||
        !isStrArr(sc.characters) || !isStrArr(sc.locations) || !isStrArr(sc.themes) || !isStrArr(sc.misc));
      if (badSceneIdx !== -1) {
        alert('Invalid project structure. Scene ' + (badSceneIdx + 1) + ' needs a numeric "id", a string "title", string "summary"/"notes" if present, a numeric "wordCount" if present, a numeric "sectionId" if present, a string "pov" if present, and arrays of strings for "povs"/"characters"/"locations"/"themes"/"misc" if present.');
        return;
      }
      if (new Set(d.scenes.map(sc => sc.id)).size !== d.scenes.length) {
        alert('Invalid project structure. Scene "id" values must be unique.');
        return;
      }

      const badSecIdx = d.sections.findIndex(sec => !sec || typeof sec !== 'object' || !Number.isInteger(sec.id) || !isStr(sec.name));
      if (badSecIdx !== -1) {
        alert('Invalid project structure. Section ' + (badSecIdx + 1) + ' needs a numeric "id" and a string "name".');
        return;
      }
      // Unlike scenes (checked above), nothing else here rejects a duplicate
      // section id — the scene-id checks pass, and every field type-checks
      // fine — but a section whose id collides with another's would render
      // (and be renamed/deleted/recolored) as one merged group of scenes on
      // the board, since scenes reference their section purely by that id.
      if (new Set(d.sections.map(sec => sec.id)).size !== d.sections.length) {
        alert('Invalid project structure. Section "id" values must be unique.');
        return;
      }

      // Normalize (rather than reject) a missing or stale nextId/nextSecId —
      // a hand-edited file, or one exported before a counter existed, could
      // otherwise leave the counter at or below an id already in use, so the
      // next "add scene"/"add section" in the app would mint a duplicate id
      // and silently corrupt id-based lookups everywhere.
      const maxSceneId = d.scenes.reduce((m, sc) => Math.max(m, sc.id), 0);
      if (typeof d.nextId !== 'number' || d.nextId <= maxSceneId) d.nextId = maxSceneId + 1;
      // A negative/zero/non-integer wordCount passes the numeric type check
      // above but is meaningless (and the New/Edit Scene forms no longer let
      // one through) — normalize on the way in (same rule as loadState) rather
      // than rejecting the whole import over what's just stale bad data, e.g.
      // from a hand-edited file.
      d.scenes.forEach(sc => { if (sc.wordCount != null) sc.wordCount = normalizeWordCount(sc.wordCount); });
      const maxSecId = d.sections.reduce((m, sec) => Math.max(m, sec.id), 0);
      if (typeof d.nextSecId !== 'number' || d.nextSecId <= maxSecId) d.nextSecId = maxSecId + 1;
      // A section color reaches an inline style.background/color-mix() string
      // on the board (see renderBoard) — strip anything that isn't a genuine
      // hex color (same rule as loadState) rather than rejecting the whole
      // import, so a hand-edited or otherwise malformed value can't ride
      // through as unvalidated CSS. Cleared (not defaulted) here; loadState
      // assigns the actual fallback color the first time this project opens.
      d.sections.forEach(sec => { if (sec.color != null && !isValidSecColor(sec.color)) delete sec.color; });
      if ((d.projectUid != null && !isStr(d.projectUid)) || (d.revision != null && typeof d.revision !== 'number')) {
        alert('Invalid project structure. "projectUid" must be a string and "revision" a number when present.');
        return;
      }
      if (d.povCustomNames != null && (!Array.isArray(d.povCustomNames) || !d.povCustomNames.every(isStr))) {
        alert('Invalid project structure. "povCustomNames" must be an array of strings when present.');
        return;
      }
      if (d.povOrder != null && (!Array.isArray(d.povOrder) || !d.povOrder.every(isStr))) {
        alert('Invalid project structure. "povOrder" must be an array of strings when present.');
        return;
      }

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

      migrateV2toV3(d);
      } // end d.v === '2' branch

      const name = d.projectName || file.name.replace(/\.json$/i, '') || 'Imported Project';
      delete d.projectName;
      delete d.exportedAt;

      // Import as a new local project. newLineage=true assigns a fresh uid
      // (used for deliberate "Keep Both" forks so the copies stop matching).
      const finishAsNew = (newLineage) => {
        if (newLineage) d.projectUid = genProjUid();
        if (!d.projectUid) d.projectUid = genProjUid(); // legacy files without a uid
        d.revision = d.revision || 0;
        const id = genProjId();
        const now = new Date().toISOString();
        localStorage.setItem(projKey(id), JSON.stringify(d));
        const index = loadProjectIndex();
        index.push({ id, name, createdAt: now, modifiedAt: now, sceneCount: d.scenes.length, theme: d.theme || 'ivory' });
        saveProjectIndex(index);
        trackProjectImported();
        renderProjectGrid();
        alert('Project imported successfully: ' + name + ' (' + d.scenes.length + ' scenes)');
      };

      // Overwrite the matching local project with the file's contents.
      const replaceExisting = (existing) => {
        localStorage.setItem(projKey(existing.entry.id), JSON.stringify(d));
        const index = loadProjectIndex();
        const entry = index.find(p => p.id === existing.entry.id);
        if (entry) {
          entry.name = name;
          entry.modifiedAt = new Date().toISOString();
          entry.sceneCount = d.scenes.length;
          entry.theme = d.theme || entry.theme;
          saveProjectIndex(index);
        }
        trackProjectImported();
        renderProjectGrid();
        // If that project is open in the editor right now, reload it so the
        // next autosave doesn't clobber the file we just imported.
        if (_page === 'editor' && currentProjectId === existing.entry.id) {
          openProject(existing.entry.id);
        }
        alert('Local copy of "' + name + '" updated from file (rev ' + (d.revision || 0) + ').');
      };

      const existing = findProjectByUid(d.projectUid);
      if (!existing) { finishAsNew(false); return; }

      const localName = existing.entry.name;
      const localRev  = existing.data.revision || 0;
      const fileRev   = d.revision || 0;

      if (fileRev > localRev) {
        // revision counts saves, not content edits (a theme change or leaving
        // the editor bumps it too), so "file is newer" doesn't imply "local
        // has nothing worth keeping" — editsSinceExport is what actually
        // tracks unexported content changes, so warn on that instead.
        const localEdits = existing.data.editsSinceExport || 0;
        const editsWarning = localEdits > 0
          ? '\n\nYour local copy has ' + localEdits + ' unexported change' + (localEdits !== 1 ? 's' : '') + ' — updating from this file will overwrite ' + (localEdits !== 1 ? 'them' : 'it') + '.'
          : '';
        showImportChoiceDialog('Imported File Is Newer',
          'The file you\'re importing is a newer version of "' + localName + '" (file revision ' + fileRev + ', your local copy revision ' + localRev + ').' + editsWarning + '\n\nUpdate your local copy to match the file?',
          [
            { label: 'Update Local Copy', primary: true, onClick: () => replaceExisting(existing) },
            { label: 'Keep Both', onClick: () => finishAsNew(true) },
            { label: 'Cancel' },
          ]);
      } else if (fileRev < localRev) {
        showImportChoiceDialog('Imported File Is Older',
          'The file you\'re importing is an OLDER version of "' + localName + '" (file revision ' + fileRev + ', your local copy revision ' + localRev + ').\n\nImporting it would fork your data. If you meant to bring in changes from another device, export a fresh file from that device first.',
          [
            { label: 'Cancel', primary: true },
            { label: 'Keep Both Anyway', onClick: () => finishAsNew(true) },
          ]);
      } else if ((existing.data.lastDataEditAt || null) === (d.lastDataEditAt || null)) {
        alert('"' + localName + '" is already up to date (revision ' + localRev + '). Nothing imported.');
      } else {
        showImportChoiceDialog('Copies Have Diverged',
          'The file you\'re importing and your local copy of "' + localName + '" are both at revision ' + localRev + ' but contain different edits — they were changed separately, likely on two devices.\n\nKeep both copies and reconcile them manually.',
          [
            { label: 'Keep Both', primary: true, onClick: () => finishAsNew(true) },
            { label: 'Cancel' },
          ]);
      }
    } catch(err) {
      alert('Could not read project file. Make sure it is a valid SceneSetter JSON export.\n\nError: ' + err.message);
    }
  };
  reader.onerror = function() {
    alert('Could not read file. Please try again.');
  };
  reader.readAsText(file);
  inputEl.value = '';
}

// Bump whenever pride-and-prejudice.json / count-of-monte-cristo.json change enough
// that existing (untouched) sample projects should be refreshed with the new content —
// e.g. the wordCount/povs addition this constant was introduced for. A user who's still
// on an older version gets the refresh automatically on their next Projects-page visit;
// no manual localStorage reset needed.
const SAMPLES_VERSION = 2;

function ensureSampleProjects() {
  // Seeded/refreshed up to SAMPLES_VERSION already? Nothing to do. Tracked by a version
  // number rather than re-matching on project name every visit — the deletedSamples list
  // below is what actually prevents a deleted/renamed sample from reappearing; the version
  // gate just avoids redoing this whole pass on every single page load once caught up.
  const prefs = loadGlobalPrefs();
  const priorVersion = prefs.samplesSeeded ? (prefs.samplesVersion || 1) : 0;
  if (priorVersion >= SAMPLES_VERSION) return Promise.resolve();

  // Only set once the fetches below resolve, so two page loads racing before that write
  // lands (two tabs opened at once, a fast reload) would otherwise both pass the check
  // above and each redo the pass. Claim a short-lived lock synchronously before starting
  // the async work so the second load backs off instead.
  const SEEDING_LOCK_MS = 15000;
  const now = Date.now();
  if (prefs.samplesSeeding && now - prefs.samplesSeeding < SEEDING_LOCK_MS) {
    return Promise.resolve();
  }
  prefs.samplesSeeding = now;
  saveGlobalPrefs(prefs);

  // Keys (not names) the user has explicitly deleted — never re-added, at this version
  // bump or any future one. Without this, a version bump would resurrect a sample the
  // user removed on purpose. Matched/stored by sampleKey rather than display name so
  // renaming a sample first (then deleting it, or just keeping the rename) can't slip
  // it back in under its original name or create a re-seeded duplicate alongside it;
  // entries from before sampleKey existed only ever recorded a name, so check both.
  const deletedSamples = new Set(prefs.deletedSamples || []);

  const samplesToLoad = [
    { key: 'pride-and-prejudice', name: 'Pride and Prejudice', file: 'pride-and-prejudice.json' },
    { key: 'count-of-monte-cristo', name: 'The Count of Monte Cristo', file: 'count-of-monte-cristo.json' },
  ];

  const loadPromises = samplesToLoad.map(sample => {
    if (deletedSamples.has(sample.key) || deletedSamples.has(sample.name)) return Promise.resolve(true);
    return fetch(sample.file)
      .then(response => {
        if (!response.ok) throw new Error('Failed to load sample project');
        return response.json();
      })
      .then(d => {
        // Sample JSON files on disk stay v2 (schema v3 spec §3.1.3) — migrate
        // through the same path a v2 import would take, rather than hand-
        // editing the sample files.
        if (!d || d.v !== '2') return false;
        migrateV2toV3(d);
        delete d.projectName;
        const index = loadProjectIndex();
        // sampleKey identifies the same entry across a rename; name is the fallback
        // for an entry seeded before sampleKey existed (never renamed, so name still
        // matches what was originally seeded).
        const existing = index.find(p => p.isSample && (p.sampleKey === sample.key || (!p.sampleKey && p.name === sample.name)));
        if (existing) {
          // Only refresh a sample the user never actually touched (revision 0 — no
          // saved edits) — an edited copy is now genuinely theirs, and overwriting it
          // just because SAMPLES_VERSION bumped would silently destroy real work.
          let cur = null;
          try { cur = JSON.parse(localStorage.getItem(projKey(existing.id)) || 'null'); } catch(e) {}
          if (!cur || (cur.revision || 0) !== 0) { existing.sampleKey = existing.sampleKey || sample.key; saveProjectIndex(index); return true; }
          d.projectUid = cur.projectUid || genProjUid();
          d.revision = 0;
          localStorage.setItem(projKey(existing.id), JSON.stringify(d));
          existing.sampleKey = sample.key;
          existing.sceneCount = (d.scenes || []).length;
          existing.modifiedAt = new Date().toISOString();
          existing.theme = d.theme || existing.theme || 'ivory';
          saveProjectIndex(index);
          return true;
        }
        const id = genProjId();
        const nowIso = new Date().toISOString();
        d.projectUid = genProjUid();
        d.revision = d.revision || 0;
        localStorage.setItem(projKey(id), JSON.stringify(d));
        index.push({
          id, name: sample.name, sampleKey: sample.key, createdAt: nowIso, modifiedAt: nowIso,
          sceneCount: (d.scenes||[]).length, theme: d.theme || 'ivory', isSample: true
        });
        saveProjectIndex(index);
        trackSampleProjectAutoLoaded();
        return true;
      })
      .catch(err => { console.log('Could not auto-load sample project: ' + sample.name); return false; });
  });

  // Only mark caught-up if every sample resolved — a transient fetch failure should
  // still retry on the next visit rather than being marked done at the new version.
  return Promise.all(loadPromises).then(results => {
    if (results.every(Boolean)) {
      const p = loadGlobalPrefs();
      p.samplesSeeded = true;
      p.samplesVersion = SAMPLES_VERSION;
      saveGlobalPrefs(p);
    }
  });
}

if (document.getElementById('proj-rename-modal')) {
  // Setup backdrop clicks for modals
  const setupBackdropClick = (id, closeFn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', e => { if (e.target === el) closeFn(); });
  };

  setupBackdropClick('proj-rename-modal', closeProjRename);
  setupBackdropClick('proj-del-modal', closeProjDel);
  setupBackdropClick('proj-new-modal', closeNewProject);
  document.getElementById('proj-rename-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmProjRename(); }
  });
  document.getElementById('proj-new-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmNewProject(); }
    if (e.key === 'Escape') { closeNewProject(); }
  });
}

