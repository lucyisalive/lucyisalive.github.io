'use strict';

// All authorization and completions are synthetic. This suite never calls the
// real provider and contains no child data or usable credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');
const { create } = require('../ai-sentences.js');
const hints = require('../sentence-hints.js');

const SITE = 'https://lucyisalive.github.io/';
const PROVIDER = 'https://openrouter.ai';
const AUTH = '/api/v1/auth/keys';
const CHAT = '/api/v1/chat/completions';
const SESSION = 'hanzi-ai-sentences-auth-v1';
const PKCE = 'hanzi-ai-sentences-pkce-v1';
const CACHE = 'hanzi-ai-sentences-cache-v1';
const TEST_KEY = 'sk-or-v1-' + 'a'.repeat(64);
const TEST_CODE = 'synthetic-oauth-code';
const WOOD = Object.freeze({ char: '栏', word: '木栏杆', pinyin: 'lán' });
const STONE = Object.freeze({ char: '栏', word: '石栏杆', pinyin: 'lán' });
const BAMBOO = Object.freeze({ char: '栏', word: '竹栏杆', pinyin: 'lán' });
const EXAMPLES = {
  木栏杆: '桥上的木栏杆刷了新漆，我扶着它慢慢走。',
  石栏杆: '我扶着河边的石栏杆，看小鱼游过。',
  竹栏杆: '院里的竹栏杆围住了菜地，小鸡进不去。',
};

function memoryStorage() {
  const entries = new Map();
  return {
    entries,
    get length() { return entries.size; },
    key(index) { return [...entries.keys()][index] ?? null; },
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, String(value)); },
    removeItem(key) { entries.delete(key); },
  };
}
function clock() {
  let time = 0, next = 0;
  const tasks = new Map();
  return {
    setTimeout(fn, ms = 0) { tasks.set(++next, { at: time + ms, fn }); return next; },
    clearTimeout(id) { tasks.delete(id); },
    advance(ms) {
      const until = time + ms;
      for (let count = 0;; count++) {
        const due = [...tasks].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        assert.ok(count < 1000, 'Unexpected endless retry');
        tasks.delete(due[0]); time = due[1].at; due[1].fn();
      }
      time = until;
    },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const turn = () => new Promise(resolve => setImmediate(resolve));
async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out: ' + label)), 2500);
    })]);
  } finally { clearTimeout(timer); }
}
function response(status, data) {
  return { status, ok: status >= 200 && status < 300,
    json: async () => data, text: async () => JSON.stringify(data) };
}
function completion(rows) {
  return response(200, { choices: [{ message: { content: JSON.stringify({ sentences: rows }) } }] });
}
function echo(call) {
  return completion(call.items.map(item => ({ ...item,
    sentence: EXAMPLES[item.word] || `我在山路上看见${item.word}，就停下脚步仔细看。` })));
}
function server() {
  const calls = [];
  return { calls, exchanges: () => calls.filter(call => call.path === AUTH),
    chats: () => calls.filter(call => call.path === CHAT),
    exchange: () => response(200, { key: TEST_KEY }), chat: echo };
}
function browser({ remote = server(), local = memoryStorage(), session = memoryStorage(), href = SITE, crypto = webcrypto } = {}) {
  let current = new URL(href);
  const nav = [], history = [], events = [], timers = clock();
  const go = url => { current = new URL(String(url), current); nav.push(current.href); };
  const location = {
    get href() { return current.href; }, set href(url) { go(url); },
    get origin() { return current.origin; }, get protocol() { return current.protocol; },
    get pathname() { return current.pathname; }, get search() { return current.search; }, get hash() { return current.hash; },
    assign: go, replace: go, toString() { return current.href; },
  };
  const win = {
    location, localStorage: local, sessionStorage: session, crypto, TextEncoder, TextDecoder, AbortController,
    URL, URLSearchParams, btoa, atob, navigator: { onLine: true },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    history: { replaceState(data, title, url) {
      current = new URL(String(url), current); history.push(current.href);
    } },
    HanziSentenceHints: hints,
    async fetch(url, init = {}) {
      const parsed = new URL(String(url));
      assert.equal(parsed.origin, PROVIDER, 'No unrelated hosts receive requests');
      assert.ok(parsed.pathname === AUTH || parsed.pathname === CHAT, 'Only authorization or completion endpoints');
      assert.equal(init.method, 'POST');
      const body = JSON.parse(init.body);
      const call = { path: parsed.pathname, url: parsed, body, headers: new Headers(init.headers),
        signal: init.signal, pageAtRequest: current.href, redirect: init.redirect, referrerPolicy: init.referrerPolicy };
      if (call.path === CHAT) {
        const prompt = body.messages.find(message => message.role === 'user');
        assert.ok(prompt, 'A data-only user message is required');
        call.items = JSON.parse(prompt.content);
      }
      remote.calls.push(call);
      return call.path === AUTH ? remote.exchange(call) : remote.chat(call);
    },
  };
  return { win, local, session, remote, timers, nav, history, events, client: create(win, () => events.push('change')) };
}
function redirectBack(auth, { code = TEST_CODE, state = auth.searchParams.get('state'), extra = '' } = {}) {
  const callback = new URL(auth.searchParams.get('callback_url'));
  if (code !== null) callback.searchParams.set('code', code);
  if (state !== null) callback.searchParams.set('state', state);
  for (const [key, value] of new URLSearchParams(extra)) callback.searchParams.set(key, value);
  return callback.href;
}
async function begin(remote = server()) {
  const before = browser({ remote });
  await bounded(before.client.begin(), 'start authorization');
  assert.equal(before.nav.length, 1, 'Consent uses this tab, exactly one navigation');
  return { before, auth: new URL(before.nav[0]), remote };
}
async function connected(remote = server()) {
  const { before, auth } = await begin(remote);
  const after = browser({ remote, local: before.local, session: before.session, href: redirectBack(auth) });
  assert.equal(await bounded(after.client.complete(), 'complete authorization'), true);
  assert.equal(after.client.status().connected, true);
  return after;
}
function assertStatus(client, connectedValue, busyValue) {
  const status = client.status();
  assert.deepEqual(Object.keys(status).sort(), ['busy', 'connected', 'message']);
  assert.equal(status.connected, connectedValue);
  assert.equal(status.busy, busyValue);
  assert.equal(typeof status.message, 'string');
  assert.ok(!JSON.stringify(status).includes(TEST_KEY), 'A credential must never become a status message');
  return status;
}
function assertFreeRequest(call) {
  assert.equal(call.body.model, 'google/gemma-4-31b-it:free');
  assert.deepEqual(call.body.provider.only, ['google-ai-studio']);
  assert.equal(call.body.provider.allow_fallbacks, false);
  assert.equal(call.body.provider.require_parameters, true);
  assert.equal(call.body.provider.max_price.prompt, 0);
  assert.equal(call.body.provider.max_price.completion, 0);
  assert.equal(call.body.provider.max_price.request, 0);
  assert.deepEqual(call.body.response_format, { type: 'json_object' });
  assert.equal(call.headers.get('authorization'), 'Bearer ' + TEST_KEY);
  assert.equal(call.redirect, 'error', 'An authenticated request cannot follow another endpoint');
  assert.equal(call.referrerPolicy, 'no-referrer');
  assert.ok(!call.body.models && !call.body.fallbacks, 'Do not fall back to another model');
  assert.ok(Array.isArray(call.items));
  assert.ok(call.items.length >= 1 && call.items.length <= 6, 'A batch is capped at six words');
  for (const item of call.items) assert.deepEqual(Object.keys(item).sort(), ['char', 'pinyin', 'word']);
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('fresh and disconnected use is inert; no preinstalled credential', async () => {
  const d = browser({ crypto: null });
  assertStatus(d.client, false, false);
  assert.equal(d.client.get(WOOD), null);
  assert.equal(await d.client.complete(), false);
  await d.client.generate([WOOD]);
  await d.client.begin();
  assert.equal(d.remote.calls.length, 0);
  assert.equal(d.nav.length, 0);
  assert.equal(d.session.length, 0);
  assert.equal(d.local.length, 0);
  const source = fs.readFileSync(path.join(__dirname, '../ai-sentences.js'), 'utf8');
  assert.ok(!/sk-or-v1-[0-9a-f]{64}/i.test(source), 'No API credential in the shipped source');
  const globalWindow = {};
  vm.runInNewContext(source, { window: globalWindow });
  const exported = Object.values(globalWindow).find(value => value && typeof value.create === 'function');
  assert.ok(exported, 'The optional module must also load as a classic browser script');
});

test('explicit same-tab PKCE authorization and a one-use cleaned callback', async () => {
  const { before, auth, remote } = await begin();
  assert.equal(auth.origin, PROVIDER);
  assert.equal(auth.pathname, '/auth');
  assert.equal(auth.searchParams.get('callback_url'), SITE);
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(remote.calls.length, 0, 'Consent redirects, it does not exchange prematurely');
  const pending = JSON.parse(before.session.getItem(PKCE));
  assert.equal(pending.state, auth.searchParams.get('state'));
  assert.ok(typeof pending.state === 'string' && pending.state.length >= 22);
  assert.match(pending.verifier, /^[A-Za-z0-9._~-]{43,128}$/);
  assert.equal(auth.searchParams.get('code_challenge'), createHash('sha256').update(pending.verifier).digest('base64url'));
  assert.ok(!auth.href.includes(pending.verifier), 'A verifier must not be sent to the authorization page');
  assert.equal(before.local.getItem(PKCE), null);
  const distinct = await begin();
  assert.notEqual(auth.searchParams.get('state'), distinct.auth.searchParams.get('state'));
  assert.notEqual(auth.searchParams.get('code_challenge'), distinct.auth.searchParams.get('code_challenge'));

  const callback = redirectBack(auth, { extra: 'test_view=keep' });
  const after = browser({ remote, local: before.local, session: before.session, href: callback });
  assert.equal(await after.client.complete(), true);
  assertStatus(after.client, true, false);
  const [exchange] = remote.exchanges();
  assert.equal(remote.exchanges().length, 1);
  assert.deepEqual(exchange.body, { code: TEST_CODE, code_verifier: pending.verifier, code_challenge_method: 'S256' });
  assert.equal(exchange.headers.get('authorization'), null);
  assert.equal(exchange.redirect, 'error');
  assert.equal(exchange.referrerPolicy, 'no-referrer');
  const atExchange = new URL(exchange.pageAtRequest);
  assert.equal(atExchange.searchParams.get('test_view'), 'keep');
  assert.equal(atExchange.searchParams.has('code'), false, 'Remove the callback code before exchange');
  assert.equal(atExchange.searchParams.has('state'), false);
  assert.equal(after.session.getItem(PKCE), null);
  assert.equal(after.session.getItem(SESSION), TEST_KEY);
  assert.ok(!JSON.stringify([...after.local.entries]).includes(TEST_KEY));
  assert.equal(await after.client.complete(), false);
  const replay = browser({ remote, local: after.local, session: after.session, href: callback });
  assert.equal(await replay.client.complete(), false);
  assert.equal(remote.exchanges().length, 1, 'Refresh/replay cannot exchange a one-use code again');
});

test('incorrect, missing, expired, foreign-tab and unsolicited callbacks do not exchange', async () => {
  for (const kind of ['wrong-state', 'missing-code', 'expired', 'foreign-tab', 'unsolicited', 'duplicate-code', 'storage-refuses-consumption']) {
    const { before, auth, remote } = await begin();
    const session = kind === 'foreign-tab' || kind === 'unsolicited' ? memoryStorage() : before.session;
    if (kind === 'expired') {
      const pending = JSON.parse(session.getItem(PKCE));
      pending.createdAt = Date.now() - 24 * 60 * 60 * 1000;
      session.setItem(PKCE, JSON.stringify(pending));
    }
    let callback = redirectBack(auth, {
      code: kind === 'missing-code' ? null : TEST_CODE,
      state: kind === 'wrong-state' ? 'not-the-consented-state' : auth.searchParams.get('state'),
    });
    if (kind === 'duplicate-code') callback += '&code=another-code';
    if (kind === 'storage-refuses-consumption') session.removeItem = () => { throw new Error('synthetic storage failure'); };
    const after = browser({ remote, session, href: callback });
    assert.equal(await after.client.complete(), false, kind);
    assert.equal(remote.calls.length, 0, kind);
    assertStatus(after.client, false, false);
  }
  const foreign = browser({ href: 'https://unrelated.invalid/' });
  await foreign.client.begin();
  assert.equal(foreign.nav.length, 0, 'Another site cannot start the production callback flow');
  assert.equal(foreign.remote.calls.length, 0);
});

test('provider denial and invalid exchange replies keep the local game disconnected', async () => {
  const denied = await begin();
  const afterDenial = browser({ remote: denied.remote, session: denied.before.session,
    href: redirectBack(denied.auth, { code: null, state: null, extra: 'error=access_denied&error_description=synthetic-detail' }) });
  assert.equal(await afterDenial.client.complete(), false);
  assert.equal(denied.remote.calls.length, 0);
  assertStatus(afterDenial.client, false, false);
  assert.ok(!new URL(afterDenial.win.location.href).searchParams.has('error_description'));
  for (const reply of [response(400, { error: { message: TEST_KEY } }), response(200, { key: 'not-an-api-key' })]) {
    const { before, auth, remote } = await begin();
    remote.exchange = () => reply;
    const after = browser({ remote, session: before.session, href: redirectBack(auth) });
    assert.equal(await after.client.complete(), false);
    assert.equal(remote.exchanges().length, 1);
    assert.equal(after.session.getItem(SESSION), null);
    assertStatus(after.client, false, false);
  }
});

test('project only three word fields and route exclusively to the free model', async () => {
  const d = await connected();
  const item = Object.freeze({ ...WOOD,
    rawS: 'SYNTHETIC_PRIVATE_RAW_INK', inkLog: ['SYNTHETIC_PRIVATE_LOG'],
    history: ['SYNTHETIC_PRIVATE_HISTORY'], familyCode: 'SYNTHETIC_PRIVATE_CODE',
    playerReview: { note: 'SYNTHETIC_PRIVATE_REVIEW' }, savedState: 'SYNTHETIC_PRIVATE_SAVE',
  });
  await d.client.generate([item, item,
    { ...STONE, sentence: '家长给这道题写了自己的短句。' },
    { char: '园', word: '公元', pinyin: 'yuán' },
    { char: '栏', word: '栏杆<script>', pinyin: 'lán' },
    { char: '栏杆', word: '木栏杆', pinyin: 'lán' },
    { char: '栏', word: '栏', pinyin: 'lán' },
    { char: '栏', word: '栏'.repeat(13), pinyin: 'lán' },
  ]);
  assert.equal(d.remote.chats().length, 1);
  const [chat] = d.remote.chats();
  assertFreeRequest(chat);
  assert.deepEqual(chat.items, [WOOD]);
  assert.ok(!JSON.stringify(chat.body).includes('SYNTHETIC_PRIVATE_'));
  assert.equal(d.client.get(WOOD), EXAMPLES.木栏杆);
  assert.equal(d.client.get(STONE), null);
  assert.equal(item.rawS, 'SYNTHETIC_PRIVATE_RAW_INK', 'Do not change caller data');
  assertStatus(d.client, true, false);
});

test('reject cross-word, wrong-reading, contradictory and filler completions', async () => {
  const invalidRows = [
    { ...STONE, sentence: EXAMPLES.石栏杆 },
    { ...WOOD, char: '杆', pinyin: 'gān', sentence: EXAMPLES.木栏杆 },
    { ...WOOD, pinyin: 'làn', sentence: EXAMPLES.木栏杆 },
    { ...WOOD, sentence: '桥上的木栏竿刷了新漆，我扶着它过桥。' },
    { ...WOOD, sentence: '我在词语本上记下了木栏杆。' },
    { ...WOOD, sentence: '老师教我读木栏杆这个词。' },
    { ...WOOD, sentence: '老师让我用“木栏杆”造句。' },
    { ...WOOD, sentence: '我在书上读到了木栏杆。' },
    { ...WOOD, sentence: '我在词语表上读到了木栏杆。' },
    { ...WOOD, sentence: '我在词语表里找到了木栏杆。' },
    { ...WOOD, sentence: '我翻开书，在生字表里发现了木栏杆。' },
    { ...WOOD, sentence: '今天老师让大家把木栏杆抄三遍。' },
    { ...WOOD, sentence: '课本里写着木栏杆。' },
    { ...WOOD, sentence: '木栏杆。' },
    { ...WOOD, sentence: '我扶着木栏杆看鱼。姐姐也走过来了。' },
    { ...WOOD, sentence: '我扶着木栏杆看鱼。\n' + '她看着我。' },
    { ...WOOD, sentence: '桥上的木栏杆<svg>刷了新漆。' },
    { ...WOOD, sentence: '我扶着木栏杆，' + '慢'.repeat(40) + '慢走。' },
    { ...WOOD, sentence: null },
  ];
  for (const row of invalidRows) {
    const remote = server(); remote.chat = () => completion([row]);
    const d = await connected(remote);
    await d.client.generate([WOOD]);
    assert.equal(d.client.get(WOOD), null, JSON.stringify(row));
    assert.equal(d.client.get(STONE), null, 'Never write to an unrequested identity');
    assertStatus(d.client, true, false);
  }
});

test('a preceding reference to a book does not block an unrelated real context', async () => {
  const remote = server();
  const sentence = '我们合上课本，到操场边扶着木栏杆看小鱼。';
  remote.chat = () => completion([{ ...WOOD, sentence }]);
  const d = await connected(remote);
  await d.client.generate([WOOD]);
  assert.equal(d.client.get(WOOD), sentence);
});

test('a dated response for the selected free model can provide a valid hint', async () => {
  const remote = server();
  remote.chat = () => response(200, { model: 'google/gemma-4-31b-it-20260402:free', choices: [{
    finish_reason: 'stop', message: { content: JSON.stringify({ sentences: [{ ...WOOD, sentence: EXAMPLES.木栏杆 }] }) },
  }] });
  const d = await connected(remote);
  await d.client.generate([WOOD]);
  assertFreeRequest(remote.chats()[0]);
  assert.equal(d.client.get(WOOD), EXAMPLES.木栏杆);
});

test('malformed results and quota or offline errors do not invent a hint or switch models', async () => {
  const replies = [
    () => response(200, { choices: [] }),
    () => response(200, { choices: [{ message: { content: '这不是规定的返回格式。' } }] }),
    () => response(200, { choices: [{ message: { content: '{}' } }] }),
    () => response(200, { model: 'openrouter/auto', choices: [{ message: {
      content: JSON.stringify({ sentences: [{ ...WOOD, sentence: EXAMPLES.木栏杆 }] }) } }] }),
    () => response(200, { choices: [{ finish_reason: 'content_filter', message: {
      content: JSON.stringify({ sentences: [{ ...WOOD, sentence: EXAMPLES.木栏杆 }] }) } }] }),
    () => completion([]),
    () => response(429, { error: { message: TEST_KEY } }),
    () => { throw new Error('synthetic offline'); },
  ];
  for (const reply of replies) {
    const remote = server(); remote.chat = reply;
    const d = await connected(remote);
    await bounded(d.client.generate([WOOD]), 'unavailable completion');
    assert.equal(d.client.get(WOOD), null);
    assert.equal(remote.chats().length, 1, 'Failure must not retry a different route');
    assertFreeRequest(remote.chats()[0]);
    assert.equal(d.client.status().busy, false);
    assert.ok(!d.client.status().message.includes(TEST_KEY));
    assert.equal(hints.get({ char: '园', word: '公园' }), '我们去公园放风筝。', 'Local reviewed hints remain available');
  }
});

test('ambiguous duplicates and corrupted stored rows cannot enter the usable cache', async () => {
  const remote = server();
  remote.chat = () => completion([
    { ...WOOD, sentence: EXAMPLES.木栏杆 },
    { ...WOOD, sentence: '雨停后，爷爷给院里的木栏杆刷了新漆。' },
    { ...STONE, sentence: EXAMPLES.石栏杆 },
    { ...BAMBOO, sentence: EXAMPLES.竹栏杆 },
  ]);
  const d = await connected(remote);
  await d.client.generate([WOOD, STONE]);
  assert.equal(d.client.get(WOOD), null, 'Do not guess which duplicate was intended');
  assert.equal(d.client.get(STONE), EXAMPLES.石栏杆, 'Unambiguous sibling is still usable');
  assert.equal(d.client.get(BAMBOO), null, 'Do not cache a word not asked for');
  d.local.setItem(CACHE, JSON.stringify([
    { ...WOOD, sentence: EXAMPLES.木栏杆 },
    { ...STONE, sentence: '我在词语本上记下了石栏杆。' },
    { ...BAMBOO, sentence: '我扶着竹竿看小鱼。' },
  ]));
  const offline = browser({ remote, local: d.local });
  assertStatus(offline.client, false, false);
  assert.equal(offline.client.get(WOOD), EXAMPLES.木栏杆);
  assert.equal(offline.client.get(STONE), null, 'Validate the cached sentence too');
  assert.equal(offline.client.get(BAMBOO), null, 'A stored homophone cannot masquerade as an exact word');
  assert.equal(remote.chats().length, 1);
});

test('revoked provider authorization does not retry, expose errors, or erase good hints', async () => {
  const d = await connected();
  await d.client.generate([WOOD]);
  d.remote.chat = () => response(401, { error: { message: TEST_KEY } });
  await d.client.generate([STONE]);
  assertStatus(d.client, false, false);
  assert.equal(d.session.getItem(SESSION), null);
  assert.equal(d.client.get(STONE), null);
  assert.equal(d.client.get(WOOD), EXAMPLES.木栏杆);
  await d.client.generate([BAMBOO]);
  assert.equal(d.remote.chats().length, 2, 'No further request until consent is renewed');
});

test('forbidden generation retains authorization and the next explicit request can succeed', async () => {
  const d = await connected();
  await d.client.generate([WOOD]);
  d.remote.chat = () => response(403, { error: { message: TEST_KEY } });
  await d.client.generate([STONE]);
  assertStatus(d.client, true, false);
  assert.equal(d.session.getItem(SESSION), TEST_KEY);
  assert.equal(d.client.get(STONE), null);
  assert.equal(d.client.get(WOOD), EXAMPLES.木栏杆);
  assert.match(d.client.status().message, /请求被服务拒绝/);
  assert.ok(!d.client.status().message.includes(TEST_KEY));
  d.remote.chat = () => completion([{ ...STONE, sentence: EXAMPLES.石栏杆 }]);
  await d.client.generate([STONE]);
  assert.equal(d.client.get(STONE), EXAMPLES.石栏杆);
  assert.equal(d.remote.chats().length, 3);
});

test('cache keys distinguish full spelling, target character and selected reading', async () => {
  const heavy = { char: '重', word: '重重', pinyin: 'zhòng' };
  const many = { ...heavy, pinyin: 'chóng' };
  const yuanA = { char: '园', word: '花园圆门', pinyin: 'yuán' };
  const yuanB = { ...yuanA, char: '圆' };
  const results = [
    { ...WOOD, sentence: EXAMPLES.木栏杆 }, { ...STONE, sentence: EXAMPLES.石栏杆 },
    { ...heavy, sentence: '箱子从车上滑落，重重地摔在地上。' },
    { ...many, sentence: '山路上有重重困难，我们一起想办法。' },
    { ...yuanA, sentence: '外婆在花园圆门旁等我们。' },
    { ...yuanB, sentence: '我们穿过花园圆门，去看池塘里的小鱼。' },
  ];
  const remote = server(); remote.chat = call => completion(results.filter(row =>
    call.items.some(item => item.char === row.char && item.word === row.word && item.pinyin === row.pinyin)));
  const d = await connected(remote);
  const queries = results.map(({ sentence, ...item }) => item);
  await d.client.generate(queries);
  for (const [i, item] of queries.entries()) assert.equal(d.client.get(item), results[i].sentence);
  assert.equal(remote.chats().length, 1);
  assert.ok(d.local.getItem(CACHE), 'Validated sentences are persisted for later play');
  assert.ok(!d.local.getItem(CACHE).includes(TEST_KEY));
  const fresh = browser({ remote, local: d.local, session: memoryStorage() });
  assertStatus(fresh.client, false, false);
  for (const [i, item] of queries.entries()) assert.equal(fresh.client.get(item), results[i].sentence, 'A new tab can read cached examples without auth');
  assert.equal(fresh.client.get(BAMBOO), null, 'Do not reuse the cache for a different whole word');
  const reload = browser({ remote, local: d.local, session: d.session });
  assertStatus(reload.client, true, false);
  await reload.client.generate(queries);
  assert.equal(remote.chats().length, 1, 'Do not send already cached words again');
  reload.client.disconnect();
  assertStatus(reload.client, false, false);
  assert.equal(d.session.getItem(SESSION), null);
  assert.equal(reload.client.get(WOOD), EXAMPLES.木栏杆, 'Disconnect retains validated examples');
});

test('disconnect invalidates a late completion even when transport ignores abort', async () => {
  const remote = server(), arrived = deferred(), late = deferred();
  remote.chat = call => { arrived.resolve(call); return late.promise; };
  const d = await connected(remote);
  const pending = d.client.generate([WOOD]);
  const call = await bounded(arrived.promise, 'completion begins');
  assertStatus(d.client, true, true);
  d.client.disconnect();
  assertStatus(d.client, false, false);
  assert.equal(d.session.getItem(SESSION), null);
  assert.equal(call.signal?.aborted, true);
  late.resolve(echo(call));
  await bounded(pending, 'late completion settles');
  assert.equal(d.client.get(WOOD), null);
  assert.equal(browser({ remote, local: d.local }).client.get(WOOD), null, 'Late response must not reach persistent cache');
  await d.client.generate([STONE]);
  assert.equal(remote.chats().length, 1);
});

test('disconnect invalidates a late credential exchange', async () => {
  const { before, auth, remote } = await begin();
  const arrived = deferred(), late = deferred();
  remote.exchange = call => { arrived.resolve(call); return late.promise; };
  const d = browser({ remote, session: before.session, href: redirectBack(auth) });
  const pending = d.client.complete();
  const call = await bounded(arrived.promise, 'exchange begins');
  assert.equal(await d.client.complete(), false, 'Concurrent callback is not exchanged twice');
  d.client.disconnect();
  late.resolve(response(200, { key: TEST_KEY }));
  assert.equal(await bounded(pending, 'late credential settles'), false);
  assert.equal(call.signal?.aborted, true);
  assert.equal(d.session.getItem(SESSION), null);
  assertStatus(d.client, false, false);
});

test('a hanging request or response body times out and releases the queue', async () => {
  for (const stage of ['headers', 'body']) {
    const remote = server(), arrived = deferred(), never = new Promise(() => {});
    remote.chat = call => {
      arrived.resolve(call);
      return stage === 'headers' ? never : { ok: true, status: 200, text: () => never };
    };
    const d = await connected(remote);
    const pending = d.client.generate([WOOD]);
    const call = await bounded(arrived.promise, 'hung completion begins: ' + stage);
    d.timers.advance(20000);
    await bounded(pending, 'completion timeout: ' + stage);
    assert.equal(call.signal?.aborted, true);
    assert.equal(d.client.get(WOOD), null);
    assertStatus(d.client, true, false);
    remote.chat = echo;
    await bounded(d.client.generate([STONE]), 'subsequent completion');
    assert.equal(d.client.get(STONE), EXAMPLES.石栏杆);
  }
});

test('queue chunks large imports without concurrent or unlimited model calls', async () => {
  const remote = server(), arrived = deferred(), unblock = deferred();
  let active = 0, peak = 0;
  remote.chat = async call => {
    active++; peak = Math.max(peak, active);
    try {
      if (remote.chats().length === 1) { arrived.resolve(call); await unblock.promise; }
      return completion([]);
    } finally { active--; }
  };
  const d = await connected(remote);
  const inputs = Array.from({ length: 60 }, (_, i) => ({ char: '山', word: '山间小路' + String.fromCharCode(0x4e00 + i), pinyin: 'shān' }));
  const first = d.client.generate(inputs.slice(0, 40));
  await bounded(arrived.promise, 'first batch');
  const second = d.client.generate(inputs.slice(40));
  await turn();
  assert.equal(remote.chats().length, 1, 'Keep only one active request');
  unblock.resolve();
  await bounded(Promise.all([first, second]), 'drain bounded batches');
  const chats = remote.chats();
  assert.ok(chats.length >= 2);
  assert.equal(peak, 1);
  for (const chat of chats) assertFreeRequest(chat);
  assert.ok(chats.flatMap(call => call.items).length <= 24, 'At most 24 queued or active words');
  assertStatus(d.client, true, false);
});

(async () => {
  for (const { name, run } of tests) { await run(); console.log('OK ' + name); }
  console.log(`AI sentences: ${tests.length} synthetic authorization, validation and queue scenarios passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
