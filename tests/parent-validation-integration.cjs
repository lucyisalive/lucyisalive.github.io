'use strict';

// Reuse the existing lightweight DOM/network fixture, while executing the real
// built page and its handlers. Do not rerun that file's separate startup suite.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const startupFile=path.join(__dirname,'offline-startup.cjs');
const startupSource=fs.readFileSync(startupFile,'utf8');
const boundary=startupSource.indexOf('\n(async()=>{');
assert.ok(boundary>0,'The shared full-page fixture boundary changed; review the integration test');
const harness=new Function('require','__dirname','process',startupSource.slice(0,boundary)+
  '\nreturn {environment,flush,inkFor,html,scripts};')(require,__dirname,process);
const {environment,flush,inkFor,html,scripts}=harness;
assert.equal(scripts.filter(s=>s.attributes.includes('data-source="parent-validation.js"')).length,1,
  'Load the adult validation module once before the main application');
assert.ok(/id="parentTestRound1Btn"/.test(html));
const clone=value=>JSON.parse(JSON.stringify(value));
const SAVE='hanzi-magic-door-state-v1',INK='hanzi-magic-door-ink-v1',PARENT='hanzi-magic-door-parent-ink-v1';
const plain=(e,source)=>clone(e.run(source));
const seededSave=()=>({bankVersion:5,dailyCount:5,scenesUnlocked:2,bank:[{
  char:'理',pinyin:'lǐ',word:'道理',sentence:'这个道理很简单。',fromParent:true,
  box:3,interval:14,lastSeen:'2026-10-01',history:[{day:'2026-10-01',outcome:'first-try'}],
  passedDays:['2026-10-01'],wrongToday:1,wrongDay:'2026-11-03',customMemo:{keep:'原学习记录'},
}],priorityQueue:[{char:'理',word:'道理',pinyin:'lǐ',addedDay:'2026-11-03',completedDay:null,requestId:'original-request'}]});
const originalChildInk=[{c:'学',s:[[[10,10],[20,20]]],v:'fail',d:'2026-10-01',disputed:true,timestamp:1}];
async function boot(options={}){
  const e=environment({initialSave:seededSave(),initialStorage:new Map([[INK,JSON.stringify(originalChildInk)]]),...options});
  await flush();
  assert.equal(e.ids.get('startupNotice').hidden,true);
  assert.equal(e.run('parentValidation'),null,'Boot must never restore an active adult session');
  assert.equal(e.run('currentMode'),'free');
  e.context.storageWrites=[];
  e.run(`const integrationSetItem=localStorage.setItem;
    localStorage.setItem=(key,value)=>{storageWrites.push([key,value]);return integrationSetItem(key,value);};`);
  return e;
}
function snapshot(e){
  return {state:e.run('JSON.stringify(state)'),save:e.storage.get(SAVE),ink:e.storage.get(INK),
    normalInk:e.run('JSON.stringify(inkLog)'),runtime:e.run(`JSON.stringify({passedCount,pendingRetests,
      priority:[...priorityConsumedToday],selectionSession,currentParentRequestId,stepIndex,stepAttempts,currentRound})`)};
}
function isolated(e,before){
  assert.equal(e.run('JSON.stringify(state)'),before.state,'Adult testing changed child learning data');
  assert.equal(e.storage.get(SAVE),before.save,'Adult testing rewrote child progress');
  assert.equal(e.storage.get(INK),before.ink,'Adult testing rewrote the normal ink log');
  assert.equal(e.run('JSON.stringify(inkLog)'),before.normalInk,'Adult evidence leaked into the normal in-memory log');
  assert.equal(e.run(`JSON.stringify({passedCount,pendingRetests,priority:[...priorityConsumedToday],
    selectionSession,currentParentRequestId,stepIndex,stepAttempts,currentRound})`),before.runtime,'Adult testing advanced the child session');
  assert.ok(e.context.storageWrites.every(([key])=>key!==SAVE&&key!==INK),'Adult testing wrote a child storage key');
}
function start(e,round=1){
  e.tap('settingsBtn');e.tap('parentTestRound'+round+'Btn');
  assert.equal(e.run('parentValidation.session.round'),round);
  assert.equal(e.ids.get('parentTestBar').hidden,false);
  assert.equal(e.ids.get('panelOverlay').classList.contains('show'),false);
}
async function submit(e,{missing=false}={}){
  const char=e.run('currentItem.char');
  // Load through the actual asynchronous local/dependency loader first.
  await e.run('getCharData(currentItem.char)');
  inkFor(e,char);
  if(missing){
    const fault=e.run('parentValidation.session.current().fault');
    const index={'missing-bottom-dot':15,'missing-mi-upper-left-dot':0,'missing-walking-top-dot':6,
      'missing-middle-speech-dot':7,'missing-inner-li-left-falling':3,'missing-puwen-top-left-falling':2}[fault];
    assert.ok(Number.isInteger(index),'No explicit omitted stroke for '+fault);
    e.context.omittedIndex=index;e.run('strokesPoints.splice(omittedIndex,1)');
  }
  const length=e.run('strokesPoints.length');
  e.tap('submitBtn');await flush();
  assert.equal(e.run('parentValidation.busy'),false);
  assert.ok(e.run('parentValidation.pendingRecord'));
  assert.equal(e.run('parentValidation.pendingRecord.rawS.length'),length);
  assert.equal(e.ids.get('parentTestConfirm').hidden,false);
  return plain(e,'parentValidation.pendingRecord');
}

(async()=>{
  const e=await boot(),before=snapshot(e);
  e.run('globalThis.originalLearningItem=currentItem');
  start(e);
  assert.equal(e.run('currentItem === originalLearningItem'),false,'Adult prompts must use separate objects');
  assert.equal(e.run('currentMode'),'parent-test');
  assert.equal(e.ids.get('settingsBtn').disabled,true);
  isolated(e,before);

  // Empty submission, ordinary continue/result/save paths, and drawing while
  // grading/pending must never mutate or advance child learning.
  e.tap('submitBtn');await flush();
  assert.equal(e.run('parentTestInkLog.length'),0);
  assert.equal(e.run('parentValidation.session.index'),0);
  e.run('loadNextDoor();handleAttemptResult(false);saveState();');
  isolated(e,before);

  const first=await submit(e);
  assert.equal(first.actor,'parent');assert.equal(first.intendedExpected,'pass');
  assert.equal(first.humanExpected,null,'An instruction is not yet a human label');
  assert.equal(first.followedInstruction,null);
  assert.equal(e.run('parentValidation.session.index'),0,'Machine verdict must not advance a validation step');
  assert.equal(JSON.parse(e.storage.get(PARENT))[0].humanExpected,null);
  const held=e.run('JSON.stringify(strokesPoints)');
  e.ids.get('drawSvg').dispatch('pointerdown',{clientX:100,clientY:100,pointerId:5});
  assert.equal(e.run('JSON.stringify(strokesPoints)'),held,'Pending confirmation blocks new ink');
  e.tap('submitBtn');e.tap('clearBtn');await flush();
  assert.equal(e.run('parentTestInkLog.length'),1,'Repeated submit cannot duplicate a pending attempt');

  // Explicitly saying the writing did not follow the instruction records the
  // attempt without blessing it or advancing to the next requested condition.
  e.tap('parentTestRetryBtn');
  assert.equal(e.run('parentValidation.session.index'),0);
  assert.equal(e.run('parentTestInkLog[0].followedInstruction'),false);
  assert.equal(e.run('parentTestInkLog[0].humanExpected'),null);
  assert.equal(e.run('strokesPoints.length'),0);
  isolated(e,before);

  const repeated=await submit(e);
  assert.notEqual(repeated.id,first.id);
  e.context.retryAttemptId=first.id;
  e.run(`globalThis.realPending=parentValidation.pendingRecord;
    parentValidation.pendingRecord=parentTestInkLog.find(entry=>entry.id===retryAttemptId);`);
  e.tap('parentTestConfirmBtn');
  assert.equal(e.run('parentValidation.session.index'),0,'An already handled retry cannot later be relabelled');
  assert.equal(e.run('parentValidation.pendingRecord.humanExpected'),null);
  e.run('parentValidation.pendingRecord=realPending');
  // Wrong-session confirmations are rejected by the actual session contract,
  // without changing the stored original evidence or accepting a human label.
  e.run(`globalThis.realPending=parentValidation.pendingRecord;
    parentValidation.pendingRecord={...realPending,sessionId:'different-session'};`);
  e.tap('parentTestConfirmBtn');
  assert.equal(e.run('parentValidation.session.index'),0);
  assert.equal(e.run('realPending.humanExpected'),null);
  e.run('parentValidation.pendingRecord=realPending');
  e.tap('parentTestConfirmBtn');
  assert.equal(e.run('parentValidation.session.index'),1);
  assert.equal(e.run('parentTestInkLog[0].humanExpected'),'pass');
  e.tap('parentTestConfirmBtn');
  assert.equal(e.run('parentValidation.session.index'),1,'Double confirmation must not skip a step');
  isolated(e,before);

  // The deliberately incomplete attempt is labelled only after confirmation;
  // its expected answer is independent of whatever the real grader decides.
  const omission=await submit(e,{missing:true});
  assert.equal(omission.intendedExpected,'fail');assert.equal(omission.humanExpected,null);
  const index=e.run('parentValidation.session.index');
  e.tap('parentTestConfirmBtn');
  assert.equal(e.run('parentValidation.session.index'),index+1);
  assert.equal(e.run('parentTestInkLog[0].humanExpected'),'fail');
  assert.equal(e.run('parentTestInkLog[0].matched'),omission.v==='fail');
  if(!e.ids.get('parentTestNext').hidden)e.tap('parentTestNextBtn');
  isolated(e,before);

  // Complete all six instructions without passing, parking, teaching, or
  // increasing the child's daily door count.
  while(!e.run('parentValidation.session.finished()')){
    const expected=e.run('parentValidation.session.current().expected');
    await submit(e,{missing:expected==='fail'});
    e.tap('parentTestConfirmBtn');
    if(!e.ids.get('parentTestNext').hidden)e.tap('parentTestNextBtn');
    isolated(e,before);
  }
  assert.equal(e.run('parentValidation.session.summary().confirmedSteps'),6);
  assert.equal(e.run('parentValidation.session.summary().scored'),6);
  assert.equal(e.run('parentTestInkLog.filter(x=>x.humanExpected!==null).length'),6);
  assert.equal(e.run('parentTestInkLog.length'),7,'Keep the unscored retry as separate evidence');
  e.tap('parentTestExitBtn');
  assert.equal(e.run('parentValidation'),null);
  assert.equal(e.run('currentItem === originalLearningItem'),true,'Exit must restore the original learning object');
  assert.equal(e.run('currentMode'),'free');assert.equal(e.run('strokesPoints.length'),0);
  assert.equal(e.ids.get('parentTestBar').hidden,true);
  assert.equal(e.ids.get('settingsBtn').disabled,false);
  isolated(e,before);

  // A reload keeps isolated adult evidence but always boots ordinary learning.
  const saved=new Map(e.storage),refreshed=await boot({initialSave:null,initialStorage:saved});
  assert.equal(refreshed.run('parentTestInkLog.length'),7);
  assert.equal(refreshed.run('currentItem.char'),'理');
  assert.equal(refreshed.ids.get('parentTestBar').hidden,true);
  assert.equal(refreshed.storage.get(INK),before.ink);
  assert.equal(refreshed.run('strokesPoints.length'),0);
  start(refreshed,2);assert.equal(refreshed.run('currentItem.char'),'辩');
  refreshed.tap('parentTestExitBtn');assert.equal(refreshed.run('currentItem.char'),'理');

  const unconfirmed=await boot();start(unconfirmed);await submit(unconfirmed);
  const unconfirmedReload=await boot({initialSave:null,initialStorage:new Map(unconfirmed.storage)});
  assert.equal(unconfirmedReload.run('parentTestInkLog.length'),1);
  assert.equal(unconfirmedReload.run('parentTestInkLog[0].humanExpected'),null,
    'Refreshing pending evidence must not infer a confirmation');
  assert.equal(unconfirmedReload.ids.get('parentTestBar').hidden,true);
  assert.equal(unconfirmedReload.run('currentItem.char'),'理');

  // Entry is restricted to an untouched free question, including direct calls
  // that future UI changes could otherwise accidentally expose.
  for(const condition of ["strokesPoints=[[{x:1,y:1},{x:2,y:2}]]", "isDrawing=true", "currentMode='retest'",
    "currentMode='teaching'", "submitBtn.disabled=true", "continueBtn.classList.add('show')", "parentQueueChanged=true"]){
    const blocked=await boot();blocked.run(condition);blocked.run('startParentValidation(1)');
    assert.equal(blocked.run('parentValidation'),null,'Entry must reject '+condition);
  }

  // A delayed grade cannot exit into child recording or start another session.
  // Keep the real grader; delay only its actual data-read boundary.
  const busy=await boot(),busyBefore=snapshot(busy);start(busy);
  await busy.run('getCharData(currentItem.char)');inkFor(busy,busy.run('currentItem.char'));
  busy.run(`globalThis.realGetCharData=getCharData;globalThis.releaseParentGlyph=null;
    getCharData=char=>new Promise(resolve=>{releaseParentGlyph=()=>Promise.resolve(realGetCharData(char)).then(resolve);});`);
  busy.tap('submitBtn');await flush();
  assert.equal(busy.run('parentValidation.busy'),true);
  const sessionId=busy.run('parentValidation.session.id');
  busy.tap('submitBtn');busy.tap('parentTestExitBtn');
  busy.run('exitParentValidation();startParentValidation(2);');
  assert.equal(busy.run('parentValidation.session.id'),sessionId);
  assert.equal(busy.run('parentTestInkLog.length'),0);
  const inkBefore=busy.run('JSON.stringify(strokesPoints)');
  busy.ids.get('drawSvg').dispatch('pointerdown',{clientX:100,clientY:100,pointerId:8});
  assert.equal(busy.run('JSON.stringify(strokesPoints)'),inkBefore);
  busy.run('releaseParentGlyph();');await flush();
  assert.equal(busy.run('parentValidation.busy'),false);
  assert.equal(busy.run('parentTestInkLog.length'),1);
  assert.equal(busy.run('parentTestInkLog[0].sessionId'),sessionId);
  assert.equal(busy.run('parentTestInkLog[0].humanExpected'),null);
  isolated(busy,busyBefore);
  busy.tap('parentTestExitBtn');assert.equal(busy.run('parentValidation'),null);

  // The real loader timeout also releases the isolation lock, retaining ink
  // without recording a failure or spending a child's wrong-answer allowance.
  const timed=await boot(),timedBefore=snapshot(timed);
  timed.setMode('hang');start(timed);inkFor(timed,timed.run('currentItem.char'));
  const timedInk=timed.run('JSON.stringify(strokesPoints)');
  timed.tap('submitBtn');await flush();
  assert.equal(timed.run('parentValidation.busy'),true);
  timed.tap('parentTestExitBtn');assert.ok(timed.run('parentValidation'));
  timed.advance(6000);await flush();
  assert.equal(timed.run('parentValidation.busy'),false);
  assert.equal(timed.ids.get('submitBtn').disabled,false);
  assert.equal(timed.ids.get('parentTestExitBtn').disabled,false);
  assert.equal(timed.run('JSON.stringify(strokesPoints)'),timedInk);
  assert.equal(timed.run('parentTestInkLog.length'),0);
  isolated(timed,timedBefore);
  timed.tap('parentTestExitBtn');assert.equal(timed.run('parentValidation'),null);
  isolated(timed,timedBefore);

  // A file selection started in ordinary settings can finish asynchronously
  // after adult acceptance begins. Execute the real registered onload callback.
  const importing=await boot(),importBefore=snapshot(importing),alerts=[];
  importing.run('globalThis.importOriginalItem=currentItem');
  let pendingReader=null;
  importing.context.FileReader=class{
    constructor(){pendingReader=this;}
    readAsText(file){this.file=file;}
  };
  importing.context.alert=message=>alerts.push(message);
  const fileNode=importing.ids.get('fileInput');
  fileNode.files=[{name:'older-save.json'}];fileNode.value='older-save.json';
  fileNode.dispatch('change');
  assert.ok(pendingReader&&typeof pendingReader.onload==='function');
  assert.equal(pendingReader.file.name,'older-save.json');
  start(importing);
  const importingSession=importing.run('parentValidation.session.id');
  pendingReader.onload({target:{result:JSON.stringify({...seededSave(),dailyCount:17,scenesUnlocked:8,
    priorityQueue:[],bank:[{char:'学',pinyin:'xué',word:'学习',box:6,history:[],passedDays:[]} ]})}});
  assert.equal(importing.run('parentValidation.session.id'),importingSession);
  assert.equal(fileNode.value,'','Discard the stale file selection');
  assert.equal(alerts.length,1);assert.ok(alerts[0].includes('正在进行家长验收'));
  isolated(importing,importBefore);
  importing.tap('parentTestExitBtn');
  assert.equal(importing.run('currentItem===importOriginalItem'),true);
  isolated(importing,importBefore);

  // Isolation ends on exit: an ordinary child answer must again use the normal
  // learning handler and normal evidence key, without altering adult evidence.
  const savedParentEvidence=e.storage.get(PARENT);
  inkFor(e,e.run('currentItem.char'));e.tap('submitBtn');await flush();
  assert.equal(e.run('passedCount'),1);
  assert.equal(e.run('currentItem.history.length'),2);
  assert.equal(e.run('inkLog.length'),originalChildInk.length+1);
  assert.equal(e.storage.get(PARENT),savedParentEvidence);

  console.log('parent-validation-integration: real page entry, correct/incomplete ink, explicit labels, duplicate/session guards, delayed/timeout grading, late file import, separate storage, exit/normal-learning restoration, and fresh boot passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
