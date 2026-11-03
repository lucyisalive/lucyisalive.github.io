'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { inlinePage, buildPage, verifyGlyphGeometry, assertNoStartupLinks,
  SCRIPT_FILES, CSS_FILE, OUTPUT_FILES } = require('../tools/build-page.cjs');

const assets = Object.fromEntries(SCRIPT_FILES.map(file => [file, 'window.loaded.push(' + JSON.stringify(file) + ');']));
assets[CSS_FILE] = '.sample { color: red; }';
// Include closing tags inside JS and CSS strings, where packaging must escape
// the HTML terminator without changing the string value used by the program.
assets['sentence-hints.js'] += '\nwindow.example = "</script><script>notExecutable()</script>";';
assets['sentence-hints.js'] += '\nwindow.linkExample = \'<link rel="stylesheet" href="game-feedback.css">\';';
assets[CSS_FILE] += '\n.sample::after { content: "</style>"; }';
const source = '<!DOCTYPE html>\n<html><head><link rel="stylesheet" href="game-feedback.css?v=123"></head><body>\n' +
  SCRIPT_FILES.map((file, i) => '<script src=' + (i % 2 ? "'" + file + "?v=123'" : '"' + file + '"') + '></script>').join('\n') +
  '\n<script>window.loaded.push("game");</script></body></html>';
const compile = (html = source, files = assets) => inlinePage(html, file => {
  if (!Object.hasOwn(files, file)) throw new Error('Missing asset: ' + file);
  return files[file];
});
const compiled = compile();
assert.equal(compile().html, compiled.html, 'Build output must be deterministic');
assert.equal(compiled.scripts.length, 7);
assert.equal(compiled.styles.length, 1);
assert.ok(compiled.html.includes('game-source.html'), 'Generated file must explain where to edit');
assert.equal([...compiled.html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].length, 8,
  'Data strings must not create executable tags');
assert.equal((compiled.html.match(/<style\b/g) || []).length, 1, 'CSS strings must not terminate the style element');
assert.ok(compiled.html.includes('<script data-source="hanzi-data.js">'));
assert.ok(compiled.html.includes('<style data-source="game-feedback.css">'));
assert.equal(/<script\b[^>]*\bsrc\s*=/i.test(compiled.html), false, 'All startup JS must be inline');
assertNoStartupLinks(compiled.html);
const context = vm.createContext({ window: { loaded: [] } });
const scripts = [...compiled.html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
for (const script of scripts) vm.runInContext(script[1], context);
assert.deepEqual(Array.from(context.window.loaded), SCRIPT_FILES.concat('game'), 'Source script order must be retained');
assert.equal(context.window.example, '</script><script>notExecutable()</script>');
assert.equal(context.window.linkExample, '<link rel="stylesheet" href="game-feedback.css">');

// The game can initialize before the two large glyph modules finish arriving.
// Bundling must preserve this deliberate position, including the footer signal.
const smallFiles = SCRIPT_FILES.filter(file => !['hanzi-data.js', 'curriculum-hanzi-data.js'].includes(file));
const reordered = '<!DOCTYPE html><html><head><link rel="stylesheet" href="game-feedback.css"></head><body>' +
  smallFiles.map(file => '<script src="' + file + '"></script>').join('') +
  '<script>window.loaded.push("interactive");</script>' +
  '<script src="hanzi-data.js"></script><script src="curriculum-hanzi-data.js"></script>' +
  '<script>window.loaded.push("glyphs-ready");</script></body></html>';
const streaming = compile(reordered);
const streamingContext = vm.createContext({ window: { loaded: [] } });
for (const script of streaming.html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
  vm.runInContext(script[1], streamingContext);
}
assert.deepEqual(Array.from(streamingContext.window.loaded),
  smallFiles.concat('interactive', 'hanzi-data.js', 'curriculum-hanzi-data.js', 'glyphs-ready'));

for (const extra of [
  '<script src="https://example.com/game.js"></script>',
  '<script src="//example.com/game.js"></script>',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="stylesheet" href="https://example.com/font.css">',
  '<img src="https://example.com/a.png">',
]) assert.throws(() => compile(source.replace('</head>', extra + '</head>')), /local|External/);
assert.throws(() => compile(source.replace('hanzi-data.js', '../hanzi-data.js')), /Invalid local/);
assert.throws(() => compile(source.replace('hanzi-data.js', 'unknown.js')), /Unexpected/);
assert.throws(() => compile(source.replace('src="hanzi-data.js"', 'async src="hanzi-data.js"')), /ordered classic/);
assert.throws(() => compile(source.replace('</body>', '<script src="hanzi-data.js"></script></body>')), /Duplicate/);
assert.throws(() => compile(source.replace(/<script src="hanzi-data.js"><\/script>/, '')), /seven/);
assert.throws(() => compile(source.replace('<link rel="stylesheet" href="game-feedback.css?v=123">', '')), /exactly once/);
assert.throws(() => compile(source, { ...assets, [CSS_FILE]: '@import "extra.css";' }), /@import/);
assert.throws(() => compile(source, { ...assets, [CSS_FILE]: 'p { background: url(https://example.com/a.png); }' }), /external CSS/);
assert.throws(() => assertNoStartupLinks('<style>p { background: url("//example.com/a.png"); }</style>'), /external CSS/);
assertNoStartupLinks('<script>const reference="https://example.com/metadata";</script><svg xmlns="http://www.w3.org/2000/svg"></svg>');

const glyph = { strokes: ['M 1 1 L 2 2'], medians: [[[1, 1], [2, 2]]] };
const glyphSources = [
  { file: 'hanzi-data.js', source: 'window.HANZI_LOCAL_DATA=' + JSON.stringify({ 一: glyph }) + ';' },
  { file: 'curriculum-hanzi-data.js', source: 'window.HANZI_LOCAL_DATA.二=' + JSON.stringify(glyph) + ';' },
];
const glyphScripts = glyphSources.map(entry => ({ file: entry.file, code: entry.source }));
assert.equal(verifyGlyphGeometry(glyphSources, glyphScripts, 2).count, 2);
const changed = glyphScripts.map(entry => ({ ...entry }));
changed[1].code = changed[1].code.replace('[2,2]', '[3,3]');
assert.throws(() => verifyGlyphGeometry(glyphSources, changed, 2), /changed.*geometry/);
assert.throws(() => verifyGlyphGeometry(glyphSources, glyphScripts, 167), /Expected 167/);

if (!process.argv.includes('--unit')) {
  const root = path.join(__dirname, '..');
  const built = buildPage(root);
  for (const file of OUTPUT_FILES) {
    assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), built.html, 'Published page must rebuild exactly: ' + file);
  }
  assert.equal(built.summary.glyphs.count, 167);
  assert.equal(built.summary.startupAssetRequestsRemoved, 8);
  assert.equal(built.summary.gzipBytes.singlePage > 0, true);
  assert.equal(built.summary.scripts.length, 7);
  const sourceScriptOrder = [...fs.readFileSync(path.join(root, 'game-source.html'), 'utf8')
    .matchAll(/<script\b[^>]*\bsrc=["']([^"'?]+)(?:\?[^"']*)?["'][^>]*>/g)].map(match => match[1]);
  assert.deepEqual(built.summary.scripts, sourceScriptOrder);
  console.log('Page build: reproducible identical HTML, seven inline modules, CSS, and 167 unchanged glyphs passed.');
} else console.log('Page build unit checks: order, closing-tag safety, external resource rejection, and geometry-change detection passed.');
