'use strict';

// Local SQLite, synthetic encrypted credentials, and mocked model responses only.
// Never reads .env files or makes a real network/API request.
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto, createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const vm = require('node:vm');
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const SITE = 'https://sentence-test.example', GAME = 'https://lucyisalive.github.io';
const TOKEN = 'a'.repeat(64), OTHER_TOKEN = 'b'.repeat(64);
const API_KEY = 'sk-test-worker-only-0123456789abcdef';
const OWNER_UID = 'site-scoped-owner-uid', OWNER_EMAIL = 'owner@example.test';
const WRAPPING = Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index + 1)).toString('base64url');
const ENV = { HANZI_KEY_WRAPPING_SECRET: WRAPPING, HANZI_SITE_ID: 'sentence-test-site', HANZI_OWNER_EMAIL: OWNER_EMAIL };
const ITEM = { char: '珊', word: '珊瑚', pinyin: 'shān' };
const SECOND = { char: '羽', word: '羽毛', pinyin: 'yǔ' };
const ROW = { ...ITEM, sentence: '小鱼躲进鲜红的珊瑚，避开了大鱼。' };
const hash = value => createHash('sha256').update(value).digest('hex');
const identity = (uid = OWNER_UID, email = OWNER_EMAIL) => ({ 'oai-authenticated-user-id': uid, 'oai-authenticated-user-email': email });

function request(route, { method = ['/', '/pair', '/health'].includes(route) ? 'GET' : 'POST', origin, token, body, headers = {} } = {}) {
  const all = { ...headers };
  if (origin === undefined) origin = route === '/health' || route === '/v1/sentences' ? GAME : (method === 'GET' ? null : SITE);
  if (origin !== null) all.Origin = origin;
  if (token !== undefined && token !== null) all.Authorization = `Bearer ${token}`;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!Object.keys(all).some(key => key.toLowerCase() === 'content-type')) all['Content-Type'] = 'application/json';
    body = typeof body === 'string' ? body : JSON.stringify(body === undefined ? { items: [ITEM] } : body);
  }
  return new Request(SITE + route, { method, headers: all, body });
}
function binding(database, trace) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() { await Promise.resolve(); trace.push({ sql, params: [...params] }); return database.prepare(sql).get(...params) || null; },
        async run() {
          await Promise.resolve(); trace.push({ sql, params: [...params] });
          const result = database.prepare(sql).run(...params);
          return { success: true, meta: { changes: Number(result.changes) } };
        }
      };
      return statement;
    }
  };
}
async function envelope() {
  const key = await webcrypto.subtle.importKey('raw', Buffer.from(WRAPPING, 'base64url'), 'AES-GCM', false, ['encrypt']);
  const iv = new Uint8Array(12).fill(7);
  const encrypted = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('hanzi-sentence-openai-key-v1'), tagLength: 128 }, key, new TextEncoder().encode(API_KEY));
  return { version: 1, iv: Buffer.from(iv).toString('base64url'), ciphertext: Buffer.from(encrypted).toString('base64url') };
}
async function errorCode(response, status, code) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error: { code } });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
}

(async () => {
  const { createSentenceWorker, SENTENCE_WORKER_SCHEMA } = await import(pathToFileURL(path.join(__dirname, '../server/sentence-worker.mjs')));
  const wrapped = await envelope();
  function setup({ fetchImpl, now = () => 0, initialize = true } = {}) {
    const database = new DatabaseSync(':memory:'), trace = [], calls = [];
    if (initialize) for (const sql of SENTENCE_WORKER_SCHEMA) database.exec(sql);
    const DB = binding(database, trace), env = { ...ENV, DB };
    const app = createSentenceWorker({ now, cryptoImpl: webcrypto, fetchImpl: fetchImpl || (async (url, options) => {
      calls.push({ url, options });
      const input = JSON.parse(JSON.parse(options.body).input[1].content[0].text).items;
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [
        { type: 'output_text', text: JSON.stringify({ sentences: input.map(item => ({ ...item, sentence: item.word === '珊瑚' ? ROW.sentence : '小鸟抖了抖羽毛，飞向高高的树梢。' })) }) }
      ] }] }));
    }) });
    async function bootstrap() {
      const response = await app.fetch(request('/admin/bootstrap', { body: wrapped }), { ...env, HANZI_BOOTSTRAP_ENABLED: 'true' });
      assert.equal(response.status, 201);
    }
    async function pair(token = TOKEN) {
      const response = await app.fetch(request('/admin/pair', { headers: identity(), body: { token } }), env);
      assert.equal(response.status, 200);
    }
    return { database, trace, calls, DB, env, app, bootstrap, pair };
  }
  let checks = 0;
  async function check(name, fn) { await fn(); checks++; console.log(`ok ${checks} - ${name}`); }

  await check('merged migrations create all tables and bootstrap is disabled by default', async () => {
    const { database, app, env, trace } = setup();
    assert.equal(SENTENCE_WORKER_SCHEMA.length, 6);
    assert(Object.isFrozen(SENTENCE_WORKER_SCHEMA));
    const count = trace.length;
    await errorCode(await app.fetch(request('/admin/bootstrap', { body: wrapped }), env), 404, 'not_found');
    assert.equal(trace.length, count, 'disabled bootstrap must not query credentials');
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM hanzi_sentence_credentials').get().n, 0);
    database.close();
  });

  await check('bootstrap requires same-origin bounded JSON, validates wrapping, and cannot overwrite', async () => {
    const { database, app, env } = setup();
    const enabled = { ...env, HANZI_BOOTSTRAP_ENABLED: 'true' };
    for (const origin of [null, GAME, `${SITE}.evil`]) {
      await errorCode(await app.fetch(request('/admin/bootstrap', { body: wrapped, origin }), enabled), 403, 'origin_forbidden');
    }
    await errorCode(await app.fetch(request('/admin/bootstrap', { body: { ...wrapped, private: 'secret' } }), enabled), 400, 'invalid_envelope');
    await errorCode(await app.fetch(request('/admin/bootstrap', { body: wrapped, headers: { 'Content-Type': 'text/plain' } }), enabled), 415, 'unsupported_media_type');
    await errorCode(await app.fetch(request('/admin/bootstrap', { body: ' '.repeat(2049) }), enabled), 413, 'request_too_large');
    await errorCode(await app.fetch(request('/admin/bootstrap', { body: wrapped }), { ...enabled, HANZI_KEY_WRAPPING_SECRET: 'Z'.repeat(43) }), 400, 'invalid_envelope');
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM hanzi_sentence_credentials').get().n, 0);
    const initialized = await app.fetch(request('/admin/bootstrap', { body: wrapped }), enabled);
    assert.equal(initialized.status, 201);
    assert.deepEqual(await initialized.json(), { initialized: true });
    await errorCode(await app.fetch(request('/admin/bootstrap', { body: wrapped }), enabled), 409, 'key_already_initialized');
    const stored = database.prepare('SELECT * FROM hanzi_sentence_credentials').get();
    assert.equal(stored.ciphertext, wrapped.ciphertext);
    assert(!JSON.stringify(stored).includes(API_KEY));
    await errorCode(await app.fetch(request('/admin/bootstrap', { body: wrapped }), env), 404, 'not_found');
    database.close();
  });

  await check('pair page redirects anonymous visitors and pins the trusted Site-scoped owner UID', async () => {
    const { database, app, env } = setup();
    const redirect = await app.fetch(request('/pair'), env);
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('Location'), '/signin-with-chatgpt?return_to=%2Fpair');
    await errorCode(await app.fetch(request('/pair', { headers: identity('wrong-uid', 'other@example.test') }), env), 403, 'owner_forbidden');
    const page = await app.fetch(request('/pair', { headers: identity() }), env);
    assert.equal(page.status, 200);
    const html = await page.text();
    for (const privateValue of [API_KEY, WRAPPING, TOKEN, OWNER_UID, OWNER_EMAIL]) assert(!html.includes(privateValue));
    assert.match(page.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    assert.equal(database.prepare('SELECT owner_uid FROM hanzi_sentence_pairing WHERE id=1').get().owner_uid, OWNER_UID);
    await errorCode(await app.fetch(request('/pair', { headers: identity('another-scoped-uid') }), env), 403, 'owner_forbidden');
    assert.equal((await app.fetch(request('/pair', { headers: identity(OWNER_UID, 'changed@example.test') }), env)).status, 200);
    database.close();
  });

  await check('racing first-owner pins cannot replace the UID selected by the database', async () => {
    const { database, app, env } = setup();
    const responses = await Promise.all(['scoped-first', 'scoped-second'].map(uid => app.fetch(request('/pair', { headers: identity(uid) }), env)));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 403]);
    const pinned = database.prepare('SELECT owner_uid FROM hanzi_sentence_pairing').get().owner_uid;
    assert(['scoped-first', 'scoped-second'].includes(pinned));
    database.close();
  });

  await check('admin pairing enforces CSRF, owner identity, exact token data, and stores only SHA256', async () => {
    const { database, app, env, pair } = setup();
    await errorCode(await app.fetch(request('/admin/pair', { body: { token: TOKEN } }), env), 401, 'identity_required');
    for (const origin of [null, GAME, `${SITE}.evil`]) {
      await errorCode(await app.fetch(request('/admin/pair', { headers: identity(), body: { token: TOKEN }, origin }), env), 403, 'origin_forbidden');
    }
    for (const body of [{ token: 'short' }, { token: API_KEY }, { token: TOKEN, ink: [] }, { token: 'z'.repeat(64) }]) {
      await errorCode(await app.fetch(request('/admin/pair', { headers: identity(), body }), env), 400, 'invalid_pairing_token');
    }
    await errorCode(await app.fetch(request('/admin/pair', { headers: identity(), body: ' '.repeat(257) }), env), 413, 'request_too_large');
    await pair();
    let stored = database.prepare('SELECT * FROM hanzi_sentence_pairing').get();
    assert.equal(stored.family_hash, hash(TOKEN));
    assert(!JSON.stringify(stored).includes(TOKEN));
    await errorCode(await app.fetch(request('/admin/pair', { headers: identity('impostor'), body: { token: OTHER_TOKEN } }), env), 403, 'owner_forbidden');
    await pair(OTHER_TOKEN);
    stored = database.prepare('SELECT * FROM hanzi_sentence_pairing').get();
    assert.equal(stored.owner_uid, OWNER_UID);
    assert.equal(stored.family_hash, hash(OTHER_TOKEN));
    database.close();
  });

  await check('popup bridge checks both message origin and source and posts only to the exact game origin', async () => {
    const { database, app, env } = setup();
    const page = await app.fetch(request('/pair', { headers: identity() }), env);
    const html = await page.text(), script = html.match(/<script nonce="[^"]+">([\s\S]+)<\/script>/)[1];
    const posted = [], requests = [], status = { textContent: '' };
    let listener;
    const opener = { postMessage(data, origin) { posted.push({ data, origin }); } };
    const window = { opener, addEventListener(name, fn) { assert.equal(name, 'message'); listener = fn; } };
    vm.runInNewContext(script, { window, document: { getElementById() { return status; } }, fetch: async (url, options) => {
      requests.push({ url, options }); return { ok: true };
    } });
    assert.equal(posted[0].data.type, 'hanzi-sentence-pair-request');
    assert.equal(posted[0].origin, GAME);
    const message = { type: 'hanzi-sentence-pair-token', token: TOKEN };
    await listener({ origin: 'https://evil.example', source: opener, data: message });
    await listener({ origin: GAME, source: {}, data: message });
    await listener({ origin: GAME, source: opener, data: { ...message, ink: [] } });
    assert.equal(requests.length, 0);
    await listener({ origin: GAME, source: opener, data: message });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/admin/pair');
    assert.equal(requests[0].options.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(requests[0].options.body), { token: TOKEN });
    assert.equal(posted[1].data.type, 'hanzi-sentence-paired');
    assert.equal(posted[1].origin, GAME);
    assert.equal(Object.keys(posted[1].data).length, 1);
    assert(!status.textContent.includes(TOKEN));
    await listener({ origin: GAME, source: opener, data: message });
    assert.equal(requests.length, 1);
    database.close();
  });

  await check('preflight needs no database, no token, and no key decryption', async () => {
    const { database, app, trace } = setup();
    const response = await app.fetch(request('/v1/sentences', { method: 'OPTIONS', headers: {
      'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type'
    } }), {});
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), GAME);
    assert.equal(trace.length, 0);
    await errorCode(await app.fetch(request('/v1/sentences', { method: 'OPTIONS', origin: 'https://evil.example', headers: {
      'Access-Control-Request-Method': 'POST'
    } }), {}), 403, 'origin_forbidden');
    database.close();
  });

  await check('unauthorized requests cannot decrypt keys or invoke a model', async () => {
    const { database, app, env, trace, calls, pair, bootstrap } = setup();
    await bootstrap(); await pair(); trace.length = 0;
    for (const token of [undefined, 'short', API_KEY, OTHER_TOKEN]) {
      const response = await app.fetch(request('/health', { token }), env);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), GAME);
      await errorCode(response, 401, 'unauthorized');
    }
    await errorCode(await app.fetch(request('/health', { token: TOKEN, origin: 'https://evil.example' }), env), 403, 'origin_forbidden');
    assert(!trace.some(entry => entry.sql.includes('hanzi_sentence_credentials')));
    assert.equal(calls.length, 0);
    database.close();
  });

  await check('complete API path decrypts only in memory, caches in D1, and preserves the service contract', async () => {
    const { database, app, env, calls, pair, bootstrap } = setup();
    await bootstrap(); await pair();
    const health = await app.fetch(request('/health', { token: TOKEN }), env);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ready: true });
    const response = await app.fetch(request('/v1/sentences', { token: TOKEN }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sentences: [ROW] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
    assert.equal(calls[0].options.headers.Authorization, `Bearer ${API_KEY}`);
    const providerBody = JSON.parse(calls[0].options.body);
    assert.equal(providerBody.model, 'gpt-6.1-terra');
    assert.equal(providerBody.store, false);
    for (const value of [API_KEY, WRAPPING, TOKEN, OWNER_EMAIL]) assert(!calls[0].options.body.includes(value));
    assert.equal((await app.fetch(request('/v1/sentences', { token: TOKEN }), env)).status, 200);
    assert.equal(calls.length, 1);
    const rows = database.prepare('SELECT * FROM hanzi_sentence_cache').all();
    assert.equal(rows.length, 1);
    assert.deepEqual(JSON.parse(rows[0].value), ROW);
    database.close();
  });

  await check('native family fingerprint is preferred, cannot be replayed as Bearer, and avoids fake re-pair success', async () => {
    const { database, app, env, pair, bootstrap } = setup();
    await bootstrap(); await pair(OTHER_TOKEN);
    const native = { ...env, HANZI_FAMILY_HASH: hash(TOKEN).toUpperCase() };
    assert.equal((await app.fetch(request('/health', { token: TOKEN }), native)).status, 200);
    await errorCode(await app.fetch(request('/health', { token: hash(TOKEN) }), native), 401, 'unauthorized');
    await errorCode(await app.fetch(request('/health', { token: OTHER_TOKEN }), native), 401, 'unauthorized');
    await errorCode(await app.fetch(request('/health', { token: TOKEN }), { ...native, HANZI_FAMILY_HASH: 'bad' }), 503, 'service_unconfigured');
    await errorCode(await app.fetch(request('/admin/pair', { headers: identity(), body: { token: TOKEN } }), native), 409, 'pairing_managed');
    assert.equal(database.prepare('SELECT family_hash FROM hanzi_sentence_pairing').get().family_hash, hash(OTHER_TOKEN));
    database.prepare('DELETE FROM hanzi_sentence_pairing').run();
    assert.equal((await app.fetch(request('/health', { token: TOKEN }), native)).status, 200, 'native fingerprint supports the initial family before popup pairing');
    database.close();
  });

  await check('re-pairing a family cannot reset the site-wide daily generation cap', async () => {
    const { database, app, env, calls, pair, bootstrap } = setup();
    await bootstrap(); await pair();
    assert.equal((await app.fetch(request('/v1/sentences', { token: TOKEN }), env)).status, 200);
    const siteHash = hash(`hanzi-site-budget-v1:${ENV.HANZI_SITE_ID}`);
    const budget = database.prepare("SELECT limit_key, units FROM hanzi_sentence_limits WHERE limit_key LIKE '%:generation:%'").get();
    assert.equal(budget.limit_key, `hanzi-sentences-v1:generation:${siteHash}:0`);
    assert(!budget.limit_key.includes(hash(TOKEN)));
    database.prepare('UPDATE hanzi_sentence_limits SET units = 120 WHERE limit_key = ?').run(budget.limit_key);
    await pair(OTHER_TOKEN);
    const denied = await app.fetch(request('/v1/sentences', { token: OTHER_TOKEN, body: { items: [SECOND] } }), env);
    await errorCode(denied, 429, 'rate_limited');
    assert.equal(calls.length, 1);
    assert.equal((await app.fetch(request('/v1/sentences', { token: OTHER_TOKEN }), env)).status, 200, 'cached sentences remain usable after the cap');
    assert.equal(calls.length, 1);
    database.close();
  });

  await check('site-wide request cap also survives family changes', async () => {
    const { database, app, env, pair, bootstrap } = setup();
    await bootstrap(); await pair();
    for (let index = 0; index < 20; index++) assert.equal((await app.fetch(request('/v1/sentences', { token: TOKEN }), env)).status, 200);
    await pair(OTHER_TOKEN);
    await errorCode(await app.fetch(request('/v1/sentences', { token: OTHER_TOKEN }), env), 429, 'rate_limited');
    database.close();
  });

  await check('database and key failures stop requests with sanitized errors', async () => {
    const { database, app, env, calls, pair } = setup();
    await pair();
    await errorCode(await app.fetch(request('/health', { token: TOKEN }), env), 503, 'service_unconfigured');
    const broken = { ...env, DB: { prepare() { throw Error(`${API_KEY} private diagnostic`); } } };
    await errorCode(await app.fetch(request('/health', { token: TOKEN }), broken), 503, 'storage_unavailable');
    await errorCode(await app.fetch(request('/pair', { headers: identity() }), broken), 503, 'storage_unavailable');
    assert.equal(calls.length, 0);
    database.close();
    const noSchema = setup({ initialize: false });
    await errorCode(await noSchema.app.fetch(request('/health', { token: TOKEN }), noSchema.env), 503, 'storage_unavailable');
    noSchema.database.close();
  });

  await check('root and unknown paths expose no configuration or secret values', async () => {
    const { database, app, env } = setup();
    const root = await app.fetch(request('/'), env);
    assert.equal(root.status, 200);
    const text = await root.text();
    for (const value of [API_KEY, WRAPPING, TOKEN, OWNER_EMAIL, ENV.HANZI_SITE_ID]) assert(!text.includes(value));
    await errorCode(await app.fetch(request('/missing', { method: 'GET' }), env), 404, 'not_found');
    database.close();
  });

  await check('upstream diagnostics require both the temporary bootstrap gate and explicit diagnostic flag', async () => {
    const { database, app, env, pair, bootstrap } = setup({ fetchImpl: async () => { throw new TypeError('synthetic private-runtime failure'); } });
    await bootstrap(); await pair();
    const logs = [], original = console.error;
    console.error = (...args) => { logs.push(args); };
    try {
      for (const flags of [
        {}, { HANZI_UPSTREAM_DIAGNOSTICS: 'true' }, { HANZI_BOOTSTRAP_ENABLED: 'true' },
        { HANZI_BOOTSTRAP_ENABLED: 'false', HANZI_UPSTREAM_DIAGNOSTICS: 'true' }
      ]) {
        const response = await app.fetch(request('/v1/sentences', { token: TOKEN }), { ...env, ...flags });
        assert.equal(response.status, 502);
        assert.equal(response.headers.get('X-Hanzi-Service-Revision'), '2026.11.23.4');
      }
      assert.equal(logs.length, 0, 'public/disabled bootstrap gate must suppress diagnostics');
      const response = await app.fetch(request('/v1/sentences', { token: TOKEN }), { ...env, HANZI_BOOTSTRAP_ENABLED: 'true', HANZI_UPSTREAM_DIAGNOSTICS: 'true' });
      assert.equal(response.status, 502);
      assert.equal(logs.length, 1);
      assert.deepEqual(logs[0].slice(0, 3), ['[hanzi-upstream]', 'fetch', 'TypeError']);
      assert(logs[0].every(value => typeof value === 'string'));
    } finally { console.error = original; database.close(); }
  });

  console.log(`sentence worker: ${checks} offline checks passed; no live API, secrets file, or deployment`);
})().catch(error => { console.error(error); process.exitCode = 1; });
