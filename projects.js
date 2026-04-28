'use strict';

// ── PROJECT MANAGER ──────────────────────────────────────────────────────────

function migrateExistingData() {
  if (localStorage.getItem(PROJECT_INDEX_KEY)) return;
  let raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
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

function esc(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
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
  if (typeof initChatPanel === 'function') {
    initChatPanel();
  }
  if (typeof updateAIMenuState === 'function') {
    updateAIMenuState();
  }
}

function formatEditDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const m = String(d.getMonth() + 1);
  const day = String(d.getDate());
  const y = String(d.getFullYear()).slice(-2);
  return `${m}/${day}/${y}`;
}

function updateProjectNameDisplay() {
  if (!currentProjectId) return;
  const index = loadProjectIndex();
  const entry = index.find(p => p.id === currentProjectId);
  const titleEl = document.getElementById('proj-name-title');
  const timeEl  = document.getElementById('proj-name-time');
  if (titleEl) titleEl.textContent = entry ? entry.name : '';
  if (timeEl)  timeEl.textContent  = S.lastDataEditAt ? 'Last update ' + formatEditDate(S.lastDataEditAt) : '';
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

function createAndOpenProject() {
  trackProjectCreated();
  const id = genProjId();
  const now = new Date().toISOString();
  const index = loadProjectIndex();
  index.push({ id, name: 'Untitled Project', createdAt: now, modifiedAt: now, sceneCount: 0, theme: document.documentElement.dataset.theme });
  saveProjectIndex(index);

  if (index.length === 2) {
    trackMilestone('2nd_project_created');
  }
  localStorage.setItem(projKey(id), JSON.stringify({
    v: DATA_VERSION, characters:[], locations:[], themes:[], misc:[],
    scenes:[], nextId:1, andOr:'OR', theme: document.documentElement.dataset.theme,
    sections:[], nextSecId:1,
  }));
  if (_page === 'projects') {
    sessionStorage.setItem('ss_open_project', id);
    sessionStorage.setItem('ss_rename_project', id);
    window.location.href = 'editor.html';
    return;
  }
  openProject(id);
  startProjRename(id);
}

function backToProjects() {
  if (currentProjectId) saveState();
  currentProjectId = null;
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

function exportProjectJSON(id) {
  trackProjectExported();
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
      trackProjectImported();
      renderProjectGrid();
      alert('Project imported successfully: ' + name + ' (' + d.scenes.length + ' scenes)');
    } catch(err) {
      alert('Could not read project file. Make sure it is a valid SceneSetter JSON export.\n\nError: ' + err.message);
    }
  };
  reader.readAsText(file);
  inputEl.value = '';
}

function ensureSampleProjects() {
  const index = loadProjectIndex();
  const sampleNames = ['Pride and Prejudice', 'The Count of Monte Cristo'];
  const samplesToLoad = [];

  if (!index.some(p => p.name === 'Pride and Prejudice')) {
    samplesToLoad.push({ name: 'Pride and Prejudice', file: 'pride-and-prejudice.json' });
  }
  if (!index.some(p => p.name === 'The Count of Monte Cristo')) {
    samplesToLoad.push({ name: 'The Count of Monte Cristo', file: 'count-of-monte-cristo.json' });
  }

  if (samplesToLoad.length === 0) return Promise.resolve();

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
        localStorage.setItem(projKey(id), JSON.stringify(d));
        const index = loadProjectIndex();
        index.push({
          id, name: sample.name, createdAt: now, modifiedAt: now,
          sceneCount: (d.scenes||[]).length, theme: d.theme || 'ivory', isSample: true
        });
        saveProjectIndex(index);
        trackSampleProjectAutoLoaded();
      })
      .catch(err => console.log('Could not auto-load sample project: ' + sample.name));
  });

  return Promise.all(loadPromises);
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
  document.getElementById('proj-rename-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmProjRename(); }
  });
}

