// Build script: concatenates and minifies JS + CSS into /dist
// Usage: npm run build
// Note: dist/ is gitignored — GitHub Pages serves source files directly.
//       To deploy minified, update HTML script tags to reference dist/
//       and configure GitHub Pages to serve from /dist or via Actions.

const esbuild = require('esbuild');
const fs = require('fs');

if (!fs.existsSync('dist')) fs.mkdirSync('dist');

// JS load order must match HTML script tags
const JS_FILES = [
  'config.js', 'tracking.js', 'state.js', 'backup.js', 'reports.js',
  'ui.js', 'charts.js', 'editor.js', 'projects.js',
  'main.js', 'app.js',
];

// Concatenate all JS, then minify as one file
const combined = JS_FILES.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const tmpFile = 'dist/_tmp.js';
fs.writeFileSync(tmpFile, combined);

esbuild.buildSync({
  entryPoints: [tmpFile],
  outfile: 'dist/bundle.min.js',
  minify: true,
  target: ['chrome111', 'firefox113', 'safari16'],
});
fs.unlinkSync(tmpFile);

// Minify CSS
esbuild.buildSync({
  entryPoints: ['styles.css'],
  outfile: 'dist/styles.min.css',
  minify: true,
});

// Size report
const origJs  = JS_FILES.reduce((sum, f) => sum + fs.statSync(f).size, 0);
const origCss = fs.statSync('styles.css').size;
const minJs   = fs.statSync('dist/bundle.min.js').size;
const minCss  = fs.statSync('dist/styles.min.css').size;

const fmt = (b) => (b / 1024).toFixed(1) + 'KB';
const pct = (a, b) => Math.round(a / b * 100) + '%';

console.log(`JS:    ${fmt(origJs)}  →  ${fmt(minJs)}  (${pct(minJs, origJs)})`);
console.log(`CSS:   ${fmt(origCss)}  →  ${fmt(minCss)}  (${pct(minCss, origCss)})`);
console.log(`Total: ${fmt(origJs + origCss)}  →  ${fmt(minJs + minCss)}`);
console.log('Output: dist/bundle.min.js + dist/styles.min.css');
