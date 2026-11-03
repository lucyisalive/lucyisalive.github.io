'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const timing = require('../learning-timing.js');
const original = [5, 3, 1, 0];

// Existing short-character teaching keeps its exact four stages.
for (let count = 1; count <= 6; count++) assert.deepEqual(timing.steps(count), original);
for (const [count, expected] of [
  [7, [5, 3, 1, 0]], [8, [6, 4, 1, 0]], [10, [7, 4, 1, 0]],
  [14, [8, 5, 2, 0]], [16, [9, 5, 2, 0]], [19, [10, 6, 2, 0]],
  [22, [11, 7, 2, 0]], [23, [12, 7, 2, 0]], [100, [12, 7, 2, 0]],
]) assert.deepEqual(timing.steps(count), expected, 'Unexpected presentation schedule at ' + count + ' strokes');

// More strokes can never shorten the first look. Rounding still yields a
// bounded, decreasing sequence ending with a completely blind fourth stage.
let previousFirst = 0;
for (let count = 1; count <= 1000; count++) {
  const schedule = timing.steps(count);
  assert.equal(schedule.length, 4);
  assert.ok(schedule.every(Number.isInteger));
  assert.ok(schedule[0] >= 5 && schedule[0] <= 12);
  assert.ok(schedule[0] >= previousFirst, 'A more complex character received less time');
  assert.ok(schedule[0] > schedule[1] && schedule[1] > schedule[2] && schedule[2] > 0);
  assert.equal(schedule[3], 0);
  previousFirst = schedule[0];
}
assert.deepEqual(timing.steps(Number.MAX_SAFE_INTEGER), [12, 7, 2, 0]);

// Missing, malformed, fractional, or unsafe values must preserve the former
// schedule rather than inventing complexity from string coercion or bad data.
for (const count of [undefined, null, 0, -1, -20, 8.5, NaN, Infinity, -Infinity,
  '19', '', true, false, [], {}, new Number(19), Number.MAX_SAFE_INTEGER + 1]) {
  assert.deepEqual(timing.steps(count), original);
}
const changed = timing.steps(19);
changed[0] = 99;
changed.push(99);
assert.deepEqual(timing.steps(19), [10, 6, 2, 0], 'A caller must not change later schedules');
const changedFallback = timing.steps();
changedFallback[0] = 99;
assert.deepEqual(timing.steps(), original, 'Fallback arrays must also be fresh');
assert.notEqual(timing.steps(6), timing.steps(6));

// The same policy loads in a browser with no document, timers, fetch, storage,
// or glyph libraries. Reading the count requires no new asset download.
const browser = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'learning-timing.js'), 'utf8'), browser);
assert.deepEqual(Object.keys(browser.window.HanziLearningTiming), ['steps']);
assert.deepEqual(Array.from(browser.window.HanziLearningTiming.steps(19)), [10, 6, 2, 0]);
assert.equal(Object.isFrozen(timing), true);

console.log('Learning timing: original simple stages, bounded monotonic complexity, blind final stage, invalid inputs, fresh arrays, and browser export passed.');
