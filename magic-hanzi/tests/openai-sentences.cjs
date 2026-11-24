'use strict';
const assert = require('node:assert/strict');
const { create } = require('../openai-sentences.js');

const input = { char: '莞', word: '莞尔', pinyin: 'wǎn' };
const example = '听完同桌的故事，她不由得莞尔一笑。';
const familyToken = 'synthetic-family-access-token-for-tests';
function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}
function browser(overrides = {}) {
  const calls = [], changes = [];
  const win = {
    location: { href: 'https://lucyisalive.github.io/magic-hanzi/' }, localStorage: storage(),
    async fetch(url, options) {
      calls.push({ url, options });
      const body = url.endsWith('/health') ? { ready: true } : { sentences: [{ ...input, sentence: example }] };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    }, ...overrides,
  };
  const options = { endpoint: 'https://synthetic-sentence-service.invalid', getAccessToken: async () => familyToken };
  return { win, calls, changes, options, client: create(win, value => changes.push(value), options) };
}
async function run() {
  const b = browser();
  assert.equal(b.client.status().connected, false);
  assert.equal(await b.client.complete(), true);
  assert.equal(b.client.status().busy, false);
  assert.equal(b.client.status().connected, true);
  const task = b.client.generate([{ ...input, strokes: [[1, 2]], history: ['private'], familyPassword: 'private' }, input]);
  assert.equal(task, b.client.generate([input]), 'Concurrent requests share the current pump');
  assert.deepEqual(await task, [{ ...input, sentence: example }]);
  const generation = b.calls.filter(call => call.url.endsWith('/v1/sentences'));
  assert.equal(generation.length, 1);
  assert.deepEqual(JSON.parse(generation[0].options.body), { items: [input] });
  assert.equal(generation[0].options.headers.Authorization, 'Bearer ' + familyToken);
  assert.equal(generation[0].options.credentials, 'omit');
  assert.equal(generation[0].options.redirect, 'error');
  assert.equal(b.client.get(input), example);
  assert.equal(b.client.get({ ...input, sentence: '家长给孩子准备的例句。' }), null);
  assert.equal(b.client.get({ ...input, pinyin: 'guān' }), null);
  await b.client.generate([input]);
  assert.equal(b.calls.length, 2, 'Cache hits never call OpenAI again');
  const loaded = browser({ localStorage: b.win.localStorage });
  assert.equal(loaded.client.get(input), example);
  assert.equal(await loaded.client.complete(), true, 'Reload uses configured service without OAuth or Gmail');
  assert.equal(loaded.calls.length, 1);
  assert.ok(![...b.win.localStorage.values.values()].join('').includes(familyToken), 'No access credential is written to the sentence cache');
  b.client.disconnect();
  assert.equal(b.client.status().connected, false);
  assert.equal(b.client.get(input), example);

  for (const href of ['file:///offline.html', 'https://lucyisalive.github.io/', 'https://unrelated.invalid/magic-hanzi/']) {
    const invalid = browser({ location: { href } });
    assert.equal(await invalid.client.complete(), false);
    await invalid.client.generate([input]);
    assert.equal(invalid.calls.length, 0);
  }
  const unavailable = browser();
  const unconfigured = create(unavailable.win, null, {});
  assert.equal(await unconfigured.complete(), false);
  assert.equal(unavailable.calls.length, 0);
  for (const endpoint of ['http://insecure.invalid', 'https://user:pass@example.com', 'https://example.com/?key=secret']) {
    assert.equal(await create(unavailable.win, null, { ...unavailable.options, endpoint }).complete(), false);
  }
  const mistakenKey = create(unavailable.win, null, { ...unavailable.options, getAccessToken: () => 'sk-synthetic-openai-key-must-stay-on-server' });
  assert.equal(await mistakenKey.complete(), false);
  assert.equal(unavailable.calls.length, 0, 'Never send an OpenAI key from the browser, including by mistaken configuration');

  const failures = browser();
  await failures.client.complete();
  let count = 0;
  failures.win.fetch = async () => { count++; return { ok: false, status: 503,
    text: async () => JSON.stringify({ error: { code: 'insufficient_quota', message: 'sensitive upstream detail' } }) }; };
  await failures.client.generate([input]);
  assert.match(failures.client.status().message, /额度不足/);
  assert.doesNotMatch(failures.client.status().message, /sensitive/);
  assert.equal(failures.client.status().busy, false);
  await failures.client.generate([input]);
  assert.equal(count, 1, 'A failed word is not automatically charged for repeated attempts in this page');

  const invalidRows = browser();
  await invalidRows.client.complete();
  invalidRows.win.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ sentences: [
    { ...input, sentence: example }, { ...input, sentence: example },
    { char: '陌', word: '陌生', pinyin: 'mò', sentence: '来到完全陌生的地方，他先找到了车站。' },
  ] }) });
  assert.deepEqual(await invalidRows.client.generate([input]), []);
  assert.equal(invalidRows.client.get(input), null, 'Unrequested and duplicate model rows are rejected');

  const { createSentenceService } = await import('../server/sentence-service.mjs');
  const { webcrypto } = require('node:crypto');
  let upstreamCalls = 0;
  const server = createSentenceService({ cryptoImpl: webcrypto, fetchImpl: async (url, init) => {
    upstreamCalls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.headers.Authorization, 'Bearer sk-synthetic-server-only-key');
    const request = JSON.parse(init.body);
    assert.equal(request.store, false);
    assert.deepEqual(JSON.parse(request.input[1].content[0].text), { items: [input] });
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [
      { type: 'output_text', text: JSON.stringify({ sentences: [{ ...input, sentence: example }] }) },
    ] }] }), { headers: { 'Content-Type': 'application/json' } });
  } });
  const integrated = browser();
  integrated.win.fetch = (url, init) => {
    assert.ok(!JSON.stringify(init).includes('sk-synthetic-server-only-key'));
    return server.fetch(new Request(url, { ...init, headers: { ...init.headers, Origin: 'https://lucyisalive.github.io' } }),
      { OPENAI_API_KEY: 'sk-synthetic-server-only-key', HANZI_SENTENCE_ACCESS_TOKEN: familyToken });
  };
  assert.equal(await integrated.client.complete(), true);
  assert.deepEqual(await integrated.client.generate([input]), [{ ...input, sentence: example }]);
  assert.equal(upstreamCalls, 1, 'The actual adapter and server contract agree, using a mocked OpenAI response');
  console.log('OpenAI sentence adapter: connection, privacy, exact cache, reuse, error and billing-loop checks passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
