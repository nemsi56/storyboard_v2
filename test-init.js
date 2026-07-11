'use strict';

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, status: 'pass', message: 'OK' });
  } catch (err) {
    results.push({ name, status: 'fail', message: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runAllTests() {
  results.length = 0;

  // Test 1: Module Loading
  test('Module: config.js exports SECS', () => {
    assert(typeof SECS !== 'undefined', 'SECS not defined');
    assert(Array.isArray(SECS), 'SECS is not an array');
    assert(SECS.length === 4, 'SECS should have 4 items');
  });

  test('Module: config.js exports SINGULAR', () => {
    assert(typeof SINGULAR !== 'undefined', 'SINGULAR not defined');
    assert(SINGULAR.characters === 'Character', 'SINGULAR.characters mismatch');
  });

  test('Module: config.js exports SEC_COLORS', () => {
    assert(typeof SEC_COLORS !== 'undefined', 'SEC_COLORS not defined');
    assert(Array.isArray(SEC_COLORS), 'SEC_COLORS is not an array');
    assert(SEC_COLORS.length > 0, 'SEC_COLORS is empty');
  });

  // Test 2: State Object
  test('Module: state.js creates state object S', () => {
    assert(typeof S !== 'undefined', 'S (state) not defined');
    assert(typeof S.scenes !== 'undefined', 'S.scenes not defined');
    assert(Array.isArray(S.scenes), 'S.scenes is not an array');
  });

  test('Module: state.js implements localStorage functions', () => {
    assert(typeof saveState === 'function', 'saveState not defined');
    assert(typeof loadState === 'function', 'loadState not defined');
    assert(typeof saveProjectIndex === 'function', 'saveProjectIndex not defined');
    assert(typeof loadProjectIndex === 'function', 'loadProjectIndex not defined');
  });

  test('Module: state.js implements undo/redo', () => {
    assert(typeof pushHistory === 'function', 'pushHistory not defined');
    assert(typeof undo === 'function', 'undo not defined');
    assert(typeof redo === 'function', 'redo not defined');
  });

  // Test 3: Tracking
  test('Module: tracking.js implements GA wrappers', () => {
    assert(typeof trackItemAdded === 'function', 'trackItemAdded not defined');
    assert(typeof trackThemeChanged === 'function', 'trackThemeChanged not defined');
    assert(typeof trackSceneAdded === 'function', 'trackSceneAdded not defined');
    assert(typeof trackProjectCreated === 'function', 'trackProjectCreated not defined');
  });

  test('Module: tracking.js implements milestones', () => {
    assert(typeof trackMilestone === 'function', 'trackMilestone not defined');
    assert(typeof getUserId === 'function', 'getUserId not defined');
  });

  // Test 4: Projects Module
  test('Module: projects.js implements project functions', () => {
    assert(typeof openProject === 'function', 'openProject not defined');
    assert(typeof createAndOpenProject === 'function', 'createAndOpenProject not defined');
    assert(typeof backToProjects === 'function', 'backToProjects not defined');
    assert(typeof startProjRename === 'function', 'startProjRename not defined');
  });

  test('Module: projects.js implements project grid', () => {
    assert(typeof renderProjectGrid === 'function', 'renderProjectGrid not defined');
    assert(typeof timeAgo === 'function', 'timeAgo utility not defined');
    assert(typeof esc === 'function', 'esc utility not defined');
  });

  // Test 5: Page Detection
  test('Page detection: _page variable exists', () => {
    assert(typeof _page !== 'undefined', '_page not defined');
    assert(['editor', 'projects', 'other'].includes(_page), `_page has invalid value: ${_page}`);
  });

  // Test 6: Theme System
  test('Theme system: theme colors set', () => {
    const theme = document.documentElement.dataset.theme;
    assert(['ivory', 'slate', 'studio', 'ocean', 'sunset'].includes(theme), `Invalid theme: ${theme}`);
  });

  test('Theme system: setTheme function exists', () => {
    assert(typeof setTheme === 'function', 'setTheme not defined');
  });

  // Test 7: Data Migration
  test('Data migration: migrateExistingData exists', () => {
    assert(typeof migrateExistingData === 'function', 'migrateExistingData not defined');
  });

  // Test 8: Sample Projects
  test('Sample projects: ensureSampleProjects exists', () => {
    assert(typeof ensureSampleProjects === 'function', 'ensureSampleProjects not defined');
  });

  // Test 9: Page-Specific Functions
  const pageTests = () => {
    const isEditor = !!document.getElementById('app-storyboard');
    const isProjects = !!document.getElementById('proj-mgr');

    if (isEditor) {
      test('Editor Page: scene editor functions exist', () => {
        assert(typeof addScene === 'function', 'addScene not defined');
        assert(typeof buildLibPanel === 'function', 'buildLibPanel not defined');
        assert(typeof renderBoard === 'function', 'renderBoard not defined');
      });

      test('Editor Page: library functions exist', () => {
        assert(typeof toggleLibItem === 'function', 'toggleLibItem not defined');
        assert(typeof removeItem === 'function', 'removeItem not defined');
      });

      test('Editor Page: section functions exist', () => {
        assert(typeof addSection === 'function', 'addSection not defined');
        assert(typeof deleteSection === 'function', 'deleteSection not defined');
      });

      test('Editor Page: search functions exist', () => {
        assert(typeof onSearch === 'function', 'onSearch not defined');
        assert(typeof clearSearch === 'function', 'clearSearch not defined');
      });

      test('Editor Page: report functions exist', () => {
        assert(typeof openReportModal === 'function', 'openReportModal not defined');
        assert(typeof closeReportModal === 'function', 'closeReportModal not defined');
        assert(typeof generateReport === 'function', 'generateReport not defined');
      });
    }

    if (isProjects) {
      test('Projects Page: project manager functions exist', () => {
        assert(typeof renderProjectGrid === 'function', 'renderProjectGrid not defined');
        assert(typeof createAndOpenProject === 'function', 'createAndOpenProject not defined');
      });

      test('Projects Page: project actions exist', () => {
        assert(typeof confirmProjRename === 'function', 'confirmProjRename not defined');
        assert(typeof confirmProjDel === 'function', 'confirmProjDel not defined');
        assert(typeof exportProjectJSON === 'function', 'exportProjectJSON not defined');
      });
    }
  };

  pageTests();

  // Test 10: GA Integration
  test('GA Integration: gtag function exists', () => {
    assert(typeof gtag === 'function', 'gtag not defined (GA not loaded)');
  });

  // Test 11: Helper Functions
  test('Helper functions: truncStr exists', () => {
    assert(typeof truncStr === 'function', 'truncStr not defined');
    assert(truncStr('hello world', 5) === 'hello…', 'truncStr not working correctly');
  });

  // Render results
  renderResults();
}

function renderResults() {
  const container = document.getElementById('results');
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;

  let html = `<div class="test-suite">
    <h2>Test Results: ${passed} passed, ${failed} failed</h2>`;

  for (const result of results) {
    const className = result.status === 'pass' ? 'pass' : 'fail';
    const symbol = result.status === 'pass' ? '✓' : '✗';
    html += `<div class="test ${className}">
      <span class="status">${symbol}</span> ${result.name}
      <div class="summary">${result.message}</div>
    </div>`;
  }

  html += '</div>';
  container.innerHTML = html;

  if (failed === 0) {
    container.innerHTML += `<div class="test-suite" style="background: #f1f8f4; border-left: 4px solid #4caf50;">
      <h3>✅ All tests passed! Site structure is sound.</h3>
      <p>Now run manual browser tests from TEST_PLAN_PHASE_4.md</p>
    </div>`;
  }
}

// Auto-run on page load if on test page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runAllTests);
} else {
  runAllTests();
}
document.getElementById('run-tests-btn').addEventListener('click', runAllTests);
