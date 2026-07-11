'use strict';

// ── REPORTS ───────────────────────────────────────────────────────────────────
let rptType = 'scenelist';

function openReportModal() {
  const secList = document.getElementById('rpt-sec-list');
  secList.innerHTML = '';
  S.sections.forEach(sec => {
    const lbl = document.createElement('label'); lbl.className = 'rpt-ck';
    const cb  = document.createElement('input'); cb.type = 'checkbox'; cb.value = String(sec.id); cb.checked = true;
    cb.dataset.rptSec = '1';
    cb.addEventListener('change', syncRptAllSecs);
    const sp = document.createElement('span'); sp.textContent = sec.name;
    lbl.appendChild(cb); lbl.appendChild(sp); secList.appendChild(lbl);
  });
  // Match rptFilterScenes()'s definition of Unassigned: a scene whose
  // sectionId doesn't resolve to a real section (not just a falsy sectionId)
  // — an orphaned id (e.g. from an import, or a since-deleted section) is
  // possible and should count here too, or its scenes silently vanish from
  // every report even with every checkbox selected.
  const validSecIds = new Set(S.sections.map(s => s.id));
  if (S.scenes.some(s => !validSecIds.has(s.sectionId))) {
    const lbl = document.createElement('label'); lbl.className = 'rpt-ck';
    const cb  = document.createElement('input'); cb.type = 'checkbox'; cb.value = '__unassigned__'; cb.checked = true;
    cb.dataset.rptSec = '1';
    cb.addEventListener('change', syncRptAllSecs);
    const sp = document.createElement('span'); sp.textContent = 'Unassigned'; sp.style.fontStyle = 'italic';
    lbl.appendChild(cb); lbl.appendChild(sp); secList.appendChild(lbl);
  }
  document.getElementById('rpt-modal').classList.add('open');
}

function closeReportModal() { document.getElementById('rpt-modal').classList.remove('open'); }

function switchRptType(type, btn) {
  rptType = type;
  document.querySelectorAll('.rpt-type-btn').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  document.querySelectorAll('.rpt-opts-panel').forEach(p => p.classList.remove('on'));
  const panel = document.getElementById('rpt-opts-' + type);
  if (panel) panel.classList.add('on');
}

function rptToggleAllSecs(cb) {
  document.querySelectorAll('[data-rpt-sec]').forEach(c => { c.checked = cb.checked; });
}
function syncRptAllSecs() {
  const all = [...document.querySelectorAll('[data-rpt-sec]')];
  document.getElementById('rpt-sec-all').checked = all.every(c => c.checked);
}
function rptSelectedSecs() {
  return new Set([...document.querySelectorAll('[data-rpt-sec]:checked')].map(c => c.value));
}
function rptFilterScenes(secSet) {
  const validSecIds = new Set(S.sections.map(s => s.id));
  const filtered = S.scenes.filter(sc => {
    const sid = validSecIds.has(sc.sectionId) ? String(sc.sectionId) : '__unassigned__';
    return secSet.has(sid);
  });
  const secOrder = new Map([...validSecIds].map((id, i) => [id, i + 1]));
  // Array.prototype.sort is stable (ES2019+), so scenes within the same
  // section keep their original relative order without an explicit tiebreak.
  return filtered.sort((a, b) => {
    const oa = secOrder.get(a.sectionId) ?? 0;
    const ob = secOrder.get(b.sectionId) ?? 0;
    return oa - ob;
  });
}
function rptSecName(sectionId) {
  if (!sectionId) return 'Unassigned';
  const sec = S.sections.find(s => s.id === sectionId);
  return sec ? sec.name : 'Unassigned';
}

// ── REPORT BUILDERS ───────────────────────────────────────────────────────────
function generateReport() {
  const secSet = rptSelectedSecs();
  let html = '';
  if (rptType === 'scenelist') html = buildSceneListReport(secSet);
  if (rptType === 'character') html = buildCharacterReport(secSet);
  if (rptType === 'location')  html = buildLocationReport(secSet);
  if (rptType === 'theme')     html = buildThemeReport(secSet);
  if (rptType === 'misc')      html = buildMiscReport(secSet);
  if (rptType === 'pov')       html = buildPovReport(secSet);
  if (rptType === 'matrix')    html = buildMatrixReport(secSet);

  try {
    let reportCount = parseInt(localStorage.getItem('scenesetter_report_count') || '0');
    reportCount++;
    localStorage.setItem('scenesetter_report_count', String(reportCount));
    if (reportCount === 3) {
      trackMilestone('3rd_report_generated');
    }
  } catch(e) {}

  openReportWindow(html);
}

function rptBaseCSS() {
  return `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#222;background:#fff;padding:24px 28px;max-width:700px;margin:0 auto}
    h1{font-size:20px;font-weight:800;margin-bottom:4px;color:#111}
    .rpt-meta{font-size:11px;color:#666;margin-bottom:18px;border-bottom:1px solid #ddd;padding-bottom:10px}
    h2{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#555;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #ddd}
    .scene-block{padding:8px 0;border-bottom:1px solid #ccc;break-inside:avoid}
    .scene-block:last-child{border-bottom:none}
    .scene-num{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:1px}
    .scene-title{font-size:13px;font-weight:700;color:#111;margin-bottom:4px;white-space:pre-wrap;line-height:1.35}
    .field-row{display:flex;gap:6px;margin-top:3px;align-items:baseline}
    .field-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#888;flex-shrink:0;min-width:72px}
    .field-val{font-size:11px;color:#444;line-height:1.5;white-space:pre-wrap}
    .tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:10px;margin:1px 2px 1px 0;font-weight:600}
    .tag-c{background:#dce8fb;color:#2a5bb4}
    .tag-l{background:#d5eede;color:#1e6b3f}
    .tag-t{background:#e8dff7;color:#5a2f90}
    .tag-m{background:#fdecd5;color:#8f5520}
    .tag-p{background:#d6f0ea;color:#0e7c6b}
    .scene-entry{margin:3px 0;padding:4px 8px;border-left:2px solid #ccc}
    .scene-entry-title{font-weight:600;color:#222;font-size:11px}
    .scene-entry-meta{color:#666;font-size:11px}
    .scene-entry-summary{font-size:11px;color:#555;margin-top:2px;white-space:pre-wrap;line-height:1.45}
    .empty-note{font-size:11px;color:#999;font-style:italic;padding-left:8px;margin:3px 0}
    table{border-collapse:collapse;font-size:11px;margin-top:6px}
    thead th{background:#f0f0f0;font-weight:700;font-size:10px;color:#555;padding:5px 6px;text-align:center;border:1px solid #ccc;border-bottom-width:2px;vertical-align:bottom}
    thead th:first-child{text-align:left;padding-left:8px}
    .mx-scene-num{white-space:nowrap;display:block;font-weight:600;font-size:10px;color:#444;line-height:1.4}
    .mx-axis-hdr{font-size:10px;color:#444;font-weight:700;white-space:nowrap;line-height:1.3;display:block;letter-spacing:0.04em}
    .mx-scene-sec{font-size:9px;color:#777;font-weight:400}
    tbody td{padding:5px 4px;border:1px solid #ccc;vertical-align:middle}
    tbody td:first-child{padding-left:8px}
    .mx-cell{padding:4px 2px;text-align:center}
    tbody tr:hover td{background:#fafafa}
    .mx-dot{color:#3a6bc4;font-size:12px}
    .mx-row-hdr{font-weight:600;color:#333;white-space:nowrap;font-size:11px}
    .mx-row-wrap{display:flex;gap:0;align-items:baseline}
    .mx-row-num{flex-shrink:0;margin-right:4px;color:#666;font-weight:600}
    .mx-row-title{white-space:normal;line-height:1.4}
    @media print{
      *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
      body{padding:14px 18px;max-width:none}
      .scene-block{break-inside:avoid}
      h2{break-before:auto}
      table{border-collapse:collapse}
      td,th{border:1px solid #ccc !important}
      thead th{border-bottom-width:2px !important}
    }
  `;
}

function openReportWindow(html) {
  const w = window.open('', '_blank');
  if (!w) { alert('Pop-up blocked — please allow pop-ups for this page and try again.'); return; }
  w.document.write(html);
  w.document.close();
}

function rptPageHeader(title) {
  const d = new Date().toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
  const total = S.scenes.length;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${rptEsc(title)}</title><style>${rptBaseCSS()}</style></head><body>`
       + `<h1>${rptEsc(title)}</h1>`
       + `<div class="rpt-meta">Generated ${d} &nbsp;·&nbsp; ${total} scene${total!==1?'s':''} total</div>`;
}

function rptEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function rptFieldRow(label, val) {
  return `<div class="field-row"><span class="field-lbl">${label}</span><span class="field-val">${val}</span></div>`;
}
function rptTagsHtml(arr, cls) {
  return arr.map(t => `<span class="tag ${cls}">${rptEsc(t)}</span>`).join('');
}

function buildSceneListReport(secSet) {
  const inc = {
    section:    document.getElementById('rpt-sl-section').checked,
    summary:    document.getElementById('rpt-sl-summary').checked,
    notes:      document.getElementById('rpt-sl-notes').checked,
    characters: document.getElementById('rpt-sl-characters').checked,
    locations:  document.getElementById('rpt-sl-locations').checked,
    themes:     document.getElementById('rpt-sl-themes').checked,
    misc:       document.getElementById('rpt-sl-misc').checked,
    pov:        document.getElementById('rpt-sl-pov').checked,
  };
  const scenes = rptFilterScenes(secSet);
  const numMap = buildSceneNumMap();
  let html = rptPageHeader('Scene List');
  if (!scenes.length) {
    html += '<p style="color:#aaa;margin-top:20px;font-style:italic">No scenes match the selected sections.</p>';
  } else {
    scenes.forEach(sc => {
      html += `<div class="scene-block">`;
      html += `<div class="scene-num">Scene ${numMap.get(sc.id) ?? 1}</div>`;
      html += `<div class="scene-title">${rptEsc(sc.title || '(Untitled)')}</div>`;
      if (inc.section)                       html += rptFieldRow('Section',    rptEsc(rptSecName(sc.sectionId)));
      if (inc.summary    && sc.summary)      html += rptFieldRow('Summary',    rptEsc(sc.summary));
      if (inc.notes      && sc.notes)        html += rptFieldRow('Notes',      rptEsc(sc.notes));
      if (inc.characters && sc.characters?.length) html += rptFieldRow('Characters', rptTagsHtml(sc.characters, 'tag-c'));
      if (inc.locations  && sc.locations?.length)  html += rptFieldRow('Locations',  rptTagsHtml(sc.locations,  'tag-l'));
      if (inc.themes     && sc.themes?.length)     html += rptFieldRow('Themes',      rptTagsHtml(sc.themes,     'tag-t'));
      if (inc.misc       && sc.misc?.length)       html += rptFieldRow('Misc Items',  rptTagsHtml(sc.misc,       'tag-m'));
      if (inc.pov        && sc.povs?.length)       html += rptFieldRow('POV',         rptTagsHtml(sc.povs,       'tag-p'));
      html += `</div>`;
    });
  }
  return html + '</body></html>';
}

const LIB_RPT_CFG = {
  character: { key:'characters', prefix:'rpt-ch', title:'Character Report', emptyMsg:'No characters in library.', emptyScene:'Does not appear in selected scenes',
               extraMeta: (inc, sc) => inc.location && sc.locations?.length ? sc.locations.map(rptEsc).join(', ') : null },
  location:  { key:'locations',  prefix:'rpt-lo', title:'Location Report',  emptyMsg:'No locations in library.',  emptyScene:'Not used in selected scenes',
               extraMeta: (inc, sc) => inc.characters && sc.characters?.length ? sc.characters.map(rptEsc).join(', ') : null },
  theme:     { key:'themes',     prefix:'rpt-th', title:'Theme Report',     emptyMsg:'No themes in library.',     emptyScene:'Not present in selected scenes',
               extraMeta: (inc, sc) => inc.characters && sc.characters?.length ? sc.characters.map(rptEsc).join(', ') : null },
  misc:      { key:'misc',       prefix:'rpt-mi', title:'Misc Items Report',emptyMsg:'No misc items in library.', emptyScene:'Not present in selected scenes',
               extraMeta: (inc, sc) => inc.characters && sc.characters?.length ? sc.characters.map(rptEsc).join(', ') : null },
  // POV isn't a real library array (S.povs doesn't exist) — names come from the
  // Character library plus S.povCustomNames, so `items` supplies the {name} list
  // in place of S[key], and there's no per-item Notes field to show.
  pov:       { key:'povs',       prefix:'rpt-pv', title:'POV Report',       emptyMsg:'No POV assigned to any scene.', emptyScene:'Not POV in selected scenes',
               items: () => usedPovNames().map(name => ({ name })),
               extraMeta: (inc, sc) => inc.characters && sc.characters?.length ? sc.characters.map(rptEsc).join(', ') : null },
};

function buildLibItemReport(secSet, type) {
  const cfg = LIB_RPT_CFG[type];
  const pfx = cfg.prefix;
  const inc = {};
  document.querySelectorAll(`[id^="${pfx}-"]`).forEach(el => {
    const field = el.id.slice(pfx.length + 1);
    inc[field] = el.checked;
  });
  const scenes = rptFilterScenes(secSet);
  const numMap = buildSceneNumMap();
  let html = rptPageHeader(cfg.title);
  const items = cfg.items ? cfg.items() : S[cfg.key];
  if (!items.length) {
    html += `<p style="color:#aaa;margin-top:20px;font-style:italic">${cfg.emptyMsg}</p>`;
  } else {
    items.forEach(item => {
      const appears = scenes.filter(sc => (sc[cfg.key] || []).includes(item.name));
      html += `<h2>${rptEsc(item.name)} <span style="font-weight:400;letter-spacing:0;font-size:10px;color:#ccc">${appears.length} scene${appears.length!==1?'s':''}</span></h2>`;
      if (inc.notes && item.notes) html += `<div class="scene-entry-summary" style="margin:-4px 0 8px">${rptEsc(item.notes)}</div>`;
      if (!appears.length) {
        html += `<div class="empty-note">${cfg.emptyScene}</div>`;
      } else {
        appears.forEach(sc => {
          const meta = [];
          if (inc.section) meta.push(rptEsc(rptSecName(sc.sectionId)));
          const extra = cfg.extraMeta(inc, sc);
          if (extra) meta.push(extra);
          html += `<div class="scene-entry">`;
          html += `<span class="scene-entry-title">Scene ${numMap.get(sc.id) ?? 1} — ${rptEsc(sc.title || '(Untitled)')}</span>`;
          if (meta.length) html += ` <span class="scene-entry-meta">· ${meta.join(' · ')}</span>`;
          if (inc.summary && sc.summary) html += `<div class="scene-entry-summary">${rptEsc(sc.summary)}</div>`;
          html += `</div>`;
        });
      }
    });
  }
  return html + '</body></html>';
}
function buildCharacterReport(secSet) { return buildLibItemReport(secSet, 'character'); }
function buildLocationReport(secSet)  { return buildLibItemReport(secSet, 'location'); }
function buildThemeReport(secSet)     { return buildLibItemReport(secSet, 'theme'); }
function buildMiscReport(secSet)      { return buildLibItemReport(secSet, 'misc'); }
function buildPovReport(secSet)       { return buildLibItemReport(secSet, 'pov'); }

function updateMxNote() {
  const flip = document.getElementById('rpt-mx-flip').checked;
  const note = document.getElementById('rpt-mx-note');
  if (note) note.textContent = flip ? 'as columns · Scenes as rows' : 'as rows · Scenes as columns';
}

function buildMatrixReport(secSet) {
  const axis      = document.getElementById('rpt-mx-axis').value;
  const showSec   = document.getElementById('rpt-mx-section').checked;
  const flip      = document.getElementById('rpt-mx-flip').checked;
  const scenes    = rptFilterScenes(secSet);
  const numMap    = buildSceneNumMap();
  // POV isn't a real library array (S.povs doesn't exist) — build its axis items
  // from the names actually assigned as POV, same as the POV item report above.
  const axisItems = axis === 'povs' ? usedPovNames().map(name => ({ name })) : (S[axis] || []);
  const axisLabel = axis === 'povs' ? 'POV' : (SECS.find(s => s.key === axis)?.label || axis);
  const title     = flip ? `Cross-Reference: Scenes × ${axisLabel}` : `Cross-Reference: ${axisLabel} × Scenes`;
  let html = rptPageHeader(title);
  if (!axisItems.length) {
    html += `<p style="color:#aaa;margin-top:20px;font-style:italic">No ${axisLabel.toLowerCase()} in library.</p>`;
    return html + '</body></html>';
  }
  if (!scenes.length) {
    html += '<p style="color:#aaa;margin-top:20px;font-style:italic">No scenes match the selected sections.</p>';
    return html + '</body></html>';
  }
  if (flip) {
    html += `<table><thead><tr><th style="width:200px;max-width:200px">Scene</th>`;
    axisItems.forEach(item => {
      html += `<th><span class="mx-axis-hdr">${rptEsc(item.name)}</span></th>`;
    });
    html += `</tr></thead><tbody>`;
    scenes.forEach(sc => {
      const secStr = showSec ? ` <span class="mx-scene-sec" style="font-weight:400">· ${rptEsc(rptSecName(sc.sectionId))}</span>` : '';
      html += `<tr><td class="mx-row-hdr" style="width:200px;max-width:200px"><div class="mx-row-wrap"><span class="mx-row-num">${numMap.get(sc.id) ?? 1} —</span><span class="mx-row-title">${rptEsc(sc.title||'(Untitled)')}${secStr}</span></div></td>`;
      axisItems.forEach(item => {
        html += (sc[axis] || []).includes(item.name) ? `<td class="mx-cell mx-dot">●</td>` : `<td class="mx-cell"></td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table>`;
  } else {
    html += `<div id="mx-wrap">`;
    html += `<table id="mx-full"><thead><tr><th style="min-width:130px">${rptEsc(axisLabel)}</th>`;
    scenes.forEach(sc => {
      const secStr = showSec ? `<span class="mx-scene-sec" style="display:block;white-space:nowrap">${rptEsc(rptSecName(sc.sectionId))}</span>` : '';
      html += `<th title="${rptEsc(sc.title||'(Untitled)')}"><span class="mx-scene-num">Sc ${numMap.get(sc.id) ?? 1}</span>${secStr}</th>`;
    });
    html += `</tr></thead><tbody>`;
    axisItems.forEach(item => {
      html += `<tr><td class="mx-row-hdr">${rptEsc(item.name)}</td>`;
      scenes.forEach(sc => {
        html += (sc[axis] || []).includes(item.name) ? `<td class="mx-cell mx-dot">●</td>` : `<td class="mx-cell"></td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    html += `<script>
(function(){
  var tbl = document.getElementById('mx-full');
  if (!tbl) return;
  var ths = tbl.querySelectorAll('thead th');
  if (ths.length < 2) return;
  var pageW = document.body.clientWidth || 760;
  var hdrW = ths[0].offsetWidth;
  var colWs = [];
  for (var i = 1; i < ths.length; i++) colWs.push(ths[i].offsetWidth);
  var chunks = [], ci = 0;
  while (ci < colWs.length) {
    var used = hdrW, end = ci;
    while (end < colWs.length && used + colWs[end] <= pageW) { used += colWs[end]; end++; }
    if (end === ci) end = ci + 1;
    chunks.push([ci, end]);
    ci = end;
  }
  if (chunks.length <= 1) return;
  var rows = tbl.querySelectorAll('tbody tr');
  var wrap = document.getElementById('mx-wrap');
  var frag = document.createDocumentFragment();
  chunks.forEach(function(c) {
    var t = document.createElement('table');
    t.style.marginBottom = '18px';
    t.style.pageBreakInside = 'avoid';
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    hr.appendChild(ths[0].cloneNode(true));
    for (var i = c[0]; i < c[1]; i++) hr.appendChild(ths[i+1].cloneNode(true));
    thead.appendChild(hr);
    t.appendChild(thead);
    var tbody = document.createElement('tbody');
    rows.forEach(function(row) {
      var cells = row.querySelectorAll('td');
      var nr = document.createElement('tr');
      nr.appendChild(cells[0].cloneNode(true));
      for (var i = c[0]; i < c[1]; i++) nr.appendChild(cells[i+1].cloneNode(true));
      tbody.appendChild(nr);
    });
    t.appendChild(tbody);
    frag.appendChild(t);
  });
  wrap.innerHTML = '';
  wrap.appendChild(frag);
})();
<\/script>`;
  }
  return html + '</body></html>';
}
