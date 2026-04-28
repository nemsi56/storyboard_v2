'use strict';

// ── AI ANALYSIS ───────────────────────────────────────────────────────────────

const MOCK_ANALYSIS = {
  critical: [
    {
      title: 'Timeline inconsistency: Jane\'s illness',
      description: 'Jane is ill at Netherfield in Scene 4 but appears healthy in Scene 6 with no recovery noted.',
      scenes: [4, 6]
    },
    {
      title: 'Character motivation gap: Collins\'s proposal',
      description: 'Collins proposes in Scene 7 but no earlier scene establishes his attachment to Elizabeth.',
      scenes: [7]
    }
  ],
  important: [
    {
      title: 'Pacing: Act II contains 40% of all scenes',
      description: 'Act II (Misunderstandings) is disproportionately long. Consider distributing scenes more evenly or consolidating.',
      scenes: null
    },
    {
      title: 'Character neglect: Mrs. Bennet disappears after Act I',
      description: 'Mrs. Bennet appears in 3 early scenes but vanishes in Acts II–IV, weakening the family pressure subplot.',
      scenes: [1, 2, 3]
    },
    {
      title: 'Unresolved thread: Wickham\'s debts',
      description: 'Wickham\'s financial troubles are hinted at in Act II but never explicitly resolved in a scene.',
      scenes: [6, 11]
    }
  ],
  consider: [
    {
      title: 'Theme coverage: "Self-Awareness" appears only in later acts',
      description: '"Self-Awareness" is tagged in Acts III–V but absent from Acts I–II. May be intentional but could be signaled earlier.',
      scenes: null
    },
    {
      title: 'Location logic: Pemberley introduced late',
      description: 'Pemberley only appears in Act III onward. Referencing it earlier could reinforce Darcy\'s social standing sooner.',
      scenes: [9, 12]
    }
  ]
};

let _aiAnalysis  = null;
let _aiDismissed = new Set();

function _aiDismissKey() {
  return 'ai_dismissed_' + (currentProjectId || 'none');
}

function _loadAiDismissed() {
  try {
    const raw = localStorage.getItem(_aiDismissKey());
    _aiDismissed = raw ? new Set(JSON.parse(raw)) : new Set();
  } catch(e) { _aiDismissed = new Set(); }
}

function _saveAiDismissed() {
  try {
    localStorage.setItem(_aiDismissKey(), JSON.stringify([..._aiDismissed]));
  } catch(e) {}
}

// ── CONFIRMATION MODAL ────────────────────────────────────────────────────────

function openAnalysisConfirm() {
  document.getElementById('ai-confirm-modal').classList.add('open');
}

function closeAnalysisConfirm() {
  document.getElementById('ai-confirm-modal').classList.remove('open');
}

// ── RUN ANALYSIS ──────────────────────────────────────────────────────────────

function runAnalysis() {
  closeAnalysisConfirm();
  _loadAiDismissed();
  const body = document.getElementById('ap-body');
  const ts = document.getElementById('ap-last-run');
  if (ts) ts.textContent = '';
  openAnalysisPanel();

  // Phase 1: Mock response (complete immediately for better UX)
  _aiAnalysis = MOCK_ANALYSIS;
  _renderAnalysisPanel();

  // TODO Phase 2: replace with real fetch() to backend with loading state
}

// ── PANEL OPEN / CLOSE ────────────────────────────────────────────────────────

function openAnalysisPanel() {
  // Collapse the three left panels to give the board maximum space
  ['lp', 'sp', 'cp'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('collapsed')) togglePanel(id);
  });
  const aip = document.getElementById('aip');
  if (aip) aip.classList.remove('collapsed');
  if (typeof updateAIMenuState === 'function') updateAIMenuState();
}

function closeAnalysisPanel() {
  const aip = document.getElementById('aip');
  if (aip) aip.classList.add('collapsed');
  _clearAnalysisHighlights();
  if (typeof updateAIMenuState === 'function') updateAIMenuState();
}

function toggleAnalysisPanel() {
  // This is now controlled via the View menu using togglePanel('aip')
  const aip = document.getElementById('aip');
  if (!aip) return;
  if (aip.classList.contains('collapsed')) {
    if (_aiAnalysis) {
      openAnalysisPanel();
    } else {
      openAnalysisConfirm();
    }
  } else {
    closeAnalysisPanel();
  }
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function _renderAnalysisPanel() {
  if (!_aiAnalysis) return;
  const body = document.getElementById('ap-body');
  body.innerHTML = '';

  const CATS = [
    { key: 'critical',  label: 'Critical',  icon: '🔴' },
    { key: 'important', label: 'Important', icon: '🟡' },
    { key: 'consider',  label: 'Consider',  icon: '🔵' }
  ];

  let totalVisible = 0;

  CATS.forEach(cat => {
    const findings = (_aiAnalysis[cat.key] || [])
      .filter(f => !_aiDismissed.has(cat.key + ':' + f.title));
    if (!findings.length) return;
    totalVisible += findings.length;

    const section = document.createElement('div');
    section.className = 'ai-section';

    const hdr = document.createElement('div');
    hdr.className = 'ai-sec-hdr';
    hdr.innerHTML = `<span>${cat.icon} ${cat.label.toUpperCase()}</span><span class="ai-sec-cnt">${findings.length}</span>`;
    section.appendChild(hdr);

    findings.forEach(finding => {
      const item = document.createElement('div');
      item.className = 'ai-finding';

      const titleRow = document.createElement('div');
      titleRow.className = 'ai-finding-title-row';

      const caret = document.createElement('span');
      caret.className = 'ai-caret';
      caret.textContent = '▶';

      const title = document.createElement('span');
      title.className = 'ai-finding-title';
      title.textContent = finding.title;

      const dismiss = document.createElement('button');
      dismiss.className = 'ai-dismiss';
      dismiss.textContent = '×';
      dismiss.title = 'Dismiss';
      dismiss.addEventListener('click', e => {
        e.stopPropagation();
        _aiDismissed.add(cat.key + ':' + finding.title);
        _saveAiDismissed();
        _renderAnalysisPanel();
      });

      titleRow.appendChild(caret);
      titleRow.appendChild(title);
      titleRow.appendChild(dismiss);

      const detail = document.createElement('div');
      detail.className = 'ai-finding-detail';

      const desc = document.createElement('p');
      desc.className = 'ai-finding-desc';
      desc.textContent = finding.description;
      detail.appendChild(desc);

      if (finding.scenes && finding.scenes.length) {
        const sceneRow = document.createElement('div');
        sceneRow.className = 'ai-scene-links';
        sceneRow.appendChild(Object.assign(document.createElement('span'), { textContent: 'Scenes: ' }));
        finding.scenes.forEach(num => {
          const btn = document.createElement('button');
          btn.className = 'ai-scene-btn';
          btn.textContent = num;
          btn.addEventListener('click', () => _highlightAnalysisScenes(finding.scenes));
          sceneRow.appendChild(btn);
        });
        detail.appendChild(sceneRow);
      }

      titleRow.addEventListener('click', () => {
        const expanded = item.classList.toggle('expanded');
        caret.textContent = expanded ? '▼' : '▶';
        if (expanded && finding.scenes) _highlightAnalysisScenes(finding.scenes);
        else _clearAnalysisHighlights();
      });

      item.appendChild(titleRow);
      item.appendChild(detail);
      section.appendChild(item);
    });

    body.appendChild(section);
  });

  if (!totalVisible) {
    body.innerHTML = '<div class="ai-empty">All findings dismissed.<br>Click Re-analyze to refresh.</div>';
  }

  const ts = document.getElementById('ap-last-run');
  if (ts) ts.textContent = 'Just now';
}

// ── SCENE HIGHLIGHTING ────────────────────────────────────────────────────────

function _highlightAnalysisScenes(sceneNums) {
  _clearAnalysisHighlights();
  if (!sceneNums) return;
  let first = null;
  document.querySelectorAll('.sc').forEach(card => {
    const numEl = card.querySelector('.cnum');
    if (!numEl) return;
    const n = parseInt(numEl.textContent.replace('Scene ', ''));
    if (sceneNums.includes(n)) {
      card.classList.add('hl-ai');
      if (!first) first = card;
    }
  });
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _clearAnalysisHighlights() {
  document.querySelectorAll('.sc.hl-ai').forEach(c => c.classList.remove('hl-ai'));
}

// ── DISMISS ALL ───────────────────────────────────────────────────────────────

function dismissAllFindings() {
  if (!_aiAnalysis) return;
  ['critical', 'important', 'consider'].forEach(cat => {
    (_aiAnalysis[cat] || []).forEach(f => _aiDismissed.add(cat + ':' + f.title));
  });
  _saveAiDismissed();
  _renderAnalysisPanel();
}

// ── EXPORT ────────────────────────────────────────────────────────────────────

function exportAnalysis() {
  if (!_aiAnalysis) return;
  const lines = ['STORY ANALYSIS', '==============', ''];
  const CATS = [
    { key: 'critical',  label: '🔴 CRITICAL'  },
    { key: 'important', label: '🟡 IMPORTANT' },
    { key: 'consider',  label: '🔵 CONSIDER'  }
  ];
  CATS.forEach(cat => {
    const findings = (_aiAnalysis[cat.key] || [])
      .filter(f => !_aiDismissed.has(cat.key + ':' + f.title));
    if (!findings.length) return;
    lines.push(cat.label);
    lines.push('-'.repeat(40));
    findings.forEach(f => {
      lines.push('• ' + f.title);
      lines.push('  ' + f.description);
      if (f.scenes) lines.push('  Scenes: ' + f.scenes.join(', '));
      lines.push('');
    });
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'story-analysis.txt';
  a.click();
}
