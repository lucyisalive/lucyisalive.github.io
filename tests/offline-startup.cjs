'use strict';

// Execute every script in the built page, in browser order, with all network APIs
// disabled. A small DOM models event binding and state changes, not Safari layout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const fromSource = process.argv.includes('--source');
const html = fromSource ? require('../tools/build-page.cjs').buildPage().html
  : fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
  .map(match => ({ attributes: match[1], source: match[2] }));
const mainIndex = scripts.findIndex(script => script.source.includes('function newBankItem(') && script.source.includes('function onTap('));
const modules = ['hanzi-data.js', 'curriculum-hanzi-data.js', 'curriculum-data.js',
  'practice-selector.js', 'sentence-hints.js', 'game-feedback.js', 'pinyin-data.js'];
assert.ok(scripts.length >= modules.length + 1, 'The page must embed data/modules and the main program');
assert.ok(scripts.every(script => !/\bsrc\s*=/i.test(script.attributes)), 'No startup script may wait on a separate request');
for (const file of modules) {
  assert.equal(scripts.filter(script => script.attributes.includes('data-source="' + file + '"')).length, 1,
    'Embed exactly one ' + file);
}
assert.ok(mainIndex >= 5, 'Load the small behavior modules before main initialization');
assert.ok(scripts.findIndex(script => script.attributes.includes('data-source="hanzi-data.js"')) > mainIndex,
  'Large glyph data must not delay button registration');
assert.ok(!/<link\b[^>]*\brel\s*=\s*["']stylesheet["']/i.test(html), 'Startup stylesheets must be embedded');
assert.ok(!/<link\b[^>]*\bhref\s*=\s*["'][^"']*fonts\.(?:googleapis|gstatic)\.com/i.test(html), 'Do not wait on remote fonts');
assert.ok(/<style\b[^>]*data-source=["']game-feedback\.css["'][^>]*>/i.test(html), 'Embed feedback CSS');
assert.ok(/\.startup-notice\[hidden\]\s*\{[^}]*display\s*:\s*none/i.test(html),
  'The hidden startup cover must also stop covering buttons in CSS');
assert.ok(!/<style\b[^>]*>[\s\S]*?@import\s/gi.test(html), 'No stylesheet imports during startup');
if (!fromSource) assert.equal(fs.readFileSync(path.join(root, '汉字魔法门_4.html'), 'utf8'), html, 'Published entry pages must match');

class Element {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase(); this.id = id; this.children = []; this.parentNode = null;
    this.attributes = {}; this.listeners = new Map(); this.dataset = {};
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.className = ''; this.innerHTML = ''; this.textContent = ''; this.value = '';
    this.disabled = false; this.hidden = false; this.files = [];
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.classes(), ...names])].join(' '); },
      remove: (...names) => { this.className = this.classes().filter(name => !names.includes(name)).join(' '); },
      contains: name => this.classes().includes(name),
      toggle: (name, force) => {
        const enable = force === undefined ? !this.classList.contains(name) : force;
        if (enable) this.classList.add(name); else this.classList.remove(name);
        return enable;
      },
    };
  }
  classes() { return this.className.split(/\s+/).filter(Boolean); }
  get firstChild() { return this.children[0] || null; }
  get isConnected() { return this.tagName === 'BODY' || Boolean(this.parentNode && this.parentNode.isConnected); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(item => item !== child); child.parentNode = null; return child; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'class') this.className = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler); }
  dispatch(type, data = {}) {
    const event = { target: this, currentTarget: this, type, pointerType: 'touch', cancelable: true,
      preventDefault() {}, stopPropagation() {}, ...data };
    for (const handler of this.listeners.get(type) || []) handler(event);
  }
  querySelectorAll(selector) {
    // Dynamic queue markup is still retained as text; these startup checks do
    // not interact with its individual edit/delete buttons.
    const result = [];
    const visit = node => { for (const child of node.children) {
      if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) result.push(child);
      visit(child);
    } };
    visit(this); return result;
  }
  getBoundingClientRect() { return { left: 20, top: 80, width: 300, height: 300 }; }
  setPointerCapture() {} releasePointerCapture() {} focus() {} select() {} click() { this.dispatch('click'); }
  closest(selector) { return selector.split(',').some(part => part.trim().startsWith('.') && this.classList.contains(part.trim().slice(1))) ? this : null; }
}

function environment(initialSave = null, { pauseAfterMain = false } = {}) {
  const ids = new Map(), body = new Element('body'), documentElement = new Element('html');
  // Create the actual page's ID-bearing elements; a missing ID stays missing.
  for (const match of html.matchAll(/<([a-z][\w:-]*)\b([^>]*\bid=["']([^"']+)["'][^>]*)>/gi)) {
    const node = new Element(match[1], match[3]);
    const cls = match[2].match(/\bclass=["']([^"']*)["']/i);
    if (cls) node.className = cls[1];
    const value = match[2].match(/\bvalue=["']([^"']*)["']/i);
    if (value) node.value = value[1];
    node.hidden = /\bhidden(?:\s|=|$)/i.test(match[2]);
    ids.set(node.id, node); body.appendChild(node);
  }
  const documentListeners = new Map();
  const document = {
    body, documentElement, hidden: false, readyState: 'complete',
    getElementById: id => ids.get(id) || null,
    createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag),
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(handler);
    },
  };
  const network = [], storage = new Map(), timers = new Map(), spoken = [];
  if (initialSave) storage.set('hanzi-magic-door-state-v1', JSON.stringify(initialSave));
  let now = new Date(2026, 10, 3, 12).getTime(), nextTimer = 0;
  const blocked = (...args) => { network.push(args[0]); throw new Error('Network disabled in offline-startup test'); };
  const schedule = (fn, ms) => { timers.set(++nextTimer, { fn, ms, at: now + ms }); return nextTimer; };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const window = { document, innerWidth: 400, innerHeight: 800,
    addEventListener() {}, matchMedia: () => ({ matches: true }),
    setTimeout: schedule, clearTimeout: id => timers.delete(id), fetch: blocked,
    speechSynthesis: { cancel() {}, getVoices: () => [], speak: utterance => spoken.push(utterance.text) },
  };
  const context = vm.createContext({
    window, document, Date: ClockDate, console: { log() {}, warn() {}, error() {} },
    fetch: blocked, XMLHttpRequest: class { constructor() { blocked('XMLHttpRequest'); } },
    WebSocket: class { constructor() { blocked('WebSocket'); } }, EventSource: class { constructor() { blocked('EventSource'); } },
    navigator: { sendBeacon: blocked },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: schedule, clearTimeout: id => timers.delete(id),
    setInterval: schedule, clearInterval: id => timers.delete(id),
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    alert() {}, prompt: () => null,
  });
  const tap = id => {
    now += 500;
    const node = ids.get(id); assert.ok(node, 'Missing button: ' + id); node.dispatch('pointerup');
  };
  let earlyButtonChecks = false;
  function executeScript(index) {
    const script = scripts[index];
    vm.runInContext(script.source, context, { timeout: 10000, filename: 'built-inline-' + index + '.js' });
    if (index === mainIndex) {
      assert.equal(Object.keys(window.HANZI_LOCAL_DATA || {}).length, 0, 'Pause before either large glyph module');
      assert.equal(vm.runInContext('bundledGlyphsLoaded', context), false);
      assert.ok(vm.runInContext('currentItem && currentItem.char', context));
      assert.equal(ids.get('startupNotice').hidden, true, 'Small core startup must already finish');
      tap('settingsBtn'); assert.equal(ids.get('panelOverlay').classList.contains('show'), true);
      tap('closePanelBtn'); assert.equal(ids.get('panelOverlay').classList.contains('show'), false);
      assert.deepEqual(network, [], 'Preparing buttons must not fetch glyphs before the embedded data arrives');
      earlyButtonChecks = true;
    }
  }
  let nextScript = 0;
  while (nextScript < scripts.length) {
    const index = nextScript++;
    executeScript(index);
    if (pauseAfterMain && index === mainIndex) break;
  }
  return {
    ids, context, network, storage, spoken, timers, earlyButtonChecks,
    run: source => vm.runInContext(source, context),
    tap,
    resume() { while (nextScript < scripts.length) executeScript(nextScript++); },
    advance(ms) {
      const until = now + ms;
      let fired = 0;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at);
        if (!due.length) break;
        assert.ok(++fired < 1000, 'Fake timers must not loop forever');
        const [id, timer] = due[0]; timers.delete(id); now = timer.at; timer.fn();
      }
      now = until;
    },
  };
}

const expected = vm.createContext({ window: {} });
for (const file of ['hanzi-data.js', 'curriculum-hanzi-data.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), expected);
const expectedGlyphs = JSON.stringify(expected.window.HANZI_LOCAL_DATA);

(async () => {
  const first = environment();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(first.earlyButtonChecks, true);
  assert.equal(first.run('bundledGlyphsLoaded'), true);
  assert.equal(Object.keys(first.context.window.HANZI_LOCAL_DATA).length, 167);
  assert.equal(JSON.stringify(first.context.window.HANZI_LOCAL_DATA), expectedGlyphs, 'Bundling must not change glyphs');
  assert.equal(first.run('state.bank.length'), 92);
  assert.ok(first.run('currentItem && currentItem.char'));
  assert.equal(first.ids.get('startupNotice').hidden, true, 'Complete startup must dismiss the notice');
  assert.equal(first.ids.get('writeSlot').style.display, 'flex');
  assert.ok((first.ids.get('settingsBtn').listeners.get('pointerup') || []).length);
  first.tap('settingsBtn'); assert.equal(first.ids.get('panelOverlay').classList.contains('show'), true);
  first.tap('closePanelBtn'); assert.equal(first.ids.get('panelOverlay').classList.contains('show'), false);
  first.run('strokesPoints=[[{x:10,y:10},{x:20,y:20}]];');
  first.tap('clearBtn'); assert.equal(first.run('strokesPoints.length'), 0);
  first.ids.get('charInput').value = '匕'; first.ids.get('pinyinInput').value = 'bǐ'; first.ids.get('wordInput').value = '匕首';
  first.tap('settingsBtn'); first.tap('addCharBtn'); first.tap('closePanelBtn');
  assert.equal(first.run('currentItem.char'), '匕');
  assert.equal(first.run('state.priorityQueue[0].char'), '匕');
  first.tap('speakBtn'); first.tap('sentenceBtn');
  assert.equal(first.spoken.length, 2); assert.equal(first.spoken[0], '匕首'); assert.ok(first.spoken[1].includes('匕首'));
  first.run('strokesPoints=window.HANZI_LOCAL_DATA[currentItem.char].medians.map(medianToCanvasPoints);');
  first.tap('submitBtn'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(first.ids.get('submitBtn').disabled, false);
  assert.equal(first.run('passedCount'), 1, 'Actual submit handler must finish grading without the network');
  assert.equal(first.run('inkLog.length'), 1);
  assert.ok(first.storage.has('hanzi-magic-door-state-v1'));
  first.tap('continueBtn'); assert.ok(first.run('currentItem && currentItem.char'));
  assert.deepEqual(first.network, []);

  const old = { bankVersion: 4, dailyCount: 5, scenesUnlocked: 3,
    bank: [{ char: '慧', pinyin: 'huì', word: '智慧', box: 3, interval: 14,
      lastSeen: '2026-10-01', history: [{ day: '2026-10-01', outcome: 'first-try' }],
      passedDays: ['2026-09-01', '2026-10-01'], wrongToday: 2, wrongDay: '2026-11-02' }],
    priorityQueue: [{ char: '慧', pinyin: 'huì', word: '智慧' }] };
  const restored = environment(old);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(restored.run('currentItem.char'), '慧', 'Saved parent queue must also boot offline');
  assert.equal(restored.run("state.bank.find(item=>item.char==='慧').history.length"), 1);
  assert.equal(restored.run("state.bank.find(item=>item.char==='慧').wrongToday"), 2);
  assert.equal(restored.run('state.scenesUnlocked'), 3);
  restored.tap('settingsBtn'); assert.equal(restored.ids.get('panelOverlay').classList.contains('show'), true);
  restored.tap('closePanelBtn'); assert.equal(restored.ids.get('panelOverlay').classList.contains('show'), false);
  assert.equal(restored.ids.get('startupNotice').hidden, true);
  assert.deepEqual(restored.network, []);

  // Simulate a slow HTML stream: all controls have initialized, but the last two
  // glyph scripts have not arrived. A real submit must time out safely, retain
  // ink, and become retryable rather than spending a wrong-answer strike.
  const delayed = environment(null, { pauseAfterMain: true });
  delayed.ids.get('charInput').value = '乙'; delayed.ids.get('pinyinInput').value = 'yǐ'; delayed.ids.get('wordInput').value = '乙方';
  delayed.tap('settingsBtn'); delayed.tap('addCharBtn'); delayed.tap('closePanelBtn');
  assert.equal(delayed.run('currentItem.char'), '乙');
  delayed.context.testMedians = expected.window.HANZI_LOCAL_DATA['乙'].medians;
  delayed.run('strokesPoints=testMedians.map(medianToCanvasPoints);');
  assert.equal(delayed.run('strokesPoints.length'), 1);
  const originalInk = JSON.stringify(delayed.run('strokesPoints'));
  const wrongBefore = delayed.run('wrongCountToday(currentItem)');
  delayed.tap('submitBtn'); assert.equal(delayed.ids.get('submitBtn').disabled, true);
  assert.equal(delayed.ids.get('clearBtn').disabled, true, 'Do not erase ink while an asynchronous grade is pending');
  delayed.tap('clearBtn');
  assert.equal(delayed.run('JSON.stringify(strokesPoints)'), originalInk, 'Disabled erase must preserve the submitted ink');
  delayed.advance(6000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(delayed.ids.get('submitBtn').disabled, false, 'Timeout must release the submit button');
  assert.equal(delayed.ids.get('clearBtn').disabled, false, 'Timeout must release erase too');
  assert.equal(JSON.stringify(delayed.run('strokesPoints')), originalInk, 'Timeout must retain every ink point');
  assert.equal(delayed.run('wrongCountToday(currentItem)'), wrongBefore, 'Loading timeout is not a wrong answer');
  assert.equal(delayed.run('currentItem.history.length'), 0);
  assert.equal(delayed.run('passedCount'), 0);
  delayed.tap('settingsBtn'); assert.equal(delayed.ids.get('panelOverlay').classList.contains('show'), true);
  delayed.tap('closePanelBtn'); assert.equal(delayed.ids.get('panelOverlay').classList.contains('show'), false);
  assert.equal(JSON.stringify(delayed.run('strokesPoints')), originalInk);
  assert.deepEqual(delayed.network, []);
  delayed.resume(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(delayed.run('bundledGlyphsLoaded'), true);
  assert.equal(delayed.run('passedCount'), 0, 'Arrival of data must not resubmit ink automatically');
  delayed.tap('submitBtn'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(delayed.ids.get('submitBtn').disabled, false);
  assert.equal(delayed.run('passedCount'), 1, 'The same retained ink must be retryable after data arrives');
  assert.equal(delayed.run('wrongCountToday(currentItem)'), wrongBefore);
  assert.deepEqual(delayed.network, []);
  console.log('offline-startup: embedded scripts, 167 unchanged glyphs, fresh/restored boot, controls, and slow-glyph timeout/retry passed without network');
})().catch(error => { console.error(error); process.exitCode = 1; });
