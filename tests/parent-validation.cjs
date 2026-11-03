'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const validation = require('../parent-validation.js');
const create = round => validation.create({ round, now: () => 1793700000000, random: () => .25 });
function record(session, id, verdict) {
  const step = session.current();
  return { id, sessionId: session.id, stepId: step.id, char: step.char,
    verdict: verdict || step.expected, timestamp: 1793700000010, graderVersion: 'test-version' };
}

// The adult sees exactly the agreed six instructions in each short round.
for (const [round, chars, faults] of [
  [1, ['燕','燕','类','类','逃','逃'], [null,'missing-bottom-dot',null,'missing-mi-upper-left-dot',null,'missing-walking-top-dot']],
  [2, ['辩','辩','历','历','收','收'], [null,'missing-middle-speech-dot',null,'missing-inner-li-left-falling',null,'missing-puwen-top-left-falling']],
]) {
  const session = create(round);
  assert.equal(session.round, round);
  assert.equal(session.index, 0);
  assert.equal(session.finished(), false);
  assert.deepEqual(session.steps.map(step => step.char), chars);
  assert.deepEqual(session.steps.map(step => step.fault), faults);
  assert.deepEqual(session.steps.map(step => step.expected), ['pass','fail','pass','fail','pass','fail']);
  assert.equal(new Set(session.steps.map(step => step.id)).size, 6);
  session.steps.forEach((step, index) => {
    assert.equal(step.round, round);
    assert.equal(step.position, index + 1);
    assert.ok(step.word.includes(step.char));
    assert.ok(step.pinyin && step.instruction.includes(step.char));
    assert.ok(step.instruction.length < 100);
    assert.equal(Object.isFrozen(step), true);
  });
  assert.equal(session.summary().accuracy, null, 'No submissions means no accuracy, not 100%');
  for (let index = 0; index < 6; index++) {
    assert.equal(session.current().id, session.steps[index].id);
    const confirmation = session.confirm(record(session, 'round'+round+'-'+index), true);
    assert.equal(confirmation.accepted, true);
    assert.equal(confirmation.advanced, true);
    assert.equal(confirmation.matched, true);
    assert.equal(session.index, index + 1);
  }
  assert.equal(session.current(), null);
  assert.equal(session.finished(), true);
  assert.equal(session.summary().allMatched, true);
  assert.equal(session.summary().accuracy, 1);
  assert.equal(session.summary().matched, 6);
  assert.match(session.summary().boundary, /不代表已经适合孩子使用/);
}

// Not following the instruction records an UNKNOWN human answer, and the same
// step stays on screen. A new rewrite can be scored; a previous record cannot.
const rewrite = create(1);
const unknown = record(rewrite, 'unknown', 'pass');
assert.equal(rewrite.confirm(unknown, false).advanced, false);
assert.equal(rewrite.index, 0);
assert.equal(rewrite.results[0].humanExpected, null);
assert.equal(rewrite.results[0].matched, null);
assert.equal(rewrite.summary().scored, 0);
assert.equal(rewrite.summary().accuracy, null);
assert.equal(rewrite.summary().unconfirmedAttempts, 1);
assert.equal(rewrite.confirm(unknown, true).reason, 'duplicate-attempt');
assert.equal(rewrite.index, 0);
assert.equal(rewrite.confirm(record(rewrite, 'rewrite'), true).matched, true);
assert.equal(rewrite.index, 1);
assert.equal(rewrite.summary().accuracy, 1);
assert.equal(rewrite.summary().scored, 1);
assert.equal(rewrite.summary().attempts, 2);

const unknownFail = create(2);
unknownFail.confirm(record(unknownFail, 'unknown-fail', 'fail'), false);
assert.equal(unknownFail.results[0].originalVerdict, 'fail');
assert.equal(unknownFail.results[0].humanExpected, null, 'A machine fail is never a human negative label');
assert.equal(unknownFail.summary().mismatched, 0);
assert.equal(unknownFail.summary().scored, 0);
assert.equal(unknownFail.index, 0);

// A real mismatch must be retained and advanced, allowing the UI to pause
// before presenting the next instruction instead of silently reclassifying it.
const disagreement = create(2);
const wrongVerdict = record(disagreement, 'mismatch', 'fail');
const mismatch = disagreement.confirm(wrongVerdict, true);
assert.equal(mismatch.accepted, true);
assert.equal(mismatch.advanced, true);
assert.equal(mismatch.matched, false);
assert.equal(mismatch.result.originalVerdict, 'fail');
assert.equal(mismatch.result.humanExpected, 'pass');
assert.equal(mismatch.next.id, disagreement.steps[1].id);
assert.equal(disagreement.summary().mismatched, 1);
assert.equal(disagreement.summary().accuracy, 0);
for (let index = 1; index < 6; index++) disagreement.confirm(record(disagreement, 'later-'+index), true);
assert.equal(disagreement.finished(), true);
assert.equal(disagreement.summary().allMatched, false);
assert.equal(disagreement.summary().matched, 5);
assert.equal(disagreement.summary().accuracy, 5/6);

// Stale callbacks, another session, wrong characters, malformed verdicts and
// double taps cannot label or advance the current instruction.
const guarded = create(1), valid = record(guarded, 'guarded');
const badRecords = [
  [null, 'invalid-record'], [{...valid,id:''}, 'invalid-attempt-id'],
  [{...valid,sessionId:'other-session'}, 'wrong-session'],
  [{...valid,stepId:guarded.steps[1].id}, 'wrong-step'],
  [{...valid,char:'警'}, 'wrong-character'], [{...valid,verdict:true}, 'invalid-verdict'],
  [{...valid,timestamp:NaN}, 'invalid-timestamp'], [{...valid,graderVersion:{}}, 'invalid-version'],
];
for (const [input, reason] of badRecords) {
  assert.equal(guarded.confirm(input, true).reason, reason);
  assert.equal(guarded.index, 0);
  assert.equal(guarded.results.length, 0);
}
for (const notExplicit of [undefined, null, 0, 1, 'true']) {
  assert.equal(guarded.confirm(valid, notExplicit).reason, 'confirmation-required');
  assert.equal(guarded.index, 0);
}
assert.equal(guarded.confirm(valid, true).accepted, true);
assert.equal(guarded.confirm(valid, true).reason, 'duplicate-attempt');
assert.equal(guarded.confirm({...valid,id:'old-callback'}, true).reason, 'wrong-step');
assert.equal(guarded.index, 1);
assert.equal(guarded.results.length, 1);

// Exports retain the original verdict and human intent without inspecting or
// copying potentially huge raw ink. External mutation cannot change evidence.
const compact = create(1), ink = record(compact, 'compact');
Object.defineProperty(ink, 'rawS', { get() { throw new Error('Raw ink must not be read'); } });
Object.defineProperty(ink, 's', { get() { throw new Error('Compact ink must not be read'); } });
compact.confirm(ink, true);
ink.verdict = 'fail';
const exported = compact.serialize();
assert.equal(exported.results[0].originalVerdict, 'pass');
assert.equal(exported.results[0].humanExpected, 'pass');
assert.equal(exported.results[0].graderVersion, 'test-version');
assert.equal(exported.results[0].timestamp, 1793700000010);
assert.equal(Object.hasOwn(exported.results[0], 'rawS'), false);
assert.equal(Object.hasOwn(exported.results[0], 's'), false);
assert.ok(JSON.stringify(exported).length < 5000);
exported.results[0].humanExpected = 'fail';
exported.steps[1].expected = 'pass';
exported.summary.matched = 99;
assert.equal(compact.results[0].humanExpected, 'pass');
assert.equal(compact.steps[1].expected, 'fail');
assert.equal(compact.summary().matched, 1);
assert.throws(() => { compact.index = 99; }, TypeError);
assert.throws(() => { compact.steps[0].expected = 'fail'; }, TypeError);
assert.throws(() => { compact.results.push({}); }, TypeError);

// No following step exists after finishing, and no seventh answer is scored.
const done = create(1);
for (let index = 0; index < 6; index++) done.confirm(record(done, 'done-'+index), true);
assert.equal(done.confirm({id:'seventh'}, true).reason, 'finished');
assert.equal(done.results.length, 6);
assert.equal(done.index, 6);

// Input validation is explicit; test clocks/entropy keep fixtures deterministic.
for (const round of [undefined,0,3,'1',null]) assert.throws(() => create(round), RangeError);
assert.throws(() => validation.create(), TypeError);
assert.throws(() => validation.create({round:1,now:0}), TypeError);
assert.throws(() => validation.create({round:1,now:()=>NaN}), RangeError);
assert.throws(() => validation.create({round:1,random:()=>1}), RangeError);
assert.equal(create(1).id, create(1).id);
assert.notEqual(create(1).id, create(2).id);

// Browser export loads without DOM, storage, networking, timers, or glyph data.
const browser = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','parent-validation.js'),'utf8'), browser);
assert.deepEqual(Object.keys(browser.window.HanziParentValidation), ['create']);
const browserSession = browser.window.HanziParentValidation.create({round:1,now:()=>10,random:()=>0});
assert.equal(browserSession.current().char, '燕');
assert.equal(browserSession.summary().scored, 0);
assert.equal(Object.isFrozen(validation), true);
console.log('Parent recognition validation: two fixed rounds, explicit human confirmation, rewrites excluded, mismatches preserved, stale/duplicate guards, compact exports, immutable evidence, and browser export passed.');
