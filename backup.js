'use strict';

// ── BACKUP REMINDER ────────────────────────────────────────────────────────────
// Passive "Backed up N ago" status (always visible) plus a dismissible banner
// once export is overdue by either edit count or elapsed time. Export itself
// stays 100% manual (JSON download) so behavior is identical across browsers —
// this only nudges the user toward the existing Export action, never files
// anything on its own.
// Banner appears after 50 edits, or after the project has been open for an
// hour with unexported changes; dismissing snoozes it for an hour so it
// recurs hourly. The browser's native confirm also fires on tab/window close
// whenever unexported changes exist (see backupBeforeUnload).
const BACKUP_EDIT_THRESHOLD = 50;
const BACKUP_TIME_THRESHOLD_MS = 60 * 60 * 1000;
const BACKUP_CHECK_MS = 30 * 1000;
const BACKUP_SNOOZE_MS = 60 * 60 * 1000;

const backupSessionStart = Date.now();
let backupSnoozedUntil = 0;

function backupIsOverdue() {
  if (!currentProjectId || !S.editsSinceExport) return false;
  if (S.editsSinceExport >= BACKUP_EDIT_THRESHOLD) return true;
  // Hour timer counts from whichever is later: last export or this session's
  // start — so an old project isn't flagged the moment it is opened.
  const exportedAt = S.lastExportedAt ? new Date(S.lastExportedAt).getTime() : 0;
  const ref = Math.max(backupSessionStart, exportedAt);
  return (Date.now() - ref) >= BACKUP_TIME_THRESHOLD_MS;
}

function updateBackupBanner() {
  const banner = document.getElementById('backup-banner');
  if (!banner) return;
  const overdue = backupIsOverdue();
  const show = overdue && Date.now() >= backupSnoozedUntil;
  if (show) {
    const msgEl = document.getElementById('backup-banner-msg');
    if (msgEl) {
      const n = S.editsSinceExport;
      msgEl.textContent = n + ' change' + (n === 1 ? '' : 's') + ' since your last backup — export a copy?';
    }
  }
  banner.style.display = show ? 'flex' : 'none';
}

function refreshBackupStatus() {
  const el = document.getElementById('backup-status');
  if (el && currentProjectId) {
    el.classList.remove('backup-ok', 'backup-warn', 'backup-overdue');
    if (!S.editsSinceExport) {
      el.textContent = 'Backed up ' + timeAgo(S.lastExportedAt);
      el.classList.add('backup-ok');
    } else {
      const n = S.editsSinceExport;
      el.textContent = n + ' change' + (n === 1 ? '' : 's') + ' since backup';
      el.classList.add(backupIsOverdue() ? 'backup-overdue' : 'backup-warn');
    }
  }
  updateBackupBanner();
}

function dismissBackupBanner() {
  backupSnoozedUntil = Date.now() + BACKUP_SNOOZE_MS;
  updateBackupBanner();
}

function backupBeforeUnload(e) {
  // Any unexported changes at all → ask before leaving. Browsers only allow
  // their own generic "Leave site?" text here; custom wording is not possible.
  if (!currentProjectId || !S.editsSinceExport) return;
  e.preventDefault();
  e.returnValue = '';
}

if (document.getElementById('backup-banner')) {
  setInterval(refreshBackupStatus, BACKUP_CHECK_MS);
  window.addEventListener('beforeunload', backupBeforeUnload);
}
