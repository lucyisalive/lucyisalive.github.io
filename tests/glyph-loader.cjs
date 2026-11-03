'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { create } = require('../glyph-loader.js');
const { createGrader, root } = require('../tools/grader-harness.cjs');

const clone = value => JSON.parse(JSON.stringify(value));
const glyph = label => ({ strokes: ['M 0 0 L 2 2'], medians: [[[0, 0], [2, 2]]], label, extra: { intact: true } });
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial)), operations = [];
  return {
    values, operations,
    getItem(key) { operations.push(['get', key]); return values.get(key) || null; },
    setItem(key, value) { operations.push(['set', key]); values.set(key, value); },
    removeItem(key) { operations.push(['remove', key]); values.delete(key); },
  };
}
function catalogFor(version = 'geometry-v1') {
  const glyphs = {};
  for (const char of ['理', '王', '里', '另']) {
    glyphs[char] = { url: 'glyphs/' + encodeURIComponent(char) + '.json?v=' + version, deps: [] };
  }
  glyphs['理'].deps = ['王', '里'];
  glyphs['另'].deps = ['王'];
  return { version, glyphCount: 4, glyphs };
}
function characterIn(url) { return decodeURIComponent(url.split('/').pop().split('.json')[0]); }
function response(data) { return { ok: true, json: async () => clone(data) }; }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

async function moduleTests() {
  const browser = vm.createContext({ window: {}, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(root, 'glyph-loader.js'), 'utf8'), browser);
  assert.equal(typeof browser.window.HanziGlyphLoader.create, 'function', 'UMD browser export');
  assert.throws(() => create({}), /catalog/);
  assert.throws(() => create({ catalog: catalogFor(), timeoutMs: 0 }), /positive/);

  const catalog = catalogFor(), localData = {}, storage = memoryStorage({ learner: 'untouched', 'hanzi-char-cache-理': 'legacy' });
  const calls = [], gates = new Map();
  const loader = create({ catalog, localData, storage, fetch: (url, init) => {
    const char = characterIn(url);
    calls.push(char);
    assert.equal(init.credentials, 'same-origin');
    assert.ok(init.signal, 'An abort signal protects both headers and body');
    const gate = deferred(); gates.set(char, gate); return gate.promise;
  } });
  const first = loader.load('理');
  assert.strictEqual(loader.load('理'), first, 'Same target shares one in-flight request');
  const overlapping = loader.load('另');
  await nextTurn();
  assert.deepEqual(calls.slice().sort(), ['另', '王', '理', '里'].sort(), 'Shared dependency downloads once');
  gates.get('理').resolve(response(glyph('理')));
  gates.get('另').resolve(response(glyph('另')));
  gates.get('里').resolve(response(glyph('里')));
  await nextTurn();
  assert.deepEqual(localData, {}, 'A target is not published before all dependencies');
  assert.equal(storage.operations.filter(op => op[0] === 'set').length, 0, 'Incomplete groups do not cache');
  gates.get('王').resolve(response(glyph('王')));
  assert.equal((await first).label, '理');
  await overlapping;
  assert.deepEqual(Object.keys(localData).sort(), ['另', '王', '理', '里'].sort());
  assert.deepEqual(localData['理'], glyph('理'), 'Complete data including extra labels survives');
  assert.equal(storage.values.get('learner'), 'untouched');
  assert.equal(storage.values.get('hanzi-char-cache-理'), 'legacy', 'Old remote data is not promoted into the frozen bundle');
  assert.ok(storage.operations.every(op => op[1] === 'learner' || op[1].startsWith('hanzi-glyph-v1:geometry-v1:')),
    'The loader never reads or writes progress/ink/old remote cache keys');
  const operationCount = storage.operations.length, callCount = calls.length;
  assert.equal(await loader.load('未知'), null);
  assert.equal(await loader.load('toString'), null);
  assert.equal(await loader.load(null), null);
  assert.equal(storage.operations.length, operationCount);
  assert.equal(calls.length, callCount);

  const offlineData = {};
  await create({ catalog, localData: offlineData, storage, fetch: () => { throw new Error('offline'); } }).load('理');
  assert.deepEqual(Object.keys(offlineData).sort(), ['王', '理', '里'].sort(), 'Complete versioned cache works offline');
  await assert.rejects(create({ catalog: catalogFor('geometry-v2'), storage, fetch: () => { throw new Error('offline'); } }).load('理'), /offline/,
    'A different geometry version cannot use old cache');

  const partialStore = memoryStorage();
  const prime = create({ catalog, storage: partialStore, fetch: async url => response(glyph(characterIn(url))) });
  await prime.load('理');
  partialStore.values.delete('hanzi-glyph-v1:geometry-v1:王');
  const partialData = {}, writesBefore = partialStore.operations.filter(op => op[0] === 'set').length;
  await assert.rejects(create({ catalog, localData: partialData, storage: partialStore, fetch: () => { throw new Error('offline'); } }).load('理'), /offline/);
  assert.deepEqual(partialData, {}, 'A cached target with missing dependency cannot enter the grader');
  assert.equal(partialStore.operations.filter(op => op[0] === 'set').length, writesBefore);

  let fail = true, retryCalls = 0;
  const retryData = {}, retryStore = memoryStorage();
  const retry = create({ catalog, localData: retryData, storage: retryStore, fetch: async url => {
    retryCalls++;
    if (fail && characterIn(url) === '王') throw new Error('one dependency failed');
    return response(glyph(characterIn(url)));
  } });
  await assert.rejects(retry.load('理'), /dependency failed/);
  await nextTurn();
  assert.deepEqual(retryData, {});
  assert.equal(retryStore.values.size, 0, 'Failed groups cache no newly downloaded target or parts');
  fail = false;
  await retry.load('理');
  assert.equal(retryCalls, 6, 'A failed group can retry normally');
  const existingTarget = glyph('existing-original');
  const existingData = { 理: existingTarget };
  await assert.rejects(create({ catalog, localData: existingData, fetch: () => { throw new Error('offline'); } }).load('理'), /offline/,
    'Existing target alone does not bypass dependency checks');
  assert.strictEqual(existingData['理'], existingTarget);

  for (const bad of [null, {}, { ...glyph('bad'), medians: [[]] }, { ...glyph('bad'), medians: [[[0, 0], [NaN, 1]]] },
    { ...glyph('bad'), strokes: [] }, { ...glyph('bad'), strokes: [' '] }, { ...glyph('bad'), medians: [glyph('a').medians[0], glyph('b').medians[0]] }]) {
    const data = {}, cache = memoryStorage();
    await assert.rejects(create({ catalog, localData: data, storage: cache, fetch: async () => ({ ok: true, json: async () => bad }) }).load('王'), /Invalid glyph data/);
    assert.deepEqual(data, {}); assert.equal(cache.values.size, 0);
  }
  for (const badResponse of [{ ok: false, json: async () => glyph('bad') }, { ok: true }, null]) {
    await assert.rejects(create({ catalog, fetch: async () => badResponse }).load('王'), /download failed/);
  }
  await assert.rejects(create({ catalog, fetch: async () => ({ ok: true, json: async () => { throw new Error('malformed JSON'); } }) }).load('王'), /malformed JSON/);

  const corrupt = memoryStorage({ 'hanzi-glyph-v1:geometry-v1:王': '{bad JSON', learner: 'safe' });
  const corrected = await create({ catalog, storage: corrupt, fetch: async () => response(glyph('fresh')) }).load('王');
  assert.equal(corrected.label, 'fresh');
  assert.equal(corrupt.values.get('learner'), 'safe');
  const wrongEnvelope = memoryStorage({ 'hanzi-glyph-v1:geometry-v1:王': JSON.stringify({ version: 'geometry-v1', char: '里', data: glyph('wrong') }) });
  assert.equal((await create({ catalog, storage: wrongEnvelope, fetch: async () => response(glyph('right')) }).load('王')).label, 'right');
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal((await create({ catalog, storage: blocked, fetch: async () => response(glyph('network')) }).load('王')).label, 'network');

  for (const broken of [
    c => { c.glyphs['理'].deps = ['缺']; },
    c => { c.glyphs['王'].deps = ['理']; },
    c => { c.glyphs['理'].url = 'https://other.test/glyphs/a.json'; },
    c => { c.glyphs['理'].deps = null; },
  ]) {
    const bad = catalogFor(); broken(bad); let fetched = false;
    await assert.rejects(create({ catalog: bad, fetch: () => { fetched = true; } }).load('理'));
    assert.equal(fetched, false, 'Invalid dependency/catalog is rejected before requesting data');
  }
  const recursive = catalogFor(); recursive.glyphs['里'].deps = ['王'];
  const recursiveCalls = [];
  await create({ catalog: recursive, fetch: async url => { recursiveCalls.push(characterIn(url)); return response(glyph(characterIn(url))); } }).load('理');
  assert.deepEqual(recursiveCalls.sort(), ['王', '理', '里'].sort(), 'Recursive dependencies deduplicate');

  // Both header stalls and body stalls must release the caller; a late result
  // cannot commit ink-scoring data or populate persistent storage after timeout.
  for (const stalledAt of ['headers', 'body']) {
    const gate = deferred(), data = {}, cache = memoryStorage(); let signal;
    const timed = create({ catalog, localData: data, storage: cache, timeoutMs: 15, fetch: async (url, init) => {
      signal = init.signal;
      return stalledAt === 'headers' ? gate.promise : { ok: true, json: () => gate.promise };
    } });
    await assert.rejects(timed.load('王'), /timed out/);
    assert.equal(signal.aborted, true, stalledAt + ' timeout aborts transport');
    assert.deepEqual(data, {}); assert.equal(cache.values.size, 0);
    gate.resolve(stalledAt === 'headers' ? response(glyph('late')) : glyph('late'));
    await nextTurn();
    assert.deepEqual(data, {}); assert.equal(cache.values.size, 0);
  }
  const noAbort = vm.createContext({ window: {}, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(root, 'glyph-loader.js'), 'utf8'), noAbort);
  const oldBrowser = noAbort.window.HanziGlyphLoader.create({ catalog, timeoutMs: 10, fetch: () => new Promise(() => {}) });
  await assert.rejects(oldBrowser.load('王'), /timed out/, 'A timer still protects browsers without AbortController');
  console.log('Glyph loader: dependency atomicity, inflight sharing, versioned offline cache, retry, schema, storage failures, and full-request timeout passed.');
}

function sparseGrader(html, localData, load) {
  const start = html.indexOf('function medianToCanvasPoints('), end = html.indexOf('const progressPath =', start);
  assert.ok(start >= 0 && end > start);
  let logs = [], recordedInk = [];
  const context = vm.createContext({ window: { HANZI_LOCAL_DATA: localData }, setTimeout, clearTimeout,
    console: { log: (...args) => logs.push(args.join(' ')) }, loadGlyph: load,
    captureInk: (payload, verdict) => recordedInk.push({ payload, verdict }) });
  const size = html.match(/const CANVAS_SIZE\s*=\s*(\d+)/)[1], padding = html.match(/const CANVAS_PADDING\s*=\s*(\d+)/)[1];
  vm.runInContext(`const CANVAS_SIZE=${size}, CANVAS_PADDING=${padding}; let strokesPoints=[];
    async function getCharData(char){ return await loadGlyph(char); }
    function recordInk(payload,verdict){ captureInk(payload,verdict); }`, context);
  vm.runInContext(html.slice(start, end), context);
  return async (char, strokes) => {
    logs = []; recordedInk = [];
    context.testChar = char;
    context.testInk = strokes.map(s => s.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y }));
    vm.runInContext('strokesPoints=testInk', context);
    const pass = await vm.runInContext('gradeDrawing(testChar)', context);
    return { pass, diagnostics: logs.filter(s => s.startsWith('[diag-grade]')).join('\n'), recordedInk: clone(recordedInk) };
  };
}

async function gradingTests() {
  const scope = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'glyph-catalog.js'), 'utf8'), scope);
  const catalog = clone(scope.window.HANZI_GLYPH_CATALOG);
  const localData = {}, downloaded = [];
  const loader = create({ catalog, localData, fetch: async url => {
    downloaded.push(characterIn(url));
    const relative = decodeURIComponent(url.split('?')[0]);
    return response(JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')));
  } });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const complete = createGrader({ html }), gradeSparse = sparseGrader(html, localData, loader.load);
  assert.equal(complete.glyphs.length, 167);
  let realCount = 0, dependencyCount = 0;
  async function compare(char, ink, id) {
    Object.keys(localData).forEach(key => delete localData[key]); downloaded.length = 0;
    const expected = await complete.grade(char, ink);
    const actual = await gradeSparse(char, ink);
    assert.deepEqual(actual, expected, 'Sparse target + original deps must retain verdict, component labels, and recorded ink: ' + id);
    const allowed = new Set();
    const visit = part => { if (allowed.has(part)) return; allowed.add(part); catalog.glyphs[part].deps.forEach(visit); };
    visit(char);
    assert.deepEqual(Object.keys(localData).sort(), [...allowed].sort(), 'Only the required group loaded: ' + id);
    assert.equal(downloaded.length, allowed.size, 'No full-bundle fetch: ' + id);
    for (const part of allowed) assert.deepEqual(localData[part], JSON.parse(fs.readFileSync(path.join(root, 'glyphs', part + '.json'), 'utf8')));
  }
  for (const file of ['real-ink-cases.json', 'tests/ipad-2026-11-02.json', 'tests/ipad-2026-11-02-round2.json']) {
    const cases = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')).cases;
    for (const c of cases) {
      if (c.expect !== 'pass' && c.expect !== 'fail') continue;
      await compare(c.target, c.s, c.id); realCount++;
    }
  }
  for (const [char, entry] of Object.entries(catalog.glyphs)) {
    if (!entry.deps.length) continue;
    const reference = complete.reference(char);
    await compare(char, reference, char + ' reference');
    await compare(char, reference.slice(1), char + ' missing first stroke');
    dependencyCount++;
  }
  assert.equal(realCount, 22);
  assert.equal(dependencyCount, 11, 'All original complete component decompositions exercised');
  console.log(`Glyph loader: ${realCount} labelled real traces and ${dependencyCount * 2} component-sensitive reference/missing-stroke cases exactly match full-167 grading and labels.`);
}

(async () => { await moduleTests(); await gradingTests(); })().catch(error => { console.error(error); process.exitCode = 1; });
