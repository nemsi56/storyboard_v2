'use strict';

// ── MILESTONE TRACKING ────────────────────────────────────────────────────────
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mbdqjbnp';
const USER_ID_KEY = 'scenesetter_user_id';
const SCENE_COUNT_AT_ID_CREATION_KEY = 'scenesetter_scene_count_at_creation';
const SECTION_COUNT_AT_ID_CREATION_KEY = 'scenesetter_section_count_at_creation';

function getUserId() {
  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(USER_ID_KEY, userId);
    localStorage.setItem(SCENE_COUNT_AT_ID_CREATION_KEY, String(S.scenes.length));
    localStorage.setItem(SECTION_COUNT_AT_ID_CREATION_KEY, String(S.sections.length));
  }
  return userId;
}

function getScenesCreatedSinceIdCreation() {
  const countAtCreation = parseInt(localStorage.getItem(SCENE_COUNT_AT_ID_CREATION_KEY) || '0');
  return S.scenes.length - countAtCreation;
}

function getSectionsCreatedSinceIdCreation() {
  const countAtCreation = parseInt(localStorage.getItem(SECTION_COUNT_AT_ID_CREATION_KEY) || '0');
  return S.sections.length - countAtCreation;
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
