'use strict';

// ── EMAIL POPUP ────────────────────────────────────────────────────────────────
function showEmailPopup() {
  const popup = document.getElementById('email-popup');
  if (popup) {
    popup.style.display = 'block';
    setTimeout(() => popup.classList.add('open'), 10);
    const input = document.getElementById('email-input');
    if (input) input.focus();
  }
}

function closeEmailPopup() {
  const popup = document.getElementById('email-popup');
  if (popup) {
    popup.classList.remove('open');
    setTimeout(() => {
      popup.style.display = 'none';
      const input = document.getElementById('email-input');
      if (input) input.value = '';
    }, 200);
  }
}

function submitEmail() {
  const input = document.getElementById('email-input');
  const email = input ? input.value.trim() : '';

  if (!email) {
    alert('Please enter a valid email address');
    return;
  }

  // Validate email format (basic check)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert('Please enter a valid email address');
    return;
  }

  // Send email to Formspree
  const data = {
    user_id: getUserId(),
    email: email,
    type: 'email_signup',
    timestamp: new Date().toLocaleString()
  };

  fetch(FORMSPREE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(() => {
    closeEmailPopup();
    console.log('Email submitted successfully');
  }).catch(err => {
    console.log('Email submission failed:', err);
    alert('There was an issue submitting your email. Please try again.');
  });
}

// ── THEME ──────────────────────────────────────────────────────────────────────
function setTheme(name) {
  trackThemeChanged(name);
  document.documentElement.dataset.theme = name;
  saveState();
  const prefs = loadGlobalPrefs(); prefs.theme = name; saveGlobalPrefs(prefs);
  const pmSel = document.getElementById('pm-theme-sel');
  const tSel = document.getElementById('theme-sel');
  if (pmSel) pmSel.value = name;
  if (tSel) tSel.value = name;
}

function setGlobalTheme(name) {
  document.documentElement.dataset.theme = name;
  const prefs = loadGlobalPrefs(); prefs.theme = name; saveGlobalPrefs(prefs);
  const pmSel = document.getElementById('pm-theme-sel');
  const tSel = document.getElementById('theme-sel');
  if (pmSel) pmSel.value = name;
  if (tSel) tSel.value = name;
  if (currentProjectId) saveState();
}

// ── HELP OVERLAY ───────────────────────────────────────────────────────────────
const HELP_ZONES = [
  { sel: '#menu-bar',        tip: 'Menu bar — Most items have keyboard shortcuts shown in each menu.' },
  { sel: '#lp .p-hdr',      tip: 'Library panel — stores characters, locations, themes, and misc items. Click + to add an item. Click any item to highlight matching scenes on the board. Hover an item to shuffle, edit (name & notes), or delete it. Use ◀ to hide the panel or drag the right edge to resize it.' },
  { sel: '#ao-global-wrap',  tip: 'Highlight mode — OR highlights scenes containing any selected item; AND highlights only scenes that contain all selected items simultaneously. A Clear Highlights option appears when any items are selected.' },
  { sel: '#sp .p-hdr',      tip: 'Sections panel — organize scenes into named sections such as acts, chapters, or sequences. Hover a section row and click → to jump to it on the board. Use ◀ or drag the panel edge to hide or resize.' },
  { sel: '.sp-add-row',      tip: 'Add Section — type a name and press + (or Enter) to create a new section.' },
  { sel: '.sp-qs',           tip: 'Quick Setup — rapidly create multiple numbered sections at once (e.g. "Act 1, Act 2, Act 3").' },
  { sel: '#cp .tabs',        tip: 'Scene panel — New Scene creates a scene; Edit Scene (enabled when a card is selected) lets you modify it. Enter a title, summary, section, library tags, and notes. Use ◀ or drag the panel edge to hide or resize.' },
  { sel: '#sbhdr .sbt',      tip: 'Scene Board — the main workspace. Scenes are arranged by section. Drag cards to reorder them. Click a card to select it; click multiple cards to select them together and move them as a group.' },
  { sel: '#sbcnt',           tip: 'Scene count — shows how many scenes are currently visible (may be fewer when a section filter is active).' },
  { sel: '#clrsel',          tip: 'Clear Selection — deselects all currently selected scene cards on the board.' },
  { sel: '#det-toggle',      tip: 'Show Card Details — toggle to show or hide library tags (characters, locations, themes, misc) printed on each card.' },
  { sel: '#sec-filter-wrap', tip: 'Section Filter — click to choose which sections are visible on the board. Useful for focusing on one part of your story.' },
  { sel: '#srch-wrap',       tip: 'Search — filter visible cards by title or summary text. Press × or Escape to clear the search.' },
  { sel: '.scalew',          tip: 'Card Size — drag the slider to make scene cards larger or smaller on the board.' },
  { sel: '#help-btn',        tip: 'Help — you\'re already here! Click ? to toggle this mode on/off. Hover highlighted areas to learn what each element does.' },
];

let helpMode = false;

function toggleHelp() {
  helpMode ? closeHelp() : openHelp();
}

function openHelp() {
  helpMode = true;
  document.getElementById('help-btn').classList.add('active');
  const overlay = document.getElementById('help-overlay');
  overlay.classList.add('active');
  overlay.querySelectorAll('.help-zone').forEach(z => z.remove());
  const tempShow = ['#lib-clr-wrap'];
  const restored = [];
  tempShow.forEach(sel => {
    const el = document.querySelector(sel);
    if (el && el.style.display === 'none') { el.style.display = 'block'; restored.push(el); }
  });
  HELP_ZONES.forEach(zone => {
    const el = document.querySelector(zone.sel);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 && r.height < 2) return;
    const div = document.createElement('div');
    div.className = 'help-zone';
    div.style.left   = (r.left   - 3) + 'px';
    div.style.top    = (r.top    - 3) + 'px';
    div.style.width  = (r.width  + 6) + 'px';
    div.style.height = (r.height + 6) + 'px';
    div.addEventListener('mouseenter', () => showHelpTip(zone.tip, r));
    div.addEventListener('mouseleave', hideHelpTip);
    div.addEventListener('click', e => { e.stopPropagation(); closeHelp(); });
    overlay.appendChild(div);
  });
  restored.forEach(el => { el.style.display = 'none'; });
  overlay.addEventListener('click', _helpOverlayClose);
}

function _helpOverlayClose(e) {
  if (e.target.classList.contains('help-zone')) return;
  closeHelp();
}

function closeHelp() {
  if (!helpMode) return;
  helpMode = false;
  hideHelpTip();
  document.getElementById('help-btn').classList.remove('active');
  const overlay = document.getElementById('help-overlay');
  overlay.classList.remove('active');
  overlay.removeEventListener('click', _helpOverlayClose);
}

function showHelpTip(text, rect) {
  const tip = document.getElementById('help-tip');
  tip.textContent = text;
  tip.classList.add('vis');
  let top  = rect.bottom + 10;
  let left = rect.left;
  if (top  + 140 > window.innerHeight) top  = rect.top - 148;
  top  = Math.max(8, Math.min(top,  window.innerHeight - 150));
  if (left + 282 > window.innerWidth)  left = window.innerWidth - 288;
  if (left < 8) left = 8;
  tip.style.top  = top  + 'px';
  tip.style.left = left + 'px';
}

function hideHelpTip() {
  document.getElementById('help-tip').classList.remove('vis');
}
