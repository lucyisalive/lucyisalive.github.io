'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { inlinePage, buildPage, verifyGlyphGeometry, assertNoStartupLinks,
  SCRIPT_FILES, CSS_FILE, CSS_FILES, OUTPUT_FILES } = require('../tools/build-page.cjs');

const assets = Object.fromEntries(SCRIPT_FILES.map(file => [file, 'window.loaded.push(' + JSON.stringify(file) + ');']));
assert.equal(CSS_FILE, 'game-feedback.css', 'Keep the existing singular CSS export compatible');
assert.deepEqual(CSS_FILES, [CSS_FILE, 'mountain-journey.css']);
for (const file of CSS_FILES) assets[file] = '.sample { color: red; }';
// Include closing tags inside JS and CSS strings, where packaging must escape
// the HTML terminator without changing the string value used by the program.
assets['sentence-hints.js'] += '\nwindow.example = "</script><script>notExecutable()</script>";';
assets['sentence-hints.js'] += '\nwindow.linkExample = \'<link rel="stylesheet" href="game-feedback.css">\';';
for (const file of CSS_FILES) assets[file] += '\n.sample::after { content: "</style>"; }';
const styleLinks = CSS_FILES.map(file => '<link rel="stylesheet" href="' + file + '?v=123">').join('');
const source = '<!DOCTYPE html>\n<html><head>' + styleLinks + '</head><body>\n' +
  SCRIPT_FILES.map((file, i) => '<script src=' + (i % 2 ? "'" + file + "?v=123'" : '"' + file + '"') + '></script>').join('\n') +
  '\n<script>window.loaded.push("game");</script></body></html>';
const compile = (html = source, files = assets) => inlinePage(html, file => {
  if (!Object.hasOwn(files, file)) throw new Error('Missing asset: ' + file);
  return files[file];
});
const compiled = compile();
assert.equal(compile().html, compiled.html, 'Build output must be deterministic');
assert.equal(compiled.scripts.length, SCRIPT_FILES.length);
assert.deepEqual(compiled.styles, CSS_FILES);
assert.ok(compiled.html.includes('game-source.html'), 'Generated file must explain where to edit');
assert.equal([...compiled.html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].length, SCRIPT_FILES.length + 1,
  'Data strings must not create executable tags');
assert.equal((compiled.html.match(/<style\b/g) || []).length, CSS_FILES.length, 'CSS strings must not terminate a style element');
assert.ok(compiled.html.includes('<script data-source="glyph-catalog.js">'));
assert.ok(compiled.html.includes('<style data-source="game-feedback.css">'));
assert.ok(compiled.html.includes('<script data-source="mountain-journey.js">'));
assert.ok(compiled.html.includes('<style data-source="mountain-journey.css">'));
assert.equal(/<script\b[^>]*\bsrc\s*=/i.test(compiled.html), false, 'All startup JS must be inline');
assertNoStartupLinks(compiled.html);
const context = vm.createContext({ window: { loaded: [] } });
const scripts = [...compiled.html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
for (const script of scripts) vm.runInContext(script[1], context);
assert.deepEqual(Array.from(context.window.loaded), SCRIPT_FILES.concat('game'), 'Source script order must be retained');
assert.equal(context.window.example, '</script><script>notExecutable()</script>');
assert.equal(context.window.linkExample, '<link rel="stylesheet" href="game-feedback.css">');

// Source order and extra inline blocks must remain intact. Neither the large
// glyph bundles nor the optional pinyin table belong in startup markup anymore.
const smallFiles = SCRIPT_FILES.slice(0, 3), remaining = SCRIPT_FILES.slice(3);
const reordered = '<!DOCTYPE html><html><head>' + styleLinks + '</head><body>' +
  smallFiles.map(file => '<script src="' + file + '"></script>').join('') +
  '<script>window.loaded.push("interactive");</script>' +
  remaining.map(file => '<script src="' + file + '"></script>').join('') +
  '<script>window.loaded.push("footer");</script></body></html>';
const streaming = compile(reordered);
const streamingContext = vm.createContext({ window: { loaded: [] } });
for (const script of streaming.html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
  vm.runInContext(script[1], streamingContext);
}
assert.deepEqual(Array.from(streamingContext.window.loaded),
  smallFiles.concat('interactive', remaining, 'footer'));

for (const extra of [
  '<script src="https://example.com/game.js"></script>',
  '<script src="//example.com/game.js"></script>',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="stylesheet" href="https://example.com/font.css">',
  '<img src="https://example.com/a.png">',
]) assert.throws(() => compile(source.replace('</head>', extra + '</head>')), /local|External/);
assert.throws(() => compile(source.replace('curriculum-data.js', '../curriculum-data.js')), /Invalid local/);
assert.throws(() => compile(source.replace('curriculum-data.js', 'unknown.js')), /Unexpected/);
assert.throws(() => compile(source.replace('src="curriculum-data.js"', 'async src="curriculum-data.js"')), /ordered classic/);
assert.throws(() => compile(source.replace('</body>', '<script src="curriculum-data.js"></script></body>')), /Duplicate/);
assert.throws(() => compile(source.replace(/<script src="curriculum-data.js"><\/script>/, '')), /startup scripts exactly once/);
for (const bulk of ['hanzi-data.js', 'curriculum-hanzi-data.js', 'pinyin-data.js']) {
  assert.throws(() => compile(source.replace('</body>', '<script src="' + bulk + '"></script></body>')), /Unexpected/);
}
for (const file of CSS_FILES) {
  assert.throws(() => compile(source.replace('<link rel="stylesheet" href="' + file + '?v=123">', '')), /exactly once/);
  assert.throws(() => compile(source.replace('</head>', '<link rel="stylesheet" href="' + file + '"></head>')), /Duplicate/);
  assert.throws(() => compile(source, { ...assets, [file]: '@import "extra.css";' }), /@import/);
  assert.throws(() => compile(source, { ...assets, [file]: 'p { background: url(https://example.com/a.png); }' }), /external CSS/);
}
assert.throws(() => compile(source.replace('mountain-journey.css', '../mountain-journey.css')), /Invalid local/);
assert.throws(() => compile(source.replace('mountain-journey.css', 'unknown.css')), /Unexpected/);
assert.throws(() => compile(source.replace(/<script src=["']mountain-journey\.js(?:\?[^"']*)?["']><\/script>/, '')), /startup scripts exactly once/);
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
  assert.equal(built.summary.startupAssetRequestsRemoved, SCRIPT_FILES.length + CSS_FILES.length);
  assert.equal(built.summary.gzipBytes.singlePage > 0, true);
  assert.equal(built.summary.scripts.length, SCRIPT_FILES.length);
  const sourceScriptOrder = [...fs.readFileSync(path.join(root, 'game-source.html'), 'utf8')
    .matchAll(/<script\b[^>]*\bsrc=["']([^"'?]+)(?:\?[^"']*)?["'][^>]*>/g)].map(match => match[1]);
  assert.deepEqual(built.summary.scripts, sourceScriptOrder);
  const sourceStyleOrder = [...fs.readFileSync(path.join(root, 'game-source.html'), 'utf8')
    .matchAll(/<link\b[^>]*\bhref=["']([^"'?]+\.css)(?:\?[^"']*)?["'][^>]*>/g)].map(match => match[1]);
  assert.deepEqual(built.summary.styles, sourceStyleOrder);
  assert.equal(built.summary.styles.length, CSS_FILES.length);
  // Images stay separate from the small startup page. The browser fixture does
  // not implement a CSS image loader, so verify these real deployment files too.
  const mountainCss = fs.readFileSync(path.join(root, 'mountain-journey.css'), 'utf8');
  const images = [...mountainCss.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)].map(match => match[1]);
  assert.deepEqual(new Set(images), new Set(['assets/mountain-journey/forest-trail.webp',
    'assets/mountain-journey/gate-frame.webp', 'assets/mountain-journey/gate-doors.webp']));
  for (const image of images) {
    const url = new URL(image, 'https://lucyisalive.github.io/');
    assert.equal(url.origin, 'https://lucyisalive.github.io', 'Scenery must stay on the game origin');
    const file = fs.readFileSync(path.join(root, image));
    assert.ok(file.length >= 12, 'Image must exist and be nonempty: ' + image);
    assert.equal(file.subarray(0, 4).toString('ascii'), 'RIFF', 'Real WebP header: ' + image);
    assert.equal(file.subarray(8, 12).toString('ascii'), 'WEBP', 'Real WebP format: ' + image);
  }
  console.log('Page build: reproducible identical HTML, small inline modules, CSS, and 167 exact on-demand glyphs passed.');
} else console.log('Page build unit checks: order, closing-tag safety, external resource rejection, and geometry-change detection passed.');
