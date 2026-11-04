'use strict';

// Execute the real whole page and its registered controls. All evidence below is
// synthetic/reference geometry; no work/ data or personal handwriting is read.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const startup=fs.readFileSync(path.join(__dirname,'offline-startup.cjs'),'utf8');
const boundary=startup.indexOf('\n(async()=>{');
assert.ok(boundary>0,'The shared full-page fixture boundary changed');
const {environment,flush,inkFor,Element,html}=new Function('require','__dirname','process',
  startup.slice(0,boundary)+'\nreturn {environment,flush,inkFor,Element,html};')(require,__dirname,process);
const SAVE='hanzi-magic-door-state-v1',INK='hanzi-magic-door-ink-v1',PARENT='hanzi-magic-door-parent-ink-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const read=(e,source)=>clone(e.run(source));
const ids=['playerDisputeCard','playerDisputePreview','playerDisputeVerdict','playerDisputeBtn','playerDisputeMessage'];
const payload=()=>({c:'山',formatVersion:2,rawS:[[[12.125,30.375],[45.25,70.5]],[[80.75,90.125],[110.5,130.875]]],
  s:[[[1,2],[3,4]]],filtering:{inputStrokeCount:2,retainedStrokeCount:2,ignoredStrokes:[]},
  phase:{mode:'free',round:null,stepIndex:null}});
async function boot(options={}){
  const e=environment(options);await flush();
  assert.equal(e.ids.get('startupNotice').hidden,true);
  for(const id of ids)assert.ok(e.ids.get(id),'Missing feedback control '+id);
  for(const name of ['showPlayerDispute','renderPlayerDispute','togglePlayerDispute']){
    assert.equal(e.run('typeof '+name),'function','Missing real production '+name);
  }
  // The base fixture does not parse buttons inside innerHTML. Materialize only
  // the actual parent mark buttons, preserving production onTap registration.
  let markButtons=[];
  e.ids.get('inkList').querySelectorAll=selector=>{
    assert.equal(selector,'.ink-mark');
    markButtons=[...e.ids.get('inkList').innerHTML.matchAll(/class="ink-mark"\s+data-i="([0-9]+)"/g)].map(match=>{
      const button=new Element('button');button.dataset.i=match[1];return button;
    });
    return markButtons;
  };
  e.context.disputeWrites=[];
  e.run(`globalThis.disputeQuota=false;
    const disputeSetItem=localStorage.setItem;
    localStorage.setItem=(key,value)=>{
      disputeWrites.push(key);
      if(key==='${INK}'&&disputeQuota){const error=new Error('synthetic quota');error.name='QuotaExceededError';throw error;}
      return disputeSetItem(key,value);
    };`);
  return {...e,parentButtons:()=>markButtons};
}
function ordinaryRecord(e,pass=true,{priorDisputed=false}={}){
  e.context.syntheticPayload=payload();e.context.syntheticPass=pass;
  e.run('recordInk(syntheticPayload,syntheticPass);');
  if(priorDisputed)e.run('inkLog[0].disputed=true;saveInkLog();renderPlayerDispute();');
  assert.equal(e.run('playerDisputeEntry===inkLog[0]'),true,'The card must retain the exact submitted record object');
  return read(e,'inkLog[0]');
}
function protectedSnapshot(e){
  return {state:e.run('JSON.stringify(state)'),learningSaved:e.storage.get(SAVE),parentSaved:e.storage.get(PARENT),
    runtime:e.run(`JSON.stringify({currentMode,currentRound,stepIndex,stepAttempts,passedCount,pendingRetests,
      currentParentRequestId,priority:[...priorityConsumedToday],selectionSession,teachingRunId,timerHandle,
      currentChar:currentItem&&currentItem.char,wrong:currentItem&&wrongCountToday(currentItem),
      isDrawing,strokesPoints})`),
    timers:JSON.stringify([...e.timers].map(([id,t])=>[id,t.at])),network:e.network.length,
    timerText:e.ids.get('timerRing').textContent,timerDisplay:e.ids.get('timerRing').style.display};
}
function assertProtected(e,before){assert.deepEqual(protectedSnapshot(e),before,
  'Feedback changed learning, current ink, a countdown, another storage key, or glyph requests');}
function assertEvidenceSame(actual,before){
  const clean=clone(actual);delete clean.playerReview;clean.disputed=before.disputed;
  assert.deepEqual(clean,before,'Only disputed and optional playerReview may change');
}
function assertReview(e,original){
  const entry=read(e,'playerDisputeEntry');
  assert.equal(entry.disputed,true);
  assert.deepEqual(entry.playerReview,{source:'player',reportedExpected:original.v==='pass'?'fail':'pass',
    reportedAt:e.run('playerDisputeEntry.playerReview.reportedAt'),priorDisputed:!!original.disputed});
  assert.ok(Number.isFinite(entry.playerReview.reportedAt));
  assert.equal(Object.hasOwn(entry,'humanExpected'),false,'A player complaint is not an adult confirmation');
  assertEvidenceSame(entry,original);
  return entry;
}
function previewMarkup(e){const node=e.ids.get('playerDisputePreview');return node.innerHTML+
  node.children.map(child=>'<'+child.tagName+' '+JSON.stringify(child.attributes)+'>'+child.textContent).join('');}
function parentTap(e,index=0){e.advance(500);const button=e.parentButtons()[index];assert.ok(button,'Missing displayed parent mark');button.dispatch('pointerup');}

(async()=>{
  // Actual ordinary submit hook: both a passed reference and a failed nonempty
  // touch must attach their own original evidence to the same contextual card.
  for(const pass of [true,false]){
    const e=await boot();assert.equal(e.ids.get('playerDisputeCard').hidden,true);
    if(pass)inkFor(e,e.run('currentItem.char'));
    else e.run('strokesPoints=[[{x:100.125,y:90.5}]];');
    e.tap('submitBtn');await flush();
    assert.equal(e.run('inkLog.length'),1);
    assert.equal(e.run('inkLog[0].v'),pass?'pass':'fail');
    assert.equal(e.run('playerDisputeEntry===inkLog[0]'),true);
    assert.equal(e.ids.get('playerDisputeCard').hidden,false);
    assert.ok(e.ids.get('playerDisputeVerdict').textContent.includes(pass?'对':'错'));
    const original=read(e,'inkLog[0]'),before=protectedSnapshot(e);
    e.tap('playerDisputeBtn');assertReview(e,original);assertProtected(e,before);
    assert.deepEqual(JSON.parse(e.storage.get(INK))[0].playerReview,read(e,'inkLog[0].playerReview'));
    e.tap('playerDisputeBtn');assertProtected(e,before);
    assert.deepEqual(read(e,'inkLog[0]'),original,'Undo must restore exact evidence and prior disputed state');
    assert.equal(Object.hasOwn(JSON.parse(e.storage.get(INK))[0],'playerReview'),false);
  }

  const exact=await boot();exact.run('setWritingView(false);');
  const original=ordinaryRecord(exact,false),before=protectedSnapshot(exact);
  const preview=previewMarkup(exact);
  assert.ok(preview.length>0,'Show the submitted handwritten trace');
  assert.ok(!/<text\b/i.test(preview),'The preview must not reveal a printed target answer');
  assert.equal(exact.ids.get('playerDisputeVerdict').textContent.includes(original.c),false,
    'The contextual result must not print the target answer');
  exact.tap('playerDisputeBtn');const review=assertReview(exact,original);assertProtected(exact,before);
  const exported=JSON.parse(exact.run('inkPayloadText(true)')).cases[0];
  assert.deepEqual(exported.playerReview,review.playerReview);assert.equal(exported.disputed,true);
  assert.deepEqual(exported.rawS,original.rawS,'Export keeps original precision');
  assert.equal(exported.verdict,original.v,'A complaint never rewrites the machine verdict');
  assert.equal(Object.hasOwn(exported,'humanExpected'),false);

  // The preview uses the original trace, not the intentionally different legacy
  // compact summary. No character data is needed to draw it.
  assert.ok(preview.includes('12.125')&&preview.includes('130.875'),
    'Preview must retain original rawS coordinates rather than substitute s');

  const preserved=await boot(),alreadyMarked=ordinaryRecord(preserved,true,{priorDisputed:true});
  preserved.tap('playerDisputeBtn');assertReview(preserved,alreadyMarked);
  preserved.tap('playerDisputeBtn');
  assert.equal(preserved.run('playerDisputeEntry.disputed'),true,'Undo must retain a pre-existing parent mark');
  assert.equal(preserved.run('Object.hasOwn(playerDisputeEntry,"playerReview")'),false);

  // Holding a record object is essential: array insertion cannot make this
  // visible card mark a newer, unrelated submission by its current list index.
  const shifted=await boot(),old=ordinaryRecord(shifted,false);
  shifted.run(`globalThis.heldDispute=playerDisputeEntry;
    inkLog.unshift({c:'林',s:[[[1,1],[20,20]]],rawS:[[[1,1],[20,20]]],v:'pass',d:todayStr(),disputed:false});`);
  shifted.tap('playerDisputeBtn');
  assert.equal(shifted.run('heldDispute.disputed'),true);
  assert.equal(shifted.run('inkLog[0].disputed'),false,'Do not mark the new array occupant');
  assert.equal(shifted.run('inkLog[1]===heldDispute'),true);assertEvidenceSame(read(shifted,'inkLog[1]'),old);
  shifted.run('inkLog.splice(inkLog.indexOf(heldDispute),1);');
  const staleWrites=shifted.context.disputeWrites.length,staleLog=shifted.run('JSON.stringify(inkLog)');
  shifted.run('togglePlayerDispute(heldDispute);');
  assert.equal(shifted.run('JSON.stringify(inkLog)'),staleLog);
  assert.equal(shifted.context.disputeWrites.length,staleWrites,'Removed evidence is an inert stale target');

  // An ordinary blank submit has no new evidence and cannot redirect the card.
  const blank=await boot();ordinaryRecord(blank,false);
  blank.run('globalThis.blankDisputeEntry=playerDisputeEntry;');
  blank.tap('submitBtn');await flush();
  assert.equal(blank.run('inkLog.length'),1);
  assert.equal(blank.run('playerDisputeEntry===blankDisputeEntry'),true);

  // Delay the real grader at its existing data-read boundary. Feedback while
  // that new answer is pending belongs to the prior result and must not edit
  // the in-flight new handwriting, grade state, timers, or progress.
  const pending=await boot();ordinaryRecord(pending,false);
  pending.run('globalThis.previousDisputeEntry=playerDisputeEntry;');
  inkFor(pending,pending.run('currentItem.char'));
  pending.run(`const realDisputeGlyph=getCharData;
    globalThis.releaseDisputeGlyph=null;
    getCharData=char=>new Promise(resolve=>{
      releaseDisputeGlyph=()=>Promise.resolve(realDisputeGlyph(char)).then(resolve);
    });`);
  pending.tap('submitBtn');await flush();
  assert.equal(pending.ids.get('submitBtn').disabled,true);
  assert.equal(pending.run('typeof releaseDisputeGlyph'),'function');
  const pendingBefore=protectedSnapshot(pending);
  pending.tap('playerDisputeBtn');assertProtected(pending,pendingBefore);
  assert.equal(pending.run('previousDisputeEntry.playerReview.source'),'player');
  assert.equal(pending.run('inkLog.length'),1,'Do not fabricate a result for the in-flight answer');
  pending.run('releaseDisputeGlyph();');await flush();
  assert.equal(pending.ids.get('submitBtn').disabled,false);
  assert.equal(pending.run('inkLog.length'),2);
  assert.equal(pending.run('playerDisputeEntry===inkLog[0]'),true);
  assert.equal(pending.run('Object.hasOwn(inkLog[0],"playerReview")'),false,
    'The new answer must not inherit an older complaint');
  assert.equal(pending.run('inkLog[1]===previousDisputeEntry'),true);
  assert.equal(pending.run('inkLog[1].playerReview.source'),'player');

  // A finger can go down on the old feedback button just before a new grade
  // replaces the contextual result. The following up/click must mark neither.
  const raced=await boot();ordinaryRecord(raced,true);
  raced.run('globalThis.pressedOldEntry=playerDisputeEntry;');
  inkFor(raced,raced.run('currentItem.char'));
  raced.run(`const realRacedGlyph=getCharData;
    globalThis.releaseRacedGlyph=null;
    getCharData=char=>new Promise(resolve=>{
      releaseRacedGlyph=()=>Promise.resolve(realRacedGlyph(char)).then(resolve);
    });`);
  raced.tap('submitBtn');await flush();
  raced.ids.get('playerDisputeBtn').dispatch('pointerdown');
  raced.run('releaseRacedGlyph();');await flush();
  assert.equal(raced.run('playerDisputeEntry===pressedOldEntry'),false);
  const afterNewAnswer=protectedSnapshot(raced),racedLog=raced.run('JSON.stringify(inkLog)'),racedWrites=raced.context.disputeWrites.length;
  raced.ids.get('playerDisputeBtn').dispatch('pointerup');
  raced.ids.get('playerDisputeBtn').dispatch('click');
  assertProtected(raced,afterNewAnswer);
  assert.equal(raced.run('JSON.stringify(inkLog)'),racedLog,
    'A gesture begun on old evidence must not mark the replacement result');
  assert.equal(raced.context.disputeWrites.length,racedWrites);

  // Changing learning stages, showing the end screen, or starting another round
  // must retain the latest ordinary evidence independently of the active prompt.
  const lifecycle=await boot();ordinaryRecord(lifecycle,false);lifecycle.run('globalThis.lifecycleEntry=playerDisputeEntry;');
  lifecycle.run('loadNextDoor();');await flush();
  assert.equal(lifecycle.run('playerDisputeEntry===lifecycleEntry'),true);
  assert.ok(lifecycle.ids.get('playerDisputePreview').hidden||lifecycle.ids.get('playerDisputePreview').style.display==='none',
    'A new writing prompt must not reveal the previous handwritten answer');
  lifecycle.run('currentMode="teaching";currentRound=1;stepIndex=0;startTeachingRound();');await flush();lifecycle.advance(0);await flush();
  assert.notEqual(lifecycle.run('timerHandle'),null,'Exercise feedback during a live teaching countdown');
  assert.ok(lifecycle.ids.get('playerDisputePreview').hidden||lifecycle.ids.get('playerDisputePreview').style.display==='none',
    'The demonstration phase must keep the previous handwritten answer hidden');
  const timedBefore=protectedSnapshot(lifecycle);lifecycle.tap('playerDisputeBtn');assertProtected(lifecycle,timedBefore);
  lifecycle.run('showFinale();');
  assert.equal(lifecycle.ids.get('playerDisputeCard').hidden,false,'The end screen must not hide the feedback card');
  assert.ok(!lifecycle.ids.get('playerDisputePreview').hidden&&lifecycle.ids.get('playerDisputePreview').style.display!=='none',
    'The end screen may show the previous handwritten evidence for review');
  assert.equal(lifecycle.run('playerDisputeEntry===lifecycleEntry'),true);
  lifecycle.tap('restartBtn');await flush();
  assert.equal(lifecycle.run('playerDisputeEntry===lifecycleEntry'),true);
  assert.equal(lifecycle.ids.get('playerDisputeCard').hidden,false);
  const restored=await boot({initialStorage:new Map(lifecycle.storage)});
  assert.equal(restored.run('playerDisputeEntry===inkLog[0]'),true,'Reload restores the latest retained ordinary submission');
  assert.deepEqual(read(restored,'playerDisputeEntry.playerReview'),read(lifecycle,'lifecycleEntry.playerReview'));
  restored.tap('playerDisputeBtn');
  assert.equal(restored.run('Object.hasOwn(inkLog[0],"playerReview")'),false,'Undo after reload still targets the persisted evidence');

  // Disputed evidence is protected by the existing whole-record trim policy;
  // player complaints use that protection without manufacturing adult labels.
  const trimmed=await boot();ordinaryRecord(trimmed,true);trimmed.tap('playerDisputeBtn');
  trimmed.run(`globalThis.protectedDispute=playerDisputeEntry;
    for(let i=0;i<205;i++)inkLog.unshift({c:'山',s:[[[i,1],[i+1,2]]],v:'fail',d:todayStr(),disputed:false});
    saveInkLog();`);
  assert.equal(trimmed.run('inkLog.includes(protectedDispute)'),true);
  assert.equal(trimmed.run('inkLog.length'),200);
  assert.equal(JSON.parse(trimmed.storage.get(INK)).some(row=>row.playerReview?.source==='player'),true);

  // The actual parent row handler clears player provenance when the parent
  // removes a mark; it must also refresh this card's button state.
  const parent=await boot();ordinaryRecord(parent,true);parent.tap('playerDisputeBtn');
  parent.tap('settingsBtn');parentTap(parent);
  assert.equal(parent.run('inkLog[0].disputed'),false);
  assert.equal(parent.run('Object.hasOwn(inkLog[0],"playerReview")'),false);
  assert.ok(!parent.ids.get('playerDisputeBtn').textContent.includes('撤销'),
    'Parent unmark must synchronize the contextual action');
  parent.tap('playerDisputeBtn');assert.equal(parent.run('inkLog[0].playerReview.source'),'player');
  parent.tap('inkClearBtn');
  assert.equal(parent.run('inkLog.length'),0);assert.equal(parent.ids.get('playerDisputeCard').hidden,true);
  const clearWrites=parent.context.disputeWrites.length;parent.run('togglePlayerDispute();');
  assert.equal(parent.context.disputeWrites.length,clearWrites,'A cleared card cannot resurrect removed evidence');

  // Parent validation is a separate actor and storage path. Even direct calls
  // cannot mark ordinary evidence while the isolated adult session is active.
  const adult=await boot();ordinaryRecord(adult,true);
  const ordinaryBefore=adult.run('JSON.stringify(inkLog)'),ordinaryStored=adult.storage.get(INK);
  adult.tap('settingsBtn');adult.tap('parentTestRound1Btn');
  assert.ok(adult.run('parentValidation'));
  assert.equal(adult.ids.get('playerDisputeCard').hidden,true);
  adult.run('togglePlayerDispute();');assert.equal(adult.run('JSON.stringify(inkLog)'),ordinaryBefore);
  await adult.run('getCharData(currentItem.char)');inkFor(adult,adult.run('currentItem.char'));
  adult.tap('submitBtn');await flush();
  assert.equal(adult.run('JSON.stringify(inkLog)'),ordinaryBefore);assert.equal(adult.storage.get(INK),ordinaryStored);
  assert.equal(adult.run('parentTestInkLog.length'),1);
  assert.equal(adult.run('Object.hasOwn(parentTestInkLog[0],"playerReview")'),false);
  adult.tap('parentTestExitBtn');assert.equal(adult.ids.get('playerDisputeCard').hidden,false);

  // A failed browser write may retain useful RAM evidence, but cannot claim it
  // has survived a reload. Recovering the quota permits a subsequent real save.
  const quota=await boot();ordinaryRecord(quota,false);
  const storedBefore=quota.storage.get(INK);quota.run('disputeQuota=true;');quota.tap('playerDisputeBtn');
  assert.equal(quota.storage.get(INK),storedBefore,'A failed persistence call must not look durable');
  assert.equal(quota.run('inkLog[0].playerReview.source'),'player');
  assert.ok(quota.run('inkSaveNotice.length')>0);
  assert.match(quota.ids.get('playerDisputeMessage').textContent,/暂存|未保存|失败|页面/,
    'Show that feedback currently survives only in the open page');
  const afterFailure=await boot({initialStorage:new Map(quota.storage)});
  assert.equal(afterFailure.run('Object.hasOwn(inkLog[0],"playerReview")'),false);
  quota.run('disputeQuota=false;');quota.tap('playerDisputeBtn');quota.tap('playerDisputeBtn');
  assert.equal(quota.run('inkSaveNotice'),'');
  assert.equal(JSON.parse(quota.storage.get(INK))[0].playerReview.source,'player');

  console.log('player-dispute: actual pass/fail submissions, exact mark/undo, object identity, delayed-submit/touch races, progression/reload, hidden-writing preview/export, trim, parent synchronization/isolation, and quota durability passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
