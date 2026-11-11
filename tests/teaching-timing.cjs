'use strict';

// Exercise the actual published functions. Only DOM elements, glyph delivery,
// animation frames, and the browser clock are controlled by this test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourceMode = process.argv.includes('--source');
const html = fs.readFileSync(path.join(__dirname, '..', sourceMode ? 'game-source.html' : 'index.html'), 'utf8');
function source(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'Published function boundaries missing: ' + start);
  return html.slice(a, b);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function glyph(count, label = 'reference') {
  return { strokes: Array.from({ length: count }, (_, i) => 'M ' + i + ' 0 L 1 1 ' + label),
    medians: Array.from({ length: count }, () => [[0, 0], [1, 1]]) };
}
function element() {
  const names = new Set();
  let markup = '', text = '';
  return { style: {}, dataset: {}, writes: [], className: '',
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = String(value); this.writes.push(markup); },
    get textContent() { return text; },
    set textContent(value) { text = String(value); },
    classList: {
      add(name) { names.add(name); }, remove(name) { names.delete(name); },
      contains(name) { return names.has(name); },
      toggle(name, force) {
        const show = force === undefined ? !names.has(name) : Boolean(force);
        if (show) names.add(name); else names.delete(name);
        return show;
      },
    },
  };
}

function environment() {
  let now = 0, nextId = 0;
  const timers = new Map(), frames = new Map(), plans = [], requests = [], intervalStarts = [];
  const ui = Object.fromEntries(['demoGlyph', 'charGlow', 'drawSvg', 'playzone', 'writeSlot',
    'pinyinTag', 'sentenceBtn', 'submitBtn', 'clearBtn', 'timerRing', 'statusLine', 'resultBanner', 'continueBtn']
    .map(name => [name, element()]));
  ui.demoGlyph.classList.add('hidden');
  function schedule(fn, delay, repeating) {
    const id = ++nextId;
    timers.set(id, { id, fn, at: now + Number(delay || 0), delay: Number(delay || 0), repeating });
    if (repeating) intervalStarts.push({ id, at: now, fn, delay });
    return id;
  }
  const context = vm.createContext({ ...ui,
    window: { requestAnimationFrame(fn) { const id = ++nextId; frames.set(id, fn); return id; } },
    setTimeout: (fn, delay) => schedule(fn, delay, false), clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: id => timers.delete(id),
    getCharData(char) {
      requests.push(char);
      return plans.length ? plans.shift() : Promise.resolve(glyph(6));
    },
    stopPromptSpeech() {}, feedbackCall() {}, renderPlayerDispute() {}, parentPriorityEntries: () => [],
    sentenceFor: () => '',
    setDoorClosed() {}, renderProgressPath() {},
  });
  const run = code => vm.runInContext(code, context);
  run(`let currentItem=null,currentMode='free',currentRound=1,currentParentRequestId=null;
    let stepIndex=0,stepAttempts=0,timerHandle=null,teachingRunId=0,strokesPoints=[];
    let syncRoundCompleted=false;`);
  const timingModule = html.match(/<script data-source="learning-timing\.js">([\s\S]*?)<\/script>/);
  if (sourceMode) run(fs.readFileSync(path.join(__dirname, '..', 'learning-timing.js'), 'utf8'));
  else { assert.ok(timingModule, 'Published timing module must be embedded'); run(timingModule[1]); }
  const stages = html.match(/const TEACHING_STEPS\s*=\s*[^;]+;/);
  assert.ok(stages);
  run(stages[0]);
  run(source('function cancelTeachingRound(){', '// ---------- freehand drawing surface'));
  run(source('function clearCanvas(){', '// ---------- character stroke data'));
  run(source('function glyphSvg(', '// ---------- reading the prompt aloud ----------'));
  run(source('function showDemoGlyph(', '// ---------- main flow ----------'));
  run(source('function presentDoor(', '// ---------- result handling & teaching-mode state machine ----------'));
  run(source('function startTeachingRound(){', '// TEMPORARY diagnostics'));

  async function drain() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
  function tick(milliseconds) {
    const end = now + milliseconds;
    let iterations = 0;
    while (true) {
      const next = [...timers.values()].filter(timer => timer.at <= end)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!next) break;
      assert.ok(++iterations < 10000, 'Timer did not settle');
      now = next.at;
      if (next.repeating) next.at += next.delay;
      else timers.delete(next.id);
      next.fn();
    }
    now = end;
  }
  async function frame() {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach(fn => fn(now));
    await drain();
  }
  function begin(item, stage = 0) {
    context.item = item; context.stage = stage;
    return run("currentItem=item;currentMode='teaching';stepIndex=stage;startTeachingRound();");
  }
  function present(item) { context.nextItem = item; run("presentDoor(nextItem,'free',1);"); }
  return { ui, context, run, plans, requests, intervalStarts, drain, tick, frame, begin, present,
    intervals: () => [...timers.values()].filter(timer => timer.repeating),
    frameCount: () => frames.size, now: () => now };
}

const cases = [];
function test(name, work) { cases.push({ name, work }); }
const complex = () => ({ char: '薄', pinyin: 'bó', word: '薄雾', strokeCount: 1 });

test('Delayed glyph consumes no time; actual 16 strokes win over metadata; both paint frames precede countdown', async () => {
  const e = environment(), delayed = deferred();
  e.plans.push(delayed.promise);
  const pending = e.begin(complex());
  e.tick(20000);
  assert.equal(e.intervals().length, 0);
  assert.equal(e.ui.timerRing.style.display, 'none');
  assert.equal(e.ui.submitBtn.style.display, 'none');
  assert.equal(e.ui.demoGlyph.innerHTML, '');
  delayed.resolve(glyph(16)); await e.drain();
  assert.ok(e.ui.demoGlyph.innerHTML.includes('<svg'));
  assert.equal(e.intervals().length, 0);
  assert.equal(e.frameCount(), 1);
  await e.frame();
  assert.equal(e.intervals().length, 0, 'One animation frame is not the complete paint boundary');
  e.tick(5000);
  assert.equal(e.intervals().length, 0);
  await e.frame(); await pending;
  assert.equal(e.ui.timerRing.textContent, '9');
  assert.equal(e.intervalStarts[0].at, 25000);
  e.tick(8000);
  assert.equal(e.ui.timerRing.textContent, '1');
  assert.equal(e.ui.submitBtn.style.display, 'none');
  e.tick(1000);
  assert.equal(e.intervals().length, 0);
  assert.equal(e.ui.submitBtn.style.display, 'inline-block');
  assert.equal(e.ui.clearBtn.style.display, 'inline-block');
  assert.equal(e.ui.demoGlyph.classList.contains('hidden'), true);
});

test('Simple glyph keeps 5/3/1 stages; blind stage is immediately writable without glyph requests', async () => {
  for (const [stage, seconds] of [[0, 5], [1, 3], [2, 1]]) {
    const e = environment(); e.plans.push(Promise.resolve(glyph(4)));
    const pending = e.begin({ char: '木', pinyin: 'mù', word: '木头', strokeCount: 19 }, stage);
    await e.drain(); await e.frame(); await e.frame(); await pending;
    assert.equal(e.ui.timerRing.textContent, String(seconds));
    e.tick((seconds - 1) * 1000);
    assert.equal(e.ui.submitBtn.style.display, 'none');
    e.tick(1000);
    assert.equal(e.ui.submitBtn.style.display, 'inline-block');
  }
  const e = environment();
  e.begin(complex(), 3);
  assert.equal(e.requests.length, 0);
  assert.equal(e.frameCount(), 0);
  assert.equal(e.intervals().length, 0);
  assert.equal(e.ui.timerRing.style.display, 'none');
  assert.equal(e.ui.submitBtn.style.display, 'inline-block');
  assert.equal(e.ui.demoGlyph.classList.contains('hidden'), true);
});

test('New free question cancels an active interval and even an already-queued old tick cannot clear new ink', async () => {
  const e = environment(); e.plans.push(Promise.resolve(glyph(16)));
  const pending = e.begin(complex()); await e.drain(); await e.frame(); await e.frame(); await pending;
  const staleTick = e.intervalStarts[0].fn;
  e.present({ char: '木', pinyin: 'mù', word: '木头', strokeCount: 4 });
  e.run('strokesPoints=[[{x:1,y:1},{x:2,y:2}]];');
  const status = e.ui.statusLine.textContent;
  staleTick(); e.tick(30000); await e.drain();
  assert.equal(e.intervals().length, 0);
  assert.equal(e.run('currentItem.char'), '木');
  assert.equal(e.run('strokesPoints.length'), 1);
  assert.equal(e.ui.statusLine.textContent, status);
  assert.equal(e.ui.submitBtn.style.display, 'inline-block');
});

test('Late glyph for a different question cannot reveal an answer or start the previous timer', async () => {
  const e = environment(), delayed = deferred(); e.plans.push(delayed.promise);
  const pending = e.begin(complex());
  e.present({ char: '木', pinyin: 'mù', word: '木头', strokeCount: 4 });
  const status = e.ui.statusLine.textContent;
  delayed.resolve(glyph(16, 'late-old')); await e.drain(); await pending;
  await e.frame(); await e.frame();
  assert.equal(e.ui.demoGlyph.innerHTML.includes('late-old'), false);
  assert.equal(e.ui.demoGlyph.classList.contains('hidden'), true);
  assert.equal(e.intervals().length, 0);
  assert.equal(e.ui.statusLine.textContent, status);
});

test('Cancellation while awaiting paint cannot start a timer after switching questions', async () => {
  const e = environment(); e.plans.push(Promise.resolve(glyph(16)));
  const pending = e.begin(complex()); await e.drain(); await e.frame();
  e.present({ char: '木', pinyin: 'mù', word: '木头', strokeCount: 4 });
  await e.frame(); await pending;
  assert.equal(e.intervals().length, 0);
  assert.equal(e.ui.submitBtn.style.display, 'inline-block');
  assert.equal(e.run('currentItem.char'), '木');
});

test('Cancelling the writing view invalidates pending rendering and timing', async () => {
  const e = environment(), delayed = deferred(); e.plans.push(delayed.promise);
  const pending = e.begin(complex()); e.run('setWritingView(false);');
  delayed.resolve(glyph(16, 'cancelled')); await e.drain(); await pending;
  await e.frame(); await e.frame();
  assert.equal(e.ui.demoGlyph.innerHTML.includes('cancelled'), false);
  assert.equal(e.ui.demoGlyph.classList.contains('hidden'), true);
  assert.equal(e.intervals().length, 0);
  assert.equal(e.ui.writeSlot.style.display, 'none');
});

test('A new teaching run of the same character cannot be overwritten by the old asynchronous result', async () => {
  for (const oldFails of [false, true]) {
    const e = environment(), old = deferred(), fresh = deferred(), item = complex();
    e.plans.push(old.promise); const previous = e.begin(item, 0);
    e.plans.push(fresh.promise); const current = e.begin(item, 1);
    fresh.resolve(glyph(16, 'current-run')); await e.drain(); await e.frame(); await e.frame(); await current;
    assert.equal(e.ui.timerRing.textContent, '5');
    assert.ok(e.ui.demoGlyph.innerHTML.includes('current-run'));
    const currentMarkup = e.ui.demoGlyph.innerHTML;
    if (oldFails) old.reject(new Error('Old request failed'));
    else old.resolve(glyph(16, 'stale-run'));
    await e.drain(); await previous;
    assert.equal(e.ui.demoGlyph.innerHTML, currentMarkup,
      'Neither an old SVG nor its font fallback may overwrite the new rendering');
    assert.equal(e.ui.timerRing.textContent, '5');
    assert.equal(e.intervals().length, 1);
    assert.equal(e.intervalStarts.length, 1);
  }
});

test('Font fallback starts the full metadata duration after rendering and painting; unknown count uses five seconds', async () => {
  for (const [count, seconds] of [[16, 9], [undefined, 5]]) {
    const e = environment(), delayed = deferred(); e.plans.push(delayed.promise);
    const pending = e.begin({ char: '薄', pinyin: 'bó', word: '薄雾', strokeCount: count });
    e.tick(20000);
    assert.equal(e.intervals().length, 0);
    delayed.reject(new Error('Unavailable glyph')); await e.drain();
    assert.ok(e.ui.demoGlyph.innerHTML.includes('薄'));
    assert.equal(e.intervals().length, 0);
    await e.frame(); assert.equal(e.intervals().length, 0);
    await e.frame(); await pending;
    assert.equal(e.ui.timerRing.textContent, String(seconds));
    assert.equal(e.intervalStarts[0].at, 20000);
    e.tick(seconds * 1000);
    assert.equal(e.ui.submitBtn.style.display, 'inline-block');
  }
});

(async () => {
  let failed = 0;
  for (const { name, work } of cases) {
    try { await work(); console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
  }
  if (failed) { process.exitCode = 1; console.error('Teaching timing: ' + failed + ' of ' + cases.length + ' checks failed.'); }
  else console.log('Teaching timing: all ' + cases.length + ' production rendering, paint, cancellation, and countdown checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
