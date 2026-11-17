'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const startup = fs.readFileSync(path.join(__dirname, 'offline-startup.cjs'), 'utf8');
const {environment, flush} = new Function('require', '__dirname', 'process',
  startup.slice(0, startup.indexOf('\n(async()=>{')) + '\nreturn {environment,flush};')(require, __dirname, process);

const firstDay = '2026-10-27';
const secondDay = '2026-10-28';
const thirdDay = '2026-10-29';
const today = '2026-11-03';
const initialSave = {
  bankVersion: 5, dailyCount: 10, scenesUnlocked: 0, priorityQueue: [],
  bank: [
    {char: '荷', pinyin: 'hé', word: '荷花', fromParent: true, passedDays: [],
      history: [{day: today, outcome: 'abandoned'}], stuck: true, stuckDay: today, wrongToday: 3, wrongDay: today},
    {char: '花', pinyin: 'huā', word: '荷花', fromParent: true, passedDays: [firstDay, firstDay]},
    {char: '因', pinyin: 'yīn', word: '原因 <b> & "', fromParent: true, passedDays: [firstDay, secondDay]},
    {char: '理', pinyin: 'lǐ', fromParent: true, passedDays: [firstDay, secondDay, thirdDay]},
    {char: '夕', pinyin: 'xī', retired: true, passedDays: [firstDay, secondDay, thirdDay]},
    {char: '止', pinyin: 'zhǐ', retired: true, passedDays: [firstDay]},
  ],
};

function openDetails(page, name){
  const details = page.ids.get(name);
  details.open = true;
  details.dispatch('toggle');
}

function assertCounts(page, {total, words, chars, pending, active, memory}){
  const content = id => page.ids.get(id).textContent;
  assert.equal(content('learningTotal'), `字库共 ${total} 个练习字`);
  assert.equal(content('learningParentTotal'), `家长录入 ${words} 个词语 · ${chars} 个字`);
  assert.equal(content('learningPendingCount'), `${pending} 字`);
  assert.equal(content('learningActiveCount'), `${active} 字`);
  assert.equal(content('learningMemoryCount'), `${memory} 字`);
}

async function checkOverview(){
  const page = environment({initialSave});
  await flush();
  page.tap('settingsBtn');
  assertCounts(page, {total: 5, words: 2, chars: 4, pending: 1, active: 2, memory: 2});

  openDetails(page, 'learningPendingDetails');
  openDetails(page, 'learningActiveDetails');
  openDetails(page, 'learningMemoryDetails');
  const pendingList = page.ids.get('learningPendingList');
  const activeList = page.ids.get('learningActiveList');
  const memoryList = page.ids.get('masteredList');
  assert.match(pendingList.innerHTML, /荷/u, 'Wrong-only practice belongs in pending');
  assert.doesNotMatch(pendingList.innerHTML, /aria-label="[12] 星/u);
  assert.match(activeList.innerHTML, /花/u);
  assert.match(activeList.innerHTML, /因/u);
  assert.match(activeList.innerHTML, /aria-label="1 星，已通过 1 天"/u, 'Duplicate dates earn one star');
  assert.match(activeList.innerHTML, /aria-label="2 星，已通过 2 天"/u);
  assert.doesNotMatch(activeList.innerHTML, /止/u, 'Retired partial items are outside the overview');
  assert.match(activeList.innerHTML, /原因 &lt;b&gt; &amp; &quot;/u, 'Saved cue text is escaped');
  assert.match(memoryList.innerHTML, /理/u, 'A standalone character has no cue word and still counts');
  assert.match(memoryList.innerHTML, /夕/u, 'A retired mastered character still counts');

  const batchInput = page.ids.get('batchInput');
  batchInput.value = '乙方的乙 yǐ';
  page.tap('batchAddBtn');
  assertCounts(page, {total: 6, words: 3, chars: 5, pending: 2, active: 2, memory: 2});
  assert.match(pendingList.innerHTML, /乙方/u, 'Import refreshes the open list immediately');

  batchInput.value = '花朵的花 huā';
  page.tap('batchAddBtn');
  assertCounts(page, {total: 6, words: 4, chars: 5, pending: 2, active: 2, memory: 2});
  assert.match(activeList.innerHTML, /花朵/u, 'Re-import replaces the cue without duplicating the target');
  assert.match(activeList.innerHTML, /aria-label="1 星，已通过 1 天"/u, 'Re-import preserves learning evidence');
  await flush();
}

async function checkAutomaticSentences(){
  const page = environment({mode:'offline', location:{protocol:'file:', href:'file:///preview/index.html'}});
  await flush();
  page.tap('settingsBtn');
  page.ids.get('batchInput').value = '悄悄的悄 qiāo，嗅觉的嗅 xiù，栏杆牌的栏 lán';
  page.tap('batchAddBtn');

  const queue = page.ids.get('queueList').innerHTML;
  assert.match(queue, /悄悄<small>[^<]+自动例句/u);
  assert.match(queue, /嗅觉<small>[^<]+自动例句/u);
  assert.match(queue, /栏杆牌<small>[^<]+听写提示已就绪/u);
  assert.doesNotMatch(queue, /加例句|换例句|暂无例句/u);
  page.tap('closePanelBtn');
  assert.equal(page.run('currentItem.char'), '悄');
  assert.equal(page.ids.get('pinyinTag').textContent, 'qiāoqiāo');
  assert.equal(page.ids.get('sentenceBtn').hidden, false);
  page.tap('sentenceBtn');
  assert.match(page.spoken.at(-1), /悄悄走进房间/u);
  assert.equal(page.context.window.hanziAiSentenceClient, undefined);
  assert.ok(page.network.every(call => !String(call.url).includes('openrouter.ai')));
  await flush();
}

async function checkTodayLearning(){
  const save = {
    ...initialSave, herbalistStage:'herbs',
    sessionProgress:{version:1, day:today, roundId:'today-fixture', passedCount:4},
    priorityQueue:[
      {char:'荷', pinyin:'hé', word:'荷花', addedDay:today},
      {char:'花', pinyin:'huā', word:'荷花', addedDay:today, completedDay:today},
      {char:'理', pinyin:'lǐ', addedDay:thirdDay},
    ],
    bank:initialSave.bank.map(item => {
      if(item.char === '花') return {...item, passedDays:[firstDay, today, today]};
      if(item.char === '因') return {...item, passedDays:undefined, history:[{day:today, outcome:'retest-pass'}]};
      return item;
    }),
  };
  const page = environment({initialSave:save});
  await flush();
  page.context.dailyFixture = JSON.stringify(save);
  page.run('applyProgressToPage(parseSavedState(dailyFixture), true)');
  const content = id => page.ids.get(id).textContent;
  const bar = page.ids.get('todayLevelBar');
  const expectToday = (practiced, passes, levelPasses, plan) => {
    assert.equal(content('todayPassed'), `今天练了 ${practiced} 个字 · 已通过 ${passes} 个`);
    assert.equal(content('todayLevel'), `本关已通过 ${levelPasses} / 10 次`);
    assert.equal(bar.max, 10);
    assert.equal(bar.value, levelPasses);
    assert.equal(content('todayParentPlan'), plan);
  };

  page.tap('settingsBtn');
  expectToday(3, 2, 4, '家长安排 2 个字 · 已完成 1 个 · 剩余 1 个');

  page.ids.get('batchInput').value = '荷花的花 huā';
  page.tap('batchAddBtn');
  expectToday(3, 2, 4, '家长安排 2 个字 · 已完成 0 个 · 剩余 2 个');
  page.tap('closePanelBtn');
  assert.equal(page.run('currentItem.char'), '花');
  page.run('handleAttemptResult(true)');
  page.tap('settingsBtn');
  expectToday(3, 2, 5, '家长安排 2 个字 · 已完成 1 个 · 剩余 1 个');

  page.advance(24 * 60 * 60 * 1000);
  page.tap('settingsBtn');
  expectToday(0, 0, 5, '今天还没有家长安排的字');
}

Promise.resolve().then(checkOverview).then(checkAutomaticSentences).then(checkTodayLearning).then(() => {
  console.log('Learning overview: today’s passes, level and parent plan, distinct-day progress, and automatic offline sentences passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
