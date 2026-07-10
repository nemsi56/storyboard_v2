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
            v: DATA_VERSION,
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
      const d = JSON.parse(raw);
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
  S.povCustomNames = [];
  SECS.forEach(({ key }) => S.selections[key].clear());
  S.selIds.clear(); S.editingId = null;
  S.projectUid = null; S.revision = 0;
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
  loadState(projKey(id));
  getUserId();
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
  localStorage.removeItem(projKey(deletingProjId));
  const index = loadProjectIndex().filter(p => p.id !== deletingProjId);
  saveProjectIndex(index);
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
    localStorage.setItem(projKey(id), JSON.stringify(data));
    if (id === currentProjectId) {
      S.lastExportedAt = exportedAt;
      S.editsSinceExport = 0;
      if (typeof refreshBackupStatus === 'function') refreshBackupStatus();
    }
    data.projectName = name;
    data.exportedAt = exportedAt;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name.replace(/[^a-zA-Z0-9_\- ]/g, '') + ' ' + formatFileTimestamp(new Date(exportedAt)) + '.json';
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
  overlay.className = 'pm-modal open';
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

function importProjectJSON(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const d = JSON.parse(e.target.result);

      if (!d || d.v !== DATA_VERSION) {
        alert('Invalid project file version. Expected v: "' + DATA_VERSION + '"' + (d && d.v ? ' but found v: "' + d.v + '"' : '') + '.');
        return;
      }

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

      const badSceneIdx = d.scenes.findIndex(sc =>
        !sc || typeof sc !== 'object' || typeof sc.id !== 'number' || !isStr(sc.title) ||
        (sc.summary != null && !isStr(sc.summary)) || (sc.notes != null && !isStr(sc.notes)) ||
        (sc.wordCount != null && typeof sc.wordCount !== 'number') ||
        (sc.pov != null && !isStr(sc.pov)) || // legacy single-value POV, still accepted on import
        (sc.povs != null && (!Array.isArray(sc.povs) || !sc.povs.every(isStr))));
      if (badSceneIdx !== -1) {
        alert('Invalid project structure. Scene ' + (badSceneIdx + 1) + ' needs a numeric "id", a string "title", string "summary"/"notes" if present, a numeric "wordCount" if present, a string "pov" if present, and an array of strings "povs" if present.');
        return;
      }
      if (new Set(d.scenes.map(sc => sc.id)).size !== d.scenes.length) {
        alert('Invalid project structure. Scene "id" values must be unique.');
        return;
      }

      const badSecIdx = d.sections.findIndex(sec => !sec || typeof sec !== 'object' || typeof sec.id !== 'number' || !isStr(sec.name));
      if (badSecIdx !== -1) {
        alert('Invalid project structure. Section ' + (badSecIdx + 1) + ' needs a numeric "id" and a string "name".');
        return;
      }
      if ((d.projectUid != null && !isStr(d.projectUid)) || (d.revision != null && typeof d.revision !== 'number')) {
        alert('Invalid project structure. "projectUid" must be a string and "revision" a number when present.');
        return;
      }
      if (d.povCustomNames != null && (!Array.isArray(d.povCustomNames) || !d.povCustomNames.every(isStr))) {
        alert('Invalid project structure. "povCustomNames" must be an array of strings when present.');
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
        showImportChoiceDialog('Imported File Is Newer',
          'The file you\'re importing is a newer version of "' + localName + '" (file revision ' + fileRev + ', your local copy revision ' + localRev + ').\n\nUpdate your local copy to match the file?',
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

function ensureSampleProjects() {
  // Seed once ever, tracked by a flag rather than matching on project name —
  // otherwise deleting or renaming a sample project (e.g. "Pride and
  // Prejudice") makes it silently reappear on the next visit to this page.
  const prefs = loadGlobalPrefs();
  if (prefs.samplesSeeded) return Promise.resolve();

  const samplesToLoad = [
    { name: 'Pride and Prejudice', file: 'pride-and-prejudice.json' },
    { name: 'The Count of Monte Cristo', file: 'count-of-monte-cristo.json' },
  ];

  const loadPromises = samplesToLoad.map(sample => {
    return fetch(sample.file)
      .then(response => {
        if (!response.ok) throw new Error('Failed to load sample project');
        return response.json();
      })
      .then(d => {
        if (!d || d.v !== DATA_VERSION) return;
        const id = genProjId();
        const now = new Date().toISOString();
        delete d.projectName;
        d.projectUid = genProjUid();
        d.revision = d.revision || 0;
        localStorage.setItem(projKey(id), JSON.stringify(d));
        const index = loadProjectIndex();
        index.push({
          id, name: sample.name, createdAt: now, modifiedAt: now,
          sceneCount: (d.scenes||[]).length, theme: d.theme || 'ivory', isSample: true
        });
        saveProjectIndex(index);
        trackSampleProjectAutoLoaded();
        return true;
      })
      .catch(err => { console.log('Could not auto-load sample project: ' + sample.name); return false; });
  });

  // Only mark seeded if every sample loaded — a transient fetch failure
  // should still retry on the next visit rather than being marked done.
  return Promise.all(loadPromises).then(results => {
    if (results.every(Boolean)) {
      const p = loadGlobalPrefs(); p.samplesSeeded = true; saveGlobalPrefs(p);
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

