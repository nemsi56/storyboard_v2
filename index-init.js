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
// Each feature row / the backups block fades and rises into place the first
// time it crosses into view, instead of everything just being static on
// load — reduced-motion users get the end state immediately since their
// browser reports no IntersectionObserver-triggered class as "already
// revealed" isn't quite right, so honor the media query explicitly instead.
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
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { root: document.querySelector('.landing-body'), threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  reveals.forEach(function(el) { io.observe(el); });
})();
