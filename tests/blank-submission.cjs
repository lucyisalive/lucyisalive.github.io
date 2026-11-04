'use strict';

// Reuse the existing whole-page fixture, running the real registered submit
// handler. All ink is synthetic/reference data; no personal traces are read.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const startup=fs.readFileSync(path.join(__dirname,'offline-startup.cjs'),'utf8');
const boundary=startup.indexOf('\n(async()=>{');
assert.ok(boundary>0,'The shared whole-page fixture boundary changed');
const {environment,flush,inkFor}=new Function('require','__dirname','process',startup.slice(0,boundary)+
  '\nreturn {environment,flush,inkFor};')(require,__dirname,process);
const SAVE='hanzi-magic-door-state-v1',INK='hanzi-magic-door-ink-v1';

async function setup(mode){
  const e=environment();await flush();
  assert.equal(e.ids.get('startupNotice').hidden,true);
  e.context.testMode=mode;
  e.run(`presentDoor(currentItem,testMode,2);
    currentRound=2;stepIndex=2;stepAttempts=1;
    globalThis.blankOriginalItem=currentItem;
    globalThis.blankGradeCalls=0;globalThis.blankResultCalls=0;
    const blankOriginalGrade=gradeDrawing,blankOriginalResult=handleAttemptResult;
    gradeDrawing=async function(char){blankGradeCalls++;return blankOriginalGrade(char);};
    handleAttemptResult=function(ok){blankResultCalls++;return blankOriginalResult(ok);};`);
  await flush();
  if(mode==='teaching'){
    // Include a live demonstration countdown. An accidental/stale submit event
    // must not restart the timer, spend a teaching attempt, or change its stage.
    e.run('startTeachingRound();');await flush();e.advance(0);await flush();
    assert.notEqual(e.run('timerHandle'),null,'Teaching countdown should be active for this check');
  }
  return e;
}
function snapshot(e){
  return{state:e.run('JSON.stringify(state)'),save:e.storage.get(SAVE),ink:e.storage.get(INK),
    stored:JSON.stringify([...e.storage.entries()].sort(([a],[b])=>a.localeCompare(b))),
    inMemoryInk:e.run('JSON.stringify(inkLog)'),parentInk:e.run('JSON.stringify(parentTestInkLog)'),
    runtime:e.run(`JSON.stringify({currentMode,currentRound,stepIndex,stepAttempts,passedCount,pendingRetests,
      selectionSession,currentParentRequestId,priority:[...priorityConsumedToday],teachingRunId,timerHandle,
      wrong:wrongCountToday(currentItem)})`),
    timers:JSON.stringify([...e.timers].map(([id,timer])=>[id,timer.at])),
    timerText:e.ids.get('timerRing').textContent,timerDisplay:e.ids.get('timerRing').style.display,
    network:e.network.length,
    controls:JSON.stringify(['submitBtn','clearBtn','continueBtn'].map(id=>{
      const node=e.ids.get(id);return{id,disabled:node.disabled,display:node.style.display,className:node.className};
    }))};
}

(async()=>{
  for(const mode of ['free','teaching','retest']){
    const e=await setup(mode),before=snapshot(e);
    assert.equal(e.run('strokesPoints.length'),0);
    for(let attempt=0;attempt<2;attempt++){
      e.tap('submitBtn');await flush();
      assert.equal(e.run('blankGradeCalls'),0,mode+': blank input invoked the grader');
      assert.equal(e.run('blankResultCalls'),0,mode+': blank input reached the result state machine');
      assert.equal(e.run('currentItem===blankOriginalItem'),true,mode+': blank input changed the question object');
      assert.deepEqual(snapshot(e),before,mode+': blank input changed progress, attempts, round, timers, records, or controls');
      assert.ok(e.ids.get('statusLine').textContent.includes('请先写'),mode+': explain that ink is required');
    }
    // The same real handler must still grade nonempty reference ink normally.
    // Stop only the demo timer so this positive control is a writing phase.
    if(mode==='teaching')e.run('cancelTeachingRound();beginWritingPhase(currentItem);');
    inkFor(e,e.run('currentItem.char'));
    const beforeInk=e.run('inkLog.length'),beforeStep=e.run('stepIndex'),beforePassed=e.run('passedCount');
    e.tap('submitBtn');await flush();
    assert.equal(e.run('blankGradeCalls'),1,mode+': nonempty ink no longer invokes the real grader');
    assert.equal(e.run('blankResultCalls'),1,mode+': nonempty ink no longer reaches the result state machine');
    assert.equal(e.run('inkLog.length'),beforeInk+1,mode+': nonempty ink must still be recorded');
    assert.equal(e.run('inkLog[0].v'),'pass');
    assert.equal(e.run('passedCount'),beforePassed+(mode==='teaching'?0:1));
    if(mode==='teaching')assert.equal(e.run('stepIndex'),beforeStep+1,'Correct teaching ink must still advance the stage');
  }

  // A single-point mark or a short line is nonempty. The existing relative
  // filter drops the tap; a tiny line by itself still spans its own ink bounds.
  // Both must keep their evidence and original false-result flow.
  for(const{points:syntheticInk,retained}of[
    {points:[[100,100]],retained:0},{points:[[100,100],[101,101]],retained:1},
  ]){
    const e=await setup('free');
    e.context.syntheticInk=syntheticInk;
    e.run('strokesPoints=[syntheticInk.map(p=>({x:p[0],y:p[1]}))];');
    const wrong=e.run('wrongCountToday(currentItem)');
    e.tap('submitBtn');await flush();
    assert.equal(e.run('blankGradeCalls'),1,'The blank guard swallowed a nonempty touch trace');
    assert.equal(e.run('blankResultCalls'),1);
    assert.equal(e.run('inkLog.length'),1);
    assert.equal(e.run('inkLog[0].v'),'fail');
    assert.deepEqual(JSON.parse(e.run('JSON.stringify(inkLog[0].rawS)')),[syntheticInk]);
    assert.equal(e.run('inkLog[0].filtering.inputStrokeCount'),1);
    assert.equal(e.run('inkLog[0].filtering.retainedStrokeCount'),retained);
    assert.equal(e.run('inkLog[0].filtering.ignoredStrokes.length'),1-retained);
    assert.equal(e.run('wrongCountToday(currentItem)'),wrong+1,'Nonempty short-input behavior changed');
    assert.equal(e.run('currentMode'),'teaching');
  }
  console.log('Blank submission: free/teaching/retest keep grader, learning, attempts, question, timer, and records untouched; nonempty reference and short-touch paths remain active.');
})().catch(error=>{console.error(error);process.exitCode=1;});
