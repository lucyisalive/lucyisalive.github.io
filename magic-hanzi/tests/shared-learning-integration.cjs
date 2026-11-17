'use strict';

const assert = require('node:assert/strict');
const { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder, TextEncoder } = require('node:util');

const startup = fs.readFileSync(path.join(__dirname, 'offline-startup.cjs'), 'utf8');
const boundary = startup.indexOf('\n(async()=>{');
const loop = "for(let i=0;i<scripts.length;i++)vm.runInContext(scripts[i].source,context,{timeout:10000,filename:'built-inline-'+i+'.js'});";
assert.ok(boundary > 0 && startup.includes(loop));
const prelude = startup.slice(0, boundary).replace(loop, `for(let i=0;i<scripts.length;i++){
  if(i===mainIndex){
    window.HanziHerbalist = { create: () => ({ restoreStage() {} }) };
    window.crypto = host.crypto;
    window.TextEncoder = host.TextEncoder;
    window.TextDecoder = host.TextDecoder;
    window.fetch = (url, init) => new URL(url, 'https://lucyisalive.github.io').hostname === 'firestore.googleapis.com'
      ? host.firestore.fetch(url, init) : fixtureFetch(url, init);
  }
  vm.runInContext(scripts[i].source,context,{timeout:10000,filename:'built-inline-'+i+'.js'});
}`);
const setup = new Function('require', '__dirname', 'process', 'host', prelude + '\nreturn {environment,flush,inkFor};');

const OLD_SAVE = 'hanzi-magic-door-state-v1';
const NEW_SAVE = 'hanzi-magic-herbalist-state-v1';
const STORY = 'hanzi-magic-herbalist-story-v1';
const BACKUP = 'hanzi-magic-herbalist-before-sharing-v1';
const RECOVERY = 'hanzi-magic-herbalist-local-recovery-v1-';
const OLD_SYNC = 'hanzi-magic-door-sync-v1';
const NEW_SYNC = 'hanzi-magic-herbalist-sync-v1';
const OLD_INK = 'hanzi-magic-door-ink-v1';
const LOCATION = new URL('https://lucyisalive.github.io/magic-hanzi/');
const TODAY = '2026-11-03';
const PASSWORD = 'synthetic four unrelated family words';

function item(char, pinyin, days = []) {
  return {
    char, pinyin, box: 1, interval: 0, wrongToday: 0, lastSeen: days.at(-1) || null,
    history: days.map(day => ({ day, outcome: 'first-try' })), passedDays: days,
  };
}

function round(roundId, passedCount) {
  return { version: 1, day: TODAY, roundId, passedCount, completed: false, sceneAwarded: false };
}

function read(storage, key) {
  return JSON.parse(storage.get(key));
}

function passedDays(state, char) {
  return state.bank.find(entry => entry.char === char).passedDays;
}

function mockLegacyFirestore(state) {
  const app = 'hanzi-magic-door';
  const project = 'game-e-40894';
  const seed = pbkdf2Sync(PASSWORD, app + ':password-family:v1:' + project, 600000, 32, 'sha256').toString('hex');
  const digest = purpose => createHash('sha256').update(app + ':' + purpose + ':password-v1:' + seed).digest();
  const key = digest('key');
  const resource = '/v1/projects/' + project + '/databases/(default)/documents/families/hanzi-password-v1-' + digest('document').toString('hex');
  const iv = Buffer.alloc(12, 1);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(state)), cipher.final(), cipher.getAuthTag()]);
  let record = {
    updateTime: '2026-11-03T12:00:00.000Z',
    fields: {
      app: { stringValue: app }, formatVersion: { integerValue: '1' },
      iv: { stringValue: iv.toString('base64') }, payload: { stringValue: encrypted.toString('base64') },
    },
  };
  const calls = [];
  const decoded = [];
  return {
    calls,
    decoded,
    async fetch(url, init) {
      const endpoint = new URL(url);
      calls.push(init.method);
      assert.equal(endpoint.pathname, resource, 'Keep the original password family document');
      assert.equal(init.credentials, 'omit');
      if (init.method === 'PATCH') {
        assert.equal(endpoint.searchParams.get('currentDocument.updateTime'), record.updateTime);
        const { fields } = JSON.parse(init.body);
        assert.equal(fields.app.stringValue, app);
        const payload = Buffer.from(fields.payload.stringValue, 'base64');
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(fields.iv.stringValue, 'base64'));
        decipher.setAuthTag(payload.subarray(-16));
        decoded.push(JSON.parse(Buffer.concat([decipher.update(payload.subarray(0, -16)), decipher.final()])));
        record = { fields, updateTime: '2026-11-03T12:00:01.000Z' };
      } else assert.equal(init.method, 'GET');
      return { ok: true, status: 200, text: async () => JSON.stringify(record) };
    },
  };
}

async function test() {
  const old = {
    bank: [item('犬', 'quǎn', ['2026-10-30']), item('固', 'gù')],
    bankVersion: 5, dailyCount: 5, priorityQueue: [], scenesUnlocked: 8,
    sessionProgress: round('old-round', 7),
  };
  const independent = {
    bank: [item('犬', 'quǎn', ['2026-10-31']), item('止', 'zhǐ', ['2026-11-01'])],
    bankVersion: 5, dailyCount: 10, priorityQueue: [], scenesUnlocked: 1,
    sessionProgress: round('new-round', 2), herbalistStage: 'stars',
  };
  const cloud = {
    ...old,
    bank: [item('犬', 'quǎn', ['2026-10-30', '2026-10-31', '2026-11-02']), item('固', 'gù'), ...independent.bank.slice(1)],
    scenesUnlocked: 9, sessionProgress: round('old-cloud-round', 8),
  };
  const firestore = mockLegacyFirestore(cloud);
  const { environment, flush, inkFor } = setup(require, __dirname, process, { crypto: webcrypto, TextEncoder, TextDecoder, firestore });
  const originalInk = JSON.stringify([{ synthetic: true }]);
  const originalRecords = [[OLD_SAVE, JSON.stringify(old)], [NEW_SAVE, JSON.stringify(independent)],
    [OLD_INK, originalInk], [OLD_SYNC, 'untouched fake old credential']];
  const isolated = environment({ initialStorage: originalRecords, location: new URL('/magic-hanzi-trial/', LOCATION) });
  assert.equal(isolated.run('cloudSyncController'), null);
  assert.equal(isolated.storage.get(OLD_SAVE), JSON.stringify(old));
  assert.equal(isolated.storage.has(STORY), false);
  assert.equal(isolated.storage.has(BACKUP), false);

  const game = environment({ initialStorage: originalRecords, location: LOCATION });
  await flush();
  const merged = read(game.storage, OLD_SAVE);
  const savedStory = read(game.storage, STORY);
  assert.deepEqual(passedDays(merged, '犬'), ['2026-10-30', '2026-10-31']);
  assert.deepEqual(passedDays(merged, '止'), ['2026-11-01']);
  assert.equal(merged.dailyCount, old.dailyCount);
  assert.equal(merged.scenesUnlocked, old.scenesUnlocked);
  assert.deepEqual(merged.sessionProgress, old.sessionProgress);
  assert.equal(Object.hasOwn(merged, 'herbalistStage'), false);
  assert.deepEqual(savedStory, { version: 1, herbalistStage: 'stars', scenesUnlocked: 1, sessionProgress: round('new-round', 2) });
  assert.equal(read(game.storage, BACKUP).raw, JSON.stringify(old));
  assert.equal(game.storage.get(NEW_SAVE), JSON.stringify(independent));
  assert.equal(game.storage.get(OLD_INK), originalInk);
  assert.equal(game.storage.get(OLD_SYNC), 'untouched fake old credential');
  assert.equal(game.run('inkLog.length'), 0);
  assert.equal(game.run('cloudSyncController.status().kind'), 'off');
  assert.deepEqual(firestore.calls, [], 'The shared local save does not turn on cloud sync');

  const restarted = environment({ initialStorage: game.storage, location: LOCATION });
  await flush();
  assert.equal(restarted.run('state.herbalistStage'), 'stars');
  assert.equal(restarted.run('passedCount'), 2);
  assert.equal(restarted.run('state.scenesUnlocked'), 1);
  assert.deepEqual(read(restarted.storage, OLD_SAVE), merged);
  assert.equal(read(restarted.storage, BACKUP).raw, JSON.stringify(old));

  const outOfSpace = environment({ initialStorage: game.storage, location: LOCATION });
  await flush();
  const setItem = outOfSpace.context.localStorage.setItem;
  outOfSpace.context.localStorage.setItem = (key, value) => {
    if (key === OLD_SAVE) throw new Error('synthetic storage quota');
    return setItem(key, value);
  };
  outOfSpace.run('passedCount = 3; state.bank[0].box = 5;');
  assert.equal(await outOfSpace.run('saveState()'), false);
  assert.deepEqual(read(outOfSpace.storage, OLD_SAVE), merged);
  assert.deepEqual(read(outOfSpace.storage, STORY), savedStory, 'Roll back the story write when the shared save fails');

  const independentlyUpdated = { ...merged, scenesUnlocked: 12, sessionProgress: round('other-old-tab', 6) };
  game.storage.set(OLD_SAVE, JSON.stringify(independentlyUpdated));
  game.run('passedCount = 3; state.bank[0].box = 5;');
  assert.equal(await game.run('saveState()'), false);
  assert.deepEqual(read(game.storage, OLD_SAVE), independentlyUpdated);
  assert.deepEqual(read(game.storage, STORY), savedStory);
  const recoveryKey = [...game.storage.keys()].find(key => key.startsWith(RECOVERY));
  assert.ok(recoveryKey);
  const recovery = read(game.storage, recoveryKey).progress;
  assert.equal(recovery.bank[0].box, 5);
  assert.equal(recovery.sessionProgress.passedCount, 3);
  assert.throws(() => game.run('getCloudProgressState()'), /另存/);

  restarted.ids.get('cloudSyncPassword').value = PASSWORD;
  await restarted.run("syncWithCredential('joinPasswordFamily', 'cloudSyncPassword', true)");
  assert.equal(restarted.run('cloudSyncController.status().kind'), 'synced');
  assert.deepEqual(firestore.calls, ['GET'], 'Joining must not immediately write a story-derived cloud record');
  assert.ok(restarted.storage.has(NEW_SYNC));
  assert.equal(restarted.storage.get(OLD_SYNC), 'untouched fake old credential');
  assert.equal(restarted.ids.get('cloudSyncPassword').value, '');
  assert.deepEqual(read(restarted.storage, OLD_SAVE).sessionProgress, cloud.sessionProgress);
  assert.equal(restarted.run("isMastered(state.bank.find(entry => entry.char === '犬'))"), true);
  assert.deepEqual(read(restarted.storage, STORY), savedStory);
  assert.equal(restarted.run('passedCount'), 2);

  restarted.run("presentDoor(state.bank.find(entry => entry.char === '固'), 'free', 1);");
  await flush();
  inkFor(restarted, '固');
  restarted.tap('submitBtn');
  await flush();
  assert.equal(restarted.run('passedCount'), 3);
  await restarted.run('cloudSyncController.sync()');
  assert.equal(restarted.run('cloudSyncController.status().kind'), 'synced');
  assert.deepEqual(firestore.calls, ['GET', 'GET', 'PATCH']);
  const published = firestore.decoded[0];
  assert.deepEqual(passedDays(published, '固'), [TODAY]);
  assert.equal(published.scenesUnlocked, cloud.scenesUnlocked);
  assert.deepEqual(published.sessionProgress, cloud.sessionProgress);
  assert.doesNotMatch(JSON.stringify(published), /herbalistStage|new-round|rawS|inkLog/);
  assert.equal(read(restarted.storage, STORY).sessionProgress.passedCount, 3);
  assert.equal(restarted.storage.get(OLD_INK), originalInk);

  const unpublished = {
    ...independent,
    bank: [independent.bank[0], item('止', 'zhǐ', ['2026-11-01', '2026-11-02'])],
  };
  const firstConnection = environment({
    initialStorage: [...originalRecords, [NEW_SAVE, JSON.stringify(unpublished)]],
    location: LOCATION,
  });
  await flush();
  firstConnection.ids.get('cloudSyncPassword').value = PASSWORD;
  await firstConnection.run("syncWithCredential('joinPasswordFamily', 'cloudSyncPassword', true)");
  assert.equal(firstConnection.run('cloudSyncController.status().kind'), 'pending');
  assert.deepEqual(firestore.calls, ['GET', 'GET', 'PATCH', 'GET']);
  const combined = read(firstConnection.storage, OLD_SAVE);
  assert.deepEqual(passedDays(combined, '止'), ['2026-11-01', '2026-11-02'], 'First join preserves unpublished local work');
  assert.deepEqual(passedDays(combined, '固'), [TODAY], 'First join also adopts the existing cloud work');
  assert.deepEqual(combined.sessionProgress, cloud.sessionProgress);
  assert.deepEqual(read(firstConnection.storage, STORY), savedStory);

  console.log('Shared learning: guarded same-site merge, independent rounds and ink, stale-save recovery, and legacy cloud join and write passed.');
}

async function temporarySaveFailureBeforePasswordJoin() {
  const local = {
    bank: [item('固', 'gù'), item('犬', 'quǎn')], bankVersion: 5, dailyCount: 10,
    priorityQueue: [], scenesUnlocked: 0,
  };
  const remote = { ...local, bank: [item('固', 'gù'), item('犬', 'quǎn', ['2026-11-02'])] };
  const story = { version: 1, herbalistStage: 'herbs', scenesUnlocked: 0, sessionProgress: round('retry-round', 0) };
  const firestore = mockLegacyFirestore(remote);
  const { environment, flush, inkFor } = setup(require, __dirname, process,
    { crypto: webcrypto, TextEncoder, TextDecoder, firestore });
  const page = environment({
    initialStorage: [[OLD_SAVE, JSON.stringify(local)], [STORY, JSON.stringify(story)]], location: LOCATION,
  });
  await flush();
  assert.equal(page.run('cloudSyncController.status().kind'), 'off');

  const originalLearning = page.storage.get(OLD_SAVE);
  const originalStory = page.storage.get(STORY);
  const setItem = page.context.localStorage.setItem;
  let writable = false;
  page.context.localStorage.setItem = (key, value) => {
    if (key === OLD_SAVE && !writable) throw new Error('synthetic temporary local storage failure');
    return setItem(key, value);
  };
  const fetch = firestore.fetch;
  firestore.fetch = (...args) => {
    assert.deepEqual(passedDays(read(page.storage, OLD_SAVE), '固'), [TODAY],
      'Save the pending local pass before reading or writing the remote family');
    return fetch(...args);
  };

  page.run("presentDoor(state.bank.find(entry => entry.char === '固'), 'free', 1)");
  await flush();
  inkFor(page, '固');
  page.tap('submitBtn');
  await flush();
  assert.equal(page.run('passedCount'), 1);
  assert.match(page.ids.get('localProgressNotice').textContent, /本机进度暂存未成功/);
  assert.equal(page.storage.get(OLD_SAVE), originalLearning);
  assert.equal(page.storage.get(STORY), originalStory);

  let liveBackup;
  page.context.Blob = Blob;
  page.context.URL = { createObjectURL(blob) { liveBackup = blob; return 'blob:synthetic-backup'; }, revokeObjectURL() {} };
  page.tap('saveProgressBtn');
  const backup = JSON.parse(await liveBackup.text());
  assert.deepEqual(passedDays(backup, '固'), [TODAY], 'Manual backup reads the current page even if local storage failed');
  assert.equal(backup.sessionProgress.passedCount, 1);

  const join = () => {
    page.ids.get('cloudSyncPassword').value = PASSWORD;
    return page.run("syncWithCredential('joinPasswordFamily', 'cloudSyncPassword', true)");
  };
  await join();
  assert.equal(page.run('cloudSyncController.status().connected'), false);
  assert.deepEqual(firestore.calls, []);
  assert.equal(page.storage.get(OLD_SAVE), originalLearning);

  writable = true;
  await join();
  assert.equal(firestore.calls[0], 'GET', 'Retry the same-page password join once local storage is writable');
  assert.equal(page.run('cloudSyncController.status().connected'), true);
  assert.equal(page.ids.get('localProgressNotice').hidden, true);
  assert.deepEqual(passedDays(read(page.storage, OLD_SAVE), '固'), [TODAY]);
  assert.deepEqual(passedDays(read(page.storage, OLD_SAVE), '犬'), ['2026-11-02']);
  assert.equal(read(page.storage, STORY).sessionProgress.passedCount, 1);

  if (page.run('cloudSyncController.status().kind') !== 'synced') await page.run('cloudSyncController.sync()');
  assert.equal(page.run('cloudSyncController.status().kind'), 'synced');
  assert.equal(firestore.decoded.length, 1);
  assert.deepEqual(passedDays(firestore.decoded[0], '固'), [TODAY]);
  assert.deepEqual(passedDays(firestore.decoded[0], '犬'), ['2026-11-02']);
  const reopened = environment({ initialStorage: page.storage, location: LOCATION });
  assert.equal(reopened.run('cloudSyncController.status().connected'), true);
  assert.equal(reopened.ids.get('cloudSyncPasswordSetup').hidden, true, 'Reopening the same browser does not ask for the password again');
  assert.equal(reopened.run('passedCount'), 1);
  await reopened.run('cloudSyncController.sync()');
  assert.equal(reopened.run('cloudSyncController.status().kind'), 'synced');
  console.log('Password join: same-page recovery, merged learning and a remembered connection after reopening passed.');
}

test().then(temporarySaveFailureBeforePasswordJoin).catch(error => { console.error(error); process.exitCode = 1; });
