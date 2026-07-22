'use strict';

(function(){
  var $ = function(id){ return document.getElementById(id); };

  // Header
  $('proj-back-btn').addEventListener('click', backToProjects);
  $('help-btn').addEventListener('click', toggleHelp);

  // Menu bar: top-level menu buttons (toggle on click, hover to switch open menu)
  [
    ['mi-btn-file','file'],
    ['mi-btn-edit','edit'],
    ['mi-btn-scene','scene'],
    ['mi-btn-view','view'],
    ['mi-btn-help','help']
  ].forEach(function(pair){
    var el = $(pair[0]), name = pair[1];
    el.addEventListener('click', function(){ toggleMenu(name); });
    el.addEventListener('mouseenter', function(){ hoverMenu(name); });
  });

  // File menu
  $('mi-export-json').addEventListener('click', function(){ exportCurrentProject(); closeAllMenus(); });
  $('mi-import-json').addEventListener('click', menuImport);

  // Edit menu
  $('mi-undo-btn').addEventListener('click', function(){ undo(); closeAllMenus(); });
  $('mi-redo-btn').addEventListener('click', function(){ redo(); closeAllMenus(); });

  // Create menu
  $('mi-new-scene').addEventListener('click', menuNewScene);
  $('mi-add-char').addEventListener('click', function(){ openAddPopup('characters'); closeAllMenus(); });
  $('mi-add-loc').addEventListener('click', function(){ openAddPopup('locations'); closeAllMenus(); });
  $('mi-add-theme').addEventListener('click', function(){ openAddPopup('themes'); closeAllMenus(); });
  $('mi-add-misc').addEventListener('click', function(){ openAddPopup('misc'); closeAllMenus(); });
  $('mi-gen-report').addEventListener('click', function(){ openReportModal(); closeAllMenus(); });

  // View menu: theme picker
  [
    ['theme-btn-ivory','ivory'],
    ['theme-btn-slate','slate'],
    ['theme-btn-studio','studio'],
    ['theme-btn-ocean','ocean'],
    ['theme-btn-sunset','sunset']
  ].forEach(function(pair){
    var name = pair[1];
    $(pair[0]).addEventListener('click', function(){ setTheme(name); closeAllMenus(); });
  });

  // View menu: zoom
  $('zoomin-btn').addEventListener('click', function(){ zoomIn(); closeAllMenus(); });
  $('zoomout-btn').addEventListener('click', function(){ zoomOut(); closeAllMenus(); });
  $('zoomreset-btn').addEventListener('click', function(){ zoomReset(); closeAllMenus(); });

  // View menu: panel toggles
  [
    ['menu-show-library','lp'],
    ['menu-show-sections','sp'],
    ['menu-show-scene','cp']
  ].forEach(function(pair){
    var panelId = pair[1];
    $(pair[0]).addEventListener('click', function(){
      togglePanel(panelId);
      setTimeout(updatePanelMenuStates, 50);
      closeAllMenus();
    });
  });
  $('menu-show-all-panels').addEventListener('click', function(){
    toggleAllPanels();
    setTimeout(updatePanelMenuStates, 50);
    closeAllMenus();
  });
  $('menu-chart').addEventListener('click', function(){ toggleChartView(); closeAllMenus(); });
  $('menu-timeline').addEventListener('click', function(){ toggleTimelineView(); closeAllMenus(); });
  $('menu-show-inspector').addEventListener('click', function(){
    togglePanel('tl-panel');
    setTimeout(updateTlPanelMenuState, 50);
    closeAllMenus();
  });

  // Help menu
  $('mi-help-overview').addEventListener('click', function(){ window.open('index.html','_blank'); closeAllMenus(); });
  $('mi-help-tutorial').addEventListener('click', function(){ window.open('tutorial.html','_blank'); closeAllMenus(); });
  $('mi-help-features').addEventListener('click', function(){ toggleHelp(); closeAllMenus(); });

  // Hidden JSON import input
  var importInput = $('menu-import-input');
  importInput.addEventListener('change', function(){ importProjectJSON(importInput); });

  // Backup banner
  $('backup-export-btn').addEventListener('click', exportCurrentProject);
  $('backup-dismiss-btn').addEventListener('click', dismissBackupBanner);

  // Library panel
  $('lp-strip-btn').addEventListener('click', function(){ togglePanel('lp'); });
  $('lp-collapse-btn').addEventListener('click', function(){ togglePanel('lp'); });
  $('ao-or').addEventListener('click', function(){ setAndOr('OR'); });
  $('ao-and').addEventListener('click', function(){ setAndOr('AND'); });
  $('lib-clr').addEventListener('click', clearAllSel);

  // Sections panel
  $('sp-strip-btn').addEventListener('click', function(){ togglePanel('sp'); });
  $('sp-collapse-btn').addEventListener('click', function(){ togglePanel('sp'); });
  $('sec-add-btn').addEventListener('click', addSection);
  $('qs-go-btn').addEventListener('click', quickSetup);

  // Scene panel
  $('cp-strip-btn').addEventListener('click', function(){ togglePanel('cp'); });
  $('cp-collapse-btn').addEventListener('click', function(){ togglePanel('cp'); });
  $('tab-new').addEventListener('click', function(){ switchTab('new'); });
  $('tab-edit').addEventListener('click', function(){ switchTab('edit'); });

  // New Scene form
  $('new-cancel').addEventListener('click', cancelNewScene);
  $('asb').addEventListener('click', addScene);
  [
    ['ck-characters-btn','ck-characters-wrap','characters'],
    ['ck-locations-btn','ck-locations-wrap','locations'],
    ['ck-themes-btn','ck-themes-wrap','themes'],
    ['ck-misc-btn','ck-misc-wrap','misc'],
    ['sc-povs-btn','sc-povs-wrap','povs']
  ].forEach(function(t){
    var wrapId = t[1], type = t[2];
    $(t[0]).addEventListener('click', function(){ toggleCkDrop(wrapId, type); });
  });

  // Edit Scene form
  $('canceledit').addEventListener('click', cancelEdit);
  $('saveedit').addEventListener('click', saveEdit);
  [
    ['ek-characters-btn','ek-characters-wrap','characters'],
    ['ek-locations-btn','ek-locations-wrap','locations'],
    ['ek-themes-btn','ek-themes-wrap','themes'],
    ['ek-misc-btn','ek-misc-wrap','misc'],
    ['ed-povs-btn','ed-povs-wrap','povs'],
    ['ed-also-sl-btn','ed-also-sl-wrap','storylines'],
    ['ed-reveals-btn','ed-reveals-wrap','reveals'],
    ['ed-requires-btn','ed-requires-wrap','reveals']
  ].forEach(function(t){
    var wrapId = t[1], type = t[2];
    $(t[0]).addEventListener('click', function(){ toggleCkDrop(wrapId, type); });
  });

  // Scene board toolbar
  $('clrsel').addEventListener('click', clearCardSel);
  var detToggle = $('det-toggle');
  detToggle.addEventListener('change', function(){ toggleDetails(detToggle.checked); });
  $('sec-filter-btn').addEventListener('click', toggleSecFilter);
  $('srch-inp').addEventListener('input', onSearch);
  $('srch-scope').addEventListener('change', onSearch);
  $('srch-clr').addEventListener('click', clearSearch);
  var scaler = $('scaler');
  scaler.addEventListener('input', function(){ setScale(scaler.value); });

  // Chart view
  $('chart-type-cards').addEventListener('click', function(){ closeTimelineView(); closeChartView(); });
  $('chart-type-snake').addEventListener('click', function(){ closeTimelineView(); setChartType('snake'); });
  $('chart-type-circle').addEventListener('click', function(){ closeTimelineView(); setChartType('circle'); });
  $('chart-wc-toggle').addEventListener('click', toggleShowWordCount);
  $('chart-trace-sel').addEventListener('change', function(){ setChartTrace(this.value); });
  $('chart-print-btn').addEventListener('click', printChart);

  // Timeline view (schema v3 §6)
  $('chart-type-timeline').addEventListener('click', toggleTimelineView);
  $('tl-axis-ordinal').addEventListener('click', function(){ setTlAxis('ordinal'); });
  $('tl-axis-true').addEventListener('click', function(){ setTlAxis('true'); });
  $('tl-thread-sel').addEventListener('change', function(){ setTlThread(this.value); });
  $('tl-zoom').addEventListener('input', function(){ setTlZoom(this.value); });
  $('tl-zoom').addEventListener('dblclick', function(){ this.value = 50; setTlZoom(50); });
  $('tl-add-storyline-btn').addEventListener('click', addStoryline);
  $('tl-tab-inspector').addEventListener('click', function(){ tlSwitchTab('inspector'); });
  $('tl-tab-conflicts').addEventListener('click', function(){ tlSwitchTab('conflicts'); });
  $('tl-conflicts-badge').addEventListener('click', function(){ tlSwitchTab('conflicts'); });
  // #tl-track itself (not the scroll container) has its own click listener,
  // wired once in timeline.js alongside the drag machinery — it needs the
  // _tlDragOccurred check a listener here wouldn't have, so it isn't duplicated.
  $('tl-chron-scroll').addEventListener('click', function(e){ if (e.target === $('tl-chron-scroll')) tlSelectScene(null); });
  $('tl-ms-scroll').addEventListener('click', function(e){ if (e.target === $('tl-ms-scroll') || e.target.id === 'tl-ms-row') tlSelectScene(null); });
  $('tl-view-strip').addEventListener('click', function(){ setTlViewMode('strip'); });
  $('tl-view-braid').addEventListener('click', function(){ setTlViewMode('braid'); });
  $('tl-braid-scroll').addEventListener('click', function(e){ if (e.target === $('tl-braid-scroll') || e.target.id === 'tl-braid-svg') tlSelectScene(null); });
  $('tl-braid-scroll').addEventListener('scroll', tlBraidUpdateMarkerHud);
  $('tl-panel-strip-btn').addEventListener('click', function(){ togglePanel('tl-panel'); });
  $('tl-panel-collapse-btn').addEventListener('click', function(){ togglePanel('tl-panel'); });
  $('tl-delete-scene-btn').addEventListener('click', tlDeleteSelectedScene);
  // Cancel/Save Changes dim to "nothing to do" while the form is clean (Timeline
  // only — refreshTlSaveCancelState() itself no-ops outside timelineMode). Any
  // field change, checkbox-dropdown toggle, or the Anchor "Clear" button needs
  // to re-run the dirty check; a delegated input+change+click listener on the
  // shared form catches all of them without touching board's own wiring at all.
  ['input','change','click'].forEach(function(evt){
    $('form-edit').addEventListener(evt, function(){ setTimeout(refreshTlSaveCancelState, 0); });
  });

  // Add-item popup
  $('ap-cancel').addEventListener('click', closeAddPopup);
  $('ap-ok').addEventListener('click', confirmAdd);

  // Add POV Name modal
  $('pov-add-cancel').addEventListener('click', closePovAddModal);
  $('pov-add-ok').addEventListener('click', confirmPovAdd);

  // Library Item Edit modal
  $('lib-edit-cancel').addEventListener('click', closeLibEditModal);
  $('lib-edit-ok').addEventListener('click', saveLibEdit);

  // Section Delete Confirm modal
  $('secdel-cancel').addEventListener('click', closeSecDelModal);
  $('secdel-ok').addEventListener('click', confirmSecDel);

  // Library Delete Confirm modal
  $('libdel-cancel').addEventListener('click', closeLibDelModal);
  $('libdel-ok').addEventListener('click', confirmLibDel);

  // Save Edit Confirm modal
  $('savecfm-cancel').addEventListener('click', closeSaveCfm);
  $('savecfm-ok').addEventListener('click', confirmSaveEdit);

  // Discard Scene Confirm modal
  $('discard-cfm-cancel').addEventListener('click', closeDiscardConfirm);
  $('discard-cfm-ok').addEventListener('click', confirmDiscard);

  // Summary modal
  $('mclose').addEventListener('click', closeModal);

  // Report modal
  $('rpt-close').addEventListener('click', closeReportModal);
  [
    ['rpt-type-scenelist','scenelist'],
    ['rpt-type-character','character'],
    ['rpt-type-location','location'],
    ['rpt-type-theme','theme'],
    ['rpt-type-misc','misc'],
    ['rpt-type-pov','pov'],
    ['rpt-type-matrix','matrix']
  ].forEach(function(pair){
    var el = $(pair[0]), type = pair[1];
    el.addEventListener('click', function(){ switchRptType(type, el); });
  });
  $('rpt-mx-flip').addEventListener('change', updateMxNote);
  var rptSecAll = $('rpt-sec-all');
  rptSecAll.addEventListener('change', function(){ rptToggleAllSecs(rptSecAll); });
  $('rpt-cancel').addEventListener('click', closeReportModal);
  $('rpt-generate').addEventListener('click', generateReport);

  // Email signup popup
  $('email-overlay').addEventListener('click', closeEmailPopup);
  $('email-close-btn').addEventListener('click', closeEmailPopup);
  $('email-skip-btn').addEventListener('click', closeEmailPopup);
  $('email-submit-btn').addEventListener('click', submitEmail);
})();
