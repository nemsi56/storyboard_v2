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

function trackMilestone(milestone, metadata = {}) {
  const data = {
    user_id: getUserId(),
    milestone: milestone,
    timestamp: new Date().toLocaleString(),
    ...metadata
  };
  console.log('📊 Milestone triggered:', milestone, data);
  fetch(FORMSPREE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(res => {
    console.log('✅ Formspree response:', res.status);
    return res.json();
  })
  .then(json => console.log('✅ Formspree success:', json))
  .catch(err => console.log('❌ Milestone tracking failed:', err));
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
