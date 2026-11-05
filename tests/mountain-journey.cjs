'use strict';

// Exercise the real cosmetic module and whole-page controls. Only public frozen
// reference geometry is used; this test never reads private handwriting or a server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const moduleSource = fs.readFileSync(path.join(root, 'mountain-journey.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'mountain-journey.css'), 'utf8');
const startup = fs.readFileSync(path.join(__dirname, 'offline-startup.cjs'), 'utf8');
const boundary = startup.indexOf('\n(async()=>{');
const loop = "for(let i=0;i<scripts.length;i++)vm.runInContext(scripts[i].source,context,{timeout:10000,filename:'built-inline-'+i+'.js'});";
assert.ok(boundary > 0 && startup.includes(loop), 'Shared whole-page fixture boundary changed');
const prelude = startup.slice(0, boundary).replace(loop, `for(let i=0;i<scripts.length;i++){
  if(i===mainIndex)configureJourneyFixture({window,context,document,body,ids,storage,network,timers});
  vm.runInContext(scripts[i].source,context,{timeout:10000,filename:'built-inline-'+i+'.js'});
}`);
const fixtureFactory = new Function('require', '__dirname', 'process', 'configureJourneyFixture',
  prelude + '\nreturn {environment,flush,inkFor,Element,html,scripts};');
const clone = value => JSON.parse(JSON.stringify(value));
const read = (e, source) => clone(e.run(source));
const SAVE = 'hanzi-magic-door-state-v1';
const INK = 'hanzi-magic-door-ink-v1';
const PARENT = 'hanzi-magic-door-parent-ink-v1';

// Browser DOM primitives absent from the small startup fixture. They do not
// simulate image load or animation completion, intentionally: neither may gate play.
function addInsertBefore(Element) {
  Element.prototype.insertBefore = function (child, reference) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const at = reference ? this.children.indexOf(reference) : -1;
    child.parentNode = this;
    if (at < 0) this.children.push(child); else this.children.splice(at, 0, child);
    return child;
  };
}
function findNode(body, id) {
  if (body.id === id) return body;
  for (const child of body.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function unitModule() {
  const harness = fixtureFactory(require, __dirname, process, () => {});
  addInsertBefore(harness.Element);
  const body = new harness.Element('body');
  const document = {body, createElement: tag => new harness.Element(tag),
    getElementById: id => findNode(body, id)};
  const forbiddenCalls=[];
  const forbidden = name => () => { forbiddenCalls.push(name);throw new Error('Cosmetic module used ' + name); };
  const context = vm.createContext({document, console,
    setTimeout:forbidden('setTimeout'), setInterval:forbidden('setInterval'),
    requestAnimationFrame:forbidden('requestAnimationFrame'), fetch:forbidden('fetch'),
    localStorage:{getItem:forbidden('storage read'),setItem:forbidden('storage write')},
    XMLHttpRequest:forbidden('XMLHttpRequest'), WebSocket:forbidden('WebSocket')});
  vm.runInContext(moduleSource, context, {filename:'mountain-journey.js'});
  const library = context.HanziMountainJourney;
  assert.equal(typeof library.create, 'function');
  const api = library.create({document,window:{document}});
  assert.deepEqual(Object.keys(api).sort(), ['arrive','depart','reset','showWriting']);
  const backdrop = document.getElementById('mountainJourney');
  assert.ok(backdrop, 'Create the decorative root');
  assert.equal(backdrop.getAttribute('aria-hidden'), 'true');
  assert.equal(backdrop.style.pointerEvents, 'none', 'Pointer safety must survive missing CSS');
  assert.deepEqual(backdrop.children.map(child => child.className),
    ['journey-background','journey-wash','journey-foreground']);
  assert.ok(backdrop.children.every(child => child.style.pointerEvents === 'none'));
  library.create({document,window:{document}});
  assert.equal(body.children.length, 1, 'Repeated initialization does not duplicate visual layers');
  for (const method of Object.values(api)) assert.equal(method(), undefined, 'Commands stay synchronous');
  api.showWriting(false); api.depart();
  assert.equal(body.classList.contains('journey-departing'), true);
  api.showWriting(true);
  assert.equal(body.classList.contains('journey-writing'), true);
  assert.equal(body.classList.contains('journey-departing'), false, 'Writing cancels movement');
  api.depart();
  assert.equal(body.classList.contains('journey-departing'), false, 'Do not move the background during handwriting');
  for (const index of [-1,NaN,Infinity,'not-a-number',null,1,2,3,6.9,Number.MAX_VALUE]) {
    api.arrive(index);
    const offset = parseFloat(body.style['--journey-pan-x']);
    assert.ok(Number.isFinite(offset) && Math.abs(offset) <= .6, 'Framing remains finite and subtle');
  }
  api.showWriting(false); api.depart(); api.arrive(2);
  assert.equal(body.classList.contains('journey-departing'), false, 'A new door clears an old animation');
  api.reset();
  assert.equal(body.classList.contains('journey-writing'), false);
  assert.equal(body.style['--journey-pan-x'], '-0.6%');
  assert.deepEqual([...body.listeners], [], 'No event callback drives lesson flow');
  for (const broken of [{}, {body:{}}, {body,createElement(){throw Error('broken DOM');}}]) {
    const inert = library.create({document:broken});
    for (const method of Object.values(inert)) assert.doesNotThrow(() => method(1));
  }
  // Commands also remain harmless after an unrelated DOM service fails.
  body.style.setProperty = () => {throw Error('synthetic unavailable style');};
  assert.doesNotThrow(() => api.arrive(1));
  assert.deepEqual(forbiddenCalls,[],'Visual commands must not even attempt timers, requests, or storage');
}

function webpDimensions(buffer) {
  assert.equal(buffer.toString('ascii',0,4),'RIFF');
  assert.equal(buffer.toString('ascii',8,12),'WEBP');
  for(let at=12;at+8<=buffer.length;){
    const kind=buffer.toString('ascii',at,at+4),length=buffer.readUInt32LE(at+4),start=at+8;
    assert.ok(start+length<=buffer.length,'Valid WebP chunk size');
    if(kind==='VP8X') return {width:buffer.readUIntLE(start+4,3)+1,height:buffer.readUIntLE(start+7,3)+1};
    if(kind==='VP8 ') {
      assert.equal(buffer.toString('hex',start+3,start+6),'9d012a');
      return {width:buffer.readUInt16LE(start+6)&0x3fff,height:buffer.readUInt16LE(start+8)&0x3fff};
    }
    if(kind==='VP8L') {
      assert.equal(buffer[start],0x2f);
      const bits=buffer.readUInt32LE(start+1);
      return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};
    }
    at=start+length+(length%2);
  }
  throw Error('No WebP image dimensions');
}
function assertAssetsAndCss() {
  let total=0;
  const assets=['forest-trail.webp','gate-frame.webp','gate-doors.webp'].map(file=>{
    const relative='assets/mountain-journey/'+file,buffer=fs.readFileSync(path.join(root,relative));
    const size=webpDimensions(buffer);total+=buffer.length;
    assert.ok(buffer.length>100 && buffer.length<=512*1024,relative+' exceeds the 512 KiB per-image budget');
    assert.ok(size.width>=200&&size.height>=200&&size.width<=4096&&size.height<=4096&&size.width*size.height<=4*1024*1024,
      relative+' has an excessive or unusable decoded image size');
    assert.ok(css.includes(relative),'The asset must be used by the cosmetic stylesheet');
    return {file,bytes:buffer.length,...size};
  });
  assert.ok(total<=1024*1024,'All three optional images stay within a 1 MiB download budget');
  assert.match(css,/#mountainJourney\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css,/#mountainJourney\s*>\s*div\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css,/\.doorway::after\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css,/body\.journey-departing[^}]*animation:\s*none/s);
  assert.match(css,/#mountainJourney\s*\{[^}]*background:\s*linear-gradient/s,'Broken image still has a color backdrop');
  assert.ok(!/https?:\/\//i.test(css),'Scene CSS does not add a third-party dependency');
  return {total,assets};
}

async function boot(mode='real') {
  const calls=[], capture={api:null,body:null};
  const fixture=fixtureFactory(require,__dirname,process,info=>{
    const {context,window,document,body,ids}=info;
    capture.body=body;
    const initialGet=document.getElementById;
    document.getElementById=id=>initialGet(id)||findNode(body,id);
    // A browser's globalThis equals window; the lightweight VM splits them.
    if(!window.HanziMountainJourney&&context.HanziMountainJourney)window.HanziMountainJourney=context.HanziMountainJourney;
    const real=window.HanziMountainJourney;
    assert.ok(real&&typeof real.create==='function','Load the actual module before main');
    if(mode==='absent'){delete window.HanziMountainJourney;return;}
    window.HanziMountainJourney={create(options){
      calls.push(['create']);
      if(mode==='create-throws')throw Error('synthetic missing visual service');
      const api=real.create(options);capture.api=api;
      // Make dynamically constructed root inspectable like static HTML IDs.
      const backdrop=document.getElementById('mountainJourney');if(backdrop)ids.set('mountainJourney',backdrop);
      return Object.fromEntries(Object.entries(api).map(([method,action])=>[method,(...args)=>{
        calls.push([method,...args]);
        if(mode==='method-throws')throw Error('synthetic visual failure');
        if(mode==='reject')return Promise.reject(Error('synthetic visual rejection'));
        if(mode==='hang')return new Promise(()=>{});
        return action(...args);
      }]));
    }};
  });
  addInsertBefore(fixture.Element);
  assert.equal(fixture.scripts.filter(script=>script.attributes.includes('data-source="mountain-journey.js"')).length,1);
  assert.match(fixture.html,/<style\b[^>]*data-source="mountain-journey\.css"/);
  assert.match(fixture.html,/<svg\b[^>]*id="drawSvg"[^>]*viewBox="0 0 300 300"/,
    'Keep the original drawing coordinate box');
  const e=fixture.environment();await fixture.flush();
  assert.equal(e.ids.get('startupNotice').hidden,true,'Optional scenery may not gate startup');
  assert.equal(e.run('CANVAS_SIZE'),300,'Scenery cannot change drawing coordinates');
  return {...e,calls,capture,flush:fixture.flush,inkFor:char=>fixture.inkFor(e,char)};
}
function protectedState(e) {
  return {state:e.run('JSON.stringify(state)'),storage:JSON.stringify([...e.storage]),
    runtime:e.run('JSON.stringify({currentItem,currentMode,currentRound,stepIndex,stepAttempts,passedCount,pendingRetests,currentParentRequestId,priority:[...priorityConsumedToday],selectionSession,teachingRunId,timerHandle,isDrawing,strokesPoints,parentValidation})'),
    network:JSON.stringify(e.network),timers:JSON.stringify([...e.timers].map(([id,t])=>[id,t.at]))};
}
function assertUnchanged(e,before,message) {
  const after=protectedState(e);
  assert.deepEqual(Object.keys(before).filter(key=>after[key]!==before[key]),[],message);
}
async function passCurrent(e) {
  const char=e.run('currentItem.char');e.inkFor(char);e.tap('submitBtn');await e.flush();
  assert.equal(e.ids.get('submitBtn').disabled,false);
  assert.equal(e.run('passedCount'),1,'A normal reference pass must still count');
  assert.equal(e.run('inkLog.length'),1,'The normal submission is saved exactly once');
  assert.equal(JSON.parse(e.storage.get(INK)).length,1);
  assert.equal(e.ids.get('continueBtn').classList.contains('show'),true);
  return char;
}

(async()=>{
  unitModule();
  const resources=assertAssetsAndCss();
  // Every optional-module failure mode runs the actual startup, submission,
  // persistence, settings, and Continue handlers. No image/animation event fires.
  for(const mode of ['real','absent','create-throws','method-throws','reject','hang']){
    const e=await boot(mode);e.tap('settingsBtn');e.tap('closePanelBtn');
    const first=await passCurrent(e);
    if(mode==='real'){
      assert.equal(e.capture.body.classList.contains('journey-departing'),true,'Only a real pass starts departure');
      assert.ok(e.calls.some(call=>call[0]==='depart'));
    }
    e.tap('continueBtn');
    assert.equal(e.ids.get('writeSlot').style.display,'flex','Continue never waits for animation end');
    assert.equal(e.run('currentMode'),'free');assert.equal(e.run('strokesPoints.length'),0);
    assert.ok(e.run('currentItem.char')!==first,'The next question is selected immediately');
    if(mode==='real')assert.equal(e.capture.body.classList.contains('journey-departing'),false);
  }
  const e=await boot();
  e.run('strokesPoints=[[{x:30,y:40},{x:75,y:90}]];');
  const before=protectedState(e);
  for(const [method,args] of [['arrive',[3]],['showWriting',[false]],['depart',[]],['showWriting',[true]],['reset',[]]]){
    e.capture.api[method](...args);
  }
  assertUnchanged(e,before,'Direct visual commands changed learning, current ink, saves, requests, or timers');
  const backdrop=e.ids.get('mountainJourney');
  backdrop.dispatch('error');backdrop.dispatch('load');backdrop.dispatch('animationend');backdrop.dispatch('transitionend');
  assertUnchanged(e,before,'A decorative event changed the lesson');
  e.run('clearCanvas();');

  // Entering the isolated parent acceptance mode also uses writing hooks;
  // visual movement must not turn its steps into child progress or rewards.
  const parent=await boot(),learningBefore=parent.run('JSON.stringify(state)'),parentCount=parent.run('passedCount');
  const storageBefore=[parent.storage.get(SAVE),parent.storage.get(INK),parent.storage.get(PARENT)];
  parent.tap('settingsBtn');parent.tap('parentTestRound1Btn');
  assert.ok(parent.run('parentValidation'));
  parent.capture.api.showWriting(false);parent.capture.api.depart();parent.capture.api.arrive(5);
  assert.equal(parent.run('passedCount'),parentCount);
  assert.equal(parent.run('JSON.stringify(state)'),learningBefore);
  assert.deepEqual([parent.storage.get(SAVE),parent.storage.get(INK),parent.storage.get(PARENT)],storageBefore);
  parent.tap('parentTestExitBtn');
  assert.equal(parent.run('parentValidation'),null);assert.equal(parent.run('currentMode'),'free');
  assert.equal(parent.run('JSON.stringify(state)'),learningBefore);

  // Restored completion is a presentation, not another award or a new save.
  const completed=await boot();completed.run('passedCount=state.dailyCount;syncRoundCompleted=true;syncSceneAwarded=true;');
  const scenes=completed.run('state.scenesUnlocked'),saved=completed.storage.get(SAVE);
  completed.run('showSyncedFinale();showSyncedFinale();');
  assert.equal(completed.run('state.scenesUnlocked'),scenes);
  assert.equal(completed.storage.get(SAVE),saved);
  assert.equal(completed.ids.get('finale').classList.contains('show'),true);
  completed.tap('restartBtn');
  assert.equal(completed.run('passedCount'),0);assert.equal(completed.run('state.scenesUnlocked'),scenes);
  assert.equal(completed.ids.get('writeSlot').style.display,'flex');
  console.log('mountain-journey: synchronous visual-only API, pointer/motion safety, optional failure isolation, no image/animation gate, exact normal save/continue, parent isolation and reward-free restore passed');
  console.log(JSON.stringify({imageBytes:resources.total,assets:resources.assets}));
})().catch(error=>{console.error(error);process.exitCode=1;});
