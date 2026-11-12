'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const startup = fs.readFileSync(path.join(__dirname, 'offline-startup.cjs'), 'utf8');
const harness = new Function('require', '__dirname', 'process',
  startup.slice(0, startup.indexOf('\n(async()=>{')) + '\nreturn {environment,flush,inkFor};')(require, __dirname, process);
const {environment, flush, inkFor} = harness;
const SAVE = 'hanzi-magic-door-state-v1';
const INK = 'hanzi-magic-door-ink-v1';
const RECOVERY = 'hanzi-magic-door-local-recovery-v1-';
const BEFORE_RESTORE = 'hanzi-magic-door-pre-restore-v1';
const PENDING_INK = 'hanzi-magic-door-pending-ink-v1-';

function simulatedLocks(){
  const pending = new Map();
  return {
    request(key, write){
      const task = (pending.get(key) || Promise.resolve()).then(write);
      pending.set(key, task.catch(() => {}));
      return task;
    },
  };
}

function shareStorage(page, shared, id, locks){
  Object.assign(page.context.localStorage, {
    getItem:key => shared.get(key) ?? null,
    setItem:(key,value) => shared.set(key,value),
    removeItem:key => shared.delete(key),
    key:index => [...shared.keys()][index] ?? null,
  });
  Object.defineProperty(page.context.localStorage, 'length', {get:() => shared.size});
  page.context.window.crypto = {randomUUID:() => id};
  page.context.window.navigator = {locks};
}

async function showQuestion(page, char){
  page.context.chosenChar = char;
  page.run("presentDoor(state.bank.find(item => item.char === chosenChar), 'free', 1);");
  await flush();
  inkFor(page, char);
}

function recordChars(raw){
  return JSON.parse(raw).bank.filter(item => item.passedDays.length).map(item => item.char);
}

function restoreFrom(page, value){
  const file = page.ids.get('fileInput');
  file.files = [{name:'synthetic.json'}];
  file.value = 'synthetic.json';
  page.context.FileReader = class {
    readAsText(){ this.onload({target:{result:JSON.stringify(value)}}); }
  };
  file.dispatch('change');
}

async function simultaneousTabs(useLocks){
  const shared = new Map();
  const a = environment(), b = environment();
  const locks = useLocks ? simulatedLocks() : undefined;
  shareStorage(a, shared, 'first-tab', locks);
  shareStorage(b, shared, 'second-tab', locks);
  await showQuestion(a, '犬');
  await showQuestion(b, '止');
  a.tap('submitBtn');
  b.tap('submitBtn');
  await flush();
  await flush();
  assert.deepEqual(recordChars(shared.get(SAVE)), ['犬'], 'The stale page must not overwrite the first save');
  const recovery = JSON.parse(shared.get(RECOVERY + 'second-tab'));
  assert.deepEqual(recordChars(JSON.stringify(recovery.progress)), ['止'], 'Keep the other page’s work in its recovery copy');
  assert.match(b.ids.get('localProgressNotice').textContent, /本页进度已另存/);
  assert.throws(() => b.run('getCloudProgressState()'), /另存/, 'A stale page cannot upload');
  assert.deepEqual(JSON.parse(shared.get(INK)).map(entry=>entry.c).sort(), ['止','犬'].sort());

  const reopened = environment({initialStorage:shared});
  shareStorage(reopened, shared, 'third-tab', locks);
  await flush();
  reopened.tap('settingsBtn');
  assert.equal(reopened.ids.get('localRecoveryCopies').hidden, false);
  assert.equal(reopened.ids.get('localRecoverySelect').children[0].value, RECOVERY + 'second-tab');

  // Another page marks the earlier trace while this page records a new answer.
  const marker = environment({initialStorage:shared});
  shareStorage(marker, shared, 'marking-tab', locks);
  await flush();
  marker.run("togglePlayerDispute(inkLog.find(entry => entry.c === '犬'));");
  await showQuestion(reopened, '固');
  reopened.tap('submitBtn');
  await flush();
  const marked = JSON.parse(shared.get(INK));
  assert.equal(marked.length, 3);
  assert.equal(marked.find(entry=>entry.c==='犬').playerReview.source,'player');

  // The mark tab never saw 固, so its clear must not delete it.
  marker.tap('inkClearBtn');
  await flush();
  assert.deepEqual(JSON.parse(shared.get(INK)).map(entry=>entry.c), ['固']);
}

async function backupCases(){
  const legacy = {bankVersion:4, dailyCount:5, scenesUnlocked:3, bank:[{char:'理',pinyin:'lǐ',word:'道理',box:3,
    lastSeen:'2026-10-01',history:[{day:'2026-10-01',outcome:'first-try'}],passedDays:['2026-10-01']}],priorityQueue:[]};
  const original = {bankVersion:5, dailyCount:10, scenesUnlocked:1, bank:[{char:'止',pinyin:'zhǐ',word:'停止',history:[],passedDays:[]}],priorityQueue:[]};
  const page = environment({initialSave:original});
  const alerts = [];
  page.context.alert = message => alerts.push(message);
  await flush();
  page.run('passedCount=2;');
  const saved = page.storage.get(SAVE);
  restoreFrom(page, {bank:'invalid'});
  assert.match(alerts.at(-1), /不是有效/);
  assert.equal(page.storage.get(SAVE), saved);
  assert.equal(page.run('passedCount'), 2);

  await showQuestion(page, '止');
  const beforeInk = page.run('JSON.stringify(strokesPoints)');
  restoreFrom(page, legacy);
  assert.match(alerts.at(-1), /完成正在进行/);
  assert.equal(page.run('JSON.stringify(strokesPoints)'), beforeInk);
  assert.equal(page.run('passedCount'), 2);
  page.run('clearCanvas();');

  const oldBackup = JSON.stringify({at:1, raw:JSON.stringify(legacy)});
  page.storage.set(BEFORE_RESTORE, oldBackup);
  const setItem = page.context.localStorage.setItem;
  page.context.localStorage.setItem = (key,value) => {
    if(key === SAVE) throw new Error('synthetic storage quota');
    return setItem(key,value);
  };
  restoreFrom(page, legacy);
  assert.match(alerts.at(-1), /未能保存/);
  assert.equal(page.storage.get(SAVE), saved);
  assert.equal(page.storage.get(BEFORE_RESTORE), oldBackup);
  assert.equal(page.run('state.scenesUnlocked'), 1);
  assert.equal(page.run('passedCount'), 2);
  page.context.localStorage.setItem = setItem;
  restoreFrom(page, legacy);
  assert.match(alerts.at(-1), /已恢复，并已保存在本机/);
  assert.equal(page.storage.get(SAVE), page.run('JSON.stringify(state)'));
  assert.equal(page.run('state.scenesUnlocked'), 3);
  assert.ok(recordChars(page.storage.get(SAVE)).includes('理'));
  assert.equal(JSON.parse(page.storage.get(BEFORE_RESTORE)).raw, saved);

  const damaged = '{not parseable';
  const repair = environment({initialStorage:[[SAVE,damaged]]});
  restoreFrom(repair, legacy);
  assert.ok(recordChars(repair.storage.get(SAVE)).includes('理'));
  assert.equal(JSON.parse(repair.storage.get(BEFORE_RESTORE)).raw, damaged);

  const countedDays = environment({initialSave:original});
  restoreFrom(countedDays, {daysElapsed:2, bank:[{char:'理',pinyin:'lǐ',word:'道理',box:3,
    lastSeen:2,history:[{day:2,outcome:'first-try'}]}]});
  const migrated = JSON.parse(countedDays.storage.get(SAVE)).bank.find(item=>item.char==='理');
  assert.equal(migrated.box, 3);
  assert.equal(migrated.lastSeen, null);
  assert.deepEqual(migrated.passedDays, []);
}

async function pendingProgressCase(){
  const page = environment(), shared = new Map(), locks = simulatedLocks();
  shareStorage(page, shared, 'closing-tab', locks);
  let release;
  locks.request(SAVE, () => new Promise(resolve => { release = resolve; }));
  await showQuestion(page, '犬');
  page.tap('submitBtn');
  await flush();
  assert.equal(page.run('passedCount'), 1);
  assert.ok(page.run('progressWrites > 0'));
  assert.equal(shared.has(SAVE), false);
  assert.throws(() => page.run('getCloudProgressState()'), /正在保存/);
  page.run('preservePendingProgress();');
  const key = RECOVERY + 'closing-tab-pending';
  assert.deepEqual(recordChars(JSON.stringify(JSON.parse(shared.get(key)).progress)), ['犬']);
  assert.equal(shared.has(SAVE), false, 'The pending copy may not overwrite shared progress');
  release();
  await flush();
  assert.deepEqual(recordChars(shared.get(SAVE)), ['犬']);
  assert.equal(shared.has(key), false, 'Once the same write is durable the pending copy is redundant');
}

async function pendingInkCase(){
  const page = environment(), shared = new Map(), locks = simulatedLocks();
  shareStorage(page, shared, 'closing-tab', locks);
  let release;
  locks.request(INK, () => new Promise(resolve => { release = resolve; }));
  await showQuestion(page, '犬');
  page.tap('submitBtn');
  await flush();
  assert.equal(page.run('passedCount'), 1);
  assert.equal(shared.has(INK), false);
  page.run('preservePendingInk();');
  const key = PENDING_INK + 'closing-tab-1';
  assert.deepEqual(JSON.parse(shared.get(key)).map(entry => entry.c), ['犬']);

  const reopened = environment({initialStorage:shared});
  shareStorage(reopened, shared, 'reopened-tab', locks);
  reopened.run('recoverPendingInkCopies();');
  release();
  await flush();
  assert.deepEqual(JSON.parse(shared.get(INK)).map(entry => entry.c), ['犬'], 'Do not duplicate a recovered trace');
  assert.equal(shared.has(key), false);
}

(async()=>{
  await simultaneousTabs(false);
  await simultaneousTabs(true);
  await backupCases();
  await pendingProgressCase();
  await pendingInkCase();
  console.log('Local progress: independent tab recovery, merged ink and marks, safe restore, quota failure, and legacy/corrupt backups passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
