'use strict';

// ── IMAGE ENLARGE MODAL ─────────────────────────────────────────────────────
(function initShotModal() {
  const modal = document.getElementById('img-modal');
  const modalImg = document.getElementById('img-modal-img');
  const closeBtn = document.getElementById('img-modal-close');
  if (!modal || !modalImg) return;

  function open(img) {
    modalImg.src = img.src;
    modalImg.alt = img.alt || 'Enlarged screenshot';
    modal.classList.add('open');
  }
  function close() {
    modal.classList.remove('open');
  }

  document.querySelectorAll('.shot-img').forEach(function(img) {
    img.addEventListener('click', function() { open(this); });
  });
  modal.addEventListener('click', close);
  if (closeBtn) closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') close();
  });
})();
