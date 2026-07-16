'use strict';

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

// Per-PROJECT baseline (not one global baseline) for the "Nth scene/section
// created" milestones. A single global baseline, snapshotted only once ever
// (the first time any project was opened), meant every later count was really
// "scenes in whichever project happens to be open right now, minus whatever
// the very first project's count used to be" — opening a second project could
// send the count negative or skip past 1/5 entirely depending on that other
// project's own scene count, so the milestone fired spuriously or never.
// Snapshotting once per project, the first time each one is opened, scopes
// the count to "scenes added to this project since the user started using
// it" — stable no matter how many other projects exist or which is current.
function sceneBaselineKey(projectId) { return 'scenesetter_scene_baseline_' + projectId; }
function sectionBaselineKey(projectId) { return 'scenesetter_section_baseline_' + projectId; }
function ensureProjectMilestoneBaselines() {
  if (!currentProjectId) return;
  const sk = sceneBaselineKey(currentProjectId);
  if (localStorage.getItem(sk) === null) localStorage.setItem(sk, String(S.scenes.length));
  const ck = sectionBaselineKey(currentProjectId);
  if (localStorage.getItem(ck) === null) localStorage.setItem(ck, String(S.sections.length));
}

function getScenesCreatedSinceIdCreation() {
  if (!currentProjectId) return 0;
  const baseline = parseInt(localStorage.getItem(sceneBaselineKey(currentProjectId)) || '0');
  return S.scenes.length - baseline;
}

function getSectionsCreatedSinceIdCreation() {
  if (!currentProjectId) return 0;
  const baseline = parseInt(localStorage.getItem(sectionBaselineKey(currentProjectId)) || '0');
  return S.sections.length - baseline;
}

const FIRED_MILESTONES_KEY = 'scenesetter_fired_milestones';

// Milestones are one-time-per-user events (e.g. "1st scene created"), but the
// counts driving them (scene/section/report counts) can revisit the same
// threshold more than once in a session — e.g. deleting back down to 5 scenes
// then re-adding one. Guard here, once, so every call site stays a simple
// count check instead of each needing its own has-this-fired bookkeeping.
function hasMilestoneFired(milestone) {
  try {
    const fired = JSON.parse(localStorage.getItem(FIRED_MILESTONES_KEY)) || [];
    return fired.includes(milestone);
  } catch(e) { return false; }
}
function markMilestoneFired(milestone) {
  try {
    const fired = JSON.parse(localStorage.getItem(FIRED_MILESTONES_KEY)) || [];
    if (!fired.includes(milestone)) {
      fired.push(milestone);
      localStorage.setItem(FIRED_MILESTONES_KEY, JSON.stringify(fired));
    }
  } catch(e) {}
}

function trackMilestone(milestone, metadata = {}) {
  if (hasMilestoneFired(milestone)) return;
  markMilestoneFired(milestone);
  const data = {
    user_id: getUserId(),
    milestone: milestone,
    timestamp: new Date().toLocaleString(),
    ...metadata
  };
  fetch(FORMSPREE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).catch(err => console.log('Milestone tracking failed:', err));
  if (typeof gtag !== 'undefined') {
    gtag('event', 'user_milestone', { milestone: milestone });
  }
}

// ── GA EVENT WRAPPERS ─────────────────────────────────────────────────────────
function trackItemAdded(category)      { if (typeof gtag !== 'undefined') gtag('event', 'item_added',                { category }); }
function trackThemeChanged(theme)      { if (typeof gtag !== 'undefined') gtag('event', 'theme_changed',             { theme });    }
function trackSceneAdded()             { if (typeof gtag !== 'undefined') gtag('event', 'scene_added');              }
function trackSceneDeleted()           { if (typeof gtag !== 'undefined') gtag('event', 'scene_deleted');            }
function trackSectionAdded()           { if (typeof gtag !== 'undefined') gtag('event', 'section_added');            }
function trackProjectCreated()         { if (typeof gtag !== 'undefined') gtag('event', 'project_created');          }
function trackProjectDeleted()         { if (typeof gtag !== 'undefined') gtag('event', 'project_deleted');          }
function trackProjectDuplicated()      { if (typeof gtag !== 'undefined') gtag('event', 'project_duplicated');       }
function trackProjectExported()        { if (typeof gtag !== 'undefined') gtag('event', 'project_exported');         }
function trackProjectImported()        { if (typeof gtag !== 'undefined') gtag('event', 'project_imported');         }
function trackSampleProjectAutoLoaded(){ if (typeof gtag !== 'undefined') gtag('event', 'sample_project_auto_loaded'); }
