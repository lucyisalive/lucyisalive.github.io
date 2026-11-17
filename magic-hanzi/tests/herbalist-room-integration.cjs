'use strict';

// Run the built game with a recording room controller. Actual glyph grading,
// event handlers, queueing, and round transitions still execute unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const startup = fs.readFileSync(path.join(__dirname, 'offline-startup.cjs'), 'utf8');
const boundary = startup.indexOf('\n(async()=>{');
const loop = "for(let i=0;i<scripts.length;i++)vm.runInContext(scripts[i].source,context,{timeout:10000,filename:'built-inline-'+i+'.js'});";
assert.ok(boundary > 0 && startup.includes(loop));
const prelude = startup.slice(0, boundary).replace(loop, `for(let i=0;i<scripts.length;i++){
  if(i===mainIndex){
    window.HanziHerbalist = room;
    window.location = {hostname:'127.0.0.1', protocol:'http:'};
  }
  vm.runInContext(scripts[i].source,context,{timeout:10000,filename:'built-inline-'+i+'.js'});
}`);
const setup = new Function('require', '__dirname', 'process', 'room', prelude + '\nreturn {environment,flush,inkFor};');
const rewardMethods = ['pass', 'finale'];

async function run() {
  const calls = [];
  const methods = ['showWriting', 'arrive', 'pass', 'finale', 'nextLevel', 'restoreStage'];
  let surfaced = false;
  const room = { create({document, onTap}) {
    assert.ok(document.body);
    assert.equal(typeof onTap, 'function');
    return {
      ...Object.fromEntries(methods.map(method => [method, (...args) => calls.push([method, ...args])])),
      surface() {
        if (surfaced) return false;
        surfaced = true;
        return true;
      },
    };
  } };
  const {environment, flush, inkFor} = setup(require, __dirname, process, room);
  const game = environment();
  const rewards = () => calls.filter(([method]) => rewardMethods.includes(method));
  async function submitReference() {
    await flush();
    inkFor(game, game.run('currentItem.char'));
    game.tap('submitBtn');
    await flush();
  }

  assert.equal(game.run('cloudSyncController'), null);
  assert.equal(game.context.window.hanziAiSentenceClient, undefined);
  assert.deepEqual(rewards(), []);

  game.run("currentMode='teaching';stepIndex=TEACHING_STEPS.length-1;startTeachingRound();");
  await submitReference();
  assert.equal(game.run('pendingRetests.length'), 1);
  assert.equal(game.run('passedCount'), 0);
  assert.deepEqual(rewards(), [], 'Correct blind teaching is not a formal pass');

  game.run('pendingRetests[0].fillersSeen=2;');
  game.tap('continueBtn');
  assert.equal(game.run('currentMode'), 'retest');
  await submitReference();
  assert.equal(game.run('passedCount'), 1);
  assert.deepEqual(rewards(), [['pass', 1, 0]], 'A correct delayed retest awards exactly one pass');
  assert.match(game.run('resultBanner.textContent'), /加入一种草药/);

  game.tap('continueBtn');
  game.run('passedCount=ROUND_GOAL-1;');
  await submitReference();
  assert.equal(game.run('passedCount'), 10);
  assert.deepEqual(rewards().at(-1), ['pass', 10, 0]);
  const beforeFinale = game.run('state.scenesUnlocked');
  game.tap('continueBtn');
  game.run('showFinale(false);');
  assert.deepEqual(rewards().slice(-2), [['finale', false, 10, 0, true], ['finale', false, 10, 0, false]]);
  assert.equal(game.run('state.scenesUnlocked'), beforeFinale + 1);
  assert.match(game.run('finaleDetail.textContent'), /十种草药.*穿墙药水/);

  const beforeRestart = calls.length;
  game.tap('restartBtn');
  assert.deepEqual(calls.slice(beforeRestart), [['nextLevel', 'stars'], ['arrive', 0, 0], ['showWriting', true]],
    'Travel reads the completed room before loading the next question');
  await submitReference();
  assert.match(game.run('resultBanner.textContent'), /亮起了一颗星/);
  assert.deepEqual(rewards().at(-1), ['pass', 1, 0]);

  game.run('showFinale(true);');
  assert.deepEqual(rewards().at(-1), ['finale', true, 1, 0, false], 'An incomplete level has no bonus');
  game.tap('restartBtn');
  assert.equal(game.run('passedCount'), 1, 'Retrying an incomplete level keeps its formal pass');
  assert.equal(calls.filter(([method]) => method === 'nextLevel').length, 1, 'Retrying does not travel');

  game.run('passedCount=ROUND_GOAL-1;');
  await submitReference();
  game.tap('continueBtn');
  assert.match(game.run('finaleDetail.textContent'), /星座.*鸟/);
  assert.equal(game.run('state.scenesUnlocked'), beforeFinale + 2);
  game.run('passedCount=ROUND_GOAL;syncRoundCompleted=true;presentSyncedProgress();');
  assert.deepEqual(rewards().at(-1), ['finale', false, 10, 0, false], 'Restoring a completed level has no bonus');
  game.tap('restartBtn');
  assert.deepEqual(calls.filter(([method]) => method === 'nextLevel').at(-1), ['nextLevel', 'giant']);

  const remainingStages = [
    ['giant', 'bridge', /食材/, /巨人汤/],
    ['bridge', 'train', /桥板/, /小车站/],
    ['train', 'tomb', /气球/, /火车/],
    ['tomb', 'sea', /石像/, /石门/],
    ['sea', 'herbs', /音符/, /人鱼/],
  ];
  for (const [stage, next, passMessage, finishedMessage] of remainingStages) {
    assert.equal(game.run('state.herbalistStage'), stage);
    const saved = JSON.parse(game.storage.get('hanzi-magic-herbalist-state-v1'));
    assert.equal(environment({initialSave: saved}).run('state.herbalistStage'), stage, 'Reload restores ' + stage);
    game.run('passedCount=ROUND_GOAL-1;');
    await submitReference();
    assert.match(game.run('resultBanner.textContent'), passMessage);
    const before = game.run('state.scenesUnlocked');
    game.tap('continueBtn');
    assert.equal(game.run('state.scenesUnlocked'), before + 1);
    assert.match(game.run('finaleDetail.textContent'), finishedMessage);
    game.tap('restartBtn');
    if (stage === 'sea') {
      assert.equal(game.run('state.herbalistStage'), 'sea', 'Surfacing does not start a new lesson');
      assert.equal(game.run('state.scenesUnlocked'), before + 1, 'Ending animation gives no extra reward');
      game.tap('restartBtn');
    }
    assert.deepEqual(calls.filter(([method]) => method === 'nextLevel').at(-1), ['nextLevel', next]);
  }
  assert.ok(game.network.every(call => call.kind !== 'unexpected'));
  console.log('Story rooms: seven-stage route, saved-stage restoration, partial retry, surfacing, and once-only rewards passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
