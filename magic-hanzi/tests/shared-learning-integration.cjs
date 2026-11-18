'use strict';

const assert = require('node:assert/strict');
const { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder, TextEncoder } = require('node:util');
const { indexedDB } = require('./progress-sync-backups.cjs');

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
    window.indexedDB = host.indexedDB;
    host.beforeMain?.(context);
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

function familySeed() {
  return pbkdf2Sync(PASSWORD, 'hanzi-magic-door:password-family:v1:game-e-40894', 600000, 32, 'sha256').toString('hex');
}

function mockLegacyFirestore(state) {
  const app = 'hanzi-magic-door';
  const project = 'game-e-40894';
  const seed = familySeed();
  const digest = purpose => createHash('sha256').update(app + ':' + purpose + ':password-v1:' + seed).digest();
  const key = digest('key');
  const resource = '/v1/projects/' + project + '/databases/(default)/documents/families/hanzi-password-v1-' + digest('document').toString('hex');
  let revision = 0;
  const updateTime = () => new Date(Date.parse('2026-11-03T12:00:00.000Z') + revision++ * 1000).toISOString();
  function encryptedFields(value) {
    const iv = Buffer.alloc(12, revision + 1);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]);
    return {
      app: { stringValue: app }, formatVersion: { integerValue: '1' },
      iv: { stringValue: iv.toString('base64') }, payload: { stringValue: encrypted.toString('base64') },
    };
  }
  let record = { fields: encryptedFields(state), updateTime: updateTime() };
  let rejectNextRead = false;
  const calls = [];
  const decoded = [];
  return {
    calls,
    decoded,
    anotherDeviceSaved(value) { record = { fields: encryptedFields(value), updateTime: updateTime() }; },
    failNextRead() { rejectNextRead = true; },
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
        record = { fields, updateTime: updateTime() };
      } else {
        assert.equal(init.method, 'GET');
        if (rejectNextRead) {
          rejectNextRead = false;
          return { ok: false, status: 403, text: async () => '{}' };
        }
      }
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
  assert.equal(page.ids.get('cloudSyncSummary').textContent, '跨设备同步 · 本机保存失败');
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

async function tapSyncButton(page, id) {
  page.tap(id);
  await waitFor(() => !page.run('syncUiBusy'), 'Finish the simulated sync action: ' + id);
}

async function waitFor(condition, description) {
  for (let attempt = 0; !condition(); attempt++) {
    assert.ok(attempt < 500, description);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function syncStatusAndOpenSettings() {
  const practiced = [...'匕乙犬冗止泥夕目牛互甘命剪而才本眉子认收机幻记呼纤精实材价累经验确定忧可惜远'];
  assert.equal(practiced.length, 38);
  const local = {
    bankVersion: 5, dailyCount: 10, priorityQueue: [], scenesUnlocked: 0,
    bank: [...practiced.map((char, index) => index < 30 ? item(char, 'zì', [TODAY])
      : { ...item(char, 'zì'), wrongToday: 1, wrongDay: TODAY }), item('固', 'gù')],
  };
  const assignments = [...'山水林火花鸟风雨大小上下左右天地方圆新旧一二悄'].map(char => ({
    char, word: char === '悄' ? '悄悄' : '', pinyin: char === '悄' ? 'qiāo' : 'zì',
    addedDay: TODAY, completedDay: null, requestId: 'assigned-' + char,
  }));
  assert.equal(assignments.length, 23);
  const cloud = {
    ...local, priorityQueue: assignments,
    bank: assignments.map(({char, word, pinyin}) => ({ ...item(char, pinyin), word, fromParent: true })),
  };
  const firestore = mockLegacyFirestore(cloud);
  const { environment, flush, inkFor } = setup(require, __dirname, process,
    { crypto: webcrypto, TextEncoder, TextDecoder, firestore });
  const story = { version: 1, herbalistStage: 'stars', scenesUnlocked: 1, sessionProgress: round('local-level', 2) };
  const page = environment({
    initialStorage: [[OLD_SAVE, JSON.stringify(local)], [STORY, JSON.stringify(story)]], location: LOCATION,
  });
  await flush();
  const status = () => page.ids.get('cloudSyncSummary').textContent;
  const todayText = () => page.ids.get('todayPassed').textContent;
  const parentPlan = () => page.ids.get('todayParentPlan').textContent;
  const heldPlan = '家长安排 23 个字 · 已完成 0 个 · 剩余 23 个';
  page.tap('settingsBtn');
  assert.equal(page.ids.get('cloudSyncSummaryBtn').hidden, false);
  assert.equal(status(), '跨设备同步 · 未连接');
  assert.equal(todayText(), '今天练了 38 个字 · 已通过 30 个');
  assert.equal(parentPlan(), '今天还没有家长安排的字');

  page.ids.get('cloudSyncPassword').value = PASSWORD;
  await tapSyncButton(page, 'cloudSyncJoinBtn');
  assert.equal(status(), '跨设备同步 · 已连接 · 待同步');
  assert.equal(todayText(), '今天练了 38 个字 · 已通过 30 个');
  assert.equal(parentPlan(), heldPlan);
  assert.equal(read(page.storage, OLD_SAVE).priorityQueue.at(-1).char, '悄');
  assert.equal(page.run('passedCount'), 2);

  await tapSyncButton(page, 'cloudSyncNowBtn');
  assert.equal(status(), '跨设备同步 · 已连接 · 已同步');
  assert.match(page.ids.get('cloudSyncLastTime').textContent, /^上次同步 /);
  const merged = firestore.decoded.at(-1);
  assert.equal(merged.priorityQueue.length, 23);

  firestore.failNextRead();
  await tapSyncButton(page, 'cloudSyncNowBtn');
  assert.equal(status(), '跨设备同步 · 已连接 · 同步失败');
  assert.equal(todayText(), '今天练了 38 个字 · 已通过 30 个');
  assert.equal(parentPlan(), heldPlan);

  const remoteUpdate = { ...merged, bank: [...merged.bank, item('海', 'hǎi', [TODAY])] };
  firestore.anotherDeviceSaved(remoteUpdate);
  page.run('strokesPoints = [[[1, 1], [2, 2]]];');
  const requestsBeforeBusy = firestore.calls.length;
  await tapSyncButton(page, 'cloudSyncNowBtn');
  assert.equal(firestore.calls.length, requestsBeforeBusy, 'Manual sync must respect existing strokes');
  assert.equal(todayText(), '今天练了 38 个字 · 已通过 30 个');
  page.run('clearCanvas();');

  await tapSyncButton(page, 'cloudSyncNowBtn');
  assert.equal(status(), '跨设备同步 · 已连接 · 已同步');
  assert.equal(page.ids.get('panelOverlay').classList.contains('show'), true);
  assert.equal(todayText(), '今天练了 39 个字 · 已通过 31 个', 'Manual sync adopts a safe pull in open settings');
  assert.equal(parentPlan(), heldPlan);

  page.run("presentDoor(state.bank.find(entry => entry.char === '固'), 'free', 1);");
  await flush();
  inkFor(page, '固');
  page.tap('submitBtn');
  await flush();
  firestore.anotherDeviceSaved({ ...remoteUpdate, bank: [...remoteUpdate.bank, item('宝', 'bǎo', [TODAY])] });
  await tapSyncButton(page, 'cloudSyncNowBtn');
  assert.equal(status(), '跨设备同步 · 已连接 · 等待合并');
  assert.equal(page.ids.get('cloudSyncConflict').hidden, false);
  assert.equal(todayText(), '今天练了 40 个字 · 已通过 32 个');

  await tapSyncButton(page, 'cloudMergeBtn');
  assert.equal(todayText(), '今天练了 41 个字 · 已通过 33 个');
  assert.equal(parentPlan(), heldPlan);
  assert.deepEqual(passedDays(read(page.storage, OLD_SAVE), '固'), [TODAY]);
  assert.deepEqual(passedDays(read(page.storage, OLD_SAVE), '宝'), [TODAY]);
  assert.equal(read(page.storage, STORY).sessionProgress.passedCount, 3);
  if (page.run('cloudSyncController.status().kind') !== 'synced') await tapSyncButton(page, 'cloudSyncNowBtn');
  assert.equal(status(), '跨设备同步 · 已连接 · 已同步');
  assert.deepEqual(passedDays(firestore.decoded.at(-1), '固'), [TODAY]);
  assert.deepEqual(passedDays(firestore.decoded.at(-1), '宝'), [TODAY]);
  assert.equal(firestore.decoded.at(-1).priorityQueue.at(-1).char, '悄');
  console.log('Family settings: visible status, 38/30 first join with 23 assignments, safe manual pull, and conflict merge passed.');
}

async function remotePullPreservesDatedMastery() {
  const dates = ['2026-10-29', '2026-10-31', '2026-11-02'];
  const local = {
    bankVersion: 5, dailyCount: 10, priorityQueue: [], scenesUnlocked: 0,
    bank: [item('奖', 'jiǎng', dates), item('敢', 'gǎn', dates), item('止', 'zhǐ')],
  };
  const firestore = mockLegacyFirestore(local);
  const { environment, flush } = setup(require, __dirname, process,
    { crypto: webcrypto, TextEncoder, TextDecoder, firestore });
  const page = environment({ initialStorage: [[OLD_SAVE, JSON.stringify(local)]], location: LOCATION });
  await flush();
  page.tap('settingsBtn');
  page.ids.get('cloudSyncPassword').value = PASSWORD;
  await tapSyncButton(page, 'cloudSyncJoinBtn');
  assert.equal(page.run('cloudSyncController.status().kind'), 'synced', 'The later pull starts from a clean client');
  assert.equal(page.ids.get('learningMemoryCount').textContent, '2 字');

  const gapInDates = {
    ...local.bank[1],
    passedDays: [dates[2], dates[2]],
    history: [
      { day: dates[2], outcome: 'retest-pass' },
      { day: '2026-10-30', outcome: 'abandoned' },
      { day: dates[0], outcome: 'first-try' },
      { day: dates[1], outcome: 'retest-pass' },
      { day: dates[0], outcome: 'first-try' },
    ],
  };
  const failedOnly = {
    ...local.bank[2],
    history: dates.map(day => ({ day, outcome: 'abandoned' })),
  };
  firestore.anotherDeviceSaved({ ...local, bank: [local.bank[0], gapInDates, failedOnly] });
  const requestsBeforePull = firestore.calls.length;
  await tapSyncButton(page, 'cloudSyncNowBtn');
  assert.deepEqual(firestore.calls.slice(requestsBeforePull), ['GET'], 'Read the other device’s record without overriding it');
  assert.ok(['synced', 'pending'].includes(page.run('cloudSyncController.status().kind')));

  const adopted = read(page.storage, OLD_SAVE);
  assert.deepEqual(passedDays(adopted, '敢'), dates, 'Count distinct, chronologically sorted formal passes from both fields');
  assert.deepEqual(passedDays(adopted, '奖'), dates, 'The other mastered character remains intact');
  assert.deepEqual(passedDays(adopted, '止'), [], 'Failed practice is not a pass even when the dates are valid');
  assert.deepEqual(adopted.bank[1].history, gapInDates.history, 'Preserve the underlying dated attempt history');
  assert.equal(page.ids.get('learningMemoryCount').textContent, '2 字', 'A normal cloud pull cannot undercount documented mastery');
  console.log('Shared progress: a clean cloud pull preserves distinct formal mastery dates from incomplete records.');
}

async function passwordConnectionSurvivesMetadataQuota() {
  const local = {
    bank: [item('固', 'gù', [TODAY])], bankVersion: 5, dailyCount: 10,
    priorityQueue: [], scenesUnlocked: 0,
  };
  const queued = { char: '悄', word: '悄悄', pinyin: 'qiāo', addedDay: TODAY, completedDay: null, requestId: 'quota-quiet' };
  const remote = {
    ...local, bank: [{ ...item(queued.char, queued.pinyin), word: queued.word, fromParent: true }],
    priorityQueue: [queued],
  };
  const firestore = mockLegacyFirestore(remote);
  let rejectedMetadataWrites = 0;
  const { environment, flush } = setup(require, __dirname, process, {
    crypto: webcrypto, TextEncoder, TextDecoder, firestore, indexedDB: indexedDB(),
    beforeMain(context) {
      const write = context.localStorage.setItem;
      context.localStorage.setItem = (key, value) => {
        if (key === NEW_SYNC) {
          rejectedMetadataWrites++;
          throw new DOMException('Synthetic localStorage sync metadata quota', 'QuotaExceededError');
        }
        return write(key, value);
      };
    },
  });
  const story = { version: 1, herbalistStage: 'herbs', scenesUnlocked: 0, sessionProgress: round('quota-level', 1) };
  const page = environment({
    initialStorage: [[OLD_SAVE, JSON.stringify(local)], [STORY, JSON.stringify(story)]], location: LOCATION,
  });
  await flush();
  page.tap('settingsBtn');
  page.ids.get('cloudSyncPassword').value = PASSWORD;
  await tapSyncButton(page, 'cloudSyncJoinBtn');
  assert.ok(rejectedMetadataWrites > 0, 'Exercise an actual sync-metadata write rejection');
  assert.equal(page.storage.has(NEW_SYNC), false);
  assert.equal(page.run('cloudSyncController.status().connected'), true);
  assert.equal(page.ids.get('cloudSyncPasswordSetup').hidden, true);
  const combined = read(page.storage, OLD_SAVE);
  assert.deepEqual(passedDays(combined, '固'), [TODAY]);
  assert.deepEqual(combined.priorityQueue, [queued]);
  assert.equal(page.run('passedCount'), 1);

  if (page.run('cloudSyncController.status().kind') !== 'synced') await tapSyncButton(page, 'cloudSyncNowBtn');
  assert.equal(page.run('cloudSyncController.status().kind'), 'synced');
  assert.deepEqual(passedDays(firestore.decoded.at(-1), '固'), [TODAY]);
  assert.deepEqual(firestore.decoded.at(-1).priorityQueue, [queued]);
  const reopened = environment({ initialStorage: page.storage, location: LOCATION });
  await waitFor(() => reopened.run("cloudSyncController?.status().kind === 'synced'"),
    'Reopen and use the durable connection automatically');
  assert.equal(reopened.ids.get('cloudSyncPasswordSetup').hidden, true);
  assert.equal(reopened.ids.get('cloudSyncSummary').textContent, '跨设备同步 · 已连接 · 已同步');
  assert.equal(reopened.ids.get('cloudSyncPassword').value, '');
  assert.equal(reopened.run('passedCount'), 1);
  assert.equal(reopened.storage.has(NEW_SYNC), false, 'Restoring the connection must not rely on the rejected storage');
  console.log('Password join: sync metadata quota fallback preserves learning and reconnects after reopening.');
}

async function progressSurvivesPrimaryQuota() {
  const quotaCases = [
    { blockedKeys: [OLD_SAVE] },
    { blockedKeys: [OLD_SAVE, STORY, NEW_SYNC] },
    { blockedKeys: [OLD_SAVE, STORY, NEW_SYNC], interrupted: true },
  ];
  for (const { blockedKeys, interrupted } of quotaCases) {
    const allBlocked = blockedKeys.includes(STORY);
    const local = {
      bank: [item('固', 'gù', [TODAY]), item('止', 'zhǐ'), item('犬', 'quǎn'), item('刀', 'dāo')],
      bankVersion: 5, dailyCount: 10, priorityQueue: [], scenesUnlocked: 0,
    };
    const queued = { char: '悄', word: '悄悄', pinyin: 'qiāo', addedDay: TODAY, completedDay: null, requestId: 'primary-quota-quiet' };
    const remote = {
      ...local, bank: [{ ...item(queued.char, queued.pinyin), word: queued.word, fromParent: true, retired: false }],
      priorityQueue: [queued],
    };
    const story = { version: 1, herbalistStage: 'stars', scenesUnlocked: 1, sessionProgress: round('primary-quota-level', 1) };
    const firestore = mockLegacyFirestore(remote);
    const database = indexedDB();
    const active = () => database.progress.get('active');
    const writesRejected = new Set();
    const { environment, flush, inkFor } = setup(require, __dirname, process, {
      crypto: webcrypto, TextEncoder, TextDecoder, firestore, indexedDB: database,
      beforeMain(context) {
        const write = context.localStorage.setItem;
        context.localStorage.setItem = (key, value) => {
          if (blockedKeys.includes(key)) {
            writesRejected.add(key);
            throw new DOMException('Synthetic primary storage quota', 'QuotaExceededError');
          }
          return write(key, value);
        };
      },
    });
    async function practice(page, char, count) {
      page.run(`presentDoor(state.bank.find(entry => entry.char === ${JSON.stringify(char)}), 'free', 1)`);
      await flush();
      inkFor(page, char);
      page.tap('submitBtn');
      await waitFor(() => page.run('passedCount') === count && !page.run('progressWrites'), 'Finish the ' + char + ' save');
    }
    const localBytes = JSON.stringify(local);
    const storyBytes = JSON.stringify(story);
    let page = environment({ initialStorage: [[OLD_SAVE, localBytes], [STORY, storyBytes]], location: LOCATION });
    await flush();
    assert.equal(page.run('passedCount'), 1);
    await practice(page, '止', 2);
    assert.ok(writesRejected.has(allBlocked ? STORY : OLD_SAVE), 'Force a rejected primary progress write');
    assert.equal(page.storage.get(OLD_SAVE), localBytes);
    assert.equal(page.storage.get(STORY), storyBytes);
    assert.equal(page.ids.get('localProgressNotice').hidden, true);
    assert.deepEqual(passedDays(JSON.parse(active().learning), '止'), [TODAY], 'Keep a formal pass even before cloud connection');
    assert.deepEqual(JSON.parse(active().story).sessionProgress, round('primary-quota-level', 2));

    if (interrupted) {
      database.connection.set('active', { value: {
        version: 2, passwordSeed: familySeed(), baseUpdateTime: null, baseHash: null,
        dirty: true, requireConflict: true, lastSyncedAt: null,
      } });
      page = environment({ initialStorage: page.storage, location: LOCATION });
      await waitFor(() => ['pending', 'synced'].includes(page.run('cloudSyncController?.status().kind')),
        'Resume the interrupted first join using saved credentials');
      page.tap('settingsBtn');
    } else {
      page.tap('settingsBtn');
      page.ids.get('cloudSyncPassword').value = PASSWORD;
      await tapSyncButton(page, 'cloudSyncJoinBtn');
    }
    assert.equal(page.ids.get('cloudSyncPasswordSetup').hidden, true);
    assert.equal(page.ids.get('cloudSyncPassword').value, '');
    assert.equal(page.ids.get('localProgressNotice').hidden, true);
    assert.equal(page.ids.get('todayPassed').textContent, '今天练了 2 个字 · 已通过 2 个');
    assert.equal(page.ids.get('todayParentPlan').textContent, '家长安排 1 个字 · 已完成 0 个 · 剩余 1 个');
    const merged = JSON.parse(active().learning);
    assert.deepEqual(passedDays(merged, '固'), [TODAY]);
    assert.deepEqual(passedDays(merged, '止'), [TODAY]);
    assert.deepEqual(merged.priorityQueue, [queued]);
    assert.equal(page.storage.get(OLD_SAVE), localBytes);
    assert.equal(page.storage.get(STORY), storyBytes);
    if (allBlocked) {
      if (!interrupted) assert.ok(writesRejected.has(NEW_SYNC));
      assert.equal(page.storage.has(NEW_SYNC), false);
    }
    if (page.run('cloudSyncController.status().kind') !== 'synced') await tapSyncButton(page, 'cloudSyncNowBtn');
    assert.equal(page.ids.get('cloudSyncSummary').textContent, '跨设备同步 · 已连接 · 已同步');
    assert.deepEqual(passedDays(firestore.decoded.at(-1), '止'), [TODAY]);
    assert.deepEqual(firestore.decoded.at(-1).priorityQueue, [queued]);

    const reopened = environment({ initialStorage: page.storage, location: LOCATION });
    await waitFor(() => reopened.ids.get('cloudSyncPasswordSetup').hidden && reopened.run('passedCount') === 2,
      'Reopen with the durable learning and remembered family connection');
    reopened.tap('settingsBtn');
    assert.equal(reopened.ids.get('cloudSyncPassword').value, '');
    assert.equal(reopened.run('state.herbalistStage'), 'stars');
    assert.equal(reopened.ids.get('todayPassed').textContent, '今天练了 2 个字 · 已通过 2 个');
    assert.match(reopened.ids.get('todayParentPlan').textContent, /家长安排 1 个字/);
    if (!allBlocked || interrupted) continue;

    await practice(reopened, '犬', 3);
    const newer = active();
    assert.deepEqual(passedDays(JSON.parse(newer.learning), '犬'), [TODAY]);
    await practice(page, '刀', 3);
    assert.deepEqual(active(), newer, 'A stale page cannot replace the newer progress revision');
    assert.match(page.ids.get('localProgressNotice').textContent, /另一个游戏页面已有更新/);
    const recoveryKey = [...page.storage.keys()].find(key => key.startsWith(RECOVERY) && !key.endsWith('-pending'));
    assert.ok(recoveryKey, 'Keep the stale page’s newly written character as a recovery copy');
    assert.deepEqual(passedDays(read(page.storage, recoveryKey).progress, '刀'), [TODAY]);

    const alerts = [];
    page.context.alert = message => alerts.push(message);
    page.context.confirm = () => true;
    page.context.FileReader = class {
      readAsText(file) { queueMicrotask(() => this.onload({ target: { result: file.text } })); }
    };
    const input = page.ids.get('fileInput');
    input.files = [{ text: localBytes }];
    input.dispatch('change');
    await waitFor(() => alerts.length > 0, 'Report the stale manual restore');
    assert.match(alerts[0], /另一个页面有新进度/);
    assert.deepEqual(active(), newer, 'A stale manual restore cannot replace the newer progress revision');

    const latest = environment({ initialStorage: reopened.storage, location: LOCATION });
    await waitFor(() => latest.ids.get('cloudSyncPasswordSetup').hidden && latest.run('passedCount') === 3,
      'Reopen again on the most recent durable revision');
    latest.tap('settingsBtn');
    assert.equal(latest.ids.get('todayPassed').textContent, '今天练了 3 个字 · 已通过 3 个');
    assert.match(latest.ids.get('todayParentPlan').textContent, /家长安排 1 个字/);
  }
  console.log('Shared progress: learning and story quota fallback, family reconnection, and stale-page save and restore guards passed.');
}

test().then(temporarySaveFailureBeforePasswordJoin).then(syncStatusAndOpenSettings).then(remotePullPreservesDatedMastery)
  .then(passwordConnectionSurvivesMetadataQuota)
  .then(progressSurvivesPrimaryQuota)
  .catch(error => { console.error(error); process.exitCode = 1; });
