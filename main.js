'use strict';

const _page = (function() {
  const hasStoryboard = !!document.getElementById('app-storyboard');
  const hasProjMgr = !!document.getElementById('proj-mgr');
  if (hasStoryboard) return 'editor';
  if (hasProjMgr) return 'projects';
  return 'other';
})();

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
  ensureSampleProjects().then(renderProjectGrid);
} else if (_page === 'editor') {
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
    // No project specified — redirect to projects page
    window.location.href = 'projects.html';
  }
}
