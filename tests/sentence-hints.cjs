'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const hints = require('../sentence-hints.js');
const root = path.join(__dirname, '..');

const targets = fs.readFileSync(path.join(root, 'data/grade3-targets.tsv'), 'utf8')
  .trim().split(/\r?\n/).map(line => {
    const [char, pinyin, word] = line.split('\t');
    return { char, pinyin, word };
  });
assert.equal(targets.length, 92, 'Review coverage when the selected curriculum changes');
for (const item of targets) {
  const frozen = Object.freeze({ ...item });
  const before = JSON.stringify(frozen);
  const sentence = hints.get(frozen);
  assert.equal(typeof sentence, 'string', item.word + ' needs a reviewed sentence');
  assert.ok(sentence.includes(item.word), item.word + ': sentence must say the exact word');
  assert.ok(Array.from(sentence).length >= 8 && Array.from(sentence).length <= 36,
    item.word + ': sentence should stay short enough for a child to remember');
  assert.ok(/[。！？]$/.test(sentence), item.word + ': sentence should be complete');
  assert.equal(hints.get(frozen), sentence, 'Lookup must be repeatable');
  assert.equal(JSON.stringify(frozen), before, 'Lookup must not change learning data');
  assert.equal(hints.get({ char: item.char, pinyin: item.pinyin, word: '' }), sentence,
    item.word + ': a bare character can use this reviewed default and reading');
}

// Saved defaults from the earlier 26-target bank remain available, including the
// second characters of the same word and the earlier reading 便 biàn.
const earlier = [
  ['宽', 'kuān', '宽阔'], ['阔', 'kuò', '宽阔'], ['横', 'héng', '横卧'], ['卧', 'wò', '横卧'],
  ['隐', 'yǐn', '若隐若现'], ['鼎', 'dǐng', '人声鼎沸'], ['昂', 'áng', '昂首'],
  ['东', 'dōng', '向东望'], ['据', 'jù', '据说'], ['霎', 'shà', '霎时'],
  ['渐', 'jiàn', '逐渐'], ['裂', 'liè', '山崩地裂'], ['随', 'suí', '随便'], ['便', 'biàn', '随便'],
  ['薄', 'bó', '薄雾'], ['嘴', 'zuǐ', '嘴巴'], ['藏', 'cáng', '躲藏'], ['熟', 'shú', '成熟'],
  ['蝴', 'hú', '蝴蝶'], ['器', 'qì', '机器'], ['燃', 'rán', '燃烧'], ['澡', 'zǎo', '洗澡'],
  ['慧', 'huì', '智慧'], ['融', 'róng', '融化'], ['摔', 'shuāi', '摔倒'], ['警', 'jǐng', '警察'],
];
for (const [char, pinyin, word] of earlier) {
  const sentence = hints.get({ char, pinyin, word });
  assert.ok(sentence && sentence.includes(word), 'Saved word has no sentence: ' + word);
  assert.equal(hints.get({ char, pinyin }), sentence, 'Saved default reading mismatch: ' + word);
}

// Context must be tied to the complete word, even when the target or sound is
// the same. Do not silently reuse the textbook word for an unknown parent word.
for (const [char, word] of [['园', '花园'], ['元', '公元'], ['威', '威风'],
  ['迹', '奇迹'], ['救', '求救'], ['弟', '师弟']]) {
  const sentence = hints.get({ char, word });
  assert.ok(sentence && sentence.includes(word), 'Parent example has no sentence: ' + word);
}
assert.notEqual(hints.get({ char: '园', word: '公园' }), hints.get({ char: '园', word: '花园' }));
assert.notEqual(hints.get({ char: '园', word: '公园' }), hints.get({ char: '元', word: '公元' }));
assert.notEqual(hints.get({ char: '微', word: '微风' }), hints.get({ char: '威', word: '威风' }));
assert.equal(hints.get({ char: '秘', word: '秘密基地' }), null);
assert.equal(hints.get({ char: '园', word: '园艺' }), null);
assert.equal(hints.get({ char: '明', word: '小明' }), null, 'Do not invent hints for people');
assert.equal(hints.get({ char: '州', word: '杭州' }), null, 'Do not invent hints for places');
assert.equal(hints.get({ char: '园', word: '公元' }), null, 'A contradictory target cannot use a word');
assert.equal(hints.get({ char: '长', pinyin: 'zhǎng' }), null, 'Do not choose a different reading');
assert.equal(hints.get({ char: '便' }), null, 'Two bare-character defaults need a reading');
assert.equal(hints.get({ char: '救', word: '' }), null, 'Extra words are not unreviewed character defaults');

// Parent-supplied sentences take precedence; whitespace and non-text values do
// not overwrite a reviewed sentence. No names or vocabulary are generated.
const parentItem = Object.freeze({ char: '州', word: '杭州', sentence: '  姑姑住在杭州，我们暑假去看她。  ' });
assert.equal(hints.get(parentItem), '姑姑住在杭州，我们暑假去看她。');
assert.equal(hints.get({ char: '园', word: '公园', sentence: '周末，我们去公园看花。' }), '周末，我们去公园看花。');
assert.equal(hints.get({ char: '园', word: '公园', sentence: '  ' }), hints.get({ word: '公园' }));
assert.equal(hints.get({ char: '园', word: '公园', sentence: 123 }), hints.get({ word: '公园' }));
assert.equal(hints.get({ char: '园', word: '公_' }), hints.get({ char: '园', word: '公园' }));
assert.equal(hints.get({ char: '轻', word: '_又_' }), null);
for (const item of [undefined, null, '', 7, {}, { word: 7 }, { word: '__proto__' }, { word: 'constructor' }]) {
  assert.equal(hints.get(item), null);
}

// A browser can load and call the module with no document, speech, or storage
// globals at all. The only browser export is a pure getter returning audio text;
// showing a button and speaking the result belong to the caller.
const browser = { window: {} };
vm.createContext(browser);
vm.runInContext(fs.readFileSync(path.join(root, 'sentence-hints.js'), 'utf8'), browser);
assert.equal(typeof browser.window.HanziSentenceHints.get, 'function');
assert.equal(browser.window.HanziSentenceHints.get({ char: '园', word: '公园' }), '我们去公园放风筝。');
assert.deepEqual(Object.keys(browser.window.HanziSentenceHints), ['get']);
assert.equal(Object.isFrozen(hints), true);

console.log('Sentence hints: 92 textbook targets, 26 earlier targets, exact-word/custom/default fallback, and browser export passed.');
