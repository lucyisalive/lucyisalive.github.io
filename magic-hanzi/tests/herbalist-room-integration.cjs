'use strict';

// Run the built game with a recording room controller. Actual glyph grading,
// event handlers, queueing, and round transitions still execute unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

// Exercise the real room controller with deterministic scenery and clock. This
// checks that the new long ending only delays the visual transition, while
// learning/reward callers return immediately and a departure never replays it.
function verifyAutomaticEndings() {
  function roomFixture({reduced=false,missing=false}={}) {
    let now=0,timerId=0;
    const timers=new Map(),storage=new Map(),created=[],renders=[],exits=[];
    class Node {
      constructor(tag='div') { this.tagName=tag;this.children=[];this.parentNode=null;this.dataset={};this.attrs={};this.className='';this.hidden=false;this.listeners={};this.style={setProperty(k,v){this[k]=v;}};this.classList={
        contains:name=>this.className.split(/\s+/).includes(name),
        add:(...names)=>{this.className=[...new Set(this.className.split(/\s+/).filter(Boolean).concat(names))].join(' ');},
        remove:(...names)=>{this.className=this.className.split(/\s+/).filter(x=>!names.includes(x)).join(' ');},
        toggle:(name,force)=>{const on=force===undefined?!this.classList.contains(name):force;this.classList[on?'add':'remove'](name);return on;}
      }; }
      set innerHTML(html) { this.children=[];for(const m of html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) { const node=new Node(m[1]);for(const a of m[2].matchAll(/([\w-]+)=["']([^"']*)["']/g))node.setAttribute(a[1],a[2]);node.hidden=/\bhidden(?:\s|$)/.test(m[2]);this.appendChild(node); } }
      appendChild(node) { node.parentNode=this;this.children.push(node);return node; }
      insertBefore(node,before) { const at=this.children.indexOf(before);if(at<0)return this.appendChild(node);node.parentNode=this;this.children.splice(at,0,node);return node; }
      setAttribute(k,v) { this.attrs[k]=String(v);if(k==='id')this.id=v;if(k==='class')this.className=v; }
      getAttribute(k) { return this.attrs[k]??null; }
      querySelectorAll(selector) { const out=[];const visit=node=>{for(const child of node.children){if(selector[0]==='.'?child.classList.contains(selector.slice(1)):child.id===selector.slice(1))out.push(child);visit(child);}};visit(this);return out; }
      querySelector(selector) { return this.querySelectorAll(selector)[0]||null; }
      addEventListener(type,fn) { this.listeners[type]=fn; }
      getBoundingClientRect() { return {left:0,top:0,width:300,height:300}; }
      focus() {} showModal(){this.open=true;} close(){this.open=false;}
      get firstChild(){return this.children[0];} get lastElementChild(){return this.children.at(-1);}
    }
    const body=new Node('body');body.innerHTML='<header class="topbar"></header><button id="restartBtn"></button><button id="submitBtn"></button><p id="finaleDetail"></p>';
    const window={matchMedia:()=>({matches:reduced}),addEventListener(){},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k),key:i=>[...storage.keys()][i],get length(){return storage.size;}}};
    const document={body,defaultView:window,createElement:tag=>new Node(tag),querySelector:s=>body.querySelector(s),getElementById:id=>body.querySelector('#'+id),addEventListener(){}};
    for(const name of ['HanziDuneStory','HanziLibraryStory','HanziIceArmorStory','HanziBeanTrainStory','HanziRoseBaguaStory'])if(!missing)window[name]={create(){created.push(name);return {render(...args){renders.push([name,...args]);},playExit(stage){exits.push(stage);return 1000;},resetExit(){}};}};
    class ClockDate extends Date { static now(){return now;} }
    const context=vm.createContext({window,document,Date:ClockDate,setTimeout(fn,ms){timers.set(++timerId,{fn,at:now+ms});return timerId;},clearTimeout:id=>timers.delete(id)});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../herbalist-room.js'),'utf8'),context);
    const room=window.HanziHerbalist.create({document,onTap(node,fn){node.tap=fn;}});
    return {room,document,body,storage,created,renders,exits,advance(ms){const until=now+ms;for(;;){const due=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at);if(!due.length)break;const[id,t]=due[0];timers.delete(id);now=t.at;t.fn();}now=until;}};
  }
  const durations={beans:13700,rose:3800,bagua:5200},next={beans:'rose',rose:'bagua',bagua:'herbs'};
  for(const [stage,duration] of Object.entries(durations))for(const reduced of [false,true])for(const missing of [false,true]) {
    const e=roomFixture({reduced,missing});
    assert.deepEqual(e.created,[],'New scenery stays off the original startup path');
    e.room.restoreStage(stage,9,true);
    assert.equal(e.created.length,missing?0:1,'Only the visited visual module is created');
    e.room.pass(10,0);e.room.finale(false,10,0,true);
    assert.equal(e.storage.get('hanzi-herbalist-wallet-v1'),'6',stage+' pass and completion rewards save before any timer');
    assert.equal(e.room.finishEnding(),false,stage+' has no manual second ending');
    e.room.nextLevel(next[stage]);
    if(!reduced) {
      assert.equal(e.body.dataset.herbStage,stage,'The visual waits without blocking the next-round caller');
      e.advance(duration-1);
      assert.equal(e.body.dataset.herbStage,stage,stage+' keeps its full automatic ending');
      e.advance(246);
    }
    assert.equal(e.body.dataset.herbStage,next[stage]);
    assert.deepEqual(e.exits,[],stage+' travel never calls playExit for the automatic ending');
    if(!missing)assert.ok(e.renders.some(([name,renderStage])=>name===(stage==='beans'?'HanziBeanTrainStory':'HanziRoseBaguaStory') && renderStage===next[stage]),'Previously created scenes still render the next stage so they can hide');
    const restored=roomFixture({reduced,missing});
    restored.room.restoreStage(stage,10,true);restored.room.nextLevel(next[stage]);
    restored.advance(245);
    assert.equal(restored.body.dataset.herbStage,next[stage],'Restoring a finished room does not restart or wait for its ending');
    assert.equal(restored.storage.get('hanzi-herbalist-wallet-v1'),undefined,'Restoring does not issue old rewards');
    assert.deepEqual(restored.exits,[]);
  }
}

async function run() {
  verifyAutomaticEndings();
  const calls = [], endings = [];
  const methods = ['showWriting', 'arrive', 'pass', 'finale'];
  const endingStages = new Set(['sea', 'dunes', 'library', 'ice']);
  const room = { create({document, onTap}) {
    assert.ok(document.body);
    assert.equal(typeof onTap, 'function');
    // Each loaded game owns its controller state. Reloading a saved game must
    // not reset the active game's stage/ending, or vice versa.
    let stage = 'herbs', endingSeen = false;
    function select(next) { stage = next; endingSeen = false; }
    function finishEnding() {
      const wait = endingStages.has(stage) && !endingSeen;
      if (wait) endingSeen = true;
      endings.push({stage, wait});
      return wait;
    }
    return {
      ...Object.fromEntries(methods.map(method => [method, (...args) => calls.push([method, ...args])])),
      restoreStage(savedStage, ...args) {
        select(savedStage);
        calls.push(['restoreStage', savedStage, ...args]);
      },
      nextLevel(nextStage, ...args) {
        select(nextStage);
        calls.push(['nextLevel', nextStage, ...args]);
      },
      finishEnding,
      surface() {
        return stage === 'sea' ? finishEnding() : false;
      },
    };
  } };
  const {environment, flush, inkFor} = setup(require, __dirname, process, room);
  const game = environment();
  const rewards = () => calls.filter(([method]) => rewardMethods.includes(method));
  const passAwards = () => calls.filter(([method]) => method === 'pass').length;
  const levelAwards = () => calls.filter(([method, bankEmpty, count, mastered, newlyAwarded]) =>
    method === 'finale' && !bankEmpty && count === 10 && newlyAwarded === true).length;
  const routes = ['herbs', 'stars', 'giant', 'bridge', 'train', 'tomb', 'sea', 'dunes', 'library', 'ice', 'armor', 'beans', 'rose', 'bagua'];
  assert.deepEqual(Array.from(game.run('Object.keys(HERBALIST_STAGES)')), routes, 'The formal game exposes all fourteen story rooms');
  assert.equal(game.run('GAME_VERSION'),'2026.11.25.1');
  for(const [stage,arrival] of [['beans',13700],['rose',3800],['bagua',5200]]) {
    assert.equal(game.run(`HERBALIST_STAGES.${stage}.arrival`),arrival,stage+' waits only for its remaining scenery');
    assert.equal(game.run(`HERBALIST_STAGES.${stage}.automaticEnding`),true,stage+' must not replay its automatic ending during travel');
    assert.equal(game.run(`HERBALIST_STAGES.${stage}.endingNext`),undefined,stage+' transitions directly after the automatic ending');
  }
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
  assert.deepEqual(endings.at(-1), {stage: 'herbs', wait: false});
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
    ['sea', 'dunes', /音符/, /人鱼/],
    ['dunes', 'library', /脚印/, /龙/],
    ['library', 'ice', /书/, /禁书|结界/],
    ['ice', 'armor', /冰|裂缝/, /女神|冰/],
    ['armor', 'beans', /铁链|锁链/, /盔甲|跪/],
    ['beans', 'rose', /豆藤/, /车站|火车/],
    ['rose', 'bagua', /玫瑰|藤蔓/, /美人|睁开/],
    ['bagua', 'herbs', /封印/, /太极|石门/],
  ];
  for (const [stage, next, passMessage, finishedMessage] of remainingStages) {
    const addedRoom = ['dunes', 'library', 'ice', 'armor', 'beans', 'rose', 'bagua'].includes(stage);
    assert.equal(game.run('state.herbalistStage'), stage);
    const saved = JSON.parse(game.storage.get('hanzi-magic-herbalist-state-v1'));
    const passesBeforeReload = passAwards(), bonusesBeforeReload = levelAwards();
    const reloaded = environment({initialSave: saved});
    assert.equal(reloaded.run('state.herbalistStage'), stage, 'Reload restores ' + stage);
    assert.equal(reloaded.run('passedCount'), 0, 'A new room resumes with zero passes');
    assert.equal(passAwards(), passesBeforeReload, 'Restoring ' + stage + ' never replays a pass');
    assert.equal(levelAwards(), bonusesBeforeReload, 'Restoring ' + stage + ' never grants a completion bonus');
    const passesBefore = passAwards(), bonusesBefore = levelAwards();
    if (addedRoom) {
      // All new rooms use the real teaching/retest path. A correct blind
      // teaching step must not light a reward, spend a stage pass, or travel.
      const rewardsBeforeTeaching = rewards().length;
      game.run("currentMode='teaching';stepIndex=TEACHING_STEPS.length-1;startTeachingRound();");
      await submitReference();
      assert.equal(game.run('pendingRetests.length'), 1, stage + ' schedules a delayed retest');
      assert.equal(game.run('passedCount'), 0, stage + ' teaching is not a formal pass');
      assert.equal(rewards().length, rewardsBeforeTeaching, stage + ' teaching earns no room reward');
      assert.equal(game.run('state.herbalistStage'), stage);
      game.run('pendingRetests[0].fillersSeen=2;');
      game.tap('continueBtn');
      assert.equal(game.run('currentMode'), 'retest');
      await submitReference();
      assert.equal(game.run('passedCount'), 1);
      assert.equal(passAwards(), passesBefore + 1, 'A delayed retest earns exactly one ' + stage + ' reward');
      assert.match(game.run('resultBanner.textContent'), passMessage);
      game.tap('continueBtn');
      for (let count = 2; count <= 10; count++) {
        await submitReference();
        assert.equal(game.run('passedCount'), count, stage + ' advances once per formal submission');
        assert.match(game.run('resultBanner.textContent'), passMessage);
        if (count === 5) {
          const midSave = JSON.parse(game.storage.get('hanzi-magic-herbalist-state-v1'));
          const passCount = passAwards(), bonusCount = levelAwards();
          const restored = environment({initialSave: midSave});
          assert.equal(restored.run('state.herbalistStage'), stage);
          assert.equal(restored.run('passedCount'), 5, 'Reload keeps the partial ' + stage + ' count');
          assert.equal(passAwards(), passCount, 'Partial restoration does not replay stage rewards');
          assert.equal(levelAwards(), bonusCount);
        }
        if (count < 10) game.tap('continueBtn');
      }
      assert.equal(passAwards(), passesBefore + 10, stage + ' earns exactly ten formal-pass rewards');
    } else {
      game.run('passedCount=ROUND_GOAL-1;');
      await submitReference();
      assert.match(game.run('resultBanner.textContent'), passMessage);
    }
    if(['beans','rose','bagua'].includes(stage)) {
      const immediateSave=JSON.parse(game.storage.get('hanzi-magic-herbalist-state-v1'));
      assert.equal(immediateSave.herbalistStage,stage);
      assert.ok(immediateSave.bank.some(item=>item.passedDays?.length),'The tenth formal pass saves learning before scenery finishes');
      assert.equal(passAwards(),passesBefore+10,'Every pass reward is recorded without waiting for an ending');
    }
    const before = game.run('state.scenesUnlocked');
    game.tap('continueBtn');
    assert.equal(game.run('state.scenesUnlocked'), before + 1);
    assert.match(game.run('finaleDetail.textContent'), finishedMessage);
    assert.equal(levelAwards(), bonusesBefore + 1, stage + ' awards one full-room bonus');
    game.run('showFinale(false);');
    assert.equal(game.run('state.scenesUnlocked'), before + 1, stage + ' duplicate finale does not unlock twice');
    assert.equal(levelAwards(), bonusesBefore + 1, stage + ' duplicate finale does not award twice');
    assert.deepEqual(rewards().at(-1), ['finale', false, 10, 0, false]);
    if (addedRoom) {
      await flush();
      const completeSave = JSON.parse(game.storage.get('hanzi-magic-herbalist-state-v1'));
      const passesAtCompletion = passAwards(), bonusesAtCompletion = levelAwards();
      const restored = environment({initialSave: completeSave});
      assert.equal(restored.run('state.herbalistStage'), stage);
      assert.equal(restored.run('passedCount'), 10);
      assert.equal(restored.run('state.scenesUnlocked'), before + 1);
      assert.equal(restored.run('syncSceneAwarded'), true);
      assert.equal(passAwards(), passesAtCompletion, 'Completed restoration does not replay passes');
      assert.equal(levelAwards(), bonusesAtCompletion, 'Completed restoration does not duplicate bonuses');
    }
    const endingStart = endings.length, travelBefore = calls.filter(([method]) => method === 'nextLevel').length;
    const rewardsBeforeEnding = rewards().length;
    const learningBeforeEnding = game.run('JSON.stringify({bank:state.bank,queue:state.priorityQueue,passedCount})');
    game.tap('restartBtn');
    if (endingStages.has(stage)) {
      assert.equal(game.run('state.herbalistStage'), stage, 'The ' + stage + ' ending does not start a new lesson');
      assert.equal(game.run('passedCount'), 10, 'Watching the ending keeps the completed lesson');
      assert.equal(calls.filter(([method]) => method === 'nextLevel').length, travelBefore);
      assert.equal(game.run('state.scenesUnlocked'), before + 1, 'Ending animation gives no extra reward');
      assert.equal(rewards().length, rewardsBeforeEnding, 'The ending does not replay pass/finale rewards');
      assert.equal(game.run('JSON.stringify({bank:state.bank,queue:state.priorityQueue,passedCount})'), learningBeforeEnding,
        'The ending leaves learning and parent arrangements untouched');
      assert.deepEqual(endings.slice(endingStart), [{stage, wait: true}]);
      game.tap('restartBtn');
      assert.deepEqual(endings.slice(endingStart), [{stage, wait: true}, {stage, wait: false}]);
    } else {
      assert.deepEqual(endings.slice(endingStart), [{stage, wait: false}]);
    }
    assert.equal(game.run('state.herbalistStage'), next);
    assert.equal(game.run('passedCount'), 0, 'Travelling starts the next room at zero');
    assert.deepEqual(calls.filter(([method]) => method === 'nextLevel').at(-1), ['nextLevel', next]);
    assert.equal(levelAwards(), bonusesBefore + 1);
  }
  assert.equal(levelAwards(), 14, 'One bonus per room across the complete fourteen-room route');
  assert.ok(game.network.every(call => call.kind !== 'unexpected'));
  console.log('Story rooms: fourteen-stage route, teaching/retest rewards, partial/completed restoration, two-step endings, and once-only bonuses passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
