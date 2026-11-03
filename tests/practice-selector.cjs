'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const selector = require('../practice-selector.js');

function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function level(item) {
  return item.strokeCount <= 6 ? 'simple' : item.strokeCount <= 12 ? 'medium' : 'complex';
}
const chars = [...'一二三四五六七八九十百千木禾本未末米花草苗树村林森江河湖海雨雪雷电风云山石土田日月星光明暗'];
const richPool = [];
for (const strokeCount of [5, 10, 16]) for (const structure of ['独体', '左右', '上下']) {
  for (let i = 0; i < 3; i++) richPool.push({ char: chars[richPool.length], strokeCount, structure });
}
function run(seed, n, pool = richPool) {
  const session = selector.createSession(seeded(seed));
  const sequence = Array.from({ length: n }, () => selector.choose(pool, session));
  return { session, sequence };
}
function histogram(items, key) {
  const out = {};
  for (const item of items) out[key(item)] = (out[key(item)] || 0) + 1;
  return out;
}

// Reproducibility is an observable sequence, not a specific implementation order.
const sameA = run(3107, 81), sameB = run(3107, 81), different = run(9581, 81);
assert.deepEqual(sameA.sequence, sameB.sequence);
assert.notDeepEqual(sameA.sequence, different.sequence);

// A broad available pool must meet the actual five-question balance across seeds.
const patterns = new Set();
for (let seed = 1; seed <= 200; seed++) {
  const { sequence } = run(seed, 5);
  assert.equal(new Set(sequence.map(item => item.char)).size, 5);
  assert.deepEqual(histogram(sequence, level), { simple: 2, medium: 2, complex: 1 });
  assert.ok(new Set(sequence.map(item => item.structure)).size >= 3, 'Five slots should mix structures');
  patterns.add(sequence.map(level).join(','));
}
assert.ok(patterns.size > 1, 'Difficulty order should also vary');

// Fairness comes before category preference: every supplied character gets turns.
const long = run(42, richPool.length * 8);
const observed = new Map();
for (const item of long.sequence) {
  observed.set(item.char, (observed.get(item.char) || 0) + 1);
  const counts = richPool.map(candidate => observed.get(candidate.char) || 0);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, 'No character should be starved');
}
assert.equal(observed.size, richPool.length);
assert.ok([...observed.values()].every(n => n === 8));
assert.deepEqual(Object.fromEntries(observed), { ...long.session.byChar });

const allStructures = ['独体', '左右', '上下', '半包围', '全包围', '左中右', '上中下', '品字'];
const allKinds = allStructures.flatMap((structure, i) => [5, 10, 16].map((strokeCount, j) => ({
  char: chars[i * 3 + j], structure, strokeCount,
})));
const allKindRun = run(1701, allKinds.length * 3, allKinds);
assert.deepEqual(new Set(allKindRun.sequence.map(item => item.structure)), new Set(allStructures));
assert.deepEqual(new Set(allKindRun.sequence.map(level)), new Set(['simple', 'medium', 'complex']));
assert.ok(Object.values(allKindRun.session.byChar).every(n => n === 3));

// Structure opportunities may exist in only one difficulty band.
const sparseStructures = [
  { char: '一', strokeCount: 1, structure: '独体' },
  { char: '句', strokeCount: 5, structure: '半包围' },
  ...[6, 7, 10, 12, 13, 16].map((n, i) => ({ char: chars[i + 10], strokeCount: n, structure: '左右' })),
];
for (let seed = 1; seed <= 50; seed++) {
  const { sequence } = run(seed, 5, sparseStructures);
  assert.deepEqual(histogram(sequence, level), { simple: 2, medium: 2, complex: 1 });
  assert.ok(new Set(sequence.map(item => item.structure)).size >= 3);
}

// A priority character affects both novelty and the remaining five-slot quota.
const parentSession = selector.createSession(seeded(5));
selector.record(parentSession, richPool[0]);
const following = Array.from({ length: 4 }, () => selector.choose(richPool, parentSession));
assert.ok(following.every(item => item.char !== richPool[0].char));
assert.deepEqual(histogram([richPool[0], ...following], level), { simple: 2, medium: 2, complex: 1 });
assert.equal(parentSession.byStructure['独体'], [richPool[0], ...following].filter(item => item.structure === '独体').length);

// External priority can make a quota impossible; it must remain an override.
const forced = selector.createSession(seeded(9));
for (let i = 0; i < 7; i++) selector.record(forced, richPool[0]);
assert.equal(forced.total, 7);
assert.equal(forced.byChar[richPool[0].char], 7);
assert.equal(forced.block.total, 2);
assert.ok(selector.choose(richPool, forced));
assert.equal(forced.total, 8);

// Duplicate word-list rows cannot weight a character more heavily or duplicate it
// before other characters. A returned item must be one of the original objects.
const duplicates = [...Array(50).fill(richPool[0]), ...richPool.slice(1, 4)];
const duplicateResult = run(7, 12, duplicates);
for (let offset = 0; offset < 12; offset += 4) {
  assert.equal(new Set(duplicateResult.sequence.slice(offset, offset + 4).map(item => item.char)).size, 4);
}
assert.ok(duplicateResult.sequence.every(item => duplicates.includes(item)));

// Small/missing-category pools degrade within the actual pool, never fabricate
// unavailable questions, and never mutate the caller's objects or array order.
const littlePool = [{ char: '土', strokeCount: 3, structure: '独体' }, { char: '木', strokeCount: 4, structure: '独体' }];
const before = JSON.stringify(littlePool), little = run(99, 25, littlePool);
assert.ok(little.sequence.every(item => littlePool.includes(item)));
assert.equal(little.sequence[0] === little.sequence[1], false);
assert.equal(JSON.stringify(littlePool), before);
assert.equal(run(10, 10, [littlePool[0]]).sequence.every(item => item === littlePool[0]), true);

const unknown = [{ char: '甲' }, { char: '乙', strokeCount: 0 }, { char: '丙', strokeCount: NaN }, { char: '丁', strokeCount: Infinity }];
const noMetadata = run(8, 20, unknown);
assert.equal(new Set(noMetadata.sequence.slice(0, 4)).size, 4);
assert.equal(noMetadata.session.byDifficulty.unknown, 20);

// Threshold boundaries and an empty/invalid candidate pool have explicit behavior.
const boundaries = selector.createSession(seeded(1));
[6, 7, 12, 13].forEach((strokeCount, i) => selector.record(boundaries, { char: chars[i], strokeCount }));
assert.deepEqual(boundaries.byDifficulty, { simple: 1, medium: 2, complex: 1, unknown: 0 });
const empty = selector.createSession(seeded(3)), emptyBefore = JSON.stringify(empty);
assert.equal(selector.choose([], empty), null);
assert.equal(selector.choose(null, empty), null);
assert.equal(selector.choose([null, {}, { char: '' }], empty), null);
assert.equal(selector.record(empty, null), null);
assert.equal(JSON.stringify(empty), emptyBefore);
for (const random of [() => 0, () => 1, () => NaN]) {
  const session = selector.createSession(random);
  assert.ok(richPool.includes(selector.choose(richPool, session)));
}

// The same source loads in the browser without CommonJS or access to a DOM.
const browser = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../practice-selector.js'), 'utf8'), browser);
assert.equal(typeof browser.window.HanziPracticeSelector.choose, 'function');
const browserSession = browser.window.HanziPracticeSelector.createSession(seeded(2));
assert.ok(richPool.includes(browser.window.HanziPracticeSelector.choose(richPool, browserSession)));

console.log('practice-selector: deterministic balance, fairness, fallback, and browser tests passed');
