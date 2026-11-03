'use strict';

// Exercise the saved page's actual bank, migration, selector wiring, and hint.
// The test does not maintain a second copy of any production function.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function slice(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'Production source boundary missing: ' + start);
  return html.slice(a, b);
}
function seeded(seed) {
  let n = seed >>> 0;
  return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const fixedTime = new Date(2026, 10, 2, 12).getTime();
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedTime])); }
  static now() { return fixedTime; }
}
const saved = new Map();
const context = vm.createContext({
  window: {}, Date: FixedDate,
  localStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
});
for (const file of ['hanzi-data.js', 'curriculum-hanzi-data.js', 'curriculum-data.js', 'practice-selector.js']) {
  vm.runInContext(read(file), context, { filename: file });
}
vm.runInContext(slice('function todayStr(){', '// ---------- default character bank ----------'), context);
vm.runInContext(slice('function newBankItem(', '// ---------- freehand drawing surface'), context);
vm.runInContext(slice('function parentPriorityEntries(){', 'function renderProgressPath(){'), context);
vm.runInContext(slice('function hintFor(item){', '// ---------- main flow ----------'), context);
const run = code => vm.runInContext(code, context);
const plain = code => clone(run(code));
const initialState = plain('state');
const today = run('todayStr()');
function reset(seed = 1, state = initialState, pending = []) {
  context.testState = clone(state);
  context.testRandom = seeded(seed);
  context.testPending = pending;
  run(`state=testState; passedCount=0; pendingRetests=testPending;
    priorityConsumedToday=new Set();
    selectionSession=window.HanziPracticeSelector.createSession(testRandom);`);
}
const pick = () => run('pickNextChar()');
const picks = n => Array.from({ length: n }, pick);
function difficultyCounts(items) {
  const out = { simple: 0, medium: 0, complex: 0 };
  for (const item of items) out[item.strokeCount <= 6 ? 'simple' : item.strokeCount <= 12 ? 'medium' : 'complex']++;
  return out;
}

// Every word maps to exactly one distinct target with usable offline geometry.
const curriculum = plain('window.HANZI_CURRICULUM');
const source = JSON.parse(read('data/grade3-word-sources.json'));
assert.equal(curriculum.entries.length, 92);
assert.equal(new Set(curriculum.entries.map(item => item.char)).size, 92);
assert.equal(new Set(curriculum.entries.map(item => item.word)).size, 92);
assert.equal(curriculum.sourceWordCount, source.words.length);
assert.deepEqual(new Set(curriculum.entries.map(item => item.structure)),
  new Set(['独体', '左右', '上下', '半包围', '全包围', '左中右', '上中下']));
assert.equal(run('BANK_VERSION'), 5);
assert.equal(initialState.bank.length, 92);
for (const item of curriculum.entries) {
  assert.equal([...item.char].length, 1, 'A one-square question must target one character');
  assert.ok(item.word.includes(item.char), 'Target is not in its word: ' + item.word);
  assert.ok(item.pinyin && typeof item.pinyin === 'string');
  assert.ok(Number.isInteger(item.strokeCount) && item.strokeCount > 0);
  const words = source.words.filter(word => word.word === item.word);
  assert.equal(words.length, 1, 'Word must occur once in the verified source: ' + item.word);
  assert.equal(item.unit, words[0].unit);
  if (item.lesson !== null) assert.equal(item.lesson, words[0].lesson);
  context.testChar = item.char;
  const glyph = plain('window.HANZI_LOCAL_DATA[testChar]');
  assert.equal(glyph.medians.length, item.strokeCount, 'Median count: ' + item.char);
  assert.equal(glyph.strokes.length, item.strokeCount, 'Outline count: ' + item.char);
  assert.ok(glyph.medians.every(stroke => stroke.length && stroke.every(point =>
    point.length === 2 && point.every(Number.isFinite))), 'Invalid geometry: ' + item.char);
  const bankItem = initialState.bank.find(bank => bank.char === item.char);
  for (const key of ['char', 'word', 'pinyin', 'structure', 'strokeCount', 'unit', 'lesson']) {
    assert.deepEqual(bankItem[key], item[key], 'Default metadata: ' + item.char + '/' + key);
  }
  assert.equal(bankItem.curriculumId, curriculum.id);
}
const loaderOrder = ['hanzi-data.js', 'curriculum-hanzi-data.js', 'curriculum-data.js', 'practice-selector.js'];
assert.ok(loaderOrder.every(file => html.indexOf('src="' + file) >= 0), 'All dependency scripts must be loaded');
for (let i = 1; i < loaderOrder.length; i++) {
  assert.ok(html.indexOf('src="' + loaderOrder[i - 1]) < html.indexOf('src="' + loaderOrder[i]), 'Dependency load order');
}

// All valid old learning fields, arbitrary parent metadata, and runtime settings
// survive the bank change. Fresh textbook metadata replaces obsolete categories.
const progress = {
  box: 4, interval: 14, lastSeen: '2026-10-01',
  history: [{ day: '2026-10-01', outcome: 'first-try', attempts: 1 }],
  passedDays: ['2026-09-01', '2026-10-01'],
  stuck: true, stuckDay: today, wrongToday: 2, wrongDay: today,
  customMemo: { explanation: '保留家长备注', tags: ['细心'] },
};
const common = { ...initialState.bank[0], ...clone(progress), pinyin: 'old', word: '旧词',
  structure: '旧分类', strokeCount: 999, curriculumId: 'old', unit: -1, lesson: -1, retired: true };
const parentCommon = { ...initialState.bank[1], ...clone(progress), fromParent: true,
  pinyin: 'yǐ', word: '甲乙', alts: ['yǐ'], parentAddedAt: '2026-08-01', retired: true };
const parentOutside = { ...clone(progress), char: '龙', pinyin: 'lóng', word: '飞龙', fromParent: true,
  extraParentField: ['完整保留'], retired: false };
const oldEight = [...'慧警藏器燃澡霎薄'].map((char, i) => ({
  char, pinyin: 'old', word: '旧字', box: i % 6, interval: 7, lastSeen: i ? '2026-10-01' : null,
  history: i ? [{ day: '2026-10-01', outcome: 'abandoned' }] : [], passedDays: [],
  wrongToday: i === 0 ? 1 : 0, wrongDay: today, priorNote: '不能丢' + i,
}));
const priorityQueue = [{ char: '龙', pinyin: 'lóng', word: '飞龙', alts: ['lóng'], custom: '保留队列' }];
const oldSave = { bank: [common, parentCommon, parentOutside, ...oldEight], bankVersion: 4,
  priorityQueue, dailyCount: 9, scenesUnlocked: 7, familyPreference: { voice: 'zh' } };
context.testSave = clone(oldSave);
const migrated = plain('migrateState(testSave)');
assert.equal(migrated.bankVersion, 5);
assert.equal(migrated.dailyCount, 9);
assert.equal(migrated.scenesUnlocked, 7);
assert.equal(migrated.priorityQueue.length, priorityQueue.length);
migrated.priorityQueue.forEach((entry, i) => {
  for (const key of Object.keys(priorityQueue[i])) assert.deepEqual(entry[key], priorityQueue[i][key]);
  assert.equal(entry.addedDay, today);
  assert.ok(entry.requestId, 'Legacy priority gets a persistent request identity');
});
assert.deepEqual(migrated.familyPreference, oldSave.familyPreference);
assert.equal(new Set(migrated.bank.map(item => item.char)).size, migrated.bank.length);
for (const old of [common, parentCommon, parentOutside]) {
  const item = migrated.bank.find(item => item.char === old.char);
  for (const key of Object.keys(progress)) assert.deepEqual(item[key], old[key], 'Lost learning field: ' + key);
  if (old.fromParent) {
    for (const key of Object.keys(old)) {
      if (['structure', 'strokeCount', 'curriculumId', 'unit', 'lesson', 'retired'].includes(key)) continue;
      assert.deepEqual(item[key], old[key], 'Lost parent field: ' + key);
    }
  }
}
for (const old of [common, parentCommon]) {
  const item = migrated.bank.find(item => item.char === old.char);
  const fresh = initialState.bank.find(item => item.char === old.char);
  assert.equal(item.retired, false);
  for (const key of ['structure', 'strokeCount', 'curriculumId', 'unit', 'lesson']) assert.deepEqual(item[key], fresh[key]);
  if (!old.fromParent) for (const key of ['word', 'pinyin']) assert.equal(item[key], fresh[key]);
}
for (const old of oldEight) {
  const item = migrated.bank.find(item => item.char === old.char);
  assert.ok(item.retired, 'Former complex-character test item should leave ordinary rotation: ' + old.char);
  for (const key of Object.keys(old)) assert.deepEqual(item[key], old[key]);
}
context.testSave = clone(migrated);
assert.ok(JSON.stringify(plain('migrateState(testSave)')) === JSON.stringify(migrated), 'Migration must be idempotent');

// Initial questions meet the actual integrated difficulty/structure mix and are
// reproducible without following the source array's first five items.
const sequences = new Set();
for (let seed = 1; seed <= 100; seed++) {
  reset(seed);
  const first = picks(5);
  assert.equal(new Set(first.map(item => item.char)).size, 5);
  assert.deepEqual(difficultyCounts(first), { simple: 2, medium: 2, complex: 1 });
  assert.ok(new Set(first.map(item => item.structure)).size >= 3);
  assert.ok(first.some(item => item.structure === '独体'));
  const sequence = first.map(item => item.char).join('');
  sequences.add(sequence);
  assert.notEqual(sequence, initialState.bank.slice(0, 5).map(item => item.char).join(''));
  reset(seed);
  assert.equal(picks(5).map(item => item.char).join(''), sequence);
}
assert.ok(sequences.size > 1);

// Normal selection respects mastery, today's parking, retirement, and pending
// retests whenever other eligible candidates exist.
const excludedState = clone(initialState);
excludedState.bank[0].passedDays = ['2026-10-01', '2026-10-02', '2026-10-03'];
excludedState.bank[1].stuck = true; excludedState.bank[1].stuckDay = today;
excludedState.bank[2].retired = true;
const pendingItem = excludedState.bank[3];
reset(51, excludedState, [{ item: pendingItem, fillersSeen: 0, round: 1 }]);
const excluded = new Set(excludedState.bank.slice(0, 4).map(item => item.char));
assert.ok(picks(20).every(item => !excluded.has(item.char)));

// A whole new textbook cannot bury real due reviews: current integration reserves
// slots zero and two. A not-yet-due weak item must not masquerade as a due review.
const reviewState = clone(initialState);
const dueChars = new Set(reviewState.bank.slice(0, 2).map(item => item.char));
reviewState.bank[0] = { ...reviewState.bank[0], lastSeen: '2026-10-01', interval: 7, box: 0 };
reviewState.bank[1] = { ...reviewState.bank[1], lastSeen: '2026-10-01', interval: 7, box: 1 };
reviewState.bank[2] = { ...reviewState.bank[2], lastSeen: today, interval: 7, box: 0 };
reset(2, reviewState);
const mixed = picks(5);
assert.ok(dueChars.has(mixed[0].char) && dueChars.has(mixed[2].char));
assert.equal(mixed.filter(item => dueChars.has(item.char)).length, 2);
assert.ok([1, 3, 4].every(i => mixed[i].lastSeen === null));
assert.ok(mixed.every(item => item.char !== reviewState.bank[2].char));

// Parent priority skips a blocked/pending first entry and honors an explicit
// mastered/retired target, without losing its word or counting it twice.
const parentState = clone(initialState);
parentState.bank[0].stuck = true; parentState.bank[0].stuckDay = today;
parentState.bank[2].retired = true;
parentState.bank[2].passedDays = ['2026-10-01', '2026-10-02', '2026-10-03'];
parentState.priorityQueue = parentState.bank.slice(0, 3).map(item => ({ char: item.char, pinyin: '指定拼音', word: '家长的' + item.char }));
reset(7, parentState, [{ item: parentState.bank[1], fillersSeen: 0, round: 1 }]);
const priority = pick();
assert.equal(priority.char, parentState.bank[2].char);
assert.equal(priority.pinyin, '指定拼音');
assert.equal(priority.word, '家长的' + priority.char);
assert.equal(priority.fromParent, true);
assert.equal(priority.retired, false);
assert.equal(run('selectionSession.total'), 1);
assert.equal(run('priorityConsumedToday.size'), 1);
assert.ok(saved.has(run('SAVE_KEY')));

const addedState = clone(initialState);
addedState.priorityQueue = [{ char: '龙', pinyin: 'lóng', word: '飞龙' }];
reset(3, addedState);
const added = pick();
assert.equal(added.char, '龙');
assert.equal(added.fromParent, true);
assert.equal(plain("state.bank.filter(item => item.char === '龙')").length, 1);

// Repeated targets and legacy placeholders cannot reveal the answer in the hint.
context.testHint = { char: '轻', pinyin: 'qīng', word: '轻轻' };
assert.equal(run('hintFor(testHint)'), 'qīngqīng');
context.testHint = { char: '轻', pinyin: 'qīng', word: '_又_' };
assert.equal(run('hintFor(testHint)'), 'qīng又qīng');
context.testHint = { char: '轻', pinyin: 'qīng', word: '' };
assert.equal(run('hintFor(testHint)'), 'qīng');

console.log('curriculum-integration: 92 data mappings, migration, 100 seeded rounds, exclusions, review priority, parent priority, and hints passed');
