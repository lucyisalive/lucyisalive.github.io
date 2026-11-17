'use strict';

const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const { create } = require('../ai-sentences.js');

const SITE = 'https://lucyisalive.github.io/magic-hanzi/';
const EXCHANGE = 'https://openrouter.ai/api/v1/auth/keys';
const CHAT = 'https://openrouter.ai/api/v1/chat/completions';
const CACHE_KEY = 'hanzi-ai-sentences-cache-v1';
const OLD_KEY = 'hanzi-ai-sentences-auth-v1';
const PKCE_KEY = 'hanzi-herbalist-ai-sentences-pkce-v1';
const FAKE_CODE = 'synthetic-authorization-code';
const FAKE_KEY = 'sk-or-v1-' + 'only-for-mocked-ai-tests';
const STALE_KEY = 'sk-or-v1-' + 'synthetic-stale-old-key';
const input = { char: '莞', word: '莞尔', pinyin: 'wǎn' };
const example = '听完同桌的故事，她不由得莞尔一笑。';
const cached = { char: '珊', word: '珊瑚', pinyin: 'shān', sentence: '小鱼躲进鲜红的珊瑚，避开了大鱼。' };

function storage(entries = []) {
  const values = new Map(entries);
  const reads = [];
  return {
    values,
    reads,
    getItem(key) { reads.push(key); return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

function browser({ href = SITE, localStorage = storage(), sessionStorage = storage() } = {}) {
  const calls = [];
  const redirects = [];
  const statusChanges = [];
  const win = {
    crypto: webcrypto,
    localStorage,
    sessionStorage,
    location: { href, assign: target => redirects.push(target) },
    history: {
      state: null,
      replaceState(_, unused, relative) { win.location.href = new URL(relative, win.location.href).href; },
    },
    async fetch(url, options) {
      const body = JSON.parse(options.body);
      calls.push({ url, options, body });
      const response = url === EXCHANGE ? { key: FAKE_KEY } : {
        choices: [{ message: { content: JSON.stringify({
          sentences: [
            { ...input, sentence: example, unrelated: 'ignored' },
            { char: '陌', word: '陌生', pinyin: 'mò', sentence: '来到完全陌生的地方，他先找到了车站。' },
          ],
        }) } }],
      };
      return { ok: true, status: 200, text: async () => JSON.stringify(response) };
    },
  };
  return { win, calls, redirects, statusChanges, client: create(win, status => statusChanges.push(status)) };
}

async function test() {
  const localStorage = storage([[CACHE_KEY, JSON.stringify([cached])]]);
  const sessionStorage = storage([[OLD_KEY, STALE_KEY]]);
  const start = browser({ href: SITE + 'index.html', localStorage, sessionStorage });
  assert.equal(start.client.status().connected, false);
  assert.equal(start.client.get(cached), null, 'The candidate’s manual sentence takes precedence over cached AI');
  assert.equal(start.client.get({ ...cached, sentence: undefined }), cached.sentence);
  assert.ok(!sessionStorage.reads.includes(OLD_KEY), 'Never consult the previously stored API key');
  await start.client.generate([input]);
  assert.deepEqual(start.calls, []);

  await start.client.begin();
  const [redirect] = start.redirects;
  const authorize = new URL(redirect);
  assert.equal(authorize.origin + authorize.pathname, 'https://openrouter.ai/auth');
  assert.equal(authorize.searchParams.get('callback_url'), SITE);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  const pending = JSON.parse(sessionStorage.values.get(PKCE_KEY));
  assert.equal(authorize.searchParams.get('state'), pending.state);
  assert.equal(authorize.searchParams.get('code_challenge'),
    createHash('sha256').update(pending.verifier).digest('base64url'));
  assert.deepEqual(start.calls, [], 'The authorization redirect itself does not contact either API');

  const params = new URLSearchParams({ code: FAKE_CODE, state: pending.state, view: 'practice' });
  const alias = browser({ href: SITE + 'index.html?' + params, localStorage, sessionStorage });
  assert.equal(await alias.client.complete(), false);
  assert.equal(sessionStorage.values.has(PKCE_KEY), true);
  assert.deepEqual(alias.calls, []);

  const finish = browser({ href: SITE + '?' + params + '#chapter', localStorage, sessionStorage });
  assert.equal(await finish.client.complete(), true);
  assert.equal(finish.win.location.href, SITE + '?view=practice#chapter');
  assert.equal(finish.client.status().connected, true);
  assert.equal(finish.statusChanges.at(-1).connected, true);
  assert.equal(sessionStorage.values.has(PKCE_KEY), false, 'The PKCE state is single use');
  assert.deepEqual([...sessionStorage.values], [[OLD_KEY, STALE_KEY]], 'The new key stays in the current page memory');
  assert.equal(finish.calls.length, 1);
  assert.deepEqual(finish.calls[0].body, {
    code: FAKE_CODE, code_verifier: pending.verifier, code_challenge_method: 'S256',
  });
  assert.equal(finish.calls[0].url, EXCHANGE);
  assert.equal(finish.calls[0].options.headers.Authorization, undefined);

  await finish.client.generate([
    { ...input, currentInk: [[1, 2]], progress: { passedDays: ['2026-11-15'] }, family: 'synthetic' },
    input,
    { char: '莞', word: '微笑', pinyin: 'wǎn' },
    { char: '甲', word: '甲 A 家', pinyin: 'jiǎ' },
    { char: '甲', word: '甲方', pinyin: 'jiǎ fāng' },
    { char: '笔', word: '毛笔', pinyin: 'bǐ', sentence: '家长自己的例句。' },
  ]);
  assert.equal(finish.calls.length, 2);
  const generated = finish.calls[1];
  assert.equal(generated.url, CHAT);
  assert.equal(generated.options.headers.Authorization, 'Bearer ' + FAKE_KEY);
  assert.equal(generated.options.credentials, 'omit');
  assert.equal(generated.options.referrerPolicy, 'no-referrer');
  assert.equal(generated.body.model, 'google/gemma-4-31b-it:free');
  assert.deepEqual(generated.body.provider.max_price, { prompt: 0, completion: 0, request: 0 });
  assert.deepEqual(JSON.parse(generated.body.messages.find(message => message.role === 'user').content), [input]);
  assert.equal(finish.client.get(input), example);
  assert.equal(finish.client.get({ char: '陌', word: '陌生', pinyin: 'mò' }), null, 'Discard unrequested output');
  assert.deepEqual(JSON.parse(localStorage.values.get(CACHE_KEY)), [cached, { ...input, sentence: example }]);

  finish.client.disconnect();
  assert.equal(finish.client.status().connected, false);
  assert.equal(finish.client.get(input), example);
  const reloaded = browser({ localStorage, sessionStorage });
  assert.equal(reloaded.client.status().connected, false);
  assert.equal(reloaded.client.get(input), example);
  await reloaded.client.generate([{ char: '陌', word: '陌生', pinyin: 'mò' }]);
  assert.deepEqual(reloaded.calls, []);

  for (const href of ['file:///synthetic/offline.html', 'https://lucyisalive.github.io/', 'https://lucyisalive.github.io/magic-hanzi-other/']) {
    const detached = browser({ href, localStorage: storage([...localStorage.values]), sessionStorage: storage([[OLD_KEY, STALE_KEY]]) });
    assert.equal(detached.client.get(input), null);
    assert.equal(detached.client.status().connected, false);
    await detached.client.begin();
    await detached.client.generate([input]);
    assert.equal(await detached.client.complete(), false);
    assert.deepEqual(detached.calls, []);
    assert.deepEqual(detached.redirects, []);
    assert.deepEqual(detached.win.localStorage.reads, []);
    assert.deepEqual(detached.win.sessionStorage.reads, []);
  }

  console.log('AI sentences: no stale key, exact PKCE callback, private candidate projection, disconnected cache, and offline gating passed.');
}

test().catch(error => { console.error(error); process.exitCode = 1; });
