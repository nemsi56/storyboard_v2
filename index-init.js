'use strict';

// ── IMAGE ENLARGE MODAL ─────────────────────────────────────────────────────
function openOverviewImg(img) {
  const modal = document.getElementById('overview-modal');
  document.getElementById('overview-modal-img').src = img.src;
  modal.classList.add('open');
}
function closeOverviewImg() {
  document.getElementById('overview-modal').classList.remove('open');
}
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeOverviewImg();
});
['ov-img-sceneboard', 'ov-img-search', 'ov-img-flowchart-1', 'ov-img-flowchart-2', 'ov-img-report-1', 'ov-img-report-2', 'ov-img-report-3'].forEach(function(id) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', function() { openOverviewImg(this); });
});
document.getElementById('overview-modal').addEventListener('click', closeOverviewImg);
document.getElementById('overview-modal-close-btn').addEventListener('click', closeOverviewImg);

// ── SCROLL-REVEAL ────────────────────────────────────────────────────────────
// Each feature row / the backups block fades and rises into place every
// time it crosses into view — toggled both ways (not just added once) so
// scrolling back up and back down replays it, instead of a one-shot
// animation that only ever plays on a row's first appearance. Reduced-motion
// users get the end state permanently instead: their browser never reports
// an IntersectionObserver-triggered class as "this is the reduced-motion
// case", so honor the media query explicitly and skip the observer entirely.
(function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || typeof IntersectionObserver === 'undefined') {
    reveals.forEach(function(el) { el.classList.add('in-view'); });
    return;
  }
  // #landing scrolls internally (.landing-body), not the document itself —
  // without an explicit root, the observer measures against the browser
  // viewport and rows can report "intersecting" before they're actually
  // scrolled into view inside that inner container.
  const io = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      entry.target.classList.toggle('in-view', entry.isIntersecting);
    });
  }, { root: document.querySelector('.landing-body'), threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  reveals.forEach(function(el) { io.observe(el); });
})();
