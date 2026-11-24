'use strict';

// All credentials and connection records in this file are synthetic. Token
// derivation must be an offline read of the connection, never a learning save.
const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const { create } = require('../progress-sync.js');
const { indexedDB } = require('./progress-sync-backups.cjs');

const META = 'hanzi-magic-herbalist-sync-v1';
const PROJECT = 'synthetic-sentence-family';
const SEED_A = '0123456789abcdef'.repeat(4);
const SEED_B = 'fedcba9876543210'.repeat(4);
const CODE_A = '0123456789abcdef'.repeat(2);
const CODE_B = 'fedcba9876543210'.repeat(2);

function connection(secret = SEED_A, mode = 'password', extra = {}) {
  return {
    version: mode === 'password' ? 2 : 1,
    [mode === 'password' ? 'passwordSeed' : 'code']: secret,
    baseUpdateTime: null, baseHash: null, dirty: false,
    requireConflict: false, lastSyncedAt: null,
    ...extra,
  };
}

function expected(secret = SEED_A, mode = 'password', projectId = PROJECT) {
  return createHash('sha256').update(JSON.stringify([
    'hanzi-sentence-access', 1, 'hanzi-magic-door', projectId, mode, secret,
  ])).digest('hex');
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function gatedCrypto() {
  const entered = deferred(), release = deferred();
  const crypt = {
    getRandomValues: value => webcrypto.getRandomValues(value),
    subtle: new Proxy(webcrypto.subtle, {
      get(target, property) {
        if (property === 'digest') return async (algorithm, bytes) => {
          const copy = new Uint8Array(bytes).slice();
          if (new TextDecoder().decode(copy).startsWith('["hanzi-sentence-access",')) {
            entered.resolve();
            await release.promise;
          }
          return target.digest(algorithm, copy);
        };
        const value = target[property];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  };
  return { crypt, entered: entered.promise, release: release.resolve };
}

function device(saved, { projectId = PROJECT, database, crypt = webcrypto,
  denyReads = false, raw, overrides = {} } = {}) {
  const values = new Map();
  if (raw !== undefined) values.set(META, raw);
  else if (saved !== undefined && saved !== null) values.set(META, JSON.stringify(saved));
  const calls = { writes: 0, removals: 0, fetch: 0, getState: 0, applyState: 0 };
  const timers = new Map();
  let nextTimer = 0;
  const client = create({
    projectId, crypto: crypt, indexedDB: database,
    storage: {
      getItem(key) {
        if (denyReads) throw new DOMException('Synthetic storage read restriction', 'SecurityError');
        return values.get(key) ?? null;
      },
      setItem(key, value) { calls.writes++; values.set(key, value); },
      removeItem(key) { calls.removals++; values.delete(key); },
    },
    fetch() { calls.fetch++; throw Error('Token derivation must not fetch'); },
    getState() { calls.getState++; throw Error('Token derivation must not read learning state'); },
    applyState() { calls.applyState++; throw Error('Token derivation must not replace learning state'); },
    setTimeout(fn, ms) { timers.set(++nextTimer, { fn, ms }); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    ...overrides,
  });
  assert.equal(typeof client.sentenceAccessToken, 'function', 'Expose the family sentence credential reader');
  return { client, values, calls, timers };
}

async function readOnlyToken(fixture, expectedToken) {
  const before = [...fixture.values];
  const statusBefore = fixture.client.status();
  const task = fixture.client.sentenceAccessToken();
  assert.equal(typeof task?.then, 'function', 'The credential reader is asynchronous');
  const value = await task;
  assert.equal(value, expectedToken);
  if (value !== null) assert.match(value, /^[0-9a-f]{64}$/);
  assert.deepEqual(fixture.calls, { writes: 0, removals: 0, fetch: 0, getState: 0, applyState: 0 });
  assert.deepEqual([...fixture.values], before, 'Reading the sentence token never persists it or rewrites the connection');
  assert.equal(fixture.timers.size, 0, 'Reading the sentence token does not schedule synchronization');
  if (value !== null) {
    assert.ok(!JSON.stringify(statusBefore).includes(value));
    assert.ok(!JSON.stringify(fixture.client.status()).includes(value), 'Status does not expose the sentence credential');
    assert.ok(!JSON.stringify([...fixture.values]).includes(value), 'Storage does not contain the sentence credential');
  }
  return value;
}

async function test() {
  const author = device(connection());
  const token = await readOnlyToken(author, expected());
  assert.equal(await readOnlyToken(author, expected()), token, 'Repeated reads keep a stable family identity');
  assert.equal(await readOnlyToken(device(connection()), expected()), token, 'The same family matches on another device');

  const updatedMeta = connection(SEED_A, 'password', {
    baseUpdateTime: '2026-11-03T12:00:00.000Z', baseHash: 'a'.repeat(64),
    dirty: true, requireConflict: true, lastSyncedAt: 1793707200000,
  });
  assert.equal(await readOnlyToken(device(updatedMeta), expected()), token,
    'Sync timestamps, pending changes and conflicts do not change family identity');
  assert.notEqual(await readOnlyToken(device(connection(SEED_B)), expected(SEED_B)), token);
  const otherProject = 'synthetic-other-project';
  assert.notEqual(await readOnlyToken(device(connection(), { projectId: otherProject }),
    expected(SEED_A, 'password', otherProject)), token, 'Projects have separate sentence credentials');

  const codeToken = await readOnlyToken(device(connection(CODE_A, 'code')), expected(CODE_A, 'code'));
  assert.notEqual(codeToken, token, 'Legacy code and password families use distinct derivation domains');
  assert.equal(await readOnlyToken(device(connection(CODE_A.toUpperCase(), 'code')), expected(CODE_A, 'code')), codeToken,
    'Use the validated, normalized stored code');
  assert.notEqual(await readOnlyToken(device(connection(CODE_B, 'code')), expected(CODE_B, 'code')), codeToken);
  for (const label of ['document', 'key']) {
    const oldDomain = createHash('sha256').update('hanzi-magic-door:' + label + ':password-v1:' + SEED_A).digest('hex');
    assert.notEqual(token, oldDomain, 'Sentence credentials are separate from the learning document and encryption key');
  }

  await readOnlyToken(device(null), null);
  for (const raw of [
    '{not json', 'null', JSON.stringify({ ...connection(), version: 3 }),
    JSON.stringify(connection('not-a-valid-seed')), JSON.stringify(connection('f'.repeat(31), 'code')),
  ]) await readOnlyToken(device(null, { raw }), null);
  await readOnlyToken(device(connection(), { denyReads: true }), null);
  await readOnlyToken(device(connection(), { crypt: null }), null);
  const failedCrypto = gatedCrypto();
  failedCrypto.release();
  failedCrypto.crypt.subtle = { digest: async () => { throw Error('Synthetic digest failure'); } };
  await readOnlyToken(device(connection(), { crypt: failedCrypto.crypt }), null);

  // An IndexedDB record takes precedence over an older browser-storage record.
  const database = indexedDB();
  database.connection.set('active', { value: connection(SEED_B) });
  const archived = device(connection(), { database });
  const databaseBefore = structuredClone([...database.connection]);
  assert.equal(await readOnlyToken(archived, expected(SEED_B)), expected(SEED_B));
  assert.deepEqual([...database.connection], databaseBefore, 'Credential reads leave IndexedDB connection metadata intact');
  assert.equal(database.entries.length, 0, 'Credential reads create no learning backups');
  assert.equal(database.progress.size, 0, 'Credential reads create no shared learning state');

  const restrictedDatabase = indexedDB();
  restrictedDatabase.connection.set('active', { value: connection() });
  await readOnlyToken(device(null, { database: restrictedDatabase, denyReads: true }), token);
  const deletedDatabase = indexedDB();
  deletedDatabase.connection.set('active', { value: null });
  await readOnlyToken(device(connection(), { database: deletedDatabase }), null);
  const malformedDatabase = indexedDB();
  malformedDatabase.connection.set('active', { value: connection('damaged') });
  await readOnlyToken(device(connection(), { database: malformedDatabase }), null);

  // A pending digest belongs only to the connection epoch in which it began.
  for (const action of ['disconnect', 'switch']) {
    const gate = gatedCrypto();
    const pending = device(connection(), { crypt: gate.crypt });
    const task = pending.client.sentenceAccessToken();
    await gate.entered;
    if (action === 'disconnect') await pending.client.disconnect();
    else {
      // Beginning another family join must cancel this credential even when the
      // separate join cannot proceed. The synthetic getState barrier ensures
      // this regression test never reaches a network or reads real learning data.
      await pending.client.joinFamily(CODE_B);
    }
    gate.release();
    assert.equal(await task, null, action + ' cancels a sentence credential already being hashed');
    assert.equal(pending.calls.fetch, 0);
    if (action === 'disconnect') assert.equal(await pending.client.sentenceAccessToken(), null);
  }

  // Disconnecting before the database read completes must not resurrect it.
  const loadingDatabase = indexedDB();
  loadingDatabase.connection.set('active', { value: connection() });
  const loading = device(null, { database: loadingDatabase });
  const obsolete = loading.client.sentenceAccessToken();
  await loading.client.disconnect();
  assert.equal(await obsolete, null);
  assert.equal(await loading.client.sentenceAccessToken(), null);
  assert.equal(loading.client.status().connected, false);
  assert.deepEqual(loadingDatabase.connection.get('active'), { value: null });
  assert.equal(loading.calls.fetch, 0);
  assert.equal(loading.calls.getState, 0);

  console.log('Sentence family token: domain separation, offline read-only derivation, storage fallback and cancellation passed.');
}

test().catch(error => { console.error(error); process.exitCode = 1; });
