'use strict';
// Exercise the saved game's result state machine, not a duplicate implementation.
// Only DOM, timers, speech, and feedback effects are substituted with observables.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function source(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'Production source boundaries missing: ' + start);
  return html.slice(a, b);
}
function element() {
  const names = new Set();
  return {style: {}, textContent: '', className: '', listeners: {},
    classList: {add: name => names.add(name), remove: name => names.delete(name), contains: name => names.has(name)},
    addEventListener(type, handler) { this.listeners[type] = handler; }};
}
function environment() {
  const calls = {correct: 0, wrong: 0, celebrate: [], reset: 0, unlock: 0, speechCancel: 0, save: 0, teaching: 0, open: 0, close: 0, clear: 0, progress: 0, writing: [], events: [], spoken: []};
  const ui = Object.fromEntries(['resultBanner', 'continueBtn', 'timerRing', 'pinyinTag', 'statusLine', 'submitBtn', 'clearBtn', 'speakBtn', 'sentenceBtn'].map(name => [name, element()]));
  let now = 1000;
  class TestDate extends Date { static now() { return now; } }
  const feedback = {
    playCorrect() { calls.correct++; calls.events.push('correct'); },
    playWrong() { calls.wrong++; calls.events.push('wrong'); },
    celebrate(char) { calls.celebrate.push(char); calls.events.push('celebrate'); },
    reset() { calls.reset++; calls.events.push('reset'); },
    unlock() { calls.unlock++; calls.events.push('unlock'); return Promise.resolve(true); }
  };
  const context = vm.createContext({
    ...ui, Date: TestDate, calls,
    window: {HanziGameFeedback: feedback, speechSynthesis: {cancel() { calls.speechCancel++; calls.events.push('speech-cancel'); }}},
    todayStr: () => '2026-11-02', saveState: () => { calls.save++; },
    setDoorClosed: () => { calls.close++; }, setDoorOpen: () => { calls.open++; },
    showGlowChar() {}, clearCanvas: () => { calls.clear++; },
    setWritingView: visible => calls.writing.push(visible), renderProgressPath: () => { calls.progress++; },
    startTeachingRound: () => { calls.teaching++; }, getCharData: () => Promise.resolve({}),
    speakText: text => { calls.spoken.push(text); },
  });
  vm.runInContext(`let state={priorityQueue:[],bank:[]},currentItem=null,currentMode='free',currentRound=1,currentParentRequestId=null;
    let passedCount=0,stepIndex=0,stepAttempts=0,pendingRetests=[],activeSpeech=null;`, context);
  for (const name of ['TEACHING_STEPS', 'WRONG_LIMIT']) {
    const declaration = html.match(new RegExp('const ' + name + '\\s*=\\s*[^;]+;'));
    assert.ok(declaration, 'Production declaration missing: ' + name);
    vm.runInContext(declaration[0], context);
  }
  vm.runInContext(source('function wrongCountToday(', '// ---------- 笔迹记录'), context);
  vm.runInContext(source('function parentPriorityEntries(){', 'function unfinishedParentEntries(){'), context);
  vm.runInContext(source('function feedbackCall(', 'let activeSpeech = null;'), context);
  vm.runInContext(source('function stopPromptSpeech(){', 'function speakText('), context);
  vm.runInContext(source('function speakSentence(){', '// The demo character'), context);
  vm.runInContext(source('function hintFor(item){', '// ---------- main flow ----------'), context);
  vm.runInContext(source('function presentDoor(', 'function startTeachingRound(){'), context);
  vm.runInContext(source('function onTap(el, handler){', 'onTap(submitBtn,'), context);
  const run = code => vm.runInContext(code, context);
  function prepare(mode = 'free', blind = false) {
    const item = {char: '慧', pinyin: 'huì', word: '智慧', box: 1, interval: 0, history: [], passedDays: []};
    context.item = item;
    context.mode = mode;
    context.blind = blind;
    run("currentItem=item;currentMode=mode;currentRound=1;currentParentRequestId='request-1';stepIndex=blind?TEACHING_STEPS.length-1:0;stepAttempts=0;state.bank=[item];state.priorityQueue=[{char:item.char,requestId:'request-1',addedDay:todayStr()}];");
    return item;
  }
  return {context, calls, ui, run, prepare, advance: ms => { now += ms; }};
}

// A first independent success receives the small chime and one daily mastery event.
{
  const e = environment(), item = e.prepare('free');
  e.run('handleAttemptResult(true)');
  assert.equal(e.calls.correct, 1);
  assert.equal(e.calls.wrong, 0);
  assert.deepEqual(e.calls.celebrate, ['慧']);
  assert.ok(e.calls.events.indexOf('correct') < e.calls.events.indexOf('celebrate'));
  assert.equal(item.history.length, 1);
  assert.equal(item.history[0].outcome, 'first-try');
  assert.deepEqual(Array.from(item.passedDays), ['2026-11-02']);
  assert.equal(e.run('passedCount'), 1);
  assert.equal(e.calls.open, 1);
  assert.equal(e.ui.submitBtn.style.display, 'none');
  assert.ok(e.ui.continueBtn.classList.contains('show'));
  assert.equal(e.run('state.priorityQueue[0].completedDay'), '2026-11-02');
}

// Guided successes, including a blind teaching success, are not formal passes.
for (const blind of [false, true]) {
  const e = environment(), item = e.prepare('teaching', blind);
  e.run('handleAttemptResult(true)');
  assert.equal(e.calls.correct, 1);
  assert.equal(e.calls.wrong, 0);
  assert.equal(e.calls.celebrate.length, 0);
  assert.equal(item.history.length, 0);
  assert.equal(item.passedDays.length, 0);
  assert.equal(e.run('passedCount'), 0);
  assert.equal(e.calls.open, 0);
  if (blind) {
    assert.equal(e.run('pendingRetests.length'), 1);
    assert.equal(e.run('pendingRetests[0].fillersSeen'), 0);
    assert.equal(e.run('pendingRetests[0].parentRequestId'), 'request-1');
    assert.equal(e.calls.teaching, 0);
    // Only the subsequent delayed retest is allowed to celebrate and record.
    e.run("presentDoor(item,'retest',1,'request-1');handleAttemptResult(true)");
    assert.equal(e.calls.correct, 2);
    assert.deepEqual(e.calls.celebrate, ['慧']);
    assert.equal(item.history.length, 1);
    assert.equal(item.history[0].outcome, 'retest-pass');
    assert.equal(e.run('passedCount'), 1);
  } else {
    assert.equal(e.run('stepIndex'), 1);
    assert.equal(e.calls.teaching, 1);
    assert.equal(e.run('pendingRetests.length'), 0);
  }
}

// Every rejected attempt sounds once. The third daily error parks the character;
// it must neither celebrate nor create a mastery/pass record, across all modes.
for (const mode of ['free', 'teaching', 'retest']) {
  const e = environment(), item = e.prepare(mode);
  for (let attempt = 1; attempt <= 3; attempt++) {
    e.run('handleAttemptResult(false)');
    assert.equal(e.calls.wrong, attempt);
    assert.equal(e.calls.correct, 0);
    assert.equal(e.calls.celebrate.length, 0);
    assert.equal(item.wrongToday, attempt);
  }
  assert.equal(item.stuck, true);
  assert.equal(item.stuckDay, '2026-11-02');
  assert.equal(item.history.length, 1);
  assert.equal(item.history[0].outcome, 'abandoned');
  assert.equal(item.passedDays.length, 0);
  assert.equal(e.run('passedCount'), 0);
  assert.equal(e.calls.open, 0);
  assert.ok(e.ui.continueBtn.classList.contains('show'));
}

// A new question stops both prompt voices and all lingering effects first.
{
  const e = environment(), item = e.prepare();
  e.ui.speakBtn.classList.add('speaking');
  e.ui.sentenceBtn.classList.add('speaking');
  e.run("activeSpeech={text:'旧的朗读'};presentDoor(item,'free',1)");
  assert.equal(e.calls.speechCancel, 1);
  assert.equal(e.calls.reset, 1);
  assert.deepEqual(e.calls.events.slice(0, 2), ['speech-cancel', 'reset']);
  assert.equal(e.run('activeSpeech'), null);
  assert.equal(e.ui.speakBtn.classList.contains('speaking'), false);
  assert.equal(e.ui.sentenceBtn.classList.contains('speaking'), false);
}

// The actual pointer/click dedupe unlocks audio once for the same physical tap.
{
  const e = environment(), button = element();
  e.context.testButton = button;
  e.context.testHandler = () => { e.calls.events.push('handler'); };
  e.run('onTap(testButton,testHandler)');
  button.listeners.pointerup({type: 'pointerup'});
  button.listeners.click({type: 'click'});
  assert.equal(e.calls.unlock, 1);
  assert.deepEqual(e.calls.events, ['unlock', 'handler']);
  e.advance(401);
  button.listeners.pointerup({type: 'pointerup'});
  assert.equal(e.calls.unlock, 2);
}

// The entire optional resource can be missing, not merely its browser audio API.
// Drawing/initialization, a physical button tap, grading, and saving must survive.
function optionalModuleScenario(feedback) {
  const e = environment(), item = e.prepare('free');
  if(feedback === undefined) delete e.context.window.HanziGameFeedback;
  else e.context.window.HanziGameFeedback = feedback;
  delete e.context.window.HanziSentenceHints;
  item.sentence = '  慧是智慧的慧。  ';
  e.run("presentDoor(item,'free',1)");
  assert.equal(e.run('currentItem'), item);
  assert.equal(e.run('sentenceFor(item)'), '慧是智慧的慧。');
  e.run('speakSentence()');
  assert.deepEqual(e.calls.spoken, ['慧是智慧的慧。']);
  const button = element();
  e.context.optionalButton = button;
  e.run('onTap(optionalButton,()=>handleAttemptResult(true))');
  button.listeners.pointerup({type: 'pointerup'});
  assert.equal(item.history.length, 1);
  assert.equal(item.history[0].outcome, 'first-try');
  assert.equal(e.run('passedCount'), 1);
  assert.equal(e.ui.submitBtn.style.display, 'none');
  assert.ok(e.ui.continueBtn.classList.contains('show'));
  return e;
}
optionalModuleScenario(undefined);
optionalModuleScenario({});
optionalModuleScenario(new Proxy({}, {get() { throw Error('Optional module getter failed'); }}));

// A speech service can fail while being cancelled. It must not block switching
// questions or reaching the grading result, and stale speaking classes are removed.
{
  const e = environment(), item = e.prepare('free');
  e.context.window.speechSynthesis.cancel = () => { throw Error('Speech service failed'); };
  e.ui.speakBtn.classList.add('speaking');
  e.ui.sentenceBtn.classList.add('speaking');
  e.run("presentDoor(item,'free',1);handleAttemptResult(true)");
  assert.equal(e.calls.reset, 1);
  assert.equal(e.calls.correct, 1);
  assert.equal(item.history.length, 1);
  assert.equal(e.ui.speakBtn.classList.contains('speaking'), false);
  assert.equal(e.ui.sentenceBtn.classList.contains('speaking'), false);
}

// Rejected or permanently pending unlock/feedback promises are detached effects;
// no awaited audio promise is allowed to hold the actual button action hostage.
(async () => {
  const unhandled = [];
  const recordUnhandled = error => unhandled.push(error);
  process.on('unhandledRejection', recordUnhandled);
  try {
    const rejecting = () => Promise.reject(Error('Audio blocked'));
    const pending = () => new Promise(() => {});
    for(const effect of [rejecting, pending]) {
      const e = optionalModuleScenario({unlock: effect, reset: effect, playCorrect: effect, celebrate: effect});
      const item = e.run('currentItem');
      e.context.window.HanziSentenceHints = {get: rejecting};
      assert.equal(e.run('sentenceFor(currentItem)'), item.sentence.trim());
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(unhandled.length, 0, 'Optional effects must consume rejected promises');
  } finally { process.removeListener('unhandledRejection', recordUnhandled); }
  console.log('Feedback integration passed: rewards, three-error parking, speech/reset cleanup, pointer unlock, and missing/failing/pending optional modules.');
})().catch(error => { console.error(error); process.exitCode = 1; });
