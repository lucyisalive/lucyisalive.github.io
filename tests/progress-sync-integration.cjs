'use strict';

// Whole-page integration of the real UI/state code. A controllable controller
// replaces only the remote sync boundary; no server, family, or real ink is used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const startup=fs.readFileSync(path.join(__dirname,'offline-startup.cjs'),'utf8');
const boundary=startup.indexOf('\n(async()=>{');
assert.ok(boundary>0,'Shared whole-page fixture boundary changed');
const loop="for(let i=0;i<scripts.length;i++)vm.runInContext(scripts[i].source,context,{timeout:10000,filename:'built-inline-'+i+'.js'});";
assert.ok(startup.includes(loop),'Shared script-execution boundary changed');
const withHook=startup.slice(0,boundary).replace(loop,`for(let i=0;i<scripts.length;i++){
  if(i===mainIndex)configureSyncFixture({window,context,storage});
  vm.runInContext(scripts[i].source,context,{timeout:10000,filename:'built-inline-'+i+'.js'});
}`);
const fixtureFactory=new Function('require','__dirname','process','configureSyncFixture',
  withHook+'\nreturn {environment,flush,inkFor,scripts};');
const SAVE='hanzi-magic-door-state-v1',INK='hanzi-magic-door-ink-v1',PARENT='hanzi-magic-door-parent-ink-v1';
const CODE=Array.from({length:4},(_,i)=>String(i+1).repeat(8)).join('-'); // Synthetic test value only.
const PASSWORD='synthetic four unrelated mountain objects';
const clone=x=>JSON.parse(JSON.stringify(x));
const read=(e,source)=>clone(e.run(source));
const ids=['cloudSyncStatus','cloudSyncCreateBtn','cloudSyncPassword','cloudSyncPasswordSetup',
  'cloudSyncConnectedActions','cloudSyncCodeWrap','cloudSyncCode','cloudSyncCopyBtn',
  'cloudSyncJoinInput','cloudSyncJoinBtn','cloudSyncLegacyJoinBtn','cloudSyncNowBtn','cloudSyncDisconnectBtn','cloudSyncConflict',
  'cloudKeepLocalBtn','cloudUseRemoteBtn'];
function fakeRemote({connected=true,startMode='resolve'}={}){
  const calls={start:0,changed:0,create:[],join:[],sync:0,resolve:[],disconnect:0},capture={options:null};
  let code=connected?CODE:null,status={kind:connected?'idle':'off',message:'synthetic sync status',connected,lastSyncedAt:null,
    credentialMode:connected?'code':null};
  let joinRelease=null;
  const notify=()=>capture.options?.onStatus({...status,...(code?{code}:{})});
  function join(value,credentialMode){
    calls.join.push({value,credentialMode});return new Promise(resolve=>{joinRelease=async remote=>{
      code=credentialMode==='code'?CODE:null;status={...status,kind:'synced',connected:true,credentialMode};
      if(remote){try{await capture.options.applyState(clone(remote));}
        catch(_){status={...status,kind:'pending',message:'synthetic deferred apply'};}}
      notify();resolve({...status});
    };});
  }
  const controller={
    start(){calls.start++;if(startMode==='hang')return new Promise(()=>{});if(startMode==='reject')return Promise.reject(Error('synthetic offline'));return Promise.resolve({...status});},
    changed(){calls.changed++;},
    createPasswordFamily(value){calls.create.push(value);code=null;status={...status,kind:'synced',connected:true,credentialMode:'password'};notify();return Promise.resolve({...status});},
    joinFamily(value){return join(value,'code');},
    joinPasswordFamily(value){return join(value,'password');},
    sync(){calls.sync++;notify();return Promise.resolve({...status});},
    resolveConflict(choice){calls.resolve.push(choice);status={...status,kind:'synced'};notify();return Promise.resolve({...status});},
    disconnect(){calls.disconnect++;code=null;status={...status,kind:'off',connected:false};notify();},
    status(){return {...status,...(code?{code}:{})};},code(){return code;},
  };
  return {calls,capture,controller,
    install({window,context}){
      // A browser has globalThis===window. The shared lightweight VM models
      // these as separate objects, so bridge this module's standard UMD export.
      if(!window.HanziProgressSync&&context.HanziProgressSync)window.HanziProgressSync=context.HanziProgressSync;
      assert.ok(window.HanziProgressSync&&typeof window.HanziProgressSync.create==='function',
      'Load the real small sync module before the main application');
      window.HanziProgressSync={...window.HanziProgressSync,create(options){capture.options=options;return controller;}};
    },
    async releaseJoin(remote){assert.ok(joinRelease,'Join must have started');await joinRelease(remote);},
    setStatus(value){status={...status,...value};notify();}};
}
async function boot({remoteOptions={},initialSave=null,initialStorage=null}={}){
  const remote=fakeRemote(remoteOptions);
  const harness=fixtureFactory(require,__dirname,process,info=>remote.install(info));
  assert.equal(harness.scripts.filter(s=>s.attributes.includes('data-source="progress-sync.js"')).length,1,
    'The production page embeds exactly one progress sync module');
  const e=harness.environment({initialSave,initialStorage});await harness.flush();
  assert.equal(e.ids.get('startupNotice').hidden,true,'Cloud setup must never hold the startup cover');
  for(const id of ids)assert.ok(e.ids.get(id),'Missing sync UI '+id);
  for(const name of ['syncCanApplyProgress','applySyncedProgress','getCloudProgressState','renderCloudSyncStatus']){
    assert.equal(e.run('typeof '+name),'function','Missing real state-integration function '+name);
  }
  assert.ok(remote.capture.options,'Main code must construct its controller');
  return {...e,remote,flush:harness.flush,inkFor:char=>harness.inkFor(e,char)};
}
function snapshot(e){
  return {state:e.run('JSON.stringify(state)'),saved:e.storage.get(SAVE),ink:e.storage.get(INK),parent:e.storage.get(PARENT),
    runtime:e.run(`JSON.stringify({currentMode,currentRound,stepIndex,stepAttempts,passedCount,pendingRetests,
      currentParentRequestId,parentQueueChanged,priority:[...priorityConsumedToday],selectionSession,
      teachingRunId,timerHandle,isDrawing,strokesPoints,current:currentItem})`),
    timers:JSON.stringify([...e.timers].map(([id,t])=>[id,t.at]))};
}
function unchangedSnapshot(actual,before,message){
  const changed=Object.keys(before).filter(key=>actual[key]!==before[key]);
  assert.deepEqual(changed,[],message+' (changed fields only)');
}
function nextRemote(e,{passedCount=2,completed=false,sceneAwarded=false,day=e.run('todayStr()')}={}){
  const remote=read(e,'getCloudProgressState()');
  remote.scenesUnlocked=7;remote.dailyCount=5;
  remote.sessionProgress={version:1,day,roundId:'synthetic-remote-round',passedCount,completed,sceneAwarded};
  const first=remote.bank[0];first.word='同步练习';first.fromParent=true;first.pinyin='lǐ';
  first.history=[{day:'2026-10-01',outcome:'first-try'}];first.passedDays=['2026-10-01'];
  remote.priorityQueue=[{char:first.char,word:first.word,pinyin:first.pinyin,addedDay:e.run('todayStr()'),
    completedDay:null,requestId:'synthetic-new-parent-request'}];
  return remote;
}
async function apply(e,value){e.context.syntheticRemote=clone(value);return await e.run('applySyncedProgress(syntheticRemote)');}

(async()=>{
  // Background cloud start can hang or fail without affecting the local game.
  for(const startMode of ['hang','reject']){
    const e=await boot({remoteOptions:{connected:false,startMode}});
    assert.equal(e.remote.calls.start,1);
    assert.ok(e.run('currentItem&&currentItem.char'));assert.equal(e.ids.get('writeSlot').style.display,'flex');
    e.tap('settingsBtn');assert.equal(e.ids.get('panelOverlay').classList.contains('show'),true);
    e.tap('closePanelBtn');
    e.inkFor(e.run('currentItem.char'));e.tap('submitBtn');await e.flush();
    assert.equal(e.run('passedCount'),1,'A disconnected cloud service cannot stop ordinary learning');
    assert.equal(e.run('inkLog.length'),1);
  }

  // Every active-local-work barrier is checked when replacement is attempted.
  const blockers=[
    ['handwritten ink','strokesPoints=[[{x:10,y:10},{x:20,y:20}]];'],
    ['pointer in progress','isDrawing=true;'],
    ['grading busy','submitBtn.disabled=true;'],
    ['file read pending','syncFileReading=true;'],
    ['parent import pending','parentQueueChanged=true;'],
    ['delayed retest','pendingRetests=[{item:currentItem,round:1,fillersSeen:0,parentRequestId:"old-request"}];'],
    ['teaching','currentMode="teaching";'],
    ['retest','currentMode="retest";'],
    ['parent validation','parentValidation={synthetic:true};'],
    ['settings open','panelOverlay.classList.add("show");'],
  ];
  for(const [name,condition]of blockers){
    const e=await boot(),remote=nextRemote(e);e.run(condition);
    assert.equal(e.run('syncCanApplyProgress()'),false,name+': unsafe automatic apply permitted');
    const before=snapshot(e),changed=e.remote.calls.changed;
    try{await apply(e,remote);}catch(_){/* A blocked callback may reject instead of returning false. */}
    unchangedSnapshot(snapshot(e),before,name+': blocked remote update modified local work');
    assert.equal(e.remote.calls.changed,changed,name+': blocked apply triggered an upload');
  }

  const active=await boot(),value=nextRemote(active);
  active.run('globalThis.preSyncItem=currentItem;globalThis.preSyncSelector=selectionSession;');
  const oldInk=active.storage.get(INK),oldParent=active.storage.get(PARENT),beforeChanged=active.remote.calls.changed;
  assert.equal(active.run('syncCanApplyProgress()'),true);await apply(active,value);await active.flush();
  assert.equal(active.run('passedCount'),2);
  assert.equal(active.run('state.scenesUnlocked'),7);
  assert.equal(active.run('currentItem===preSyncItem'),false,'Never keep a reference into the replaced bank');
  assert.equal(active.run('state.bank.includes(currentItem)'),true,'New question must be owned by the new bank');
  assert.equal(active.run('selectionSession===preSyncSelector'),false);
  assert.equal(active.run('pendingRetests.length'),0);
  assert.equal(active.run('currentParentRequestId'),'synthetic-new-parent-request');
  assert.equal(active.run('stepIndex'),0);assert.equal(active.run('stepAttempts'),0);
  assert.equal(active.storage.get(INK),oldInk);assert.equal(active.storage.get(PARENT),oldParent);
  assert.equal(active.remote.calls.changed,beforeChanged,'Applying remote state must not echo an upload');
  assert.equal(read(active,'getCloudProgressState().sessionProgress').roundId,'synthetic-remote-round');
  assert.equal(JSON.parse(active.storage.get(SAVE)).sessionProgress.passedCount,2);

  // Invalid incoming state or local persistence failure must not leave half
  // of a new bank attached to the old live question.
  for(const failure of ['invalid-state','quota']){
    const e=await boot(),remote=nextRemote(e);
    if(failure==='invalid-state')delete remote.bank;
    else e.run(`const failSyncedSave=localStorage.setItem;
      localStorage.setItem=(key,value)=>{if(key==='${SAVE}')throw Error('synthetic full storage');return failSyncedSave(key,value);};`);
    const before=snapshot(e),changed=e.remote.calls.changed;
    try{await apply(e,remote);}catch(_){/* Expected failure leaves the local game usable. */}
    unchangedSnapshot(snapshot(e),before,failure+': remote apply was not atomic');
    assert.equal(e.remote.calls.changed,changed);
  }

  // Old, pre-session-metadata saves remain compatible; never derive a current
  // round's count from the number of today's passedDays/history records.
  for(const variant of ['missing','past-day']){
    const e=await boot(),remote=nextRemote(e,{passedCount:4});
    for(const item of remote.bank){item.passedDays=[e.run('todayStr()')];item.history=[{day:e.run('todayStr()'),outcome:'first-try'}];}
    remote.priorityQueue=[];
    if(variant==='missing')delete remote.sessionProgress;else remote.sessionProgress.day='2000-01-01';
    await apply(e,remote);assert.equal(e.run('passedCount'),0,variant+': stale session count leaked into a new round');
  }

  // Restoring a completed remote round is presentation, not a second reward.
  for(const sceneAwarded of [true,false]){
    const e=await boot(),remote=nextRemote(e,{passedCount:5,completed:true,sceneAwarded});remote.priorityQueue=[];
    const changed=e.remote.calls.changed;await apply(e,remote);await e.flush();
    assert.equal(e.run('passedCount'),5);assert.equal(e.run('state.scenesUnlocked'),7);
    assert.equal(e.ids.get('finale').classList.contains('show'),true);
    assert.equal(e.remote.calls.changed,changed);
    await apply(e,remote);assert.equal(e.run('state.scenesUnlocked'),7,'Repeated remote apply duplicated a scene reward');
    e.tap('restartBtn');await e.flush();
    const session=read(e,'getCloudProgressState().sessionProgress');
    assert.equal(session.passedCount,0);assert.equal(session.completed,false);assert.equal(session.sceneAwarded,false);
    assert.notEqual(session.roundId,'synthetic-remote-round','A deliberate new round needs its own identity');
  }

  // A pass earned just before a device switch may await its explicit Continue.
  // Pulling it renders that action without awarding; only Continue settles it,
  // and repeated rendering/Continue cannot increment the scene twice.
  const unsettled=await boot(),earned=nextRemote(unsettled,{passedCount:10,completed:false,sceneAwarded:false});
  await apply(unsettled,earned);
  assert.equal(unsettled.run('state.scenesUnlocked'),7);
  assert.equal(unsettled.ids.get('finale').classList.contains('show'),false);
  assert.equal(unsettled.ids.get('continueBtn').classList.contains('show'),true);
  unsettled.tap('continueBtn');await unsettled.flush();
  assert.equal(unsettled.run('state.scenesUnlocked'),8);
  assert.equal(unsettled.run('state.priorityQueue[0].completedDay'),null,
    'The tenth pass settles the round without consuming a queued character');
  const settled=read(unsettled,'getCloudProgressState().sessionProgress');
  assert.equal(settled.completed,true);assert.equal(settled.sceneAwarded,true);
  unsettled.run('loadNextDoor();');assert.equal(unsettled.run('state.scenesUnlocked'),8,
    'A settled round must not award the same scene again');

  // A connected browser refresh restores the explicit persisted round, while
  // an older/unconnected save preserves the original fresh-round behavior.
  const refreshSeed=await boot(),refreshState=nextRemote(refreshSeed,{passedCount:3});
  const resumed=await boot({initialSave:refreshState});
  assert.equal(resumed.run('passedCount'),3);
  assert.equal(read(resumed,'getCloudProgressState().sessionProgress').roundId,'synthetic-remote-round');
  const completedRefresh=clone(refreshState);completedRefresh.sessionProgress={...completedRefresh.sessionProgress,
    passedCount:5,completed:true,sceneAwarded:true};completedRefresh.priorityQueue=[];
  const resumedDone=await boot({initialSave:completedRefresh});
  assert.equal(resumedDone.run('passedCount'),5);assert.equal(resumedDone.run('state.scenesUnlocked'),7);
  assert.equal(resumedDone.ids.get('finale').classList.contains('show'),true);
  const oldStyle=await boot({initialSave:refreshState,remoteOptions:{connected:false}});
  assert.equal(oldStyle.run('passedCount'),0,'No joined family must preserve the existing ordinary refresh behavior');

  // A page left open overnight must not relabel the old round count as new
  // learning today. Only beginning a new round assigns the new local day.
  const overnight=await boot();await apply(overnight,nextRemote(overnight,{passedCount:3}));
  const previousDay=overnight.run('todayStr()'),previousRound=read(overnight,'getCloudProgressState().sessionProgress');
  overnight.advance(24*60*60*1000);await overnight.flush();
  assert.notEqual(overnight.run('todayStr()'),previousDay);
  const heldRound=read(overnight,'getCloudProgressState().sessionProgress');
  assert.equal(heldRound.day,previousDay,"Do not stamp yesterday's count with the current day");
  assert.equal(heldRound.passedCount,3);assert.equal(heldRound.roundId,previousRound.roundId);
  overnight.tap('restartBtn');await overnight.flush();
  const newDayRound=read(overnight,'getCloudProgressState().sessionProgress');
  assert.equal(newDayRound.day,overnight.run('todayStr()'));
  assert.equal(newDayRound.passedCount,0);assert.notEqual(newDayRound.roundId,previousRound.roundId);

  // saveState observes the incremented count, and parent acceptance never
  // creates a child cloud edit or includes private handwriting in the payload.
  const saving=await boot();saving.inkFor(saving.run('currentItem.char'));
  const initialChanged=saving.remote.calls.changed;saving.tap('submitBtn');await saving.flush();
  assert.equal(saving.run('passedCount'),1);
  assert.ok(saving.remote.calls.changed>initialChanged);
  assert.equal(JSON.parse(saving.storage.get(SAVE)).sessionProgress.passedCount,1);
  const shared=saving.remote.capture.options.getState();
  assert.equal(shared.sessionProgress.passedCount,1);
  for(const name of ['inkLog','parentTestInkLog','rawS','strokesPoints','playerReview'])assert.equal(Object.hasOwn(shared,name),false,
    'Private input field leaked into sync state: '+name);
  assert.ok(saving.run('strokesPoints.length')>0,'Exercise the true completed-submission state');
  assert.equal(saving.run('syncCanApplyProgress()'),true,'A completed door may safely adopt without deleting evidence to manufacture a blank canvas');
  const finishedInk=saving.storage.get(INK);await apply(saving,nextRemote(saving,{passedCount:2}));
  assert.equal(saving.storage.get(INK),finishedInk,'Adopting after a pass must retain its original recorded evidence');
  const adult=await boot();adult.tap('settingsBtn');adult.tap('parentTestRound1Btn');
  assert.ok(adult.run('parentValidation'));const adultChanged=adult.remote.calls.changed;
  adult.run('saveState();');assert.equal(adult.remote.calls.changed,adultChanged);
  assert.equal(adult.run('syncCanApplyProgress()'),false);

  // Fail only the primary progress key, independently of glyph/ink storage.
  // The RAM edit remains playable but cannot be advertised or queued as saved.
  const quota=await boot();quota.tap('settingsBtn');
  quota.run(`globalThis.failPrimarySave=true;const primarySetItem=localStorage.setItem;
    localStorage.setItem=(key,value)=>{if(key==='${SAVE}'&&failPrimarySave)throw Error('synthetic primary quota');return primarySetItem(key,value);};`);
  const savedBeforeQuota=quota.storage.get(SAVE),changedBeforeQuota=quota.remote.calls.changed;
  quota.ids.get('batchInput').value='海燕的燕 yàn';quota.tap('batchAddBtn');
  assert.equal(quota.run('state.priorityQueue[0].word'),'海燕','Retain the local edit in RAM');
  assert.equal(quota.storage.get(SAVE),savedBeforeQuota);
  assert.equal(quota.remote.calls.changed,changedBeforeQuota,'Unsaved primary state must not be marked for upload');
  assert.ok(quota.run('progressSaveNotice.length')>0);
  assert.match(quota.ids.get('cloudSyncStatus').textContent,/未成功|失败|未保存/);
  assert.throws(()=>quota.remote.capture.options.getState(),undefined,
    'A pending sync must not read RAM changes after primary persistence failed');
  const failedSyncCount=quota.remote.calls.sync;quota.tap('cloudSyncNowBtn');await quota.flush();
  assert.equal(quota.remote.calls.sync,failedSyncCount,'Still-full local storage must block misleading cloud sync');
  assert.equal(quota.remote.calls.changed,changedBeforeQuota);
  quota.run('failPrimarySave=false;');quota.tap('cloudSyncNowBtn');await quota.flush();
  assert.equal(quota.run('progressSaveNotice'),'');
  assert.equal(JSON.parse(quota.storage.get(SAVE)).priorityQueue[0].word,'海燕');
  assert.ok(quota.remote.calls.changed>changedBeforeQuota);
  assert.equal(quota.remote.calls.sync,failedSyncCount+1);
  assert.equal(quota.remote.capture.options.getState().priorityQueue[0].word,'海燕');
  assert.ok(!/未成功|失败|未保存/.test(quota.ids.get('cloudSyncStatus').textContent));

  // A parent-defined password connects both devices, is cleared from the
  // input, and is not put in the local learning save or displayed as a code.
  const creating=await boot({remoteOptions:{connected:false}});creating.tap('settingsBtn');
  creating.ids.get('cloudSyncPassword').value=PASSWORD;
  creating.tap('cloudSyncCreateBtn');await creating.flush();
  assert.deepEqual(creating.remote.calls.create,[PASSWORD]);
  assert.equal(creating.ids.get('cloudSyncPassword').value,'');
  assert.equal(creating.ids.get('cloudSyncPasswordSetup').hidden,true);
  assert.equal(creating.ids.get('cloudSyncCodeWrap').hidden,true);
  assert.equal(creating.ids.get('cloudSyncConnectedActions').hidden,false);
  assert.equal(JSON.stringify([...creating.storage]).includes(PASSWORD),false);

  const legacy=await boot();legacy.tap('settingsBtn');
  assert.equal(legacy.ids.get('cloudSyncCodeWrap').hidden,false);
  assert.equal(legacy.ids.get('cloudSyncCode').value,CODE);
  let copied=null;legacy.context.navigator.clipboard={writeText:async text=>{copied=text;}};
  legacy.tap('cloudSyncCopyBtn');await legacy.flush();assert.equal(copied,CODE);
  const joining=await boot({remoteOptions:{connected:false}});joining.tap('settingsBtn');
  joining.ids.get('cloudSyncPassword').value=PASSWORD;joining.tap('cloudSyncJoinBtn');await joining.flush();
  assert.deepEqual(joining.remote.calls.join,[{value:PASSWORD,credentialMode:'password'}]);
  assert.equal(joining.ids.get('cloudSyncPassword').value,'');
  assert.equal(joining.run('syncExplicitAdopt'),true);
  assert.equal(joining.run('syncCanApplyProgress()'),true,'An explicit safe join may adopt while settings are open');
  const joinedRemote=nextRemote(joining,{passedCount:3});await joining.remote.releaseJoin(joinedRemote);await joining.flush();
  assert.equal(joining.run('passedCount'),3);
  assert.equal(joining.run('currentItem.word'),'同步练习');
  assert.equal(joining.run('syncExplicitAdopt'),false);
  const conflict=await boot();conflict.tap('settingsBtn');conflict.remote.setStatus({kind:'conflict',message:'synthetic conflict'});
  assert.equal(conflict.ids.get('cloudSyncConflict').hidden,false);
  conflict.tap('cloudKeepLocalBtn');await conflict.flush();assert.deepEqual(conflict.remote.calls.resolve,['local']);
  conflict.remote.setStatus({kind:'conflict'});conflict.tap('cloudUseRemoteBtn');await conflict.flush();
  assert.deepEqual(conflict.remote.calls.resolve,['local','remote']);

  // An explicit join may open the safe settings gate. If the user leaves it
  // and starts writing before remote data arrives, the final apply recheck wins.
  const late=await boot({remoteOptions:{connected:false}});late.tap('settingsBtn');
  late.ids.get('cloudSyncJoinInput').value=CODE;late.tap('cloudSyncLegacyJoinBtn');await late.flush();
  assert.deepEqual(late.remote.calls.join,[{value:CODE,credentialMode:'code'}]);
  late.tap('closePanelBtn');late.run('strokesPoints=[[{x:35,y:40},{x:60,y:80}]];');
  const lateBefore=snapshot(late),remoteLate=nextRemote(late);
  await late.remote.releaseJoin(remoteLate);await late.flush();
  const afterLate=snapshot(late);
  // Joining may persist the local round metadata. That is not adoption of the
  // remote bank; the active lesson, exact new ink, and all learning fields stay.
  for(const field of ['runtime','timers','ink','parent'])assert.equal(afterLate[field],lateBefore[field],
    'A late explicit join changed '+field);
  const beforeLearning=JSON.parse(lateBefore.state),afterLearning=JSON.parse(afterLate.state);
  delete beforeLearning.sessionProgress;delete afterLearning.sessionProgress;
  assert.ok(JSON.stringify(afterLearning)===JSON.stringify(beforeLearning),'A late explicit join replaced local learning data');
  assert.equal(late.run('syncExplicitAdopt'),false,'Explicit-adopt privilege must not leak beyond its async request');

  // Disconnect changes cloud enrollment only, leaving local learning/evidence.
  const disconnect=await boot(),stateBefore=disconnect.run('JSON.stringify(state.bank)'),inkBefore=disconnect.storage.get(INK);
  disconnect.tap('settingsBtn');disconnect.tap('cloudSyncDisconnectBtn');await disconnect.flush();
  assert.equal(disconnect.remote.calls.disconnect,1);assert.equal(disconnect.run('JSON.stringify(state.bank)'),stateBefore);
  assert.equal(disconnect.storage.get(INK),inkBefore);

  console.log('progress-sync-integration: nonblocking startup, all local-work barriers, atomic replacement, request/session identities, no reward echo, local-only parent/evidence, primary-storage failure/recovery, late join and disconnect passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
