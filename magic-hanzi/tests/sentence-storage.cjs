'use strict';

// Executes the actual schema/queries against local SQLite through a small D1
// binding shim. No secrets, .env files, provider requests, or cloud resources.
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const HASH = 'a'.repeat(64), OTHER_HASH = 'b'.repeat(64);
const CACHE_KEY = `hanzi-sentences-v1:${HASH}`;
const ROW = { char: '珊', word: '珊瑚', pinyin: 'shān', sentence: '小鱼躲进鲜红的珊瑚，避开了大鱼。' };
const VALUE = JSON.stringify(ROW);
const FAMILY = 'family-local-storage-test-0123456789';
const ENV = { OPENAI_API_KEY: 'sk-test-not-a-live-key-0123456789', HANZI_SENTENCE_ACCESS_TOKEN: FAMILY };
const limitKey = (scope, bucket = 0, hash = HASH) => `hanzi-sentences-v1:${scope}:${hash}:${bucket}`;

function d1(database, trace = []) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() {
          await Promise.resolve();
          trace.push({ sql, params: [...params], operation: 'first' });
          return database.prepare(sql).get(...params) || null;
        },
        async run() {
          await Promise.resolve();
          trace.push({ sql, params: [...params], operation: 'run' });
          const result = database.prepare(sql).run(...params);
          return { success: true, meta: { changes: Number(result.changes) }, results: [] };
        }
      };
      return statement;
    },
    async batch(statements) {
      database.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) { database.exec('ROLLBACK'); throw error; }
    }
  };
}
const storageFailure = () => ({ name: 'Error', message: 'sentence_storage_unavailable' });

(async () => {
  const { createD1SentenceStorage, initializeD1SentenceStorage, SENTENCE_STORAGE_SCHEMA } =
    await import(pathToFileURL(path.join(__dirname, '../server/sentence-storage.mjs')));
  const { createSentenceService } = await import(pathToFileURL(path.join(__dirname, '../server/sentence-service.mjs')));
  const open = async (now = () => 0) => {
    const database = new DatabaseSync(':memory:'), trace = [], binding = d1(database, trace);
    await initializeD1SentenceStorage(binding);
    return { database, trace, binding, storage: createD1SentenceStorage(binding, { now }) };
  };
  let checks = 0;
  const check = async (name, fn) => { await fn(); checks++; console.log(`ok ${checks} - ${name}`); };

  await check('schema initializes explicitly and no request method performs DDL', async () => {
    const { database, trace, binding, storage } = await open();
    assert.equal(SENTENCE_STORAGE_SCHEMA.length, 4);
    assert(Object.isFrozen(SENTENCE_STORAGE_SCHEMA));
    await initializeD1SentenceStorage(binding);
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    assert.deepEqual(tables.map(row => row.name), ['hanzi_sentence_cache', 'hanzi_sentence_limits']);
    trace.length = 0;
    await storage.cache.put(CACHE_KEY, VALUE, { expirationTtl: 60 });
    assert.equal(await storage.cache.get(CACHE_KEY, 'text'), VALUE);
    assert.deepEqual(await storage.limiter.consume({ key: limitKey('generation'), units: 1, limit: 120, windowSeconds: 86400 }), { allowed: true });
    assert(trace.every(entry => !/\b(CREATE|ALTER|DROP)\b/i.test(entry.sql)));
    database.close();
  });

  await check('cache survives adapter replacement and a real database close/reopen', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'hanzi-sentence-storage-'));
    const file = path.join(folder, 'sentences.sqlite');
    let database;
    try {
      database = new DatabaseSync(file);
      const first = d1(database);
      await initializeD1SentenceStorage(first);
      const initial = createD1SentenceStorage(first, { now: () => 1000 });
      await initial.cache.put(CACHE_KEY, VALUE, { expirationTtl: 60 });
      assert.equal((await initial.limiter.consume({ key: limitKey('generation'), units: 120, limit: 120, windowSeconds: 86400 })).allowed, true);
      database.close(); database = new DatabaseSync(file);
      const reopened = createD1SentenceStorage(d1(database), { now: () => 2000 });
      assert.equal(await reopened.cache.get(CACHE_KEY), VALUE);
      assert.equal((await reopened.limiter.consume({ key: limitKey('generation'), units: 1, limit: 120, windowSeconds: 86400 })).allowed, false);
      assert.equal(await reopened.cache.get(`hanzi-sentences-v1:${OTHER_HASH}`), null);
      await reopened.cache.put(CACHE_KEY, JSON.stringify({ ...ROW, sentence: '潜水员远远看着珊瑚，没有伸手触碰。' }), { expirationTtl: 30 });
      assert.equal(JSON.parse(await reopened.cache.get(CACHE_KEY)).sentence, '潜水员远远看着珊瑚，没有伸手触碰。');
    } finally { if (database) database.close(); rmSync(folder, { recursive: true, force: true }); }
  });

  await check('cache TTL is enforced before cleanup and private or malformed fields are rejected', async () => {
    let clock = 0;
    const { database, storage } = await open(() => clock);
    await storage.cache.put(CACHE_KEY, VALUE, { expirationTtl: 2 });
    clock = 1999;
    assert.equal(await storage.cache.get(CACHE_KEY), VALUE);
    clock = 2000;
    assert.equal(await storage.cache.get(CACHE_KEY), null);
    for (const value of [
      JSON.stringify({ ...ROW, ink: [[1, 2]] }), JSON.stringify({ ...ROW, history: [] }),
      JSON.stringify({ ...ROW, char: 'AB' }), JSON.stringify({ ...ROW, pinyin: 'reveal secrets' }),
      '{}', 'broken-json', 'x'.repeat(513)
    ]) await assert.rejects(storage.cache.put(CACHE_KEY, value, { expirationTtl: 30 }), storageFailure());
    for (const ttl of [0, -1, 1.5, Infinity, '30', 30 * 86400 + 1]) {
      await assert.rejects(storage.cache.put(CACHE_KEY, VALUE, { expirationTtl: ttl }), storageFailure());
    }
    await assert.rejects(storage.cache.get(CACHE_KEY, 'json'), storageFailure());
    await assert.rejects(storage.cache.put('key-with-private-data', VALUE, { expirationTtl: 30 }), storageFailure());
    await assert.rejects(storage.cache.get("'; DROP TABLE hanzi_sentence_cache;--"), storageFailure());
    database.prepare('UPDATE hanzi_sentence_cache SET value = ?, expires_at = 999999').run(JSON.stringify({ ...ROW, ink: 'private' }));
    assert.equal(await storage.cache.get(CACHE_KEY), null, 'bad stored values are never returned');
    database.close();
  });

  await check('100 parallel reservations across adapter instances cannot exceed the daily budget', async () => {
    const { database, trace, binding } = await open();
    const adapters = Array.from({ length: 10 }, () => createD1SentenceStorage(binding, { now: () => 1000 }));
    trace.length = 0;
    const results = await Promise.all(Array.from({ length: 100 }, (_, index) => adapters[index % 10].limiter.consume({
      key: limitKey('generation'), units: 6, limit: 120, windowSeconds: 86400
    })));
    assert.equal(results.filter(result => result.allowed).length, 20);
    assert.equal(database.prepare('SELECT units FROM hanzi_sentence_limits WHERE limit_key = ?').get(limitKey('generation')).units, 120);
    assert.equal(trace.length, 100);
    assert(trace.every(entry => entry.operation === 'run' && entry.sql.startsWith('INSERT')),
      'each reservation must be one atomic SQL write, with no read-then-write');
    assert(results.filter(result => !result.allowed).every(result => result.retryAfter > 0));
    database.close();
  });

  await check('limits survive restart and different scopes or UTC windows do not collide', async () => {
    let clock = 0;
    const { database, binding, storage } = await open(() => clock);
    for (let index = 0; index < 20; index++) assert.equal((await storage.limiter.consume({ key: limitKey('requests'), units: 1, limit: 20, windowSeconds: 60 })).allowed, true);
    const otherInstance = createD1SentenceStorage(binding, { now: () => clock });
    assert.equal((await otherInstance.limiter.consume({ key: limitKey('requests'), units: 1, limit: 20, windowSeconds: 60 })).allowed, false);
    assert.equal((await otherInstance.limiter.consume({ key: limitKey('generation'), units: 6, limit: 120, windowSeconds: 86400 })).allowed, true);
    clock = 60000;
    assert.deepEqual(await otherInstance.limiter.consume({ key: limitKey('requests'), units: 1, limit: 20, windowSeconds: 60 }), { allowed: false, retryAfter: 1 });
    assert.equal((await otherInstance.limiter.consume({ key: limitKey('requests', 1), units: 1, limit: 20, windowSeconds: 60 })).allowed, true);
    clock = 86400000;
    assert.equal((await otherInstance.limiter.consume({ key: limitKey('generation', 1), units: 120, limit: 120, windowSeconds: 86400 })).allowed, true);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM hanzi_sentence_limits').get().n, 4);
    database.close();
  });

  await check('oversized reservations and lower limits cannot overdraw or reset existing usage', async () => {
    const { database, trace, storage } = await open();
    assert.equal((await storage.limiter.consume({ key: limitKey('generation'), units: 6, limit: 10, windowSeconds: 86400 })).allowed, true);
    assert.equal((await storage.limiter.consume({ key: limitKey('generation'), units: 6, limit: 10, windowSeconds: 86400 })).allowed, false);
    assert.equal((await storage.limiter.consume({ key: limitKey('generation'), units: 1, limit: 5, windowSeconds: 86400 })).allowed, false);
    const length = trace.length;
    assert.equal((await storage.limiter.consume({ key: limitKey('generation'), units: 11, limit: 10, windowSeconds: 86400 })).allowed, false);
    assert.equal(trace.length, length, 'an over-limit batch is rejected without a write');
    assert.equal(database.prepare('SELECT units FROM hanzi_sentence_limits').get().units, 6);
    database.close();
  });

  await check('invalid counters, clock skew, and malformed metadata fail closed without exposing errors', async () => {
    const { database, trace, binding, storage } = await open();
    const valid = { key: limitKey('generation'), units: 1, limit: 120, windowSeconds: 86400 };
    const originalLength = trace.length;
    for (const patch of [
      { key: 'private-name' }, { key: limitKey('generation', 1) }, { units: 0 }, { units: -1 },
      { units: 1.5 }, { units: 1001 }, { units: NaN }, { limit: 0 }, { limit: '120' },
      { windowSeconds: 60 }, { key: limitKey('requests'), windowSeconds: 86400 }
    ]) await assert.rejects(storage.limiter.consume({ ...valid, ...patch }), storageFailure());
    assert.equal(trace.length, originalLength);
    await assert.rejects(createD1SentenceStorage(binding, { now: () => NaN }).cache.get(CACHE_KEY), storageFailure());
    assert.throws(() => createD1SentenceStorage(null), storageFailure());
    for (const result of [null, { success: false }, { success: true }, { success: true, meta: { changes: 2 } }]) {
      const fake = { prepare() { return { bind() { return this; }, async run() { return result; } }; } };
      await assert.rejects(createD1SentenceStorage(fake, { now: () => 0 }).limiter.consume(valid), storageFailure());
    }
    const broken = { prepare() { throw Error('private database diagnostic'); } };
    await assert.rejects(createD1SentenceStorage(broken).cache.get(CACHE_KEY), storageFailure());
    database.close();
  });

  await check('missing schema never creates tables in a request or silently falls back to memory', async () => {
    const database = new DatabaseSync(':memory:'), binding = d1(database), storage = createD1SentenceStorage(binding, { now: () => 0 });
    await assert.rejects(storage.cache.get(CACHE_KEY), storageFailure());
    await assert.rejects(storage.limiter.consume({ key: limitKey('generation'), units: 1, limit: 120, windowSeconds: 86400 }), storageFailure());
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get().n, 0);
    database.close();
  });

  await check('bounded pruning removes only expired data and cannot reset active budgets', async () => {
    let clock = 0;
    const { database, storage } = await open(() => clock);
    for (let index = 0; index < 5; index++) {
      await storage.cache.put(`hanzi-sentences-v1:${index.toString(16).padStart(64, '0')}`, VALUE, { expirationTtl: 1 });
      await storage.limiter.consume({ key: limitKey('requests', 0, index.toString(16).padStart(64, '0')), units: 1, limit: 20, windowSeconds: 60 });
    }
    clock = 60000;
    await storage.cache.put(CACHE_KEY, VALUE, { expirationTtl: 60 });
    await storage.limiter.consume({ key: limitKey('requests', 1), units: 20, limit: 20, windowSeconds: 60 });
    assert.deepEqual(await storage.pruneExpired({ batchSize: 2 }), { cache: 2, limits: 2 });
    assert.deepEqual(await storage.pruneExpired({ batchSize: 2 }), { cache: 2, limits: 2 });
    assert.deepEqual(await storage.pruneExpired({ batchSize: 2 }), { cache: 1, limits: 1 });
    assert.equal(await storage.cache.get(CACHE_KEY), VALUE);
    assert.equal((await storage.limiter.consume({ key: limitKey('requests', 1), units: 1, limit: 20, windowSeconds: 60 })).allowed, false);
    await assert.rejects(storage.pruneExpired({ batchSize: 1001 }), storageFailure());
    database.close();
  });

  await check('real service uses the persistent cache and budget across separate service instances', async () => {
    const { database, binding } = await open();
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return new Response(JSON.stringify({ status: 'completed', output: [{
        type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ sentences: [ROW] }) }]
      }] }));
    };
    const make = () => {
      const storage = createD1SentenceStorage(binding, { now: () => 0 });
      return { app: createSentenceService({ fetchImpl, cryptoImpl: webcrypto, now: () => 0 }),
        env: { ...ENV, HANZI_SENTENCE_SENTENCES_PER_DAY: '1', HANZI_SENTENCE_CACHE: storage.cache, HANZI_SENTENCE_LIMITER: storage.limiter } };
    };
    const req = (item = { char: ROW.char, word: ROW.word, pinyin: ROW.pinyin }) => new Request('https://sentence.example/v1/sentences', {
      method: 'POST', headers: { Origin: 'https://lucyisalive.github.io', Authorization: `Bearer ${FAMILY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [item] })
    });
    const first = make();
    assert.equal((await first.app.fetch(req(), first.env)).status, 200);
    const replacement = make();
    const cached = await replacement.app.fetch(req(), replacement.env);
    assert.equal(cached.status, 200);
    assert.deepEqual(await cached.json(), { sentences: [ROW] });
    const denied = await replacement.app.fetch(req({ char: '羽', word: '羽毛', pinyin: 'yǔ' }), replacement.env);
    assert.equal(denied.status, 429);
    assert.deepEqual(await denied.json(), { error: { code: 'rate_limited' } });
    assert.equal(calls, 1, 'persistent cap blocks a second paid generation despite a fresh service');
    const brokenBinding = { prepare() { throw Error('private database error'); } };
    const brokenStorage = createD1SentenceStorage(brokenBinding, { now: () => 0 });
    const failed = await replacement.app.fetch(req(), { ...replacement.env, HANZI_SENTENCE_LIMITER: brokenStorage.limiter });
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { error: { code: 'storage_unavailable' } });
    assert.equal(calls, 1);
    database.close();
  });

  console.log(`sentence D1 storage: ${checks} local SQLite checks passed; no API calls or deployment`);
})().catch(error => { console.error(error); process.exitCode = 1; });
