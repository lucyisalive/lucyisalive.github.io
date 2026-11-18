'use strict';

const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { create } = require('../progress-sync.js');

const BACKUP = 'hanzi-magic-herbalist-sync-backups-v1';
const META = 'hanzi-magic-herbalist-sync-v1';
const PROGRESS = 'hanzi-magic-herbalist-shared-progress-v1';
const PASSWORD = 'synthetic backup and conflict only';

function lesson(...chars) {
  return {
    bank: chars.map(char => ({ char, pinyin: '', history: [], passedDays: [] })),
    bankVersion: 5, priorityQueue: [], dailyCount: 5, scenesUnlocked: 0,
  };
}

function storage(previous, { denyBackup = false, metadataNeedsSpace = false, metadataError = 'QuotaExceededError' } = {}) {
  const values = new Map(previous === undefined ? [] : [[BACKUP, previous]]);
  return {
    values,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if ((denyBackup && key === BACKUP) || (metadataNeedsSpace && key === META && values.has(BACKUP))) {
        throw new DOMException('Synthetic storage fault', key === META ? metadataError : 'QuotaExceededError');
      }
      values.set(key, value);
    },
    removeItem(key) { values.delete(key); },
  };
}

function indexedDB(abortWrites = false, beforeCommit = () => {}) {
  const entries = [];
  const connection = new Map();
  const progress = new Map();
  const created = new Set();
  const tails = new Map();
  return {
    entries,
    connection,
    progress,
    open(name, version) {
      assert.ok(name === BACKUP || name === META || name === PROGRESS);
      const expectedStore = name === BACKUP ? 'snapshots' : name === META ? 'connection' : 'progress';
      const records = name === META ? connection : progress;
      assert.equal(version, 1);
      const request = {
        result: {
          close() {},
          createObjectStore(store, options) {
            assert.equal(store, expectedStore);
            assert.deepEqual(options, name === BACKUP ? { autoIncrement: true } : undefined);
            created.add(name);
          },
          transaction(store, mode) {
            assert.equal(store, expectedStore);
            const previous = tails.get(name) || Promise.resolve();
            let release;
            const completion = new Promise(resolve => { release = resolve; });
            tails.set(name, previous.then(() => completion));
            let requests = 0, finished = false, savedBackup = false;

            function end(event) {
              if (finished) return;
              finished = true;
              release();
              transaction[event]();
            }

            function enqueue(action) {
              requests++;
              previous.then(() => {
                if (finished) return;
                action();
                if (--requests === 0 && !finished) {
                  if (savedBackup) beforeCommit();
                  end('oncomplete');
                }
              });
            }

            const transaction = {
              abort() { end('onabort'); },
              objectStore() {
                return {
                  get(key) {
                    assert.ok(mode === 'readonly' || (name === PROGRESS && mode === 'readwrite'));
                    const result = {};
                    enqueue(() => {
                      result.result = structuredClone(records.get(key));
                      result.onsuccess?.();
                    });
                    return result;
                  },
                  put(record, key) {
                    assert.equal(mode, 'readwrite');
                    enqueue(() => {
                      if (abortWrites) { transaction.abort(); return; }
                      records.set(key, structuredClone(record));
                    });
                  },
                  add(entry) {
                    assert.equal(mode, 'readwrite');
                    enqueue(() => {
                      if (abortWrites) { transaction.abort(); return; }
                      entries.push(structuredClone(entry));
                      savedBackup = true;
                    });
                  },
                  openCursor(_, direction) {
                    assert.equal(mode, 'readonly');
                    assert.equal(direction, 'prev');
                    const cursorRequest = {};
                    let index = entries.length;
                    function next() {
                      enqueue(() => {
                        const value = entries[--index];
                        cursorRequest.result = value ? {
                          value: structuredClone(value),
                          continue: next,
                        } : null;
                        cursorRequest.onsuccess();
                      });
                    }
                    next();
                    return cursorRequest;
                  },
                };
              },
            };
            return transaction;
          },
        },
      };
      queueMicrotask(() => {
        if (!created.has(name)) request.onupgradeneeded();
        request.onsuccess();
      });
      return request;
    },
  };
}

function firestore() {
  const documents = new Map();
  const calls = [];
  return {
    calls,
    async fetch(url, options) {
      const address = new URL(url);
      const current = documents.get(address.pathname);
      calls.push(options.method);
      if (options.method === 'GET') {
        return { ok: Boolean(current), status: current ? 200 : 404, json: async () => structuredClone(current) };
      }
      assert.equal(options.method, 'PATCH');
      assert.equal(address.searchParams.get(current ? 'currentDocument.updateTime' : 'currentDocument.exists'),
        current ? current.updateTime : 'false');
      const record = {
        ...JSON.parse(options.body),
        updateTime: new Date(Date.UTC(2026, 10, 3, 12) + calls.length).toISOString(),
      };
      documents.set(address.pathname, record);
      return { ok: true, status: 200, json: async () => structuredClone(record) };
    },
  };
}

function device(server, state, browserStorage, database, extra = {}) {
  const applied = [];
  const client = create({
    projectId: 'synthetic-progress-backup',
    crypto: webcrypto,
    storage: browserStorage,
    indexedDB: database,
    fetch: server.fetch,
    getState: () => state,
    canApply: () => true,
    now: () => Date.UTC(2026, 10, 3, 12),
    applyState(next, reason) {
      applied.push(reason);
      const commit = () => {
        state = extra.mergeOnConflict && reason === 'conflict-merge'
          ? { ...next, bank: [...next.bank, ...state.bank.filter(local => !next.bank.some(remote => remote.char === local.char))] }
          : next;
      };
      const beforeApply = extra.beforeApply?.();
      if (beforeApply?.then) return beforeApply.then(commit);
      commit();
    },
    ...extra,
  });
  return { client, applied, value: () => state, change(next) { state = next; client.changed(); } };
}

async function test() {
  const server = firestore();
  const owner = device(server, lesson('甲'), storage());
  assert.equal((await owner.client.createPasswordFamily(PASSWORD)).kind, 'synced');
  const oldPair = { timestamp: 1, reason: 'previous-save', local: lesson('乙'), remote: lesson('甲'), remoteUpdateTime: 'previous' };
  const earlier = JSON.stringify([oldPair]);
  const durable = indexedDB();
  const quotaStorage = storage(earlier, { denyBackup: true });
  const quotaDevice = device(server, { ...lesson('乙'), inkLog: [{ rawS: 'synthetic ink' }] }, quotaStorage, durable);

  assert.equal((await quotaDevice.client.joinPasswordFamily(PASSWORD)).kind, 'synced');
  assert.deepEqual(quotaDevice.applied, ['join-password-family']);
  assert.deepEqual(quotaDevice.value(), lesson('甲'));
  assert.equal(quotaStorage.values.get(BACKUP), earlier, 'The quota fallback does not rewrite earlier backups');
  assert.deepEqual(server.calls, ['GET', 'PATCH', 'GET'], 'Joining only reads the existing cloud record');
  assert.equal(durable.entries.length, 1);
  const [recent, prior] = await quotaDevice.client.listBackups();
  assert.deepEqual(recent.local, lesson('乙'));
  assert.deepEqual(recent.remote, lesson('甲'));
  assert.deepEqual(prior, oldPair);
  quotaDevice.client.disconnect();
  const reopened = device(server, lesson('甲'), quotaStorage, durable);
  assert.equal(reopened.client.status().connected, false);
  assert.deepEqual(await reopened.client.listBackups(), [recent, prior]);

  const packedStorage = storage(earlier, { denyBackup: true, metadataNeedsSpace: true });
  const packedDatabase = indexedDB();
  const packed = device(server, lesson('乙'), packedStorage, packedDatabase);
  assert.equal((await packed.client.joinPasswordFamily(PASSWORD)).kind, 'synced');
  assert.equal(packedStorage.values.has(META), false);
  assert.equal(packedStorage.values.get(BACKUP), earlier, 'Metadata fallback leaves the earlier backup in place');
  assert.deepEqual(packedDatabase.entries, [recent], 'The new pair is durable too');
  const storedConnection = packedDatabase.connection.get('active').value;
  assert.equal(storedConnection.requireConflict, false);
  assert.doesNotMatch(JSON.stringify(storedConnection), new RegExp(PASSWORD));
  const reloaded = device(server, lesson('甲'), packedStorage, packedDatabase);
  assert.equal((await reloaded.client.start()).kind, 'synced');
  assert.equal(reloaded.client.status().connected, true);
  assert.deepEqual(await reloaded.client.listBackups(), [recent, prior]);
  packedStorage.values.set(META, JSON.stringify(storedConnection));
  packedStorage.removeItem = () => { throw new DOMException('Synthetic local clear restriction', 'SecurityError'); };
  assert.equal((await reloaded.client.disconnect()).kind, 'off');
  assert.deepEqual(packedDatabase.connection.get('active'), { value: null });
  const stale = device(server, lesson('乙'), packedStorage, packedDatabase);
  const beforeStale = server.calls.length;
  assert.equal((await stale.client.start()).kind, 'off');
  assert.equal(server.calls.length, beforeStale, 'Do not resurrect an obsolete local connection');

  const restricted = storage(earlier, { metadataNeedsSpace: true, metadataError: 'SecurityError' });
  const restrictedDb = indexedDB();
  const restrictedDevice = device(server, lesson('乙'), restricted, restrictedDb);
  assert.equal((await restrictedDevice.client.joinPasswordFamily(PASSWORD)).kind, 'synced');
  assert.equal(restrictedDb.connection.get('active').value.requireConflict, false);

  for (const rejectsAsynchronously of [false, true]) {
    const applyStorage = storage(earlier);
    const applyDevice = device(server, lesson('乙'), applyStorage, indexedDB(), {
      beforeApply() {
        if (!applyStorage.values.has(BACKUP)) return;
        const quota = new DOMException('Synthetic quota while storing primary state', 'QuotaExceededError');
        if (rejectsAsynchronously) return Promise.reject(quota);
        throw quota;
      },
    });
    assert.equal((await applyDevice.client.joinPasswordFamily(PASSWORD)).kind, 'synced');
    assert.deepEqual(applyDevice.applied, ['join-password-family', 'join-password-family']);
    assert.equal(applyStorage.values.has(BACKUP), false);
    assert.deepEqual(await applyDevice.client.listBackups(), [recent, prior]);
    assert.deepEqual(applyDevice.value(), lesson('甲'));
  }

  const raceStorage = storage(earlier);
  const raceDatabase = indexedDB(false, () => race.change(lesson('乙', '己')));
  const race = device(server, lesson('乙'), raceStorage, raceDatabase, {
    beforeApply() { throw new DOMException('Synthetic quota while storing primary state', 'QuotaExceededError'); },
  });
  assert.equal((await race.client.joinPasswordFamily(PASSWORD)).kind, 'conflict');
  assert.equal(race.applied.length, 1, 'A change during the archival transaction blocks retry');
  assert.equal(raceStorage.values.has(BACKUP), true, 'The original archive remains after the local revision changes');
  assert.deepEqual(race.value(), lesson('乙', '己'));

  const rejectedApply = device(server, lesson('乙'), storage(earlier), indexedDB(), {
    beforeApply() { throw new Error('Synthetic renderer failure'); },
  });
  assert.equal((await rejectedApply.client.joinPasswordFamily(PASSWORD)).kind, 'conflict');
  assert.equal(rejectedApply.applied.length, 1, 'Do not retry an unrelated application failure');

  const damaged = '{not a backup';
  const damagedStorage = storage(damaged);
  const damagedDatabase = indexedDB();
  const recovered = device(server, lesson('乙'), damagedStorage, damagedDatabase);
  assert.equal((await recovered.client.joinPasswordFamily(PASSWORD)).kind, 'synced');
  assert.equal(damagedStorage.values.get(BACKUP), damaged, 'Leave unreadable history intact');
  assert.deepEqual((await recovered.client.listBackups()).map(pair => pair.local), [lesson('乙')]);

  const unavailable = storage(earlier, { denyBackup: true });
  const rejected = device(server, lesson('乙'), unavailable, indexedDB(true));
  const rejectedStatus = await rejected.client.joinPasswordFamily(PASSWORD);
  assert.equal(rejectedStatus.kind, 'error');
  assert.match(rejectedStatus.message, /未能在本机备份两份进度.*手动备份/);
  assert.equal(rejectedStatus.connected, false);
  assert.equal(unavailable.values.has(META), false);
  assert.equal(unavailable.values.get(BACKUP), earlier);
  assert.deepEqual(rejected.applied, []);
  assert.deepEqual(rejected.value(), lesson('乙'));
  assert.equal(server.calls.filter(call => call === 'PATCH').length, 1, 'A failed backup leaves the cloud record alone');

  const merge = device(server, lesson('甲'), storage(), indexedDB(), { mergeOnConflict: true });
  assert.equal((await merge.client.joinPasswordFamily(PASSWORD)).kind, 'synced');
  const disabled = device(server, lesson('甲'), storage());
  assert.equal((await disabled.client.resolveConflict('merge')).kind, 'error', 'Legacy callers do not gain merge implicitly');
  owner.change(lesson('甲', '丁'));
  assert.equal((await owner.client.sync()).kind, 'synced');
  merge.change(lesson('甲', '丙'));
  assert.equal((await merge.client.sync()).kind, 'conflict');
  assert.equal((await merge.client.resolveConflict('merge')).kind, 'pending');
  assert.equal(merge.applied.at(-1), 'conflict-merge');
  assert.deepEqual(merge.value(), lesson('甲', '丁', '丙'));
  assert.equal((await merge.client.sync()).kind, 'synced');
  assert.equal((await owner.client.sync()).kind, 'synced');
  assert.deepEqual(owner.value(), lesson('甲', '丁', '丙'));
  assert.ok((await merge.client.listBackups()).some(entry => entry.reason === 'conflict-merge'));

  const routine = device(server, owner.value(), storage(), indexedDB(), {
    mergeOnConflict: true,
    wouldLoseProgress: remote => !remote.bank.some(entry => entry.char === '丁'),
  });
  assert.equal((await routine.client.joinPasswordFamily(PASSWORD)).kind, 'synced');
  owner.change(lesson('甲', '丙'));
  assert.equal((await owner.client.sync()).kind, 'synced');
  const protectedPull = await routine.client.sync();
  assert.equal(protectedPull.kind, 'conflict');
  assert.match(protectedPull.message, /合并两份进度/);
  assert.deepEqual(routine.applied, ['join-password-family']);
  assert.deepEqual(routine.value(), lesson('甲', '丁', '丙'));
  assert.equal((await routine.client.resolveConflict('merge')).kind, 'pending');
  assert.deepEqual(routine.value(), lesson('甲', '丙', '丁'));
  routine.client.disconnect();
  merge.client.disconnect();
  owner.client.disconnect();

  console.log('Progress backups: durable quota fallback, malformed archive preservation, failed backup barrier, and guarded merge passed.');
}

async function masteryCodec() {
  const server = firestore();
  const state = lesson('敢');
  const char = state.bank[0];
  const older = '2026-10-30';
  const today = '2026-11-01';
  char.passedDays = [older, today];
  char.history = [{ day: older, outcome: 'first-try' }, { day: today, outcome: 'retest-pass' }];
  char.masteryReset = { day: today, at: 80, rawInk: 'synthetic ignored field' };
  char.masteryPassTimes = [{ day: today, at: 100 }, { day: older, at: 75 }, { day: today, at: 70 }];

  const author = device(server, state, storage());
  assert.equal((await author.client.createPasswordFamily(PASSWORD)).kind, 'synced');
  const reader = device(server, lesson('甲'), storage());
  assert.equal((await reader.client.joinPasswordFamily(PASSWORD)).kind, 'synced');
  const remote = reader.value().bank[0];
  assert.deepEqual(remote.passedDays, char.passedDays);
  assert.deepEqual(remote.history, char.history);
  assert.deepEqual(remote.masteryReset, { day: today, at: 80 });
  assert.deepEqual(remote.masteryPassTimes, [{ day: older, at: 75 }, { day: today, at: 100 }]);
  assert.deepEqual(server.calls, ['GET', 'PATCH', 'GET']);

  for (const invalid of [
    { masteryReset: { day: '2026-02-30', at: 1 } },
    { masteryReset: { day: today, at: -1 } },
    { masteryPassTimes: [{ day: today, at: Number.MAX_SAFE_INTEGER + 1 }] },
  ]) {
    const malformed = { ...state, bank: [{ ...char, ...invalid }] };
    const rejected = device(server, malformed, storage());
    assert.equal((await rejected.client.joinPasswordFamily(PASSWORD)).kind, 'error');
  }
  assert.deepEqual(server.calls, ['GET', 'PATCH', 'GET'], 'Reject malformed timestamps before any network operation');
  console.log('Mastery codec: encrypted same-family round-trip, canonical per-day timestamps, and validation passed.');
}

if (require.main === module) test().then(masteryCodec).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { indexedDB };
