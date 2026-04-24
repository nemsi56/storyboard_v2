'use strict';

// ── CONFIG ────────────────────────────────────────────────────────────────────
const SECS = [
  { key:'characters', label:'Characters', dot:'dc', secCls:'sec-c', tag:'tc', ph:'Character name…' },
  { key:'locations',  label:'Locations',  dot:'dl', secCls:'sec-l', tag:'tl', ph:'Location name…'  },
  { key:'themes',     label:'Themes',     dot:'dt', secCls:'sec-t', tag:'tt', ph:'Theme…'          },
  { key:'misc',       label:'Misc Items',  dot:'dm', secCls:'sec-m', tag:'tm', ph:'Topic…'          },
];
const SINGULAR = { characters:'Character', locations:'Location', themes:'Theme', misc:'Misc item' };
const SEC_COLORS = ['#5b8dd9','#6aaa80','#9b7cc4','#d4844a','#4aadb5','#c47a8a','#c4a84a','#7a8ea8'];
