'use strict';

// Static reachability checks plus the real whole-page close handler. Personal
// ink is never read; drawing evidence below is a short synthetic path only.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const startup=fs.readFileSync(path.join(__dirname,'offline-startup.cjs'),'utf8');
const boundary=startup.indexOf('\n(async()=>{');
assert.ok(boundary>0,'The shared whole-page fixture boundary changed');
const {environment,flush,html}=new Function('require','__dirname','process',startup.slice(0,boundary)+
  '\nreturn {environment,flush,html};')(require,__dirname,process);

const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
const closeTags=[...markup.matchAll(/<button\b[^>]*\bid=["']closePanelBtn["'][^>]*>[\s\S]*?<\/button\s*>/gi)];
assert.equal(closeTags.length,1,'There must be one close button, with no obsolete footer copy');
const header=markup.match(/<(?:div|header)\b[^>]*\bclass=["'][^"']*\bpanel-header\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|header)\s*>/i);
assert.ok(header,'Settings need a panel-header');
assert.ok(header[1].includes(closeTags[0][0]),'Keep the close button inside the panel header');
assert.ok(/aria-label=["'][^"']*关闭[^"']*["']/i.test(closeTags[0][0]),'Name the close control for assistive technology');
const classes=closeTags[0][0].match(/\bclass=["']([^"']*)["']/i)?.[1].split(/\s+/)||[];
assert.ok(classes.length,'The close button needs an explicit touch-target style');
const css=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(m=>m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g,'');
function classProperties(name){
  const out={};
  for(const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    if(!rule[1].split(',').some(selector=>selector.trim().endsWith('.'+name)))continue;
    for(const property of rule[2].matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g))out[property[1]]=property[2].trim();
  }
  return out;
}
const headerCss=classProperties('panel-header');
assert.ok(headerCss.position==='sticky'||headerCss.position==='-webkit-sticky','The header must remain visible while its panel scrolls');
assert.ok(Number.isFinite(parseFloat(headerCss.top))&&parseFloat(headerCss.top)===0,'Anchor the sticky header to the panel top');
assert.ok(Number(headerCss['z-index'])>0,'Keep the header above scrolling settings');
assert.ok(headerCss.background||headerCss['background-color'],'Give the sticky header a readable background');
assert.ok(!/^(?:none|transparent)$/i.test(headerCss.background||headerCss['background-color']));
const closeCss=Object.assign({},...classes.map(classProperties));
assert.equal(headerCss.display,'flex','Keep the title and close button on the same header row');
assert.ok(headerCss['justify-content']==='space-between'||closeCss['margin-left']==='auto'||
  closeCss['margin-inline-start']==='auto','Keep the close control at the right edge of the header');
const pixels=value=>/^\d+(?:\.\d+)?px$/.test(value||'')?parseFloat(value):0;
assert.ok(Math.max(pixels(closeCss.width),pixels(closeCss['min-width']))>=44,'Close touch target must be at least 44 CSS pixels wide');
assert.ok(Math.max(pixels(closeCss.height),pixels(closeCss['min-height']))>=44,'Close touch target must be at least 44 CSS pixels high');
const panelCss=classProperties('panel');
assert.ok(/auto|scroll/.test(panelCss['overflow-y']||''),'Long settings content must remain internally scrollable');
assert.equal((html.match(/onTap\(closePanelBtn\s*,/g)||[]).length,1,'The moved button must keep one registered close handler');

const INK='hanzi-magic-door-ink-v1',SAVE='hanzi-magic-door-state-v1';
async function boot(mode='free',{ink=false}={}){
  const e=environment();await flush();e.context.settingsMode=mode;
  e.run(`presentDoor(currentItem,settingsMode,2);currentRound=2;stepIndex=2;stepAttempts=1;
    pendingRetests=[{item:state.bank.find(it=>it!==currentItem),round:2,fillersSeen:1,parentRequestId:'synthetic-pending'}];
    globalThis.settingsOriginalItem=currentItem;`);
  await flush();
  if(mode==='teaching'){
    e.run('startTeachingRound();');await flush();e.advance(0);await flush();
    assert.notEqual(e.run('timerHandle'),null,'Include a live teaching countdown');
  }
  if(ink)e.run('strokesPoints=[[{x:70,y:90},{x:80,y:110},{x:95,y:125}]];');
  return e;
}
function snapshot(e){
  return{state:e.run('JSON.stringify(state)'),save:e.storage.get(SAVE),ink:e.storage.get(INK),
    strokes:e.run('JSON.stringify(strokesPoints)'),normalLog:e.run('JSON.stringify(inkLog)'),
    runtime:e.run(`JSON.stringify({currentItem,currentMode,currentRound,stepIndex,stepAttempts,passedCount,
      pendingRetests,priority:[...priorityConsumedToday],currentParentRequestId,selectionSession,
      teachingRunId,timerHandle,isDrawing,submitDisabled:submitBtn.disabled,clearDisabled:clearBtn.disabled})`),
    timers:JSON.stringify([...e.timers].map(([id,timer])=>[id,timer.at])),
    timerText:e.ids.get('timerRing').textContent,timerDisplay:e.ids.get('timerRing').style.display};
}
function open(e){
  const ink=e.run('JSON.stringify(strokesPoints)');e.tap('settingsBtn');
  assert.equal(e.ids.get('panelOverlay').classList.contains('show'),true);
  assert.equal(e.run('JSON.stringify(strokesPoints)'),ink,'Opening settings erased current ink');
}
function close(e){
  e.tap('closePanelBtn');assert.equal(e.ids.get('panelOverlay').classList.contains('show'),false);
}
function enqueueThroughUi(e){
  const char=e.run("currentItem.char==='燕'?'理':'燕'");
  e.ids.get('charInput').value=char;e.ids.get('pinyinInput').value=char==='燕'?'yàn':'lǐ';
  e.ids.get('wordInput').value=char==='燕'?'燕子':'道理';e.tap('addCharBtn');
  assert.equal(e.run('parentQueueChanged'),true);return char;
}

(async()=>{
  for(const[mode,ink]of [['free',false],['free',true],['teaching',false],['teaching',true],['retest',true]]){
    const e=await boot(mode,{ink});
    for(let repeat=0;repeat<2;repeat++){
      open(e);const before=snapshot(e);close(e);await flush();
      assert.deepEqual(snapshot(e),before,mode+': closing untouched settings changed learning, ink, or timing');
      assert.equal(e.run('currentItem===settingsOriginalItem'),true,'Closing changed the original question object');
    }
  }

  // The old parent import behavior remains on the same close handler: use the
  // untouched free slot immediately, without counting another retest filler.
  const fresh=await boot();open(fresh);const char=enqueueThroughUi(fresh);
  const pending=fresh.run('JSON.stringify(pendingRetests)'),passed=fresh.run('passedCount');
  close(fresh);await flush();
  assert.equal(fresh.run('currentItem.char'),char);
  assert.equal(fresh.run('currentMode'),'free');assert.equal(fresh.run('strokesPoints.length'),0);
  assert.equal(fresh.run('JSON.stringify(pendingRetests)'),pending,'Replacing a free slot double-counted the filler');
  assert.equal(fresh.run('passedCount'),passed);
  assert.equal(fresh.run('parentQueueChanged'),false);
  assert.ok(fresh.run('currentParentRequestId'),'Keep the actual priority request identity');

  for(const[mode,ink,busy]of [['free',true,false],['teaching',false,false],['retest',true,false],['free',false,true]]){
    const e=await boot(mode,{ink});
    if(busy)e.ids.get('submitBtn').disabled=true;
    open(e);const queued=enqueueThroughUi(e),before=snapshot(e);
    close(e);await flush();
    assert.deepEqual(snapshot(e),before,mode+': importing a priority must not erase ongoing work on close');
    assert.equal(e.run('currentItem===settingsOriginalItem'),true);
    e.context.queued=queued;
    assert.equal(e.run('state.priorityQueue.find(p=>p.char===queued).completedDay'),null);
    assert.equal(e.run('parentQueueChanged'),false);
  }

  const done=await boot();done.run("finale.classList.add('show');playzone.classList.add('hide');passedCount=10;");
  open(done);const extra=enqueueThroughUi(done);close(done);await flush();
  assert.equal(done.ids.get('finale').classList.contains('show'),true,'A full level stays complete after adding another request');
  assert.equal(done.run('passedCount'),10);
  done.tap('restartBtn');await flush();
  assert.equal(done.ids.get('finale').classList.contains('show'),false);
  assert.equal(done.run('passedCount'),0);
  assert.equal(done.run('currentItem.char'),extra,'The next level must start with the newly queued request');
  console.log('Settings close: one labelled 44px sticky-header button; ink/question/teaching preservation, priority import, pending retest fillers, and next-level carryover passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
