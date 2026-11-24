'use strict';

// Exercise built-page touch handlers and real grading with synthetic browser audio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const startup = fs.readFileSync(path.join(__dirname, 'offline-startup.cjs'), 'utf8');
const boundary = startup.indexOf('\n(async()=>{');
const loop = "for(let i=0;i<scripts.length;i++)vm.runInContext(scripts[i].source,context,{timeout:10000,filename:'built-inline-'+i+'.js'});";
assert.ok(boundary > 0 && startup.includes(loop));
const prelude = startup.slice(0, boundary).replace(loop, 'installAudio(context);\n' + loop);
// The startup prelude checks that both generated HTML entries are identical.
const setup = new Function('require', '__dirname', 'process', 'installAudio',
  prelude + '\nreturn {environment,flush,inkFor};');

function audioParameter() {
  return {value:0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){}, cancelScheduledValues(){}};
}

function audioFixture() {
  const contexts = [];
  const utterances = [];
  let currentUtterance = null;
  class AudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = {};
      this.sampleRate = 44100;
      this.tones = [];
      contexts.push(this);
    }
    createGain() { return {gain:audioParameter(), connect(){}, disconnect(){}}; }
    createBuffer() { return {}; }
    createBufferSource() { return {connect(){}, disconnect(){}, start(){}}; }
    createOscillator() {
      const tone = {frequency:audioParameter(), connect(){}, disconnect(){},
        start(at){ this.startAt = at; }, stop(at){ this.stopAt = at; }};
      this.tones.push(tone);
      return tone;
    }
    resume() {
      this.resumeRequested = true;
      return this.resuming ??= new Promise(resolve => {
        this.finishResume = () => { this.state = 'running'; resolve(); };
      });
    }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }

  function install(context) {
    const { window, document, navigator } = context;
    window.AudioContext = AudioContext;
    window.navigator = navigator;
    navigator.userActivation = {isActive:true};
    window.speechSynthesis = {
      get speaking() { return currentUtterance !== null; },
      getVoices() { return [{lang:'zh-CN', localService:true}]; },
      speak(utterance) {
        utterances.push(utterance);
        currentUtterance = utterance;
        utterance.onstart?.();
      },
      cancel() {
        const stopped = currentUtterance;
        currentUtterance = null;
        stopped?.onerror?.({error:'interrupted'});
      },
    };
    // For these two buttons, the startup DOM stub also needs ID selectors for
    // the shared audio module's document-level gesture filter.
    for (const id of ['speakBtn', 'sentenceBtn']) {
      const button = document.getElementById(id);
      const closest = button.closest.bind(button);
      button.closest = selector => selector.split(',').some(part => part.trim() === '#' + id) ? button : closest(selector);
    }
    for (const target of [window, document]) {
      const listeners = new Map();
      target.addEventListener = (type, handler) => listeners.set(type, [...(listeners.get(type) || []), handler]);
      target.dispatchAudioEvent = (type, event = {}) => {
        for (const handler of listeners.get(type) || []) handler({type, ...event});
      };
    }
  }
  return {contexts, utterances, install, speaking: () => currentUtterance !== null};
}

async function run() {
  const audio = audioFixture();
  const { environment, flush, inkFor } = setup(require, __dirname, process, audio.install);
  const bank = [
    {char:'犬', pinyin:'quǎn', word:'军犬', sentence:'这只军犬正在训练。', history:[], passedDays:[]},
    {char:'止', pinyin:'zhǐ', word:'停止', history:[], passedDays:[]},
    {char:'固', pinyin:'gù', word:'固定', history:[], passedDays:[]},
  ];
  const day = '2026-11-03';
  const priorityQueue = [{char:'犬', word:'军犬', pinyin:'quǎn', addedDay:day, requestId:'audio-fixture'}];
  const page = environment({initialSave:{bank, bankVersion:5, dailyCount:10, priorityQueue, scenesUnlocked:0}});
  const { document, navigator } = page.context;
  await flush();

  function tapButton(id, events) {
    page.advance(500);
    const target = page.ids.get(id);
    for (const [type, active = true] of events) {
      navigator.userActivation.isActive = active;
      const event = {target, pointerType:'touch', isTrusted:true};
      document.dispatchAudioEvent(type, event);
      target.dispatch(type, event);
    }
  }
  async function submitAndResume(expectedPasses, beforeResume) {
    const char = page.run('currentItem.char');
    inkFor(page, char);
    tapButton('submitBtn', [['pointerup'], ['touchend'], ['click']]);
    await flush();
    const saved = JSON.parse(page.storage.get('hanzi-magic-herbalist-state-v1'));
    assert.deepEqual(saved.bank.find(entry => entry.char === char).passedDays, [day]);
    assert.equal(page.run('passedCount'), expectedPasses, 'The result and save complete before audio permission resolves');
    assert.equal(audio.speaking(), false, 'Submitting stops any spoken prompt before result sounds');
    const context = audio.contexts.at(-1);
    assert.equal(context.resumeRequested, true);
    assert.equal(context.state, 'suspended');
    assert.equal(context.tones.length, 0);
    beforeResume?.();
    context.finishResume();
    await flush();
    assert.ok(context.tones.some(tone => tone.startAt < .2), 'Small correct chime plays after resume');
    assert.ok(context.tones.some(tone => tone.startAt >= .32), 'Victory phrase also plays after resume');
    return {char, context};
  }

  assert.equal(page.run('currentItem.char'), '犬');
  assert.deepEqual(audio.utterances, [], 'Entering ordinary play does not read the answer aloud');
  assert.equal(page.ids.get('sentenceBtn').hidden, false);
  tapButton('speakBtn', [['pointerup'], ['touchend'], ['click']]);
  tapButton('sentenceBtn', [['pointerup', false], ['touchend'], ['click']]);
  assert.deepEqual(audio.utterances.map(utterance => [utterance.text, utterance.lang]),
    [['军犬', 'zh-CN'], ['这只军犬正在训练。', 'zh-CN']]);
  assert.equal(page.ids.get('speakBtn').classList.contains('speaking'), false);
  assert.equal(page.ids.get('sentenceBtn').classList.contains('speaking'), true);
  assert.equal(audio.contexts.length, 0, 'Speech-only gestures do not open the effects context');

  const first = await submitAndResume(1);
  assert.equal(audio.contexts.length, 1);
  first.context.currentTime = .1;
  tapButton('continueBtn', [['pointerup'], ['click']]);
  assert.notEqual(page.run('currentItem.char'), first.char);
  assert.ok(first.context.tones.every(tone => tone.stopAt <= .12), 'Continuing cancels remaining old tones');

  tapButton('speakBtn', [['pointerup'], ['click']]);
  assert.equal(audio.speaking(), true, 'The word prompt still works with an open effects context');
  document.hidden = true;
  document.dispatchAudioEvent('visibilitychange');
  assert.equal(audio.speaking(), false);
  assert.equal(first.context.state, 'closed');
  document.hidden = false;
  document.dispatchAudioEvent('visibilitychange');
  assert.equal(audio.contexts.length, 1, 'Returning to the page does not autoplay sounds');
  tapButton('speakBtn', [['pointerup'], ['click']]);
  assert.equal(audio.utterances.length, 4, 'Touch still speaks after returning to the page');
  assert.equal(audio.contexts.length, 1);

  const second = await submitAndResume(2, () => {
    assert.equal(audio.contexts.length, 2, 'The first submission after returning opens a fresh context');
  });
  assert.notEqual(second.context, first.context);
  tapButton('continueBtn', [['pointerup'], ['click']]);
  assert.notEqual(page.run('currentItem.char'), second.char);
  assert.ok(page.network.every(call => call.kind === 'glyph'), 'Browser requests stay inside the frozen glyph fixture');
  console.log('iPad audio integration: real touch speech, deferred result cues, next question, and fresh audio after foreground return passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
