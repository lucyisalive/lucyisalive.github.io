'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createGlyphFiles, writeGlyphFiles, canonical, componentDependencies } = require('../tools/build-glyph-files.cjs');
const root = path.join(__dirname, '..');
const built = createGlyphFiles(root);
const pinyinSource = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(root, 'pinyin-data.js'), 'utf8'), pinyinSource);
assert.equal(built.catalog.glyphCount, 167);
assert.equal(Object.keys(built.catalog.glyphs).length, 167);
const reconstructed = {};
for (const [char, entry] of Object.entries(built.catalog.glyphs)) {
  const file = built.manifest.glyphs[char].file;
  const content = built.files.get(file);
  assert.equal(crypto.createHash('sha256').update(content).digest('hex'), built.manifest.glyphs[char].sha256);
  reconstructed[char] = JSON.parse(content);
  assert.deepEqual(reconstructed[char], built.glyphs[char], 'Frozen geometry changed: ' + char);
  assert.equal(new URL(entry.url, 'https://example.test/').pathname, '/glyphs/' + encodeURIComponent(char) + '.json');
  assert.equal(new URL(entry.url, 'https://example.test/').searchParams.get('v'), built.catalog.version);
  assert.equal(Object.hasOwn(entry, 'sha256'), false, 'Per-file hashes stay in the offline manifest');
  assert.equal(entry.pinyin, pinyinSource.window.PINYIN_MAP[char] || '', 'All original readings must be retained: ' + char);
  assert.ok(entry.deps.every(part => Object.hasOwn(built.glyphs, part)), 'New missing-part dependency: ' + char);
}
assert.equal(canonical(reconstructed), canonical(built.glyphs));
assert.deepEqual(createGlyphFiles(root).files, built.files, 'Build must be reproducible');
const browser = vm.createContext({ window: {} });
vm.runInContext(built.files.get('glyph-catalog.js'), browser);
assert.equal(browser.window.HANZI_GLYPH_CATALOG.version, built.summary.geometrySha256);
assert.equal(browser.window.HANZI_GLYPH_CATALOG.glyphCount, 167);
for (const char of ['便', '长', '薄', '藏']) {
  assert.equal(browser.window.HANZI_GLYPH_CATALOG.glyphs[char].pinyin,
    pinyinSource.window.PINYIN_MAP[char], 'Do not replace parent-word readings with the textbook reading: ' + char);
}
assert.ok(built.manifest.sources.some(source => source.file === 'pinyin-data.js'), 'Record the original pinyin source hash');

// The original grader skipped components if even one original part was absent.
// A split-data loader must preserve that boundary instead of completing it.
const withoutWang = { ...built.glyphs };
delete withoutWang['王'];
const removed = componentDependencies(root, withoutWang);
assert.equal(removed.dependencies['理'], undefined);
assert.deepEqual(removed.excluded['理'].missing, ['王']);
assert.deepEqual(removed.dependencies['注'], ['氵', '主']);

fs.mkdirSync(path.join(root, 'work'), { recursive: true });
const temporary = fs.mkdtempSync(path.join(root, 'work', 'glyph-files-test-'));
try {
  writeGlyphFiles(built, temporary);
  writeGlyphFiles(built, temporary, true);
  const first = Object.values(built.manifest.glyphs)[0].file;
  fs.writeFileSync(path.join(temporary, first), '{}');
  assert.throws(() => writeGlyphFiles(built, temporary, true), /asset differs/);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

if (!process.argv.includes('--generated-optional')) writeGlyphFiles(built, root, true);
console.log('Glyph files: all 167 exact objects, file hashes, encoded URLs, original component boundaries, and rebuild checks passed.');
