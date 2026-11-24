'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Build only in memory so these checks cannot publish unrelated visual previews.
const startup = fs.readFileSync(path.join(__dirname, 'offline-startup.cjs'), 'utf8');
const {environment, flush} = new Function('require', '__dirname', 'process',
  startup.slice(0, startup.indexOf('\n(async()=>{')) + '\nreturn {environment,flush};')(
    require, __dirname, {argv: [...process.argv, '--source']});
const SAVE = 'hanzi-magic-herbalist-state-v1';
const target = {char: '栏', word: '栏杆牌', pinyin: 'lán'};
const generated = '管理员把新的栏杆牌装在了入口。';
const manual = '家长用栏杆牌提醒游客靠右行走。';
const key = value => JSON.stringify([value.char, value.word, value.pinyin]);
const read = page => JSON.parse(page.run('JSON.stringify({bank:state.bank,queue:state.priorityQueue})'));

async function setup(){
  const page = environment();
  await flush();
  const cache = new Map(), jobs = [];
  const client = {
    status: () => ({connected: true}),
    get: value => cache.get(key(value)) || null,
    generate(items){
      return new Promise(resolve => jobs.push({
        items: JSON.parse(JSON.stringify(items)),
        finish(){ for(const item of items) cache.set(key(item), generated); resolve(); },
      }));
    },
  };
  page.context.window.hanziAiSentenceClient = client;
  page.context.sentenceFixture = target;
  page.run('enqueueParentItems([sentenceFixture])');
  assert.equal(jobs.length, 1);
  return {page, cache, jobs, client};
}

async function savedAndReloaded(){
  const {page, jobs} = await setup();
  const before = read(page);
  const question = page.run('currentItem.char');
  const passes = page.run('passedCount');
  let syncChanges = 0;
  page.context.sentenceSync = {status: () => ({connected: true}), changed(){ syncChanges++; }};
  page.run('cloudSyncController=sentenceSync');
  jobs[0].finish();
  await flush();
  const after = read(page);
  const bank = after.bank.find(item => item.char === target.char);
  assert.equal(bank.sentence, generated);
  assert.equal(after.queue[0].sentence, generated);
  assert.deepEqual({...bank, sentence: undefined},
    {...before.bank.find(item => item.char === target.char), sentence: undefined}, 'Generation changes no learning evidence');
  assert.equal(page.run('currentItem.char'), question, 'An asynchronous hint does not replace the question');
  assert.equal(page.run('passedCount'), passes);
  assert.equal(syncChanges, 1, 'Successful local saving notifies the existing cloud controller');
  const saved = JSON.parse(page.storage.get(SAVE));
  assert.equal(saved.bank.find(item => item.char === target.char).sentence, generated);
  assert.equal(saved.priorityQueue[0].sentence, generated);
  const reopened = environment({initialStorage: new Map(page.storage), mode: 'offline'});
  await flush();
  assert.equal(read(reopened).bank.find(item => item.char === target.char).sentence, generated);
  assert.equal(read(reopened).queue[0].sentence, generated);
}

async function staleResults(){
  for (const mutation of [
    "state.bank.find(item=>item.char==='栏').word='栏杆锁';state.priorityQueue[0].word='栏杆锁'",
    "state.bank.find(item=>item.char==='栏').pinyin='lǎn';state.priorityQueue[0].pinyin='lǎn'",
    "state.priorityQueue[0].requestId='new-request'",
    'state.priorityQueue=[]',
  ]) {
    const {page, jobs} = await setup();
    page.run(mutation);
    jobs[0].finish();
    await flush();
    const current = read(page);
    assert.equal(current.bank.find(item => item.char === target.char).sentence, undefined, mutation);
    assert.ok(current.queue.every(item => item.sentence === undefined), mutation);
  }
}

async function explicitSentencesWin(){
  for (const destination of ['bank', 'queue']) {
    const {page, jobs} = await setup();
    page.context.manualSentence = manual;
    page.run(destination === 'bank'
      ? "state.bank.find(item=>item.char==='栏').sentence=manualSentence"
      : 'state.priorityQueue[0].sentence=manualSentence');
    jobs[0].finish();
    await flush();
    const current = read(page);
    assert.equal(current.bank.find(item => item.char === target.char).sentence, manual);
    assert.equal(current.queue[0].sentence, manual);
  }
}

async function delayedAndCached(){
  for (const barrier of ['syncApplying', 'parentValidation']) {
    const {page, jobs} = await setup();
    page.run(`${barrier}=true`);
    jobs[0].finish();
    await flush();
    assert.equal(read(page).queue[0].sentence, undefined, 'Do not mutate learning while saving is barred');
    page.run(`${barrier}=${barrier === 'parentValidation' ? 'null' : 'false'}`);
    page.advance(250);
    await flush();
    assert.equal(read(page).queue[0].sentence, generated);
  }
  const {page, jobs, client} = await setup();
  jobs[0].finish();
  await flush();
  page.run("delete state.bank.find(item=>item.char==='栏').sentence;delete state.priorityQueue[0].sentence");
  client.status = () => ({connected: false});
  page.run('requestAiSentences(state.priorityQueue)');
  await flush();
  assert.equal(read(page).queue[0].sentence, generated, 'An existing cache can be persisted without a new paid request');
  assert.equal(jobs.length, 1);
}

Promise.resolve().then(savedAndReloaded).then(staleResults).then(explicitSentencesWin).then(delayedAndCached).then(() => {
  console.log('AI sentence persistence: durable bank and queue hints, cloud notification, stale identity guards, manual priority, and deferred saving passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
