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

async function check(kind, char, word, pinyin) {
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
  const originalInk = e.run('JSON.stringify(strokesPoints)');
  e.tap('sentenceBtn');
  assert.ok(e.spoken.at(-1)?.includes(word), 'Speak an example containing the complete imported word');
  assert.notEqual(e.spoken.at(-1), word, 'The child hears a sentence rather than only the word');
  assert.equal(e.run('JSON.stringify(strokesPoints)'), originalInk);
  assert.equal(e.run('passedCount'), 0);
}

(async () => {
  await check('single', '燕', '海燕', 'yàn');
  await check('batch', '山', '山间薄雾', 'shān');
  console.log('Parent examples: single and bulk input need no custom sentence; exact word is spoken without revealing the answer.');
})().catch(error => { console.error(error); process.exitCode = 1; });
