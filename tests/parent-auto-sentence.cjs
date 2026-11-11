'use strict';

// Real parent input paths and child speech controls with local synthetic data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const startup = fs.readFileSync(path.join(__dirname, 'offline-startup.cjs'), 'utf8');
const boundary = startup.indexOf('\n(async()=>{');
assert.ok(boundary > 0, 'Shared whole-page fixture boundary changed');
const { environment, flush } = new Function('require', '__dirname', 'process',
  startup.slice(0, boundary) + '\nreturn {environment,flush};')(require, __dirname, process);

async function check(kind, char, word, pinyin, clue) {
  const e = environment();
  await flush();
  e.tap('settingsBtn');
  if (kind === 'single') {
    e.ids.get('charInput').value = char;
    e.ids.get('pinyinInput').value = pinyin;
    e.ids.get('wordInput').value = word;
    assert.equal(e.ids.get('sentenceInput').value, '');
    e.tap('addCharBtn');
  } else {
    e.ids.get('batchInput').value = word + '的' + char + ' ' + pinyin;
    e.tap('batchAddBtn');
  }
  assert.match(e.ids.get('queueList').innerHTML, /自动例句/);
  assert.doesNotMatch(e.ids.get('queueList').innerHTML, /可补句子|补句子/);
  assert.equal(e.run('state.priorityQueue[0].sentence'), undefined,
    'Automatic text is a hint, not a saved parent-written override');
  e.tap('closePanelBtn');
  await flush();
  assert.equal(e.run('currentItem.char'), char);
  assert.ok(!e.ids.get('pinyinTag').textContent.includes(char), 'The answer remains hidden while writing');
  assert.equal(e.ids.get('sentenceBtn').hidden, false);
  const originalInk = e.run('JSON.stringify(strokesPoints)');
  e.tap('sentenceBtn');
  assert.ok(e.spoken.at(-1)?.includes(word), 'Speak an example containing the complete imported word');
  assert.ok(e.spoken.at(-1)?.includes(clue), 'The spoken sentence gives a concrete clue to the meaning');
  assert.notEqual(e.spoken.at(-1), word, 'The child hears a sentence rather than only the word');
  assert.equal(e.run('JSON.stringify(strokesPoints)'), originalInk);
  assert.equal(e.run('passedCount'), 0);

  const reopened = environment({ initialStorage: e.storage });
  await flush();
  assert.equal(reopened.run('currentItem.word'), word, 'A saved prompt needs no reimport');
  reopened.tap('sentenceBtn');
  assert.equal(reopened.spoken.at(-1), e.spoken.at(-1));
}

async function checkUnknownWord() {
  const e = environment();
  await flush();
  e.tap('settingsBtn');
  e.ids.get('batchInput').value = '燕页的燕 yàn';
  e.tap('batchAddBtn');
  assert.match(e.ids.get('queueList').innerHTML, /暂无例句/);
  assert.match(e.ids.get('queueList').innerHTML, /加例句/);
  assert.equal(e.run('state.priorityQueue[0].word'), '燕页');
  e.tap('closePanelBtn');
  await flush();
  assert.equal(e.run('currentItem.word'), '燕页');
  assert.equal(e.ids.get('sentenceBtn').hidden, true);
  assert.equal(e.ids.get('submitBtn').disabled, false);
  e.tap('sentenceBtn');
  assert.deepEqual(e.spoken, [], 'Do not speak a filler or borrow another meaning');
  e.tap('speakBtn');
  assert.deepEqual(e.spoken, ['燕页'], 'Ordinary word pronunciation is available');
}

async function checkAiAfterImport() {
  const e = environment();
  await flush();
  const sent = [];
  const cache = new Map();
  const key = item => [item.char, item.word, item.pinyin].join('|');
  let refresh, connectCalls = 0;
  e.context.window.HanziAiSentences = {
    create(_window, onChange) {
      refresh = onChange;
      return {
        status: () => ({ connected: true, busy: false, message: 'AI 已连接。' }),
        complete: async () => false,
        begin: async () => { connectCalls++; },
        generate(items) { sent.push(Array.from(items, item => item.word)); return new Promise(() => {}); },
        get: item => item && cache.get(key(item)),
      };
    },
  };
  e.run('initAiSentences()');
  assert.deepEqual(sent, [], 'Ordinary startup does not send any words');
  e.tap('settingsBtn');
  e.ids.get('batchInput').value = '山间小径的山 shān。燕子的燕 yàn';
  e.tap('batchAddBtn');
  assert.deepEqual(sent, [['山间小径']], 'Only a word missing a reviewed hint is sent');
  assert.equal(e.ids.get('batchInput').value, '', 'Import does not wait for AI');
  const saved = e.storage.get('hanzi-magic-door-state-v1');
  assert.equal(JSON.parse(saved).priorityQueue[0].word, '山间小径');
  e.tap('closePanelBtn');
  await flush();
  assert.equal(e.run('currentItem.word'), '山间小径');
  assert.equal(e.ids.get('sentenceBtn').hidden, true);
  assert.equal(e.ids.get('submitBtn').disabled, false);
  e.run('strokesPoints = [[{x:1,y:1},{x:12,y:20}]]');
  const ink = e.run('JSON.stringify(strokesPoints)');
  cache.set('山|山间小径|shān', '我们沿着山间小径走上了山顶。');
  refresh();
  assert.equal(e.ids.get('sentenceBtn').hidden, false);
  assert.deepEqual(e.spoken, [], 'A late AI result never speaks by itself');
  assert.equal(e.run('JSON.stringify(strokesPoints)'), ink);
  e.tap('sentenceBtn');
  assert.deepEqual(e.spoken, ['我们沿着山间小径走上了山顶。']);
  assert.equal(e.run('currentItem.sentence'), undefined, 'AI output stays outside the study record');
  assert.equal(e.run("sentenceFor({...currentItem, sentence:'奶奶沿着山间小径去摘野果。'})"), '奶奶沿着山间小径去摘野果。');
  assert.equal(e.run("sentenceFor({...currentItem, word:'山脚小径'})"), '', 'Do not borrow a prior AI result for a new word');
  e.run("document.getElementById('aiSentenceConnectBtn').hidden=false");
  e.tap('aiSentenceConnectBtn');
  assert.equal(connectCalls, 0, 'Do not navigate away during handwriting');

  e.run("Object.assign(currentItem,{word:'山间<b>小径</b>',stuck:true,stuckDay:todayStr()});renderStuckList()");
  assert.match(e.ids.get('stuckList').innerHTML, /山间&lt;b&gt;小径&lt;\/b&gt;/);
  assert.doesNotMatch(e.ids.get('stuckList').innerHTML, /<b>/);
}

(async () => {
  await check('single', '燕', '海燕', 'yàn', '贴着海面');
  await check('batch', '山', '山间薄雾', 'shān', '慢慢散开');
  await check('batch', '栏', '栏杆', 'lán', '过桥时可以扶着它');
  await checkUnknownWord();
  await checkAiAfterImport();
  console.log('Parent examples: semantic cues on both input paths, word audio without a sentence, and optional custom entry passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
