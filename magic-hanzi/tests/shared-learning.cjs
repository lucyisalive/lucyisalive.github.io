'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { mergeLearning, learningRecord, storyRecord, assemble } = require('../shared-learning.js');

const d1 = '2026-11-13', d2 = '2026-11-14', d3 = '2026-11-15', d4 = '2026-11-16';
const event = (day, outcome = 'first-try') => ({ day, outcome });
const item = (char, fields = {}) => ({
  char, box: 1, interval: 0, lastSeen: null, history: [], passedDays: [], wrongToday: 0, ...fields,
});
const request = (char, requestId, addedDay, fields = {}) => ({
  char, requestId, addedDay, completedDay: null, ...fields,
});
const round = roundId => ({ version: 1, day: d4, roundId, passedCount: 5, completed: false, sceneAwarded: false });
const oldSave = {
  bank: [
    item('林', { lastSeen: d3, box: 3, interval: 7, wrongDay: d3, stuck: false,
      history: [event(d1), event(d1), event(d3, 'retest-pass')], passedDays: [d1, d3] }),
    item('山', { lastSeen: d4, box: 3, interval: 7, word: '山川', pinyin: 'shān', fromParent: true }),
    item('月', { lastSeen: d4, wrongDay: d4, wrongToday: 0, stuck: false, word: '月光', fromParent: true }),
    item('水', { lastSeen: d2, word: '流水', fromParent: true }),
    item('舟'),
  ],
  priorityQueue: [request('月', 'old-moon', d4), request('林', 'common', d3), request('水', 'old-water', d2)],
  bankVersion: 5, dailyCount: 9, scenesUnlocked: 8, sessionProgress: round('old-round'),
};
const newSave = {
  bank: [
    item('林', { lastSeen: d4, box: 4, interval: 14, wrongDay: d4, wrongToday: 2,
      history: [event(d1), event(d1), event(d1), event(d2, 'abandoned'), event(d2, 'first-try'), event(d3, 'retest-pass'), event(d4)],
      passedDays: [d3, d2, d4, d1], word: '森林', pinyin: 'lín', sentence: '森林里有高大的树。', fromParent: true }),
    item('山', { lastSeen: d4, box: 6, interval: 30, word: '爬山', history: [event(d4)], passedDays: [d4] }),
    item('月', { lastSeen: d4, wrongDay: d4, wrongToday: 3, stuck: true, stuckDay: d4, word: '月亮', fromParent: true }),
    item('水', { lastSeen: d3, word: '雨水', fromParent: true }),
    item('星', { history: [event(d4)], passedDays: [d4] }),
    item('雨'),
  ],
  priorityQueue: [request('星', 'new-star', d4), request('水', 'new-water', d3),
    request('月', 'new-moon', d4, { completedDay: d4 }), request('林', 'common', d3, { completedDay: d3, alts: ['lín'] })],
  bankVersion: 5, dailyCount: 10, scenesUnlocked: 2, sessionProgress: round('story-round'),
  herbalistStage: 'sea', coins: 15, inkLog: [{ rawS: 'synthetic private input' }],
};

const before = JSON.stringify([oldSave, newSave]);
const merged = mergeLearning(oldSave, newSave);
const byChar = new Map(merged.bank.map(entry => [entry.char, entry]));
assert.deepEqual([...byChar.keys()], ['林', '山', '月', '水', '舟', '星', '雨']);
assert.deepEqual(byChar.get('林').history, [event(d1), event(d1), event(d1), event(d2, 'abandoned'),
  event(d2, 'first-try'), event(d3, 'retest-pass'), event(d4)]);
assert.deepEqual(byChar.get('林').passedDays, [d1, d2, d3, d4]);
assert.equal(byChar.get('林').box, 4);
assert.equal(byChar.get('林').interval, 14);
assert.equal(byChar.get('林').wrongToday, 2);
assert.ok(!Object.hasOwn(byChar.get('林'), 'stuck'), 'A newer retry record clears the old stuck field');
assert.equal(byChar.get('林').word, '森林');
assert.equal(byChar.get('林').sentence, '森林里有高大的树。');
assert.equal(byChar.get('山').word, '山川');
assert.equal(byChar.get('山').box, 3, 'An ambiguous same-day schedule keeps the legacy state');
assert.equal(byChar.get('月').word, '月光');
assert.equal(byChar.get('月').wrongToday, 0, 'Keep the legacy same-day parent reset');
assert.equal(byChar.get('月').stuck, false);
assert.equal(byChar.get('水').word, '雨水', 'A newer parent request keeps the new word');
assert.deepEqual(merged.priorityQueue, [request('月', 'old-moon', d4), request('星', 'new-star', d4),
  request('林', 'common', d3, { completedDay: d3 }), request('水', 'new-water', d3)]);
assert.equal(merged.dailyCount, 9);
assert.equal(merged.scenesUnlocked, 8);
assert.deepEqual(merged.sessionProgress, round('old-round'));
assert.deepEqual(mergeLearning(merged, newSave), merged, 'Importing the same archive twice is idempotent');
assert.equal(JSON.stringify([oldSave, newSave]), before, 'Merging must leave both source saves intact');

const oldLegacyItem = item('分', { wrongDay: d2, word: '分别', pinyin: 'fēn', retired: false,
  structure: '上下', strokeCount: 4, curriculumId: 'synthetic', unit: 2, lesson: '第二课',
  history: [event(d1), { day: d2 }, event(d3, 'legacy-unknown'), event(d3, 'legacy-unknown')] });
const newLegacyItem = item('分', { wrongDay: d2, stuckDay: d3, stuck: true, wrongToday: 3,
  history: [event(d1), event(d2, null), event(d3, 'legacy-unknown'), event(d3, 'other-unknown')] });
const compatibility = mergeLearning({ ...oldSave, bank: [oldLegacyItem] }, { ...newSave, bank: [newLegacyItem] });
assert.deepEqual(compatibility.bank[0], { ...oldLegacyItem, stuckDay: d3, stuck: true, wrongToday: 3,
  history: [event(d1), { day: d2 }, event(d2, null), event(d3, 'legacy-unknown'),
    event(d3, 'legacy-unknown'), event(d3, 'other-unknown')] });

function queueOrder(oldQueue, newQueue) {
  return mergeLearning({ ...oldSave, priorityQueue: oldQueue }, { ...newSave, priorityQueue: newQueue })
    .priorityQueue.map(entry => entry.requestId);
}
assert.deepEqual(queueOrder([request('山', 'old-1', d4), request('舟', 'old-2', d4), request('林', 'old-3', d3)],
  [request('月', 'new-1', d4), request('星', 'new-2', d4), request('林', 'new-3', d4)]),
['old-1', 'old-2', 'new-1', 'new-2', 'new-3']);

const dirtyNewSave = {
  ...newSave,
  bank: [{ ...newSave.bank[0], rawS: 'synthetic', history: [{ ...event(d4), rawS: 'synthetic' }] }],
  priorityQueue: [{ ...newSave.priorityQueue[0], alts: ['xīng'], ink: 'synthetic' }],
};
const shared = learningRecord(dirtyNewSave, { ...oldSave, sessionProgress: { ...oldSave.sessionProgress, rawS: 'synthetic' } });
assert.deepEqual(Object.keys(shared), ['bank', 'bankVersion', 'priorityQueue', 'dailyCount', 'scenesUnlocked', 'sessionProgress']);
assert.equal(shared.scenesUnlocked, oldSave.scenesUnlocked);
assert.deepEqual(shared.sessionProgress, oldSave.sessionProgress);
assert.deepEqual(shared.bank[0].history, [event(d4)]);
assert.deepEqual(shared.priorityQueue[0].alts, ['xīng']);
assert.doesNotMatch(JSON.stringify(shared), /rawS|"ink"|"coins"|herbalistStage/);
shared.priorityQueue[0].alts.push('xìng');
assert.deepEqual(dirtyNewSave.priorityQueue[0].alts, ['xīng']);
assert.equal(learningRecord(newSave).scenesUnlocked, 0);
assert.ok(!Object.hasOwn(learningRecord(newSave), 'sessionProgress'));

const story = storyRecord(newSave);
assert.deepEqual(story, { herbalistStage: 'sea', scenesUnlocked: 2, sessionProgress: round('story-round') });
const runtime = assemble(merged, story);
assert.deepEqual(runtime.bank, merged.bank);
assert.deepEqual(runtime.priorityQueue, merged.priorityQueue);
assert.equal(runtime.herbalistStage, 'sea');
assert.equal(runtime.scenesUnlocked, 2);
assert.deepEqual(runtime.sessionProgress, round('story-round'));
const firstLaunch = assemble(oldSave);
assert.equal(firstLaunch.scenesUnlocked, 0);
assert.ok(!Object.hasOwn(firstLaunch, 'sessionProgress'), 'A legacy round must not appear in the new story');

const browser = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(require.resolve('../shared-learning.js'), 'utf8'), browser);
assert.equal(typeof browser.window.HanziSharedLearning.mergeLearning, 'function');
assert.equal(typeof browser.window.HanziSharedLearning.assemble, 'function');

console.log('Shared learning: dates, history multiplicity, parent priority, retry state, and story separation passed.');
