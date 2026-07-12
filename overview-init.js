'use strict';

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
  document.getElementById(id).addEventListener('click', function() { openOverviewImg(this); });
});
document.getElementById('overview-modal').addEventListener('click', closeOverviewImg);
document.getElementById('overview-modal-close-btn').addEventListener('click', closeOverviewImg);
