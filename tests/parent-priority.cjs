'use strict';

// Run the page's actual parent enqueue, next-question, and result functions.
// DOM/audio boundaries are inert; scheduling and learning code are not copied.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = process.argv.includes('--source') ? require('../tools/build-page.cjs').buildPage().html : read('index.html');
const clone = value => JSON.parse(JSON.stringify(value));
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'Missing actual source: ' + start);
  return html.slice(a, b);
}
function seeded(seed) {
  let n = seed >>> 0;
  return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296);
}
let clockTime = new Date(2026, 10, 2, 12).getTime();
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clockTime])); }
  static now() { return clockTime; }
}
function element(id) {
  const classes = new Set();
  return { id, value: '', innerHTML: '', textContent: '', className: '', style: {},
    classList: { add: name => classes.add(name), remove: name => classes.delete(name),
      contains: name => classes.has(name), clear: () => classes.clear() } };
}
const ui = {};
for (const id of ['progressPath', 'resultBanner', 'continueBtn', 'timerRing', 'pinyinTag', 'statusLine',
  'submitBtn', 'clearBtn', 'charInput', 'pinyinInput', 'wordInput', 'sentenceInput', 'batchInput', 'batchMsg',
  'addCharBtn', 'batchAddBtn', 'closePanelBtn', 'restartBtn', 'panelOverlay', 'finale', 'playzone']) ui[id] = element(id);
const saved = new Map(), handlers = new Map();
const math = Object.create(Math); math.random = seeded(70);
const feedback = { reset() {}, celebrate() {}, playCorrect() {}, playWrong() {} };
const context = vm.createContext({
  ...ui, window: { HanziGameFeedback: feedback, HanziSentenceHints: { get: item => item.sentence || '' } },
  Date: FixedDate, Math: math,
  clearInterval() {},
  localStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
  onTap: (el, handler) => handlers.set(el.id, handler),
});
for (const file of ['hanzi-data.js', 'curriculum-hanzi-data.js', 'curriculum-data.js', 'pinyin-data.js', 'practice-selector.js']) {
  vm.runInContext(read(file), context, { filename: file });
}
const run = source => vm.runInContext(source, context);
const plain = source => clone(run(source));
run(section('function todayStr(){', '// ---------- default character bank ----------'));
run(section('function newBankItem(', '// ---------- freehand drawing surface'));
run(section('function parentPriorityEntries(){', '// ---------- door state ----------'));
run(section('function hintFor(item){', '// ---------- main flow ----------'));
run(section('function feedbackCall(', 'let activeSpeech = null;'));
run(`let strokesPoints=[];let isDrawing=false;let finaleCalls=0;let finaleBankEmpty=false;
  function stopPromptSpeech(){} function setDoorClosed(){} function setDoorOpen(){}
  function showGlowChar(){} function showDemoGlyph(){} function setWritingView(){} function renderQueueList(){}
  function clearCanvas(){strokesPoints=[];} function getCharData(){return Promise.resolve({});}
  function startTeachingRound(){} function applyScene(){}
  function showFinale(bankEmpty){finaleCalls++;finaleBankEmpty=!!bankEmpty;finale.classList.add('show');}`);
run(section('function loadNextDoor(){', 'function startTeachingRound(){'));
run(section('let pinyinLoading =', 'function renderQueueList(){'));
run(section('const PY_LETTERS =', 'onTap(addCharBtn,'));
run(section('onTap(addCharBtn,', 'onTap(inkCopyBtn,'));
run(section('onTap(batchAddBtn,', 'onTap(saveProgressBtn,'));
run(section('onTap(restartBtn,', '// ---------- settings panel ----------'));
run(section('onTap(closePanelBtn,', '// ---------- pinyin ----------'));
const initialState = plain('state');
const TODAY = run('todayStr()');
const request = (char, word = char, pinyin = 'zì', sentence) => ({ char, word, pinyin,
  ...(sentence === undefined ? {} : { sentence }) });
function reset(state = initialState) {
  clockTime = new Date(2026, 10, 2, 12).getTime();
  context.testState = clone(state); context.testRandom = seeded(90);
  run(`state=testState;passedCount=0;currentItem=null;currentMode='free';currentRound=1;
    stepIndex=0;stepAttempts=0;pendingRetests=[];priorityConsumedToday=new Set();
    selectionSession=window.HanziPracticeSelector.createSession(testRandom);
    currentParentRequestId=null;parentQueueChanged=false;strokesPoints=[];isDrawing=false;finaleCalls=0;finaleBankEmpty=false;
    syncRoundId='';syncRoundDay=todayStr();syncRoundCompleted=false;syncSceneAwarded=false;`);
  for (const el of Object.values(ui)) { el.value = ''; el.innerHTML = ''; el.classList.clear(); }
}
function enqueue(items) { context.testItems = items; return run('enqueueParentItems(testItems)'); }
function enqueueChars(text) { enqueue([...text].map(char => request(char))); }
const current = () => plain('currentItem');
const next = () => run('loadNextDoor()');
const answer = ok => { context.testAnswer = ok; run('handleAttemptResult(testAnswer)'); };
const bankItem = char => { context.testChar = char; return plain('state.bank.find(item=>item.char===testChar)'); };
const queue = () => plain('state.priorityQueue');
const priority = () => plain('nextParentPriority() || null');
const close = () => handlers.get('closePanelBtn')();
const restart = () => handlers.get('restartBtn')();

// Enqueue updates context in place, not the accumulated learning record.
const keep = { box: 4, interval: 14, lastSeen: '2026-10-12', history: [{ day: '2026-10-12', outcome: 'first-try' }],
  passedDays: ['2026-09-01', '2026-09-08', TODAY], wrongToday: 2, wrongDay: TODAY,
  stuck: false, stuckDay: '2026-09-01', customMemo: { note: '完整保留' } };
reset();
context.keep = clone(keep);
run("Object.assign(state.bank[0],keep,{retired:true,sentence:'原句'});currentItem=state.bank[0];");
const target = current().char;
context.testItems = [request(target, '新词' + target, 'xīn', '新的提示句')];
run('enqueueParentItems(testItems)');
assert.equal(run('currentItem === state.bank[0]'), true, 'Do not replace the learning object');
const updated = bankItem(target);
for (const key of Object.keys(keep)) assert.deepEqual(updated[key], keep[key], 'Enqueue changed learning field: ' + key);
assert.equal(updated.word, '新词' + target);
assert.equal(updated.pinyin, 'xīn'); assert.equal(updated.sentence, '新的提示句');
assert.equal(updated.fromParent, true); assert.equal(updated.retired, false);
assert.equal(queue()[0].addedDay, TODAY); assert.equal(queue()[0].completedDay, null);
assert.ok(queue()[0].requestId);

// Latest batch goes first, with one row per character and latest context.
reset(); enqueueChars('山石');
enqueue([request('林', '树林'), request('森', '森林'), request('林', '林海')]);
assert.deepEqual(queue().map(item => item.char), [...'林森山石']);
assert.equal(queue()[0].word, '林海');
assert.equal(plain("state.bank.filter(item=>item.char==='林')").length, 1);
enqueue([request('林', '林海')]);
const sameSentence = '树林里有小鸟。';
enqueue([request('林', '林海', 'lín', sameSentence)]);
enqueue([request('林', '林海', 'lín')]);
assert.equal(bankItem('林').sentence, sameSentence, 'Same-word requeue keeps a custom sentence');
enqueue([request('林', '树林', 'lín')]);
assert.equal(bankItem('林').sentence, undefined, 'A new word must not inherit the old word sentence');
assert.equal(enqueue([request('老师'), request(''), { char: '生', pinyin: '' }, request('字')]), 1);

// Both real UI entry paths use enqueue, including immediate bank persistence.
reset();
ui.charInput.value = '龙'; ui.pinyinInput.value = 'lóng'; ui.wordInput.value = '飞龙';
ui.sentenceInput.value = '飞龙飞过天空。';
handlers.get('addCharBtn')();
assert.equal(bankItem('龙').fromParent, true);
assert.equal(bankItem('龙').sentence, '飞龙飞过天空。');
assert.equal(queue()[0].char, '龙'); assert.equal(queue()[0].addedDay, TODAY);
ui.batchInput.value = '智慧的慧；警察的警；智慧的慧';
handlers.get('batchAddBtn')();
assert.deepEqual(queue().slice(0, 2).map(item => item.char), [...'慧警']);
assert.equal(queue().filter(item => item.char === '慧').length, 1);
assert.equal(bankItem('警').word, '警察');
assert.ok(saved.has(run('SAVE_KEY')));

// Every requested item runs before random questions, but a level ends at ten
// actual passes. The remaining same-day requests keep their order and identity.
const batch = [...'慧警藏器燃澡霎薄燕辩类收历'];
reset({ ...initialState, dailyCount:30 }); enqueueChars(batch.join(''));
const originalRequests = queue();
for (let i = 0; i < 10; i++) {
  next();
  assert.equal(run('finaleCalls'), 0);
  assert.equal(current().char, batch[i]);
  assert.equal((ui.progressPath.innerHTML.match(/class="progress-dot/g) || []).length, 10);
  answer(true);
}
assert.equal(run('passedCount'), 10);
assert.ok(queue().slice(0, 10).every(item => item.completedDay === TODAY));
next(); assert.equal(run('finaleCalls'), 1);
assert.equal(run('state.dailyCount'), 30, 'Leave a compatible saved legacy goal intact');
assert.deepEqual(queue().slice(10), originalRequests.slice(10), 'Do not consume the next level’s priority requests');
restart(); assert.equal(run('passedCount'), 0); assert.equal(ui.finale.classList.contains('show'), false);
for (const expected of originalRequests.slice(10)) {
  assert.equal(current().char, expected.char);
  assert.equal(run('currentParentRequestId'), expected.requestId);
  answer(true); next();
}
assert.equal(run('passedCount'), 3);
assert.ok(queue().every(item => item.completedDay === TODAY));

// A smaller legacy target does not end a live level early, but an exhausted
// pool with fewer than ten available characters ends without repeating passes.
reset({ ...initialState, dailyCount:1, bank:initialState.bank.slice(0, 2) });
next(); const firstOfTwo = current().char; answer(true); next();
assert.notEqual(current().char, firstOfTwo); assert.equal(run('finaleCalls'), 0);
answer(true); next();
assert.equal(run('passedCount'), 2); assert.equal(run('finaleCalls'), 1); assert.equal(run('finaleBankEmpty'), true);

// A mastered/repeated character gets a new test, not a reset of its old passes.
reset();
run("Object.assign(state.bank[0],{passedDays:['2026-09-01','2026-09-08','2026-09-15'],history:[{day:'2026-09-15',outcome:'first-try'}],box:5,interval:21,lastSeen:'2026-09-15'});");
const mastered = plain('state.bank[0]'); enqueue([request(mastered.char)]); next();
assert.equal(current().char, mastered.char); answer(true);
assert.deepEqual(bankItem(mastered.char).history[0], mastered.history[0]);
assert.deepEqual(bankItem(mastered.char).passedDays, [...mastered.passedDays, TODAY]);
const firstId = queue()[0].requestId;
enqueue([request(mastered.char)]);
assert.notEqual(queue()[0].requestId, firstId);
next(); assert.equal(current().char, mastered.char); answer(true);
assert.equal(bankItem(mastered.char).passedDays.filter(day => day === TODAY).length, 1);
assert.equal(bankItem(mastered.char).history.length, 3);
assert.equal(priority(), null);

// A pass today is excluded from ordinary practice but explicit requeue overrides it.
reset();
const passedToday = initialState.bank[0].char;
context.testChar = passedToday; run('state.bank.find(item=>item.char===testChar).passedDays=[todayStr()];');
assert.ok(Array.from({ length: 15 }, () => run('pickNextChar().char')).every(char => char !== passedToday));
enqueue([request(passedToday)]); assert.equal(run('pickNextChar().char'), passedToday);

// Stuck means blocked until the explicit "我讲过了" action. Readding cannot erase
// the previous failures, and a two-wrong item still parks on its next wrong answer.
reset();
const stuckChar = initialState.bank[0].char;
context.testChar = stuckChar;
run('Object.assign(state.bank[0],{stuck:true,stuckDay:todayStr(),wrongToday:3,wrongDay:todayStr()});');
enqueue([request(stuckChar), request('龙')]);
assert.equal(bankItem(stuckChar).wrongToday, 3); assert.equal(bankItem(stuckChar).stuck, true);
assert.equal(priority().char, '龙');
reset(); context.testChar = stuckChar;
run('Object.assign(state.bank[0],{wrongToday:2,wrongDay:todayStr()});');
enqueue([request(stuckChar)]); next(); answer(false);
assert.equal(bankItem(stuckChar).wrongToday, 3); assert.equal(bankItem(stuckChar).stuck, true);
assert.equal(bankItem(stuckChar).history.at(-1).outcome, 'abandoned');
assert.equal(queue()[0].completedDay, TODAY); assert.equal(run('passedCount'), 0);

// Ordinary work already on screen cannot complete a newer request for that char.
reset(); run("presentDoor(state.bank[0],'free',1);");
const ordinaryChar = current().char;
enqueue([request(ordinaryChar)]); const queuedWhileWriting = queue()[0].requestId;
run('strokesPoints=[[{x:10,y:10},{x:20,y:20}]];'); answer(true);
assert.equal(queue()[0].completedDay, null);
next(); assert.equal(run('currentParentRequestId'), queuedWhileWriting); answer(true);
assert.equal(queue()[0].completedDay, TODAY);

// Readding an in-flight priority creates a new identity; the old result must not
// silently consume that replacement request.
reset(); enqueueChars('龙'); next(); const inFlight = run('currentParentRequestId');
enqueue([request('龙', '龙舟')]); const replacement = queue()[0].requestId;
assert.notEqual(replacement, inFlight); answer(true);
assert.equal(queue()[0].completedDay, null);
next(); assert.equal(run('currentParentRequestId'), replacement); answer(true);
assert.equal(queue()[0].completedDay, TODAY);

// Priority stays ahead of delayed retests; the original request identity travels
// through teaching, two fillers, and the blind retest before completion.
reset(); enqueueChars('龙山石林'); next();
const delayedId = run('currentParentRequestId');
answer(false); run('stepIndex=TEACHING_STEPS.length-1;'); answer(true);
assert.equal(plain('pendingRetests')[0].parentRequestId, delayedId);
assert.equal(run('passedCount'), 0, 'Blind teaching success is not a formal pass');
assert.equal(queue()[0].completedDay, null);
next(); assert.equal(current().char, '山'); answer(true);
next(); assert.equal(current().char, '石'); answer(true);
assert.equal(plain('pendingRetests')[0].fillersSeen, 2);
next(); assert.equal(current().char, '林'); answer(true);
next(); assert.equal(current().char, '龙'); assert.equal(run('currentMode'), 'retest');
assert.equal(run('currentParentRequestId'), delayedId); answer(true);
assert.equal(queue().find(item => item.char === '龙').completedDay, TODAY);

// A delayed retest at the boundary neither counts as a pass nor takes an
// eleventh slot. Next level can use the same retest and its first real filler.
reset(); enqueueChars('龙山石'); run('passedCount=9;'); next();
const carriedRetestId = run('currentParentRequestId');
answer(false); run('stepIndex=TEACHING_STEPS.length-1;'); answer(true);
assert.equal(run('passedCount'), 9);
next(); assert.equal(current().char, '山'); answer(true); next();
assert.equal(run('finaleCalls'), 1); assert.equal(run('passedCount'), 10);
assert.equal(plain('pendingRetests')[0].fillersSeen, 1);
restart(); assert.equal(current().char, '石'); answer(true); next();
assert.equal(current().char, '龙'); assert.equal(run('currentMode'), 'retest');
assert.equal(run('currentParentRequestId'), carriedRetestId); answer(true);
assert.equal(run('passedCount'), 2);

// Replacing a request while its old blind retest waits cannot consume the new
// request. The existing retest finishes with its captured identity first.
reset(); enqueueChars('龙'); next();
const oldRetestId = run('currentParentRequestId');
answer(false); run('stepIndex=TEACHING_STEPS.length-1;'); answer(true);
enqueue([request('龙', '龙舟'), request('山'), request('石')]);
const newRetestRequest = queue()[0].requestId;
assert.notEqual(newRetestRequest, oldRetestId);
next(); assert.equal(current().char, '山'); answer(true);
next(); assert.equal(current().char, '石'); answer(true);
next(); assert.equal(run('currentMode'), 'retest'); assert.equal(run('currentParentRequestId'), oldRetestId);
answer(true); assert.equal(queue()[0].completedDay, null);
next(); assert.equal(run('currentMode'), 'free'); assert.equal(run('currentParentRequestId'), newRetestRequest);
answer(true); assert.equal(queue()[0].completedDay, TODAY);

// Refresh repeats only unfinished requests; new days stop yesterday's priority
// without deleting the bank entry or its learned history.
reset(); enqueueChars('龙山'); next(); answer(true);
const refreshed = plain('state'); reset(refreshed);
assert.equal(priority().char, '山');
clockTime = new Date(2026, 10, 3, 12).getTime();
assert.equal(priority(), null);
assert.ok(bankItem('龙').history.length > 0);
assert.ok(bankItem('山').fromParent);
reset();
context.legacy = { ...clone(initialState), priorityQueue: [request('龙'), request('龙'), request('山')] };
const adopted = plain('migrateState(legacy)');
assert.equal(adopted.priorityQueue.length, 2);
assert.ok(adopted.priorityQueue.every(item => item.addedDay === TODAY && item.requestId));
context.legacy = clone(adopted);
assert.ok(JSON.stringify(plain('migrateState(legacy)')) === JSON.stringify(adopted));

// Closing settings preempts only an untouched free question. It replaces that
// same filler slot rather than advancing delayed-ret test counters twice.
reset(); run("presentDoor(state.bank[0],'free',1);pendingRetests=[{item:state.bank[1],fillersSeen:1,round:1}];");
enqueueChars('龙'); close();
assert.equal(current().char, '龙'); assert.equal(plain('pendingRetests')[0].fillersSeen, 1);
reset(); run("presentDoor(state.bank[0],'free',1);strokesPoints=[[{x:1,y:1},{x:2,y:2}]];");
const writingChar = current().char; enqueueChars('龙'); close(); assert.equal(current().char, writingChar);
reset(); run("presentDoor(state.bank[0],'free',1);currentMode='teaching';");
const teachingChar = current().char; enqueueChars('龙'); close(); assert.equal(current().char, teachingChar);
reset(); run("passedCount=5;finale.classList.add('show');playzone.classList.add('hide');");
enqueueChars('龙'); close();
assert.equal(current().char, '龙'); assert.equal(ui.finale.classList.contains('show'), false);
assert.equal(run('finaleCalls'), 0);

// A missing optional feedback/sentence bundle cannot block parent requests,
// their saved custom sentences, normal progression, or the settings queue.
reset();
delete context.window.HanziGameFeedback;
delete context.window.HanziSentenceHints;
enqueue([request('龙', '飞龙', 'lóng', '  飞龙飞过天空。  ')]);
next(); assert.equal(current().char, '龙');
assert.equal(run('sentenceFor(currentItem)'), '飞龙飞过天空。');
answer(true);
assert.equal(bankItem('龙').history.at(-1).outcome, 'first-try');
assert.equal(queue()[0].completedDay, TODAY);
// Run the real queue renderer after the earlier scheduling-only DOM stubs.
context.queueList = {innerHTML: '', querySelectorAll() { return []; }};
run(section('function escapeText(value){', 'function renderStuckList(){'));
run('renderQueueList()');
assert.ok(context.queueList.innerHTML.includes('自定义例句'));
assert.ok(context.queueList.innerHTML.includes('今天已完成'));
context.window.HanziSentenceHints = {get() { throw Error('Optional sentence module failed'); }};
assert.equal(run('sentenceFor(state.priorityQueue[0])'), '飞龙飞过天空。');
run('renderQueueList()');
assert.ok(context.queueList.innerHTML.includes('自定义例句'));
assert.equal(run('sentenceFor(null)'), '');

console.log('parent-priority: ten-pass levels, overflow and retest carryover, short-level completion, enqueue preservation, dates, mastery, parking, request races, settings preemption, and missing optional modules passed');
